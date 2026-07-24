import React from 'react';

const ICON_BG = {
  success: 'var(--green-lt)',
  info:    'var(--blue-lt)',
  warning: 'var(--amber-lt)',
  danger:  'var(--red-lt)',
  neutral: 'var(--off)',
};
const ICON_COLOR = {
  success: 'var(--green)',
  info:    'var(--blue)',
  warning: 'var(--amber)',
  danger:  'var(--red)',
  neutral: 'var(--steel)',
};

/**
 * KpiCard — shared design-system component for Dashboard KPI metrics.
 *
 * Header layout: [icon 28px] [title 1fr] [badge auto]
 * Use `badge` for short labels (Live, Active, Excellent) that fit in the header.
 * Use `statusBadge` for longer labels (Action Needed) that render below the header.
 * Use `action` for subtle text-link CTAs below the subtitle.
 * Use `onClick` to make the entire card a clickable button.
 */
export default function KpiCard({
  icon: Icon,
  title,
  value,
  subtitle,
  tone = 'neutral',
  badge,        // { label, tone } — placed in header right column
  statusBadge,  // { label, tone } — placed in status row below header
  action,       // { label, onClick } — text CTA below subtitle
  onClick,
  loading = false,
}) {
  const iconBg    = ICON_BG[tone]    ?? ICON_BG.neutral;
  const iconColor = ICON_COLOR[tone] ?? ICON_COLOR.neutral;

  return (
    <div
      className={`kpi-card${onClick ? ' kpi-card--link' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      aria-label={onClick ? title : undefined}
    >
      <div className="kpi-card__header">
        {Icon && (
          <div
            className="kpi-card__icon"
            style={{ background: iconBg, color: iconColor }}
            aria-hidden="true"
          >
            <Icon size={14} strokeWidth={2} />
          </div>
        )}
        <span className="kpi-card__title">{title}</span>
        {badge && (
          <span className={`kpi-badge kpi-badge--${badge.tone ?? 'neutral'}`} role="status">
            {badge.label}
          </span>
        )}
      </div>

      {statusBadge && (
        <div className="kpi-card__status">
          <span className={`kpi-badge kpi-badge--${statusBadge.tone ?? 'neutral'}`} role="status">
            {statusBadge.label}
          </span>
        </div>
      )}

      {loading ? (
        <div className="kpi-card__skeleton" aria-label="Loading" />
      ) : (
        <>
          <div className="kpi-card__value">{value}</div>
          <div className="kpi-card__subtitle">{subtitle}</div>
          {action && (
            <button
              className="kpi-card__action"
              onClick={(e) => { e.stopPropagation(); action.onClick?.(); }}
              type="button"
            >
              {action.label}
            </button>
          )}
        </>
      )}
    </div>
  );
}
