import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../api', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  const mockNav = vi.fn();
  return { ...actual, useNavigate: vi.fn(() => mockNav) };
});

import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import AuthorityQueue from '../AuthorityQueue';

const MY_USER_ID    = 'current-user-uuid';
const OTHER_USER_ID = 'other-user-uuid';

function setupUser(id = MY_USER_ID) {
  useAuth.mockReturnValue({
    user: { id, role: 'owner', account_type: 'institution', authority_enabled: true },
  });
}

// ── Problem 2: assignment identity and claim button gating ────────────────────

describe('AuthorityQueue — assignment identity and claim gating (Problem 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupUser();
  });

  it('unassigned case shows Claim button', async () => {
    api.get.mockResolvedValue({
      data: [{
        id: 'case-unassigned', status: 'PENDING_HUMAN_REVIEW',
        external_case_reference: 'Q-001',
        assigned_to: null, reviewer_name: null,
        document_count: 0, instrument_count: 1,
        status_changed_at: '2026-01-01T00:00:00Z',
      }],
    });

    render(<MemoryRouter><AuthorityQueue /></MemoryRouter>);

    await waitFor(() => expect(screen.getByTestId('claim-btn-case-unassigned')).toBeTruthy());
    expect(screen.queryByTestId('continue-btn-case-unassigned')).toBeNull();
  });

  it('case assigned to current user shows Continue button, not Claim', async () => {
    api.get.mockResolvedValue({
      data: [{
        id: 'case-mine', status: 'HUMAN_REVIEW_IN_PROGRESS',
        external_case_reference: 'Q-002',
        assigned_to: MY_USER_ID, reviewer_name: 'Me',
        document_count: 0, instrument_count: 1,
        status_changed_at: '2026-01-01T00:00:00Z',
      }],
    });

    render(<MemoryRouter><AuthorityQueue /></MemoryRouter>);

    await waitFor(() => expect(screen.getByTestId('continue-btn-case-mine')).toBeTruthy());
    expect(screen.queryByTestId('claim-btn-case-mine')).toBeNull();
  });

  it('case assigned to another user shows "Assigned" text, not Claim or Continue', async () => {
    api.get.mockResolvedValue({
      data: [{
        id: 'case-other', status: 'HUMAN_REVIEW_IN_PROGRESS',
        external_case_reference: 'Q-003',
        assigned_to: OTHER_USER_ID, reviewer_name: 'Jane Smith',
        document_count: 0, instrument_count: 1,
        status_changed_at: '2026-01-01T00:00:00Z',
      }],
    });

    render(<MemoryRouter><AuthorityQueue /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('Assigned')).toBeTruthy());
    expect(screen.queryByTestId('claim-btn-case-other')).toBeNull();
    expect(screen.queryByTestId('continue-btn-case-other')).toBeNull();
  });

  it('shows reviewer name when case is assigned to another user', async () => {
    api.get.mockResolvedValue({
      data: [{
        id: 'case-named', status: 'HUMAN_REVIEW_IN_PROGRESS',
        external_case_reference: 'Q-004',
        assigned_to: OTHER_USER_ID, reviewer_name: 'Jane Smith',
        document_count: 0, instrument_count: 1,
        status_changed_at: '2026-01-01T00:00:00Z',
      }],
    });

    render(<MemoryRouter><AuthorityQueue /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('Jane Smith')).toBeTruthy());
  });

  it('no Claim button exists in DOM when case is assigned to current user', async () => {
    api.get.mockResolvedValue({
      data: [{
        id: 'case-mine-2', status: 'HUMAN_REVIEW_IN_PROGRESS',
        external_case_reference: 'Q-005',
        assigned_to: MY_USER_ID, reviewer_name: 'Me',
        document_count: 0, instrument_count: 1,
        status_changed_at: '2026-01-01T00:00:00Z',
      }],
    });

    render(<MemoryRouter><AuthorityQueue /></MemoryRouter>);

    await waitFor(() => screen.getByTestId('continue-btn-case-mine-2'));
    const claimBtns = document.querySelectorAll('[data-testid^="claim-btn-"]');
    expect(claimBtns.length).toBe(0);
  });

  it('unassigned cases show "Unassigned" in Assigned To column', async () => {
    api.get.mockResolvedValue({
      data: [{
        id: 'case-dash', status: 'PENDING_HUMAN_REVIEW',
        external_case_reference: 'Q-006',
        assigned_to: null, reviewer_name: null,
        document_count: 0, instrument_count: 1,
        status_changed_at: '2026-01-01T00:00:00Z',
      }],
    });

    render(<MemoryRouter><AuthorityQueue /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('Unassigned')).toBeTruthy());
  });

  it('current user row shows "You" in Assigned To column', async () => {
    api.get.mockResolvedValue({
      data: [{
        id: 'case-you', status: 'HUMAN_REVIEW_IN_PROGRESS',
        external_case_reference: 'Q-007',
        assigned_to: MY_USER_ID, reviewer_name: 'Me',
        document_count: 0, instrument_count: 1,
        status_changed_at: '2026-01-01T00:00:00Z',
      }],
    });

    render(<MemoryRouter><AuthorityQueue /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('You')).toBeTruthy());
  });

  it('empty queue shows empty state, no claim buttons', async () => {
    api.get.mockResolvedValue({ data: [] });

    render(<MemoryRouter><AuthorityQueue /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('No cases in the review queue.')).toBeTruthy());
    expect(document.querySelectorAll('[data-testid^="claim-btn-"]').length).toBe(0);
  });
});

