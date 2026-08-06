'use strict';
const pool = require('../db/pool');

// ── Date helpers ──────────────────────────────────────────────────────────────

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function defaultPeriod() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start: toDateStr(start), end: toDateStr(now) };
}

function getComparisonRange(start, end, comparison) {
  if (!comparison || comparison === 'none') return null;

  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end   + 'T00:00:00Z');
  const durationDays = Math.round((e - s) / 86400000) + 1;

  if (comparison === 'previous_period') {
    const ce = new Date(s.getTime() - 86400000);
    const cs = new Date(ce.getTime() - (durationDays - 1) * 86400000);
    return { start: toDateStr(cs), end: toDateStr(ce) };
  }

  if (comparison === 'previous_month') {
    const cs = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() - 1, s.getUTCDate()));
    const ce = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() - 1, e.getUTCDate()));
    return { start: toDateStr(cs), end: toDateStr(ce) };
  }

  if (comparison === 'previous_year') {
    const cs = new Date(Date.UTC(s.getUTCFullYear() - 1, s.getUTCMonth(), s.getUTCDate()));
    const ce = new Date(Date.UTC(e.getUTCFullYear() - 1, e.getUTCMonth(), e.getUTCDate()));
    return { start: toDateStr(cs), end: toDateStr(ce) };
  }

  return null;
}

// ── Money formatting (DB stores NUMERIC(10,2)) ────────────────────────────────

function pf(v) { return Math.round((parseFloat(v) || 0) * 100) / 10000; }
function pi(v) { return parseInt(v,  10) || 0; }

// ── Primary KPI: Earned Revenue ───────────────────────────────────────────────
// Company-level: jobs.amount by job.id — no multiplication by team size

async function earnedRevenue(accountId, start, end) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(j.amount), 0) AS total,
            COUNT(j.id) AS job_count
     FROM jobs j
     WHERE j.account_id = $1
       AND j.status = 'complete'
       AND j.scheduled_at >= $2::date
       AND j.scheduled_at <  ($3::date + INTERVAL '1 day')`,
    [accountId, start, end]
  );
  return {
    value:    pf(rows[0].total),
    jobCount: pi(rows[0].job_count),
    status:   'ok',
    provenance: {
      formula:    'SUM(jobs.amount) WHERE status = complete AND scheduled_at in period',
      sources:    ['jobs'],
      basis:      'job.scheduled_at (UTC)',
      exclusions: ['cancelled', 'no_show', 'in_progress', 'scheduled jobs'],
      note:       'Revenue counted once per job regardless of team size.',
    },
  };
}

// ── Primary KPI: Collected Revenue ───────────────────────────────────────────
// Paid invoices (by paid_at) + collected deposits (by collected_at)

async function collectedRevenue(accountId, start, end) {
  const [invRes, depRes] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
       FROM invoices
       WHERE account_id = $1
         AND status = 'paid'
         AND paid_at >= $2::date
         AND paid_at <  ($3::date + INTERVAL '1 day')`,
      [accountId, start, end]
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
       FROM deposits
       WHERE account_id = $1
         AND status = 'collected'
         AND collected_at >= $2::date
         AND collected_at <  ($3::date + INTERVAL '1 day')`,
      [accountId, start, end]
    ),
  ]);

  const invTotal = pf(invRes.rows[0].total);
  const depTotal = pf(depRes.rows[0].total);

  return {
    value: invTotal + depTotal,
    breakdown: {
      invoices: invTotal, invoiceCount: pi(invRes.rows[0].cnt),
      deposits: depTotal, depositCount: pi(depRes.rows[0].cnt),
    },
    status: 'ok',
    provenance: {
      formula:    'SUM(paid invoices.amount by paid_at) + SUM(collected deposits.amount by collected_at)',
      sources:    ['invoices', 'deposits'],
      basis:      'invoice.paid_at and deposit.collected_at (UTC)',
      exclusions: ['pending invoices', 'void invoices', 'failed invoices', 'pending/refunded deposits'],
    },
  };
}

// ── Primary KPI: Gross Profit ─────────────────────────────────────────────────
// Unavailable: no cost source connected

async function grossProfit() {
  return {
    value:          null,
    status:         'unavailable',
    missingSources: ['labor costs', 'material costs', 'travel costs', 'merchant fees'],
    provenance: {
      formula:    'Earned revenue − (labor + materials + travel + merchant fees + refunds)',
      sources:    ['None connected'],
      note:       'Direct cost tracking is not yet configured. Connect cost sources to calculate gross profit.',
    },
  };
}

// ── Primary KPI: Outstanding AR ───────────────────────────────────────────────
// Point-in-time balance — not filtered by selected period

async function outstandingAr(accountId) {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(amount), 0)                                                         AS total,
       COUNT(*)                                                                          AS invoice_count,
       COALESCE(SUM(CASE WHEN due_date IS NOT NULL AND due_date < NOW()
                         THEN amount ELSE 0 END), 0)                                    AS overdue_total,
       COUNT(CASE WHEN due_date IS NOT NULL AND due_date < NOW() THEN 1 END)             AS overdue_count,
       COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400.0), 0)             AS avg_age_days
     FROM invoices
     WHERE account_id = $1
       AND status = 'pending'`,
    [accountId]
  );

  const r = rows[0];
  return {
    value:         pf(r.total),
    invoiceCount:  pi(r.invoice_count),
    overdueTotal:  pf(r.overdue_total),
    overdueCount:  pi(r.overdue_count),
    avgAgeDays:    Math.round(pf(r.avg_age_days)),
    status:        'ok',
    provenance: {
      formula:    'SUM(invoices.amount) WHERE status = pending',
      sources:    ['invoices'],
      basis:      'Current balance — not filtered to selected date range',
      exclusions: ['void invoices', 'paid invoices', 'failed invoices'],
    },
  };
}

