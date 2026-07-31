const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

// GET /api/dispatch/summary
// Returns KPI metrics for the Dispatch command-center header strip.
// All counts are tenant-scoped to req.accountId and timezone-aware.
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

    const [liveRes, activeRes, todayRes, completedRes, avgRes, unassignedRes] =
      await Promise.all([

        // Live: GPS active within 15 min AND tech is_available
        pool.query(`
          SELECT COUNT(DISTINCT tl.user_id) AS count
          FROM tech_locations tl
          JOIN users u ON u.id = tl.user_id AND u.account_id = $1
          WHERE tl.account_id = $1
            AND u.is_available  = true
            AND tl.updated_at   > NOW() - INTERVAL '15 minutes'
        `, [accountId]),

        // Active: currently in_progress
        pool.query(`
          SELECT COUNT(*) AS count
          FROM jobs
          WHERE account_id = $1 AND status = 'in_progress'
        `, [accountId]),

        // Today: scheduled today in tenant timezone (exclude cancelled/no-show)
        pool.query(`
          SELECT COUNT(*) AS count
          FROM jobs
          WHERE account_id = $1
            AND status NOT IN ('cancelled', 'no_show')
            AND (scheduled_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date
        `, [accountId, tz]),

        // Completed today
        pool.query(`
          SELECT COUNT(*) AS count
          FROM jobs
          WHERE account_id  = $1
            AND status       = 'complete'
            AND completed_at IS NOT NULL
            AND (completed_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date
        `, [accountId, tz]),

        // Avg response time today: scheduled_at → checkin_at in minutes
        pool.query(`
          SELECT ROUND(AVG(
            EXTRACT(EPOCH FROM (checkin_at - scheduled_at)) / 60.0
          ))::int AS avg_min
          FROM jobs
          WHERE account_id  = $1
            AND completed_at IS NOT NULL
            AND checkin_at   IS NOT NULL
            AND checkin_at   > scheduled_at
            AND (completed_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date
        `, [accountId, tz]),

        // Unassigned: no tech assigned, scheduled today
        pool.query(`
          SELECT COUNT(*) AS count
          FROM jobs
          WHERE account_id = $1
            AND tech_id    IS NULL
            AND status     = 'scheduled'
            AND (scheduled_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date
        `, [accountId, tz]),
      ]);

    res.json({
      liveTechnicians: parseInt(liveRes.rows[0]?.count      ?? 0, 10),
      activeJobs:      parseInt(activeRes.rows[0]?.count    ?? 0, 10),
      todaysJobs:      parseInt(todayRes.rows[0]?.count     ?? 0, 10),
      completedToday:  parseInt(completedRes.rows[0]?.count ?? 0, 10),
      avgResponseMin:  avgRes.rows[0]?.avg_min               ?? null,
      unassignedJobs:  parseInt(unassignedRes.rows[0]?.count ?? 0, 10),
    });
  } catch (err) {
    console.error('[dispatch/summary]', err.message);
    res.status(500).json({ error: 'Failed to load dispatch summary.' });
  }
});

module.exports = router;
