import { useEffect } from 'react';
import { APIProvider, useApiIsLoaded, useApiLoadingStatus } from '@vis.gl/react-google-maps';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const _maskedKey = API_KEY ? API_KEY.slice(0, 8) + '…' : '(empty)';

if (typeof window !== 'undefined') {
  console.log(
    '[MapProvider] init | hasKey:', API_KEY.length > 0,
    '| prefix:', _maskedKey,
  );

  function suppressGoogleOverlay() {
    if (document.getElementById('fieldcore-maps-error-suppress')) return;
    const style = document.createElement('style');
    style.id = 'fieldcore-maps-error-suppress';
    // Hide Google's native auth-failure overlay so our FieldCore UI shows instead
    style.textContent = '.gm-err-container,.gm-style-cc{display:none!important}';
    (document.head || document.documentElement).appendChild(style);
  }

  window.gm_authFailure = function () {
    console.error('[MapProvider] gm_authFailure — Maps JavaScript API key rejected', {
      maskedKey: _maskedKey,
      hostname: window.location.hostname,
      ts: new Date().toISOString(),
      likelyCauses: [
        '1. HTTP Referrer restriction: add https://www.getfieldcore.com/* in GCP Console → Credentials',
        '2. Maps JavaScript API not enabled in GCP Console → APIs & Services → Library',
        '3. Billing not active on the GCP project',
        '4. API key rotated or deleted without redeploying Vercel (key is baked at build time)',
        '5. VITE_GOOGLE_MAPS_API_KEY set for Preview only, not Production, in Vercel env settings',
      ],
    });

    suppressGoogleOverlay();

    window.dispatchEvent(new CustomEvent('fieldcore:maps:auth-failure', {
      detail: {
        code: 'auth-failure',
        hostname: window.location.hostname,
        maskedKey: _maskedKey,
        ts: new Date().toISOString(),
      },
    }));
  };

  // Only log maps-related JS errors to avoid drowning out unrelated page errors
  window.addEventListener('error', function (e) {
    if (e.filename && e.filename.includes('maps.googleapis.com')) {
      console.error('[MapProvider][window.error]', e.message, e.filename, e.lineno);
    }
  });

  // Only log maps-related promise rejections
  window.addEventListener('unhandledrejection', function (e) {
    const reason = String(e.reason || '').toLowerCase();
    if (reason.includes('google') || reason.includes('maps') || reason.includes('gm_')) {
      console.error('[MapProvider][unhandledrejection]', e.reason);
    }
  });

  // Intercept the Maps JS script tag the instant APIProvider injects it.
  // Logs the full URL and every query parameter so we can see exactly what
  // the browser is asking Google for — key, libraries, version, loading mode.
  const scriptObserver = new MutationObserver(function (mutations) {
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
          key:       { value: p.get('key')      ? p.get('key').slice(0, 8) + '…' : '(none)', note: 'first 8 chars only' },
          libraries: { value: p.get('libraries') || '(none)', note: 'APIs requested at load time' },
          v:         { value: p.get('v')         || '(none)', note: 'Maps JS version' },
          loading:   { value: p.get('loading')   || '(none)', note: 'async/defer mode' },
          callback:  { value: p.get('callback')  || '(none)', note: 'internal bootstrap fn' },
          language:  { value: p.get('language')  || '(none)', note: '' },
          region:    { value: p.get('region')    || '(none)', note: '' },
        });

        const known = new Set(['key', 'libraries', 'v', 'loading', 'callback', 'language', 'region']);
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

    if (status === 'FAILED') {
      // Script load failure (network/blocked) — distinct from auth failure (gm_authFailure)
      console.error('[MapProvider] Maps JS script failed to load — network error or request blocked');
      window.dispatchEvent(new CustomEvent('fieldcore:maps:auth-failure', {
        detail: {
          code: 'load-failed',
          hostname: window.location.hostname,
          maskedKey: _maskedKey,
          ts: new Date().toISOString(),
        },
      }));
    }
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
  if (!API_KEY) {
    // Render the full app normally — map components show a localized placeholder.
    // This keeps non-map pages (dashboard, billing, etc.) working without the key.
    console.warn('[MapProvider] VITE_GOOGLE_MAPS_API_KEY not set — map features disabled');
    return <>{children}</>;
  }

  return (
    <APIProvider apiKey={API_KEY} language="en" region="US">
      <MapsDiagnostics />
      {children}
    </APIProvider>
  );
}