// ── Primary KPI: Projected Month-End ─────────────────────────────────────────

async function projectedMonthEnd(accountId) {
  const now      = new Date();
  const msStart  = toDateStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const msEnd    = toDateStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)));

  const [mtdRes, futRes, rateRes] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM jobs
       WHERE account_id = $1
         AND status = 'complete'
         AND scheduled_at >= $2::date
         AND scheduled_at <= CURRENT_DATE`,
      [accountId, msStart]
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
       FROM jobs
       WHERE account_id = $1
         AND status NOT IN ('complete','cancelled','no_show')
         AND scheduled_at >  NOW()
         AND scheduled_at <= ($2::date + INTERVAL '1 day')`,
      [accountId, msEnd]
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'complete')                          AS completed,
         COUNT(*) FILTER (WHERE status IN ('complete','cancelled','no_show')) AS eligible
       FROM jobs
       WHERE account_id = $1
         AND scheduled_at >= NOW() - INTERVAL '90 days'
         AND scheduled_at <  NOW()`,
      [accountId]
    ),
  ]);

  const mtd          = pf(mtdRes.rows[0].total);
  const futureValue  = pf(futRes.rows[0].total);
  const futureCount  = pi(futRes.rows[0].cnt);
  const completed    = pi(rateRes.rows[0].completed);
  const eligible     = pi(rateRes.rows[0].eligible);
  const completionRate = eligible > 0 ? completed / eligible : 0.85;
  const projected    = mtd + futureValue * completionRate;

  return {
    value:          projected,
    lower:          projected * 0.90,
    upper:          projected * 1.10,
    mtd,
    futureScheduled: futureValue,
    futureJobCount:  futureCount,
    completionRate,
    method:         'rules_based_v1',
    confidence:     eligible >= 10 ? 'medium' : 'low',
    status:         'ok',
    assumptions: [
      `Month-to-date earned: $${mtd.toFixed(2)}`,
      `Future scheduled in month: $${futureValue.toFixed(2)} across ${futureCount} job(s)`,
      `Historical completion rate: ${Math.round(completionRate * 100)}% (last 90 days, ${eligible} eligible job(s))`,
      'Projection = MTD + (future scheduled × completion rate)',
      'Range: ±10% of projected value',
    ],
    provenance: {
      formula:    'MTD earned + (future scheduled jobs in month × historical completion rate)',
      sources:    ['jobs'],
      basis:      'Scheduled job dates; completion rate from prior 90 days',
      exclusions: ['cancelled and no-show jobs excluded from completion rate numerator'],
      note:       'Not AI — explainable rules-based estimate only.',
    },
    calculatedAt: new Date().toISOString(),
  };
}

// ── Secondary KPI: Average Ticket ─────────────────────────────────────────────

async function averageTicket(accountId, start, end) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
     FROM jobs
     WHERE account_id = $1
       AND status = 'complete'
       AND amount IS NOT NULL AND amount > 0
       AND scheduled_at >= $2::date
       AND scheduled_at <  ($3::date + INTERVAL '1 day')`,
    [accountId, start, end]
  );

  const cnt   = pi(rows[0].cnt);
  const total = pf(rows[0].total);

  if (cnt === 0) return { value: null, status: 'no_eligible_revenue', count: 0,
    provenance: { formula: 'Earned revenue ÷ completed jobs with revenue', note: 'No completed jobs with revenue in this period.' } };

  return {
    value:  total / cnt,
    count:  cnt,
    status: 'ok',
    provenance: {
      formula:    'SUM(earned revenue) ÷ COUNT(completed jobs with revenue > 0)',
      sources:    ['jobs'],
      exclusions: ['jobs with null or zero amount'],
    },
  };
}

