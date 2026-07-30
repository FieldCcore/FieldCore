import { useState, useEffect, useMemo, useCallback, Component } from 'react';
import { Map, useApiLoadingStatus } from '@vis.gl/react-google-maps';
import { FIELDCORE_MAP_STYLES } from './mapStyles';
import { getGoogleMapsClientConfig, maskedKey } from './mapsConfig';
import { useMapRetry } from './MapProvider';

const DEFAULT_CENTER = { lat: 27.9506, lng: -82.4572 };

// Explicit lifecycle — single source of truth replacing dual authError+status pattern.
// READY is sticky: once onIdle fires, neither auth-failure events nor status=FAILED
// can regress the map to an error state.
const LC = {
  UNCONFIGURED: 'UNCONFIGURED',
  LOADING:      'LOADING',
  READY:        'READY',
  AUTH_ERROR:   'AUTH_ERROR',
  LOAD_ERROR:   'LOAD_ERROR',
};

// ── Layer isolation ────────────────────────────────────────────────────────────
// Catches errors from optional children (markers, InfoWindow, overlays) so a
// broken overlay does not hide the base map.
class MapLayerErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err) {
    if (import.meta.env.DEV) {
      console.error('[GoogleMap] optional map layer crashed (base map preserved):', err.message);
    }
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

// ── State: API key absent from this build ──────────────────────────────────────
function MapConfigMissing({ className, style }) {
  return (
    <div
      className={className}
      style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#f5f3ef', color: '#5F667A',
        fontFamily: 'system-ui, sans-serif', fontSize: 13,
        gap: 6, ...style,
      }}
    >
      <strong style={{ color: '#1C2333' }}>Map unavailable</strong>
      <span>
        Set <code>VITE_GOOGLE_MAPS_API_KEY</code> in Vercel and redeploy.
      </span>
    </div>
  );
}

// ── State: Script loading ──────────────────────────────────────────────────────
function MapLoading({ className, style }) {
  return (
    <div
      className={className}
      style={{ width: '100%', height: '100%', background: '#f5f3ef', ...style }}
      aria-label="Map loading"
    />
  );
}

// ── State: AUTH_ERROR or LOAD_ERROR ───────────────────────────────────────────
function MapErrorFallback({ className, style, onRetry, maskedApiKey, isAuthError }) {
  const isDev = import.meta.env.DEV;
  return (
    <div
      className={className}
      style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#f5f3ef', color: '#5F667A',
        fontFamily: 'system-ui, sans-serif', fontSize: 13,
        gap: 10, padding: 24, textAlign: 'center',
        ...style,
      }}
    >
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"
          fill="#8A90A2"
        />
      </svg>
      <strong style={{ color: '#1C2333', fontSize: 15 }}>Map unavailable</strong>
      {isDev ? (
        <span style={{ color: '#5F667A', maxWidth: 340, lineHeight: 1.5 }}>
          {isAuthError ? (
            <>
              API key rejected. Key in this build: <code>{maskedApiKey}</code>.{' '}
              Check GCP Console: enable Maps JavaScript API, verify HTTP referrer restrictions
              include{' '}
              <code>{typeof window !== 'undefined' ? window.location.hostname : 'localhost'}</code>
              , and confirm billing is active.
            </>
          ) : (
            <>Maps script failed to load. Check your network connection.</>
          )}
        </span>
      ) : (
        <span style={{ color: '#5F667A' }}>
          Unable to load map. Check your connection and try again.
        </span>
      )}
      <button
        onClick={onRetry}
        style={{
          marginTop: 6, padding: '8px 20px',
          background: '#1C2333', color: '#fff',
          border: 'none', borderRadius: 6,
          cursor: 'pointer', fontSize: 13,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        Retry
      </button>
    </div>
  );
}

export function GoogleMap({
  center,
  zoom = 13,
  style,
  className,
  children,
  branded = true,
  onIdle: userOnIdle,
  ...props
}) {
  const cfg    = useMemo(() => getGoogleMapsClientConfig(), []);
  const status = useApiLoadingStatus();
  const retry  = useMapRetry();

  const [lifecycle, setLifecycle] = useState(
    cfg.configured ? LC.LOADING : LC.UNCONFIGURED
  );

  // vis.gl status FAILED → LOAD_ERROR (network failure, not auth)
  // READY is sticky — a resolved map cannot regress on late FAILED signals.
  useEffect(() => {
    if (status === 'FAILED') {
      setLifecycle(prev => prev === LC.READY ? prev : LC.LOAD_ERROR);
    }
  }, [status]);

  // gm_authFailure callback dispatches this event → AUTH_ERROR
  // READY is sticky — a successfully initialized map ignores stale auth signals.
  useEffect(() => {
    function onAuthFailure() {
      setLifecycle(prev => prev === LC.READY ? prev : LC.AUTH_ERROR);
    }
    window.addEventListener('fieldcore:maps:auth-failure', onAuthFailure);
    return () => window.removeEventListener('fieldcore:maps:auth-failure', onAuthFailure);
  }, []);

  // MapProvider retry → reset to LOADING so the map attempts initialization again
  useEffect(() => {
    function onRetry() {
      setLifecycle(cfg.configured ? LC.LOADING : LC.UNCONFIGURED);
    }
    window.addEventListener('fieldcore:maps:retry', onRetry);
    return () => window.removeEventListener('fieldcore:maps:retry', onRetry);
  }, [cfg.configured]);

  // onIdle: authoritative signal that the map instance is created and the initial
  // viewport has finished loading. Transitions to READY permanently.
  const handleIdle = useCallback(() => {
    setLifecycle(LC.READY);
    userOnIdle?.();
  }, [userOnIdle]);

  // ── State machine render ────────────────────────────────────────────────────

  if (lifecycle === LC.UNCONFIGURED) {
    return <MapConfigMissing className={className} style={style} />;
  }

  if (lifecycle === LC.AUTH_ERROR || lifecycle === LC.LOAD_ERROR) {
    return (
      <MapErrorFallback
        className={className}
        style={style}
        onRetry={retry}
        maskedApiKey={maskedKey(cfg.apiKey)}
        isAuthError={lifecycle === LC.AUTH_ERROR}
      />
    );
  }

  // LOADING + script not yet in flight → show placeholder
  if (lifecycle === LC.LOADING && (status === 'NOT_LOADED' || status === 'LOADING')) {
    return <MapLoading className={className} style={style} />;
  }

  // LOADING (status=LOADED) or READY → render live map.
  // onIdle fires once the map instance is ready, transitioning to READY.
  const mapOptions = cfg.mapId
    ? { mapId: cfg.mapId }
    : (branded ? { styles: FIELDCORE_MAP_STYLES } : {});

  return (
    <Map
      defaultCenter={center ?? DEFAULT_CENTER}
      defaultZoom={zoom}
      {...mapOptions}
      mapTypeControl={false}
      streetViewControl={false}
      fullscreenControl={false}
      zoomControl={true}
      gestureHandling="greedy"
      style={{ width: '100%', height: '100%', ...style }}
      className={className}
      onIdle={handleIdle}
      {...props}
    >
      <MapLayerErrorBoundary>{children}</MapLayerErrorBoundary>
    </Map>
  );
}
