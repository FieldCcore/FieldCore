import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';
import AuthorityWorkspace from '../AuthorityWorkspace';

vi.mock('../../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-reviewer-1', name: 'Test Reviewer', account_type: 'institution', authority_enabled: true },
  }),
}));

import api from '../../api';

const CASE_ID = 'case-abc-123';

const mkWorkspace = (overrides = {}) => ({
  case: {
    id: CASE_ID,
    status: 'HUMAN_REVIEW_IN_PROGRESS',
    external_case_reference: 'REF-2024-001',
    created_at: '2024-01-15T10:00:00Z',
    ...overrides.case,
  },
  instruments: overrides.instruments ?? [],
  documents:   overrides.documents   ?? [],
  assignments: overrides.assignments ?? [],
  notes:       overrides.notes       ?? [],
});

const mkActivity = (n = 2) =>
  Array.from({ length: n }, (_, i) => ({
    id: `evt-${i}`,
    action: 'authority.case.transitioned',
    actor_name: 'Admin User',
    created_at: '2024-01-16T09:00:00Z',
  }));

function setupMocks({ workspace, activity, caps, runs, candidates } = {}) {
  api.get.mockImplementation(url => {
    if (url.includes('/workspace'))   return Promise.resolve({ data: workspace ?? mkWorkspace() });
    if (url.includes('/activity'))    return Promise.resolve({ data: activity ?? mkActivity() });
    if (url === '/authority/capabilities') return Promise.resolve({ data: { capabilities: caps ?? ['AUTHORITY_INSTRUMENT_VERIFY', 'AUTHORITY_INSTRUMENT_REJECT', 'AUTHORITY_EXTRACTION_MANAGE', 'AUTHORITY_EVALUATE'] } });
    if (url.includes('/extraction/runs'))  return Promise.resolve({ data: runs ?? [] });
    if (url.includes('/candidates'))       return Promise.resolve({ data: candidates ?? [] });
    return Promise.reject(new Error(`Unmocked GET: ${url}`));
  });
}

function renderWorkspace(caseId = CASE_ID) {
  return render(
    <MemoryRouter initialEntries={[`/authority/cases/${caseId}`]}>
      <Routes>
        <Route path="/authority/cases/:caseId" element={<AuthorityWorkspace />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Loading and error states ──────────────────────────────────────────────────

describe('loading and error states', () => {
  it('renders a loading indicator before data arrives', () => {
    api.get.mockReturnValue(new Promise(() => {}));
    renderWorkspace();
    expect(screen.getByText(/Loading/i)).toBeTruthy();
  });

  it('renders an error message when all API calls fail', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'Workspace not found' } } });
    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByText(/Workspace not found|not available/i)).toBeTruthy();
    });
  });
});

// ── Case header ───────────────────────────────────────────────────────────────

describe('case header', () => {
  it('displays the case external reference', async () => {
    setupMocks();
    renderWorkspace();
    await waitFor(() => expect(screen.getAllByText('REF-2024-001').length).toBeGreaterThan(0));
  });

  it('shows a back link to the cases list', async () => {
    setupMocks();
    renderWorkspace();
    await waitFor(() => {
      const back = screen.getByRole('link', { name: /back to cases|cases/i });
      expect(back).toBeTruthy();
    });
  });

  it('shows the case status badge', async () => {
    setupMocks();
    renderWorkspace();
    await waitFor(() => {
      expect(screen.getAllByText(/In progress/i).length).toBeGreaterThan(0);
    });
  });

  it('shows an activity drawer toggle button', async () => {
    setupMocks();
    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByLabelText(/open activity drawer/i)).toBeTruthy();
    });
  });
});

// ── Lifecycle strip ───────────────────────────────────────────────────────────

describe('lifecycle strip', () => {
  it('renders the lifecycle strip', async () => {
    setupMocks();
    renderWorkspace();
    await waitFor(() => expect(screen.getByTestId('lifecycle-strip')).toBeTruthy());
  });

  it('shows Draft as a lifecycle stage', async () => {
    setupMocks();
    renderWorkspace();
    await waitFor(() => expect(screen.getByText('Draft')).toBeTruthy());
  });

  it('shows Completed as a lifecycle stage', async () => {
    setupMocks();
    renderWorkspace();
    await waitFor(() => expect(screen.getByText('Completed')).toBeTruthy());
  });
});

