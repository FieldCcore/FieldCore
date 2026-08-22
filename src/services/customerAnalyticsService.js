'use strict';
const pool = require('../db/pool');

function pf(v) { return Math.round((parseFloat(v) || 0) * 100) / 100; }
function pi(v) { return parseInt(v, 10) || 0; }

const REQUIRED_HISTORY_MONTHS = 6;

// ── CUSTOMER LIFETIME VALUE ───────────────────────────────────────────────────
// Historical average revenue per customer, calculated dynamically from completed
// jobs. All-time (not period-scoped) — date filter on the overview route does
// NOT apply here; LTV requires the full job history to be meaningful.
//
// clients.ltv is a separate CRM field (running payment sum via webhooks); this
// service reads jobs directly so LTV components are fully auditable.

async function getLtv(accountId) {
  const historyRes = await pool.query(
    `SELECT
       MIN(scheduled_at)::date                    AS first_job_date,
       MAX(scheduled_at)::date                    AS last_job_date,
       COUNT(*)::int                              AS total_completed,
       COUNT(DISTINCT client_id)::int             AS unique_clients
     FROM jobs
     WHERE account_id = $1 AND status = 'complete'`,
    [accountId]
  );

  const h = historyRes.rows[0];
  const totalCompleted = pi(h.total_completed);
  const uniqueClients  = pi(h.unique_clients);

  if (totalCompleted === 0 || !h.first_job_date || !h.last_job_date) {
    return {
      eligible: false, reason: 'INSUFFICIENT_HISTORY',
      historySpanMonths: 0, requiredMonths: REQUIRED_HISTORY_MONTHS, data: null,
    };
  }

  const firstJob          = new Date(h.first_job_date);
  const lastJob           = new Date(h.last_job_date);
  const historySpanMonths = (lastJob - firstJob) / (1000 * 60 * 60 * 24 * 30.44);

  if (historySpanMonths < REQUIRED_HISTORY_MONTHS) {
    return {
      eligible: false, reason: 'INSUFFICIENT_HISTORY',
      historySpanMonths: Math.round(historySpanMonths * 10) / 10,
      requiredMonths: REQUIRED_HISTORY_MONTHS, data: null,
    };
  }

  // Per-customer aggregates (all-time)
  const customerRes = await pool.query(
    `SELECT client_id,
            COUNT(*)::int            AS job_count,
            COALESCE(SUM(amount), 0) AS total_revenue
     FROM jobs
     WHERE account_id = $1 AND status = 'complete'
     GROUP BY client_id
     ORDER BY total_revenue DESC`,
    [accountId]
  );

  const rows       = customerRes.rows;
  const revenues   = rows.map(r => pf(r.total_revenue));
  const totalJobs  = rows.reduce((a, r) => a + pi(r.job_count), 0);
  const totalRev   = revenues.reduce((a, b) => a + b, 0);
  const avgRev     = revenues.length ? totalRev / revenues.length : 0;
  const avgTicket  = totalJobs > 0 ? totalRev / totalJobs : 0;
  const avgJobs    = uniqueClients > 0 ? totalJobs / uniqueClients : 0;

  const sorted     = [...revenues].sort((a, b) => a - b);
  const mid        = Math.floor(sorted.length / 2);
  const medianRev  = sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;

  // Top 5 clients by all-time revenue
  const top5Ids = rows.slice(0, 5).map(r => r.client_id);
  let topCustomers = [];
  if (top5Ids.length) {
    const nameRes = await pool.query(
      'SELECT id, name FROM clients WHERE account_id = $1 AND id = ANY($2)',
      [accountId, top5Ids]
    );
    const nameMap = Object.fromEntries(nameRes.rows.map(r => [r.id, r.name]));
    topCustomers  = rows.slice(0, 5).map(r => ({
      id:           r.client_id,
      name:         nameMap[r.client_id] || 'Unknown',
      totalRevenue: pf(r.total_revenue),
      jobCount:     pi(r.job_count),
    }));
  }

  return {
    eligible: true, reason: null,
    historySpanMonths: Math.round(historySpanMonths * 10) / 10,
    requiredMonths: REQUIRED_HISTORY_MONTHS,
    data: {
      avgRevenuePerCustomer:    pf(avgRev),
      medianRevenuePerCustomer: pf(medianRev),
      avgJobsPerCustomer:       Math.round(avgJobs * 10) / 10,
      avgTicket:                pf(avgTicket),
      totalCustomers:           uniqueClients,
      totalJobs,
      topCustomers,
    },
    provenance: {
      formula:    'SUM(jobs.amount WHERE status=complete) per client; average across all clients',
      basis:      'all-time historical — not period-scoped',
      source:     'jobs',
      components: ['avgRevenuePerCustomer', 'medianRevenuePerCustomer', 'avgJobsPerCustomer', 'avgTicket'],
    },
  };
}

