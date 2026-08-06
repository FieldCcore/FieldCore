const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const audit    = require('../services/audit');
const { validate: validateAssignment }         = require('../services/assignmentValidationService');
const { getWorkloads }                         = require('../services/technicianWorkloadService');
const { getRouteForTech, saveRoute }           = require('../services/routeSequencingService');
const {
  getServiceAreas, createServiceArea,
  updateServiceArea, deleteServiceArea,
} = require('../services/serviceAreaService');
const { predictDelays }       = require('../services/routeDelayService');
const { sendQuickMessage }    = require('../services/dispatchCommunicationService');
const predictiveOps           = require('../services/dispatchPredictiveOpsService');
const { recordActivity }      = require('../services/jobActivityService');
const { getCrews, createCrew } = require('../services/jobTeamAssignmentService');

// GPS freshness thresholds (must stay in sync with client/src/maps/dispatchCoords.js)
const LIVE_MIN  = 5;   // ≤ 5 min  → online (Live GPS marker)
const STALE_MIN = 30;  // 5–30 min → stale; > 30 min → offline

// Job statuses considered "active" for dispatch purposes.
// Must stay in sync with client/src/domain/technicianStatusPresentation.js ACTIVE_STATUSES.
const ACTIVE_STATUSES = [
  'in_progress', 'en_route', 'arrived', 'paused',
  'awaiting_client', 'awaiting_parts',
  'partially_completed', 'ready_for_inspection',
];

// Supported response time event columns
const VALID_EVENTS = ['scheduled_at', 'checkin_at', 'created_at'];

// Build a normalized metric object for every KPI.
function metric(key, label, status, value, displayValue, supportingText, extras = {}) {
  return {
    key,
    label,
    status,          // 'active'|'no_data'|'not_configured'|'disabled'|'unavailable'|'stale'
    value,           // raw number or null
    displayValue,    // formatted string for rendering
    supportingText,  // sub-line text
    enabled:  extras.enabled  ?? true,
    configured: extras.configured ?? true,
    sampleSize: extras.sampleSize ?? null,
    reasonCode: extras.reasonCode ?? null,
    configurePath: extras.configurePath ?? null,
  };
}

/**
 * GET /api/dispatch/summary
 *
 * Returns tenant-scoped, timezone-aware KPI metrics with normalized status objects.
 * The frontend renders each metric based on its `status` field — never infers
 * feature state from a numeric value.
 */
