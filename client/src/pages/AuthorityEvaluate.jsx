import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { AuLoading, AuError, AuEmpty, fmtDateTime } from './AuthorityShared';

// ── Outcome display helpers ───────────────────────────────────────────────────

const OUTCOME_META = {
  AUTHORIZED:              { label: 'Authorized',             color: '#166534', bg: '#DCFCE7' },
  NOT_AUTHORIZED:          { label: 'Not Authorized',         color: '#991B1B', bg: '#FEE2E2' },
  INSUFFICIENT_INFORMATION:{ label: 'Insufficient Info',      color: '#92400E', bg: '#FEF3C7' },
  MANUAL_REVIEW:           { label: 'Manual Review Required', color: '#5B21B6', bg: '#EDE9FE' },
};

function OutcomeBadge({ outcome }) {
  const meta = OUTCOME_META[outcome] || { label: outcome, color: '#374151', bg: '#F3F4F6' };
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 6,
      fontSize: 12, fontWeight: 700, letterSpacing: '.03em',
      color: meta.color, background: meta.bg,
    }}>
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

// ── Evaluation form ───────────────────────────────────────────────────────────

function EvaluationForm({ onResult }) {
  const [form, setForm] = useState({
    instrumentId:     '',
    requestingPartyId:'',
    actionKey:        '',
    amount:           '',
    currency:         'USD',
    actionTime:       '',
    idempotencyKey:   '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  function set(field, val) {
    setForm(f => ({ ...f, [field]: val }));
  }

  function generateKey() {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    const hex = Array.from(array).map(b => b.toString(16).padStart(2,'0')).join('');
    set('idempotencyKey', hex);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        instrumentId:      form.instrumentId.trim(),
        requestingPartyId: form.requestingPartyId.trim(),
        actionKey:         form.actionKey.trim() || undefined,
        idempotencyKey:    form.idempotencyKey.trim(),
      };
      if (form.amount !== '') {
        const parsed = parseInt(form.amount, 10);
        if (!Number.isFinite(parsed)) { setError('Amount must be an integer (minor units, e.g. cents).'); setSubmitting(false); return; }
        payload.amount   = parsed;
        payload.currency = form.currency.trim().toUpperCase() || 'USD';
      }
      if (form.actionTime.trim()) {
        payload.actionTime = new Date(form.actionTime.trim()).toISOString();
      }
      const res = await api.post('/authority/evaluate', payload);
      onResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Evaluation failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="au-card" style={{ padding: 24 }} onSubmit={handleSubmit}>
      <div className="au-card-header" style={{ marginBottom: 20 }}>
        <span className="au-card-title">Evaluate Authority</span>
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        <div className="au-form-group">
          <label className="au-label">Instrument ID *</label>
          <input className="au-input" value={form.instrumentId}
            onChange={e => set('instrumentId', e.target.value)}
            placeholder="UUID of the authority instrument" required />
        </div>

        <div className="au-form-group">
          <label className="au-label">Requesting Party ID *</label>
          <input className="au-input" value={form.requestingPartyId}
            onChange={e => set('requestingPartyId', e.target.value)}
            placeholder="UUID of the delegate (authority party)" required />
        </div>

        <div className="au-form-group">
          <label className="au-label">Action Key</label>
          <input className="au-input" value={form.actionKey}
            onChange={e => set('actionKey', e.target.value)}
            placeholder="e.g. BANKING.WIRE_TRANSFER" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 10 }}>
          <div className="au-form-group">
            <label className="au-label">Amount (minor units, optional)</label>
            <input className="au-input" type="number" value={form.amount}
              onChange={e => set('amount', e.target.value)}
              placeholder="e.g. 5000 = $50.00" />
          </div>
          <div className="au-form-group">
            <label className="au-label">Currency</label>
            <input className="au-input" value={form.currency}
              onChange={e => set('currency', e.target.value)}
              maxLength={3} placeholder="USD" />
          </div>
        </div>

        <div className="au-form-group">
          <label className="au-label">Action Time (optional, defaults to now)</label>
          <input className="au-input" type="datetime-local" value={form.actionTime}
            onChange={e => set('actionTime', e.target.value)} />
        </div>

        <div className="au-form-group">
          <label className="au-label">Idempotency Key *</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="au-input" style={{ flex: 1 }} value={form.idempotencyKey}
              onChange={e => set('idempotencyKey', e.target.value)}
              placeholder="Caller-supplied deduplication key" required />
            <button type="button" className="au-btn au-btn--secondary"
              onClick={generateKey} style={{ whiteSpace: 'nowrap' }}>
              Generate
            </button>
          </div>
        </div>
      </div>

      <AuError msg={error} />

      <div style={{ marginTop: 20 }}>
        <button type="submit" className="au-btn au-btn--primary" disabled={submitting}>
          {submitting ? 'Evaluating…' : 'Evaluate'}
        </button>
      </div>
    </form>
  );
}

// ── Single result card ────────────────────────────────────────────────────────

function EvaluationResultCard({ result }) {
  return (
    <div className="au-card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <OutcomeBadge outcome={result.outcome} />
        {result.isReplay && (
          <span style={{ fontSize: 11, color: 'var(--steel)', fontStyle: 'italic' }}>
            (replayed result)
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
        <div><span style={{ color: 'var(--steel)', minWidth: 140, display: 'inline-block' }}>Reason code</span>
          <ReasonChip code={result.reasonCode} /></div>
        {result.reasonDetail && (
          <div><span style={{ color: 'var(--steel)', minWidth: 140, display: 'inline-block' }}>Detail</span>
            <span>{result.reasonDetail}</span></div>
        )}
        <div><span style={{ color: 'var(--steel)', minWidth: 140, display: 'inline-block' }}>Evaluation ID</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{result.evaluationId}</span></div>
        <div><span style={{ color: 'var(--steel)', minWidth: 140, display: 'inline-block' }}>Evaluated at</span>
          <span>{fmtDateTime(result.evaluated_at)}</span></div>
      </div>
    </div>
  );
}

// ── History table ─────────────────────────────────────────────────────────────

function EvaluationHistory({ accountId }) {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/authority/evaluations?limit=20');
      setRows(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load evaluations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <AuLoading />;

  return (
    <div className="au-table-card">
      <div className="au-card-header">
        <span className="au-card-title">Recent Evaluations</span>
        <button className="au-btn au-btn--ghost" onClick={load} style={{ fontSize: 12 }}>
          Refresh
        </button>
      </div>
      <AuError msg={error} />
      {!rows.length ? (
        <AuEmpty text="No evaluations yet." />
      ) : (
        <table className="au-table au-table--no-hover">
          <thead>
            <tr>
              <th>Outcome</th>
              <th>Reason</th>
              <th>Action Key</th>
              <th>Instrument</th>
              <th>Evaluated At</th>
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

  function handleResult(result) {
    setLatestResult(result);
    setHistoryKey(k => k + 1);
  }

  return (
    <div className="au-page">
      <div className="au-page-header">
        <div>
          <div className="au-page-title">Authority Evaluator</div>
          <div className="au-page-subtitle">Determine if a delegate is authorized to perform an action</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <EvaluationForm onResult={handleResult} />
          {latestResult && <EvaluationResultCard result={latestResult} />}
        </div>
        <div>
          <EvaluationHistory key={historyKey} />
        </div>
      </div>
    </div>
  );
}
