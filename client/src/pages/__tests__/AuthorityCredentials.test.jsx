import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../api', () => ({
  default: {
    get:    vi.fn(),
    post:   vi.fn(),
    delete: vi.fn(),
    patch:  vi.fn(),
  },
}));

import api from '../../api';
import AuthorityCredentials from '../AuthorityCredentials';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CRED_ACTIVE = {
  id: 'cred-uuid-0001',
  public_id: 'AAAAAAAAAAAAAAAA',
  label: 'Production server',
  status: 'active',
  scopes: ['authority:evaluate'],
  created_at: '2026-09-29T10:00:00Z',
  created_by_user_id: 'user-uuid-0001',
  last_used_at: '2026-09-29T14:00:00Z',
  revoked_at: null,
  revoked_by_user_id: null,
  replaces_credential_id: null,
};

const CRED_REVOKED = {
  ...CRED_ACTIVE,
  id: 'cred-uuid-0002',
  public_id: 'BBBBBBBBBBBBBBBB',
  label: 'Old key <script>alert(1)</script>',
  status: 'revoked',
  revoked_at: '2026-09-29T16:00:00Z',
};

function setupApi({
  caps = ['AUTHORITY_API_CREDENTIAL_MANAGE', 'AUTHORITY_API_CREDENTIAL_READ', 'AUTHORITY_EVALUATE'],
  credentials = [CRED_ACTIVE],
  flagEnabled = true,
  listError = null,
} = {}) {
  api.get.mockImplementation((url) => {
    if (url.includes('/authority/capabilities')) {
      return Promise.resolve({ data: { capabilities: caps } });
    }
    if (url.includes('/authority/credentials')) {
      if (listError) return Promise.reject(listError);
      return Promise.resolve({
        data: {
          credentials,
          valid_scopes: ['authority:evaluate', 'authority:evaluations:read'],
          flag_enabled: flagEnabled,
        },
      });
    }
    return Promise.reject(new Error(`Unexpected GET: ${url}`));
  });
}

