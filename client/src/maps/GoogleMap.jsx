import { useState, useEffect, useMemo, useCallback, useRef, Component } from 'react';
import { Map, useMap, useApiLoadingStatus } from '@vis.gl/react-google-maps';
import { FIELDCORE_MAP_STYLES } from './mapStyles';
import { getGoogleMapsClientConfig, maskedKey } from './mapsConfig';
import { useMapRetry } from './MapProvider';

// Safe default — continental US, zoom 4
const DEFAULT_CENTER = { lat: 39.5, lng: -98.35 };

// Rejects null, undefined, strings, NaN, Infinity
function safeCenter(val) {
  if (!val || typeof val !== 'object') return null;
  const lat = Number(val.lat);
  const lng = Number(val.lng);
  return isFinite(lat) && isFinite(lng) ? { lat, lng } : null;
}

// Explicit lifecycle — single source of truth.
// READY is sticky: once reached, auth-failure events and FAILED status cannot regress it.
// READY requires both onIdle AND a confirmed nonzero container.
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
      console.error('[GoogleMap] optional layer crashed (base map preserved):', err.message);
    }
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

// ── Container size watcher (must run inside Map context to call useMap) ────────
// vis.gl's Map applies className to BOTH the outer wrapper div AND the inner div
// that Google Maps mounts into, but passes style={undefined} to the inner div
// when className is set (relying on CSS). If Google Maps reads offsetWidth/Height
// as 0 at init time (layout not yet flushed), tiles never render.
// This component detects when the container gains real dimensions, triggers a
// resize event so Google Maps re-reads them, and signals onContainerReady.
function MapResizeWatcher({ onContainerReady }) {
  const map        = useMap();
  const onReadyRef = useRef(onContainerReady);
  useEffect(() => { onReadyRef.current = onContainerReady; }, [onContainerReady]);

  useEffect(() => {
    if (!map) return;
    const container = map.getDiv?.();
    if (!container) return;

    let notified = false;

    function check() {
      const w = container.offsetWidth;
      const h = container.offsetHeight;
      if (w > 0 && h > 0) {
        // Re-read container dimensions and re-render tiles
        try { window.google?.maps?.event?.trigger(map, 'resize'); } catch {}
        if (!notified) {
          notified = true;
          onReadyRef.current?.();
        }
      }
    }

    // Synchronous check after first render (dimensions available once in DOM)
    check();

    // Observe future changes: sidebar collapse, window resize, split-pane drag
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(check);
      ro.observe(container);
      return () => ro.disconnect();
    }
  }, [map]);

  return null;
}

// ── DEV diagnostics (inside Map context, omitted from production) ─────────────
function MapDevDiagnostics({ lifecycle, idleFired, containerReady, center, zoom }) {
  const map = useMap();

  useEffect(() => {
    const container = map?.getDiv?.();
    const w = container?.offsetWidth  ?? 0;
    const h = container?.offsetHeight ?? 0;
    const diag = {
      lifecycle,
      idleFired,
      containerReady,
      mapInstance:     !!map,
      containerFound:  !!container,
      containerWidth:  w,
      containerHeight: h,
      center,
      zoom,
      googleMapsAvail: !!window.google?.maps?.Map,
    };
    window.__FIELDCORE_MAPS_DIAGNOSTICS__ = {
      ...(window.__FIELDCORE_MAPS_DIAGNOSTICS__ || {}),
      ...diag,
    };
    console.log('[GoogleMap][DEV]', JSON.stringify(diag));
  }, [map, lifecycle, idleFired, containerReady, center, zoom]);

  return null;
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
      <span>Set <code>VITE_GOOGLE_MAPS_API_KEY</code> in Vercel and redeploy.</span>
    </div>
  );
}

// ── State: Maps script loading ─────────────────────────────────────────────────
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