// ── AT-RISK / CHURN DETECTION ─────────────────────────────────────────────────
// Snapshot-based — not period-scoped. Reads inactivity_days from business_profiles.
//
// Classification rules:
//   ACTIVE   — has future scheduled job (any non-final status, scheduled_at > NOW())
//              OR last completed job ≤ threshold days ago
//   AT_RISK  — no future scheduled, last completed job > threshold AND ≤ 2×threshold days ago
//   INACTIVE — no future scheduled, last completed job > 2×threshold days ago
//
// Excluded: clients with 0 completed jobs (no established service relationship).

async function getChurnAnalysis(accountId) {
  const policyRes = await pool.query(
    'SELECT customer_inactivity_days FROM business_profiles WHERE account_id = $1',
    [accountId]
  );
  const inactivityDays = policyRes.rows[0]?.customer_inactivity_days ?? null;

  if (!inactivityDays) {
    return { configured: false, inactivityDays: null, counts: null, atRiskClients: null };
  }

  const threshold = inactivityDays;

  const { rows } = await pool.query(
    `SELECT
       c.id, c.name,
       COUNT(j.id) FILTER (WHERE j.status = 'complete')::int              AS completed_jobs,
       MAX(j.scheduled_at) FILTER (WHERE j.status = 'complete')           AS last_completed,
       COUNT(j.id) FILTER (
         WHERE j.status NOT IN ('complete','cancelled','no_show')
           AND j.scheduled_at > NOW()
       )::int                                                              AS future_scheduled,
       EXTRACT(EPOCH FROM (
         NOW() - MAX(j.scheduled_at) FILTER (WHERE j.status = 'complete')
       )) / 86400                                                          AS days_since_last_job
     FROM clients c
     LEFT JOIN jobs j ON j.client_id = c.id AND j.account_id = $1
     WHERE c.account_id = $1
     GROUP BY c.id, c.name
     HAVING COUNT(j.id) FILTER (WHERE j.status = 'complete') > 0
     ORDER BY last_completed ASC NULLS LAST`,
    [accountId]
  );

  let active = 0, atRisk = 0, inactive = 0;
  const atRiskClients = [];

  for (const r of rows) {
    const days      = r.days_since_last_job != null ? parseFloat(r.days_since_last_job) : null;
    const hasFuture = pi(r.future_scheduled) > 0;
    let status;
    if (hasFuture || days === null || days <= threshold) {
      status = 'ACTIVE'; active++;
    } else if (days <= threshold * 2) {
      status = 'AT_RISK'; atRisk++;
      atRiskClients.push({
        id: r.id, name: r.name,
        daysSinceLastJob: Math.round(days),
        totalJobs: pi(r.completed_jobs),
        status: 'AT_RISK',
      });
    } else {
      status = 'INACTIVE'; inactive++;
    }
  }

  return {
    configured: true,
    inactivityDays: threshold,
    counts: { active, atRisk, inactive, total: rows.length },
    atRiskClients: atRiskClients.slice(0, 10),
    rules: {
      active:   `Future scheduled job OR last completed ≤ ${threshold} days ago`,
      atRisk:   `No future scheduled; last completed ${threshold}–${threshold * 2} days ago`,
      inactive: `No future scheduled; last completed > ${threshold * 2} days ago`,
      excluded: 'Clients with no completed jobs',
    },
  };
}

