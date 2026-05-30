const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/analytics/dashboard — all stats for the main dashboard
router.get('/dashboard', requireAuth, async (req, res) => {
  const accountId = req.accountId;
  try {
    const [todayJobs, weekRevenue, mtdRevenue, activeJobs, pendingInvoices, pendingDeposits, teamStats, weekBars, recentReviews] = await Promise.all([

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
                COUNT(j.id) FILTER (WHERE j.status = 'in_progress') AS active_jobs,
                COUNT(j.id) FILTER (WHERE j.scheduled_at >= date_trunc('week', CURRENT_DATE)) AS jobs
         FROM users u
         LEFT JOIN jobs j ON j.tech_id = u.id AND j.account_id = $1
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

      // Recent reviews + average rating
      pool.query(
        `SELECT r.rating, r.body, r.created_at, c.name AS client_name, j.service_type
         FROM reviews r
         JOIN clients c ON c.id = r.client_id
         JOIN jobs j ON j.id = r.job_id
         WHERE r.account_id = $1
         ORDER BY r.created_at DESC
         LIMIT 5`,
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
      recentReviews:   recentReviews.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/revenue — weekly chart + by-service + monthly summary
router.get('/revenue', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
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
router.get('/team', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
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

// GET /api/analytics/consolidated — multi-entity rollup (Scale+ only)
router.get('/consolidated', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    // Find all account_ids this user has owner/manager access to
    const memberRes = await pool.query(
      `SELECT DISTINCT am.account_id, a.name AS account_name, a.plan
       FROM account_memberships am
       JOIN accounts a ON a.id = am.account_id
       WHERE am.user_id = $1
       UNION
       SELECT id AS account_id, name AS account_name, plan
       FROM accounts WHERE id = $2`,
      [req.userId, req.accountId]
    );

    const allAccounts = memberRes.rows;

    // Only run consolidated query if user has Scale plan on at least one account
    const hasScale = allAccounts.some(a => a.plan === 'scale' || a.plan === 'custom');
    if (!hasScale) {
      return res.status(403).json({ error: 'Consolidated reporting requires Scale or Custom plan.' });
    }

    const accountIds = allAccounts.map(a => a.account_id);

    const [mtd, ytd, byEntity, byService] = await Promise.all([
      pool.query(
        `SELECT account_id, COALESCE(SUM(amount), 0) AS revenue, COUNT(*) AS jobs
         FROM jobs WHERE account_id = ANY($1) AND status='complete'
           AND scheduled_at >= date_trunc('month', CURRENT_DATE)
         GROUP BY account_id`,
        [accountIds]
      ),
      pool.query(
        `SELECT account_id, COALESCE(SUM(amount), 0) AS revenue, COUNT(*) AS jobs
         FROM jobs WHERE account_id = ANY($1) AND status='complete'
           AND scheduled_at >= date_trunc('year', CURRENT_DATE)
         GROUP BY account_id`,
        [accountIds]
      ),
      pool.query(
        `SELECT j.account_id, a.name AS account_name,
                COALESCE(SUM(j.amount),0) AS mtd_revenue,
                COUNT(j.id) AS mtd_jobs
         FROM jobs j
         JOIN accounts a ON a.id = j.account_id
         WHERE j.account_id = ANY($1) AND j.status='complete'
           AND j.scheduled_at >= date_trunc('month', CURRENT_DATE)
         GROUP BY j.account_id, a.name
         ORDER BY mtd_revenue DESC`,
        [accountIds]
      ),
      pool.query(
        `SELECT service_type, COALESCE(SUM(amount),0) AS revenue, COUNT(*) AS jobs
         FROM jobs WHERE account_id = ANY($1) AND status='complete'
           AND scheduled_at >= date_trunc('year', CURRENT_DATE)
         GROUP BY service_type ORDER BY revenue DESC LIMIT 10`,
        [accountIds]
      ),
    ]);

    const entityMap = {};
    allAccounts.forEach(a => { entityMap[a.account_id] = a.account_name; });

    const totalMtd = mtd.rows.reduce((s, r) => s + parseFloat(r.revenue), 0);
    const totalYtd = ytd.rows.reduce((s, r) => s + parseFloat(r.revenue), 0);

    res.json({
      total_mtd:  totalMtd,
      total_ytd:  totalYtd,
      entities:   byEntity.rows,
      by_service: byService.rows,
      accounts:   allAccounts,
    });
  } catch (err) {
    console.error('[analytics/consolidated]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/export — download CSV report
router.get('/export', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { type = 'jobs', from, to } = req.query;
  const accountId = req.accountId;

  const dateConds = (col) => {
    const parts = [];
    if (from) parts.push(`${col} >= '${from}'`);
    if (to)   parts.push(`${col} <= '${to} 23:59:59'`);
    return parts.length ? 'AND ' + parts.join(' AND ') : '';
  };

  try {
    let rows, filename, header;

    if (type === 'revenue') {
      const result = await pool.query(
        `SELECT i.id, c.name AS client, j.service_type AS service,
                i.amount, i.tax_amount, i.status, i.created_at, i.paid_at
         FROM invoices i
         JOIN clients c ON c.id = i.client_id
         JOIN jobs j ON j.id = i.job_id
         WHERE i.account_id = $1 ${dateConds('i.created_at')}
         ORDER BY i.created_at DESC`,
        [accountId]
      );
      rows     = result.rows;
      filename = 'revenue-report.csv';
      header   = ['Invoice ID', 'Client', 'Service', 'Amount', 'Tax', 'Status', 'Created', 'Paid At'];
      rows = rows.map(r => [r.id, r.client, r.service, r.amount, r.tax_amount || 0, r.status,
        r.created_at ? new Date(r.created_at).toLocaleDateString() : '',
        r.paid_at    ? new Date(r.paid_at).toLocaleDateString()    : '']);
    } else if (type === 'clients') {
      const result = await pool.query(
        `SELECT id, name, email, phone, tier, ltv, created_at
         FROM clients WHERE account_id = $1 ORDER BY name`,
        [accountId]
      );
      rows     = result.rows;
      filename = 'clients-export.csv';
      header   = ['ID', 'Name', 'Email', 'Phone', 'Tier', 'LTV', 'Created'];
      rows = rows.map(r => [r.id, r.name, r.email || '', r.phone || '', r.tier || 'standard',
        r.ltv || 0, r.created_at ? new Date(r.created_at).toLocaleDateString() : '']);
    } else {
      // Default: jobs
      const result = await pool.query(
        `SELECT j.id, c.name AS client, j.service_type AS service,
                j.status, j.amount, j.scheduled_at,
                u.name AS tech, j.notes
         FROM jobs j
         JOIN clients c ON c.id = j.client_id
         LEFT JOIN users u ON u.id = j.tech_id
         WHERE j.account_id = $1 ${dateConds('j.scheduled_at')}
         ORDER BY j.scheduled_at DESC`,
        [accountId]
      );
      rows     = result.rows;
      filename = 'jobs-export.csv';
      header   = ['Job ID', 'Client', 'Service', 'Status', 'Amount', 'Scheduled', 'Tech', 'Notes'];
      rows = rows.map(r => [r.id, r.client, r.service, r.status, r.amount || 0,
        r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : '',
        r.tech || '', (r.notes || '').replace(/,/g, ';')]);
    }

    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv    = [header, ...rows].map(row => row.map(escape).join(',')).join('\r\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
