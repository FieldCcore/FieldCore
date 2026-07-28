import React from 'react';

const ICON_BG = {
  success:  'var(--green-lt)',
  warning:  'var(--yellow-lt)',
  critical: 'var(--red-lt)',
  neutral:  'var(--off)',
  // legacy aliases
  danger: 'var(--red-lt)',
  info:   'var(--off)',
};
const ICON_COLOR = {
  success:  'var(--green)',
  warning:  'var(--yellow)',
  critical: 'var(--red)',
  neutral:  'var(--steel)',
  // legacy aliases
  danger: 'var(--red)',
  info:   'var(--steel)',
};

/**
 * KpiCard — shared design-system component for Dashboard KPI metrics.
 *
 * Internal grid rows (guaranteed vertical alignment across all cards):
 *   Row 1 — header: [icon 28px] [title 1fr] [badge auto]
 *   Row 2 — value (primary number)
 *   Row 3 — subtitle (supporting text)
 *   Row 4 — footer: text-link action (always present, even if empty)
 *
 * Props:
 *   badge   — { label, tone } compact status label in header top-right
 *   action  — { label, onClick } text-link in footer row (always rendered)
 *   onClick — makes the whole card a clickable button
 */
export default function KpiCard({
  icon: Icon,
  title,
  value,
  subtitle,
  tone = 'neutral',
  badge,
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

          {/* Row 4 — footer: text-link action (always present for alignment) */}
          <div className="kpi-card__footer">
            {action && (
              <button
                className="kpi-card__action"
                onClick={(e) => { e.stopPropagation(); action.onClick?.(); }}
                type="button"
                aria-label={action.label}
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