// ── Split pane and document pane ──────────────────────────────────────────────

describe('document pane', () => {
  it('renders the document pane', async () => {
    setupMocks();
    renderWorkspace();
    await waitFor(() => expect(screen.getByTestId('document-pane')).toBeTruthy());
  });

  it('shows "No documents uploaded" when documents list is empty', async () => {
    setupMocks({ workspace: mkWorkspace({ documents: [] }) });
    renderWorkspace();
    await waitFor(() => expect(screen.getByText(/No documents uploaded/i)).toBeTruthy());
  });

  it('shows document list when documents exist', async () => {
    const docs = [{ id: 'doc-1', content_type: 'application/pdf', byte_size: 51200, created_at: '2024-01-10T08:00:00Z' }];
    setupMocks({ workspace: mkWorkspace({ documents: docs }) });
    renderWorkspace();
    await waitFor(() => expect(screen.getByText('application/pdf')).toBeTruthy());
  });
});

// ── Tab bar ───────────────────────────────────────────────────────────────────

describe('tab bar', () => {
  it('renders the tab bar', async () => {
    setupMocks();
    renderWorkspace();
    await waitFor(() => expect(screen.getByTestId('tab-bar')).toBeTruthy());
  });

  it('renders all 6 tabs', async () => {
    setupMocks();
    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Overview/   })).toBeTruthy();
      expect(screen.getByRole('tab', { name: /Parties/    })).toBeTruthy();
      expect(screen.getByRole('tab', { name: /Instrument/ })).toBeTruthy();
      expect(screen.getByRole('tab', { name: /Permissions/})).toBeTruthy();
      expect(screen.getByRole('tab', { name: /Restrictions/})).toBeTruthy();
      expect(screen.getByRole('tab', { name: /Extraction/ })).toBeTruthy();
    });
  });

  it('Overview tab is selected by default', async () => {
    setupMocks();
    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Overview/ }).getAttribute('aria-selected')).toBe('true');
    });
  });

  it('clicking a tab changes the active tab', async () => {
    setupMocks();
    renderWorkspace();
    await waitFor(() => screen.getByRole('tab', { name: /Parties/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Parties/ }));
    expect(screen.getByRole('tab', { name: /Parties/  }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /Overview/ }).getAttribute('aria-selected')).toBe('false');
  });
});

// ── Overview tab ──────────────────────────────────────────────────────────────

describe('overview tab', () => {
  it('shows case reference in overview', async () => {
    setupMocks();
    renderWorkspace();
    await waitFor(() => expect(screen.getAllByText('REF-2024-001').length).toBeGreaterThan(0));
  });

  it('shows assignments when present', async () => {
    const ws = mkWorkspace({
      assignments: [{ id: 'a-1', assigned_to: 'user-reviewer-1', reviewer_name: 'Jane Smith', claimed_at: '2024-01-15T10:00:00Z' }],
    });
    setupMocks({ workspace: ws });
    renderWorkspace();
    await waitFor(() => expect(screen.getByText('Jane Smith')).toBeTruthy());
  });

  it('shows "Not claimed" when no assignments', async () => {
    setupMocks({ workspace: mkWorkspace({ assignments: [] }) });
    renderWorkspace();
    await waitFor(() => expect(screen.getByText(/Not claimed/i)).toBeTruthy());
  });

  it('shows existing notes', async () => {
    const ws = mkWorkspace({
      notes: [{ id: 'n-1', body: 'Test review note content', author_name: 'Reviewer A', created_at: '2024-01-15T11:00:00Z' }],
    });
    setupMocks({ workspace: ws });
    renderWorkspace();
    await waitFor(() => expect(screen.getByText('Test review note content')).toBeTruthy());
  });
});

// ── Activity drawer ───────────────────────────────────────────────────────────

