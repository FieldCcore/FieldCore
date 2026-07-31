import { memo, useEffect, useRef, useState } from 'react';
import { useApiIsLoaded } from '@vis.gl/react-google-maps';

const CENTER = { lat: 39.5, lng: -98.35 };
const ZOOM   = 4;

const MAP_OPTIONS = {
  center:            CENTER,
  zoom:              ZOOM,
  mapTypeId:         'roadmap',
  disableDefaultUI:  false,
  gestureHandling:   'greedy',
  zoomControl:       true,
  mapTypeControl:    false,
  streetViewControl: false,
  fullscreenControl: false,
};

export const DirectDispatchMap = memo(function DirectDispatchMap() {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const [authFailed, setAuthFailed] = useState(false);

  // useApiIsLoaded() reads the outer MapProvider's APIProvider context.
  // No nested APIProvider is created here.
  const apiLoaded = useApiIsLoaded();

  // Show error state when gm_authFailure fires (API key not authorized for this domain).
  useEffect(() => {
    function onAuthFailure() { setAuthFailed(true); }
    window.addEventListener('fieldcore:maps:auth-failure', onAuthFailure);
    return () => window.removeEventListener('fieldcore:maps:auth-failure', onAuthFailure);
  }, []);

  useEffect(() => {
    if (!apiLoaded) return;
    const container = containerRef.current;
    if (!container || !window.google?.maps?.Map || mapRef.current) return;

    try {
      mapRef.current = new window.google.maps.Map(container, MAP_OPTIONS);
    } catch (err) {
      console.error('[FC-DIRECT-MAP] Map() constructor threw', err);
      return;
    }

    const map = mapRef.current;

    // Trigger resize after one animation frame so Google measures the final layout.
    const rafId = requestAnimationFrame(() => {
      if (!mapRef.current) return;
      window.google.maps.event.trigger(map, 'resize');
      map.setCenter(CENTER);
      map.setZoom(ZOOM);
    });

    return () => {
      cancelAnimationFrame(rafId);
      if (window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(map);
      }
      mapRef.current = null;
    };
  }, [apiLoaded]);

  if (authFailed) {
    return (
      <div className="dispatch-map-stage" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f8f9fa',
      }}>
        <div style={{ textAlign: 'center', color: 'var(--steel)', fontSize: 13, lineHeight: 1.5 }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>⚠</div>
          <div style={{ fontWeight: 700, color: 'var(--navy)' }}>Map unavailable</div>
          <div style={{ fontSize: 11, marginTop: 6, maxWidth: 280 }}>
            Google Maps API key is not authorized for <strong>www.getfieldcore.com</strong>.
            Add this domain to the key's HTTP referrer restrictions in Google Cloud Console.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dispatch-map-stage">
      <div ref={containerRef} className="dispatch-direct-map" />
    </div>
  );
});
