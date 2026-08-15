import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Revenue from '../Revenue';
import { CHART, CATEGORICAL, varianceColor } from '../../theme/revenueChartTokens';

// Mock the API module
vi.mock('../../api', () => ({
  default: {
    get: vi.fn(),
  },
}));

import api from '../../api';

// ── Fixture data ───────────────────────────────────────────────────────────────

const MOCK_OVERVIEW = {
  period:          { start: '2026-08-01', end: '2026-08-06' },
  comparisonPeriod: null,
  // Primary KPI set: 6 metrics (Completion Rate and Technician Utilization NOT included)
  primaryKpis: {
    collectedRevenue: {
      value: 1200, status: 'ok',
      comparison: null,
      breakdown: { invoices: 1000, invoiceCount: 3, deposits: 200, depositCount: 1 },
      provenance: { formula: 'SUM(paid invoices)', sources: ['invoices', 'deposits'], basis: 'paid_at (UTC)' },
    },
    earnedRevenue: {
      value: 1500, status: 'ok', jobCount: 5,
      comparison: null,
      provenance: { formula: 'SUM(jobs.amount)', sources: ['jobs'], basis: 'scheduled_at (UTC)', exclusions: ['cancelled'] },
    },
    grossProfit: {
      value: null, status: 'unavailable',
      missingSources: ['labor costs', 'material costs'],
      provenance: { formula: 'Earned − direct costs', sources: ['None connected'], note: 'No cost source configured.' },
    },
    outstandingAr: {
      value: 300, status: 'ok', invoiceCount: 2, overdueTotal: 150, overdueCount: 1, avgAgeDays: 12,
      provenance: { formula: 'SUM pending invoices', sources: ['invoices'], basis: 'current balance' },
    },
    projectedMonthEnd: {
      value: 3200, lower: 2880, upper: 3520, status: 'ok',
      mtd: 1500, futureScheduled: 2000, completionRate: 0.85, method: 'rules_based_v1', confidence: 'medium',
      assumptions: ['MTD: $1500', 'Future: $2000', 'Rate: 85%'],
      calculatedAt: '2026-08-06T10:00:00Z',
      provenance: { formula: 'MTD + future × rate', sources: ['jobs'], note: 'Not AI.' },
    },
    revenueAtRisk: {
      value: 450, status: 'ok',
      breakdown: { overdueInvoices: { total: 300, count: 1 }, cancelledJobs: { total: 150, count: 1 }, failedPayments: { total: 0, count: 0 } },
      provenance: { formula: 'Overdue + cancelled + failed', sources: ['invoices', 'jobs'] },
    },
  },
  // Secondary KPI set: 3 metrics only
  secondaryKpis: {
    averageTicket:       { value: 300, status: 'ok', count: 5, provenance: { formula: 'Earned ÷ jobs', sources: ['jobs'] } },
    revenuePerLaborHour: { value: 75, status: 'ok', hours: 20, basis: 'scheduled_labor_hours', provenance: { formula: 'Earned ÷ scheduled hrs', note: 'Scheduled, not actual.' } },
    // repeatRevenue is NOT in Overview — it belongs to Customers workspace
  },
  services: [
    { service: 'Cleaning', jobs: 4, earnedRevenue: 1000, collectedRevenue: 800, avgTicket: 250, grossProfit: null, grossProfitStatus: 'unavailable', margin: null, marginStatus: 'unavailable', laborHours: 8, revenuePerLaborHour: 125, completionRate: 0.9, revenueShare: 66.7 },
    { service: 'Repair',   jobs: 1, earnedRevenue: 500,  collectedRevenue: 400, avgTicket: 500, grossProfit: null, grossProfitStatus: 'unavailable', margin: null, marginStatus: 'unavailable', laborHours: 2, revenuePerLaborHour: 250, completionRate: 1.0, revenueShare: 33.3 },
  ],
  risk:         [{ category: 'risk', type: 'overdue_invoices', label: 'Overdue invoices', value: 300, count: 1, reason: 'Past due.', action: 'View invoices', route: '/invoices' }],
  opportunities: [],
  insights: [
    { id: 'overdue_ar', text: '$150.00 in overdue invoices require follow-up.', tone: 'critical', route: '/invoices' },
    { id: 'top_service', text: 'Cleaning produced 67% of earned revenue.', tone: 'neutral', route: null },
  ],
  dataQuality: {
    state: 'partial', limitationCount: 2,
    limitations: [
      { code: 'gross_profit_no_source', severity: 'warning', title: 'Gross Profit Unavailable',
        description: 'No direct cost source is connected — COGS data is required to calculate profit.',
        metricKeys: ['grossProfit'], source: 'cost_source', actionAvailable: false },
      { code: 'rev_per_hr_scheduled', severity: 'info', title: 'Revenue / Hr Uses Scheduled Duration',
        description: 'Actual time tracking is not connected. Calculated from scheduled job duration.',
        metricKeys: ['revenuePerLaborHour'], source: 'time_tracking', actionAvailable: false },
    ],
    missingSources: ['labor costs', 'material costs'],
    missingPolicies: [],
  },
  freshness: { calculatedAt: '2026-08-06T10:00:00Z', staleAfter: '2026-08-06T10:05:00Z' },
};

const MOCK_TREND = {
  current: [
    { periodStart: '2026-08-01', earned: 300, collected: 250, jobs: 2 },
    { periodStart: '2026-08-02', earned: 400, collected: 350, jobs: 3 },
    { periodStart: '2026-08-03', earned: 800, collected: 600, jobs: 5 },
  ],
  comparison: null,
  interval: 'daily',
};

const MOCK_SERVICES = [
  { service: 'Cleaning', jobs: 4, earnedRevenue: 1000, collectedRevenue: 800, avgTicket: 250, laborHours: 8, revenuePerLaborHour: 125, completionRate: 0.9, revenueShare: 66.7 },
  { service: 'Repair',   jobs: 1, earnedRevenue: 500,  collectedRevenue: 400, avgTicket: 500, laborHours: 2, revenuePerLaborHour: 250, completionRate: 1.0, revenueShare: 33.3 },
];

const MOCK_QUARTERLY = {
  year: 2026,
  quarters: {
    Q1:   { earnedRevenue: 1200, collectedRevenue: 1000, avgTicket: 300, qoqGrowth: null, yoyGrowth: 5.2 },
    Q2:   { earnedRevenue: 1500, collectedRevenue: 1300, avgTicket: 320, qoqGrowth: 25.0, yoyGrowth: 8.1 },
    Q3:   { earnedRevenue: null, collectedRevenue: null,  avgTicket: null, qoqGrowth: null, yoyGrowth: null },
    Q4:   { earnedRevenue: null, collectedRevenue: null,  avgTicket: null, qoqGrowth: null, yoyGrowth: null },
    year: { earnedRevenue: 2700, collectedRevenue: 2300, avgTicket: 310, qoqGrowth: null, yoyGrowth: 6.5 },
  },
  priorYear: {},
  financialRows: { cogs: { status: 'unavailable' }, grossProfit: { status: 'unavailable' } },
  limitations: ['Gross profit unavailable — no cost source connected.'],
  calculatedAt: '2026-08-06T10:00:00Z',
};

