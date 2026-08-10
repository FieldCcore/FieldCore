import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const STATUS_DISPLAY = {
  ok:                 null,
  loading:            null,
  unavailable:        'Unavailable',
  insufficient_data:  'Insufficient data',
  error:              'Could not load',
  stale:              null,
  no_eligible_revenue: 'None in period',
  permission_denied:  'Access restricted',
  policy_required:    'Policy required',
  provider_required:  'Provider required',
};

function HowModal({ label, value, status, provenance, calculatedAt, onClose, triggerRef }) {
  const modalRef  = useRef(null);
  const closeRef  = useRef(null);
  const slug      = label.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

  // Focus close button on open
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // ESC to close
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last  = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleClose() {
    onClose();
    // Return focus to trigger
    setTimeout(() => triggerRef.current?.focus(), 0);
  }

  const hasValue = (status === 'ok' || status === 'stale') && value != null;

  return createPortal(
    <div
      className="rov-how-backdrop"
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
      aria-modal="true"
      role="dialog"
      aria-labelledby={`rov-how-title-${slug}`}
    >
      <div className="rov-how-modal" ref={modalRef}>
        <div className="rov-how-modal-header">
          <h2 id={`rov-how-title-${slug}`} className="rov-how-modal-title">
            How {label} Is Calculated
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="rov-how-modal-close"
            onClick={handleClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="rov-how-modal-body">
          {hasValue && (
            <div className="rov-how-section">
              <div className="rov-how-section-label">Current Value</div>
              <div className="rov-how-section-val rov-how-section-val--value">{value}</div>
            </div>
          )}
          {provenance?.formula && (
            <div className="rov-how-section">
              <div className="rov-how-section-label">Formula</div>
              <div className="rov-how-section-val">{provenance.formula}</div>
            </div>
          )}
          {provenance?.sources?.length > 0 && (
            <div className="rov-how-section">
              <div className="rov-how-section-label">Sources</div>
              <div className="rov-how-section-val">{provenance.sources.join(', ')}</div>
            </div>
          )}
          {provenance?.basis && (
            <div className="rov-how-section">
              <div className="rov-how-section-label">Date Basis</div>
              <div className="rov-how-section-val">{provenance.basis}</div>
            </div>
          )}
          {(provenance?.includes ?? provenance?.inclusions)?.length > 0 && (
            <div className="rov-how-section">
              <div className="rov-how-section-label">Includes</div>
              <ul className="rov-how-list">
                {(provenance.includes ?? provenance.inclusions).map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          )}
          {(provenance?.excludes ?? provenance?.exclusions) && (
            <div className="rov-how-section">
              <div className="rov-how-section-label">Excludes</div>
              {Array.isArray(provenance.excludes ?? provenance.exclusions) ? (
                <ul className="rov-how-list">
                  {(provenance.excludes ?? provenance.exclusions).map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              ) : (
                <div className="rov-how-section-val">{provenance.excludes ?? provenance.exclusions}</div>
              )}
            </div>
          )}
          {provenance?.assumptions?.length > 0 && (
            <div className="rov-how-section">
              <div className="rov-how-section-label">Assumptions</div>
              <ul className="rov-how-list">
                {provenance.assumptions.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          )}
          {provenance?.note && (
            <div className="rov-how-section">
              <div className="rov-how-section-label">Note</div>
              <div className="rov-how-section-val">{provenance.note}</div>
            </div>
          )}
          {provenance?.limitation && (
            <div className="rov-how-section">
              <div className="rov-how-section-label">Limitation</div>
              <div className="rov-how-section-val rov-how-limitation">
                {provenance.limitation === 'scheduled_not_actual'
                  ? 'Uses scheduled duration, not recorded time'
                  : provenance.limitation}
              </div>
            </div>
          )}
          {provenance?.limitations?.length > 0 && (
            <div className="rov-how-section">
              <div className="rov-how-section-label">Limitations</div>
              <ul className="rov-how-list">
                {provenance.limitations.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          )}
          {!(provenance?.limitation || provenance?.limitations?.length) && (
            <div className="rov-how-section">
              <div className="rov-how-section-label">Limitations</div>
              <div className="rov-how-section-val rov-how-none">None</div>
            </div>
          )}
          {calculatedAt && (
            <div className="rov-how-section rov-how-section--time">
              <div className="rov-how-section-label">Last Calculated</div>
              <div className="rov-how-section-val">{new Date(calculatedAt).toLocaleTimeString()}</div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function RevenueKpiCard({
  label,
  value,
  status = 'ok',
  comparison,
  comparisonBasis,
  calculatedAt,
  provenance,
  isLoading = false,
  size = 'primary',
  suffix,
  note,
}) {
  const [showModal, setShowModal] = useState(false);
  const triggerRef = useRef(null);

  const isPrimary     = size === 'primary';
  const displayStatus = STATUS_DISPLAY[status];
  const hasRealValue  = (status === 'ok' || status === 'stale') && value != null;

  const changeColor  = comparison?.direction === 'up' ? 'var(--green)' : 'var(--red)';
  const changeSymbol = comparison?.direction === 'up' ? '↑' : '↓';

  return (
    <>
      <div className={`rov-kpi-card rov-kpi-card--${size}${status === 'stale' ? ' rov-kpi-card--stale' : ''}`}>
        <div className="rov-kpi-label">{label}</div>

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

        {provenance && (
          <div className="rov-kpi-how-wrap">
            <button
              ref={triggerRef}
              type="button"
              className="rov-kpi-how-btn"
              onClick={() => setShowModal(true)}
              aria-haspopup="dialog"
            >
              How calculated
            </button>
          </div>
        )}
      </div>

      {showModal && provenance && (
        <HowModal
          label={label}
          value={value}
          status={status}
          provenance={provenance}
          calculatedAt={calculatedAt}
          onClose={() => setShowModal(false)}
          triggerRef={triggerRef}
        />
      )}
    </>
  );
}
