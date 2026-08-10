import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RevenueKpiCard from '../RevenueKpiCard';

const PROVENANCE = {
  formula:    'SUM(jobs.amount) WHERE status = complete',
  sources:    ['jobs'],
  basis:      'job.scheduled_at (UTC)',
  exclusions: ['cancelled', 'no_show'],
  note:       'Revenue counted once per job regardless of team size.',
};

// ── Rendering ──────────────────────────────────────────────────────────────────

describe('RevenueKpiCard — rendering', () => {
  it('renders the label', () => {
    render(<RevenueKpiCard label="Earned Revenue" value="$1.2K" status="ok" />);
    expect(screen.getByText('Earned Revenue')).toBeInTheDocument();
  });

  it('renders the value when status is ok', () => {
    render(<RevenueKpiCard label="Earned Revenue" value="$1.2K" status="ok" />);
    expect(screen.getByText('$1.2K')).toBeInTheDocument();
  });

  it('renders a suffix when provided', () => {
    render(<RevenueKpiCard label="Completion Rate" value="87.5" status="ok" suffix="%" />);
    expect(screen.getByText('%')).toBeInTheDocument();
  });

  it('renders a note when provided', () => {
    render(<RevenueKpiCard label="Test" value="$500" status="ok" note="5 completed jobs" />);
    expect(screen.getByText('5 completed jobs')).toBeInTheDocument();
  });

  it('has aria-label with label and value', () => {
    render(<RevenueKpiCard label="Collected Revenue" value="$2.3K" status="ok" />);
    const el = screen.getByLabelText('Collected Revenue: $2.3K');
    expect(el).toBeInTheDocument();
  });
});

// ── Loading state ──────────────────────────────────────────────────────────────

describe('RevenueKpiCard — loading state', () => {
  it('shows skeleton when isLoading=true', () => {
    const { container } = render(<RevenueKpiCard label="Test" value="$100" status="ok" isLoading={true} />);
    expect(container.querySelector('.rov-kpi-skeleton')).toBeInTheDocument();
  });

  it('does not show value while loading', () => {
    render(<RevenueKpiCard label="Test" value="$100" status="ok" isLoading={true} />);
    expect(screen.queryByText('$100')).not.toBeInTheDocument();
  });

  it('shows skeleton when status is loading', () => {
    const { container } = render(<RevenueKpiCard label="Test" value={null} status="loading" />);
    expect(container.querySelector('.rov-kpi-skeleton')).toBeInTheDocument();
  });
});

// ── Unavailable states ─────────────────────────────────────────────────────────

describe('RevenueKpiCard — unavailable states', () => {
  it('shows "Unavailable" when status=unavailable', () => {
    render(<RevenueKpiCard label="Gross Profit" value={null} status="unavailable" />);
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });

  it('does NOT show $0 when status=unavailable', () => {
    render(<RevenueKpiCard label="Gross Profit" value={null} status="unavailable" />);
    expect(screen.queryByText('$0')).not.toBeInTheDocument();
  });

  it('shows "Insufficient data" when status=insufficient_data', () => {
    render(<RevenueKpiCard label="Rev/Hr" value={null} status="insufficient_data" />);
    expect(screen.getByText('Insufficient data')).toBeInTheDocument();
  });

  it('shows "None in period" when status=no_eligible_revenue', () => {
    render(<RevenueKpiCard label="Avg Ticket" value={null} status="no_eligible_revenue" />);
    expect(screen.getByText('None in period')).toBeInTheDocument();
  });

  it('shows "Could not load" when status=error', () => {
    render(<RevenueKpiCard label="Test" value={null} status="error" />);
    expect(screen.getByText('Could not load')).toBeInTheDocument();
  });

  it('shows provenance note in unavailable state', () => {
    render(
      <RevenueKpiCard
        label="Gross Profit"
        value={null}
        status="unavailable"
        provenance={{ note: 'No cost source configured.' }}
      />
    );
    expect(screen.getByText('No cost source configured.')).toBeInTheDocument();
  });
});

// ── Comparison delta ───────────────────────────────────────────────────────────