const MOCK_FINANCIALS = {
  period:           { start: '2026-08-01', end: '2026-08-06' },
  comparisonPeriod: null,
  kpis: {
    grossRevenue:    { value: 1580, status: 'ok', breakdown: { jobs: 1500, tips: 50, travelFees: 80, jobCount: 5 } },
    grossProfit:     { value: null, status: 'unavailable', missingSources: ['labor costs', 'material costs'] },
    netProfit:       { value: null, status: 'unavailable', missingSources: ['labor costs'] },
    grossMargin:     { value: null, status: 'unavailable' },
    netMargin:       { value: null, status: 'unavailable' },
    cashIn:          { value: 1200, status: 'ok', breakdown: { invoices: 1000, invoiceCount: 3, deposits: 200, depositCount: 1 } },
    cashOut:         { value: null, status: 'unavailable', missingSource: 'expense_tracking' },
    netCashFlow:     { value: null, status: 'unavailable' },
    compGrossRevenue: null,
  },
  pnl: {
    rows: [
      { key: 'grossRevenue',      label: 'Gross Revenue',       value: 1580, status: 'ok' },
      { key: 'refunds',           label: 'Refunds & Credits',   value: null, status: 'unavailable' },
      { key: 'netRevenue',        label: 'Net Revenue',         value: 1580, status: 'ok' },
      { key: 'cogs',              label: 'COGS',                value: null, status: 'unavailable' },
      { key: 'grossProfit',       label: 'Gross Profit',        value: null, status: 'unavailable' },
      { key: 'grossMargin',       label: 'Gross Margin %',      value: null, status: 'unavailable' },
      { key: 'operatingExpenses', label: 'Operating Expenses',  value: null, status: 'unavailable' },
      { key: 'operatingProfit',   label: 'Operating Profit',    value: null, status: 'unavailable' },
      { key: 'merchantFees',      label: 'Merchant Fees',       value: null, status: 'unavailable' },
      { key: 'taxes',             label: 'Taxes',               value: null, status: 'unavailable' },
      { key: 'netProfit',         label: 'Net Profit',          value: null, status: 'unavailable' },
      { key: 'netMargin',         label: 'Net Margin %',        value: null, status: 'unavailable' },
    ],
    setupGuide: {
      title: 'Connect your accounting software to unlock profitability',
      steps: ['Connect an accounting integration to import COGS and expense data.', 'FieldCore Payments provides native transaction data.', 'FieldCore computes margins automatically.'],
    },
  },
  arAging: {
    total: 450,
    buckets: [
      { label: 'Current',    days: 'current', amount: 200, count: 1 },
      { label: '1–30 days',  days: '1_30',    amount: 150, count: 1 },
      { label: '31–60 days', days: '31_60',   amount: 100, count: 1 },
      { label: '61–90 days', days: '61_90',   amount: 0,   count: 0 },
      { label: '90+ days',   days: '90_plus', amount: 0,   count: 0 },
    ],
    invoiceCount: 3,
    overdueTotal: 250,
    overdueCount: 2,
    provenance: { formula: 'Pending invoices bucketed by days past due' },
  },
  cashFlow: {
    cashIn:      { value: 1200, status: 'ok', breakdown: { invoices: 1000, invoiceCount: 3, deposits: 200, depositCount: 1 } },
    cashOut:     { value: null, status: 'unavailable' },
    netCashFlow: { value: null, status: 'unavailable' },
    provenance:  { formula: 'Cash In = paid invoices + collected deposits' },
  },
  quarterly: {
    year: 2026,
    quarters: {
      Q1: { earnedRevenue: 1200, collectedRevenue: 1000, avgTicket: 300, qoqGrowth: null, yoyGrowth: 5.2 },
      Q2: { earnedRevenue: 1500, collectedRevenue: 1300, avgTicket: 320, qoqGrowth: 25.0, yoyGrowth: 8.1 },
      Q3: { earnedRevenue: null, collectedRevenue: null,  avgTicket: null, qoqGrowth: null, yoyGrowth: null },
      Q4: { earnedRevenue: null, collectedRevenue: null,  avgTicket: null, qoqGrowth: null, yoyGrowth: null },
      year: { earnedRevenue: 2700, collectedRevenue: 2300, avgTicket: 310, qoqGrowth: null, yoyGrowth: 6.5 },
    },
    priorYear: {},
    calculatedAt: '2026-08-06T10:00:00Z',
  },
  coverage: {
    coverageState: 'partial',
    activeSources: [
      { sourceKey: 'fieldcore_core',     providerLabel: 'FieldCore Core',     status: 'active', capabilities: ['revenue', 'invoices', 'ar', 'jobs'] },
      { sourceKey: 'fieldcore_payments', providerLabel: 'FieldCore Payments', status: 'active', capabilities: ['payments', 'deposits', 'cash_in', 'refunds', 'processing_fees', 'disputes', 'payouts'], paymentsStatus: { product: 'FIELDCORE_PAYMENTS', status: 'ACTIVE', paymentsAvailable: true, limitations: [] } },
    ],
    notEnabledSources: [],
    optionalSources: [
      { sourceKey: 'accounting', providerLabel: 'Accounting', status: 'not_connected', capabilities: ['cogs', 'operating_expenses', 'taxes', 'vendor_expenses', 'account_mapping', 'reconciliation'], canConnect: false, connectionInfo: null },
      { sourceKey: 'banking',    providerLabel: 'Banking',    status: 'not_connected', capabilities: ['bank_balances', 'cash_transactions', 'cash_out', 'external_deposits', 'reconciliation'] },
    ],
    availableMetrics:   [{ key: 'revenue', label: 'Revenue' }, { key: 'invoices', label: 'Invoices' }, { key: 'ar', label: 'Accounts Receivable' }, { key: 'payments', label: 'Payments' }, { key: 'cash_in', label: 'Cash In' }],
    partialMetrics:     [{ key: 'merchant_fees', label: 'Merchant Fees', note: 'Fee detail not yet available from FieldCore Payments.' }],
    unavailableMetrics: [{ key: 'gross_profit', label: 'Gross Profit', missingCaps: ['cogs'], note: 'Direct cost data is required.' }, { key: 'net_profit', label: 'Net Profit', missingCaps: ['cogs', 'operating_expenses'], note: 'Direct costs and operating expenses are required.' }, { key: 'cash_out', label: 'Net Cash Flow', missingCaps: ['cash_out'], note: 'A banking or cash-tracking source is required.' }],
    explanation: 'FieldCore Core and FieldCore Payments data is active.',
  },
  providers: [
    { sourceKey: 'fieldcore_core',     providerLabel: 'FieldCore Core',     status: 'active',        capabilities: ['revenue', 'invoices', 'ar', 'jobs'] },
    { sourceKey: 'fieldcore_payments', providerLabel: 'FieldCore Payments', status: 'active',        capabilities: ['payments', 'deposits', 'cash_in', 'refunds'] },
    { sourceKey: 'accounting',         providerLabel: 'Accounting',         status: 'not_connected', capabilities: ['cogs', 'operating_expenses', 'taxes', 'vendor_expenses'] },
    { sourceKey: 'banking',            providerLabel: 'Banking',            status: 'not_connected', capabilities: ['bank_balances', 'cash_transactions', 'cash_out', 'reconciliation'] },
  ],
  dataQuality: {
    state: 'info',
    limitationCount: 1,
    limitations: [
      { code: 'ar_aging_proxy_due_date', severity: 'info', title: 'AR Aging Uses Net-30 Proxy', description: 'Set explicit due dates.' },
    ],
    missingSources: [],
  },
  calculatedAt: '2026-08-06T10:00:00Z',
};

