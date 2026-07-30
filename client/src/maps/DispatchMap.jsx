import { memo, useEffect, useRef } from 'react';
import { Map } from '@vis.gl/react-google-maps';

// Stable style object — prevents vis.gl from recomputing combinedStyle on every render.
const MAP_STYLE = { width: '100%', height: '100%' };

const CENTER = { lat: 39.5, lng: -98.35 };

function diag(event, data) {
  console.log('[FC-MAP]', event, { t: Date.now(), ...data });
}

function dims(el) {
  if (!el) return 'null';
  const r = el.getBoundingClientRect();
  return `offset=${el.offsetWidth}x${el.offsetHeight} bcr=${Math.round(r.width)}x${Math.round(r.height)}`;
}

// DispatchMap uses the outer MapProvider's APIProvider context (already loaded,
// stable). No inner APIProvider — a second one would re-run the loading effect
// on every Dispatch re-render (libraries=[] is a new ref each time), which
// eventually triggers updateLoadingStatus(FAILED) destroying the map instance.
export const DispatchMap = memo(function DispatchMap() {
  const wrapRef   = useRef(null);
  const mountedAt = useRef(0);

  useEffect(() => {
    const t0 = Date.now();
    mountedAt.current = t0;
    diag('MOUNT');

    function logDims(label) {
      const el = wrapRef.current;
      const parent = el?.parentElement;
      diag(label, {
        wrap:    dims(el),
        parent:  parent ? dims(parent) : 'none',
        elapsed: Date.now() - t0,
      });
    }

    logDims('DIM_AT_MOUNT');
    const t1  = setTimeout(() => logDims('DIM_AT_1S'),   1000);
    const t5  = setTimeout(() => logDims('DIM_AT_5S'),   5000);
    const t15 = setTimeout(() => logDims('DIM_AT_15S'), 15000);
    const t30 = setTimeout(() => logDims('DIM_AT_30S'), 30000);

    let zeroAt = 0;
    const obs = typeof ResizeObserver !== 'undefined' && wrapRef.current
      ? new ResizeObserver(entries => {
          for (const e of entries) {
            const { width, height } = e.contentRect;
            const elapsed = Date.now() - t0;
            if (width === 0 || height === 0) {
              if (!zeroAt) zeroAt = elapsed;
              diag('SIZE_ZERO', { width, height, elapsed });
            }
          }
        })
      : null;
    if (obs) obs.observe(wrapRef.current);

    const domObs = typeof MutationObserver !== 'undefined' && wrapRef.current
      ? new MutationObserver(muts => {
          for (const m of muts) {
            if (m.type === 'childList') {
              const removed = [...m.removedNodes].map(n => n.nodeName + (n.className ? '.' + n.className : ''));
              const added   = [...m.addedNodes  ].map(n => n.nodeName + (n.className ? '.' + n.className : ''));
              if (removed.length || added.length)
                diag('DOM_CHILD', { removed, added, elapsed: Date.now() - t0 });
            }
          }
        })
      : null;
    if (domObs) domObs.observe(wrapRef.current, { childList: true, subtree: true });

    return () => {
      diag('UNMOUNT', { elapsed: Date.now() - t0 });
      clearTimeout(t1); clearTimeout(t5); clearTimeout(t15); clearTimeout(t30);
      if (obs)    obs.disconnect();
      if (domObs) domObs.disconnect();
    };
  }, []);

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0 }}>
      <Map
        defaultCenter={CENTER}
        defaultZoom={4}
        mapTypeId="roadmap"
        gestureHandling="greedy"
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        zoomControl={true}
        style={MAP_STYLE}
        onIdle={() => diag('MAP_IDLE', { elapsed: Date.now() - (mountedAt.current || Date.now()) })}
        onTilesLoaded={() => diag('TILES_LOADED', { elapsed: Date.now() - (mountedAt.current || Date.now()) })}
      />
    </div>
  );
});