// ── Secondary KPI: Revenue per Labor Hour ─────────────────────────────────────

async function revenuePerLaborHour(accountId, start, end) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(amount), 0)                         AS revenue,
            COALESCE(SUM(COALESCE(duration_minutes, 0)), 0)  AS total_minutes
     FROM jobs
     WHERE account_id = $1
       AND status = 'complete'
       AND amount IS NOT NULL
       AND scheduled_at >= $2::date
       AND scheduled_at <  ($3::date + INTERVAL '1 day')`,
    [accountId, start, end]
  );

  const revenue = pf(rows[0].revenue);
  const hours   = pf(rows[0].total_minutes) / 60;

  if (hours < 0.01) return {
    value:  null,
    status: 'insufficient_data',
    provenance: {
      formula: 'Earned revenue ÷ total scheduled labor hours',
      note:    'No job duration data available. Set duration on jobs to enable this metric.',
    },
  };

  return {
    value:   revenue / hours,
    revenue,
    hours:   Math.round(hours * 10) / 10,
    status:  'ok',
    basis:   'scheduled_labor_hours',
    provenance: {
      formula:    'Earned revenue ÷ scheduled labor hours (from jobs.duration_minutes)',
      sources:    ['jobs'],
      note:       'Uses scheduled job duration, not recorded time. Native time tracking not yet connected.',
      limitation: 'scheduled_not_actual',
    },
  };
}

// ── Secondary KPI: Completion Rate ────────────────────────────────────────────

async function completionRate(accountId, start, end) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'complete')                          AS completed,
       COUNT(*) FILTER (WHERE status IN ('complete','cancelled','no_show')) AS eligible
     FROM jobs
     WHERE account_id = $1
       AND scheduled_at >= $2::date
       AND scheduled_at <  ($3::date + INTERVAL '1 day')`,
    [accountId, start, end]
  );

  const completed = pi(rows[0].completed);
  const eligible  = pi(rows[0].eligible);

  if (eligible === 0) return { value: null, status: 'no_eligible_revenue', completed: 0, eligible: 0,
    provenance: { formula: 'Completed jobs ÷ (completed + cancelled + no-show) in period', note: 'No eligible jobs in this period.' } };

  return {
    value:     completed / eligible,
    pct:       (completed / eligible) * 100,
    completed,
    eligible,
    status:    'ok',
    provenance: {
      formula:    'Completed jobs ÷ (completed + cancelled + no-show) in period',
      sources:    ['jobs'],
      exclusions: ['still-scheduled and in-progress jobs excluded from denominator'],
    },
  };
}

