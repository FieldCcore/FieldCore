// 96px labeled compact rail — visible labels, no hover-dependent text, no title attributes.

// ── Icon primitives (16×16 viewBox, 1.5px stroke, matching DispatchMapControls style) ──

function Icon({ d, size = 18 }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: size, height: size, flexShrink: 0 }} aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICONS = {
  team:      'M8 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-4 5a4 4 0 0 1 8 0',
  jobs:      'M4 6h8v8H4V6zm0 0V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M6 10h4',
  live:      'M2 9c.6-3.4 3.1-6 6-6s5.4 2.6 6 6M4.5 9c.5-2.3 1.9-4 3.5-4s3 1.7 3.5 4M8 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  active:    'M9 2L4 9h4l-1 5 5-7H8l1-5z',
  calendar:  'M3 5h10v9H3V5zm0 0V3h10v2M7 2v2m2-2v2M3 9h10',
  check:     'M2.5 8l3.5 3.5 7-6',
  maximize:  'M10 2h4v4M6 14H2v-4M14 2l-5 5M2 14l5-5',
};

const KPI_VALUE_COLORS = {
  liveTechnicians: '#0369A1',
  activeJobs:      'var(--blue)',
  todaysJobs:      'var(--navy)',
  completedToday:  'var(--green)',
};

const KPI_DEFS = [
  { key: 'liveTechnicians', icon: 'live',     shortLabel: 'Live'   },
  { key: 'activeJobs',      icon: 'active',   shortLabel: 'Active' },
  { key: 'todaysJobs',      icon: 'calendar', shortLabel: 'Today'  },
  { key: 'completedToday',  icon: 'check',    shortLabel: 'Done'   },
];

function kpiAriaLabel(key, displayValue) {
  const val = displayValue ?? '0';
  const map = {
    liveTechnicians: `${val} live technician${val === '1' ? '' : 's'}`,
    activeJobs:      `${val} active job${val === '1' ? '' : 's'}`,
    todaysJobs:      `${val} job${val === '1' ? '' : 's'} today`,
    completedToday:  `${val} completed today`,
  };
  return map[key] || key;
}

// ── Nav item: Team or Jobs ──────────────────────────────────────────────────

function NavItem({ icon, label, active, onClick, ariaLabel }) {
  return (
    <button
      type="button"
      className={`compact-nav-item${active ? ' active' : ''}`}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
    >
      <Icon d={ICONS[icon]} size={18} />
      <span className="compact-nav-label">{label}</span>
    </button>
  );
}

// ── KPI item ──────────────────────────────────────────────────────────────────

function KpiItem({ def, metric, onClick }) {
  const val   = metric?.displayValue ?? (metric?.value != null ? String(metric.value) : '—');
  const color = (metric?.status === 'active' || metric?.status === 'stale')
    ? (KPI_VALUE_COLORS[def.key] || 'var(--navy)')
    : 'var(--steel)';

  return (
    <button
      type="button"
      className="compact-kpi-item"
      onClick={() => onClick?.(def.key)}
      aria-label={kpiAriaLabel(def.key, val)}
    >
      <Icon d={ICONS[def.icon]} size={16} />
      <span className="compact-kpi-value" style={{ color }}>{val}</span>
      <span className="compact-kpi-label">{def.shortLabel}</span>
    </button>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────

function Divider() {
  return <div className="compact-rail-divider" role="separator" />;
}

// ── DispatchCompactRail ───────────────────────────────────────────────────────

export default function DispatchCompactRail({
  metrics     = [],
  activeKpiKey,
  activeTab,        // 'team' | 'jobs' — tracks last active tab
  onExpandToTeam,
  onExpandToJobs,
  onKpiClick,
  onEnterFullMap,
}) {
  function getMetric(key) {
    return metrics.find(m => m.key === key);
  }

  return (
    <div className="dispatch-compact-rail" role="group" aria-label="Dispatch panel (compact)">

      {/* Primary navigation */}
      <NavItem
        icon="team"
        label="Team"
        active={activeTab === 'team'}
        onClick={onExpandToTeam}
        ariaLabel="Open Team panel"
      />
      <NavItem
        icon="jobs"
        label="Jobs"
        active={activeTab === 'jobs'}
        onClick={onExpandToJobs}
        ariaLabel="Open Jobs panel"
      />

      <Divider />

      {/* KPI summary */}
      {KPI_DEFS.map(def => (
        <KpiItem
          key={def.key}
          def={def}
          metric={getMetric(def.key)}
          onClick={onKpiClick}
        />
      ))}

      <Divider />

      {/* Full Map — separate action */}
      <button
        type="button"
        className="compact-nav-item"
        onClick={onEnterFullMap}
        aria-label="Enter full map mode"
      >
        <Icon d={ICONS.maximize} size={18} />
        <span className="compact-nav-label">Full Map</span>
      </button>

    </div>
  );
}