router.get('/summary', requireAuth, async (req, res) => {
  const { accountId } = req;
  const t0 = Date.now();

  try {
    // Load tenant timezone and KPI settings in one round-trip
    // Optional ?date=YYYY-MM-DD scopes todaysJobs and completedToday to a specific date.
    // liveTechnicians and activeJobs are always real-time operational.
    const configRes = await pool.query(
      `SELECT
         COALESCE(bp.timezone, 'UTC') AS tz,
         ds.kpi_show_live_techs,
         ds.kpi_show_active_jobs,
         ds.kpi_show_todays_jobs,
         ds.kpi_show_completed_today,
         ds.kpi_show_avg_response,
         ds.kpi_response_tracking_enabled,
         ds.kpi_response_start_event,
         ds.kpi_response_end_event,
         ds.kpi_response_outlier_minutes,
         ds.kpi_response_min_sample_size
       FROM accounts a
       LEFT JOIN business_profiles bp ON bp.account_id = a.id
       LEFT JOIN dispatch_settings  ds ON ds.account_id = a.id
       WHERE a.id = $1`,
      [accountId]
    );

    const cfg       = configRes.rows[0] || {};
    const tz        = cfg.tz || 'UTC';
    const todayTz   = `(NOW() AT TIME ZONE '${tz.replace(/'/g, '')}')::date`;
    const dateParam = req.query.date;
    const dateSql   = (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam))
      ? `'${dateParam}'::date`
      : todayTz;
    const isToday   = !dateParam;

    // KPI visibility flags (default true when no row exists)
    const showLive      = cfg.kpi_show_live_techs      !== false;
    const showActive    = cfg.kpi_show_active_jobs     !== false;
    const showToday     = cfg.kpi_show_todays_jobs     !== false;
    const showCompleted = cfg.kpi_show_completed_today !== false;
    const showAvgResp   = !!cfg.kpi_show_avg_response;

    // Average Response config
    const respEnabled    = !!cfg.kpi_response_tracking_enabled;
    const startEvent     = VALID_EVENTS.includes(cfg.kpi_response_start_event)
      ? cfg.kpi_response_start_event : 'scheduled_at';
    const endEvent       = VALID_EVENTS.includes(cfg.kpi_response_end_event)
      ? cfg.kpi_response_end_event   : 'checkin_at';
    const outlierMinutes = parseInt(cfg.kpi_response_outlier_minutes ?? 1440, 10);
    const minSample      = parseInt(cfg.kpi_response_min_sample_size ?? 1, 10);

    // Check whether any field-eligible, dispatch-visible team members exist
    const techCountRes = await pool.query(
      `SELECT COUNT(*) AS n FROM users WHERE account_id = $1 AND field_work_eligible = TRUE AND dispatch_visible = TRUE`,
      [accountId]
    );
    const techCount = parseInt(techCountRes.rows[0]?.n ?? 0, 10);

    // Run remaining KPI queries in parallel (avgResponse gated behind showAvgResp)
    const [liveRes, activeRes, todayRes, completedRes] = await Promise.all([

      // Live technicians — only field-eligible, dispatch-visible members
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE tl.updated_at > NOW() - INTERVAL '${LIVE_MIN} minutes')  AS online,
          COUNT(*) FILTER (WHERE tl.updated_at <= NOW() - INTERVAL '${LIVE_MIN} minutes'
                             AND tl.updated_at >  NOW() - INTERVAL '${STALE_MIN} minutes') AS stale
        FROM tech_locations tl
        JOIN users u ON u.id = tl.user_id AND u.account_id = $1
        WHERE tl.account_id         = $1
          AND u.is_available        = TRUE
          AND u.field_work_eligible = TRUE
          AND u.dispatch_visible    = TRUE
          AND tl.updated_at         > NOW() - INTERVAL '${STALE_MIN} minutes'
      `, [accountId]),

      // Active jobs — date-scoped to the requested date in tenant timezone.
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'in_progress')  AS in_progress,
          COUNT(*) FILTER (WHERE status = 'en_route')     AS en_route,
          COUNT(*) FILTER (WHERE status = 'arrived')      AS arrived,
          COUNT(*) FILTER (WHERE status = 'paused')       AS paused,
          COUNT(*) FILTER (WHERE status IN (
            'awaiting_client','awaiting_parts',
            'partially_completed','ready_for_inspection'
          )) AS other_active
        FROM jobs
        WHERE account_id = $1
          AND status = ANY($2::text[])
          AND (scheduled_at AT TIME ZONE $3)::date = ${dateSql}
      `, [accountId, ACTIVE_STATUSES, tz]),

      // Jobs for the requested date (tenant timezone)
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'scheduled') AS scheduled,
          COUNT(*) FILTER (
            WHERE tech_id IS NULL
              AND status NOT IN ('cancelled','no_show','complete','draft','unscheduled')
          ) AS unassigned
        FROM jobs
        WHERE account_id = $1
          AND status NOT IN ('cancelled','no_show','draft','unscheduled')
          AND (scheduled_at AT TIME ZONE $2)::date = ${dateSql}
      `, [accountId, tz]),

      // Completed on the requested date
      pool.query(`
        SELECT COUNT(*) AS total
        FROM jobs
        WHERE account_id  = $1
          AND status       = 'complete'
          AND completed_at IS NOT NULL
          AND (completed_at AT TIME ZONE $2)::date = ${dateSql}
      `, [accountId, tz]),
    ]);

    // Average response — only query when feature is enabled
    let responseRes = { rows: [{ avg_min: null, sample_size: 0 }] };
    if (showAvgResp) {
      responseRes = await pool.query(`
        SELECT
          ROUND(AVG(
            EXTRACT(EPOCH FROM (${endEvent} - ${startEvent})) / 60.0
          ))::int AS avg_min,
          COUNT(*) AS sample_size
        FROM jobs
        WHERE account_id       = $1
          AND completed_at     IS NOT NULL
          AND ${startEvent}    IS NOT NULL
          AND ${endEvent}      IS NOT NULL
          AND ${endEvent}      > ${startEvent}
          AND EXTRACT(EPOCH FROM (${endEvent} - ${startEvent})) / 60.0 < $3
          AND (completed_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date
      `, [accountId, tz, outlierMinutes]);
    }

    // ── Build normalized metric objects ────────────────────────────────────────

    // Live Techs
    const online = parseInt(liveRes.rows[0]?.online ?? 0, 10);
    const stale  = parseInt(liveRes.rows[0]?.stale  ?? 0, 10);
    const total  = online + stale;

    let liveTechsMetric;
    if (!showLive) {
      liveTechsMetric = metric('liveTechnicians', 'Live Techs', 'disabled', null, '—',
        'Feature disabled', { enabled: false, reasonCode: 'FEATURE_DISABLED' });
    } else if (techCount === 0) {
      liveTechsMetric = metric('liveTechnicians', 'Live Techs', 'not_configured', null, '—',
        'No techs on team yet', { configured: false, reasonCode: 'NO_TECHNICIANS',
        configurePath: '/team' });
    } else {
      liveTechsMetric = metric('liveTechnicians', 'Live Techs', 'active', total,
        String(total), `${online} online · ${stale} stale`);
    }

    // Active Jobs
    const activeTotal      = parseInt(activeRes.rows[0]?.total       ?? 0, 10);
    const activeInProgress = parseInt(activeRes.rows[0]?.in_progress ?? 0, 10);
    const activeEnRoute    = parseInt(activeRes.rows[0]?.en_route    ?? 0, 10);
    const activeArrived    = parseInt(activeRes.rows[0]?.arrived     ?? 0, 10);
    const activePaused     = parseInt(activeRes.rows[0]?.paused      ?? 0, 10);
    const activeOther      = parseInt(activeRes.rows[0]?.other_active ?? 0, 10);

    const activeJobsMetric = !showActive
      ? metric('activeJobs', 'Active Jobs', 'disabled', null, '—', 'Feature disabled',
          { enabled: false, reasonCode: 'FEATURE_DISABLED' })
      : metric('activeJobs', 'Active Jobs', 'active', activeTotal, String(activeTotal),
          `${activeInProgress} in progress`);

    // Today's Jobs (or date-scoped jobs)
    const todayTotal      = parseInt(todayRes.rows[0]?.total      ?? 0, 10);
    const todayUnassigned = parseInt(todayRes.rows[0]?.unassigned ?? 0, 10);
    const todayLabel      = isToday ? "Today's Jobs" : 'Jobs';
    const completedLabel  = isToday ? 'Completed' : 'Completed';

    const todaysJobsMetric = !showToday
      ? metric('todaysJobs', todayLabel, 'disabled', null, '—', 'Feature disabled',
          { enabled: false, reasonCode: 'FEATURE_DISABLED' })
      : metric('todaysJobs', todayLabel, 'active', todayTotal, String(todayTotal),
          todayUnassigned > 0 ? `${todayUnassigned} unassigned` : 'all assigned');

    // Completed on the requested date
    const completedTotal = parseInt(completedRes.rows[0]?.total ?? 0, 10);

    const completedMetric = !showCompleted
      ? metric('completedToday', completedLabel, 'disabled', null, '—', 'Feature disabled',
          { enabled: false, reasonCode: 'FEATURE_DISABLED' })
      : metric('completedToday', completedLabel, 'active', completedTotal, String(completedTotal),
          isToday ? 'today' : dateParam);

    // Average Response
    const sampleSize = parseInt(responseRes.rows[0]?.sample_size ?? 0, 10);
    const avgMin     = sampleSize > 0 ? (parseInt(responseRes.rows[0]?.avg_min ?? 0, 10)) : null;

    let avgRespMetric;
    if (!showAvgResp) {
      avgRespMetric = metric('averageResponse', 'Avg Response', 'disabled', null, '—',
        'Feature disabled', { enabled: false, reasonCode: 'FEATURE_DISABLED' });
    } else if (!respEnabled) {
      avgRespMetric = metric('averageResponse', 'Avg Response', 'not_configured', null, 'Set up',
        'Configure dispatch tracking', {
          configured: false, reasonCode: 'METRIC_NOT_CONFIGURED',
          configurePath: '/settings?tab=dispatch',
        });
    } else if (sampleSize < minSample) {
      avgRespMetric = metric('averageResponse', 'Avg Response', 'no_data', null, '—',
        sampleSize === 0 ? 'No jobs completed today' : `${sampleSize} of ${minSample} needed`, {
          sampleSize, reasonCode: 'NO_VALID_SAMPLES',
        });
    } else {
      // Format minutes as "Xm" or "Xh Ym"
      const displayMin = avgMin ?? 0;
      const displayVal = displayMin >= 60
        ? `${Math.floor(displayMin / 60)}h ${displayMin % 60}m`
        : `${displayMin}m`;
      avgRespMetric = metric('averageResponse', 'Avg Response', 'active', avgMin, displayVal,
        `${sampleSize} job${sampleSize !== 1 ? 's' : ''}`, { sampleSize });
    }

    const metricsOut = [liveTechsMetric, activeJobsMetric, todaysJobsMetric, completedMetric];
    if (showAvgResp) metricsOut.push(avgRespMetric);

    const payload = {
      metrics: metricsOut,
      // Legacy shape preserved for backward-compat during transition
      liveTechnicians:     { total: online + stale, online, stale },
      activeJobs:          { total: activeTotal, inProgress: activeInProgress, enRoute: activeEnRoute, arrived: activeArrived, paused: activePaused, otherActive: activeOther },
      todaysJobs:          { total: todayTotal, unassigned: todayUnassigned },
      completedToday:      { total: completedTotal },
      averageResponseTime: { minutes: avgMin, sampleSize },
      generatedAt: new Date().toISOString(),
      timezone:    tz,
      dateLocal:   dateParam || null,
      isToday:     isToday,
    };
    console.log(JSON.stringify({
      event: 'dispatch.summary', accountId, durationMs: Date.now() - t0,
      dateParam: dateParam || null, metricCount: metricsOut.length,
    }));
    res.json(payload);
  } catch (err) {
    console.error(JSON.stringify({
      event: 'dispatch.summary.error', accountId, durationMs: Date.now() - t0,
      errorCode: err.code || null, error: err.message,
    }));
    res.status(500).json({ error: 'Failed to load dispatch summary.' });
  }
});

/**
 * GET /api/dispatch/schedule
 *
 * Returns today's single-day jobs and multi-day sessions in the tenant timezone.
 * This is the authoritative "today's jobs" source for Dispatch — uses the same
 * timezone-aware date filter as /dispatch/summary, eliminating the browser UTC-date
 * mismatch that was causing Dispatch sidebar counts to diverge from the KPI strip.
 *
 * Query params:
 *   date — optional YYYY-MM-DD in tenant local time (defaults to today in tenant TZ)
 */
router.get('/schedule', requireAuth, async (req, res) => {
  const { accountId } = req;
  const t0 = Date.now();

  try {
    // Resolve tenant timezone and compute today in that timezone server-side
    const tzRes = await pool.query(
      `SELECT COALESCE(bp.timezone, 'UTC') AS tz,
              TO_CHAR(NOW() AT TIME ZONE COALESCE(bp.timezone, 'UTC'), 'YYYY-MM-DD') AS today_local
       FROM accounts a
       LEFT JOIN business_profiles bp ON bp.account_id = a.id
       WHERE a.id = $1`,
      [accountId]
    );
    const tz         = tzRes.rows[0]?.tz         || 'UTC';
    const todayLocal = tzRes.rows[0]?.today_local || new Date().toISOString().split('T')[0];

    const dateLocal = req.query.date || todayLocal;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateLocal)) {
      return res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD.' });
    }

    const [jobsRes, sessionsRes] = await Promise.all([
      // Single-day jobs: same timezone-aware date comparison as /dispatch/summary
      pool.query(
        `SELECT j.*, c.name AS client_name, u.name AS tech_name,
                um.name AS job_manager_name
         FROM jobs j
         JOIN clients c   ON c.id = j.client_id
         LEFT JOIN users u  ON u.id = j.tech_id
         LEFT JOIN users um ON um.id = j.job_manager_id
         WHERE j.account_id = $1
           AND j.is_multi_day IS NOT TRUE
           AND (j.scheduled_at AT TIME ZONE $2)::date = $3::date
         ORDER BY j.scheduled_at`,
        [accountId, tz, dateLocal]
      ),

      // Multi-day sessions for this date
      pool.query(
        `SELECT s.*,
                j.service_type, j.status AS job_status, j.is_multi_day,
                j.client_id, c.name AS client_name,
                u.name AS lead_tech_name,
                (SELECT COUNT(*) FROM job_sessions s2 WHERE s2.job_id = s.job_id) AS total_sessions,
                (SELECT COUNT(*) FROM job_sessions s2 WHERE s2.job_id = s.job_id
                   AND s2.scheduled_date < s.scheduled_date) + 1 AS day_number
         FROM job_sessions s
         JOIN jobs j    ON j.id = s.job_id
         JOIN clients c ON c.id = j.client_id
         LEFT JOIN users u ON u.id = s.lead_tech_id
         WHERE s.account_id = $1
           AND s.scheduled_date = $2
           AND s.status NOT IN ('cancelled')
         ORDER BY s.start_time NULLS LAST`,
        [accountId, dateLocal]
      ),
    ]);

    console.log(JSON.stringify({
      event: 'dispatch.schedule', accountId, durationMs: Date.now() - t0,
      dateLocal, jobCount: jobsRes.rows.length, sessionCount: sessionsRes.rows.length,
    }));
    res.json({
      jobs:        jobsRes.rows,
      sessions:    sessionsRes.rows,
      dateLocal,
      timezone:    tz,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(JSON.stringify({
      event: 'dispatch.schedule.error', accountId, durationMs: Date.now() - t0,
      errorCode: err.code || null, error: err.message,
    }));
    res.status(500).json({ error: 'Failed to load dispatch schedule.' });
  }
});

// ── Feature flag defaults — all fully-implemented features are on by default ──
// Per-tenant overrides stored in dispatch_settings.feature_flags (JSONB).
const PHASE1_DEFAULTS = {
  dispatch_drag_assignment:    true,
  dispatch_conflict_engine:    true,
  dispatch_workload_balancing: true,
};
const PHASE2_DEFAULTS = {
  dispatch_route_sequencing: true,
  dispatch_service_areas:    true,
  dispatch_emergency_mode:   true,
};
const PHASE3_DEFAULTS = {
  dispatch_delay_prediction:    true,
  dispatch_quick_communications: true,
  dispatch_activity_timeline:   true,
};
const ALL_FLAG_DEFAULTS = {
  ...PHASE1_DEFAULTS,
  ...PHASE2_DEFAULTS,
  ...PHASE3_DEFAULTS,
  dispatch_predictive_operations_foundation: true,
};

/**
 * GET /api/dispatch/feature-flags
 * Returns the merged flag state for the tenant: defaults + per-tenant overrides.
 */
router.get('/feature-flags', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(feature_flags, '{}') AS feature_flags
       FROM dispatch_settings WHERE account_id = $1`,
      [req.accountId]
    );
    const overrides = rows[0]?.feature_flags || {};
    const smsProviderConfigured = !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER &&
      process.env.TWILIO_ACCOUNT_SID !== 'AC'
    );
    res.json({ ...ALL_FLAG_DEFAULTS, ...overrides, smsProviderConfigured });
  } catch (err) {
    console.error(JSON.stringify({ event: 'dispatch.feature-flags.error', error: err.message }));
    res.status(500).json({ error: 'Failed to load feature flags.' });
  }
});