// ── Secondary KPI: Technician Utilization ─────────────────────────────────────
// Unavailable: requires workforce availability data not yet connected

async function technicianUtilization() {
  return {
    value:          null,
    status:         'unavailable',
    missingSources: ['workforce availability schedules', 'field capacity data'],
    provenance: {
      formula: 'Committed productive hours ÷ available field capacity',
      sources: ['None connected'],
      note:    'Workforce availability scheduling is not yet configured.',
    },
  };
}

// ── Secondary KPI: Repeat Revenue ─────────────────────────────────────────────

async function repeatRevenue(accountId, start, end) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(j.amount), 0)   AS total,
            COUNT(DISTINCT j.client_id) AS client_count,
            COUNT(j.id)                 AS job_count
     FROM jobs j
     WHERE j.account_id = $1
       AND j.status = 'complete'
       AND j.scheduled_at >= $2::date
       AND j.scheduled_at <  ($3::date + INTERVAL '1 day')
       AND EXISTS (
         SELECT 1 FROM jobs prev
         WHERE prev.account_id  = $1
           AND prev.client_id   = j.client_id
           AND prev.status      = 'complete'
           AND prev.scheduled_at < $2::date
           AND prev.id         != j.id
       )`,
    [accountId, start, end]
  );

  return {
    value:       pf(rows[0].total),
    clientCount: pi(rows[0].client_count),
    jobCount:    pi(rows[0].job_count),
    status:      'ok',
    provenance: {
      formula:    'Earned revenue from clients with at least one completed job before this period',
      sources:    ['jobs', 'clients'],
      note:       'A "returning" client has a completed job prior to the selected period start.',
    },
  };
}

// ── Secondary KPI: Revenue at Risk ────────────────────────────────────────────

async function revenueAtRisk(accountId, start, end) {
  const [overdueRes, cancelRes, failedRes] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
       FROM invoices
       WHERE account_id = $1
         AND status = 'pending'
         AND due_date IS NOT NULL
         AND due_date < NOW()`,
      [accountId]
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
       FROM jobs
       WHERE account_id = $1
         AND status = 'cancelled'
         AND amount IS NOT NULL AND amount > 0
         AND scheduled_at >= $2::date
         AND scheduled_at <  ($3::date + INTERVAL '1 day')`,
      [accountId, start, end]
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
       FROM invoices
       WHERE account_id = $1 AND status = 'failed'`,
      [accountId]
    ),
  ]);

  const overdueTotal  = pf(overdueRes.rows[0].total);
  const cancelTotal   = pf(cancelRes.rows[0].total);
  const failedTotal   = pf(failedRes.rows[0].total);
  const total         = overdueTotal + cancelTotal + failedTotal;

  return {
    value: total,
    breakdown: {
      overdueInvoices: { total: overdueTotal, count: pi(overdueRes.rows[0].cnt), label: 'Overdue invoices' },
      cancelledJobs:   { total: cancelTotal,  count: pi(cancelRes.rows[0].cnt),  label: 'Cancelled job value (period)' },
      failedPayments:  { total: failedTotal,  count: pi(failedRes.rows[0].cnt),  label: 'Failed payment attempts' },
    },
    status: 'ok',
    provenance: {
      formula:    'Overdue invoices + cancelled job value in period + failed payments',
      sources:    ['invoices', 'jobs'],
      note:       'Overdue = pending invoices past their due date. Cancelled = period-filtered. Failed = all-time unresolved.',
    },
  };
}

// ── Trend data ─────────────────────────────────────────────────────────────────

