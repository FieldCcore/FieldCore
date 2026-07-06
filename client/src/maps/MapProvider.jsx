import { useEffect } from 'react';
import { APIProvider, useApiIsLoaded, useApiLoadingStatus } from '@vis.gl/react-google-maps';
import { FIELDCORE_MAP_ID } from './mapStyles';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

// ── Global error listeners — wired once at module evaluation ──────────────────
if (typeof window !== 'undefined') {
  const hasKey = API_KEY.length > 0;
  console.log(
    '[MapProvider] init | hasKey:', hasKey,
    '| prefix:', hasKey ? API_KEY.slice(0, 8) + '…' : '(empty)',
    '| mapId:', FIELDCORE_MAP_ID,
  );

  // Catch Google Maps script-load errors via window.onerror
  const _prevOnerror = window.onerror;
  window.onerror = function(msg, src, line, col, err) {
    const m = String(msg || '').toLowerCase();
    const s = String(src  || '').toLowerCase();
    if (m.includes('google') || s.includes('maps.googleapis') || s.includes('maps/api')) {
      console.error('[MapProvider][onerror]', { msg, src, line, col, err });
    }
    return typeof _prevOnerror === 'function' ? _prevOnerror(msg, src, line, col, err) : false;
  };

  // Catch unhandled promise rejections from Maps async operations
  window.addEventListener('unhandledrejection', function(e) {
    const r   = e.reason;
    const str = String(r?.message || r || '').toLowerCase();
    if (str.includes('google') || str.includes('maps') || str.includes('importlibrary')) {
      console.error('[MapProvider][unhandledrejection]', r);
    }
  });
}

// ── Internal diagnostics component — runs inside APIProvider context ──────────
function MapsDiagnostics() {
  const isLoaded = useApiIsLoaded();
  const status   = useApiLoadingStatus();

  // Log every status transition
  useEffect(() => {
    console.log('[MapProvider] APIProvider status:', status, '| isLoaded:', isLoaded);
  }, [status, isLoaded]);

  // After load: probe each library individually via importLibrary
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

// ── Guard — replaces Google's generic error banner with an actionable message ─
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

// ── MapProvider ───────────────────────────────────────────────────────────────
// Exact JSX rendered when key is present:
//   <APIProvider
//     apiKey={API_KEY}            ← VITE_GOOGLE_MAPS_API_KEY baked at build time
//     libraries={['places','marker','geocoding']}
//     language="en"
//     region="US"
//   >
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