/**
 * POST /api/dispatch/assignments/validate
 * Validate a proposed assignment without mutating anything.
 * Body: { jobId, techId, isEmergency? }
 * Requires owner or manager role.
 */
router.post('/assignments/validate', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { jobId, techId, isEmergency = false } = req.body;
  if (!jobId || !techId) {
    return res.status(400).json({ error: 'jobId and techId are required.' });
  }
  try {
    const result = await validateAssignment({
      accountId:          req.accountId,
      jobId,
      techId,
      requestedByUserId:  req.userId,
      isEmergency,
    });
    res.json(result);
  } catch (err) {
    console.error(JSON.stringify({ event: 'dispatch.assign.validate.error', error: err.message }));
    res.status(500).json({ error: 'Validation failed.' });
  }
});

/**
 * POST /api/dispatch/assignments
 * Assign a job to a technician after server-side validation.
 * Body: { jobId, techId, overrideWarnings?, overrideReason?, isEmergency? }
 * Requires owner or manager role.
 */
router.post('/assignments', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { jobId, techId, overrideWarnings = false, overrideReason, isEmergency = false } = req.body;
  if (!jobId || !techId) {
    return res.status(400).json({ error: 'jobId and techId are required.' });
  }

  const validation = await validateAssignment({
    accountId:         req.accountId,
    jobId,
    techId,
    requestedByUserId: req.userId,
    isEmergency,
  });

  if (!validation.allowed) {
    // Record blocked attempt for audit trail — non-fatal
    recordActivity({
      accountId: req.accountId, jobId, techId,
      eventType: 'assignment.blocked',
      actor: { id: req.userId, name: null, type: 'user' },
      summary: `Assignment blocked — ${validation.blockingIssues[0]?.message || 'validation failed'}`,
      metadata: { blockingIssues: validation.blockingIssues, assignmentState: validation.assignmentState },
      source: 'domain',
    });
    return res.status(422).json({
      error:           'Assignment blocked by validation.',
      assignmentState: validation.assignmentState,
      blockingIssues:  validation.blockingIssues,
      warnings:        validation.warnings,
    });
  }

  if (validation.warnings.length > 0 && !overrideWarnings) {
    return res.status(422).json({
      error:            'Assignment has warnings requiring explicit confirmation.',
      requiresConfirm:  true,
      warnings:         validation.warnings,
      informational:    validation.informational,
      workloadImpact:   validation.workloadImpact,
      scheduleImpact:   validation.scheduleImpact,
    });
  }

  // ── Fetch previous tech for audit ─────────────────────────────────────────
  const { rows: [prevJob] } = await pool.query(
    `SELECT tech_id FROM jobs WHERE id = $1 AND account_id = $2`,
    [jobId, req.accountId]
  );
  const previousTechId = prevJob?.tech_id || null;

  // ── Persist assignment ────────────────────────────────────────────────────
  const { rows: [updatedJob] } = await pool.query(
    `UPDATE jobs
     SET tech_id    = $1,
         updated_at = NOW()
     WHERE id = $2 AND account_id = $3
     RETURNING *`,
    [techId, jobId, req.accountId]
  );
  if (!updatedJob) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  // ── Audit log ─────────────────────────────────────────────────────────────
  const auditAction = previousTechId ? 'dispatch.job.reassigned' : 'dispatch.job.assigned';
  await audit.log(req.accountId, req.userId, auditAction, 'job', jobId, {
    previousTechId,
    newTechId: techId,
    overrideWarnings,
    overrideReason: overrideWarnings ? overrideReason : undefined,
    isEmergency,
    warningCount: validation.warnings.length,
    workloadImpact: validation.workloadImpact,
  }, req.ip);

  // ── Activity log ──────────────────────────────────────────────────────────
  const [actorRes, techNameRes] = await Promise.all([
    pool.query(`SELECT name FROM users WHERE id = $1`, [req.userId]).catch(() => ({ rows: [{}] })),
    pool.query(`SELECT name FROM users WHERE id = $1`, [techId]).catch(() => ({ rows: [{}] })),
  ]);
  const actor    = actorRes.rows[0];
  const techName = techNameRes.rows[0]?.name || 'Technician';

  const assignEvt = previousTechId ? 'job.reassigned' : 'job.assigned';
  recordActivity({
    accountId: req.accountId, jobId, techId,
    eventType: assignEvt,
    actor: { id: req.userId, name: actor?.name || null, type: 'user' },
    summary: previousTechId ? 'Technician reassigned' : 'Technician assigned',
    metadata: { previousTechId, newTechId: techId, isEmergency },
    source: 'domain',
  });

  // Communication event — internal queue, no Twilio required
  const commType = previousTechId ? 'AssignmentChanged' : 'AssignmentCreated';
  recordActivity({
    accountId: req.accountId, jobId, techId,
    eventType: 'job.communication_sent',
    actor: { id: req.userId, name: actor?.name || null, type: 'system' },
    summary: previousTechId
      ? `Assignment update queued for ${techName}`
      : `Assignment notification queued for ${techName}`,
    metadata: { type: commType, recipientId: techId, recipientName: techName, queued: true, providerConfigured: false },
    source: 'domain',
  });

  res.json({
    job:             updatedJob,
    validation,
    assigned:        true,
    previousTechId,
    assignmentState: validation.assignmentState,
  });
});