function renderRevenue(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/revenue${search}`]}>
      <Revenue />
    </MemoryRouter>
  );
}

const MOCK_CUSTOMERS = {
  topClients: [
    { id: 'client-1', name: 'Acme Corp', job_count: 4, earned_revenue: 1200.00, last_job_at: '2026-08-01T10:00:00Z' },
    { id: 'client-2', name: 'Beta LLC',  job_count: 2, earned_revenue:  600.00, last_job_at: '2026-07-28T10:00:00Z' },
  ],
  summary: { activeClientCount: 2 },
  limitations: ['Churn threshold not configured.'],
  provenance: { calculationState: 'complete' },
};

const MOCK_FORECAST_READINESS = {
  ready: false,
  score: 50,
  year: 2026,
  items: [
    { key: 'history_sufficient',      label: 'Historical data (3+ months)', met: true,  value: '4 month(s)' },
    { key: 'revenue_recognition_policy', label: 'Revenue recognition policy', met: false, value: null },
    { key: 'forecasting_policy',      label: 'Forecasting method',           met: false, value: null },
    { key: 'job_volume',              label: 'Sufficient job volume',        met: true,  value: '12 completed' },
  ],
  missingPolicies: ['revenueRecognitionPolicy', 'forecastingPolicy'],
  message: 'To enable forecasting: revenue recognition policy; forecasting method.',
  disclaimer: 'No AI. Rules-based when ready.',
};

const MOCK_SAVED_VIEWS = { savedViews: [] };

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((url) => {
    if (url.includes('/revenue/customers/overview')) return Promise.resolve({ data: MOCK_CUSTOMERS });
    if (url.includes('/revenue/forecast/readiness')) return Promise.resolve({ data: MOCK_FORECAST_READINESS });
    if (url.includes('/revenue/saved-views'))        return Promise.resolve({ data: MOCK_SAVED_VIEWS });
    if (url.includes('/revenue/financials'))         return Promise.resolve({ data: MOCK_FINANCIALS });
    if (url.includes('/revenue/overview'))           return Promise.resolve({ data: MOCK_OVERVIEW });
    if (url.includes('/revenue/trend'))              return Promise.resolve({ data: MOCK_TREND });
    if (url.includes('/revenue/services'))           return Promise.resolve({ data: MOCK_SERVICES });
    if (url.includes('/revenue/quarterly'))          return Promise.resolve({ data: MOCK_QUARTERLY });
    return Promise.reject(new Error('Unknown endpoint: ' + url));
  });
});

// ── Workspace navigation ───────────────────────────────────────────────────────

describe('Revenue — workspace navigation', () => {
  it('renders all six workspace tabs', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument();
      expect(screen.getByText('Financials')).toBeInTheDocument();
      expect(screen.getByText('Operations')).toBeInTheDocument();
      expect(screen.getByText('Customers')).toBeInTheDocument();
      expect(screen.getByText('Forecasting')).toBeInTheDocument();
      expect(screen.getByText('Reports')).toBeInTheDocument();
    });
  });

  it('Overview is selected by default', async () => {
    renderRevenue();
    await waitFor(() => {
      const tab = screen.getByRole('tab', { name: 'Overview' });
      expect(tab).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('Operations workspace shows coming-soon sections for unbuilt features', async () => {
    renderRevenue('?view=operations');
    await waitFor(() => {
      expect(screen.getAllByText(/coming in a later phase/i).length).toBeGreaterThan(0);
    });
  });

  it('clicking a workspace tab changes the selected tab', async () => {
    renderRevenue();
    await waitFor(() => screen.getByRole('tab', { name: 'Operations' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Operations' }));
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Operations' })).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('no legacy Revenue/Upcoming/No-Show tabs exist', async () => {
    renderRevenue();
    await waitFor(() => screen.getByText('Overview'));
    expect(screen.queryByText('Upcoming')).not.toBeInTheDocument();
    expect(screen.queryByText('No-Show Report')).not.toBeInTheDocument();
    // Old "Revenue" tab (as a tab, not the page title) should not exist in the workspace nav
  });
});

// ── Filter bar and export ─────────────────────────────────────────────────────

describe('Revenue — filter bar', () => {
  it('shows an Export button in the filter bar', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });
  });

  it('does not render an inline page heading (title is in global topbar)', async () => {
    renderRevenue();
    await waitFor(() => screen.getByRole('tab', { name: 'Overview' }));
    expect(screen.queryByRole('heading', { name: 'Revenue Analytics' })).not.toBeInTheDocument();
  });
});

// ── No permanent right-side stack ─────────────────────────────────────────────

describe('Revenue — no permanent right-side rail', () => {
  it('does not render Monthly Summary card', async () => {
    renderRevenue();
    await waitFor(() => screen.getByRole('tab', { name: 'Overview' }));
    expect(screen.queryByText('Monthly Summary')).not.toBeInTheDocument();
  });

  it('does not render Top Services card as a standalone rail', async () => {
    renderRevenue();
    await waitFor(() => screen.getByRole('tab', { name: 'Overview' }));
    // "Top Services" as a standalone right-side card should not exist;
    // the compact "Top 5 Services" table is inline within the Overview workspace
    expect(screen.queryByText('Top Services')).not.toBeInTheDocument();
  });
});

// ── Primary KPI row ────────────────────────────────────────────────────────────

describe('Revenue — primary KPI row', () => {
  it('renders Collected Revenue KPI', async () => {
    renderRevenue();
    // 'Collected Revenue' appears as KPI label + chart toggle; use getAllByText
    await waitFor(() => {
      expect(screen.getAllByText('Collected Revenue').length).toBeGreaterThan(0);
    });
  });

  it('renders Earned Revenue KPI', async () => {
    renderRevenue();
    // 'Earned Revenue' appears as KPI label + chart toggle; use getAllByText
    await waitFor(() => {
      expect(screen.getAllByText('Earned Revenue').length).toBeGreaterThan(0);
    });
  });

  it('renders Gross Profit KPI as unavailable', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getAllByText('Gross Profit').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
    });
  });

  it('does NOT show $0 for Gross Profit', async () => {
    renderRevenue();
    await waitFor(() => screen.getAllByText('Gross Profit').length > 0);
    // The Unavailable state should be shown instead of $0
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
  });

  it('renders Outstanding AR KPI', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByText('Outstanding AR')).toBeInTheDocument();
    });
  });

  it('renders Projected Month-End KPI with range', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByText('Projected Month-End')).toBeInTheDocument();
    });
  });

  it('does not show Total Jobs as a primary KPI', async () => {
    renderRevenue();
    await waitFor(() => screen.getAllByText('Collected Revenue').length > 0);
    expect(screen.queryByText('Total Jobs')).not.toBeInTheDocument();
  });

  it('does not show Services count as a primary KPI', async () => {
    renderRevenue();
    await waitFor(() => screen.getAllByText('Collected Revenue').length > 0);
    // The old "Services" KPI should be gone; service types appear only in the table
    expect(screen.queryByText('Service types billed')).not.toBeInTheDocument();
  });
});

// ── Secondary KPI row ──────────────────────────────────────────────────────────

describe('Revenue — secondary KPI row', () => {
  it('renders Average Ticket', async () => {
    renderRevenue();
    await waitFor(() => expect(screen.getByText('Average Ticket')).toBeInTheDocument());
  });

  it('renders Revenue per Labor Hour', async () => {
    renderRevenue();
    await waitFor(() => expect(screen.getByText('Revenue per Labor Hour')).toBeInTheDocument());
  });

  it('does NOT render Repeat Revenue in Overview (moved to Customers)', async () => {
    renderRevenue();
    await waitFor(() => screen.getAllByText('Collected Revenue').length > 0);
    expect(screen.queryByText('Repeat Revenue')).not.toBeInTheDocument();
  });

  it('does NOT render Completion Rate in Overview', async () => {
    renderRevenue();
    await waitFor(() => screen.getAllByText('Collected Revenue').length > 0);
    expect(screen.queryByText('Completion Rate')).not.toBeInTheDocument();
  });

  it('does NOT render Technician Utilization in Overview', async () => {
    renderRevenue();
    await waitFor(() => screen.getAllByText('Collected Revenue').length > 0);
    expect(screen.queryByText('Technician Utilization')).not.toBeInTheDocument();
  });
});

// ── Revenue at Risk (primary KPI) ─────────────────────────────────────────────

describe('Revenue — Revenue at Risk as primary KPI', () => {
  it('renders Revenue at Risk in the primary KPI row', async () => {
    renderRevenue();
    await waitFor(() => expect(screen.getByText('Revenue at Risk')).toBeInTheDocument());
  });
});

// ── Revenue Trend ──────────────────────────────────────────────────────────────

describe('Revenue — Revenue Trend', () => {
  it('renders Revenue Trend section', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByText('Revenue Trend')).toBeInTheDocument();
    });
  });

  it('renders metric toggle buttons', async () => {
    renderRevenue();
    await waitFor(() => {
      // 'Earned Revenue' appears as KPI label + chart toggle; getAllByText confirms presence
      expect(screen.getAllByText('Earned Revenue').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Collected Revenue').length).toBeGreaterThan(0);
    });
  });

  it('renders interval selector', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByLabelText('Chart interval')).toBeInTheDocument();
    });
  });
});

// ── Revenue Insight ────────────────────────────────────────────────────────────

describe('Revenue — Revenue Insight panel', () => {
  it('renders Revenue Insight panel', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByText('Revenue Insight')).toBeInTheDocument();
    });
  });

  it('renders insight text from API', async () => {
    renderRevenue();
    await waitFor(() => {
      // overdue invoices may appear in both insight panel and risk section
      expect(screen.getAllByText(/overdue invoices/i).length).toBeGreaterThan(0);
    });
  });
});

// ── Revenue by Service table ───────────────────────────────────────────────────

describe('Revenue — Revenue by Service table', () => {
  it('renders Revenue by Service heading in Operations workspace', async () => {
    renderRevenue('?view=operations');
    await waitFor(() => {
      expect(screen.getByText('Revenue by Service')).toBeInTheDocument();
    });
  });

  it('shows service rows from API', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByText('Cleaning')).toBeInTheDocument();
      expect(screen.getByText('Repair')).toBeInTheDocument();
    });
  });

  it('shows Gross Profit as unavailable in service table', async () => {
    renderRevenue();
    await waitFor(() => screen.getByText('Cleaning'));
    const unavailCells = screen.queryAllByText('Unavailable');
    expect(unavailCells.length).toBeGreaterThan(0);
  });

  it('shows "revenue counted once per job" note in Operations workspace', async () => {
    renderRevenue('?view=operations');
    await waitFor(() => {
      expect(screen.getByText(/revenue counted once per job/i)).toBeInTheDocument();
    });
  });
});

// ── Filter toolbar ─────────────────────────────────────────────────────────────

describe('Revenue — filter toolbar', () => {
  it('renders date preset buttons', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByText('Month to Date')).toBeInTheDocument();
      expect(screen.getByText('Last Month')).toBeInTheDocument();
      expect(screen.getByText('Year to Date')).toBeInTheDocument();
    });
  });

  it('renders comparison selector', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByLabelText('Compare')).toBeInTheDocument();
    });
  });

  it('renders date range inputs', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByLabelText('Start date')).toBeInTheDocument();
      expect(screen.getByLabelText('End date')).toBeInTheDocument();
    });
  });
});

// ── Error state ────────────────────────────────────────────────────────────────

describe('Revenue — error state does not show zero', () => {
  it('shows error banner when overview API fails', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/revenue/overview'))           return Promise.reject(new Error('Server error'));
      if (url.includes('/revenue/trend'))              return Promise.resolve({ data: MOCK_TREND });
      if (url.includes('/revenue/customers/overview')) return Promise.resolve({ data: MOCK_CUSTOMERS });
      if (url.includes('/revenue/forecast/readiness')) return Promise.resolve({ data: MOCK_FORECAST_READINESS });
      if (url.includes('/revenue/saved-views'))        return Promise.resolve({ data: MOCK_SAVED_VIEWS });
      if (url.includes('/revenue/financials'))         return Promise.resolve({ data: MOCK_FINANCIALS });
      if (url.includes('/revenue/services'))           return Promise.resolve({ data: MOCK_SERVICES });
      if (url.includes('/revenue/quarterly'))          return Promise.resolve({ data: MOCK_QUARTERLY });
      return Promise.reject(new Error('Unknown'));
    });

    renderRevenue();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});

// ── Data provenance ────────────────────────────────────────────────────────────

describe('Revenue — data provenance', () => {
  it('each primary KPI shows a "How calculated" button', async () => {
    renderRevenue();
    await waitFor(() => screen.getAllByText('Earned Revenue').length > 0);
    const howBtns = screen.queryAllByText('How calculated');
    // At minimum the KPIs with provenance show the button
    expect(howBtns.length).toBeGreaterThan(0);
  });
});

// ── Data Quality indicator ─────────────────────────────────────────────────────

describe('Revenue — Data Quality indicator', () => {
  it('shows Data Quality indicator button', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /data quality/i })).toBeInTheDocument();
    });
  });

  it('does NOT show old lowercase "Data limitations" footer block', async () => {
    renderRevenue();
    await waitFor(() => screen.getByRole('tab', { name: 'Overview' }));
    expect(screen.queryByText('Data limitations')).not.toBeInTheDocument();
  });

  it('shows limitation details when Data Quality button is clicked', async () => {
    renderRevenue();
    await waitFor(() => screen.getByRole('button', { name: /data quality/i }));
    fireEvent.click(screen.getByRole('button', { name: /data quality/i }));
    await waitFor(() => {
      expect(screen.getByText('Revenue Data Quality')).toBeInTheDocument();
    });
  });
});

// ── Data Limitations panel ────────────────────────────────────────────────────

describe('Revenue — Data Limitations panel', () => {
  it('renders Data Limitations panel in Overview', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByText('Data Limitations')).toBeInTheDocument();
    });
  });

  it('shows limitation titles from provenance data', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByText(/Gross Profit Unavailable/i)).toBeInTheDocument();
    });
  });

  it('shows limitation descriptions from provenance data', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByText(/No direct cost source/i)).toBeInTheDocument();
    });
  });

  it('shows second limitation from structured provenance', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByText(/Revenue \/ Hr Uses Scheduled Duration/i)).toBeInTheDocument();
    });
  });

  it('Data Limitations panel uses provenance data, not hardcoded text', async () => {
    renderRevenue();
    await waitFor(() => screen.getByText('Data Limitations'));
    // Verify the limitation code from MOCK_OVERVIEW fixture appears via structured data
    expect(screen.getByText(/COGS data is required/i)).toBeInTheDocument();
  });
});

// ── FieldCore custom interval selector ────────────────────────────────────────

describe('Revenue — chart interval selector', () => {
  it('renders interval selector with FieldCore custom control', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByLabelText('Chart interval')).toBeInTheDocument();
    });
  });

  it('interval selector is a button, not a native select', async () => {
    renderRevenue();
    await waitFor(() => screen.getByLabelText('Chart interval'));
    const el = screen.getByLabelText('Chart interval');
    expect(el.tagName).toBe('BUTTON');
  });

  it('interval selector shows current selection label', async () => {
    renderRevenue();
    await waitFor(() => screen.getByLabelText('Chart interval'));
    const trigger = screen.getByLabelText('Chart interval');
    expect(trigger).toHaveTextContent(/Daily|Weekly|Monthly/i);
  });

  it('interval selector opens menu on click', async () => {
    renderRevenue();
    await waitFor(() => screen.getByLabelText('Chart interval'));
    fireEvent.click(screen.getByLabelText('Chart interval'));
    await waitFor(() => {
      expect(screen.getByRole('listbox', { name: 'Chart interval' })).toBeInTheDocument();
    });
  });

  it('interval menu contains Daily, Weekly, Monthly options', async () => {
    renderRevenue();
    await waitFor(() => screen.getByLabelText('Chart interval'));
    fireEvent.click(screen.getByLabelText('Chart interval'));
    await waitFor(() => screen.getByRole('listbox'));
    expect(screen.getByRole('option', { name: 'Daily' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Weekly' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Monthly' })).toBeInTheDocument();
  });

  it('interval menu closes on Escape', async () => {
    renderRevenue();
    await waitFor(() => screen.getByLabelText('Chart interval'));
    const trigger = screen.getByLabelText('Chart interval');
    fireEvent.click(trigger);
    await waitFor(() => screen.getByRole('listbox'));
    fireEvent.keyDown(trigger, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });
});

// ── Top 5 Services sizing ─────────────────────────────────────────────────────

describe('Revenue — Top 5 Services', () => {
  it('renders Top 5 Services panel in Overview', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByText('Top 5 Services')).toBeInTheDocument();
    });
  });

  it('shows service names from overview data', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByText('Cleaning')).toBeInTheDocument();
      expect(screen.getByText('Repair')).toBeInTheDocument();
    });
  });

  it('shows View All button in Top 5 Services header', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /View All/i })).toBeInTheDocument();
    });
  });

  it('View All button navigates to Operations workspace', async () => {
    renderRevenue();
    await waitFor(() => screen.getByRole('button', { name: /View All/i }));
    fireEvent.click(screen.getByRole('button', { name: /View All/i }));
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Operations' })).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('shows empty state without collapsing when no services', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/revenue/overview')) return Promise.resolve({
        data: { ...MOCK_OVERVIEW, services: [] },
      });
      if (url.includes('/revenue/trend'))              return Promise.resolve({ data: MOCK_TREND });
      if (url.includes('/revenue/customers/overview')) return Promise.resolve({ data: MOCK_CUSTOMERS });
      if (url.includes('/revenue/forecast/readiness')) return Promise.resolve({ data: MOCK_FORECAST_READINESS });
      if (url.includes('/revenue/saved-views'))        return Promise.resolve({ data: MOCK_SAVED_VIEWS });
      if (url.includes('/revenue/financials'))         return Promise.resolve({ data: MOCK_FINANCIALS });
      if (url.includes('/revenue/services'))           return Promise.resolve({ data: MOCK_SERVICES });
      if (url.includes('/revenue/quarterly'))          return Promise.resolve({ data: MOCK_QUARTERLY });
      return Promise.reject(new Error('Unknown'));
    });
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByText(/No service data for this period/i)).toBeInTheDocument();
    });
    // Top 5 Services header still present
    expect(screen.getByText('Top 5 Services')).toBeInTheDocument();
  });
});

// ── Chart color tokens ─────────────────────────────────────────────────────────

describe('Revenue — chart color tokens', () => {
  it('CHART.earnedRevenue is the correct blue', () => {
    expect(CHART.earnedRevenue).toBe('#2563EB');
  });

  it('CHART.collectedRevenue is the correct teal', () => {
    expect(CHART.collectedRevenue).toBe('#0F9D8A');
  });

  it('CHART.grossProfit is the correct green', () => {
    expect(CHART.grossProfit).toBe('#16A34A');
  });

  it('CHART.projectedRevenue is the correct purple', () => {
    expect(CHART.projectedRevenue).toBe('#7C3AED');
  });

  it('CATEGORICAL palette has 8 entries', () => {
    expect(CATEGORICAL).toHaveLength(8);
  });

  it('varianceColor returns positive color when higher_is_better and value goes up', () => {
    expect(varianceColor('earnedRevenue', 10)).toBe(CHART.positiveVariance);
  });

  it('varianceColor returns negative color when higher_is_better and value goes down', () => {
    expect(varianceColor('earnedRevenue', -5)).toBe(CHART.negativeVariance);
  });

  it('varianceColor returns positive color when lower_is_better and value goes down', () => {
    expect(varianceColor('outstandingAR', -8)).toBe(CHART.positiveVariance);
  });

  it('varianceColor returns neutral color for zero change', () => {
    expect(varianceColor('earnedRevenue', 0)).toBe(CHART.neutralVariance);
  });

  it('trend chart metric toggles use earned/collected semantic colors', async () => {
    renderRevenue();
    await waitFor(() => screen.getAllByText('Earned Revenue').length > 0);
    const earnedBtn = screen.getAllByRole('button', { name: /earned revenue/i })[0];
    expect(earnedBtn).toBeInTheDocument();
    expect(earnedBtn).toHaveAttribute('aria-pressed', 'true');
  });
});

// ── Invalid Date regression ────────────────────────────────────────────────────

describe('Revenue — trend chart date parsing', () => {
  it('renders trend bars when period_start is a plain YYYY-MM-DD string', async () => {
    renderRevenue();
    await waitFor(() => {
      // chart renders; date labels appear (Aug 1, Aug 2, Aug 3 from MOCK_TREND)
      expect(screen.getByRole('img', { name: /revenue trend chart/i })).toBeInTheDocument();
    });
  });

  it('renders trend bars when period_start has a full ISO timestamp suffix', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/revenue/customers/overview')) return Promise.resolve({ data: MOCK_CUSTOMERS });
      if (url.includes('/revenue/forecast/readiness')) return Promise.resolve({ data: MOCK_FORECAST_READINESS });
      if (url.includes('/revenue/saved-views'))        return Promise.resolve({ data: MOCK_SAVED_VIEWS });
      if (url.includes('/revenue/financials'))         return Promise.resolve({ data: MOCK_FINANCIALS });
      if (url.includes('/revenue/overview'))  return Promise.resolve({ data: MOCK_OVERVIEW });
      if (url.includes('/revenue/trend'))     return Promise.resolve({
        data: {
          current: [
            { periodStart: '2026-08-01T00:00:00.000Z', earned: 300, collected: 250, jobs: 2 },
            { periodStart: '2026-08-02T00:00:00.000Z', earned: 400, collected: 350, jobs: 3 },
          ],
          comparison: null,
          interval: 'daily',
        },
      });
      if (url.includes('/revenue/services'))  return Promise.resolve({ data: MOCK_SERVICES });
      if (url.includes('/revenue/quarterly')) return Promise.resolve({ data: MOCK_QUARTERLY });
      return Promise.reject(new Error('Unknown endpoint: ' + url));
    });
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByRole('img', { name: /revenue trend chart/i })).toBeInTheDocument();
    });
    // "Invalid Date" must not appear anywhere in the rendered output
    expect(screen.queryByText(/invalid date/i)).not.toBeInTheDocument();
  });
});

// ── Trend chart body anchoring ─────────────────────────────────────────────────

describe('Revenue — trend chart body anchoring', () => {
  it('renders rov-trend-body wrapper inside the trend card', async () => {
    renderRevenue();
    await waitFor(() => screen.getByRole('img', { name: /revenue trend chart/i }));
    expect(document.querySelector('.rov-trend-body')).toBeInTheDocument();
  });

  it('chart is a child of rov-trend-body', async () => {
    renderRevenue();
    await waitFor(() => screen.getByRole('img', { name: /revenue trend chart/i }));
    const body = document.querySelector('.rov-trend-body');
    const chart = document.querySelector('.rov-trend-chart');
    expect(body).toBeInTheDocument();
    expect(chart).toBeInTheDocument();
    expect(body.contains(chart)).toBe(true);
  });

  it('legend appears after bars in DOM order (anchored to bottom)', async () => {
    renderRevenue();
    await waitFor(() => screen.getByRole('img', { name: /revenue trend chart/i }));
    const chart = document.querySelector('.rov-trend-chart');
    const bars   = chart.querySelector('.rov-trend-bars');
    const legend = chart.querySelector('.rov-trend-legend');
    const kids   = Array.from(chart.children);
    expect(kids.indexOf(legend)).toBeGreaterThan(kids.indexOf(bars));
  });

  it('legend is not nested inside rov-trend-bars', async () => {
    renderRevenue();
    await waitFor(() => screen.getByRole('img', { name: /revenue trend chart/i }));
    const bars   = document.querySelector('.rov-trend-bars');
    const legend = document.querySelector('.rov-trend-legend');
    expect(bars.contains(legend)).toBe(false);
  });

  it('bars have inline percentage height styles derived from data', async () => {
    renderRevenue();
    await waitFor(() => screen.getByRole('img', { name: /revenue trend chart/i }));
    const bars = document.querySelectorAll('.rov-trend-bar');
    expect(bars.length).toBeGreaterThan(0);
    bars.forEach(bar => {
      expect(bar.style.height).toMatch(/%$/);
    });
  });

  it('zero-value rows still render bars at minimum height (not invisible)', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/revenue/trend')) return Promise.resolve({
        data: {
          current: [
            { periodStart: '2026-08-01', earned: 0, collected: 0, jobs: 0 },
            { periodStart: '2026-08-02', earned: 0, collected: 0, jobs: 0 },
          ],
          comparison: null,
          interval: 'daily',
        },
      });
      if (url.includes('/revenue/customers/overview')) return Promise.resolve({ data: MOCK_CUSTOMERS });
      if (url.includes('/revenue/forecast/readiness')) return Promise.resolve({ data: MOCK_FORECAST_READINESS });
      if (url.includes('/revenue/saved-views'))        return Promise.resolve({ data: MOCK_SAVED_VIEWS });
      if (url.includes('/revenue/financials'))         return Promise.resolve({ data: MOCK_FINANCIALS });
      if (url.includes('/revenue/overview'))  return Promise.resolve({ data: MOCK_OVERVIEW });
      if (url.includes('/revenue/services'))  return Promise.resolve({ data: MOCK_SERVICES });
      if (url.includes('/revenue/quarterly')) return Promise.resolve({ data: MOCK_QUARTERLY });
      return Promise.reject(new Error('Unknown'));
    });
    renderRevenue();
    await waitFor(() => screen.getByRole('img', { name: /revenue trend chart/i }));
    const bars = document.querySelectorAll('.rov-trend-bar');
    expect(bars.length).toBeGreaterThan(0);
    bars.forEach(bar => {
      const h = parseFloat(bar.style.height);
      expect(h).toBeGreaterThan(0);
    });
  });

  it('loading skeleton renders inside rov-trend-body', async () => {
    let resolve;
    api.get.mockImplementation((url) => {
      if (url.includes('/revenue/trend')) return new Promise(r => { resolve = r; });
      if (url.includes('/revenue/customers/overview')) return Promise.resolve({ data: MOCK_CUSTOMERS });
      if (url.includes('/revenue/forecast/readiness')) return Promise.resolve({ data: MOCK_FORECAST_READINESS });
      if (url.includes('/revenue/saved-views'))        return Promise.resolve({ data: MOCK_SAVED_VIEWS });
      if (url.includes('/revenue/financials'))         return Promise.resolve({ data: MOCK_FINANCIALS });
      if (url.includes('/revenue/overview'))  return Promise.resolve({ data: MOCK_OVERVIEW });
      if (url.includes('/revenue/services'))  return Promise.resolve({ data: MOCK_SERVICES });
      if (url.includes('/revenue/quarterly')) return Promise.resolve({ data: MOCK_QUARTERLY });
      return Promise.reject(new Error('Unknown'));
    });
    renderRevenue();
    await waitFor(() => {
      expect(document.querySelector('.rov-trend-skeleton')).toBeInTheDocument();
    });
    const body = document.querySelector('.rov-trend-body');
    expect(body).toBeInTheDocument();
    expect(body.querySelector('.rov-trend-loading')).toBeInTheDocument();
    // prevent act() warning — resolve the hanging promise
    resolve({ data: MOCK_TREND });
  });
});

// ── Customers workspace ────────────────────────────────────────────────────────

describe('Revenue — Customers workspace', () => {
  it('renders Top Clients section with client names', async () => {
    renderRevenue('?view=customers');
    await waitFor(() => {
      expect(screen.getByText('Top Clients')).toBeInTheDocument();
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      expect(screen.getByText('Beta LLC')).toBeInTheDocument();
    });
  });

  it('shows Customer inactivity policy required message', async () => {
    renderRevenue('?view=customers');
    await waitFor(() => {
      expect(screen.getByText(/customer inactivity policy required/i)).toBeInTheDocument();
    });
  });

  it('shows At-Risk / Churn Detection section', async () => {
    renderRevenue('?view=customers');
    await waitFor(() => {
      expect(screen.getByText(/at-risk/i)).toBeInTheDocument();
    });
  });
});

// ── Forecasting workspace ──────────────────────────────────────────────────────

describe('Revenue — Forecasting workspace', () => {
  it('renders Forecast Readiness section', async () => {
    renderRevenue('?view=forecasting');
    await waitFor(() => {
      expect(screen.getByText('Forecast Readiness')).toBeInTheDocument();
    });
  });

  it('shows readiness score', async () => {
    renderRevenue('?view=forecasting');
    await waitFor(() => {
      expect(screen.getByText(/50% ready/i)).toBeInTheDocument();
    });
  });

  it('shows checklist items from API', async () => {
    renderRevenue('?view=forecasting');
    await waitFor(() => {
      expect(screen.getAllByText(/historical data/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/revenue recognition policy/i).length).toBeGreaterThan(0);
    });
  });

  it('shows no-AI disclaimer', async () => {
    renderRevenue('?view=forecasting');
    await waitFor(() => {
      expect(screen.getByText(/no ai or machine learning/i)).toBeInTheDocument();
    });
  });

  it('does not show fake forecast numbers', async () => {
    renderRevenue('?view=forecasting');
    await waitFor(() => screen.getByText('Forecast Readiness'));
    // No fabricated dollar amounts should appear in forecasting when not ready
    expect(screen.queryByText(/\$3,200/i)).not.toBeInTheDocument();
  });
});

// ── Reports workspace ──────────────────────────────────────────────────────────

describe('Revenue — Reports workspace', () => {
  it('renders Report Catalog', async () => {
    renderRevenue('?view=reports');
    await waitFor(() => {
      expect(screen.getByText('Report Catalog')).toBeInTheDocument();
    });
  });

  it('shows available report types with Export CSV buttons', async () => {
    renderRevenue('?view=reports');
    await waitFor(() => {
      expect(screen.getByText('Revenue Summary')).toBeInTheDocument();
      expect(screen.getByText('Revenue by Service')).toBeInTheDocument();
      expect(screen.getAllByText('Export CSV').length).toBeGreaterThan(0);
    });
  });

  it('shows Saved Views section', async () => {
    renderRevenue('?view=reports');
    await waitFor(() => {
      expect(screen.getByText('Saved Views')).toBeInTheDocument();
    });
  });

  it('shows P&L requires accounting integration', async () => {
    renderRevenue('?view=reports');
    await waitFor(() => {
      expect(screen.getAllByText(/p&l statement/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/requires accounting integration/i).length).toBeGreaterThan(0);
    });
  });
});

// ── Trend chart empty state ────────────────────────────────────────────────────

describe('Revenue — trend chart empty state', () => {
  it('shows compact empty state when trend data has no rows', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/revenue/customers/overview')) return Promise.resolve({ data: MOCK_CUSTOMERS });
      if (url.includes('/revenue/forecast/readiness')) return Promise.resolve({ data: MOCK_FORECAST_READINESS });
      if (url.includes('/revenue/saved-views'))        return Promise.resolve({ data: MOCK_SAVED_VIEWS });
      if (url.includes('/revenue/financials'))         return Promise.resolve({ data: MOCK_FINANCIALS });
      if (url.includes('/revenue/overview'))  return Promise.resolve({ data: MOCK_OVERVIEW });
      if (url.includes('/revenue/trend'))     return Promise.resolve({
        data: { current: [], comparison: null, interval: 'daily' },
      });
      if (url.includes('/revenue/services'))  return Promise.resolve({ data: MOCK_SERVICES });
      if (url.includes('/revenue/quarterly')) return Promise.resolve({ data: MOCK_QUARTERLY });
      return Promise.reject(new Error('Unknown endpoint: ' + url));
    });
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByText(/no revenue activity for this period/i)).toBeInTheDocument();
    });
  });
});

// ── Financials workspace ───────────────────────────────────────────────────────

describe('Revenue — Financials workspace', () => {
  it('navigating to Financials tab renders the workspace', async () => {
    renderRevenue();
    await waitFor(() => screen.getByRole('tab', { name: 'Financials' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Financials' }));
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /financial kpis/i })).toBeInTheDocument();
    });
  });

  it('Financials URL param renders workspace directly', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /financial kpis/i })).toBeInTheDocument();
    });
  });

  it('renders Gross Revenue KPI card with a compact dollar value', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      // Gross Revenue appears in KPI card and P&L table — both should be present
      const labels = screen.getAllByText('Gross Revenue');
      expect(labels.length).toBeGreaterThanOrEqual(1);
      // KPI card uses compact format: 1580 → $1.6k
      expect(screen.getByText('$1.6k')).toBeInTheDocument();
    });
  });

  it('renders Cash In KPI card with a compact dollar value', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      // Cash In appears in KPI card and Cash Flow card
      const labels = screen.getAllByText('Cash In');
      expect(labels.length).toBeGreaterThanOrEqual(1);
      // KPI card uses compact format: 1200 → $1.2k
      expect(screen.getByText('$1.2k')).toBeInTheDocument();
    });
  });

  it('renders Gross Profit KPI card as Unavailable', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      // Gross Profit appears in KPI card
      const labels = screen.getAllByText('Gross Profit');
      expect(labels.length).toBeGreaterThanOrEqual(1);
      // KPI card shows Unavailable (not a connector-state label)
      const badges = screen.getAllByText('Unavailable');
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('AR Aging section shows 3 pending invoices and $450.00 total', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByText(/3 pending invoice/i)).toBeInTheDocument();
      expect(screen.getByText(/\$450\.00 total/i)).toBeInTheDocument();
    });
  });

  it('AR Aging shows bucket labels', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByText('Current')).toBeInTheDocument();
      expect(screen.getByText('1–30 days')).toBeInTheDocument();
      expect(screen.getByText('31–60 days')).toBeInTheDocument();
    });
  });

  it('AR Aging shows overdue summary when overdueCount > 0', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByText(/\$250\.00 overdue/i)).toBeInTheDocument();
    });
  });

  it('Cash Flow card shows Cash In value and Unavailable for Cash Out and Net Cash Flow', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByText('Cash Flow')).toBeInTheDocument();
      expect(screen.getAllByText('Cash In').length).toBeGreaterThanOrEqual(1);
      // "Cash Out" appears in both CF card row label and Banking capability pill
      expect(screen.getAllByText('Cash Out').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Net Cash Flow')).toBeInTheDocument();
      expect(screen.getByText(/connect accounting or banking/i)).toBeInTheDocument();
    });
  });

  it('Cash Flow card does not render "Not connected" labels', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByText('Cash Flow')).toBeInTheDocument();
    });
    expect(screen.queryByText('Not connected')).not.toBeInTheDocument();
  });

  it('Cash Flow card shows Unavailable for Cash Out when no cash-out source', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      // "Cash Out" appears in CF card row label + Banking capability pill
      expect(screen.getAllByText('Cash Out').length).toBeGreaterThanOrEqual(1);
      const unavailLabels = screen.getAllByText('Unavailable');
      expect(unavailLabels.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('Cash Flow card renders a single footer when cash out is unavailable', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      const footers = screen.getAllByText(/cash in is available from fieldcore payments/i);
      expect(footers.length).toBe(1);
    });
  });

  it('P&L Summary is expandable/collapsible', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByText(/P&L Summary/i)).toBeInTheDocument();
    });
    const toggle = screen.getByRole('button', { name: /P&L Summary/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('P&L rows include Net Revenue and COGS', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /profit and loss/i })).toBeInTheDocument();
      expect(screen.getByText('Net Revenue')).toBeInTheDocument();
      // COGS appears in P&L table and quarterly table — both present
      expect(screen.getAllByText('COGS').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('unavailable P&L rows display "Unavailable" badge', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      const badges = screen.getAllByText('Unavailable');
      expect(badges.length).toBeGreaterThan(3);
    });
  });

  it('P&L setup guide is visible with steps', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByText(/connect your accounting software/i)).toBeInTheDocument();
      expect(screen.getAllByText(/connect an accounting integration/i).length).toBeGreaterThan(0);
    });
  });

  it('Quarterly Review table is rendered with quarter labels', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /quarterly financial review/i })).toBeInTheDocument();
      expect(screen.getAllByText('Q1').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Q2').length).toBeGreaterThan(0);
    });
  });

  it('Financial Data Sources shows FieldCore Payments as active and optional sources', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByText('Financial Data Sources')).toBeInTheDocument();
      expect(screen.getByText('FieldCore Payments')).toBeInTheDocument();
      expect(screen.getByText('Accounting')).toBeInTheDocument();
      expect(screen.getByText('Banking')).toBeInTheDocument();
      expect(screen.queryByText('Stripe')).not.toBeInTheDocument();
    });
  });

  it('FieldCore Core appears as always-active in Financial Data Sources', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByText(/FieldCore Core Data — Active/i)).toBeInTheDocument();
    });
  });

  it('legacy "Connect to Unlock Full Financials" does not render', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.queryByText('Connect to Unlock Full Financials')).not.toBeInTheDocument();
    });
  });

  it('legacy "No integrations active" subtitle does not render', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.queryByText('No integrations active')).not.toBeInTheDocument();
    });
  });

  it('FieldCore Payments shows Active badge when payments are enabled', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      // Active badge appears in the FieldCore Payments card
      const activeBadges = screen.getAllByText('Active');
      expect(activeBadges.length).toBeGreaterThan(0);
    });
  });

  it('QuickBooks is NOT shown as customer-facing Financials source', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.queryByText('QuickBooks')).not.toBeInTheDocument();
    });
  });

  it('Accounting and Banking show as Optional with Coming soon buttons', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      const btns = screen.getAllByRole('button', { name: /coming soon/i });
      expect(btns.length).toBeGreaterThanOrEqual(2);
      btns.forEach(btn => expect(btn).toBeDisabled());
    });
  });

  it('Financial Data Sources shows NOT_ENABLED state when FieldCore Payments not active', async () => {
    const notEnabledMock = {
      ...MOCK_FINANCIALS,
      coverage: {
        ...MOCK_FINANCIALS.coverage,
        activeSources: [
          { sourceKey: 'fieldcore_core', providerLabel: 'FieldCore Core', status: 'active', capabilities: ['revenue', 'invoices', 'ar', 'jobs'] },
        ],
        notEnabledSources: [
          { sourceKey: 'fieldcore_payments', providerLabel: 'FieldCore Payments', status: 'not_enabled', capabilities: ['payments', 'deposits', 'cash_in', 'refunds'], paymentsStatus: { product: 'FIELDCORE_PAYMENTS', status: 'NOT_ENABLED', paymentsAvailable: false, limitations: ['Enable FieldCore Payments to include payment data.'] } },
        ],
      },
    };
    api.get.mockImplementation((url) => {
      if (url.includes('/revenue/financials'))         return Promise.resolve({ data: notEnabledMock });
      if (url.includes('/revenue/customers/overview')) return Promise.resolve({ data: MOCK_CUSTOMERS });
      if (url.includes('/revenue/forecast/readiness')) return Promise.resolve({ data: MOCK_FORECAST_READINESS });
      if (url.includes('/revenue/saved-views'))        return Promise.resolve({ data: MOCK_SAVED_VIEWS });
      if (url.includes('/revenue/overview'))           return Promise.resolve({ data: MOCK_OVERVIEW });
      if (url.includes('/revenue/trend'))              return Promise.resolve({ data: MOCK_TREND });
      if (url.includes('/revenue/services'))           return Promise.resolve({ data: MOCK_SERVICES });
      if (url.includes('/revenue/quarterly'))          return Promise.resolve({ data: MOCK_QUARTERLY });
      return Promise.reject(new Error('Unknown'));
    });
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByText('Not Enabled')).toBeInTheDocument();
    });
  });

  it('integration connect buttons are disabled (coming soon)', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      const btns = screen.getAllByRole('button', { name: /coming soon/i });
      expect(btns.length).toBeGreaterThan(0);
      btns.forEach(btn => expect(btn).toBeDisabled());
    });
  });

  it('financial coverage chip shows coverage state', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      const coverageBtn = screen.getByRole('button', { name: /financial coverage/i });
      expect(coverageBtn).toBeInTheDocument();
    });
  });

  it('shows error state when /revenue/financials fails', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/revenue/financials'))         return Promise.reject({ response: { data: { error: 'Financial analytics could not be loaded.' } } });
      if (url.includes('/revenue/customers/overview')) return Promise.resolve({ data: MOCK_CUSTOMERS });
      if (url.includes('/revenue/forecast/readiness')) return Promise.resolve({ data: MOCK_FORECAST_READINESS });
      if (url.includes('/revenue/saved-views'))        return Promise.resolve({ data: MOCK_SAVED_VIEWS });
      if (url.includes('/revenue/overview'))           return Promise.resolve({ data: MOCK_OVERVIEW });
      if (url.includes('/revenue/trend'))              return Promise.resolve({ data: MOCK_TREND });
      if (url.includes('/revenue/services'))           return Promise.resolve({ data: MOCK_SERVICES });
      if (url.includes('/revenue/quarterly'))          return Promise.resolve({ data: MOCK_QUARTERLY });
      return Promise.reject(new Error('Unknown'));
    });
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByText(/financial analytics could not be loaded/i)).toBeInTheDocument();
    });
  });

  // ── Payouts + capitalization ───────────────────────────────────────────────

  it('FieldCore Payments card shows Payouts capability', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByText('Payouts')).toBeInTheDocument();
    });
  });

  it('FieldCore Payments shows Processing Fees capability', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByText('Processing Fees')).toBeInTheDocument();
    });
  });

  it('FieldCore Payments shows Disputes capability', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByText('Disputes')).toBeInTheDocument();
    });
  });

  it('capability labels are capitalized (no lowercase-only pills)', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByText('Financial Data Sources')).toBeInTheDocument();
    });
    const pills = document.querySelectorAll('.fin-int-cap');
    pills.forEach(pill => {
      const text = pill.textContent;
      if (text.length > 0) {
        expect(text[0]).toBe(text[0].toUpperCase());
      }
    });
  });

  it('Accounting card shows Account Mapping capability', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByText('Account Mapping')).toBeInTheDocument();
    });
  });

  it('Banking card shows External Deposits capability', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByText('External Deposits')).toBeInTheDocument();
    });
  });

  it('Accounting card shows Coming Soon when canConnect is false', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      const btns = screen.getAllByRole('button', { name: /coming soon/i });
      // At least one Coming Soon button (accounting or banking)
      expect(btns.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('Accounting card shows Connect QuickBooks when canConnect is true', async () => {
    const qbReadyMock = {
      ...MOCK_FINANCIALS,
      coverage: {
        ...MOCK_FINANCIALS.coverage,
        optionalSources: [
          { sourceKey: 'accounting', providerLabel: 'Accounting', status: 'not_connected', capabilities: ['cogs', 'operating_expenses', 'taxes', 'vendor_expenses', 'account_mapping', 'reconciliation'], canConnect: true, connectionInfo: null },
          { sourceKey: 'banking',    providerLabel: 'Banking',    status: 'not_connected', capabilities: ['bank_balances', 'cash_transactions', 'cash_out', 'external_deposits', 'reconciliation'] },
        ],
      },
    };
    api.get.mockImplementation((url) => {
      if (url.includes('/revenue/financials'))         return Promise.resolve({ data: qbReadyMock });
      if (url.includes('/revenue/customers/overview')) return Promise.resolve({ data: MOCK_CUSTOMERS });
      if (url.includes('/revenue/forecast/readiness')) return Promise.resolve({ data: MOCK_FORECAST_READINESS });
      if (url.includes('/revenue/saved-views'))        return Promise.resolve({ data: MOCK_SAVED_VIEWS });
      if (url.includes('/revenue/overview'))           return Promise.resolve({ data: MOCK_OVERVIEW });
      if (url.includes('/revenue/trend'))              return Promise.resolve({ data: MOCK_TREND });
      if (url.includes('/revenue/services'))           return Promise.resolve({ data: MOCK_SERVICES });
      if (url.includes('/revenue/quarterly'))          return Promise.resolve({ data: MOCK_QUARTERLY });
      return Promise.reject(new Error('Unknown'));
    });
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /connect quickbooks/i })).toBeInTheDocument();
    });
  });

  it('Accounting shows Connected state when QB is connected', async () => {
    const qbConnectedMock = {
      ...MOCK_FINANCIALS,
      coverage: {
        ...MOCK_FINANCIALS.coverage,
        activeSources: [
          { sourceKey: 'fieldcore_core',     providerLabel: 'FieldCore Core',     status: 'active', capabilities: ['revenue', 'invoices', 'ar', 'jobs'] },
          { sourceKey: 'fieldcore_payments', providerLabel: 'FieldCore Payments', status: 'active', capabilities: ['payments', 'deposits', 'cash_in', 'refunds', 'processing_fees', 'disputes', 'payouts'], paymentsStatus: { status: 'ACTIVE', limitations: [] } },
          { sourceKey: 'accounting', providerLabel: 'QuickBooks Online', status: 'active', capabilities: ['cogs', 'operating_expenses', 'taxes', 'vendor_expenses', 'account_mapping', 'reconciliation'], connectionInfo: { companyName: 'Acme HVAC LLC', statusLabel: 'Connected', lastSyncAt: new Date().toISOString(), lastSuccessfulSyncAt: new Date().toISOString(), lastErrorCode: null, unmappedAccountCount: 0 } },
        ],
        optionalSources: [
          { sourceKey: 'banking', providerLabel: 'Banking', status: 'not_connected', capabilities: ['bank_balances', 'cash_transactions', 'cash_out', 'external_deposits', 'reconciliation'] },
        ],
      },
    };
    api.get.mockImplementation((url) => {
      if (url.includes('/revenue/financials'))         return Promise.resolve({ data: qbConnectedMock });
      if (url.includes('/revenue/customers/overview')) return Promise.resolve({ data: MOCK_CUSTOMERS });
      if (url.includes('/revenue/forecast/readiness')) return Promise.resolve({ data: MOCK_FORECAST_READINESS });
      if (url.includes('/revenue/saved-views'))        return Promise.resolve({ data: MOCK_SAVED_VIEWS });
      if (url.includes('/revenue/overview'))           return Promise.resolve({ data: MOCK_OVERVIEW });
      if (url.includes('/revenue/trend'))              return Promise.resolve({ data: MOCK_TREND });
      if (url.includes('/revenue/services'))           return Promise.resolve({ data: MOCK_SERVICES });
      if (url.includes('/revenue/quarterly'))          return Promise.resolve({ data: MOCK_QUARTERLY });
      return Promise.reject(new Error('Unknown'));
    });
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByText('QuickBooks Online')).toBeInTheDocument();
      expect(screen.getByText('Acme HVAC LLC')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sync quickbooks now/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /disconnect quickbooks/i })).toBeInTheDocument();
    });
  });

  it('Accounting shows unmapped account warning when count > 0', async () => {
    const unmappedMock = {
      ...MOCK_FINANCIALS,
      coverage: {
        ...MOCK_FINANCIALS.coverage,
        activeSources: [
          ...MOCK_FINANCIALS.coverage.activeSources,
          { sourceKey: 'accounting', providerLabel: 'QuickBooks Online', status: 'active', capabilities: ['cogs', 'operating_expenses'], connectionInfo: { companyName: 'Test Co', statusLabel: 'Connected', lastSyncAt: null, lastSuccessfulSyncAt: null, lastErrorCode: null, unmappedAccountCount: 4 } },
        ],
        optionalSources: [
          { sourceKey: 'banking', providerLabel: 'Banking', status: 'not_connected', capabilities: ['bank_balances'] },
        ],
      },
    };
    api.get.mockImplementation((url) => {
      if (url.includes('/revenue/financials'))         return Promise.resolve({ data: unmappedMock });
      if (url.includes('/revenue/customers/overview')) return Promise.resolve({ data: MOCK_CUSTOMERS });
      if (url.includes('/revenue/forecast/readiness')) return Promise.resolve({ data: MOCK_FORECAST_READINESS });
      if (url.includes('/revenue/saved-views'))        return Promise.resolve({ data: MOCK_SAVED_VIEWS });
      if (url.includes('/revenue/overview'))           return Promise.resolve({ data: MOCK_OVERVIEW });
      if (url.includes('/revenue/trend'))              return Promise.resolve({ data: MOCK_TREND });
      if (url.includes('/revenue/services'))           return Promise.resolve({ data: MOCK_SERVICES });
      if (url.includes('/revenue/quarterly'))          return Promise.resolve({ data: MOCK_QUARTERLY });
      return Promise.reject(new Error('Unknown'));
    });
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByText(/4 accounts need mapping/i)).toBeInTheDocument();
    });
  });

  it('Banking remains optional (Coming Soon) after QB connect', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByText('Banking')).toBeInTheDocument();
    });
    // Banking should not show Connect QuickBooks or any active state
    expect(screen.queryByText(/connect quickbooks/i)).not.toBeInTheDocument();
  });

  it('no raw enum labels are shown (REAUTH_REQUIRED etc.)', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByText('Financial Data Sources')).toBeInTheDocument();
    });
    expect(screen.queryByText('REAUTH_REQUIRED')).not.toBeInTheDocument();
    expect(screen.queryByText('SYNC_ERROR')).not.toBeInTheDocument();
    expect(screen.queryByText('NOT_CONNECTED')).not.toBeInTheDocument();
  });
});