// ── Concern 1: 4-state model — loading/empty/error/data are mutually exclusive ─

describe('AuthorityQueue — Concern 1: 4-state model', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupUser();
  });

  it('loading state only — empty state is absent while loading', async () => {
    // Promise that never resolves, keeping the component in loading state
    api.get.mockReturnValue(new Promise(() => {}));
    render(<MemoryRouter><AuthorityQueue /></MemoryRouter>);
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.queryByText('No cases in the review queue.')).toBeNull();
  });

  it('empty state only — loading is absent after successful empty response', async () => {
    api.get.mockResolvedValue({ data: [] });
    render(<MemoryRouter><AuthorityQueue /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('No cases in the review queue.')).toBeTruthy());
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('error replaces empty — error and empty state never appear together', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'Failed to load queue.' } } });
    render(<MemoryRouter><AuthorityQueue /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Failed to load queue.')).toBeTruthy());
    expect(screen.queryByText('No cases in the review queue.')).toBeNull();
  });

  it('error state renders a Retry button', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'Network error' } } });
    render(<MemoryRouter><AuthorityQueue /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Network error')).toBeTruthy());
    expect(screen.getByRole('button', { name: /Retry/i })).toBeTruthy();
  });
});

// ── C23: page subtitle ────────────────────────────────────────────────────────

describe('AuthorityQueue — C23: page subtitle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupUser();
  });

  it('shows "Human review work inbox" subtitle', async () => {
    api.get.mockResolvedValue({ data: [] });
    render(<MemoryRouter><AuthorityQueue /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/Human review work inbox/i)).toBeTruthy());
  });
});

// ── Batch 1 — Problem 3: "Action" column heading ──────────────────────────────

const ONE_CASE = [{
  id: 'case-p3', status: 'PENDING_HUMAN_REVIEW',
  external_case_reference: 'P3-001',
  assigned_to: null, reviewer_name: null,
  document_count: 0, instrument_count: 1,
  status_changed_at: '2026-01-01T00:00:00Z',
}];

describe('AuthorityQueue — Batch1-P3: Action column heading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupUser();
  });

  it('table has an "Action" column heading', async () => {
    api.get.mockResolvedValue({ data: ONE_CASE });
    render(<MemoryRouter><AuthorityQueue /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('columnheader', { name: /^Action$/i })).toBeTruthy());
  });

  it('no empty column headings exist in queue table', async () => {
    api.get.mockResolvedValue({ data: ONE_CASE });
    render(<MemoryRouter><AuthorityQueue /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('columnheader', { name: /^Action$/i })).toBeTruthy());
    const headers = document.querySelectorAll('th');
    const emptyHeaders = Array.from(headers).filter(th => th.textContent.trim() === '');
    expect(emptyHeaders.length).toBe(0);
  });
});
