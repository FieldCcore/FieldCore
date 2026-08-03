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

// Legend dot for a technician — renders the same treatment as the map marker.
// Plain circle for live GPS; blue body + amber ring for stale GPS.
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

function LegendRow({ color, label, shape, isStale, warningColor }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
      {shape === 'circle' ? (
        <TechDot color={color} isStale={isStale} warningColor={warningColor} />
      ) : (
        <svg width="8" height="11" viewBox="0 0 22 30" aria-hidden="true" style={{ flexShrink: 0 }}>
          <path d="M11 1C6.58 1 3 4.58 3 9c0 5.25 8 19 8 19s8-13.75 8-19c0-4.42-3.58-8-8-8z" fill={color} />
        </svg>
      )}
      <span style={{ fontSize: 11, color: 'var(--navy)' }}>{label}</span>
    </div>
  );
}

// Job statuses shown as map markers by default (cancelled/no_show are excluded)
const VISIBLE_JOB_STATUSES = new Set(['scheduled', 'in_progress', 'complete']);

/**
 * Compact map legend.
 * - Tech entries only shown when layers.techs is enabled.
 * - Job entries only shown when layers.jobs is enabled.
 * - "Tech — Location Stale" only shown when at least one visible tech has stale GPS.
 * - Legend entries match exactly what's visible on the map.
 */
export default function DispatchMapLegend({
  visible  = true,
  techs    = [],
  techLocs = [],
  jobs     = [],
  layers   = { techs: true, jobs: true },
  inline   = false,
}) {
  const hasStaleTech = useMemo(
    () => layers.techs && techs.some(t => getTechStatus(t, techLocs, jobs).isStale),
    [techs, techLocs, jobs, layers.techs],
  );

  const visibleJobLegendItems = useMemo(
    () => layers.jobs ? JOB_LEGEND_ITEMS.filter(i => VISIBLE_JOB_STATUSES.has(i.key)) : [],
    [layers.jobs],
  );

  const showTechDivider = layers.techs && visibleJobLegendItems.length > 0;

  if (!visible) return null;

  return (
    <div
      className={inline ? undefined : 'dispatch-map-legend'}
      style={inline ? { padding: '10px 14px 6px' } : undefined}
      role="region"
      aria-label="Map legend"
    >
      <div style={{
        fontSize: 10, fontWeight: 700, color: 'var(--steel)',
        textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6,
      }}>
        Legend
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
        <LegendRow key={item.key} color={item.color} label={item.label} shape="pin" />
      ))}
    </div>
  );
}
