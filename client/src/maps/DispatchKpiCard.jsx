import { TECH_PRESENTATIONS } from '../domain/technicianStatusPresentation';

/**
 * DispatchKpiCard
 *
 * Renders one KPI card based on the metric's `status` field.
 * Never renders an empty string, undefined, or NaN.
 *
 * Supported statuses:
 *   active          — value + supportingText
 *   no_data         — dash + "No data yet" explanation
 *   not_configured  — "Set up" + configure action for authorized users
 *   disabled        — "Disabled" label
 *   unavailable     — dash + "Temporarily unavailable"
 *   stale           — last value + stale indicator
 *   loading         — skeleton (rendered by DispatchKPIStrip, not here)
 */

const TOOLTIP_TEXT = {
  liveTechnicians:  'Technicians currently clocked in or available with a recent GPS update.',
  activeJobs:       'Jobs currently in progress, paused, or otherwise operationally active.',
  todaysJobs:       "Jobs scheduled during the current date in the company's timezone.",
  completedToday:   'Jobs completed today based on their actual completion timestamp.',
  averageResponse:  'Average time from the configured start event to the technician\'s response event.',
};

export default function DispatchKpiCard({ metric, onClick, onConfigure, compact, userRole, selected }) {
  if (!metric) return null;

  const {
    key, label, status, value, displayValue, supportingText,
    enabled, configured, reasonCode, configurePath,
  } = metric;

  const canConfigure = userRole === 'owner' || userRole === 'manager';
  const tooltip      = TOOLTIP_TEXT[key] || label;
  const isStale      = status === 'stale';

  // Derive what to show in the value position
  let valueContent;
  switch (status) {
    case 'active':
    case 'stale':
      valueContent = (displayValue != null && !Number.isNaN(displayValue))
        ? String(displayValue)
        : (value != null && !Number.isNaN(value) ? String(value) : '—');
      break;
    case 'not_configured':
      valueContent = 'Set up';
      break;
    case 'disabled':
      valueContent = 'Off';
      break;
    case 'no_data':
    case 'unavailable':
    default:
      valueContent = '—';
  }

  // Derive sub-line text
  let subContent;
  switch (status) {
    case 'active':
    case 'stale':
      subContent = supportingText || null;
      break;
    case 'not_configured':
      subContent = canConfigure ? 'Configure →' : 'Contact admin';
      break;
    case 'disabled':
      subContent = canConfigure ? 'Enable in Settings' : 'Feature disabled';
      break;
    case 'no_data':
      subContent = supportingText || 'No data yet';
      break;
    case 'unavailable':
      subContent = 'Temporarily unavailable';
      break;
    default:
      subContent = null;
  }

  function handleClick() {
    if (!onClick) return;
    // For not_configured/disabled: route to configure if authorized, otherwise ignore
    if ((status === 'not_configured' || status === 'disabled') && canConfigure && onConfigure) {
      onConfigure(configurePath || '/settings?tab=dispatch');
      return;
    }
    onClick(key);
  }

  const isDimmed = status === 'disabled' || status === 'not_configured' || status === 'unavailable';

  return (
    <button
      type="button"
      className={`dispatch-kpi-card${selected ? ' selected' : ''}`}
      onClick={handleClick}
      aria-label={`${label}: ${valueContent}`}
      title={tooltip}
      style={{ opacity: isDimmed ? 0.7 : 1 }}
    >
      <div className="dispatch-kpi-value" style={{
        color: isDimmed ? 'var(--steel)' : getValueColor(status, key),
        fontSize: compact ? 16 : undefined,
      }}>
        {valueContent}
        {isStale && (
          <span
            className="dispatch-kpi-stale"
            title="Last successful value — refresh failed"
            aria-hidden="true"
          />
        )}
      </div>
      <div className="dispatch-kpi-label">{label}</div>
      {subContent && (
        <div
          className="dispatch-kpi-sub"
          style={{
            color: (status === 'not_configured' && canConfigure) ? 'var(--blue)' :
                   status === 'no_data' ? 'var(--steel)' : undefined,
          }}
        >
          {subContent}
        </div>
      )}
    </button>
  );
}

function getValueColor(status, key) {
  if (status !== 'active' && status !== 'stale') return 'var(--steel)';
  const colors = {
    liveTechnicians: TECH_PRESENTATIONS.live.color,  // sky-blue — matches Tech Live GPS, never green
    activeJobs:      'var(--blue)',
    todaysJobs:      'var(--navy)',
    completedToday:  'var(--green)',                 // green is correct for completed jobs
    averageResponse: 'var(--amber)',
  };
  return colors[key] || 'var(--navy)';
}
