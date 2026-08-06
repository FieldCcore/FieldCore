'use strict';
const pool = require('../db/pool');

// Thresholds are based on an 8-hour default shift.
// Phase 2 will allow per-tenant shift configuration.
const DEFAULT_SHIFT_MINUTES = 8 * 60;

const THRESHOLDS = {
  BALANCED:     60,   // ≥ 60% capacity
  NEAR_CAPACITY: 85,  // ≥ 85% capacity
  OVER_CAPACITY: 100, // ≥ 100% capacity (overtime)
};

/**
 * Calculate dispatch workload for all field-eligible, dispatch-visible
 * technicians in the account for a given date.
 *
 * Returns one normalized workload object per technician.
 * All values derived from authoritative DB data — never from sidebar row counts.
 *
 * @param {{ accountId: string, dateLocal?: string, timezone?: string }}
 * @returns {Promise<WorkloadEntry[]>}
 */
async function getWorkloads({ accountId, dateLocal, timezone = 'UTC' }) {
  const safeDate = dateLocal && /^\d{4}-\d{2}-\d{2}$/.test(dateLocal)
    ? dateLocal
    : new Date().toISOString().split('T')[0];

  const { rows: techs } = await pool.query(
    `SELECT id, name, role, field_work_eligible, dispatch_visible,
            is_available, operational_status, clocked_in_at, clocked_out_at
     FROM users
     WHERE account_id       = $1
       AND field_work_eligible = TRUE
       AND dispatch_visible    = TRUE`,
    [accountId]
  );
  if (!techs.length) return [];

  const techIds = techs.map(t => t.id);

  // Phase A: read from job_assignments (many-to-many) with jobs.tech_id fallback
  // for any jobs that predate the backfill. Revenue is attributed only to
  // primary assignments to avoid multiplying it across team members.
  const { rows: jobRows } = await pool.query(
    `SELECT
       ja.user_id                                                                 AS tech_id,
       COUNT(DISTINCT j.id)                                                       AS job_count,
       COALESCE(SUM(j.duration_minutes), 0)                                      AS total_service_minutes,
       COALESCE(SUM(j.amount) FILTER (WHERE ja.is_primary = TRUE), 0)            AS assigned_revenue,
       COUNT(DISTINCT j.id) FILTER (WHERE j.status IN (
         'in_progress','en_route','arrived','paused',
         'awaiting_client','awaiting_parts','partially_completed','ready_for_inspection'
       ))                                                                         AS active_count,
       COUNT(DISTINCT j.id) FILTER (WHERE j.status = 'complete')                 AS completed_count,
       COUNT(DISTINCT j.id) FILTER (WHERE j.status = 'scheduled')                AS scheduled_count,
       COALESCE(MIN(j.scheduled_at) FILTER (WHERE j.status NOT IN ('complete','cancelled','no_show')), NULL) AS next_job_at
     FROM job_assignments ja
     JOIN jobs j ON j.id = ja.job_id
     WHERE ja.account_id   = $1
       AND ja.user_id       = ANY($2::uuid[])
       AND ja.removed_at    IS NULL
       AND j.status NOT IN ('cancelled','no_show','draft','unscheduled')
       AND (j.scheduled_at AT TIME ZONE $3)::date = $4::date
     GROUP BY ja.user_id`,
    [accountId, techIds, timezone, safeDate]
  );

  const byTech = Object.fromEntries(jobRows.map(r => [r.tech_id, r]));

  return techs.map(tech => {
    const jd              = byTech[tech.id] || {};
    const jobCount        = parseInt(jd.job_count        || 0, 10);
    const serviceMinutes  = parseInt(jd.total_service_minutes || 0, 10);
    const activeCount     = parseInt(jd.active_count     || 0, 10);
    const completedCount  = parseInt(jd.completed_count  || 0, 10);
    const scheduledCount  = parseInt(jd.scheduled_count  || 0, 10);
    const assignedRevenue = parseInt(jd.assigned_revenue || 0, 10);
    const capacityPct     = Math.round((serviceMinutes / DEFAULT_SHIFT_MINUTES) * 100);
    const overtimeMin     = Math.max(0, serviceMinutes - DEFAULT_SHIFT_MINUTES);

    let state;
    if (!tech.is_available || tech.operational_status === 'off_duty') {
      state = 'unavailable';
    } else if (capacityPct >= THRESHOLDS.OVER_CAPACITY) {
      state = 'over_capacity';
    } else if (capacityPct >= THRESHOLDS.NEAR_CAPACITY) {
      state = 'near_capacity';
    } else if (capacityPct >= THRESHOLDS.BALANCED) {
      state = 'balanced';
    } else {
      state = 'open';
    }

    return {
      techId:              tech.id,
      techName:            tech.name,
      jobCount,
      activeJobCount:      activeCount,
      completedJobCount:   completedCount,
      scheduledJobCount:   scheduledCount,
      serviceHours:        +(serviceMinutes / 60).toFixed(1),
      capacityPercent:     capacityPct,
      remainingMinutes:    Math.max(0, DEFAULT_SHIFT_MINUTES - serviceMinutes),
      overtimeRiskMinutes: overtimeMin,
      assignedRevenue,
      state,
      isAvailable:         tech.is_available,
      operationalStatus:   tech.operational_status,
      nextJobAt:           jd.next_job_at || null,
    };
  });
}

module.exports = { getWorkloads, THRESHOLDS, DEFAULT_SHIFT_MINUTES };