/**
 * GET /api/dispatch/workloads
 * Returns workload summary for all field-eligible, dispatch-visible technicians.
 * Query params: date (YYYY-MM-DD, defaults to today in tenant TZ)
 */
router.get('/workloads', requireAuth, async (req, res) => {
  const t0 = Date.now();
  try {
    const tzRes = await pool.query(
      `SELECT COALESCE(bp.timezone, 'UTC') AS tz,
              TO_CHAR(NOW() AT TIME ZONE COALESCE(bp.timezone, 'UTC'), 'YYYY-MM-DD') AS today_local
       FROM accounts a
       LEFT JOIN business_profiles bp ON bp.account_id = a.id
       WHERE a.id = $1`,
      [req.accountId]
    );
    const tz         = tzRes.rows[0]?.tz         || 'UTC';
    const todayLocal = tzRes.rows[0]?.today_local || new Date().toISOString().split('T')[0];
    const dateLocal  = (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date))
      ? req.query.date : todayLocal;

    const workloads = await getWorkloads({ accountId: req.accountId, dateLocal, timezone: tz });

    console.log(JSON.stringify({
      event: 'dispatch.workloads', accountId: req.accountId,
      durationMs: Date.now() - t0, techCount: workloads.length, dateLocal,
    }));
    res.json({ workloads, dateLocal, timezone: tz, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error(JSON.stringify({
      event: 'dispatch.workloads.error', accountId: req.accountId,
      durationMs: Date.now() - t0, error: err.message,
    }));
    res.status(500).json({ error: 'Failed to load workloads.' });
  }
});

/**
 * GET /api/dispatch/jobs/:jobId/activity
 * Returns the dispatch activity timeline for a specific job.
 * Supports: ?category=emergency|job|location|communication|dispatch
 *           ?cursor=<iso-timestamp>  (newest-first cursor pagination)
 *           ?limit=N (max 100)
 */
router.get('/jobs/:jobId/activity', requireAuth, async (req, res) => {
  const t0 = Date.now();
  try {
    const limit    = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const category = req.query.category || null;
    const cursor   = req.query.cursor   || null;

    const params = [req.accountId, req.params.jobId];
    const conds  = ['dal.account_id = $1', 'dal.job_id = $2'];
    let   pi     = 3;

    if (category) { conds.push(`dal.category = $${pi++}`); params.push(category); }
    if (cursor)   { conds.push(`COALESCE(dal.occurred_at, dal.created_at) < $${pi++}`); params.push(new Date(cursor)); }
    params.push(limit + 1); // fetch one extra to detect next page

    const { rows } = await pool.query(
      `SELECT
         dal.id, dal.event_type, dal.category, dal.source,
         COALESCE(dal.actor_name, u.name) AS actor_name,
         dal.actor_type, dal.summary,
         dal.details AS metadata,
         COALESCE(dal.occurred_at, dal.created_at) AS occurred_at,
         dal.created_at
       FROM dispatch_activity_log dal
       LEFT JOIN users u ON u.id = dal.actor_id
       WHERE ${conds.join(' AND ')}
       ORDER BY COALESCE(dal.occurred_at, dal.created_at) DESC
       LIMIT $${pi}`,
      params,
    );

    const hasMore   = rows.length > limit;
    const items     = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor= hasMore ? items[items.length - 1].occurred_at?.toISOString() : null;

    console.log(JSON.stringify({
      event: 'dispatch.job.activity', accountId: req.accountId,
      jobId: req.params.jobId, count: items.length, durationMs: Date.now() - t0,
    }));
    res.json({ items, nextCursor, jobId: req.params.jobId, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error(JSON.stringify({ event: 'dispatch.job.activity.error', error: err.message }));
    res.status(500).json({ error: 'Failed to load activity.' });
  }
});

/**
 * POST /api/dispatch/jobs/:jobId/activity/backfill
 * Idempotent backfill for a single job. Requires owner or manager.
 */
router.post('/jobs/:jobId/activity/backfill', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows: [job] } = await pool.query(
      `SELECT id FROM jobs WHERE id = $1 AND account_id = $2`,
      [req.params.jobId, req.accountId],
    );
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    const { backfillJobHistory } = require('../services/jobActivityService');
    // Pass a fake per-job filter by accountId — backfill will include all jobs for account
    // but idempotency keys prevent duplication. For single-job backfill, run account-scoped.
    const result = await backfillJobHistory(req.accountId);
    res.json({ ...result, jobId: req.params.jobId });
  } catch (err) {
    res.status(500).json({ error: 'Backfill failed.' });
  }
});