// ── SEGMENT ANALYSIS ─────────────────────────────────────────────────────────
// Period-scoped for revenue/job counts; client membership is all-time.
//
// Attribution semantics: a client belongs to every segment they are tagged in.
// Revenue counts in each segment independently — shares may sum > 100% when
// clients carry multiple tags. This is expected for a non-exclusive tag system.

async function getSegmentAnalysis(accountId, { start, end } = {}) {
  const [segRes, taggedRes] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS cnt FROM client_segments WHERE account_id = $1', [accountId]),
    pool.query('SELECT COUNT(DISTINCT client_id)::int AS cnt FROM client_segment_assignments WHERE account_id = $1', [accountId]),
  ]);

  const segmentCount  = pi(segRes.rows[0]?.cnt);
  const clientsTagged = pi(taggedRes.rows[0]?.cnt);

  if (segmentCount === 0 || clientsTagged === 0) {
    return { configured: segmentCount > 0, segmentCount, clientsTagged: 0, data: null };
  }

  const params = [accountId];
  let dateFilter = '';
  if (start) { params.push(start); dateFilter += ` AND j.scheduled_at >= $${params.length}::date`; }
  if (end)   { params.push(end);   dateFilter += ` AND j.scheduled_at <  ($${params.length}::date + INTERVAL '1 day')`; }

  const { rows } = await pool.query(
    `SELECT
       cs.id, cs.name, cs.color,
       COUNT(DISTINCT csa.client_id)::int                                          AS client_count,
       COUNT(j.id) FILTER (WHERE j.status = 'complete')::int                       AS job_count,
       COALESCE(SUM(j.amount) FILTER (WHERE j.status = 'complete'), 0)             AS earned_revenue
     FROM client_segments cs
     JOIN client_segment_assignments csa ON csa.segment_id = cs.id AND csa.account_id = $1
     LEFT JOIN jobs j ON j.client_id = csa.client_id AND j.account_id = $1 ${dateFilter}
     WHERE cs.account_id = $1
     GROUP BY cs.id, cs.name, cs.color
     ORDER BY earned_revenue DESC`,
    params
  );

  // Total for revenue share denominator: each tagged client counted once.
  // Using IN subquery avoids double-counting clients with multiple segment assignments.
  const { rows: totRows } = await pool.query(
    `SELECT COALESCE(SUM(j.amount), 0) AS total
     FROM jobs j
     WHERE j.account_id = $1 AND j.status = 'complete' ${dateFilter}
       AND j.client_id IN (
         SELECT DISTINCT client_id FROM client_segment_assignments WHERE account_id = $1
       )`,
    params
  );
  const totalRevenue = pf(totRows[0]?.total || 0);

  const data = rows.map(r => {
    const earned = pf(r.earned_revenue);
    const jobs   = pi(r.job_count);
    return {
      id:            r.id,
      name:          r.name,
      color:         r.color || null,
      clientCount:   pi(r.client_count),
      jobCount:      jobs,
      earnedRevenue: earned,
      avgTicket:     jobs > 0 ? pf(earned / jobs) : null,
      revenueShare:  totalRevenue > 0 ? Math.round((earned / totalRevenue) * 1000) / 10 : 0,
    };
  });

  return {
    configured: true,
    segmentCount,
    clientsTagged,
    data,
    attributionNote: 'Multi-tag clients counted in each segment; shares may sum > 100%.',
    provenance: {
      basis:  'revenue/jobs period-scoped; clientCount is all-time segment membership',
      source: 'client_segments + client_segment_assignments + jobs',
    },
  };
}

module.exports = { getLtv, getChurnAnalysis, getSegmentAnalysis };
