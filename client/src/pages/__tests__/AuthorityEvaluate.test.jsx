import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

// Instrument detail (returned by GET /authority/instruments/:id)
const INSTRUMENT_DETAIL = {
  ...INSTRUMENT_ROW,
  participants: [
    { id: 'part-1', party_id: 'party-uuid-00000001', role: 'principal', sequence: 1,
      status: 'active', conditions: null, party_type: 'person',
      display_name: 'Principal Party', external_reference: null },
    { id: 'part-2', party_id: 'party-uuid-00000002', role: 'agent', sequence: 1,
      status: 'active', conditions: null, party_type: 'person',
      display_name: 'Delegate Party', external_reference: null },
  ],
  permissions: [
    { id: 'perm-1', action_key: 'BANKING.WIRE_TRANSFER', grant_type: 'granted',
      participant_id: 'part-2', created_at: '2025-01-01T00:00:00Z' },
  ],
};

function setupApi({ caps = ['AUTHORITY_EVALUATE'], evaluations = [], evalResponse = null } = {}) {
  api.get.mockImplementation((url) => {
    if (url.includes('/authority/capabilities'))        return Promise.resolve({ data: { capabilities: caps } });
    if (url.match(/\/authority\/instruments\/[^?]+$/)) return Promise.resolve({ data: INSTRUMENT_DETAIL });
    if (url.includes('/authority/instruments'))         return Promise.resolve({ data: [INSTRUMENT_ROW] });
    if (url.includes('/authority/evaluations'))         return Promise.resolve({ data: evaluations });
    return Promise.reject(new Error(`Unexpected GET: ${url}`));
  });
  if (evalResponse) {
    api.post.mockResolvedValue({ data: evalResponse });
  }
}

// ── toMinorUnits (Part 9) ────────────────────────────────────────────────────

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

// ── Capability gating ────────────────────────────────────────────────────────

describe('AuthorityEvaluate — capability gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the AUTHORITY_EVALUATE required message when the capability is absent', async () => {
    setupApi({ caps: [] });

    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText(/AUTHORITY_EVALUATE Capability Required/i)).toBeTruthy();
    });
    expect(screen.queryByText('Evaluate Authority')).toBeNull();
  });

  it('renders the form when AUTHORITY_EVALUATE is present', async () => {
    setupApi({ caps: ['AUTHORITY_EVALUATE'] });

    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText('Evaluate Authority')).toBeTruthy();
    });
  });
});

// ── Page rendering ────────────────────────────────────────────────────────────

describe('AuthorityEvaluate — page rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the "Evaluator" page title', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Evaluator')).toBeTruthy();
    });
  });

  it('renders the instrument picker with VERIFIED instruments', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Evaluate Authority')).toBeTruthy();
      // Verified instrument picker is present
      const select = screen.getAllByRole('combobox')[0];
      expect(select).toBeTruthy();
    });
  });

  it('does NOT expose an idempotency key input field', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Evaluate Authority')).toBeTruthy());
    expect(screen.queryByPlaceholderText(/Deduplication key/)).toBeNull();
    expect(screen.queryByText('Generate')).toBeNull();
  });

  it('does NOT expose a free-text Action Key input', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Evaluate Authority')).toBeTruthy());
    expect(screen.queryByPlaceholderText(/BANKING\.WIRE_TRANSFER/)).toBeNull();
  });

  it('renders the disclaimer on the history section', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/records only/)).toBeTruthy();
    });
  });

  it('Evaluate button is disabled until all required fields are filled', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Evaluate Authority')).toBeTruthy());

    const submitBtn = screen.getByRole('button', { name: /Evaluate/i });
    // Initially disabled — no fields filled
    expect(submitBtn).toHaveProperty('disabled', true);
  });
});

// ── Instrument-scoped participant + action selectors ─────────────────────────

