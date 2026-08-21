import React, { useState, useEffect } from 'react';
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

  // API returns: { topClients: [{id, name, job_count, earned_revenue, last_job_at}], summary: {activeClientCount}, limitations }
  const topClients        = state.data?.topClients || [];
  const activeClientCount = state.data?.summary?.activeClientCount || 0;

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
        </div>
        <div className="ops-sub-card" style={{ padding: '16px 18px' }}>
          <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>
            Requires 6+ months of data.
          </p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
            LTV projections become meaningful once enough job history has accumulated.
            This section will activate automatically when the threshold is met.
          </p>
        </div>
      </div>

      {/* ── At-Risk / Churn Detection ─────────────────────────────────────── */}
      <div className="ops-section-group">
        <div className="ops-bare-heading">
          <h2 className="rov-ws-section-title">At-Risk / Churn Detection</h2>
        </div>
        <div className="ops-sub-card" style={{ padding: '16px 18px' }}>
          <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>
            Customer inactivity policy required.
          </p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
            FieldCore needs to know what counts as &#8220;inactive&#8221; for your business
            &#8212; 60 days? 90 days? Configure this policy when it best fits your workflow.
          </p>
        </div>
      </div>

      {/* ── Segment Analysis ──────────────────────────────────────────────── */}
      <div className="ops-section-group">
        <div className="ops-bare-heading">
          <h2 className="rov-ws-section-title">Segment Analysis</h2>
        </div>
        <div className="ops-sub-card" style={{ padding: '16px 18px' }}>
          <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>
            Requires client segment tags.
          </p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
            Tag clients as residential, commercial, recurring, or other configured
            segments to unlock revenue breakdowns by segment.
          </p>
        </div>
      </div>

    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FORECASTING WORKSPACE
// ══════════════════════════════════════════════════════════════════════════════

// API returns: { ready, score (0-100), items: [{key, label, met, value}], missingPolicies, message, disclaimer }

