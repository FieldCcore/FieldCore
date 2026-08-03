const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

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

module.exports = router;
