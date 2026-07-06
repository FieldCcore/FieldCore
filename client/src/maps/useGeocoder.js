import { useCallback } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import api from '../api';

// Geocodes an address. Tries client-side first (Maps Geocoding API);
// falls back to the backend proxy (/api/maps/geocode) if the library
// is unavailable or the request fails.
export function useGeocoder() {
  const geocodingLib = useMapsLibrary('geocoding');

  const geocode = useCallback(async (address) => {
    if (geocodingLib) {
      try {
        const geocoder = new geocodingLib.Geocoder();
        return await new Promise((resolve, reject) => {
          geocoder.geocode({ address }, (results, status) => {
            if (status !== 'OK' || !results?.length) return reject(new Error(status));
            const r = results[0];
            resolve({
              lat: r.geometry.location.lat(),
              lng: r.geometry.location.lng(),
              formatted_address: r.formatted_address,
            });
          });
        });
      } catch {
        // fall through to backend
      }
    }
    const res = await api.get('/maps/geocode', { params: { address } });
    return res.data;
  }, [geocodingLib]);

  // isReady is always true — backend fallback ensures geocoding is always available
  return { geocode, isReady: true };
}