// ── GoogleMap ──────────────────────────────────────────────────────────────────
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

  const [lifecycle,      setLifecycle]      = useState(cfg.configured ? LC.LOADING : LC.UNCONFIGURED);
  const [idleFired,      setIdleFired]      = useState(false);
  const [containerReady, setContainerReady] = useState(false);

  // READY requires BOTH the idle event (map instance created + tiles loaded)
  // AND confirmed nonzero container dimensions. This prevents a blank-success state
  // where the map is technically "loaded" but invisible.
  useEffect(() => {
    if (lifecycle === LC.LOADING && idleFired && containerReady) {
      setLifecycle(LC.READY);
    }
  }, [lifecycle, idleFired, containerReady]);

  // vis.gl status FAILED → LOAD_ERROR; READY is sticky
  useEffect(() => {
    if (status === 'FAILED') {
      setLifecycle(prev => prev === LC.READY ? prev : LC.LOAD_ERROR);
    }
  }, [status]);

  // gm_authFailure → AUTH_ERROR; READY is sticky
  useEffect(() => {
    function onAuthFailure() {
      setLifecycle(prev => prev === LC.READY ? prev : LC.AUTH_ERROR);
    }
    window.addEventListener('fieldcore:maps:auth-failure', onAuthFailure);
    return () => window.removeEventListener('fieldcore:maps:auth-failure', onAuthFailure);
  }, []);

  // Retry event — reset all readiness signals and return to LOADING
  useEffect(() => {
    function onRetry() {
      setIdleFired(false);
      setContainerReady(false);
      setLifecycle(cfg.configured ? LC.LOADING : LC.UNCONFIGURED);
    }
    window.addEventListener('fieldcore:maps:retry', onRetry);
    return () => window.removeEventListener('fieldcore:maps:retry', onRetry);
  }, [cfg.configured]);

  // onIdle: map instance exists and initial tiles have loaded
  const handleIdle = useCallback(() => {
    setIdleFired(true);
    userOnIdle?.();
  }, [userOnIdle]);

  // onContainerReady: MapResizeWatcher confirmed nonzero container dimensions
  const handleContainerReady = useCallback(() => {
    setContainerReady(true);
  }, []);

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

  // LOADING + script not yet in flight → loading placeholder
  if (lifecycle === LC.LOADING && (status === 'NOT_LOADED' || status === 'LOADING')) {
    return <MapLoading className={className} style={style} />;
  }

  // LOADING (status=LOADED) or READY → render live map.
  // MapResizeWatcher inside triggers resize + signals containerReady.
  // onIdle + containerReady together transition to READY.
  const resolvedCenter = safeCenter(center) ?? DEFAULT_CENTER;
  const mapOptions = cfg.mapId
    ? { mapId: cfg.mapId }
    : (branded ? { styles: FIELDCORE_MAP_STYLES } : {});

  // Wrap vis.gl's Map in our own div so className and user style land here.
  // When className is passed directly to vis.gl <Map>, it sets style={undefined} on
  // the container (src/components/map/index.tsx:231). That causes mapDiv (the div
  // vis.gl creates and passes to new google.maps.Map()) to resolve height:100% against
  // a CSS-only parent, which can read as 0 at initialization time. By keeping className
  // on our wrapper and passing only style to <Map>, vis.gl uses combinedStyle as inline
  // styles on its container — giving mapDiv an explicit inline parent height.
  return (
    <div className={className} style={{ width: '100%', height: '100%', ...style }}>
      <Map
        defaultCenter={resolvedCenter}
        defaultZoom={zoom}
        {...mapOptions}
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        zoomControl={true}
        gestureHandling="greedy"
        style={{ width: '100%', height: '100%' }}
        onIdle={handleIdle}
        {...props}
      >
        <MapResizeWatcher onContainerReady={handleContainerReady} />
        {import.meta.env.DEV && (
          <MapDevDiagnostics
            lifecycle={lifecycle}
            idleFired={idleFired}
            containerReady={containerReady}
            center={resolvedCenter}
            zoom={zoom}
          />
        )}
        <MapLayerErrorBoundary>{children}</MapLayerErrorBoundary>
      </Map>
    </div>
  );
}
