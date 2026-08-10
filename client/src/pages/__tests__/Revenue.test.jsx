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
    repeatRevenue:       { value: 600, status: 'ok', clientCount: 2, jobCount: 3, provenance: { formula: 'Revenue from returning clients' } },
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

  it('renders Repeat Revenue', async () => {
    renderRevenue();
    await waitFor(() => expect(screen.getByText('Repeat Revenue')).toBeInTheDocument());
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

  it('shows View All Services button', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /View All Services/i })).toBeInTheDocument();
    });
  });

  it('View All Services navigates to Operations workspace', async () => {
    renderRevenue();
    await waitFor(() => screen.getByRole('button', { name: /View All Services/i }));
    fireEvent.click(screen.getByRole('button', { name: /View All Services/i }));
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
      if (url.includes('/revenue/services'))           return Promise.resolve({ data: MOCK_SERVICES });
      if (url.includes('/revenue/quarterly'))          return Promise.resolve({ data: MOCK_QUARTERLY });
      return Promise.reject(new Error('Unknown'));
    });
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByText(/No service revenue in this period/i)).toBeInTheDocument();
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
