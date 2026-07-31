import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from './loadGoogleMaps';

const DEFAULT_CENTER = { lat: 39.5, lng: -98.35 };
const DEFAULT_ZOOM   = 4;

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
  const [status,    setStatus]    = useState('loading');
  const [errorCode, setErrorCode] = useState(null);

  // Keep the callback ref current without re-running the init effect.
  onReadyRef.current = onMapReady;

  // Detect auth failure dispatched by MapProvider's gm_authFailure handler.
  useEffect(() => {
    function onAuthFailure() {
      setStatus('error');
      setErrorCode(
        'ApiTargetBlockedMapError — add www.getfieldcore.com/* to HTTP referrer restrictions ' +
        'in Google Cloud Console → APIs & Services → Credentials.'
      );
    }
    window.addEventListener('fieldcore:maps:auth-failure', onAuthFailure);
    return () => window.removeEventListener('fieldcore:maps:auth-failure', onAuthFailure);
  }, []);

  // Map initialisation — runs once on mount, never recreates the map.
  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      try {
        const maps = await loadGoogleMaps();
        if (cancelled) return;

        const container = containerRef.current;
        if (!container || !container.isConnected) throw new Error('MAP_CONTAINER_MISSING');

        const rect = container.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) throw new Error('MAP_CONTAINER_ZERO_SIZE');

        // Guard: already initialised (strict-mode double-invoke)
        if (mapRef.current) return;

        mapRef.current = new maps.Map(container, MAP_OPTIONS);

        // Trigger resize after one animation frame so Google measures
        // the final settled layout rather than mid-transition dimensions.
        requestAnimationFrame(() => {
          if (!mapRef.current || cancelled) return;
          maps.event.trigger(mapRef.current, 'resize');
        });

        maps.event.addListenerOnce(mapRef.current, 'idle', () => {
          if (cancelled) return;
          setStatus('ready');
          onReadyRef.current?.(mapRef.current);
        });

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
