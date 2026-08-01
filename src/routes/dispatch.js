const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

// GPS freshness thresholds (must stay in sync with client/src/maps/dispatchCoords.js)
const LIVE_MIN  = 2;   // < 2 min  → online (Live GPS marker)
const STALE_MIN = 15;  // 2–15 min → stale; > 15 min → offline

// Job statuses considered "active" for dispatch purposes
const ACTIVE_STATUSES = [
  'in_progress', 'paused', 'awaiting_client', 'awaiting_parts',
  'partially_completed', 'ready_for_inspection',
];

/**
 * GET /api/dispatch/summary
 *
 * Returns tenant-scoped, timezone-aware KPI metrics for the Dispatch header strip.
 *
 * Average Response Time definition:
 *   Mean( checkin_at - scheduled_at ) in minutes, for jobs completed today where
 *   the tech checked in after the scheduled start. Uses checkin_at as the best
 *   available proxy for "technician began responding to the job".
 *
 * Response shape:
 *   { liveTechnicians, activeJobs, todaysJobs, completedToday, averageResponseTime,
 *     generatedAt, timezone }
 */
router.get('/summary', requireAuth, async (req, res) => {
  const { accountId } = req;

  try {
    const tzRow = await pool.query(
      `SELECT COALESCE(bp.timezone, 'UTC') AS tz
       FROM accounts a
       LEFT JOIN business_profiles bp ON bp.account_id = a.id
       WHERE a.id = $1`,
      [accountId]
    );
    const tz = tzRow.rows[0]?.tz || 'UTC';

    const [liveRes, activeRes, todayRes, completedRes, responseRes] = await Promise.all([

      // Live technicians: split into online (< LIVE_MIN) and stale (LIVE_MIN–STALE_MIN)
      pool.query(`
        SELECT
          COUNT(*) FILTER (
            WHERE tl.updated_at > NOW() - INTERVAL '2 minutes'
          ) AS online,
          COUNT(*) FILTER (
            WHERE tl.updated_at <= NOW() - INTERVAL '2 minutes'
              AND tl.updated_at >  NOW() - INTERVAL '15 minutes'
          ) AS stale
        FROM tech_locations tl
        JOIN users u ON u.id = tl.user_id AND u.account_id = $1
        WHERE tl.account_id   = $1
          AND u.is_available  = true
          AND tl.updated_at   > NOW() - INTERVAL '15 minutes'
      `, [accountId]),

      // Active jobs: all currently operational statuses
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
          COUNT(*) FILTER (WHERE status IN (
            'paused','awaiting_client','awaiting_parts',
            'partially_completed','ready_for_inspection'
          )) AS paused
        FROM jobs
        WHERE account_id = $1
          AND status = ANY($2::text[])
      `, [accountId, ACTIVE_STATUSES]),

      // Today's jobs (tenant timezone; exclude cancelled / no_show / draft)
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
          AND (scheduled_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date
      `, [accountId, tz]),

      // Completed today (uses actual completed_at timestamp)
      pool.query(`
        SELECT COUNT(*) AS total
        FROM jobs
        WHERE account_id  = $1
          AND status       = 'complete'
          AND completed_at IS NOT NULL
          AND (completed_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date
      `, [accountId, tz]),

      // Average response time: scheduled_at → checkin_at (minutes), for jobs completed today
      pool.query(`
        SELECT
          ROUND(AVG(
            EXTRACT(EPOCH FROM (checkin_at - scheduled_at)) / 60.0
          ))::int AS avg_min,
          COUNT(*) AS sample_size
        FROM jobs
        WHERE account_id  = $1
          AND completed_at IS NOT NULL
          AND checkin_at   IS NOT NULL
          AND checkin_at   > scheduled_at
          AND (completed_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date
      `, [accountId, tz]),
    ]);

    const online     = parseInt(liveRes.rows[0]?.online      ?? 0, 10);
    const stale      = parseInt(liveRes.rows[0]?.stale       ?? 0, 10);
    const sampleSize = parseInt(responseRes.rows[0]?.sample_size ?? 0, 10);

    res.json({
      liveTechnicians: {
        total:  online + stale,
        online,
        stale,
      },
      activeJobs: {
        total:      parseInt(activeRes.rows[0]?.total       ?? 0, 10),
        inProgress: parseInt(activeRes.rows[0]?.in_progress ?? 0, 10),
        paused:     parseInt(activeRes.rows[0]?.paused      ?? 0, 10),
      },
      todaysJobs: {
        total:      parseInt(todayRes.rows[0]?.total      ?? 0, 10),
        scheduled:  parseInt(todayRes.rows[0]?.scheduled  ?? 0, 10),
        unassigned: parseInt(todayRes.rows[0]?.unassigned ?? 0, 10),
      },
      completedToday: {
        total: parseInt(completedRes.rows[0]?.total ?? 0, 10),
      },
      averageResponseTime: {
        minutes:    sampleSize > 0 ? (responseRes.rows[0]?.avg_min ?? null) : null,
        sampleSize,
      },
      generatedAt: new Date().toISOString(),
      timezone:    tz,
    });
  } catch (err) {
    console.error('[dispatch/summary]', err.message);
    res.status(500).json({ error: 'Failed to load dispatch summary.' });
  }
});

module.exports = router;
