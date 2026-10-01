import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api';
import { AuLoading, AuError, AuEmpty, fmtDateTime } from './AuthorityShared';

// ── Currency exponent map (ISO 4217) ─────────────────────────────────────────
// Correction 8: no blind ×100. Use known exponent for each currency.
// Expanded to match the backend map more closely.

const CURRENCY_EXPONENTS = {
  // Two-decimal
  USD: 2, EUR: 2, GBP: 2, CAD: 2, AUD: 2, NZD: 2,
  CHF: 2, SEK: 2, NOK: 2, DKK: 2, SGD: 2, HKD: 2,
  MXN: 2, BRL: 2, ZAR: 2, INR: 2, CNY: 2,
  AED: 2, SAR: 2, QAR: 2, MYR: 2, THB: 2, PHP: 2,
  IDR: 2, PLN: 2, CZK: 2, HUF: 2, RON: 2, TRY: 2,
  ILS: 2, EGP: 2, MAD: 2, NGN: 2, GHS: 2, KES: 2,
  COP: 2, PEN: 2, ARS: 2, CLP: 2,
  // Zero-decimal
  JPY: 0, KRW: 0, VND: 0, PYG: 0, UGX: 0, RWF: 0,
  GNF: 0, XOF: 0, XAF: 0, XPF: 0, BIF: 0, DJF: 0,
  KMF: 0, MGA: 0,
  // Three-decimal
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  // Four-decimal
  CLF: 4, UYW: 4,
};

function currencyExponent(code) {
  if (!code) return 2;
  return CURRENCY_EXPONENTS[String(code).toUpperCase()] !== undefined
    ? CURRENCY_EXPONENTS[String(code).toUpperCase()]
    : 2;
}

/**
 * Convert a display amount string (e.g. "10.00") to minor units (integer).
 * Uses the same integer-only algorithm as the backend authorityCurrencyExponents.
 *
 * Returns:
 *   integer minor units on success
 *   null if the display is empty
 *   { error: string } for invalid format or excess fractional digits
 */
export function toMinorUnits(display, currencyCode) {
  if (display === '' || display === null || display === undefined) return null;
  const exp = currencyExponent(currencyCode);
  const str = String(display).trim();
  // Only plain decimal notation is allowed — reject scientific notation, etc.
  if (!/^-?\d+(\.\d+)?$/.test(str)) return null;
  const dotIdx = str.indexOf('.');
  if (dotIdx === -1) {
    const val = parseInt(str, 10);
    if (isNaN(val)) return null;
    const factor = Math.pow(10, exp);
    return val * factor;
  }
  const fractionalPart = str.slice(dotIdx + 1);
  if (fractionalPart.length > exp) {
    return { error: `${String(currencyCode || '').toUpperCase() || 'This currency'} allows only ${exp} decimal places.` };
  }
  const paddedFraction = fractionalPart.padEnd(exp, '0');
  const negative       = str.startsWith('-');
  const intAbs         = parseInt(str.slice(0, dotIdx).replace('-', '') || '0', 10);
  const fracVal        = parseInt(paddedFraction || '0', 10);
  const result         = intAbs * Math.pow(10, exp) + fracVal;
  return negative ? -result : result;
}

function fromMinorUnits(minor, currencyCode) {
  if (minor == null) return '—';
  const exp    = currencyExponent(currencyCode);
  const factor = Math.pow(10, exp);
  return (minor / factor).toFixed(exp);
}

// ── Outcome display helpers ───────────────────────────────────────────────────
// Correction 14: show all four outcome states with clear labeling

const OUTCOME_META = {
  AUTHORIZED:               { label: 'Authorized',               color: '#166534', bg: '#DCFCE7', icon: '✓' },
  NOT_AUTHORIZED:           { label: 'Not Authorized',           color: '#991B1B', bg: '#FEE2E2', icon: '✗' },
  INSUFFICIENT_INFORMATION: { label: 'Insufficient Information', color: '#92400E', bg: '#FEF3C7', icon: '?' },
  MANUAL_REVIEW:            { label: 'Manual Review Required',   color: '#5B21B6', bg: '#EDE9FE', icon: '!' },
};

function OutcomeBadge({ outcome }) {
  const meta = OUTCOME_META[outcome] || { label: outcome, color: '#374151', bg: '#F3F4F6', icon: '•' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 12px', borderRadius: 6,
      fontSize: 13, fontWeight: 700, letterSpacing: '.03em',
      color: meta.color, background: meta.bg,
    }}>
      <span style={{ fontSize: 14 }}>{meta.icon}</span>
      {meta.label}
    </span>
  );
}

