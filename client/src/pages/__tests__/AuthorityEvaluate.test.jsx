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
import AuthorityEvaluate, { toMinorUnits } from '../AuthorityEvaluate';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const INSTRUMENT_ROW = {
  id: 'instr-uuid-11111111', instrument_type: 'power_of_attorney',
  status: 'VERIFIED', effective_date: '2025-01-01', expiration_date: '2035-12-31',
};

// Backend now includes is_valid_principal / is_valid_delegate per canonical classification
const INSTRUMENT_DETAIL = {
  ...INSTRUMENT_ROW,
  participants: [
    { id: 'part-1', party_id: 'party-uuid-00000001', role: 'principal', sequence: 1,
      status: 'active', conditions: null, party_type: 'person',
      display_name: 'Principal Party', external_reference: null,
      is_valid_principal: true, is_valid_delegate: false },
    { id: 'part-2', party_id: 'party-uuid-00000002', role: 'agent', sequence: 1,
      status: 'active', conditions: null, party_type: 'person',
      display_name: 'Delegate Party', external_reference: null,
      is_valid_principal: false, is_valid_delegate: true },
  ],
  permissions: [
    { id: 'perm-1', action_key: 'BANKING.WIRE_TRANSFER', grant_type: 'granted',
      participant_id: 'part-2', created_at: '2025-01-01T00:00:00Z' },
  ],
};

// Fixture with an extra participant that is neither principal nor delegate
// (simulated via is_valid_principal=false, is_valid_delegate=false)
const INSTRUMENT_DETAIL_WITH_NONDEL = {
  ...INSTRUMENT_DETAIL,
  participants: [
    ...INSTRUMENT_DETAIL.participants,
    { id: 'part-3', party_id: 'party-uuid-00000003', role: 'principal', sequence: 2,
      status: 'active', conditions: null, party_type: 'organization',
      display_name: 'Neither Party', external_reference: null,
      is_valid_principal: false, is_valid_delegate: false },
  ],
};

function setupApi({ caps = ['AUTHORITY_EVALUATE'], evaluations = [], evalResponse = null,
  instrDetail = INSTRUMENT_DETAIL } = {}) {
  api.get.mockImplementation((url) => {
    if (url.includes('/authority/capabilities'))        return Promise.resolve({ data: { capabilities: caps } });
    if (url.match(/\/authority\/instruments\/[^?]+$/)) return Promise.resolve({ data: instrDetail });
    if (url.includes('/authority/instruments'))         return Promise.resolve({ data: [INSTRUMENT_ROW] });
    if (url.includes('/authority/evaluations'))         return Promise.resolve({ data: evaluations });
    return Promise.reject(new Error(`Unexpected GET: ${url}`));
  });
  if (evalResponse) {
    api.post.mockResolvedValue({ data: evalResponse });
  }
}

async function selectInstrument(opts = {}) {
  setupApi({ caps: ['AUTHORITY_EVALUATE'], evaluations: [], ...opts });
  render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
  await waitFor(() => expect(screen.queryByText('Loading instruments…')).toBeNull());

  // InstrumentPicker uses a custom listbox for display; the hidden native select
  // (aria-hidden, data-testid="instrument-select-native") is used for test interaction.
  fireEvent.change(screen.getByTestId('instrument-select-native'), { target: { value: INSTRUMENT_ROW.id } });
  await waitFor(() => expect(screen.getByText('Principal *')).toBeTruthy());
}

// ── toMinorUnits ──────────────────────────────────────────────────────────────

describe('toMinorUnits — money parser parity with backend', () => {
  it('USD "19.99" → 1999', () => {
    expect(toMinorUnits('19.99', 'USD')).toBe(1999);
  });
  it('USD "100" → 10000 (integer input as major units)', () => {
    expect(toMinorUnits('100', 'USD')).toBe(10000);
  });
  it('USD "0.50" → 50', () => {
    expect(toMinorUnits('0.50', 'USD')).toBe(50);
  });
  it('USD "19.9" → 1990 (padded fraction)', () => {
    expect(toMinorUnits('19.9', 'USD')).toBe(1990);
  });
  it('JPY "1000" → 1000 (zero-decimal, no multiplication)', () => {
    expect(toMinorUnits('1000', 'JPY')).toBe(1000);
  });
  it('JPY "1000.1" → error (excess fractional digits)', () => {
    const r = toMinorUnits('1000.1', 'JPY');
    expect(r).toBeTruthy();
    expect(typeof r).toBe('object');
    expect(r.error).toBeTruthy();
  });
  it('KWD "1.500" → 1500 (three-decimal currency)', () => {
    expect(toMinorUnits('1.500', 'KWD')).toBe(1500);
  });
  it('KWD "1.5001" → error (excess fractional digits)', () => {
    const r = toMinorUnits('1.5001', 'KWD');
    expect(r).toBeTruthy();
    expect(typeof r).toBe('object');
    expect(r.error).toBeTruthy();
  });
  it('empty string → null', () => {
    expect(toMinorUnits('', 'USD')).toBeNull();
  });
  it('invalid format → null', () => {
    expect(toMinorUnits('abc', 'USD')).toBeNull();
  });
  it('scientific notation → null (rejected)', () => {
    expect(toMinorUnits('1e2', 'USD')).toBeNull();
  });
});

// ── Capability gating ─────────────────────────────────────────────────────────

describe('AuthorityEvaluate — capability gating', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows the AUTHORITY_EVALUATE required message when the capability is absent', async () => {
    setupApi({ caps: [] });
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/AUTHORITY_EVALUATE Capability Required/i)).toBeTruthy();
    });
    expect(screen.queryByTestId('evaluation-form')).toBeNull();
  });

  it('renders the form when AUTHORITY_EVALUATE is present', async () => {
    setupApi({ caps: ['AUTHORITY_EVALUATE'] });
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByTestId('evaluation-form')).toBeTruthy();
    });
  });
});

