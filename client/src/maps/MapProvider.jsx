import { useEffect } from 'react';
import { APIProvider, useApiIsLoaded, useApiLoadingStatus } from '@vis.gl/react-google-maps';
import { FIELDCORE_MAP_ID } from './mapStyles';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

// ── Global diagnostics — wired once at module evaluation ──────────────────────
if (typeof window !== 'undefined') {
  const hasKey = API_KEY.length > 0;
  console.log(
    '[MapProvider] init | hasKey:', hasKey,
    '| prefix:', hasKey ? API_KEY.slice(0, 8) + '…' : '(empty)',
    '| mapId:', FIELDCORE_MAP_ID,
  );

  // Google's auth-failure hook — fires when the API key is invalid/unauthorized
  window.gm_authFailure = function() {
    console.error('[MapProvider] gm_authFailure — API key rejected by Google');
  };

  // All JS errors
  window.addEventListener('error', function(e) {
    console.error('[MapProvider][window.error]', e.message, e.filename, e.lineno);
  });

  // All unhandled promise rejections
  window.addEventListener('unhandledrejection', function(e) {
    console.error('[MapProvider][unhandledrejection]', e.reason);
  });
}

// ── APIProvider status — runs inside APIProvider context ──────────────────────
function MapsDiagnostics() {
  const isLoaded = useApiIsLoaded();
  const status   = useApiLoadingStatus();

  useEffect(() => {
    console.log('[MapProvider] APIProvider status:', status, '| isLoaded:', isLoaded);
  }, [status, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    const probe = (lib) =>
      window.google?.maps?.importLibrary?.(lib)
        .then(ns => console.log('[MapProvider] importLibrary("' + lib + '") OK | keys:', Object.keys(ns).slice(0, 6).join(', ')))
        .catch(err => console.error('[MapProvider] importLibrary("' + lib + '") FAILED:', err));
    probe('maps');
    probe('places');
    probe('marker');
    probe('geocoding');
  }, [isLoaded]);

  return null;
}

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

export function MapProvider({ children }) {
  if (!API_KEY) return <MissingKeyBanner />;

  return (
    <APIProvider
      apiKey={API_KEY}
      libraries={['places', 'marker', 'geocoding']}
      language="en"
      region="US"
    >
      <MapsDiagnostics />
      {children}
    </APIProvider>
  );
}