async function trendData(accountId, start, end, interval, compStart, compEnd) {
  const trunc = interval === 'monthly' ? 'month' : interval === 'weekly' ? 'week' : 'day';
  const step  = interval === 'monthly' ? '1 month'                        : interval === 'weekly' ? '1 week' : '1 day';

  async function fetchSeries(s, e) {
    const { rows } = await pool.query(
      `SELECT
         date_trunc($1, g)::date                                                          AS period_start,
         COALESCE(SUM(j.amount)    FILTER (WHERE j.status = 'complete'), 0)               AS earned,
         COALESCE(SUM(i_paid.amount), 0)                                                  AS collected,
         COUNT(DISTINCT j.id)      FILTER (WHERE j.status = 'complete')                   AS jobs
       FROM generate_series($2::date, $3::date, $4::interval) AS g
       LEFT JOIN jobs j
         ON j.account_id = $5
            AND date_trunc($1, j.scheduled_at) = date_trunc($1, g::timestamptz)
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(ii.amount), 0) AS amount
         FROM invoices ii
         WHERE ii.account_id = $5
           AND ii.status = 'paid'
           AND date_trunc($1, ii.paid_at) = date_trunc($1, g::timestamptz)
       ) i_paid ON true
       GROUP BY period_start
       ORDER BY period_start`,
      [trunc, s, e, step, accountId]
    );
    return rows.map(r => ({
      periodStart: r.period_start,
      earned:      pf(r.earned),
      collected:   pf(r.collected),
      jobs:        pi(r.jobs),
    }));
  }

  const [current, comparison] = await Promise.all([
    fetchSeries(start, end),
    compStart && compEnd ? fetchSeries(compStart, compEnd) : Promise.resolve(null),
  ]);

  return { current, comparison, interval };
}

// ── Service breakdown ─────────────────────────────────────────────────────────

async function serviceBreakdown(accountId, start, end) {
  const { rows } = await pool.query(
    `SELECT
       j.service_type,
       COUNT(DISTINCT j.id)                                                                AS jobs,
       COALESCE(SUM(j.amount), 0)                                                         AS earned_revenue,
       COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'paid'), 0)                        AS collected_revenue,
       COALESCE(SUM(COALESCE(j.duration_minutes, 0)) / 60.0, 0)                           AS labor_hours,
       COUNT(j.id) FILTER (WHERE j.status = 'complete')                                   AS completed_count,
       COUNT(j.id) FILTER (WHERE j.status IN ('complete','cancelled','no_show'))           AS eligible_count
     FROM jobs j
     LEFT JOIN invoices i ON i.job_id = j.id AND i.account_id = $1
     WHERE j.account_id = $1
       AND j.status = 'complete'
       AND j.scheduled_at >= $2::date
       AND j.scheduled_at <  ($3::date + INTERVAL '1 day')
     GROUP BY j.service_type
     ORDER BY earned_revenue DESC`,
    [accountId, start, end]
  );

  const totalRevenue = rows.reduce((s, r) => s + pf(r.earned_revenue), 0);

  return rows.map(r => {
    const earned    = pf(r.earned_revenue);
    const collected = pf(r.collected_revenue);
    const hours     = pf(r.labor_hours);
    const jobs      = pi(r.jobs);
    const completed = pi(r.completed_count);
    const eligible  = pi(r.eligible_count);

    return {
      service:               r.service_type,
      jobs,
      earnedRevenue:         earned,
      collectedRevenue:      collected,
      avgTicket:             jobs > 0 ? earned / jobs : null,
      grossProfit:           null,
      grossProfitStatus:     'unavailable',
      margin:                null,
      marginStatus:          'unavailable',
      laborHours:            Math.round(hours * 10) / 10,
      revenuePerLaborHour:   hours > 0.01 ? earned / hours : null,
      completionRate:        eligible > 0 ? completed / eligible : null,
      revenueShare:          totalRevenue > 0 ? (earned / totalRevenue) * 100 : 0,
    };
  });
}

// ── Risk & Opportunity items ──────────────────────────────────────────────────