describe('AuthorityEvaluate — instrument-scoped selectors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function selectInstrument() {
    setupApi({ caps: ['AUTHORITY_EVALUATE'], evaluations: [] });
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Evaluate Authority')).toBeTruthy());
    // Wait for instrument picker to finish loading
    await waitFor(() => expect(screen.queryByText('Loading instruments…')).toBeNull());

    const instrSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(instrSelect, { target: { value: INSTRUMENT_ROW.id } });
    // Wait for instrument detail to load (principal/delegate/action selects appear)
    await waitFor(() => expect(screen.getByText('Principal *')).toBeTruthy());
  }

  it('shows principal participant from instrument detail after instrument selection', async () => {
    await selectInstrument();
    expect(screen.getByText(/Principal Party/)).toBeTruthy();
  });

  it('shows delegate participant from instrument detail after instrument selection', async () => {
    await selectInstrument();
    expect(screen.getByText(/Delegate Party/)).toBeTruthy();
  });

  it('shows action key from instrument permissions as a dropdown option', async () => {
    await selectInstrument();
    expect(screen.getByText('BANKING.WIRE_TRANSFER')).toBeTruthy();
  });

  it('does NOT show the party list endpoint for participants', async () => {
    await selectInstrument();
    // /authority/parties should never be called
    const partyCalls = api.get.mock.calls.filter(c => c[0].includes('/authority/parties'));
    expect(partyCalls.length).toBe(0);
  });
});

// ── Historical badge on history rows ─────────────────────────────────────────

describe('AuthorityEvaluate — history table', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a "historical" badge on each history row', async () => {
    const evaluations = [
      {
        id: 'eval-1',
        instrument_id: INSTRUMENT_ROW.id,
        outcome: 'AUTHORIZED',
        reason_code: 'EXPLICITLY_GRANTED',
        requested_action_key: 'BANKING.WIRE_TRANSFER',
        evaluated_at: '2026-06-15T10:00:00Z',
      },
    ];
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

// ── Outcome badges rendering ─────────────────────────────────────────────────

describe('AuthorityEvaluate — outcome states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders AUTHORIZED, NOT_AUTHORIZED, INSUFFICIENT_INFORMATION, and MANUAL_REVIEW badges', async () => {
    const evaluations = [
      { id: '1', outcome: 'AUTHORIZED',              reason_code: 'EXPLICITLY_GRANTED',       requested_action_key: 'X.Y', evaluated_at: '2026-06-15T10:00:00Z' },
      { id: '2', outcome: 'NOT_AUTHORIZED',          reason_code: 'INSTRUMENT_REVOKED',       requested_action_key: 'X.Y', evaluated_at: '2026-06-15T10:00:00Z' },
      { id: '3', outcome: 'INSUFFICIENT_INFORMATION', reason_code: 'MISSING_ACTION_TIME',     requested_action_key: 'X.Y', evaluated_at: '2026-06-15T10:00:00Z' },
      { id: '4', outcome: 'MANUAL_REVIEW',           reason_code: 'UNKNOWN_INSTRUMENT_TYPE',  requested_action_key: 'X.Y', evaluated_at: '2026-06-15T10:00:00Z' },
    ];
    setupApi({ evaluations });

    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Authorized')).toBeTruthy();
      expect(screen.getByText('Not Authorized')).toBeTruthy();
      expect(screen.getByText('Insufficient Information')).toBeTruthy();
      expect(screen.getByText('Manual Review Required')).toBeTruthy();
    });
  });
});

// ── Stale replay display ─────────────────────────────────────────────────────

describe('AuthorityEvaluate — stale replay display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "Evaluation Record Changed" instead of a prior decision on stale replay', async () => {
    setupApi({ caps: ['AUTHORITY_EVALUATE'], evaluations: [] });

    api.post.mockRejectedValue({
      response: {
        status: 409,
        data: { code: 'IDEMPOTENCY_REPLAY_STALE', staleReason: 'instrument_status_changed' },
      },
    });

    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Evaluate Authority')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Loading instruments…')).toBeNull());

    // Select instrument (triggers detail load)
    const instrSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(instrSelect, { target: { value: INSTRUMENT_ROW.id } });
    await waitFor(() => expect(screen.getByText('Principal *')).toBeTruthy());

    // Fill principal, delegate, action key
    const selects = screen.getAllByRole('combobox');
    // selects: [instrument, principal, delegate, action]
    fireEvent.change(selects[1], { target: { value: 'party-uuid-00000001' } });
    fireEvent.change(selects[2], { target: { value: 'party-uuid-00000002' } });
    fireEvent.change(selects[3], { target: { value: 'BANKING.WIRE_TRANSFER' } });

    const form = selects[0].closest('form');
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/Evaluation Record Changed/i)).toBeTruthy();
    });
    expect(screen.queryByText('Authorized')).toBeNull();
  });
});