function renderPage() {
  return render(
    <MemoryRouter><AuthorityCredentials /></MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AuthorityCredentials', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Branding and page identity ─────────────────────────────────────────────

  it('shows functional title "API Access" (not the legacy "Authority API Credentials")', async () => {
    setupApi();
    renderPage();
    await waitFor(() => screen.getByTestId('authority-credentials-page'));
    const page = screen.getByTestId('authority-credentials-page').textContent;
    expect(page).toContain('API Access');
    expect(page).not.toContain('Authority API Credentials');
  });

  it('does not render raw secret or verifier text in list view', async () => {
    setupApi();
    renderPage();
    await waitFor(() => screen.getByTestId('authority-credentials-page'));
    // Secret would contain fc_dev_ prefix; verifier would be a hex string
    expect(screen.queryByText(/fc_dev_/)).toBeNull();
    expect(screen.queryByText(/secret_verifier/i)).toBeNull();
  });

  it('renders credential labels as plain text (no HTML injection)', async () => {
    setupApi({ credentials: [CRED_REVOKED] });
    renderPage();
    await waitFor(() => screen.getByTestId('authority-credentials-page'));
    // The label contains <script>alert(1)</script> — it must render as text, not execute
    const labelCell = screen.getByTestId('cred-label');
    expect(labelCell.textContent).toContain('<script>alert(1)</script>');
    expect(labelCell.innerHTML).not.toContain('<script>');
  });

  // ── Credential list ────────────────────────────────────────────────────────

  it('renders the credentials table with public_id and label', async () => {
    setupApi();
    renderPage();
    await waitFor(() => screen.getByTestId('credentials-table'));
    expect(screen.getByTestId('cred-label').textContent).toBe('Production server');
    expect(screen.getByTestId('cred-public-id').textContent).toBe('AAAAAAAAAAAAAAAA');
  });

  it('shows empty state when no credentials exist', async () => {
    setupApi({ credentials: [] });
    renderPage();
    await waitFor(() => screen.getByTestId('credentials-list'));
    expect(screen.queryByTestId('credentials-table')).toBeNull();
  });

  it('shows active status badge for active credential', async () => {
    setupApi();
    renderPage();
    await waitFor(() => screen.getByTestId(`cred-row-${CRED_ACTIVE.id}`));
    const row = screen.getByTestId(`cred-row-${CRED_ACTIVE.id}`);
    expect(row.textContent).toContain('active');
  });

  it('shows revoked status badge for revoked credential', async () => {
    setupApi({ credentials: [CRED_REVOKED] });
    renderPage();
    await waitFor(() => screen.getByTestId(`cred-row-${CRED_REVOKED.id}`));
    const row = screen.getByTestId(`cred-row-${CRED_REVOKED.id}`);
    expect(row.textContent).toContain('revoked');
  });

  // ── Flag-off state ─────────────────────────────────────────────────────────

  it('shows "not enabled" message when flag is OFF', async () => {
    setupApi({ flagEnabled: false, credentials: [] });
    renderPage();
    await waitFor(() => screen.getByTestId('flag-off-message'));
    expect(screen.getByTestId('flag-off-message').textContent).toContain('not currently enabled');
    expect(screen.getByTestId('flag-off-message').textContent).toContain('FieldCore environment');
  });

  it('shows unavailable state when flag is OFF and no credentials exist', async () => {
    setupApi({ flagEnabled: false, credentials: [] });
    renderPage();
    await waitFor(() => screen.getByTestId('credentials-unavailable'));
    expect(screen.getByTestId('credentials-unavailable')).toBeTruthy();
    expect(screen.queryByTestId('credentials-table')).toBeNull();
  });

  it('shows credentials-list when flag is OFF but existing credentials exist', async () => {
    setupApi({ flagEnabled: false, credentials: [CRED_ACTIVE] });
    renderPage();
    await waitFor(() => screen.getByTestId('credentials-list'));
    expect(screen.getByTestId('credentials-list')).toBeTruthy();
  });

  it('does not show create button when flag is OFF', async () => {
    setupApi({ flagEnabled: false });
    renderPage();
    await waitFor(() => screen.getByTestId('authority-credentials-page'));
    expect(screen.queryByTestId('open-create-form-btn')).toBeNull();
  });

  // ── Create flow ────────────────────────────────────────────────────────────

  it('shows create form when New Credential is clicked', async () => {
    setupApi();
    renderPage();
    await waitFor(() => screen.getByTestId('open-create-form-btn'));
    fireEvent.click(screen.getByTestId('open-create-form-btn'));
    expect(screen.getByTestId('create-credential-form')).toBeTruthy();
  });

  it('one-time secret display shows warning and copy button after create', async () => {
    setupApi();
    api.post.mockResolvedValue({
      credential: 'fc_dev_CCCCCCCCCCCCCCCC_DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
      credential_id: 'new-cred-uuid',
      public_id: 'CCCCCCCCCCCCCCCC',
      label: 'Test credential',
      scopes: ['authority:evaluate'],
      status: 'active',
      created_at: new Date().toISOString(),
    });
    renderPage();
    await waitFor(() => screen.getByTestId('open-create-form-btn'));
    fireEvent.click(screen.getByTestId('open-create-form-btn'));
    fireEvent.change(screen.getByTestId('cred-label-input'), { target: { value: 'Test credential' } });
    fireEvent.click(screen.getByTestId('scope-checkbox-authority:evaluate').querySelector('input'));
    fireEvent.click(screen.getByTestId('create-credential-submit'));
    await waitFor(() => screen.getByTestId('one-time-secret-display'));
    expect(screen.getByTestId('one-time-secret-display')).toBeTruthy();
    // Warning text must be present
    expect(screen.getByTestId('one-time-secret-display').textContent).toContain('shown only once');
    expect(screen.getByTestId('copy-secret-btn')).toBeTruthy();
    expect(screen.getByTestId('dismiss-secret-btn')).toBeTruthy();
  });

  it('secret disappears after dismiss', async () => {
    setupApi();
    api.post.mockResolvedValue({
      credential: 'fc_dev_CCCCCCCCCCCCCCCC_DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
      credential_id: 'new-cred-uuid',
      public_id: 'CCCCCCCCCCCCCCCC',
      label: 'Test credential',
      scopes: ['authority:evaluate'],
      status: 'active',
      created_at: new Date().toISOString(),
    });
    renderPage();
    await waitFor(() => screen.getByTestId('open-create-form-btn'));
    fireEvent.click(screen.getByTestId('open-create-form-btn'));
    fireEvent.change(screen.getByTestId('cred-label-input'), { target: { value: 'Test' } });
    fireEvent.click(screen.getByTestId('scope-checkbox-authority:evaluate').querySelector('input'));
    fireEvent.click(screen.getByTestId('create-credential-submit'));
    await waitFor(() => screen.getByTestId('one-time-secret-display'));
    // Secret is visible
    expect(screen.getByTestId('one-time-secret-value')).toBeTruthy();
    // Dismiss
    await act(async () => {
      fireEvent.click(screen.getByTestId('dismiss-secret-btn'));
    });
    // Secret is gone from DOM
    expect(screen.queryByTestId('one-time-secret-display')).toBeNull();
    expect(screen.queryByTestId('one-time-secret-value')).toBeNull();
  });

  it('secret value is NOT written to localStorage or sessionStorage', async () => {
    setupApi();
    const localSpy   = vi.spyOn(Storage.prototype, 'setItem');
    const sessionSpy = vi.spyOn(Storage.prototype, 'setItem');
    api.post.mockResolvedValue({
      credential: 'fc_dev_CCCCCCCCCCCCCCCC_DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
      credential_id: 'new-cred-uuid',
      public_id: 'CCCCCCCCCCCCCCCC',
      label: 'Test',
      scopes: ['authority:evaluate'],
      status: 'active',
      created_at: new Date().toISOString(),
    });
    renderPage();
    await waitFor(() => screen.getByTestId('open-create-form-btn'));
    fireEvent.click(screen.getByTestId('open-create-form-btn'));
    fireEvent.change(screen.getByTestId('cred-label-input'), { target: { value: 'Test' } });
    fireEvent.click(screen.getByTestId('scope-checkbox-authority:evaluate').querySelector('input'));
    fireEvent.click(screen.getByTestId('create-credential-submit'));
    await waitFor(() => screen.getByTestId('one-time-secret-display'));
    // Verify no storage write occurred with the credential value
    const credValue = 'fc_dev_CCCCCCCCCCCCCCCC_DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD';
    const storedValues = localSpy.mock.calls.map(c => c[1]);
    expect(storedValues.some(v => typeof v === 'string' && v.includes(credValue))).toBe(false);
    localSpy.mockRestore();
    sessionSpy.mockRestore();
  });

  // ── Revoke flow ────────────────────────────────────────────────────────────

  it('shows revoke confirmation dialog with label and public ID', async () => {
    setupApi();
    renderPage();
    await waitFor(() => screen.getByTestId(`revoke-btn-${CRED_ACTIVE.id}`));
    fireEvent.click(screen.getByTestId(`revoke-btn-${CRED_ACTIVE.id}`));
    expect(screen.getByTestId('revoke-dialog')).toBeTruthy();
    expect(screen.getByTestId('revoke-cred-label').textContent).toBe('Production server');
    expect(screen.getByTestId('revoke-cred-public-id').textContent).toBe('AAAAAAAAAAAAAAAA');
  });

  it('does not show delete button anywhere', async () => {
    setupApi();
    renderPage();
    await waitFor(() => screen.getByTestId('authority-credentials-page'));
    const allButtons = screen.getAllByRole('button');
    allButtons.forEach(btn => {
      expect(btn.textContent.toLowerCase()).not.toContain('delete');
    });
  });

  it('revoke button is absent for revoked credentials', async () => {
    setupApi({ credentials: [CRED_REVOKED] });
    renderPage();
    await waitFor(() => screen.getByTestId(`cred-row-${CRED_REVOKED.id}`));
    expect(screen.queryByTestId(`revoke-btn-${CRED_REVOKED.id}`)).toBeNull();
  });

  it('updates credential status in list after successful revoke', async () => {
    setupApi();
    api.delete.mockResolvedValue({});
    renderPage();
    await waitFor(() => screen.getByTestId(`revoke-btn-${CRED_ACTIVE.id}`));
    fireEvent.click(screen.getByTestId(`revoke-btn-${CRED_ACTIVE.id}`));
    await waitFor(() => screen.getByTestId('revoke-confirm-btn'));
    fireEvent.click(screen.getByTestId('revoke-confirm-btn'));
    await waitFor(() => expect(screen.queryByTestId('revoke-dialog')).toBeNull());
    // Revoke button gone for that credential
    expect(screen.queryByTestId(`revoke-btn-${CRED_ACTIVE.id}`)).toBeNull();
  });

  // ── No verifier rendered ───────────────────────────────────────────────────

  it('does not render secret_verifier or hash material in any view', async () => {
    setupApi({ credentials: [CRED_ACTIVE, CRED_REVOKED] });
    renderPage();
    await waitFor(() => screen.getByTestId('credentials-table'));
    const pageText = screen.getByTestId('authority-credentials-page').textContent;
    expect(pageText).not.toContain('secret_verifier');
    // No long hex string (would be a hash/verifier)
    expect(/[0-9a-f]{64}/.test(pageText)).toBe(false);
  });

  // ── Capability gating ──────────────────────────────────────────────────────

  it('does not show create button if user lacks AUTHORITY_API_CREDENTIAL_MANAGE', async () => {
    setupApi({ caps: ['AUTHORITY_API_CREDENTIAL_READ'] });
    renderPage();
    await waitFor(() => screen.getByTestId('authority-credentials-page'));
    expect(screen.queryByTestId('open-create-form-btn')).toBeNull();
  });

  it('shows create button when user has AUTHORITY_API_CREDENTIAL_MANAGE and flag is ON', async () => {
    setupApi({ caps: ['AUTHORITY_API_CREDENTIAL_MANAGE', 'AUTHORITY_EVALUATE'] });
    renderPage();
    await waitFor(() => screen.getByTestId('authority-credentials-page'));
    expect(screen.getByTestId('open-create-form-btn')).toBeTruthy();
  });

  // ── Disclaimer ────────────────────────────────────────────────────────────

  it('shows the API disclaimer', async () => {
    setupApi();
    renderPage();
    await waitFor(() => screen.getByTestId('api-disclaimer'));
    const disclaimer = screen.getByTestId('api-disclaimer').textContent;
    expect(disclaimer).toContain('Revocation is immediate');
    expect(disclaimer).toContain('cannot be retrieved again');
  });

  // ── Rotation workflow explanation ──────────────────────────────────────────

  it('shows rotation workflow explanation when flag is ON', async () => {
    setupApi();
    renderPage();
    await waitFor(() => screen.getByTestId('authority-credentials-page'));
    const page = screen.getByTestId('authority-credentials-page').textContent;
    expect(page).toContain('Replace');
    expect(page).toContain('revoke');
  });

});