function ReasonChip({ code }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontFamily: 'DM Mono, monospace',
      color: '#374151', background: '#F3F4F6', border: '1px solid #E5E7EB',
    }}>
      {code}
    </span>
  );
}

function IdList({ ids, label }) {
  if (!ids || ids.length === 0) return null;
  return (
    <div>
      <span style={{ color: 'var(--steel)', fontSize: 12, display: 'block', marginBottom: 4 }}>{label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {ids.map(id => (
          <span key={id} style={{
            fontFamily: 'DM Mono, monospace', fontSize: 10,
            background: '#F9FAFB', border: '1px solid #E5E7EB',
            padding: '2px 6px', borderRadius: 3,
          }}>
            {id}
          </span>
        ))}
      </div>
    </div>
  );
}

function StringList({ items, label, color }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <span style={{ color: 'var(--steel)', fontSize: 12, display: 'block', marginBottom: 4 }}>{label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {items.map((item, i) => (
          <span key={i} style={{
            fontFamily: 'DM Mono, monospace', fontSize: 11,
            background: '#FEF3C7', border: '1px solid #FDE68A',
            padding: '2px 8px', borderRadius: 4, color: color || '#92400E',
          }}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Instrument picker (VERIFIED only) ───────────────────────────────────────

function InstrumentPicker({ value, onChange }) {
  const [instruments, setInstruments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/authority/instruments?limit=100&status=VERIFIED')
      .then(r => setInstruments(r.data))
      .catch(() => setInstruments([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <select className="au-input" disabled><option>Loading instruments…</option></select>;

  if (instruments.length === 0) {
    return (
      <div data-testid="no-eligible-instruments-state"
        style={{ padding: '10px 12px', background: '#FEF3C7', border: '1px solid #FDE68A',
          borderRadius: 6, fontSize: 13, color: '#92400E' }}>
        No verified Authority Instruments are available for evaluation. Instruments become
        available after a reviewer verifies them.
      </div>
    );
  }

  return (
    <select className="au-input" value={value} onChange={e => onChange(e.target.value)} required>
      <option value="">— Select a verified instrument —</option>
      {instruments.map(i => (
        <option key={i.id} value={i.id}>
          {(i.instrument_type || '').replace(/_/g, ' ')}
          {i.effective_date ? ` · eff. ${String(i.effective_date).slice(0, 10)}` : ''}
          {i.expiration_date ? ` – ${String(i.expiration_date).slice(0, 10)}` : ''}
          {` [${i.jurisdiction || '—'}]`}
        </option>
      ))}
    </select>
  );
}

// ── Participant selector (scoped to loaded instrument detail) ─────────────────
// Uses is_valid_principal / is_valid_delegate from the backend's canonical
// VALID_PARTICIPANT_ROLES classification — not a hand-written frontend role list.

function ParticipantSelect({ participants, filterFn, value, onChange, placeholder }) {
  const filtered = (participants || []).filter(filterFn);
  return (
    <select className="au-input" value={value} onChange={e => onChange(e.target.value)} required>
      <option value="">{placeholder}</option>
      {filtered.map(p => (
        <option key={p.party_id} value={p.party_id}>
          {p.display_name || p.party_id.slice(0, 8)} · {p.role}
        </option>
      ))}
    </select>
  );
}

// ── Action key selector (from instrument permissions) ────────────────────────
// Concern 10: humanized labels with exact key as secondary text, plus
// "Other action" fallback with DOMAIN.ACTION validation.

const ACTION_KEY_RE = /^[A-Z][A-Z0-9_]{0,29}\.[A-Z][A-Z0-9_]{0,29}$/;
const CUSTOM_ACTION_SENTINEL = '__CUSTOM__';

function humanizeActionKey(key) {
  if (!key) return '';
  const dot = key.indexOf('.');
  if (dot === -1) return key;
  const toWords = s => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');
  return `${toWords(key.slice(0, dot))} · ${toWords(key.slice(dot + 1))}`;
}

function ActionKeySelect({ permissions, value, onChange }) {
  const grantedPermissions = (permissions || []).filter(p => p.grant_type === 'granted');
  const knownKeys = new Set(grantedPermissions.map(p => p.action_key));

  // customMode tracks whether the user is in "Other action" entry mode.
  // It's internal state so that selecting the sentinel doesn't hide the input
  // when the parent resets value to '' (the sentinel itself is never a valid action key).
  const isCustomValue = Boolean(value) && !knownKeys.has(value);
  const [customMode, setCustomMode] = React.useState(isCustomValue);
  const [customKey, setCustomKey] = React.useState(isCustomValue ? value : '');
  const [customError, setCustomError] = React.useState('');

  const selectValue = customMode ? CUSTOM_ACTION_SENTINEL : value;

  function handleSelectChange(e) {
    const sel = e.target.value;
    if (sel === CUSTOM_ACTION_SENTINEL) {
      setCustomMode(true);
      onChange('');
    } else {
      setCustomMode(false);
      setCustomKey('');
      setCustomError('');
      onChange(sel);
    }
  }

  function handleCustomKeyChange(e) {
    const raw = e.target.value.toUpperCase();
    setCustomKey(raw);
    const trimmed = raw.trim();
    if (trimmed === '') {
      setCustomError('');
      onChange('');
    } else if (ACTION_KEY_RE.test(trimmed)) {
      setCustomError('');
      onChange(trimmed);
    } else {
      setCustomError('Use format DOMAIN.ACTION (e.g. BANKING.WIRE_TRANSFER)');
      onChange('');
    }
  }

  return (
    <div>
      <select className="au-input" value={selectValue} onChange={handleSelectChange}
        data-testid="action-key-select">
        <option value="">— Select an action —</option>
        {grantedPermissions.map(p => (
          <option key={p.id} value={p.action_key}>
            {humanizeActionKey(p.action_key)}
          </option>
        ))}
        <option value={CUSTOM_ACTION_SENTINEL}>Other action (enter key)…</option>
      </select>

      {value && !customMode && (
        <div style={{ marginTop: 4, fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--steel)' }}
          data-testid="action-key-exact">
          {value}
        </div>
      )}

      {customMode && (
        <div style={{ marginTop: 6 }}>
          <input
            className="au-input"
            value={customKey}
            onChange={handleCustomKeyChange}
            placeholder="DOMAIN.ACTION"
            style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}
            data-testid="action-key-custom-input"
          />
          {customError && (
            <div style={{ fontSize: 11, color: '#991B1B', marginTop: 3 }}
              data-testid="action-key-custom-error">
              {customError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Evaluation form ───────────────────────────────────────────────────────────

function EvaluationForm({ onResult }) {
  const [instrumentId,     setInstrumentId]     = useState('');
  const [principalPartyId, setPrincipalPartyId] = useState('');
  const [delegatePartyId,  setDelegatePartyId]  = useState('');
  const [actionKey,        setActionKey]        = useState('');
  const [amount,           setAmount]           = useState('');
  const [currency,         setCurrency]         = useState('USD');

  // Instrument detail (participants + permissions) — loaded after instrument selection
  const [instrDetail,    setInstrDetail]    = useState(null);
  const [instrLoading,   setInstrLoading]   = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');
  const [fieldError, setFieldError] = useState('');

  // Idempotency key and requestedAt held in refs — not in form state, not persisted to storage.
  // Both generated once per logical submission; cleared together on settle or decision-driving
  // input change. Retrying the same logical submission reuses both values unchanged.
  const idempKeyRef    = useRef(null);
  const requestedAtRef = useRef(null);

  function generateIdempKey() {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Reset dependent fields and idempotency state when instrument changes
  function handleInstrumentChange(id) {
    setInstrumentId(id);
    setPrincipalPartyId('');
    setDelegatePartyId('');
    setActionKey('');
    idempKeyRef.current    = null;
    requestedAtRef.current = null;
    setError('');
    setFieldError('');
    if (!id) { setInstrDetail(null); return; }
    setInstrLoading(true);
    api.get(`/authority/instruments/${id}`)
      .then(r => setInstrDetail(r.data))
      .catch(() => setInstrDetail(null))
      .finally(() => setInstrLoading(false));
  }

  // Clear idempotency state whenever any decision-driving field changes
  function handleFieldChange(setter) {
    return (val) => {
      setter(val);
      idempKeyRef.current    = null;
      requestedAtRef.current = null;
    };
  }

  const canSubmit = instrumentId && principalPartyId && delegatePartyId && actionKey && !submitting;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setFieldError('');

    // Freeze idempotency key and requestedAt for this logical submission.
    // Both are generated once and reused across automatic transport retries.
    if (!idempKeyRef.current) {
      idempKeyRef.current    = generateIdempKey();
      requestedAtRef.current = new Date().toISOString();
    }

    setSubmitting(true);
    try {
      const payload = {
        instrumentId,
        principalPartyId,
        delegatePartyId,
        actionKey,
        idempotencyKey: idempKeyRef.current,
        requestedAt:    requestedAtRef.current,
      };

      if (amount !== '') {
        const minor = toMinorUnits(amount, currency);
        if (minor === null) {
          setFieldError('Amount must be a valid number (e.g. 50.00 for $50.00).');
          setSubmitting(false);
          return;
        }
        if (typeof minor === 'object' && minor.error) {
          setFieldError(minor.error);
          setSubmitting(false);
          return;
        }
        payload.amount   = minor;
        payload.currency = currency.trim().toUpperCase() || 'USD';
      }

      const res = await api.post('/authority/evaluate', payload);
      idempKeyRef.current    = null;
      requestedAtRef.current = null;
      onResult({ ...res.data, _stale: false });
    } catch (err) {
      if (err.response?.status === 409) {
        const code = err.response?.data?.code || err.response?.data?.error || '';
        if (code === 'IDEMPOTENCY_REPLAY_STALE') {
          idempKeyRef.current    = null;
          requestedAtRef.current = null;
          onResult({ _stale: true, _staleReason: err.response?.data?.staleReason });
          setSubmitting(false);
          return;
        }
        if (code === 'IDEMPOTENCY_KEY_CONFLICT') {
          idempKeyRef.current    = null;
          requestedAtRef.current = null;
          setError('A conflict was detected. Please change a field and try again.');
          setSubmitting(false);
          return;
        }
      }
      if (err.response?.status === 422) {
        setError('Request time is outside the supported ±5 minute window. Please try again.');
        setSubmitting(false);
        return;
      }
      // Transport or server error — keep the key so retrying the same request is idempotent
      setError(err.response?.data?.error || 'Evaluation failed.');
    } finally {
      setSubmitting(false);
    }
  }

  const participants = instrDetail?.participants || [];
  const permissions  = instrDetail?.permissions  || [];

  return (
    <form className="au-card" style={{ padding: 24 }} onSubmit={handleSubmit}>
      <div className="au-card-header" style={{ marginBottom: 20 }}>
        <span className="au-card-title">Evaluate Authority</span>
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        <div className="au-form-group">
          <label className="au-label">Verified Instrument *</label>
          <InstrumentPicker value={instrumentId} onChange={handleInstrumentChange} />
          {!instrumentId && (
            <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 4 }}>
              Choose an instrument first. Principal and delegate options come from that
              instrument's recorded participants.
            </div>
          )}
        </div>

        {instrLoading && (
          <div style={{ fontSize: 13, color: 'var(--steel)' }}>Loading instrument details…</div>
        )}

        {instrumentId && !instrLoading && (
          <>
            <div className="au-form-group">
              <label className="au-label">Principal *</label>
              {participants.filter(p => p.is_valid_principal).length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--steel)' }}>
                  No principal participants on this instrument.
                </div>
              ) : (
                <ParticipantSelect
                  participants={participants}
                  filterFn={p => p.is_valid_principal}
                  value={principalPartyId}
                  onChange={handleFieldChange(setPrincipalPartyId)}
                  placeholder="— Select principal —"
                />
              )}
            </div>

            <div className="au-form-group">
              <label className="au-label">Delegate *</label>
              {participants.filter(p => p.is_valid_delegate).length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--steel)' }}>
                  No delegate participants on this instrument.
                </div>
              ) : (
                <ParticipantSelect
                  participants={participants}
                  filterFn={p => p.is_valid_delegate}
                  value={delegatePartyId}
                  onChange={handleFieldChange(setDelegatePartyId)}
                  placeholder="— Select delegate —"
                />
              )}
            </div>

            <div className="au-form-group">
              <label className="au-label">Action *</label>
              <ActionKeySelect
                key={instrumentId}
                permissions={permissions}
                value={actionKey}
                onChange={handleFieldChange(setActionKey)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 10 }}>
              <div className="au-form-group">
                <label className="au-label">Amount (optional)</label>
                <input className="au-input" type="text" value={amount}
                  onChange={e => { setAmount(e.target.value); idempKeyRef.current = null; requestedAtRef.current = null; }}
                  placeholder="e.g. 50.00" />
              </div>
              <div className="au-form-group">
                <label className="au-label">Currency</label>
                <input className="au-input" value={currency}
                  onChange={e => { setCurrency(e.target.value.toUpperCase()); idempKeyRef.current = null; requestedAtRef.current = null; }}
                  maxLength={3} placeholder="USD" />
              </div>
            </div>
            {(instrDetail?.restrictions || []).some(r => r.restriction_type === 'monetary_limit') && (
              <div style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A',
                borderRadius: 5, padding: '6px 10px', marginTop: 4 }}
                data-testid="monetary-limit-hint">
                This instrument includes a monetary limit. Enter an amount and currency for a complete evaluation.
              </div>
            )}
          </>
        )}
      </div>

      {fieldError && (
        <div style={{ marginTop: 8, padding: '8px 12px', background: '#FEE2E2', borderRadius: 6,
          color: '#991B1B', fontSize: 13 }}>
          {fieldError}
        </div>
      )}

      <AuError msg={error} />

      <div style={{ marginTop: 20 }}>
        <button
          type="submit"
          className="au-btn au-btn--primary"
          disabled={!canSubmit}
          aria-describedby={!canSubmit && !submitting ? 'evaluate-form-hint' : undefined}
        >
          {submitting ? 'Evaluating…' : 'Evaluate'}
        </button>
        {!canSubmit && !submitting && (
          <div id="evaluate-form-hint"
            style={{ fontSize: 12, color: 'var(--steel)', marginTop: 6 }}
            data-testid="evaluate-btn-hint">
            Select an instrument, principal, delegate, and action to evaluate.
          </div>
        )}
      </div>
    </form>
  );
}

// ── Single result card ────────────────────────────────────────────────────────
// Correction 14: show all four outcome states; rich output; replay/stale labeling;
// stale replay must NOT show prior decision

function EvaluationResultCard({ result }) {
  if (result._stale) {
    return (
      <div className="au-card" style={{ padding: 24, borderLeft: '4px solid #F59E0B' }}>
        <div style={{ fontWeight: 700, color: '#92400E', marginBottom: 8, fontSize: 14 }}>
          Evaluation Record Changed
        </div>
        <div style={{ color: '#374151', fontSize: 13, lineHeight: 1.6 }}>
          The record or evaluation time has changed. Please run a new evaluation.
        </div>
        {result._staleReason && (
          <div style={{ marginTop: 8 }}>
            <ReasonChip code={result._staleReason} />
          </div>
        )}
      </div>
    );
  }

  const reasonCodes = result.reasonCodes || (result.reasonCode ? [result.reasonCode] : []);

  return (
    <div className="au-card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <OutcomeBadge outcome={result.outcome || result.decision} />
        {result.isReplay && (
          <span style={{
            fontSize: 11, color: '#5B21B6', fontStyle: 'italic',
            background: '#EDE9FE', padding: '2px 8px', borderRadius: 4,
          }}>
            Replayed result (cached)
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
        {reasonCodes.length > 0 && (
          <div>
            <span style={{ color: 'var(--steel)', display: 'block', marginBottom: 4, fontSize: 12 }}>
              Reason Codes
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {reasonCodes.map(c => <ReasonChip key={c} code={c} />)}
            </div>
          </div>
        )}

        <StringList items={result.missingFields}       label="Missing Fields"        color="#92400E" />
        <StringList items={result.manualReviewReasons} label="Manual Review Reasons" color="#5B21B6" />

        <IdList ids={result.matchedPermissionIds}  label="Matched Permission IDs" />
        <IdList ids={result.appliedRestrictionIds} label="Applied Restriction IDs" />
        <IdList ids={result.blockingPermissionIds} label="Blocking Permission IDs" />
        <IdList ids={result.blockingRestrictionIds} label="Blocking Restriction IDs" />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <span style={{ color: 'var(--steel)', fontSize: 12 }}>Evaluation ID</span>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, wordBreak: 'break-all' }}>
              {result.evaluationId}
            </div>
          </div>
          {result.ruleVersion && (
            <div>
              <span style={{ color: 'var(--steel)', fontSize: 12 }}>Rule Version</span>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{result.ruleVersion}</div>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <span style={{ color: 'var(--steel)', fontSize: 12 }}>Evaluated At</span>
            <div style={{ fontSize: 12 }}>{fmtDateTime(result.evaluated_at || result.evaluatedAt)}</div>
          </div>
          {result.replayCheckedAt && (
            <div>
              <span style={{ color: 'var(--steel)', fontSize: 12 }}>Replay Checked At</span>
              <div style={{ fontSize: 12 }}>{fmtDateTime(result.replayCheckedAt)}</div>
            </div>
          )}
        </div>
      </div>

      <div style={{
        marginTop: 16, padding: '10px 12px',
        background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6,
        fontSize: 11, color: '#6B7280', lineHeight: 1.5,
      }}>
        This is a deterministic evaluation of the human-verified FieldCore record — not a legal
        determination — and does not execute any action.
      </div>
    </div>
  );
}

// ── History table ─────────────────────────────────────────────────────────────

function EvaluationHistory({ refreshKey }) {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/authority/evaluations?limit=20');
      setRows(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load evaluations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div className="au-table-card">
      <div className="au-card-header">
        <span className="au-card-title">Evaluation History</span>
        <button className="au-btn au-btn--ghost" onClick={load} style={{ fontSize: 12 }}>
          Refresh
        </button>
      </div>
      <div style={{
        margin: '12px 16px 14px', padding: '8px 12px',
        background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6,
        fontSize: 11, color: '#6B7280', lineHeight: 1.5,
      }}>
        Each row shows what FieldCore determined at evaluation time, based on the
        instrument record as it existed then. The underlying instrument may later change
        status (e.g. revoked or expired); historical results are preserved for audit and
        are not automatically updated. Run a new evaluation for a current answer.
      </div>

      {loading ? <AuLoading /> : error ? (
        <AuError msg={error} onRetry={load} />
      ) : !rows.length ? (
        <AuEmpty text="No evaluations yet." />
      ) : (
        <table className="au-table au-table--no-hover">
          <thead>
            <tr>
              <th>Outcome</th>
              <th>Reason</th>
              <th>Action Key</th>
              <th>Instrument</th>
              <th>Evaluated At (Historical)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                <td><OutcomeBadge outcome={row.outcome} /></td>
                <td><ReasonChip code={row.reason_code} /></td>
                <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 11 }}>
                  {row.requested_action_key || '—'}
                </td>
                <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 11 }}>
                  {row.instrument_id ? row.instrument_id.slice(0, 8) + '…' : '—'}
                </td>
                <td style={{ fontSize: 12, color: 'var(--steel)' }}>
                  {fmtDateTime(row.evaluated_at)}
                  <span style={{
                    marginLeft: 6, fontSize: 10, color: '#9CA3AF',
                    background: '#F3F4F6', padding: '1px 5px', borderRadius: 3,
                  }}>
                    historical
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AuthorityEvaluate() {
  const [latestResult, setLatestResult] = useState(null);
  const [historyKey,   setHistoryKey]   = useState(0);
  const [caps,         setCaps]         = useState(null); // null = loading, [] = loaded (may be empty)
  const [capsError,    setCapsError]    = useState('');

  useEffect(() => {
    api.get('/authority/capabilities')
      .then(r => setCaps(r.data.capabilities || []))
      .catch(err => {
        setCapsError(err.response?.data?.error || 'Failed to load capabilities.');
        setCaps([]);
      });
  }, []);

  function handleResult(result) {
    setLatestResult(result);
    setHistoryKey(k => k + 1);
  }

  const hasEvaluateCap = Array.isArray(caps) && caps.includes('AUTHORITY_EVALUATE');
  const capsLoading    = caps === null;

  return (
    <div className="au-page">
      <div className="au-page-header">
        <div>
          <div className="au-page-title">Evaluator</div>
          <div className="au-page-subtitle">
            Deterministic authorization check using a human-verified instrument — does not establish legal validity, replace human review, or execute an action
          </div>
        </div>
      </div>

      {capsLoading ? (
        <AuLoading />
      ) : !hasEvaluateCap ? (
        <div className="au-card" style={{ padding: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: '#5B21B6', fontSize: 14 }}>
            AUTHORITY_EVALUATE Capability Required
          </div>
          <div style={{ color: '#374151', fontSize: 13, lineHeight: 1.6 }}>
            You do not have the AUTHORITY_EVALUATE capability. Contact your institution
            administrator to request access to the Authority Evaluator.
          </div>
          {capsError && <AuError msg={capsError} />}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <EvaluationForm onResult={handleResult} />
            {latestResult && <EvaluationResultCard result={latestResult} />}
          </div>
          <div>
            <EvaluationHistory refreshKey={historyKey} />
          </div>
        </div>
      )}
    </div>
  );
}
