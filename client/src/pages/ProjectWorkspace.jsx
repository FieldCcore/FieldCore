import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import JobTeamSelector from '../components/JobTeamSelector';
import {
  ChevronLeft, Plus, X, Check, Trash2, Share2,
  ChevronDown, ChevronUp, Search, AlertTriangle, Link, UserPlus,
} from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

// ── Helpers ───────────────────────────────────────────────
const STATUS_LABELS = {
  draft: 'Draft', active: 'Active', on_hold: 'On Hold',
  completed: 'Completed', cancelled: 'Cancelled',
};
const WO_STATUSES = [
  'unscheduled', 'draft', 'scheduled', 'in_progress', 'paused', 'complete', 'cancelled',
];
const WO_STATUS_LABELS = {
  unscheduled: 'Unscheduled', draft: 'Draft', scheduled: 'Scheduled',
  in_progress: 'In Progress', paused: 'Paused', complete: 'Completed', cancelled: 'Cancelled',
};
const WO_CREATE_STATUSES = ['draft', 'scheduled', 'in_progress', 'paused', 'complete', 'cancelled'];
const BILLING_LABELS = {
  fixed: 'Fixed Price', time_materials: 'Time & Materials', cost_plus: 'Cost Plus',
};
const ACTIVITY_ICONS = {
  created: '✦', status_changed: '⟳', work_order_added: '＋', cancelled: '✕', note: '◆',
  change_order_added: '△', change_order_status: '◈', work_order_shared: '⤴',
};
const WO_STATUS_ORDER = [
  'unscheduled', 'draft', 'scheduled', 'in_progress', 'paused', 'complete', 'cancelled',
];

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}
function fmtMoney(cents) {
  if (cents == null || cents === 0) return '$0.00';
  return '$' + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPrjNum(n) {
  if (!n) return '—';
  return 'PRJ-' + String(n).padStart(4, '0');
}
function fmtWoNum(n) {
  if (!n) return '?';
  return 'WO-' + String(n).padStart(3, '0');
}
function initials(name) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}
function fmtPhone(raw) {
  if (!raw) return '—';
  const d = String(raw).replace(/\D/g, '');
  const n = d.length === 11 && d[0] === '1' ? d.slice(1) : d;
  if (n.length !== 10) return raw;
  return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
}

function fmtCoNum(n) {
  if (!n) return '?';
  return 'CO-' + String(n).padStart(3, '0');
}

// ── Duration helpers ──────────────────────────────────────
const MINS_PER_BDAY = 480; // 8-hour business day
function minutesToParts(total) {
  const t = Math.max(0, total || 0);
  return { d: Math.floor(t / MINS_PER_BDAY), h: Math.floor((t % MINS_PER_BDAY) / 60), m: t % 60 };
}
function DurationPicker({ value, onChange }) {
  const { d, h, m } = minutesToParts(value);
  function upd(nd, nh, nm) {
    onChange(
      Math.max(0, parseInt(nd) || 0) * MINS_PER_BDAY +
      Math.min(23, Math.max(0, parseInt(nh) || 0)) * 60 +
      Math.min(59, Math.max(0, parseInt(nm) || 0))
    );
  }
  return (
    <div className="prj-dur-picker">
      <div className="prj-dur-unit">
        <input type="number" min="0" max="99" value={d} onChange={e => upd(e.target.value, h, m)} />
        <span>days</span>
      </div>
      <div className="prj-dur-unit">
        <input type="number" min="0" max="23" value={h} onChange={e => upd(d, e.target.value, m)} />
        <span>hrs</span>
      </div>
      <div className="prj-dur-unit">
        <input type="number" min="0" max="59" value={m} onChange={e => upd(d, h, e.target.value)} />
        <span>min</span>
      </div>
    </div>
  );
}

