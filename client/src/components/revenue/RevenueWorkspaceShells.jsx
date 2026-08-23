import React, { useState, useEffect } from 'react';
import { HelpCircle, Info } from 'lucide-react';
import api from '../../api';

// ── Money formatter ────────────────────────────────────────────────────────────
// API service layer already divides by 10000 (NUMERIC(10,2) in DB → dollar float)
// so values arrive as dollars and we format directly.

function fmtMoney(v) {
  if (v == null) return '—';
  return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Shared primitives ──────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="rov-ws-body">
      <div className="dash-card" style={{ padding: '2rem', color: 'var(--slate)', fontSize: 14 }}>
        Loading…
      </div>
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div className="rov-ws-body">
      <div className="dash-card" style={{ padding: '1.5rem', color: 'var(--red)', fontSize: 14 }}>
        {message || 'Something went wrong. Please try again.'}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CUSTOMERS WORKSPACE
// ══════════════════════════════════════════════════════════════════════════════

// Sub-component: locked state card used when a section needs configuration
function LockedSection({ title, reason, detail }) {
  return (
    <div className="ops-sub-card" style={{ padding: '16px 18px' }}>
      <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>{reason}</p>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>{detail}</p>
    </div>
  );
}

export function CustomersWorkspace({ filterStart, filterEnd }) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    api.get('/revenue/customers/overview', { params: { start: filterStart, end: filterEnd } })
      .then(res => {
        if (!cancelled) setState({ data: res.data, loading: false, error: null });
      })
      .catch(err => {
        if (!cancelled) {
          const msg = err.response?.data?.error || 'Customer data could not be loaded.';
          setState({ data: null, loading: false, error: msg });
        }
      });

    return () => { cancelled = true; };
  }, [filterStart, filterEnd]);

  if (state.loading) return <LoadingState />;
  if (state.error)   return <ErrorState message={state.error} />;

  const topClients        = state.data?.topClients || [];
  const activeClientCount = state.data?.summary?.activeClientCount || 0;
  const ltv               = state.data?.lifetimeValue;
  const churn             = state.data?.churn;
  const segments          = state.data?.segments;

  return (
    <div className="rov-ws-body ops-ws-body">

      {/* ── Top Clients ────────────────────────────────────────────────────── */}
      <div className="ops-section-group">
        <div className="ops-bare-heading">
          <h2 className="rov-ws-section-title">Top Clients</h2>
          <span className="rov-ws-section-sub">by earned revenue this period</span>
        </div>

        {topClients.length === 0 ? (
          <div className="ops-table-card">
            <div className="ops-empty-state">
              <span className="ops-empty-msg">No completed jobs found in this period.</span>
            </div>
          </div>
        ) : (
          <div className="ops-table-card">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, color: 'var(--navy)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--lightgray)', color: 'var(--slate)', fontWeight: 500 }}>
                    <th style={{ textAlign: 'left',  padding: '10px 16px' }}>Client Name</th>
                    <th style={{ textAlign: 'right', padding: '10px 16px' }}>Jobs</th>
                    <th style={{ textAlign: 'right', padding: '10px 16px' }}>Earned Revenue</th>
                    <th style={{ textAlign: 'right', padding: '10px 16px' }}>Last Job</th>
                  </tr>
                </thead>
                <tbody>
                  {topClients.map((c, i) => (
                    <tr key={c.id || i} style={{ borderBottom: '1px solid var(--lightgray)' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 500 }}>{c.name || '—'}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>{c.job_count ?? '—'}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>{fmtMoney(c.earned_revenue)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--slate)' }}>
                        {c.last_job_at ? new Date(c.last_job_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {activeClientCount > 0 && (
              <p style={{ margin: 0, padding: '10px 16px', fontSize: 13, color: 'var(--slate)', borderTop: '1px solid var(--lightgray)' }}>
                {activeClientCount} active client{activeClientCount !== 1 ? 's' : ''} generated revenue in this period.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Customer Lifetime Value ───────────────────────────────────────── */}
      <div className="ops-section-group">
        <div className="ops-bare-heading">
          <h2 className="rov-ws-section-title">Customer Lifetime Value</h2>
          {ltv?.eligible && ltv.data && (
            <span className="rov-ws-section-sub">
              based on {ltv.historySpanMonths} months of history
            </span>
          )}
        </div>

        {ltv?.eligible && ltv.data ? (
          <>
            {/* KPI grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10 }}>
              {[
                { label: 'Avg Revenue / Customer', value: fmtMoney(ltv.data.avgRevenuePerCustomer) },
                { label: 'Median Revenue / Customer', value: fmtMoney(ltv.data.medianRevenuePerCustomer) },
                { label: 'Avg Jobs / Customer', value: ltv.data.avgJobsPerCustomer },
                { label: 'Avg Ticket', value: fmtMoney(ltv.data.avgTicket) },
                { label: 'Total Customers', value: ltv.data.totalCustomers.toLocaleString() },
                { label: 'Total Jobs', value: ltv.data.totalJobs.toLocaleString() },
              ].map(kpi => (
                <div key={kpi.label} className="ops-sub-card" style={{ padding: '12px 14px' }}>
                  <div style={{ fontSize: 12, color: 'var(--slate)', marginBottom: 4 }}>{kpi.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>{kpi.value}</div>
                </div>
              ))}
            </div>

            {/* Top customers by all-time revenue */}
            {ltv.data.topCustomers?.length > 0 && (
              <div className="ops-table-card" style={{ marginTop: 10 }}>
                <div style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: 'var(--slate)', borderBottom: '1px solid var(--lightgray)' }}>
                  Top Clients by All-Time Revenue
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, color: 'var(--navy)' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--lightgray)', color: 'var(--slate)', fontWeight: 500 }}>
                        <th style={{ textAlign: 'left',  padding: '8px 16px' }}>Client</th>
                        <th style={{ textAlign: 'right', padding: '8px 16px' }}>Jobs</th>
                        <th style={{ textAlign: 'right', padding: '8px 16px' }}>All-Time Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ltv.data.topCustomers.map((c, i) => (
                        <tr key={c.id || i} style={{ borderBottom: '1px solid var(--lightgray)' }}>
                          <td style={{ padding: '8px 16px', fontWeight: 500 }}>{c.name}</td>
                          <td style={{ padding: '8px 16px', textAlign: 'right' }}>{c.jobCount}</td>
                          <td style={{ padding: '8px 16px', textAlign: 'right' }}>{fmtMoney(c.totalRevenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={{ margin: 0, padding: '8px 16px', fontSize: 12, color: 'var(--steel)', borderTop: '1px solid var(--lightgray)' }}>
                  All-time historical — not period-scoped.
                </p>
              </div>
            )}
          </>
        ) : (
          <LockedSection
            reason={`Requires ${ltv?.requiredMonths ?? 6}+ months of job history.`}
            detail={
              ltv?.historySpanMonths
                ? `${ltv.historySpanMonths} of ${ltv.requiredMonths} months accumulated. This section will activate automatically when the threshold is met.`
                : 'LTV projections become meaningful once enough job history has accumulated. This section will activate automatically when the threshold is met.'
            }
          />
        )}
      </div>

      {/* ── At-Risk / Churn Detection ─────────────────────────────────────── */}
      <div className="ops-section-group">
        <div className="ops-bare-heading">
          <h2 className="rov-ws-section-title">At-Risk / Churn Detection</h2>
          {churn?.configured && churn.counts && (
            <span className="rov-ws-section-sub">
              threshold: {churn.inactivityDays} days
            </span>
          )}
        </div>

        {churn?.configured && churn.counts ? (
          <>
            {/* Summary counts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
              {[
                { label: 'Active', value: churn.counts.active, color: 'var(--green)' },
                { label: 'At Risk', value: churn.counts.atRisk, color: 'var(--amber)' },
                { label: 'Inactive', value: churn.counts.inactive, color: 'var(--red)' },
                { label: 'Total', value: churn.counts.total, color: 'var(--navy)' },
              ].map(c => (
                <div key={c.label} className="ops-sub-card" style={{ padding: '12px 14px' }}>
                  <div style={{ fontSize: 12, color: 'var(--slate)', marginBottom: 4 }}>{c.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: c.color }}>{c.value}</div>
                </div>
              ))}
            </div>

            {/* At-risk client list */}
            {churn.atRiskClients?.length > 0 && (
              <div className="ops-table-card" style={{ marginTop: 10 }}>
                <div style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: 'var(--slate)', borderBottom: '1px solid var(--lightgray)' }}>
                  At-Risk Clients
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, color: 'var(--navy)' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--lightgray)', color: 'var(--slate)', fontWeight: 500 }}>
                        <th style={{ textAlign: 'left',  padding: '8px 16px' }}>Client</th>
                        <th style={{ textAlign: 'right', padding: '8px 16px' }}>Days Since Last Job</th>
                        <th style={{ textAlign: 'right', padding: '8px 16px' }}>Total Jobs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {churn.atRiskClients.map((c, i) => (
                        <tr key={c.id || i} style={{ borderBottom: '1px solid var(--lightgray)' }}>
                          <td style={{ padding: '8px 16px', fontWeight: 500 }}>{c.name}</td>
                          <td style={{ padding: '8px 16px', textAlign: 'right', color: 'var(--amber)', fontWeight: 600 }}>
                            {c.daysSinceLastJob}
                          </td>
                          <td style={{ padding: '8px 16px', textAlign: 'right' }}>{c.totalJobs}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {churn.atRiskClients?.length === 0 && (
              <div className="ops-table-card" style={{ marginTop: 10 }}>
                <div className="ops-empty-state">
                  <span className="ops-empty-msg">No at-risk clients at this time.</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <LockedSection
            reason="Customer inactivity policy required."
            detail="Set a customer inactivity threshold in Business Settings to enable at-risk detection. FieldCore will classify clients as Active, At-Risk, or Inactive based on days since their last completed job."
          />
        )}
      </div>

      {/* ── Segment Analysis ──────────────────────────────────────────────── */}
      <div className="ops-section-group">
        <div className="ops-bare-heading">
          <h2 className="rov-ws-section-title">Segment Analysis</h2>
          {segments?.configured && segments.data && (
            <span className="rov-ws-section-sub">
              {segments.segmentCount} segment{segments.segmentCount !== 1 ? 's' : ''} · {segments.clientsTagged} client{segments.clientsTagged !== 1 ? 's' : ''} tagged
            </span>
          )}
        </div>

        {segments?.configured && segments.data && segments.data.length > 0 ? (
          <>
            <div className="ops-table-card">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, color: 'var(--navy)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--lightgray)', color: 'var(--slate)', fontWeight: 500 }}>
                      <th style={{ textAlign: 'left',  padding: '10px 16px' }}>Segment</th>
                      <th style={{ textAlign: 'right', padding: '10px 16px' }}>Clients</th>
                      <th style={{ textAlign: 'right', padding: '10px 16px' }}>Jobs</th>
                      <th style={{ textAlign: 'right', padding: '10px 16px' }}>Earned Revenue</th>
                      <th style={{ textAlign: 'right', padding: '10px 16px' }}>Avg Ticket</th>
                      <th style={{ textAlign: 'right', padding: '10px 16px' }}>Rev Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {segments.data.map((seg, i) => (
                      <tr key={seg.id || i} style={{ borderBottom: '1px solid var(--lightgray)' }}>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            {seg.color && (
                              <span style={{ width: 10, height: 10, borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
                            )}
                            <span style={{ fontWeight: 500 }}>{seg.name}</span>
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>{seg.clientCount}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>{seg.jobCount}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>{fmtMoney(seg.earnedRevenue)}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>{seg.avgTicket != null ? fmtMoney(seg.avgTicket) : '—'}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>{seg.revenueShare}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ margin: 0, padding: '8px 16px', fontSize: 12, color: 'var(--steel)', borderTop: '1px solid var(--lightgray)' }}>
                Multi-tag clients counted in each segment; shares may sum above 100%.
              </p>
            </div>
          </>
        ) : segments?.configured && !segments.data ? (
          <LockedSection
            reason="No clients have been tagged yet."
            detail={`${segments.segmentCount} segment${segments.segmentCount !== 1 ? 's' : ''} configured. Assign clients to segments to see revenue breakdowns here.`}
          />
        ) : (
          <LockedSection
            reason="Requires client segment tags."
            detail="Tag clients as residential, commercial, recurring, or other configured segments to unlock revenue breakdowns by segment."
          />
        )}
      </div>

    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FORECASTING WORKSPACE — V1
// ══════════════════════════════════════════════════════════════════════════════

const FC_BLUE   = '#2563EB';
const FC_PURPLE = '#7C3AED';
const FC_GREEN  = '#2E7D32';

function ReadinessBadge({ status }) {
  const map = {
    READY:             { label: 'Ready',             bg: '#D1FAE5', color: '#065F46' },
    LIMITED:           { label: 'Limited Data',      bg: '#FEF3C7', color: '#92400E' },
    INSUFFICIENT_DATA: { label: 'Insufficient Data', bg: '#F3F4F6', color: '#6B7280' },
  };
  const cfg = map[status] || map.INSUFFICIENT_DATA;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 12,
      fontSize: 12, fontWeight: 600, background: cfg.bg, color: cfg.color,
    }}>
      {cfg.label}
    </span>
  );
}

function ConfidenceBadge({ confidence }) {
  if (!confidence) return null;
  const map = {
    HIGH:   { bg: '#D1FAE5', color: '#065F46' },
    MEDIUM: { bg: '#FEF3C7', color: '#92400E' },
    LOW:    { bg: '#F3F4F6', color: '#6B7280' },
  };
  const cfg = map[confidence] || map.LOW;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 12,
      fontSize: 12, fontWeight: 600, background: cfg.bg, color: cfg.color,
    }}>
      {confidence} confidence
    </span>
  );
}

function ForecastKpi({ label, value, sub, color, note }) {
  return (
    <div className="kpi-card forecast-kpi-card" style={{ '--fc-kpi-accent': color || 'var(--sand)' }}>
      <div className="kpi-card__title" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span>{label}</span>
        {note && (
          <span
            title={note}
            aria-label="How this is calculated"
            style={{ display: 'inline-flex', cursor: 'help', color: 'var(--steel)', marginLeft: 2, lineHeight: 1 }}
          >
            <Info size={10} />
          </span>
        )}
      </div>
      <div className="kpi-card__value">{value}</div>
      {sub && <div className="kpi-card__subtitle">{sub}</div>}
    </div>
  );
}

function ForecastTrendChart({ trend, isPast }) {
  if (!trend || trend.length === 0) {
    return (
      <div style={{ padding: '0.75rem 0', textAlign: 'center', color: 'var(--steel)', fontSize: 13 }}>
        No trend data for this period.
      </div>
    );
  }

  const maxVal = Math.max(...trend.map(d => Math.max(d.earned, d.booked, d.projected)), 1);

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--slate)' }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, background: FC_BLUE, display: 'inline-block' }} />
          Earned
        </div>
        {!isPast && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--slate)' }}>
              <span style={{ width: 12, height: 12, borderRadius: 2, background: FC_GREEN, display: 'inline-block' }} />
              Booked
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--slate)' }}>
              <span style={{ width: 12, height: 12, borderRadius: 2, background: FC_PURPLE, opacity: 0.5, display: 'inline-block' }} />
              Projected
            </div>
          </>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120, overflowX: 'auto' }}>
        {trend.map(d => {
          const earnedH = Math.round((d.earned    / maxVal) * 112);
          const bookedH = Math.round((d.booked    / maxVal) * 112);
          const projH   = Math.round((d.projected / maxVal) * 112);
          const barH    = Math.max(earnedH, bookedH, projH, 2);
          const bgColor = d.type === 'actual'    ? FC_BLUE
                        : d.type === 'booked'    ? FC_GREEN
                        : d.type === 'projected' ? FC_PURPLE
                        : FC_BLUE;
          return (
            <div
              key={d.date}
              title={`${d.date}\nEarned: $${d.earned.toFixed(2)}\nBooked: $${d.booked.toFixed(2)}\nProjected: $${d.projected.toFixed(2)}`}
              style={{
                flex: '1 1 0', minWidth: 4, maxWidth: 28, height: barH,
                background: bgColor, opacity: d.type === 'projected' ? 0.45 : 1,
                borderRadius: '2px 2px 0 0', alignSelf: 'flex-end', cursor: 'default',
              }}
            />
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: 'var(--steel)' }}>
        <span>{trend[0]?.date}</span>
        <span>{trend[trend.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function PipelineDrawer({ driver, bookedRevenue, onClose }) {
  const scheduledLabel = driver.scheduledAt
    ? new Date(driver.scheduledAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '—';
  const contributionPct = bookedRevenue > 0
    ? Math.round((driver.amount / bookedRevenue) * 100)
    : null;

  return (
    <div
      className="fin-modal-overlay"
      role="presentation"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="fin-modal-body ops-drawer-body"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pipeline-drawer-title"
      >
        <div className="fin-modal-header">
          <h3 id="pipeline-drawer-title" className="fin-modal-title">Booked Job Details</h3>
          <button type="button" className="fin-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="ops-drawer-summary">
          <div>
            <div className="ops-drawer-stat-label">Scheduled</div>
            <div className="ops-drawer-stat-value">{scheduledLabel}</div>
          </div>
          <div>
            <div className="ops-drawer-stat-label">Booked Value</div>
            <div className="ops-drawer-stat-value">{fmtMoney(driver.amount)}</div>
          </div>
          {contributionPct !== null && (
            <div>
              <div className="ops-drawer-stat-label">% of Pipeline</div>
              <div className="ops-drawer-stat-value">{contributionPct}%</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {[
            { label: 'Client',  value: driver.clientName },
            { label: 'Service', value: driver.serviceType || '—' },
            { label: 'Status',  value: driver.status },
          ].map(({ label, value }) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0', borderBottom: '1px solid var(--lightgray)',
            }}>
              <span style={{ fontSize: 12, color: 'var(--slate)', fontWeight: 500 }}>{label}</span>
              <span style={{ fontSize: 13, color: 'var(--navy)', fontWeight: 600 }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PipelineTable({ drivers, onSelect }) {
  if (!drivers || drivers.length === 0) {
    return (
      <div style={{ padding: '1rem 0', color: 'var(--steel)', fontSize: 13 }}>
        No booked jobs in this forecast period.
      </div>
    );
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--lightgray)' }}>
            {['Scheduled', 'Client', 'Service', 'Status', 'Amount', ''].map((h, i) => (
              <th key={i} style={{
                textAlign: h === 'Amount' ? 'right' : 'left',
                padding: '6px 8px', color: 'var(--steel)', fontWeight: 600,
                fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {drivers.map(d => (
            <tr
              key={d.id}
              style={{ borderBottom: '1px solid var(--lightgray)', cursor: 'pointer' }}
              onClick={() => onSelect(d)}
            >
              <td style={{ padding: '7px 8px', color: 'var(--slate)', whiteSpace: 'nowrap' }}>
                {d.scheduledAt
                  ? new Date(d.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : '—'}
              </td>
              <td style={{ padding: '7px 8px', color: 'var(--navy)', fontWeight: 500 }}>{d.clientName}</td>
              <td style={{ padding: '7px 8px', color: 'var(--slate)' }}>{d.serviceType || '—'}</td>
              <td style={{ padding: '7px 8px' }}>
                <span style={{
                  display: 'inline-block', padding: '1px 8px', borderRadius: 10,
                  fontSize: 11, fontWeight: 600,
                  background: d.status === 'scheduled' ? '#EFF6FF' : '#F3F4F6',
                  color:      d.status === 'scheduled' ? '#1D4ED8' : '#4B5563',
                }}>
                  {d.status}
                </span>
              </td>
              <td style={{ padding: '7px 8px', color: 'var(--navy)', fontWeight: 500, textAlign: 'right' }}>
                {fmtMoney(d.amount)}
              </td>
              <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                <button
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 600, color: 'var(--sand)', padding: '2px 6px',
                    borderRadius: 4,
                  }}
                  onClick={e => { e.stopPropagation(); onSelect(d); }}
                >
                  Details
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ForecastHelp({ open, onToggle }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 12, color: 'var(--steel)', width: 'fit-content',
        }}
      >
        <HelpCircle size={13} />
        How forecasting works
      </button>
      {open && (
        <div style={{
          fontSize: 12, color: 'var(--slate)', lineHeight: 1.65,
          background: 'var(--offwhite)', borderRadius: 8, padding: '12px 16px',
        }}>
          <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li>Forecasts use real FieldCore job data — no AI or machine learning.</li>
            <li>Earned revenue: completed jobs within the selected period.</li>
            <li>Booked revenue: eligible scheduled jobs not yet completed or cancelled.</li>
            <li>Expected unbooked revenue activates when sufficient history exists (30+ days, 5+ completed jobs). It uses a 90-day historical daily run-rate to estimate remaining unscheduled revenue.</li>
            <li>Projections become more reliable as job history accumulates.</li>
          </ul>
        </div>
      )}
    </div>
  );
}

export function ForecastingWorkspace({ filterStart, filterEnd }) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    const params = {};
    if (filterStart) params.start = filterStart;
    if (filterEnd)   params.end   = filterEnd;

    api.get('/revenue/forecasting/overview', { params })
      .then(res => {
        if (!cancelled) setState({ data: res.data, loading: false, error: null });
      })
      .catch(err => {
        if (!cancelled) {
          const msg = err.response?.data?.error || 'Forecasting could not be loaded.';
          setState({ data: null, loading: false, error: msg });
        }
      });

    return () => { cancelled = true; };
  }, [filterStart, filterEnd]);

  if (state.loading) return <LoadingState />;
  if (state.error)   return <ErrorState message={state.error} />;

  const d = state.data;
  if (!d) return <ErrorState message="No data returned." />;

  const { readiness, period, actual, booked, forecast, trend, drivers } = d;

  // ── Past period: show actual results only ─────────────────────────────────
  if (period.isPast) {
    return (
      <div className="rov-ws-body ops-ws-body">

        <div className="ops-section-group">
          <div className="ops-bare-heading">
            <h2 className="rov-ws-section-title">Forecast KPI Summary</h2>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)' }}>
            Selected period has ended. Showing actual results only.
          </p>
          <div className="fc-kpi-grid">
            <ForecastKpi label="Earned Revenue" value={fmtMoney(actual.earnedRevenue)} color={FC_BLUE} />
          </div>
        </div>

        {trend && trend.length > 0 && (
          <div className="ops-section-group">
            <div className="ops-bare-heading">
              <h2 className="rov-ws-section-title">Revenue Forecast</h2>
            </div>
            <div className="ops-table-card" style={{ padding: '1.25rem 1.5rem' }}>
              <ForecastTrendChart trend={trend} isPast={true} />
            </div>
          </div>
        )}

        <ForecastHelp open={helpOpen} onToggle={() => setHelpOpen(h => !h)} />
      </div>
    );
  }

  // ── Active/future period ──────────────────────────────────────────────────
  const forecastGapLabel = forecast.forecastGap >= 0
    ? `+${fmtMoney(forecast.forecastGap)} vs earned`
    : `${fmtMoney(forecast.forecastGap)} vs earned`;

  return (
    <div className="rov-ws-body ops-ws-body">

      {/* ── 1. Forecast KPI Summary ─────────────────────────────────────────── */}
      <div className="ops-section-group">
        <div className="ops-bare-heading">
          <h2 className="rov-ws-section-title">Forecast KPI Summary</h2>
          <span style={{ fontSize: 12, color: 'var(--steel)' }}>As of {period.asOf}</span>
        </div>
        {readiness.status === 'INSUFFICIENT_DATA' && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)', lineHeight: 1.5 }}>
            FieldCore is currently forecasting from earned and booked revenue. More history is needed before unbooked revenue can be projected reliably.
          </p>
        )}
        <div className="fc-kpi-grid">
          <ForecastKpi
            label="Earned Revenue"
            value={fmtMoney(actual.earnedRevenue)}
            sub="Completed jobs to date"
            color={FC_BLUE}
          />
          <ForecastKpi
            label="Booked Revenue"
            value={fmtMoney(booked.revenue)}
            sub={`${booked.jobCount} job${booked.jobCount !== 1 ? 's' : ''} scheduled`}
            color={FC_GREEN}
          />
          <ForecastKpi
            label="Projected Period Revenue"
            value={fmtMoney(forecast.projectedRevenue)}
            sub={readiness.status === 'INSUFFICIENT_DATA' ? 'Earned + booked only' : 'Earned + booked + run-rate'}
            color={FC_PURPLE}
            note="Earned + booked + expected unbooked revenue when sufficient history exists."
          />
          <ForecastKpi
            label="Forecast Gap"
            value={fmtMoney(forecast.forecastGap)}
            sub={forecastGapLabel}
            color="var(--slate)"
            note="Projected period revenue minus revenue already earned."
          />
        </div>
      </div>

      {/* ── 2. Revenue Forecast + Confidence/Readiness inline ───────────────── */}
      <div className="ops-section-group">
        <div className="ops-bare-heading">
          <h2 className="rov-ws-section-title">Revenue Forecast</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ReadinessBadge status={readiness.status} />
            {forecast.confidence && <ConfidenceBadge confidence={forecast.confidence} />}
          </div>
        </div>
        <div className="ops-table-card" style={{ padding: '1.25rem 1.5rem' }}>
          {forecast.confidenceReasons && forecast.confidenceReasons.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {forecast.confidenceReasons.map((r, i) => (
                <span key={i} style={{
                  fontSize: 11, color: 'var(--steel)', background: 'var(--offwhite)',
                  padding: '2px 8px', borderRadius: 10,
                }}>
                  {r}
                </span>
              ))}
            </div>
          )}
          <ForecastTrendChart trend={trend} isPast={false} />
        </div>
      </div>

      {/* ── 3. Booked Pipeline ──────────────────────────────────────────────── */}
      <div className="ops-section-group">
        <div className="ops-bare-heading">
          <h2 className="rov-ws-section-title">Booked Pipeline</h2>
          {booked.jobCount > 0 && (
            <span style={{ fontSize: 12, color: 'var(--slate)' }}>
              {booked.jobCount} job{booked.jobCount !== 1 ? 's' : ''}&nbsp;&middot;&nbsp;{fmtMoney(booked.revenue)}
            </span>
          )}
        </div>
        <div className="ops-table-card" style={{ padding: '1.25rem 1.5rem' }}>
          <PipelineTable drivers={drivers} onSelect={setSelectedDriver} />
        </div>
      </div>

      {selectedDriver && (
        <PipelineDrawer
          driver={selectedDriver}
          bookedRevenue={booked.revenue}
          onClose={() => setSelectedDriver(null)}
        />
      )}

      <ForecastHelp open={helpOpen} onToggle={() => setHelpOpen(h => !h)} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// REPORTS WORKSPACE
// ══════════════════════════════════════════════════════════════════════════════

// reportKey maps to the key returned by /api/revenue/reports/readiness
// status here is the default/static value; ReportsWorkspace overrides via readiness API
const REPORT_CATALOG = [
  {
    label:       'Revenue Summary',
    description: 'Period totals: collected, earned, by service',
    reportKey:   'summary',
    status:      'AVAILABLE',
    exportType:  'summary',
  },
  {
    label:       'Revenue by Service',
    description: 'Job counts, revenue, and completion by service type',
    reportKey:   'services',
    status:      'AVAILABLE',
    exportType:  'services',
  },
  {
    label:       'Invoice & Collections',
    description: 'All invoices with status, amounts, and dates',
    reportKey:   'invoices',
    status:      'AVAILABLE',
    exportType:  'invoices',
  },
  {
    label:       'Revenue by Technician',
    description: 'Per-technician earned revenue and labor hours (primary assignment)',
    reportKey:   'technicians',
    status:      'AVAILABLE',
    exportType:  'technicians',
  },
  {
    label:       'Customer Value Report',
    description: 'Top clients by revenue with LTV summary',
    reportKey:   'customers',
    status:      'AVAILABLE',
    exportType:  'customers',
  },
  {
    label:       'Forecast Pipeline Report',
    description: 'Upcoming scheduled jobs with projected revenue summary',
    reportKey:   'forecasting',
    status:      'AVAILABLE',
    exportType:  'forecasting',
  },
  {
    label:       'Cancellation & No-Show Report',
    description: 'Cancelled and no-show jobs with revenue impact',
    reportKey:   'cancellations',
    status:      'AVAILABLE',
    exportType:  'cancellations',
  },
  {
    label:       'Tax Summary',
    description: 'Tax collected on invoices by period',
    reportKey:   'tax',
    status:      'AVAILABLE',
    exportType:  'tax',
  },
  {
    label:       'Quarterly Financial',
    description: 'Q1–Q4 earned and collected revenue comparison',
    reportKey:   'quarterly',
    status:      'AVAILABLE',
    exportType:  'quarterly',
  },
  {
    label:       'P&L Statement',
    description: 'Revenue, COGS, gross profit, operating expenses, and net profit',
    reportKey:   'pnl',
    status:      'REQUIRES_CONFIGURATION',
    exportType:  null,
    requiresConfig: 'Requires accounting integration',
  },
  {
    label:       'Job Completion Analysis',
    description: 'Completion rate by service with cancellation and no-show breakdown',
    reportKey:   'completion',
    status:      'AVAILABLE',
    exportType:  'completion',
  },
];

function ExportButton({ exportType, filterStart, filterEnd }) {
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [exportingCsv,  setExportingCsv]  = useState(false);
  const busy = exportingXlsx || exportingCsv;

  async function handleDownload(format) {
    const setExp = format === 'xlsx' ? setExportingXlsx : setExportingCsv;
    setExp(true);
    try {
      const res = await api.get('/revenue/export', {
        params:       { type: exportType, start: filterStart, end: filterEnd, format },
        responseType: 'blob',
      });
      const disposition = res.headers['content-disposition'] || '';
      const match       = disposition.match(/filename="?([^"]+)"?/);
      const ext         = format === 'xlsx' ? '.xlsx' : '.csv';
      const filename    = match ? match[1] : `${exportType}-report${ext}`;
      const url    = URL.createObjectURL(res.data);
      const anchor = document.createElement('a');
      anchor.href     = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err.response?.data?.error || 'Export failed. Please try again.';
      alert(msg);
    } finally {
      setExp(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <button
        className="btn-primary"
        onClick={() => handleDownload('xlsx')}
        disabled={busy}
        style={{ fontSize: 13, padding: '5px 14px', whiteSpace: 'nowrap' }}
      >
        {exportingXlsx ? 'Exporting…' : 'Export Excel'}
      </button>
      <button
        className="btn-secondary"
        onClick={() => handleDownload('csv')}
        disabled={busy}
        style={{ fontSize: 12, padding: '4px 10px', whiteSpace: 'nowrap' }}
      >
        {exportingCsv ? '…' : 'CSV'}
      </button>
    </div>
  );
}

function StatusBadge({ status, reason }) {
  if (status === 'REQUIRES_CONFIGURATION' || status === 'REQUIRES_INTEGRATION') {
    return (
      <span style={{
        fontSize: 12,
        padding: '3px 10px',
        borderRadius: 'var(--r-sm)',
        background: '#FFF3E0',
        color: 'var(--amber)',
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}>
        {reason || 'Requires configuration'}
      </span>
    );
  }
  if (status === 'NOT_IMPLEMENTED') {
    return (
      <span style={{
        fontSize: 12,
        padding: '3px 10px',
        borderRadius: 'var(--r-sm)',
        background: 'var(--lightgray)',
        color: 'var(--slate)',
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}>
        Coming soon
      </span>
    );
  }
  return null;
}

export function ReportsWorkspace({ filterStart, filterEnd, onExport }) {
  const [readiness, setReadiness] = useState({});

  useEffect(() => {
    let cancelled = false;
    api.get('/revenue/reports/readiness')
      .then(res => {
        if (!cancelled) setReadiness(res.data?.reports || {});
      })
      .catch(() => {
        if (!cancelled) setReadiness({});
      });
    return () => { cancelled = true; };
  }, []);

  // Merge static catalog with live readiness overrides
  const resolvedCatalog = REPORT_CATALOG.map(report => {
    const live = readiness[report.reportKey];
    if (!live) return report;
    return {
      ...report,
      status:         live.status,
      exportType:     live.exportType ?? report.exportType,
      requiresConfig: live.reason || report.requiresConfig,
    };
  });

  return (
    <div className="rov-ws-body ops-ws-body">

      {/* ── Report catalog ────────────────────────────────────────────────── */}
      <div className="ops-section-group">
        <div className="ops-bare-heading">
          <h2 className="rov-ws-section-title">Report Catalog</h2>
          <span className="rov-ws-section-sub">
            {filterStart} — {filterEnd}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {resolvedCatalog.map(report => (
            <div key={report.label} className="ops-table-card" style={{
              padding: '0.875rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              opacity: report.status === 'NOT_IMPLEMENTED' ? 0.65 : 1,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)', marginBottom: 2 }}>
                  {report.label}
                </div>
                <div style={{ fontSize: 13, color: 'var(--slate)' }}>
                  {report.description}
                </div>
              </div>
              <div style={{ flexShrink: 0 }}>
                {report.status === 'AVAILABLE' ? (
                  <ExportButton
                    exportType={report.exportType}
                    filterStart={filterStart}
                    filterEnd={filterEnd}
                  />
                ) : (
                  <StatusBadge status={report.status} reason={report.requiresConfig} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Export history ────────────────────────────────────────────────── */}
      <div className="ops-section-group">
        <div className="ops-bare-heading">
          <h2 className="rov-ws-section-title">Export History</h2>
        </div>
        <div className="ops-table-card" style={{ padding: '1.25rem 1.5rem', background: 'var(--offwhite)' }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--slate)' }}>
            No recent exports. Export history will appear here in a future update.
          </p>
        </div>
      </div>

    </div>
  );
}
