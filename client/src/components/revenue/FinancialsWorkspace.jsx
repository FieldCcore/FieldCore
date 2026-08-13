import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(v, compact = false) {
  if (v == null) return '—';
  const n = parseFloat(v) || 0;
  if (compact && Math.abs(n) >= 1000) {
    return '$' + (n / 1000).toFixed(1) + 'k';
  }
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(v) {
  if (v == null) return '—';
  return (parseFloat(v) || 0).toFixed(1) + '%';
}

function useFinData(params) {
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
    Object.entries(params || {}).forEach(([k, v]) => { if (v && v !== 'none') qp.set(k, v); });
    const url = qp.toString() ? `/revenue/financials?${qp}` : '/revenue/financials';

    api.get(url, { signal: ctrl.signal })
      .then(r => { setData(r.data); setLoading(false); })
      .catch(e => {
        if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return;
        setError(e?.response?.data?.error || 'Financial data could not be loaded.');
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.start, params.end, params.comparison]);

  useEffect(() => { fetch(); return () => { abortRef.current?.abort(); }; }, [fetch]);
  return { data, loading, error };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FinKpiCard({ label, value, status, breakdown, missingSource, compact = true }) {
  const isUnavail = status === 'unavailable';
  return (
    <div className="fin-kpi-card dash-card">
      <div className="fin-kpi-label">{label}</div>
      {isUnavail ? (
        <div className="fin-kpi-unavail">
          <span className="fin-kpi-unavail-badge">Not connected</span>
          {missingSource && (
            <div className="fin-kpi-unavail-hint">{missingSource}</div>
          )}
        </div>
      ) : (
        <div className="fin-kpi-value">{fmtMoney(value, compact)}</div>
      )}
      {!isUnavail && breakdown && (
        <div className="fin-kpi-breakdown">
          {Object.entries(breakdown)
            .filter(([k]) => k !== 'jobCount' && k !== 'invoiceCount' && k !== 'depositCount')
            .map(([k, v]) => (
              <div key={k} className="fin-kpi-breakdown-row">
                <span>{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                <span>{fmtMoney(v, false)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function ARAgingCard({ arAging, loading }) {
  if (loading) return (
    <div className="fin-ar-card dash-card">
      <div className="fin-section-header">
        <h3 className="fin-section-title">AR Aging</h3>
      </div>
      <div className="fin-loading-row" aria-label="Loading AR aging data">Loading…</div>
    </div>
  );
  if (!arAging) return null;

  const max = Math.max(...arAging.buckets.map(b => b.amount), 1);

  return (
    <div className="fin-ar-card dash-card">
      <div className="fin-section-header">
        <h3 className="fin-section-title">AR Aging</h3>
        <span className="fin-section-sub">
          {arAging.invoiceCount} pending invoice{arAging.invoiceCount !== 1 ? 's' : ''} · {fmtMoney(arAging.total, false)} total
        </span>
      </div>
      <div className="fin-ar-body">
        {arAging.buckets.map(b => {
          const pct = max > 0 ? (b.amount / max) * 100 : 0;
          const isOverdue = b.days !== 'current';
          return (
            <div key={b.days} className="fin-ar-row">
              <div className="fin-ar-label">{b.label}</div>
              <div className="fin-ar-bar-wrap">
                <div
                  className={`fin-ar-bar${isOverdue && b.amount > 0 ? ' fin-ar-bar--overdue' : ''}`}
                  style={{ width: `${pct}%` }}
                  aria-hidden="true"
                />
              </div>
              <div className="fin-ar-amount">
                {b.amount > 0 ? fmtMoney(b.amount, false) : <span className="fin-ar-zero">—</span>}
                {b.count > 0 && <span className="fin-ar-count">({b.count})</span>}
              </div>
            </div>
          );
        })}
      </div>
      {arAging.overdueCount > 0 && (
        <div className="fin-ar-overdue-summary">
          <span className="fin-ar-overdue-tag">
            {fmtMoney(arAging.overdueTotal, false)} overdue across {arAging.overdueCount} invoice{arAging.overdueCount !== 1 ? 's' : ''}
          </span>
        </div>
      )}
      <div className="fin-ar-note">
        Due date proxy: net-30 from sent date. Set explicit due dates for accuracy.
      </div>
    </div>
  );
}

function CashFlowCard({ cashFlow, loading }) {
  if (loading) return (
    <div className="fin-cf-card dash-card">
      <div className="fin-section-header">
        <h3 className="fin-section-title">Cash Flow</h3>
      </div>
      <div className="fin-loading-row" aria-label="Loading cash flow data">Loading…</div>
    </div>
  );
  if (!cashFlow) return null;

  const { cashIn, cashOut, netCashFlow } = cashFlow;

  return (
    <div className="fin-cf-card dash-card">
      <div className="fin-section-header">
        <h3 className="fin-section-title">Cash Flow</h3>
        <span className="fin-section-sub">Period summary</span>
      </div>
      <div className="fin-cf-body">
        <div className="fin-cf-row fin-cf-row--in">
          <span className="fin-cf-row-label">Cash In</span>
          <span className="fin-cf-row-value">
            {cashIn.status === 'ok' ? fmtMoney(cashIn.value, false) : <span className="fin-unavail-badge">—</span>}
          </span>
        </div>
        {cashIn.status === 'ok' && cashIn.breakdown && (
          <div className="fin-cf-breakdown">
            <span>Invoices: {fmtMoney(cashIn.breakdown.invoices, false)}</span>
            {cashIn.breakdown.deposits > 0 && (
              <span>Deposits: {fmtMoney(cashIn.breakdown.deposits, false)}</span>
            )}
          </div>
        )}
        <div className="fin-cf-divider" />
        <div className="fin-cf-row fin-cf-row--out">
          <span className="fin-cf-row-label">Cash Out</span>
          <span className="fin-cf-row-value fin-unavail-badge">Not connected</span>
        </div>
        <div className="fin-cf-row fin-cf-row--net">
          <span className="fin-cf-row-label">Net Cash Flow</span>
          <span className="fin-cf-row-value fin-unavail-badge">Not connected</span>
        </div>
      </div>
      <div className="fin-cf-cta">
        Connect banking or expense tracking to see Cash Out and Net Cash Flow.
      </div>
    </div>
  );
}

function PnlSummary({ pnl, loading }) {
  const [expanded, setExpanded] = useState(true);

  if (loading) return (
    <div className="fin-pnl-card rov-ws-section">
      <div className="fin-section-header rov-ws-section-header">
        <h3 className="fin-section-title rov-ws-section-title">P&amp;L Summary</h3>
      </div>
      <div className="fin-loading-row" aria-label="Loading P&L data">Loading…</div>
    </div>
  );
  if (!pnl) return null;

  const separator = ['netRevenue', 'grossMargin', 'operatingProfit', 'netMargin'];

  return (
    <div className="fin-pnl-card rov-ws-section">
      <div
        className="fin-section-header rov-ws-section-header"
        style={{ cursor: 'pointer' }}
        onClick={() => setExpanded(x => !x)}
        aria-expanded={expanded}
        role="button"
        aria-label={expanded ? 'Collapse P&L Summary' : 'Expand P&L Summary'}
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setExpanded(x => !x); }}
      >
        <h3 className="fin-section-title rov-ws-section-title">P&amp;L Summary</h3>
        <span className="fin-pnl-toggle">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="fin-pnl-body">
          <table className="fin-pnl-table" aria-label="Profit and loss summary">
            <tbody>
              {pnl.rows.map(row => (
                <React.Fragment key={row.key}>
                  {separator.includes(row.key) && <tr className="fin-pnl-sep-row" aria-hidden="true"><td colSpan={2} /></tr>}
                  <tr className={`fin-pnl-row${row.status === 'unavailable' ? ' fin-pnl-row--unavail' : ''}${['netRevenue', 'grossProfit', 'operatingProfit', 'netProfit'].includes(row.key) ? ' fin-pnl-row--subtotal' : ''}`}>
                    <td className="fin-pnl-row-label">{row.label}</td>
                    <td className="fin-pnl-row-value">
                      {row.status === 'unavailable'
                        ? <span className="fin-unavail-badge">Unavailable</span>
                        : row.key.includes('Margin') || row.key === 'netMargin' || row.key === 'grossMargin'
                          ? fmtPct(row.value)
                          : fmtMoney(row.value, false)}
                    </td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>

          {pnl.setupGuide && (
            <div className="fin-pnl-setup">
              <div className="fin-pnl-setup-title">{pnl.setupGuide.title}</div>
              <ol className="fin-pnl-setup-steps">
                {pnl.setupGuide.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuarterlySection({ quarterly, loading }) {
  const QUARTER_KEYS   = ['Q1', 'Q2', 'Q3', 'Q4', 'year'];
  const QUARTER_LABELS = { Q1: 'Q1', Q2: 'Q2', Q3: 'Q3', Q4: 'Q4', year: 'Full Year' };

  if (loading) return (
    <div className="rov-ws-section">
      <div className="rov-ws-section-header">
        <h3 className="rov-ws-section-title">Quarterly Review</h3>
      </div>
      <div className="fin-loading-row" aria-label="Loading quarterly data">Loading…</div>
    </div>
  );
  if (!quarterly) return null;

  const q = quarterly.quarters || {};

  function GrowthSpan({ val }) {
    if (val == null) return <span className="rov-q-growth-none">—</span>;
    const cls = val >= 0 ? 'rov-q-growth-pos' : 'rov-q-growth-neg';
    return <span className={cls}>{val >= 0 ? '+' : ''}{val.toFixed(1)}%</span>;
  }

  return (
    <div className="rov-ws-section">
      <div className="rov-ws-section-header">
        <h3 className="rov-ws-section-title">Quarterly Review — {quarterly.year}</h3>
        {quarterly.calculatedAt && (
          <span className="rov-ws-section-sub">
            Updated {new Date(quarterly.calculatedAt).toLocaleTimeString()}
          </span>
        )}
      </div>
      <div className="rov-quarterly-table-wrap">
        <table className="rov-q-table" aria-label={`Quarterly financial review ${quarterly.year}`}>
          <thead>
            <tr>
              <th>Metric</th>
              {QUARTER_KEYS.map(k => <th key={k}>{QUARTER_LABELS[k]}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr className="rov-q-section-row"><td colSpan={6}>Revenue</td></tr>
            <tr>
              <td>Earned Revenue</td>
              {QUARTER_KEYS.map(k => <td key={k}>{q[k]?.earnedRevenue != null ? fmtMoney(q[k].earnedRevenue, false) : '—'}</td>)}
            </tr>
            <tr>
              <td>Collected Revenue</td>
              {QUARTER_KEYS.map(k => <td key={k}>{q[k]?.collectedRevenue != null ? fmtMoney(q[k].collectedRevenue, false) : '—'}</td>)}
            </tr>
            <tr>
              <td>Avg Ticket</td>
              {QUARTER_KEYS.map(k => <td key={k}>{q[k]?.avgTicket != null ? fmtMoney(q[k].avgTicket, false) : '—'}</td>)}
            </tr>
            <tr>
              <td>QoQ Growth</td>
              {QUARTER_KEYS.map(k => (
                <td key={k}>
                  {k === 'year'
                    ? <span className="rov-q-growth-none">—</span>
                    : <GrowthSpan val={q[k]?.qoqGrowth} />}
                </td>
              ))}
            </tr>
            <tr>
              <td>YoY Growth</td>
              {QUARTER_KEYS.map(k => <td key={k}><GrowthSpan val={q[k]?.yoyGrowth} /></td>)}
            </tr>
            <tr className="rov-q-section-row">
              <td colSpan={6}>Profitability — Requires accounting integration</td>
            </tr>
            {[['COGS','cogs'],['Gross Profit','grossProfit'],['Gross Margin','grossMargin'],
              ['Operating Expenses','operatingExpenses'],['Operating Profit','operatingProfit'],
              ['Net Profit','netProfit'],['Net Margin','netMargin'],
              ['Refunds & Credits','refunds'],['Merchant Fees','merchantFees']].map(([label]) => (
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
    </div>
  );
}

function IntegrationCTACard({ providers }) {
  if (!providers || providers.length === 0) return null;

  const PROVIDER_INFO = {
    quickbooks: { icon: '📊', desc: 'Import COGS, expenses, and full P&L data.' },
    xero:       { icon: '📊', desc: 'Import COGS, expenses, and full P&L data.' },
    banking:    { icon: '🏦', desc: 'Track cash flows and reconcile deposits.' },
    stripe:     { icon: '💳', desc: 'Import transactions, merchant fees, and refunds.' },
  };

  const highlighted = providers.filter(p => ['quickbooks', 'banking', 'stripe'].includes(p.key));

  return (
    <div className="fin-integrations-card rov-ws-section">
      <div className="fin-section-header rov-ws-section-header">
        <h3 className="fin-section-title rov-ws-section-title">Connect to Unlock Full Financials</h3>
        <span className="rov-ws-section-sub">No integrations active</span>
      </div>
      <div className="fin-integrations-grid">
        {highlighted.map(p => {
          const info = PROVIDER_INFO[p.key] || {};
          return (
            <div key={p.key} className="fin-int-card">
              <div className="fin-int-header">
                <span className="fin-int-name">{p.label}</span>
                <span className="fin-int-status-badge">Not connected</span>
              </div>
              <div className="fin-int-desc">{info.desc}</div>
              <div className="fin-int-capabilities">
                {p.capabilities.map(c => (
                  <span key={c} className="fin-int-cap">{c.replace(/_/g, ' ')}</span>
                ))}
              </div>
              <button className="fin-int-connect-btn btn-secondary" disabled aria-label={`Connect ${p.label} (coming soon)`}>
                Coming soon
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DataQualityBanner({ dataQuality }) {
  if (!dataQuality || dataQuality.state !== 'partial') return null;

  const warnings = dataQuality.limitations.filter(l => l.severity === 'warning');
  if (warnings.length === 0) return null;

  return (
    <div className="fin-dq-banner" role="note" aria-label="Data quality notice">
      <span className="fin-dq-icon">⚠</span>
      <span className="fin-dq-text">
        {warnings.length} data source{warnings.length !== 1 ? 's' : ''} not connected —
        some financial metrics are unavailable.
      </span>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function FinancialsWorkspace({ filterStart, filterEnd, comparison }) {
  const { data, loading, error } = useFinData({
    start:      filterStart,
    end:        filterEnd,
    comparison: comparison || 'none',
  });

  if (error) return (
    <div className="rov-ws-body">
      <div className="dash-card" style={{ padding: '1.5rem', color: 'var(--red)', fontSize: 14 }}>
        {error}
      </div>
    </div>
  );

  const kpis      = data?.kpis;
  const arAging   = data?.arAging;
  const cashFlow  = data?.cashFlow;
  const pnl       = data?.pnl;
  const quarterly = data?.quarterly;
  const providers = data?.providers;
  const dq        = data?.dataQuality;

  return (
    <div className="rov-ws-body">

      {/* Data quality banner */}
      <DataQualityBanner dataQuality={dq} />

      {/* KPI row */}
      <div className="fin-kpi-row" role="region" aria-label="Financial KPIs">
        <FinKpiCard
          label="Gross Revenue"
          value={kpis?.grossRevenue?.value}
          status={loading ? 'loading' : (kpis?.grossRevenue?.status || 'ok')}
          breakdown={kpis?.grossRevenue?.breakdown}
        />
        <FinKpiCard
          label="Cash In"
          value={kpis?.cashIn?.value}
          status={loading ? 'loading' : (kpis?.cashIn?.status || 'ok')}
          breakdown={kpis?.cashIn?.breakdown}
        />
        <FinKpiCard
          label="Gross Profit"
          value={null}
          status="unavailable"
          missingSource="Connect accounting software"
        />
        <FinKpiCard
          label="Net Profit"
          value={null}
          status="unavailable"
          missingSource="Connect accounting software"
        />
        <FinKpiCard
          label="Net Margin"
          value={null}
          status="unavailable"
          missingSource="Connect accounting software"
        />
      </div>

      {/* AR Aging + Cash Flow side by side */}
      <div className="fin-lower-grid">
        <ARAgingCard arAging={arAging} loading={loading} />
        <CashFlowCard cashFlow={cashFlow} loading={loading} />
      </div>

      {/* P&L Summary */}
      <PnlSummary pnl={pnl} loading={loading} />

      {/* Quarterly Review */}
      <QuarterlySection quarterly={quarterly} loading={loading} />

      {/* Integration CTAs */}
      <IntegrationCTACard providers={providers} />

    </div>
  );
}