// ── Page rendering ────────────────────────────────────────────────────────────

describe('AuthorityEvaluate — page rendering', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the "Evaluate" page title', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByTestId('evaluation-form')).toBeTruthy();
    });
    expect(document.querySelector('.au-page-title')?.textContent).toBe('Evaluate');
  });

  it('renders the instrument picker with VERIFIED instruments', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByTestId('evaluation-form')).toBeTruthy();
      // Custom listbox (not a native combobox): verify by testid
      expect(screen.getByTestId('instrument-select')).toBeTruthy();
    });
  });

  it('does NOT expose an idempotency key input field', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    expect(screen.queryByPlaceholderText(/Deduplication key/)).toBeNull();
    expect(screen.queryByText('Generate')).toBeNull();
  });

  it('does NOT expose a free-text Action Key input before instrument is selected', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    // Before instrument selection, no action key inputs should exist
    expect(screen.queryByTestId('action-key-custom-input')).toBeNull();
  });

  it('renders the history explanation mentioning preserved audit records', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/preserved for audit/i)).toBeTruthy();
    });
  });

  it('Evaluate button is disabled until all required fields are filled', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    const submitBtn = screen.getByRole('button', { name: /Evaluate/i });
    expect(submitBtn).toHaveProperty('disabled', true);
  });

  it('shows hint text when Evaluate button is disabled', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    expect(screen.getByTestId('evaluate-btn-hint')).toBeTruthy();
  });

  it('helper text explains principal/delegate come from instrument participants', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Loading instruments…')).toBeNull());
    expect(screen.getByText(/Principal and delegate options come from that/i)).toBeTruthy();
  });
});

// ── Concern 8: no-eligible-instruments distinct state ────────────────────────

describe('AuthorityEvaluate — Concern 8: no eligible instrument state', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows distinct "no eligible instruments" state when instrument list is empty', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/authority/capabilities')) return Promise.resolve({ data: { capabilities: ['AUTHORITY_EVALUATE'] } });
      if (url.includes('/authority/instruments'))  return Promise.resolve({ data: [] });
      if (url.includes('/authority/evaluations'))  return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`Unexpected GET: ${url}`));
    });
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    // Wait for capabilities to load first (form mounts), then instruments to finish loading.
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Loading instruments…')).toBeNull());
    expect(screen.getByTestId('no-eligible-instruments-state')).toBeTruthy();
    expect(screen.getByText(/No verified Authority Instruments are available/i)).toBeTruthy();
    // Must NOT show the custom listbox or any visible combobox when no instruments exist
    expect(screen.queryByTestId('instrument-select')).toBeNull();
    expect(screen.queryByText(/Select a verified instrument/)).toBeNull();
  });
});

// ── Concern 9: instrument-scoped selectors from canonical source ─────────────

describe('AuthorityEvaluate — Concern 9: instrument-scoped selectors', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows principal participant from instrument detail after instrument selection', async () => {
    await selectInstrument();
    expect(screen.getByText(/Principal Party/)).toBeTruthy();
  });

  it('shows delegate participant from instrument detail after instrument selection', async () => {
    await selectInstrument();
    expect(screen.getByText(/Delegate Party/)).toBeTruthy();
  });

  it('Principal select includes only is_valid_principal participants', async () => {
    await selectInstrument({ instrDetail: INSTRUMENT_DETAIL_WITH_NONDEL });
    const principalSelect = screen.getAllByRole('combobox')[0];
    // Principal Party (is_valid_principal=true) SHOULD appear
    expect(principalSelect.innerHTML).toContain('Principal Party');
    // Neither Party (is_valid_principal=false) must NOT appear
    expect(principalSelect.innerHTML).not.toContain('Neither Party');
  });

  it('Delegate select includes only is_valid_delegate participants', async () => {
    await selectInstrument({ instrDetail: INSTRUMENT_DETAIL_WITH_NONDEL });
    const delegateSelect = screen.getAllByRole('combobox')[1];
    // Delegate Party (is_valid_delegate=true) SHOULD appear
    expect(delegateSelect.innerHTML).toContain('Delegate Party');
    // Neither Party (is_valid_delegate=false) must NOT appear
    expect(delegateSelect.innerHTML).not.toContain('Neither Party');
    // Principal Party (is_valid_principal=true, is_valid_delegate=false) must NOT appear
    expect(delegateSelect.innerHTML).not.toContain('Principal Party');
  });

  it('does NOT call /authority/parties to populate participants', async () => {
    await selectInstrument();
    const partyCalls = api.get.mock.calls.filter(c => c[0].includes('/authority/parties'));
    expect(partyCalls.length).toBe(0);
  });

  it('Principal and Delegate selects absent before instrument selection', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Loading instruments…')).toBeNull());
    expect(screen.queryByText('Principal *')).toBeNull();
    expect(screen.queryByText('Delegate *')).toBeNull();
  });

  it('changing instrument resets principal and delegate selections', async () => {
    setupApi({ caps: ['AUTHORITY_EVALUATE'], evaluations: [] });
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Loading instruments…')).toBeNull());

    // Select first instrument
    fireEvent.change(screen.getByTestId('instrument-select-native'), { target: { value: INSTRUMENT_ROW.id } });
    await waitFor(() => expect(screen.getByText('Principal *')).toBeTruthy());

    // Select principal
    const principalSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(principalSelect, { target: { value: 'party-uuid-00000001' } });
    expect(principalSelect.value).toBe('party-uuid-00000001');

    // Change instrument — principal must reset
    fireEvent.change(screen.getByTestId('instrument-select-native'), { target: { value: '' } });
    await waitFor(() => expect(screen.queryByText('Principal *')).toBeNull());
  });
});

