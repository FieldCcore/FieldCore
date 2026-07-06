import { useEffect } from 'react';
import { APIProvider, useApiIsLoaded, useApiLoadingStatus } from '@vis.gl/react-google-maps';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

if (typeof window !== 'undefined') {
  const hasKey = API_KEY.length > 0;
  console.log(
    '[MapProvider] init | hasKey:', hasKey,
    '| prefix:', hasKey ? API_KEY.slice(0, 8) + '…' : '(empty)',
  );

  window.gm_authFailure = function() {
    console.error('[MapProvider] gm_authFailure — key rejected by Google');
  };

  window.addEventListener('error', function(e) {
    console.error('[MapProvider][window.error]', e.message, e.filename, e.lineno);
  });

  window.addEventListener('unhandledrejection', function(e) {
    console.error('[MapProvider][unhandledrejection]', e.reason);
  });

  // Intercept the Maps JS script tag the instant APIProvider injects it.
  // Logs the full URL and every query parameter so we can see exactly what
  // the browser is asking Google for — key, libraries, version, loading mode.
  const scriptObserver = new MutationObserver(function(mutations) {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeName !== 'SCRIPT') continue;
        const src = node.src || '';
        if (!src.includes('maps.googleapis.com/maps/api/js')) continue;

        scriptObserver.disconnect();

        let url;
        try { url = new URL(src); } catch { console.error('[MapProvider][script] bad URL:', src); continue; }

        const p = url.searchParams;
        const allParams = {};
        p.forEach((v, k) => { allParams[k] = v; });

        console.log('[MapProvider][script] FULL URL:', src);
        console.table({
          key:       { value: p.get('key')      ? p.get('key').slice(0, 8) + '…'  : '(none)', note: 'first 8 chars only' },
          libraries: { value: p.get('libraries') || '(none)',  note: 'APIs requested at load time' },
          v:         { value: p.get('v')         || '(none)',  note: 'Maps JS version' },
          loading:   { value: p.get('loading')   || '(none)',  note: 'async/defer mode' },
          callback:  { value: p.get('callback')  || '(none)',  note: 'internal bootstrap fn' },
          language:  { value: p.get('language')  || '(none)',  note: '' },
          region:    { value: p.get('region')    || '(none)',  note: '' },
        });

        // Also log any parameters not in the known list
        const known = new Set(['key','libraries','v','loading','callback','language','region']);
        const extra = Object.fromEntries(Object.entries(allParams).filter(([k]) => !known.has(k)));
        if (Object.keys(extra).length) console.log('[MapProvider][script] extra params:', extra);
      }
    }
  });
  scriptObserver.observe(document.documentElement, { childList: true, subtree: true });
}

function MapsDiagnostics() {
  const isLoaded = useApiIsLoaded();
  const status   = useApiLoadingStatus();

  useEffect(() => {
    console.log('[MapProvider] status:', status, '| isLoaded:', isLoaded);
  }, [status, isLoaded]);

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

// No global `libraries` prop — the core Maps JS API only.
// Individual components lazy-load what they need via useMapsLibrary().
export function MapProvider({ children }) {
  if (!API_KEY) return <MissingKeyBanner />;

  return (
    <APIProvider apiKey={API_KEY} language="en" region="US">
      <MapsDiagnostics />
      {children}
    </APIProvider>
  );
}