describe('activity drawer', () => {
  it('drawer is closed by default', async () => {
    setupMocks();
    renderWorkspace();
    await waitFor(() => screen.getByTestId('authority-workspace'));
    const drawer = document.querySelector('.fc-drawer');
    expect(drawer?.classList.contains('fc-drawer--open')).toBe(false);
  });

  it('opens the drawer when activity button is clicked', async () => {
    setupMocks();
    renderWorkspace();
    await waitFor(() => screen.getByLabelText(/open activity drawer/i));
    fireEvent.click(screen.getByLabelText(/open activity drawer/i));
    const drawer = document.querySelector('.fc-drawer');
    expect(drawer?.classList.contains('fc-drawer--open')).toBe(true);
  });

  it('shows activity events in the drawer', async () => {
    setupMocks({ activity: [{ id: 'e-1', action: 'authority.case.created', actor_name: 'Admin', created_at: '2024-01-15T08:00:00Z' }] });
    renderWorkspace();
    await waitFor(() => screen.getByLabelText(/open activity drawer/i));
    fireEvent.click(screen.getByLabelText(/open activity drawer/i));
    await waitFor(() => expect(screen.getByText('Case created')).toBeTruthy());
  });

  it('closes the drawer when the close button is clicked', async () => {
    setupMocks();
    renderWorkspace();
    await waitFor(() => screen.getByLabelText(/open activity drawer/i));
    fireEvent.click(screen.getByLabelText(/open activity drawer/i));
    fireEvent.click(screen.getByLabelText(/close activity drawer/i));
    const drawer = document.querySelector('.fc-drawer');
    expect(drawer?.classList.contains('fc-drawer--open')).toBe(false);
  });

  it('closes the drawer on Escape key press', async () => {
    setupMocks();
    renderWorkspace();
    await waitFor(() => screen.getByLabelText(/open activity drawer/i));
    fireEvent.click(screen.getByLabelText(/open activity drawer/i));
    fireEvent.keyDown(document, { key: 'Escape' });
    const drawer = document.querySelector('.fc-drawer');
    expect(drawer?.classList.contains('fc-drawer--open')).toBe(false);
  });
});

// ── Decision bar ──────────────────────────────────────────────────────────────

describe('decision bar', () => {
  it('shows Claim Case button when reviewer is not the active assignee and case is in review', async () => {
    setupMocks({
      caps: ['AUTHORITY_INSTRUMENT_VERIFY'],
      workspace: mkWorkspace({ assignments: [] }),
    });
    renderWorkspace();
    await waitFor(() => expect(screen.getByText('Claim Case')).toBeTruthy());
  });

  it('does not show Claim Case when already assigned', async () => {
    setupMocks({
      caps: ['AUTHORITY_INSTRUMENT_VERIFY'],
      workspace: mkWorkspace({ assignments: [{ id: 'a-1', assigned_to: 'user-reviewer-1', reviewer_name: 'Test Reviewer', claimed_at: '2024-01-15T10:00:00Z' }] }),
    });
    renderWorkspace();
    await waitFor(() => screen.getByTestId('authority-workspace'));
    expect(screen.queryByText('Claim Case')).toBeNull();
  });

  it('shows Mark Complete when case is HUMAN_REVIEW_IN_PROGRESS', async () => {
    setupMocks({ workspace: mkWorkspace({ case: { id: CASE_ID, status: 'HUMAN_REVIEW_IN_PROGRESS', external_case_reference: 'REF-1', created_at: '2024-01-01T00:00:00Z' }, assignments: [{ id: 'a-1', assigned_to: 'user-reviewer-1', reviewer_name: 'Test Reviewer', claimed_at: '2024-01-15T10:00:00Z' }] }) });
    renderWorkspace();
    await waitFor(() => expect(screen.getByText('Mark Complete')).toBeTruthy());
  });

  it('shows Cancel Case when case can be cancelled', async () => {
    setupMocks({ workspace: mkWorkspace({ case: { id: CASE_ID, status: 'DRAFT', external_case_reference: 'REF-1', created_at: '2024-01-01T00:00:00Z' } }) });
    renderWorkspace();
    await waitFor(() => expect(screen.getByText('Cancel Case')).toBeTruthy());
  });

  it('shows Request Documents for DRAFT status', async () => {
    setupMocks({ workspace: mkWorkspace({ case: { id: CASE_ID, status: 'DRAFT', external_case_reference: 'REF-D', created_at: '2024-01-01T00:00:00Z' } }) });
    renderWorkspace();
    await waitFor(() => expect(screen.getByText('Request Documents')).toBeTruthy());
  });
});

