import { useState } from 'react';
import api from '../api';

function BackIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 14, height: 14 }} aria-hidden="true">
      <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const TEMPLATES = [
  { key: 'on_the_way',     label: 'On the Way',      hint: 'Notifies client tech is en route' },
  { key: 'running_late',   label: 'Running Late',    hint: 'Apology + ETA update to client' },
  { key: 'job_assigned',   label: 'Job Assigned',    hint: 'Notifies tech of new dispatch' },
  { key: 'custom',         label: 'Custom',          hint: 'Write your own message' },
];

const RECIPIENTS = [
  { key: 'client', label: 'Notify Client' },
  { key: 'tech',   label: 'Notify Tech'   },
  { key: 'both',   label: 'Both'          },
];

/**
 * DispatchQuickCommsPanel
 *
 * Quick message sender for a specific job. Templates target client SMS or
 * tech in-app notification.
 *
 * Props:
 *   job         — job object (needs id, client_name, service_type, tech_name)
 *   onBack      — () => void
 *   onSent      — () => void  — called after successful send
 */
export default function DispatchQuickCommsPanel({ job, onBack, onSent, flags }) {
  const [template,   setTemplate]   = useState('on_the_way');
  const [recipient,  setRecipient]  = useState('client');
  const [custom,     setCustom]     = useState('');
  const [sending,    setSending]    = useState(false);
  const [sent,       setSent]       = useState(false);
  const [error,      setError]      = useState(null);

  async function handleSend() {
    if (sending || sent) return;
    setSending(true);
    setError(null);
    try {
      await api.post(`/dispatch/jobs/${job.id}/communicate`, {
        template,
        customMessage: template === 'custom' ? custom : undefined,
        recipient,
      });
      setSent(true);
      setTimeout(() => { onSent?.(); }, 1200);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send. Please try again.');
    } finally {
      setSending(false);
    }
  }

  const canSend = template !== 'custom' || custom.trim().length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderBottom: '1px solid var(--lightgray)', flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 6px', marginLeft: -6,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--slate)', fontSize: 11, fontWeight: 600, borderRadius: 4,
          }}
        >
          <BackIcon />
          Back
        </button>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>
          Send Update
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', minHeight: 0 }}>

        {/* Provider status banner */}
        {flags?.smsProviderConfigured === false && (
          <div style={{
            background: '#FEF3C7', border: '1px solid #D97706', borderRadius: 6,
            padding: '7px 10px', marginBottom: 14, fontSize: 10, color: '#B45309',
          }}>
            <strong>SMS provider not configured</strong> — in-app notifications will be sent to
            technicians, but client SMS messages cannot be delivered externally.
          </div>
        )}

        {/* Job context */}
        <div style={{
          background: 'var(--off)', borderRadius: 6, padding: '8px 10px', marginBottom: 14,
          fontSize: 11, color: 'var(--slate)',
        }}>
          <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: 2 }}>
            {job?.client_name} — {job?.service_type}
          </div>
          {job?.tech_name && (
            <div>Lead: {job.tech_name}{job?.team_size > 1 ? ` +${job.team_size - 1} more` : ''}</div>
          )}
        </div>

        {/* Template selection */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--slate)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>
            Message Type
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {TEMPLATES.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTemplate(t.key)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  padding: '7px 10px', borderRadius: 6, textAlign: 'left',
                  border: template === t.key ? '2px solid var(--sand)' : '1px solid var(--lightgray)',
                  background: template === t.key ? '#FFF8F0' : '#fff',
                  cursor: 'pointer',
                }}
                aria-pressed={template === t.key}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)' }}>{t.label}</span>
                <span style={{ fontSize: 10, color: 'var(--slate)', marginTop: 1 }}>{t.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Custom message */}
        {template === 'custom' && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--slate)', display: 'block', marginBottom: 4 }}>
              Message
            </label>
            <textarea
              value={custom}
              onChange={e => setCustom(e.target.value)}
              placeholder="Type your message…"
              rows={3}
              style={{
                width: '100%', fontSize: 11, padding: '7px 9px',
                border: '1px solid var(--lightgray)', borderRadius: 6,
                boxSizing: 'border-box', resize: 'vertical',
                fontFamily: 'inherit',
              }}
              aria-label="Custom message"
            />
          </div>
        )}

        {/* Recipient */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--slate)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>
            Send To
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {RECIPIENTS.map(r => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRecipient(r.key)}
                aria-pressed={recipient === r.key}
                style={{
                  padding: '5px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                  border: recipient === r.key ? '2px solid var(--sand)' : '1px solid var(--lightgray)',
                  background: recipient === r.key ? '#FFF8F0' : '#fff',
                  color: 'var(--navy)', cursor: 'pointer',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{
            background: '#FEE2E2', color: 'var(--red)', borderRadius: 4,
            padding: '7px 10px', fontSize: 11, marginBottom: 10,
          }} role="alert">
            {error}
          </div>
        )}

        {sent && (
          <div style={{
            background: '#E8F5E9', color: '#2E7D32', borderRadius: 4,
            padding: '7px 10px', fontSize: 11, fontWeight: 700, marginBottom: 10,
          }} role="status">
            {flags?.smsProviderConfigured === false
              ? 'Notification queued. SMS delivery unavailable — provider not configured.'
              : 'Message sent.'}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--lightgray)', flexShrink: 0 }}>
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend || sending || sent}
          aria-busy={sending}
          style={{
            width: '100%', padding: '8px 0', borderRadius: 6, border: 'none',
            background: canSend && !sent ? 'var(--sand)' : 'var(--lightgray)',
            color: canSend && !sent ? '#fff' : 'var(--steel)',
            fontWeight: 700, fontSize: 12,
            cursor: canSend && !sending && !sent ? 'pointer' : 'not-allowed',
            opacity: sending ? 0.7 : 1,
          }}
        >
          {sent ? 'Sent ✓' : sending ? 'Sending…' : 'Send Message'}
        </button>
      </div>
    </div>
  );
}