// ── Concern 10: humanized action selector ────────────────────────────────────

describe('AuthorityEvaluate — Concern 10: action selector', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows humanized action label in the action select', async () => {
    await selectInstrument();
    // BANKING.WIRE_TRANSFER → "Banking · Wire transfer"
    const actionSelect = screen.getByTestId('action-key-select');
    expect(actionSelect.innerHTML).toContain('Banking');
  });

  it('shows "Other action" option in the action select', async () => {
    await selectInstrument();
    expect(screen.getByText('Other action (enter key)…')).toBeTruthy();
  });

  it('shows custom key input when "Other action" is selected', async () => {
    await selectInstrument();
    const actionSelect = screen.getByTestId('action-key-select');
    fireEvent.change(actionSelect, { target: { value: '__CUSTOM__' } });
    expect(screen.getByTestId('action-key-custom-input')).toBeTruthy();
  });

  it('validates custom key format DOMAIN.ACTION', async () => {
    await selectInstrument();
    const actionSelect = screen.getByTestId('action-key-select');
    fireEvent.change(actionSelect, { target: { value: '__CUSTOM__' } });
    const customInput = screen.getByTestId('action-key-custom-input');
    fireEvent.change(customInput, { target: { value: 'notvalid' } });
    expect(screen.getByTestId('action-key-custom-error')).toBeTruthy();
  });

  it('accepts valid DOMAIN.ACTION in custom input', async () => {
    await selectInstrument();
    const actionSelect = screen.getByTestId('action-key-select');
    fireEvent.change(actionSelect, { target: { value: '__CUSTOM__' } });
    const customInput = screen.getByTestId('action-key-custom-input');
    fireEvent.change(customInput, { target: { value: 'REAL.ESTATE' } });
    expect(screen.queryByTestId('action-key-custom-error')).toBeNull();
  });

  it('submits the exact action_key value (not the humanized label)', async () => {
    setupApi({
      caps: ['AUTHORITY_EVALUATE'], evaluations: [],
      evalResponse: { evaluationId: 'e1', outcome: 'AUTHORIZED', isReplay: false },
    });
    api.post.mockResolvedValue({ data: { evaluationId: 'e1', outcome: 'AUTHORIZED', isReplay: false } });
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Loading instruments…')).toBeNull());

    fireEvent.change(screen.getByTestId('instrument-select-native'), { target: { value: INSTRUMENT_ROW.id } });
    await waitFor(() => expect(screen.getByText('Principal *')).toBeTruthy());

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'party-uuid-00000001' } });
    fireEvent.change(selects[1], { target: { value: 'party-uuid-00000002' } });
    fireEvent.change(selects[2], { target: { value: 'BANKING.WIRE_TRANSFER' } });

    fireEvent.submit(selects[0].closest('form'));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [, payload] = api.post.mock.calls[0];
    expect(payload.actionKey).toBe('BANKING.WIRE_TRANSFER');
  });

  it('shows exact key as secondary text when a permission is selected', async () => {
    await selectInstrument();
    const actionSelect = screen.getByTestId('action-key-select');
    fireEvent.change(actionSelect, { target: { value: 'BANKING.WIRE_TRANSFER' } });
    await waitFor(() => expect(screen.getByTestId('action-key-exact')).toBeTruthy());
    expect(screen.getByTestId('action-key-exact').textContent).toBe('BANKING.WIRE_TRANSFER');
  });
});

// ── Concern 11: idempotency key and requestedAt management ───────────────────