/**
 * POST /api/dispatch/activity/backfill
 * Idempotent full-account backfill. Requires owner.
 */
router.post('/activity/backfill', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const { backfillJobHistory } = require('../services/jobActivityService');
    const result = await backfillJobHistory(req.accountId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Backfill failed.' });
  }
});

// ── Phase 2: Route sequencing ─────────────────────────────────────────────────

/**
 * GET /api/dispatch/technicians/:techId/route
 * Returns the technician's jobs for the day in route_order sequence.
 * Query params: date (YYYY-MM-DD, defaults to today in tenant TZ)
 */
router.get('/technicians/:techId/route', requireAuth, async (req, res) => {
  try {
    const tzRes = await pool.query(
      `SELECT COALESCE(bp.timezone, 'UTC') AS tz,
              TO_CHAR(NOW() AT TIME ZONE COALESCE(bp.timezone, 'UTC'), 'YYYY-MM-DD') AS today_local
       FROM accounts a
       LEFT JOIN business_profiles bp ON bp.account_id = a.id
       WHERE a.id = $1`,
      [req.accountId]
    );
    const tz        = tzRes.rows[0]?.tz         || 'UTC';
    const todayLocal = tzRes.rows[0]?.today_local || new Date().toISOString().split('T')[0];
    const dateLocal  = (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date))
      ? req.query.date : todayLocal;

    const route = await getRouteForTech({
      accountId: req.accountId,
      techId:    req.params.techId,
      dateLocal,
      timezone:  tz,
    });
    res.json({ ...route, timezone: tz });
  } catch (err) {
    console.error(JSON.stringify({ event: 'dispatch.route.get.error', error: err.message }));
    res.status(500).json({ error: 'Failed to load route.' });
  }
});