// ── C17/C18: API concept and credential explanations (info panel) ─────────────

describe('AuthorityCredentials — C17/C18: explanation blocks', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders api-concept-explanation with purpose copy', async () => {
    setupApi();
    renderPage();
    await waitFor(() => screen.getByTestId('api-concept-explanation'));
    const expl = screen.getByTestId('api-concept-explanation');
    expect(expl.textContent).toContain('API Access');
    expect(expl.textContent).toContain('Authority evaluations');
  });

  it('renders api-credential-explanation with scope copy', async () => {
    setupApi();
    renderPage();
    await waitFor(() => screen.getByTestId('api-credential-explanation'));
    const expl = screen.getByTestId('api-credential-explanation');
    expect(expl.textContent).toContain('machine-to-machine');
  });

  it('api-credential-explanation does not claim to grant authority', async () => {
    setupApi();
    renderPage();
    await waitFor(() => screen.getByTestId('api-credential-explanation'));
    const expl = screen.getByTestId('api-credential-explanation');
    expect(expl.textContent).toContain('does not grant');
  });
});

// ── C19/C20: flag-off message ordering ───────────────────────────────────────

describe('AuthorityCredentials — C19/C20: flag-off appears before explanation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('flag-off message text precedes info panel content in page DOM order', async () => {
    setupApi({ flagEnabled: false, credentials: [] });
    renderPage();
    await waitFor(() => screen.getByTestId('flag-off-message'));
    const page = screen.getByTestId('authority-credentials-page').textContent;
    const flagOffIdx = page.indexOf('not currently enabled');
    const conceptIdx = page.indexOf('About API Access');
    expect(flagOffIdx).toBeGreaterThan(-1);
    expect(conceptIdx).toBeGreaterThan(-1);
    expect(flagOffIdx).toBeLessThan(conceptIdx);
  });

  it('both flag-off message and concept explanation are present when flag is OFF', async () => {
    setupApi({ flagEnabled: false, credentials: [] });
    renderPage();
    await waitFor(() => screen.getByTestId('flag-off-message'));
    expect(screen.getByTestId('flag-off-message')).toBeTruthy();
    expect(screen.getByTestId('api-concept-explanation')).toBeTruthy();
  });
});