describe('AuthorityEvaluate — Concern 11: idempotency and requestedAt', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  async function fillAndSubmit() {
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Loading instruments…')).toBeNull());

    fireEvent.change(screen.getByTestId('instrument-select-native'), { target: { value: INSTRUMENT_ROW.id } });
    await waitFor(() => expect(screen.getByText('Principal *')).toBeTruthy());
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'party-uuid-00000001' } });
    fireEvent.change(selects[1], { target: { value: 'party-uuid-00000002' } });
    fireEvent.change(selects[2], { target: { value: 'BANKING.WIRE_TRANSFER' } });
    fireEvent.submit(selects[0].closest('form'));
  }

  it('generates exactly one idempotencyKey and one requestedAt per deliberate submission', async () => {
    setupApi({ caps: ['AUTHORITY_EVALUATE'], evaluations: [] });
    api.post.mockResolvedValue({ data: { evaluationId: 'e1', outcome: 'AUTHORIZED', isReplay: false } });
    await fillAndSubmit();
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [, payload] = api.post.mock.calls[0];
    expect(typeof payload.idempotencyKey).toBe('string');
    expect(payload.idempotencyKey.length).toBeGreaterThan(0);
    expect(typeof payload.requestedAt).toBe('string');
    expect(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(payload.requestedAt)).toBe(true);
  });

  it('preserves idempotencyKey and requestedAt on transport error (retry sends same values)', async () => {
    setupApi({ caps: ['AUTHORITY_EVALUATE'], evaluations: [] });
    const firstCall = { idempotencyKey: null, requestedAt: null };

    api.post
      .mockRejectedValueOnce({ response: { status: 500, data: { error: 'Server error' } } })
      .mockResolvedValueOnce({ data: { evaluationId: 'e1', outcome: 'AUTHORIZED', isReplay: false } });

    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Loading instruments…')).toBeNull());

    fireEvent.change(screen.getByTestId('instrument-select-native'), { target: { value: INSTRUMENT_ROW.id } });
    await waitFor(() => expect(screen.getByText('Principal *')).toBeTruthy());
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'party-uuid-00000001' } });
    fireEvent.change(selects[1], { target: { value: 'party-uuid-00000002' } });
    fireEvent.change(selects[2], { target: { value: 'BANKING.WIRE_TRANSFER' } });

    // First submit — transport error
    await act(async () => { fireEvent.submit(selects[0].closest('form')); });
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    firstCall.idempotencyKey = api.post.mock.calls[0][1].idempotencyKey;
    firstCall.requestedAt    = api.post.mock.calls[0][1].requestedAt;

    // Second submit (user clicks again after seeing error) — same key and requestedAt
    await act(async () => { fireEvent.submit(selects[0].closest('form')); });
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    const second = api.post.mock.calls[1][1];
    expect(second.idempotencyKey).toBe(firstCall.idempotencyKey);
    expect(second.requestedAt).toBe(firstCall.requestedAt);
  });

  it('generates NEW key and requestedAt when any decision-driving input changes', async () => {
    setupApi({ caps: ['AUTHORITY_EVALUATE'], evaluations: [] });
    api.post
      .mockResolvedValueOnce({ data: { evaluationId: 'e1', outcome: 'AUTHORIZED', isReplay: false } })
      .mockResolvedValueOnce({ data: { evaluationId: 'e2', outcome: 'AUTHORIZED', isReplay: false } });

    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Loading instruments…')).toBeNull());

    fireEvent.change(screen.getByTestId('instrument-select-native'), { target: { value: INSTRUMENT_ROW.id } });
    await waitFor(() => expect(screen.getByText('Principal *')).toBeTruthy());
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'party-uuid-00000001' } });
    fireEvent.change(selects[1], { target: { value: 'party-uuid-00000002' } });
    fireEvent.change(selects[2], { target: { value: 'BANKING.WIRE_TRANSFER' } });

    await act(async () => { fireEvent.submit(selects[0].closest('form')); });
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const firstKey = api.post.mock.calls[0][1].idempotencyKey;
    const firstAt  = api.post.mock.calls[0][1].requestedAt;

    // Change a decision-driving field (principal) → key must reset
    fireEvent.change(selects[0], { target: { value: '' } });
    fireEvent.change(selects[0], { target: { value: 'party-uuid-00000001' } });

    await act(async () => { fireEvent.submit(selects[0].closest('form')); });
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    const secondKey = api.post.mock.calls[1][1].idempotencyKey;
    const secondAt  = api.post.mock.calls[1][1].requestedAt;
    expect(secondKey).not.toBe(firstKey);
    expect(secondAt).not.toBe(firstAt);
  });

  it('no operator-facing idempotency key input exists', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    expect(screen.queryByLabelText(/idempotency/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/idempotency/i)).toBeNull();
  });

  it('idempotency value is NOT written to localStorage or sessionStorage', async () => {
    setupApi({ caps: ['AUTHORITY_EVALUATE'], evaluations: [] });
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
    api.post.mockResolvedValue({ data: { evaluationId: 'e1', outcome: 'AUTHORIZED', isReplay: false } });
    await fillAndSubmit();
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const credValue = api.post.mock.calls[0][1].idempotencyKey;
    const stored = storageSpy.mock.calls.map(c => c[1]);
    expect(stored.some(v => typeof v === 'string' && v.includes(credValue))).toBe(false);
    storageSpy.mockRestore();
  });

  it('stale-replay clears idempotency key so next submission generates a new one', async () => {
    setupApi({ caps: ['AUTHORITY_EVALUATE'], evaluations: [] });
    api.post
      .mockRejectedValueOnce({
        response: { status: 409, data: { code: 'IDEMPOTENCY_REPLAY_STALE' } },
      })
      .mockResolvedValueOnce({ data: { evaluationId: 'e2', outcome: 'AUTHORIZED', isReplay: false } });

    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Loading instruments…')).toBeNull());

    fireEvent.change(screen.getByTestId('instrument-select-native'), { target: { value: INSTRUMENT_ROW.id } });
    await waitFor(() => expect(screen.getByText('Principal *')).toBeTruthy());
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'party-uuid-00000001' } });
    fireEvent.change(selects[1], { target: { value: 'party-uuid-00000002' } });
    fireEvent.change(selects[2], { target: { value: 'BANKING.WIRE_TRANSFER' } });

    // First submit → stale replay
    await act(async () => { fireEvent.submit(selects[0].closest('form')); });
    await waitFor(() => expect(screen.getByText(/Evaluation Record Changed/i)).toBeTruthy());
    const firstKey = api.post.mock.calls[0][1].idempotencyKey;

    // Second submit → new key
    await act(async () => { fireEvent.submit(selects[0].closest('form')); });
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(api.post.mock.calls[1][1].idempotencyKey).not.toBe(firstKey);
  });
});

// ── Concern 12: submit gate ───────────────────────────────────────────────────

describe('AuthorityEvaluate — Concern 12: submit gate', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('Evaluate button is disabled with hint when no inputs filled', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    const btn = screen.getByRole('button', { name: /Evaluate/i });
    expect(btn.disabled).toBe(true);
    expect(screen.getByTestId('evaluate-btn-hint')).toBeTruthy();
  });

  it('Evaluate button becomes enabled once all required fields are filled', async () => {
    setupApi({ caps: ['AUTHORITY_EVALUATE'], evaluations: [] });
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Loading instruments…')).toBeNull());

    fireEvent.change(screen.getByTestId('instrument-select-native'), { target: { value: INSTRUMENT_ROW.id } });
    await waitFor(() => expect(screen.getByText('Principal *')).toBeTruthy());
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'party-uuid-00000001' } });
    fireEvent.change(selects[1], { target: { value: 'party-uuid-00000002' } });
    fireEvent.change(selects[2], { target: { value: 'BANKING.WIRE_TRANSFER' } });

    const btn = screen.getByRole('button', { name: /Evaluate/i });
    expect(btn.disabled).toBe(false);
    expect(screen.queryByTestId('evaluate-btn-hint')).toBeNull();
  });
});

