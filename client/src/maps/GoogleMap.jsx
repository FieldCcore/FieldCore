import { Map } from '@vis.gl/react-google-maps';
import { FIELDCORE_MAP_STYLES, FIELDCORE_MAP_ID } from './mapStyles';

// Default center: Tampa, FL — override with the `center` prop.
const DEFAULT_CENTER = { lat: 27.9506, lng: -82.4572 };

// mapId and styles are mutually exclusive in the Google Maps API.
// When a Cloud Map ID is configured, use it (enables AdvancedMarker).
// When it is absent, fall back to legacy styles.
function resolveMapOptions(branded) {
  if (FIELDCORE_MAP_ID) return { mapId: FIELDCORE_MAP_ID };
  return branded ? { styles: FIELDCORE_MAP_STYLES } : {};
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
      {children}
    </Map>
  );
}
