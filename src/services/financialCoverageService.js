'use strict';
const { getFieldCorePaymentsStatus } = require('./fieldcorePaymentsService');

// ── Source definitions ────────────────────────────────────────────────────────
// Capabilities each source provides when active.

const SOURCE_DEFS = {
  fieldcore_core: {
    sourceKey:     'fieldcore_core',
    providerLabel: 'FieldCore Core',
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
  { key: 'ar',               label: 'Accounts Receivable', required: ['ar']                                },
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
// FieldCore Core is always active.
// FieldCore Payments status comes from accounts.stripe_connect_status.
// Accounting and Banking are NOT_CONNECTED until OAuth is established.

async function resolveSourceStatuses(accountId) {
  const now = new Date().toISOString();
  const paymentsStatus = await getFieldCorePaymentsStatus(accountId);

  // Map FieldCore Payments internal status → source status string
  const fcPaymentsSourceStatus =
    paymentsStatus.status === 'ACTIVE'   ? 'active'      :
    paymentsStatus.status === 'DEGRADED' ? 'degraded'    :
    /* NOT_ENABLED / ERROR */              'not_enabled';

  return {
    fieldcore_core: {
      ...SOURCE_DEFS.fieldcore_core,
      status:        'active',
      lastSyncAt:    now,
    },
    fieldcore_payments: {
      ...SOURCE_DEFS.fieldcore_payments,
      status:        fcPaymentsSourceStatus,
      lastSyncAt:    paymentsStatus.status === 'ACTIVE' ? now : null,
      paymentsStatus,
    },
    accounting: {
      ...SOURCE_DEFS.accounting,
      status:        'not_connected',
      lastSyncAt:    null,
    },
    banking: {
      ...SOURCE_DEFS.banking,
      status:        'not_connected',
      lastSyncAt:    null,
    },
  };
}

// ── Coverage evaluator ────────────────────────────────────────────────────────

function evaluateCoverage(sourceStatuses) {
  const activeCaps      = new Set();
  const activeSources   = [];
  const optionalSources = [];
  const notEnabledSources = [];

  for (const [, src] of Object.entries(sourceStatuses)) {
    const baseEntry = {
      sourceKey:      src.sourceKey,
      providerLabel:  src.providerLabel,
      status:         src.status,
      capabilities:   src.capabilities,
      paymentsStatus: src.paymentsStatus || null,
    };

    if (src.status === 'active') {
      src.capabilities.forEach(c => activeCaps.add(c));
      activeSources.push(baseEntry);
    } else if (src.optional) {
      optionalSources.push(baseEntry);
    } else {
      // Non-optional but not active — e.g., FieldCore Payments NOT_ENABLED/DEGRADED
      notEnabledSources.push(baseEntry);
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

  const total   = availableMetrics.length + partialMetrics.length + unavailableMetrics.length;
  const covered = availableMetrics.length + partialMetrics.length;
  const ratio   = total > 0 ? covered / total : 0;

  let coverageState;
  if (ratio >= 1.0)        coverageState = 'complete';
  else if (ratio >= 0.7)   coverageState = 'strong';
  else if (ratio >= 0.35)  coverageState = 'partial';
  else                     coverageState = 'limited';

  const activeLabels    = activeSources.map(s => s.providerLabel).join(' and ');
  const connectableLabels = optionalSources.map(s => s.providerLabel).join(' and ');
  const notEnabledLabels  = notEnabledSources.map(s => s.providerLabel).join(' and ');

  let explanation;
  if (coverageState === 'complete') {
    explanation = 'All configured financial data sources are active.';
  } else if (notEnabledLabels) {
    explanation = `${activeLabels} data is active. Enable ${notEnabledLabels} for payment analytics.${connectableLabels ? ` Connect ${connectableLabels} for profit and expense analytics.` : ''}`;
  } else if (coverageState === 'partial' || coverageState === 'strong') {
    explanation = `${activeLabels} data is active.${connectableLabels ? ` Connect ${connectableLabels} to unlock additional profit, expense, and cash-flow analytics.` : ''}`;
  } else {
    explanation = 'Limited financial data available. Connect data sources to unlock analytics.';
  }

  return {
    coverageState,
    activeSources,
    optionalSources,
    notEnabledSources,
    availableMetrics,
    partialMetrics,
    unavailableMetrics,
    explanation,
  };
}

// ── Reconciliation note ───────────────────────────────────────────────────────
// When an accounting provider IS connected, cash-flow and payment records must
// be de-duplicated by (invoiceId | depositId | sourceRecordId) before summing.
// Implementation: cashFlowService applies a LEFT JOIN dedup when accountingActive=true.
// (Currently a no-op since no accounting provider is connected.)

async function getFinancialCoverage(accountId) {
  const statuses = await resolveSourceStatuses(accountId);
  return evaluateCoverage(statuses);
}

module.exports = { getFinancialCoverage, resolveSourceStatuses, evaluateCoverage };