async function riskItems(accountId, start, end) {
  const items = [];

  const [overdueRows, failedRows, cancelRows] = await Promise.all([
    pool.query(
      `SELECT i.id, i.amount, i.due_date, c.name AS client_name
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
       WHERE i.account_id = $1
         AND i.status = 'pending'
         AND i.due_date IS NOT NULL
         AND i.due_date < NOW()
       ORDER BY i.due_date ASC
       LIMIT 20`,
      [accountId]
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
       FROM invoices WHERE account_id = $1 AND status = 'failed'`,
      [accountId]
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
       FROM jobs
       WHERE account_id = $1
         AND status = 'cancelled'
         AND amount IS NOT NULL AND amount > 0
         AND scheduled_at >= $2::date
         AND scheduled_at <  ($3::date + INTERVAL '1 day')`,
      [accountId, start, end]
    ),
  ]);

  if (overdueRows.rows.length > 0) {
    const totalOverdue = overdueRows.rows.reduce((s, r) => s + pf(r.amount), 0);
    items.push({
      category: 'risk',
      type:     'overdue_invoices',
      label:    'Overdue invoices',
      value:    totalOverdue,
      count:    overdueRows.rows.length,
      reason:   'Invoices past their due date and still unpaid.',
      action:   'View invoices',
      route:    '/invoices',
    });
  }

  const failedTotal = pf(failedRows.rows[0].total);
  const failedCount = pi(failedRows.rows[0].cnt);
  if (failedCount > 0) {
    items.push({
      category: 'risk',
      type:     'failed_payments',
      label:    'Failed payment attempts',
      value:    failedTotal,
      count:    failedCount,
      reason:   'Invoice payment failed — card declined or processing error.',
      action:   'Retry payments',
      route:    '/invoices',
    });
  }

  const cancelTotal = pf(cancelRows.rows[0].total);
  const cancelCount = pi(cancelRows.rows[0].cnt);
  if (cancelCount > 0) {
    items.push({
      category: 'risk',
      type:     'cancelled_jobs',
      label:    'Cancelled job value',
      value:    cancelTotal,
      count:    cancelCount,
      reason:   'Jobs cancelled in this period. Some may be recoverable.',
      action:   'View jobs',
      route:    '/jobs',
    });
  }

  return items;
}

