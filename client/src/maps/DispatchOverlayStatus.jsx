// Non-blocking status pill for FieldCore data overlays.
// Positioned bottom-left of the map stage, above Google branding.
// Never covers the full map or blocks basemap controls.
// pointer-events: auto required since parent overlay uses pointer-events: none.

function SpinnerIcon() {
  return (
    <svg
      viewBox="0 0 16 16" fill="none"
      style={{ width: 12, height: 12, flexShrink: 0, animation: 'dispatch-spin 0.9s linear infinite' }}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeOpacity=".25" />
      <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 12, height: 12, flexShrink: 0 }} aria-hidden="true">
      <path
        d="M2 8a6 6 0 1 0 1.5-3.9M2 4v4h4"
        stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Props:
 *   loading   — true while initial overlay data is in flight
 *   error     — true when overlay data failed and no prior data exists
 *   stale     — true when prior data is available but last refresh failed
 *   onRetry   — callback for the Retry action
 */
export default function DispatchOverlayStatus({ loading, error, stale, onRetry }) {
  if (!loading && !error && !stale) return null;

  if (loading) {
    return (
      <div className="dispatch-overlay-status dispatch-overlay-status--loading" role="status" aria-live="polite">
        <SpinnerIcon />
        <span>Loading dispatch data…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dispatch-overlay-status dispatch-overlay-status--error" role="alert">
        <span>Dispatch data temporarily unavailable</span>
        {onRetry && (
          <button
            type="button"
            className="dispatch-overlay-retry"
            onClick={onRetry}
            aria-label="Retry loading dispatch data"
          >
            <RetryIcon />
            Retry
          </button>
        )}
      </div>
    );
  }

  if (stale) {
    return (
      <div className="dispatch-overlay-status dispatch-overlay-status--stale" role="status" aria-live="polite">
        <span>Showing last known data</span>
      </div>
    );
  }

  return null;
}
