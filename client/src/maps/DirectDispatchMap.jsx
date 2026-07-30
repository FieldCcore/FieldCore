import { memo, useEffect, useRef, useState } from 'react';
import { useApiIsLoaded } from '@vis.gl/react-google-maps';

const CENTER = { lat: 39.5, lng: -98.35 };
const ZOOM   = 4;

// Diagnostic badge labels — visible in the UI upper-left corner of the map.
const BADGE = {
  LOADING:   'MAP SCRIPT LOADING',
  READY:     'MAP API READY',
  CREATED:   'DIRECT MAP CREATED',
  LOST:      'DIRECT MAP CONTAINER LOST',
  UNMOUNTED: 'DIRECT MAP UNMOUNTED',
  ERROR:     'DIRECT MAP ERROR',
};

const BADGE_BG = {
  [BADGE.LOADING]:   '#8A90A2',
  [BADGE.READY]:     '#D4A000',
  [BADGE.CREATED]:   '#2E7D32',
  [BADGE.LOST]:      '#C62828',
  [BADGE.UNMOUNTED]: '#C62828',
  [BADGE.ERROR]:     '#C62828',
};

export const DirectDispatchMap = memo(function DirectDispatchMap() {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const [badge, setBadge] = useState(BADGE.LOADING);

  // useApiIsLoaded() reads from the outer MapProvider's APIProvider context —
  // no nested APIProvider created here.
  const apiLoaded = useApiIsLoaded();

  useEffect(() => {
    if (!apiLoaded) {
      setBadge(BADGE.LOADING);
      return;
    }

    setBadge(BADGE.READY);

    const container = containerRef.current;
    if (!container) {
      setBadge(BADGE.LOST);
      return;
    }

    if (!window.google?.maps?.Map) {
      setBadge(BADGE.ERROR);
      console.error('[FC-DIRECT-MAP] google.maps.Map missing after apiLoaded');
      return;
    }

    if (mapRef.current) return; // already created, don't recreate

    try {
      mapRef.current = new window.google.maps.Map(container, {
        center:            CENTER,
        zoom:              ZOOM,
        mapTypeId:         'roadmap',
        gestureHandling:   'greedy',
        mapTypeControl:    false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl:       true,
      });
      setBadge(BADGE.CREATED);
    } catch (err) {
      setBadge(BADGE.ERROR);
      console.error('[FC-DIRECT-MAP] Map() constructor threw', err);
    }

    return () => {
      mapRef.current = null;
      setBadge(BADGE.UNMOUNTED);
    };
  }, [apiLoaded]);

  return (
    <div className="dispatch-map-stage">
      <div ref={containerRef} className="dispatch-direct-map" />
      <div className="dispatch-map-overlays" />
      <div
        style={{
          position: 'absolute', top: 10, left: 10, zIndex: 20,
          background: BADGE_BG[badge] ?? '#333',
          color: '#fff', fontSize: 10, fontWeight: 700,
          fontFamily: 'monospace', padding: '3px 8px',
          borderRadius: 4, letterSpacing: '.05em',
          pointerEvents: 'none',
        }}
      >
        {badge}
      </div>
    </div>
  );
});
