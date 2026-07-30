import { memo, useEffect, useRef, useState } from 'react';
import { useApiIsLoaded } from '@vis.gl/react-google-maps';

// Step 8: diagnostic center / zoom per spec
const CENTER = { lat: 26.2712, lng: -80.2706 };
const ZOOM   = 11;

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

function logDims(label, el) {
  if (!el) { console.log('[FC-DIRECT-MAP]', label, 'null'); return; }
  const r = el.getBoundingClientRect();
  console.log('[FC-DIRECT-MAP]', label, {
    isConnected:  el.isConnected,
    offsetW:      el.offsetWidth,
    offsetH:      el.offsetHeight,
    clientW:      el.clientWidth,
    clientH:      el.clientHeight,
    bcrW:         Math.round(r.width),
    bcrH:         Math.round(r.height),
    bcrTop:       Math.round(r.top),
    bcrLeft:      Math.round(r.left),
    display:      getComputedStyle(el).display,
    visibility:   getComputedStyle(el).visibility,
    overflow:     getComputedStyle(el).overflow,
    position:     getComputedStyle(el).position,
    zIndex:       getComputedStyle(el).zIndex,
    bgColor:      getComputedStyle(el).backgroundColor,
    opacity:      getComputedStyle(el).opacity,
  });
}

// Step 8: exact map options
const MAP_OPTIONS = {
  center:            CENTER,
  zoom:              ZOOM,
  mapTypeId:         'roadmap',
  disableDefaultUI:  false,
  gestureHandling:   'greedy',
  zoomControl:       true,
  mapTypeControl:    true,
  streetViewControl: true,
  fullscreenControl: true,
};

