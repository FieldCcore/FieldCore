import { Map } from '@vis.gl/react-google-maps';
import { FIELDCORE_MAP_STYLES, FIELDCORE_MAP_ID } from './mapStyles';

// Default center: Tampa, FL — override with the `center` prop.
const DEFAULT_CENTER = { lat: 27.9506, lng: -82.4572 };

export function GoogleMap({
  center,
  zoom = 13,
  style,
  className,
  children,
  // Allow callers to opt out of FieldCore styles (e.g. satellite view)
  branded = true,
  ...props
}) {
  return (
    <Map
      defaultCenter={center ?? DEFAULT_CENTER}
      defaultZoom={zoom}
      mapId={FIELDCORE_MAP_ID}
      mapTypeControl={false}
      streetViewControl={false}
      fullscreenControl={false}
      zoomControl={true}
      gestureHandling="greedy"
      styles={branded ? FIELDCORE_MAP_STYLES : undefined}
      style={{ width: '100%', height: '100%', ...style }}
      className={className}
      {...props}
    >
      {children}
    </Map>
  );
}
