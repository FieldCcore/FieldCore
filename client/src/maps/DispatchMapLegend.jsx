import { useMemo } from 'react';
import { getJobStatusPresentation } from '../domain/jobStatusPresentation';
import {
  TECH_LEGEND_ITEMS,
  TECH_STALE_LEGEND_ITEM,
  getTechStatus,
} from '../domain/technicianStatusPresentation';

const JOB_LEGEND_ITEMS = [
  { key: 'scheduled',   label: 'Job — Scheduled'   },
  { key: 'in_progress', label: 'Job — In Progress'  },
  { key: 'complete',    label: 'Job — Completed'    },
  { key: 'cancelled',   label: 'Job — Cancelled'    },
].map(({ key, label }) => ({
  key, label, color: getJobStatusPresentation(key).markerColor,
}));

// Emergency is not a status — it overlays any job, shown separately
const EMERGENCY_LEGEND_ITEM = { key: 'emergency', label: 'Emergency', color: '#DC2626' };

const VISIBLE_JOB_STATUSES = new Set(['scheduled', 'in_progress', 'complete', 'cancelled']);

function TechDot({ color, isStale, warningColor }) {
  if (isStale) {
    return (
      <svg width="12" height="12" aria-hidden="true" style={{ flexShrink: 0 }}>
        <circle cx="6" cy="6" r="5.5" fill={warningColor} />
        <circle cx="6" cy="6" r="3.5" fill={color} />
      </svg>
    );
  }
  return (
    <svg width="10" height="10" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="5" cy="5" r="4" fill={color} />
    </svg>
  );
}

function CancelledPin({ color }) {
  return (
    <svg width="8" height="11" viewBox="0 0 22 30" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M11 1C6.58 1 3 4.58 3 9c0 5.25 8 19 8 19s8-13.75 8-19c0-4.42-3.58-8-8-8z" fill={color} />
      <line x1="7.5" y1="5.5" x2="14.5" y2="12.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <line x1="14.5" y1="5.5" x2="7.5" y2="12.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function EmergencyPin() {
  return (
    <svg width="9" height="13" viewBox="0 0 28 38" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M14 1C8.48 1 4 5.48 4 11c0 6.56 10 26 10 26s10-19.44 10-26c0-5.52-4.48-10-10-10z" fill="#DC2626" />
      <text x="14" y="14" textAnchor="middle" fontFamily="Inter,Arial,sans-serif" fontSize="12" fontWeight="900" fill="white">!</text>
    </svg>
  );
}

function LegendRow({ color, label, shape, isStale, warningColor }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
      {shape === 'circle' ? (
        <TechDot color={color} isStale={isStale} warningColor={warningColor} />
      ) : shape === 'cancelled-pin' ? (
        <CancelledPin color={color} />
      ) : shape === 'emergency-pin' ? (
        <EmergencyPin />
      ) : (
        <svg width="8" height="11" viewBox="0 0 22 30" aria-hidden="true" style={{ flexShrink: 0 }}>
          <path d="M11 1C6.58 1 3 4.58 3 9c0 5.25 8 19 8 19s8-13.75 8-19c0-4.42-3.58-8-8-8z" fill={color} />
        </svg>
      )}
      <span style={{ fontSize: 11, color: 'var(--navy)' }}>{label}</span>
    </div>
  );
}

/**
 * Map legend — bottom-right overlay, always present, collapsible.
 *
 * Props:
 *   isCollapsed      — bool: when true shows only the header button
 *   onToggleCollapse — () => void: toggle collapsed state
 *   techs, techLocs, jobs, layers — data for dynamic entries
 */
export default function DispatchMapLegend({
  isCollapsed      = false,
  onToggleCollapse,
  techs    = [],
  techLocs = [],
  jobs     = [],
  layers   = { techs: true, jobs: true },
  flags    = {},
}) {
  const hasStaleTech = useMemo(
    () => layers.techs && techs.some(t => getTechStatus(t, techLocs, jobs).isStale),
    [techs, techLocs, jobs, layers.techs],
  );

  const hasCancelledJob = useMemo(
    () => layers.jobs && jobs.some(j => j.status === 'cancelled'),
    [jobs, layers.jobs],
  );

  const hasEmergencyJob = useMemo(
    () => layers.jobs && jobs.some(j => j.is_emergency === true),
    [jobs, layers.jobs],
  );

  const visibleJobLegendItems = useMemo(
    () => layers.jobs
      ? JOB_LEGEND_ITEMS.filter(i => {
          if (i.key === 'cancelled') return hasCancelledJob;
          return VISIBLE_JOB_STATUSES.has(i.key);
        })
      : [],
    [layers.jobs, hasCancelledJob],
  );

  const showTechDivider = layers.techs && visibleJobLegendItems.length > 0;

  if (isCollapsed) {
    return (
      <button
        type="button"
        className="dispatch-map-legend dispatch-map-legend--collapsed"
        onClick={onToggleCollapse}
        aria-label="Expand map legend"
      >
        <svg viewBox="0 0 16 16" fill="none" style={{ width: 14, height: 14 }} aria-hidden="true">
          <path d="M3 5h10M3 8h7M3 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--navy)', letterSpacing: '.03em' }}>Legend</span>
      </button>
    );
  }

  return (
    <div className="dispatch-map-legend" role="region" aria-label="Map legend">
      {/* Header row with label + minimize button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: 'var(--steel)',
          textTransform: 'uppercase', letterSpacing: '.06em',
        }}>
          Legend
        </span>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Minimize map legend"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 18, height: 18, marginLeft: 8, marginRight: -2,
            background: 'none', border: 'none', cursor: 'pointer', borderRadius: 3,
            color: 'var(--steel)', padding: 0, flexShrink: 0,
          }}
        >
          <svg viewBox="0 0 16 16" fill="none" style={{ width: 12, height: 12 }} aria-hidden="true">
            <path d="M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {layers.techs && TECH_LEGEND_ITEMS.map(item => (
        <LegendRow key={item.key} color={item.color} label={item.label} shape="circle" />
      ))}

      {layers.techs && hasStaleTech && (
        <LegendRow
          key={TECH_STALE_LEGEND_ITEM.key}
          color={TECH_STALE_LEGEND_ITEM.color}
          label={TECH_STALE_LEGEND_ITEM.label}
          shape="circle"
          isStale={true}
          warningColor={TECH_STALE_LEGEND_ITEM.warningColor}
        />
      )}

      {showTechDivider && (
        <div style={{ height: 1, background: 'var(--lightgray)', margin: '6px 0' }} />
      )}

      {visibleJobLegendItems.map(item => (
        <LegendRow
          key={item.key}
          color={item.color}
          label={item.label}
          shape={item.key === 'cancelled' ? 'cancelled-pin' : 'pin'}
        />
      ))}
      {hasEmergencyJob && flags.dispatch_emergency_mode && (
        <LegendRow
          key="emergency"
          color={EMERGENCY_LEGEND_ITEM.color}
          label={EMERGENCY_LEGEND_ITEM.label}
          shape="emergency-pin"
        />
      )}
    </div>
  );
}
