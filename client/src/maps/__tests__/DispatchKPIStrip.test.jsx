import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DispatchKPIStrip from '../DispatchKPIStrip';

vi.mock('../../api', () => ({
  default: { get: vi.fn() },
}));

import api from '../../api';

// Normalized API response shape (new format)
const SUMMARY_NORMALIZED = {
  metrics: [
    { key: 'liveTechnicians', label: 'Live Techs',    status: 'active', value: 3,  displayValue: '3',   supportingText: '2 online · 1 stale',  enabled: true, configured: true, sampleSize: null, reasonCode: null, configurePath: null },
    { key: 'activeJobs',      label: 'Active Jobs',   status: 'active', value: 5,  displayValue: '5',   supportingText: '4 in progress',        enabled: true, configured: true, sampleSize: null, reasonCode: null, configurePath: null },
    { key: 'todaysJobs',      label: "Today's Jobs",  status: 'active', value: 12, displayValue: '12',  supportingText: '2 unassigned',         enabled: true, configured: true, sampleSize: null, reasonCode: null, configurePath: null },
    { key: 'completedToday',  label: 'Completed',     status: 'active', value: 4,  displayValue: '4',   supportingText: 'today',                enabled: true, configured: true, sampleSize: null, reasonCode: null, configurePath: null },
    { key: 'averageResponse', label: 'Avg Response',  status: 'active', value: 18, displayValue: '18m', supportingText: '6 jobs',               enabled: true, configured: true, sampleSize: 6,    reasonCode: null, configurePath: null },
  ],
  liveTechnicians:     { total: 3,  online: 2,  stale: 1  },
  activeJobs:          { total: 5,  inProgress: 4 },
  todaysJobs:          { total: 12, unassigned: 2 },
  completedToday:      { total: 4  },
  averageResponseTime: { minutes: 18, sampleSize: 6 },
  generatedAt:         '2026-08-01T10:00:00Z',
  timezone:            'America/Chicago',
};

// Legacy (backward-compat) shape
const SUMMARY_LEGACY = {
  liveTechnicians:     { total: 3,  online: 2,  stale: 1  },
  activeJobs:          { total: 5,  inProgress: 4, paused: 1 },
  todaysJobs:          { total: 12, scheduled: 8, unassigned: 2 },
  completedToday:      { total: 4  },
  averageResponseTime: { minutes: 18, sampleSize: 6 },
  generatedAt:         '2026-08-01T10:00:00Z',
  timezone:            'America/Chicago',
};