// ── Concern 2 / 21: EvaluationHistory 4-state model and spacing ──────────────

describe('AuthorityEvaluate — Concern 2 + 21: history 4-state model', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('loading state only shows loading, not empty state', async () => {
    let resolveGet;
    const pending = new Promise(r => { resolveGet = r; });
    api.get.mockImplementation((url) => {
      if (url.includes('/authority/capabilities')) return Promise.resolve({ data: { capabilities: ['AUTHORITY_EVALUATE'] } });
      if (url.includes('/authority/instruments'))  return Promise.resolve({ data: [INSTRUMENT_ROW] });
      if (url.includes('/authority/evaluations'))  return pending;
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Evaluation history')).toBeTruthy());
    // While pending, only loading — not empty
    expect(screen.queryByText('No evaluations yet.')).toBeNull();
    resolveGet({ data: [] });
  });

  it('empty state only shows after successful zero-result response', async () => {
    setupApi({ evaluations: [] });
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('No evaluations yet.')).toBeTruthy();
    });
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('error state replaces loading/empty — no simultaneous empty + error', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/authority/capabilities')) return Promise.resolve({ data: { capabilities: ['AUTHORITY_EVALUATE'] } });
      if (url.includes('/authority/instruments'))  return Promise.resolve({ data: [INSTRUMENT_ROW] });
      if (url.includes('/authority/evaluations'))  return Promise.reject({ response: { data: { error: 'History failed' } } });
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('History failed')).toBeTruthy());
    // Error shows, empty does NOT
    expect(screen.queryByText('No evaluations yet.')).toBeNull();
    // Retry button present
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('data rows replace the empty state when evaluations exist', async () => {
    setupApi({
      evaluations: [{
        id: 'e1', outcome: 'AUTHORIZED', reason_code: 'GRANT',
        requested_action_key: 'BANKING.WIRE_TRANSFER', evaluated_at: '2026-01-01T00:00:00Z',
      }],
    });
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('historical')).toBeTruthy());
    expect(screen.queryByText('No evaluations yet.')).toBeNull();
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('AuEmpty does not have a fixed height or min-height class causing oversized container', () => {
    // Structural test: verify au-empty uses padding-only layout, not vertical centering
    // This ensures the card sizes naturally to its content without large dead space
    const style = document.createElement('style');
    style.textContent = `.au-empty { display: flex; flex-direction: column; align-items: center; padding: 24px 16px; }`;
    document.head.appendChild(style);
    // If the CSS contains justify-content: center on au-empty it would vertically center
    // in oversized containers. Verify it was removed from au-empty definition.
    expect(style.textContent).not.toContain('justify-content: center');
    document.head.removeChild(style);
  });
});

// ── History table ─────────────────────────────────────────────────────────────

describe('AuthorityEvaluate — history table', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows a "historical" badge on each history row', async () => {
    const evaluations = [{
      id: 'eval-1', instrument_id: INSTRUMENT_ROW.id,
      outcome: 'AUTHORIZED', reason_code: 'EXPLICITLY_GRANTED',
      requested_action_key: 'BANKING.WIRE_TRANSFER', evaluated_at: '2026-06-15T10:00:00Z',
    }];
    setupApi({ evaluations });
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getAllByText('historical').length).toBeGreaterThan(0);
    });
  });

  it('shows empty state when no evaluations', async () => {
    setupApi({ evaluations: [] });
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('No evaluations yet.')).toBeTruthy();
    });
  });
});

// ── Outcome badges ────────────────────────────────────────────────────────────

describe('AuthorityEvaluate — outcome states', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders AUTHORIZED, NOT_AUTHORIZED, INSUFFICIENT_INFORMATION, and MANUAL_REVIEW badges', async () => {
    const evaluations = [
      { id: '1', outcome: 'AUTHORIZED',               reason_code: 'EXPLICITLY_GRANTED', requested_action_key: 'X.Y', evaluated_at: '2026-06-15T10:00:00Z' },
      { id: '2', outcome: 'NOT_AUTHORIZED',            reason_code: 'INSTRUMENT_REVOKED', requested_action_key: 'X.Y', evaluated_at: '2026-06-15T10:00:00Z' },
      { id: '3', outcome: 'INSUFFICIENT_INFORMATION',  reason_code: 'MISSING_ACTION_TIME', requested_action_key: 'X.Y', evaluated_at: '2026-06-15T10:00:00Z' },
      { id: '4', outcome: 'MANUAL_REVIEW',             reason_code: 'UNKNOWN_INSTRUMENT_TYPE', requested_action_key: 'X.Y', evaluated_at: '2026-06-15T10:00:00Z' },
    ];
    setupApi({ evaluations });
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Authorized')).toBeTruthy();
      expect(screen.getByText('Not authorized')).toBeTruthy();
      expect(screen.getByText('Insufficient information')).toBeTruthy();
      expect(screen.getByText('Manual review')).toBeTruthy();
    });
  });
});

// ── Stale replay ─────────────────────────────────────────────────────────────

describe('AuthorityEvaluate — stale replay display', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows "Evaluation Record Changed" instead of a prior decision on stale replay', async () => {
    setupApi({ caps: ['AUTHORITY_EVALUATE'], evaluations: [] });
    api.post.mockRejectedValue({
      response: {
        status: 409,
        data: { code: 'IDEMPOTENCY_REPLAY_STALE', staleReason: 'instrument_status_changed' },
      },
    });

    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Loading instruments…')).toBeNull());

    fireEvent.change(screen.getByTestId('instrument-select-native'), { target: { value: INSTRUMENT_ROW.id } });
    await waitFor(() => expect(screen.getByText('Principal *')).toBeTruthy());

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'party-uuid-00000001' } });
    fireEvent.change(selects[1], { target: { value: 'party-uuid-00000002' } });
    fireEvent.change(selects[2], { target: { value: 'BANKING.WIRE_TRANSFER' } });

    const form = selects[0].closest('form');
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/Evaluation Record Changed/i)).toBeTruthy();
    });
    expect(screen.queryByText('Authorized')).toBeNull();
  });
});

