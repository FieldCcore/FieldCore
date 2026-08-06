import React, { useState } from 'react';

// Status codes from the backend service
// ok | loading | unavailable | insufficient_data | error | stale | no_eligible_revenue | permission_denied

const STATUS_DISPLAY = {
  ok:                 null,
  loading:            null,
  unavailable:        'Unavailable',
  insufficient_data:  'Insufficient data',
  error:              'Could not load',
  stale:              null, // shows value with stale indicator
  no_eligible_revenue: 'None in period',
  permission_denied:  'Access restricted',
};

export default function RevenueKpiCard({
  label,
  value,         // formatted string (already $ or %) or null
  status = 'ok',
  comparison,    // { change, pct, direction } or null
  comparisonBasis, // 'vs. previous month' etc.
  calculatedAt,  // ISO string
  provenance,    // { formula, sources, note, limitation, exclusions, basis }
  isLoading = false,
  size = 'primary', // 'primary' | 'secondary'
  suffix,        // optional unit like '%' or 'hrs'
  note,          // optional status note to show below value
}) {
  const [showHow, setShowHow] = useState(false);

  const isPrimary = size === 'primary';
  const displayStatus = STATUS_DISPLAY[status];
  const hasRealValue  = (status === 'ok' || status === 'stale') && value != null;

  const changeColor = comparison?.direction === 'up' ? 'var(--green)' : 'var(--red)';
  const changeSymbol = comparison?.direction === 'up' ? '↑' : '↓';

  return (
    <div className={`rov-kpi-card rov-kpi-card--${size}${status === 'stale' ? ' rov-kpi-card--stale' : ''}`}>
      {/* Label row */}
      <div className="rov-kpi-label">{label}</div>

      {/* Value area */}
      {isLoading || status === 'loading' ? (
        <div className="rov-kpi-skeleton" aria-label="Loading" />
      ) : hasRealValue ? (
        <>
          <div className="rov-kpi-value" aria-label={`${label}: ${value}${suffix ? ' ' + suffix : ''}`}>
            {value}{suffix && <span className="rov-kpi-suffix">{suffix}</span>}
            {status === 'stale' && (
              <span className="rov-kpi-stale-dot" title="Data may be slightly out of date" aria-label="Stale indicator">·</span>
            )}
          </div>
          {note && <div className="rov-kpi-note">{note}</div>}
          {comparison && (
            <div className="rov-kpi-comparison" style={{ color: changeColor }}>
              <span aria-label={`${comparison.direction === 'up' ? 'Up' : 'Down'} ${Math.abs(comparison.pct).toFixed(1)}%`}>
                {changeSymbol} {Math.abs(comparison.pct).toFixed(1)}%
              </span>
              {comparisonBasis && (
                <span className="rov-kpi-comp-basis">{comparisonBasis}</span>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="rov-kpi-unavailable">
          <span className="rov-kpi-unavail-label">{displayStatus || 'Unavailable'}</span>
          {provenance?.note && <span className="rov-kpi-unavail-note">{provenance.note}</span>}
        </div>
      )}

      {/* How calculated */}
      {provenance && (
        <div className="rov-kpi-how-wrap">
          <button
            type="button"
            className="rov-kpi-how-btn"
            onClick={() => setShowHow(v => !v)}
            aria-expanded={showHow}
            aria-controls={`rov-how-${label.replace(/\s+/g, '-')}`}
          >
            {showHow ? 'Hide' : 'How calculated'}
          </button>
          {showHow && (
            <div
              id={`rov-how-${label.replace(/\s+/g, '-')}`}
              className="rov-kpi-how-panel"
              role="region"
              aria-label={`${label} calculation details`}
            >
              {provenance.formula && (
                <div className="rov-kpi-how-row">
                  <span className="rov-kpi-how-key">Formula</span>
                  <span className="rov-kpi-how-val">{provenance.formula}</span>
                </div>
              )}
              {provenance.sources?.length > 0 && (
                <div className="rov-kpi-how-row">
                  <span className="rov-kpi-how-key">Sources</span>
                  <span className="rov-kpi-how-val">{provenance.sources.join(', ')}</span>
                </div>
              )}
              {provenance.basis && (
                <div className="rov-kpi-how-row">
                  <span className="rov-kpi-how-key">Date basis</span>
                  <span className="rov-kpi-how-val">{provenance.basis}</span>
                </div>
              )}
              {provenance.exclusions && (
                <div className="rov-kpi-how-row">
                  <span className="rov-kpi-how-key">Exclusions</span>
                  <span className="rov-kpi-how-val">{Array.isArray(provenance.exclusions) ? provenance.exclusions.join('; ') : provenance.exclusions}</span>
                </div>
              )}
              {provenance.note && (
                <div className="rov-kpi-how-row">
                  <span className="rov-kpi-how-key">Note</span>
                  <span className="rov-kpi-how-val">{provenance.note}</span>
                </div>
              )}
              {provenance.limitation && (
                <div className="rov-kpi-how-row">
                  <span className="rov-kpi-how-key">Limitation</span>
                  <span className="rov-kpi-how-val rov-kpi-how-limitation">{
                    provenance.limitation === 'scheduled_not_actual'
                      ? 'Uses scheduled duration, not recorded time'
                      : provenance.limitation
                  }</span>
                </div>
              )}
              {calculatedAt && (
                <div className="rov-kpi-how-row rov-kpi-how-time">
                  <span className="rov-kpi-how-key">Last calculated</span>
                  <span className="rov-kpi-how-val">{new Date(calculatedAt).toLocaleTimeString()}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
