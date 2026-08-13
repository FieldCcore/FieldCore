'use strict';

// ── Source definitions ────────────────────────────────────────────────────────
// Capabilities each source provides when active.

const SOURCE_DEFS = {
  fieldcore_core: {
    sourceKey:     'fieldcore_core',
    providerLabel: 'FieldCore',
    capabilities:  ['revenue', 'invoices', 'ar', 'jobs', 'customers', 'service_revenue'],
    required:      true,
    optional:      false,
  },
  fieldcore_payments: {
    sourceKey:     'fieldcore_payments',
    providerLabel: 'FieldCore Payments',
    capabilities:  ['payments', 'deposits', 'cash_in', 'refunds'],
    required:      false,
    optional:      false,
  },
  accounting: {
    sourceKey:     'accounting',
    providerLabel: 'Accounting',
    capabilities:  ['cogs', 'operating_expenses', 'taxes', 'vendor_expenses', 'reconciliation'],
    required:      false,
    optional:      true,
  },
  banking: {
    sourceKey:     'banking',
    providerLabel: 'Banking',
    capabilities:  ['bank_balances', 'cash_transactions', 'cash_out', 'reconciliation'],
    required:      false,
    optional:      true,
  },
};

// ── Metric requirements ───────────────────────────────────────────────────────
// Maps metric keys to the capabilities they need.

const METRIC_REQUIREMENTS = [
  { key: 'revenue',          label: 'Revenue',             required: ['revenue']                           },
  { key: 'invoices',         label: 'Invoices',            required: ['invoices']                          },
  { key: 'ar',               label: 'Accounts Receivable', required: ['ar']                               },
  { key: 'payments',         label: 'Payments',            required: ['payments']                          },
  { key: 'cash_in',          label: 'Cash In',             required: ['cash_in']                          },
  { key: 'merchant_fees',    label: 'Merchant Fees',       required: ['payments'],
    partial_note: 'Fee detail not yet available from FieldCore Payments.' },
  { key: 'gross_profit',     label: 'Gross Profit',        required: ['revenue', 'cogs'],
    missing_note: 'Direct cost data is required. Connect an accounting integration or configure cost tracking.' },
  { key: 'operating_profit', label: 'Operating Profit',    required: ['revenue', 'cogs', 'operating_expenses'],
    missing_note: 'Direct costs and operating expenses are required.'    },
  { key: 'net_profit',       label: 'Net Profit',          required: ['revenue', 'cogs', 'operating_expenses'],
    missing_note: 'Direct costs and operating expenses are required.'    },
  { key: 'cash_out',         label: 'Net Cash Flow',       required: ['cash_out'],
    missing_note: 'A banking or cash-tracking source is required.'       },
];

// ── Source status resolver ────────────────────────────────────────────────────
// FieldCore Core and FieldCore Payments are always active via native data.
// Accounting and Banking are NOT_CONNECTED until OAuth is established.

function resolveSourceStatuses() {
  const now = new Date().toISOString();
  return {
    fieldcore_core:     { ...SOURCE_DEFS.fieldcore_core,     status: 'active',        lastSyncAt: now  },
    fieldcore_payments: { ...SOURCE_DEFS.fieldcore_payments, status: 'active',        lastSyncAt: now  },
    accounting:         { ...SOURCE_DEFS.accounting,         status: 'not_connected', lastSyncAt: null },
    banking:            { ...SOURCE_DEFS.banking,            status: 'not_connected', lastSyncAt: null },
  };
}

// ── Coverage evaluator ────────────────────────────────────────────────────────

function evaluateCoverage(sourceStatuses) {
  const activeCaps    = new Set();
  const activeSources  = [];
  const optionalSources = [];

  for (const [, src] of Object.entries(sourceStatuses)) {
    if (src.status === 'active') {
      src.capabilities.forEach(c => activeCaps.add(c));
      activeSources.push({
        sourceKey:     src.sourceKey,
        providerLabel: src.providerLabel,
        status:        src.status,
        capabilities:  src.capabilities,
      });
    } else if (src.optional) {
      optionalSources.push({
        sourceKey:     src.sourceKey,
        providerLabel: src.providerLabel,
        status:        src.status,
        capabilities:  src.capabilities,
      });
    }
  }

  const availableMetrics   = [];
  const partialMetrics     = [];
  const unavailableMetrics = [];

  for (const metric of METRIC_REQUIREMENTS) {
    const hasAll = metric.required.every(c => activeCaps.has(c));
    if (hasAll) {
      if (metric.partial_note) {
        partialMetrics.push({ key: metric.key, label: metric.label, note: metric.partial_note });
      } else {
        availableMetrics.push({ key: metric.key, label: metric.label });
      }
    } else {
      const missingCaps = metric.required.filter(c => !activeCaps.has(c));
      unavailableMetrics.push({
        key:         metric.key,
        label:       metric.label,
        missingCaps,
        note:        metric.missing_note || `Requires: ${missingCaps.join(', ')}`,
      });
    }
  }

  const total    = availableMetrics.length + partialMetrics.length + unavailableMetrics.length;
  const covered  = availableMetrics.length + partialMetrics.length;
  const ratio    = total > 0 ? covered / total : 0;

  let coverageState;
  if (ratio >= 1.0)  coverageState = 'complete';
  else if (ratio >= 0.7) coverageState = 'strong';
  else if (ratio >= 0.35) coverageState = 'partial';
  else               coverageState = 'limited';

  const activeLabels   = activeSources.map(s => s.providerLabel).join(' and ');
  const optionalLabels = optionalSources.map(s => s.providerLabel).join(' and ');

  let explanation;
  if (coverageState === 'complete') {
    explanation = 'All configured financial data sources are active.';
  } else if (coverageState === 'partial' || coverageState === 'strong') {
    explanation = `${activeLabels} data is active.${optionalLabels ? ` Connect ${optionalLabels} to unlock additional profit, expense, and cash-flow analytics.` : ''}`;
  } else {
    explanation = 'Limited financial data available. Connect data sources to unlock analytics.';
  }

  return {
    coverageState,
    activeSources,
    optionalSources,
    availableMetrics,
    partialMetrics,
    unavailableMetrics,
    explanation,
  };
}

// ── Reconciliation note ───────────────────────────────────────────────────────
// When an accounting provider IS connected, cash-flow and payment records must
// be de-duplicated by (invoiceId | depositId | sourceRecordId) before summing.
// Transactions that arrive via both FieldCore Payments and accounting import
// are matched by invoice/deposit ID and counted once.
// Implementation: cashFlowService applies a LEFT JOIN dedup when accountingActive=true.
// (Currently a no-op since no accounting provider is connected.)

async function getFinancialCoverage(/* accountId */) {
  const statuses = resolveSourceStatuses();
  return evaluateCoverage(statuses);
}

module.exports = { getFinancialCoverage, resolveSourceStatuses, evaluateCoverage };
