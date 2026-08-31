const express    = require('express');
const router     = express.Router();
const pool       = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { checkJobLimit } = require('../middleware/planLimits');
const { getEntitlements } = require('../services/entitlements');
const sms        = require('../services/sms');
const notify     = require('../services/notify');
const audit      = require('../services/audit');
const { geocodeAddress } = require('../services/geocode');
const { validateIanaTimezone, utcScheduleToLocal, localScheduleToUtc } = require('../services/scheduleTimeService');
const emergencySvc          = require('../services/emergencyDispatchService');
const { recordActivity }    = require('../services/jobActivityService');
const teamSvc               = require('../services/jobTeamAssignmentService');

// Valid status values — single-day and multi-day parent job statuses
const VALID_STATUSES = [
  'draft','unscheduled','scheduled','in_progress','paused',
  'awaiting_client','awaiting_parts','partially_completed',
  'ready_for_inspection','complete','cancelled','no_show',
];

// Session status values
const VALID_SESSION_STATUSES = [
  'scheduled','en_route','checked_in','in_progress','paused',
  'completed_for_day','rescheduled','cancelled','missed',
];

// Fields that may be updated via PATCH /api/jobs/:id
const PATCHABLE_JOB_FIELDS = [
  'client_id','tech_id','service_type','scheduled_at','amount','travel_fee','notes','instructions',
  'recurring','duration_minutes',
  'service_address','service_city','service_state','service_zip','service_lat','service_lng',
  'location_id',
  // Multi-day fields
  'title','scope_of_work','estimated_start_date','estimated_end_date','end_date_unknown',
  'job_manager_id','estimated_labor_hours','overall_completion_pct','billing_method','priority',
  'is_multi_day',
  // Timezone audit fields (populated by the scheduling form when column exists)
  'scheduling_timezone', 'original_local_start',
  'input_timezone', 'input_timezone_source', 'creator_timezone_at_creation',
];

// ── Helper: fetch sessions + techs for a job ─────────────────────────────────
async function getSessionsForJob(jobId, accountId) {
  const { rows: sessions } = await pool.query(
    `SELECT s.*,
            u.name AS lead_tech_name,
            COALESCE(
              json_agg(
                json_build_object('id', t.id, 'tech_id', t.tech_id, 'tech_name', u2.name, 'is_lead', t.is_lead)
                ORDER BY t.is_lead DESC, u2.name
              ) FILTER (WHERE t.id IS NOT NULL), '[]'
            ) AS techs
     FROM job_sessions s
     LEFT JOIN users u  ON u.id  = s.lead_tech_id
     LEFT JOIN job_session_techs t ON t.session_id = s.id
     LEFT JOIN users u2 ON u2.id = t.tech_id
     WHERE s.job_id = $1 AND s.account_id = $2
     GROUP BY s.id, u.name
     ORDER BY s.scheduled_date, s.start_time NULLS LAST, s.session_number`,
    [jobId, accountId]
  );
  return sessions;
}

