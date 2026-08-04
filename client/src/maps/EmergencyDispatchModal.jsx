import { useState } from 'react';
import api from '../api';

const PRIORITY_OPTIONS = [
  { value: 'p1', label: 'P1 — Critical (immediate response)', color: '#DC2626' },
  { value: 'p2', label: 'P2 — High (urgent, within the hour)', color: '#EA580C' },
  { value: 'p3', label: 'P3 — Elevated (same day)', color: '#D97706' },
];

const REASON_CODES = [
  'safety_hazard',
  'gas_leak',
  'flooding',
  'power_failure',
  'equipment_failure',
  'customer_escalation',
  'regulatory_deadline',
  'other',
];

const NOTIF_OPTIONS = [
  { value: 'none',         label: 'No automatic notification' },
  { value: 'sms',          label: 'SMS to customer' },
  { value: 'call',         label: 'Phone call to customer' },
  { value: 'sms_and_call', label: 'SMS + phone call' },
];

const PAY_OPTIONS = [
  { value: 'none',          label: 'Standard pay' },
  { value: 'flat_bonus',    label: 'Flat bonus' },
  { value: 'time_and_half', label: 'Time and a half' },
  { value: 'double_time',   label: 'Double time' },
];

const LABEL_STYLE = {
  display: 'block', fontSize: 11, fontWeight: 600,
  color: 'var(--navy)', marginBottom: 4,
};

const INPUT_STYLE = {
  width: '100%', padding: '6px 10px', fontSize: 12,
  border: '1px solid var(--lightgray)', borderRadius: 6,
  outline: 'none', background: '#fff', color: 'var(--navy)',
  boxSizing: 'border-box',
};

const FIELD_STYLE = { marginBottom: 12 };

export default function EmergencyDispatchModal({ job, onClose, onActivated }) {
  const [priority,          setPriority]          = useState('p2');
  const [reasonCode,        setReasonCode]        = useState('');
  const [reasonText,        setReasonText]        = useState('');
  const [responseTarget,    setResponseTarget]    = useState('');
  const [notifPolicy,       setNotifPolicy]       = useState('none');
  const [payPolicy,         setPayPolicy]         = useState('none');
  const [submitting,        setSubmitting]        = useState(false);
  const [error,             setError]             = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post(`/jobs/${job.id}/emergency/activate`, {
        priority,
        reasonCode:                       reasonCode || undefined,
        reasonText:                       reasonText || undefined,
        responseTargetMinutes:            responseTarget ? parseInt(responseTarget, 10) : undefined,
        customerNotificationPolicy:       notifPolicy,
        premiumPayPolicy:                 payPolicy,
      });
      onActivated(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to activate emergency. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedPriority = PRIORITY_OPTIONS.find(p => p.value === priority);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Declare Emergency"
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: 10,
        width: '100%', maxWidth: 420,
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
        padding: 0,
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px 12px',
          borderBottom: '1px solid var(--lightgray)',
          background: '#FEF2F2', borderRadius: '10px 10px 0 0',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#DC2626' }}>
              Declare Emergency
            </div>
            <div style={{ fontSize: 11, color: 'var(--slate)', marginTop: 2 }}>
              {job.client_name} — {job.service_type}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 18, color: 'var(--slate)', padding: 4, lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '16px 18px 18px' }}>

          {/* Priority */}
          <div style={FIELD_STYLE}>
            <label style={LABEL_STYLE}>Priority *</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {PRIORITY_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                    border: `1.5px solid ${priority === opt.value ? opt.color : 'var(--lightgray)'}`,
                    background: priority === opt.value ? `${opt.color}11` : '#fff',
                  }}
                >
                  <input
                    type="radio"
                    name="priority"
                    value={opt.value}
                    checked={priority === opt.value}
                    onChange={() => setPriority(opt.value)}
                    style={{ accentColor: opt.color, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 11, fontWeight: 600, color: priority === opt.value ? opt.color : 'var(--navy)' }}>
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Reason code */}
          <div style={FIELD_STYLE}>
            <label style={LABEL_STYLE}>Reason</label>
            <select
              value={reasonCode}
              onChange={e => setReasonCode(e.target.value)}
              style={{ ...INPUT_STYLE }}
            >
              <option value="">Select a reason…</option>
              {REASON_CODES.map(c => (
                <option key={c} value={c}>
                  {c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          {/* Reason text */}
          <div style={FIELD_STYLE}>
            <label style={LABEL_STYLE}>Details (optional)</label>
            <textarea
              value={reasonText}
              onChange={e => setReasonText(e.target.value)}
              placeholder="Describe the situation…"
              rows={2}
              style={{ ...INPUT_STYLE, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {/* Response target */}
          <div style={FIELD_STYLE}>
            <label style={LABEL_STYLE}>Response target (minutes)</label>
            <input
              type="number"
              value={responseTarget}
              onChange={e => setResponseTarget(e.target.value)}
              placeholder="e.g. 30"
              min="1" max="480"
              style={INPUT_STYLE}
            />
          </div>

          {/* Customer notification */}
          <div style={FIELD_STYLE}>
            <label style={LABEL_STYLE}>Customer notification</label>
            <select
              value={notifPolicy}
              onChange={e => setNotifPolicy(e.target.value)}
              style={INPUT_STYLE}
            >
              {NOTIF_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Premium pay */}
          <div style={FIELD_STYLE}>
            <label style={LABEL_STYLE}>Premium pay policy</label>
            <select
              value={payPolicy}
              onChange={e => setPayPolicy(e.target.value)}
              style={INPUT_STYLE}
            >
              {PAY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {error && (
            <div style={{
              padding: '8px 12px', marginBottom: 12, borderRadius: 6,
              background: '#FEE2E2', border: '1px solid #FCA5A5',
              fontSize: 11, color: '#DC2626',
            }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 6,
                border: '1px solid var(--lightgray)', background: '#fff',
                fontSize: 12, fontWeight: 600, color: 'var(--navy)',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 6,
                border: 'none',
                background: selectedPriority ? selectedPriority.color : '#DC2626',
                fontSize: 12, fontWeight: 700, color: '#fff',
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Activating…' : 'Declare Emergency'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
