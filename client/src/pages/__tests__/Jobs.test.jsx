import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useSearchParams: vi.fn(),
  };
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
  Calendar:            ({ onSelectSlot }) => (
    <div
      data-testid="rbc-calendar"
      onClick={() => onSelectSlot?.({ start: new Date('2026-09-01T09:00:00') })}
    />
  ),
  dateFnsLocalizer:    () => ({}),
}));

vi.mock('../../components/JobForm',   () => ({ default: ({ onCancel }) => <div data-testid="job-form"><button onClick={onCancel}>Cancel</button></div> }));
vi.mock('../../components/JobDetail', () => ({ default: () => <div data-testid="job-detail" /> }));
vi.mock('../../components/CalendarErrorBoundary', () => ({ default: ({ children }) => <>{children}</> }));
vi.mock('../../utils/calendarTimezone', () => ({
  resolveCalendarTimeZone: () => ({ timezone: 'America/New_York' }),
}));
vi.mock('../../components/InvoiceBuilder', () => ({
  InlineAgreementForm: ({ onCancel, onSaved }) => (
    <div data-testid="inline-agreement-form">
      <button data-testid="agr-cancel"  onClick={onCancel}>Cancel</button>
      <button data-testid="agr-save"    onClick={() => onSaved({ id: 'agr-1' })}>Save</button>
    </div>
  ),
}));

import { useSearchParams } from 'react-router-dom';
import api from '../../api';
import Jobs from '../Jobs';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockSearchParams(params = {}) {
  const sp = new URLSearchParams(params);
  const set = vi.fn((fn) => {
    // No-op: tests verify UI behaviour, not URL mutation
  });
  useSearchParams.mockReturnValue([sp, set]);
}

function setupApi() {
  api.get.mockImplementation((url) => {
    if (url.includes('/jobs/sessions')) return Promise.resolve({ data: [] });
    if (url.includes('/jobs'))          return Promise.resolve({ data: [] });
    if (url.includes('/business-settings')) return Promise.resolve({ data: { hours: [], profile: {} } });
    if (url.includes('/users'))         return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
}

function renderJobs(params = {}) {
  mockSearchParams(params);
  setupApi();
  return render(<MemoryRouter initialEntries={[`/jobs?${new URLSearchParams(params)}`]}><Jobs /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Create menu URL param handling ────────────────────────────────────────────

describe('Jobs — ?new=1 param opens create modal', () => {
  it('opens Single-Day Job modal when ?new=1 is present on mount', async () => {
    renderJobs({ new: '1' });
    await waitFor(() => {
      expect(screen.getByTestId('job-form')).toBeInTheDocument();
    });
  });

  it('opens Multi-Day Job modal when ?new=1&multiday=1', async () => {
    renderJobs({ new: '1', multiday: '1' });
    await waitFor(() => {
      expect(screen.getByTestId('job-form')).toBeInTheDocument();
    });
  });

  it('opens Recurring Service modal when ?new=1&type=recurring', async () => {
    renderJobs({ new: '1', type: 'recurring' });
    await waitFor(() => {
      expect(screen.getByTestId('inline-agreement-form')).toBeInTheDocument();
    });
  });

  it('does NOT open any modal when ?new param is absent', async () => {
    renderJobs({});
    // Wait for data load to settle
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByTestId('job-form')).toBeNull();
    expect(screen.queryByTestId('inline-agreement-form')).toBeNull();
  });
});

// ── Modal interactions ────────────────────────────────────────────────────────

describe('Jobs — modal close behaviour', () => {
  it('closes the create modal when Cancel is clicked', async () => {
    renderJobs({ new: '1' });
    await waitFor(() => screen.getByTestId('job-form'));
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(screen.queryByTestId('job-form')).toBeNull();
    });
  });

  it('closes the recurring modal when its Cancel is clicked', async () => {
    renderJobs({ new: '1', type: 'recurring' });
    await waitFor(() => screen.getByTestId('inline-agreement-form'));
    fireEvent.click(screen.getByTestId('agr-cancel'));
    await waitFor(() => {
      expect(screen.queryByTestId('inline-agreement-form')).toBeNull();
    });
  });

  it('closes the recurring modal after save and refreshes jobs', async () => {
    renderJobs({ new: '1', type: 'recurring' });
    await waitFor(() => screen.getByTestId('inline-agreement-form'));
    const callsBefore = api.get.mock.calls.length;
    fireEvent.click(screen.getByTestId('agr-save'));
    await waitFor(() => {
      expect(screen.queryByTestId('inline-agreement-form')).toBeNull();
    });
    // loadJobs() should have been called again after save
    expect(api.get.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});

// ── Calendar slot click ───────────────────────────────────────────────────────

describe('Jobs — calendar slot click opens create modal', () => {
  it('opens create modal when a calendar slot is clicked', async () => {
    renderJobs({});
    await waitFor(() => screen.getByTestId('rbc-calendar'));
    fireEvent.click(screen.getByTestId('rbc-calendar'));
    await waitFor(() => {
      expect(screen.getByTestId('job-form')).toBeInTheDocument();
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
      // Filter bar has a chip and a legend item both labelled "Scheduled" — use getAllBy
      expect(screen.getAllByText('Scheduled').length).toBeGreaterThanOrEqual(1);
    });
  });
});
