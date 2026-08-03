'use strict';
const pool = require('../db/pool');
const { getTechServiceArea, isJobInArea } = require('./serviceAreaService');

const NON_ASSIGNABLE_STATUSES = new Set([
  'complete', 'cancelled', 'no_show', 'draft',
]);

const ACTIVE_STATUSES = new Set([
  'in_progress', 'en_route', 'arrived', 'paused',
  'awaiting_client', 'awaiting_parts', 'partially_completed', 'ready_for_inspection',
]);

const DEFAULT_SHIFT_MINUTES = 8 * 60;

function issue(type, severity, message, extras = {}) {
  return { type, severity, message, ...extras };
}

/**
 * Validate a proposed job → technician assignment server-side.
 *
 * Input: { accountId, jobId, techId, requestedByUserId, isEmergency? }
 *
 * Returns:
 * {
 *   allowed,          // false when any blocking issue exists
 *   blockingIssues,   // array — prevent save
 *   warnings,         // array — require explicit confirm
 *   informational,    // array — shown passively
 *   scheduleImpact,   // { scheduledAt, durationMinutes, previousTechId, isReassignment }
 *   workloadImpact,   // { currentJobCount, newJobCount, capacityPercent, … }
 * }
 */
async function validate({ accountId, jobId, techId, requestedByUserId, isEmergency = false }) {
  const blocking     = [];
  const warnings     = [];
  const informational = [];

  // ── Job ───────────────────────────────────────────────────────────────────
  const { rows: jobRows } = await pool.query(
    `SELECT j.*, c.name AS client_name
     FROM jobs j
     JOIN clients c ON c.id = j.client_id
     WHERE j.id = $1 AND j.account_id = $2`,
    [jobId, accountId]
  );
  if (!jobRows.length) {
    return _notFound('job_not_found', 'Job not found or not in this account.');
  }
  const job = jobRows[0];

  if (NON_ASSIGNABLE_STATUSES.has(job.status)) {
    blocking.push(issue('job_not_assignable', 'blocking',
      `This job cannot be assigned — status is "${job.status}".`));
  }
  if (ACTIVE_STATUSES.has(job.status) && !isEmergency) {
    warnings.push(issue('active_job_reassignment', 'warning',
      `This job is currently "${job.status}". Reassigning may disrupt field operations.`,
      { resolutionOptions: ['confirm_reassignment'] }));
  }

  // ── Technician ────────────────────────────────────────────────────────────
  const { rows: techRows } = await pool.query(
    `SELECT u.*,
            wr.field_work_eligible AS role_field_eligible
     FROM users u
     LEFT JOIN workforce_roles wr ON wr.id = u.workforce_role_id
     WHERE u.id = $1 AND u.account_id = $2`,
    [techId, accountId]
  );
  if (!techRows.length) {
    return _notFound('tech_not_found', 'Technician not found or not in this account.');
  }
  const tech = techRows[0];

  if (!tech.field_work_eligible) {
    blocking.push(issue('not_field_eligible', 'blocking',
      `${tech.name} is not configured for field work. Update their workforce profile.`,
      { resolutionOptions: ['update_workforce_profile'] }));
  }
  if (!tech.dispatch_visible) {
    warnings.push(issue('not_dispatch_visible', 'warning',
      `${tech.name} is not visible in Dispatch. They can be assigned but won't appear on the map.`));
  }
  if (!tech.is_available) {
    warnings.push(issue('tech_unavailable', 'warning',
      `${tech.name} has marked themselves unavailable.`,
      { resolutionOptions: ['confirm_anyway'] }));
  }
  if (tech.operational_status === 'off_duty' && !isEmergency) {
    warnings.push(issue('off_duty', 'warning',
      `${tech.name} is currently off duty.`,
      { resolutionOptions: ['confirm_anyway'] }));
  }

  // ── Schedule conflicts ─────────────────────────────────────────────────────
  if (job.scheduled_at) {
    const start    = new Date(job.scheduled_at);
    const end      = new Date(start.getTime() + (job.duration_minutes || 60) * 60000);
    const startIso = start.toISOString();
    const endIso   = end.toISOString();

    const { rows: overlaps } = await pool.query(
      `SELECT j.id, j.service_type, j.scheduled_at, j.duration_minutes, c.name AS client_name
       FROM jobs j
       JOIN clients c ON c.id = j.client_id
       WHERE j.account_id = $1
         AND j.tech_id = $2
         AND j.id != $3
         AND j.status NOT IN ('cancelled','complete','no_show')
         AND j.scheduled_at IS NOT NULL
         AND j.scheduled_at < $5
         AND (j.scheduled_at + (COALESCE(j.duration_minutes,60) * INTERVAL '1 minute')) > $4`,
      [accountId, techId, jobId, startIso, endIso]
    );
    for (const o of overlaps) {
      blocking.push(issue('direct_time_overlap', 'blocking',
        `Time conflict with "${o.service_type}" for ${o.client_name}.`,
        {
          conflictingJobId: o.id,
          startsAt: o.scheduled_at,
          endsAt:   new Date(new Date(o.scheduled_at).getTime() + (o.duration_minutes || 60) * 60000).toISOString(),
          resolutionOptions: ['adjust_time', 'select_other_technician'],
        }));
    }

    const { rows: blocks } = await pool.query(
      `SELECT id, block_type, title, starts_at, ends_at
       FROM tech_availability_blocks
       WHERE account_id = $1 AND user_id = $2
         AND starts_at < $4 AND ends_at > $3`,
      [accountId, techId, startIso, endIso]
    );
    for (const b of blocks) {
      const isHard = b.block_type === 'vacation';
      (isHard ? blocking : warnings).push(issue(
        isHard ? 'availability_block' : 'soft_availability_block',
        isHard ? 'blocking' : 'warning',
        `${tech.name} has a "${b.block_type}" block during this time${b.title ? `: ${b.title}` : ''}.`,
        { startsAt: b.starts_at, endsAt: b.ends_at,
          resolutionOptions: isHard ? ['select_other_technician', 'adjust_time'] : ['confirm_anyway'] }
      ));
    }
  }

  // ── Workload impact ───────────────────────────────────────────────────────
  const { rows: [wd] } = await pool.query(
    `SELECT
       COUNT(*)                             AS job_count,
       COALESCE(SUM(duration_minutes), 0)  AS total_minutes,
       COALESCE(SUM(amount), 0)            AS assigned_revenue
     FROM jobs
     WHERE account_id = $1
       AND tech_id    = $2
       AND id        != $3
       AND status NOT IN ('cancelled','complete','no_show','draft','unscheduled')
       AND (scheduled_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date`,
    [accountId, techId, jobId]
  );
  const currentCount   = parseInt(wd.job_count, 10);
  const currentMinutes = parseInt(wd.total_minutes, 10);
  const addedMinutes   = job.duration_minutes || 60;
  const newMinutes     = currentMinutes + addedMinutes;
  const shiftMin       = DEFAULT_SHIFT_MINUTES;
  const overtimeMin    = Math.max(0, newMinutes - shiftMin);

  const workloadImpact = {
    currentJobCount:     currentCount,
    newJobCount:         currentCount + 1,
    currentServiceHours: +(currentMinutes / 60).toFixed(1),
    newServiceHours:     +(newMinutes     / 60).toFixed(1),
    capacityPercent:     Math.round((newMinutes / shiftMin) * 100),
    overtimeRiskMinutes: overtimeMin,
    assignedRevenue:     parseInt(wd.assigned_revenue, 10),
  };

  if (overtimeMin > 0) {
    warnings.push(issue('overtime_risk', 'warning',
      `This assignment creates ${Math.round(overtimeMin / 6) / 10}h of overtime for ${tech.name}.`,
      { resolutionOptions: ['confirm_anyway', 'select_other_technician'] }));
  } else if (workloadImpact.capacityPercent >= 85) {
    warnings.push(issue('near_capacity', 'warning',
      `${tech.name} will be at ${workloadImpact.capacityPercent}% capacity after this assignment.`));
  }

  informational.push(issue('workload_summary', 'informational',
    `${tech.name} has ${currentCount} job${currentCount !== 1 ? 's' : ''} today (${+(currentMinutes / 60).toFixed(1)}h).`));

  // ── Service area check ────────────────────────────────────────────────────
  // Warning only — never blocking. Skipped in emergency mode.
  if (!isEmergency) {
    try {
      const area = await getTechServiceArea({ accountId, techId });
      if (area && (job.service_lat || job.client_lat)) {
        const jobLat = job.service_lat || job.client_lat;
        const jobLng = job.service_lng || job.client_lng;
        if (!isJobInArea(area, jobLat, jobLng)) {
          warnings.push(issue('outside_service_area', 'warning',
            `This job is outside ${tech.name}'s assigned service area "${area.name || 'Service Area'}".`,
            { areaId: area.id, resolutionOptions: ['confirm_anyway', 'select_other_technician'] }
          ));
        }
      }
    } catch {
      // Service area check failure must never block an assignment
    }
  }

  // ── Result ─────────────────────────────────────────────────────────────────
  const scheduleImpact = {
    scheduledAt:     job.scheduled_at,
    durationMinutes: job.duration_minutes || 60,
    previousTechId:  job.tech_id || null,
    isReassignment:  !!(job.tech_id && job.tech_id !== techId),
  };

  return {
    allowed:        blocking.length === 0,
    blockingIssues: blocking,
    warnings,
    informational,
    scheduleImpact,
    workloadImpact,
  };
}

function _notFound(type, message) {
  return {
    allowed: false,
    blockingIssues: [{ type, severity: 'blocking', message }],
    warnings: [], informational: {}, scheduleImpact: {}, workloadImpact: {},
  };
}

module.exports = { validate };
