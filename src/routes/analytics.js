const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

// GET /api/analytics/dashboard — all stats for the main dashboard
router.get('/dashboard', requireAuth, async (req, res) => {
  const accountId = req.accountId;
  try {
    const [todayJobs, weekRevenue, mtdRevenue, activeJobs, pendingInvoices, pendingDeposits, teamStats, weekBars] = await Promise.all([

      // Today's jobs with client + tech name
      pool.query(
        `SELECT j.id, j.service_type, j.status, j.amount, j.scheduled_at, j.notes,
                c.name AS client_name, u.name AS tech_name
         FROM jobs j
         JOIN clients c ON c.id = j.client_id
         LEFT JOIN users u ON u.id = j.tech_id
         WHERE j.account_id = $1
           AND j.scheduled_at::date = CURRENT_DATE
         ORDER BY j.scheduled_at`,
        [accountId]
      ),

      // Revenue this week (complete jobs Mon–Sun)
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM jobs
         WHERE account_id = $1
           AND status = 'complete'
           AND scheduled_at >= date_trunc('week', CURRENT_DATE)`,
        [accountId]
      ),

      // Revenue month to date
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM jobs
         WHERE account_id = $1
           AND status = 'complete'
           AND scheduled_at >= date_trunc('month', CURRENT_DATE)`,
        [accountId]
      ),

      // Active jobs right now
      pool.query(
        `SELECT count(*) FROM jobs
         WHERE account_id = $1 AND status = 'in_progress'`,
        [accountId]
      ),

      // Pending invoice amount
      pool.query(
        `SELECT count(*), COALESCE(SUM(amount), 0) AS total
         FROM invoices
         WHERE account_id = $1 AND status = 'pending'`,
        [accountId]
      ),

      // Pending deposits
      pool.query(
        `SELECT d.id, d.amount, d.status, d.expires_at,
                c.name AS client_name, j.service_type
         FROM deposits d
         JOIN clients c ON c.id = d.client_id
         JOIN jobs j ON j.id = d.job_id
         WHERE d.account_id = $1 AND d.status = 'pending'
         ORDER BY d.expires_at ASC`,
        [accountId]
      ),

      // Techs on the team
      pool.query(
        `SELECT u.id, u.name, u.role,
                COUNT(j.id) FILTER (WHERE j.status = 'in_progress') AS active_jobs
         FROM users u
         LEFT JOIN jobs j ON j.tech_id = u.id AND j.scheduled_at::date = CURRENT_DATE
         WHERE u.account_id = $1 AND u.role = 'tech'
         GROUP BY u.id`,
        [accountId]
      ),

      // Revenue per day this week (7 bars)
      pool.query(
        `SELECT
           generate_series AS day,
           COALESCE(SUM(j.amount), 0) AS revenue,
           COUNT(j.id) AS jobs
         FROM generate_series(
           date_trunc('week', CURRENT_DATE),
           date_trunc('week', CURRENT_DATE) + INTERVAL '6 days',
           INTERVAL '1 day'
         ) AS generate_series
         LEFT JOIN jobs j
           ON j.scheduled_at::date = generate_series::date
           AND j.account_id = $1
           AND j.status = 'complete'
         GROUP BY generate_series
         ORDER BY generate_series`,
        [accountId]
      ),
    ]);

    res.json({
      todayJobs:       todayJobs.rows,
      weekRevenue:     parseFloat(weekRevenue.rows[0].total),
      mtdRevenue:      parseFloat(mtdRevenue.rows[0].total),
      activeJobs:      parseInt(activeJobs.rows[0].count),
      pendingInvoices: { count: parseInt(pendingInvoices.rows[0].count), total: parseFloat(pendingInvoices.rows[0].total) },
      pendingDeposits: pendingDeposits.rows,
      team:            teamStats.rows,
      weekBars:        weekBars.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/revenue — weekly chart + by-service + monthly summary
router.get('/revenue', requireAuth, async (req, res) => {
  const accountId = req.accountId;
  try {
    const [weekly, byService, monthly] = await Promise.all([

      // Last 8 weeks
      pool.query(
        `SELECT
           date_trunc('week', w)::date AS week_start,
           COALESCE(SUM(j.amount), 0) AS revenue,
           COUNT(j.id) AS jobs
         FROM generate_series(
           date_trunc('week', CURRENT_DATE) - INTERVAL '7 weeks',
           date_trunc('week', CURRENT_DATE),
           INTERVAL '1 week'
         ) AS w
         LEFT JOIN jobs j
           ON date_trunc('week', j.scheduled_at) = date_trunc('week', w)
           AND j.account_id = $1
           AND j.status = 'complete'
         GROUP BY week_start
         ORDER BY week_start`,
        [accountId]
      ),

      // Revenue by service type (all time)
      pool.query(
        `SELECT
           service_type,
           COUNT(*) AS jobs,
           COALESCE(SUM(amount), 0) AS revenue,
           COALESCE(AVG(amount), 0) AS avg_amount
         FROM jobs
         WHERE account_id = $1 AND status = 'complete' AND amount IS NOT NULL
         GROUP BY service_type
         ORDER BY revenue DESC`,
        [accountId]
      ),

      // Last 6 months
      pool.query(
        `SELECT
           date_trunc('month', m)::date AS month_start,
           COALESCE(SUM(j.amount), 0) AS revenue,
           COUNT(j.id) AS jobs
         FROM generate_series(
           date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
           date_trunc('month', CURRENT_DATE),
           INTERVAL '1 month'
         ) AS m
         LEFT JOIN jobs j
           ON date_trunc('month', j.scheduled_at) = date_trunc('month', m)
           AND j.account_id = $1
           AND j.status = 'complete'
         GROUP BY month_start
         ORDER BY month_start`,
        [accountId]
      ),
    ]);

    res.json({
      weekly:    weekly.rows,
      byService: byService.rows,
      monthly:   monthly.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/team — per-tech stats for the current week
router.get('/team', requireAuth, async (req, res) => {
  const accountId = req.accountId;
  try {
    const { rows } = await pool.query(
      `SELECT
         u.id, u.name, u.role, u.phone,
         COUNT(j.id)                                                   AS jobs,
         COALESCE(SUM(j.amount), 0)                                    AS revenue,
         COALESCE(SUM(j.amount) * 0.05, 0)                             AS commission,
         COUNT(j.id) FILTER (WHERE j.status = 'complete')              AS completed,
         COUNT(j.id) FILTER (WHERE j.status = 'in_progress')           AS active
       FROM users u
       LEFT JOIN jobs j
         ON j.tech_id = u.id
         AND j.account_id = $1
         AND j.scheduled_at >= date_trunc('week', CURRENT_DATE)
       WHERE u.account_id = $1 AND u.role = 'tech'
       GROUP BY u.id
       ORDER BY revenue DESC`,
      [accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
