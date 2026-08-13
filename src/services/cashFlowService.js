'use strict';
const pool = require('../db/pool');

function pf(v) { return Math.round((parseFloat(v) || 0) * 100) / 10000; }
function pi(v) { return parseInt(v, 10) || 0; }

async function getCashFlow(accountId, start, end) {
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
  const cashIn   = Math.round((invTotal + depTotal) * 100) / 100;

  return {
    cashIn: {
      value:  cashIn,
      status: 'ok',
      breakdown: {
        invoices:     invTotal,
        invoiceCount: pi(invRes.rows[0].cnt),
        deposits:     depTotal,
        depositCount: pi(depRes.rows[0].cnt),
      },
    },
    cashOut: {
      value:         null,
      status:        'unavailable',
      missingSource: 'expense_tracking',
      note:          'Connect an accounting or expense integration to track cash outflows.',
    },
    netCashFlow: {
      value:  null,
      status: 'unavailable',
      reason: 'Cash Out unavailable — cannot compute Net Cash Flow.',
    },
    provenance: {
      formula:       'Cash In = paid invoices (paid_at) + collected deposits (collected_at)',
      sources:       ['invoices', 'deposits'],
      cashOutSources: ['None connected'],
      note:          'Cash Out and Net Cash Flow require an expense or banking integration.',
    },
  };
}

module.exports = { getCashFlow };
