const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const requireEntitlement = require('../middleware/requireEntitlement');
const csvSvc  = require('../services/csvExportService');

// GET /api/analytics/dashboard — all stats for the main dashboard
router.get('/dashboard', requireAuth, async (req, res) => {
  const accountId = req.accountId;
  try {
    const [todayJobs, weekRevenue, mtdRevenue, activeJobs, pendingInvoices, pendingDeposits, teamStats, weekBars, recentReviews, todaySessions, weekCollected, weekOutstanding, prevWeekRevenue, weekInvoicesPaidCount, failedInvoiceCount, totalDepositCount, scheduledData, upcomingData] = await Promise.all([

      // Today's jobs with client + tech name — uses business timezone for date boundary
      // so Calendar and Dashboard agree about which jobs belong to "today".
      pool.query(
        `SELECT j.id, j.service_type, j.status, j.amount, j.scheduled_at, j.notes,
                j.agreement_id, j.duration_minutes,
                c.name AS client_name, u.name AS tech_name,
                (SELECT COUNT(*) FROM job_services js WHERE js.job_id = j.id) AS service_count
         FROM jobs j
         JOIN clients c ON c.id = j.client_id
         LEFT JOIN users u ON u.id = j.tech_id
         LEFT JOIN business_profiles bp ON bp.account_id = j.account_id
         WHERE j.account_id = $1
           AND j.deleted_at IS NULL
           AND (j.scheduled_at AT TIME ZONE COALESCE(bp.timezone, 'America/New_York'))::date
               = (NOW()       AT TIME ZONE COALESCE(bp.timezone, 'America/New_York'))::date
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

      // Active jobs right now — single-day in_progress/partially_completed today,
      // or multi-day job with a checked_in/in_progress session today.
      // Excludes stale jobs from prior dates.
      pool.query(
        `SELECT COUNT(DISTINCT j.id) AS count
         FROM jobs j
         WHERE j.account_id = $1
           AND (
             (
               (j.is_multi_day IS NULL OR j.is_multi_day = FALSE)
               AND j.status IN ('in_progress','partially_completed')
               AND j.scheduled_at::date = CURRENT_DATE
             )
             OR (
               j.is_multi_day = TRUE
               AND EXISTS (
                 SELECT 1 FROM job_sessions s
                 WHERE s.job_id     = j.id
                   AND s.account_id = $1
                   AND s.scheduled_date = CURRENT_DATE
                   AND s.status IN ('checked_in','in_progress')
               )
             )
           )`,
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

      // Techs on the team — counts both single-day (tech_id) and multi-day session assignments
      pool.query(
        `SELECT u.id, u.name, u.role,
                COUNT(DISTINCT j.id) FILTER (WHERE j.status = 'in_progress') AS active_jobs,
                COUNT(DISTINCT j.id) FILTER (WHERE
                  j.scheduled_at >= date_trunc('week', CURRENT_DATE)
                  OR EXISTS (
                    SELECT 1 FROM job_sessions s
                    JOIN job_session_techs jst ON jst.session_id = s.id
                    WHERE jst.tech_id = u.id AND s.job_id = j.id
                      AND s.scheduled_date >= date_trunc('week', CURRENT_DATE)::date
                  )
                ) AS jobs
         FROM users u
         LEFT JOIN jobs j ON (j.tech_id = u.id OR EXISTS (
           SELECT 1 FROM job_sessions s2
           JOIN job_session_techs jst2 ON jst2.session_id = s2.id
           WHERE jst2.tech_id = u.id AND s2.job_id = j.id AND s2.account_id = $1
         )) AND j.account_id = $1
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

      // Today's multi-day sessions (for dashboard alongside single-day jobs)
      pool.query(
        `SELECT s.id, s.status, s.start_time, s.end_time, s.scheduled_date,
                s.day_number,
                (SELECT COUNT(*) FROM job_sessions s2 WHERE s2.job_id = s.job_id) AS total_sessions,
                j.id AS job_id, j.service_type, j.status AS job_status, j.amount,
                c.name AS client_name, u.name AS tech_name
         FROM (
           SELECT s.*,
                  (SELECT COUNT(*) FROM job_sessions s2
                   WHERE s2.job_id = s.job_id AND s2.scheduled_date < s.scheduled_date) + 1 AS day_number
           FROM job_sessions s
           WHERE s.account_id = $1
             AND s.scheduled_date = CURRENT_DATE
             AND s.status NOT IN ('cancelled','missed')
         ) s
         JOIN jobs j    ON j.id = s.job_id
         JOIN clients c ON c.id = j.client_id
         LEFT JOIN users u ON u.id = s.lead_tech_id
         ORDER BY s.start_time NULLS LAST`,
        [accountId]
      ),

      // Paid invoices for jobs scheduled this week
      pool.query(
        `SELECT COALESCE(SUM(i.amount), 0) AS total
         FROM invoices i
         JOIN jobs j ON j.id = i.job_id
         WHERE i.account_id = $1
           AND j.scheduled_at >= date_trunc('week', CURRENT_DATE)
           AND i.status = 'paid'`,
        [accountId]
      ),

      // Pending invoices for jobs scheduled this week
      pool.query(
        `SELECT COALESCE(SUM(i.amount), 0) AS total
         FROM invoices i
         JOIN jobs j ON j.id = i.job_id
         WHERE i.account_id = $1
           AND j.scheduled_at >= date_trunc('week', CURRENT_DATE)
           AND i.status = 'pending'`,
        [accountId]
      ),

      // Previous week completed revenue (for week-over-week comparison)
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM jobs
         WHERE account_id = $1
           AND status = 'complete'
           AND scheduled_at >= date_trunc('week', CURRENT_DATE) - INTERVAL '1 week'
           AND scheduled_at < date_trunc('week', CURRENT_DATE)`,
        [accountId]
      ),

      // Count of paid invoices for jobs scheduled this week
      pool.query(
        `SELECT COUNT(*) AS count
         FROM invoices i
         JOIN jobs j ON j.id = i.job_id
         WHERE i.account_id = $1
           AND j.scheduled_at >= date_trunc('week', CURRENT_DATE)
           AND i.status = 'paid'`,
        [accountId]
      ),

      // Count failed invoices (for KPI badge)
      pool.query(
        `SELECT COUNT(*) FROM invoices WHERE account_id = $1 AND status = 'failed'`,
        [accountId]
      ),

      // Total deposit count across all statuses (for KPI badge)
      pool.query(
        `SELECT COUNT(*) FROM deposits WHERE account_id = $1`,
        [accountId]
      ),

      // Scheduled revenue — future non-cancelled non-complete jobs (each job counted once)
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS job_count
         FROM jobs
         WHERE account_id = $1
           AND scheduled_at > NOW()
           AND status NOT IN ('complete', 'cancelled')`,
        [accountId]
      ),

      // Upcoming Jobs Today — later-today single-day jobs + later-today multi-day sessions
      pool.query(
        `SELECT
           (SELECT COUNT(*)
            FROM jobs
            WHERE account_id = $1
              AND scheduled_at::date = CURRENT_DATE
              AND scheduled_at > NOW()
              AND status NOT IN ('complete', 'cancelled')
              AND deleted_at IS NULL
              AND (is_multi_day IS NULL OR is_multi_day = FALSE)
           ) +
           (SELECT COUNT(*)
            FROM job_sessions s
            JOIN jobs j ON j.id = s.job_id
            WHERE s.account_id = $1
              AND s.scheduled_date = CURRENT_DATE
              AND (s.start_time IS NULL OR s.start_time::time > CURRENT_TIME)
              AND s.status NOT IN ('completed_for_day', 'cancelled', 'missed')
              AND j.status NOT IN ('complete', 'cancelled')
              AND j.deleted_at IS NULL
           ) AS total`,
        [accountId]
      ),
    ]);

    res.json({
      todayJobs:        todayJobs.rows,
      todaySessions:    todaySessions.rows,
      weekRevenue:      parseFloat(weekRevenue.rows[0].total),
      weekCollected:    parseFloat(weekCollected.rows[0].total),
      weekOutstanding:  parseFloat(weekOutstanding.rows[0].total),
      prevWeekRevenue:  parseFloat(prevWeekRevenue.rows[0].total),
      weekInvoicesPaid: parseInt(weekInvoicesPaidCount.rows[0].count),
      mtdRevenue:       parseFloat(mtdRevenue.rows[0].total),
      activeJobs:       parseInt(activeJobs.rows[0].count),
      pendingInvoices:    { count: parseInt(pendingInvoices.rows[0].count), total: parseFloat(pendingInvoices.rows[0].total) },
      failedInvoiceCount: parseInt(failedInvoiceCount.rows[0].count),
      pendingDeposits:    pendingDeposits.rows,
      totalDepositCount:  parseInt(totalDepositCount.rows[0].count),
      team:               teamStats.rows,
      weekBars:           weekBars.rows,
      recentReviews:      recentReviews.rows,
      scheduledRevenue:   parseFloat(scheduledData.rows[0].total),
      scheduledJobCount:  parseInt(scheduledData.rows[0].job_count),
      upcomingJobsToday:  parseInt(upcomingData.rows[0].total),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/priorities — actionable items for Today's Priorities widget
router.get('/priorities', requireAuth, async (req, res) => {
  const accountId = req.accountId;
  try {
    const [failedInvoices, pendingDeposits, unassignedJobs, unreadMessages, sentEstimates] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) FROM invoices WHERE account_id = $1 AND status = 'failed'`,
        [accountId]
      ),
      pool.query(
        `SELECT COUNT(*) FROM deposits WHERE account_id = $1 AND status = 'pending'`,
        [accountId]
      ),
      pool.query(
        `SELECT COUNT(*) FROM jobs
         WHERE account_id = $1
           AND scheduled_at::date = CURRENT_DATE
           AND tech_id IS NULL
           AND status NOT IN ('cancelled','complete')`,
        [accountId]
      ),
      pool.query(
        `SELECT COUNT(*) FROM messages
         WHERE account_id = $1 AND direction = 'inbound' AND read_at IS NULL`,
        [accountId]
      ),
      pool.query(
        `SELECT COUNT(*) FROM estimates WHERE account_id = $1 AND status = 'sent'`,
        [accountId]
      ),
    ]);

    const priorities = [];

    const consider = (type, result, label, subFn, route, tone) => {
      const n = parseInt(result.rows[0].count, 10);
      if (n > 0) priorities.push({ type, count: n, label, sub: subFn(n), route, tone });
    };

    // Ordered by urgency
    consider('failed_payments', failedInvoices,
      'Failed Payments',
      n => `${n} payment${n !== 1 ? 's' : ''} need${n === 1 ? 's' : ''} attention`,
      '/invoices', 'critical');
    consider('deposits', pendingDeposits,
      'Awaiting Payment',
      n => `${n} deposit${n !== 1 ? 's' : ''} awaiting payment`,
      '/deposits', 'critical');
    consider('unassigned', unassignedJobs,
      'Unassigned Jobs Today',
      n => `${n} job${n !== 1 ? 's' : ''} need${n === 1 ? 's' : ''} a technician`,
      '/dispatch', 'warning');
    consider('messages', unreadMessages,
      'Unread Messages',
      n => `${n} awaiting response`,
      '/communications', 'warning');
    consider('estimates', sentEstimates,
      'Estimates Awaiting Approval',
      n => `${n} sent, awaiting signature`,
      '/estimates', 'warning');

    res.json(priorities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/activity — recent completed/recorded events (newest first, max 20)
// Strict rule: only completed or recorded events — no pending/unresolved items (those live in /priorities)
router.get('/activity', requireAuth, async (req, res) => {
  const accountId = req.accountId;
  try {
    const { rows } = await pool.query(
      `SELECT type, label, sub_type, route, tone, event_time
       FROM (

         -- Payment received (invoice paid)
         SELECT
           'payment_received'                                        AS type,
           'Payment of $' || ROUND(i.amount::numeric, 2) || ' received from ' || c.name AS label,
           'Payment'                                                 AS sub_type,
           '/invoices'                                               AS route,
           'success'                                                 AS tone,
           i.created_at                                              AS event_time
         FROM invoices i
         JOIN clients c ON c.id = i.client_id
         WHERE i.account_id = $1 AND i.status = 'paid'

         UNION ALL

         -- Invoice sent
         SELECT
           'invoice_sent',
           'Invoice sent to ' || c.name,
           'Invoice',
           '/invoices',
           'neutral',
           i.sent_at
         FROM invoices i
         JOIN clients c ON c.id = i.client_id
         WHERE i.account_id = $1 AND i.sent_at IS NOT NULL

         UNION ALL

         -- Job completed
         SELECT
           'job_completed',
           j.service_type || ' completed for ' || c.name,
           'Job',
           '/jobs',
           'success',
           j.completed_at
         FROM jobs j
         JOIN clients c ON c.id = j.client_id
         WHERE j.account_id = $1 AND j.completed_at IS NOT NULL

         UNION ALL

         -- Job created (last 30 days, non-cancelled only)
         SELECT
           'job_created',
           'New job scheduled · ' || j.service_type || ' for ' || c.name,
           'Job',
           '/jobs',
           'neutral',
           j.created_at
         FROM jobs j
         JOIN clients c ON c.id = j.client_id
         WHERE j.account_id = $1
           AND j.status NOT IN ('cancelled')
           AND j.created_at >= NOW() - INTERVAL '30 days'

         UNION ALL

         -- Estimate approved (signed)
         SELECT
           'estimate_signed',
           'Estimate approved by ' || c.name,
           'Estimate',
           '/estimates',
           'success',
           e.signed_at
         FROM estimates e
         JOIN clients c ON c.id = e.client_id
         WHERE e.account_id = $1 AND e.signed_at IS NOT NULL

         UNION ALL

         -- Estimate sent
         SELECT
           'estimate_sent',
           'Estimate sent to ' || c.name,
           'Estimate',
           '/estimates',
           'neutral',
           e.sent_at
         FROM estimates e
         JOIN clients c ON c.id = e.client_id
         WHERE e.account_id = $1 AND e.sent_at IS NOT NULL

         UNION ALL

         -- New client added (last 30 days)
         SELECT
           'client_created',
           'New client added: ' || c.name,
           'Client',
           '/clients/' || c.id,
           'neutral',
           c.created_at
         FROM clients c
         WHERE c.account_id = $1
           AND c.created_at >= NOW() - INTERVAL '30 days'

         UNION ALL

         -- Review received
         SELECT
           'review_received',
           r.rating::text || '★ review received from ' || c.name,
           'Review',
           '/jobs',
           CASE WHEN r.rating >= 4 THEN 'success'
                WHEN r.rating >= 3 THEN 'warning'
                ELSE 'critical' END,
           r.created_at
         FROM reviews r
         JOIN clients c ON c.id = r.client_id
         WHERE r.account_id = $1

         UNION ALL

         -- Deposit collected (NOT pending — pending lives in priorities)
         SELECT
           'deposit_paid',
           'Deposit collected from ' || c.name,
           'Deposit',
           '/deposits',
           'success',
           d.created_at
         FROM deposits d
         JOIN clients c ON c.id = d.client_id
         WHERE d.account_id = $1 AND d.status = 'collected'

         UNION ALL

         -- Deposit refunded
         SELECT
           'deposit_refunded',
           'Deposit refunded to ' || c.name,
           'Deposit',
           '/deposits',
           'neutral',
           d.created_at
         FROM deposits d
         JOIN clients c ON c.id = d.client_id
         WHERE d.account_id = $1 AND d.status = 'refunded'

       ) AS activity
       WHERE event_time IS NOT NULL
       ORDER BY event_time DESC
       LIMIT 20`,
      [accountId]
    );
    res.json(rows);
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

// GET /api/analytics/scheduled — upcoming scheduled job revenue for the Revenue page
router.get('/scheduled', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const accountId = req.accountId;
  try {
    const [summary, byWeek, byService] = await Promise.all([

      // Totals
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS job_count
         FROM jobs
         WHERE account_id = $1
           AND scheduled_at > NOW()
           AND status NOT IN ('complete', 'cancelled')`,
        [accountId]
      ),

      // Grouped by future week — next 8 weeks
      pool.query(
        `SELECT
           date_trunc('week', scheduled_at)::date AS week_start,
           COUNT(*) AS jobs,
           COALESCE(SUM(amount), 0) AS revenue
         FROM jobs
         WHERE account_id = $1
           AND scheduled_at > NOW()
           AND status NOT IN ('complete', 'cancelled')
         GROUP BY week_start
         ORDER BY week_start
         LIMIT 8`,
        [accountId]
      ),

      // Grouped by service type
      pool.query(
        `SELECT
           service_type,
           COUNT(*) AS jobs,
           COALESCE(SUM(amount), 0) AS revenue
         FROM jobs
         WHERE account_id = $1
           AND scheduled_at > NOW()
           AND status NOT IN ('complete', 'cancelled')
         GROUP BY service_type
         ORDER BY revenue DESC`,
        [accountId]
      ),
    ]);

    res.json({
      scheduledRevenue:  parseFloat(summary.rows[0].total),
      scheduledJobCount: parseInt(summary.rows[0].job_count),
      byWeek:    byWeek.rows,
      byService: byService.rows,
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

// GET /api/analytics/consolidated — multi-entity rollup (Scale only)
router.get('/consolidated', requireAuth, requireRole('owner'), requireEntitlement('can_use_consolidated_reporting'), async (req, res) => {
  try {
    // Find all account_ids this user has owner access to
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
    const accountIds  = allAccounts.map(a => a.account_id);

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
    const { accountName } = await csvSvc.getAccountMeta(pool, accountId);
    const generatedAt = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    const { fmtDate, fmtDateTime, fmtMoney, statusLabel, makeFilename, metaSection, buildCSV } = csvSvc;

    let allRows, filename;

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
      filename = makeFilename('revenue-analytics', accountName, from, to);
      const header = ['Invoice ID', 'Client', 'Service', 'Amount', 'Tax Amount', 'Status', 'Created', 'Paid At'];
      const cols = header.length;
      const meta = metaSection([
        ['Report', 'Revenue Analytics'], ['Entity', accountName],
        ['Period Start', from || 'All'], ['Period End', to || 'All'], ['Generated At', generatedAt],
      ], cols);
      const dataRows = result.rows.map(r => [
        r.id, r.client, r.service,
        fmtMoney(r.amount), fmtMoney(r.tax_amount),
        statusLabel(r.status),
        fmtDate(r.created_at), fmtDate(r.paid_at),
      ]);
      allRows = [...meta, header, ...dataRows];

    } else if (type === 'clients') {
      const result = await pool.query(
        `SELECT id, name, email, phone, tier, ltv, created_at
         FROM clients WHERE account_id = $1 ORDER BY name`,
        [accountId]
      );
      filename = makeFilename('clients', accountName, from, to);
      const header = ['Client ID', 'Name', 'Email', 'Phone', 'Tier', 'Lifetime Value', 'Created'];
      const cols = header.length;
      const meta = metaSection([
        ['Report', 'Client Export'], ['Entity', accountName],
        ['Period Start', from || 'All'], ['Period End', to || 'All'], ['Generated At', generatedAt],
      ], cols);
      const dataRows = result.rows.map(r => [
        r.id, r.name, r.email || '', r.phone || '',
        r.tier || 'standard', fmtMoney(r.ltv),
        fmtDate(r.created_at),
      ]);
      allRows = [...meta, header, ...dataRows];

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
      filename = makeFilename('jobs', accountName, from, to);
      const header = ['Job ID', 'Client', 'Service', 'Status', 'Amount', 'Scheduled', 'Tech', 'Notes'];
      const cols = header.length;
      const meta = metaSection([
        ['Report', 'Jobs Export'], ['Entity', accountName],
        ['Period Start', from || 'All'], ['Period End', to || 'All'], ['Generated At', generatedAt],
      ], cols);
      const dataRows = result.rows.map(r => [
        r.id, r.client, r.service,
        statusLabel(r.status), fmtMoney(r.amount),
        fmtDateTime(r.scheduled_at),
        r.tech || '', r.notes || '',
      ]);
      allRows = [...meta, header, ...dataRows];
    }

    const csv = buildCSV(allRows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Export failed.' });
  }
});

module.exports = router;
