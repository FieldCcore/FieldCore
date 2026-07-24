import React from 'react';

export default function DashboardPanel({
  title,
  action,    // { label, onClick }
  badge,     // { label, tone } — compact badge right of title
  children,
  footer,
  loading = false,
  scrollable = false,
  className = '',
}) {
  return (
    <div className={`dp-panel${scrollable ? ' dp-panel--scrollable' : ''}${className ? ` ${className}` : ''}`}>
      <div className="dp-panel__header">
        <span className="dp-panel__title">{title}</span>
        <div className="dp-panel__meta">
          {badge && (
            <span className={`kpi-badge kpi-badge--${badge.tone ?? 'neutral'}`}>
              {badge.label}
            </span>
          )}
          {action && (
            <button className="dp-panel__action" onClick={action.onClick} type="button">
              {action.label}
            </button>
          )}
        </div>
      </div>
      <div className="dp-panel__body">
        {loading
          ? <div className="dp-panel__loading" aria-live="polite">Loading…</div>
          : children}
      </div>
      {footer && <div className="dp-panel__footer">{footer}</div>}
    </div>
  );
}
