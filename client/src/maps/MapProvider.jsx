import { APIProvider } from '@vis.gl/react-google-maps';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

// Emit one diagnostic log at module evaluation — visible in browser DevTools.
// Prints only the first 8 characters of the key so the secret is never exposed.
if (typeof window !== 'undefined') {
  const hasKey = API_KEY.length > 0;
  console.log(
    '[MapProvider] hasKey:', hasKey,
    '| prefix:', hasKey ? API_KEY.slice(0, 8) + '…' : '(empty)',
  );
}

// Guard component — renders a clear error banner instead of Google's generic
// "This page didn't load Google Maps correctly" message when the key is absent.
function MissingKeyBanner() {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f5f3ef', color: '#1C2333',
      fontFamily: 'system-ui, sans-serif', fontSize: 13,
      flexDirection: 'column', gap: 6, padding: 24, textAlign: 'center',
    }}>
      <strong>Google Maps API key is missing from frontend build.</strong>
      <span style={{ color: '#5F667A', fontSize: 12 }}>
        Set <code>VITE_GOOGLE_MAPS_API_KEY</code> in Vercel → Redeploy.
        <br />For local dev, add it to <code>client/.env.local</code>.
      </span>
    </div>
  );
}

// Single script loader for the entire app.
// Mount this once near the root; all map components and hooks consume it via context.
// Libraries loaded: places (Autocomplete), marker (AdvancedMarker), geocoding (Geocoder).
export function MapProvider({ children }) {
  if (!API_KEY) return <MissingKeyBanner />;

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
