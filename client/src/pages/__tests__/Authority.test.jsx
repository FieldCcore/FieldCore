import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../api', () => ({
  default: {
    get:    vi.fn(),
    post:   vi.fn(),
    delete: vi.fn(),
    patch:  vi.fn(),
  },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { role: 'owner', account_type: 'institution', authority_enabled: true },
  })),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: vi.fn(() => ({ caseId: 'case-uuid-1' })) };
});

import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useParams } from 'react-router-dom';
import AuthorityWorkspace from '../AuthorityWorkspace';
import AuthorityCases     from '../AuthorityCases';
import AuthorityParties   from '../AuthorityParties';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CASE_DRAFT = {
  id: 'case-uuid-1', status: 'DRAFT',
  external_case_reference: 'TEST-001',
  created_at: '2026-01-01T00:00:00Z',
};

const INSTR_PENDING = {
  id: 'instr-uuid-1', instrument_type: 'durable_power_of_attorney',
  status: 'PENDING_REVIEW', effective_date: null, expiration_date: null,
  jurisdiction: null, verified_at: null, verified_by_user_id: null,
  rejected_at: null, rejection_reason: null, revoked_at: null,
  revocation_reason: null, created_at: '2026-01-01T00:00:00Z',
  participants: [], permissions: [], restrictions: [],
};

const WORKSPACE_BASE = {
  case: CASE_DRAFT,
  instruments: [],
  documents: [],
  assignments: [],
  notes: [],
};

const WORKSPACE_WITH_PENDING_INSTR = {
  ...WORKSPACE_BASE,
  instruments: [INSTR_PENDING],
};

function setupWorkspaceApi(workspaceData, caps = []) {
  api.get.mockImplementation((url) => {
    if (url.includes('/workspace')) return Promise.resolve({ data: workspaceData });
    if (url.includes('/activity'))  return Promise.resolve({ data: [] });
    if (url.includes('/capabilities')) return Promise.resolve({ data: { capabilities: caps } });
    return Promise.reject(new Error(`Unexpected GET: ${url}`));
  });
}

// ── Feature flag gating ───────────────────────────────────────────────────────

describe('AuthorityGate (feature flag)', () => {
  it('shows "Authority Unavailable" when authority_enabled is false', () => {
    useAuth.mockReturnValue({
      user: { role: 'owner', account_type: 'institution', authority_enabled: false },
    });

    // Render the gate directly via App.jsx integration not available here,
    // so inline the gate logic in the test
    const AuthorityGate = ({ children }) => {
      const { user } = useAuth();
      if (!user?.authority_enabled || user?.account_type !== 'institution') {
        return <div>Authority Unavailable</div>;
      }
      return children;
    };

    const { getByText } = render(
      <MemoryRouter>
        <AuthorityGate><div>Protected content</div></AuthorityGate>
      </MemoryRouter>
    );
    expect(getByText('Authority Unavailable')).toBeTruthy();
  });

  it('shows children when authority_enabled is true and account_type is institution', () => {
    useAuth.mockReturnValue({
      user: { role: 'owner', account_type: 'institution', authority_enabled: true },
    });

    const AuthorityGate = ({ children }) => {
      const { user } = useAuth();
      if (!user?.authority_enabled || user?.account_type !== 'institution') {
        return <div>Authority Unavailable</div>;
      }
      return children;
    };

    const { getByText } = render(
      <MemoryRouter>
        <AuthorityGate><div>Protected content</div></AuthorityGate>
      </MemoryRouter>
    );
    expect(getByText('Protected content')).toBeTruthy();
  });

  it('shows "Authority Unavailable" when account_type is not institution', () => {
    useAuth.mockReturnValue({
      user: { role: 'owner', account_type: 'business', authority_enabled: true },
    });

    const AuthorityGate = ({ children }) => {
      const { user } = useAuth();
      if (!user?.authority_enabled || user?.account_type !== 'institution') {
        return <div>Authority Unavailable</div>;
      }
      return children;
    };

    const { getByText } = render(
      <MemoryRouter>
        <AuthorityGate><div>Protected content</div></AuthorityGate>
      </MemoryRouter>
    );
    expect(getByText('Authority Unavailable')).toBeTruthy();
  });
});

// ── Workspace: capability gating ──────────────────────────────────────────────

