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

const PARTY_PRINCIPAL = {
  id: 'party-uuid-00000001', display_name: 'Principal Party', party_type: 'person', status: 'active',
};

const PARTY_DELEGATE = {
  id: 'party-uuid-00000002', display_name: 'Delegate Party', party_type: 'person', status: 'active',
};

function setupApi({ caps = ['AUTHORITY_EVALUATE'], evaluations = [], evalResponse = null } = {}) {
  api.get.mockImplementation((url) => {
    if (url.includes('/authority/capabilities')) return Promise.resolve({ data: { capabilities: caps } });
    if (url.includes('/authority/instruments'))  return Promise.resolve({ data: [INSTRUMENT_ROW] });
    if (url.includes('/authority/parties'))      return Promise.resolve({ data: [PARTY_PRINCIPAL, PARTY_DELEGATE] });
    if (url.includes('/authority/evaluations'))  return Promise.resolve({ data: evaluations });
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

// ── Capability gating (Part 4) ───────────────────────────────────────────────

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

// ── Page rendering (branding, disclaimer, labels) ─────────────────────────────

describe('AuthorityEvaluate — page rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the "Authority Evaluator" title', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Authority Evaluator')).toBeTruthy();
    });
  });

  it('renders the Delegate Party picker label', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/Delegate Party/)).toBeTruthy();
    });
  });

  it('renders the Generate button for idempotency key', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Generate')).toBeTruthy();
    });
  });

  it('renders the Action Key input', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/BANKING\.WIRE_TRANSFER/)).toBeTruthy();
    });
  });

  it('renders the disclaimer on the history section', async () => {
    setupApi();
    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/not a legal determination/)).toBeTruthy();
    });
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

    // 409 with IDEMPOTENCY_REPLAY_STALE
    api.post.mockRejectedValue({
      response: {
        status: 409,
        data: { code: 'IDEMPOTENCY_REPLAY_STALE', staleReason: 'instrument_status_changed' },
      },
    });

    render(<MemoryRouter><AuthorityEvaluate /></MemoryRouter>);
    // Wait for the form to appear
    await waitFor(() => expect(screen.getByText('Evaluate Authority')).toBeTruthy());
    // Wait for pickers to load their data
    await waitFor(() => expect(screen.queryByText(/Loading instruments/)).toBeNull());
    await waitFor(() => expect(screen.queryByText(/Loading parties/)).toBeNull());

    // Directly invoke the form's submit path by simulating the exact rejected call
    api.post.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { code: 'IDEMPOTENCY_REPLAY_STALE', staleReason: 'instrument_status_changed' },
      },
    });

    // Fill required fields (comboboxes are: 0=instrument, 1=principal, 2=delegate)
    const inputs   = screen.getAllByRole('combobox');
    fireEvent.change(inputs[0], { target: { value: INSTRUMENT_ROW.id } });
    fireEvent.change(inputs[1], { target: { value: PARTY_PRINCIPAL.id } });
    fireEvent.change(inputs[2], { target: { value: PARTY_DELEGATE.id } });
    const actionKeyInput = screen.getByPlaceholderText(/BANKING\.WIRE_TRANSFER/);
    fireEvent.change(actionKeyInput, { target: { value: 'BANKING.WIRE_TRANSFER' } });
    const idKeyInput = screen.getByPlaceholderText(/Deduplication key/);
    fireEvent.change(idKeyInput, { target: { value: 'test-key-001' } });

    // Submit (form.submit bypasses HTML5 required validation in jsdom)
    const form = actionKeyInput.closest('form');
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/Evaluation Record Changed/i)).toBeTruthy();
    });
    // Should NOT show any prior outcome badge
    expect(screen.queryByText('Authorized')).toBeNull();
  });
});

// ── requestedAt is set automatically at submission (Part 8) ──────────────────

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
    await waitFor(() => expect(screen.queryByText(/Loading parties/)).toBeNull());

    // No labeled "requestedAt" input in the form
    expect(screen.queryByLabelText(/Requested At/i)).toBeNull();

    // Submit a complete request
    const inputs = screen.getAllByRole('combobox');
    fireEvent.change(inputs[0], { target: { value: INSTRUMENT_ROW.id } });
    fireEvent.change(inputs[1], { target: { value: PARTY_PRINCIPAL.id } });
    fireEvent.change(inputs[2], { target: { value: PARTY_DELEGATE.id } });
    const actionKeyInput = screen.getByPlaceholderText(/BANKING\.WIRE_TRANSFER/);
    fireEvent.change(actionKeyInput, { target: { value: 'BANKING.WIRE_TRANSFER' } });
    const idKeyInput = screen.getByPlaceholderText(/Deduplication key/);
    fireEvent.change(idKeyInput, { target: { value: 'auto-req-key' } });

    const form = actionKeyInput.closest('form');
    fireEvent.submit(form);

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [url, payload] = api.post.mock.calls[0];
    expect(url).toBe('/authority/evaluate');
    expect(typeof payload.requestedAt).toBe('string');
    // ISO-8601 with Z
    expect(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(payload.requestedAt)).toBe(true);
    // actionTime must NOT be present
    expect(payload.actionTime).toBeUndefined();
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