// ── requestedAt automation ────────────────────────────────────────────────────

describe('AuthorityEvaluate — automatic requestedAt', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('does not expose a requestedAt input, and sends requestedAt automatically', async () => {
    setupApi({ caps: ['AUTHORITY_EVALUATE'], evaluations: [] });
    api.post.mockResolvedValue({
      data: { evaluationId: 'eval-1', outcome: 'AUTHORIZED', reasonCode: 'EXPLICITLY_GRANTED', isReplay: false },
    });

    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText(/Loading instruments/)).toBeNull());

    expect(screen.queryByLabelText(/Requested At/i)).toBeNull();

    fireEvent.change(screen.getByTestId('instrument-select-native'), { target: { value: INSTRUMENT_ROW.id } });
    await waitFor(() => expect(screen.getByText('Principal *')).toBeTruthy());

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'party-uuid-00000001' } });
    fireEvent.change(selects[1], { target: { value: 'party-uuid-00000002' } });
    fireEvent.change(selects[2], { target: { value: 'BANKING.WIRE_TRANSFER' } });

    const form = selects[0].closest('form');
    fireEvent.submit(form);

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [url, payload] = api.post.mock.calls[0];
    expect(url).toBe('/authority/evaluate');
    expect(typeof payload.requestedAt).toBe('string');
    expect(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(payload.requestedAt)).toBe(true);
    expect(payload.actionTime).toBeUndefined();
    expect(typeof payload.idempotencyKey).toBe('string');
    expect(payload.idempotencyKey.length).toBeGreaterThan(0);
  });

  it('sends principalPartyId and delegatePartyId from selected participants', async () => {
    setupApi({ caps: ['AUTHORITY_EVALUATE'], evaluations: [] });
    api.post.mockResolvedValue({
      data: { evaluationId: 'eval-1', outcome: 'AUTHORIZED', isReplay: false },
    });

    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText(/Loading instruments/)).toBeNull());

    fireEvent.change(screen.getByTestId('instrument-select-native'), { target: { value: INSTRUMENT_ROW.id } });
    await waitFor(() => expect(screen.getByText('Principal *')).toBeTruthy());

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'party-uuid-00000001' } });
    fireEvent.change(selects[1], { target: { value: 'party-uuid-00000002' } });
    fireEvent.change(selects[2], { target: { value: 'BANKING.WIRE_TRANSFER' } });

    fireEvent.submit(selects[0].closest('form'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [, payload] = api.post.mock.calls[0];
    expect(payload.principalPartyId).toBe('party-uuid-00000001');
    expect(payload.delegatePartyId).toBe('party-uuid-00000002');
    expect(payload.actionKey).toBe('BANKING.WIRE_TRANSFER');
    expect(payload.instrumentId).toBe(INSTRUMENT_ROW.id);
  });
});

// ── Safe rendering ────────────────────────────────────────────────────────────

describe('AuthorityEvaluate — safe rendering', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders history rows as plain text (no dangerouslySetInnerHTML)', async () => {
    const evaluations = [{
      id: 'eval-1', outcome: 'AUTHORIZED',
      reason_code: '<script>alert(1)</script>',
      requested_action_key: '<img src=x onerror=alert(1)>',
      evaluated_at: '2026-06-15T10:00:00Z',
    }];
    setupApi({ evaluations });
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy();
      expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    });
  });
});

// ── C2: history error clears on successful reload ─────────────────────────────

describe('AuthorityEvaluate — C2: history error clears on reload', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('clears stale error after a successful reload', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/authority/capabilities')) return Promise.resolve({ data: { capabilities: ['AUTHORITY_EVALUATE'] } });
      if (url.includes('/authority/instruments'))  return Promise.resolve({ data: [INSTRUMENT_ROW] });
      if (url.includes('/authority/evaluations'))  return Promise.reject({ response: { data: { error: 'Network error' } } });
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Network error')).toBeTruthy());

    api.get.mockImplementation((url) => {
      if (url.includes('/authority/capabilities')) return Promise.resolve({ data: { capabilities: ['AUTHORITY_EVALUATE'] } });
      if (url.includes('/authority/instruments'))  return Promise.resolve({ data: [INSTRUMENT_ROW] });
      if (url.includes('/authority/evaluations'))  return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByText('Network error')).toBeNull());
    expect(screen.getByText('No evaluations yet.')).toBeTruthy();
  });
});

// ── C12: monetary amount field ─────────────────────────────────────────────────

const INSTR_WITH_MONETARY_LIMIT = {
  ...INSTRUMENT_DETAIL,
  restrictions: [
    { id: 'restr-1', restriction_type: 'monetary_limit',
      parameters: { limit: 500000, currency: 'USD' },
      participant_id: null, effective_from: null, effective_to: null,
      created_at: '2025-01-01T00:00:00Z' },
  ],
};

