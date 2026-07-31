import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DispatchKPIStrip from '../DispatchKPIStrip';

// Mock the api module
vi.mock('../../api', () => ({
  default: {
    get: vi.fn(),
  },
}));

import api from '../../api';

const SUMMARY = {
  liveTechnicians: 3,
  activeJobs:      5,
  todaysJobs:      12,
  completedToday:  4,
  avgResponseMin:  18,
  unassignedJobs:  2,
};

beforeEach(() => {
  vi.useFakeTimers();
  api.get.mockResolvedValue({ data: SUMMARY });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('DispatchKPIStrip — loading state', () => {
  it('shows skeleton cards while loading', () => {
    api.get.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = render(<DispatchKPIStrip onCardClick={vi.fn()} />);
    const skels = container.querySelectorAll('.dispatch-kpi-skel');
    expect(skels.length).toBe(5);
  });

  it('has aria-label during loading', () => {
    api.get.mockReturnValue(new Promise(() => {}));
    render(<DispatchKPIStrip onCardClick={vi.fn()} />);
    expect(screen.getByLabelText(/loading/i)).toBeInTheDocument();
  });
});

describe('DispatchKPIStrip — loaded state', () => {
  async function renderLoaded() {
    let component;
    await act(async () => {
      component = render(<DispatchKPIStrip onCardClick={vi.fn()} />);
    });
    return component;
  }

  it('renders 5 KPI cards after load', async () => {
    await renderLoaded();
    const cards = screen.getAllByRole('listitem');
    expect(cards.length).toBe(5);
  });

  it('shows live technicians count', async () => {
    await renderLoaded();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText(/live techs/i)).toBeInTheDocument();
  });

  it('shows active jobs count', async () => {
    await renderLoaded();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText(/active jobs/i)).toBeInTheDocument();
  });

  it("shows today's jobs count", async () => {
    await renderLoaded();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText("Today's Jobs")).toBeInTheDocument();
  });

  it('shows completed count', async () => {
    await renderLoaded();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText(/completed/i)).toBeInTheDocument();
  });

  it('shows avg response time with m suffix', async () => {
    await renderLoaded();
    expect(screen.getByText('18m')).toBeInTheDocument();
    expect(screen.getByText(/avg response/i)).toBeInTheDocument();
  });

  it('shows unassigned count in subtitle when non-zero', async () => {
    await renderLoaded();
    expect(screen.getByText(/2 unassigned/i)).toBeInTheDocument();
  });

  it('shows — for avg response when null', async () => {
    api.get.mockResolvedValue({ data: { ...SUMMARY, avgResponseMin: null } });
    await renderLoaded();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('DispatchKPIStrip — interaction', () => {
  it('calls onCardClick with key when a card is clicked', async () => {
    const onCardClick = vi.fn();
    await act(async () => {
      render(<DispatchKPIStrip onCardClick={onCardClick} />);
    });
    const cards = screen.getAllByRole('listitem');
    await act(async () => { cards[0].click(); });
    expect(onCardClick).toHaveBeenCalledWith('live');
  });

  it('polls every 30 s', async () => {
    await act(async () => {
      render(<DispatchKPIStrip onCardClick={vi.fn()} />);
    });
    const callsAfterMount = api.get.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(30000); });
    expect(api.get.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });
});

describe('DispatchKPIStrip — error handling', () => {
  it('hides loading state even on API failure', async () => {
    api.get.mockRejectedValue(new Error('Network error'));
    await act(async () => {
      render(<DispatchKPIStrip onCardClick={vi.fn()} />);
    });
    expect(screen.queryByLabelText(/loading/i)).not.toBeInTheDocument();
  });
});