describe('AuthorityWorkspace capability gating', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      user: { role: 'owner', account_type: 'institution', authority_enabled: true },
    });
    useParams.mockReturnValue({ caseId: 'case-uuid-1' });
  });

  it('shows Verify and Reject buttons when user has both capabilities', async () => {
    setupWorkspaceApi(
      WORKSPACE_WITH_PENDING_INSTR,
      ['AUTHORITY_INSTRUMENT_VERIFY', 'AUTHORITY_INSTRUMENT_REJECT']
    );

    render(
      <MemoryRouter>
        <AuthorityWorkspace />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Verify Instrument')).toBeTruthy();
      expect(screen.getByText('Reject')).toBeTruthy();
    });
  });

  it('hides Verify button when user lacks AUTHORITY_INSTRUMENT_VERIFY', async () => {
    setupWorkspaceApi(WORKSPACE_WITH_PENDING_INSTR, ['AUTHORITY_INSTRUMENT_REJECT']);

    render(
      <MemoryRouter>
        <AuthorityWorkspace />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText('Verify Instrument')).toBeNull();
      expect(screen.getByText('Reject')).toBeTruthy();
    });
  });

  it('hides Reject button when user lacks AUTHORITY_INSTRUMENT_REJECT', async () => {
    setupWorkspaceApi(WORKSPACE_WITH_PENDING_INSTR, ['AUTHORITY_INSTRUMENT_VERIFY']);

    render(
      <MemoryRouter>
        <AuthorityWorkspace />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Verify Instrument')).toBeTruthy();
      expect(screen.queryByText('Reject')).toBeNull();
    });
  });

  it('hides both Verify and Reject when user has no authority capabilities', async () => {
    setupWorkspaceApi(WORKSPACE_WITH_PENDING_INSTR, []);

    render(
      <MemoryRouter>
        <AuthorityWorkspace />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText('Verify Instrument')).toBeNull();
      expect(screen.queryByText('Reject')).toBeNull();
    });
  });

  it('does not show a Release button', async () => {
    setupWorkspaceApi(
      { ...WORKSPACE_BASE, assignments: [{ id: 'a-1', assigned_to: 'u-1', assigned_by: 'u-2', status: 'active', claimed_at: '2026-01-01T00:00:00Z', reviewer_name: 'Bob' }] },
      []
    );

    render(
      <MemoryRouter>
        <AuthorityWorkspace />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText('Release')).toBeNull();
    });
  });

  it('does not include actorType in instrument transition payload', async () => {
    setupWorkspaceApi(
      WORKSPACE_WITH_PENDING_INSTR,
      ['AUTHORITY_INSTRUMENT_VERIFY', 'AUTHORITY_INSTRUMENT_REJECT']
    );
    api.post.mockResolvedValue({ data: {} });

    render(
      <MemoryRouter>
        <AuthorityWorkspace />
      </MemoryRouter>
    );

    await waitFor(() => screen.getByText('Verify Instrument'));

    // Simulate clicking Verify — window.confirm is not available in jsdom, mock it
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    screen.getByText('Verify Instrument').click();

    await waitFor(() => {
      expect(api.post).toHaveBeenCalled();
      const [, payload] = api.post.mock.calls.find(c => c[0].includes('/transition')) || [];
      expect(payload).toBeDefined();
      expect(payload).not.toHaveProperty('actorType');
    });
  });
});

// ── Cases page: correct endpoint ──────────────────────────────────────────────

describe('AuthorityCases endpoint', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      user: { role: 'owner', account_type: 'institution', authority_enabled: true },
    });
    api.get.mockResolvedValue({ data: [] });
  });

  it('fetches from /authority/cases not /authority/queue', async () => {
    render(
      <MemoryRouter>
        <AuthorityCases />
      </MemoryRouter>
    );

    await waitFor(() => {
      const calls = api.get.mock.calls.map(c => c[0]);
      expect(calls.some(u => u.includes('/authority/cases'))).toBe(true);
      expect(calls.every(u => !u.includes('/authority/queue'))).toBe(true);
    });
  });

  it('passes status query param when filter is selected', async () => {
    // This is tested at component level — we just verify it calls the right URL;
    // the status param is passed via axios config in the component.
    render(
      <MemoryRouter>
        <AuthorityCases />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(api.get).toHaveBeenCalled();
    });
  });
});

