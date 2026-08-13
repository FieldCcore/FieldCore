'use strict';
const { getComparisonRange, defaultPeriod, getQuarterly } = require('./revenueAnalyticsService');
const { getArAging }       = require('./arAgingService');
const { getCashFlow }      = require('./cashFlowService');
const { getProfitability } = require('./profitabilityService');

function buildPnlRows(prof) {
  const gr = prof.grossRevenue;

  return [
    { key: 'grossRevenue',      label: 'Gross Revenue',       value: gr.value,   status: gr.status },
    { key: 'refunds',           label: 'Refunds & Credits',   value: null,       status: 'unavailable', note: 'Requires refunded_at column on deposits table.' },
    { key: 'netRevenue',        label: 'Net Revenue',         value: gr.value,   status: gr.status != null ? gr.status : 'unavailable' },
    { key: 'cogs',              label: 'COGS',                value: null,       status: 'unavailable', missingSources: prof.cogs.missingSources },
    { key: 'grossProfit',       label: 'Gross Profit',        value: null,       status: 'unavailable' },
    { key: 'grossMargin',       label: 'Gross Margin %',      value: null,       status: 'unavailable' },
    { key: 'operatingExpenses', label: 'Operating Expenses',  value: null,       status: 'unavailable' },
    { key: 'operatingProfit',   label: 'Operating Profit',    value: null,       status: 'unavailable' },
    { key: 'merchantFees',      label: 'Merchant Fees',       value: null,       status: 'unavailable' },
    { key: 'taxes',             label: 'Taxes',               value: null,       status: 'unavailable' },
    { key: 'netProfit',         label: 'Net Profit',          value: null,       status: 'unavailable' },
    { key: 'netMargin',         label: 'Net Margin %',        value: null,       status: 'unavailable' },
  ];
}

function buildDataQuality() {
  return {
    state: 'partial',
    limitationCount: 3,
    limitations: [
      {
        code:            'cogs_unavailable',
        severity:        'warning',
        title:           'COGS Not Connected',
        description:     'Connect an accounting integration to calculate gross profit, gross margin, and net profit.',
        metricKeys:      ['grossProfit', 'grossMargin', 'netProfit', 'netMargin'],
        source:          'accounting_integration',
        actionAvailable: false,
      },
      {
        code:            'cash_out_unavailable',
        severity:        'warning',
        title:           'Cash Out Not Available',
        description:     'Connect banking or expense tracking to see net cash flow.',
        metricKeys:      ['cashOut', 'netCashFlow'],
        source:          'banking_integration',
        actionAvailable: false,
      },
      {
        code:            'ar_aging_proxy_due_date',
        severity:        'info',
        title:           'AR Aging Uses Net-30 Proxy',
        description:     'Due dates estimated as 30 days from invoice sent date. Set explicit due dates for accuracy.',
        metricKeys:      ['arAging'],
        source:          'invoice_due_date',
        actionAvailable: false,
      },
    ],
    missingSources:  ['accounting_integration', 'banking_integration'],
    missingPolicies: [],
  };
}

async function getFinancials(accountId, { start, end, comparison } = {}) {
  const period = defaultPeriod();
  const s = start || period.start;
  const e = end   || period.end;
  const compRange = getComparisonRange(s, e, comparison);
  const year = new Date(s + 'T00:00:00Z').getUTCFullYear();

  const [prof, arAging, cashFlow, quarterly] = await Promise.all([
    getProfitability(accountId, s, e),
    getArAging(accountId),
    getCashFlow(accountId, s, e),
    getQuarterly(accountId, { year }),
  ]);

  let compGrossRevenue = null;
  if (compRange) {
    const compProf = await getProfitability(accountId, compRange.start, compRange.end);
    compGrossRevenue = compProf.grossRevenue;
  }

  const pnlRows    = buildPnlRows(prof);
  const dataQuality = buildDataQuality();

  const providers = [
    { key: 'quickbooks', label: 'QuickBooks', status: 'not_connected', capabilities: ['cogs', 'expenses', 'pl', 'taxes']              },
    { key: 'xero',       label: 'Xero',       status: 'not_connected', capabilities: ['cogs', 'expenses', 'pl', 'taxes']              },
    { key: 'banking',    label: 'Banking',    status: 'not_connected', capabilities: ['transactions', 'cash_flow', 'reconciliation']   },
    { key: 'stripe',     label: 'Stripe',     status: 'not_connected', capabilities: ['payments', 'merchant_fees', 'refunds']         },
  ];

  return {
    period:           { start: s, end: e },
    comparisonPeriod: compRange ? { ...compRange, type: comparison } : null,
    kpis: {
      grossRevenue:       prof.grossRevenue,
      grossProfit:        prof.grossProfit,
      netProfit:          prof.netProfit,
      grossMargin:        prof.grossMargin,
      netMargin:          prof.netMargin,
      operatingExpenses:  prof.operatingExpenses,
      cashIn:             cashFlow.cashIn,
      cashOut:            cashFlow.cashOut,
      netCashFlow:        cashFlow.netCashFlow,
      compGrossRevenue,
    },
    pnl: {
      rows:       pnlRows,
      setupGuide: prof.setupGuide,
    },
    arAging,
    cashFlow,
    quarterly,
    providers,
    dataQuality,
    calculatedAt: new Date().toISOString(),
  };
}

module.exports = { getFinancials };