// ── C23: credentials page subtitle ───────────────────────────────────────────

describe('AuthorityCredentials — C23: page subtitle', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('subtitle conveys server-side purpose and target audience', async () => {
    setupApi();
    renderPage();
    await waitFor(() => screen.getByTestId('authority-credentials-page'));
    const page = screen.getByTestId('authority-credentials-page').textContent;
    expect(page).toContain('server-side');
    expect(page).toContain('automated');
    expect(page).toContain('IT');
  });
});

// ── Batch 4: Concern 1 — no documentation-heavy panels ───────────────────────

describe('AuthorityCredentials — Batch4-C1: no documentation-heavy panels', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('page does not contain "What this is:" copy', async () => {
    setupApi();
    renderPage();
    await waitFor(() => screen.getByTestId('authority-credentials-page'));
    expect(screen.getByTestId('authority-credentials-page').textContent).not.toContain('What this is:');
  });

  it('page does not contain "What an API credential is:" copy', async () => {
    setupApi();
    renderPage();
    await waitFor(() => screen.getByTestId('authority-credentials-page'));
    expect(screen.getByTestId('authority-credentials-page').textContent).not.toContain('What an API credential is:');
  });

  it('credentials section renders immediately alongside info panel', async () => {
    setupApi();
    renderPage();
    await waitFor(() => screen.getByTestId('credentials-list'));
    expect(screen.getByTestId('credentials-list')).toBeTruthy();
    expect(screen.getByTestId('api-concept-explanation')).toBeTruthy();
  });
});

