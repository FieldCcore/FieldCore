import React, { useState, useEffect, useRef } from 'react';
import {
  Phone, PhoneIncoming, PhoneOff, Voicemail,
  Plus, Trash2, Settings, Search,
  MessageCircle, MessageSquare, ChevronLeft, Send,
  Mail, Bell,
} from 'lucide-react';
import { format } from 'date-fns';
import api from '../api';
import StatusBadge from '../components/StatusBadge';

// ─── Phone helpers ────────────────────────────────────────────────────────────
function fmtNum(n) {
  if (!n) return '—';
  const d = n.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') return `+1 (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  return n;
}
function fmtDur(secs) {
  if (!secs) return '—';
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2,'0')}`;
}
function fmtDt(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Number Settings Modal ────────────────────────────────────────────────────
function NumberSettings({ num, onSave, onClose }) {
  const [form, setForm] = useState({
    label:               num.label || '',
    forward_to:          num.forward_to || '',
    business_hours_only: !!num.business_hours_only,
    after_hours_message: num.after_hours_message || '',
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const r = await api.patch(`/phone/numbers/${num.id}`, form);
      onSave(r.data);
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Number Settings</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label>Label</label>
            <input value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} placeholder="e.g. Main Business Line" />
          </div>
          <div className="form-group">
            <label>Forward calls to</label>
            <input value={form.forward_to} onChange={e => setForm(p => ({ ...p, forward_to: e.target.value }))} placeholder="+1 (555) 000-0000" />
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textTransform: 'none', fontSize: 13, fontFamily: 'Inter, sans-serif', fontWeight: 500, color: 'var(--navy)' }}>
              <input type="checkbox" checked={form.business_hours_only} onChange={e => setForm(p => ({ ...p, business_hours_only: e.target.checked }))} />
              Respect business hours
            </label>
          </div>
          {form.business_hours_only && (
            <div className="form-group">
              <label>After-hours voicemail message</label>
              <textarea value={form.after_hours_message} onChange={e => setForm(p => ({ ...p, after_hours_message: e.target.value }))} rows={3} />
            </div>
          )}
          <div className="form-actions">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Provision Number Modal ───────────────────────────────────────────────────
function ProvisionModal({ onDone, onClose }) {
  const [areaCode, setAreaCode] = useState('');
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [provisioning, setProv] = useState(null);
  const [error, setError]       = useState('');

  async function search() {
    setLoading(true); setError(''); setResults([]);
    try {
      const r = await api.post('/phone/numbers/search', { area_code: areaCode });
      setResults(r.data);
      if (!r.data.length) setError('No numbers found. Try another area code.');
    } catch (err) { setError(err.response?.data?.error || 'Search failed.'); }
    finally { setLoading(false); }
  }

  async function provision(phoneNumber) {
    setProv(phoneNumber);
    try {
      const r = await api.post('/phone/numbers/provision', { phone_number: phoneNumber });
      onDone(r.data); onClose();
    } catch (err) { setError(err.response?.data?.error || 'Could not provision.'); setProv(null); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Phone Number</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            className="form-group"
            style={{ flex: 1, padding: '10px 12px', border: '1.5px solid var(--lightgray)', borderRadius: 6, fontFamily: 'Inter, sans-serif', fontSize: 14, outline: 'none' }}
            value={areaCode}
            onChange={e => setAreaCode(e.target.value.replace(/\D/g,'').slice(0,3))}
            placeholder="Area code (e.g. 813)"
            onKeyDown={e => e.key === 'Enter' && areaCode && search()}
          />
          <button className="btn-primary" onClick={search} disabled={loading || !areaCode}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
        {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
        {results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
            {results.map(n => (
              <div key={n.phone_number} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid var(--lightgray)', borderRadius: 8 }}>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>{fmtNum(n.phone_number)}</span>
                <button className="btn-primary" style={{ fontSize: 12, padding: '5px 14px' }} disabled={!!provisioning} onClick={() => provision(n.phone_number)}>
                  {provisioning === n.phone_number ? 'Adding…' : 'Add'}
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="form-actions" style={{ marginTop: 20 }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Thread Item ──────────────────────────────────────────────────────────────
function ThreadItem({ item }) {
  const isOutbound = item.direction === 'outbound';
  const isCall     = item.type === 'call';

  if (isCall) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 14px', background: 'var(--offwhite)', borderRadius: 10, border: '1px solid var(--lightgray)' }}>
        {item.direction === 'inbound'
          ? <PhoneIncoming size={13} style={{ color: '#15803d' }} />
          : <Phone size={13} style={{ color: 'var(--navy)' }} />
        }
        <span style={{ fontSize: 12, color: 'var(--steel)' }}>
          {item.direction === 'inbound' ? 'Inbound call' : 'Outbound call'} ·{' '}
          {item.status === 'voicemail' ? 'Voicemail left' : item.status} ·{' '}
          {fmtDur(item.duration_seconds)} · {fmtTime(item.created_at)}
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: isOutbound ? 'flex-end' : 'flex-start' }}>
      <div style={{
        maxWidth: '72%',
        padding: '10px 14px',
        borderRadius: isOutbound ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        background: isOutbound ? 'var(--navy)' : 'var(--offwhite)',
        color: isOutbound ? 'white' : 'var(--navy)',
        fontSize: 13,
        lineHeight: 1.5,
      }}>
        <p style={{ margin: 0 }}>{item.content}</p>
        <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: isOutbound ? 'right' : 'left' }}>
          {fmtTime(item.created_at)}
          {item.provider === 'sendblue' && <span style={{ marginLeft: 6 }}>iMessage/RCS</span>}
          {item.status === 'failed' && <span style={{ marginLeft: 6, color: '#FCA5A5' }}>Failed</span>}
        </div>
      </div>
    </div>
  );
}

// ─── SMS Messages Panel (two-panel layout) ───────────────────────────────────
function MessagesPanel() {
  const [clients, setClients]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [body, setBody]         = useState('');
  const [sending, setSending]   = useState(false);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [clientJobs, setClientJobs] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    api.get('/clients').then(r => setClients(r.data));
  }, []);

  useEffect(() => {
    if (!selected) return;
    loadMessages(selected.id);
    api.get(`/jobs?client_id=${selected.id}&limit=5`)
      .then(r => setClientJobs((r.data?.jobs || r.data || []).filter(j => ['scheduled', 'in_progress'].includes(j.status))))
      .catch(() => setClientJobs([]));
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const iv = setInterval(() => loadMessages(selected.id), 10000);
    return () => clearInterval(iv);
  }, [selected?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadMessages(clientId) {
    const res = await api.get(`/sms/messages?client_id=${clientId}`);
    setMessages(res.data.reverse());
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!body.trim() || !selected) return;
    setSending(true);
    setError('');
    try {
      await api.post('/sms/send', { client_id: selected.id, body: body.trim() });
      setBody('');
      await loadMessages(selected.id);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.warning || 'Send failed.');
    } finally {
      setSending(false);
    }
  }

  async function sendTemplate(template, jobId) {
    setSending(true);
    setError('');
    try {
      await api.post('/sms/send-template', { client_id: selected.id, template, job_id: jobId });
      await loadMessages(selected.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Template send failed.');
    } finally {
      setSending(false);
    }
  }

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search)
  );

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Left: client list */}
      <div style={{ width: 300, background: 'var(--white)', borderRight: '1px solid var(--lightgray)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--lightgray)' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--steel)', pointerEvents: 'none' }} />
            <input
              style={{ width: '100%', padding: '8px 12px 8px 30px', border: '1.5px solid var(--lightgray)', borderRadius: 6, fontFamily: 'Inter, sans-serif', fontSize: 13, outline: 'none', color: 'var(--navy)', background: 'var(--off)', boxSizing: 'border-box' }}
              placeholder="Search clients…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredClients.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--steel)', fontSize: 13 }}>No clients found</div>
          )}
          {filteredClients.map(c => (
            <div
              key={c.id}
              onClick={() => { setSelected(c); setError(''); }}
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                borderBottom: '1px solid var(--lightgray)',
                background: selected?.id === c.id ? 'var(--sand-lt)' : 'transparent',
                borderLeft: selected?.id === c.id ? '3px solid var(--sand)' : '3px solid transparent',
                transition: 'background .1s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 17, background: 'var(--navy)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {(c.name || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 1 }}>{c.phone || 'No phone'}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: conversation */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--steel)', gap: 12, background: 'var(--off)' }}>
            <MessageSquare size={36} style={{ opacity: 0.2 }} />
            <div style={{ fontSize: 14, fontWeight: 600 }}>Select a client to start messaging</div>
            <div style={{ fontSize: 12 }}>iMessage / RCS / SMS via Sendblue</div>
          </div>
        ) : (
          <>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--lightgray)', background: 'var(--white)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>{selected.name}</div>
                <div style={{ fontSize: 12, color: 'var(--steel)', fontFamily: 'DM Mono, monospace' }}>{selected.phone || 'No phone number on file'}</div>
              </div>
              {clientJobs.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                    disabled={sending}
                    onClick={() => sendTemplate('confirmation', clientJobs[0].id)}
                  >
                    <Mail size={12} /> Confirmation
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                    disabled={sending}
                    onClick={() => sendTemplate('reminder', clientJobs[0].id)}
                  >
                    <Bell size={12} /> Reminder
                  </button>
                </div>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--off)' }}>
              {messages.length === 0 && (
                <p style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 14, padding: '32px 0' }}>No messages yet.</p>
              )}
              {messages.map(m => (
                <div key={m.id} className={`message-bubble ${m.direction}`}>
                  <div className="bubble-body">{m.body}</div>
                  <div className="bubble-time">
                    {format(new Date(m.created_at), 'MMM d, h:mm a')}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {error && (
              <div style={{ margin: '0 16px 8px', background: 'var(--red-lt)', borderLeft: '3px solid var(--red)', padding: '8px 12px', fontSize: 13, color: 'var(--red)', borderRadius: '0 6px 6px 0' }}>
                {error}
              </div>
            )}

            <form style={{ display: 'flex', gap: 10, padding: '12px 16px', borderTop: '1px solid var(--lightgray)', background: 'var(--white)', alignItems: 'flex-end' }} onSubmit={handleSend}>
              <textarea
                className="chat-textarea"
                placeholder="Type a message…"
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={2}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
              />
              <button type="submit" className="btn-primary" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }} disabled={sending || !body.trim()}>
                <Send size={13} />
                {sending ? '…' : 'Send'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Shared card wrapper for non-Messages tabs ───────────────────────────────
function CommCard({ title, subtitle, action, children }) {
  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--lightgray)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--lightgray)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function CommEmptyState({ icon: Icon, title, body, cta }) {
  return (
    <div style={{ padding: '56px 24px', textAlign: 'center' }}>
      <Icon size={36} style={{ color: 'var(--navy)', opacity: 0.18, marginBottom: 14 }} />
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--steel)', maxWidth: 340, margin: '0 auto', lineHeight: 1.6 }}>{body}</div>
      {cta && <div style={{ marginTop: 20 }}>{cta}</div>}
    </div>
  );
}

// ─── Phone Numbers Tab ────────────────────────────────────────────────────────
function NumbersView({ numbers, onRelease, onEdit, onAdd }) {
  return (
    <CommCard
      title="Phone Numbers"
      subtitle="Business numbers for calls and iMessage/RCS texts"
      action={
        <button className="btn-primary" style={{ fontSize: 12, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6 }} onClick={onAdd}>
          <Plus size={13} /> Add Number
        </button>
      }
    >
      {numbers.length === 0 ? (
        <CommEmptyState
          icon={Phone}
          title="No phone numbers yet"
          body="Add a Twilio business number to handle inbound calls and send iMessage/RCS messages to clients."
          cta={
            <button className="btn-primary" style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onAdd}>
              <Plus size={14} /> Add Your First Number
            </button>
          }
        />
      ) : (
        numbers.map((n, i) => (
          <div key={n.id} style={{ padding: '14px 20px', borderTop: i === 0 ? 'none' : '1px solid var(--lightgray)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--off)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Phone size={16} style={{ color: 'var(--navy)' }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>{fmtNum(n.number)}</span>
                  <StatusBadge status={n.is_active ? 'active' : 'inactive'} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--steel)' }}>
                  {n.label || 'Unlabeled'} · Calls via Twilio · Texts via Sendblue
                  {n.forward_to ? ` · Forwarding to ${fmtNum(n.forward_to)}` : ' · No forwarding set'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => onEdit(n)}>
                <Settings size={12} /> Settings
              </button>
              <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 10px', color: 'var(--red)', borderColor: 'rgba(198,40,40,.25)' }} onClick={() => onRelease(n.id)}>
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))
      )}
    </CommCard>
  );
}

// ─── Call Log Tab ─────────────────────────────────────────────────────────────
function CallsView({ calls }) {
  return (
    <CommCard title="Call Log" subtitle="All inbound and outbound calls">
      {calls.length === 0 ? (
        <CommEmptyState
          icon={PhoneOff}
          title="No calls yet"
          body="Calls will appear here once your business number receives or makes calls."
        />
      ) : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 120px 80px 100px 110px', gap: 0, padding: '8px 20px', background: 'var(--off)', borderBottom: '1px solid var(--lightgray)' }}>
            {['', 'Caller', 'Number', 'Duration', 'Status', 'Time'].map(h => (
              <div key={h} style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, fontWeight: 700, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '.07em' }}>{h}</div>
            ))}
          </div>
          {calls.map((c, i) => (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 120px 80px 100px 110px', gap: 0, padding: '13px 20px', borderTop: '1px solid var(--lightgray)', alignItems: 'center' }}>
              <div>
                {c.direction === 'inbound'
                  ? <PhoneIncoming size={13} style={{ color: 'var(--green)' }} />
                  : <Phone size={13} style={{ color: 'var(--navy)' }} />}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{c.client_name || <span style={{ color: 'var(--steel)', fontWeight: 400 }}>Unknown</span>}</div>
                <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--steel)', marginTop: 1 }}>{fmtNum(c.from_number)}</div>
              </div>
              <div style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: 'var(--slate)' }}>{fmtNum(c.to_number)}</div>
              <div style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: 'var(--slate)' }}>{fmtDur(c.duration_seconds)}</div>
              <div>
                <StatusBadge
                  status={c.status === 'completed' ? 'complete' : c.status === 'voicemail' ? 'voicemail' : c.status}
                  variant={c.status === 'completed' ? 'green' : c.status === 'voicemail' ? 'yellow' : 'gray'}
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--steel)' }}>{fmtDt(c.started_at)}</div>
            </div>
          ))}
        </div>
      )}
    </CommCard>
  );
}

// ─── Voicemail Tab ────────────────────────────────────────────────────────────
function VoicemailView({ vms, onMarkRead }) {
  return (
    <CommCard title="Voicemail" subtitle="Inbound voicemails with transcriptions">
      {vms.length === 0 ? (
        <CommEmptyState
          icon={Voicemail}
          title="No voicemails"
          body="Voicemails from missed calls will appear here with AI transcriptions."
        />
      ) : (
        vms.map((v, i) => (
          <div key={v.id} style={{ padding: '16px 20px', borderTop: i === 0 ? 'none' : '1px solid var(--lightgray)', background: !v.is_read ? 'rgba(21,101,192,.025)' : 'transparent' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: v.transcription || v.recording_url ? 10 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 14 }}>{v.client_name || fmtNum(v.from_number)}</span>
                {!v.is_read && <StatusBadge variant="blue">New</StatusBadge>}
                {v.duration_seconds && <span style={{ fontSize: 11, color: 'var(--steel)', fontFamily: 'DM Mono, monospace' }}>{fmtDur(v.duration_seconds)}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: 'var(--steel)' }}>{fmtDt(v.created_at)}</span>
                {!v.is_read && (
                  <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => onMarkRead(v.id)}>
                    Mark read
                  </button>
                )}
              </div>
            </div>
            {v.recording_url && (
              <audio controls style={{ width: '100%', maxWidth: 380, height: 36, marginBottom: v.transcription ? 8 : 0 }} onPlay={() => onMarkRead(v.id)}>
                <source src={v.recording_url} />
              </audio>
            )}
            {v.transcription && (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)', fontStyle: 'italic', lineHeight: 1.6 }}>"{v.transcription}"</p>
            )}
          </div>
        ))
      )}
    </CommCard>
  );
}

// ─── Communications Page ──────────────────────────────────────────────────────
export default function Communications() {
  const [activeTab, setActiveTab] = useState('messages');
  const [numbers, setNumbers]     = useState([]);
  const [calls, setCalls]         = useState([]);
  const [vms, setVms]             = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [showProvision, setShowProvision] = useState(false);
  const [editingNum,    setEditingNum]    = useState(null);

  async function loadTab(tab) {
    setLoading(true);
    setError('');
    try {
      if (tab === 'numbers') {
        const r = await api.get('/phone/numbers');
        setNumbers(r.data);
      } else if (tab === 'calls') {
        const r = await api.get('/phone/calls');
        setCalls(r.data);
      } else if (tab === 'vms') {
        const r = await api.get('/phone/voicemails');
        setVms(r.data);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }

  function switchTab(tab) {
    setActiveTab(tab);
    setError('');
    if (tab !== 'messages') loadTab(tab);
  }

  async function releaseNumber(id) {
    if (!confirm('Release this number? It will be returned to the carrier and cannot be undone.')) return;
    try {
      await api.delete(`/phone/numbers/${id}`);
      setNumbers(prev => prev.filter(n => n.id !== id));
    } catch (err) { setError(err.response?.data?.error || 'Could not release number.'); }
  }

  async function markVmRead(id) {
    await api.patch(`/phone/voicemails/${id}/read`).catch(() => {});
    setVms(prev => prev.map(v => v.id === id ? { ...v, is_read: true } : v));
  }

  const unreadVms = vms.filter(v => !v.is_read).length;
  const isMessages = activeTab === 'messages';

  const TABS = [
    { key: 'messages', label: 'Messages',     icon: <MessageCircle size={13} /> },
    { key: 'numbers',  label: 'Phone Numbers', icon: <Phone size={13} /> },
    { key: 'calls',    label: 'Call Log',      icon: <PhoneIncoming size={13} /> },
    { key: 'vms',      label: unreadVms > 0 ? `Voicemail (${unreadVms})` : 'Voicemail', icon: <Voicemail size={13} /> },
  ];

  return (
    <div style={isMessages ? {
      margin: '-22px -24px',
      height: 'calc(100vh - 52px)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    } : {}}>

      {/* Header bar */}
      <div style={{
        background: 'var(--white)',
        borderBottom: '1px solid var(--lightgray)',
        flexShrink: 0,
        padding: isMessages ? '14px 24px 0' : '20px 24px 0',
      }}>
        {!isMessages && (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 0 }}>
            <div>
              <h1 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 24, fontWeight: 400, color: 'var(--navy)', margin: 0 }}>Communications</h1>
              <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--steel)' }}>
                Phone numbers · Messages · Calls · Voicemail
              </p>
            </div>
          </div>
        )}
        {isMessages && (
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 17, color: 'var(--navy)', fontWeight: 400 }}>
            Communications
          </div>
        )}
        <div style={{ display: 'flex', gap: 0, marginTop: isMessages ? 8 : 14, marginBottom: -1 }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => switchTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 16px',
                border: 'none',
                borderBottom: activeTab === t.key ? '2px solid var(--navy)' : '2px solid transparent',
                background: 'none',
                fontSize: 13,
                fontWeight: activeTab === t.key ? 700 : 500,
                color: activeTab === t.key ? 'var(--navy)' : 'var(--steel)',
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
                whiteSpace: 'nowrap',
                transition: 'color .15s',
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'messages' && <MessagesPanel />}

      {activeTab !== 'messages' && (
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{ background: 'var(--red-lt)', borderLeft: '3px solid var(--red)', borderRadius: '0 6px 6px 0', padding: '10px 14px', fontSize: 13, color: 'var(--red)', marginBottom: 20 }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--steel)', fontSize: 14 }}>Loading…</div>
          ) : (
            <>
              {activeTab === 'numbers' && (
                <NumbersView
                  numbers={numbers}
                  onRelease={releaseNumber}
                  onEdit={n => setEditingNum(n)}
                  onAdd={() => setShowProvision(true)}
                />
              )}
              {activeTab === 'calls' && <CallsView calls={calls} />}
              {activeTab === 'vms' && <VoicemailView vms={vms} onMarkRead={markVmRead} />}
            </>
          )}
        </div>
      )}

      {showProvision && (
        <ProvisionModal
          onDone={n => setNumbers(prev => [...prev, n])}
          onClose={() => setShowProvision(false)}
        />
      )}
      {editingNum && (
        <NumberSettings
          num={editingNum}
          onSave={updated => setNumbers(prev => prev.map(n => n.id === updated.id ? updated : n))}
          onClose={() => setEditingNum(null)}
        />
      )}
    </div>
  );
}
