import { useEffect } from 'react';
import { APIProvider, useApiIsLoaded, useApiLoadingStatus } from '@vis.gl/react-google-maps';
import { getGoogleMapsClientConfig, maskedKey } from './mapsConfig';

const _cfg = getGoogleMapsClientConfig();

// ── Auth-failure handler — registered at module load (before any Maps script runs) ─
if (typeof window !== 'undefined') {
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
      maskedKey:   maskedKey(_cfg.apiKey),
      hostname:    window.location.hostname,
      ts:          new Date().toISOString(),
      likelyCauses: [
        '1. HTTP Referrer restriction: add https://www.getfieldcore.com/* in GCP Console → Credentials',
        '2. Maps JavaScript API not enabled in GCP Console → APIs & Services → Library',
        '3. Billing not active on the GCP project',
        '4. VITE_GOOGLE_MAPS_API_KEY was changed in Vercel but the project was not redeployed',
        '5. VITE_GOOGLE_MAPS_API_KEY is scoped to Preview/Development only, not Production',
      ],
    });

    suppressGoogleOverlay();

    window.dispatchEvent(new CustomEvent('fieldcore:maps:auth-failure', {
      detail: {
        code:      'auth-failure',
        hostname:  window.location.hostname,
        maskedKey: maskedKey(_cfg.apiKey),
        ts:        new Date().toISOString(),
      },
    }));
  };

  // Only log maps-related JS errors — don't drown out unrelated page errors
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
  // the browser is asking Google for — key prefix, libraries, version, loading mode.
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
          key:       { value: p.get('key') ? p.get('key').slice(0, 8) + '…' : '(none)', note: 'first 8 chars only' },
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

// ── Dev-only diagnostic console group ────────────────────────────────────────
function DevDiagnostics() {
  const isLoaded = useApiIsLoaded();
  const status   = useApiLoadingStatus();

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    console.group('[FieldCore Maps Diagnostics]');
    console.table({
      'config present':   _cfg.configured,
      'masked key suffix': _cfg.configured ? maskedKey(_cfg.apiKey) : '(none)',
      'loader state':     status,
      'script present':   !!document.querySelector('script[src*="maps.googleapis.com"]'),
      'google global':    typeof window !== 'undefined' && !!window.google?.maps,
      'hostname':         typeof window !== 'undefined' ? window.location.hostname : '(ssr)',
      'retry count':      0,
      'skipped reason':   _cfg.failureReason || '(none)',
    });
    console.groupEnd();
  }, [status, isLoaded]);

  useEffect(() => {
    if (status === 'FAILED') {
      console.error('[MapProvider] Maps JS script failed to load (network error or request blocked)');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fieldcore:maps:auth-failure', {
          detail: {
            code:      'load-failed',
            hostname:  window.location.hostname,
            maskedKey: maskedKey(_cfg.apiKey),
            ts:        new Date().toISOString(),
          },
        }));
      }
    }
  }, [status]);

  return null;
}

// ── Production diagnostics (status logging only, no console.table overhead) ───
function ProdDiagnostics() {
  const isLoaded = useApiIsLoaded();
  const status   = useApiLoadingStatus();

  useEffect(() => {
    console.log('[MapProvider] status:', status, '| isLoaded:', isLoaded,
      '| key:', maskedKey(_cfg.apiKey),
      '| host:', typeof window !== 'undefined' ? window.location.hostname : '(ssr)');
  }, [status, isLoaded]);

  useEffect(() => {
    if (status === 'FAILED') {
      console.error('[MapProvider] Maps JS script failed to load');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fieldcore:maps:auth-failure', {
          detail: {
            code:      'load-failed',
            hostname:  window.location.hostname,
            maskedKey: maskedKey(_cfg.apiKey),
            ts:        new Date().toISOString(),
          },
        }));
      }
    }
  }, [status]);

  return null;
}

// No global `libraries` prop — the core Maps JS API only.
// Individual components lazy-load what they need via useMapsLibrary().
export function MapProvider({ children }) {
  if (!_cfg.configured) {
    // Render the full app normally — map components show localized placeholders.
    // This keeps non-map pages (dashboard, billing, etc.) working without the key.
    return <>{children}</>;
  }

  const Diagnostics = import.meta.env.DEV ? DevDiagnostics : ProdDiagnostics;

  return (
    <APIProvider apiKey={_cfg.apiKey} language="en" region="US">
      <Diagnostics />
      {children}
    </APIProvider>
  );
}
