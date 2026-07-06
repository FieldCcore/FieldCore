import { useCallback } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

// Client-side geocoding via the Google Maps Geocoding service.
// Requires MapProvider to be mounted in the tree.
//
// Usage:
//   const { geocode, isReady } = useGeocoder();
//   const result = await geocode('123 Main St, Tampa FL');
//   // result: { lat, lng, formatted_address }
export function useGeocoder() {
  const geocodingLib = useMapsLibrary('geocoding');

  const geocode = useCallback((address) => {
    if (!geocodingLib) return Promise.reject(new Error('Geocoding library not ready'));

    const geocoder = new geocodingLib.Geocoder();
    return new Promise((resolve, reject) => {
      geocoder.geocode({ address }, (results, status) => {
        if (status !== 'OK' || !results?.length) {
          return reject(new Error(`Geocode failed: ${status}`));
        }
        const r = results[0];
        resolve({
          lat: r.geometry.location.lat(),
          lng: r.geometry.location.lng(),
          formatted_address: r.formatted_address,
        });
      });
    });
  }, [geocodingLib]);

  return { geocode, isReady: !!geocodingLib };
}
