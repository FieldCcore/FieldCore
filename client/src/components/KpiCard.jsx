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
 * Internal grid rows (guaranteed vertical alignment across all cards):
 *   Row 1 — header: [icon 28px] [title 1fr] [badge auto]
 *   Row 2 — value (primary number)
 *   Row 3 — subtitle (supporting text)
 *   Row 4 — footer: badge OR text-link action (always present, even if empty)
 *
 * Props:
 *   badge      — { label, tone } compact label in header (Live, Excellent)
 *   statusBadge — { label, tone } badge in footer row (Action Needed)
 *   action     — { label, onClick } text-link in footer row
 *   onClick    — makes the whole card a clickable button
 */
export default function KpiCard({
  icon: Icon,
  title,
  value,
  subtitle,
  tone = 'neutral',
  badge,
  statusBadge,
  action,
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
      {/* Row 1 — header */}
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

      {loading ? (
        <div className="kpi-card__skeleton" aria-label="Loading" />
      ) : (
        <>
          {/* Row 2 — value */}
          <div className="kpi-card__value">{value}</div>

          {/* Row 3 — subtitle */}
          <div className="kpi-card__subtitle">{subtitle}</div>

          {/* Row 4 — footer: badge OR action (always rendered for alignment) */}
          <div className="kpi-card__footer">
            {statusBadge && (
              <span className={`kpi-badge kpi-badge--${statusBadge.tone ?? 'neutral'}`} role="status">
                {statusBadge.label}
              </span>
            )}
            {action && !statusBadge && (
              <button
                className="kpi-card__action"
                onClick={(e) => { e.stopPropagation(); action.onClick?.(); }}
                type="button"
              >
                {action.label}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