// ── POST /api/jobs/check-conflicts ───────────────────────────────────────────
// Scheduling engine: detect overlapping jobs or availability blocks for a tech.
// Must be declared before /:id to avoid route shadowing.
router.post('/check-conflicts', requireAuth, async (req, res) => {
  const { tech_id, starts_at, ends_at, exclude_job_id } = req.body;
  if (!tech_id || !starts_at || !ends_at) {
    return res.status(400).json({ error: 'tech_id, starts_at, and ends_at are required' });
  }

  const start = new Date(starts_at);
  const end   = new Date(ends_at);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return res.status(400).json({ error: 'Invalid date range: ends_at must be after starts_at' });
  }

  try {
    // Verify tech belongs to this account
    const { rows: techRows } = await pool.query(
      `SELECT id, name FROM users WHERE id = $1 AND account_id = $2`,
      [tech_id, req.accountId]
    );
    if (!techRows.length) return res.status(404).json({ error: 'Technician not found' });

    const conflicts  = [];
    const warnings   = [];

    // 1. Overlapping single-day jobs assigned to this tech
    const jobConflictQuery = `
      SELECT j.id, j.service_type, j.scheduled_at, j.duration_minutes, j.status, c.name AS client_name
      FROM   jobs j
      JOIN   clients c ON c.id = j.client_id
      WHERE  j.account_id     = $1
        AND  j.tech_id        = $2
        AND  j.status         NOT IN ('cancelled','complete','no_show')
        AND  j.scheduled_at   IS NOT NULL
        AND  j.scheduled_at  <  $4
        AND  (j.scheduled_at + (COALESCE(j.duration_minutes,60) * interval '1 minute')) > $3
        ${exclude_job_id ? 'AND j.id != $5' : ''}
    `;
    const jobConflictValues = exclude_job_id
      ? [req.accountId, tech_id, starts_at, ends_at, exclude_job_id]
      : [req.accountId, tech_id, starts_at, ends_at];

    const { rows: jobConflicts } = await pool.query(jobConflictQuery, jobConflictValues);

    for (const j of jobConflicts) {
      conflicts.push({
        type:        'job',
        id:          j.id,
        title:       `${j.service_type} — ${j.client_name}`,
        starts_at:   j.scheduled_at,
        ends_at:     new Date(new Date(j.scheduled_at).getTime() + (j.duration_minutes || 60) * 60000),
        status:      j.status,
        severity:    'error',
        message:     `Conflicts with "${j.service_type}" for ${j.client_name}`,
      });
    }

    // 2. Overlapping multi-day sessions assigned to this tech
    const sessionConflictQuery = `
      SELECT s.id, s.scheduled_date, s.start_time, s.end_time,
             j.service_type, c.name AS client_name
      FROM   job_sessions s
      JOIN   jobs j    ON j.id = s.job_id
      JOIN   clients c ON c.id = j.client_id
      WHERE  s.account_id = $1
        AND  s.status NOT IN ('cancelled','missed')
        AND  (
          s.lead_tech_id = $2
          OR EXISTS (
            SELECT 1 FROM job_session_techs jst
            WHERE jst.session_id = s.id AND jst.tech_id = $2
          )
        )
        AND  (s.scheduled_date + COALESCE(s.start_time,'08:00'::time))::timestamptz < $4
        AND  (s.scheduled_date + COALESCE(s.end_time,'17:00'::time))::timestamptz  > $3
    `;
    const { rows: sessionConflicts } = await pool.query(sessionConflictQuery,
      [req.accountId, tech_id, starts_at, ends_at]);

    for (const s of sessionConflicts) {
      conflicts.push({
        type:      'session',
        id:        s.id,
        title:     `${s.service_type} — ${s.client_name} (${s.scheduled_date})`,
        starts_at: `${s.scheduled_date}T${s.start_time || '08:00'}:00`,
        ends_at:   `${s.scheduled_date}T${s.end_time   || '17:00'}:00`,
        severity:  'error',
        message:   `Session conflict: ${s.service_type} for ${s.client_name} on ${s.scheduled_date}`,
      });
    }

    // 3. Availability blocks (vacation, break, blocked time)
    const { rows: blocks } = await pool.query(
      `SELECT id, block_type, title, starts_at, ends_at
       FROM   tech_availability_blocks
       WHERE  account_id = $1
         AND  user_id    = $2
         AND  starts_at  < $4
         AND  ends_at    > $3`,
      [req.accountId, tech_id, starts_at, ends_at]
    );

    for (const b of blocks) {
      const isVacation = b.block_type === 'vacation';
      warnings.push({
        type:      'availability_block',
        id:        b.id,
        block_type: b.block_type,
        title:     b.title || b.block_type,
        starts_at: b.starts_at,
        ends_at:   b.ends_at,
        severity:  isVacation ? 'error' : 'warning',
        message:   isVacation
          ? `Tech is on vacation during this time`
          : `Tech has a "${b.block_type}" block: ${b.title || ''}`,
      });
    }

    const hasErrors   = conflicts.length > 0 || warnings.some(w => w.severity === 'error');
    const hasWarnings = warnings.some(w => w.severity === 'warning');

    res.json({
      has_conflicts: hasErrors,
      has_warnings:  hasWarnings,
      tech_name:     techRows[0].name,
      conflicts,
      warnings,
      summary: hasErrors
        ? `${conflicts.length + warnings.filter(w => w.severity === 'error').length} scheduling conflict(s) detected`
        : hasWarnings
          ? `${warnings.length} scheduling warning(s)`
          : 'No conflicts detected',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/jobs ─────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const { date, date_from, date_to, tech_id, status, client_id } = req.query;
  const conditions = ['j.account_id = $1'];
  const values = [req.accountId];
  let i = 2;

  if (date) {
    conditions.push(`j.scheduled_at::date = $${i++}`);
    values.push(date);
  }
  if (date_from) {
    conditions.push(`j.scheduled_at >= $${i++}`);
    values.push(date_from);
  }
  if (date_to) {
    conditions.push(`j.scheduled_at <= $${i++}`);
    values.push(date_to);
  }
  if (tech_id) {
    conditions.push(`j.tech_id = $${i++}`);
    values.push(tech_id);
  }
  if (status) {
    conditions.push(`j.status = $${i++}`);
    values.push(status);
  }
  if (client_id) {
    conditions.push(`j.client_id = $${i++}`);
    values.push(client_id);
  }

  try {
    const { rows } = await pool.query(
      `SELECT j.*, c.name AS client_name, u.name AS tech_name,
              um.name AS job_manager_name,
              (SELECT COUNT(*)::int FROM job_services js
               WHERE js.job_id = j.id AND js.account_id = j.account_id) AS service_count
       FROM jobs j
       JOIN clients c   ON c.id = j.client_id
       LEFT JOIN users u  ON u.id = j.tech_id
       LEFT JOIN users um ON um.id = j.job_manager_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY j.scheduled_at`,
      values
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/jobs/sessions — all sessions for calendar (MUST precede /:id) ───
router.get('/sessions', requireAuth, async (req, res) => {
  const { date_from, date_to, tech_id } = req.query;
  const conditions = ['s.account_id = $1'];
  const values = [req.accountId];
  let i = 2;

  if (date_from) {
    conditions.push(`s.scheduled_date >= $${i++}`);
    values.push(date_from);
  }
  if (date_to) {
    conditions.push(`s.scheduled_date <= $${i++}`);
    values.push(date_to);
  }
  if (tech_id) {
    conditions.push(`(s.lead_tech_id = $${i} OR EXISTS (
      SELECT 1 FROM job_session_techs jst WHERE jst.session_id = s.id AND jst.tech_id = $${i}
    ))`);
    values.push(tech_id);
    i++;
  }

  try {
    const { rows } = await pool.query(
      `SELECT s.*,
              j.service_type, j.status AS job_status, j.is_multi_day,
              j.client_id, c.name AS client_name,
              u.name AS lead_tech_name,
              (SELECT COUNT(*) FROM job_sessions s2 WHERE s2.job_id = s.job_id) AS total_sessions,
              (SELECT COUNT(*) FROM job_sessions s2 WHERE s2.job_id = s.job_id AND s2.scheduled_date < s.scheduled_date) + 1 AS day_number
       FROM job_sessions s
       JOIN jobs j    ON j.id = s.job_id
       JOIN clients c ON c.id = j.client_id
       LEFT JOIN users u ON u.id = s.lead_tech_id
       WHERE ${conditions.join(' AND ')}
         AND s.status NOT IN ('cancelled')
       ORDER BY s.scheduled_date, s.start_time NULLS LAST`,
      values
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/jobs/:id — single job with full operational context ───────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT j.*,
              c.name AS client_name, c.phone AS client_phone, c.email AS client_email,
              u.name  AS tech_name,
              um.name AS job_manager_name,
              cl.label               AS location_label,
              cl.access_instructions AS location_access_instructions
       FROM jobs j
       JOIN clients c    ON c.id  = j.client_id
       LEFT JOIN users u   ON u.id  = j.tech_id
       LEFT JOIN users um  ON um.id = j.job_manager_id
       LEFT JOIN client_locations cl ON cl.id = j.location_id
       WHERE j.id = $1 AND j.account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const job = rows[0];

    // Full assigned team (all job types, Phase B read path)
    const { rows: team } = await pool.query(
      `SELECT ja.user_id, ja.assignment_role, ja.is_primary, u.name AS member_name, u.role AS user_role
       FROM job_assignments ja
       JOIN users u ON u.id = ja.user_id
       WHERE ja.job_id = $1 AND ja.account_id = $2 AND ja.removed_at IS NULL
       ORDER BY ja.is_primary DESC, u.name`,
      [job.id, req.accountId]
    );
    job.team = team;

    // Service lines (all job types) — join schedule for cadence/timing on recurring jobs
    const { rows: services } = await pool.query(
      `SELECT js.*,
          ras.cadence              AS schedule_cadence,
          ras.preferred_start_time AS schedule_preferred_start_time
       FROM job_services js
       LEFT JOIN recurring_agreement_schedules ras ON ras.id = js.agreement_schedule_id
       WHERE js.job_id = $1 AND js.account_id = $2
       ORDER BY js.sort_order, js.created_at`,
      [job.id, req.accountId]
    );
    job.services = services;

    // Assets/service targets (all job types)
    const { rows: assets } = await pool.query(
      `SELECT a.*, u.name AS assigned_tech_name
       FROM job_assets a
       LEFT JOIN users u ON u.id = a.assigned_tech_id
       WHERE a.job_id = $1 AND a.account_id = $2
       ORDER BY a.created_at`,
      [job.id, req.accountId]
    );
    job.assets = assets;

    if (job.is_multi_day) {
      job.sessions = await getSessionsForJob(job.id, req.accountId);
    }

    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/jobs ────────────────────────────────────────────────────────────
router.post('/', requireAuth, requireRole('owner', 'manager'), checkJobLimit, async (req, res) => {
  const {
    client_id, tech_id, service_type, scheduled_at, amount, notes, instructions, recurring, travel_fee,
    service_address, service_location, address,
    service_city, service_state, service_zip, service_lat, service_lng,
    // Canonical client location reference (optional — snapshots address fields below)
    location_id,
    // Multi-day fields
    is_multi_day, title, scope_of_work, estimated_start_date, estimated_end_date,
    end_date_unknown, job_manager_id, estimated_labor_hours, billing_method, priority,
    sessions = [],  // array of { scheduled_date, start_time, end_time, tech_ids, title, description }
    // New scheduling contract: frontend sends local string + explicit timezone; server converts.
    scheduled_at_local, input_timezone, input_timezone_source, creator_timezone,
    // Legacy timezone audit fields
    scheduling_timezone, original_local_start,
    // Team assignment payload (new path) — assignment.members drives tech_id (Phase A).
    // Legacy callers may still send tech_id directly; both paths are supported.
    assignment,
    // Service lines: [{ service_name, description, asset_label, quantity, duration_minutes, price_cents, service_notes, sort_order }]
    services = [],
  } = req.body;

  if (!client_id || !service_type) {
    return res.status(400).json({ error: 'client_id and service_type are required' });
  }

  // Resolve final scheduled_at UTC value.
  // New path: frontend sends scheduled_at_local (raw local string) + input_timezone; server converts.
  // Legacy path: frontend sent a pre-converted UTC ISO string as scheduled_at.
  let finalScheduledAt = scheduled_at || null;
  let validatedInputTZ = (input_timezone && validateIanaTimezone(input_timezone)) ? input_timezone : null;

  if (scheduled_at_local) {
    if (!validatedInputTZ) {
      return res.status(400).json({
        error: 'input_timezone is required when scheduled_at_local is provided. Use an IANA identifier such as America/New_York.',
      });
    }
    const localStr = String(scheduled_at_local).trim();
    if (localStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)) {
      try {
        const datePart = localStr.substring(0, 10);
        const timePart = localStr.substring(11, 16);
        finalScheduledAt = localScheduleToUtc(datePart, timePart, validatedInputTZ).toISOString();
      } catch (convErr) {
        return res.status(400).json({
          error: `Cannot interpret "${scheduled_at_local}" in timezone "${validatedInputTZ}": ${convErr.message}`,
        });
      }
    }
  }

  // Validate scheduling_timezone if provided — silently ignore invalid values rather than
  // rejecting saves (backward compatibility with legacy payloads).
  const validatedTZ = validatedInputTZ
    || ((scheduling_timezone && validateIanaTimezone(scheduling_timezone)) ? scheduling_timezone : null);

  // Resolve the effective tech_id (Phase A: keep jobs.tech_id in sync with primary assignment).
  // New path: derive from assignment.members; legacy path: use tech_id directly.
  let effectiveTechId = tech_id || null;
  if (assignment?.members?.length > 0) {
    const primaryMember = assignment.members.find(m => m.isPrimary) || assignment.members[0];
    effectiveTechId = primaryMember?.userId || null;
  }

  // Enforce entitlements before touching the DB
  const ent = await getEntitlements(req.accountId);

  if (is_multi_day && !ent.capabilities.can_create_multi_day_jobs) {
    return res.status(403).json({
      error:       'Multi-Day Jobs require the Solo plan or higher.',
      code:        'ENTITLEMENT_REQUIRED',
      capability:  'can_create_multi_day_jobs',
      requiredPlan: 'solo',
      currentPlan: ent.plan,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Enforce monthly job cap inside transaction with advisory lock to prevent races
    if (ent.capabilities.max_jobs_per_month !== null) {
      // Advisory lock keyed on account UUID (converted to bigint via hashtext)
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [req.accountId]);
      const { rows: [{ cnt }] } = await client.query(
        `SELECT COUNT(*) AS cnt FROM jobs
         WHERE account_id = $1
           AND status != 'cancelled'
           AND created_at >= date_trunc('month', NOW())`,
        [req.accountId]
      );
      if (parseInt(cnt) >= ent.capabilities.max_jobs_per_month) {
        // Throw so the outer catch/finally handles ROLLBACK + release
        const capErr = new Error('MONTHLY_CAP_REACHED');
        capErr.statusCode = 403;
        capErr.body = {
          error:       `Monthly job limit of ${ent.capabilities.max_jobs_per_month} reached for your plan.`,
          code:        'MONTHLY_JOB_CAP_REACHED',
          limit:       ent.capabilities.max_jobs_per_month,
          currentPlan: ent.plan,
        };
        throw capErr;
      }
    }

    // If location_id supplied, snapshot address fields from the canonical client location.
    // Frontend-supplied address fields override the snapshot (allows one-off adjustments).
    let resolvedLocationId = null;
    if (location_id) {
      const locRow = await client.query(
        `SELECT * FROM client_locations WHERE id = $1 AND account_id = $2`,
        [location_id, req.accountId]
      );
      if (locRow.rows.length) {
        const loc = locRow.rows[0];
        resolvedLocationId = loc.id;
        if (!service_address && loc.address) {
          // eslint-disable-next-line no-param-reassign -- intentional snapshot
          req.body.service_address = loc.address;
          req.body.service_city    = loc.city  || null;
          req.body.service_state   = loc.state || null;
          req.body.service_zip     = loc.zip   || null;
          req.body.service_lat     = loc.lat   || null;
          req.body.service_lng     = loc.lng   || null;
        }
      }
    }

    const streetAddr        = req.body.service_address || service_location || address || null;
    const addressToGeocode  = streetAddr
      ? [streetAddr, req.body.service_city || service_city, req.body.service_state || service_state, req.body.service_zip || service_zip].filter(Boolean).join(', ')
      : null;
    let finalServiceAddress = streetAddr;
    let finalServiceLat      = req.body.service_lat || service_lat  || null;
    let finalServiceLng      = req.body.service_lng || service_lng  || null;
    let mappingWarning       = null;
    let geocodeStatus        = 'not_attempted';
    let geocodeProviderStatus = null;
    let geocodeErrorMsg      = null;

    if (addressToGeocode && (!finalServiceLat || !finalServiceLng)) {
      const geo = await geocodeAddress(addressToGeocode);
      if (geo && !geo.error) {
        finalServiceAddress   = geo.formatted_address || finalServiceAddress;
        finalServiceLat       = geo.lat;
        finalServiceLng       = geo.lng;
        geocodeStatus         = 'resolved';
        geocodeProviderStatus = 'OK';
      } else {
        mappingWarning        = 'Job saved, but address could not be mapped.';
        geocodeStatus         = 'failed';
        geocodeProviderStatus = geo?.geocode_provider_status || 'UNKNOWN_ERROR';
        geocodeErrorMsg       = geo?.geocode_error || null;
      }
    } else if (finalServiceLat && finalServiceLng) {
      geocodeStatus = 'resolved';
    }

    let travelFee = travel_fee !== undefined ? parseFloat(travel_fee) || 0 : null;
    if (travelFee === null) {
      const settingsRes = await client.query(
        `SELECT travel_fee FROM booking_settings WHERE account_id = $1`, [req.accountId]
      );
      travelFee = parseFloat(settingsRes.rows[0]?.travel_fee || 0);
    }

    const { rows } = await client.query(
      `INSERT INTO jobs
         (account_id, client_id, tech_id, service_type, scheduled_at, amount, notes, instructions,
          recurring, travel_fee,
          service_address, service_city, service_state, service_zip, service_lat, service_lng,
          location_id,
          is_multi_day, title, scope_of_work, estimated_start_date, estimated_end_date, end_date_unknown,
          job_manager_id, estimated_labor_hours, billing_method, priority,
          scheduling_timezone, original_local_start, geocode_status,
          input_timezone, input_timezone_source, creator_timezone_at_creation,
          geocode_provider_status, geocode_error, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,NOW())
       RETURNING *`,
      [
        req.accountId, client_id, effectiveTechId, service_type,
        finalScheduledAt, amount || null, notes || null, instructions || null,
        recurring || 'none',
        travelFee, finalServiceAddress || null,
        req.body.service_city || service_city || null,
        req.body.service_state || service_state || null,
        req.body.service_zip || service_zip || null,
        finalServiceLat, finalServiceLng,
        resolvedLocationId,
        !!is_multi_day, title || null, scope_of_work || null,
        estimated_start_date || null, estimated_end_date || null, !!end_date_unknown,
        job_manager_id || null, estimated_labor_hours || null,
        billing_method || 'fixed', priority || 'normal',
        validatedTZ, original_local_start || null, geocodeStatus,
        validatedInputTZ, input_timezone_source || null,
        (creator_timezone && validateIanaTimezone(creator_timezone)) ? creator_timezone : null,
        geocodeProviderStatus, geocodeErrorMsg,
      ]
    );
    const job = rows[0];

    // Create job_assignments for the initial team (single-day jobs).
    // New path: assignment.members; legacy path: tech_id solo assignment.
    // Both paths run inside the transaction — rollback if either fails.
    if (!is_multi_day) {
      const membersToInsert = assignment?.members?.length > 0
        ? assignment.members
        : (effectiveTechId ? [{ userId: effectiveTechId, assignmentRole: 'lead_technician', isPrimary: true }] : []);

      if (membersToInsert.length > 0) {
        // Verify every member belongs to this account (tenant isolation).
        const memberIds = membersToInsert.map(m => m.userId).filter(Boolean);
        const { rows: validUsers } = await client.query(
          `SELECT id FROM users WHERE id = ANY($1::uuid[]) AND account_id = $2`,
          [memberIds, req.accountId]
        );
        const validSet = new Set(validUsers.map(u => u.id));
        const safeMembers = membersToInsert.filter(m => validSet.has(m.userId));

        const crewId = assignment?.crewId || null;
        const hasExplicitPrimary = safeMembers.some(m => m.isPrimary);

        for (let i = 0; i < safeMembers.length; i++) {
          const m = safeMembers[i];
          const isPrimary = hasExplicitPrimary ? !!m.isPrimary : i === 0;
          const role = [
            'lead_technician','technician','helper','apprentice',
            'specialist','driver','observer','crew_lead',
          ].includes(m.assignmentRole) ? m.assignmentRole : 'technician';
          await client.query(
            `INSERT INTO job_assignments
               (account_id, job_id, user_id, crew_id, assignment_role, is_primary,
                status, assigned_at, assigned_by)
             VALUES ($1, $2, $3, $4, $5, $6, 'assigned', NOW(), $7)`,
            [req.accountId, job.id, m.userId, crewId, role, isPrimary, req.userId]
          );
        }

        // Reconcile jobs.tech_id: derive from validated primary (tenant-safe).
        const validatedPrimary = hasExplicitPrimary
          ? safeMembers.find(m => m.isPrimary)
          : safeMembers[0];
        const validatedTechId = validatedPrimary?.userId || null;
        if (validatedTechId !== effectiveTechId) {
          await client.query(
            `UPDATE jobs SET tech_id = $1 WHERE id = $2 AND account_id = $3`,
            [validatedTechId, job.id, req.accountId]
          );
          effectiveTechId = validatedTechId;
        }
      } else {
        // All proposed members were invalid — clear tech_id if it was set from assignment.
        if (assignment?.members?.length > 0 && effectiveTechId) {
          await client.query(
            `UPDATE jobs SET tech_id = NULL WHERE id = $1 AND account_id = $2`,
            [job.id, req.accountId]
          );
          effectiveTechId = null;
        }
      }
    }

    // Create sessions for multi-day job
    const createdSessions = [];
    if (is_multi_day && sessions.length > 0) {
      for (let idx = 0; idx < sessions.length; idx++) {
        const sess = sessions[idx];
        const { rows: sRows } = await client.query(
          `INSERT INTO job_sessions
             (job_id, account_id, session_number, title, description, scheduled_date,
              start_time, end_time, duration_minutes, lead_tech_id, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [
            job.id, req.accountId, idx + 1,
            sess.title || null, sess.description || null, sess.scheduled_date,
            sess.start_time || null, sess.end_time || null,
            sess.duration_minutes ? parseInt(sess.duration_minutes, 10) : null,
            sess.lead_tech_id || tech_id || null, req.userId,
          ]
        );
        const session = sRows[0];

        // Assign technicians to session
        const techIds = sess.tech_ids && sess.tech_ids.length > 0
          ? sess.tech_ids
          : (tech_id ? [tech_id] : []);

        for (const tid of techIds) {
          await client.query(
            `INSERT INTO job_session_techs (session_id, job_id, account_id, tech_id, is_lead)
             VALUES ($1,$2,$3,$4,$5) ON CONFLICT (session_id, tech_id) DO NOTHING`,
            [session.id, job.id, req.accountId, tid, tid === (sess.lead_tech_id || tech_id)]
          );
        }
        session.techs = techIds.map(tid => ({ tech_id: tid }));
        createdSessions.push(session);
      }
    }

    // Auto-create deposit
    const depSettingsRes = await client.query(
      `SELECT deposit_amount FROM booking_settings WHERE account_id = $1`, [req.accountId]
    );
    const depositAmount = parseFloat(depSettingsRes.rows[0]?.deposit_amount || 0);
    if (depositAmount > 0) {
      await client.query(
        `INSERT INTO deposits (account_id, job_id, client_id, amount) VALUES ($1,$2,$3,$4)`,
        [req.accountId, job.id, client_id, depositAmount]
      ).catch(() => {});
    }

    await client.query('COMMIT');

    // Auto-send confirmation SMS (non-fatal)
    if (scheduled_at && !is_multi_day) {
      const clientResult = await pool.query(`SELECT name, phone FROM clients WHERE id = $1`, [client_id]);
      const cl = clientResult.rows[0];
      if (cl?.phone) {
        sms.send(req.accountId, client_id, cl.phone,
          sms.confirmationBody(cl.name, service_type, scheduled_at, validatedTZ || null)
        ).then(result => {
          if (!result?.blocked) return pool.query(`UPDATE jobs SET confirmation_sent = TRUE WHERE id = $1`, [job.id]);
        }).catch(() => {});
      }
    }

    // Persist service lines after commit (pool.query on committed job)
    if (services.length > 0) {
      for (let i = 0; i < services.length; i++) {
        const svc = services[i];
        if (!svc?.service_name) continue;
        await pool.query(
          `INSERT INTO job_services
             (job_id, account_id, service_name, description, asset_label,
              quantity, duration_minutes, price_cents, service_notes, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            job.id, req.accountId, svc.service_name.trim(),
            svc.description || null, svc.asset_label || null,
            svc.quantity || 1, svc.duration_minutes || null,
            svc.price_cents || null, svc.service_notes || null,
            svc.sort_order != null ? svc.sort_order : i,
          ]
        ).catch(() => {});
      }
    }

    audit.log(req.accountId, req.userId, 'job.created', 'job', job.id, {
      is_multi_day: !!is_multi_day, session_count: createdSessions.length,
    }, req.ip);

    recordActivity({
      accountId: req.accountId, jobId: job.id,
      eventType: 'job.created',
      actor: { id: req.userId, type: 'user' },
      summary: `Job created — ${job.service_type || 'unknown service'}`,
      metadata: { service_type: job.service_type, is_multi_day: !!is_multi_day },
      occurredAt: new Date(job.created_at || Date.now()),
      source: 'domain',
    });

    if (effectiveTechId && !is_multi_day) {
      const members = assignment?.members?.length > 0 ? assignment.members
        : [{ userId: effectiveTechId, isPrimary: true }];
      recordActivity({
        accountId: req.accountId, jobId: job.id, techId: effectiveTechId,
        eventType: 'job.team_assigned',
        actor: { id: req.userId, type: 'user' },
        summary: members.length === 1
          ? `Assigned to technician on creation`
          : `Team of ${members.length} assigned on creation`,
        metadata: { memberIds: members.map(m => m.userId), primaryUserId: effectiveTechId },
        source: 'domain',
      });
    }

    const response = { ...job, sessions: createdSessions };
    if (mappingWarning) response.geocode_warning = mappingWarning;
    res.status(201).json(response);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    if (err.statusCode && err.body) {
      return res.status(err.statusCode).json(err.body);
    }
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── PATCH /api/jobs/:id — full edit ──────────────────────────────────────────
router.patch('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  // New scheduling contract: convert scheduled_at_local + input_timezone to UTC before patching.
  if (req.body.scheduled_at_local) {
    const inputTZ = req.body.input_timezone;
    if (!inputTZ || !validateIanaTimezone(inputTZ)) {
      return res.status(400).json({
        error: 'input_timezone is required when scheduled_at_local is provided. Use an IANA identifier such as America/New_York.',
      });
    }
    const localStr = String(req.body.scheduled_at_local).trim();
    if (localStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)) {
      try {
        const datePart = localStr.substring(0, 10);
        const timePart = localStr.substring(11, 16);
        req.body.scheduled_at = localScheduleToUtc(datePart, timePart, inputTZ).toISOString();
      } catch (convErr) {
        return res.status(400).json({
          error: `Cannot interpret "${req.body.scheduled_at_local}" in timezone "${inputTZ}": ${convErr.message}`,
        });
      }
    }
    // scheduled_at_local is not a real DB column — remove it before building the UPDATE.
    delete req.body.scheduled_at_local;
    // creator_timezone_at_creation: validate before patching
    if (req.body.creator_timezone && !validateIanaTimezone(req.body.creator_timezone)) {
      delete req.body.creator_timezone;
    }
    if (req.body.creator_timezone) {
      req.body.creator_timezone_at_creation = req.body.creator_timezone;
    }
    delete req.body.creator_timezone;
  }

  const updates = [];
  const values  = [];
  let i = 1;

  PATCHABLE_JOB_FIELDS.forEach(f => {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      values.push(req.body[f] !== '' ? req.body[f] : null);
    }
  });

  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

  updates.push(`updated_at = NOW()`);
  values.push(req.params.id, req.accountId);

  try {
    const { rows } = await pool.query(
      `WITH updated AS (
         UPDATE jobs SET ${updates.join(', ')}
         WHERE id = $${i} AND account_id = $${i + 1} RETURNING *
       )
       SELECT u.*, c.name AS client_name, usr.name AS tech_name
       FROM updated u
       JOIN clients c ON c.id = u.client_id
       LEFT JOIN users usr ON usr.id = u.tech_id`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    let job = rows[0];

    // Geocode when address present but coordinates missing
    if (job.service_address && (!job.service_lat || !job.service_lng)) {
      const addrParts = [job.service_address, job.service_city, job.service_state, job.service_zip].filter(Boolean);
      const geo = await geocodeAddress(addrParts.join(', '));
      if (geo && !geo.error) {
        await pool.query(
          `UPDATE jobs SET service_lat = $1, service_lng = $2,
           service_address = COALESCE($3, service_address),
           geocode_status = 'resolved', geocode_provider_status = 'OK', geocode_error = NULL
           WHERE id = $4`,
          [geo.lat, geo.lng, geo.formatted_address || null, job.id]
        );
        job = { ...job, service_lat: geo.lat, service_lng: geo.lng,
          service_address: geo.formatted_address || job.service_address,
          geocode_status: 'resolved', geocode_provider_status: 'OK', geocode_error: null };
      } else {
        await pool.query(
          `UPDATE jobs SET geocode_status = 'failed', geocode_provider_status = $1, geocode_error = $2 WHERE id = $3`,
          [geo?.geocode_provider_status || 'UNKNOWN_ERROR', geo?.geocode_error || null, job.id]
        );
        job = { ...job, geocode_status: 'failed',
          geocode_provider_status: geo?.geocode_provider_status || 'UNKNOWN_ERROR',
          geocode_error: geo?.geocode_error || null };
      }
    }

    const updatedFields = {};
    PATCHABLE_JOB_FIELDS.forEach(f => { if (req.body[f] !== undefined) updatedFields[f] = req.body[f]; });
    audit.log(req.accountId, req.userId, 'job.updated', 'job', job.id, updatedFields, req.ip);

    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/jobs/:id/geocode — retry geocoding for a job ───────────────────
router.post('/:id/geocode', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, service_address, service_city, service_state, service_zip, service_lat, service_lng
       FROM jobs WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const job = rows[0];

    if (!job.service_address) {
      return res.status(400).json({ error: 'Job has no service address to geocode.' });
    }

    const addrParts = [job.service_address, job.service_city, job.service_state, job.service_zip].filter(Boolean);
    const geo = await geocodeAddress(addrParts.join(', '));

    if (geo && !geo.error) {
      const { rows: updated } = await pool.query(
        `UPDATE jobs
         SET service_lat = $1, service_lng = $2,
             service_address = COALESCE($3, service_address),
             geocode_status = 'resolved', geocode_provider_status = 'OK',
             geocode_error = NULL, updated_at = NOW()
         WHERE id = $4 AND account_id = $5
         RETURNING service_lat, service_lng, service_address, geocode_status, geocode_provider_status`,
        [geo.lat, geo.lng, geo.formatted_address || null, job.id, req.accountId]
      );
      return res.json(updated[0]);
    }

    const providerStatus = geo?.geocode_provider_status || 'UNKNOWN_ERROR';
    const geocodeErrMsg  = geo?.geocode_error || 'Address could not be geocoded.';
    await pool.query(
      `UPDATE jobs SET geocode_status = 'failed', geocode_provider_status = $1, geocode_error = $2, updated_at = NOW()
       WHERE id = $3 AND account_id = $4`,
      [providerStatus, geocodeErrMsg, job.id, req.accountId]
    );
    return res.status(422).json({
      geocode_status: 'failed',
      geocode_provider_status: providerStatus,
      error: geocodeErrMsg,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/jobs/:id/services — replace all service lines ───────────────────
router.put('/:id/services', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { services = [] } = req.body;
  try {
    const { rows: existing } = await pool.query(
      `SELECT id FROM jobs WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!existing.length) return res.status(404).json({ error: 'Not found' });

    // Replace all service lines atomically
    await pool.query(`DELETE FROM job_services WHERE job_id = $1 AND account_id = $2`, [req.params.id, req.accountId]);

    const created = [];
    for (let i = 0; i < services.length; i++) {
      const svc = services[i];
      if (!svc?.service_name) continue;
      const { rows } = await pool.query(
        `INSERT INTO job_services
           (job_id, account_id, service_name, description, asset_label,
            quantity, duration_minutes, price_cents, service_notes, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          req.params.id, req.accountId, svc.service_name.trim(),
          svc.description || null, svc.asset_label || null,
          svc.quantity || 1, svc.duration_minutes || null,
          svc.price_cents || null, svc.service_notes || null,
          svc.sort_order != null ? svc.sort_order : i,
        ]
      );
      created.push(rows[0]);
    }

    res.json({ services: created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/jobs/:id/status ────────────────────────────────────────────────
router.patch('/:id/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  try {
    // Fetch job to check is_multi_day
    const { rows: existing } = await pool.query(
      `SELECT id, is_multi_day, amount, client_id, service_type, travel_fee FROM jobs WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!existing.length) return res.status(404).json({ error: 'Not found' });
    const job = existing[0];

    // Multi-day jobs must use POST /:id/complete to complete — prevents accidental completion
    if (job.is_multi_day && status === 'complete') {
      return res.status(400).json({
        error: 'Multi-day jobs must be completed via POST /api/jobs/:id/complete to ensure all sessions are reviewed.'
      });
    }

    const completedAt = status === 'complete' ? 'NOW()' : 'NULL';
    const { rows } = await pool.query(
      `UPDATE jobs SET status = $1, completed_at = ${completedAt}, updated_at = NOW()
       WHERE id = $2 AND account_id = $3 RETURNING *`,
      [status, req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const updated = rows[0];

    // Auto-generate invoice when single-day job is marked complete
    if (status === 'complete' && !updated.is_multi_day && updated.amount) {
      const settingsRes = await pool.query(
        `SELECT tax_rate FROM booking_settings WHERE account_id = $1`, [req.accountId]
      );
      const taxRate    = parseFloat(settingsRes.rows[0]?.tax_rate || 0);
      const serviceAmt = parseFloat(updated.amount);
      const travelAmt  = parseFloat(updated.travel_fee || 0);
      const lineItems  = [{ description: updated.service_type || 'Service', amount: serviceAmt }];
      if (travelAmt > 0) lineItems.push({ description: 'Travel Fee', amount: travelAmt });
      const subtotal   = lineItems.reduce((s, l) => s + l.amount, 0);
      const taxAmount  = subtotal > 0 ? parseFloat((subtotal * taxRate).toFixed(2)) : 0;
      const total      = subtotal + taxAmount;
      await pool.query(
        `INSERT INTO invoices (account_id, job_id, client_id, amount, tax_amount, line_items)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [req.accountId, updated.id, updated.client_id, total, taxAmount, JSON.stringify(lineItems)]
      ).catch(() => {});
    }

    audit.log(req.accountId, req.userId, 'job.status_changed', 'job', updated.id,
      { from: job.status, to: status }, req.ip);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/jobs/:id/complete — deliberately complete a multi-day job ───────
router.post('/:id/complete', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { notes } = req.body;
  try {
    const { rows: existing } = await pool.query(
      `SELECT * FROM jobs WHERE id = $1 AND account_id = $2`, [req.params.id, req.accountId]
    );
    if (!existing.length) return res.status(404).json({ error: 'Not found' });
    const job = existing[0];

    if (job.status === 'complete') {
      return res.status(409).json({ error: 'Job is already complete.' });
    }

    const { rows } = await pool.query(
      `UPDATE jobs SET
         status = 'complete',
         completed_at = NOW(),
         actual_completion_date = CURRENT_DATE,
         overall_completion_pct = 100,
         updated_at = NOW()
       WHERE id = $1 AND account_id = $2 RETURNING *`,
      [req.params.id, req.accountId]
    );
    const updated = rows[0];

    // Auto-generate invoice
    if (updated.amount) {
      const settingsRes = await pool.query(
        `SELECT tax_rate FROM booking_settings WHERE account_id = $1`, [req.accountId]
      );
      const taxRate    = parseFloat(settingsRes.rows[0]?.tax_rate || 0);
      const serviceAmt = parseFloat(updated.amount);
      const travelAmt  = parseFloat(updated.travel_fee || 0);
      const lineItems  = [{ description: updated.service_type || updated.title || 'Service', amount: serviceAmt }];
      if (travelAmt > 0) lineItems.push({ description: 'Travel Fee', amount: travelAmt });
      const subtotal   = lineItems.reduce((s, l) => s + l.amount, 0);
      const taxAmount  = subtotal > 0 ? parseFloat((subtotal * taxRate).toFixed(2)) : 0;
      const total      = subtotal + taxAmount;
      await pool.query(
        `INSERT INTO invoices (account_id, job_id, client_id, amount, tax_amount, line_items)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [req.accountId, updated.id, updated.client_id, total, taxAmount, JSON.stringify(lineItems)]
      ).catch(() => {});
    }

    await notify.create(req.accountId, 'job_completed',
      `Job completed: ${updated.title || updated.service_type}`);
    audit.log(req.accountId, req.userId, 'job.completed', 'job', updated.id,
      { is_multi_day: true, notes: notes || null }, req.ip);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/jobs/:id/noshow — declare no-show ─────────────────────────────
router.patch('/:id/noshow', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE jobs SET status = 'no_show', noshow_declared_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND account_id = $2 RETURNING *`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const job = rows[0];

    await pool.query(
      `UPDATE deposits SET status = 'collected'
       WHERE job_id = $1 AND status = 'pending' AND account_id = $2`,
      [job.id, req.accountId]
    );

    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/jobs/:id/sessions — list sessions for a job ─────────────────────
router.get('/:id/sessions', requireAuth, async (req, res) => {
  try {
    // Verify job belongs to account
    const { rows: jobRows } = await pool.query(
      `SELECT id FROM jobs WHERE id = $1 AND account_id = $2`, [req.params.id, req.accountId]
    );
    if (!jobRows.length) return res.status(404).json({ error: 'Job not found' });

    const sessions = await getSessionsForJob(req.params.id, req.accountId);
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/jobs/:id/sessions — add work session ───────────────────────────
router.post('/:id/sessions', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const {
    scheduled_date, start_time, end_time, duration_minutes, title, description,
    lead_tech_id, tech_ids = [], estimated_hours,
  } = req.body;

  if (!scheduled_date) {
    return res.status(400).json({ error: 'scheduled_date is required' });
  }

  try {
    // Verify job ownership and multi-day flag
    const { rows: jobRows } = await pool.query(
      `SELECT id, is_multi_day FROM jobs WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!jobRows.length) return res.status(404).json({ error: 'Job not found' });

    // Auto-enable is_multi_day if adding sessions to a non-multi-day job
    if (!jobRows[0].is_multi_day) {
      await pool.query(
        `UPDATE jobs SET is_multi_day = TRUE, updated_at = NOW() WHERE id = $1`, [req.params.id]
      );
    }

    // Get next session number
    const { rows: cntRows } = await pool.query(
      `SELECT COALESCE(MAX(session_number), 0) + 1 AS next_num FROM job_sessions WHERE job_id = $1`,
      [req.params.id]
    );
    const sessionNumber = cntRows[0].next_num;

    const { rows: sRows } = await pool.query(
      `INSERT INTO job_sessions
         (job_id, account_id, session_number, title, description, scheduled_date,
          start_time, end_time, duration_minutes, lead_tech_id, estimated_hours, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        req.params.id, req.accountId, sessionNumber,
        title || null, description || null, scheduled_date,
        start_time || null, end_time || null,
        duration_minutes ? parseInt(duration_minutes, 10) : null,
        lead_tech_id || null, estimated_hours || null, req.userId,
      ]
    );
    const session = sRows[0];

    // Assign technicians
    const allTechIds = [...new Set([...(lead_tech_id ? [lead_tech_id] : []), ...tech_ids])];
    for (const tid of allTechIds) {
      await pool.query(
        `INSERT INTO job_session_techs (session_id, job_id, account_id, tech_id, is_lead)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (session_id, tech_id) DO NOTHING`,
        [session.id, req.params.id, req.accountId, tid, tid === lead_tech_id]
      );
    }

    // Fetch with techs
    const sessions = await getSessionsForJob(req.params.id, req.accountId);
    const created  = sessions.find(s => s.id === session.id) || session;

    audit.log(req.accountId, req.userId, 'session.added', 'job_session', session.id,
      { job_id: req.params.id, scheduled_date }, req.ip);

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/jobs/:id/sessions/:sid ─────────────────────────────────────────
router.patch('/:id/sessions/:sid', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const SESSION_FIELDS = [
    'title','description','scheduled_date','start_time','end_time','duration_minutes',
    'lead_tech_id','estimated_hours','actual_hours','internal_notes','client_notes',
    'work_completed','work_remaining','blockers','completion_pct',
  ];

  const updates = [];
  const values  = [];
  let i = 1;

  SESSION_FIELDS.forEach(f => {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      values.push(req.body[f] !== '' ? req.body[f] : null);
    }
  });

  if (!updates.length && !req.body.tech_ids) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  try {
    // Verify ownership
    const { rows: existing } = await pool.query(
      `SELECT s.* FROM job_sessions s
       JOIN jobs j ON j.id = s.job_id
       WHERE s.id = $1 AND s.account_id = $2`,
      [req.params.sid, req.accountId]
    );
    if (!existing.length) return res.status(404).json({ error: 'Session not found' });

    if (updates.length) {
      updates.push(`updated_by = $${i++}`, `updated_at = NOW()`);
      values.push(req.userId, req.params.sid, req.accountId);
      await pool.query(
        `UPDATE job_sessions SET ${updates.join(', ')}
         WHERE id = $${i} AND account_id = $${i + 1}`,
        values
      );
    }

    // Sync technicians if provided
    if (req.body.tech_ids !== undefined) {
      const newTechIds = req.body.tech_ids || [];
      const lead = req.body.lead_tech_id || existing[0].lead_tech_id;

      await pool.query(`DELETE FROM job_session_techs WHERE session_id = $1`, [req.params.sid]);
      for (const tid of [...new Set([...(lead ? [lead] : []), ...newTechIds])]) {
        await pool.query(
          `INSERT INTO job_session_techs (session_id, job_id, account_id, tech_id, is_lead)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT (session_id, tech_id) DO NOTHING`,
          [req.params.sid, req.params.id, req.accountId, tid, tid === lead]
        );
      }
    }

    const sessions = await getSessionsForJob(req.params.id, req.accountId);
    const updated  = sessions.find(s => String(s.id) === String(req.params.sid));
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/jobs/:id/sessions/:sid/status ──────────────────────────────────
router.patch('/:id/sessions/:sid/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  if (!VALID_SESSION_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_SESSION_STATUSES.join(', ')}` });
  }

  try {
    const { rows: existing } = await pool.query(
      `SELECT s.*, j.status AS job_status FROM job_sessions s
       JOIN jobs j ON j.id = s.job_id
       WHERE s.id = $1 AND s.account_id = $2`,
      [req.params.sid, req.accountId]
    );
    if (!existing.length) return res.status(404).json({ error: 'Session not found' });
    const session = existing[0];

    // Protect completed sessions from accidental status rollback (require owner/manager)
    if (session.status === 'completed_for_day' && req.userRole === 'tech') {
      return res.status(403).json({ error: 'Technicians cannot reopen completed sessions.' });
    }

    const checkinAt  = status === 'checked_in' ? 'NOW()' : `'${session.checkin_at || null}'`;
    const checkoutAt = status === 'completed_for_day' ? 'NOW()' : `NULL`;

    await pool.query(
      `UPDATE job_sessions SET status = $1, updated_by = $2, updated_at = NOW()
       WHERE id = $3 AND account_id = $4`,
      [status, req.userId, req.params.sid, req.accountId]
    );

    // When first session checks in, move parent job to in_progress
    if (status === 'checked_in' || status === 'in_progress') {
      await pool.query(
        `UPDATE jobs SET
           status = CASE WHEN status IN ('scheduled','unscheduled','draft') THEN 'in_progress' ELSE status END,
           actual_start_date = COALESCE(actual_start_date, CURRENT_DATE),
           updated_at = NOW()
         WHERE id = $1 AND account_id = $2`,
        [req.params.id, req.accountId]
      );
    }

    // When a session completes for the day, update parent to partially_completed if not already in_progress
    if (status === 'completed_for_day') {
      await pool.query(
        `UPDATE jobs SET
           status = CASE
             WHEN status = 'in_progress' THEN 'partially_completed'
             WHEN status = 'scheduled' THEN 'partially_completed'
             ELSE status
           END,
           updated_at = NOW()
         WHERE id = $1 AND account_id = $2 AND is_multi_day = TRUE`,
        [req.params.id, req.accountId]
      );

      audit.log(req.accountId, req.userId, 'session.completed_for_day', 'job_session', req.params.sid,
        { job_id: req.params.id, session_date: session.scheduled_date }, req.ip);
    }

    const sessions = await getSessionsForJob(req.params.id, req.accountId);
    const updated  = sessions.find(s => String(s.id) === String(req.params.sid));
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/jobs/:id/sessions/:sid/complete — daily closeout ────────────────
router.post('/:id/sessions/:sid/complete', requireAuth, async (req, res) => {
  const {
    work_completed, work_remaining, completion_pct, blockers,
    internal_notes, client_notes, actual_hours,
  } = req.body;

  try {
    const { rows: existing } = await pool.query(
      `SELECT s.*, j.is_multi_day FROM job_sessions s
       JOIN jobs j ON j.id = s.job_id
       WHERE s.id = $1 AND s.account_id = $2`,
      [req.params.sid, req.accountId]
    );
    if (!existing.length) return res.status(404).json({ error: 'Session not found' });
    const session = existing[0];

    if (session.status === 'completed_for_day') {
      return res.status(409).json({ error: 'Session is already completed for the day.' });
    }

    await pool.query(
      `UPDATE job_sessions SET
         status          = 'completed_for_day',
         checkout_at     = NOW(),
         work_completed  = COALESCE($1, work_completed),
         work_remaining  = COALESCE($2, work_remaining),
         completion_pct  = COALESCE($3, completion_pct),
         blockers        = COALESCE($4, blockers),
         internal_notes  = COALESCE($5, internal_notes),
         client_notes    = COALESCE($6, client_notes),
         actual_hours    = COALESCE($7, actual_hours),
         updated_by      = $8,
         updated_at      = NOW()
       WHERE id = $9 AND account_id = $10`,
      [
        work_completed || null, work_remaining || null,
        completion_pct != null ? parseInt(completion_pct) : null,
        blockers || null, internal_notes || null, client_notes || null,
        actual_hours ? parseFloat(actual_hours) : null,
        req.userId, req.params.sid, req.accountId,
      ]
    );

    // Update parent job status to partially_completed; keep open
    await pool.query(
      `UPDATE jobs SET
         status = CASE
           WHEN status IN ('in_progress','scheduled','unscheduled') THEN 'partially_completed'
           ELSE status
         END,
         actual_start_date = COALESCE(actual_start_date, CURRENT_DATE),
         updated_at = NOW()
       WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );

    // Update parent overall_completion_pct as average of all session completion_pcts
    await pool.query(
      `UPDATE jobs SET
         overall_completion_pct = (
           SELECT COALESCE(AVG(completion_pct)::INT, 0)
           FROM job_sessions WHERE job_id = $1
         )
       WHERE id = $1`,
      [req.params.id]
    );

    await notify.create(req.accountId, 'session_completed',
      `Session completed for ${session.scheduled_date}`);
    audit.log(req.accountId, req.userId, 'session.completed_for_day', 'job_session', req.params.sid,
      { job_id: req.params.id, work_completed, completion_pct }, req.ip);

    const sessions = await getSessionsForJob(req.params.id, req.accountId);
    const updated  = sessions.find(s => String(s.id) === String(req.params.sid));
    res.json({ session: updated, message: 'Session completed for the day. Parent job remains open.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/jobs/:id/sessions/:sid ────────────────────────────────────────
router.delete('/:id/sessions/:sid', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows: existing } = await pool.query(
      `SELECT s.* FROM job_sessions s
       JOIN jobs j ON j.id = s.job_id
       WHERE s.id = $1 AND s.account_id = $2`,
      [req.params.sid, req.accountId]
    );
    if (!existing.length) return res.status(404).json({ error: 'Session not found' });
    const session = existing[0];

    if (session.status === 'completed_for_day') {
      return res.status(409).json({
        error: 'Cannot delete a completed session. Use a cancellation status instead.'
      });
    }

    await pool.query(
      `DELETE FROM job_sessions WHERE id = $1 AND account_id = $2`,
      [req.params.sid, req.accountId]
    );

    audit.log(req.accountId, req.userId, 'session.deleted', 'job_session', req.params.sid,
      { job_id: req.params.id, scheduled_date: session.scheduled_date }, req.ip);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/jobs/:id/assets ──────────────────────────────────────────────────
router.get('/:id/assets', requireAuth, async (req, res) => {
  try {
    const { rows: jobRows } = await pool.query(
      `SELECT id FROM jobs WHERE id = $1 AND account_id = $2`, [req.params.id, req.accountId]
    );
    if (!jobRows.length) return res.status(404).json({ error: 'Job not found' });

    const { rows } = await pool.query(
      `SELECT a.*, u.name AS assigned_tech_name
       FROM job_assets a
       LEFT JOIN users u ON u.id = a.assigned_tech_id
       WHERE a.job_id = $1 AND a.account_id = $2
       ORDER BY a.created_at`,
      [req.params.id, req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/jobs/:id/assets ─────────────────────────────────────────────────
router.post('/:id/assets', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { name, description, asset_type, identifier, assigned_tech_id, assigned_session_id, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  try {
    const { rows: jobRows } = await pool.query(
      `SELECT id FROM jobs WHERE id = $1 AND account_id = $2`, [req.params.id, req.accountId]
    );
    if (!jobRows.length) return res.status(404).json({ error: 'Job not found' });

    const { rows } = await pool.query(
      `INSERT INTO job_assets
         (job_id, account_id, name, description, asset_type, identifier,
          assigned_tech_id, assigned_session_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.params.id, req.accountId, name, description || null, asset_type || null,
       identifier || null, assigned_tech_id || null, assigned_session_id || null, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/jobs/:id/cancel ─────────────────────────────────────────────────
router.post('/:id/cancel', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { reason } = req.body;
  try {
    const { rows: existing } = await pool.query(
      `SELECT id, status FROM jobs WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId],
    );
    if (!existing.length) return res.status(404).json({ error: 'Not found' });
    const job = existing[0];
    if (job.status === 'cancelled') return res.status(409).json({ error: 'Job is already cancelled' });
    if (job.status === 'complete')  return res.status(422).json({ error: 'Cannot cancel a completed job' });

    const { rows } = await pool.query(
      `UPDATE jobs SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND account_id = $2 RETURNING *`,
      [req.params.id, req.accountId],
    );
    audit.log(req.accountId, req.userId, 'job.cancelled', 'job', req.params.id,
      { from: job.status, reason: reason || null }, req.ip);
    recordActivity({
      accountId: req.accountId, jobId: req.params.id,
      eventType: 'job.cancelled',
      actor: { id: req.userId, type: 'user' },
      summary: reason ? `Job cancelled — ${reason}` : 'Job cancelled',
      metadata: { from: job.status, reason: reason || null },
      source: 'domain',
    });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/jobs/:id/reopen ─────────────────────────────────────────────────
router.post('/:id/reopen', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows: existing } = await pool.query(
      `SELECT id, status FROM jobs WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId],
    );
    if (!existing.length) return res.status(404).json({ error: 'Not found' });
    const job = existing[0];
    if (job.status !== 'cancelled') return res.status(422).json({ error: 'Only cancelled jobs can be reopened' });

    const { rows } = await pool.query(
      `UPDATE jobs SET status = 'scheduled', updated_at = NOW()
       WHERE id = $1 AND account_id = $2 RETURNING *`,
      [req.params.id, req.accountId],
    );
    audit.log(req.accountId, req.userId, 'job.reopened', 'job', req.params.id,
      { from: 'cancelled', to: 'scheduled' }, req.ip);
    recordActivity({
      accountId: req.accountId, jobId: req.params.id,
      eventType: 'job.reopened',
      actor: { id: req.userId, type: 'user' },
      summary: 'Job reopened',
      metadata: { from: 'cancelled', to: 'scheduled' },
      source: 'domain',
    });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/jobs/:id/emergency ───────────────────────────────────────────────
router.get('/:id/emergency', requireAuth, async (req, res) => {
  const result = await emergencySvc.getStatus(req.params.id, req.accountId);
  if (result.error) return res.status(result.status || 500).json({ error: result.error });
  res.json(result);
});

// ── POST /api/jobs/:id/emergency/activate ─────────────────────────────────────
router.post('/:id/emergency/activate', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const result = await emergencySvc.activate(req.params.id, req.accountId, req.userId, req.body);
  if (result.error) return res.status(result.status || 500).json({ error: result.error });
  res.json(result.job);
});

// ── PATCH /api/jobs/:id/emergency ─────────────────────────────────────────────
router.patch('/:id/emergency', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const result = await emergencySvc.update(req.params.id, req.accountId, req.userId, req.body);
  if (result.error) return res.status(result.status || 500).json({ error: result.error });
  res.json(result.job);
});

// ── POST /api/jobs/:id/emergency/resolve ──────────────────────────────────────
router.post('/:id/emergency/resolve', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const result = await emergencySvc.resolve(req.params.id, req.accountId, req.userId, req.body);
  if (result.error) return res.status(result.status || 500).json({ error: result.error });
  res.json(result.job);
});

// ── POST /api/jobs/:id/emergency/deactivate ───────────────────────────────────
router.post('/:id/emergency/deactivate', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const result = await emergencySvc.deactivate(req.params.id, req.accountId, req.userId, req.body);
  if (result.error) return res.status(result.status || 500).json({ error: result.error });
  res.json(result.job);
});

// ── GET /api/jobs/:id/assignments — current team ─────────────────────────────
router.get('/:id/assignments', requireAuth, async (req, res) => {
  try {
    const { rows: jobRows } = await pool.query(
      `SELECT id FROM jobs WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!jobRows.length) return res.status(404).json({ error: 'Job not found' });

    const team = await teamSvc.getJobTeam(req.accountId, req.params.id);
    res.json(team);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/jobs/:id/assignments/validate — validate proposed team ──────────
router.post('/:id/assignments/validate', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { members, crewId } = req.body;
  if (!Array.isArray(members)) {
    return res.status(400).json({ error: 'members must be an array' });
  }

  try {
    const result = await teamSvc.validateTeamUpdate({
      accountId:          req.accountId,
      jobId:              req.params.id,
      requestedByUserId:  req.userId,
      members,
      crewId: crewId || null,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/jobs/:id/assignments — apply team update ─────────────────────────
router.put('/:id/assignments', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { members, crewId, overrideWarnings = false } = req.body;
  if (!Array.isArray(members)) {
    return res.status(400).json({ error: 'members must be an array' });
  }

  try {
    const validation = await teamSvc.validateTeamUpdate({
      accountId:         req.accountId,
      jobId:             req.params.id,
      requestedByUserId: req.userId,
      members,
      crewId: crewId || null,
    });

    if (!validation.allowed) {
      return res.status(422).json({
        ...validation,
        assigned: false,
      });
    }

    if (validation.warnings.length > 0 && !overrideWarnings) {
      const memberWarnings = validation.memberResults.flatMap(r => r.warnings || []);
      if (memberWarnings.length > 0 || validation.warnings.length > 0) {
        return res.status(422).json({
          ...validation,
          assigned: false,
          requiresConfirmation: true,
        });
      }
    }

    if (validation.teamState === 'NO_CHANGES') {
      const currentTeam = await teamSvc.getJobTeam(req.accountId, req.params.id);
      return res.json({ ...currentTeam, assigned: false, teamState: 'NO_CHANGES' });
    }

    const team = await teamSvc.applyTeamUpdate({
      accountId:         req.accountId,
      jobId:             req.params.id,
      requestedByUserId: req.userId,
      members,
      crewId: crewId || null,
    });

    res.json({
      ...team,
      assigned:    true,
      teamState:   team.teamState,
      validation,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/jobs/:id/assets/:aid ──────────────────────────────────────────
router.patch('/:id/assets/:aid', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const ASSET_FIELDS = ['name','description','asset_type','identifier','status',
    'assigned_tech_id','assigned_session_id','completion_pct','notes'];
  const updates = [];
  const values  = [];
  let i = 1;

  ASSET_FIELDS.forEach(f => {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      values.push(req.body[f] !== '' ? req.body[f] : null);
    }
  });

  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

  if (req.body.status === 'completed') {
    updates.push(`completed_at = $${i++}`);
    values.push(new Date().toISOString());
  }

  updates.push(`updated_at = NOW()`);
  values.push(req.params.aid, req.params.id, req.accountId);

  try {
    const { rows } = await pool.query(
      `UPDATE job_assets SET ${updates.join(', ')}
       WHERE id = $${i} AND job_id = $${i + 1} AND account_id = $${i + 2} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Asset not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
