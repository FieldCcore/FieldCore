import { APIProvider, Map } from '@vis.gl/react-google-maps';

// Read the key directly — no custom config abstraction, no module-scope cache,
// no lifecycle state machine. If the key is absent the placeholder shows; if it
// is present the map renders. Nothing else happens.
const API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();

const CENTER = { lat: 39.5, lng: -98.35 };

// Isolated, minimal Dispatch basemap.
// Bypasses MapProvider, retry context, custom lifecycle, MapResizeWatcher,
// and marker layers. Fills its containing block via position:absolute so
// sizing does not depend on the percentage-height chain from flex parents.
// The parent (.dispatch-map-wrap) already has position:relative.
export function DispatchMap() {
  if (!API_KEY) {
    return (
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f5f3ef', color: '#5F667A',
        fontFamily: 'system-ui, sans-serif', fontSize: 13,
      }}>
        Map unavailable — set VITE_GOOGLE_MAPS_API_KEY in Vercel
      </div>
    );
  }

  return (
    <APIProvider apiKey={API_KEY}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <Map
          defaultCenter={CENTER}
          defaultZoom={4}
          mapTypeId="roadmap"
          gestureHandling="greedy"
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          zoomControl={true}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </APIProvider>
  );
}
