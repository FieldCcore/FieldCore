// Compact 2×2 KPI grid rendered inside the expanded dispatch sidebar.
// No title attributes — aria-label provides accessibility context.
// Colors match the compact rail's KPI value colors for visual consistency.

const KPI_VALUE_COLORS = {
  liveTechnicians: '#0369A1',
  activeJobs:      'var(--blue)',
  todaysJobs:      'var(--navy)',
  completedToday:  'var(--green)',
  averageResponse: 'var(--amber)',
};

function getValueColor(metric) {
  if (metric.status !== 'active' && metric.status !== 'stale') return 'var(--steel)';
  return KPI_VALUE_COLORS[metric.key] || 'var(--navy)';
}

function MaximizeIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 13, height: 13 }} aria-hidden="true">
      <path
        d="M10 2h4v4M6 14H2v-4M14 2l-5 5M2 14l5-5"
        stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

function KpiTile({ metric, selected, onClick }) {
  const isDimmed = metric.status === 'disabled' || metric.status === 'not_configured';
  const val = (metric.displayValue != null && !Number.isNaN(metric.displayValue))
    ? String(metric.displayValue)
    : (metric.value != null && !Number.isNaN(metric.value) ? String(metric.value) : '—');

  return (
    <button
      type="button"
      className={`sidebar-kpi-tile${selected ? ' selected' : ''}`}
      onClick={() => onClick?.(metric.key)}
      aria-label={`${metric.label}: ${val}`}
      style={{ opacity: isDimmed ? 0.65 : 1 }}
    >
      <div
        className="sidebar-kpi-tile__value"
        style={{ color: selected ? undefined : getValueColor(metric) }}
      >
        {val}
      </div>
      <div className="sidebar-kpi-tile__label">{metric.label}</div>
    </button>
  );
}

export default function DispatchSidebarKpiGrid({
  metrics,
  loading,
  activeKpiKey,
  onKpiClick,
  onEnterFullMap,
}) {
  if (loading) {
    return (
      <div className="sidebar-kpi-grid" aria-label="KPI metrics loading">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="sidebar-kpi-tile__skel" aria-hidden="true" />
        ))}
      </div>
    );
  }

  return (
    <div className="sidebar-kpi-section">
      <div className="sidebar-kpi-grid" role="group" aria-label="Dispatch metrics">
        {metrics.map(m => (
          <KpiTile
            key={m.key}
            metric={m}
            selected={activeKpiKey === m.key}
            onClick={onKpiClick}
          />
        ))}
      </div>
      {onEnterFullMap && (
        <div className="sidebar-kpi-actions">
          <button
            type="button"
            className="sidebar-fullmap-btn"
            onClick={onEnterFullMap}
            aria-label="Enter full map mode"
          >
            <MaximizeIcon />
            Full Map
          </button>
        </div>
      )}
    </div>
  );
}
