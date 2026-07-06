import { useEffect } from 'react';
import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps';

// Renders a polyline overlay on the parent GoogleMap.
// `path` is an array of { lat, lng } objects.
// Re-renders automatically when path or style props change.
export function Polyline({
  path,
  strokeColor = '#1C2333',
  strokeWeight = 3,
  strokeOpacity = 0.85,
}) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !mapsLib || !path?.length) return;

    const polyline = new mapsLib.Polyline({
      map,
      path,
      strokeColor,
      strokeWeight,
      strokeOpacity,
    });

    return () => polyline.setMap(null);
  }, [map, mapsLib, path, strokeColor, strokeWeight, strokeOpacity]);

  return null;
}
