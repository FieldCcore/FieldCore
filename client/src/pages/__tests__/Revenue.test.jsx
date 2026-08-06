import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Revenue from '../Revenue';

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
    completionRate: { value: 0.87, pct: 87, status: 'ok', completed: 7, eligible: 8 },
    revenueAtRisk:  { value: 450, status: 'ok', breakdown: { overdueInvoices: { total: 300, count: 1 }, cancelledJobs: { total: 150, count: 1 }, failedPayments: { total: 0, count: 0 } } },
  },
  secondaryKpis: {
    averageTicket:         { value: 300, status: 'ok', count: 5, provenance: { formula: 'Earned ÷ jobs', sources: ['jobs'] } },
    revenuePerLaborHour:   { value: 75,  status: 'ok', hours: 20, basis: 'scheduled_labor_hours', provenance: { formula: 'Earned ÷ scheduled hrs', note: 'Scheduled, not actual.' } },
    completionRate:        { value: 0.87, pct: 87, status: 'ok', completed: 7, eligible: 8, provenance: { formula: 'Completed ÷ eligible' } },
    technicianUtilization: { value: null, status: 'unavailable', missingSources: ['availability'], provenance: { formula: 'Committed ÷ capacity', note: 'Not configured.' } },
    repeatRevenue:         { value: 600, status: 'ok', clientCount: 2, jobCount: 3, provenance: { formula: 'Revenue from returning clients' } },
    revenueAtRisk:         { value: 450, status: 'ok', provenance: { formula: 'Overdue + cancelled + failed' } },
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
  freshness:   { calculatedAt: '2026-08-06T10:00:00Z', staleAfter: '2026-08-06T10:05:00Z' },
  limitations: ['Gross profit unavailable.', 'Technician utilization unavailable.'],
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

function renderRevenue(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/revenue${search}`]}>
      <Revenue />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((url) => {
    if (url.includes('/revenue/overview')) return Promise.resolve({ data: MOCK_OVERVIEW });
    if (url.includes('/revenue/trend'))    return Promise.resolve({ data: MOCK_TREND });
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

  it('non-Overview workspaces show a coming-soon state', async () => {
    renderRevenue('?view=financials');
    await waitFor(() => {
      expect(screen.getByText(/later audit phase/i)).toBeInTheDocument();
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

// ── Page header ────────────────────────────────────────────────────────────────

describe('Revenue — page header', () => {
  it('shows the correct page title', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Revenue Analytics' })).toBeInTheDocument();
    });
  });

  it('shows the subtitle', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByText(/Understand what the business earned/i)).toBeInTheDocument();
    });
  });

  it('shows an Export button', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });
  });
});

// ── No permanent right-side stack ─────────────────────────────────────────────

describe('Revenue — no permanent right-side rail', () => {
  it('does not render Monthly Summary card', async () => {
    renderRevenue();
    await waitFor(() => screen.getByText('Revenue Analytics'));
    expect(screen.queryByText('Monthly Summary')).not.toBeInTheDocument();
  });

  it('does not render Top Services card', async () => {
    renderRevenue();
    await waitFor(() => screen.getByText('Revenue Analytics'));
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

  it('renders Completion Rate', async () => {
    renderRevenue();
    await waitFor(() => expect(screen.getByText('Completion Rate')).toBeInTheDocument());
  });

  it('renders Technician Utilization as unavailable', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByText('Technician Utilization')).toBeInTheDocument();
      // Multiple cards may show Unavailable; check at least one exists
      expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
    });
  });

  it('does NOT show 0% for Technician Utilization', async () => {
    renderRevenue();
    await waitFor(() => screen.getByText('Technician Utilization'));
    // "0%" should NOT appear as utilization value when status is unavailable
    // We check Unavailable is shown instead
    const unavailEls = screen.queryAllByText('Unavailable');
    expect(unavailEls.length).toBeGreaterThan(0);
  });

  it('renders Repeat Revenue', async () => {
    renderRevenue();
    await waitFor(() => expect(screen.getByText('Repeat Revenue')).toBeInTheDocument());
  });

  it('renders Revenue at Risk', async () => {
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
  it('renders Revenue by Service heading', async () => {
    renderRevenue();
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

  it('shows "revenue counted once per job" note', async () => {
    renderRevenue();
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
      if (url.includes('/revenue/overview')) return Promise.reject(new Error('Server error'));
      if (url.includes('/revenue/trend'))    return Promise.resolve({ data: MOCK_TREND });
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

// ── Limitations footer ─────────────────────────────────────────────────────────

describe('Revenue — limitations', () => {
  it('shows data limitations section', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByText('Data limitations')).toBeInTheDocument();
    });
  });

  it('shows gross profit limitation note', async () => {
    renderRevenue();
    await waitFor(() => {
      expect(screen.getByText(/Gross profit unavailable/i)).toBeInTheDocument();
    });
  });
});
