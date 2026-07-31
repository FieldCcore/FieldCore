import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from './loadGoogleMaps';

const DEFAULT_CENTER = { lat: 39.5, lng: -98.35 };
const DEFAULT_ZOOM   = 4;

function mapsErrorMessage(code) {
  if (code === 'ApiTargetBlockedMapError') {
    return "Google Maps is blocked by this key's API restrictions. " +
      'In Google Cloud Console, open the key and allow Maps JavaScript API.';
  }
  if (code === 'RefererNotAllowedMapError') {
    return 'Add www.getfieldcore.com/* to HTTP referrer restrictions ' +
      'in Google Cloud Console → APIs & Services → Credentials.';
  }
  return `Map authorization failed (${code ?? 'unknown'}). ` +
    'Check Google Cloud Console → APIs & Services → Credentials.';
}

const MAP_OPTIONS = {
  center:            DEFAULT_CENTER,
  zoom:              DEFAULT_ZOOM,
  mapTypeId:         'roadmap',
  disableDefaultUI:  false,
  gestureHandling:   'greedy',
  zoomControl:       true,
  mapTypeControl:    false,
  streetViewControl: false,
  fullscreenControl: false,
};

// onMapReady is captured via ref so callers can pass an arrow function without
// triggering a map re-initialisation on every render.
export default function DispatchBaseMap({ onMapReady }) {
  const containerRef  = useRef(null);
  const mapRef        = useRef(null);
  const onReadyRef    = useRef(onMapReady);
  const readyRef      = useRef(false);
  const authFailedRef = useRef(false);
  const [status,    setStatus]    = useState('loading');
  const [errorCode, setErrorCode] = useState(null);

  // Keep the callback ref current without re-running the init effect.
  onReadyRef.current = onMapReady;

  // Detect auth failure dispatched by MapProvider's gm_authFailure handler.
  // authFailedRef prevents markReady from overriding the error state if idle
  // fires after gm_authFailure (an empty restricted map is immediately "idle").
  useEffect(() => {
    function onAuthFailure(e) {
      authFailedRef.current = true;
      setStatus('error');
      setErrorCode(mapsErrorMessage(e.detail?.code));
    }
    window.addEventListener('fieldcore:maps:auth-failure', onAuthFailure);
    return () => window.removeEventListener('fieldcore:maps:auth-failure', onAuthFailure);
  }, []);

  // Map initialisation — runs once on mount, never recreates the map.
  useEffect(() => {
    let cancelled  = false;
    let fallbackId = null;

    // markReady is idempotent — only the first caller wins.
    // Skips if auth failure already fired (idle on a restricted map fires immediately
    // with empty tiles; we must not override the error state with ready).
    function markReady(_source) {
      if (readyRef.current || cancelled || authFailedRef.current) return;
      readyRef.current = true;
      setStatus('ready');
      setErrorCode(null);
      onReadyRef.current?.(mapRef.current);
    }

    async function initMap() {
      try {
        const maps = await loadGoogleMaps();
        if (cancelled) return;

        const container = containerRef.current;
        if (!container || !container.isConnected) throw new Error('MAP_CONTAINER_MISSING');

        const rect = container.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) throw new Error('MAP_CONTAINER_ZERO_SIZE');

        // Guard: already initialised (strict-mode double-invoke or parent remount)
        if (mapRef.current) return;

        mapRef.current = new maps.Map(container, MAP_OPTIONS);

        // Trigger resize after one animation frame so Google measures
        // the final settled layout rather than mid-transition dimensions.
        requestAnimationFrame(() => {
          if (!mapRef.current || cancelled) return;
          maps.event.trigger(mapRef.current, 'resize');
        });

        // Both idle and tilesloaded signal that the basemap is rendered.
        // readyRef guards against the second one calling markReady again.
        maps.event.addListenerOnce(mapRef.current, 'idle',        () => markReady('idle'));
        maps.event.addListenerOnce(mapRef.current, 'tilesloaded', () => markReady('tilesloaded'));

        // Bounded DOM fallback: if neither idle nor tilesloaded reaches React
        // within 3 seconds, check whether the map DOM actually exists and, if
        // so, clear the loading overlay rather than leaving it stuck forever.
        fallbackId = setTimeout(() => {
          if (!mapRef.current || cancelled) return;
          const c = containerRef.current;
          if (!c || !c.isConnected) return;
          const r = c.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return;
          if (!c.querySelector('.gm-style')) return;
          markReady('dom-fallback');
        }, 3000);

      } catch (err) {
        if (cancelled) return;
        const code = err instanceof Error ? err.message : 'MAP_INITIALIZATION_FAILED';
        setStatus('error');
        setErrorCode(code);
        console.error('[DispatchBaseMap]', code);
      }
    }

    initMap();

    return () => {
      cancelled = true;
      if (fallbackId !== null) clearTimeout(fallbackId);
      // Intentionally do NOT destroy the map instance here — unmounting
      // DispatchBaseMap should be rare (only on full Dispatch unmount).
      // Destroying the map on every React re-render would recreate it on
      // every Dispatch data update.
    };
  }, []); // empty deps — init exactly once

  return (
    <div className="dispatch-base-map-root">
      {/* Google Maps writes its DOM directly into this div.
          Do not conditionally unmount or clear this element. */}
      <div
        ref={containerRef}
        className="dispatch-base-map-canvas"
        aria-label="FieldCore Dispatch map"
      />

      {status === 'loading' && (
        <div className="dispatch-map-loading">
          <span style={{ fontSize: 12, color: 'var(--steel)' }}>Loading map…</span>
        </div>
      )}

      {status === 'error' && (
        <div className="dispatch-map-error">
          <div style={{ textAlign: 'center', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>
              Map unavailable
            </div>
            <div style={{ fontSize: 11, color: 'var(--steel)', maxWidth: 300 }}>
              {errorCode}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
