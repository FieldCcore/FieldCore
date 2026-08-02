// Collapsed 52px rail — icon buttons, KPI counts, tooltips. No text labels.

function Icon({ d, size = 18 }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      style={{ width: size, height: size, flexShrink: 0 }}
      aria-hidden="true"
    >
      <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Icon paths (16×16 viewBox, stroke-based, matching DispatchMapControls style)
const ICONS = {
  team:      'M8 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-4 5a4 4 0 0 1 8 0',
  jobs:      'M4 6h8v8H4V6zm0 0V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M6 10h4',
  live:      'M2 9c.6-3.4 3.1-6 6-6s5.4 2.6 6 6M4.5 9c.5-2.3 1.9-4 3.5-4s3 1.7 3.5 4M8 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  active:    'M9 2L4 9h4l-1 5 5-7H8l1-5z',
  calendar:  'M3 5h10v9H3V5zm0 0V3h10v2M7 2v2m2-2v2M3 9h10',
  check:     'M2.5 8l3.5 3.5 7-6',
};

const KPI_DEFS = [
  { key: 'liveTechnicians', icon: 'live',     filterTab: 'team', teamFilter: 'live'      },
  { key: 'activeJobs',      icon: 'active',   filterTab: 'jobs', jobFilter:  'active'    },
  { key: 'todaysJobs',      icon: 'calendar', filterTab: 'jobs', jobFilter:  'all'       },
  { key: 'completedToday',  icon: 'check',    filterTab: 'jobs', jobFilter:  'completed' },
];

function RailBtn({ icon, label, title, onClick, active }) {
  return (
    <button
      type="button"
      className={`rail-btn${active ? ' active' : ''}`}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      <Icon d={ICONS[icon]} />
    </button>
  );
}

function RailKpi({ metric, iconKey, title, onClick }) {
  const count = metric
    ? (metric.displayValue ?? (metric.value != null ? String(metric.value) : '—'))
    : '—';

  return (
    <button
      type="button"
      className="rail-kpi"
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      <Icon d={ICONS[iconKey]} size={14} />
      <span className="rail-kpi__count">{count}</span>
    </button>
  );
}

export default function DispatchSidebarRail({
  metrics,
  activeKpiKey,
  onExpandToTeam,
  onExpandToJobs,
  onKpiClick,
}) {
  function getMetric(key) {
    return metrics?.find(m => m.key === key);
  }

  function kpiTitle(key, metric) {
    const count = metric
      ? (metric.displayValue ?? (metric.value != null ? String(metric.value) : '0'))
      : '0';
    const labels = {
      liveTechnicians: `${count} live technician${count === '1' ? '' : 's'}`,
      activeJobs:      `${count} active job${count === '1' ? '' : 's'}`,
      todaysJobs:      `${count} job${count === '1' ? '' : 's'} today`,
      completedToday:  `${count} completed today`,
    };
    return labels[key] || key;
  }

  return (
    <div className="dispatch-sidebar-rail" role="group" aria-label="Dispatch panel (collapsed)">

      {/* Tab navigation */}
      <RailBtn
        icon="team"
        title="Open Team panel"
        onClick={onExpandToTeam}
      />
      <RailBtn
        icon="jobs"
        title="Open Jobs panel"
        onClick={onExpandToJobs}
      />

      <div className="rail-divider" role="separator" />

      {/* KPI counts */}
      {KPI_DEFS.map(({ key, icon, filterTab, teamFilter, jobFilter }) => {
        const metric = getMetric(key);
        return (
          <RailKpi
            key={key}
            metric={metric}
            iconKey={icon}
            title={kpiTitle(key, metric)}
            onClick={() => onKpiClick?.(key)}
          />
        );
      })}
    </div>
  );
}
