import { useState, useEffect } from 'react';
import { Map, useMap } from '@vis.gl/react-google-maps';
import { FIELDCORE_MAP_STYLES, FIELDCORE_MAP_ID } from './mapStyles';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

const DEFAULT_CENTER = { lat: 27.9506, lng: -82.4572 };

function resolveMapOptions(branded) {
  if (FIELDCORE_MAP_ID) return { mapId: FIELDCORE_MAP_ID };
  return branded ? { styles: FIELDCORE_MAP_STYLES } : {};
}

// ── Diagnostic: runs inside Map context, inspects the live map instance ────────
function MapDiagnostics({ passedClassName, passedStyle }) {
  const map = useMap();

  useEffect(() => {
    if (!map) {
      console.log('[GoogleMap] map instance null — library not ready yet');
      return;
    }
    const container = map.getDiv(); // the actual DOM node Google Maps attaches to
    const parent    = container?.parentElement;
    const gp        = parent?.parentElement;
    const cs        = container ? getComputedStyle(container) : null;
    const ps        = parent    ? getComputedStyle(parent)    : null;
    const gps       = gp        ? getComputedStyle(gp)        : null;

    console.log('[GoogleMap] ── map instance ready ──');
    console.log('[GoogleMap] props received | className:', passedClassName, '| inlineStyle:', passedStyle);
    console.log('[GoogleMap] mapId in use:', FIELDCORE_MAP_ID || '(none — using styles)');

    console.log('[GoogleMap] container (map.getDiv())', {
      offsetWidth:  container?.offsetWidth,
      offsetHeight: container?.offsetHeight,
      clientWidth:  container?.clientWidth,
      clientHeight: container?.clientHeight,
      computed: cs ? {
        width:      cs.width,
        height:     cs.height,
        position:   cs.position,
        display:    cs.display,
        overflow:   cs.overflow,
        visibility: cs.visibility,
      } : null,
    });

    if (parent) {
      console.log('[GoogleMap] parent (.dispatch-map or wrapper)', {
        className:    parent.className,
        offsetWidth:  parent.offsetWidth,
        offsetHeight: parent.offsetHeight,
        computed: {
          width:    ps.width,
          height:   ps.height,
          position: ps.position,
          display:  ps.display,
          overflow: ps.overflow,
        },
      });
    }

    if (gp) {
      console.log('[GoogleMap] grandparent (.dispatch-map-wrap or above)', {
        className:    gp.className,
        offsetWidth:  gp.offsetWidth,
        offsetHeight: gp.offsetHeight,
        computed: {
          width:    gps.width,
          height:   gps.height,
          position: gps.position,
          display:  gps.display,
        },
      });
    }
  }, [map, passedClassName, passedStyle]);

  return null;
}

// ── Auth failure fallback — replaces map when key is rejected ─────────────────
function MapAuthError({ className, style, onRetry }) {
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
          Maps API key was rejected. Open GCP Console → Credentials, verify the key has Maps JavaScript API enabled, HTTP referrer restrictions include{' '}
          <code>localhost</code>, and billing is active.
        </span>
      ) : (
        <span style={{ color: '#5F667A' }}>
          Unable to load map. Check your connection and try again.
        </span>
      )}
      <button
        onClick={onRetry}
        style={{
          marginTop: 6,
          padding: '8px 20px',
          background: '#1C2333',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 13,
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
  ...props
}) {
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    function handleAuthFailure(e) {
      setAuthError(e.detail || { code: 'unknown' });
    }
    window.addEventListener('fieldcore:maps:auth-failure', handleAuthFailure);
    return () => window.removeEventListener('fieldcore:maps:auth-failure', handleAuthFailure);
  }, []);

  if (!API_KEY) {
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
        <span>Set <code>VITE_GOOGLE_MAPS_API_KEY</code> to enable maps.</span>
      </div>
    );
  }

  if (authError) {
    return (
      <MapAuthError
        className={className}
        style={style}
        onRetry={() => window.location.reload()}
      />
    );
  }

  const mapOptions = resolveMapOptions(branded);

  // DIAGNOSTIC NOTE:
  // @vis.gl/react-google-maps Map renders:
  //   style={className ? undefined : combinedStyle}
  // When className is provided, combinedStyle (which includes position:relative,
  // width:100%, height:100%) is DROPPED. Only the CSS class controls dimensions.
  // If the CSS class lacks position:relative, map layers may not render correctly.

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
      <MapDiagnostics passedClassName={className} passedStyle={style} />
      {children}
    </Map>
  );
}