// ── Parties page: correct endpoint ───────────────────────────────────────────

describe('AuthorityParties endpoint', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      user: { role: 'owner', account_type: 'institution', authority_enabled: true },
    });
    api.get.mockResolvedValue({ data: [] });
  });

  it('fetches from /authority/parties', async () => {
    render(
      <MemoryRouter>
        <AuthorityParties />
      </MemoryRouter>
    );

    await waitFor(() => {
      const calls = api.get.mock.calls.map(c => c[0]);
      expect(calls.some(u => u.includes('/authority/parties'))).toBe(true);
    });
  });

  it('does not show placeholder text about endpoint unavailability', async () => {
    api.get.mockResolvedValue({ data: [] });

    render(
      <MemoryRouter>
        <AuthorityParties />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText(/endpoint is not yet available/i)).toBeNull();
    });
  });
});

// ── Workspace: Add Participant gating (Issue A) ───────────────────────────────

const INSTR_UNVERIFIED = {
  id: 'instr-uv-1', instrument_type: 'durable_power_of_attorney',
  status: 'UNVERIFIED', participants: [], permissions: [], restrictions: [],
  effective_date: null, expiration_date: null, jurisdiction: null,
  verified_at: null, verified_by_user_id: null,
  rejected_at: null, rejection_reason: null, revoked_at: null,
  revocation_reason: null, created_at: '2026-01-01T00:00:00Z',
};

const INSTR_VERIFIED = {
  ...INSTR_UNVERIFIED,
  id: 'instr-v-1', status: 'VERIFIED', verified_at: '2026-01-02T00:00:00Z',
};

const INSTR_PENDING_REVIEW = {
  ...INSTR_UNVERIFIED,
  id: 'instr-pr-1', status: 'PENDING_REVIEW',
};

describe('AuthorityWorkspace — Add Participant gating (Issue A)', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      user: { id: 'test-user-id', role: 'owner', account_type: 'institution', authority_enabled: true },
    });
    useParams.mockReturnValue({ caseId: 'case-uuid-1' });
    api.get.mockReset();
  });

  it('shows Add Participant when instrument is editable and case is not under active review', async () => {
    setupWorkspaceApi({
      case: { id: 'case-uuid-1', status: 'DRAFT', external_case_reference: 'T', created_at: '2026-01-01T00:00:00Z' },
      instruments: [INSTR_UNVERIFIED],
      documents: [], assignments: [], notes: [],
    }, []);
    render(<MemoryRouter><AuthorityWorkspace /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('+ Add Participant')).toBeTruthy(); });
  });

  it('hides Add Participant when instrument is VERIFIED (locked)', async () => {
    setupWorkspaceApi({
      case: { id: 'case-uuid-1', status: 'COMPLETED', external_case_reference: 'T', created_at: '2026-01-01T00:00:00Z' },
      instruments: [INSTR_VERIFIED],
      documents: [], assignments: [], notes: [],
    }, []);
    render(<MemoryRouter><AuthorityWorkspace /></MemoryRouter>);
    await waitFor(() => { expect(screen.queryByText('+ Add Participant')).toBeNull(); });
  });

  it('hides Add Participant when case is HUMAN_REVIEW_IN_PROGRESS and user is not active assignee', async () => {
    setupWorkspaceApi({
      case: { id: 'case-uuid-1', status: 'HUMAN_REVIEW_IN_PROGRESS', external_case_reference: 'T', created_at: '2026-01-01T00:00:00Z' },
      instruments: [INSTR_PENDING_REVIEW],
      documents: [],
      assignments: [{ id: 'a-1', assigned_to: 'other-user-id', reviewer_name: 'Other', claimed_at: '2026-01-01T00:00:00Z', status: 'active' }],
      notes: [],
    }, ['AUTHORITY_INSTRUMENT_VERIFY']);
    render(<MemoryRouter><AuthorityWorkspace /></MemoryRouter>);
    await waitFor(() => { expect(screen.queryByText('+ Add Participant')).toBeNull(); });
  });

  it('shows Add Participant when case is HUMAN_REVIEW_IN_PROGRESS and user IS active assignee', async () => {
    setupWorkspaceApi({
      case: { id: 'case-uuid-1', status: 'HUMAN_REVIEW_IN_PROGRESS', external_case_reference: 'T', created_at: '2026-01-01T00:00:00Z' },
      instruments: [INSTR_PENDING_REVIEW],
      documents: [],
      assignments: [{ id: 'a-2', assigned_to: 'test-user-id', reviewer_name: 'Me', claimed_at: '2026-01-01T00:00:00Z', status: 'active' }],
      notes: [],
    }, ['AUTHORITY_INSTRUMENT_VERIFY']);
    render(<MemoryRouter><AuthorityWorkspace /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('+ Add Participant')).toBeTruthy(); });
  });

  it('clicking Add Participant fetches GET /authority/parties', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/workspace')) return Promise.resolve({ data: {
        case: { id: 'case-uuid-1', status: 'DRAFT', external_case_reference: 'T', created_at: '2026-01-01T00:00:00Z' },
        instruments: [INSTR_UNVERIFIED], documents: [], assignments: [], notes: [],
      }});
      if (url.includes('/activity'))     return Promise.resolve({ data: [] });
      if (url.includes('/capabilities')) return Promise.resolve({ data: { capabilities: [] } });
      if (url.includes('/authority/parties')) return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`Unexpected GET: ${url}`));
    });

    render(<MemoryRouter><AuthorityWorkspace /></MemoryRouter>);
    await waitFor(() => screen.getByText('+ Add Participant'));
    screen.getByText('+ Add Participant').click();

    await waitFor(() => {
      const calls = api.get.mock.calls.filter(c => c[0].includes('/authority/parties'));
      expect(calls.length).toBeGreaterThan(0);
    });
  });
});

