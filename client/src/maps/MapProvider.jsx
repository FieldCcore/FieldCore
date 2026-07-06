import { APIProvider } from '@vis.gl/react-google-maps';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

// Single script loader for the entire app.
// Mount this once near the root; all map components and hooks consume it via context.
// Libraries loaded: places (Autocomplete), marker (AdvancedMarker), geocoding (Geocoder).
export function MapProvider({ children }) {
  return (
    <APIProvider
      apiKey={API_KEY}
      libraries={['places', 'marker', 'geocoding']}
      language="en"
      region="US"
    >
      {children}
    </APIProvider>
  );
}
