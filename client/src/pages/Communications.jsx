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

// ─── Shared two-panel empty state (right panel) ──────────────────────────────
function PanelEmpty({ icon: Icon, title, body, cta }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--steel)', gap: 10, background: 'var(--off)', padding: 32 }}>
      <Icon size={36} style={{ opacity: 0.2 }} />
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>{title}</div>
      {body && <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 280, lineHeight: 1.6 }}>{body}</div>}
      {cta && <div style={{ marginTop: 8 }}>{cta}</div>}
    </div>
  );
}

// ─── Phone Numbers Tab — two-panel layout ────────────────────────────────────
function NumbersPanel({ numbers, onRelease, onEdit, onAdd }) {
  const [selected, setSelected] = useState(null);

  const selectedNum = numbers.find(n => n.id === selected);

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Left panel */}
      <div style={{ width: 300, background: 'var(--white)', borderRight: '1px solid var(--lightgray)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--lightgray)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Phone Numbers</div>
          <button
            className="btn-primary"
            style={{ fontSize: 11, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
            onClick={onAdd}
          >
            <Plus size={12} /> Add
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {numbers.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--steel)', fontSize: 13 }}>No numbers yet</div>
          ) : (
            numbers.map(n => (
              <div
                key={n.id}
                onClick={() => setSelected(selected === n.id ? null : n.id)}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--lightgray)',
                  background: selected === n.id ? 'var(--sand-lt)' : 'transparent',
                  borderLeft: selected === n.id ? '3px solid var(--sand)' : '3px solid transparent',
                  transition: 'background .1s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 17, background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Phone size={14} style={{ color: 'white' }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--navy)', fontFamily: 'DM Mono, monospace' }}>{fmtNum(n.number)}</div>
                    <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 1 }}>{n.label || 'Unlabeled'}</div>
                  </div>
                  <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
                    <StatusBadge status={n.is_active ? 'active' : 'inactive'} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selectedNum ? (
          <PanelEmpty
            icon={Phone}
            title={numbers.length === 0 ? 'No phone numbers yet' : 'Select a number'}
            body={numbers.length === 0
              ? 'Add a Twilio business number to handle inbound calls and send iMessage/RCS messages to clients.'
              : 'Select a phone number on the left to view settings and details.'}
            cta={numbers.length === 0 && (
              <button className="btn-primary" style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onAdd}>
                <Plus size={14} /> Add Your First Number
              </button>
            )}
          />
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', background: 'var(--off)' }}>
            {/* Detail header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--lightgray)', background: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>{fmtNum(selectedNum.number)}</div>
                <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>{selectedNum.label || 'Unlabeled'}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => onEdit(selectedNum)}>
                  <Settings size={12} /> Settings
                </button>
                <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 10px', color: 'var(--red)', borderColor: 'rgba(198,40,40,.25)' }} onClick={() => onRelease(selectedNum.id)}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
            {/* Detail body */}
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                ['Status',      <StatusBadge status={selectedNum.is_active ? 'active' : 'inactive'} />],
                ['Number',      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: 'var(--navy)' }}>{fmtNum(selectedNum.number)}</span>],
                ['Label',       selectedNum.label || <span style={{ color: 'var(--steel)' }}>Unlabeled</span>],
                ['Forwarding',  selectedNum.forward_to ? fmtNum(selectedNum.forward_to) : <span style={{ color: 'var(--steel)' }}>Not set</span>],
                ['Business Hours', selectedNum.business_hours_only ? 'Respect business hours' : 'Always open'],
                ['Calls via',   'Twilio Voice'],
                ['Texts via',   'Sendblue (iMessage/RCS)'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, fontWeight: 600, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '.08em', paddingTop: 2, width: 110, flexShrink: 0 }}>{label}</div>
                  <div style={{ fontSize: 13, color: 'var(--navy)' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Call Log Tab — two-panel layout ─────────────────────────────────────────
function CallsPanel({ calls }) {
  const [selected, setSelected] = useState(null);

  const selectedCall = calls.find(c => c.id === selected);

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Left panel */}
      <div style={{ width: 300, background: 'var(--white)', borderRight: '1px solid var(--lightgray)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--lightgray)' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Call Log</div>
          <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 2 }}>Inbound &amp; outbound calls</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {calls.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--steel)', fontSize: 13 }}>No calls yet</div>
          ) : (
            calls.map(c => (
              <div
                key={c.id}
                onClick={() => setSelected(selected === c.id ? null : c.id)}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--lightgray)',
                  background: selected === c.id ? 'var(--sand-lt)' : 'transparent',
                  borderLeft: selected === c.id ? '3px solid var(--sand)' : '3px solid transparent',
                  transition: 'background .1s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 17, background: 'var(--off)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--lightgray)' }}>
                    {c.direction === 'inbound'
                      ? <PhoneIncoming size={14} style={{ color: 'var(--green)' }} />
                      : <Phone size={14} style={{ color: 'var(--navy)' }} />}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.client_name || fmtNum(c.from_number) || 'Unknown'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 1 }}>{fmtDt(c.started_at)}</div>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    <StatusBadge
                      status={c.status === 'completed' ? 'complete' : c.status === 'voicemail' ? 'voicemail' : c.status || 'unknown'}
                      variant={c.status === 'completed' ? 'green' : c.status === 'voicemail' ? 'yellow' : 'gray'}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selectedCall ? (
          <PanelEmpty
            icon={PhoneOff}
            title={calls.length === 0 ? 'No calls yet' : 'Select a call'}
            body={calls.length === 0
              ? 'Calls will appear here once your business number receives or makes calls.'
              : 'Select a call on the left to view details.'}
          />
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', background: 'var(--off)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--lightgray)', background: 'var(--white)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--off)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--lightgray)', flexShrink: 0 }}>
                {selectedCall.direction === 'inbound'
                  ? <PhoneIncoming size={16} style={{ color: 'var(--green)' }} />
                  : <Phone size={16} style={{ color: 'var(--navy)' }} />}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>{selectedCall.client_name || fmtNum(selectedCall.from_number) || 'Unknown Caller'}</div>
                <div style={{ fontSize: 12, color: 'var(--steel)', fontFamily: 'DM Mono, monospace' }}>{fmtNum(selectedCall.from_number)}</div>
              </div>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                ['Direction',  selectedCall.direction === 'inbound' ? 'Inbound' : 'Outbound'],
                ['Status',     <StatusBadge status={selectedCall.status === 'completed' ? 'complete' : selectedCall.status || 'unknown'} variant={selectedCall.status === 'completed' ? 'green' : 'gray'} />],
                ['Duration',   fmtDur(selectedCall.duration_seconds)],
                ['From',       fmtNum(selectedCall.from_number)],
                ['To',         fmtNum(selectedCall.to_number)],
                ['Time',       fmtDt(selectedCall.started_at)],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, fontWeight: 600, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '.08em', paddingTop: 2, width: 80, flexShrink: 0 }}>{label}</div>
                  <div style={{ fontSize: 13, color: 'var(--navy)' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Voicemail Tab — two-panel layout ────────────────────────────────────────
function VoicemailPanel({ vms, onMarkRead }) {
  const [selected, setSelected] = useState(null);

  const selectedVm = vms.find(v => v.id === selected);

  function handleSelect(id) {
    setSelected(selected === id ? null : id);
    const vm = vms.find(v => v.id === id);
    if (vm && !vm.is_read) onMarkRead(id);
  }

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Left panel */}
      <div style={{ width: 300, background: 'var(--white)', borderRight: '1px solid var(--lightgray)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--lightgray)' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Voicemail</div>
          <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 2 }}>Inbound voicemails with transcriptions</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {vms.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--steel)', fontSize: 13 }}>No voicemails</div>
          ) : (
            vms.map(v => (
              <div
                key={v.id}
                onClick={() => handleSelect(v.id)}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--lightgray)',
                  background: selected === v.id ? 'var(--sand-lt)' : !v.is_read ? 'rgba(21,101,192,.03)' : 'transparent',
                  borderLeft: selected === v.id ? '3px solid var(--sand)' : '3px solid transparent',
                  transition: 'background .1s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 17, background: !v.is_read ? 'var(--blue-lt)' : 'var(--off)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--lightgray)' }}>
                    <Voicemail size={14} style={{ color: !v.is_read ? 'var(--blue)' : 'var(--steel)' }} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {v.client_name || fmtNum(v.from_number) || 'Unknown'}
                      </span>
                      {!v.is_read && <StatusBadge variant="blue">New</StatusBadge>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 1 }}>
                      {fmtDur(v.duration_seconds)} · {fmtDt(v.created_at)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selectedVm ? (
          <PanelEmpty
            icon={Voicemail}
            title={vms.length === 0 ? 'No voicemails' : 'Select a voicemail'}
            body={vms.length === 0
              ? 'Voicemails from missed calls will appear here with AI transcriptions.'
              : 'Select a voicemail on the left to listen and read the transcription.'}
          />
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', background: 'var(--off)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--lightgray)', background: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>{selectedVm.client_name || fmtNum(selectedVm.from_number) || 'Unknown Caller'}</div>
                <div style={{ fontSize: 12, color: 'var(--steel)', fontFamily: 'DM Mono, monospace' }}>{fmtNum(selectedVm.from_number)}</div>
              </div>
              {!selectedVm.is_read && (
                <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 12px' }} onClick={() => onMarkRead(selectedVm.id)}>
                  Mark read
                </button>
              )}
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 24 }}>
                {[
                  ['Duration', fmtDur(selectedVm.duration_seconds)],
                  ['Received', fmtDt(selectedVm.created_at)],
                  ['Status',   <StatusBadge variant={selectedVm.is_read ? 'gray' : 'blue'}>{selectedVm.is_read ? 'Read' : 'New'}</StatusBadge>],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, fontWeight: 600, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 13, color: 'var(--navy)' }}>{value}</div>
                  </div>
                ))}
              </div>
              {selectedVm.recording_url && (
                <div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, fontWeight: 600, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Recording</div>
                  <audio controls style={{ width: '100%', maxWidth: 420, height: 36 }} onPlay={() => onMarkRead(selectedVm.id)}>
                    <source src={selectedVm.recording_url} />
                  </audio>
                </div>
              )}
              {selectedVm.transcription && (
                <div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, fontWeight: 600, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Transcription</div>
                  <div style={{ fontSize: 14, color: 'var(--slate)', fontStyle: 'italic', lineHeight: 1.7, background: 'var(--white)', padding: '14px 16px', borderRadius: 8, border: '1px solid var(--lightgray)' }}>
                    "{selectedVm.transcription}"
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
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

  const TABS = [
    { key: 'messages', label: 'Messages',      icon: <MessageCircle size={13} /> },
    { key: 'numbers',  label: 'Phone Numbers', icon: <Phone size={13} /> },
    { key: 'calls',    label: 'Call Log',       icon: <PhoneIncoming size={13} /> },
    { key: 'vms',      label: unreadVms > 0 ? `Voicemail (${unreadVms})` : 'Voicemail', icon: <Voicemail size={13} /> },
  ];

  return (
    <div style={{ margin: '-22px -24px', height: 'calc(100vh - 52px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header bar — same for all tabs */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--lightgray)', flexShrink: 0, padding: '14px 24px 0' }}>
        <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 17, color: 'var(--navy)', fontWeight: 400 }}>
          Communications
        </div>
        <div style={{ display: 'flex', gap: 0, marginTop: 8, marginBottom: -1 }}>
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

      {/* Tab content — all tabs use the same full-height two-panel container */}
      {activeTab === 'messages' && <MessagesPanel />}

      {activeTab !== 'messages' && (
        loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--steel)', fontSize: 13, background: 'var(--off)' }}>
            Loading…
          </div>
        ) : error ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--off)', padding: 24 }}>
            <div style={{ background: 'var(--red-lt)', borderLeft: '3px solid var(--red)', borderRadius: '0 6px 6px 0', padding: '10px 14px', fontSize: 13, color: 'var(--red)' }}>
              {error}
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'numbers' && (
              <NumbersPanel
                numbers={numbers}
                onRelease={releaseNumber}
                onEdit={n => setEditingNum(n)}
                onAdd={() => setShowProvision(true)}
              />
            )}
            {activeTab === 'calls' && <CallsPanel calls={calls} />}
            {activeTab === 'vms' && <VoicemailPanel vms={vms} onMarkRead={markVmRead} />}
          </>
        )
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
