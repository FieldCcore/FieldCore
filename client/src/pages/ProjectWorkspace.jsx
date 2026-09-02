import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Plus, X, Check, Trash2, ExternalLink,
  ChevronDown, ChevronUp, Search,
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
const BILLING_LABELS = {
  fixed: 'Fixed Price', time_materials: 'Time & Materials', cost_plus: 'Cost Plus',
};
const ACTIVITY_ICONS = {
  created: '✦', status_changed: '⟳', work_order_added: '＋', cancelled: '✕', note: '◆',
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

// ── Overview Tab (V2 command center) ─────────────────────
function OverviewTab({ project, users, onRefresh, onTabChange }) {
  const [editing, setEditing]   = useState(false);
  const [form, setForm]         = useState({});
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState('');
  const [workOrders, setWorkOrders] = useState([]);
  const [fin, setFin]           = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading]   = useState(true);
  const { user } = useAuth();
  const isOwnerOrMgr = ['owner', 'manager'].includes(user?.role);

  useEffect(() => {
    Promise.all([
      api.get(`/projects/${project.id}/work-orders`),
      api.get(`/projects/${project.id}/financials`),
      api.get(`/projects/${project.id}/activity`),
    ]).then(([woRes, finRes, actRes]) => {
      setWorkOrders(woRes.data || []);
      setFin(finRes.data || null);
      setActivity(actRes.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
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
  const totalWOs      = project.work_order_count      ?? 0;
  const completedWOs  = project.completed_work_orders ?? 0;
  const woPct         = totalWOs > 0 ? Math.round((completedWOs / totalWOs) * 100) : 0;
  const contractValue = project.contract_value        ?? 0;
  const invoiced      = fin?.total_invoiced            ?? 0;
  const collected     = fin?.total_paid                ?? 0;
  const outstanding   = Math.max(0, invoiced - collected);
  const matCost       = fin?.total_material_cost       ?? 0;
  const hasCostData   = matCost > 0;
  const marginDollars = contractValue - matCost;
  const marginPct     = contractValue > 0 && hasCostData
    ? Math.round((marginDollars / contractValue) * 100)
    : null;

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
          <div className="prj-kpi-sub-label">Contract Value</div>
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
          <div className="prj-kpi-main">{fmtMoney(matCost)}</div>
          <div className="prj-kpi-sub-label">Total Cost</div>
          <div className="prj-kpi-rows">
            <div className="prj-kpi-row"><span>Material Cost</span><span>{fmtMoney(matCost)}</span></div>
            <div className="prj-kpi-row"><span>Labor Cost</span><span>—</span></div>
            <div className="prj-kpi-row"><span>Other</span><span>—</span></div>
          </div>
          <button className="prj-kpi-link" onClick={() => onTabChange('financials')}>
            View financials →
          </button>
        </div>

        <div className="prj-kpi-card">
          <div className="prj-kpi-title">Project Margin</div>
          <div className={`prj-kpi-main${!hasCostData ? '' : marginDollars < 0 ? ' prj-kpi-main--red' : marginDollars > 0 ? ' prj-kpi-main--green' : ''}`}>
            {hasCostData && marginPct != null ? `${marginPct}%` : '—'}
          </div>
          <div className="prj-kpi-sub-label">
            {hasCostData ? `${fmtMoney(marginDollars)} gross margin` : 'Add costs to see margin'}
          </div>
          {hasCostData && marginPct != null && (
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
                        <StatusBadge status={wo.status}>{wo.status?.replace(/_/g, ' ')}</StatusBadge>
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

// ── Work Order row ────────────────────────────────────────
function WorkOrderRow({ wo, projectId, users, onRefresh, isOwnerOrMgr }) {
  const [expanded, setExpanded]     = useState(false);
  const [tasks, setTasks]           = useState([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [newTask, setNewTask]       = useState('');
  const [addingTask, setAddingTask] = useState(false);
  const [editingWo, setEditingWo]   = useState(false);
  const [woForm, setWoForm]         = useState({});
  const [savingWo, setSavingWo]     = useState(false);
  const nav = useNavigate();

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
      title:            wo.title            || '',
      description:      wo.description      || '',
      tech_id:          wo.tech_id          || '',
      status:           wo.status           || 'unscheduled',
      priority:         wo.priority         || 'normal',
      scheduled_at:     wo.scheduled_at     ? wo.scheduled_at.slice(0, 16) : '',
      duration_minutes: wo.duration_minutes || '',
      instructions:     wo.instructions     || '',
    });
    setEditingWo(true);
  }

  async function saveWo(e) {
    e.preventDefault();
    setSavingWo(true);
    try {
      await api.patch(`/projects/${projectId}/work-orders/${wo.id}`, {
        ...woForm,
        tech_id:          woForm.tech_id          || null,
        scheduled_at:     woForm.scheduled_at     || null,
        duration_minutes: woForm.duration_minutes ? parseInt(woForm.duration_minutes) : null,
      });
      setEditingWo(false);
      onRefresh();
    } catch {}
    setSavingWo(false);
  }

  async function deleteWo() {
    if (!window.confirm(`Delete work order "${wo.title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/projects/${projectId}/work-orders/${wo.id}`);
      onRefresh();
    } catch {}
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
        <StatusBadge status={wo.status}>{wo.status?.replace(/_/g, ' ')}</StatusBadge>
        {wo.priority && wo.priority !== 'normal' && (
          <span className={`prj-priority prj-priority--${wo.priority}`}>{wo.priority}</span>
        )}
        {wo.tech_name && <span className="prj-wo-tech">{wo.tech_name}</span>}
        {wo.task_count > 0 && (
          <span className="prj-wo-task-badge">{wo.complete_count}/{wo.task_count} tasks</span>
        )}
        {wo.scheduled_at && (
          <span className="prj-wo-date">{fmtDate(wo.scheduled_at)}</span>
        )}
        <div className="prj-wo-row-actions" onClick={e => e.stopPropagation()}>
          <button className="prj-icon-btn" title="View on Calendar" onClick={() => nav(`/jobs?highlight=${wo.id}`)}>
            <ExternalLink size={13} />
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

      {expanded && (
        <div className="prj-wo-body">
          {editingWo ? (
            <form onSubmit={saveWo} className="prj-wo-edit-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Title *</label>
                  <input value={woForm.title} onChange={e => setWoForm(p => ({ ...p, title: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={woForm.status} onChange={e => setWoForm(p => ({ ...p, status: e.target.value }))}>
                    {WO_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Assigned Tech</label>
                  <select value={woForm.tech_id} onChange={e => setWoForm(p => ({ ...p, tech_id: e.target.value }))}>
                    <option value="">— Unassigned —</option>
                    {users.filter(u => u.role === 'tech').map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Priority</label>
                  <select value={woForm.priority} onChange={e => setWoForm(p => ({ ...p, priority: e.target.value }))}>
                    {['low', 'normal', 'high', 'urgent'].map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Scheduled At</label>
                  <input type="datetime-local" value={woForm.scheduled_at} onChange={e => setWoForm(p => ({ ...p, scheduled_at: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Duration (min)</label>
                  <input type="number" min="0" value={woForm.duration_minutes} onChange={e => setWoForm(p => ({ ...p, duration_minutes: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea rows={2} value={woForm.description} onChange={e => setWoForm(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Tech Instructions</label>
                <textarea rows={2} value={woForm.instructions} onChange={e => setWoForm(p => ({ ...p, instructions: e.target.value }))} />
              </div>
              <div className="prj-form-actions">
                <button type="submit" className="tb-btn tb-primary" disabled={savingWo}>
                  {savingWo ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="tb-btn tb-ghost" onClick={() => setEditingWo(false)}>Cancel</button>
              </div>
            </form>
          ) : (
            <div className="prj-wo-details">
              {wo.description && <p className="prj-wo-desc">{wo.description}</p>}
              {wo.instructions && (
                <div className="prj-wo-instructions">
                  <span className="prj-wo-instructions-label">Instructions</span>
                  <p>{wo.instructions}</p>
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
  const [workOrders, setWorkOrders]       = useState([]);
  const [loading, setLoading]             = useState(true);
  const [showForm, setShowForm]           = useState(false);
  const [form, setForm]                   = useState({});
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState('');
  const [filterStatus, setFilterStatus]   = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [search, setSearch]               = useState('');
  const { user } = useAuth();
  const isOwnerOrMgr = ['owner', 'manager'].includes(user?.role);

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
      title: '', description: '', tech_id: '', status: 'unscheduled',
      priority: 'normal', scheduled_at: '', duration_minutes: '', instructions: '',
    });
    setError('');
    setShowForm(true);
  }

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/projects/${projectId}/work-orders`, {
        ...form,
        tech_id:          form.tech_id          || null,
        scheduled_at:     form.scheduled_at     || null,
        duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
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
          <div className="prj-section-title">New Work Order</div>
          {error && <div className="prj-form-error">{error}</div>}
          <form onSubmit={save}>
            <div className="form-group">
              <label>Title *</label>
              <input value={form.title} onChange={set('title')} required placeholder="e.g. Demo existing flooring" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Status</label>
                <select value={form.status} onChange={set('status')}>
                  {WO_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Priority</label>
                <select value={form.priority} onChange={set('priority')}>
                  {['low', 'normal', 'high', 'urgent'].map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Assigned Tech</label>
                <select value={form.tech_id} onChange={set('tech_id')}>
                  <option value="">— Unassigned —</option>
                  {users.filter(u => u.role === 'tech').map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Scheduled At</label>
                <input type="datetime-local" value={form.scheduled_at} onChange={set('scheduled_at')} />
              </div>
            </div>
            <div className="form-group">
              <label>Duration (minutes)</label>
              <input type="number" min="0" value={form.duration_minutes} onChange={set('duration_minutes')} placeholder="e.g. 120" />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea rows={2} value={form.description} onChange={set('description')} />
            </div>
            <div className="form-group">
              <label>Tech Instructions</label>
              <textarea rows={2} value={form.instructions} onChange={set('instructions')} />
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
              onRefresh={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Financials Tab ────────────────────────────────────────
function FinancialsTab({ projectId }) {
  const [fin, setFin]           = useState(null);
  const [mats, setMats]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showMat, setShowMat]   = useState(false);
  const [matForm, setMatForm]   = useState({ name: '', quantity: 1, unit: 'each', cost_cents: '', price_cents: '' });
  const [savingMat, setSavingMat] = useState(false);
  const [matError, setMatError] = useState('');
  const { user } = useAuth();
  const isOwnerOrMgr = ['owner', 'manager'].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fRes, mRes] = await Promise.all([
        api.get(`/projects/${projectId}/financials`),
        api.get(`/projects/${projectId}/materials`),
      ]);
      setFin(fRes.data);
      setMats(mRes.data);
    } catch {}
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function saveMat(e) {
    e.preventDefault();
    setSavingMat(true);
    setMatError('');
    try {
      await api.post(`/projects/${projectId}/materials`, {
        name:        matForm.name,
        quantity:    parseFloat(matForm.quantity) || 1,
        unit:        matForm.unit,
        cost_cents:  matForm.cost_cents  ? Math.round(parseFloat(matForm.cost_cents)  * 100) : 0,
        price_cents: matForm.price_cents ? Math.round(parseFloat(matForm.price_cents) * 100) : 0,
      });
      setShowMat(false);
      setMatForm({ name: '', quantity: 1, unit: 'each', cost_cents: '', price_cents: '' });
      load();
    } catch (err) {
      setMatError(err.response?.data?.error || 'Failed to save.');
    } finally {
      setSavingMat(false);
    }
  }

  async function deleteMat(id) {
    try {
      await api.delete(`/projects/${projectId}/materials/${id}`);
      load();
    } catch {}
  }

  function setMat(field) {
    return e => setMatForm(p => ({ ...p, [field]: e.target.value }));
  }

  if (loading) return <div className="prj-state">Loading…</div>;

  const margin = fin ? fin.contract_value - fin.total_material_cost : 0;

  return (
    <div className="prj-fin-tab">
      {fin && (
        <div className="prj-fin-summary">
          <div className="prj-fin-metric">
            <span className="prj-fin-label">Contract Value</span>
            <span className="prj-fin-val">{fmtMoney(fin.contract_value)}</span>
          </div>
          <div className="prj-fin-metric">
            <span className="prj-fin-label">Material Cost</span>
            <span className="prj-fin-val">{fmtMoney(fin.total_material_cost)}</span>
          </div>
          <div className="prj-fin-metric">
            <span className="prj-fin-label">Billable Materials</span>
            <span className="prj-fin-val">{fmtMoney(fin.total_material_price)}</span>
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
            <span className={`prj-fin-val${margin < 0 ? ' prj-fin-val--red' : ' prj-fin-val--green'}`}>
              {fmtMoney(margin)}
            </span>
          </div>
        </div>
      )}

      <div className="prj-section">
        <div className="prj-section-header">
          <span className="prj-section-title">Materials & Expenses</span>
          {isOwnerOrMgr && (
            <button className="tb-btn tb-ghost" onClick={() => setShowMat(s => !s)}>
              <Plus size={13} /> Add
            </button>
          )}
        </div>

        {showMat && (
          <div className="prj-mat-form">
            {matError && <div className="prj-form-error">{matError}</div>}
            <form onSubmit={saveMat}>
              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label>Item Name *</label>
                  <input value={matForm.name} onChange={setMat('name')} required placeholder="e.g. Tile adhesive" />
                </div>
                <div className="form-group">
                  <label>Qty</label>
                  <input type="number" min="0" step="0.001" value={matForm.quantity} onChange={setMat('quantity')} />
                </div>
                <div className="form-group">
                  <label>Unit</label>
                  <input value={matForm.unit} onChange={setMat('unit')} placeholder="each, sq ft…" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Cost ($)</label>
                  <input type="number" min="0" step="0.01" value={matForm.cost_cents} onChange={setMat('cost_cents')} placeholder="0.00" />
                </div>
                <div className="form-group">
                  <label>Billable Price ($)</label>
                  <input type="number" min="0" step="0.01" value={matForm.price_cents} onChange={setMat('price_cents')} placeholder="0.00" />
                </div>
              </div>
              <div className="prj-form-actions">
                <button type="submit" className="tb-btn tb-primary" disabled={savingMat}>
                  {savingMat ? 'Saving…' : 'Add Item'}
                </button>
                <button type="button" className="tb-btn tb-ghost" onClick={() => setShowMat(false)}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        {mats.length === 0 ? (
          <p className="prj-state">No materials or expenses logged yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Work Order</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th style={{ textAlign: 'right' }}>Cost</th>
                  <th style={{ textAlign: 'right' }}>Billable</th>
                  {isOwnerOrMgr && <th />}
                </tr>
              </thead>
              <tbody>
                {mats.map(m => (
                  <tr key={m.id}>
                    <td><strong>{m.name}</strong></td>
                    <td>{m.work_order_number ? fmtWoNum(m.work_order_number) : '—'}</td>
                    <td>{m.quantity}</td>
                    <td>{m.unit}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoney(Math.round(m.cost_cents * m.quantity))}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoney(Math.round(m.price_cents * m.quantity))}</td>
                    {isOwnerOrMgr && (
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="prj-icon-btn prj-icon-btn--danger"
                          onClick={() => deleteMat(m.id)}
                          aria-label="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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

// ── Main Workspace ────────────────────────────────────────
const TABS = [
  { key: 'overview',    label: 'Overview' },
  { key: 'work-orders', label: 'Work Orders' },
  { key: 'financials',  label: 'Financials' },
  { key: 'activity',   label: 'Files & Activity' },
];

export default function ProjectWorkspace() {
  const { id } = useParams();
  const nav    = useNavigate();
  const { user } = useAuth();

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
          <StatusBadge status={project.status}>{STATUS_LABELS[project.status]}</StatusBadge>
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
