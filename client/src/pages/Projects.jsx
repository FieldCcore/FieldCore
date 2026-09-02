import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import ClientLocationField from '../components/ClientLocationField';

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
  if (!cents) return '—';
  return '$' + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPrjNum(n) {
  if (!n) return '—';
  return 'PRJ-' + String(n).padStart(4, '0');
}

const EMPTY_FORM = {
  name: '', description: '', client_id: '', status: 'active',
  start_date: '', end_date: '', manager_id: '',
  contract_value: '', billing_model: 'fixed',
  service_address: '', location_id: null,
};

export default function Projects() {
  const [searchParams] = useSearchParams();
  const nav = useNavigate();
  const { user } = useAuth();

  const [projects,  setProjects]  = useState([]);
  const [users,     setUsers]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState('');
  const [search,    setSearch]    = useState('');
  const [showForm,  setShowForm]  = useState(searchParams.get('new') === '1');
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);
  const [formError, setFormError] = useState('');

  const searchTimer = useRef(null);
  const isOwnerOrManager = ['owner', 'manager'].includes(user?.role);

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
    if (!isOwnerOrManager) return;
    api.get('/users').then(r => setUsers(r.data || [])).catch(() => {});
  }, [isOwnerOrManager]);

  function handleSearchChange(val) {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(), 350);
  }

  function openNew() {
    setForm(EMPTY_FORM);
    setFormError('');
    setShowForm(true);
  }

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        ...form,
        client_id:      form.client_id      || null,
        manager_id:     form.manager_id     || null,
        contract_value: form.contract_value ? Math.round(parseFloat(form.contract_value) * 100) : 0,
        start_date:     form.start_date     || null,
        end_date:       form.end_date       || null,
        location_id:    form.location_id    || null,
        service_address: form.service_address || null,
      };
      const res = await api.post('/projects', payload);
      setShowForm(false);
      nav(`/projects/${res.data.id}`);
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to create project.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="prj-list-wrap">
      {/* Page header */}
      <div className="prj-list-header">
        <div>
          <h2 className="prj-list-title">Projects</h2>
          <div className="prj-list-subtitle">Multi-phase work, crews, and locations</div>
        </div>
        {isOwnerOrManager && (
          <button className="tb-btn tb-primary" onClick={openNew}>
            + New Project
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="prj-toolbar">
        {/* Status filter pills */}
        <div className="prj-status-filters">
          <button
            className={`prj-status-pill${!filter ? ' prj-status-pill--active' : ''}`}
            onClick={() => setFilter('')}
          >All</button>
          {STATUSES.map(s => (
            <button
              key={s}
              className={`prj-status-pill${filter === s ? ' prj-status-pill--active' : ''}`}
              onClick={() => setFilter(s)}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {/* Search */}
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
            <button className="prj-search-clear" onClick={() => { setSearch(''); load(); }} aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="prj-state">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="prj-empty">
          <p className="prj-empty-primary">No projects{filter || search ? ' match your filters' : ' yet'}.</p>
          {isOwnerOrManager && !filter && !search && (
            <p className="prj-empty-secondary">
              <button className="tb-btn tb-ghost" onClick={openNew}>Create your first project →</button>
            </p>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Project #</th>
                <th>Name</th>
                <th>Client</th>
                <th>Status</th>
                <th>Manager</th>
                <th>Work Orders</th>
                <th>Contract Value</th>
                <th>Start</th>
              </tr>
            </thead>
            <tbody>
              {projects.map(p => (
                <tr
                  key={p.id}
                  className="clickable-row"
                  onClick={() => nav(`/projects/${p.id}`)}
                >
                  <td>
                    <span className="prj-num">{fmtPrjNum(p.project_number)}</span>
                  </td>
                  <td>
                    <strong>{p.name}</strong>
                    {p.description && (
                      <span className="prj-desc-preview">{p.description}</span>
                    )}
                  </td>
                  <td>{p.client_name || <span className="prj-muted">—</span>}</td>
                  <td><StatusBadge status={p.status}>{STATUS_LABELS[p.status]}</StatusBadge></td>
                  <td>{p.manager_name || <span className="prj-muted">—</span>}</td>
                  <td>
                    <span className="prj-wo-count">
                      {p.work_order_count === 0 ? '—' : p.work_order_count}
                    </span>
                  </td>
                  <td>{fmtMoney(p.contract_value)}</td>
                  <td className="prj-date">{fmtDate(p.start_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Project drawer */}
      {showForm && (
        <div
          className="prj-drawer-overlay"
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}
        >
          <div className="prj-drawer">
            <div className="prj-drawer-header">
              <span className="prj-drawer-title">New Project</span>
              <button
                className="prj-drawer-close"
                onClick={() => setShowForm(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={save} className="prj-drawer-body">
              {formError && (
                <div className="prj-form-error">{formError}</div>
              )}

              <div className="form-group">
                <label>Project Name *</label>
                <input
                  value={form.name}
                  onChange={set('name')}
                  required
                  placeholder="e.g. Main Street Office Renovation"
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={form.description}
                  onChange={set('description')}
                  rows={3}
                  placeholder="Scope of work or project details"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Status</label>
                  <select value={form.status} onChange={set('status')}>
                    {STATUSES.map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
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
                  type="number"
                  min="0"
                  step="0.01"
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
                  <label>End Date</label>
                  <input type="date" value={form.end_date} onChange={set('end_date')} />
                </div>
              </div>

              <div className="form-group">
                <label>Site Address</label>
                <ClientLocationField
                  clientId={null}
                  locationId={form.location_id}
                  address={form.service_address}
                  onSelect={loc => setForm(prev => ({
                    ...prev,
                    location_id:     loc.location_id || null,
                    service_address: loc.address
                      ? [loc.address, loc.city, loc.state, loc.zip].filter(Boolean).join(', ')
                      : prev.service_address,
                  }))}
                  onAddressChange={v => setForm(prev => ({
                    ...prev, service_address: v, location_id: null,
                  }))}
                />
              </div>

              <div className="prj-drawer-actions">
                <button type="submit" className="tb-btn tb-primary" disabled={saving}>
                  {saving ? 'Creating…' : 'Create Project'}
                </button>
                <button
                  type="button"
                  className="tb-btn tb-ghost"
                  onClick={() => setShowForm(false)}
                >
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