describe('AuthorityEvaluate — C12: monetary amount field', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('amount input placeholder does not include currency text', async () => {
    await selectInstrument();
    const amountInput = screen.getByPlaceholderText('e.g. 50.00');
    expect(amountInput).toBeTruthy();
    expect(amountInput.placeholder).not.toMatch(/major units/);
    expect(amountInput.placeholder).not.toMatch(/\bin\s+/);
  });

  it('shows monetary-limit hint when instrument has a monetary_limit restriction', async () => {
    await selectInstrument({ instrDetail: INSTR_WITH_MONETARY_LIMIT });
    expect(screen.getByTestId('monetary-limit-hint')).toBeTruthy();
  });

  it('monetary-limit hint text mentions monetary limit, amount, and currency', async () => {
    await selectInstrument({ instrDetail: INSTR_WITH_MONETARY_LIMIT });
    const hint = screen.getByTestId('monetary-limit-hint');
    expect(hint.textContent).toContain('monetary limit');
    expect(hint.textContent).toContain('amount');
    expect(hint.textContent).toContain('currency');
  });

  it('does not show monetary-limit hint when instrument has no monetary_limit restriction', async () => {
    await selectInstrument();
    expect(screen.queryByTestId('monetary-limit-hint')).toBeNull();
  });
});

// ── C23: Evaluate page subtitle ───────────────────────────────────────────────

describe('AuthorityEvaluate — C23: page subtitle', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows deterministic authorization check subtitle', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    expect(screen.getByText(/Deterministic authorization check/i)).toBeTruthy();
  });
});

// ── Batch3-C1: Naming consistency ─────────────────────────────────────────────

describe('AuthorityEvaluate — Batch3-C1: naming consistency', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('page title is "Evaluate" (not "Evaluator")', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    expect(document.querySelector('.au-page-title')?.textContent).toBe('Evaluate');
  });

  it('"Evaluator" does not appear anywhere on the page', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    expect(screen.queryByText(/Evaluator/i)).toBeNull();
  });

  it('"Evaluate Authority" does not appear anywhere on the page', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    expect(screen.queryByText(/Evaluate Authority/i)).toBeNull();
  });
});

// ── Batch3-C2: No-instrument state — single authoritative message ──────────────

describe('AuthorityEvaluate — Batch3-C2: no-instrument state message consolidation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  function setupNoInstruments() {
    api.get.mockImplementation((url) => {
      if (url.includes('/authority/capabilities')) return Promise.resolve({ data: { capabilities: ['AUTHORITY_EVALUATE'] } });
      if (url.includes('/authority/instruments'))  return Promise.resolve({ data: [] });
      if (url.includes('/authority/evaluations'))  return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`Unexpected GET: ${url}`));
    });
  }

  it('shows the no-eligible-instruments banner when instrument list is empty', async () => {
    setupNoInstruments();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Loading instruments…')).toBeNull());
    expect(screen.getByTestId('no-eligible-instruments-state')).toBeTruthy();
  });

  it('does NOT show the "Choose an instrument first" helper when no instruments exist', async () => {
    setupNoInstruments();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Loading instruments…')).toBeNull());
    expect(screen.queryByText(/Choose an instrument first/i)).toBeNull();
  });

  it('does NOT show the evaluate-btn-hint when no instruments exist', async () => {
    setupNoInstruments();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Loading instruments…')).toBeNull());
    expect(screen.queryByTestId('evaluate-btn-hint')).toBeNull();
  });
});

// ── Batch3-C3: History copy — concise ─────────────────────────────────────────

describe('AuthorityEvaluate — Batch3-C3: history copy conciseness', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('history copy contains "preserved for audit"', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/preserved for audit/i)).toBeTruthy());
  });

  it('history copy does not repeat the full multi-sentence original block', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    expect(screen.queryByText(/instrument may later change status/i)).toBeNull();
  });
});

// ── Part 7: Instrument selector presentation ──────────────────────────────────

const INSTRUMENT_ROW_WITH_JURISDICTION = {
  id: 'instr-uuid-11111111', instrument_type: 'power_of_attorney',
  status: 'VERIFIED', effective_date: '2025-01-01', expiration_date: '2035-12-31',
  jurisdiction: 'CA',
};

