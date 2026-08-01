import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DispatchKPIStrip from '../DispatchKPIStrip';

vi.mock('../../api', () => ({
  default: { get: vi.fn() },
}));

import api from '../../api';

const SUMMARY = {
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
  api.get.mockResolvedValue({ data: SUMMARY });
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

// ── Loaded state ─────────────────────────────────────────────────────────────

describe('DispatchKPIStrip — loaded state', () => {
  async function renderLoaded() {
    let c;
    await act(async () => { c = render(<DispatchKPIStrip onCardClick={vi.fn()} />); });
    return c;
  }

  it('renders 5 KPI cards', async () => {
    await renderLoaded();
    expect(screen.getAllByRole('listitem').length).toBe(5);
  });

  it('shows live technicians total', async () => {
    await renderLoaded();
    expect(screen.getByLabelText(/live techs: 3/i)).toBeInTheDocument();
  });

  it('shows online · stale breakdown in sub', async () => {
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

  it('shows — for avg response when minutes is null', async () => {
    api.get.mockResolvedValue({
      data: { ...SUMMARY, averageResponseTime: { minutes: null, sampleSize: 0 } },
    });
    await renderLoaded();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows No data for avg response when sampleSize is 0', async () => {
    api.get.mockResolvedValue({
      data: { ...SUMMARY, averageResponseTime: { minutes: null, sampleSize: 0 } },
    });
    await renderLoaded();
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('shows "all assigned" when unassigned is 0', async () => {
    api.get.mockResolvedValue({
      data: { ...SUMMARY, todaysJobs: { total: 10, scheduled: 8, unassigned: 0 } },
    });
    await renderLoaded();
    expect(screen.getByText('all assigned')).toBeInTheDocument();
  });
});

// ── Interaction ───────────────────────────────────────────────────────────────

describe('DispatchKPIStrip — interaction', () => {
  it('calls onCardClick("live") when Live Techs is clicked', async () => {
    const onCardClick = vi.fn();
    await act(async () => { render(<DispatchKPIStrip onCardClick={onCardClick} />); });
    fireEvent.click(screen.getByLabelText(/live techs/i));
    expect(onCardClick).toHaveBeenCalledWith('live');
  });

  it('calls onCardClick("active") when Active Jobs is clicked', async () => {
    const onCardClick = vi.fn();
    await act(async () => { render(<DispatchKPIStrip onCardClick={onCardClick} />); });
    fireEvent.click(screen.getByLabelText(/active jobs/i));
    expect(onCardClick).toHaveBeenCalledWith('active');
  });

  it('calls onCardClick("completed") when Completed is clicked', async () => {
    const onCardClick = vi.fn();
    await act(async () => { render(<DispatchKPIStrip onCardClick={onCardClick} />); });
    fireEvent.click(screen.getByLabelText(/completed/i));
    expect(onCardClick).toHaveBeenCalledWith('completed');
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
    // First load succeeds
    await act(async () => { render(<DispatchKPIStrip onCardClick={vi.fn()} />); });
    expect(screen.getByLabelText(/live techs: 3/i)).toBeInTheDocument();

    // Subsequent poll fails
    api.get.mockRejectedValue(new Error('Network error'));
    await act(async () => { vi.advanceTimersByTime(30000); });

    // Previous value retained
    expect(screen.getByLabelText(/live techs: 3/i)).toBeInTheDocument();
    // Stale dot shown
    expect(document.querySelector('.dispatch-kpi-stale')).toBeInTheDocument();
  });

  it('clears stale indicator once refresh succeeds', async () => {
    await act(async () => { render(<DispatchKPIStrip onCardClick={vi.fn()} />); });
    api.get.mockRejectedValue(new Error('Network error'));
    await act(async () => { vi.advanceTimersByTime(30000); });
    expect(document.querySelector('.dispatch-kpi-stale')).toBeInTheDocument();

    api.get.mockResolvedValue({ data: SUMMARY });
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
});