beforeEach(() => {
  vi.useFakeTimers();
  api.get.mockResolvedValue({ data: SUMMARY_NORMALIZED });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ── Loading state ────────────────────────────────────────────────────────────

describe('DispatchKPIStrip — loading state', () => {
  it('shows 5 skeleton cards while loading', () => {
    api.get.mockReturnValue(new Promise(() => {}));
    const { container } = render(<DispatchKPIStrip onCardClick={vi.fn()} />);
    expect(container.querySelectorAll('.dispatch-kpi-skel').length).toBe(5);
  });

  it('has aria-label during loading', () => {
    api.get.mockReturnValue(new Promise(() => {}));
    render(<DispatchKPIStrip onCardClick={vi.fn()} />);
    expect(screen.getByLabelText(/loading/i)).toBeInTheDocument();
  });
});

// ── Normalized metric shape ───────────────────────────────────────────────────

describe('DispatchKPIStrip — normalized API shape', () => {
  async function renderLoaded() {
    let c;
    await act(async () => { c = render(<DispatchKPIStrip onCardClick={vi.fn()} />); });
    return c;
  }

  it('renders 5 KPI cards', async () => {
    await renderLoaded();
    expect(screen.getAllByRole('listitem').length).toBe(5);
  });

  it('shows live technicians value from normalized metric', async () => {
    await renderLoaded();
    expect(screen.getByLabelText(/live techs: 3/i)).toBeInTheDocument();
  });

  it('shows supportingText from normalized metric', async () => {
    await renderLoaded();
    expect(screen.getByText(/2 online · 1 stale/i)).toBeInTheDocument();
  });

  it('shows active jobs total', async () => {
    await renderLoaded();
    expect(screen.getByLabelText(/active jobs: 5/i)).toBeInTheDocument();
  });

  it('shows in-progress count in active jobs sub', async () => {
    await renderLoaded();
    expect(screen.getByText(/4 in progress/i)).toBeInTheDocument();
  });

  it("shows today's jobs total", async () => {
    await renderLoaded();
    expect(screen.getByLabelText(/today.*12/i)).toBeInTheDocument();
  });

  it('shows unassigned count in sub', async () => {
    await renderLoaded();
    expect(screen.getByText(/2 unassigned/i)).toBeInTheDocument();
  });

  it('shows completed count', async () => {
    await renderLoaded();
    expect(screen.getByLabelText(/completed: 4/i)).toBeInTheDocument();
  });

  it('shows avg response time with m suffix', async () => {
    await renderLoaded();
    expect(screen.getByText('18m')).toBeInTheDocument();
  });

  it('shows sample size in avg response sub', async () => {
    await renderLoaded();
    expect(screen.getByText(/6 jobs/i)).toBeInTheDocument();
  });

  it('shows — for no_data status', async () => {
    api.get.mockResolvedValue({
      data: {
        ...SUMMARY_NORMALIZED,
        metrics: SUMMARY_NORMALIZED.metrics.map(m =>
          m.key === 'averageResponse'
            ? { ...m, status: 'no_data', value: null, displayValue: '—', supportingText: 'No data', sampleSize: 0 }
            : m
        ),
      },
    });
    await renderLoaded();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('never shows undefined or NaN in values', async () => {
    await renderLoaded();
    const buttons = screen.getAllByRole('button');
    buttons.forEach(btn => {
      expect(btn.textContent).not.toContain('undefined');
      expect(btn.textContent).not.toContain('NaN');
    });
  });
});

// ── Legacy API shape ──────────────────────────────────────────────────────────

describe('DispatchKPIStrip — legacy API shape', () => {
  async function renderLegacy() {
    api.get.mockResolvedValue({ data: SUMMARY_LEGACY });
    let c;
    await act(async () => { c = render(<DispatchKPIStrip onCardClick={vi.fn()} />); });
    return c;
  }

  it('renders 5 KPI cards from legacy shape', async () => {
    await renderLegacy();
    expect(screen.getAllByRole('listitem').length).toBe(5);
  });

  it('shows live technicians from legacy shape', async () => {
    await renderLegacy();
    expect(screen.getByLabelText(/live techs: 3/i)).toBeInTheDocument();
  });

  it('shows avg response from legacy shape', async () => {
    await renderLegacy();
    expect(screen.getByText('18m')).toBeInTheDocument();
  });

  it('shows — for avg response when minutes is null (legacy)', async () => {
    api.get.mockResolvedValue({
      data: { ...SUMMARY_LEGACY, averageResponseTime: { minutes: null, sampleSize: 0 } },
    });
    let c;
    await act(async () => { c = render(<DispatchKPIStrip onCardClick={vi.fn()} />); });
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows "all assigned" when unassigned is 0 (legacy)', async () => {
    api.get.mockResolvedValue({
      data: { ...SUMMARY_LEGACY, todaysJobs: { total: 10, scheduled: 8, unassigned: 0 } },
    });
    let c;
    await act(async () => { c = render(<DispatchKPIStrip onCardClick={vi.fn()} />); });
    expect(screen.getByText('all assigned')).toBeInTheDocument();
  });
});

// ── KPI card states ───────────────────────────────────────────────────────────

describe('DispatchKPIStrip — metric status states', () => {
  it('shows "Set up" for not_configured metric', async () => {
    api.get.mockResolvedValue({
      data: {
        ...SUMMARY_NORMALIZED,
        metrics: SUMMARY_NORMALIZED.metrics.map(m =>
          m.key === 'averageResponse'
            ? { ...m, status: 'not_configured', value: null, displayValue: null }
            : m
        ),
      },
    });
    await act(async () => { render(<DispatchKPIStrip onCardClick={vi.fn()} userRole="owner" />); });
    expect(screen.getByText('Set up')).toBeInTheDocument();
  });

  it('shows "Off" for disabled metric', async () => {
    api.get.mockResolvedValue({
      data: {
        ...SUMMARY_NORMALIZED,
        metrics: SUMMARY_NORMALIZED.metrics.map(m =>
          m.key === 'averageResponse'
            ? { ...m, status: 'disabled', value: null, displayValue: null }
            : m
        ),
      },
    });
    await act(async () => { render(<DispatchKPIStrip onCardClick={vi.fn()} />); });
    expect(screen.getByText('Off')).toBeInTheDocument();
  });

  it('shows — for unavailable metric with fallback on first load failure', async () => {
    api.get.mockRejectedValue(new Error('Network error'));
    await act(async () => { render(<DispatchKPIStrip onCardClick={vi.fn()} />); });
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

// ── Interaction ───────────────────────────────────────────────────────────────

describe('DispatchKPIStrip — interaction', () => {
  it('calls onCardClick("liveTechnicians") when Live Techs is clicked', async () => {
    const onCardClick = vi.fn();
    await act(async () => { render(<DispatchKPIStrip onCardClick={onCardClick} />); });
    fireEvent.click(screen.getByLabelText(/live techs/i));
    expect(onCardClick).toHaveBeenCalledWith('liveTechnicians');
  });

  it('calls onCardClick("activeJobs") when Active Jobs is clicked', async () => {
    const onCardClick = vi.fn();
    await act(async () => { render(<DispatchKPIStrip onCardClick={onCardClick} />); });
    fireEvent.click(screen.getByLabelText(/active jobs/i));
    expect(onCardClick).toHaveBeenCalledWith('activeJobs');
  });

  it('calls onCardClick("completedToday") when Completed is clicked', async () => {
    const onCardClick = vi.fn();
    await act(async () => { render(<DispatchKPIStrip onCardClick={onCardClick} />); });
    fireEvent.click(screen.getByLabelText(/completed/i));
    expect(onCardClick).toHaveBeenCalledWith('completedToday');
  });

  it('polls every 30 s', async () => {
    await act(async () => { render(<DispatchKPIStrip onCardClick={vi.fn()} />); });
    const before = api.get.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(30000); });
    expect(api.get.mock.calls.length).toBeGreaterThan(before);
  });
});

// ── Stale / error handling ────────────────────────────────────────────────────

describe('DispatchKPIStrip — error handling', () => {
  it('hides loading after API failure', async () => {
    api.get.mockRejectedValue(new Error('Network error'));
    await act(async () => { render(<DispatchKPIStrip onCardClick={vi.fn()} />); });
    expect(screen.queryByLabelText(/loading/i)).not.toBeInTheDocument();
  });

  it('retains previous data and shows stale indicator on refresh failure', async () => {
    await act(async () => { render(<DispatchKPIStrip onCardClick={vi.fn()} />); });
    expect(screen.getByLabelText(/live techs: 3/i)).toBeInTheDocument();

    api.get.mockRejectedValue(new Error('Network error'));
    await act(async () => { vi.advanceTimersByTime(30000); });

    expect(screen.getByLabelText(/live techs: 3/i)).toBeInTheDocument();
    expect(document.querySelector('.dispatch-kpi-stale')).toBeInTheDocument();
  });

  it('clears stale indicator once refresh succeeds', async () => {
    await act(async () => { render(<DispatchKPIStrip onCardClick={vi.fn()} />); });
    api.get.mockRejectedValue(new Error('Network error'));
    await act(async () => { vi.advanceTimersByTime(30000); });
    expect(document.querySelector('.dispatch-kpi-stale')).toBeInTheDocument();

    api.get.mockResolvedValue({ data: SUMMARY_NORMALIZED });
    await act(async () => { vi.advanceTimersByTime(30000); });
    expect(document.querySelector('.dispatch-kpi-stale')).not.toBeInTheDocument();
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe('DispatchKPIStrip — accessibility', () => {
  it('each card is a button', async () => {
    await act(async () => { render(<DispatchKPIStrip onCardClick={vi.fn()} />); });
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(5);
    buttons.forEach(b => expect(b).toHaveAttribute('type', 'button'));
  });

  it('each card has an aria-label', async () => {
    await act(async () => { render(<DispatchKPIStrip onCardClick={vi.fn()} />); });
    screen.getAllByRole('button').forEach(b => expect(b).toHaveAttribute('aria-label'));
  });

  it('strip has aria-label="Dispatch metrics"', async () => {
    await act(async () => { render(<DispatchKPIStrip onCardClick={vi.fn()} />); });
    expect(screen.getByRole('list', { name: /dispatch metrics/i })).toBeInTheDocument();
  });

  it('list contains 5 listitem elements', async () => {
    await act(async () => { render(<DispatchKPIStrip onCardClick={vi.fn()} />); });
    expect(screen.getAllByRole('listitem').length).toBe(5);
  });
});