export function ForecastingWorkspace({ filterStart, filterEnd }) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    api.get('/revenue/forecast/readiness')
      .then(res => {
        if (!cancelled) setState({ data: res.data, loading: false, error: null });
      })
      .catch(err => {
        if (!cancelled) {
          const msg = err.response?.data?.error || 'Forecasting readiness could not be loaded.';
          setState({ data: null, loading: false, error: msg });
        }
      });

    return () => { cancelled = true; };
  }, []); // readiness doesn't depend on date filters

  if (state.loading) return <LoadingState />;
  if (state.error)   return <ErrorState message={state.error} />;

  const {
    score           = 0,
    ready           = false,
    items           = [],
    missingPolicies = [],
    message         = '',
  } = state.data || {};

  return (
    <div className="rov-ws-body">

      {/* ── Readiness checklist ───────────────────────────────────────────── */}
      <div className="rov-ws-section">
        <div className="rov-ws-section-header">
          <span className="rov-ws-section-title">Forecast Readiness</span>
          <span className="rov-ws-section-sub">{score}% ready</span>
        </div>

        {/* Progress bar */}
        <div style={{
          height: 8,
          background: 'var(--lightgray)',
          borderRadius: 4,
          margin: '0 0 20px',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${score}%`,
            background: ready ? 'var(--green)' : score >= 60 ? 'var(--amber)' : 'var(--red)',
            borderRadius: 4,
            transition: 'width 0.4s ease',
          }} />
        </div>

        {/* Check list — items: [{key, label, met, value}] */}
        <div>
          {items.map((item) => (
            <div key={item.key} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '7px 0',
              borderBottom: '1px solid var(--lightgray)',
              fontSize: 14,
            }}>
              <span style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                background: item.met ? 'var(--green)' : 'var(--lightgray)',
                color: item.met ? 'var(--white)' : 'var(--steel)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
              }}>
                {item.met ? '✓' : '✗'}
              </span>
              <span style={{ flex: 1, color: item.met ? 'var(--navy)' : 'var(--slate)' }}>
                {item.label}
              </span>
              {item.value && (
                <span style={{ fontSize: 12, color: 'var(--steel)', fontFamily: "'DM Mono', monospace" }}>
                  {item.value}
                </span>
              )}
            </div>
          ))}
        </div>

        {message && (
          <p style={{ marginTop: 16, fontSize: 14, color: ready ? 'var(--green)' : 'var(--amber)', fontWeight: 500 }}>
            {message}
          </p>
        )}
      </div>

      {/* ── What forecasting will include ─────────────────────────────────── */}
      <div className="rov-ws-section">
        <div className="rov-ws-section-header">
          <span className="rov-ws-section-title">What Forecasting Will Include</span>
          <span className="rov-ws-section-sub">{ready ? 'Available now' : 'Unlocks when ready'}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'Projected Month-End Revenue',       desc: 'Estimate of total revenue by end of current month based on pacing.' },
            { label: 'Projected Quarter-End Revenue',     desc: 'Quarter-level projection based on historical quarterly patterns.' },
            { label: 'Best / Expected / Worst Case',      desc: 'Scenario bands built from completion rate variance.' },
            { label: 'Capacity-Adjusted Forecast',        desc: 'Revenue ceiling based on available technician hours.' },
            { label: 'Collection Timeline Forecast',      desc: 'When outstanding invoices are likely to convert to collected revenue.' },
          ].map(item => (
            <div key={item.label} className="dash-card" style={{
              padding: '1rem 1.25rem',
              opacity: ready ? 1 : 0.6,
            }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)', marginBottom: 4 }}>
                {item.label}
              </div>
              <div style={{ fontSize: 13, color: 'var(--slate)' }}>
                {item.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Policy configuration ──────────────────────────────────────────── */}
      {missingPolicies && missingPolicies.length > 0 && (
        <div className="rov-ws-section">
          <div className="rov-ws-section-header">
            <span className="rov-ws-section-title">Policy Configuration Needed</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {missingPolicies.map((policy, i) => (
              <div key={i} className="dash-card" style={{ padding: '1rem 1.25rem', background: 'var(--offwhite)' }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)', marginBottom: 4 }}>
                  {policy.label || policy}
                </div>
                {policy.description && (
                  <div style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 6 }}>
                    {policy.description}
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--steel)', fontStyle: 'italic' }}>
                  Configuration coming in next phase.
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Disclaimer ────────────────────────────────────────────────────── */}
      <div className="rov-limitations">
        <div className="rov-limitations-header">About Forecasting</div>
        <ul className="rov-limitations-list">
          <li>FieldCore uses rules-based projections. No AI or machine learning.</li>
          <li>Forecasts are estimates based on historical patterns and current pacing — not guarantees.</li>
          <li>Projections improve with more complete job history.</li>
        </ul>
      </div>

    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// REPORTS WORKSPACE
// ══════════════════════════════════════════════════════════════════════════════

const REPORT_CATALOG = [
  {
    label:       'Revenue Summary',
    description: 'Period totals: collected, earned, by service',
    status:      'AVAILABLE',
    exportType:  'summary',
  },
  {
    label:       'Revenue by Service',
    description: 'Job counts, revenue, and completion by service type',
    status:      'AVAILABLE',
    exportType:  'services',
  },
  {
    label:       'Invoice & Collections',
    description: 'All invoices with status, amounts, and dates',
    status:      'AVAILABLE',
    exportType:  'invoices',
  },
  {
    label:       'Revenue by Technician',
    description: 'Per-technician revenue (primary assignment)',
    status:      'COMING_SOON',
    exportType:  null,
  },
  {
    label:       'Customer Value Report',
    description: 'Top clients by revenue',
    status:      'COMING_SOON',
    exportType:  null,
  },
  {
    label:       'Cancellation & No-Show Report',
    description: 'Cancelled/no-show revenue impact',
    status:      'COMING_SOON',
    exportType:  null,
  },
  {
    label:       'Tax Summary',
    description: 'Tax collected by period',
    status:      'COMING_SOON',
    exportType:  null,
  },
  {
    label:       'Quarterly Financial',
    description: 'Q1-Q4 comparison',
    status:      'COMING_SOON',
    exportType:  null,
  },
  {
    label:       'P&L Statement',
    description: 'Requires accounting integration',
    status:      'REQUIRES_INTEGRATION',
    exportType:  null,
  },
  {
    label:       'Job Completion Analysis',
    description: 'Scheduled vs actual labor',
    status:      'COMING_SOON',
    exportType:  null,
  },
];

function ExportButton({ exportType, filterStart, filterEnd }) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await api.get('/revenue/export', {
        params:       { type: exportType, start: filterStart, end: filterEnd },
        responseType: 'blob',
      });

      // Build filename from content-disposition or fall back to type
      const disposition = res.headers['content-disposition'] || '';
      const match       = disposition.match(/filename="?([^"]+)"?/);
      const filename    = match ? match[1] : `${exportType}-report.csv`;

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
      setExporting(false);
    }
  }

  return (
    <button
      className="btn-secondary"
      onClick={handleExport}
      disabled={exporting}
      style={{ fontSize: 13, padding: '5px 14px', whiteSpace: 'nowrap' }}
    >
      {exporting ? 'Exporting…' : 'Export CSV'}
    </button>
  );
}

function StatusBadge({ status }) {
  if (status === 'REQUIRES_INTEGRATION') {
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
        Requires accounting integration
      </span>
    );
  }
  if (status === 'COMING_SOON') {
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
  const [savedViews, setSavedViews] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    api.get('/revenue/saved-views', { params: { workspace: 'reports' } })
      .then(res => {
        if (!cancelled) setSavedViews({ data: res.data, loading: false, error: null });
      })
      .catch(() => {
        if (!cancelled) setSavedViews({ data: [], loading: false, error: null });
      });
    return () => { cancelled = true; };
  }, []);

  // API returns { savedViews: [...] }
  const views = savedViews.data?.savedViews || (Array.isArray(savedViews.data) ? savedViews.data : []);

  return (
    <div className="rov-ws-body">

      {/* ── Report catalog ────────────────────────────────────────────────── */}
      <div className="rov-ws-section">
        <div className="rov-ws-section-header">
          <span className="rov-ws-section-title">Report Catalog</span>
          <span className="rov-ws-section-sub">
            {filterStart} — {filterEnd}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {REPORT_CATALOG.map(report => (
            <div key={report.label} className="dash-card" style={{
              padding: '1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              opacity: report.status === 'COMING_SOON' ? 0.65 : 1,
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
                  <StatusBadge status={report.status} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Saved views ───────────────────────────────────────────────────── */}
      <div className="rov-ws-section">
        <div className="rov-ws-section-header">
          <span className="rov-ws-section-title">Saved Views</span>
        </div>

        {savedViews.loading ? (
          <div style={{ fontSize: 14, color: 'var(--slate)', padding: '8px 0' }}>Loading…</div>
        ) : views.length === 0 ? (
          <div className="dash-card" style={{ padding: '1.25rem 1.5rem', background: 'var(--offwhite)' }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: 'var(--navy)', marginBottom: 4 }}>
              No saved views yet.
            </p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)' }}>
              Saved views allow you to bookmark filter configurations for quick access.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {views.map((view, i) => (
              <div key={view.id || i} className="dash-card" style={{
                padding: '0.75rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 14, color: 'var(--navy)', fontWeight: 500 }}>
                  {view.name || 'Saved View'}
                </span>
                {view.createdAt && (
                  <span style={{ fontSize: 12, color: 'var(--slate)' }}>
                    {new Date(view.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Export history ────────────────────────────────────────────────── */}
      <div className="rov-ws-section">
        <div className="rov-ws-section-header">
          <span className="rov-ws-section-title">Export History</span>
        </div>
        <div className="dash-card" style={{ padding: '1.25rem 1.5rem', background: 'var(--offwhite)' }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--slate)' }}>
            No recent exports. Export history will appear here in a future update.
          </p>
        </div>
      </div>

    </div>
  );
}
