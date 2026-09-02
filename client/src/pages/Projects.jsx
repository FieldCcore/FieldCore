import React, { useEffect, useState, useRef, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, X, MoreHorizontal, ExternalLink, Edit2, FolderX, Plus } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import ClientLocationField from '../components/ClientLocationField';

// ── Helpers ───────────────────────────────────────────────
const STATUSES = ['draft', 'active', 'on_hold', 'completed', 'cancelled'];
const STATUS_LABELS = {
  draft: 'Draft', active: 'Active', on_hold: 'On Hold',
  completed: 'Completed', cancelled: 'Cancelled',
};
const BILLING_LABELS = {
  fixed: 'Fixed Price', time_materials: 'Time & Materials', cost_plus: 'Cost Plus',
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtMoney(cents) {
  if (!cents && cents !== 0) return '—';
  if (cents === 0) return '—';
  return '$' + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPrjNum(n) {
  if (!n) return null;
  return 'PRJ-' + String(n).padStart(4, '0');
}
function initials(name) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ── Portal client search dropdown ─────────────────────────
// Renders outside the drawer's overflow container so it's never clipped.
function ClientPortalDrop({ anchorRef, results, onSelect, visible }) {
  const [rect, setRect] = useState(null);

  useLayoutEffect(() => {
    if (!visible || !anchorRef.current) { setRect(null); return; }
    const r = anchorRef.current.getBoundingClientRect();
    setRect({ top: r.bottom + 2, left: r.left, width: r.width });
  }, [visible, results, anchorRef]);

  if (!visible || !results.length || !rect) return null;

  return createPortal(
    <div style={{
      position: 'fixed',
      top: rect.top,
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
      background: '#fff',
      border: '1px solid var(--lightgray)',
      borderRadius: 8,
      boxShadow: '0 4px 20px rgba(28,35,51,.14)',
      overflow: 'hidden',
      maxHeight: 220,
      overflowY: 'auto',
    }}>
      {results.map((c, i) => (
        <button
          key={c.id}
          type="button"
          onMouseDown={() => onSelect(c)}
          style={{
            display: 'flex', flexDirection: 'column', gap: 2,
            padding: '9px 12px', width: '100%', background: 'none',
            border: 'none',
            borderBottom: i < results.length - 1 ? '1px solid var(--lightgray)' : 'none',
            cursor: 'pointer', textAlign: 'left', transition: 'background .1s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--offwhite)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{c.name}</span>
          {c.email && <span style={{ fontSize: 11, color: 'var(--steel)' }}>{c.email}</span>}
          {c.phone && !c.email && <span style={{ fontSize: 11, color: 'var(--steel)' }}>{c.phone}</span>}
        </button>
      ))}
    </div>,
    document.body
  );
}

const EMPTY_FORM = {
  name: '', description: '',
  client_id: '', client_name: '',
  status: 'active', billing_model: 'fixed',
  contract_value: '', manager_id: '',
  start_date: '', end_date: '',
  service_address: '', service_city: '', service_state: '', service_zip: '',
  location_id: null,
};

export default function Projects() {
  const [searchParams] = useSearchParams();
  const nav = useNavigate();
  const { user } = useAuth();

  const [projects,   setProjects]   = useState([]);
  const [users,      setUsers]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState('');
  const [search,     setSearch]     = useState('');
  const [showForm,   setShowForm]   = useState(searchParams.get('new') === '1');
  const [formMode,   setFormMode]   = useState('create');
  const [editingId,  setEditingId]  = useState(null);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [saving,     setSaving]     = useState(false);
  const [formError,  setFormError]  = useState('');
  const [openMenuId, setOpenMenuId] = useState(null);

  // Client autocomplete
  const [clientQuery,    setClientQuery]    = useState('');
  const [clientResults,  setClientResults]  = useState([]);
  const [showClientDrop, setShowClientDrop] = useState(false);
  const clientTimer  = useRef(null);
  const clientInputRef = useRef(null);

  const menuRef     = useRef(null);
  const searchTimer = useRef(null);
  const isOwnerOrMgr = ['owner', 'manager'].includes(user?.role);

  // ── Data loading ──────────────────────────────────────
  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter) params.set('status', filter);
    if (search.trim()) params.set('search', search.trim());
    api.get(`/projects?${params}`)
      .then(r => setProjects(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter, search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isOwnerOrMgr) {
      api.get('/users').then(r => setUsers(r.data || [])).catch(() => {});
    }
  }, [isOwnerOrMgr]);

  // Close menu on outside click
  useEffect(() => {
    if (!openMenuId) return;
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenuId(null);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuId]);

  // Close client drop on outside click
  useEffect(() => {
    if (!showClientDrop) return;
    function handler(e) {
      if (clientInputRef.current && !clientInputRef.current.contains(e.target)) {
        setShowClientDrop(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showClientDrop]);

  function handleSearchChange(val) {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(load, 350);
  }

  // ── Client autocomplete ───────────────────────────────
  function handleClientInput(val) {
    setClientQuery(val);
    setForm(p => ({ ...p, client_id: '', client_name: val }));
    clearTimeout(clientTimer.current);
    if (!val.trim()) { setClientResults([]); setShowClientDrop(false); return; }
    clientTimer.current = setTimeout(async () => {
      try {
        const r = await api.get(`/clients/search?q=${encodeURIComponent(val)}`);
        const results = r.data || [];
        setClientResults(results);
        setShowClientDrop(results.length > 0);
      } catch {}
    }, 250);
  }

  function selectClient(c) {
    setForm(p => ({
      ...p,
      client_id:       c.id,
      client_name:     c.name,
      // Clear location so ClientLocationField auto-loads the client's primary location
      location_id:     null,
      service_address: '',
      service_city:    '',
      service_state:   '',
      service_zip:     '',
    }));
    setClientQuery(c.name);
    setClientResults([]);
    setShowClientDrop(false);
  }

  // ── Location selection (from ClientLocationField) ─────
  function handleLocationSelect({ location_id, address, city, state, zip }) {
    setForm(p => ({
      ...p,
      location_id:     location_id || null,
      service_address: address     || '',
      service_city:    city        || '',
      service_state:   state       || '',
      service_zip:     zip         || '',
    }));
  }

  // ── Form open ─────────────────────────────────────────
  function openNew() {
    setFormMode('create');
    setEditingId(null);
    setForm(EMPTY_FORM);
    setClientQuery('');
    setFormError('');
    setShowForm(true);
  }

  function openEdit(p, e) {
    e?.stopPropagation();
    setFormMode('edit');
    setEditingId(p.id);
    setForm({
      name:            p.name            || '',
      description:     p.description     || '',
      client_id:       p.client_id       || '',
      client_name:     p.client_name     || '',
      status:          p.status          || 'active',
      billing_model:   p.billing_model   || 'fixed',
      contract_value:  p.contract_value  ? (p.contract_value / 100).toFixed(2) : '',
      manager_id:      p.manager_id      || '',
      start_date:      p.start_date      ? p.start_date.slice(0, 10) : '',
      end_date:        p.end_date        ? p.end_date.slice(0, 10)   : '',
      service_address: p.service_address || '',
      service_city:    p.service_city    || '',
      service_state:   p.service_state   || '',
      service_zip:     p.service_zip     || '',
      location_id:     p.location_id     || null,
    });
    setClientQuery(p.client_name || '');
    setFormError('');
    setOpenMenuId(null);
    setShowForm(true);
  }

  // ── Save ──────────────────────────────────────────────
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        name:            form.name.trim(),
        description:     form.description     || null,
        client_id:       form.client_id       || null,
        status:          form.status,
        billing_model:   form.billing_model,
        contract_value:  form.contract_value  ? Math.round(parseFloat(form.contract_value) * 100) : 0,
        manager_id:      form.manager_id      || null,
        start_date:      form.start_date      || null,
        end_date:        form.end_date        || null,
        service_address: form.service_address || null,
        service_city:    form.service_city    || null,
        service_state:   form.service_state   || null,
        service_zip:     form.service_zip     || null,
        location_id:     form.location_id     || null,
      };
      if (formMode === 'create') {
        const res = await api.post('/projects', payload);
        setShowForm(false);
        nav(`/projects/${res.data.id}`);
      } else {
        await api.patch(`/projects/${editingId}`, payload);
        setShowForm(false);
        load();
      }
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to save project.');
    } finally {
      setSaving(false);
    }
  }

  async function cancelProject(id, e) {
    e?.stopPropagation();
    if (!window.confirm('Cancel this project? Its work orders will remain but the project will be marked cancelled.')) return;
    try {
      await api.delete(`/projects/${id}`);
      setOpenMenuId(null);
      load();
    } catch {}
  }

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  // Displayed service location string for the list
  function listHealth(p) {
  if (['completed', 'cancelled'].includes(p.status)) return null;
  if (!p.end_date) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end   = new Date(p.end_date);
  if (end < today) return 'behind';
  if ((end - today) / 86400000 <= 7) return 'attention';
  return 'on_track';
}
function fmtLocation(p) {
    const parts = [p.service_address, p.service_city, p.service_state].filter(Boolean);
    return parts.join(', ') || null;
  }

  // ── Render ────────────────────────────────────────────
  return (
    <div className="prj-list-wrap">

      {/* Header — shell topbar already shows "Projects"; H1 kept hidden for a11y */}
      <h1 className="sr-only">Projects</h1>
      <div className="prj-list-header">
        <div className="prj-list-subtitle">Manage complex work, work orders, teams, and costs.</div>
        {isOwnerOrMgr && (
          <button className="tb-btn tb-primary" onClick={openNew}>
            <Plus size={14} /> New Project
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="prj-toolbar">
        <div className="prj-status-filters">
          {['', ...STATUSES].map(s => (
            <button
              key={s}
              className={`prj-status-pill${filter === s ? ' prj-status-pill--active' : ''}`}
              onClick={() => setFilter(s)}
            >
              {s ? STATUS_LABELS[s] : 'All'}
            </button>
          ))}
        </div>
        <div className="prj-search-wrap">
          <Search size={14} className="prj-search-icon" />
          <input
            className="prj-search"
            type="search"
            placeholder="Search projects…"
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
          />
          {search && (
            <button className="prj-search-clear" onClick={() => { setSearch(''); load(); }} aria-label="Clear">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="prj-state">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="prj-empty-state">
          <div className="prj-empty-icon"><FolderX size={36} strokeWidth={1.4} /></div>
          <p className="prj-empty-primary">No projects yet</p>
          <p className="prj-empty-secondary">
            Projects organize larger jobs with multiple work orders, teams,<br />
            materials, and costs.
          </p>
          {isOwnerOrMgr && !filter && !search && (
            <button className="tb-btn tb-primary" onClick={openNew} style={{ marginTop: 12 }}>
              <Plus size={14} /> Create Project
            </button>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ minWidth: 220 }}>Project</th>
                <th>Client</th>
                <th>Status</th>
                <th>Health</th>
                <th>Project Manager</th>
                <th>Start</th>
                <th>Target End</th>
                <th style={{ minWidth: 120 }}>Progress</th>
                <th style={{ textAlign: 'right' }}>Value</th>
                <th className="prj-th-actions" aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {projects.map(p => (
                <tr
                  key={p.id}
                  className="clickable-row prj-table-row"
                  onClick={() => nav(`/projects/${p.id}`)}
                >
                  <td>
                    <div className="prj-project-cell">
                      {fmtPrjNum(p.project_number) && (
                        <span className="prj-project-num">{fmtPrjNum(p.project_number)}</span>
                      )}
                      <span className="prj-project-name">{p.name}</span>
                      {fmtLocation(p) && (
                        <span className="prj-project-loc">{fmtLocation(p)}</span>
                      )}
                    </div>
                  </td>

                  <td>{p.client_name || <span className="prj-muted">—</span>}</td>

                  <td>
                    <StatusBadge status={p.status}>{STATUS_LABELS[p.status]}</StatusBadge>
                  </td>

                  <td>
                    {(() => {
                      const h = listHealth(p);
                      if (!h) return <span className="prj-muted">—</span>;
                      const cfg = {
                        on_track:  { label: 'On Track',  cls: 'prj-health-badge--on-track'  },
                        attention: { label: 'Attention', cls: 'prj-health-badge--attention' },
                        behind:    { label: 'Behind',    cls: 'prj-health-badge--behind'    },
                      };
                      const { label, cls } = cfg[h];
                      return <span className={`prj-health-badge ${cls}`}>{label}</span>;
                    })()}
                  </td>

                  <td>
                    {p.manager_name ? (
                      <div className="prj-mgr-cell">
                        <span className="prj-mgr-avatar">{initials(p.manager_name)}</span>
                        <span className="prj-mgr-name">{p.manager_name}</span>
                      </div>
                    ) : (
                      <span className="prj-muted">—</span>
                    )}
                  </td>

                  <td className="prj-date">{fmtDate(p.start_date)}</td>
                  <td className="prj-date">{fmtDate(p.end_date)}</td>

                  <td>
                    {p.work_order_count > 0 ? (
                      <div className="prj-progress-wrap">
                        <span className="prj-progress-label">
                          {p.completed_work_orders ?? 0} / {p.work_order_count} WOs
                        </span>
                        <div className="prj-progress-bar">
                          <div
                            className="prj-progress-fill"
                            style={{
                              width: `${Math.round(((p.completed_work_orders ?? 0) / p.work_order_count) * 100)}%`
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="prj-muted">No WOs</span>
                    )}
                  </td>

                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtMoney(p.contract_value)}
                  </td>

                  <td className="prj-td-actions" onClick={e => e.stopPropagation()}>
                    <div className={`prj-row-actions${openMenuId === p.id ? ' prj-row-actions--open' : ''}`}>
                      <div className="prj-action-menu-wrap" ref={openMenuId === p.id ? menuRef : null}>
                        <button
                          className="prj-action-btn"
                          aria-label="Row actions"
                          onClick={() => setOpenMenuId(openMenuId === p.id ? null : p.id)}
                        >
                          <MoreHorizontal size={14} />
                        </button>
                        {openMenuId === p.id && (
                          <div className="prj-action-drop">
                            <button
                              className="prj-action-drop-item"
                              onClick={() => { nav(`/projects/${p.id}`); setOpenMenuId(null); }}
                            >
                              <ExternalLink size={13} /> Open Project
                            </button>
                            {isOwnerOrMgr && (
                              <button
                                className="prj-action-drop-item"
                                onClick={e => openEdit(p, e)}
                              >
                                <Edit2 size={13} /> Edit Project
                              </button>
                            )}
                            <button
                              className="prj-action-drop-item"
                              onClick={() => { window.open(`/projects/${p.id}`, '_blank'); setOpenMenuId(null); }}
                            >
                              <ExternalLink size={13} /> Open in New Tab
                            </button>
                            {p.status !== 'cancelled' && isOwnerOrMgr && (
                              <>
                                <div className="prj-action-drop-sep" />
                                <button
                                  className="prj-action-drop-item prj-action-drop-item--danger"
                                  onClick={e => cancelProject(p.id, e)}
                                >
                                  <FolderX size={13} /> Cancel Project
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New / Edit Project drawer */}
      {showForm && (
        <div
          className="prj-drawer-overlay"
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}
        >
          <div className="prj-drawer">
            <div className="prj-drawer-header">
              <span className="prj-drawer-title">
                {formMode === 'create' ? 'New Project' : 'Edit Project'}
              </span>
              <button className="prj-drawer-close" onClick={() => setShowForm(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={save} className="prj-drawer-body">
              {formError && <div className="prj-form-error">{formError}</div>}

              <div className="form-group">
                <label>Project Name *</label>
                <input value={form.name} onChange={set('name')} required placeholder="e.g. Equipment Demobilization" />
              </div>

              {/* Client — portal autocomplete so it's never clipped by overflow */}
              <div className="form-group">
                <label>Client</label>
                <input
                  ref={clientInputRef}
                  value={clientQuery}
                  onChange={e => handleClientInput(e.target.value)}
                  onFocus={() => clientResults.length > 0 && setShowClientDrop(true)}
                  placeholder="Search by name, email, or phone…"
                  autoComplete="off"
                />
                <ClientPortalDrop
                  anchorRef={clientInputRef}
                  results={clientResults}
                  onSelect={selectClient}
                  visible={showClientDrop}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Status</label>
                  <select value={form.status} onChange={set('status')}>
                    {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Billing Model</label>
                  <select value={form.billing_model} onChange={set('billing_model')}>
                    {Object.entries(BILLING_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Contract Value ($)</label>
                <input
                  type="number" min="0" step="0.01"
                  value={form.contract_value}
                  onChange={set('contract_value')}
                  placeholder="0.00"
                />
              </div>

              <div className="form-group">
                <label>Project Manager</label>
                <select value={form.manager_id} onChange={set('manager_id')}>
                  <option value="">— Unassigned —</option>
                  {users.filter(u => ['owner', 'manager'].includes(u.role)).map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Start Date</label>
                  <input type="date" value={form.start_date} onChange={set('start_date')} />
                </div>
                <div className="form-group">
                  <label>Target End Date</label>
                  <input type="date" value={form.end_date} onChange={set('end_date')} />
                </div>
              </div>

              {/* Project location — uses shared ClientLocationField */}
              <div className="form-group">
                <label>Project Location</label>
                <ClientLocationField
                  clientId={form.client_id || null}
                  locationId={form.location_id}
                  address={form.service_address}
                  onSelect={handleLocationSelect}
                  onAddressChange={v => setForm(p => ({ ...p, service_address: v, location_id: null }))}
                />
                {(form.service_city || form.service_state) && (
                  <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 4 }}>
                    {[form.service_city, form.service_state, form.service_zip].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Description / Scope</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={set('description')}
                  placeholder="Scope of work or project details"
                />
              </div>

              <div className="prj-drawer-actions">
                <button type="submit" className="tb-btn tb-primary" disabled={saving}>
                  {saving ? 'Saving…' : formMode === 'create' ? 'Create Project' : 'Save Changes'}
                </button>
                <button type="button" className="tb-btn tb-ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
