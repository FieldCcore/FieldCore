import React, { useState, useEffect, useRef } from 'react';
import {
  Phone, PhoneIncoming, PhoneOff, Voicemail,
  Plus, Trash2, Settings, Search,
  MessageCircle, MessageSquare, ChevronLeft, Send,
  Mail, Bell,
} from 'lucide-react';
import { format } from 'date-fns';
import api from '../api';

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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 14, padding: 28, maxWidth: 480, width: '100%' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 20 }}>Number Settings</div>
        <div className="form-group">
          <label>Label</label>
          <input value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} placeholder="e.g. Main Business Line" />
        </div>
        <div className="form-group">
          <label>Forward calls to</label>
          <input value={form.forward_to} onChange={e => setForm(p => ({ ...p, forward_to: e.target.value }))} placeholder="+1 (555) 000-0000" />
        </div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 14, padding: 28, maxWidth: 480, width: '100%' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 20 }}>Add Phone Number</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input value={areaCode} onChange={e => setAreaCode(e.target.value.replace(/\D/g,'').slice(0,3))} placeholder="Area code (e.g. 813)" style={{ flex: 1 }} />
          <button className="btn-primary" onClick={search} disabled={loading || !areaCode}>
            {loading ? 'Searching…' : <><Search size={13} /> Search</>}
          </button>
        </div>
        {error && <p style={{ color: '#C62828', fontSize: 13, marginBottom: 12 }}>{error}</p>}
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

