'use strict';
const pool = require('../db/pool');

function pi(v) { return parseInt(v, 10) || 0; }
function pf(v) { return Math.round((parseFloat(v) || 0) * 100) / 100; }

function defaultRange() {
  const now = new Date();
  const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start: s.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
}

const REASON_LABELS = {
  customer_cancelled:    'Customer Cancelled',
  customer_unavailable:  'Customer Unavailable',
  weather:               'Weather',
  tech_unavailable:      'Technician Unavailable',
  scheduling_conflict:   'Scheduling Conflict',
  duplicate_booking:     'Duplicate Booking',
  payment_issue:         'Payment Issue',
  other:                 'Other',
};

async function getCompletionAnalysis(accountId, { start, end }) {
  const { start: ds, end: de } = defaultRange();
  const s = start || ds;
  const e = end   || de;

  // Overall status counts in period
  const { rows: statusRows } = await pool.query(
    `SELECT status, COUNT(*)::int AS cnt, COALESCE(SUM(amount), 0) AS amt
     FROM jobs
     WHERE account_id = $1
       AND scheduled_at >= $2::date
       AND scheduled_at <  ($3::date + INTERVAL '1 day')
     GROUP BY status`,
    [accountId, s, e]
  );

  const byStatus = {};
  for (const r of statusRows) byStatus[r.status] = { count: pi(r.cnt), amount: pf(r.amt) };

  const completed  = byStatus.complete?.count   || 0;
  const cancelled  = byStatus.cancelled?.count  || 0;
  const noShows    = byStatus.no_show?.count     || 0;
  const scheduled  = Object.entries(byStatus).reduce((t, [k, v]) =>
    !['complete','cancelled','no_show'].includes(k) ? t + v.count : t, 0);

  const eligible       = completed + cancelled + noShows;
  const completionRate = eligible > 0 ? completed / eligible : null;
  const revenueImpact  = pf((byStatus.cancelled?.amount || 0) + (byStatus.no_show?.amount || 0));

  // Service-level breakdown
  const { rows: svcRows } = await pool.query(
    `SELECT
       COALESCE(service_type, 'Unspecified') AS service,
       COUNT(*) FILTER (WHERE status = 'complete')::int                                   AS completed,
       COUNT(*) FILTER (WHERE status = 'cancelled')::int                                  AS cancelled,
       COUNT(*) FILTER (WHERE status = 'no_show')::int                                    AS no_shows,
       COUNT(*) FILTER (WHERE status IN ('complete','cancelled','no_show'))::int           AS eligible
     FROM jobs
     WHERE account_id = $1
       AND scheduled_at >= $2::date
       AND scheduled_at <  ($3::date + INTERVAL '1 day')
     GROUP BY service_type
     ORDER BY completed DESC
     LIMIT 10`,
    [accountId, s, e]
  );

  // Cancellation reasons from job_status_history (graceful if table absent)
  let cancellationReasons = [];
  let reasonsCaptured = false;
  try {
    const { rows: reasonRows } = await pool.query(
      `SELECT COALESCE(reason_code, 'not_captured') AS reason_code, COUNT(*)::int AS cnt
       FROM job_status_history
       WHERE account_id = $1
         AND to_status   = 'cancelled'
         AND changed_at >= $2::date
         AND changed_at <  ($3::date + INTERVAL '1 day')
       GROUP BY reason_code
       ORDER BY cnt DESC`,
      [accountId, s, e]
    );
    if (reasonRows.length > 0) {
      cancellationReasons = reasonRows.map(r => ({
        code:  r.reason_code,
        label: REASON_LABELS[r.reason_code] || r.reason_code,
        count: r.cnt,
      }));
      reasonsCaptured = reasonRows.some(r => r.reason_code !== 'not_captured');
    }
  } catch { /* table may not exist */ }

  const limitations = [];
  if (!reasonsCaptured && cancelled > 0) {
    limitations.push({
      code: 'cancellation_reasons_not_captured',
      severity: 'info',
      description: 'Cancellation reason codes not yet captured — requires job status history events on cancellation.',
    });
  }

  return {
    period: { start: s, end: e },
    summary: {
      scheduled,
      completed,
      cancelled,
      noShows,
      eligible,
      completionRate,
      cancelledRevenue: byStatus.cancelled?.amount || 0,
      noShowRevenue:    byStatus.no_show?.amount    || 0,
      revenueImpact,
    },
    byService: svcRows.map(r => ({
      service:        r.service,
      completed:      pi(r.completed),
      cancelled:      pi(r.cancelled),
      noShows:        pi(r.no_shows),
      eligible:       pi(r.eligible),
      completionRate: pi(r.eligible) > 0 ? pi(r.completed) / pi(r.eligible) : null,
    })),
    cancellationReasons,
    limitations,
    provenance: {
      formula:  'Completion Rate = completed / (completed + cancelled + no_show) for jobs scheduled in period',
      sources:  ['jobs', 'job_status_history'],
      note:     'Future-scheduled jobs excluded from completion rate denominator.',
    },
  };
}

module.exports = { getCompletionAnalysis };