// ── Confirm dialog ────────────────────────────────────────────────────────────

describe('confirm dialog', () => {
  it('shows a confirm dialog when Cancel Case is clicked', async () => {
    setupMocks({ workspace: mkWorkspace({ case: { id: CASE_ID, status: 'DRAFT', external_case_reference: 'REF-X', created_at: '2024-01-01T00:00:00Z' } }) });
    renderWorkspace();
    await waitFor(() => screen.getByText('Cancel Case'));
    fireEvent.click(screen.getByText('Cancel Case'));
    expect(screen.getByText('Cancel Case', { selector: '.fc-confirm-title' })).toBeTruthy();
  });

  it('dismiss the confirm dialog when Cancel is clicked', async () => {
    setupMocks({ workspace: mkWorkspace({ case: { id: CASE_ID, status: 'DRAFT', external_case_reference: 'REF-X', created_at: '2024-01-01T00:00:00Z' } }) });
    renderWorkspace();
    await waitFor(() => screen.getByText('Cancel Case'));
    fireEvent.click(screen.getByText('Cancel Case'));
    const cancelBtns = screen.getAllByText('Cancel');
    fireEvent.click(cancelBtns[cancelBtns.length - 1]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

// ── Extraction tab ────────────────────────────────────────────────────────────

describe('extraction tab', () => {
  it('shows candidate cards for pending candidates', async () => {
    const candidates = [{
      id: 'cand-1', fieldKey: 'principal_name', proposedValue: 'Jane Doe',
      confidence: 0.95, status: 'pending', evidence: [], rowVersion: 1,
    }];
    setupMocks({ candidates, workspace: mkWorkspace() });
    renderWorkspace();
    await waitFor(() => screen.getByRole('tab', { name: /Extraction/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Extraction/ }));
    await waitFor(() => {
      expect(screen.getByTestId('candidate-card')).toBeTruthy();
      // Untrusted AI value rendered as plain text
      expect(screen.getByText('Jane Doe')).toBeTruthy();
    });
  });

  it('does not use dangerouslySetInnerHTML for candidate values', async () => {
    const xssPayload = '<img src=x onerror=alert(1)>';
    const candidates = [{
      id: 'cand-xss', fieldKey: 'agent_name', proposedValue: xssPayload,
      confidence: 0.8, status: 'pending', evidence: [], rowVersion: 1,
    }];
    setupMocks({ candidates });
    renderWorkspace();
    await waitFor(() => screen.getByRole('tab', { name: /Extraction/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Extraction/ }));
    await waitFor(() => screen.getByText(xssPayload));
    // Value must be a plain text node: textContent equals raw string, no injected elements
    const el = screen.getByText(xssPayload);
    expect(el.textContent).toBe(xssPayload);
    expect(el.querySelector('img')).toBeNull();
  });

  it('shows evidence blocks when expanded', async () => {
    const candidates = [{
      id: 'cand-2', fieldKey: 'principal_name', proposedValue: 'John Smith',
      confidence: 0.9, status: 'pending',
      evidence: [{ excerpt: 'I, John Smith, hereby appoint...', pageNumbers: [1] }],
      rowVersion: 1,
    }];
    setupMocks({ candidates });
    renderWorkspace();
    await waitFor(() => screen.getByRole('tab', { name: /Extraction/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Extraction/ }));
    await waitFor(() => screen.getByText(/1 evidence item/i));
    fireEvent.click(screen.getByText(/1 evidence item/i));
    expect(screen.getByTestId('evidence-block')).toBeTruthy();
    expect(screen.getByText(/I, John Smith, hereby appoint/)).toBeTruthy();
  });

  it('shows the legal disclaimer in extraction tab', async () => {
    setupMocks();
    renderWorkspace();
    await waitFor(() => screen.getByRole('tab', { name: /Extraction/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Extraction/ }));
    await waitFor(() => expect(screen.getByText(/not a legal determination/i)).toBeTruthy());
  });
});

// ── Instrument tab ────────────────────────────────────────────────────────────

describe('instrument tab', () => {
  it('shows instrument type and status', async () => {
    const instruments = [{
      id: 'instr-1', instrument_type: 'power_of_attorney', status: 'UNVERIFIED',
      participants: [], permissions: [], restrictions: [],
      effective_date: '2024-01-01',
    }];
    setupMocks({ workspace: mkWorkspace({ instruments }) });
    renderWorkspace();
    await waitFor(() => screen.getByRole('tab', { name: /Instrument/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Instrument/ }));
    await waitFor(() => expect(screen.getByText(/power of attorney/i)).toBeTruthy());
  });
});

// ── Security: no dangerouslySetInnerHTML for evidence excerpts ────────────────

describe('evidence block security', () => {
  it('renders excerpt as plain text node (no innerHTML injection)', async () => {
    const xss = '<script>alert("xss")</script>';
    const candidates = [{
      id: 'c-1', fieldKey: 'principal_name', proposedValue: 'Alice',
      confidence: 0.7, status: 'pending',
      evidence: [{ excerpt: xss, pageNumbers: [1] }],
      rowVersion: 1,
    }];
    setupMocks({ candidates });
    renderWorkspace();
    await waitFor(() => screen.getByRole('tab', { name: /Extraction/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Extraction/ }));
    await waitFor(() => screen.getByText(/1 evidence item/i));
    fireEvent.click(screen.getByText(/1 evidence item/i));
    const block = screen.getByTestId('evidence-block');
    // The XSS string should appear as text, not executed markup
    expect(block.textContent).toContain('<script>');
    expect(block.querySelector('script')).toBeNull();
  });
});

// ── Language normalization — lifecycle strip and status display ───────────────

describe('AuthorityWorkspace — language normalization: lifecycle strip sentence case', () => {
  it('lifecycle strip shows "Draft", not raw "DRAFT"', async () => {
    setupMocks({ case: { status: 'DRAFT' } });
    renderWorkspace();
    await waitFor(() => expect(screen.getByTestId('lifecycle-strip')).toBeTruthy());
    expect(screen.getByText('Draft')).toBeTruthy();
    expect(screen.queryByText('DRAFT')).toBeNull();
  });

  it('lifecycle strip shows "Completed", not raw "COMPLETED"', async () => {
    setupMocks();
    renderWorkspace();
    await waitFor(() => expect(screen.getByTestId('lifecycle-strip')).toBeTruthy());
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.queryByText('COMPLETED')).toBeNull();
  });

  it('lifecycle strip shows "Awaiting documents", not raw "AWAITING_DOCUMENTS"', async () => {
    setupMocks();
    renderWorkspace();
    await waitFor(() => expect(screen.getByTestId('lifecycle-strip')).toBeTruthy());
    expect(screen.getByText('Awaiting documents')).toBeTruthy();
    expect(screen.queryByText('AWAITING_DOCUMENTS')).toBeNull();
  });

  it('lifecycle strip shows "In progress", not raw "HUMAN_REVIEW_IN_PROGRESS"', async () => {
    setupMocks();
    renderWorkspace();
    await waitFor(() => expect(screen.getByTestId('lifecycle-strip')).toBeTruthy());
    expect(screen.getAllByText('In progress').length).toBeGreaterThan(0);
    expect(screen.queryByText('HUMAN_REVIEW_IN_PROGRESS')).toBeNull();
    expect(screen.queryByText('HUMAN REVIEW IN PROGRESS')).toBeNull();
  });
});

describe('AuthorityWorkspace — language normalization: case status badge sentence case', () => {
  it('case status badge shows "In progress", not raw enum', async () => {
    setupMocks();
    renderWorkspace();
    await waitFor(() => {
      expect(screen.getAllByText('In progress').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('HUMAN_REVIEW_IN_PROGRESS')).toBeNull();
    expect(screen.queryByText(/HUMAN REVIEW IN PROGRESS/i)).toBeNull();
  });

  it('PENDING_HUMAN_REVIEW renders as "Pending review"', async () => {
    setupMocks({ case: { status: 'PENDING_HUMAN_REVIEW' } });
    renderWorkspace();
    await waitFor(() => {
      expect(screen.getAllByText('Pending review').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('PENDING_HUMAN_REVIEW')).toBeNull();
    expect(screen.queryByText('PENDING HUMAN REVIEW')).toBeNull();
  });
});
