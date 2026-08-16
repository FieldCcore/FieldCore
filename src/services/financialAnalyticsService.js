'use strict';
const { getComparisonRange, defaultPeriod, getQuarterly } = require('./revenueAnalyticsService');
const { getArAging }           = require('./arAgingService');
const { getCashFlow }          = require('./cashFlowService');
const { getProfitability }     = require('./profitabilityService');
const { getFinancialCoverage } = require('./financialCoverageService');

function buildPnlRows(prof) {
  const gr = prof.grossRevenue;
  return [
    { key: 'grossRevenue',      label: 'Gross Revenue',       value: gr.value,                      status: gr.status },
    { key: 'refunds',           label: 'Refunds & Credits',   value: null,                          status: 'unavailable' },
    { key: 'netRevenue',        label: 'Net Revenue',         value: gr.value,                      status: gr.status != null ? gr.status : 'unavailable' },
    { key: 'cogs',              label: 'COGS',                value: prof.cogs.value,               status: prof.cogs.status,              missingSources: prof.cogs.missingSources },
    { key: 'grossProfit',       label: 'Gross Profit',        value: prof.grossProfit.value,        status: prof.grossProfit.status },
    { key: 'grossMargin',       label: 'Gross Margin %',      value: prof.grossMargin.value,        status: prof.grossMargin.status },
    { key: 'operatingExpenses', label: 'Operating Expenses',  value: prof.operatingExpenses.value,  status: prof.operatingExpenses.status },
    { key: 'operatingProfit',   label: 'Operating Profit',    value: prof.operatingProfit.value,    status: prof.operatingProfit.status },
    { key: 'merchantFees',      label: 'Merchant Fees',       value: prof.merchantFees?.value,      status: prof.merchantFees?.status     || 'unavailable' },
    { key: 'taxes',             label: 'Taxes',               value: prof.taxes.value,              status: prof.taxes.status },
    { key: 'netProfit',         label: 'Net Profit',          value: prof.netProfit.value,          status: prof.netProfit.status },
    { key: 'netMargin',         label: 'Net Margin %',        value: prof.netMargin.value,          status: prof.netMargin.status },
  ];
}

// Data quality: only actual quality issues, not source connection state.
function buildDataQuality() {
  return {
    state: 'info',
    limitationCount: 1,
    limitations: [
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
    missingSources:  [],
    missingPolicies: ['explicit_due_dates'],
  };
}

async function getFinancials(accountId, { start, end, comparison } = {}) {
  const period = defaultPeriod();
  const s = start || period.start;
  const e = end   || period.end;
  const compRange = getComparisonRange(s, e, comparison);
  const year = new Date(s + 'T00:00:00Z').getUTCFullYear();

  const [prof, arAging, cashFlow, quarterly, coverage] = await Promise.all([
    getProfitability(accountId, s, e),
    getArAging(accountId),
    getCashFlow(accountId, s, e),
    getQuarterly(accountId, { year }),
    getFinancialCoverage(accountId),
  ]);

  let compGrossRevenue = null;
  if (compRange) {
    const compProf = await getProfitability(accountId, compRange.start, compRange.end);
    compGrossRevenue = compProf.grossRevenue;
  }

  const pnlRows    = buildPnlRows(prof);
  const dataQuality = buildDataQuality();

  // providers: flat list of all sources for backward compat
  const providers = [
    ...(coverage.activeSources    || []),
    ...(coverage.notEnabledSources || []),
    ...(coverage.optionalSources  || []),
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
    coverage,
    providers,
    dataQuality,
    calculatedAt: new Date().toISOString(),
  };
}

module.exports = { getFinancials };
