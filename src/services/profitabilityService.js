'use strict';
const pool = require('../db/pool');

function pf(v)  { return Math.round((parseFloat(v) || 0) * 100) / 10000; }
function pi(v)  { return parseInt(v, 10) || 0; }
function rnd(v) { return Math.round(v * 100) / 100; }

const MISSING_COST = ['labor costs', 'material costs', 'overhead', 'merchant fees'];
const ACCOUNTING_NOTE = 'Connect an accounting integration to unlock this metric.';

function unavailable(missingSources, provenance) {
  return {
    value: null,
    status: 'unavailable',
    missingSources: missingSources || MISSING_COST,
    provenance: provenance || {
      formula:    'Requires accounting integration',
      sources:    ['None connected'],
      note:       ACCOUNTING_NOTE,
    },
  };
}

async function getGrossRevenue(accountId, start, end) {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(amount), 0)      AS job_revenue,
       COALESCE(SUM(tip_amount), 0)  AS tips,
       COALESCE(SUM(travel_fee), 0)  AS travel_fees,
       COUNT(id)::int                AS job_count
     FROM jobs
     WHERE account_id = $1
       AND status = 'complete'
       AND scheduled_at >= $2::date
       AND scheduled_at <  ($3::date + INTERVAL '1 day')`,
    [accountId, start, end]
  );

  const jobRevenue = pf(rows[0].job_revenue);
  const tips       = pf(rows[0].tips);
  const travelFees = pf(rows[0].travel_fees);
  const gross      = rnd(jobRevenue + tips + travelFees);

  return {
    value:  gross,
    status: 'ok',
    breakdown: {
      jobs:       rnd(jobRevenue),
      tips:       rnd(tips),
      travelFees: rnd(travelFees),
      jobCount:   pi(rows[0].job_count),
    },
    provenance: {
      formula:    'SUM(jobs.amount + tip_amount + travel_fee WHERE status=complete)',
      sources:    ['jobs'],
      basis:      'job.scheduled_at (UTC)',
      exclusions: ['cancelled jobs', 'in-progress jobs'],
      note:       'Refund deduction requires refunded_at column on deposits table.',
    },
  };
}

async function getProfitability(accountId, start, end) {
  const grossRevenue = await getGrossRevenue(accountId, start, end);

  return {
    grossRevenue,
    cogs: unavailable(MISSING_COST, {
      formula:    'Direct Labor + Materials + Subcontractors + Other Direct Costs',
      sources:    ['None connected'],
      note:       ACCOUNTING_NOTE,
    }),
    grossProfit: unavailable(MISSING_COST, {
      formula:    'Gross Revenue − COGS',
      sources:    ['None connected'],
      note:       ACCOUNTING_NOTE,
    }),
    grossMargin: unavailable(MISSING_COST, {
      formula:    'Gross Profit ÷ Gross Revenue × 100',
      sources:    ['None connected'],
      note:       ACCOUNTING_NOTE,
    }),
    operatingExpenses: unavailable(['operating expense tracking'], {
      formula:    'SUM(categorized operating expenses in period)',
      sources:    ['None connected'],
      note:       ACCOUNTING_NOTE,
    }),
    operatingProfit: unavailable(MISSING_COST, {
      formula:    'Gross Profit − Operating Expenses',
      sources:    ['None connected'],
      note:       ACCOUNTING_NOTE,
    }),
    taxes: unavailable(['tax integration'], {
      formula:    'Tax liability for the period',
      sources:    ['None connected'],
      note:       'Connect a tax integration to track this metric.',
    }),
    netProfit: unavailable(MISSING_COST, {
      formula:    'Gross Revenue − COGS − Operating Expenses − Other Expenses',
      sources:    ['None connected'],
      note:       ACCOUNTING_NOTE,
    }),
    netMargin: unavailable(MISSING_COST, {
      formula:    'Net Profit ÷ Gross Revenue × 100',
      sources:    ['None connected'],
      note:       ACCOUNTING_NOTE,
    }),
    merchantFees: unavailable(['payment processor integration'], {
      formula:    'SUM(payment processing fees in period)',
      sources:    ['None connected'],
      note:       'Fee detail requires an accounting integration. Transaction data is available from FieldCore Payments.',
    }),
    setupGuide: {
      title: 'Connect your accounting software to unlock profitability',
      steps: [
        'Connect an accounting integration to import COGS and expense data.',
        'FieldCore Payments provides native transaction data; accounting data unlocks profit calculations.',
        'FieldCore will compute gross profit, operating profit, and net margin automatically.',
      ],
    },
  };
}

module.exports = { getProfitability, getGrossRevenue };
