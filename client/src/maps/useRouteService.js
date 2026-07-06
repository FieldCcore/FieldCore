import { useCallback } from 'react';
import api from '../api';

// Calls the backend /api/maps/route proxy which forwards to Google Routes API v2.
// The API key never touches the client.
//
// Usage:
//   const { getRoute } = useRouteService();
//   const result = await getRoute({
//     origin:      { address: '123 Main St, Tampa FL' },   // or { lat, lng }
//     destination: { address: '456 Oak Ave, Tampa FL' },
//     mode: 'DRIVE',  // DRIVE | WALK | BICYCLE | TRANSIT
//   });
//   // result: { distance: { meters, miles }, duration: { seconds, minutes, text }, polyline }
export function useRouteService() {
  const getRoute = useCallback(({ origin, destination, mode = 'DRIVE' }) => {
    return api.post('/maps/route', { origin, destination, mode }).then(r => r.data);
  }, []);

  return { getRoute };
}
