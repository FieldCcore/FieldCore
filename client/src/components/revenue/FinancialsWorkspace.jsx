import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../api';
import RevenueKpiCard from '../RevenueKpiCard';
import SelectDropdown from '../SelectDropdown';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Presentation formatter for financial capability keys.
const CAPABILITY_LABELS = {
  revenue:              'Revenue',
  invoices:             'Invoices',
  ar:                   'AR',
  jobs:                 'Jobs',
  customers:            'Customers',
  service_revenue:      'Service Revenue',
  payments:             'Payments',
  deposits:             'Deposits',
  cash_in:              'Cash In',
  refunds:              'Refunds',
  processing_fees:      'Processing Fees',
  disputes:             'Disputes',
  payouts:              'Payouts',
  cogs:                 'COGS',
  operating_expenses:   'Operating Expenses',
  taxes:                'Taxes',
  vendor_expenses:      'Vendor Expenses',
  account_mapping:      'Account Mapping',
  reconciliation:       'Reconciliation',
  bank_balances:        'Bank Balances',
  cash_transactions:    'Cash Transactions',
  cash_out:             'Cash Out',
  external_deposits:    'External Deposits',
  merchant_fees:        'Merchant Fees',
};

function formatCapabilityLabel(key) {
  if (CAPABILITY_LABELS[key]) return CAPABILITY_LABELS[key];
  // Fallback: capitalize each word
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fmtMoney(v, compact = false) {
  if (v == null) return '—';
  const n = parseFloat(v) || 0;
  if (compact) {
    if (Math.abs(n) >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
    if (Math.abs(n) >= 1000)    return '$' + (n / 1000).toFixed(1) + 'k';
    return '$' + n.toFixed(0);
  }
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(v) {
  if (v == null) return '—';
  return (parseFloat(v) || 0).toFixed(1) + '%';
}

function fmtDays(v) {
  if (v == null) return '—';
  return Math.round(parseFloat(v)) + ' days';
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
  return { data, loading, error, refetch: fetch };
}

// ── KPI Row ───────────────────────────────────────────────────────────────────

function FinKpiRow({ kpis, loading, calculatedAt }) {
  if (!kpis && !loading) return null;

  function fmtKpi(metric) {
    if (!metric) return null;
    if (metric.status === 'ok' && metric.value != null) return fmtMoney(metric.value, true);
    return null;
  }

  const gr = kpis?.grossRevenue;

  return (
    <div className="fin-kpi-row" role="region" aria-label="Financial KPIs">
      <RevenueKpiCard
        label="Gross Revenue"
        value={fmtKpi(gr)}
        status={loading ? 'loading' : (gr?.status || 'ok')}
        calculatedAt={calculatedAt}
        provenance={gr?.provenance}
        isLoading={loading}
        size="primary"
        note={gr?.breakdown?.jobCount > 0 ? `${gr.breakdown.jobCount} completed job(s)` : undefined}
      />
      <RevenueKpiCard
        label="Gross Profit"
        value={null}
        status={loading ? 'loading' : 'unavailable'}
        calculatedAt={calculatedAt}
        provenance={kpis?.grossProfit?.provenance}
        isLoading={loading}
        size="primary"
      />
      <RevenueKpiCard
        label="Net Profit"
        value={null}
        status={loading ? 'loading' : 'unavailable'}
        calculatedAt={calculatedAt}
        provenance={kpis?.netProfit?.provenance}
        isLoading={loading}
        size="primary"
      />
      <RevenueKpiCard
        label="Net Margin"
        value={null}
        status={loading ? 'loading' : 'unavailable'}
        calculatedAt={calculatedAt}
        provenance={kpis?.netMargin?.provenance}
        isLoading={loading}
        size="primary"
      />
      <RevenueKpiCard
        label="Operating Expenses"
        value={null}
        status={loading ? 'loading' : 'unavailable'}
        calculatedAt={calculatedAt}
        provenance={kpis?.operatingExpenses?.provenance}
        isLoading={loading}
        size="primary"
      />
    </div>
  );
}

// ── Financial Coverage Chip ───────────────────────────────────────────────────

function FinancialCoverageChip({ coverage, loading }) {
  const [open, setOpen] = useState(false);
  if (loading || !coverage) return null;

  const { coverageState, availableMetrics, partialMetrics, unavailableMetrics, optionalSources } = coverage;

  const colorMap = {
    complete: 'var(--green)',
    strong:   'var(--green)',
    partial:  'var(--yellow-dk, #B45309)',
    limited:  'var(--red)',
  };
  const color = colorMap[coverageState] || 'var(--yellow-dk, #B45309)';
  const stateLabel = coverageState
    ? coverageState.charAt(0).toUpperCase() + coverageState.slice(1)
    : 'Unknown';

  return (
    <div className="fin-coverage-wrap" style={{ position: 'relative' }}>
      <button
        type="button"
        className="rov-dq-btn"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label={`Financial coverage: ${stateLabel}`}
      >
        <span className="rov-dq-dot" style={{ background: color }} aria-hidden="true" />
        <span className="rov-dq-label">Financial Coverage: {stateLabel}</span>
      </button>
      {open && (
        <div
          className="rov-dq-panel fin-coverage-panel"
          role="dialog"
          aria-label="Financial coverage details"
          style={{ position: 'absolute', top: '100%', right: 0, zIndex: 100, marginTop: 6 }}
        >
          <div className="rov-dq-panel-title">Financial Coverage</div>

          {availableMetrics?.length > 0 && (
            <>
              <div className="fin-coverage-section">Available</div>
              <ul className="rov-dq-panel-list">
                {availableMetrics.map(m => (
                  <li key={m.key} className="rov-dq-panel-item">
                    <span className="fin-cov-dot fin-cov-dot--avail" aria-hidden="true" />
                    {m.label}
                  </li>
                ))}
              </ul>
            </>
          )}

          {partialMetrics?.length > 0 && (
            <>
              <div className="fin-coverage-section">Partial</div>
              <ul className="rov-dq-panel-list">
                {partialMetrics.map(m => (
                  <li key={m.key} className="rov-dq-panel-item">
                    <span className="fin-cov-dot fin-cov-dot--partial" aria-hidden="true" />
                    <span>{m.label}{m.note ? ` — ${m.note}` : ''}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {unavailableMetrics?.length > 0 && (
            <>
              <div className="fin-coverage-section">Unavailable</div>
              <ul className="rov-dq-panel-list">
                {unavailableMetrics.map(m => (
                  <li key={m.key} className="rov-dq-panel-item fin-cov-item--unavail">
                    <span className="fin-cov-dot fin-cov-dot--unavail" aria-hidden="true" />
                    {m.label}
                  </li>
                ))}
              </ul>
            </>
          )}

          {optionalSources?.length > 0 && (
            <div className="fin-coverage-hint">
              Connect {optionalSources.map(s => s.providerLabel).join(' or ')} to unlock more metrics.
            </div>
          )}

          <button
            type="button"
            className="rov-dq-close"
            onClick={() => setOpen(false)}
            aria-label="Close coverage details"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

// ── AR Aging Card ─────────────────────────────────────────────────────────────

function ARAgingCard({ arAging, loading }) {
  if (loading) return (
    <div className="fin-ar-card dash-card">
      <div className="fin-section-header">
        <h3 className="fin-section-title">Accounts Receivable</h3>
      </div>
      <div className="fin-loading-row" aria-label="Loading AR aging data">Loading…</div>
    </div>
  );
  if (!arAging) return null;

  const max = Math.max(...arAging.buckets.map(b => b.amount), 1);

  return (
    <div className="fin-ar-card dash-card">
      <div className="fin-section-header">
        <h3 className="fin-section-title">Accounts Receivable</h3>
        <span className="fin-section-sub">
          {arAging.invoiceCount} pending invoice{arAging.invoiceCount !== 1 ? 's' : ''} · {fmtMoney(arAging.total, false)} total
        </span>
      </div>
      <div className="fin-ar-stats-row">
        {arAging.overdueTotal > 0 && (
          <span className="fin-ar-stat fin-ar-stat--overdue">
            {fmtMoney(arAging.overdueTotal, false)} overdue
          </span>
        )}
        {arAging.avgDaysToPay != null && (
          <span className="fin-ar-stat">
            Avg. {fmtDays(arAging.avgDaysToPay)} to pay
          </span>
        )}
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
      <div className="fin-ar-note">
        Due date proxy: net-30 from sent date. Set explicit due dates for accuracy.
      </div>
    </div>
  );
}

// ── Cash Flow Card ────────────────────────────────────────────────────────────

function CashFlowMetricRow({ label, value, status, supportingText, emphasis }) {
  const isAvailable = status === 'ok' && value != null;
  return (
    <div className={`fin-cf-metric-row${emphasis ? ' fin-cf-metric-row--emphasis' : ''}`}>
      <div className="fin-cf-metric-left">
        <span className="fin-cf-metric-label">{label}</span>
        {supportingText && (
          <span className="fin-cf-metric-support">{supportingText}</span>
        )}
      </div>
      <span className={isAvailable ? 'fin-cf-metric-amount' : 'fin-cf-metric-unavail'}>
        {isAvailable ? fmtMoney(value, false) : 'Unavailable'}
      </span>
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

  let cashInSupport = null;
  if (cashIn.status === 'ok' && cashIn.breakdown) {
    const parts = [`Invoices: ${fmtMoney(cashIn.breakdown.invoices, false)}`];
    if (cashIn.breakdown.deposits > 0) {
      parts.push(`Deposits: ${fmtMoney(cashIn.breakdown.deposits, false)}`);
    }
    cashInSupport = parts.join(' · ');
  }

  return (
    <div className="fin-cf-card dash-card">
      <div className="fin-section-header">
        <h3 className="fin-section-title">Cash Flow</h3>
        <span className="fin-section-sub">Period summary</span>
      </div>
      <div className="fin-cf-rows">
        <CashFlowMetricRow
          label="Cash In"
          value={cashIn.value}
          status={cashIn.status}
          supportingText={cashInSupport}
        />
        <CashFlowMetricRow
          label="Cash Out"
          value={cashOut?.value}
          status={cashOut?.status}
        />
        <CashFlowMetricRow
          label="Net Cash Flow"
          value={netCashFlow?.value}
          status={netCashFlow?.status}
          emphasis
        />
      </div>
      {(cashOut?.status !== 'ok' || netCashFlow?.status !== 'ok') && (
        <div className="fin-cf-footer">
          Cash In is available from FieldCore Payments. Connect accounting or banking to track outgoing cash.
        </div>
      )}
    </div>
  );
}

// ── P&L Summary ───────────────────────────────────────────────────────────────

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
                        : row.key === 'grossMargin' || row.key === 'netMargin'
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

// ── Quarterly Review ──────────────────────────────────────────────────────────

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
                  {k === 'year' ? <span className="rov-q-growth-none">—</span> : <GrowthSpan val={q[k]?.qoqGrowth} />}
                </td>
              ))}
            </tr>
            <tr>
              <td>YoY Growth</td>
              {QUARTER_KEYS.map(k => <td key={k}><GrowthSpan val={q[k]?.yoyGrowth} /></td>)}
            </tr>
            <tr className="rov-q-section-row">
              <td colSpan={6}>Profitability — Requires direct cost data</td>
            </tr>
            {[['Gross Profit','grossProfit'],['Gross Margin','grossMargin'],
              ['Operating Expenses','operatingExpenses'],['Net Profit','netProfit'],['Net Margin','netMargin']].map(([label]) => (
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

// ── Quarterly Comparison Chart ────────────────────────────────────────────────

const Q_CHART_METRICS = [
  { value: 'earnedRevenue', label: 'Revenue' },
];

function QuarterlyComparisonChart({ quarterly, loading }) {
  const [metric, setMetric] = useState('earnedRevenue');

  const METRIC_OPTS = [
    { value: 'earnedRevenue', label: 'Revenue' },
    { value: 'grossProfit',   label: 'Gross Profit'   },
    { value: 'netProfit',     label: 'Net Profit'     },
    { value: 'opex',          label: 'Operating Exp.' },
  ];

  if (loading) return (
    <div className="rov-ws-section">
      <div className="rov-ws-section-header">
        <h3 className="rov-ws-section-title">Quarterly Comparison</h3>
      </div>
      <div className="fin-loading-row">Loading…</div>
    </div>
  );
  if (!quarterly) return null;

  const PROFIT_METRICS = ['grossProfit', 'netProfit', 'opex'];
  const isProfitMetric = PROFIT_METRICS.includes(metric);
  const quarters       = ['Q1', 'Q2', 'Q3', 'Q4'];
  const q              = quarterly.quarters || {};

  const values = isProfitMetric
    ? quarters.map(() => null)
    : quarters.map(k => parseFloat(q[k]?.[metric]) || 0);

  const maxVal = Math.max(...values.filter(v => v != null), 1);

  const BAR_COLOR = '#1C2333';

  return (
    <div className="rov-ws-section">
      <div className="rov-ws-section-header">
        <h3 className="rov-ws-section-title">Quarterly Comparison</h3>
        <SelectDropdown
          value={metric}
          onChange={setMetric}
          options={METRIC_OPTS}
          minWidth={170}
        />
      </div>

      {isProfitMetric ? (
        <div className="fin-chart-unavail-state">
          <div className="fin-chart-unavail-icon" aria-hidden="true">—</div>
          <div className="fin-chart-unavail-msg">
            {METRIC_OPTS.find(m => m.value === metric)?.label} requires an accounting integration.
          </div>
          <div className="fin-chart-unavail-hint">Connect an accounting integration to unlock this chart.</div>
        </div>
      ) : (
        <div className="fin-q-chart" role="img" aria-label="Quarterly comparison chart">
          <div className="fin-q-chart-bars">
            {quarters.map((qk, i) => {
              const val = values[i] || 0;
              const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
              return (
                <div key={qk} className="fin-q-chart-col">
                  <div className="fin-q-chart-bar-wrap">
                    <div
                      className="fin-q-chart-bar"
                      style={{ height: `${Math.max(pct, val > 0 ? 4 : 0)}%`, background: BAR_COLOR }}
                      aria-label={`${qk}: ${fmtMoney(val, false)}`}
                    />
                  </div>
                  <div className="fin-q-chart-val">{val > 0 ? fmtMoney(val, true) : '—'}</div>
                  <div className="fin-q-chart-lbl">{qk}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Profit Trend ──────────────────────────────────────────────────────────────

const PROFIT_TREND_METRICS = [
  { value: 'grossProfit', label: 'Gross Profit'  },
  { value: 'netProfit',   label: 'Net Profit'    },
  { value: 'grossMargin', label: 'Gross Margin'  },
  { value: 'netMargin',   label: 'Net Margin'    },
];

const PROFIT_TREND_INTERVALS = [
  { value: 'daily',     label: 'Daily'     },
  { value: 'weekly',    label: 'Weekly'    },
  { value: 'monthly',   label: 'Monthly'   },
  { value: 'quarterly', label: 'Quarterly' },
];

function ProfitTrendChart({ loading }) {
  const [metric,   setMetric]   = useState('grossProfit');
  const [interval, setInterval] = useState('monthly');

  return (
    <div className="rov-ws-section">
      <div className="rov-ws-section-header">
        <h3 className="rov-ws-section-title">Profit Trend</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <SelectDropdown
            value={metric}
            onChange={setMetric}
            options={PROFIT_TREND_METRICS}
            minWidth={150}
          />
          <SelectDropdown
            value={interval}
            onChange={setInterval}
            options={PROFIT_TREND_INTERVALS}
            minWidth={120}
          />
        </div>
      </div>
      {loading ? (
        <div className="fin-loading-row">Loading…</div>
      ) : (
        <div className="fin-chart-unavail-state">
          <div className="fin-chart-unavail-icon" aria-hidden="true">—</div>
          <div className="fin-chart-unavail-msg">
            {PROFIT_TREND_METRICS.find(m => m.value === metric)?.label} requires an accounting integration.
          </div>
          <div className="fin-chart-unavail-hint">
            Connect an accounting integration to track profit trends over time.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Expense Breakdown ─────────────────────────────────────────────────────────

function ExpenseBreakdown({ loading }) {
  return (
    <div className="rov-ws-section">
      <div className="rov-ws-section-header">
        <h3 className="rov-ws-section-title">Expense Breakdown</h3>
      </div>
      {loading ? (
        <div className="fin-loading-row">Loading…</div>
      ) : (
        <div className="fin-chart-unavail-state">
          <div className="fin-chart-unavail-icon" aria-hidden="true">—</div>
          <div className="fin-chart-unavail-msg">No expense source connected.</div>
          <div className="fin-chart-unavail-hint">
            Connect an accounting or expense integration to see a breakdown of COGS,
            operating expenses, and other costs.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Revenue → Profit Waterfall ────────────────────────────────────────────────

function ProfitWaterfall({ kpis, loading }) {
  if (loading) return (
    <div className="rov-ws-section">
      <div className="rov-ws-section-header">
        <h3 className="rov-ws-section-title">Revenue → Profit Waterfall</h3>
      </div>
      <div className="fin-loading-row">Loading…</div>
    </div>
  );

  const grossRev = kpis?.grossRevenue?.status === 'ok' ? (parseFloat(kpis.grossRevenue.value) || 0) : 0;
  const hasRevenue = grossRev > 0;

  const steps = [
    { label: 'Gross Revenue',       value: grossRev,  available: true  },
    { label: 'COGS',                value: null,       available: false },
    { label: 'Gross Profit',        value: null,       available: false },
    { label: 'Operating Expenses',  value: null,       available: false },
    { label: 'Net Profit',          value: null,       available: false },
  ];

  return (
    <div className="rov-ws-section">
      <div className="rov-ws-section-header">
        <h3 className="rov-ws-section-title">Revenue → Profit Waterfall</h3>
      </div>
      <div className="fin-waterfall" role="img" aria-label="Revenue to profit waterfall">
        {steps.map((step, i) => {
          const pct = hasRevenue && step.available && step.value
            ? Math.max(6, (step.value / grossRev) * 100)
            : 0;
          const isLast = i === steps.length - 1;
          return (
            <div key={step.label} className="fin-wf-step">
              <div className="fin-wf-label">{step.label}</div>
              <div className="fin-wf-bar-row">
                {step.available ? (
                  <div
                    className="fin-wf-bar fin-wf-bar--filled"
                    style={{ width: `${Math.max(pct, hasRevenue ? 100 : 0)}%` }}
                    aria-label={`${step.label}: ${fmtMoney(step.value, false)}`}
                  />
                ) : (
                  <div className="fin-wf-bar fin-wf-bar--unavail" aria-label={`${step.label}: Unavailable`} />
                )}
              </div>
              <div className="fin-wf-value">
                {step.available
                  ? fmtMoney(step.value, false)
                  : <span className="fin-unavail-badge">Unavailable</span>}
              </div>
              {!isLast && <div className="fin-wf-arrow" aria-hidden="true">↓</div>}
            </div>
          );
        })}
      </div>
      <div className="fin-wf-note">
        COGS, Gross Profit, Operating Expenses, and Net Profit require an accounting integration.
      </div>
    </div>
  );
}

// ── Financial Data Sources ────────────────────────────────────────────────────

const STATUS_BADGE = {
  active:           { label: 'Active',                    className: 'fin-src-badge--active'      },
  degraded:         { label: 'Degraded',                  className: 'fin-src-badge--degraded'    },
  not_enabled:      { label: 'Not Enabled',               className: 'fin-src-badge--not-enabled' },
  not_connected:    { label: 'Optional',                  className: 'fin-src-badge--optional'    },
  connected:        { label: 'Connected',                 className: 'fin-src-badge--active'      },
  syncing:          { label: 'Syncing',                   className: 'fin-src-badge--active'      },
  sync_error:       { label: 'Sync Error',                className: 'fin-src-badge--degraded'    },
  reauth_required:  { label: 'Reauthorization Required',  className: 'fin-src-badge--degraded'    },
};

// Initiates QuickBooks OAuth flow by fetching the authorization URL from the backend.
async function initiateQBConnect(e) {
  e.currentTarget.disabled = true;
  try {
    const res  = await import('../../api').then(m => m.default.get('/integrations/accounting/quickbooks/connect'));
    window.location.href = res.data.url;
  } catch (err) {
    const msg = err?.response?.data?.error || 'Failed to start QuickBooks connection.';
    alert(msg);
    e.currentTarget.disabled = false;
  }
}

function fmtSyncTime(iso) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.round((now - d) / 60000);
  if (diffMin < 2)   return 'Just now';
  if (diffMin < 60)  return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24)    return `${diffH}h ago`;
  return d.toLocaleDateString();
}

function SrcCard({ src, showConnect, onSyncNow, onDisconnect }) {
  const badge = STATUS_BADGE[src.status] || STATUS_BADGE.not_connected;
  const info  = src.connectionInfo;
  const isAccountingConnected = src.sourceKey === 'accounting' && info;

  return (
    <div className={`fin-src-card fin-src-card--${src.status}`}>
      <div className="fin-src-header">
        <span className="fin-src-name">{src.providerLabel}</span>
        <span className={`fin-src-badge ${badge.className}`}>{badge.label}</span>
      </div>

      {isAccountingConnected && info.companyName && (
        <div className="fin-src-company">{info.companyName}</div>
      )}

      {isAccountingConnected && (
        <div className="fin-src-sync-row">
          <span className="fin-src-sync-label">Last sync</span>
          <span className="fin-src-sync-value">{fmtSyncTime(info.lastSuccessfulSyncAt)}</span>
        </div>
      )}

      {isAccountingConnected && info.unmappedAccountCount > 0 && (
        <div className="fin-src-warn">
          {info.unmappedAccountCount} account{info.unmappedAccountCount !== 1 ? 's' : ''} need mapping
        </div>
      )}

      {isAccountingConnected && info.lastErrorCode && (
        <div className="fin-src-error">{info.lastErrorMessageSafe}</div>
      )}

      <div className="fin-src-capabilities">
        {src.capabilities.slice(0, 7).map(c => (
          <span key={c} className="fin-int-cap">{formatCapabilityLabel(c)}</span>
        ))}
      </div>

      {src.status === 'not_enabled' && src.paymentsStatus?.limitations?.[0] && (
        <div className="fin-src-note">{src.paymentsStatus.limitations[0]}</div>
      )}

      {isAccountingConnected && (
        <div className="fin-src-actions">
          {onSyncNow && (
            <button
              className="fin-src-action-btn"
              onClick={onSyncNow}
              aria-label="Sync QuickBooks now"
            >
              Sync Now
            </button>
          )}
          {onDisconnect && (
            <button
              className="fin-src-action-btn fin-src-action-btn--danger"
              onClick={onDisconnect}
              aria-label="Disconnect QuickBooks"
            >
              Disconnect
            </button>
          )}
        </div>
      )}

      {showConnect && src.sourceKey === 'accounting' && (
        src.canConnect
          ? (
            <button
              className="fin-int-connect-btn btn-secondary"
              onClick={initiateQBConnect}
              aria-label="Connect QuickBooks Online"
            >
              Connect QuickBooks
            </button>
          ) : (
            <button
              className="fin-int-connect-btn btn-secondary"
              disabled
              aria-label={`Connect ${src.providerLabel} (coming soon)`}
            >
              Coming soon
            </button>
          )
      )}

      {showConnect && src.sourceKey !== 'accounting' && (
        <button
          className="fin-int-connect-btn btn-secondary"
          disabled
          aria-label={`Connect ${src.providerLabel} (coming soon)`}
        >
          Coming soon
        </button>
      )}
    </div>
  );
}

function FinancialDataSources({ coverage, onCoverageRefresh }) {
  if (!coverage) return null;
  const { activeSources, notEnabledSources, optionalSources } = coverage;

  const featuredActive = (activeSources || []).filter(s => s.sourceKey !== 'fieldcore_core');
  const coreSource     = (activeSources || []).find(s => s.sourceKey === 'fieldcore_core');
  const activeCount    = (activeSources || []).length;
  const optionalCount  = (optionalSources || []).length;

  async function handleQBSync() {
    try {
      await import('../../api').then(m => m.default.post('/integrations/accounting/quickbooks/sync'));
      setTimeout(() => onCoverageRefresh?.(), 3000);
    } catch (err) {
      alert(err?.response?.data?.error || 'Sync failed.');
    }
  }

  async function handleQBDisconnect() {
    if (!window.confirm('Disconnect QuickBooks Online? Your imported data will be retained.')) return;
    try {
      await import('../../api').then(m => m.default.post('/integrations/accounting/quickbooks/disconnect'));
      onCoverageRefresh?.();
    } catch (err) {
      alert(err?.response?.data?.error || 'Disconnect failed.');
    }
  }

  function getAccountingHandlers(src) {
    if (src.sourceKey !== 'accounting' || !src.connectionInfo) return {};
    return { onSyncNow: handleQBSync, onDisconnect: handleQBDisconnect };
  }

  return (
    <div className="fin-sources-card rov-ws-section">
      <div className="fin-section-header rov-ws-section-header">
        <h3 className="fin-section-title rov-ws-section-title">Financial Data Sources</h3>
        <span className="rov-ws-section-sub">
          {activeCount} active · {optionalCount} optional
        </span>
      </div>

      {coreSource && (
        <div className="fin-core-chip" title={`Capabilities: ${coreSource.capabilities.join(', ')}`}>
          <span className="fin-cov-dot fin-cov-dot--avail" aria-hidden="true" />
          FieldCore Core Data — Active
        </div>
      )}

      <div className="fin-sources-grid">
        {featuredActive.map(src => (
          <SrcCard key={src.sourceKey} src={src} showConnect={false} {...getAccountingHandlers(src)} />
        ))}
        {(notEnabledSources || []).map(src => (
          <SrcCard key={src.sourceKey} src={src} showConnect={false} />
        ))}
        {(optionalSources || []).map(src => (
          <SrcCard key={src.sourceKey} src={src} showConnect={true} {...getAccountingHandlers(src)} />
        ))}
      </div>

      <div className="fin-sources-footer">
        FieldCore uses the financial data already available in your account. Additional connections
        can enrich profit, expense, cash-flow, and reconciliation analytics.
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function FinancialsWorkspace({ filterStart, filterEnd, comparison }) {
  const [qbBanner, setQbBanner] = useState(null);

  const { data, loading, error, refetch } = useFinData({
    start:      filterStart,
    end:        filterEnd,
    comparison: comparison || 'none',
  });

  // After QB OAuth callback, the URL contains ?qb_connected=1.
  // Detect it once on mount: show a success banner, force a coverage refetch,
  // and scrub the param so a page reload doesn't re-trigger it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('qb_connected') !== '1') return;
    setQbBanner('QuickBooks connected successfully.');
    refetch();
    params.delete('qb_connected');
    const qs  = params.toString();
    const url = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
    window.history.replaceState(null, '', url);
    const t = setTimeout(() => setQbBanner(null), 6000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const coverage  = data?.coverage;
  const calcAt    = data?.calculatedAt;

  return (
    <div className="rov-ws-body">

      {qbBanner && (
        <div className="fin-connect-banner" role="status" aria-live="polite">
          {qbBanner}
        </div>
      )}

      {/* Financial Coverage chip */}
      {coverage && !loading && (
        <div className="fin-dq-bar">
          <FinancialCoverageChip coverage={coverage} loading={loading} />
        </div>
      )}

      {/* KPI row */}
      <FinKpiRow kpis={kpis} loading={loading} calculatedAt={calcAt} />

      {/* AR + Cash Flow side by side */}
      <div className="fin-lower-grid">
        <ARAgingCard arAging={arAging} loading={loading} />
        <CashFlowCard cashFlow={cashFlow} loading={loading} />
      </div>

      {/* P&L Summary */}
      <PnlSummary pnl={pnl} loading={loading} />

      {/* Quarterly Review table */}
      <QuarterlySection quarterly={quarterly} loading={loading} />

      {/* Quarterly Comparison Chart */}
      <QuarterlyComparisonChart quarterly={quarterly} loading={loading} />

      {/* Profit Trend Chart */}
      <ProfitTrendChart loading={loading} />

      {/* Expense Breakdown */}
      <ExpenseBreakdown loading={loading} />

      {/* Revenue → Profit Waterfall */}
      <ProfitWaterfall kpis={kpis} loading={loading} />

      {/* Financial Data Sources */}
      <FinancialDataSources coverage={coverage} onCoverageRefresh={refetch} />

    </div>
  );
}
