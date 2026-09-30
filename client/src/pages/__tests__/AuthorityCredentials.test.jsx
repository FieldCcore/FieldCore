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

  it('shows functional title (not "FieldCore Authority")', async () => {
    setupApi();
    renderPage();
    await waitFor(() => screen.getByTestId('authority-credentials-page'));
    const title = screen.getByRole('heading', { level: 1 });
    expect(title.textContent).toBe('Authority API Credentials');
    expect(title.textContent).not.toContain('FieldCore Authority');
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
    expect(screen.getByTestId('flag-off-message').textContent).toContain('not enabled');
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
    expect(screen.getByTestId('one-time-secret-display').textContent).toContain('Copy now');
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
    expect(screen.getByTestId('api-disclaimer').textContent).toContain('server-side use only');
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
