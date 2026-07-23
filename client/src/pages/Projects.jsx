import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

const STATUSES = ['draft','active','on_hold','completed','cancelled'];
const STATUS_LABELS = {
  draft:     'Draft',
  active:    'Active',
  on_hold:   'On Hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

const EMPTY_FORM = {
  name: '', description: '', client_id: '', status: 'active',
  start_date: '', end_date: '', location: '',
};

export default function Projects() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [projects,  setProjects]  = useState([]);
  const [clients,   setClients]   = useState([]);
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
    api.get(`/projects${params}`)
      .then(r => setProjects(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [filter]);

  useEffect(() => {
    api.get('/clients').then(r => setClients(r.data)).catch(() => {});
  }, []);

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowForm(true);
  }

  function openEdit(project) {
    setEditing(project);
    setForm({
      name:        project.name        || '',
      description: project.description || '',
      client_id:   project.client_id   || '',
      status:      project.status      || 'active',
      start_date:  project.start_date  ? project.start_date.slice(0, 10) : '',
      end_date:    project.end_date    ? project.end_date.slice(0, 10)   : '',
      location:    project.location    || '',
    });
    setError('');
    setShowForm(true);
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        client_id:  form.client_id  || null,
        start_date: form.start_date || null,
        end_date:   form.end_date   || null,
        location:   form.location   || null,
      };
      if (editing) {
        await api.patch(`/projects/${editing.id}`, payload);
      } else {
        await api.post('/projects', payload);
      }
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save project.');
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id) {
    if (!window.confirm('Cancel this project?')) return;
    try {
      await api.delete(`/projects/${id}`);
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
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>Projects</h2>
          <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>Multi-phase jobs, crews, and locations</div>
        </div>
        {isOwnerOrManager && (
          <button className="tb-btn tb-primary" onClick={openNew}>+ New Project</button>
        )}
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
        ) : projects.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--steel)', fontSize: 13 }}>
            No projects yet.
            {isOwnerOrManager && (
              <button className="tb-btn tb-ghost" style={{ marginLeft: 8 }} onClick={openNew}>Create one →</button>
            )}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--navy)' }}>
                {['Name', 'Client', 'Status', 'Start', 'End', 'Location', ''].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                    color: 'rgba(255,255,255,.55)', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.map((p, i) => (
                <tr key={p.id}
                  style={{ borderBottom: i < projects.length - 1 ? '1px solid var(--lightgray)' : 'none',
                    cursor: isOwnerOrManager ? 'pointer' : 'default', transition: 'background .1s' }}
                  onClick={() => isOwnerOrManager && openEdit(p)}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--offwhite)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--navy)' }}>{p.name}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--slate)' }}>{p.client_name || '—'}</td>
                  <td style={{ padding: '11px 14px' }}>
                    <StatusBadge status={p.status}>{STATUS_LABELS[p.status]}</StatusBadge>
                  </td>
                  <td style={{ padding: '11px 14px', color: 'var(--slate)', whiteSpace: 'nowrap' }}>{fmtDate(p.start_date)}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--slate)', whiteSpace: 'nowrap' }}>{fmtDate(p.end_date)}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--slate)' }}>{p.location || '—'}</td>
                  <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                    {user?.role === 'owner' && p.status !== 'cancelled' && (
                      <button
                        className="tb-btn tb-ghost"
                        style={{ fontSize: 11, padding: '3px 10px' }}
                        onClick={ev => { ev.stopPropagation(); cancel(p.id); }}
                      >
                        Cancel
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
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--navy)' }}>{editing ? 'Edit Project' : 'New Project'}</div>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--steel)' }}>×</button>
            </div>

            <form onSubmit={save} style={{ padding: 24, flex: 1 }}>
              {error && <div style={{ padding: '10px 14px', background: '#fff0f0', border: '1px solid #fca5a5', borderRadius: 6, color: '#b91c1c', fontSize: 12, marginBottom: 16 }}>{error}</div>}

              <div style={fieldStyle}>
                <label style={labelStyle}>Project Name *</label>
                <input style={inputStyle} value={form.name} onChange={f('name')} required placeholder="e.g. Main Street Office Renovation" />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Description</label>
                <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.description} onChange={f('description')} placeholder="Scope of work or project details" />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Client</label>
                <select style={inputStyle} value={form.client_id} onChange={f('client_id')}>
                  <option value="">— No client assigned —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Status</label>
                <select style={inputStyle} value={form.status} onChange={f('status')}>
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Start Date</label>
                  <input style={inputStyle} type="date" value={form.start_date} onChange={f('start_date')} />
                </div>
                <div>
                  <label style={labelStyle}>End Date</label>
                  <input style={inputStyle} type="date" value={form.end_date} onChange={f('end_date')} />
                </div>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Location / Address</label>
                <input style={inputStyle} value={form.location} onChange={f('location')} placeholder="Project site address" />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="submit" className="tb-btn tb-primary" disabled={saving} style={{ flex: 1 }}>
                  {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Project'}
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
