import React from 'react';

/**
 * FinancialSnapshot — reusable metric grid for Dashboard panels.
 *
 * Props:
 *   metrics      [{ label, value, tone? }]  — filtered before passing; nothing with null value
 *   emptyMessage  string | null             — shown below grid when no revenue exists
 */
export default function FinancialSnapshot({ metrics = [], emptyMessage = null }) {
  if (metrics.length === 0 && !emptyMessage) return null;

  return (
    <div className="fs-snap" role="region" aria-label="Financial snapshot">
      {metrics.length > 0 && (
        <dl className="fs-snap__grid">
          {metrics.map((m, i) => (
            <div key={i} className={`fs-snap__cell${m.tone ? ` fs-snap__cell--${m.tone}` : ''}`}>
              <dt className="fs-snap__lbl">{m.label}</dt>
              <dd className="fs-snap__val">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {emptyMessage && (
        <p className="fs-snap__empty">{emptyMessage}</p>
      )}
    </div>
  );
}
