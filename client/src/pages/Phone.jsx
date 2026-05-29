import React, { useState, useEffect } from 'react';
import { Phone, PhoneIncoming, PhoneOff, Voicemail, Plus, Trash2, Settings, Search } from 'lucide-react';
import api from '../api';

function fmtNum(n) {
  if (!n) return '—';
  const d = n.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') return `+1 (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  return n;
}

function fmtDur(secs) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDt(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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
    } finally {
      setSaving(false);
    }
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
            Respect business hours (forward only when open)
          </label>
        </div>
        {form.business_hours_only && (
          <div className="form-group">
            <label>After-hours voicemail message</label>
            <textarea value={form.after_hours_message} onChange={e => setForm(p => ({ ...p, after_hours_message: e.target.value }))} rows={3} placeholder="Thank you for calling. We're currently closed. Please leave a message..." />
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
  const [results,  setResults]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [provisioning, setProvisioning] = useState(null);
  const [error, setError] = useState('');

  async function search() {
    setLoading(true); setError(''); setResults([]);
    try {
      const r = await api.post('/phone/numbers/search', { area_code: areaCode });
      setResults(r.data);
      if (!r.data.length) setError('No numbers found for that area code. Try another.');
    } catch (err) {
      setError(err.response?.data?.error || 'Search failed.');
    } finally {
      setLoading(false);
    }
  }

  async function provision(phoneNumber) {
    setProvisioning(phoneNumber);
    try {
      const r = await api.post('/phone/numbers/provision', { phone_number: phoneNumber });
      onDone(r.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not provision number.');
      setProvisioning(null);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 14, padding: 28, maxWidth: 480, width: '100%' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 20 }}>Add Phone Number</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            value={areaCode}
            onChange={e => setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
            placeholder="Area code (e.g. 813)"
            style={{ flex: 1 }}
          />
          <button className="btn-primary" onClick={search} disabled={loading || !areaCode}>
            {loading ? 'Searching…' : <><Search size={13} /> Search</>}
          </button>
        </div>

        {error && <p style={{ color: '#C62828', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        {results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
            {results.map(n => (
              <div key={n.phone_number} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid var(--lightgray)', borderRadius: 8 }}>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 14, color: 'var(--navy)', fontWeight: 600 }}>
                  {fmtNum(n.phone_number)}
                </span>
                <button
                  className="btn-primary"
                  style={{ fontSize: 12, padding: '5px 14px' }}
                  disabled={!!provisioning}
                  onClick={() => provision(n.phone_number)}
                >
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

// ─── Main Phone Page ──────────────────────────────────────────────────────────
export default function PhonePage() {
  const [tab, setTab] = useState('numbers');
  const [numbers, setNumbers] = useState([]);
  const [calls,   setCalls]   = useState([]);
  const [vms,     setVms]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [showProvision, setShowProvision] = useState(false);
  const [editingNum, setEditingNum] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
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
      } else {
        const r = await api.get('/phone/voicemails');
        setVms(r.data);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }

  async function releaseNumber(id) {
    if (!confirm('Release this number? It will be returned to Telnyx and you will lose it.')) return;
    try {
      await api.delete(`/phone/numbers/${id}`);
      setNumbers(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      setError(err.response?.data?.error || 'Could not release number.');
    }
  }

  async function markVmRead(id) {
    await api.patch(`/phone/voicemails/${id}/read`).catch(() => {});
    setVms(prev => prev.map(v => v.id === id ? { ...v, is_read: true } : v));
  }

  const unreadVms = vms.filter(v => !v.is_read).length;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 48 }}>
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--navy)' }}>Phone</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--steel)', fontSize: 14 }}>Business phone numbers, call log, and voicemail</p>
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--lightgray)', marginBottom: 24 }}>
        {[
          { key: 'numbers', label: 'Numbers' },
          { key: 'calls',   label: 'Call Log' },
          { key: 'vms',     label: `Voicemail${unreadVms > 0 ? ` (${unreadVms})` : ''}` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 18px', border: 'none',
            borderBottom: tab === t.key ? '2px solid var(--navy)' : '2px solid transparent',
            background: 'none', fontSize: 14, fontWeight: tab === t.key ? 700 : 400,
            color: tab === t.key ? 'var(--navy)' : 'var(--steel)', cursor: 'pointer', marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {loading && <p style={{ color: 'var(--steel)', fontSize: 14 }}>Loading…</p>}

      {/* Numbers Tab */}
      {!loading && tab === 'numbers' && (
        <>
          {numbers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--steel)' }}>
              <Phone size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No phone numbers yet</div>
              <div style={{ fontSize: 14, marginBottom: 20 }}>Add a business phone number to start receiving calls.</div>
              <button className="btn-primary" onClick={() => setShowProvision(true)}><Plus size={14} /> Add Number</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {numbers.map(n => (
                <div key={n.id} style={{ background: 'white', border: '1px solid var(--lightgray)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Phone size={14} style={{ color: 'var(--navy)', flexShrink: 0 }} />
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>{fmtNum(n.number)}</span>
                      <span style={{ fontSize: 11, background: n.is_active ? '#f0fdf4' : '#f1f5f9', color: n.is_active ? '#15803d' : '#64748b', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                        {n.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--steel)' }}>
                      {n.label || 'Unlabeled'} {n.forward_to ? `· Forwarding to ${fmtNum(n.forward_to)}` : '· No forwarding set'}
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

      {/* Call Log Tab */}
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
                    {['Direction', 'From', 'To', 'Client', 'Status', 'Duration', 'Time'].map(h => (
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
                            : <Phone size={13} style={{ color: 'var(--navy)' }} />
                          }
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

      {/* Voicemail Tab */}
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
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--steel)', fontStyle: 'italic', lineHeight: 1.6 }}>
                      "{v.transcription}"
                    </p>
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
