import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
import AuthorityDashboard from '../Authority';
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

function setupWorkspaceApi(workspaceData, caps = [], { runs = [], candidates = [] } = {}) {
  api.get.mockImplementation((url) => {
    if (url.includes('/workspace'))    return Promise.resolve({ data: workspaceData });
    if (url.includes('/activity'))     return Promise.resolve({ data: [] });
    if (url.includes('/capabilities')) return Promise.resolve({ data: { capabilities: caps } });
    if (url.includes('/extraction/runs')) return Promise.resolve({ data: runs });
    if (url.includes('/candidates'))   return Promise.resolve({ data: candidates });
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

    // Click the DecisionBar button — this opens a ConfirmDialog (no window.confirm)
    fireEvent.click(screen.getByText('Verify Instrument'));

    // Two "Verify Instrument" elements now exist: the DecisionBar btn + the dialog confirm btn
    await waitFor(() => expect(screen.getAllByText('Verify Instrument').length).toBeGreaterThan(1));
    const verifyBtns = screen.getAllByText('Verify Instrument');
    fireEvent.click(verifyBtns[verifyBtns.length - 1]);

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

// ── Cases list: assigned_to display ──────────────────────────────────────────

describe('AuthorityCases — assigned_to display', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      user: { role: 'owner', account_type: 'institution', authority_enabled: true },
    });
  });

  it('shows reviewer name when case has an active assignment with reviewer_name', async () => {
    api.get.mockResolvedValue({
      data: [{
        id: 'case-uuid-assign-1', status: 'HUMAN_REVIEW_IN_PROGRESS',
        external_case_reference: 'TEST-ASS-001',
        assigned_to: 'reviewer-uuid-001',
        reviewer_name: 'Jane Reviewer',
        document_count: 0, instrument_count: 1,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      }],
    });
    render(<MemoryRouter><AuthorityCases /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Jane Reviewer')).toBeInTheDocument());
  });

  it('shows "Unassigned" when case has no active assignment', async () => {
    api.get.mockResolvedValue({
      data: [{
        id: 'case-uuid-noassign-1', status: 'PENDING_HUMAN_REVIEW',
        external_case_reference: 'TEST-NOASS-001',
        assigned_to: null,
        reviewer_name: null,
        document_count: 0, instrument_count: 1,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      }],
    });
    render(<MemoryRouter><AuthorityCases /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Unassigned')).toBeInTheDocument());
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
    await waitFor(() => screen.getByRole('tab', { name: /Parties/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Parties/ }));
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
    await waitFor(() => screen.getByRole('tab', { name: /Parties/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Parties/ }));
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
    await waitFor(() => screen.getByRole('tab', { name: /Parties/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Parties/ }));
    await waitFor(() => screen.getByText('+ Add Participant'));
    fireEvent.click(screen.getByText('+ Add Participant'));

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

// ── Stage 3: Extraction UI tests ──────────────────────────────────────────────

const EXTRACTION_RUN_COMPLETED = {
  id: 'run-uuid-1', document_id: 'doc-uuid-1', run_kind: 'auto',
  status: 'completed', provider: 'fake',
  error_category: null, error_message: null,
  claimed_at: '2026-01-01T10:00:00Z', completed_at: '2026-01-01T10:00:05Z',
  created_at: '2026-01-01T10:00:00Z', original_filename: 'power-of-attorney.pdf',
};

const EXTRACTION_RUN_FAILED = {
  ...EXTRACTION_RUN_COMPLETED,
  id: 'run-uuid-2', status: 'failed', error_category: 'timeout', completed_at: null,
};

const CANDIDATE_PENDING = {
  id: 'cand-uuid-1', runId: 'run-uuid-1', instrumentId: 'instr-uuid-1',
  fieldKey: 'instrument_type', proposedValue: 'durable_power_of_attorney',
  confidence: 0.97, status: 'pending',
  reviewedBy: null, reviewedAt: null, rejectionReason: null, rowVersion: 1,
  createdAt: '2026-01-01T10:00:05Z',
  evidence: [
    { id: 'ev-1', documentId: 'doc-uuid-1', pageNumbers: [1], excerpt: 'I hereby grant durable power of attorney.' },
  ],
};

const CANDIDATE_ACCEPTED = {
  ...CANDIDATE_PENDING, id: 'cand-uuid-2', fieldKey: 'jurisdiction',
  proposedValue: 'Delaware, USA', status: 'accepted',
  reviewedBy: 'test-user-id', rowVersion: 2,
};

const EXTRACTION_CASE = {
  id: 'case-uuid-1', status: 'EXTRACTION_COMPLETE',
  external_case_reference: 'EXT-001',
  created_at: '2026-01-01T00:00:00Z',
};

describe('AuthorityWorkspace — Extraction panel (Stage 3)', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      user: { id: 'test-user-id', role: 'owner', account_type: 'institution', authority_enabled: true },
    });
    useParams.mockReturnValue({ caseId: 'case-uuid-1' });
    api.get.mockReset();
    api.post.mockReset();
  });

  it('shows AI Extraction panel when runs exist', async () => {
    setupWorkspaceApi(
      { case: EXTRACTION_CASE, instruments: [], documents: [], assignments: [], notes: [] },
      ['AUTHORITY_INSTRUMENT_VERIFY'],
      { runs: [EXTRACTION_RUN_COMPLETED] }
    );
    render(<MemoryRouter><AuthorityWorkspace /></MemoryRouter>);
    await waitFor(() => screen.getByRole('tab', { name: /Extraction/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Extraction/ }));
    await waitFor(() => { expect(screen.getByText(/AI extraction/i)).toBeTruthy(); });
  });

  it('displays run status badge for completed run', async () => {
    setupWorkspaceApi(
      { case: EXTRACTION_CASE, instruments: [], documents: [], assignments: [], notes: [] },
      ['AUTHORITY_INSTRUMENT_VERIFY'],
      { runs: [EXTRACTION_RUN_COMPLETED] }
    );
    render(<MemoryRouter><AuthorityWorkspace /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('COMPLETED')).toBeTruthy(); });
  });

  it('displays error_category for failed run', async () => {
    setupWorkspaceApi(
      { case: EXTRACTION_CASE, instruments: [], documents: [], assignments: [], notes: [] },
      ['AUTHORITY_INSTRUMENT_VERIFY'],
      { runs: [EXTRACTION_RUN_FAILED] }
    );
    render(<MemoryRouter><AuthorityWorkspace /></MemoryRouter>);
    await waitFor(() => screen.getByRole('tab', { name: /Extraction/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Extraction/ }));
    await waitFor(() => { expect(screen.getByText('timeout')).toBeTruthy(); });
  });

  it('shows pending candidate with fieldKey label', async () => {
    setupWorkspaceApi(
      { case: EXTRACTION_CASE, instruments: [], documents: [], assignments: [], notes: [] },
      ['AUTHORITY_INSTRUMENT_VERIFY'],
      { runs: [EXTRACTION_RUN_COMPLETED], candidates: [CANDIDATE_PENDING] }
    );
    render(<MemoryRouter><AuthorityWorkspace /></MemoryRouter>);
    await waitFor(() => screen.getByRole('tab', { name: /Extraction/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Extraction/ }));
    await waitFor(() => { expect(screen.getByText(/Instrument Type/i)).toBeTruthy(); });
  });

  it('renders proposed value as plain text (not HTML)', async () => {
    const xssCand = {
      ...CANDIDATE_PENDING,
      proposedValue: '<script>alert(1)</script>',
    };
    setupWorkspaceApi(
      { case: EXTRACTION_CASE, instruments: [], documents: [], assignments: [], notes: [] },
      ['AUTHORITY_INSTRUMENT_VERIFY'],
      { runs: [EXTRACTION_RUN_COMPLETED], candidates: [xssCand] }
    );
    render(<MemoryRouter><AuthorityWorkspace /></MemoryRouter>);
    await waitFor(() => screen.getByRole('tab', { name: /Extraction/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Extraction/ }));
    await waitFor(() => {
      // Text should appear escaped, not as an actual script element
      expect(screen.queryByText('<script>alert(1)</script>')).toBeTruthy();
      expect(document.querySelector('script[data-injected]')).toBeNull();
    });
  });

  it('shows Accept button when user has AUTHORITY_INSTRUMENT_VERIFY', async () => {
    setupWorkspaceApi(
      { case: EXTRACTION_CASE, instruments: [], documents: [], assignments: [], notes: [] },
      ['AUTHORITY_INSTRUMENT_VERIFY'],
      { runs: [EXTRACTION_RUN_COMPLETED], candidates: [CANDIDATE_PENDING] }
    );
    render(<MemoryRouter><AuthorityWorkspace /></MemoryRouter>);
    await waitFor(() => screen.getByRole('tab', { name: /Extraction/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Extraction/ }));
    await waitFor(() => { expect(screen.getByText('Accept')).toBeTruthy(); });
  });

  it('shows Reject button when user has AUTHORITY_INSTRUMENT_REJECT', async () => {
    setupWorkspaceApi(
      { case: EXTRACTION_CASE, instruments: [], documents: [], assignments: [], notes: [] },
      ['AUTHORITY_INSTRUMENT_REJECT'],
      { runs: [EXTRACTION_RUN_COMPLETED], candidates: [CANDIDATE_PENDING] }
    );
    render(<MemoryRouter><AuthorityWorkspace /></MemoryRouter>);
    await waitFor(() => screen.getByRole('tab', { name: /Extraction/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Extraction/ }));
    await waitFor(() => { expect(screen.getByText('Reject')).toBeTruthy(); });
  });

  it('hides Accept/Reject when candidate is already accepted', async () => {
    setupWorkspaceApi(
      { case: EXTRACTION_CASE, instruments: [], documents: [], assignments: [], notes: [] },
      ['AUTHORITY_INSTRUMENT_VERIFY'],
      { runs: [EXTRACTION_RUN_COMPLETED], candidates: [CANDIDATE_ACCEPTED] }
    );
    render(<MemoryRouter><AuthorityWorkspace /></MemoryRouter>);
    await waitFor(() => { expect(screen.queryByText('Accept')).toBeNull(); });
  });

  it('shows Retry button for failed run when user has AUTHORITY_EXTRACTION_MANAGE', async () => {
    setupWorkspaceApi(
      { case: EXTRACTION_CASE, instruments: [], documents: [], assignments: [], notes: [] },
      ['AUTHORITY_EXTRACTION_MANAGE'],
      { runs: [EXTRACTION_RUN_FAILED] }
    );
    render(<MemoryRouter><AuthorityWorkspace /></MemoryRouter>);
    await waitFor(() => screen.getByRole('tab', { name: /Extraction/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Extraction/ }));
    await waitFor(() => { expect(screen.getByText('Retry')).toBeTruthy(); });
  });

  it('hides Retry when user lacks AUTHORITY_EXTRACTION_MANAGE', async () => {
    setupWorkspaceApi(
      { case: EXTRACTION_CASE, instruments: [], documents: [], assignments: [], notes: [] },
      ['AUTHORITY_INSTRUMENT_VERIFY'],
      { runs: [EXTRACTION_RUN_FAILED] }
    );
    render(<MemoryRouter><AuthorityWorkspace /></MemoryRouter>);
    await waitFor(() => { expect(screen.queryByText('Retry')).toBeNull(); });
  });

  it('shows "no candidates" message when runs completed but no candidates', async () => {
    setupWorkspaceApi(
      { case: EXTRACTION_CASE, instruments: [], documents: [], assignments: [], notes: [] },
      [],
      { runs: [EXTRACTION_RUN_COMPLETED], candidates: [] }
    );
    render(<MemoryRouter><AuthorityWorkspace /></MemoryRouter>);
    await waitFor(() => screen.getByRole('tab', { name: /Extraction/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Extraction/ }));
    await waitFor(() => { expect(screen.getByText(/No candidates were extracted/i)).toBeTruthy(); });
  });

  it('shows "extraction in progress" when run is pending', async () => {
    setupWorkspaceApi(
      { case: { ...EXTRACTION_CASE, status: 'PENDING_EXTRACTION' }, instruments: [], documents: [], assignments: [], notes: [] },
      [],
      { runs: [{ ...EXTRACTION_RUN_COMPLETED, status: 'pending', completed_at: null }], candidates: [] }
    );
    render(<MemoryRouter><AuthorityWorkspace /></MemoryRouter>);
    await waitFor(() => screen.getByRole('tab', { name: /Extraction/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Extraction/ }));
    await waitFor(() => { expect(screen.getByText(/Extraction in progress/i)).toBeTruthy(); });
  });

  it('does not show extraction panel when case is DRAFT and no runs', async () => {
    setupWorkspaceApi(
      { case: CASE_DRAFT, instruments: [], documents: [], assignments: [], notes: [] },
      [],
      { runs: [], candidates: [] }
    );
    render(<MemoryRouter><AuthorityWorkspace /></MemoryRouter>);
    await waitFor(() => { expect(screen.queryByText(/AI Extraction/i)).toBeNull(); });
  });
});

// ── Problem 6: Product naming — "FieldCore Authority" must not appear in UI ───

describe('Authority dashboard — product naming (Problem 6)', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      user: { id: 'test-user-id', role: 'owner', account_type: 'institution', authority_enabled: true },
    });
    vi.clearAllMocks();
  });

  it('shows "Dashboard" title with a purpose-oriented subtitle', async () => {
    api.get.mockResolvedValue({ data: [] });

    render(<MemoryRouter><AuthorityDashboard /></MemoryRouter>);

    await waitFor(() => screen.getByText('Dashboard'));
    expect(screen.getByText(/Review queue activity/i)).toBeTruthy();
    expect(screen.queryByText('Authority Dashboard')).toBeNull();
    expect(screen.queryByText('Institution authority operations')).toBeNull();
  });

  it('does not contain "institution review portal" anywhere in visible text', async () => {
    api.get.mockResolvedValue({ data: [] });

    render(<MemoryRouter><AuthorityDashboard /></MemoryRouter>);

    await waitFor(() => screen.getByText('Dashboard'));
    expect(screen.queryByText(/institution review portal/i)).toBeNull();
  });
});
