'use strict';
const pool = require('../db/pool');

function pf(v) { return Math.round((parseFloat(v) || 0) * 100) / 10000; }

async function getArAging(accountId) {
  const [pendingRes, paidRes] = await Promise.all([
    pool.query(
      `SELECT
         i.amount,
         EXTRACT(EPOCH FROM (
           NOW() - COALESCE(i.due_date, COALESCE(i.sent_at, i.created_at) + INTERVAL '30 days')
         )) / 86400.0 AS days_past_due
       FROM invoices i
       WHERE i.account_id = $1
         AND i.status = 'pending'`,
      [accountId]
    ),
    pool.query(
      `SELECT ROUND(
         AVG(EXTRACT(EPOCH FROM (paid_at - created_at)) / 86400.0)::numeric, 1
       ) AS avg_days
       FROM invoices
       WHERE account_id = $1
         AND status = 'paid'
         AND paid_at IS NOT NULL
         AND created_at IS NOT NULL`,
      [accountId]
    ),
  ]);
  const rows = pendingRes.rows;

  const buckets = [
    { label: 'Current',    days: 'current',  amount: 0, count: 0 },
    { label: '1–30 days',  days: '1_30',     amount: 0, count: 0 },
    { label: '31–60 days', days: '31_60',    amount: 0, count: 0 },
    { label: '61–90 days', days: '61_90',    amount: 0, count: 0 },
    { label: '90+ days',   days: '90_plus',  amount: 0, count: 0 },
  ];

  let total = 0;
  let overdueTotal = 0;
  let overdueCount = 0;

  for (const row of rows) {
    const amt = pf(row.amount);
    const dpd = parseFloat(row.days_past_due) || 0;
    total += amt;

    let b;
    if (dpd <= 0)        b = buckets[0];
    else if (dpd <= 30)  { b = buckets[1]; overdueTotal += amt; overdueCount++; }
    else if (dpd <= 60)  { b = buckets[2]; overdueTotal += amt; overdueCount++; }
    else if (dpd <= 90)  { b = buckets[3]; overdueTotal += amt; overdueCount++; }
    else                 { b = buckets[4]; overdueTotal += amt; overdueCount++; }

    b.amount = Math.round((b.amount + amt) * 100) / 100;
    b.count++;
  }

  const avgDaysToPay = paidRes.rows[0].avg_days != null
    ? parseFloat(paidRes.rows[0].avg_days)
    : null;

  return {
    total:        Math.round(total * 100) / 100,
    buckets,
    invoiceCount: rows.length,
    overdueTotal: Math.round(overdueTotal * 100) / 100,
    overdueCount,
    avgDaysToPay,
    provenance: {
      formula:    'Pending invoices bucketed by days past COALESCE(due_date, sent_at + 30 days, created_at + 30 days)',
      sources:    ['invoices'],
      basis:      'Point-in-time — not filtered to selected period',
      note:       'Due date proxy is net-30 from sent date. Set explicit due_date on invoices for accuracy.',
    },
  };
}

module.exports = { getArAging };