/**
 * PATCH /api/dispatch/technicians/:techId/route
 * Saves the route_order for the technician's jobs.
 * Body: { jobIds: string[] } — ordered array of job UUIDs
 * Requires owner or manager role.
 */
router.patch('/technicians/:techId/route', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { jobIds } = req.body;
  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    return res.status(400).json({ error: 'jobIds must be a non-empty array.' });
  }
  try {
    const updated = await saveRoute({
      accountId: req.accountId,
      techId:    req.params.techId,
      jobIds,
    });

    await audit.log(req.accountId, req.userId, 'dispatch.route.saved', 'tech', req.params.techId, {
      jobCount: updated, jobIds,
    }, req.ip);

    // Return refreshed route
    const tzRes = await pool.query(
      `SELECT COALESCE(bp.timezone, 'UTC') AS tz,
              TO_CHAR(NOW() AT TIME ZONE COALESCE(bp.timezone, 'UTC'), 'YYYY-MM-DD') AS today_local
       FROM accounts a LEFT JOIN business_profiles bp ON bp.account_id = a.id WHERE a.id = $1`,
      [req.accountId]
    );
    const tz        = tzRes.rows[0]?.tz || 'UTC';
    const todayLocal = tzRes.rows[0]?.today_local || new Date().toISOString().split('T')[0];
    const dateLocal  = req.query.date || todayLocal;
    const route = await getRouteForTech({ accountId: req.accountId, techId: req.params.techId, dateLocal, timezone: tz });
    res.json({ ...route, updated, timezone: tz });
  } catch (err) {
    console.error(JSON.stringify({ event: 'dispatch.route.save.error', error: err.message }));
    res.status(500).json({ error: 'Failed to save route.' });
  }
});