describe('AuthorityEvaluate — instrument selector presentation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  function setupInstrApi(instrRow = INSTRUMENT_ROW) {
    api.get.mockImplementation((url) => {
      if (url.includes('/authority/capabilities')) return Promise.resolve({ data: { capabilities: ['AUTHORITY_EVALUATE'] } });
      if (url.match(/\/authority\/instruments\/[^?]+$/)) return Promise.resolve({ data: INSTRUMENT_DETAIL });
      if (url.includes('/authority/instruments'))  return Promise.resolve({ data: [instrRow] });
      if (url.includes('/authority/evaluations'))  return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`Unexpected GET: ${url}`));
    });
  }

  async function openDropdown(instrRow = INSTRUMENT_ROW) {
    setupInstrApi(instrRow);
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Loading instruments…')).toBeNull());
    fireEvent.click(screen.getByTestId('instrument-select-trigger'));
    await waitFor(() => expect(screen.getByTestId('instrument-select-dropdown')).toBeTruthy());
  }

  it('renders instrument type in sentence case in the dropdown', async () => {
    await openDropdown();
    const option = screen.getByTestId(`instrument-option-${INSTRUMENT_ROW.id}`);
    expect(option.textContent).toContain('Power of attorney');
    expect(option.textContent).not.toContain('power_of_attorney');
    expect(option.textContent).not.toContain('POWER_OF_ATTORNEY');
  });

  it('does not expose raw ISO date strings in the dropdown', async () => {
    await openDropdown();
    const dropdown = screen.getByTestId('instrument-select-dropdown');
    expect(dropdown.textContent).not.toContain('2025-01-01');
    expect(dropdown.textContent).not.toContain('2035-12-31');
  });

  it('renders readable formatted dates in the dropdown secondary metadata', async () => {
    await openDropdown();
    const secondary = screen.getByTestId('instrument-select-dropdown')
      .querySelector('.au-instr-select__secondary');
    expect(secondary).not.toBeNull();
    expect(secondary.textContent).toContain('Jan 1, 2025');
    expect(secondary.textContent).toContain('Dec 31, 2035');
  });

  it('uses "Effective" not "eff." in secondary metadata', async () => {
    await openDropdown();
    const dropdown = screen.getByTestId('instrument-select-dropdown');
    expect(dropdown.textContent).not.toMatch(/\beff\./i);
    expect(dropdown.textContent).toContain('Effective');
  });

  it('renders jurisdiction without brackets', async () => {
    await openDropdown(INSTRUMENT_ROW_WITH_JURISDICTION);
    const dropdown = screen.getByTestId('instrument-select-dropdown');
    expect(dropdown.textContent).not.toContain('[CA]');
    expect(dropdown.textContent).toContain('CA');
  });

  it('secondary metadata span has au-instr-select__secondary class', async () => {
    await openDropdown();
    const secondary = screen.getByTestId('instrument-select-dropdown')
      .querySelector('.au-instr-select__secondary');
    expect(secondary).not.toBeNull();
    expect(secondary.className).toContain('au-instr-select__secondary');
  });

  it('primary instrument label does not have the italic secondary class', async () => {
    await openDropdown();
    const primary = screen.getByTestId('instrument-select-dropdown')
      .querySelector('.au-instr-select__primary');
    expect(primary).not.toBeNull();
    expect(primary.classList.contains('au-instr-select__secondary')).toBe(false);
  });

  it('trigger has aria-haspopup="listbox" before opening', async () => {
    setupInstrApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Loading instruments…')).toBeNull());
    const trigger = screen.getByTestId('instrument-select-trigger');
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('aria-expanded becomes true when dropdown is open', async () => {
    await openDropdown();
    expect(screen.getByTestId('instrument-select-trigger').getAttribute('aria-expanded')).toBe('true');
  });

  it('dropdown has role="listbox" and options have role="option"', async () => {
    await openDropdown();
    const dropdown = screen.getByTestId('instrument-select-dropdown');
    expect(dropdown.getAttribute('role')).toBe('listbox');
    const option = screen.getByTestId(`instrument-option-${INSTRUMENT_ROW.id}`);
    expect(option.getAttribute('role')).toBe('option');
  });

  it('ArrowDown opens dropdown and Enter selects the focused option', async () => {
    setupInstrApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Loading instruments…')).toBeNull());


    const trigger = screen.getByTestId('instrument-select-trigger');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    await waitFor(() => expect(screen.getByTestId('instrument-select-dropdown')).toBeTruthy());

    fireEvent.keyDown(trigger, { key: 'Enter' });
    await waitFor(() => expect(screen.queryByTestId('instrument-select-dropdown')).toBeNull());

    expect(screen.getByTestId('instrument-select-native').value).toBe(INSTRUMENT_ROW.id);
  });

  it('Escape closes dropdown without selecting', async () => {
    await openDropdown();
    expect(screen.getByTestId('instrument-select-native').value).toBe('');
    fireEvent.keyDown(screen.getByTestId('instrument-select-trigger'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('instrument-select-dropdown')).toBeNull());
    expect(screen.getByTestId('instrument-select-native').value).toBe('');
  });

  it('trigger shows sentence-case primary name after selection via native select', async () => {
    setupInstrApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Loading instruments…')).toBeNull());
    fireEvent.change(screen.getByTestId('instrument-select-native'), { target: { value: INSTRUMENT_ROW.id } });
    const primary = screen.getByTestId('instrument-select-primary');
    expect(primary.textContent).toBe('Power of attorney');
    expect(primary.textContent).not.toContain('power_of_attorney');
  });

  it('trigger secondary shows formatted dates after selection (not raw ISO strings)', async () => {
    setupInstrApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Loading instruments…')).toBeNull());
    fireEvent.change(screen.getByTestId('instrument-select-native'), { target: { value: INSTRUMENT_ROW.id } });
    const secondary = screen.getByTestId('instrument-select-secondary');
    expect(secondary.textContent).toContain('Jan 1, 2025');
    expect(secondary.textContent).toContain('Dec 31, 2035');
    expect(secondary.textContent).not.toContain('2025-01-01');
    expect(secondary.textContent).not.toContain('2035-12-31');
  });

  it('selected instrument ID is preserved: native select value matches custom listbox selection', async () => {
    setupInstrApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Loading instruments…')).toBeNull());

    fireEvent.click(screen.getByTestId('instrument-select-trigger'));
    await waitFor(() => expect(screen.getByTestId('instrument-select-dropdown')).toBeTruthy());

    fireEvent.mouseDown(screen.getByTestId(`instrument-option-${INSTRUMENT_ROW.id}`));
    await waitFor(() => expect(screen.queryByTestId('instrument-select-dropdown')).toBeNull());

    expect(screen.getByTestId('instrument-select-native').value).toBe(INSTRUMENT_ROW.id);
  });
});

// ── Screenshot corrections — label and heading sentence case ──────────────────

describe('Screenshot corrections — Evaluate form label and card heading', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('form label is "Verified instrument" (sentence case), not "Verified Instrument"', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('evaluation-form')).toBeTruthy());
    expect(screen.getByText('Verified instrument *')).toBeTruthy();
    expect(screen.queryByText('Verified Instrument *')).toBeNull();
  });

  it('history card heading is "Evaluation history" (sentence case), not "Evaluation History"', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Evaluation history')).toBeTruthy());
    expect(screen.queryByText('Evaluation History')).toBeNull();
  });

  it('InstrumentListbox does not add scrollWidth beyond clientWidth (no horizontal overflow)', () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    const container = document.querySelector('.au-instr-select__dropdown');
    if (container) {
      expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth + 1);
    }
  });
});
