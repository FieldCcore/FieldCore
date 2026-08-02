import { getJobStatusPresentation } from '../domain/jobStatusPresentation';
import { TECH_LEGEND_ITEMS } from '../domain/technicianStatusPresentation';

const JOB_LEGEND_ITEMS = [
  { key: 'scheduled',   label: 'Job — Scheduled'   },
  { key: 'in_progress', label: 'Job — In Progress'  },
  { key: 'complete',    label: 'Job — Completed'    },
  { key: 'cancelled',   label: 'Job — Cancelled'    },
].map(({ key, label }) => ({
  key, label, color: getJobStatusPresentation(key).markerColor,
}));

function LegendRow({ color, label, shape }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
      {shape === 'circle' ? (
        <svg width="10" height="10" aria-hidden="true">
          <circle cx="5" cy="5" r="4" fill={color} />
        </svg>
      ) : (
        <svg width="8" height="11" viewBox="0 0 22 30" aria-hidden="true">
          <path d="M11 1C6.58 1 3 4.58 3 9c0 5.25 8 19 8 19s8-13.75 8-19c0-4.42-3.58-8-8-8z" fill={color} />
        </svg>
      )}
      <span style={{ fontSize: 11, color: 'var(--navy)' }}>{label}</span>
    </div>
  );
}

export default function DispatchMapLegend({ visible = true }) {
  if (!visible) return null;
  return (
    <div className="dispatch-map-legend" role="region" aria-label="Map legend">
      <div style={{
        fontSize: 10, fontWeight: 700, color: 'var(--steel)',
        textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6,
      }}>
        Legend
      </div>
      {TECH_LEGEND_ITEMS.map(item => (
        <LegendRow key={item.key} color={item.color} label={item.label} shape="circle" />
      ))}
      <div style={{ height: 1, background: 'var(--lightgray)', margin: '6px 0' }} />
      {JOB_LEGEND_ITEMS.map(item => (
        <LegendRow key={item.key} color={item.color} label={item.label} shape="pin" />
      ))}
    </div>
  );
}