// ── Phase 2: Service areas ────────────────────────────────────────────────────

/**
 * GET /api/dispatch/service-areas
 * Lists all active service areas for the account.
 */
router.get('/service-areas', requireAuth, async (req, res) => {
  try {
    const areas = await getServiceAreas({ accountId: req.accountId });
    res.json({ areas });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load service areas.' });
  }
});

/**
 * POST /api/dispatch/service-areas
 * Creates a new service area.
 * Body: { techId?, name?, type?, centerLat, centerLng, radiusKm }
 * Requires owner or manager role.
 */
router.post('/service-areas', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { techId, name, type, centerLat, centerLng, radiusKm } = req.body;
  if (!centerLat || !centerLng) {
    return res.status(400).json({ error: 'centerLat and centerLng are required.' });
  }
  try {
    const area = await createServiceArea({
      accountId: req.accountId, techId, name, type, centerLat, centerLng, radiusKm,
    });
    await audit.log(req.accountId, req.userId, 'dispatch.service_area.created', 'service_area', area.id, {
      techId, name, type, radiusKm,
    }, req.ip);
    res.status(201).json({ area });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create service area.' });
  }
});

/**
 * PATCH /api/dispatch/service-areas/:id
 * Updates a service area.
 * Requires owner or manager role.
 */
router.patch('/service-areas/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { name, centerLat, centerLng, radiusKm, isActive } = req.body;
  try {
    const area = await updateServiceArea({
      accountId: req.accountId, areaId: req.params.id,
      name, centerLat, centerLng, radiusKm, isActive,
    });
    if (!area) return res.status(404).json({ error: 'Service area not found.' });
    res.json({ area });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update service area.' });
  }
});

/**
 * DELETE /api/dispatch/service-areas/:id
 * Deletes a service area.
 * Requires owner or manager role.
 */
router.delete('/service-areas/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const deleted = await deleteServiceArea({ accountId: req.accountId, areaId: req.params.id });
    if (!deleted) return res.status(404).json({ error: 'Service area not found.' });
    await audit.log(req.accountId, req.userId, 'dispatch.service_area.deleted', 'service_area', req.params.id, {}, req.ip);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete service area.' });
  }
});

// ── Phase 2: Emergency dispatch mode ─────────────────────────────────────────

/**
 * GET /api/dispatch/emergency-mode
 * Returns the current emergency dispatch mode state for the account.
 */
