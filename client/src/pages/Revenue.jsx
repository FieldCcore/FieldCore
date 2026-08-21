import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Download, ChevronDown } from 'lucide-react';
import api from '../api';
import RevenueKpiCard from '../components/RevenueKpiCard';
import { CHART } from '../theme/revenueChartTokens';
import {
  CustomersWorkspace,
  ForecastingWorkspace,
  ReportsWorkspace,
} from '../components/revenue/RevenueWorkspaceShells';
import { FinancialsWorkspace }   from '../components/revenue/FinancialsWorkspace';
import { OperationsWorkspace }  from '../components/revenue/OperationsWorkspace';

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
  { value: 'none',             label: 'No comparison'    },
  { value: 'previous_period',  label: 'Previous period'  },
  { value: 'previous_month',   label: 'Previous month'   },
  { value: 'previous_quarter', label: 'Previous quarter' },
  { value: 'previous_year',    label: 'Previous year'    },
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

// ── FieldCoreSelect ───────────────────────────────────────────────────────────

function FieldCoreSelect({ options, value, onChange, label }) {
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const containerRef = useRef(null);
  const triggerRef   = useRef(null);

  const current = options.find(o => o.value === value) || options[0];

  function close() {
    setOpen(false);
    setFocusIdx(-1);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    function onOut(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) close();
    }
    document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleKey(e) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
        setFocusIdx(options.findIndex(o => o.value === value));
      }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(i + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setFocusIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (focusIdx >= 0 && options[focusIdx]) { onChange(options[focusIdx].value); close(); }
    }
    else if (e.key === 'Tab') { close(); }
  }

  return (
    <div ref={containerRef} className="fc-select-wrap">
      <button
        ref={triggerRef}
        type="button"
        className="fc-select-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (!open) setFocusIdx(options.findIndex(o => o.value === value));
          setOpen(v => !v);
        }}
        onKeyDown={handleKey}
      >
        {current.label}
        <ChevronDown size={11} className="fc-select-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div role="listbox" className="fc-select-menu" aria-label={label} onKeyDown={handleKey}>
          {options.map((opt, i) => (
            <button
              key={opt.value}
              role="option"
              type="button"
              tabIndex={i === focusIdx ? 0 : -1}
              className={[
                'fc-select-option',
                opt.value === value    ? 'fc-select-option--active'  : '',
                i         === focusIdx ? 'fc-select-option--focused' : '',
              ].filter(Boolean).join(' ')}
              aria-selected={opt.value === value}
              onClick={() => { onChange(opt.value); close(); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
    <div className="rov-top5-card top-services-card dash-card">
      <div className="rov-top5-header">
        <span className="rov-top5-title">Top 5 Services</span>
        <button type="button" className="rov-ws-cta" onClick={onViewAll}>View All →</button>
      </div>
      <div className="rov-top5-skeleton" aria-label="Loading top services" />
    </div>
  );

  const rows = [...(services || [])].sort((a, b) => b.earnedRevenue - a.earnedRevenue).slice(0, 5);

  return (
    <div className="rov-top5-card top-services-card dash-card">
      <div className="rov-top5-header">
        <span className="rov-top5-title">Top 5 Services</span>
        <button type="button" className="rov-ws-cta" onClick={onViewAll}>View All →</button>
      </div>
      <div className="rov-top5-body">
        {rows.length === 0 ? (
          <div className="rov-top5-empty">No service data for this period.</div>
        ) : (
          <table className="rov-top5-table" aria-label="Top 5 services by earned revenue">
            <thead>
              <tr>
                <th>Service</th>
                <th>Revenue</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => (
                <tr key={i}>
                  <td className="rov-top5-td-service">{s.service}</td>
                  <td className="rov-top5-td-rev"><strong>{fmtMoney(s.earnedRevenue)}</strong></td>
                  <td className="rov-top5-td-share">{s.revenueShare.toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── DataLimitationsPanel ──────────────────────────────────────────────────────

function DataLimitationsPanel({ dataQuality, loading }) {
  if (loading || !dataQuality?.limitations?.length) return null;

  const { limitations } = dataQuality;

  const SEVERITY_COLOR = {
    warning:  'var(--yellow-dk, #B45309)',
    critical: '#DC2626',
    info:     'var(--steel)',
  };

  function limText(lim) {
    if (typeof lim === 'string') return { title: null, desc: lim, severity: 'info' };
    return { title: lim.title, desc: lim.description, severity: lim.severity || 'info' };
  }

  return (
    <div className="rov-lim-panel" role="note" aria-label="Data limitations">
      <div className="rov-lim-panel-title">Data Limitations</div>
      <ul className="rov-lim-panel-list">
        {limitations.slice(0, 5).map((lim, i) => {
          const { title, desc, severity } = limText(lim);
          return (
            <li key={lim.code || i} className="rov-lim-panel-item">
              <span
                className="rov-lim-panel-dot"
                style={{ background: SEVERITY_COLOR[severity] || SEVERITY_COLOR.info }}
                aria-hidden="true"
              />
              <span className="rov-lim-panel-text">
                {title && <strong>{title}.</strong>}{title ? ' ' : ''}{desc}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// OperationsWorkspace is imported from ../components/revenue/OperationsWorkspace

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

// ── DataQualityIndicator ──────────────────────────────────────────────────────

function DataQualityIndicator({ dataQuality, loading }) {
  const [open, setOpen] = useState(false);
  if (loading || !dataQuality) return null;
  const { state, limitationCount, limitations, missingSources } = dataQuality;
  const color = state === 'complete' ? 'var(--green)' : state === 'partial' ? 'var(--yellow-dk, #B45309)' : 'var(--red)';
  const label = state === 'complete'
    ? 'Complete'
    : `${limitationCount} Limitation${limitationCount !== 1 ? 's' : ''}`;
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        className="rov-dq-btn"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label={`Data quality: ${label}`}
      >
        <span className="rov-dq-dot" style={{ background: color }} aria-hidden="true" />
        <span className="rov-dq-label">Data Quality: {label}</span>
      </button>
      {open && (
        <div className="rov-dq-panel" role="status" aria-label="Data quality details">
          <div className="rov-dq-panel-title">Revenue Data Quality</div>
          {limitations?.length > 0 && (
            <ul className="rov-dq-list">
              {limitations.map((l, i) => (
                <li key={i}>{typeof l === 'string' ? l : (l.description || l.title)}</li>
              ))}
            </ul>
          )}
          {missingSources?.length > 0 && (
            <div className="rov-dq-sources">Missing sources: {missingSources.join(', ')}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── OpportunitiesStrip ────────────────────────────────────────────────────────

function OpportunitiesStrip({ opportunities, risk, loading }) {
  const navigate = useNavigate();
  if (loading) return null;

  const items = [
    ...(risk         || []).map(r => ({ ...r, _kind: 'risk' })),
    ...(opportunities || []).map(o => ({ ...o, _kind: 'opp'  })),
  ].slice(0, 3);

  if (items.length === 0) return (
    <div className="rov-opps-strip rov-opps-strip--empty">
      No material opportunities identified for this period.
    </div>
  );

  return (
    <div className="rov-opps-strip" aria-label="Revenue opportunities">
      <div className="rov-opps-title">Revenue Opportunities</div>
      <div className="rov-opps-items">
        {items.map((item, i) => (
          <div key={i} className={`rov-opps-item rov-opps-item--${item._kind}`}>
            {item.value != null && (
              <span className="rov-opps-amount">{fmtMoney(item.value)}</span>
            )}
            <span className="rov-opps-reason">{item.label}</span>
            {item.route && (
              <button
                type="button"
                className="rov-opps-action"
                onClick={() => navigate(item.route)}
              >
                {item.action || 'View'} →
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

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
  const services     = overview?.services     || [];
  const insights     = overview?.insights     || [];
  const opportunities = overview?.opportunities || [];
  const dataQuality  = overview?.dataQuality  || null;
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
        <DataQualityIndicator dataQuality={dataQuality} loading={overviewLoading} />
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

            <div role="listitem">
              <RevenueKpiCard
                label="Revenue at Risk"
                value={pk.revenueAtRisk?.status === 'ok' ? fmtMoney(pk.revenueAtRisk.value) : null}
                status={pk.revenueAtRisk?.status || 'loading'}
                calculatedAt={calculatedAt}
                provenance={pk.revenueAtRisk?.provenance}
                isLoading={overviewLoading}
                size="primary"
              />
            </div>
          </div>

          {/* Secondary KPIs — 2 cards: Average Ticket, Revenue per Labor Hour */}
          {/* Repeat Revenue moved to Customers workspace */}
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
                note={sk.revenuePerLaborHour?.basis === 'scheduled_labor_hours' ? 'Using scheduled hrs' : undefined}
              />
            </div>
          </div>

          {/* Error banner */}
          {overviewError && (
            <div className="rov-error-banner" role="alert">
              Revenue data could not be loaded. Data shown above may be stale.
            </div>
          )}

          {/* Trend + Executive Context (Revenue Insight + Top 5 Services) */}
          <div className="analytics-grid">
            <div className="revenue-trend-card dash-card">
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
                  <FieldCoreSelect
                    options={INTERVAL_OPTIONS}
                    value={interval}
                    onChange={applyInterval}
                    label="Chart interval"
                  />
                </div>
              </div>
              <div className="rov-trend-body">
                <RevenueTrendChart
                  data={trendRaw}
                  loading={trendLoading}
                  error={trendError}
                  activeMetrics={activeMetrics}
                  interval={interval}
                />
              </div>
            </div>
            <div className="analytics-side-column">
              <RevenueInsightPanel insights={insights} loading={overviewLoading} />
              <Top5Services
                services={services}
                loading={overviewLoading}
                onViewAll={() => switchView('operations')}
              />
            </div>
          </div>

          {/* Data Limitations — full-width, below chart row */}
          <DataLimitationsPanel dataQuality={dataQuality} loading={overviewLoading} />

          {/* Opportunities strip */}
          <OpportunitiesStrip
            opportunities={opportunities}
            risk={overview?.risk}
            loading={overviewLoading}
          />
        </div>
      )}

      {/* ── FINANCIALS ────────────────────────────────────────────────────── */}
      {view === 'financials' && (
        <div id="rov-panel-financials" role="tabpanel" aria-label="Financials">
          <FinancialsWorkspace filterStart={filterStart} filterEnd={filterEnd} comparison={comparison} />
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
