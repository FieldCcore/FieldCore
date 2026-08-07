import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import api from '../api';
import RevenueKpiCard from '../components/RevenueKpiCard';
import { CHART } from '../theme/revenueChartTokens';
import {
  CustomersWorkspace,
  ForecastingWorkspace,
  ReportsWorkspace,
} from '../components/revenue/RevenueWorkspaceShells';

// ── Constants ─────────────────────────────────────────────────────────────────

const WORKSPACES = [
  { key: 'overview',     label: 'Overview'     },
  { key: 'financials',   label: 'Financials'   },
  { key: 'operations',   label: 'Operations'   },
  { key: 'customers',    label: 'Customers'    },
  { key: 'forecasting',  label: 'Forecasting'  },
  { key: 'reports',      label: 'Reports'      },
];

const VALID_VIEWS = WORKSPACES.map(w => w.key);

const COMPARISON_OPTIONS = [
  { value: 'none',            label: 'No comparison'   },
  { value: 'previous_period', label: 'Previous period' },
  { value: 'previous_month',  label: 'Previous month'  },
  { value: 'previous_year',   label: 'Previous year'   },
];

const INTERVAL_OPTIONS = [
  { value: 'daily',   label: 'Daily'   },
  { value: 'weekly',  label: 'Weekly'  },
  { value: 'monthly', label: 'Monthly' },
];

const TREND_METRICS = [
  { key: 'earned',    label: 'Earned Revenue',    color: CHART.earnedRevenue    },
  { key: 'collected', label: 'Collected Revenue', color: CHART.collectedRevenue },
];

// ── Date presets ──────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function DATE_PRESETS() {
  const today  = todayStr();
  const now    = new Date(today + 'T00:00:00Z');
  const mtdS   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const lastMonthS = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  const lastMonthE = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10);
  const qtdS   = new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1)).toISOString().slice(0, 10);
  const ytdS   = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10);
  const weekS  = addDays(today, -6);

  return [
    { label: 'Today',           start: today,      end: today      },
    { label: 'This Week',       start: weekS,       end: today      },
    { label: 'Month to Date',   start: mtdS,        end: today      },
    { label: 'Last Month',      start: lastMonthS,  end: lastMonthE },
    { label: 'Quarter to Date', start: qtdS,        end: today      },
    { label: 'Year to Date',    start: ytdS,        end: today      },
  ];
}

// ── Money formatters ──────────────────────────────────────────────────────────