async function opportunityItems(accountId) {
  const items = [];

  const [estRows, dueRows] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(e.amount), 0) AS total, COUNT(*) AS cnt
       FROM estimates e
       WHERE e.account_id = $1
         AND e.status = 'signed'
         AND NOT EXISTS (
           SELECT 1 FROM jobs j
           WHERE j.client_id  = e.client_id
             AND j.status NOT IN ('cancelled')
             AND j.created_at >= e.signed_at
         )`,
      [accountId]
    ),
    pool.query(
      `SELECT COUNT(DISTINCT c.id) AS cnt
       FROM clients c
       WHERE c.account_id = $1
         AND EXISTS (
           SELECT 1 FROM jobs j
           WHERE j.client_id    = c.id
             AND j.status       = 'complete'
             AND j.scheduled_at >= NOW() - INTERVAL '18 months'
             AND j.scheduled_at <  NOW() - INTERVAL '6 months'
         )
         AND NOT EXISTS (
           SELECT 1 FROM jobs j2
           WHERE j2.client_id  = c.id
             AND j2.scheduled_at > NOW()
             AND j2.status NOT IN ('cancelled')
         )`,
      [accountId]
    ),
  ]);

  const estCount = pi(estRows.rows[0].cnt);
  if (estCount > 0) {
    items.push({
      category: 'opportunity',
      type:     'accepted_estimate_not_scheduled',
      label:    'Accepted estimates not yet scheduled',
      value:    pf(estRows.rows[0].total),
      count:    estCount,
      reason:   'Client signed estimate but no follow-up job has been scheduled.',
      action:   'View estimates',
      route:    '/estimates',
    });
  }

  const dueCount = pi(dueRows.rows[0].cnt);
  if (dueCount > 0) {
    items.push({
      category: 'opportunity',
      type:     'repeat_client_due',
      label:    'Repeat clients due for service',
      value:    null,
      count:    dueCount,
      reason:   'Completed work 6–18 months ago with no future appointment booked.',
      action:   'View clients',
      route:    '/clients',
    });
  }

  return items;
}

// ── Rule-based insights ───────────────────────────────────────────────────────

function buildInsights(primaryKpis, compPrimaryKpis, services, risk) {
  const candidates = [];

  // Period-over-period earned revenue change
  if (compPrimaryKpis && primaryKpis.earnedRevenue.status === 'ok' &&
      compPrimaryKpis.earnedRevenue.status === 'ok') {
    const cur  = primaryKpis.earnedRevenue.value;
    const prev = compPrimaryKpis.earnedRevenue.value;
    if (prev > 0) {
      const pct = ((cur - prev) / prev) * 100;
      if (Math.abs(pct) >= 5) {
        candidates.push({
          id:    'revenue_period_change',
          text:  pct >= 0
            ? `Earned revenue is up ${Math.abs(pct).toFixed(0)}% versus the comparison period ($${cur.toFixed(0)} vs $${prev.toFixed(0)}).`
            : `Earned revenue is down ${Math.abs(pct).toFixed(0)}% versus the comparison period ($${cur.toFixed(0)} vs $${prev.toFixed(0)}).`,
          tone:  pct >= 0 ? 'positive' : 'warning',
          route: null,
          priority: 10,
        });
      }
    }
  }

  // Overdue AR
  if (primaryKpis.outstandingAr.overdueTotal > 0) {
    const amt = primaryKpis.outstandingAr.overdueTotal;
    candidates.push({
      id:       'overdue_ar',
      text:     `$${amt.toFixed(2)} in overdue invoices (${primaryKpis.outstandingAr.overdueCount}) require follow-up.`,
      tone:     'critical',
      route:    '/invoices',
      priority: 20,
    });
  }

  // Top service concentration
  if (services.length > 0 && primaryKpis.earnedRevenue.value > 0) {
    const top = services[0];
    const pct = Math.round(top.revenueShare);
    if (pct >= 25) {
      candidates.push({
        id:       'top_service',
        text:     `${top.service} produced ${pct}% of earned revenue this period.`,
        tone:     'neutral',
        route:    null,
        priority: 30,
      });
    }
  }

  // Low completion rate
  if (primaryKpis.completionRate?.status === 'ok' && primaryKpis.completionRate.value < 0.75) {
    candidates.push({
      id:       'low_completion',
      text:     `Completion rate is ${Math.round(primaryKpis.completionRate.pct)}% — cancellations may be reducing earned revenue.`,
      tone:     'warning',
      route:    null,
      priority: 25,
    });
  }

  // Revenue at risk
  if (primaryKpis.revenueAtRisk?.value > 0) {
    candidates.push({
      id:       'revenue_at_risk',
      text:     `$${primaryKpis.revenueAtRisk.value.toFixed(2)} in revenue at risk from ${risk.map(r => r.label.toLowerCase()).join(', ')}.`,
      tone:     'warning',
      route:    '/invoices',
      priority: 15,
    });
  }

  candidates.sort((a, b) => a.priority - b.priority);

  if (candidates.length === 0) {
    return [{
      id:   'no_insight',
      text: 'No meaningful insight yet — add more data to see trends.',
      tone: 'neutral',
      route: null,
    }];
  }

  return candidates.slice(0, 3);
}

// ── Comparison delta helper ───────────────────────────────────────────────────

function buildDelta(current, prior) {
  if (prior == null || prior === 0 || current == null) return null;
  const change = current - prior;
  const pct    = (change / Math.abs(prior)) * 100;
  return { change, pct, direction: pct >= 0 ? 'up' : 'down' };
}

// ── Public: getOverview ───────────────────────────────────────────────────────

async function getOverview(accountId, { start, end, comparison }) {
  const period = defaultPeriod();
  const s = start || period.start;
  const e = end   || period.end;
  const compRange = getComparisonRange(s, e, comparison);

  const calculatedAt = new Date().toISOString();

  // Current period
  const [
    ev, cr, gp, ar, proj,
    at, rplh, compRate, tu, rr, rar,
    services, risk, opps,
  ] = await Promise.all([
    earnedRevenue(accountId, s, e),
    collectedRevenue(accountId, s, e),
    grossProfit(),
    outstandingAr(accountId),
    projectedMonthEnd(accountId),
    averageTicket(accountId, s, e),
    revenuePerLaborHour(accountId, s, e),
    completionRate(accountId, s, e),
    technicianUtilization(),
    repeatRevenue(accountId, s, e),
    revenueAtRisk(accountId, s, e),
    serviceBreakdown(accountId, s, e),
    riskItems(accountId, s, e),
    opportunityItems(accountId),
  ]);

  // Comparison period (if requested)
  let compPrimary = null;
  if (compRange) {
    const [cev, ccr] = await Promise.all([
      earnedRevenue(accountId, compRange.start, compRange.end),
      collectedRevenue(accountId, compRange.start, compRange.end),
    ]);
    compPrimary = {
      earnedRevenue:    cev,
      collectedRevenue: ccr,
    };
  }

  const primaryKpis = {
    collectedRevenue: { ...cr, comparison: compPrimary ? buildDelta(cr.value, compPrimary.collectedRevenue.value) : null },
    earnedRevenue:    { ...ev, comparison: compPrimary ? buildDelta(ev.value, compPrimary.earnedRevenue.value)    : null },
    grossProfit:      gp,
    outstandingAr:    ar,
    projectedMonthEnd: proj,
    // completionRate accessible for insights
    completionRate:   compRate,
    revenueAtRisk:    rar,
  };

  const secondaryKpis = {
    averageTicket:          at,
    revenuePerLaborHour:    rplh,
    completionRate:         compRate,
    technicianUtilization:  tu,
    repeatRevenue:          rr,
    revenueAtRisk:          rar,
  };

  const insights = buildInsights(primaryKpis, compPrimary, services, risk);

  const limitations = [
    'Gross profit unavailable — no direct cost source configured.',
    'Technician utilization unavailable — workforce availability not configured.',
    'Revenue per labor hour uses scheduled duration, not recorded time.',
    'Period boundaries are UTC-based (tenant timezone support in Phase 2).',
  ];

  return {
    period:          { start: s, end: e },
    comparisonPeriod: compRange ? { ...compRange, type: comparison } : null,
    primaryKpis,
    secondaryKpis,
    services,
    risk,
    opportunities: opps,
    insights,
    freshness: {
      calculatedAt,
      staleAfter: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
    limitations,
  };
}

// ── Public: getTrend ──────────────────────────────────────────────────────────

async function getTrend(accountId, { start, end, interval, comparison }) {
  const period = defaultPeriod();
  const s = start || period.start;
  const e = end   || period.end;
  const iv = ['daily', 'weekly', 'monthly'].includes(interval) ? interval : 'daily';
  const compRange = getComparisonRange(s, e, comparison);

  return trendData(accountId, s, e, iv, compRange?.start, compRange?.end);
}

// ── Public: getServices ───────────────────────────────────────────────────────

async function getServices(accountId, { start, end }) {
  const period = defaultPeriod();
  return serviceBreakdown(accountId, start || period.start, end || period.end);
}

// ── Public: getRisk ───────────────────────────────────────────────────────────

async function getRisk(accountId, { start, end }) {
  const period = defaultPeriod();
  const s = start || period.start;
  const e = end   || period.end;
  const [risk, opps] = await Promise.all([riskItems(accountId, s, e), opportunityItems(accountId)]);
  return { risk, opportunities: opps };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  getOverview,
  getTrend,
  getServices,
  getRisk,
  getComparisonRange,
  defaultPeriod,
  // exported for tests
  _earnedRevenue:        earnedRevenue,
  _collectedRevenue:     collectedRevenue,
  _outstandingAr:        outstandingAr,
  _averageTicket:        averageTicket,
  _completionRate:       completionRate,
  _repeatRevenue:        repeatRevenue,
  _revenueAtRisk:        revenueAtRisk,
  _grossProfit:          grossProfit,
  _technicianUtilization: technicianUtilization,
};