// ── requestedAt is set automatically at submission ───────────────────────────

describe('AuthorityEvaluate — automatic requestedAt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not expose a requestedAt input, and sends requestedAt automatically', async () => {
    setupApi({ caps: ['AUTHORITY_EVALUATE'], evaluations: [] });
    api.post.mockResolvedValue({
      data: {
        evaluationId: 'eval-1',
        outcome: 'AUTHORIZED',
        reasonCode: 'EXPLICITLY_GRANTED',
        isReplay: false,
      },
    });

    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Evaluate Authority')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText(/Loading instruments/)).toBeNull());

    // No labeled "requestedAt" input in the form
    expect(screen.queryByLabelText(/Requested At/i)).toBeNull();

    // Select instrument → loads detail
    const instrSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(instrSelect, { target: { value: INSTRUMENT_ROW.id } });
    await waitFor(() => expect(screen.getByText('Principal *')).toBeTruthy());

    // Fill principal, delegate, action key
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: 'party-uuid-00000001' } });
    fireEvent.change(selects[2], { target: { value: 'party-uuid-00000002' } });
    fireEvent.change(selects[3], { target: { value: 'BANKING.WIRE_TRANSFER' } });

    const form = selects[0].closest('form');
    fireEvent.submit(form);

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [url, payload] = api.post.mock.calls[0];
    expect(url).toBe('/authority/evaluate');
    expect(typeof payload.requestedAt).toBe('string');
    // ISO-8601 with Z
    expect(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(payload.requestedAt)).toBe(true);
    // actionTime must NOT be present
    expect(payload.actionTime).toBeUndefined();
    // idempotencyKey must be auto-generated (present, non-empty, not user-supplied)
    expect(typeof payload.idempotencyKey).toBe('string');
    expect(payload.idempotencyKey.length).toBeGreaterThan(0);
  });

  it('sends principalPartyId and delegatePartyId from selected participants', async () => {
    setupApi({ caps: ['AUTHORITY_EVALUATE'], evaluations: [] });
    api.post.mockResolvedValue({
      data: { evaluationId: 'eval-1', outcome: 'AUTHORIZED', isReplay: false },
    });

    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Evaluate Authority')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText(/Loading instruments/)).toBeNull());

    const instrSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(instrSelect, { target: { value: INSTRUMENT_ROW.id } });
    await waitFor(() => expect(screen.getByText('Principal *')).toBeTruthy());

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: 'party-uuid-00000001' } });
    fireEvent.change(selects[2], { target: { value: 'party-uuid-00000002' } });
    fireEvent.change(selects[3], { target: { value: 'BANKING.WIRE_TRANSFER' } });

    fireEvent.submit(selects[0].closest('form'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [, payload] = api.post.mock.calls[0];
    expect(payload.principalPartyId).toBe('party-uuid-00000001');
    expect(payload.delegatePartyId).toBe('party-uuid-00000002');
    expect(payload.actionKey).toBe('BANKING.WIRE_TRANSFER');
    expect(payload.instrumentId).toBe(INSTRUMENT_ROW.id);
  });
});

// ── Plain-text rendering (no dangerous HTML injection) ───────────────────────

describe('AuthorityEvaluate — safe rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders history rows as plain text (no dangerouslySetInnerHTML)', async () => {
    const evaluations = [
      {
        id: 'eval-1', outcome: 'AUTHORIZED',
        reason_code: '<script>alert(1)</script>',
        requested_action_key: '<img src=x onerror=alert(1)>',
        evaluated_at: '2026-06-15T10:00:00Z',
      },
    ];
    setupApi({ evaluations });

    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy();
      expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    });
  });
});