// ── Asset Picker ──────────────────────────────────────────
function AssetPicker({ value, assetName, onChange, clientId }) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [open, setOpen]         = useState(false);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef(null);
  const timer    = useRef(null);

  useEffect(() => {
    if (!open || !query.trim()) { setResults([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const params = { search: query.trim() };
        if (clientId) params.client_id = clientId;
        const r = await api.get('/assets', { params });
        setResults(r.data || []);
      } catch {}
    }, 250);
  }, [query, open, clientId]);

  function select(asset) {
    onChange(asset.id, asset.name);
    setOpen(false);
    setQuery('');
    setResults([]);
  }

  function clear() { onChange(null, null); }

  async function createAsset() {
    if (!query.trim()) return;
    setCreating(true);
    try {
      const r = await api.post('/assets', {
        name: query.trim(),
        client_id: clientId || null,
      });
      select(r.data);
    } catch {}
    setCreating(false);
  }

  if (value) {
    return (
      <div className="prj-asset-selected">
        <span className="prj-asset-selected-name">{assetName || value}</span>
        <button type="button" className="prj-asset-clear" onClick={clear} aria-label="Clear asset">
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="prj-asset-picker" style={{ position: 'relative' }}>
      <div className="prj-asset-input-wrap">
        <Search size={13} className="prj-asset-search-icon" />
        <input
          ref={inputRef}
          className="prj-asset-input"
          placeholder="Search or name a new asset…"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && (query.trim() || results.length > 0) && (
        <div className="prj-asset-drop">
          {results.map(a => (
            <button key={a.id} type="button" className="prj-asset-drop-item" onMouseDown={() => select(a)}>
              <span className="prj-asset-drop-name">{a.name}</span>
              {a.unit_number && <span className="prj-asset-drop-sub">Unit {a.unit_number}</span>}
              {a.asset_type  && <span className="prj-asset-drop-sub">{a.asset_type}</span>}
            </button>
          ))}
          {query.trim() && (
            <button type="button" className="prj-asset-drop-item prj-asset-drop-create" onMouseDown={createAsset} disabled={creating}>
              <Plus size={12} /> {creating ? 'Creating…' : `Create "${query.trim()}"`}
            </button>
          )}
          {!query.trim() && results.length === 0 && (
            <div className="prj-asset-drop-empty">Type to search assets</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Project Health Card ───────────────────────────────────
function ProjectHealthCard({ health, reason, nextAction }) {
  if (!health) return null;
  const config = {
    on_track:  { label: 'On Track',         cls: 'prj-health--on-track',  icon: '●' },
    attention: { label: 'Attention Needed',  cls: 'prj-health--attention', icon: '▲' },
    behind:    { label: 'Behind',            cls: 'prj-health--behind',    icon: '■' },
  };
  const { label, cls, icon } = config[health] || config.on_track;

  return (
    <div className={`prj-health-bar ${cls}`}>
      <div className="prj-health-left">
        <span className="prj-health-icon">{icon}</span>
        <span className="prj-health-label">{label}</span>
        {reason && <span className="prj-health-reason">{reason}</span>}
      </div>
      {nextAction && (
        <div className="prj-health-next">
          <span className="prj-health-next-label">Next:</span>
          <span className="prj-health-next-wo">{fmtWoNum(nextAction.work_order_number)} — {nextAction.title}</span>
          {nextAction.scheduled_at && (
            <span className="prj-health-next-date">{fmtDate(nextAction.scheduled_at)}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Overview Tab (V2 command center) ─────────────────────
function OverviewTab({ project, users, onRefresh, onTabChange }) {
  const [editing, setEditing]     = useState(false);
  const [form, setForm]           = useState({});
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState('');
  const [workOrders, setWorkOrders] = useState([]);
  const [fin, setFin]             = useState(null);
  const [activity, setActivity]   = useState([]);
  const [health, setHealth]       = useState(null);
  const [nextAction, setNextAction] = useState(null);
  const [loading, setLoading]     = useState(true);
  const { user } = useAuth();
  const isOwnerOrMgr = ['owner', 'manager'].includes(user?.role);

  useEffect(() => {
    Promise.allSettled([
      api.get(`/projects/${project.id}/work-orders`),
      api.get(`/projects/${project.id}/financials`),
      api.get(`/projects/${project.id}/activity`),
      api.get(`/projects/${project.id}/health`),
    ]).then(([woRes, finRes, actRes, hlRes]) => {
      if (woRes.status  === 'fulfilled') setWorkOrders(woRes.value.data || []);
      if (finRes.status === 'fulfilled') setFin(finRes.value.data || null);
      if (actRes.status === 'fulfilled') setActivity(actRes.value.data || []);
      if (hlRes.status  === 'fulfilled') {
        setHealth(hlRes.value.data?.health || null);
        setNextAction(hlRes.value.data?.next_action || null);
      }
    }).finally(() => setLoading(false));
  }, [project.id]);

  function openEdit() {
    setForm({
      name:            project.name            || '',
      description:     project.description     || '',
      status:          project.status          || 'active',
      billing_model:   project.billing_model   || 'fixed',
      contract_value:  project.contract_value  ? (project.contract_value / 100).toFixed(2) : '',
      manager_id:      project.manager_id      || '',
      start_date:      project.start_date      ? project.start_date.slice(0, 10) : '',
      end_date:        project.end_date        ? project.end_date.slice(0, 10) : '',
      service_address: project.service_address || '',
    });
    setFormError('');
    setEditing(true);
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await api.patch(`/projects/${project.id}`, {
        ...form,
        manager_id:      form.manager_id      || null,
        contract_value:  form.contract_value  ? Math.round(parseFloat(form.contract_value) * 100) : 0,
        start_date:      form.start_date      || null,
        end_date:        form.end_date        || null,
        service_address: form.service_address || null,
      });
      setEditing(false);
      onRefresh();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  // ── Edit form ─────────────────────────────────────────
  if (editing) {
    return (
      <div className="prj-overview-edit">
        <form onSubmit={save}>
          {formError && <div className="prj-form-error">{formError}</div>}
          <div className="prj-section">
            <div className="prj-section-title">Edit Project</div>
            <div className="form-group">
              <label>Project Name *</label>
              <input value={form.name} onChange={set('name')} required />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea rows={3} value={form.description} onChange={set('description')} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Status</label>
                <select value={form.status} onChange={set('status')}>
                  {Object.entries(STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
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
              <input type="number" min="0" step="0.01" value={form.contract_value} onChange={set('contract_value')} />
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
              <input value={form.service_address} onChange={set('service_address')} placeholder="Street, city, state" />
            </div>
          </div>
          <div className="prj-form-actions">
            <button type="submit" className="tb-btn tb-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" className="tb-btn tb-ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ── V2 command center ─────────────────────────────────
  const totalWOs         = project.work_order_count      ?? 0;
  const completedWOs     = project.completed_work_orders ?? 0;
  const woPct            = totalWOs > 0 ? Math.round((completedWOs / totalWOs) * 100) : 0;
  const contractValue    = fin?.current_project_value ?? project.contract_value ?? 0;
  const invoiced         = fin?.total_invoiced         ?? 0;
  const collected        = fin?.total_paid             ?? 0;
  const outstanding   = fin?.outstanding               ?? Math.max(0, invoiced - collected);
  const materialCost  = fin?.material_cost             ?? 0;
  const otherCost     = fin?.other_cost                ?? 0;
  const totalCost     = fin?.total_cost                ?? (materialCost + otherCost);
  // labor_cost is null until time-tracking exists — treat as 0 for totals
  const hasCostData   = totalCost > 0;
  const marginDollars = fin?.gross_margin_amount       ?? null;
  const marginPct     = fin?.gross_margin_pct          ?? null;
  const showMargin    = hasCostData && marginDollars != null;

  const upcoming = [...workOrders]
    .filter(wo => wo.scheduled_at && !['complete', 'cancelled'].includes(wo.status))
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
    .slice(0, 5);

  const statusCounts = {};
  for (const wo of workOrders) {
    statusCounts[wo.status] = (statusCounts[wo.status] || 0) + 1;
  }

  const techMap = {};
  for (const wo of workOrders) {
    if (wo.tech_id && wo.tech_name) techMap[wo.tech_id] = wo.tech_name;
  }
  const teamMembers = [];
  if (project.manager_name) {
    teamMembers.push({ id: project.manager_id, name: project.manager_name, role: 'Project Manager' });
  }
  for (const [id, name] of Object.entries(techMap)) {
    if (id !== project.manager_id) teamMembers.push({ id, name, role: 'Technician' });
  }

  return (
    <div className="prj-overview">
      {health && (
        <ProjectHealthCard health={health} reason={null} nextAction={nextAction} />
      )}
      {/* Row 1: KPI Cards */}
      <div className="prj-kpi-grid">
        <div className="prj-kpi-card">
          <div className="prj-kpi-title">Work Orders</div>
          <div className="prj-kpi-main">{completedWOs} / {totalWOs}</div>
          <div className="prj-kpi-progress">
            <div className="prj-kpi-progress-fill" style={{ width: `${woPct}%` }} />
          </div>
          <div className="prj-kpi-sub-label">{woPct}% complete</div>
          <button className="prj-kpi-link" onClick={() => onTabChange('work-orders')}>
            View all work orders →
          </button>
        </div>

        <div className="prj-kpi-card">
          <div className="prj-kpi-title">Financial Summary</div>
          <div className="prj-kpi-main">{fmtMoney(contractValue)}</div>
          <div className="prj-kpi-sub-label">
            {(fin?.approved_change_orders ?? 0) > 0 ? 'Current Project Value' : 'Contract Value'}
          </div>
          <div className="prj-kpi-rows">
            <div className="prj-kpi-row"><span>Invoiced</span><span>{fmtMoney(invoiced)}</span></div>
            <div className="prj-kpi-row"><span>Collected</span><span>{fmtMoney(collected)}</span></div>
            <div className="prj-kpi-row"><span>Outstanding</span><span>{fmtMoney(outstanding)}</span></div>
          </div>
          <button className="prj-kpi-link" onClick={() => onTabChange('financials')}>
            View financials →
          </button>
        </div>

        <div className="prj-kpi-card">
          <div className="prj-kpi-title">Cost Summary</div>
          <div className="prj-kpi-main">{fmtMoney(totalCost)}</div>
          <div className="prj-kpi-sub-label">Total Cost</div>
          <div className="prj-kpi-rows">
            <div className="prj-kpi-row"><span>Materials</span><span>{fmtMoney(materialCost)}</span></div>
            <div className="prj-kpi-row"><span>Other</span><span>{fmtMoney(otherCost)}</span></div>
            <div className="prj-kpi-row"><span>Labor</span><span>—</span></div>
          </div>
          <button className="prj-kpi-link" onClick={() => onTabChange('financials')}>
            View financials →
          </button>
        </div>

        <div className="prj-kpi-card">
          <div className="prj-kpi-title">Project Margin</div>
          <div className={`prj-kpi-main${!showMargin ? '' : marginDollars < 0 ? ' prj-kpi-main--red' : ' prj-kpi-main--green'}`}>
            {showMargin && marginPct != null ? `${marginPct}%` : '—'}
          </div>
          <div className="prj-kpi-sub-label">
            {showMargin ? `${fmtMoney(marginDollars)} gross margin` : 'Add costs to see margin'}
          </div>
          {showMargin && marginPct != null && (
            <div className="prj-kpi-progress">
              <div
                className={`prj-kpi-progress-fill${marginPct < 0 ? ' prj-kpi-progress-fill--red' : ''}`}
                style={{ width: `${Math.min(100, Math.max(0, marginPct))}%` }}
              />
            </div>
          )}
          <button className="prj-kpi-link" onClick={() => onTabChange('financials')}>
            View financials →
          </button>
        </div>
      </div>

      {loading ? (
        <div className="prj-state" style={{ padding: '32px 0' }}>Loading…</div>
      ) : (
        <>
          {/* Row 2: Upcoming WOs | WO by Status | Recent Activity */}
          <div className="prj-overview-row">
            <div className="prj-ov-section">
              <div className="prj-ov-section-head">
                <span className="prj-ov-section-title">Upcoming Work Orders</span>
                <button className="prj-ov-section-link" onClick={() => onTabChange('work-orders')}>View all</button>
              </div>
              {upcoming.length === 0 ? (
                <p className="prj-muted">No upcoming work orders.</p>
              ) : (
                <div className="prj-upcoming-list">
                  {upcoming.map(wo => (
                    <div key={wo.id} className="prj-upcoming-row">
                      <div className="prj-upcoming-info">
                        <span className="prj-upcoming-num">{fmtWoNum(wo.work_order_number)}</span>
                        <span className="prj-upcoming-name">{wo.title}</span>
                        <span className="prj-upcoming-meta">{wo.tech_name || 'Unassigned'}</span>
                      </div>
                      <div className="prj-upcoming-right">
                        <StatusBadge status={wo.status}>{WO_STATUS_LABELS[wo.status] ?? wo.status?.replace(/_/g, ' ')}</StatusBadge>
                        <span className="prj-upcoming-meta">{fmtDate(wo.scheduled_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="prj-ov-section">
              <div className="prj-ov-section-head">
                <span className="prj-ov-section-title">Work Orders by Status</span>
              </div>
              {totalWOs === 0 ? (
                <p className="prj-muted">No work orders yet.</p>
              ) : (
                <div className="prj-status-dist">
                  {WO_STATUS_ORDER.filter(s => statusCounts[s]).map(s => (
                    <div key={s} className="prj-status-dist-row">
                      <span className="prj-status-dist-label">{s.replace(/_/g, ' ')}</span>
                      <div className="prj-status-dist-bar">
                        <div
                          className={`prj-status-dist-fill prj-status-dist-fill--${s}`}
                          style={{ width: `${Math.round((statusCounts[s] / totalWOs) * 100)}%` }}
                        />
                      </div>
                      <span className="prj-status-dist-count">{statusCounts[s]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="prj-ov-section">
              <div className="prj-ov-section-head">
                <span className="prj-ov-section-title">Recent Activity</span>
                <button className="prj-ov-section-link" onClick={() => onTabChange('activity')}>View all</button>
              </div>
              {activity.length === 0 ? (
                <p className="prj-muted">No activity yet.</p>
              ) : (
                <div className="prj-activity-feed">
                  {activity.slice(0, 5).map(item => (
                    <div key={item.id} className={`prj-activity-item prj-activity-item--${item.type}`}>
                      <div className="prj-activity-icon">{ACTIVITY_ICONS[item.type] || '•'}</div>
                      <div className="prj-activity-content">
                        <span className="prj-activity-body">{item.body}</span>
                        <span className="prj-activity-meta">
                          {item.user_name && <>{item.user_name} · </>}
                          {fmtDateTime(item.created_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Project Details | Team & Assignments */}
          <div className="prj-overview-row prj-overview-row--2col">
            <div className="prj-ov-section">
              <div className="prj-ov-section-head">
                <span className="prj-ov-section-title">Project Details</span>
                {isOwnerOrMgr && (
                  <button className="prj-ov-section-link" onClick={openEdit}>Edit</button>
                )}
              </div>
              <div className="prj-info-row">
                <span className="prj-info-label">Project #</span>
                <span className="prj-info-val prj-num">{fmtPrjNum(project.project_number)}</span>
              </div>
              <div className="prj-info-row">
                <span className="prj-info-label">Client</span>
                <span className="prj-info-val">{project.client_name || '—'}</span>
              </div>
              {project.client_phone && (
                <div className="prj-info-row">
                  <span className="prj-info-label">Phone</span>
                  <span className="prj-info-val">{fmtPhone(project.client_phone)}</span>
                </div>
              )}
              <div className="prj-info-row">
                <span className="prj-info-label">Billing</span>
                <span className="prj-info-val">{BILLING_LABELS[project.billing_model] || '—'}</span>
              </div>
              <div className="prj-info-row">
                <span className="prj-info-label">Start</span>
                <span className="prj-info-val">{fmtDate(project.start_date)}</span>
              </div>
              <div className="prj-info-row">
                <span className="prj-info-label">End</span>
                <span className="prj-info-val">{fmtDate(project.end_date)}</span>
              </div>
              {project.service_address && (
                <div className="prj-info-row">
                  <span className="prj-info-label">Site</span>
                  <span className="prj-info-val">{project.service_address}</span>
                </div>
              )}
              {project.description && (
                <div className="prj-info-row" style={{ alignItems: 'flex-start' }}>
                  <span className="prj-info-label">Notes</span>
                  <span className="prj-info-val">{project.description}</span>
                </div>
              )}
            </div>

            <div className="prj-ov-section">
              <div className="prj-ov-section-head">
                <span className="prj-ov-section-title">Team & Assignments</span>
              </div>
              {teamMembers.length === 0 ? (
                <p className="prj-muted">No team members assigned.</p>
              ) : (
                <div className="prj-team-list">
                  {teamMembers.map(m => (
                    <div key={m.id} className="prj-team-member">
                      <span className="prj-team-avatar">{initials(m.name)}</span>
                      <div>
                        <span className="prj-team-name">{m.name}</span>
                        <span className="prj-team-role">{m.role}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Share Work Order Modal ────────────────────────────────
function ShareModal({ wo, projectId, users, currentUserId, onClose }) {
  const [query, setQuery]       = useState('');
  const [selected, setSelected] = useState(new Set());
  const [sharing, setSharing]   = useState(false);
  const [copied, setCopied]     = useState(false);
  const [success, setSuccess]   = useState(null);
  const [error, setError]       = useState('');
  const inputRef   = useRef(null);
  const overlayRef = useRef(null);

  // Scroll lock + initial focus
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Escape closes
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const woNum = fmtWoNum(wo.work_order_number);

  // Deduplicated + sorted eligible users (exclude self)
  const eligible = useMemo(() => {
    const seen = new Set();
    return (users || [])
      .filter(u => {
        if (u.id === currentUserId) return false;
        if (seen.has(u.id)) return false;
        seen.add(u.id);
        return true;
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [users, currentUserId]);

  // Detect name collisions so we can show email for disambiguation
  const nameCounts = useMemo(() => {
    const counts = {};
    eligible.forEach(u => { counts[u.name] = (counts[u.name] || 0) + 1; });
    return counts;
  }, [eligible]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return eligible;
    return eligible.filter(u =>
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q)
    );
  }, [eligible, query]);

  function toggleUser(u) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(u.id)) next.delete(u.id);
      else next.add(u.id);
      return next;
    });
  }

  function removeChip(id) {
    setSelected(prev => { const next = new Set(prev); next.delete(id); return next; });
  }

  const selectedUsers = eligible.filter(u => selected.has(u.id));

  async function copyLink() {
    const url = `${window.location.origin}/projects/${projectId}?tab=work-orders`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {}
  }

  async function share() {
    if (!selected.size || sharing) return;
    setSharing(true);
    setError('');
    try {
      const res = await api.post(`/projects/${projectId}/work-orders/${wo.id}/share`, {
        user_ids: [...selected],
      });
      const n = res.data.shared_with?.length ?? 0;
      const f = res.data.failed_count ?? 0;
      if (f > 0 && n === 0) {
        setError('Failed to deliver notifications. Please try again.');
      } else if (f > 0) {
        setSuccess(`Shared with ${n} member${n !== 1 ? 's' : ''} (${f} failed)`);
      } else {
        setSuccess(`Shared with ${n} team member${n !== 1 ? 's' : ''}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to share. Please try again.');
    } finally {
      setSharing(false);
    }
  }

  const shareLabel = sharing ? 'Sharing…' : selected.size > 0 ? `Share with ${selected.size}` : 'Share';

  return (
    <div
      className="prj-share-overlay"
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Share Work Order"
    >
      <div className="prj-share-modal">

        {/* HEADER — fixed */}
        <div className="prj-share-header">
          <div>
            <div className="prj-share-title">Share Work Order</div>
            <div className="prj-share-sub">{woNum} · {wo.title}</div>
          </div>
          <button className="prj-share-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        {/* BODY — scrollable */}
        <div className="prj-share-body">
          {success ? (
            <div className="prj-share-success">
              <span className="prj-share-success-icon">✓</span>
              <span>{success}</span>
            </div>
          ) : (
            <>
              {error && <div className="prj-form-error" style={{ marginBottom: 4 }}>{error}</div>}

              {selectedUsers.length > 0 && (
                <div className="prj-share-chips">
                  {selectedUsers.map(u => (
                    <span key={u.id} className="prj-share-chip">
                      {u.name}
                      <button type="button" className="prj-share-chip-x" onClick={() => removeChip(u.id)} aria-label={`Remove ${u.name}`}>
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="prj-share-search-wrap">
                <Search size={13} className="prj-share-search-icon" />
                <input
                  ref={inputRef}
                  className="prj-share-search"
                  placeholder="Search by name, email, or role…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="prj-share-list">
                {filtered.length === 0 ? (
                  <div className="prj-share-list-empty">
                    {query.trim() ? 'No matching team members' : 'No team members to share with'}
                  </div>
                ) : (
                  filtered.map(u => {
                    const isSelected  = selected.has(u.id);
                    const showEmail   = nameCounts[u.name] > 1;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        className={`prj-share-row${isSelected ? ' prj-share-row--selected' : ''}`}
                        onClick={() => toggleUser(u)}
                      >
                        <span className="prj-share-avatar">{initials(u.name)}</span>
                        <span className="prj-share-row-info">
                          <span className="prj-share-row-name">{u.name}</span>
                          {showEmail && u.email ? (
                            <span className="prj-share-row-meta">{u.email}</span>
                          ) : u.role ? (
                            <span className="prj-share-row-meta" style={{ textTransform: 'capitalize' }}>{u.role}</span>
                          ) : null}
                        </span>
                        {isSelected && <Check size={15} className="prj-share-check" />}
                      </button>
                    );
                  })
                )}
              </div>

              <p className="prj-share-note">
                Recipients will be notified and can open this work order. Sharing does not change technician assignment.
              </p>
            </>
          )}
        </div>

        {/* FOOTER — fixed */}
        <div className="prj-share-footer">
          {success ? (
            <>
              <div style={{ flex: 1 }} />
              <button type="button" className="tb-btn tb-primary" onClick={onClose}>Done</button>
            </>
          ) : (
            <>
              <button type="button" className="tb-btn tb-ghost prj-share-copy" onClick={copyLink}>
                <Link size={13} />
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
              <div className="prj-share-footer-right">
                <button type="button" className="tb-btn tb-ghost" onClick={onClose}>Cancel</button>
                <button
                  type="button"
                  className="tb-btn tb-primary"
                  disabled={!selected.size || sharing}
                  onClick={share}
                >
                  {shareLabel}
                </button>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Work Order row ────────────────────────────────────────
function WorkOrderRow({ wo, projectId, users, onRefresh, isOwnerOrMgr, currentUserId }) {
  const [expanded, setExpanded]     = useState(false);
  const [showShare, setShowShare]   = useState(false);
  const [tasks, setTasks]           = useState([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [newTask, setNewTask]       = useState('');
  const [addingTask, setAddingTask] = useState(false);
  const [editingWo, setEditingWo]   = useState(false);
  const [woForm, setWoForm]         = useState({});
  const [savingWo, setSavingWo]     = useState(false);
  const [woError, setWoError]       = useState('');

  async function loadTasks() {
    try {
      const r = await api.get(`/projects/${projectId}/work-orders/${wo.id}/tasks`);
      setTasks(r.data);
      setTasksLoaded(true);
    } catch {}
  }

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && !tasksLoaded) loadTasks();
  }

  async function toggleTask(task) {
    try {
      await api.patch(`/projects/${projectId}/work-orders/${wo.id}/tasks/${task.id}`, {
        is_complete: !task.is_complete,
      });
      loadTasks();
    } catch {}
  }

  async function addTask(e) {
    e.preventDefault();
    if (!newTask.trim()) return;
    setAddingTask(true);
    try {
      await api.post(`/projects/${projectId}/work-orders/${wo.id}/tasks`, {
        title: newTask.trim(), sort_order: tasks.length,
      });
      setNewTask('');
      loadTasks();
    } catch {}
    setAddingTask(false);
  }

  async function deleteTask(taskId) {
    try {
      await api.delete(`/projects/${projectId}/work-orders/${wo.id}/tasks/${taskId}`);
      loadTasks();
    } catch {}
  }

  function openEditWo() {
    setWoForm({
      title:        wo.title        || '',
      description:  wo.description  || '',
      assignment: {
        members: (wo.team_members || []).map(m => ({
          userId:         m.user_id,
          memberName:     m.member_name,
          assignmentRole: m.assignment_role || 'technician',
          isPrimary:      m.is_primary,
        })),
        crewId: null,
      },
      status:           wo.status           || 'draft',
      priority:         wo.priority         || 'normal',
      scheduled_date:   wo.scheduled_at     ? wo.scheduled_at.slice(0, 10) : '',
      scheduled_time:   wo.scheduled_at     ? wo.scheduled_at.slice(11, 16) : '',
      duration_minutes: wo.duration_minutes || 0,
      instructions:     wo.instructions     || '',
      asset_id:         wo.asset_id         || null,
      asset_name:       wo.asset_name       || null,
    });
    setWoError('');
    setEditingWo(true);
    setExpanded(true); // form renders inside {expanded && ...}
  }

  async function saveWo(e) {
    e.preventDefault();
    if (savingWo) return;
    setSavingWo(true);
    setWoError('');
    const members = woForm.assignment?.members || [];
    const primary = members.find(m => m.isPrimary) || members[0] || null;
    const scheduled_at = woForm.scheduled_date
      ? (woForm.scheduled_time ? `${woForm.scheduled_date}T${woForm.scheduled_time}` : woForm.scheduled_date)
      : null;
    try {
      await api.patch(`/projects/${projectId}/work-orders/${wo.id}`, {
        title:            woForm.title,
        description:      woForm.description  || null,
        status:           woForm.status,
        priority:         woForm.priority,
        scheduled_at,
        duration_minutes: woForm.duration_minutes || null,
        instructions:     woForm.instructions || null,
        tech_id:          primary?.userId     || null,
        assignment:       woForm.assignment,
        asset_id:         woForm.asset_id     || null,
      });
      setEditingWo(false);
      onRefresh();
    } catch (err) {
      setWoError(err.response?.data?.error || "We couldn't save this work order. Your changes are preserved. Please try again.");
    } finally {
      setSavingWo(false);
    }
  }

  async function deleteWo() {
    if (!window.confirm(`Delete work order "${wo.title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/projects/${projectId}/work-orders/${wo.id}`);
      onRefresh();
    } catch (err) {
      alert(err.response?.data?.error || "We couldn't delete this work order. Please try again.");
    }
  }

  const completedTasks = tasks.filter(t => t.is_complete).length;
  const totalTasks     = tasks.length;

  return (
    <div className={`prj-wo-row${expanded ? ' prj-wo-row--open' : ''}`}>
      <div className="prj-wo-row-head" onClick={toggle}>
        <button className="prj-wo-expand-btn" aria-label={expanded ? 'Collapse' : 'Expand'}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <span className="prj-wo-num">{fmtWoNum(wo.work_order_number)}</span>
        <span className="prj-wo-title">{wo.title}</span>
        <StatusBadge status={wo.status}>{WO_STATUS_LABELS[wo.status] ?? wo.status?.replace(/_/g, ' ')}</StatusBadge>
        {wo.priority && wo.priority !== 'normal' && (
          <span className={`prj-priority prj-priority--${wo.priority}`}>{wo.priority}</span>
        )}
        {(wo.team_members?.length > 0 ? wo.team_members.map(m => m.member_name).join(', ') : wo.tech_name) && (
          <span className="prj-wo-tech">
            {wo.team_members?.length > 0 ? wo.team_members.map(m => m.member_name).join(', ') : wo.tech_name}
          </span>
        )}
        {wo.task_count > 0 && (
          <span className="prj-wo-task-badge">{wo.complete_count}/{wo.task_count} tasks</span>
        )}
        {wo.scheduled_at && (
          <span className="prj-wo-date">{fmtDate(wo.scheduled_at)}</span>
        )}
        <div className="prj-wo-row-actions" onClick={e => e.stopPropagation()}>
          <button className="prj-icon-btn" title="Share" onClick={() => setShowShare(true)} aria-label="Share work order">
            <Share2 size={13} />
          </button>
          {isOwnerOrMgr && (
            <>
              <button className="prj-icon-btn" title="Edit" onClick={openEditWo}>Edit</button>
              <button className="prj-icon-btn prj-icon-btn--danger" title="Delete" onClick={deleteWo}>
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {showShare && (
        <ShareModal
          wo={wo}
          projectId={projectId}
          users={users}
          currentUserId={currentUserId}
          onClose={() => setShowShare(false)}
        />
      )}

      {expanded && (
        <div className="prj-wo-body">
          {editingWo ? (
            <form onSubmit={saveWo} className="prj-wo-edit-form">
              {woError && <div className="prj-form-error" style={{ marginBottom: 12 }}>{woError}</div>}
              <div className="prj-wo-section">
                <div className="prj-wo-section-label">Work Order Details</div>
                <div className="form-group">
                  <label>Title *</label>
                  <input value={woForm.title} onChange={e => setWoForm(p => ({ ...p, title: e.target.value }))} required />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Status</label>
                    <select value={woForm.status} onChange={e => setWoForm(p => ({ ...p, status: e.target.value }))}>
                      {WO_CREATE_STATUSES.map(s => (
                        <option key={s} value={s}>{WO_STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Priority</label>
                    <select value={woForm.priority} onChange={e => setWoForm(p => ({ ...p, priority: e.target.value }))}>
                      {['low', 'normal', 'high', 'urgent'].map(p => (
                        <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="prj-wo-section">
                <div className="prj-wo-section-label">Assignment</div>
                <div className="form-group">
                  <JobTeamSelector
                    value={woForm.assignment}
                    onChange={v => setWoForm(p => ({ ...p, assignment: v }))}
                    techs={users}
                    crews={[]}
                  />
                </div>
              </div>
              <div className="prj-wo-section">
                <div className="prj-wo-section-label">Schedule</div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Date</label>
                    <input type="date" value={woForm.scheduled_date}
                      onChange={e => setWoForm(p => ({ ...p, scheduled_date: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Start Time</label>
                    <input type="time" value={woForm.scheduled_time}
                      onChange={e => setWoForm(p => ({ ...p, scheduled_time: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Duration</label>
                  <DurationPicker value={woForm.duration_minutes}
                    onChange={v => setWoForm(p => ({ ...p, duration_minutes: v }))} />
                </div>
              </div>
              <div className="prj-wo-section">
                <div className="prj-wo-section-label">Scope</div>
                <div className="form-group">
                  <label>Asset / Equipment</label>
                  <AssetPicker
                    value={woForm.asset_id}
                    assetName={woForm.asset_name}
                    onChange={(id, name) => setWoForm(p => ({ ...p, asset_id: id, asset_name: name }))}
                    clientId={null}
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea rows={2} value={woForm.description} onChange={e => setWoForm(p => ({ ...p, description: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Tech Instructions</label>
                  <textarea rows={2} value={woForm.instructions} onChange={e => setWoForm(p => ({ ...p, instructions: e.target.value }))} />
                </div>
              </div>
              <div className="prj-form-actions">
                <button type="submit" className="tb-btn tb-primary" disabled={savingWo}>
                  {savingWo ? 'Saving…' : 'Save Changes'}
                </button>
                <button type="button" className="tb-btn tb-ghost" onClick={() => setEditingWo(false)}>Cancel</button>
              </div>
            </form>
          ) : (
            <div className="prj-wo-details">
              {wo.asset_name && (
                <div className="prj-wo-asset">
                  <span className="prj-wo-asset-label">Asset / Equipment</span>
                  <span className="prj-wo-asset-val">{wo.asset_name}</span>
                </div>
              )}
              {wo.description && <p className="prj-wo-desc">{wo.description}</p>}
              {wo.instructions && (
                <div className="prj-wo-instructions">
                  <span className="prj-wo-instructions-label">Instructions</span>
                  <p>{wo.instructions}</p>
                </div>
              )}
              {wo.material_cost > 0 && (
                <div className="prj-wo-mat-cost">
                  <span className="prj-wo-mat-label">Material Cost</span>
                  <span className="prj-wo-mat-val">{fmtMoney(wo.material_cost)}</span>
                  {wo.material_price > 0 && (
                    <>
                      <span className="prj-wo-mat-label" style={{ marginLeft: 12 }}>Billable</span>
                      <span className="prj-wo-mat-val">{fmtMoney(wo.material_price)}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {!editingWo && (
            <div className="prj-tasks">
              <div className="prj-tasks-head">
                <span className="prj-tasks-title">
                  Tasks {tasksLoaded && totalTasks > 0 ? `(${completedTasks}/${totalTasks})` : ''}
                </span>
              </div>
              {tasksLoaded && tasks.length === 0 && (
                <p className="prj-tasks-empty">No tasks yet.</p>
              )}
              {tasks.map(task => (
                <div key={task.id} className={`prj-task${task.is_complete ? ' prj-task--done' : ''}`}>
                  <button
                    className={`prj-task-check${task.is_complete ? ' prj-task-check--done' : ''}`}
                    onClick={() => toggleTask(task)}
                    aria-label={task.is_complete ? 'Mark incomplete' : 'Mark complete'}
                  >
                    {task.is_complete && <Check size={11} />}
                  </button>
                  <span className="prj-task-title">{task.title}</span>
                  {isOwnerOrMgr && (
                    <button className="prj-task-del" onClick={() => deleteTask(task.id)} aria-label="Delete task">
                      <X size={11} />
                    </button>
                  )}
                </div>
              ))}
              {isOwnerOrMgr && (
                <form onSubmit={addTask} className="prj-task-add">
                  <input
                    className="prj-task-input"
                    placeholder="Add task…"
                    value={newTask}
                    onChange={e => setNewTask(e.target.value)}
                  />
                  <button type="submit" className="tb-btn tb-ghost" disabled={addingTask || !newTask.trim()}>
                    Add
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Work Orders Tab (V2 — with filters) ──────────────────
function WorkOrdersTab({ projectId, users, onRefresh }) {
  const [workOrders, setWorkOrders]         = useState([]);
  const [loading, setLoading]               = useState(true);
  const [showForm, setShowForm]             = useState(false);
  const [form, setForm]                     = useState({});
  const [saving, setSaving]                 = useState(false);
  const [error, setError]                   = useState('');
  const [filterStatus, setFilterStatus]     = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [search, setSearch]                 = useState('');
  const [crews, setCrews]                   = useState([]);
  const { user } = useAuth();
  const isOwnerOrMgr = ['owner', 'manager'].includes(user?.role);

  useEffect(() => {
    api.get('/crews').then(r => setCrews(r.data || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus)   params.status   = filterStatus;
      if (filterPriority) params.priority = filterPriority;
      const r = await api.get(`/projects/${projectId}/work-orders`, { params });
      setWorkOrders(r.data);
    } catch {}
    setLoading(false);
  }, [projectId, filterStatus, filterPriority]);

  useEffect(() => { load(); }, [load]);

  const filtered = search.trim()
    ? workOrders.filter(wo =>
        wo.title?.toLowerCase().includes(search.toLowerCase()) ||
        wo.tech_name?.toLowerCase().includes(search.toLowerCase())
      )
    : workOrders;

  function openNew() {
    setForm({
      title: '', description: '',
      assignment: { members: [], crewId: null },
      status: 'draft', priority: 'normal',
      scheduled_date: '', scheduled_time: '',
      duration_minutes: 0, instructions: '',
      asset_id: null, asset_name: null,
    });
    setError('');
    setShowForm(true);
  }

  function setField(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  function handleScheduledDate(val) {
    setForm(p => ({
      ...p,
      scheduled_date: val,
      status: val && p.status === 'draft' ? 'scheduled'
        : (!val && p.status === 'scheduled' ? 'draft' : p.status),
    }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const members = form.assignment?.members || [];
    const primary = members.find(m => m.isPrimary) || members[0] || null;
    const scheduled_at = form.scheduled_date
      ? (form.scheduled_time ? `${form.scheduled_date}T${form.scheduled_time}` : form.scheduled_date)
      : null;
    try {
      await api.post(`/projects/${projectId}/work-orders`, {
        title:            form.title,
        description:      form.description   || null,
        status:           form.status,
        priority:         form.priority,
        scheduled_at,
        duration_minutes: form.duration_minutes || null,
        instructions:     form.instructions  || null,
        tech_id:          primary?.userId    || null,
        assignment:       form.assignment,
        asset_id:         form.asset_id      || null,
      });
      setShowForm(false);
      load();
      onRefresh();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create work order.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="prj-wo-tab">
      <div className="prj-tab-header">
        <span className="prj-tab-count">
          {filtered.length} Work Order{filtered.length !== 1 ? 's' : ''}
        </span>
        {isOwnerOrMgr && (
          <button className="tb-btn tb-primary" onClick={openNew}>
            <Plus size={14} /> New Work Order
          </button>
        )}
      </div>

      {/* Filter row */}
      <div className="prj-wo-filters">
        <select
          className="prj-wo-filter-select"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">All Statuses</option>
          {WO_STATUSES.map(s => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select
          className="prj-wo-filter-select"
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value)}
        >
          <option value="">All Priorities</option>
          {['low', 'normal', 'high', 'urgent'].map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <div className="prj-wo-search-wrap">
          <Search size={13} className="prj-wo-search-icon" />
          <input
            className="prj-wo-search"
            placeholder="Search work orders…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {showForm && (
        <div className="prj-wo-form-card">
          {error && <div className="prj-form-error">{error}</div>}
          <form onSubmit={save}>
            {/* ── Details ── */}
            <div className="prj-wo-section">
              <div className="prj-wo-section-label">Work Order Details</div>
              <div className="form-group">
                <label>Title *</label>
                <input value={form.title} onChange={setField('title')} required placeholder="e.g. Replace bunk lights on Unit 1008" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Status</label>
                  <select value={form.status} onChange={setField('status')}>
                    {WO_CREATE_STATUSES.map(s => (
                      <option key={s} value={s}>{WO_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Priority</label>
                  <select value={form.priority} onChange={setField('priority')}>
                    {['low', 'normal', 'high', 'urgent'].map(p => (
                      <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* ── Assignment ── */}
            <div className="prj-wo-section">
              <div className="prj-wo-section-label">Assignment</div>
              <div className="form-group">
                <JobTeamSelector
                  value={form.assignment}
                  onChange={v => setForm(p => ({ ...p, assignment: v }))}
                  techs={users}
                  crews={crews}
                />
              </div>
            </div>

            {/* ── Schedule ── */}
            <div className="prj-wo-section">
              <div className="prj-wo-section-label">Schedule</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={form.scheduled_date} onChange={e => handleScheduledDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Start Time</label>
                  <input type="time" value={form.scheduled_time} onChange={setField('scheduled_time')} />
                </div>
              </div>
              <div className="form-group">
                <label>Duration</label>
                <DurationPicker value={form.duration_minutes}
                  onChange={v => setForm(p => ({ ...p, duration_minutes: v }))} />
              </div>
            </div>

            {/* ── Scope ── */}
            <div className="prj-wo-section">
              <div className="prj-wo-section-label">Scope</div>
              <div className="form-group">
                <label>Asset / Equipment</label>
                <AssetPicker
                  value={form.asset_id}
                  assetName={form.asset_name}
                  onChange={(id, name) => setForm(p => ({ ...p, asset_id: id, asset_name: name }))}
                  clientId={null}
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea rows={2} value={form.description} onChange={setField('description')} />
              </div>
              <div className="form-group">
                <label>Tech Instructions</label>
                <textarea rows={2} value={form.instructions} onChange={setField('instructions')} />
              </div>
            </div>

            <div className="prj-form-actions">
              <button type="submit" className="tb-btn tb-primary" disabled={saving}>
                {saving ? 'Creating…' : 'Create Work Order'}
              </button>
              <button type="button" className="tb-btn tb-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="prj-state">Loading…</div>
      ) : filtered.length === 0 && !showForm ? (
        <div className="prj-empty">
          <p className="prj-empty-primary">
            {search || filterStatus || filterPriority ? 'No work orders match filters.' : 'No work orders yet.'}
          </p>
          {isOwnerOrMgr && !search && !filterStatus && !filterPriority && (
            <p><button className="tb-btn tb-ghost" onClick={openNew}>Add the first work order →</button></p>
          )}
        </div>
      ) : (
        <div className="prj-wo-list">
          {filtered.map(wo => (
            <WorkOrderRow
              key={wo.id}
              wo={wo}
              projectId={projectId}
              users={users}
              isOwnerOrMgr={isOwnerOrMgr}
              currentUserId={user?.id}
              onRefresh={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Budget / Change Orders constants ─────────────────────
const BUDGET_CATEGORIES = [
  { key: 'labor',          label: 'Labor' },
  { key: 'materials',      label: 'Materials' },
  { key: 'equipment',      label: 'Equipment' },
  { key: 'subcontractors', label: 'Subcontractors' },
  { key: 'travel',         label: 'Travel' },
  { key: 'other',          label: 'Other' },
];
const CO_STATUS_LABELS = {
  draft: 'Draft', pending_approval: 'Pending Approval',
  approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled',
};
const CO_STATUSES = ['draft', 'pending_approval', 'approved', 'rejected', 'cancelled'];

// ── Budget Section ────────────────────────────────────────
function BudgetSection({ projectId, budget, onRefresh, isOwnerOrMgr }) {
  const [editing, setEditing]       = useState(false);
  const [budgetForm, setBudgetForm] = useState({});
  const [saving, setSaving]         = useState(false);

  function openEdit() {
    const f = {};
    for (const cat of BUDGET_CATEGORIES) {
      const row = (budget || []).find(b => b.category === cat.key);
      f[cat.key] = row?.budget_cents ? (row.budget_cents / 100).toFixed(2) : '';
    }
    setBudgetForm(f);
    setEditing(true);
  }

  async function saveBudget(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const categories = BUDGET_CATEGORIES.map(cat => ({
        category: cat.key,
        budget_cents: budgetForm[cat.key] ? Math.round(parseFloat(budgetForm[cat.key]) * 100) : 0,
      }));
      await api.put(`/projects/${projectId}/budget`, { categories });
      setEditing(false);
      onRefresh();
    } catch {}
    setSaving(false);
  }

  const totalBudget = (budget || []).reduce((s, b) => s + (b.budget_cents || 0), 0);
  const totalActual = (budget || []).reduce((s, b) => s + (b.actual_cents  || 0), 0);
  const hasBudget   = totalBudget > 0;

  return (
    <div className="prj-section">
      <div className="prj-section-header">
        <span className="prj-section-title">Budget vs Actual</span>
        {isOwnerOrMgr && !editing && (
          <button className="tb-btn tb-ghost" onClick={openEdit}>
            {hasBudget ? 'Edit Budget' : 'Set Budget'}
          </button>
        )}
      </div>

      {editing && (
        <form className="prj-budget-edit-form" onSubmit={saveBudget}>
          <div className="prj-budget-edit-grid">
            {BUDGET_CATEGORIES.map(cat => (
              <div key={cat.key} className="form-group">
                <label>{cat.label} ($)</label>
                <input
                  type="number" min="0" step="0.01"
                  value={budgetForm[cat.key] || ''}
                  onChange={e => setBudgetForm(p => ({ ...p, [cat.key]: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
            ))}
          </div>
          <div className="prj-form-actions">
            <button type="submit" className="tb-btn tb-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Budget'}
            </button>
            <button type="button" className="tb-btn tb-ghost" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table className="table prj-budget-table">
          <thead>
            <tr>
              <th>Category</th>
              <th style={{ textAlign: 'right' }}>Budget</th>
              <th style={{ textAlign: 'right' }}>Actual</th>
              <th style={{ textAlign: 'right' }}>Remaining</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {BUDGET_CATEGORIES.map(cat => {
              const row       = (budget || []).find(b => b.category === cat.key) || {};
              const budgeted  = row.budget_cents || 0;
              const actual    = row.actual_cents  || 0;
              const remaining = budgeted - actual;
              const isOver    = budgeted > 0 && actual > budgeted;
              const isUnder   = budgeted > 0 && actual <= budgeted;
              return (
                <tr key={cat.key}>
                  <td>{cat.label}</td>
                  <td style={{ textAlign: 'right' }}>{budgeted ? fmtMoney(budgeted) : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{fmtMoney(actual)}</td>
                  <td style={{ textAlign: 'right', color: isOver ? 'var(--danger,#c00)' : undefined }}>
                    {budgeted ? fmtMoney(remaining) : '—'}
                  </td>
                  <td>
                    {isOver  && <span className="prj-budget-badge prj-budget-badge--over">Over</span>}
                    {isUnder && <span className="prj-budget-badge prj-budget-badge--under">Under</span>}
                    {!budgeted && <span className="prj-budget-badge prj-budget-badge--none">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {hasBudget && (
            <tfoot>
              <tr className="prj-budget-total-row">
                <td><strong>Total</strong></td>
                <td style={{ textAlign: 'right' }}><strong>{fmtMoney(totalBudget)}</strong></td>
                <td style={{ textAlign: 'right' }}><strong>{fmtMoney(totalActual)}</strong></td>
                <td style={{ textAlign: 'right', color: totalActual > totalBudget ? 'var(--danger,#c00)' : undefined }}>
                  <strong>{fmtMoney(totalBudget - totalActual)}</strong>
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Change Orders Section ─────────────────────────────────
function ChangeOrdersSection({ projectId, changeOrders, onRefresh, isOwnerOrMgr }) {
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({ title: '', description: '', amount: '' });
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  function openForm() {
    setForm({ title: '', description: '', amount: '' });
    setError('');
    setShowForm(true);
  }

  async function createCo(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/projects/${projectId}/change-orders`, {
        title:        form.title,
        description:  form.description || null,
        amount_cents: form.amount ? Math.round(parseFloat(form.amount) * 100) : 0,
      });
      setShowForm(false);
      onRefresh();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create change order.');
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(coId, status) {
    try {
      await api.patch(`/projects/${projectId}/change-orders/${coId}`, { status });
      onRefresh();
    } catch {}
  }

  async function deleteCo(coId) {
    try {
      await api.delete(`/projects/${projectId}/change-orders/${coId}`);
      setConfirmDeleteId(null);
      onRefresh();
    } catch {}
  }

  const approvedTotal = (changeOrders || [])
    .filter(co => co.status === 'approved')
    .reduce((s, co) => s + (co.amount_cents || 0), 0);

  return (
    <div className="prj-section">
      <div className="prj-section-header">
        <span className="prj-section-title">Change Orders</span>
        {isOwnerOrMgr && !showForm && (
          <button className="tb-btn tb-ghost" onClick={openForm}>
            <Plus size={13} /> Add
          </button>
        )}
      </div>

      {approvedTotal > 0 && (
        <div className="prj-co-approved-banner">
          Approved change orders add <strong>{fmtMoney(approvedTotal)}</strong> to the contract value.
        </div>
      )}

      {showForm && (
        <div className="prj-co-form">
          {error && <div className="prj-form-error">{error}</div>}
          <form onSubmit={createCo}>
            <div className="form-row">
              <div className="form-group" style={{ flex: 3 }}>
                <label>Title *</label>
                <input
                  value={form.title}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  required
                  placeholder="e.g. Additional scope — foundation repair"
                />
              </div>
              <div className="form-group">
                <label>Amount ($)</label>
                <input
                  type="number" min="0" step="0.01"
                  value={form.amount}
                  onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Optional details…"
              />
            </div>
            <div className="prj-form-actions">
              <button type="submit" className="tb-btn tb-primary" disabled={saving}>
                {saving ? 'Creating…' : 'Create Change Order'}
              </button>
              <button type="button" className="tb-btn tb-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {!(changeOrders?.length) && !showForm ? (
        <div className="prj-mat-empty">
          <p className="prj-mat-empty-primary">No change orders yet.</p>
          <p className="prj-mat-empty-sub">Track scope changes and their impact on the contract value.</p>
          {isOwnerOrMgr && (
            <button className="tb-btn tb-ghost" onClick={openForm}>
              <Plus size={13} /> Add Change Order
            </button>
          )}
        </div>
      ) : changeOrders?.length > 0 ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>CO #</th>
                <th>Title</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Status</th>
                <th>Created</th>
                {isOwnerOrMgr && <th />}
              </tr>
            </thead>
            <tbody>
              {changeOrders.map(co => (
                <tr key={co.id}>
                  <td className="prj-num">{fmtCoNum(co.change_order_number)}</td>
                  <td>
                    <strong>{co.title}</strong>
                    {co.description && <div className="prj-mat-desc">{co.description}</div>}
                  </td>
                  <td style={{ textAlign: 'right' }}>{fmtMoney(co.amount_cents)}</td>
                  <td>
                    {isOwnerOrMgr ? (
                      <select
                        className="prj-co-status-select"
                        value={co.status}
                        onChange={e => updateStatus(co.id, e.target.value)}
                      >
                        {CO_STATUSES.map(s => (
                          <option key={s} value={s}>{CO_STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`prj-co-status prj-co-status--${co.status}`}>
                        {CO_STATUS_LABELS[co.status] || co.status}
                      </span>
                    )}
                  </td>
                  <td className="prj-mat-date">{fmtDate(co.created_at)}</td>
                  {isOwnerOrMgr && (
                    <td style={{ textAlign: 'right' }}>
                      {co.status === 'draft' && (
                        confirmDeleteId === co.id ? (
                          <span className="prj-mat-confirm">
                            Delete?{' '}
                            <button className="prj-mat-confirm-yes" onClick={() => deleteCo(co.id)}>Yes</button>
                            {' / '}
                            <button className="prj-mat-confirm-no" onClick={() => setConfirmDeleteId(null)}>No</button>
                          </span>
                        ) : (
                          <button
                            className="prj-icon-btn prj-icon-btn--danger"
                            onClick={() => setConfirmDeleteId(co.id)}
                            aria-label="Delete change order"
                          >
                            <Trash2 size={13} />
                          </button>
                        )
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

// ── Financials Tab ────────────────────────────────────────
const EMPTY_MAT_FORM = {
  type: 'material', name: '', description: '', vendor: '',
  quantity: '1', unit: 'each',
  cost_cents: '', price_cents: '',
  billable: false, purchase_date: '', job_id: '',
};
const MAT_TYPE_LABELS = {
  material: 'Material', expense: 'Expense', other: 'Other',
  labor: 'Labor', equipment: 'Equipment', subcontractor: 'Subcontractor', travel: 'Travel',
};

function MatForm({ form, onChange, workOrders, error, saving, onSubmit, onCancel, submitLabel }) {
  // form.cost_cents / price_cents hold dollar amounts as strings (user types "12.50")
  // multiply qty × unit_dollar × 100 to get cents for fmtMoney
  const costTotal  = Math.round((parseFloat(form.quantity) || 0) * (parseFloat(form.cost_cents)  || 0) * 100);
  const priceTotal = Math.round((parseFloat(form.quantity) || 0) * (parseFloat(form.price_cents) || 0) * 100);
  return (
    <div className="prj-mat-form">
      {error && <div className="prj-form-error">{error}</div>}
      <form onSubmit={onSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label>Type</label>
            <select value={form.type} onChange={onChange('type')}>
              {Object.entries(MAT_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ flex: 2 }}>
            <label>Item Name *</label>
            <input value={form.name} onChange={onChange('name')} required
              placeholder={form.type === 'expense' ? 'e.g. Fuel, Parking' : 'e.g. PVC fittings'} />
          </div>
          <div className="form-group">
            <label>Vendor</label>
            <input value={form.vendor} onChange={onChange('vendor')} placeholder="e.g. Home Depot" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Qty</label>
            <input type="number" min="0" step="0.001" value={form.quantity} onChange={onChange('quantity')} />
          </div>
          <div className="form-group">
            <label>Unit</label>
            <input value={form.unit} onChange={onChange('unit')} placeholder="each, sq ft…" />
          </div>
          <div className="form-group">
            <label>Unit Cost ($)</label>
            <input type="number" min="0" step="0.01" value={form.cost_cents}
              onChange={onChange('cost_cents')} placeholder="0.00" />
          </div>
          <div className="form-group prj-mat-total-group">
            <label>Total Cost</label>
            <span className="prj-mat-total">{fmtMoney(Math.round(costTotal * 100))}</span>
          </div>
        </div>
        <div className="form-row prj-mat-billable-row">
          <div className="form-group prj-mat-check-group">
            <label className="prj-mat-check-label">
              <input type="checkbox" checked={form.billable} onChange={onChange('billable')} />
              Billable to customer
            </label>
          </div>
          {form.billable && (
            <>
              <div className="form-group">
                <label>Customer Unit Price ($)</label>
                <input type="number" min="0" step="0.01" value={form.price_cents}
                  onChange={onChange('price_cents')} placeholder="0.00" />
              </div>
              <div className="form-group prj-mat-total-group">
                <label>Customer Total</label>
                <span className="prj-mat-total">{fmtMoney(Math.round(priceTotal * 100))}</span>
              </div>
            </>
          )}
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Work Order</label>
            <select value={form.job_id} onChange={onChange('job_id')}>
              <option value="">— Project-level (no WO) —</option>
              {workOrders.map(wo => (
                <option key={wo.id} value={wo.id}>{fmtWoNum(wo.work_order_number)} — {wo.title}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Purchase Date</label>
            <input type="date" value={form.purchase_date} onChange={onChange('purchase_date')} />
          </div>
        </div>
        <div className="form-group">
          <label>Description</label>
          <input value={form.description} onChange={onChange('description')} placeholder="Optional notes" />
        </div>
        <div className="prj-form-actions">
          <button type="submit" className="tb-btn tb-primary" disabled={saving}>
            {saving ? 'Saving…' : submitLabel}
          </button>
          <button type="button" className="tb-btn tb-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function FinancialsTab({ projectId }) {
  const [fin, setFin]               = useState(null);
  const [mats, setMats]             = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [budget, setBudget]         = useState([]);
  const [changeOrders, setChangeOrders] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [mode, setMode]             = useState(null); // null | 'add' | mat.id (editing)
  const [matForm, setMatForm]       = useState(EMPTY_MAT_FORM);
  const [savingMat, setSavingMat]   = useState(false);
  const [matError, setMatError]     = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const { user } = useAuth();
  const isOwnerOrMgr = ['owner', 'manager'].includes(user?.role);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [fRes, mRes, woRes, budgetRes, coRes] = await Promise.allSettled([
      api.get(`/projects/${projectId}/financials`),
      api.get(`/projects/${projectId}/materials`),
      api.get(`/projects/${projectId}/work-orders`),
      api.get(`/projects/${projectId}/budget`),
      api.get(`/projects/${projectId}/change-orders`),
    ]);
    if (fRes.status      === 'fulfilled') setFin(fRes.value.data);
    if (mRes.status      === 'fulfilled') setMats(mRes.value.data);
    if (woRes.status     === 'fulfilled') setWorkOrders(woRes.value.data || []);
    if (budgetRes.status === 'fulfilled') setBudget(budgetRes.value.data?.categories || []);
    if (coRes.status     === 'fulfilled') setChangeOrders(coRes.value.data || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setMatForm(EMPTY_MAT_FORM);
    setMatError('');
    setMode('add');
  }

  function openEdit(m) {
    setMatForm({
      type:          m.type         || 'material',
      name:          m.name         || '',
      description:   m.description  || '',
      vendor:        m.vendor       || '',
      quantity:      String(m.quantity ?? 1),
      unit:          m.unit         || 'each',
      cost_cents:    m.cost_cents  != null ? (m.cost_cents  / 100).toFixed(2) : '',
      price_cents:   m.price_cents != null ? (m.price_cents / 100).toFixed(2) : '',
      billable:      m.billable     || false,
      purchase_date: m.purchase_date ? m.purchase_date.slice(0, 10) : '',
      job_id:        m.job_id       || '',
    });
    setMatError('');
    setMode(m.id);
  }

  function handleChange(field) {
    return e => {
      const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      setMatForm(p => ({ ...p, [field]: val }));
    };
  }

  function buildPayload(form) {
    return {
      type:          form.type,
      name:          form.name,
      description:   form.description  || null,
      vendor:        form.vendor        || null,
      quantity:      parseFloat(form.quantity)   || 1,
      unit:          form.unit,
      cost_cents:    form.cost_cents    ? Math.round(parseFloat(form.cost_cents)  * 100) : 0,
      price_cents:   form.billable && form.price_cents
                       ? Math.round(parseFloat(form.price_cents) * 100) : 0,
      billable:      form.billable,
      purchase_date: form.purchase_date || null,
      job_id:        form.job_id        || null,
    };
  }

  async function saveMat(e) {
    e.preventDefault();
    if (savingMat) return;
    setSavingMat(true);
    setMatError('');
    try {
      if (mode === 'add') {
        await api.post(`/projects/${projectId}/materials`, buildPayload(matForm));
      } else {
        await api.patch(`/projects/${projectId}/materials/${mode}`, buildPayload(matForm));
      }
      setMode(null);
      load(true);
    } catch (err) {
      setMatError(err.response?.data?.error ||
        "We couldn't save this item. Your information has been preserved. Please try again.");
    } finally {
      setSavingMat(false);
    }
  }

  async function deleteMat(id) {
    try {
      await api.delete(`/projects/${projectId}/materials/${id}`);
      setConfirmDeleteId(null);
      load(true);
    } catch (err) {
      alert(err.response?.data?.error || "We couldn't delete this item. Please try again.");
    }
  }

  if (loading) return <div className="prj-state">Loading…</div>;

  // All values come from the authoritative backend financials endpoint
  const finMarginAmt = fin?.gross_margin_amount ?? null;
  const finHasCost   = (fin?.total_cost ?? 0) > 0;

  return (
    <div className="prj-fin-tab">
      {fin && (
        <div className="prj-fin-summary">
          <div className="prj-fin-metric">
            <span className="prj-fin-label">
              {(fin.approved_change_orders ?? 0) > 0 ? 'Current Project Value' : 'Contract Value'}
            </span>
            <span className="prj-fin-val">
              {fmtMoney(fin.current_project_value ?? fin.contract_value)}
            </span>
            {(fin.approved_change_orders ?? 0) > 0 && (
              <span className="prj-fin-sub">
                {fmtMoney(fin.contract_value)} + {fmtMoney(fin.approved_change_orders)} in COs
              </span>
            )}
          </div>
          <div className="prj-fin-metric">
            <span className="prj-fin-label">Total Cost</span>
            <span className="prj-fin-val">{fmtMoney(fin.total_cost)}</span>
          </div>
          <div className="prj-fin-metric">
            <span className="prj-fin-label">Billable Amount</span>
            <span className="prj-fin-val">{fmtMoney(fin.total_billable)}</span>
          </div>
          <div className="prj-fin-metric">
            <span className="prj-fin-label">Invoiced</span>
            <span className="prj-fin-val">{fmtMoney(fin.total_invoiced)}</span>
          </div>
          <div className="prj-fin-metric">
            <span className="prj-fin-label">Collected</span>
            <span className="prj-fin-val prj-fin-val--green">{fmtMoney(fin.total_paid)}</span>
          </div>
          <div className="prj-fin-metric">
            <span className="prj-fin-label">Est. Margin</span>
            {finHasCost && finMarginAmt != null ? (
              <span className={`prj-fin-val${finMarginAmt < 0 ? ' prj-fin-val--red' : ' prj-fin-val--green'}`}>
                {fmtMoney(finMarginAmt)}
              </span>
            ) : (
              <span className="prj-fin-val" style={{ color: 'var(--steel)' }}>—</span>
            )}
          </div>
        </div>
      )}

      <div className="prj-section">
        <div className="prj-section-header">
          <span className="prj-section-title">Materials & Expenses</span>
          {isOwnerOrMgr && mode === null && (
            <button className="tb-btn tb-ghost" onClick={openAdd}>
              <Plus size={13} /> Add
            </button>
          )}
        </div>

        {(mode === 'add' || (mode && mode !== null)) && (
          <MatForm
            form={matForm}
            onChange={handleChange}
            workOrders={workOrders}
            error={matError}
            saving={savingMat}
            onSubmit={saveMat}
            onCancel={() => setMode(null)}
            submitLabel={mode === 'add' ? 'Add Item' : 'Save Changes'}
          />
        )}

        {mats.length === 0 && mode === null ? (
          <div className="prj-mat-empty">
            <p className="prj-mat-empty-primary">No materials or expenses yet.</p>
            <p className="prj-mat-empty-sub">Track project purchases, parts, supplies, and other costs here.</p>
            {isOwnerOrMgr && (
              <button className="tb-btn tb-ghost" onClick={openAdd}>
                <Plus size={13} /> Add Material / Expense
              </button>
            )}
          </div>
        ) : mats.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Item</th>
                  <th>Vendor</th>
                  <th>Work Order</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Unit Cost</th>
                  <th style={{ textAlign: 'right' }}>Total Cost</th>
                  <th>Billable</th>
                  <th style={{ textAlign: 'right' }}>Customer</th>
                  {isOwnerOrMgr && <th />}
                </tr>
              </thead>
              <tbody>
                {mats.map(m => (
                  <tr key={m.id} className={mode === m.id ? 'prj-mat-row--editing' : ''}>
                    <td className="prj-mat-date">
                      {fmtDate(m.purchase_date || m.created_at)}
                    </td>
                    <td>
                      <span className={`prj-mat-type prj-mat-type--${m.type || 'material'}`}>
                        {MAT_TYPE_LABELS[m.type] || m.type}
                      </span>
                    </td>
                    <td>
                      <strong>{m.name}</strong>
                      {m.description && <div className="prj-mat-desc">{m.description}</div>}
                    </td>
                    <td>{m.vendor || '—'}</td>
                    <td>{m.work_order_number ? fmtWoNum(m.work_order_number) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{m.quantity}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoney(m.cost_cents)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoney(Math.round(m.cost_cents * m.quantity))}</td>
                    <td>
                      {m.billable
                        ? <span className="prj-mat-bill prj-mat-bill--yes">Yes</span>
                        : <span className="prj-mat-bill">—</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {m.billable ? fmtMoney(Math.round(m.price_cents * m.quantity)) : '—'}
                    </td>
                    {isOwnerOrMgr && (
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {confirmDeleteId === m.id ? (
                          <span className="prj-mat-confirm">
                            Delete?{' '}
                            <button className="prj-mat-confirm-yes" onClick={() => deleteMat(m.id)}>Yes</button>
                            {' / '}
                            <button className="prj-mat-confirm-no" onClick={() => setConfirmDeleteId(null)}>No</button>
                          </span>
                        ) : (
                          <>
                            <button className="prj-icon-btn" title="Edit"
                              onClick={() => { openEdit(m); }}>
                              Edit
                            </button>
                            <button className="prj-icon-btn prj-icon-btn--danger" title="Delete"
                              onClick={() => setConfirmDeleteId(m.id)} aria-label="Delete">
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <BudgetSection
        projectId={projectId}
        budget={budget}
        onRefresh={() => load(true)}
        isOwnerOrMgr={isOwnerOrMgr}
      />

      <ChangeOrdersSection
        projectId={projectId}
        changeOrders={changeOrders}
        onRefresh={() => load(true)}
        isOwnerOrMgr={isOwnerOrMgr}
      />
    </div>
  );
}

// ── Activity Tab ──────────────────────────────────────────
function ActivityTab({ projectId }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote]       = useState('');
  const [posting, setPosting] = useState(false);
  const { user } = useAuth();
  const isOwnerOrMgr = ['owner', 'manager'].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/projects/${projectId}/activity`);
      setItems(r.data);
    } catch {}
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function postNote(e) {
    e.preventDefault();
    if (!note.trim()) return;
    setPosting(true);
    try {
      await api.post(`/projects/${projectId}/activity`, { body: note.trim() });
      setNote('');
      load();
    } catch {}
    setPosting(false);
  }

  return (
    <div className="prj-activity-tab">
      {isOwnerOrMgr && (
        <form onSubmit={postNote} className="prj-note-form">
          <textarea
            className="prj-note-input"
            placeholder="Add a note…"
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
          />
          <button type="submit" className="tb-btn tb-primary" disabled={posting || !note.trim()}>
            {posting ? 'Posting…' : 'Post Note'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="prj-state">Loading…</div>
      ) : items.length === 0 ? (
        <div className="prj-empty"><p className="prj-empty-primary">No activity yet.</p></div>
      ) : (
        <div className="prj-activity-feed">
          {items.map(item => (
            <div key={item.id} className={`prj-activity-item prj-activity-item--${item.type}`}>
              <div className="prj-activity-icon">{ACTIVITY_ICONS[item.type] || '•'}</div>
              <div className="prj-activity-content">
                <span className="prj-activity-body">{item.body}</span>
                <span className="prj-activity-meta">
                  {item.user_name && <>{item.user_name} · </>}
                  {fmtDateTime(item.created_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Generic Confirm Modal ─────────────────────────────────
function ConfirmModal({ title, children, onClose, onConfirm, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleConfirm() {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  }

  return (
    <div className="prj-confirm-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="prj-confirm-modal" role="dialog" aria-modal="true">
        <div className="prj-confirm-header">
          <span className="prj-confirm-title">{title}</span>
          <button className="prj-share-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="prj-confirm-body">{children}</div>
        <div className="prj-confirm-footer">
          <button className="tb-btn tb-ghost" onClick={onClose} disabled={busy}>{cancelLabel}</button>
          <button
            className={`tb-btn ${danger ? 'tb-danger' : 'tb-primary'}`}
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Project Status Selector ───────────────────────────────
const PROJECT_STATUSES = ['draft', 'active', 'on_hold', 'completed', 'cancelled'];
const REOPEN_STATUSES  = new Set(['completed', 'cancelled']);

function ProjectStatusSelector({ project, onStatusChange }) {
  const [open,    setOpen]    = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [confirm, setConfirm] = useState(null); // { type, newStatus, unresolvedCount? }
  const [error,   setError]   = useState('');
  const btnRef  = useRef(null);
  const dropRef = useRef(null);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e)    { if (e.key === 'Escape') setOpen(false); }
    function onClick(e)  {
      if (!btnRef.current?.contains(e.target) && !dropRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('keydown',  onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown',  onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  function pickStatus(newStatus) {
    if (newStatus === project.status) { setOpen(false); return; }
    setOpen(false);

    if (newStatus === 'completed') {
      const unresolved = (project.work_order_count || 0) - (project.resolved_work_orders || 0);
      if (unresolved > 0) {
        setConfirm({ type: 'complete', newStatus, unresolvedCount: unresolved });
        return;
      }
    }
    if (newStatus === 'cancelled') {
      setConfirm({ type: 'cancel', newStatus });
      return;
    }
    if (REOPEN_STATUSES.has(project.status) && (newStatus === 'active' || newStatus === 'draft')) {
      setConfirm({ type: 'reopen', newStatus });
      return;
    }
    commitStatus(newStatus);
  }

  async function commitStatus(newStatus) {
    setSaving(true);
    setError('');
    setConfirm(null);
    try {
      await api.patch(`/projects/${project.id}`, { status: newStatus });
      await onStatusChange();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update status. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="prj-status-sel">
        <button
          ref={btnRef}
          className={`prj-status-btn prj-status-btn--${project.status}`}
          onClick={() => setOpen(o => !o)}
          disabled={saving}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Change project status. Current status: ${STATUS_LABELS[project.status]}.`}
        >
          {saving ? 'Saving…' : STATUS_LABELS[project.status]}
          <ChevronDown size={11} className={`prj-status-caret${open ? ' prj-status-caret--open' : ''}`} />
        </button>

        {error && <div className="prj-status-error">{error}</div>}

        {open && (
          <div ref={dropRef} className="prj-status-drop" role="listbox">
            {PROJECT_STATUSES.map(s => (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={s === project.status}
                className={`prj-status-drop-item${s === project.status ? ' prj-status-drop-item--current' : ''}`}
                onClick={() => pickStatus(s)}
              >
                <span className={`prj-status-dot prj-status-dot--${s}`} />
                {STATUS_LABELS[s]}
                {s === project.status && <Check size={12} className="prj-status-drop-check" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {confirm?.type === 'complete' && (
        <ConfirmModal
          title="Complete Project?"
          confirmLabel="Complete Anyway"
          onClose={() => setConfirm(null)}
          onConfirm={() => commitStatus(confirm.newStatus)}
        >
          <p style={{ marginBottom: 8 }}>
            <strong>{confirm.unresolvedCount} work order{confirm.unresolvedCount !== 1 ? 's are' : ' is'} still incomplete.</strong>
          </p>
          <p>Completing this project will mark it as completed, but will <strong>not</strong> automatically complete those work orders.</p>
        </ConfirmModal>
      )}

      {confirm?.type === 'cancel' && (
        <ConfirmModal
          title="Cancel Project?"
          confirmLabel="Cancel Project"
          cancelLabel="Keep Project"
          danger
          onClose={() => setConfirm(null)}
          onConfirm={() => commitStatus(confirm.newStatus)}
        >
          <p>This will mark the project as cancelled. Existing work orders, invoices, files, expenses, payments, and history will be preserved.</p>
          <p style={{ marginTop: 8 }}>This does not automatically cancel associated work orders.</p>
        </ConfirmModal>
      )}

      {confirm?.type === 'reopen' && (
        <ConfirmModal
          title="Reopen Project?"
          confirmLabel="Reopen Project"
          onClose={() => setConfirm(null)}
          onConfirm={() => commitStatus(confirm.newStatus)}
        >
          <p>This will change <strong>{fmtPrjNum(project.project_number)}</strong> from <strong>{STATUS_LABELS[project.status]}</strong> to <strong>{STATUS_LABELS[confirm.newStatus]}</strong>. Existing project data and work orders will remain unchanged.</p>
        </ConfirmModal>
      )}
    </>
  );
}

// ── Main Workspace ────────────────────────────────────────
const TABS = [
  { key: 'overview',    label: 'Overview' },
  { key: 'work-orders', label: 'Work Orders' },
  { key: 'financials',  label: 'Financials' },
  { key: 'activity',   label: 'Files & History' },
];

export default function ProjectWorkspace() {
  const { id } = useParams();
  const nav    = useNavigate();
  const { user } = useAuth();
  const isOwnerOrMgr = ['owner', 'manager'].includes(user?.role);

  const [project, setProject] = useState(null);
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState('overview');
  const [error,   setError]   = useState('');

  const loadProject = useCallback(async () => {
    try {
      const r = await api.get(`/projects/${id}`);
      setProject(r.data);
    } catch (err) {
      setError(err.response?.status === 404 ? 'Project not found.' : 'Failed to load project.');
    }
  }, [id]);

  useEffect(() => {
    Promise.all([
      loadProject(),
      api.get('/users').then(r => setUsers(r.data || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [loadProject]);

  if (loading) return <div className="prj-state">Loading…</div>;
  if (error) return (
    <div className="prj-state prj-state--error">
      {error}
      <button className="tb-btn tb-ghost" onClick={() => nav('/projects')}>← Back to Projects</button>
    </div>
  );
  if (!project) return null;

  return (
    <div className="prj-workspace">
      <div className="prj-ws-header">
        <div className="prj-ws-breadcrumb">
          <button className="prj-back-btn" onClick={() => nav('/projects')}>
            <ChevronLeft size={15} /> Projects
          </button>
          <span className="prj-ws-breadcrumb-sep">/</span>
          <span className="prj-num">{fmtPrjNum(project.project_number)}</span>
        </div>

        <div className="prj-ws-title-row">
          <div>
            <h1 className="prj-ws-title">{project.name}</h1>
            <div className="prj-ws-meta">
              {project.client_name && <span>{project.client_name}</span>}
              {project.service_address && <span>· {project.service_address}</span>}
              {project.start_date && (
                <span>
                  · {fmtDate(project.start_date)}{project.end_date ? ` – ${fmtDate(project.end_date)}` : ''}
                </span>
              )}
              {project.manager_name && <span>· PM: {project.manager_name}</span>}
            </div>
          </div>
          {isOwnerOrMgr ? (
            <ProjectStatusSelector project={project} onStatusChange={loadProject} />
          ) : (
            <StatusBadge status={project.status}>{STATUS_LABELS[project.status]}</StatusBadge>
          )}
        </div>

        <div className="prj-tabs">
          {TABS.map(t => (
            <button
              key={t.key}
              className={`prj-tab${tab === t.key ? ' prj-tab--active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="prj-ws-body">
        {tab === 'overview' && (
          <OverviewTab
            project={project}
            users={users}
            onRefresh={loadProject}
            onTabChange={setTab}
          />
        )}
        {tab === 'work-orders' && (
          <WorkOrdersTab projectId={id} users={users} onRefresh={loadProject} />
        )}
        {tab === 'financials' && (
          <FinancialsTab projectId={id} />
        )}
        {tab === 'activity' && (
          <ActivityTab projectId={id} />
        )}
      </div>
    </div>
  );
}
