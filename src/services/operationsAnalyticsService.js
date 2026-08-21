'use strict';
const pool = require('../db/pool');

function pi(v) { return parseInt(v, 10) || 0; }
function pf(v) { return Math.round((parseFloat(v) || 0) * 100) / 100; }

function defaultRange() {
  const now = new Date();
  const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start: s.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
}

async function getOperationsKpis(accountId, { start, end }) {
  const { start: ds, end: de } = defaultRange();
  const s = start || ds;
  const e = end   || de;

  const { rows: [cr] } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'complete')::int                                 AS completed,
       COUNT(*) FILTER (WHERE status = 'cancelled')::int                                AS cancelled,
       COUNT(*) FILTER (WHERE status = 'no_show')::int                                  AS no_shows,
       COALESCE(SUM(amount) FILTER (WHERE status = 'complete'), 0)                      AS production_value,
       COALESCE(SUM(COALESCE(duration_minutes, 0)) FILTER (WHERE status = 'complete'), 0)::int AS total_minutes
     FROM jobs
     WHERE account_id = $1
       AND scheduled_at >= $2::date
       AND scheduled_at <  ($3::date + INTERVAL '1 day')`,
    [accountId, s, e]
  );

  const completed      = pi(cr.completed);
  const eligible       = completed + pi(cr.cancelled) + pi(cr.no_shows);
  const completionRate = eligible > 0 ? completed / eligible : null;
  const productionValue = pf(cr.production_value);
  const totalHours     = pi(cr.total_minutes) / 60;

  let commissionsOwed = null;
  try {
    const { rows: [comm] } = await pool.query(
      `SELECT COALESCE(SUM(commission_amount), 0) AS owed
       FROM commission_entries
       WHERE account_id = $1
         AND status IN ('pending','approved')
         AND created_at >= $2::date
         AND created_at <  ($3::date + INTERVAL '1 day')`,
      [accountId, s, e]
    );
    commissionsOwed = pf(comm.owed);
  } catch { /* commission_entries may not exist yet on first migration */ }

  const revPerHr = totalHours > 0
    ? { value: pf(productionValue / totalHours), basis: 'scheduled_labor_hours', status: 'ok' }
    : { value: null, status: 'unavailable', note: 'No completed labor hours in period.' };

  return {
    period:      { start: s, end: e },
    calculatedAt: new Date().toISOString(),
    kpis: {
      jobsCompleted:      { value: completed, status: 'ok' },
      completionRate:     completionRate != null
        ? { value: completionRate, status: 'ok' }
        : { value: null, status: 'unavailable', note: 'No eligible jobs in period.' },
      productionValue:    { value: productionValue, status: 'ok' },
      upsellRevenue:      { value: null, status: 'unavailable',
        note: 'Upsell tracking requires line-item attribution. Configure upsell line items to enable.' },
      commissionsOwed:    commissionsOwed != null
        ? { value: commissionsOwed, status: 'ok' }
        : { value: null, status: 'unavailable', note: 'No active commission rules configured.' },
      revenuePerLaborHour: revPerHr,
    },
    limitations: [
      { code: 'labor_hours_scheduled', severity: 'info',
        description: 'Labor hours use scheduled duration — actual time tracking not yet connected.' },
      { code: 'upsell_no_source', severity: 'info',
        description: 'Upsell revenue requires line-item level attribution to be configured.' },
    ],
  };
}

module.exports = { getOperationsKpis };
