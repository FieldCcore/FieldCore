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

// ── Drawer shell ──────────────────────────────────────────────────────────────

function OpsDrawer({ id, title, onClose, children, wide }) {
  return (
    <div className="fin-modal-overlay" role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className={`fin-modal-body ops-drawer-body${wide ? ' ops-drawer-body--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <div className="fin-modal-header">
          <h3 id={id} className="fin-modal-title">{title}</h3>
          <button type="button" className="fin-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── OpsJobsDrawer (Jobs Completed / Production Value) ─────────────────────────

function OpsJobsDrawer({ filterStart, filterEnd, onClose }) {
  const { data, loading, error } = useOpsData(
    '/revenue/operations/jobs',
    { start: filterStart, end: filterEnd },
    [filterStart, filterEnd]
  );
  const jobs = data?.jobs || [];
  const total = jobs.reduce((t, j) => t + (parseFloat(j.amount) || 0), 0);

  return (
    <OpsDrawer id="ops-jobs-drawer-title" title="Completed Jobs" onClose={onClose} wide>
      {loading ? (
        <div className="ops-section-loading" style={{ margin: '24px 0' }} />
      ) : error ? (
        <div className="ops-section-error">{error}</div>
      ) : (
        <>
          <div className="ops-drawer-summary">
            <div className="ops-drawer-stat">
              <div className="ops-drawer-stat-label">Jobs Completed</div>
              <div className="ops-drawer-stat-value">{jobs.length}</div>
            </div>
            <div className="ops-drawer-stat">
              <div className="ops-drawer-stat-label">Production Value</div>
              <div className="ops-drawer-stat-value">{fmtMoney(total)}</div>
            </div>
          </div>
          <div className="ops-drawer-section-title">Job Log ({jobs.length})</div>
          {jobs.length === 0 ? (
            <div className="ops-empty-state" style={{ padding: '16px 0' }}>No completed jobs in this period.</div>
          ) : (
            <div className="ops-drawer-jobs">
              {jobs.map(j => (
                <div key={j.id} className="ops-drawer-job-row">
                  <div className="ops-drawer-job-info">
                    <span className="ops-drawer-job-service">{j.service_type || 'Unspecified'}</span>
                    <span className="ops-drawer-job-date">
                      {j.scheduled_at ? new Date(j.scheduled_at).toLocaleDateString() : ''}
                    </span>
                    {j.tech_name && j.tech_name !== 'Unassigned' && (
                      <span className="ops-drawer-job-date">· {j.tech_name}</span>
                    )}
                  </div>
                  <div className="ops-drawer-job-right">
                    <span className="ops-drawer-job-amount">{fmtMoney(j.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </OpsDrawer>
  );
}

// ── OpsCommissionDrawer (Commissions Owed) ────────────────────────────────────

function OpsCommissionDrawer({ filterStart, filterEnd, onClose }) {
  const { data, loading, error } = useOpsData(
    '/revenue/operations/commissions',
    { start: filterStart, end: filterEnd },
    [filterStart, filterEnd]
  );

  const summary  = data?.summary;
  const entries  = data?.entries || [];
  const hasRules = data?.hasRules;

  const STATUS_COLOR = {
    pending:  '#B45309',
    approved: 'var(--navy)',
    payable:  '#047857',
    paid:     'var(--green)',
    voided:   'var(--steel)',
  };

  return (
    <OpsDrawer id="ops-comm-drawer-title" title="Commissions Owed" onClose={onClose} wide>
      {loading ? (
        <div className="ops-section-loading" style={{ margin: '24px 0' }} />
      ) : error ? (
        <div className="ops-section-error">{error}</div>
      ) : !hasRules ? (
        <div className="ops-empty-state">
          <div className="ops-empty-icon" aria-hidden="true"><DollarSign size={22} /></div>
          <div className="ops-empty-msg">No compensation rules configured.</div>
          <div className="ops-empty-hint">
            Set up compensation rules in Settings to start tracking commissions automatically.
          </div>
        </div>
      ) : (
        <>
          <div className="ops-drawer-summary">
            {[
              { label: 'Owed',     value: fmtMoney(summary?.owed || 0)             },
              { label: 'Pending',  value: fmtMoney(summary?.pending?.amount  || 0) },
              { label: 'Approved', value: fmtMoney(summary?.approved?.amount || 0) },
              { label: 'Payable',  value: fmtMoney(summary?.payable?.amount  || 0) },
              { label: 'Paid',     value: fmtMoney(summary?.paid?.amount     || 0) },
            ].map(s => (
              <div key={s.label} className="ops-drawer-stat">
                <div className="ops-drawer-stat-label">{s.label}</div>
                <div className="ops-drawer-stat-value">{s.value}</div>
              </div>
            ))}
          </div>
          <div className="ops-drawer-section-title">Entries ({entries.length})</div>
          {entries.length === 0 ? (
            <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--steel)' }}>
              No commission entries for this period.
            </div>
          ) : (
            <div className="ops-drawer-jobs">
              {entries.map(e => (
                <div key={e.id} className="ops-drawer-job-row">
                  <div className="ops-drawer-job-info" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                    <span className="ops-drawer-job-service">{e.memberName}</span>
                    <span className="ops-drawer-job-date">
                      {e.serviceType || 'Unspecified'} · {e.ruleName || '—'}
                      {e.commissionType === 'percentage' && e.ratePercent != null
                        ? ` (${(e.ratePercent * 100).toFixed(0)}%)`
                        : ''}
                    </span>
                  </div>
                  <div className="ops-drawer-job-right" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                    <span className="ops-drawer-job-amount">{fmtMoney(e.commissionAmount)}</span>
                    <span className="ops-status-badge" style={{ fontSize: 10, color: STATUS_COLOR[e.status] || 'var(--slate)' }}>
                      {e.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 16, padding: '10px 0', borderTop: '1px solid var(--lightgray)', fontSize: 11, color: 'var(--steel)' }}>
            To configure compensation rules, go to <strong>Settings → Compensation</strong>.
          </div>
        </>
      )}
    </OpsDrawer>
  );
}

// ── OpsUpsellKpiDrawer (Upsell Revenue) ───────────────────────────────────────

function OpsUpsellKpiDrawer({ filterStart, filterEnd, onClose }) {
  const { data, loading, error } = useOpsData(
    '/revenue/operations/upsells',
    { start: filterStart, end: filterEnd },
    [filterStart, filterEnd]
  );
  const members = data?.members || [];

  return (
    <OpsDrawer id="ops-upsell-kpi-drawer-title" title="Upsell Revenue" onClose={onClose}>
      {loading ? (
        <div className="ops-section-loading" style={{ margin: '24px 0' }} />
      ) : error ? (
        <div className="ops-section-error">{error}</div>
      ) : members.length === 0 ? (
        <div className="ops-empty-state">
          <div className="ops-empty-icon" aria-hidden="true"><TrendingUp size={22} /></div>
          <div className="ops-empty-msg">No upsells in this period.</div>
          <div className="ops-empty-hint">Upsells appear when team members add revenue beyond the original booked scope.</div>
        </div>
      ) : (
        <>
          <div className="ops-drawer-summary">
            <div className="ops-drawer-stat">
              <div className="ops-drawer-stat-label">Total Upsell Revenue</div>
              <div className="ops-drawer-stat-value">{fmtMoney(data?.total?.upsellRevenue || 0)}</div>
            </div>
            <div className="ops-drawer-stat">
              <div className="ops-drawer-stat-label">Upsell Count</div>
              <div className="ops-drawer-stat-value">{data?.total?.upsellCount || 0}</div>
            </div>
          </div>
          <div className="ops-drawer-section-title">By Team Member ({members.length})</div>
          <div className="ops-drawer-jobs">
            {members.map(m => (
              <div key={m.userId} className="ops-drawer-job-row">
                <div className="ops-drawer-job-info" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                  <span className="ops-drawer-job-service">{m.name}</span>
                  <span className="ops-drawer-job-date">
                    {m.upsellCount} upsell{m.upsellCount !== 1 ? 's' : ''} · avg {fmtMoney(m.avgUpsell)}
                  </span>
                </div>
                <div className="ops-drawer-job-right">
                  <span className="ops-drawer-job-amount">{fmtMoney(m.upsellRevenue)}</span>
                </div>
              </div>
            ))}
          </div>
          {data?.historicalNote && (
            <div style={{ marginTop: 12, fontSize: 10, color: 'var(--steel)', fontStyle: 'italic' }}>
              {data.historicalNote}
            </div>
          )}
        </>
      )}
    </OpsDrawer>
  );
}

// ── OpsLaborDrawer (Revenue per Labor Hour) ───────────────────────────────────

function OpsLaborDrawer({ filterStart, filterEnd, onClose }) {
  const { data, loading, error } = useOpsData(
    '/revenue/operations/team',
    { start: filterStart, end: filterEnd },
    [filterStart, filterEnd]
  );
  const members = (data?.members || []).filter(m => m.laborHours > 0);

  return (
    <OpsDrawer id="ops-labor-drawer-title" title="Revenue per Labor Hour" onClose={onClose}>
      {loading ? (
        <div className="ops-section-loading" style={{ margin: '24px 0' }} />
      ) : error ? (
        <div className="ops-section-error">{error}</div>
      ) : members.length === 0 ? (
        <div className="ops-empty-state">
          <div className="ops-empty-icon" aria-hidden="true"><Clock size={22} /></div>
          <div className="ops-empty-msg">No labor data in this period.</div>
        </div>
      ) : (
        <>
          <div className="ops-drawer-section-title">By Team Member</div>
          <div className="ops-drawer-jobs">
            {members.map(m => (
              <div key={m.userId} className="ops-drawer-job-row">
                <div className="ops-drawer-job-info" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                  <span className="ops-drawer-job-service">{m.name}</span>
                  <span className="ops-drawer-job-date">{m.laborHours}h scheduled</span>
                </div>
                <div className="ops-drawer-job-right">
                  <span className="ops-drawer-job-amount">
                    {m.revenuePerLaborHour != null ? `${fmtMoney(m.revenuePerLaborHour)} / hr` : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: 10, color: 'var(--steel)', fontStyle: 'italic' }}>
            Labor hours reflect scheduled job duration, not recorded time.
          </div>
        </>
      )}
    </OpsDrawer>
  );
}

// ── OpsCompletionRateDrawer ───────────────────────────────────────────────────

function OpsCompletionRateDrawer({ filterStart, filterEnd, onClose }) {
  const { data, loading, error } = useOpsData(
    '/revenue/operations/completion',
    { start: filterStart, end: filterEnd },
    [filterStart, filterEnd]
  );
  const s         = data?.summary;
  const byService = data?.byService || [];

  return (
    <OpsDrawer id="ops-completion-drawer-title" title="Completion Rate" onClose={onClose}>
      {loading ? (
        <div className="ops-section-loading" style={{ margin: '24px 0' }} />
      ) : error ? (
        <div className="ops-section-error">{error}</div>
      ) : (
        <>
          <div className="ops-drawer-summary">
            {[
              { label: 'Completion Rate', value: fmtPct(s?.completionRate)                                   },
              { label: 'Completed',       value: fmtNum(s?.completed)                                        },
              { label: 'Cancelled',       value: fmtNum(s?.cancelled)                                        },
              { label: 'No-Shows',        value: fmtNum(s?.noShows)                                          },
              { label: 'Revenue Impact',  value: s?.revenueImpact != null ? fmtMoney(s.revenueImpact) : '—' },
            ].map(st => (
              <div key={st.label} className="ops-drawer-stat">
                <div className="ops-drawer-stat-label">{st.label}</div>
                <div className="ops-drawer-stat-value">{st.value}</div>
              </div>
            ))}
          </div>
          {byService.length > 0 && (
            <>
              <div className="ops-drawer-section-title">By Service</div>
              <div className="ops-drawer-jobs">
                {byService.map((svc, i) => (
                  <div key={i} className="ops-drawer-job-row">
                    <div className="ops-drawer-job-info">
                      <span className="ops-drawer-job-service">{svc.service}</span>
                      <span className="ops-drawer-job-date">{svc.completed}✓ {svc.cancelled}✗ {svc.noShows} no-show</span>
                    </div>
                    <div className="ops-drawer-job-right">
                      <span className="ops-drawer-job-amount">
                        {svc.completionRate != null
                          ? <span style={{ color: svc.completionRate < 0.75 ? 'var(--red)' : 'var(--green)' }}>
                              {fmtPct(svc.completionRate)}
                            </span>
                          : '—'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{ marginTop: 12, fontSize: 10, color: 'var(--steel)', fontStyle: 'italic' }}>
            Rate = completed ÷ (completed + cancelled + no-shows) for jobs scheduled in period.
          </div>
        </>
      )}
    </OpsDrawer>
  );
}

// ── UpsellMemberDrawer ────────────────────────────────────────────────────────

function UpsellMemberDrawer({ member, onClose }) {
  return (
    <OpsDrawer id="ops-upsell-member-title" title={member.name} onClose={onClose}>
      <div className="ops-drawer-summary">
        {[
          { label: 'Upsell Revenue',  value: fmtMoney(member.upsellRevenue)                                   },
          { label: 'Upsell Count',    value: String(member.upsellCount)                                        },
          { label: 'Avg Upsell',      value: member.avgUpsell > 0 ? fmtMoney(member.avgUpsell) : '—'          },
          { label: 'Original Sales',  value: fmtMoney(member.originalSales)                                    },
          { label: 'Final Job Value', value: fmtMoney(member.finalJobValue)                                    },
          { label: 'Commission Owed', value: member.commissionOwed != null ? fmtMoney(member.commissionOwed) : '—' },
        ].map(s => (
          <div key={s.label} className="ops-drawer-stat">
            <div className="ops-drawer-stat-label">{s.label}</div>
            <div className="ops-drawer-stat-value">{s.value}</div>
          </div>
        ))}
      </div>
    </OpsDrawer>
  );
}

// ── OpsKpiRow ─────────────────────────────────────────────────────────────────

function OpsKpiRow({ data, loading, onKpiClick }) {
  const kpis     = data?.kpis || {};
  const upsell   = kpis.upsellRevenue || {};
  const commOwed = kpis.commissionsOwed || {};
  const revHr    = kpis.revenuePerLaborHour || {};

  const completionVal  = kpis.completionRate?.status === 'ok' ? parseFloat(kpis.completionRate.value) : null;
  const completionTone = completionVal == null ? 'neutral' : completionVal >= 0.75 ? 'success' : 'warning';

  return (
    <div className="ops-kpi-grid" aria-label="Operations KPIs">
      <button type="button" className="ops-kpi-btn" onClick={() => onKpiClick('jobsCompleted')} aria-label="Jobs Completed">
        <KpiCard
          icon={Briefcase}
          title="Jobs Completed"
          value={kpis.jobsCompleted?.status === 'ok' ? fmtNum(kpis.jobsCompleted.value) : '—'}
          tone={kpis.jobsCompleted?.value > 0 ? 'success' : 'neutral'}
          loading={loading}
        />
      </button>
      <button type="button" className="ops-kpi-btn" onClick={() => onKpiClick('completionRate')} aria-label="Completion Rate">
        <KpiCard
          icon={Target}
          title="Completion Rate"
          value={kpis.completionRate?.status === 'ok' ? fmtPct(kpis.completionRate.value) : '—'}
          subtitle={kpis.completionRate?.status === 'unavailable' ? 'No eligible jobs in period' : undefined}
          tone={completionTone}
          loading={loading}
        />
      </button>
      <button type="button" className="ops-kpi-btn" onClick={() => onKpiClick('productionValue')} aria-label="Production Value">
        <KpiCard
          icon={BarChart2}
          title="Production Value"
          value={kpis.productionValue?.status === 'ok' ? fmtMoney(kpis.productionValue.value) : '—'}
          tone={kpis.productionValue?.value > 0 ? 'success' : 'neutral'}
          loading={loading}
        />
      </button>
      <button type="button" className="ops-kpi-btn" onClick={() => onKpiClick('upsellRevenue')} aria-label="Upsell Revenue">
        <KpiCard
          icon={TrendingUp}
          title="Upsell Revenue"
          value={upsell.status === 'ok' ? fmtMoney(upsell.value) : '—'}
          subtitle={upsell.status === 'unavailable' ? 'Not yet available' : upsell.value === 0 ? 'No upsells this period' : undefined}
          tone={upsell.status === 'ok' && upsell.value > 0 ? 'success' : 'neutral'}
          loading={loading}
        />
      </button>
      <button type="button" className="ops-kpi-btn" onClick={() => onKpiClick('commissionsOwed')} aria-label="Commissions Owed">
        <KpiCard
          icon={DollarSign}
          title="Commissions Owed"
          value={commOwed.status === 'ok' ? fmtMoney(commOwed.value) : '—'}
          subtitle={commOwed.status === 'unavailable' ? 'No commission rules' : undefined}
          tone={commOwed.status === 'ok' && commOwed.value > 0 ? 'warning' : 'neutral'}
          loading={loading}
        />
      </button>
      <button type="button" className="ops-kpi-btn" onClick={() => onKpiClick('revenuePerLaborHour')} aria-label="Rev / Labor Hour">
        <KpiCard
          icon={Clock}
          title="Rev / Labor Hour"
          value={revHr.status === 'ok' ? fmtMoney(revHr.value) : '—'}
          subtitle={revHr.basis === 'scheduled_labor_hours' ? 'Scheduled hrs' : undefined}
          tone={revHr.status === 'ok' && revHr.value > 0 ? 'success' : 'neutral'}
          loading={loading}
        />
      </button>
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
  const [sortKey, setSortKey]   = useState('productionValue');
  const [sortDir, setSortDir]   = useState('desc');
  const [selected, setSelected] = useState(null);

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
            <SortTh col="jobsCompleted"      label="Jobs"        />
            <SortTh col="productionValue"    label="Prod. Value" />
            <SortTh col="avgTicket"          label="Avg Ticket"  />
            <SortTh col="completionRate"     label="Completion"  />
            <SortTh col="laborHours"         label="Labor Hrs"   />
            <SortTh col="revenuePerLaborHour" label="Rev / Hr"   />
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
  const [selectedMember, setSelectedMember] = useState(null);

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
                  <th scope="col">Comm. Owed</th>
                  <th scope="col" />
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
                    <td>
                      {m.commissionOwed != null
                        ? <span className="ops-commission-chip">{fmtMoney(m.commissionOwed)}</span>
                        : <span style={{ color: 'var(--steel)', fontSize: 11 }}>—</span>}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ops-detail-btn"
                        onClick={() => setSelectedMember(m)}
                        aria-label={`View upsell details for ${m.name}`}
                      >
                        Details →
                      </button>
                    </td>
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

      {selectedMember && (
        <UpsellMemberDrawer member={selectedMember} onClose={() => setSelectedMember(null)} />
      )}
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

  const s         = data?.summary;
  const byService = data?.byService  || [];
  const reasons   = data?.cancellationReasons || [];

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

  const [activeKpi, setActiveKpi] = useState(null);

  function handleKpiClick(kpiKey) {
    setActiveKpi(prev => prev === kpiKey ? null : kpiKey);
  }

  return (
    <div className="rov-ws-body ops-ws-body">
      {/* Top KPI summary — all 6 clickable */}
      <OpsKpiRow data={opsData} loading={opsLoading} onKpiClick={handleKpiClick} />

      {/* Revenue by Service */}
      <ServiceTableSection services={svcData} loading={svcLoading} error={svcError} />

      {/* Team Performance */}
      <TeamPerformanceSection filterStart={filterStart} filterEnd={filterEnd} />

      {/* Sales & Upsell Attribution */}
      <SalesUpsellsSection filterStart={filterStart} filterEnd={filterEnd} />

      {/* Job Completion Analysis */}
      <JobCompletionSection filterStart={filterStart} filterEnd={filterEnd} />

      {/* KPI drill-down drawers */}
      {(activeKpi === 'jobsCompleted' || activeKpi === 'productionValue') && (
        <OpsJobsDrawer filterStart={filterStart} filterEnd={filterEnd} onClose={() => setActiveKpi(null)} />
      )}
      {activeKpi === 'commissionsOwed' && (
        <OpsCommissionDrawer filterStart={filterStart} filterEnd={filterEnd} onClose={() => setActiveKpi(null)} />
      )}
      {activeKpi === 'upsellRevenue' && (
        <OpsUpsellKpiDrawer filterStart={filterStart} filterEnd={filterEnd} onClose={() => setActiveKpi(null)} />
      )}
      {activeKpi === 'revenuePerLaborHour' && (
        <OpsLaborDrawer filterStart={filterStart} filterEnd={filterEnd} onClose={() => setActiveKpi(null)} />
      )}
      {activeKpi === 'completionRate' && (
        <OpsCompletionRateDrawer filterStart={filterStart} filterEnd={filterEnd} onClose={() => setActiveKpi(null)} />
      )}
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