describe('RevenueKpiCard — comparison delta', () => {
  it('shows up arrow and percentage for positive comparison', () => {
    render(
      <RevenueKpiCard
        label="Earned Revenue"
        value="$1.2K"
        status="ok"
        comparison={{ change: 200, pct: 20, direction: 'up' }}
        comparisonBasis="vs. previous month"
      />
    );
    expect(screen.getByText(/↑/)).toBeInTheDocument();
    expect(screen.getByText(/20\.0%/)).toBeInTheDocument();
    expect(screen.getByText('vs. previous month')).toBeInTheDocument();
  });

  it('shows down arrow for negative comparison', () => {
    render(
      <RevenueKpiCard
        label="Earned Revenue"
        value="$800"
        status="ok"
        comparison={{ change: -200, pct: -20, direction: 'down' }}
        comparisonBasis="vs. previous month"
      />
    );
    expect(screen.getByText(/↓/)).toBeInTheDocument();
  });

  it('does not show comparison when null', () => {
    const { container } = render(
      <RevenueKpiCard label="Test" value="$100" status="ok" comparison={null} />
    );
    expect(container.querySelector('.rov-kpi-comparison')).not.toBeInTheDocument();
  });
});

// ── How calculated (modal) ────────────────────────────────────────────────────

describe('RevenueKpiCard — How calculated', () => {
  it('shows "How calculated" button when provenance is provided', () => {
    render(
      <RevenueKpiCard label="Earned Revenue" value="$1K" status="ok" provenance={PROVENANCE} />
    );
    expect(screen.getByText('How calculated')).toBeInTheDocument();
  });

  it('does not show modal content initially', () => {
    render(
      <RevenueKpiCard label="Earned Revenue" value="$1K" status="ok" provenance={PROVENANCE} />
    );
    expect(screen.queryByText(/SUM\(jobs\.amount\)/)).not.toBeInTheDocument();
  });

  it('opens modal with formula after clicking "How calculated"', () => {
    render(
      <RevenueKpiCard label="Earned Revenue" value="$1K" status="ok" provenance={PROVENANCE} />
    );
    fireEvent.click(screen.getByText('How calculated'));
    expect(screen.getByText(/SUM\(jobs\.amount\)/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('modal title includes the metric label', () => {
    render(
      <RevenueKpiCard label="Earned Revenue" value="$1K" status="ok" provenance={PROVENANCE} />
    );
    fireEvent.click(screen.getByText('How calculated'));
    expect(screen.getByText(/How Earned Revenue Is Calculated/i)).toBeInTheDocument();
  });

  it('closes modal when × button is clicked', () => {
    render(
      <RevenueKpiCard label="Test" value="$100" status="ok" provenance={PROVENANCE} />
    );
    fireEvent.click(screen.getByText('How calculated'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows Last Calculated section in modal when calculatedAt is provided', () => {
    const iso = '2026-08-06T10:30:00.000Z';
    render(
      <RevenueKpiCard label="Test" value="$100" status="ok" provenance={PROVENANCE} calculatedAt={iso} />
    );
    fireEvent.click(screen.getByText('How calculated'));
    expect(screen.getByText('Last Calculated')).toBeInTheDocument();
  });

  it('"How calculated" button has aria-haspopup=dialog', () => {
    render(
      <RevenueKpiCard label="Test" value="$100" status="ok" provenance={PROVENANCE} />
    );
    const btn = screen.getByText('How calculated');
    expect(btn).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('modal has role=dialog and aria-modal=true', () => {
    render(
      <RevenueKpiCard label="Test" value="$100" status="ok" provenance={PROVENANCE} />
    );
    fireEvent.click(screen.getByText('How calculated'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('does not show "Hide" text — modal uses a × close button', () => {
    render(
      <RevenueKpiCard label="Test" value="$100" status="ok" provenance={PROVENANCE} />
    );
    fireEvent.click(screen.getByText('How calculated'));
    expect(screen.queryByText('Hide')).not.toBeInTheDocument();
  });
});

// ── Primary vs Secondary size ──────────────────────────────────────────────────

describe('RevenueKpiCard — size prop', () => {
  it('applies rov-kpi-card--primary class for size=primary', () => {
    const { container } = render(
      <RevenueKpiCard label="Test" value="$1K" status="ok" size="primary" />
    );
    expect(container.querySelector('.rov-kpi-card--primary')).toBeInTheDocument();
  });

  it('applies rov-kpi-card--secondary class for size=secondary', () => {
    const { container } = render(
      <RevenueKpiCard label="Test" value="$500" status="ok" size="secondary" />
    );
    expect(container.querySelector('.rov-kpi-card--secondary')).toBeInTheDocument();
  });
});