export const DirectDispatchMap = memo(function DirectDispatchMap() {
  const containerRef     = useRef(null);
  const diagContainerRef = useRef(null); // Step 13 fixed diagnostic map
  const mapRef           = useRef(null);
  const [badge, setBadge] = useState(BADGE.LOADING);

  const apiLoaded = useApiIsLoaded();

  useEffect(() => {
    if (!apiLoaded) {
      setBadge(BADGE.LOADING);
      return;
    }

    setBadge(BADGE.READY);
    console.log('[FC-DIRECT-MAP] apiLoaded=true, google.maps.Map available:', !!window.google?.maps?.Map);

    const container = containerRef.current;

    // Step 3 / Step 1: measure container at construction time
    logDims('container@construction', container);

    if (!container) { setBadge(BADGE.LOST); return; }
    if (!window.google?.maps?.Map) {
      setBadge(BADGE.ERROR);
      console.error('[FC-DIRECT-MAP] google.maps.Map missing after apiLoaded=true');
      return;
    }

    if (mapRef.current) return;

    console.log('[FC-DIRECT-MAP] creating map with options', JSON.stringify(MAP_OPTIONS));

    let map;
    try {
      map = new window.google.maps.Map(container, MAP_OPTIONS);
      mapRef.current = map;
      setBadge(BADGE.CREATED);
      console.log('[FC-DIRECT-MAP] Map() constructor returned, mapRef set');
    } catch (err) {
      setBadge(BADGE.ERROR);
      console.error('[FC-DIRECT-MAP] Map() constructor threw', err);
      return;
    }

    // Step 10: listen for internal map events
    const t0 = Date.now();
    const MAP_EVENTS = [
      'idle', 'tilesloaded', 'bounds_changed',
      'center_changed', 'zoom_changed', 'maptypeid_changed', 'projection_changed',
    ];
    const listeners = MAP_EVENTS.map(evt =>
      window.google.maps.event.addListenerOnce(map, evt, () => {
        console.log(`[FC-DIRECT-MAP] event:${evt}`, {
          elapsed:   Date.now() - t0,
          center:    map.getCenter()?.toJSON?.() ?? null,
          zoom:      map.getZoom?.() ?? null,
          mapTypeId: map.getMapTypeId?.() ?? null,
          hasBounds: !!map.getBounds?.(),
        });
      })
    );

    // Step 2/6: check gm-style at 100ms and 500ms
    function inspectGmStyle(label) {
      const gmStyle = container.querySelector('.gm-style');
      const gBcr    = gmStyle?.getBoundingClientRect();
      console.log(`[FC-DIRECT-MAP] gm-style@${label}`, {
        exists:      !!gmStyle,
        childCount:  gmStyle?.childElementCount ?? 0,
        offsetW:     gmStyle?.offsetWidth ?? 0,
        offsetH:     gmStyle?.offsetHeight ?? 0,
        bcrW:        Math.round(gBcr?.width ?? 0),
        bcrH:        Math.round(gBcr?.height ?? 0),
        images:      container.querySelectorAll('img').length,
        canvases:    container.querySelectorAll('canvas').length,
        buttons:     container.querySelectorAll('button').length,
        divs:        container.querySelectorAll('div').length,
      });
      // Step 4: elementsFromPoint at map center
      const cb  = container.getBoundingClientRect();
      const pts = [
        ['center',      cb.left + cb.width / 2,  cb.top + cb.height / 2],
        ['upper-left',  cb.left + 20,             cb.top + 20],
        ['upper-right', cb.right - 20,            cb.top + 20],
        ['lower-left',  cb.left + 20,             cb.bottom - 20],
        ['lower-right', cb.right - 20,            cb.bottom - 20],
      ];
      pts.forEach(([name, x, y]) => {
        const stack = document.elementsFromPoint(x, y)
          .slice(0, 8)
          .map(e => `${e.tagName}${e.className ? '.' + String(e.className).trim().slice(0, 40) : ''}`);
        console.log(`[FC-DIRECT-MAP] elementsFromPoint@${name}`, stack);
      });
    }

    const t100  = setTimeout(() => inspectGmStyle('100ms'),  100);
    const t500  = setTimeout(() => inspectGmStyle('500ms'),  500);
    const t2000 = setTimeout(() => inspectGmStyle('2000ms'), 2000);

    // Step 11: resize after one animation frame
    const rafId = requestAnimationFrame(() => {
      if (!mapRef.current) return;
      logDims('container@raf-before-resize', container);
      window.google.maps.event.trigger(map, 'resize');
      map.setCenter(CENTER);
      map.setZoom(ZOOM);
      console.log('[FC-DIRECT-MAP] resize triggered, center/zoom reset');
    });

    // Step 13: create isolated fixed-position diagnostic map
    const diagEl = diagContainerRef.current;
    if (diagEl && !diagEl._diagMap) {
      try {
        const diagMap = new window.google.maps.Map(diagEl, MAP_OPTIONS);
        diagEl._diagMap = diagMap;
        requestAnimationFrame(() => {
          if (!diagEl._diagMap) return;
          window.google.maps.event.trigger(diagMap, 'resize');
          diagMap.setCenter(CENTER);
          diagMap.setZoom(ZOOM);
        });
        window.google.maps.event.addListenerOnce(diagMap, 'tilesloaded', () => {
          console.log('[FC-DIRECT-MAP] Step13 fixed diag map: tilesloaded — Google integration works');
        });
        console.log('[FC-DIRECT-MAP] Step13 fixed diagnostic map created');
      } catch (e) {
        console.error('[FC-DIRECT-MAP] Step13 diagnostic map threw', e);
      }
    }

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(t100);
      clearTimeout(t500);
      clearTimeout(t2000);
      if (map && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(map);
      }
      listeners.forEach(l => { try { l.remove(); } catch (_) {} });
      mapRef.current = null;
      if (diagContainerRef.current) diagContainerRef.current._diagMap = null;
      setBadge(BADGE.UNMOUNTED);
    };
  }, [apiLoaded]);

  return (
    <>
      {/* Primary map — Step 12: no overlay wrapper, badge only */}
      <div className="dispatch-map-stage">
        <div ref={containerRef} className="dispatch-direct-map" />
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

      {/* Step 13: isolated fixed diagnostic map — remove after root cause confirmed */}
      <div
        ref={diagContainerRef}
        style={{
          position: 'fixed', top: 220, left: 700,
          width: 600, height: 500,
          zIndex: 99999, background: 'white',
          border: '3px solid red',
        }}
      />
    </>
  );
});
