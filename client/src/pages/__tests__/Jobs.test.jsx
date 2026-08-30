import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual };   // real useSearchParams — MemoryRouter owns URL state
});

vi.mock('../../api', () => ({
  default: {
    get:   vi.fn(),
    post:  vi.fn(),
    patch: vi.fn(),
  },
}));

// react-big-calendar is heavy; stub it to a simple div so tests are fast
vi.mock('react-big-calendar', () => ({
  Calendar:         ({ onSelectSlot }) => (
    <div
      data-testid="rbc-calendar"
      onClick={() => onSelectSlot?.({ start: new Date('2026-09-01T09:00:00') })}
    />
  ),
  dateFnsLocalizer: () => ({}),
}));

vi.mock('../../components/JobForm',   () => ({
  default: ({ onCancel, defaultMultiDay }) => (
    <div data-testid="job-form" data-multiday={String(!!defaultMultiDay)}>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}));
vi.mock('../../components/JobDetail', () => ({ default: () => <div data-testid="job-detail" /> }));
vi.mock('../../components/CalendarErrorBoundary', () => ({ default: ({ children }) => <>{children}</> }));
vi.mock('../../utils/calendarTimezone', () => ({
  resolveCalendarTimeZone: () => ({ timezone: 'America/New_York' }),
}));
vi.mock('../../components/InvoiceBuilder', () => ({
  InlineAgreementForm: ({ onCancel, onSaved }) => (
    <div data-testid="inline-agreement-form">
      <button data-testid="agr-cancel" onClick={onCancel}>Cancel</button>
      <button data-testid="agr-save"   onClick={() => onSaved({ id: 'agr-1' })}>Save</button>
    </div>
  ),
}));

import api from '../../api';
import Jobs from '../Jobs';

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupApi() {
  api.get.mockImplementation((url) => {
    if (url.includes('/jobs/sessions'))      return Promise.resolve({ data: [] });
    if (url.includes('/jobs'))               return Promise.resolve({ data: [] });
    if (url.includes('/business-settings'))  return Promise.resolve({ data: { hours: [], profile: {} } });
    if (url.includes('/users'))              return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
}

function renderJobs(params = {}) {
  setupApi();
  const search = new URLSearchParams(params).toString();
  const entry  = search ? `/jobs?${search}` : '/jobs';
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Jobs />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Canonical URL contract: ?create=X opens the right builder ─────────────────

describe('Jobs — ?create param opens correct builder', () => {
  it('opens Single-Day Job modal for ?create=single-day', async () => {
    renderJobs({ create: 'single-day' });
    await waitFor(() => {
      expect(screen.getByTestId('job-form')).toBeInTheDocument();
    });
  });

  it('opens Multi-Day Job modal for ?create=multi-day', async () => {
    renderJobs({ create: 'multi-day' });
    await waitFor(() => {
      const form = screen.getByTestId('job-form');
      expect(form).toBeInTheDocument();
      expect(form.dataset.multiday).toBe('true');
    });
  });

  it('opens Recurring Service modal for ?create=recurring', async () => {
    renderJobs({ create: 'recurring' });
    await waitFor(() => {
      expect(screen.getByTestId('inline-agreement-form')).toBeInTheDocument();
    });
  });

  it('does NOT open any modal when ?create param is absent', async () => {
    renderJobs({});
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByTestId('job-form')).toBeNull();
    expect(screen.queryByTestId('inline-agreement-form')).toBeNull();
  });

  it('ignores unknown ?create values (no modal)', async () => {
    renderJobs({ create: 'bogus-type' });
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByTestId('job-form')).toBeNull();
    expect(screen.queryByTestId('inline-agreement-form')).toBeNull();
  });
});

// ── Direct URL / hard-refresh survivability ───────────────────────────────────

describe('Jobs — direct URL and refresh survivability', () => {
  it('?create=single-day on direct load opens builder without prior navigation', async () => {
    // Simulates pasting /jobs?create=single-day into a new tab or hard refresh
    renderJobs({ create: 'single-day' });
    await waitFor(() => {
      expect(screen.getByTestId('job-form')).toBeInTheDocument();
    });
  });

  it('?create=recurring on direct load opens recurring builder without prior navigation', async () => {
    renderJobs({ create: 'recurring' });
    await waitFor(() => {
      expect(screen.getByTestId('inline-agreement-form')).toBeInTheDocument();
    });
  });

  it('?create=multi-day on direct load opens multi-day builder with defaultMultiDay=true', async () => {
    renderJobs({ create: 'multi-day' });
    await waitFor(() => {
      const form = screen.getByTestId('job-form');
      expect(form.dataset.multiday).toBe('true');
    });
  });
});

// ── Close behaviour — URL param removed ──────────────────────────────────────

describe('Jobs — modal close removes ?create param', () => {
  it('closes single-day modal when Cancel is clicked', async () => {
    renderJobs({ create: 'single-day' });
    await waitFor(() => screen.getByTestId('job-form'));
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(screen.queryByTestId('job-form')).toBeNull();
    });
  });

  it('closes multi-day modal when Cancel is clicked', async () => {
    renderJobs({ create: 'multi-day' });
    await waitFor(() => screen.getByTestId('job-form'));
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(screen.queryByTestId('job-form')).toBeNull();
    });
  });

  it('closes recurring modal when its Cancel is clicked', async () => {
    renderJobs({ create: 'recurring' });
    await waitFor(() => screen.getByTestId('inline-agreement-form'));
    fireEvent.click(screen.getByTestId('agr-cancel'));
    await waitFor(() => {
      expect(screen.queryByTestId('inline-agreement-form')).toBeNull();
    });
  });

  it('closes recurring modal after save and re-fetches jobs', async () => {
    renderJobs({ create: 'recurring' });
    await waitFor(() => screen.getByTestId('inline-agreement-form'));
    const callsBefore = api.get.mock.calls.length;
    fireEvent.click(screen.getByTestId('agr-save'));
    await waitFor(() => {
      expect(screen.queryByTestId('inline-agreement-form')).toBeNull();
    });
    expect(api.get.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});

// ── Calendar slot click ───────────────────────────────────────────────────────

describe('Jobs — calendar slot click opens single-day builder', () => {
  it('opens JobForm when a calendar slot is clicked', async () => {
    renderJobs({});
    await waitFor(() => screen.getByTestId('rbc-calendar'));
    fireEvent.click(screen.getByTestId('rbc-calendar'));
    await waitFor(() => {
      expect(screen.getByTestId('job-form')).toBeInTheDocument();
    });
  });

  it('slot click opens single-day (not multi-day) builder', async () => {
    renderJobs({});
    await waitFor(() => screen.getByTestId('rbc-calendar'));
    fireEvent.click(screen.getByTestId('rbc-calendar'));
    await waitFor(() => {
      const form = screen.getByTestId('job-form');
      expect(form.dataset.multiday).toBe('false');
    });
  });
});

// ── Calendar renders ──────────────────────────────────────────────────────────

describe('Jobs — calendar renders', () => {
  it('renders the calendar component', async () => {
    renderJobs({});
    await waitFor(() => {
      expect(screen.getByTestId('rbc-calendar')).toBeInTheDocument();
    });
  });

  it('renders status filter bar', async () => {
    renderJobs({});
    await waitFor(() => {
      expect(screen.getAllByText('Scheduled').length).toBeGreaterThanOrEqual(1);
    });
  });
});