// ─── Unified Thread View ──────────────────────────────────────────────────────
function ConversationThread({ clientId, onBack }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error,   setError]   = useState('');
  const bottomRef = useRef(null);

  useEffect(() => { load(); }, [clientId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data?.thread]);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get(`/phone/thread/${clientId}`);
      setData(r.data);
    } catch (err) { setError(err.response?.data?.error || 'Failed to load thread.'); }
    finally { setLoading(false); }
  }

  async function sendMessage() {
    if (!message.trim()) return;
    setSending(true);
    try {
      await api.post('/sms/send', { client_id: clientId, body: message.trim() });
      setMessage('');
      setTimeout(load, 800);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send message.');
    } finally { setSending(false); }
  }

  if (loading) return <div style={{ padding: 32, color: 'var(--steel)', fontSize: 14 }}>Loading conversation…</div>;
  if (error)   return <div style={{ padding: 32, color: '#C62828', fontSize: 13 }}>{error}</div>;

  const { client, thread } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '70vh', background: 'white', borderRadius: 12, border: '1px solid var(--lightgray)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--lightgray)', background: 'var(--off-white)' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600 }}>
          <ChevronLeft size={16} /> Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 15 }}>{client.name}</div>
          <div style={{ fontSize: 12, color: 'var(--steel)', fontFamily: 'DM Mono, monospace' }}>{fmtNum(client.phone)}</div>
        </div>
        <span style={{ fontSize: 11, background: '#EFF6FF', color: '#1D4ED8', padding: '3px 10px', borderRadius: 12, fontWeight: 600 }}>
          {thread.length} events
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {thread.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 14, marginTop: 40 }}>No messages or calls yet.</p>
        )}
        {thread.map(item => (
          <ThreadItem key={`${item.type}-${item.id}`} item={item} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div style={{ borderTop: '1px solid var(--lightgray)', padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Send a message via iMessage / RCS / SMS…"
          rows={2}
          style={{ flex: 1, resize: 'none', borderRadius: 10, border: '1px solid var(--lightgray)', padding: '10px 14px', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
        />
        <button
          className="btn-primary"
          style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={sendMessage}
          disabled={sending || !message.trim()}
        >
          <Send size={14} />
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

function ThreadItem({ item }) {
  const isOutbound = item.direction === 'outbound';
  const isCall     = item.type === 'call';

  if (isCall) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 14px', background: '#F8FAFC', borderRadius: 10, border: '1px solid var(--lightgray)' }}>
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
        background: isOutbound ? 'var(--navy)' : '#F1F5F9',
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

// ─── Conversations List ───────────────────────────────────────────────────────
function ConversationsList({ onSelect }) {
  const [convs,   setConvs]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.get('/phone/conversations')
      .then(r => setConvs(r.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: 'var(--steel)', fontSize: 14 }}>Loading…</p>;
  if (error)   return <p style={{ color: '#C62828', fontSize: 13 }}>{error}</p>;

  if (convs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--steel)' }}>
        <MessageSquare size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
        <div style={{ fontSize: 15, fontWeight: 600 }}>No conversations yet</div>
        <p style={{ fontSize: 13 }}>Messages sent to clients will appear here alongside calls.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {convs.map(c => (
        <button
          key={c.id}
          onClick={() => onSelect(c)}
          style={{
            display: 'flex', alignItems: 'center', gap: 14,
            background: 'white', border: '1px solid var(--lightgray)',
            borderRadius: 12, padding: '14px 18px', cursor: 'pointer',
            textAlign: 'left', width: '100%',
          }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--navy)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
            {(c.name || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{c.name}</span>
              <span style={{ fontSize: 11, color: 'var(--steel)' }}>{fmtTime(c.last_contact)}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {c.last_message_body
                ? <span>{c.last_message_dir === 'outbound' ? 'You: ' : ''}{c.last_message_body}</span>
                : <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={11} /> {c.call_count} call{c.call_count !== 1 ? 's' : ''}</span>
              }
            </div>
          </div>
          {c.unread_messages > 0 && (
            <span style={{ background: 'var(--navy)', color: 'white', fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>
              {c.unread_messages}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Phone Section ────────────────────────────────────────────────────────────
function PhoneSection() {
  const [tab,     setTab]     = useState('conversations');
  const [numbers, setNumbers] = useState([]);
  const [calls,   setCalls]   = useState([]);
  const [vms,     setVms]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [showProvision, setShowProvision] = useState(false);
  const [editingNum,    setEditingNum]    = useState(null);
  const [activeConv,    setActiveConv]    = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setActiveConv(null);
    if (tab === 'conversations') { setLoading(false); return; }
    load();
  }, [tab]);

  async function load() {
    setLoading(true);
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
    } catch (err) { setError(err.response?.data?.error || 'Failed to load.'); }
    finally { setLoading(false); }
  }

  async function releaseNumber(id) {
    if (!confirm('Release this number? It will be returned and you will lose it.')) return;
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
    { key: 'conversations', label: 'Conversations',   icon: <MessageCircle size={13} /> },
    { key: 'numbers',       label: 'Numbers',          icon: <Phone size={13} /> },
    { key: 'calls',         label: 'Call Log',         icon: <PhoneIncoming size={13} /> },
    { key: 'vms',           label: `Voicemail${unreadVms > 0 ? ` (${unreadVms})` : ''}`, icon: <Voicemail size={13} /> },
  ];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--navy)' }}>Phone</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--steel)', fontSize: 14 }}>Conversations, business numbers, calls, and voicemail</p>
        </div>
        {tab === 'numbers' && (
          <button className="btn-primary" onClick={() => setShowProvision(true)}>
            <Plus size={14} /> Add Number
          </button>
        )}
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: '#C62828', marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--lightgray)', marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 16px', border: 'none',
            borderBottom: tab === t.key ? '2px solid var(--navy)' : '2px solid transparent',
            background: 'none', fontSize: 13, fontWeight: tab === t.key ? 700 : 400,
            color: tab === t.key ? 'var(--navy)' : 'var(--steel)', cursor: 'pointer', marginBottom: -1,
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'conversations' && (
        activeConv
          ? <ConversationThread clientId={activeConv.id} onBack={() => setActiveConv(null)} />
          : <ConversationsList onSelect={c => setActiveConv(c)} />
      )}

      {loading && tab !== 'conversations' && <p style={{ color: 'var(--steel)', fontSize: 14 }}>Loading…</p>}

      {!loading && tab === 'numbers' && (
        <>
          {numbers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--steel)' }}>
              <Phone size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No phone numbers yet</div>
              <div style={{ fontSize: 14, marginBottom: 20 }}>Add a business number to handle calls and send iMessages to clients.</div>
              <button className="btn-primary" onClick={() => setShowProvision(true)}><Plus size={14} /> Add Number</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {numbers.map(n => (
                <div key={n.id} style={{ background: 'white', border: '1px solid var(--lightgray)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Phone size={14} style={{ color: 'var(--navy)' }} />
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>{fmtNum(n.number)}</span>
                      <span style={{ fontSize: 11, background: n.is_active ? '#f0fdf4' : '#f1f5f9', color: n.is_active ? '#15803d' : '#64748b', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                        {n.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--steel)' }}>
                      {n.label || 'Unlabeled'} · Calls via Twilio · Texts via Sendblue
                      {n.forward_to ? ` · Forwarding to ${fmtNum(n.forward_to)}` : ' · No forwarding set'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setEditingNum(n)}>
                      <Settings size={12} /> Settings
                    </button>
                    <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 10px', color: '#C62828', borderColor: '#FCA5A5' }} onClick={() => releaseNumber(n.id)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!loading && tab === 'calls' && (
        <>
          {calls.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--steel)' }}>
              <PhoneOff size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
              <div style={{ fontSize: 15, fontWeight: 600 }}>No calls yet</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid var(--lightgray)' }}>
                    {['Direction','From','To','Client','Status','Duration','Time'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {calls.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--lightgray)' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          {c.direction === 'inbound'
                            ? <PhoneIncoming size={13} style={{ color: '#15803d' }} />
                            : <Phone size={13} style={{ color: 'var(--navy)' }} />}
                          <span style={{ textTransform: 'capitalize' }}>{c.direction}</span>
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace' }}>{fmtNum(c.from_number)}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace' }}>{fmtNum(c.to_number)}</td>
                      <td style={{ padding: '10px 12px' }}>{c.client_name || <span style={{ color: 'var(--steel)' }}>Unknown</span>}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: c.status === 'completed' ? '#f0fdf4' : c.status === 'voicemail' ? '#FFF7ED' : '#f1f5f9', color: c.status === 'completed' ? '#15803d' : c.status === 'voicemail' ? '#C2410C' : '#64748b' }}>
                          {c.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace' }}>{fmtDur(c.duration_seconds)}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--steel)' }}>{fmtDt(c.started_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!loading && tab === 'vms' && (
        <>
          {vms.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--steel)' }}>
              <Voicemail size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
              <div style={{ fontSize: 15, fontWeight: 600 }}>No voicemails</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {vms.map(v => (
                <div key={v.id} style={{ background: v.is_read ? 'white' : 'var(--sand-lt)', border: `1px solid ${v.is_read ? 'var(--lightgray)' : 'var(--sand-dark)'}`, borderRadius: 12, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                    <div>
                      <span style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 14 }}>{v.client_name || fmtNum(v.from_number)}</span>
                      {!v.is_read && <span style={{ marginLeft: 8, fontSize: 10, background: 'var(--navy)', color: 'white', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>NEW</span>}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--steel)' }}>{fmtDt(v.created_at)} · {fmtDur(v.duration_seconds)}</span>
                  </div>
                  {v.recording_url && (
                    <audio controls style={{ width: '100%', height: 36, marginBottom: 8 }} onPlay={() => markVmRead(v.id)}>
                      <source src={v.recording_url} />
                    </audio>
                  )}
                  {v.transcription && (
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--steel)', fontStyle: 'italic', lineHeight: 1.6 }}>"{v.transcription}"</p>
                  )}
                  {!v.is_read && (
                    <button className="btn-secondary" style={{ marginTop: 10, fontSize: 11, padding: '4px 12px' }} onClick={() => markVmRead(v.id)}>
                      Mark as read
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showProvision && (
        <ProvisionModal onDone={n => setNumbers(prev => [...prev, n])} onClose={() => setShowProvision(false)} />
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

// ─── SMS Messages Panel ───────────────────────────────────────────────────────
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
    <div className="messages-layout">
      <div className="client-list-panel">
        <div className="panel-header">
          <h2>Messages</h2>
          <input
            className="search-input"
            placeholder="Search clients..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ marginBottom: 0, fontSize: 13 }}
          />
        </div>
        <div className="client-list-scroll">
          {filteredClients.map(c => (
            <div
              key={c.id}
              className={`client-list-item ${selected?.id === c.id ? 'active' : ''}`}
              onClick={() => { setSelected(c); setError(''); }}
            >
              <div className="client-list-name">{c.name}</div>
              <div className="client-list-phone">{c.phone || 'No phone'}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="chat-panel">
        {!selected ? (
          <div className="chat-empty">
            <p>Select a client to view messages</p>
          </div>
        ) : (
          <>
            <div className="chat-header">
              <div style={{ flex: 1 }}>
                <div className="chat-name">{selected.name}</div>
                <div className="chat-phone">{selected.phone || 'No phone number on file'}</div>
              </div>
              {clientJobs.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: '4px 10px' }}
                    disabled={sending}
                    onClick={() => sendTemplate('confirmation', clientJobs[0].id)}
                    title={`Confirm: ${clientJobs[0].service_type}`}
                  >
                    <Mail size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Confirmation
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: '4px 10px' }}
                    disabled={sending}
                    onClick={() => sendTemplate('reminder', clientJobs[0].id)}
                    title={`Remind: ${clientJobs[0].service_type}`}
                  >
                    <Bell size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Reminder
                  </button>
                </div>
              )}
            </div>

            <div className="chat-messages">
              {messages.length === 0 && (
                <p className="muted" style={{ textAlign: 'center', padding: 24 }}>No messages yet.</p>
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

            {error && <p className="form-error" style={{ margin: '0 16px 8px' }}>{error}</p>}

            <form className="chat-input-row" onSubmit={handleSend}>
              <textarea
                className="chat-textarea"
                placeholder="Type a message..."
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={2}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
              />
              <button type="submit" className="btn-primary" disabled={sending || !body.trim()}>
                {sending ? '...' : 'Send'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Communications Page ──────────────────────────────────────────────────────
export default function Communications() {
  return (
    <div>
      <PhoneSection />
      <div style={{ borderTop: '2px solid #E5E0D8', margin: '40px 0 0' }} />
      <div style={{ paddingTop: 32 }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1C2333' }}>SMS Messages</div>
          <p style={{ margin: '4px 0 0', color: 'var(--steel)', fontSize: 14 }}>Text message conversations with clients</p>
        </div>
        <MessagesPanel />
      </div>
    </div>
  );
}
