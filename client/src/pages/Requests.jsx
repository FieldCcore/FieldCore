import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

const STATUSES = ['new','contacted','awaiting_review','confirmed','converted','declined','closed'];
const STATUS_LABELS = {
  new:             'New',
  contacted:       'Contacted',
  awaiting_review: 'Awaiting Review',
  confirmed:       'Confirmed',
  converted:       'Converted',
  declined:        'Declined',
  closed:          'Closed',
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

const EMPTY_FORM = {
  client_name: '', client_email: '', client_phone: '',
  service_type: '', requested_date: '', preferred_time: '',
  location: '', notes: '', source: 'direct', status: 'new',
  assigned_to: '', follow_up_date: '',
};

export default function Requests() {
  const nav  = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [requests,  setRequests]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState('');
  const [showForm,  setShowForm]  = useState(searchParams.get('new') === '1');
  const [editing,   setEditing]   = useState(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  const isOwnerOrManager = ['owner', 'manager'].includes(user?.role);

  function load() {
    setLoading(true);
    const params = filter ? `?status=${filter}` : '';
    api.get(`/requests${params}`)
      .then(r => setRequests(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [filter]);

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowForm(true);
  }

  function openEdit(req) {
    setEditing(req);
    setForm({
      client_name:    req.client_name   || '',
      client_email:   req.client_email  || '',
      client_phone:   req.client_phone  || '',
      service_type:   req.service_type  || '',
      requested_date: req.requested_date ? req.requested_date.slice(0, 10) : '',
      preferred_time: req.preferred_time || '',
      location:       req.location      || '',
      notes:          req.notes         || '',
      source:         req.source        || 'direct',
      status:         req.status        || 'new',
      assigned_to:    req.assigned_to   || '',
      follow_up_date: req.follow_up_date ? req.follow_up_date.slice(0, 10) : '',
    });
    setError('');
    setShowForm(true);
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await api.patch(`/requests/${editing.id}`, form);
      } else {
        await api.post('/requests', form);
      }
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save request.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Close this request?')) return;
    try {
      await api.delete(`/requests/${id}`);
      load();
    } catch {}
  }

  function f(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  const inputStyle = {
    width: '100%', padding: '8px 10px', border: '1px solid var(--lightgray)',
    borderRadius: 6, fontSize: 13, fontFamily: 'inherit', background: 'var(--white)',
    color: 'var(--navy)', boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: 11, fontWeight: 600, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '.04em', display: 'block', marginBottom: 4 };
  const fieldStyle = { marginBottom: 14 };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>Requests</h2>
          <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>Inbound leads and service requests</div>
        </div>
        <button className="tb-btn tb-primary" onClick={openNew}>+ New Request</button>
      </div>

      {/* Status filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        <button
          onClick={() => setFilter('')}
          style={{ padding: '5px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, border: '1px solid var(--lightgray)',
            background: !filter ? 'var(--navy)' : 'var(--white)', color: !filter ? 'var(--sand)' : 'var(--navy)', cursor: 'pointer' }}
        >All</button>
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{ padding: '5px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, border: '1px solid var(--lightgray)',
              background: filter === s ? 'var(--navy)' : 'var(--white)', color: filter === s ? 'var(--sand)' : 'var(--navy)', cursor: 'pointer' }}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--lightgray)', borderRadius: 10, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--steel)', fontSize: 13 }}>Loading…</div>
        ) : requests.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--steel)', fontSize: 13 }}>
            No requests yet. <button className="tb-btn tb-ghost" style={{ marginLeft: 8 }} onClick={openNew}>Add one →</button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--navy)' }}>
                {['Client', 'Service', 'Status', 'Requested', 'Source', 'Assigned To', ''].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                    color: 'rgba(255,255,255,.55)', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map((r, i) => (
                <tr key={r.id}
                  style={{ borderBottom: i < requests.length - 1 ? '1px solid var(--lightgray)' : 'none',
                    cursor: 'pointer', transition: 'background .1s' }}
                  onClick={() => openEdit(r)}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--off-white)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--navy)' }}>
                    {r.client_name_linked || r.client_name || '—'}
                  </td>
                  <td style={{ padding: '11px 14px', color: 'var(--slate)' }}>{r.service_type || '—'}</td>
                  <td style={{ padding: '11px 14px' }}>
                    <StatusBadge status={r.status}>{STATUS_LABELS[r.status]}</StatusBadge>
                  </td>
                  <td style={{ padding: '11px 14px', color: 'var(--slate)', whiteSpace: 'nowrap' }}>{fmtDate(r.requested_date)}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--slate)', textTransform: 'capitalize' }}>{r.source || '—'}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--slate)' }}>{r.assigned_to_name || '—'}</td>
                  <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                    {isOwnerOrManager && (
                      <button
                        className="tb-btn tb-ghost"
                        style={{ fontSize: 11, padding: '3px 10px' }}
                        onClick={ev => { ev.stopPropagation(); remove(r.id); }}
                      >
                        Close
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Slide-in form */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div style={{ width: '100%', maxWidth: 480, background: 'var(--white)', height: '100%', overflowY: 'auto',
            boxShadow: '-4px 0 24px rgba(0,0,0,.12)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--lightgray)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--navy)' }}>{editing ? 'Edit Request' : 'New Request'}</div>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--steel)' }}>×</button>
            </div>

            <form onSubmit={save} style={{ padding: 24, flex: 1 }}>
              {error && <div style={{ padding: '10px 14px', background: '#fff0f0', border: '1px solid #fca5a5', borderRadius: 6, color: '#b91c1c', fontSize: 12, marginBottom: 16 }}>{error}</div>}

              <div style={{ ...fieldStyle }}>
                <label style={labelStyle}>Client Name *</label>
                <input style={inputStyle} value={form.client_name} onChange={f('client_name')} required placeholder="Full name" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input style={inputStyle} type="email" value={form.client_email} onChange={f('client_email')} placeholder="email@example.com" />
                </div>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input style={inputStyle} type="tel" value={form.client_phone} onChange={f('client_phone')} placeholder="+1..." />
                </div>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Service Type</label>
                <input style={inputStyle} value={form.service_type} onChange={f('service_type')} placeholder="e.g. HVAC Install, Plumbing" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Requested Date</label>
                  <input style={inputStyle} type="date" value={form.requested_date} onChange={f('requested_date')} />
                </div>
                <div>
                  <label style={labelStyle}>Preferred Time</label>
                  <input style={inputStyle} value={form.preferred_time} onChange={f('preferred_time')} placeholder="e.g. Morning, 2pm" />
                </div>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Location / Address</label>
                <input style={inputStyle} value={form.location} onChange={f('location')} placeholder="Service address" />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Notes</label>
                <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.notes} onChange={f('notes')} placeholder="Client notes or description of request" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Source</label>
                  <select style={inputStyle} value={form.source} onChange={f('source')}>
                    {['direct','phone','website','referral','google','facebook','instagram','other'].map(s => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select style={inputStyle} value={form.status} onChange={f('status')}>
                    {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </div>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Follow-up Date</label>
                <input style={inputStyle} type="date" value={form.follow_up_date} onChange={f('follow_up_date')} />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="submit" className="tb-btn tb-primary" disabled={saving} style={{ flex: 1 }}>
                  {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Request'}
                </button>
                <button type="button" className="tb-btn tb-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
