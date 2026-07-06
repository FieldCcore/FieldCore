import { useEffect } from 'react';
import { Map, useMap } from '@vis.gl/react-google-maps';
import { FIELDCORE_MAP_STYLES, FIELDCORE_MAP_ID } from './mapStyles';

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

export function GoogleMap({
  center,
  zoom = 13,
  style,
  className,
  children,
  branded = true,
  ...props
}) {
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
