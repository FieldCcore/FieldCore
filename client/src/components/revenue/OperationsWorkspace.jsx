import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api';
import KpiCard from '../KpiCard';
import { Briefcase, Target, BarChart2, TrendingUp, DollarSign, Clock, Users, Wrench, AlertCircle } from 'lucide-react';

// ── Data fetching hook ────────────────────────────────────────────────────────

function useOpsData(path, params, deps) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qp  = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v != null)));
      const res = await api.get(`${path}?${qp}`);
      setData(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetch_(); }, [fetch_]);

  return { data, loading, error, refetch: fetch_ };
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtMoney(n) {
  const v = parseFloat(n) || 0;
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000)    return `$${(v / 1000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function fmtPct(v) {
  if (v == null) return '—';
  return `${(parseFloat(v) * 100).toFixed(1)}%`;
}

function fmtNum(n) { return n != null ? String(Math.round(n)) : '—'; }

function formatRole(r) {
  return (r || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── OpsKpiRow ─────────────────────────────────────────────────────────────────

function OpsKpiRow({ data, loading }) {
  const kpis    = data?.kpis || {};
  const upsell  = kpis.upsellRevenue || {};
  const commOwed = kpis.commissionsOwed || {};
  const revHr   = kpis.revenuePerLaborHour || {};

  const completionVal  = kpis.completionRate?.status === 'ok' ? parseFloat(kpis.completionRate.value) : null;
  const completionTone = completionVal == null ? 'neutral' : completionVal >= 0.75 ? 'success' : 'warning';

  return (
    <div className="ops-kpi-grid" aria-label="Operations KPIs">
      <KpiCard
        icon={Briefcase}
        title="Jobs Completed"
        value={kpis.jobsCompleted?.status === 'ok' ? fmtNum(kpis.jobsCompleted.value) : '—'}
        tone={kpis.jobsCompleted?.value > 0 ? 'success' : 'neutral'}
        loading={loading}
      />
      <KpiCard
        icon={Target}
        title="Completion Rate"
        value={kpis.completionRate?.status === 'ok' ? fmtPct(kpis.completionRate.value) : '—'}
        subtitle={kpis.completionRate?.status === 'unavailable' ? 'No eligible jobs in period' : undefined}
        tone={completionTone}
        loading={loading}
      />
      <KpiCard
        icon={BarChart2}
        title="Production Value"
        value={kpis.productionValue?.status === 'ok' ? fmtMoney(kpis.productionValue.value) : '—'}
        tone={kpis.productionValue?.value > 0 ? 'success' : 'neutral'}
        loading={loading}
      />
      <KpiCard
        icon={TrendingUp}
        title="Upsell Revenue"
        value={upsell.status === 'ok' ? fmtMoney(upsell.value) : '—'}
        subtitle={upsell.status === 'unavailable' ? 'Not yet available' : upsell.value === 0 ? 'No upsells this period' : undefined}
        tone={upsell.status === 'ok' && upsell.value > 0 ? 'success' : 'neutral'}
        loading={loading}
      />
      <KpiCard
        icon={DollarSign}
        title="Commissions Owed"
        value={commOwed.status === 'ok' ? fmtMoney(commOwed.value) : '—'}
        subtitle={commOwed.status === 'unavailable' ? 'No commission rules' : undefined}
        tone={commOwed.status === 'ok' && commOwed.value > 0 ? 'warning' : 'neutral'}
        loading={loading}
      />
      <KpiCard
        icon={Clock}
        title="Rev / Labor Hour"
        value={revHr.status === 'ok' ? fmtMoney(revHr.value) : '—'}
        subtitle={revHr.basis === 'scheduled_labor_hours' ? 'Scheduled hrs' : undefined}
        tone={revHr.status === 'ok' && revHr.value > 0 ? 'success' : 'neutral'}
        loading={loading}
      />
    </div>
  );
}

// ── TeamPerformanceSection ────────────────────────────────────────────────────

function TeamPerformanceSection({ filterStart, filterEnd }) {
  const { data, loading, error } = useOpsData(
    '/revenue/operations/team',
    { start: filterStart, end: filterEnd },
    [filterStart, filterEnd]
  );
  const [sortKey, setSortKey]     = useState('productionValue');
  const [sortDir, setSortDir]     = useState('desc');
  const [selected, setSelected]   = useState(null);

  const members = data?.members || [];

  function handleSort(k) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  }

  const sorted = [...members].sort((a, b) => {
    const av = a[sortKey] ?? -Infinity;
    const bv = b[sortKey] ?? -Infinity;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  function SortTh({ col, label }) {
    const active = sortKey === col;
    return (
      <th
        onClick={() => handleSort(col)}
        className={`rov-th-sort${active ? ' rov-th-sort--active' : ''}`}
        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        scope="col"
      >
        {label}
        <span aria-hidden="true" className="rov-th-arrow">
          {active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
        </span>
      </th>
    );
  }

  const body = loading ? (
    <div className="ops-section-loading" aria-label="Loading team performance" />
  ) : error ? (
    <div className="ops-section-error">Team performance data could not be loaded.</div>
  ) : members.length === 0 ? (
    <div className="ops-empty-state">
      <div className="ops-empty-icon" aria-hidden="true"><Users size={22} /></div>
      <div className="ops-empty-msg">No team assignment data for this period.</div>
      <div className="ops-empty-hint">Assign technicians to jobs to see individual performance metrics here.</div>
    </div>
  ) : (
    <div className="ops-table-card">
      <div className="table-wrap">
        <table className="table ops-team-table" aria-label="Team performance">
        <thead>
          <tr>
            <th scope="col">Team Member</th>
            <th scope="col">Role</th>
            <SortTh col="jobsCompleted"   label="Jobs"       />
            <SortTh col="productionValue" label="Prod. Value" />
            <SortTh col="avgTicket"       label="Avg Ticket"  />
            <SortTh col="completionRate"  label="Completion"  />
            <SortTh col="laborHours"      label="Labor Hrs"   />
            <SortTh col="revenuePerLaborHour" label="Rev / Hr" />
            <th scope="col">Commission</th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          {sorted.map(m => (
            <tr key={m.userId} className="ops-team-row">
              <td><strong>{m.name}</strong></td>
              <td>
                <span className="ops-role-chip ops-role-chip--primary">{formatRole(m.userRole)}</span>
                {m.assignmentRoles.filter(r => r !== m.userRole).slice(0, 1).map(r => (
                  <span key={r} className="ops-role-chip ops-role-chip--secondary">{formatRole(r)}</span>
                ))}
              </td>
              <td>{fmtNum(m.jobsCompleted)}</td>
              <td><strong>{fmtMoney(m.productionValue)}</strong></td>
              <td>{m.avgTicket != null ? fmtMoney(m.avgTicket) : '—'}</td>
              <td>
                {m.completionRate != null
                  ? <span style={{ color: m.completionRate < 0.75 ? 'var(--red)' : 'var(--green)' }}>
                      {fmtPct(m.completionRate)}
                    </span>
                  : '—'}
              </td>
              <td>{m.laborHours > 0 ? `${m.laborHours}h` : '—'}</td>
              <td>{m.revenuePerLaborHour != null ? fmtMoney(m.revenuePerLaborHour) : '—'}</td>
              <td>
                {m.commissionEarned != null
                  ? <span className="ops-commission-chip">{fmtMoney(m.commissionEarned)}</span>
                  : <span style={{ color: 'var(--steel)', fontSize: 11 }}>—</span>}
              </td>
              <td>
                <button
                  type="button"
                  className="ops-detail-btn"
                  onClick={() => setSelected(m)}
                  aria-label={`View details for ${m.name}`}
                >
                  Details →
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="ops-section-group">
      <div className="ops-bare-heading">
        <h2 className="rov-ws-section-title">Team Performance</h2>
        {!loading && members.length > 0 && (
          <span className="rov-ws-section-sub">
            {members.length} team member{members.length !== 1 ? 's' : ''} · production value attributed to primary assignee
          </span>
        )}
      </div>
      {body}
      {data?.limitations?.length > 0 && (
        <div className="ops-bare-info">
          {data.limitations.map((l, i) => (
            <span key={i} className="ops-limitation-note">{l}</span>
          ))}
        </div>
      )}
      {selected && (
        <MemberDetailDrawer
          member={selected}
          filterStart={filterStart}
          filterEnd={filterEnd}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ── MemberDetailDrawer ────────────────────────────────────────────────────────

function MemberDetailDrawer({ member, filterStart, filterEnd, onClose }) {
  const { data, loading } = useOpsData(
    `/revenue/operations/team/${member.userId}`,
    { start: filterStart, end: filterEnd },
    [member.userId, filterStart, filterEnd]
  );

  const STATUS_COLOR = {
    complete:  'var(--green)',
    cancelled: 'var(--red)',
    no_show:   '#B45309',
  };

  return (
    <div className="fin-modal-overlay" role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fin-modal-body ops-drawer-body" role="dialog" aria-modal="true" aria-labelledby="ops-drawer-title">
        <div className="fin-modal-header">
          <h3 id="ops-drawer-title" className="fin-modal-title">{member.name}</h3>
          <button type="button" className="fin-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        {loading ? (
          <div className="ops-section-loading" style={{ margin: '24px 0' }} />
        ) : data ? (
          <>
            <div className="ops-drawer-summary">
              {[
                { label: 'Jobs Completed',    value: fmtNum(data.summary?.jobsCompleted) },
                { label: 'Production Value',  value: fmtMoney(data.summary?.productionValue) },
                { label: 'Completion Rate',   value: fmtPct(data.summary?.completionRate) },
                { label: 'Labor Hours',       value: data.summary?.laborHours > 0 ? `${data.summary.laborHours}h` : '—' },
                { label: 'Rev / Labor Hour',  value: data.summary?.revenuePerLaborHour != null ? fmtMoney(data.summary.revenuePerLaborHour) : '—' },
              ].map(s => (
                <div key={s.label} className="ops-drawer-stat">
                  <div className="ops-drawer-stat-label">{s.label}</div>
                  <div className="ops-drawer-stat-value">{s.value}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              <div className="ops-drawer-section-title">Recent Jobs ({data.jobs?.length || 0})</div>
              {data.jobs?.length === 0 ? (
                <div className="ops-empty-state" style={{ padding: '16px 0' }}>No jobs in this period.</div>
              ) : (
                <div className="ops-drawer-jobs">
                  {data.jobs.slice(0, 20).map(j => (
                    <div key={j.id} className="ops-drawer-job-row">
                      <div className="ops-drawer-job-info">
                        <span className="ops-drawer-job-service">{j.serviceType || 'Unspecified'}</span>
                        <span className="ops-drawer-job-date">
                          {j.scheduledAt ? new Date(j.scheduledAt).toLocaleDateString() : ''}
                        </span>
                        {j.isPrimary && <span className="ops-primary-badge">Lead</span>}
                      </div>
                      <div className="ops-drawer-job-right">
                        <span className="ops-drawer-job-amount">{fmtMoney(j.amount)}</span>
                        <span
                          className="ops-status-dot"
                          style={{ background: STATUS_COLOR[j.status] || 'var(--steel)' }}
                          title={j.status}
                          aria-label={j.status}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ── SalesUpsellsSection ───────────────────────────────────────────────────────

function SalesUpsellsSection({ filterStart, filterEnd }) {
  const { data, loading, error } = useOpsData(
    '/revenue/operations/upsells',
    { start: filterStart, end: filterEnd },
    [filterStart, filterEnd]
  );

  const members        = data?.members || [];
  const hasAttribution = data?.hasAttribution;

  return (
    <div className="ops-section-group">
      <div className="ops-sub-card ops-sub-card--header">
        <h2 className="rov-ws-section-title">Sales &amp; Upsell Attribution</h2>
        {!loading && hasAttribution && members.length > 0 && (
          <span className="rov-ws-section-sub">
            {members.length} member{members.length !== 1 ? 's' : ''} · revenue added beyond original booked scope
          </span>
        )}
      </div>

      <div className="ops-sub-card">
        {loading ? (
          <div className="ops-section-loading" style={{ margin: '16px 18px' }} />
        ) : error ? (
          <div className="ops-section-error">Sales attribution data could not be loaded.</div>
        ) : !hasAttribution ? (
          <div className="ops-empty-state">
            <div className="ops-empty-icon" aria-hidden="true"><AlertCircle size={22} /></div>
            <div className="ops-empty-msg">Upsell attribution not yet available.</div>
            <div className="ops-empty-hint">Deploy the latest migration to enable upsell tracking.</div>
          </div>
        ) : members.length === 0 ? (
          <div className="ops-empty-state">
            <div className="ops-empty-icon" aria-hidden="true"><TrendingUp size={22} /></div>
            <div className="ops-empty-msg">No upsells in this period.</div>
            <div className="ops-empty-hint">Upsells appear here when team members add revenue beyond the original booked scope.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table ops-attr-table" aria-label="Sales and upsell attribution">
              <thead>
                <tr>
                  <th scope="col">Team Member</th>
                  <th scope="col">Role</th>
                  <th scope="col">Original Sales</th>
                  <th scope="col">Upsell Revenue</th>
                  <th scope="col">Upsell Count</th>
                  <th scope="col">Avg Upsell</th>
                  <th scope="col">Final Job Value</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.userId}>
                    <td><strong>{m.name}</strong></td>
                    <td>
                      <span className="ops-role-chip ops-role-chip--primary">{formatRole(m.userRole)}</span>
                    </td>
                    <td>{fmtMoney(m.originalSales)}</td>
                    <td><strong>{fmtMoney(m.upsellRevenue)}</strong></td>
                    <td>{m.upsellCount}</td>
                    <td>{m.avgUpsell > 0 ? fmtMoney(m.avgUpsell) : '—'}</td>
                    <td><strong>{fmtMoney(m.finalJobValue)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data?.historicalNote && (
        <div className="ops-sub-card ops-sub-card--info">
          <span className="ops-limitation-note">{data.historicalNote}</span>
        </div>
      )}
    </div>
  );
}

// ── CommissionSection ─────────────────────────────────────────────────────────

function CompensationRulesModal({ onClose }) {
  const { data, loading, error, refetch } = useOpsData(
    '/operations/compensation-rules', {}, []
  );
  const [form, setForm] = useState({
    name: '', commission_type: 'percentage', rate_percent: '',
    flat_amount: '', basis: 'completed_revenue', trigger: 'job_completed',
    applies_to_role: '', applies_to_service: '', active: true,
  });
  const [saving, setSaving]   = useState(false);
  const [formErr, setFormErr] = useState('');

  const rules = data?.rules || [];

  async function handleCreate(e) {
    e.preventDefault();
    setFormErr('');
    setSaving(true);
    try {
      const payload = {
        ...form,
        rate_percent: form.commission_type === 'percentage' ? parseFloat(form.rate_percent) : undefined,
        flat_amount:  form.commission_type === 'flat_amount' ? parseFloat(form.flat_amount) : undefined,
        applies_to_role:    form.applies_to_role    || undefined,
        applies_to_service: form.applies_to_service || undefined,
      };
      await api.post('/operations/compensation-rules', payload);
      refetch();
      setForm({
        name: '', commission_type: 'percentage', rate_percent: '',
        flat_amount: '', basis: 'completed_revenue', trigger: 'job_completed',
        applies_to_role: '', applies_to_service: '', active: true,
      });
    } catch (err) {
      setFormErr(err?.response?.data?.error || 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(ruleId) {
    try { await api.delete(`/operations/compensation-rules/${ruleId}`); refetch(); } catch { /* ignore */ }
  }

  const BASIS_LABELS = {
    booked_revenue:     'Booked Revenue',
    completed_revenue:  'Completed Revenue',
    invoiced_revenue:   'Invoiced Revenue',
    collected_revenue:  'Collected Revenue',
    upsell_revenue:     'Upsell Revenue',
    flat_per_job:       'Flat Per Job',
  };
  const TRIGGER_LABELS = {
    job_booked:         'Job Booked',
    job_completed:      'Job Completed',
    invoice_issued:     'Invoice Issued',
    payment_collected:  'Payment Collected',
    upsell_completed:   'Upsell Completed',
    manual_approval:    'Manual Approval',
  };

  return (
    <div className="fin-modal-overlay" role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fin-modal-body ops-rules-modal" role="dialog" aria-modal="true" aria-labelledby="ops-rules-title">
        <div className="fin-modal-header">
          <h3 id="ops-rules-title" className="fin-modal-title">Compensation Rules</h3>
          <button type="button" className="fin-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Existing rules */}
        <div style={{ marginBottom: 20 }}>
          <div className="ops-rules-list-header">Active Rules</div>
          {loading ? (
            <div className="ops-section-loading" />
          ) : error ? (
            <div className="ops-section-error">Could not load rules.</div>
          ) : rules.filter(r => r.active).length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--steel)', padding: '8px 0' }}>
              No active compensation rules configured.
            </div>
          ) : (
            rules.filter(r => r.active).map(r => (
              <div key={r.id} className="ops-rule-row">
                <div className="ops-rule-info">
                  <span className="ops-rule-name">{r.name}</span>
                  <span className="ops-rule-detail">
                    {r.commissionType === 'percentage'
                      ? `${(r.ratePercent * 100).toFixed(0)}%`
                      : `$${r.flatAmount?.toFixed(2)}`}
                    {' · '}{BASIS_LABELS[r.basis] || r.basis}
                    {' · '}{TRIGGER_LABELS[r.trigger] || r.trigger}
                    {r.appliesToRole ? ` · for ${r.appliesToRole}` : ''}
                    {r.appliesToService ? ` · ${r.appliesToService}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="ops-rule-deactivate-btn"
                  onClick={() => handleDeactivate(r.id)}
                  aria-label={`Deactivate ${r.name}`}
                >
                  Deactivate
                </button>
              </div>
            ))
          )}
        </div>

        {/* Create rule form */}
        <div className="ops-rules-list-header" style={{ marginBottom: 12 }}>Add New Rule</div>
        <form onSubmit={handleCreate} className="ops-rule-form">
          <div className="ops-rule-form-row">
            <label className="ops-rule-label" htmlFor="rule-name">Rule Name</label>
            <input
              id="rule-name"
              type="text"
              className="ops-rule-input"
              placeholder="e.g. Technician Completion Bonus"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="ops-rule-form-row ops-rule-form-row--2col">
            <div>
              <label className="ops-rule-label" htmlFor="rule-type">Type</label>
              <select
                id="rule-type"
                className="ops-rule-select"
                value={form.commission_type}
                onChange={e => setForm(f => ({ ...f, commission_type: e.target.value }))}
              >
                <option value="percentage">Percentage</option>
                <option value="flat_amount">Flat Amount</option>
              </select>
            </div>
            <div>
              {form.commission_type === 'percentage' ? (
                <>
                  <label className="ops-rule-label" htmlFor="rule-rate">Rate (0–1)</label>
                  <input
                    id="rule-rate"
                    type="number"
                    className="ops-rule-input"
                    placeholder="0.40 = 40%"
                    step="0.01" min="0" max="1"
                    value={form.rate_percent}
                    onChange={e => setForm(f => ({ ...f, rate_percent: e.target.value }))}
                    required
                  />
                </>
              ) : (
                <>
                  <label className="ops-rule-label" htmlFor="rule-flat">Amount ($)</label>
                  <input
                    id="rule-flat"
                    type="number"
                    className="ops-rule-input"
                    placeholder="75.00"
                    step="0.01" min="0"
                    value={form.flat_amount}
                    onChange={e => setForm(f => ({ ...f, flat_amount: e.target.value }))}
                    required
                  />
                </>
              )}
            </div>
          </div>
          <div className="ops-rule-form-row ops-rule-form-row--2col">
            <div>
              <label className="ops-rule-label" htmlFor="rule-basis">Basis</label>
              <select
                id="rule-basis"
                className="ops-rule-select"
                value={form.basis}
                onChange={e => setForm(f => ({ ...f, basis: e.target.value }))}
              >
                {Object.entries(BASIS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="ops-rule-label" htmlFor="rule-trigger">Trigger</label>
              <select
                id="rule-trigger"
                className="ops-rule-select"
                value={form.trigger}
                onChange={e => setForm(f => ({ ...f, trigger: e.target.value }))}
              >
                {Object.entries(TRIGGER_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="ops-rule-form-row ops-rule-form-row--2col">
            <div>
              <label className="ops-rule-label" htmlFor="rule-role">Applies to Role (optional)</label>
              <input
                id="rule-role"
                type="text"
                className="ops-rule-input"
                placeholder="technician, manager, etc."
                value={form.applies_to_role}
                onChange={e => setForm(f => ({ ...f, applies_to_role: e.target.value }))}
              />
            </div>
            <div>
              <label className="ops-rule-label" htmlFor="rule-service">Applies to Service (optional)</label>
              <input
                id="rule-service"
                type="text"
                className="ops-rule-input"
                placeholder="HVAC, Cleaning, etc."
                value={form.applies_to_service}
                onChange={e => setForm(f => ({ ...f, applies_to_service: e.target.value }))}
              />
            </div>
          </div>
          {formErr && <div className="ops-section-error" style={{ margin: '8px 0' }}>{formErr}</div>}
          <button type="submit" className="btn-primary ops-rule-submit-btn" disabled={saving}>
            {saving ? 'Saving…' : 'Add Rule'}
          </button>
        </form>

        <div style={{ marginTop: 16, fontSize: 11, color: 'var(--steel)', lineHeight: 1.5 }}>
          Commission entries are generated automatically when jobs are completed. FieldCore
          calculates what is owed — payroll processing is handled by your payroll provider.
        </div>
      </div>
    </div>
  );
}

function CommissionSection({ filterStart, filterEnd }) {
  const { data, loading, error } = useOpsData(
    '/revenue/operations/commissions',
    { start: filterStart, end: filterEnd },
    [filterStart, filterEnd]
  );
  const [showRules, setShowRules] = useState(false);

  const summary = data?.summary;
  const entries = data?.entries || [];
  const hasRules = data?.hasRules;

  const STATUS_COLOR = {
    pending:  '#B45309',
    approved: 'var(--navy)',
    payable:  '#047857',
    paid:     'var(--green)',
    voided:   'var(--steel)',
  };

  return (
    <div className="ops-section-group">
      <div className="ops-sub-card ops-sub-card--header">
        <h2 className="rov-ws-section-title">Commission Tracking</h2>
        <button type="button" className="ops-manage-rules-btn" onClick={() => setShowRules(true)}>
          Manage Compensation Rules →
        </button>
      </div>

      <div className="ops-sub-card">
        {loading ? (
          <div className="ops-section-loading" style={{ margin: '16px 18px' }} />
        ) : error ? (
          <div className="ops-section-error">Commission data could not be loaded.</div>
        ) : !hasRules ? (
          <div className="ops-empty-state">
            <div className="ops-empty-icon" aria-hidden="true"><DollarSign size={22} /></div>
            <div className="ops-empty-msg">No compensation rules configured.</div>
            <div className="ops-empty-hint">
              Add a compensation rule to start tracking commissions automatically.
            </div>
            <button
              type="button"
              className="btn-primary"
              style={{ marginTop: 12, fontSize: 12 }}
              onClick={() => setShowRules(true)}
            >
              Add Compensation Rule
            </button>
          </div>
        ) : (
          <>
            {/* Summary row */}
            <div className="ops-commission-summary">
              {[
                { label: 'Owed',     value: summary?.owed,               highlight: true  },
                { label: 'Pending',  value: summary?.pending?.amount     },
                { label: 'Approved', value: summary?.approved?.amount    },
                { label: 'Payable',  value: summary?.payable?.amount     },
                { label: 'Paid',     value: summary?.paid?.amount        },
              ].map(s => (
                <div key={s.label} className={`ops-commission-stat${s.highlight ? ' ops-commission-stat--highlight' : ''}`}>
                  <div className="ops-commission-stat-label">{s.label}</div>
                  <div className="ops-commission-stat-value">{fmtMoney(s.value || 0)}</div>
                </div>
              ))}
            </div>

            {/* Entries table */}
            {entries.length === 0 ? (
              <div style={{ padding: '20px 18px', fontSize: 13, color: 'var(--steel)' }}>
                No commission entries for this period.
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table ops-commission-table" aria-label="Commission entries">
                  <thead>
                    <tr>
                      <th scope="col">Team Member</th>
                      <th scope="col">Job / Service</th>
                      <th scope="col">Rule</th>
                      <th scope="col">Source</th>
                      <th scope="col">Commission</th>
                      <th scope="col">Status</th>
                      <th scope="col">Earned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(e => (
                      <tr key={e.id}>
                        <td><strong>{e.memberName}</strong></td>
                        <td>
                          <div style={{ fontSize: 12 }}>{e.serviceType || 'Unspecified'}</div>
                          <div style={{ fontSize: 11, color: 'var(--steel)' }}>
                            {e.scheduledAt ? new Date(e.scheduledAt).toLocaleDateString() : ''}
                          </div>
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--slate)' }}>
                          {e.ruleName || '—'}
                          {e.commissionType === 'percentage' && e.ratePercent != null
                            ? ` (${(e.ratePercent * 100).toFixed(0)}%)`
                            : ''}
                        </td>
                        <td>{fmtMoney(e.sourceAmount)}</td>
                        <td><strong>{fmtMoney(e.commissionAmount)}</strong></td>
                        <td>
                          <span
                            className="ops-status-badge"
                            style={{ color: STATUS_COLOR[e.status] || 'var(--slate)' }}
                          >
                            {e.status}
                          </span>
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--steel)' }}>
                          {e.earnedAt ? new Date(e.earnedAt).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {showRules && <CompensationRulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}

// ── JobCompletionSection ──────────────────────────────────────────────────────

function JobCompletionSection({ filterStart, filterEnd }) {
  const { data, loading, error } = useOpsData(
    '/revenue/operations/completion',
    { start: filterStart, end: filterEnd },
    [filterStart, filterEnd]
  );

  const s = data?.summary;
  const byService  = data?.byService  || [];
  const reasons    = data?.cancellationReasons || [];

  const statsConfig = [
    { label: 'Scheduled',       value: s?.scheduled,  color: 'var(--steel)' },
    { label: 'Completed',       value: s?.completed,  color: 'var(--green)' },
    { label: 'Cancelled',       value: s?.cancelled,  color: 'var(--red)'   },
    { label: 'No-Shows',        value: s?.noShows,    color: '#B45309'      },
    { label: 'Completion Rate', value: s?.completionRate != null
        ? fmtPct(s.completionRate) : null,            color: 'var(--navy)'  },
    { label: 'Revenue Impact',  value: s?.revenueImpact != null
        ? fmtMoney(s.revenueImpact) : null,           color: 'var(--red)'   },
  ];

  return (
    <div className="ops-section-group">
      {/* A: Bare heading */}
      <div className="ops-bare-heading">
        <h2 className="rov-ws-section-title">Job Completion Analysis</h2>
        {!loading && s && (
          <span className="rov-ws-section-sub">
            {fmtPct(s.completionRate)} completion rate
            {s.revenueImpact > 0 && ` · ${fmtMoney(s.revenueImpact)} revenue impact`}
          </span>
        )}
      </div>

      {/* B: Loading / error / KPI strip */}
      {loading ? (
        <div className="ops-section-loading" />
      ) : error ? (
        <div className="ops-section-error">Job completion data could not be loaded.</div>
      ) : (
        <div className="ops-completion-summary">
          {statsConfig.map(st => (
            <div key={st.label} className="ops-completion-stat">
              <div className="ops-completion-stat-value" style={{ color: st.color }}>
                {st.value != null ? st.value : '—'}
              </div>
              <div className="ops-completion-stat-label">{st.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Cancellation reasons (own sibling, data only) */}
      {!loading && !error && reasons.length > 0 && (
        <div style={{ padding: '4px 0' }}>
          <div className="ops-completion-reasons-title">Cancellation Reasons</div>
          <div className="ops-reasons-list">
            {reasons.map((r, i) => (
              <div key={i} className="ops-reason-row">
                <span className="ops-reason-label">{r.label}</span>
                <span className="ops-reason-count">{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* C: Service breakdown table — standalone card */}
      {!loading && !error && byService.length > 0 && (
        <div className="ops-table-card">
          <div className="table-wrap">
            <table className="table ops-completion-table" aria-label="Completion by service">
            <thead>
              <tr>
                <th scope="col">Service</th>
                <th scope="col">Completed</th>
                <th scope="col">Cancelled</th>
                <th scope="col">No-Shows</th>
                <th scope="col">Rate</th>
              </tr>
            </thead>
            <tbody>
              {byService.map((svc, i) => (
                <tr key={i}>
                  <td><strong>{svc.service}</strong></td>
                  <td style={{ color: 'var(--green)' }}>{svc.completed}</td>
                  <td style={{ color: 'var(--red)' }}>{svc.cancelled}</td>
                  <td style={{ color: '#B45309' }}>{svc.noShows}</td>
                  <td>
                    {svc.completionRate != null
                      ? <span style={{ color: svc.completionRate < 0.75 ? 'var(--red)' : 'var(--green)' }}>
                          {fmtPct(svc.completionRate)}
                        </span>
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* D: Formula + limitations — bare muted text */}
      {!loading && !error && (
        <div className="ops-bare-info">
          {data?.limitations?.length > 0 && data.limitations.map((l, i) => (
            <span key={i} className="ops-limitation-note">{typeof l === 'string' ? l : l.description}</span>
          ))}
          <span style={{ fontSize: 10, color: 'var(--steel)', fontStyle: 'italic' }}>
            Completion Rate = completed ÷ (completed + cancelled + no-shows) for jobs scheduled in period.
            Future-scheduled jobs excluded from denominator.
          </span>
        </div>
      )}
    </div>
  );
}

// ── OperationsWorkspace ───────────────────────────────────────────────────────

export function OperationsWorkspace({ filterStart, filterEnd }) {
  const { data: opsData, loading: opsLoading } = useOpsData(
    '/revenue/operations',
    { start: filterStart, end: filterEnd },
    [filterStart, filterEnd]
  );

  const { data: svcData, loading: svcLoading, error: svcError } = useOpsData(
    '/revenue/services',
    { start: filterStart, end: filterEnd },
    [filterStart, filterEnd]
  );

  return (
    <div className="rov-ws-body">
      {/* Top KPI summary */}
      <OpsKpiRow data={opsData} loading={opsLoading} />

      {/* Revenue by Service — reuses existing table via inline component */}
      <ServiceTableSection services={svcData} loading={svcLoading} error={svcError} />

      {/* Team Performance */}
      <TeamPerformanceSection filterStart={filterStart} filterEnd={filterEnd} />

      {/* Sales & Upsell Attribution */}
      <SalesUpsellsSection filterStart={filterStart} filterEnd={filterEnd} />

      {/* Commission Tracking */}
      <CommissionSection filterStart={filterStart} filterEnd={filterEnd} />

      {/* Job Completion Analysis */}
      <JobCompletionSection filterStart={filterStart} filterEnd={filterEnd} />
    </div>
  );
}

// ── ServiceTableSection (wrapped for use inside OperationsWorkspace) ──────────

function ServiceTableSection({ services, loading, error }) {
  const [sortKey, setSortKey] = useState('earnedRevenue');
  const [sortDir, setSortDir] = useState('desc');

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const rows   = services || [];
  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] ?? -Infinity;
    const bv = b[sortKey] ?? -Infinity;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const totEarned    = rows.reduce((t, r) => t + r.earnedRevenue,    0);
  const totCollected = rows.reduce((t, r) => t + r.collectedRevenue, 0);
  const totJobs      = rows.reduce((t, r) => t + r.jobs,             0);
  const totHours     = rows.reduce((t, r) => t + r.laborHours,       0);

  function SortTh({ col, label }) {
    const active = sortKey === col;
    return (
      <th
        onClick={() => handleSort(col)}
        className={`rov-th-sort${active ? ' rov-th-sort--active' : ''}`}
        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        scope="col"
      >
        {label}
        <span aria-hidden="true" className="rov-th-arrow">
          {active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
        </span>
      </th>
    );
  }

  return (
    <div className="ops-section-group">
      <div className="ops-sub-card ops-sub-card--header">
        <h2 className="rov-ws-section-title">Revenue by Service</h2>
        {!loading && (
          <span className="rov-ws-section-sub">
            {rows.length} service type{rows.length !== 1 ? 's' : ''} · revenue counted once per job
          </span>
        )}
      </div>
      <div className="ops-sub-card">
        {loading ? (
          <div className="ops-section-loading" style={{ margin: 16 }} aria-label="Loading service data" />
        ) : error ? (
          <div className="ops-section-error">Service breakdown could not be loaded.</div>
        ) : rows.length === 0 ? (
          <div className="ops-empty-state">
            <div className="ops-empty-icon" aria-hidden="true"><Wrench size={22} /></div>
            <div className="ops-empty-msg">No completed jobs with revenue in this period.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table rov-service-table" aria-label="Revenue by service type">
              <thead>
                <tr>
                  <th scope="col">Service</th>
                  <SortTh col="jobs"               label="Jobs"          />
                  <SortTh col="earnedRevenue"       label="Earned Rev."   />
                  <SortTh col="collectedRevenue"    label="Collected Rev." />
                  <SortTh col="avgTicket"           label="Avg Ticket"    />
                  <SortTh col="laborHours"          label="Labor Hrs"     />
                  <SortTh col="revenuePerLaborHour" label="Rev / Hr"      />
                  <SortTh col="completionRate"      label="Completion"    />
                  <SortTh col="revenueShare"        label="Share"         />
                </tr>
              </thead>
              <tbody>
                {sorted.map((s, i) => (
                  <tr key={i}>
                    <td><strong>{s.service}</strong></td>
                    <td>{s.jobs}</td>
                    <td><strong>{fmtMoney(s.earnedRevenue)}</strong></td>
                    <td>{fmtMoney(s.collectedRevenue)}</td>
                    <td>{s.avgTicket != null ? fmtMoney(s.avgTicket) : '—'}</td>
                    <td>{s.laborHours > 0 ? `${s.laborHours}h` : '—'}</td>
                    <td>{s.revenuePerLaborHour != null ? fmtMoney(s.revenuePerLaborHour) : '—'}</td>
                    <td>
                      {s.completionRate != null
                        ? <span style={{ color: s.completionRate < 0.75 ? 'var(--red)' : 'var(--green)' }}>
                            {fmtPct(s.completionRate)}
                          </span>
                        : '—'}
                    </td>
                    <td>
                      <div className="rov-share-bar-wrap" aria-label={`${s.revenueShare.toFixed(1)}%`}>
                        <div className="rov-share-bar-fill" style={{ width: `${Math.min(100, s.revenueShare)}%` }} />
                        <span className="rov-share-bar-pct">{s.revenueShare.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="rov-table-total">
                  <td><strong>Total</strong></td>
                  <td><strong>{totJobs}</strong></td>
                  <td><strong>{fmtMoney(totEarned)}</strong></td>
                  <td><strong>{fmtMoney(totCollected)}</strong></td>
                  <td><strong>{totJobs > 0 ? fmtMoney(totEarned / totJobs) : '—'}</strong></td>
                  <td><strong>{totHours > 0 ? `${Math.round(totHours * 10) / 10}h` : '—'}</strong></td>
                  <td><strong>{totHours > 0 && totEarned > 0 ? fmtMoney(totEarned / totHours) : '—'}</strong></td>
                  <td />
                  <td><strong>100%</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