function fmtMoney(n, compact = true) {
  const v = parseFloat(n) || 0;
  if (!compact) return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000)    return `$${(v / 1000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtPct(v) {
  if (v == null) return null;
  return `${parseFloat(v).toFixed(1)}%`;
}

function fmtNum(n) {
  return n != null ? String(Math.round(n)) : null;
}

function fmtGrowth(val) {
  if (val == null) return null;
  const sign = val >= 0 ? '+' : '';
  return `${sign}${parseFloat(val).toFixed(1)}%`;
}

// ── Comparison label ──────────────────────────────────────────────────────────

function compLabel(comparison) {
  const opt = COMPARISON_OPTIONS.find(o => o.value === comparison);
  if (!opt || comparison === 'none') return null;
  return `vs. ${opt.label.toLowerCase()}`;
}

// ── Hook: fetch with abort ─────────────────────────────────────────────────────

function useRevData(url, params, deps) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const abortRef = useRef(null);

  const fetch = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);

    const qp = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => { if (v) qp.set(k, v); });
    const fullUrl = qp.toString() ? `${url}?${qp}` : url;

    api.get(fullUrl, { signal: ctrl.signal })
      .then(r => { setData(r.data); setLoading(false); })
      .catch(e => {
        if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return;
        setError(e);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { fetch(); return () => { abortRef.current?.abort(); }; }, [fetch]);
  return { data, loading, error, refetch: fetch };
}

// ── Export trigger ────────────────────────────────────────────────────────────

async function triggerExport(url) {
  try {
    const res = await api.get(url, { responseType: 'blob' });
    const a   = document.createElement('a');
    a.href    = URL.createObjectURL(res.data);
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch {
    alert('Export failed. Please try again.');
  }
}

// ── RevenueTrendChart ─────────────────────────────────────────────────────────

/**
 * Parse a date value from the API safely.
 * The pg driver may return DATE columns as full ISO strings
 * (e.g. '2026-08-01T00:00:00.000Z') — take only the YYYY-MM-DD prefix
 * to avoid building an invalid compound string like '...ZT00:00:00Z'.
 */
function safeIsoDate(raw) {
  if (raw == null) return null;
  const s = String(raw);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function RevenueTrendChart({ data, loading, error, activeMetrics, interval }) {
  const [hovered, setHovered] = useState(null);

  if (loading) return (
    <div className="rov-trend-loading" role="status" aria-label="Loading chart">
      <div className="rov-trend-skeleton" />
    </div>
  );

  if (error) return (
    <div className="rov-trend-empty">Revenue trend data could not be loaded.</div>
  );

  const rows = data?.current || [];
  if (rows.length === 0) return (
    <div className="rov-trend-empty-compact" role="status">
      <div className="rov-trend-empty-icon" aria-hidden="true">—</div>
      <div className="rov-trend-empty-msg">No revenue activity for this period.</div>
      <div className="rov-trend-empty-hint">Try a wider date range or confirm completed jobs exist.</div>
    </div>
  );

  const maxVal = Math.max(
    ...rows.flatMap(r => activeMetrics.map(m => parseFloat(r[m]) || 0)),
    1
  );

  function periodLabel(raw) {
    const iso = safeIsoDate(raw);
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00Z');
    if (isNaN(d.getTime())) return '';
    if (interval === 'monthly') {
      return d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  function tooltipDate(raw) {
    const iso = safeIsoDate(raw);
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00Z');
    if (isNaN(d.getTime())) return '';
    if (interval === 'monthly') {
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    }
    if (interval === 'weekly') {
      return `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }

  const barWidth = Math.max(14, Math.min(40, Math.floor(460 / rows.length) - 6));
  const visibleMetrics = TREND_METRICS.filter(m => activeMetrics.includes(m.key));

  return (
    <div className="rov-trend-chart" role="img" aria-label="Revenue trend chart">
      <div className="rov-trend-bars">
        {rows.map((row, i) => (
          <div
            key={i}
            className="rov-trend-col"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{ width: barWidth }}
          >
            {hovered === i && (
              <div className="rov-trend-tooltip" role="tooltip">
                <div className="rov-trend-tt-date">{tooltipDate(row.periodStart)}</div>
                {visibleMetrics.map(m => (
                  <div key={m.key} className="rov-trend-tt-row">
                    <span className="rov-trend-tt-dot" style={{ background: m.color }} aria-hidden="true" />
                    <span className="rov-trend-tt-label">{m.label}</span>
                    <span className="rov-trend-tt-val">{fmtMoney(row[m.key], false)}</span>
                  </div>
                ))}
                {row.jobs > 0 && (
                  <div className="rov-trend-tt-jobs">{row.jobs} job{row.jobs !== 1 ? 's' : ''}</div>
                )}
              </div>
            )}
            <div className="rov-trend-bar-group">
              {visibleMetrics.map((m, mi) => {
                const h = Math.max(3, (parseFloat(row[m.key]) / maxVal) * 100);
                return (
                  <div
                    key={m.key}
                    className="rov-trend-bar"
                    style={{
                      height:     `${h}%`,
                      background: m.color,
                      opacity:    hovered !== null && hovered !== i ? 0.45 : 1,
                      width:      visibleMetrics.length > 1 ? `${Math.floor(barWidth / 2) - 1}px` : `${barWidth}px`,
                      marginLeft: mi === 1 ? '2px' : 0,
                    }}
                    aria-label={`${m.label}: ${fmtMoney(row[m.key], false)}`}
                  />
                );
              })}
            </div>
            <div className="rov-trend-lbl">{periodLabel(row.periodStart)}</div>
          </div>
        ))}
      </div>

      <div className="rov-trend-legend" role="list" aria-label="Chart legend">
        {visibleMetrics.map(m => (
          <div key={m.key} className="rov-trend-legend-item" role="listitem">
            <span className="rov-trend-legend-dot" style={{ background: m.color }} aria-hidden="true" />
            <span>{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── RevenueInsightPanel ───────────────────────────────────────────────────────

function RevenueInsightPanel({ insights, loading }) {
  const navigate = useNavigate();

  if (loading) return (
    <div className="rov-insight-panel">
      <div className="rov-insight-header">Revenue Insight</div>
      <div className="rov-insight-skeleton" />
    </div>
  );

  const items = insights || [];

  const TONE_COLOR = {
    positive: 'var(--green)',
    warning:  'var(--yellow-dk, #B45309)',
    critical: 'var(--red)',
    neutral:  'var(--slate)',
  };

  return (
    <div className="rov-insight-panel" aria-label="Revenue insights">
      <div className="rov-insight-header">Revenue Insight</div>
      {items.length === 0 ? (
        <div className="rov-insight-empty">No meaningful insight yet — add more data to see trends.</div>
      ) : (
        <div className="rov-insight-list" role="list">
          {items.map((ins, i) => (
            <div key={ins.id || i} className="rov-insight-item" role="listitem">
              <div
                className="rov-insight-dot"
                style={{ background: TONE_COLOR[ins.tone] || TONE_COLOR.neutral }}
                aria-hidden="true"
              />
              <div className="rov-insight-body">
                <p className="rov-insight-text">{ins.text}</p>
                {ins.route && (
                  <button
                    type="button"
                    className="rov-insight-link"
                    onClick={() => navigate(ins.route)}
                  >
                    View details
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ServiceTable ──────────────────────────────────────────────────────────────

function ServiceTable({ services, loading, error }) {
  const [sortKey, setSortKey] = useState('earnedRevenue');
  const [sortDir, setSortDir] = useState('desc');

  if (loading) return (
    <div className="dash-card" style={{ padding: 24 }}>
      <div className="rov-table-skeleton" aria-label="Loading service table" />
    </div>
  );

  if (error) return (
    <div className="dash-card" style={{ padding: 24, color: 'var(--red)', fontSize: 13 }}>
      Service breakdown data could not be loaded.
    </div>
  );

  const rows = services || [];

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sorted = [...rows].sort((a, b) => {
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

  const totEarned    = rows.reduce((s, r) => s + r.earnedRevenue,    0);
  const totCollected = rows.reduce((s, r) => s + r.collectedRevenue, 0);
  const totJobs      = rows.reduce((s, r) => s + r.jobs,             0);
  const totHours     = rows.reduce((s, r) => s + r.laborHours,       0);

  return (
    <div className="dash-card" style={{ overflow: 'hidden' }}>
      <div className="dash-ch">
        <span className="dash-cht">Revenue by Service</span>
        <span style={{ fontSize: 11, color: 'var(--steel)', fontFamily: 'DM Mono, monospace' }}>
          {rows.length} service type{rows.length !== 1 ? 's' : ''} · revenue counted once per job
        </span>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--steel)', fontSize: 13 }}>
          No completed jobs with revenue in this period.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table rov-service-table" aria-label="Revenue by service type">
            <thead>
              <tr>
                <th scope="col">Service</th>
                <SortTh col="jobs"               label="Jobs"             />
                <SortTh col="earnedRevenue"       label="Earned Revenue"   />
                <SortTh col="collectedRevenue"    label="Collected Rev."   />
                <SortTh col="avgTicket"           label="Avg Ticket"       />
                <th scope="col">Gross Profit</th>
                <th scope="col">Margin</th>
                <SortTh col="laborHours"          label="Labor Hrs"        />
                <SortTh col="revenuePerLaborHour" label="Rev / Hr"         />
                <SortTh col="completionRate"      label="Completion"       />
                <SortTh col="revenueShare"        label="Share"            />
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
                  <td style={{ color: 'var(--steel)', fontStyle: 'italic', fontSize: 11 }}>Unavailable</td>
                  <td style={{ color: 'var(--steel)', fontStyle: 'italic', fontSize: 11 }}>Unavailable</td>
                  <td>{s.laborHours > 0 ? `${s.laborHours}h` : '—'}</td>
                  <td>{s.revenuePerLaborHour != null ? fmtMoney(s.revenuePerLaborHour) : '—'}</td>
                  <td>
                    {s.completionRate != null
                      ? <span style={{ color: s.completionRate < 0.75 ? 'var(--red)' : 'var(--green)' }}>
                          {fmtPct(s.completionRate * 100)}
                        </span>
                      : '—'}
                  </td>
                  <td>
                    <div className="rov-share-bar-wrap" aria-label={`${s.revenueShare.toFixed(1)}% of total`}>
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
                <td /><td />
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
  );
}

// ── RiskOpportunities ─────────────────────────────────────────────────────────

function RiskOpportunities({ data, loading }) {
  const navigate = useNavigate();
  if (loading) return null;

  const risk = data?.risk         || [];
  const opps = data?.opportunities || [];

  if (risk.length === 0 && opps.length === 0) return null;

  const RISK_COLORS = {
    overdue_invoices: '#DC2626',
    failed_payments:  '#B45309',
    cancelled_jobs:   '#8A90A2',
  };
  const OPP_COLORS = {
    accepted_estimate_not_scheduled: '#2E7D32',
    repeat_client_due:               '#1C2333',
  };

  return (
    <div className="rov-risk-section">
      {risk.length > 0 && (
        <div className="rov-risk-col">
          <div className="rov-risk-header">Revenue at Risk</div>
          <div className="rov-risk-items" role="list">
            {risk.map((r, i) => (
              <div key={i} className="rov-risk-item" role="listitem"
                style={{ borderLeftColor: RISK_COLORS[r.type] || 'var(--red)' }}>
                <div className="rov-risk-item-top">
                  <span className="rov-risk-label">{r.label}</span>
                  <span className="rov-risk-amount" style={{ color: RISK_COLORS[r.type] || 'var(--red)' }}>
                    {r.value != null ? fmtMoney(r.value) : ''}
                    {r.count > 0 && <span className="rov-risk-count"> ({r.count})</span>}
                  </span>
                </div>
                <div className="rov-risk-reason">{r.reason}</div>
                {r.route && (
                  <button type="button" className="rov-risk-action" onClick={() => navigate(r.route)}>
                    {r.action} →
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {opps.length > 0 && (
        <div className="rov-risk-col">
          <div className="rov-risk-header">Opportunities</div>
          <div className="rov-risk-items" role="list">
            {opps.map((o, i) => (
              <div key={i} className="rov-risk-item rov-risk-item--opp" role="listitem"
                style={{ borderLeftColor: OPP_COLORS[o.type] || 'var(--green)' }}>
                <div className="rov-risk-item-top">
                  <span className="rov-risk-label">{o.label}</span>
                  <span className="rov-risk-amount" style={{ color: OPP_COLORS[o.type] || 'var(--green)' }}>
                    {o.value != null ? fmtMoney(o.value) : ''}
                    {o.count > 0 && <span className="rov-risk-count"> ({o.count})</span>}
                  </span>
                </div>
                <div className="rov-risk-reason">{o.reason}</div>
                {o.route && (
                  <button type="button" className="rov-risk-action" onClick={() => navigate(o.route)}>
                    {o.action} →
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Top5Services ──────────────────────────────────────────────────────────────

function Top5Services({ services, loading, onViewAll }) {
  if (loading) return (
    <div className="dash-card" style={{ padding: 18 }}>
      <div className="rov-table-skeleton" style={{ height: 80 }} aria-label="Loading top services" />
    </div>
  );

  const rows = [...(services || [])].sort((a, b) => b.earnedRevenue - a.earnedRevenue).slice(0, 5);

  return (
    <div className="dash-card" style={{ padding: '16px 18px' }}>
      <div className="rov-top5-header">
        <span className="rov-top5-title">Top 5 Services</span>
        <button type="button" className="rov-ws-cta" onClick={onViewAll}>
          View All →
        </button>
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--steel)', padding: '8px 0' }}>
          No service data for this period.
        </div>
      ) : (
        <table className="rov-top5-table" aria-label="Top 5 services by earned revenue">
          <thead>
            <tr>
              <th>Service</th>
              <th>Jobs</th>
              <th>Earned</th>
              <th>Avg Ticket</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={i}>
                <td>{s.service}</td>
                <td style={{ color: 'var(--slate)' }}>{s.jobs}</td>
                <td><strong>{fmtMoney(s.earnedRevenue)}</strong></td>
                <td>{s.avgTicket != null ? fmtMoney(s.avgTicket) : '—'}</td>
                <td style={{ color: 'var(--slate)' }}>{s.revenueShare.toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── FinancialsWorkspace ───────────────────────────────────────────────────────

const QUARTER_KEYS   = ['Q1', 'Q2', 'Q3', 'Q4', 'year'];
const QUARTER_LABELS = { Q1: 'Q1', Q2: 'Q2', Q3: 'Q3', Q4: 'Q4', year: 'Full Year' };

const INTEGRATION_CARDS = [
  {
    name:     'Accounting',
    examples: 'QuickBooks, Xero, FreshBooks',
    desc:     'Connect to pull COGS, expenses, and profit/loss data for gross and net margin calculations.',
  },
  {
    name:     'Banking',
    examples: 'Bank feeds, direct import',
    desc:     'Connect to reconcile deposits and track cash flow against earned revenue.',
  },
  {
    name:     'Payment Processor',
    examples: 'Stripe, Square, PayPal',
    desc:     'Connect to import transactions and merchant fees automatically.',
  },
];

const PROFITABILITY_ROWS = [
  ['COGS',                'cogs'             ],
  ['Gross Profit',        'grossProfit'      ],
  ['Gross Margin',        'grossMargin'      ],
  ['Operating Expenses',  'operatingExpenses'],
  ['Operating Profit',    'operatingProfit'  ],
  ['Net Profit',          'netProfit'        ],
  ['Net Margin',          'netMargin'        ],
  ['Refunds & Credits',   'refunds'          ],
  ['Merchant Fees',       'merchantFees'     ],
];

function FinancialsWorkspace() {
  const currentYear = new Date().getUTCFullYear();
  const [finYear, setFinYear] = useState(currentYear);
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

  const { data: quarterly, loading: qLoading } =
    useRevData('/revenue/quarterly', { year: finYear }, [finYear]);

  const q   = quarterly?.quarters    || {};
  const lim = quarterly?.limitations || [];

  function GrowthCell({ qKey, type }) {
    const d = q[qKey];
    if (!d) return <td>—</td>;
    const raw = type === 'qoq' ? d.qoqGrowth : d.yoyGrowth;
    if (raw == null) return <td><span className="rov-q-growth-none">—</span></td>;
    const cls = raw >= 0 ? 'rov-q-growth-pos' : 'rov-q-growth-neg';
    return <td><span className={cls}>{fmtGrowth(raw)}</span></td>;
  }

  return (
    <div className="rov-ws-body">

      {/* Year selector */}
      <div className="rov-fin-year-bar">
        <span className="rov-fin-year-label">Fiscal Year</span>
        <select
          className="rov-fin-year-select"
          value={finYear}
          onChange={e => setFinYear(parseInt(e.target.value))}
          aria-label="Select fiscal year"
        >
          {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {qLoading && (
          <span style={{ fontSize: 11, color: 'var(--steel)' }}>Loading…</span>
        )}
      </div>

      {/* Integration status cards */}
      <div className="rov-fin-integration-cards">
        {INTEGRATION_CARDS.map(ic => (
          <div key={ic.name} className="rov-fin-int-card">
            <div className="rov-fin-int-name">{ic.name}</div>
            <div style={{ fontSize: 10, color: 'var(--steel)', marginBottom: 2 }}>{ic.examples}</div>
            <div className="rov-fin-int-status">Not connected</div>
            <div className="rov-fin-int-desc">{ic.desc}</div>
          </div>
        ))}
      </div>

      {/* Quarterly comparison table */}
      <div className="rov-ws-section">
        <div className="rov-ws-section-header">
          <h2 className="rov-ws-section-title">Quarterly Financial Review — {finYear}</h2>
          {quarterly?.calculatedAt && (
            <span className="rov-ws-section-sub">
              Calculated {new Date(quarterly.calculatedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="rov-quarterly-table-wrap">
          <table className="rov-q-table" aria-label={`Quarterly financial comparison ${finYear}`}>
            <thead>
              <tr>
                <th>Metric</th>
                {QUARTER_KEYS.map(k => <th key={k}>{QUARTER_LABELS[k]}</th>)}
              </tr>
            </thead>
            <tbody>

              {/* ── Revenue ── */}
              <tr className="rov-q-section-row">
                <td colSpan={6}>Revenue</td>
              </tr>

              <tr>
                <td>Earned Revenue</td>
                {QUARTER_KEYS.map(k => {
                  const d = q[k];
                  return <td key={k}>{d?.earnedRevenue != null ? fmtMoney(d.earnedRevenue, false) : '—'}</td>;
                })}
              </tr>

              <tr>
                <td>Collected Revenue</td>
                {QUARTER_KEYS.map(k => {
                  const d = q[k];
                  return <td key={k}>{d?.collectedRevenue != null ? fmtMoney(d.collectedRevenue, false) : '—'}</td>;
                })}
              </tr>

              <tr>
                <td>Avg Ticket</td>
                {QUARTER_KEYS.map(k => {
                  const d = q[k];
                  return <td key={k}>{d?.avgTicket != null ? fmtMoney(d.avgTicket, false) : '—'}</td>;
                })}
              </tr>

              <tr>
                <td>QoQ Growth</td>
                {QUARTER_KEYS.map(k => {
                  if (k === 'year') return <td key={k}><span className="rov-q-growth-none">—</span></td>;
                  const d = q[k];
                  if (!d || d.qoqGrowth == null) return <td key={k}><span className="rov-q-growth-none">—</span></td>;
                  const cls = d.qoqGrowth >= 0 ? 'rov-q-growth-pos' : 'rov-q-growth-neg';
                  return <td key={k}><span className={cls}>{fmtGrowth(d.qoqGrowth)}</span></td>;
                })}
              </tr>

              <tr>
                <td>YoY Growth</td>
                {QUARTER_KEYS.map(k => {
                  const d = q[k];
                  if (!d || d.yoyGrowth == null) return <td key={k}><span className="rov-q-growth-none">—</span></td>;
                  const cls = d.yoyGrowth >= 0 ? 'rov-q-growth-pos' : 'rov-q-growth-neg';
                  return <td key={k}><span className={cls}>{fmtGrowth(d.yoyGrowth)}</span></td>;
                })}
              </tr>

              {/* ── Profitability ── */}
              <tr className="rov-q-section-row">
                <td colSpan={6}>Profitability — Requires accounting integration</td>
              </tr>

              {PROFITABILITY_ROWS.map(([label]) => (
                <tr key={label}>
                  <td>{label}</td>
                  {QUARTER_KEYS.map(k => (
                    <td key={k}><span className="rov-q-unavailable">Unavailable</span></td>
                  ))}
                </tr>
              ))}

            </tbody>
          </table>
        </div>

        {lim.length > 0 && (
          <div
            className="rov-limitations"
            style={{ margin: 0, borderRadius: 0, borderTop: '1px solid var(--lightgray)' }}
            role="note"
          >
            <div className="rov-limitations-header">Data limitations</div>
            <ul className="rov-limitations-list">
              {lim.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ── OperationsWorkspace ───────────────────────────────────────────────────────

function OperationsWorkspace({ filterStart, filterEnd }) {
  const { data: svcData, loading: svcLoading, error: svcError } =
    useRevData('/revenue/services', { start: filterStart, end: filterEnd }, [filterStart, filterEnd]);

  return (
    <div className="rov-ws-body">
      <ServiceTable services={svcData} loading={svcLoading} error={svcError} />

      <div className="rov-ws-section">
        <div className="rov-ws-section-header">
          <h2 className="rov-ws-section-title">Revenue by Technician</h2>
          <span className="rov-ws-section-sub">Coming in a later phase</span>
        </div>
        <div className="rov-ws-placeholder">
          <ul className="rov-ws-section-list">
            <li>Per-technician earned and collected revenue</li>
            <li>Jobs completed, average ticket, and completion rate per tech</li>
            <li>Labor hours logged and revenue per labor hour</li>
            <li>Month-over-month performance trend by technician</li>
          </ul>
          <p className="rov-ws-placeholder-note">Requires technician assignment data from completed job sessions.</p>
        </div>
      </div>

      <div className="rov-ws-section">
        <div className="rov-ws-section-header">
          <h2 className="rov-ws-section-title">Job Completion Analysis</h2>
          <span className="rov-ws-section-sub">Coming in a later phase</span>
        </div>
        <div className="rov-ws-placeholder">
          <ul className="rov-ws-section-list">
            <li>Jobs scheduled vs. completed vs. cancelled</li>
            <li>No-show rate and revenue impact per period</li>
            <li>Cancellation reasons and frequency breakdown</li>
            <li>Completion rate by service type and technician</li>
          </ul>
          <p className="rov-ws-placeholder-note">Built from job status history and session records.</p>
        </div>
      </div>
    </div>
  );
}

// ── Workspace placeholders ────────────────────────────────────────────────────

function WorkspacePlaceholder({ sections }) {
  return (
    <div className="rov-ws-body">
      {sections.map((sec, i) => (
        <div key={i} className="rov-ws-section">
          <div className="rov-ws-section-header">
            <h2 className="rov-ws-section-title">{sec.title}</h2>
            <span className="rov-ws-section-sub">Coming in a later phase</span>
          </div>
          <div className="rov-ws-placeholder">
            <ul className="rov-ws-section-list">
              {sec.items.map((item, j) => <li key={j}>{item}</li>)}
            </ul>
            {sec.note && <p className="rov-ws-placeholder-note">{sec.note}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// CustomersWorkspace, ForecastingWorkspace, ReportsWorkspace are imported from
// ../components/revenue/RevenueWorkspaceShells — they replaced placeholder stubs here.

// ── Main component ────────────────────────────────────────────────────────────

export default function Revenue() {
  const [searchParams, setSearchParams] = useSearchParams();

  // URL state
  const view        = VALID_VIEWS.includes(searchParams.get('view')) ? searchParams.get('view') : 'overview';
  const urlStart    = searchParams.get('start')      || '';
  const urlEnd      = searchParams.get('end')        || '';
  const urlComp     = searchParams.get('comparison') || 'none';
  const urlInterval = searchParams.get('interval')   || 'daily';

  // Filter state
  const [filterStart,   setFilterStart]   = useState(() => urlStart  || DATE_PRESETS()[2].start);
  const [filterEnd,     setFilterEnd]     = useState(() => urlEnd    || DATE_PRESETS()[2].end);
  const [comparison,    setComparison]    = useState(() => urlComp);
  const [interval,      setInterval]      = useState(() => urlInterval);
  const [activeMetrics, setActiveMetrics] = useState(['earned', 'collected']);
  const [exportLoading, setExportLoading] = useState(false);
  const [activePreset,  setActivePreset]  = useState('Month to Date');

  function applyFilters({ start, end, comp, view: v, intv }) {
    const next = {};
    const vs = start ?? filterStart;
    const ve = end   ?? filterEnd;
    const vc = comp  ?? comparison;
    const vv = v     ?? view;
    const vi = intv  ?? interval;
    if (vv !== 'overview') next.view = vv;
    next.start = vs;
    next.end   = ve;
    if (vc && vc !== 'none') next.comparison = vc;
    if (vi !== 'daily')      next.interval   = vi;
    setSearchParams(next, { replace: true });
  }

  function switchView(key) { applyFilters({ view: key }); }

  function applyPreset(preset) {
    setFilterStart(preset.start);
    setFilterEnd(preset.end);
    setActivePreset(preset.label);
    applyFilters({ start: preset.start, end: preset.end });
  }

  function applyComparison(comp) {
    setComparison(comp);
    applyFilters({ comp });
  }

  function applyInterval(intv) {
    setInterval(intv);
    applyFilters({ intv });
  }

  // Overview data
  const overviewParams = { start: filterStart, end: filterEnd, comparison };
  const { data: overview, loading: overviewLoading, error: overviewError } =
    useRevData('/revenue/overview', overviewParams, [filterStart, filterEnd, comparison, view]);

  // Trend data
  const trendParams = { start: filterStart, end: filterEnd, interval, comparison };
  const { data: trendRaw, loading: trendLoading, error: trendError } =
    useRevData('/revenue/trend', trendParams, [filterStart, filterEnd, interval, comparison, view]);

  const pk = overview?.primaryKpis   || {};
  const sk = overview?.secondaryKpis || {};
  const services     = overview?.services || [];
  const insights     = overview?.insights || [];
  const calculatedAt = overview?.freshness?.calculatedAt;
  const compBasis    = compLabel(comparison);

  function toggleMetric(key) {
    setActiveMetrics(prev => {
      if (prev.includes(key)) return prev.length > 1 ? prev.filter(k => k !== key) : prev;
      return [...prev, key];
    });
  }

  async function handleExport(type) {
    setExportLoading(true);
    try {
      const qp = new URLSearchParams({ start: filterStart, end: filterEnd, type });
      await triggerExport(`/revenue/export?${qp}`);
    } finally {
      setExportLoading(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="rov-root">

      {/* Workspace tab nav */}
      <nav className="rov-workspace-nav" role="tablist" aria-label="Revenue workspaces">
        {WORKSPACES.map(ws => (
          <button
            key={ws.key}
            type="button"
            role="tab"
            className={`rov-workspace-tab${view === ws.key ? ' rov-workspace-tab--active' : ''}`}
            onClick={() => switchView(ws.key)}
            aria-selected={view === ws.key}
            aria-controls={`rov-panel-${ws.key}`}
          >
            {ws.label}
          </button>
        ))}
      </nav>

      {/* Shared filter bar */}
      <div className="rov-filter-bar" role="toolbar" aria-label="Revenue filters">
        <div className="rov-filter-presets" role="group" aria-label="Date presets">
          {DATE_PRESETS().map(p => (
            <button
              key={p.label}
              type="button"
              className={`rov-preset-btn${activePreset === p.label ? ' rov-preset-btn--active' : ''}`}
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="rov-filter-dates" role="group" aria-label="Custom date range">
          <input
            type="date"
            value={filterStart}
            onChange={e => { setFilterStart(e.target.value); setActivePreset(''); applyFilters({ start: e.target.value }); }}
            className="rov-date-input"
            aria-label="Start date"
          />
          <span className="rov-date-sep" aria-hidden="true">–</span>
          <input
            type="date"
            value={filterEnd}
            onChange={e => { setFilterEnd(e.target.value); setActivePreset(''); applyFilters({ end: e.target.value }); }}
            className="rov-date-input"
            aria-label="End date"
          />
        </div>

        <div className="rov-filter-group">
          <label className="rov-filter-label" htmlFor="rov-comparison">Compare</label>
          <select
            id="rov-comparison"
            className="rov-filter-select"
            value={comparison}
            onChange={e => applyComparison(e.target.value)}
          >
            {COMPARISON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <button
          type="button"
          className="btn-secondary"
          style={{ marginLeft: 'auto', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
          onClick={() => handleExport('summary')}
          disabled={exportLoading || overviewLoading}
          aria-label="Export revenue summary as CSV"
        >
          <Download size={13} aria-hidden="true" />
          Export
        </button>
      </div>

      {/* ── OVERVIEW ──────────────────────────────────────────────────────── */}
      {view === 'overview' && (
        <div id="rov-panel-overview" role="tabpanel" aria-label="Overview">

          {/* Primary KPIs */}
          <div className="rov-kpi-row rov-kpi-row--primary" role="list" aria-label="Primary revenue KPIs">
            <div role="listitem">
              <RevenueKpiCard
                label="Collected Revenue"
                value={pk.collectedRevenue?.status === 'ok' ? fmtMoney(pk.collectedRevenue.value) : null}
                status={pk.collectedRevenue?.status || 'loading'}
                comparison={pk.collectedRevenue?.comparison}
                comparisonBasis={compBasis}
                calculatedAt={calculatedAt}
                provenance={pk.collectedRevenue?.provenance}
                isLoading={overviewLoading}
                size="primary"
                note={pk.collectedRevenue?.breakdown
                  ? `${pk.collectedRevenue.breakdown.invoiceCount} invoice(s) + ${pk.collectedRevenue.breakdown.depositCount} deposit(s)`
                  : undefined}
              />
            </div>

            <div role="listitem">
              <RevenueKpiCard
                label="Earned Revenue"
                value={pk.earnedRevenue?.status === 'ok' ? fmtMoney(pk.earnedRevenue.value) : null}
                status={pk.earnedRevenue?.status || 'loading'}
                comparison={pk.earnedRevenue?.comparison}
                comparisonBasis={compBasis}
                calculatedAt={calculatedAt}
                provenance={pk.earnedRevenue?.provenance}
                isLoading={overviewLoading}
                size="primary"
                note={pk.earnedRevenue?.jobCount > 0 ? `${pk.earnedRevenue.jobCount} completed job(s)` : undefined}
              />
            </div>

            <div role="listitem">
              <RevenueKpiCard
                label="Gross Profit"
                value={null}
                status={pk.grossProfit?.status || 'loading'}
                calculatedAt={calculatedAt}
                provenance={pk.grossProfit?.provenance}
                isLoading={overviewLoading}
                size="primary"
              />
            </div>

            <div role="listitem">
              <RevenueKpiCard
                label="Outstanding AR"
                value={pk.outstandingAr?.status === 'ok' ? fmtMoney(pk.outstandingAr.value) : null}
                status={pk.outstandingAr?.status || 'loading'}
                calculatedAt={calculatedAt}
                provenance={pk.outstandingAr?.provenance}
                isLoading={overviewLoading}
                size="primary"
                note={pk.outstandingAr?.invoiceCount > 0
                  ? `${pk.outstandingAr.invoiceCount} invoice(s)${pk.outstandingAr.overdueCount > 0 ? ` · ${pk.outstandingAr.overdueCount} overdue` : ''}`
                  : undefined}
              />
            </div>

            <div role="listitem">
              <RevenueKpiCard
                label="Projected Month-End"
                value={pk.projectedMonthEnd?.status === 'ok'
                  ? `${fmtMoney(pk.projectedMonthEnd.lower)}–${fmtMoney(pk.projectedMonthEnd.upper)}`
                  : null}
                status={pk.projectedMonthEnd?.status || 'loading'}
                calculatedAt={pk.projectedMonthEnd?.calculatedAt}
                provenance={pk.projectedMonthEnd?.provenance}
                isLoading={overviewLoading}
                size="primary"
                note={pk.projectedMonthEnd?.status === 'ok'
                  ? `${Math.round((pk.projectedMonthEnd.completionRate || 0) * 100)}% completion · ${pk.projectedMonthEnd.confidence} confidence`
                  : undefined}
              />
            </div>
          </div>

          {/* Secondary KPIs */}
          <div className="rov-kpi-row rov-kpi-row--secondary" role="list" aria-label="Secondary revenue KPIs">
            <div role="listitem">
              <RevenueKpiCard
                label="Average Ticket"
                value={sk.averageTicket?.status === 'ok' ? fmtMoney(sk.averageTicket.value) : null}
                status={sk.averageTicket?.status || 'loading'}
                calculatedAt={calculatedAt}
                provenance={sk.averageTicket?.provenance}
                isLoading={overviewLoading}
                size="secondary"
              />
            </div>

            <div role="listitem">
              <RevenueKpiCard
                label="Revenue per Labor Hour"
                value={sk.revenuePerLaborHour?.status === 'ok' ? fmtMoney(sk.revenuePerLaborHour.value) : null}
                status={sk.revenuePerLaborHour?.status || 'loading'}
                calculatedAt={calculatedAt}
                provenance={sk.revenuePerLaborHour?.provenance}
                isLoading={overviewLoading}
                size="secondary"
                note={sk.revenuePerLaborHour?.basis === 'scheduled_labor_hours' ? 'Scheduled hrs' : undefined}
              />
            </div>

            <div role="listitem">
              <RevenueKpiCard
                label="Completion Rate"
                value={sk.completionRate?.status === 'ok' ? fmtPct(sk.completionRate.pct) : null}
                status={sk.completionRate?.status || 'loading'}
                calculatedAt={calculatedAt}
                provenance={sk.completionRate?.provenance}
                isLoading={overviewLoading}
                size="secondary"
                note={sk.completionRate?.eligible > 0
                  ? `${sk.completionRate.completed} of ${sk.completionRate.eligible} eligible`
                  : undefined}
              />
            </div>

            <div role="listitem">
              <RevenueKpiCard
                label="Technician Utilization"
                value={null}
                status={sk.technicianUtilization?.status || 'loading'}
                calculatedAt={calculatedAt}
                provenance={sk.technicianUtilization?.provenance}
                isLoading={overviewLoading}
                size="secondary"
              />
            </div>

            <div role="listitem">
              <RevenueKpiCard
                label="Repeat Revenue"
                value={sk.repeatRevenue?.status === 'ok' ? fmtMoney(sk.repeatRevenue.value) : null}
                status={sk.repeatRevenue?.status || 'loading'}
                calculatedAt={calculatedAt}
                provenance={sk.repeatRevenue?.provenance}
                isLoading={overviewLoading}
                size="secondary"
                note={sk.repeatRevenue?.clientCount > 0 ? `${sk.repeatRevenue.clientCount} returning client(s)` : undefined}
              />
            </div>

            <div role="listitem">
              <RevenueKpiCard
                label="Revenue at Risk"
                value={sk.revenueAtRisk?.status === 'ok' ? fmtMoney(sk.revenueAtRisk.value) : null}
                status={sk.revenueAtRisk?.status || 'loading'}
                calculatedAt={calculatedAt}
                provenance={sk.revenueAtRisk?.provenance}
                isLoading={overviewLoading}
                size="secondary"
              />
            </div>
          </div>

          {/* Error banner */}
          {overviewError && (
            <div className="rov-error-banner" role="alert">
              Revenue data could not be loaded. Data shown above may be stale.
            </div>
          )}

          {/* Trend + Insight */}
          <div className="rov-trend-section">
            <div className="rov-trend-main dash-card">
              <div className="dash-ch">
                <span className="dash-cht">Revenue Trend</span>
                <div className="rov-trend-controls" role="group" aria-label="Chart controls">
                  {TREND_METRICS.map(m => (
                    <button
                      key={m.key}
                      type="button"
                      className={`rov-metric-btn${activeMetrics.includes(m.key) ? ' rov-metric-btn--active' : ''}`}
                      style={activeMetrics.includes(m.key)
                        ? { borderColor: m.color, backgroundColor: m.color + '18' }
                        : {}}
                      onClick={() => toggleMetric(m.key)}
                      aria-pressed={activeMetrics.includes(m.key)}
                    >
                      <span className="rov-metric-dot" style={{ background: m.color }} aria-hidden="true" />
                      {m.label}
                    </button>
                  ))}
                  <select
                    className="rov-filter-select rov-filter-select--sm"
                    value={interval}
                    onChange={e => applyInterval(e.target.value)}
                    aria-label="Chart interval"
                  >
                    {INTERVAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <RevenueTrendChart
                data={trendRaw}
                loading={trendLoading}
                error={trendError}
                activeMetrics={activeMetrics}
                interval={interval}
              />
            </div>
            <RevenueInsightPanel insights={insights} loading={overviewLoading} />
          </div>

          {/* Bottom: Top 5 Services + Risk & Opportunities */}
          <div className="rov-overview-bottom">
            <Top5Services
              services={services}
              loading={overviewLoading}
              onViewAll={() => switchView('operations')}
            />
            <RiskOpportunities
              data={{ risk: overview?.risk, opportunities: overview?.opportunities }}
              loading={overviewLoading}
            />
          </div>

          {/* Limitations footer */}
          {overview?.limitations?.length > 0 && (
            <div className="rov-limitations" role="note" aria-label="Data limitations">
              <div className="rov-limitations-header">Data limitations</div>
              <ul className="rov-limitations-list">
                {overview.limitations.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── FINANCIALS ────────────────────────────────────────────────────── */}
      {view === 'financials' && (
        <div id="rov-panel-financials" role="tabpanel" aria-label="Financials">
          <FinancialsWorkspace />
        </div>
      )}

      {/* ── OPERATIONS ────────────────────────────────────────────────────── */}
      {view === 'operations' && (
        <div id="rov-panel-operations" role="tabpanel" aria-label="Operations">
          <OperationsWorkspace filterStart={filterStart} filterEnd={filterEnd} />
        </div>
      )}

      {/* ── CUSTOMERS ─────────────────────────────────────────────────────── */}
      {view === 'customers' && (
        <div id="rov-panel-customers" role="tabpanel" aria-label="Customers">
          <CustomersWorkspace filterStart={filterStart} filterEnd={filterEnd} />
        </div>
      )}

      {/* ── FORECASTING ───────────────────────────────────────────────────── */}
      {view === 'forecasting' && (
        <div id="rov-panel-forecasting" role="tabpanel" aria-label="Forecasting">
          <ForecastingWorkspace filterStart={filterStart} filterEnd={filterEnd} />
        </div>
      )}

      {/* ── REPORTS ───────────────────────────────────────────────────────── */}
      {view === 'reports' && (
        <div id="rov-panel-reports" role="tabpanel" aria-label="Reports">
          <ReportsWorkspace filterStart={filterStart} filterEnd={filterEnd} />
        </div>
      )}

    </div>
  );
}