router.get('/emergency-mode', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT emergency_dispatch_active, emergency_activated_at, emergency_activated_by
       FROM dispatch_settings WHERE account_id = $1`,
      [req.accountId]
    );
    const row = rows[0] || {};
    res.json({
      active:      row.emergency_dispatch_active ?? false,
      activatedAt: row.emergency_activated_at    ?? null,
      activatedBy: row.emergency_activated_by    ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load emergency mode.' });
  }
});

/**
 * PATCH /api/dispatch/emergency-mode
 * Toggles emergency dispatch mode on or off.
 * Body: { active: boolean }
 * Requires owner or manager role.
 */
router.patch('/emergency-mode', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { active } = req.body;
  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: 'active (boolean) is required.' });
  }
  try {
    await pool.query(
      `INSERT INTO dispatch_settings (account_id, emergency_dispatch_active, emergency_activated_at, emergency_activated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (account_id) DO UPDATE
         SET emergency_dispatch_active = $2,
             emergency_activated_at   = $3,
             emergency_activated_by   = $4`,
      [req.accountId, active, active ? new Date() : null, active ? req.userId : null]
    );
    await audit.log(req.accountId, req.userId,
      active ? 'dispatch.emergency_mode.activated' : 'dispatch.emergency_mode.deactivated',
      'account', req.accountId, {}, req.ip
    );
    res.json({ active, activatedAt: active ? new Date().toISOString() : null });
  } catch (err) {
    console.error(JSON.stringify({ event: 'dispatch.emergency-mode.error', error: err.message }));
    res.status(500).json({ error: 'Failed to update emergency mode.' });
  }
});

// ── Phase 3: Delay predictions ────────────────────────────────────────────────

/**
 * GET /api/dispatch/delay-predictions
 * Returns delay status for all field-eligible techs with GPS fixes and upcoming jobs.
 * Query params: date (YYYY-MM-DD, defaults to today in tenant TZ)
 */
router.get('/delay-predictions', requireAuth, async (req, res) => {
  const t0 = Date.now();
  try {
    const tzRes = await pool.query(
      `SELECT COALESCE(bp.timezone, 'UTC') AS tz,
              TO_CHAR(NOW() AT TIME ZONE COALESCE(bp.timezone, 'UTC'), 'YYYY-MM-DD') AS today_local
       FROM accounts a LEFT JOIN business_profiles bp ON bp.account_id = a.id WHERE a.id = $1`,
      [req.accountId]
    );
    const tz        = tzRes.rows[0]?.tz         || 'UTC';
    const todayLocal = tzRes.rows[0]?.today_local || new Date().toISOString().split('T')[0];
    const dateLocal  = (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date))
      ? req.query.date : todayLocal;

    const predictions = await predictDelays({ accountId: req.accountId, dateLocal, timezone: tz });
    console.log(JSON.stringify({
      event: 'dispatch.delay-predictions', accountId: req.accountId,
      durationMs: Date.now() - t0, techCount: predictions.length, dateLocal,
    }));
    res.json({ predictions, dateLocal, timezone: tz, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error(JSON.stringify({ event: 'dispatch.delay-predictions.error', error: err.message }));
    res.status(500).json({ error: 'Failed to compute delay predictions.' });
  }
});

// ── Phase 3: Quick communications ─────────────────────────────────────────────

/**
 * POST /api/dispatch/jobs/:jobId/communicate
 * Sends a quick dispatch communication to client and/or technician.
 * Body: { template, customMessage?, recipient }
 *   template  — 'on_the_way' | 'running_late' | 'job_assigned' | 'job_rescheduled' | 'custom'
 *   recipient — 'client' | 'tech' | 'both'
 * Requires owner or manager role.
 */
router.post('/jobs/:jobId/communicate', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { template, customMessage, recipient } = req.body;
  const VALID_TEMPLATES  = ['on_the_way','running_late','job_assigned','job_rescheduled','custom'];
  const VALID_RECIPIENTS = ['client','tech','both'];

  if (!VALID_TEMPLATES.includes(template)) {
    return res.status(400).json({ error: `template must be one of: ${VALID_TEMPLATES.join(', ')}.` });
  }
  if (!VALID_RECIPIENTS.includes(recipient)) {
    return res.status(400).json({ error: `recipient must be one of: ${VALID_RECIPIENTS.join(', ')}.` });
  }
  if (template === 'custom' && !customMessage?.trim()) {
    return res.status(400).json({ error: 'customMessage is required when template is "custom".' });
  }

  const { rows: [actor] } = await pool.query(`SELECT name FROM users WHERE id = $1`, [req.userId])
    .catch(() => ({ rows: [{}] }));

  try {
    const result = await sendQuickMessage({
      accountId:     req.accountId,
      jobId:         req.params.jobId,
      actorId:       req.userId,
      actorName:     actor?.name || null,
      template, customMessage, recipient,
    });
    res.json(result);
  } catch (err) {
    console.error(JSON.stringify({ event: 'dispatch.communicate.error', error: err.message }));
    res.status(err.message === 'Job not found.' ? 404 : 500).json({ error: err.message });
  }
});

// ── Phase 3: Tech-level activity timeline ─────────────────────────────────────

/**
 * GET /api/dispatch/technicians/:techId/activity
 * Returns the dispatch activity timeline for a specific technician.
 * Query params: limit (default 50), date (YYYY-MM-DD scope filter)
 */
router.get('/technicians/:techId/activity', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    let dateFilter = '';
    const params = [req.accountId, req.params.techId, limit];

    if (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
      dateFilter = `AND dal.created_at::date = $4`;
      params.push(req.query.date);
    }

    const { rows } = await pool.query(
      `SELECT
         dal.id, dal.event_type, dal.category, dal.source,
         COALESCE(dal.actor_name, u.name) AS actor_name,
         dal.actor_type, dal.summary,
         dal.details AS metadata,
         COALESCE(dal.occurred_at, dal.created_at) AS occurred_at,
         dal.created_at
       FROM dispatch_activity_log dal
       LEFT JOIN users u ON u.id = dal.actor_id
       WHERE dal.account_id = $1 AND dal.tech_id = $2
       ${dateFilter}
       ORDER BY COALESCE(dal.occurred_at, dal.created_at) DESC
       LIMIT $3`,
      params
    );
    res.json({ items: rows, events: rows, techId: req.params.techId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load activity.' });
  }
});

// ── Predictive Operations Foundation ─────────────────────────────────────────

/**
 * GET /api/dispatch/predictive-operations/readiness
 * Returns data readiness state for predictive analytics features.
 */
router.get('/predictive-operations/readiness', requireAuth, async (req, res) => {
  try {
    const readiness = await predictiveOps.getReadiness(req.accountId);
    res.json(readiness);
  } catch (err) {
    console.error(JSON.stringify({ event: 'dispatch.predictive-ops.readiness.error', error: err.message }));
    res.status(500).json({ error: 'Failed to load predictive readiness.' });
  }
});

/**
 * POST /api/dispatch/predictive-operations/recalculate
 * Recalculates and caches readiness state for the account.
 * Requires owner or manager role.
 */
router.post('/predictive-operations/recalculate', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const readiness = await predictiveOps.recalculate(req.accountId);
    res.json(readiness);
  } catch (err) {
    console.error(JSON.stringify({ event: 'dispatch.predictive-ops.recalculate.error', error: err.message }));
    res.status(500).json({ error: 'Failed to recalculate predictive readiness.' });
  }
});

/**
 * GET /api/dispatch/predictive-operations/data-quality
 * Returns data quality issues and completeness metrics.
 */
router.get('/predictive-operations/data-quality', requireAuth, async (req, res) => {
  try {
    const quality = await predictiveOps.getDataQuality(req.accountId);
    res.json(quality);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load data quality.' });
  }
});

/**
 * GET /api/dispatch/predictive-operations/capabilities
 * Returns per-capability readiness state.
 */
router.get('/predictive-operations/capabilities', requireAuth, async (req, res) => {
  try {
    const caps = await predictiveOps.getCapabilities(req.accountId);
    res.json(caps);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load capabilities.' });
  }
});

// ── GET /api/dispatch/crews — list saved crews ────────────────────────────────
router.get('/crews', requireAuth, async (req, res) => {
  try {
    const crews = await getCrews(req.accountId);
    res.json(crews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/dispatch/crews — create saved crew ──────────────────────────────
router.post('/crews', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { name, members = [] } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const crew = await createCrew(req.accountId, name.trim(), members);
    res.status(201).json(crew);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
