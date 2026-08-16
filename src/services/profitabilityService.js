'use strict';
const pool    = require('../db/pool');
const { getAccountingTotals } = require('./accountingSyncService');
const { getConnection }       = require('./accountingConnectionService');

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

function ok(value, formula, sources) {
  return {
    value,
    status: 'ok',
    provenance: { formula, sources: sources || ['quickbooks_online'] },
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

  // Check if QuickBooks is connected and has data
  const conn = await getConnection(accountId, 'quickbooks_online');
  const qbConnected = conn && ['connected', 'syncing', 'sync_error'].includes(conn.status);

  if (!qbConnected) {
    // No QB connection — all cost metrics unavailable
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

  // QB is connected — pull actual totals
  const totals = await getAccountingTotals(accountId, 'quickbooks_online', start, end);
  const {
    cogsCents, opexCents, taxCents,
    hasCOGSAccounts, hasOpExAccounts, hasTaxAccounts,
  } = totals;

  const grossRevVal  = grossRevenue.value || 0;

  // COGS
  let cogsMetric;
  if (hasCOGSAccounts) {
    const cogsVal = rnd(cogsCents / 100);
    cogsMetric = ok(cogsVal, 'SUM(direct cost accounts in period)', ['quickbooks_online']);
  } else {
    cogsMetric = unavailable(['COGS accounts'], {
      formula: 'Map COGS accounts in QuickBooks to enable this metric.',
      sources: ['quickbooks_online'],
      note:    'No accounts mapped to COGS category yet.',
    });
  }

  // Gross profit
  let grossProfitMetric;
  if (hasCOGSAccounts) {
    const gpVal = rnd(grossRevVal - (cogsCents / 100));
    grossProfitMetric = ok(gpVal, 'Gross Revenue − COGS');
  } else {
    grossProfitMetric = unavailable(MISSING_COST, {
      formula: 'Gross Revenue − COGS',
      sources: ['quickbooks_online'],
      note:    'Map COGS accounts to enable gross profit.',
    });
  }

  // Gross margin
  let grossMarginMetric;
  if (hasCOGSAccounts && grossRevVal > 0) {
    const gpVal = rnd(grossRevVal - (cogsCents / 100));
    const gm    = rnd((gpVal / grossRevVal) * 100);
    grossMarginMetric = ok(gm, 'Gross Profit ÷ Gross Revenue × 100');
  } else {
    grossMarginMetric = unavailable(MISSING_COST, {
      formula: 'Gross Profit ÷ Gross Revenue × 100',
      sources: ['quickbooks_online'],
    });
  }

  // Operating expenses
  let opexMetric;
  if (hasOpExAccounts) {
    opexMetric = ok(rnd(opexCents / 100), 'SUM(operating expense accounts in period)', ['quickbooks_online']);
  } else {
    opexMetric = unavailable(['operating expense tracking'], {
      formula: 'Map operating expense accounts in QuickBooks.',
      sources: ['quickbooks_online'],
      note:    'No accounts mapped to operating expenses yet.',
    });
  }

  // Operating profit
  let opProfitMetric;
  if (hasCOGSAccounts && hasOpExAccounts) {
    const gpVal  = rnd(grossRevVal - (cogsCents / 100));
    const opVal  = rnd(gpVal - (opexCents / 100));
    opProfitMetric = ok(opVal, 'Gross Profit − Operating Expenses');
  } else {
    opProfitMetric = unavailable(MISSING_COST, {
      formula: 'Gross Profit − Operating Expenses',
      sources: ['quickbooks_online'],
    });
  }

  // Taxes
  let taxesMetric;
  if (hasTaxAccounts) {
    taxesMetric = ok(rnd(taxCents / 100), 'SUM(tax accounts in period)', ['quickbooks_online']);
  } else {
    taxesMetric = unavailable(['tax integration'], {
      formula: 'Tax liability for the period',
      sources: ['quickbooks_online'],
      note:    'No accounts mapped to taxes yet.',
    });
  }

  // Net profit
  let netProfitMetric;
  if (hasCOGSAccounts && hasOpExAccounts) {
    const gpVal  = rnd(grossRevVal - (cogsCents / 100));
    const opVal  = rnd(gpVal - (opexCents / 100));
    const taxVal = hasTaxAccounts ? rnd(taxCents / 100) : 0;
    const npVal  = rnd(opVal - taxVal);
    netProfitMetric = ok(npVal, 'Operating Profit − Taxes');
  } else {
    netProfitMetric = unavailable(MISSING_COST, {
      formula: 'Gross Revenue − COGS − Operating Expenses − Taxes',
      sources: ['quickbooks_online'],
    });
  }

  // Net margin
  let netMarginMetric;
  if (hasCOGSAccounts && hasOpExAccounts && grossRevVal > 0) {
    const gpVal  = rnd(grossRevVal - (cogsCents / 100));
    const opVal  = rnd(gpVal - (opexCents / 100));
    const taxVal = hasTaxAccounts ? rnd(taxCents / 100) : 0;
    const npVal  = rnd(opVal - taxVal);
    const nm     = rnd((npVal / grossRevVal) * 100);
    netMarginMetric = ok(nm, 'Net Profit ÷ Gross Revenue × 100');
  } else {
    netMarginMetric = unavailable(MISSING_COST, {
      formula: 'Net Profit ÷ Gross Revenue × 100',
      sources: ['quickbooks_online'],
    });
  }

  return {
    grossRevenue,
    cogs:              cogsMetric,
    grossProfit:       grossProfitMetric,
    grossMargin:       grossMarginMetric,
    operatingExpenses: opexMetric,
    operatingProfit:   opProfitMetric,
    taxes:             taxesMetric,
    netProfit:         netProfitMetric,
    netMargin:         netMarginMetric,
    merchantFees: unavailable(['payment processor integration'], {
      formula: 'SUM(payment processing fees in period)',
      sources: ['quickbooks_online'],
      note:    'Fee detail requires an accounting integration.',
    }),
  };
}

module.exports = { getProfitability, getGrossRevenue };
