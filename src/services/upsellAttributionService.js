'use strict';
const pool = require('../db/pool');

function pf(v) { return Math.round((parseFloat(v) || 0) * 100) / 100; }
function pi(v) { return parseInt(v, 10) || 0; }

function defaultRange() {
  const now = new Date();
  const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start: s.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
}

// Returns total upsell revenue for the KPI card.
// Returns status:'ok' with value:0 when infrastructure exists but no attributions.
async function getUpsellKpi(accountId, { start, end }) {
  const { start: ds, end: de } = defaultRange();
  const s = start || ds;
  const e = end   || de;
  try {
    const { rows: [row] } = await pool.query(
      `SELECT COALESCE(SUM(upsell_amount), 0) AS total
       FROM job_upsell_attributions
       WHERE account_id = $1
         AND attribution_type = 'UPSELL'
         AND sold_at >= $2::date
         AND sold_at <  ($3::date + INTERVAL '1 day')`,
      [accountId, s, e]
    );
    return { value: pf(row.total), status: 'ok' };
  } catch {
    return { value: null, status: 'unavailable',
      note: 'Upsell attribution tables not yet initialized.' };
  }
}

// Returns per-member upsell attribution summary for the Sales & Upsell section.
async function getUpsellSummary(accountId, { start, end }) {
  const { start: ds, end: de } = defaultRange();
  const s = start || ds;
  const e = end   || de;

  try {
    // Per-member upsell totals (UPSELL type only for V1)
    const { rows: upsellRows } = await pool.query(
      `SELECT
         u.id                                   AS user_id,
         u.name                                 AS member_name,
         u.role                                 AS user_role,
         COUNT(DISTINCT jua.job_id)::int        AS upsell_count,
         COALESCE(SUM(jua.upsell_amount), 0)   AS upsell_revenue,
         COALESCE(AVG(jua.upsell_amount), 0)   AS avg_upsell
       FROM job_upsell_attributions jua
       JOIN users u ON u.id = jua.sold_by_user_id AND u.account_id = $1
       WHERE jua.account_id = $1
         AND jua.attribution_type = 'UPSELL'
         AND jua.sold_at >= $2::date
         AND jua.sold_at <  ($3::date + INTERVAL '1 day')
       GROUP BY u.id, u.name, u.role
       ORDER BY upsell_revenue DESC`,
      [accountId, s, e]
    );

    // Original sales per seller (from job_original_scope)
    const { rows: origRows } = await pool.query(
      `SELECT
         jos.sold_by_user_id                    AS user_id,
         COALESCE(SUM(jos.original_amount), 0)  AS original_sales
       FROM job_original_scope jos
       JOIN jobs j ON j.id = jos.job_id AND j.account_id = $1
       WHERE jos.account_id = $1
         AND j.scheduled_at >= $2::date
         AND j.scheduled_at <  ($3::date + INTERVAL '1 day')
       GROUP BY jos.sold_by_user_id`,
      [accountId, s, e]
    );

    const origByUser = {};
    for (const r of origRows) {
      origByUser[r.user_id] = pf(r.original_sales);
    }

    let commByUser = {};
    try {
      const { rows: commRows } = await pool.query(
        `SELECT ce.user_id, COALESCE(SUM(ce.commission_amount), 0) AS commission_owed
         FROM commission_entries ce
         WHERE ce.account_id = $1
           AND ce.status IN ('pending', 'approved', 'payable')
           AND ce.earned_at >= $2::date
           AND ce.earned_at <  ($3::date + INTERVAL '1 day')
         GROUP BY ce.user_id`,
        [accountId, s, e]
      );
      for (const r of commRows) {
        commByUser[r.user_id] = pf(r.commission_owed);
      }
    } catch { /* commission_entries may not exist yet */ }

    const members = upsellRows.map(r => {
      const orig   = origByUser[r.user_id] || 0;
      const upsell = pf(r.upsell_revenue);
      return {
        userId:          r.user_id,
        name:            r.member_name,
        userRole:        r.user_role,
        originalSales:   orig,
        upsellRevenue:   upsell,
        upsellCount:     pi(r.upsell_count),
        avgUpsell:       pf(r.avg_upsell),
        finalJobValue:   pf(orig + upsell),
        commissionOwed:  commByUser[r.user_id] ?? null,
      };
    });

    return {
      period:         { start: s, end: e },
      members,
      total: {
        originalSales: pf(members.reduce((t, m) => t + m.originalSales, 0)),
        upsellRevenue: pf(members.reduce((t, m) => t + m.upsellRevenue, 0)),
        upsellCount:   members.reduce((t, m) => t + m.upsellCount, 0),
      },
      hasAttribution:  true,
      historicalNote:  'Jobs created before upsell attribution was enabled cannot be retroactively attributed.',
    };
  } catch {
    return {
      period:         { start: s, end: e },
      members:        [],
      total:          { originalSales: 0, upsellRevenue: 0, upsellCount: 0 },
      hasAttribution: false,
      historicalNote: null,
    };
  }
}

module.exports = { getUpsellKpi, getUpsellSummary };