// ── Batch 4: Concern 2 — one-time secret warning completeness ────────────────

describe('AuthorityCredentials — Batch4-C2: one-time secret warning', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  async function openSecretDisplay() {
    setupApi();
    api.post.mockResolvedValue({
      credential: 'fc_dev_EEEEEEEEEEEEEEEE_FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
      credential_id: 'warn-cred-uuid',
      public_id: 'EEEEEEEEEEEEEEEE',
      label: 'Warning test',
      scopes: ['authority:evaluate'],
      status: 'active',
      created_at: new Date().toISOString(),
    });
    renderPage();
    await waitFor(() => screen.getByTestId('open-create-form-btn'));
    fireEvent.click(screen.getByTestId('open-create-form-btn'));
    fireEvent.change(screen.getByTestId('cred-label-input'), { target: { value: 'Warning test' } });
    fireEvent.click(screen.getByTestId('scope-checkbox-authority:evaluate').querySelector('input'));
    fireEvent.click(screen.getByTestId('create-credential-submit'));
    await waitFor(() => screen.getByTestId('one-time-secret-display'));
  }

  it('warning states secret is shown only once', async () => {
    await openSecretDisplay();
    const warning = screen.getByTestId('one-time-secret-display').textContent;
    expect(warning).toContain('shown only once');
  });

  it('warning states secret cannot be recovered later', async () => {
    await openSecretDisplay();
    const warning = screen.getByTestId('one-time-secret-display').textContent;
    expect(warning).toContain('cannot be recovered');
  });

  it('warning instructs server-side storage', async () => {
    await openSecretDisplay();
    const warning = screen.getByTestId('one-time-secret-display').textContent;
    expect(warning).toContain('server');
  });

  it('warning prohibits browser or client-side code', async () => {
    await openSecretDisplay();
    const warning = screen.getByTestId('one-time-secret-display').textContent;
    expect(warning).toContain('browser');
  });
});

// ── Batch 4: Concern 3 — two-column layout ────────────────────────────────────

describe('AuthorityCredentials — Batch4-C3: two-column layout', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('au-cred-layout grid element is present', async () => {
    setupApi();
    renderPage();
    await waitFor(() => screen.getByTestId('authority-credentials-page'));
    expect(document.querySelector('.au-cred-layout')).toBeTruthy();
  });

  it('au-cred-layout__main (credentials column) is present', async () => {
    setupApi();
    renderPage();
    await waitFor(() => screen.getByTestId('authority-credentials-page'));
    expect(document.querySelector('.au-cred-layout__main')).toBeTruthy();
  });

  it('au-cred-info-panel (info column) is present', async () => {
    setupApi();
    renderPage();
    await waitFor(() => screen.getByTestId('authority-credentials-page'));
    expect(document.querySelector('.au-cred-info-panel')).toBeTruthy();
  });
});

// ── Batch 4: Concern 4 — admin hierarchy ─────────────────────────────────────

describe('AuthorityCredentials — Batch4-C4: admin hierarchy', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('credentials section appears before info panel in DOM order', async () => {
    setupApi();
    renderPage();
    await waitFor(() => screen.getByTestId('authority-credentials-page'));
    const page = screen.getByTestId('authority-credentials-page').textContent;
    const credsIdx = page.indexOf('API Credentials');
    const infoIdx  = page.indexOf('About API Access');
    expect(credsIdx).toBeGreaterThan(-1);
    expect(infoIdx).toBeGreaterThan(-1);
    expect(credsIdx).toBeLessThan(infoIdx);
  });

  it('subtitle appears before credentials section', async () => {
    setupApi();
    renderPage();
    await waitFor(() => screen.getByTestId('authority-credentials-page'));
    const page = screen.getByTestId('authority-credentials-page').textContent;
    const subtitleIdx = page.indexOf('server-side');
    const credsIdx    = page.indexOf('API Credentials');
    expect(subtitleIdx).toBeGreaterThan(-1);
    expect(credsIdx).toBeGreaterThan(-1);
    expect(subtitleIdx).toBeLessThan(credsIdx);
  });
});
