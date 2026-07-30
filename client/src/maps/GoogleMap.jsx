import { useState, useEffect, useMemo } from 'react';
import { Map, useMap, useApiLoadingStatus } from '@vis.gl/react-google-maps';
import { FIELDCORE_MAP_STYLES } from './mapStyles';
import { getGoogleMapsClientConfig, maskedKey } from './mapsConfig';
import { useMapRetry } from './MapProvider';

const DEFAULT_CENTER = { lat: 27.9506, lng: -82.4572 };

// ── State 1: API key absent from this build ───────────────────────────────────
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

// ── State 2: Key present, waiting for Maps JS to load ────────────────────────
function MapLoading({ className, style }) {
  return (
    <div
      className={className}
      style={{ width: '100%', height: '100%', background: '#f5f3ef', ...style }}
      aria-label="Map loading"
    />
  );
}

// ── State 3: Key rejected or script failed to load ───────────────────────────
function MapAuthError({ className, style, onRetry, maskedApiKey }) {
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
          API key rejected or script load failed.{' '}
          Key in this build: <code>{maskedApiKey}</code>.{' '}
          Check GCP Console: enable Maps JavaScript API, verify HTTP referrer restrictions
          include <code>{typeof window !== 'undefined' ? window.location.hostname : 'localhost'}</code>,
          and confirm billing is active.
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

// ── Diagnostic: runs inside Map context, inspects the live map instance ───────
function MapDiagnostics({ passedClassName, passedStyle, mapId }) {
  const map = useMap();

  useEffect(() => {
    if (!map) {
      console.log('[GoogleMap] map instance null — library not ready yet');
      return;
    }
    const container = map.getDiv();
    const parent    = container?.parentElement;
    const gp        = parent?.parentElement;
    const cs        = container ? getComputedStyle(container) : null;
    const ps        = parent    ? getComputedStyle(parent)    : null;
    const gps       = gp        ? getComputedStyle(gp)        : null;

    console.log('[GoogleMap] ── map instance ready ──');
    console.log('[GoogleMap] props received | className:', passedClassName, '| inlineStyle:', passedStyle);
    console.log('[GoogleMap] mapId in use:', mapId || '(none — using styles)');
    console.log('[GoogleMap] container (map.getDiv())', {
      offsetWidth:  container?.offsetWidth,
      offsetHeight: container?.offsetHeight,
      clientWidth:  container?.clientWidth,
      clientHeight: container?.clientHeight,
      computed: cs ? { width: cs.width, height: cs.height, position: cs.position, display: cs.display, overflow: cs.overflow, visibility: cs.visibility } : null,
    });
    if (parent) {
      console.log('[GoogleMap] parent (.dispatch-map or wrapper)', {
        className: parent.className, offsetWidth: parent.offsetWidth, offsetHeight: parent.offsetHeight,
        computed: { width: ps.width, height: ps.height, position: ps.position, display: ps.display, overflow: ps.overflow },
      });
    }
    if (gp) {
      console.log('[GoogleMap] grandparent (.dispatch-map-wrap or above)', {
        className: gp.className, offsetWidth: gp.offsetWidth, offsetHeight: gp.offsetHeight,
        computed: { width: gps.width, height: gps.height, position: gps.position, display: gps.display },
      });
    }
  }, [map, passedClassName, passedStyle, mapId]);

  return null;
}

export function GoogleMap({
  center,
  zoom = 13,
  style,
  className,
  children,
  branded = true,
  ...props
}) {
  // ── Runtime config (NOT module scope) ─────────────────────────────────────
  const cfg = useMemo(() => getGoogleMapsClientConfig(), []);

  // ── Auth error state ───────────────────────────────────────────────────────
  const [authError, setAuthError] = useState(null);

  // useApiLoadingStatus returns 'NOT_LOADED' when called outside APIProvider.
  // When MapProvider skips APIProvider (key absent), status is 'NOT_LOADED',
  // but we return early at the _cfg.configured check before using it.
  const status = useApiLoadingStatus();

  // Retry function from MapProvider's context
  const retry = useMapRetry();

  // Listen for auth-failure events dispatched by MapProvider or gm_authFailure
  useEffect(() => {
    function onAuthFailure(e) {
      setAuthError(e.detail || { code: 'unknown' });
    }
    window.addEventListener('fieldcore:maps:auth-failure', onAuthFailure);
    return () => window.removeEventListener('fieldcore:maps:auth-failure', onAuthFailure);
  }, []);

  // Clear auth error when retry is triggered (so the loading state shows fresh)
  useEffect(() => {
    function onRetry() {
      setAuthError(null);
    }
    window.addEventListener('fieldcore:maps:retry', onRetry);
    return () => window.removeEventListener('fieldcore:maps:retry', onRetry);
  }, []);

  // Belt-and-suspenders: set authError if useApiLoadingStatus reports FAILED
  useEffect(() => {
    if (status === 'FAILED' && !authError) {
      setAuthError({ code: 'load-failed', ts: new Date().toISOString() });
    }
  }, [status, authError]);

  // ── State machine ──────────────────────────────────────────────────────────
  // 1. API key absent from build
  if (!cfg.configured) {
    console.log('[GoogleMap] skipped | failureReason:', cfg.failureReason,
      '| Set VITE_GOOGLE_MAPS_API_KEY in Vercel (Production) and redeploy.');
    return <MapConfigMissing className={className} style={style} />;
  }

  // 2–3. Key present; Maps JS request in flight or not yet started
  if (status === 'NOT_LOADED' || status === 'LOADING') {
    return <MapLoading className={className} style={style} />;
  }

  // 4a. Key rejected or script load error
  if (authError) {
    return (
      <MapAuthError
        className={className}
        style={style}
        onRetry={retry}
        maskedApiKey={maskedKey(cfg.apiKey)}
      />
    );
  }

  // 4b. Loaded — render the live map
  const mapOptions = cfg.mapId ? { mapId: cfg.mapId } : (branded ? { styles: FIELDCORE_MAP_STYLES } : {});

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
      {...props}
    >
      <MapDiagnostics passedClassName={className} passedStyle={style} mapId={cfg.mapId} />
      {children}
    </Map>
  );
}