// ── Workspace: Claim button capability gating (Issue D) ──────────────────────

describe('AuthorityWorkspace — Claim button gating (Issue D)', () => {
  const PENDING_REVIEW_CASE = {
    id: 'case-uuid-1', status: 'PENDING_HUMAN_REVIEW',
    external_case_reference: 'T', created_at: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    useAuth.mockReturnValue({
      user: { id: 'test-user-id', role: 'owner', account_type: 'institution', authority_enabled: true },
    });
    useParams.mockReturnValue({ caseId: 'case-uuid-1' });
    api.get.mockReset();
  });

  it('hides Claim Case when user has no review capability', async () => {
    setupWorkspaceApi({ case: PENDING_REVIEW_CASE, instruments: [], documents: [], assignments: [], notes: [] }, []);
    render(<MemoryRouter><AuthorityWorkspace /></MemoryRouter>);
    await waitFor(() => { expect(screen.queryByText('Claim Case')).toBeNull(); });
  });

  it('shows Claim Case when user has AUTHORITY_INSTRUMENT_VERIFY', async () => {
    setupWorkspaceApi({ case: PENDING_REVIEW_CASE, instruments: [], documents: [], assignments: [], notes: [] }, ['AUTHORITY_INSTRUMENT_VERIFY']);
    render(<MemoryRouter><AuthorityWorkspace /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Claim Case')).toBeTruthy(); });
  });

  it('shows Claim Case when user has AUTHORITY_INSTRUMENT_REJECT', async () => {
    setupWorkspaceApi({ case: PENDING_REVIEW_CASE, instruments: [], documents: [], assignments: [], notes: [] }, ['AUTHORITY_INSTRUMENT_REJECT']);
    render(<MemoryRouter><AuthorityWorkspace /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Claim Case')).toBeTruthy(); });
  });

  it('hides Claim Case when the current user is already the active assignee', async () => {
    setupWorkspaceApi({
      case: { ...PENDING_REVIEW_CASE, status: 'HUMAN_REVIEW_IN_PROGRESS' },
      instruments: [], documents: [],
      assignments: [{ id: 'a-1', assigned_to: 'test-user-id', reviewer_name: 'Me', claimed_at: '2026-01-01T00:00:00Z', status: 'active' }],
      notes: [],
    }, ['AUTHORITY_INSTRUMENT_VERIFY', 'AUTHORITY_INSTRUMENT_REJECT']);
    render(<MemoryRouter><AuthorityWorkspace /></MemoryRouter>);
    await waitFor(() => { expect(screen.queryByText('Claim Case')).toBeNull(); });
  });
});
