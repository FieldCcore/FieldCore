import { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react';
import {
  APIProvider,
  useApiIsLoaded,
  useApiLoadingStatus,
  __resetModuleState,
} from '@vis.gl/react-google-maps';
import { getGoogleMapsClientConfig, maskedKey } from './mapsConfig';

// Stable empty array — prevents APIProvider's loader effect from re-running on every render.
// Without this, the default-parameter `libraries = []` inside useGoogleMapsApiLoader creates
// a new array reference on every render, invalidating the effect dep and re-running the effect.
const STABLE_EMPTY_LIBRARIES = Object.freeze([]);

// Default solution channel that vis.gl includes in the Maps JS URL
const SOLUTION_CHANNEL = 'GMP_visgl_rgmlibrary_v1_default';

// ── Retry context ────────────────────────────────────────────────────────────
// MapProvider populates this so GoogleMap can trigger a loader reset without
// knowing about MapProvider's internal retryKey state.
const MapRetryContext = createContext(() => { if (typeof window !== 'undefined') window.location.reload(); });
export function useMapRetry() { return useContext(MapRetryContext); }

// ── Global handler guard ─────────────────────────────────────────────────────
// gm_authFailure and the MutationObserver must survive retries (APIProvider
// remounts); registering them once at module scope (behind a guard) is correct.
let _handlersInstalled = false;

function installGlobalHandlers(apiKey) {
  if (_handlersInstalled || typeof window === 'undefined') return;
  _handlersInstalled = true;

  function suppressGoogleOverlay() {
    if (document.getElementById('fieldcore-maps-error-suppress')) return;
    const style = document.createElement('style');
    style.id = 'fieldcore-maps-error-suppress';
    style.textContent = '.gm-err-container,.gm-style-cc{display:none!important}';
    (document.head || document.documentElement).appendChild(style);
  }

  // Capture the specific Maps error code. Google emits it via console.error
  // synchronously before calling gm_authFailure, so wrapping console.error
  // here reliably captures it for the handler below.
  let _pendingMapsErrorCode = null;
  const _origConsoleError = console.error;
  console.error = function (...args) {
    const msg = String(args[0] ?? '');
    if (msg.includes('Google Maps JavaScript API error:')) {
      const m = msg.match(/error:\s*(\w+MapError)/);
      if (m) _pendingMapsErrorCode = m[1];
    }
    return _origConsoleError.apply(console, args);
  };

  window.gm_authFailure = function () {
    const errorCode = _pendingMapsErrorCode ?? 'MapAuthFailureError';
    _pendingMapsErrorCode = null;
    console.error('[MapProvider] gm_authFailure — Maps JavaScript API key rejected', {
      errorCode,
      maskedKey:   maskedKey(apiKey),
      hostname:    window.location.hostname,
      ts:          new Date().toISOString(),
    });
    suppressGoogleOverlay();
    window.dispatchEvent(new CustomEvent('fieldcore:maps:auth-failure', {
      detail: {
        code:      errorCode,
        hostname:  window.location.hostname,
        maskedKey: maskedKey(apiKey),
        ts:        new Date().toISOString(),
      },
    }));
  };

  window.addEventListener('error', function (e) {
    if (e.filename && e.filename.includes('maps.googleapis.com')) {
      console.error('[MapProvider][window.error]', e.message, e.filename, e.lineno);
    }
  });

  window.addEventListener('unhandledrejection', function (e) {
    const reason = String(e.reason || '').toLowerCase();
    if (reason.includes('google') || reason.includes('maps') || reason.includes('gm_')) {
      console.error('[MapProvider][unhandledrejection]', e.reason);
    }
  });

  // Observe Maps script injection — logs params the moment the script tag is added
  const scriptObserver = new MutationObserver(function (mutations) {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeName !== 'SCRIPT') continue;
        const src = node.src || '';
        if (!src.includes('maps.googleapis.com/maps/api/js')) continue;
        scriptObserver.disconnect();
        if (import.meta.env.DEV) {
          try {
            const url = new URL(src);
            const p = url.searchParams;
            console.log('[MapProvider][script] Maps script injected');
            console.table({
              key:       { value: p.get('key') ? p.get('key').slice(0, 8) + '…' : '(none)', note: 'first 8 chars only' },
              libraries: { value: p.get('libraries') || '(none)' },
              v:         { value: p.get('v')         || '(none)' },
              loading:   { value: p.get('loading')   || '(none)' },
              callback:  { value: p.get('callback')  || '(none)' },
              language:  { value: p.get('language')  || '(none)' },
              region:    { value: p.get('region')    || '(none)' },
            });
          } catch {}
        }
      }
    }
  });
  scriptObserver.observe(document.documentElement, { childList: true, subtree: true });
}

// ── Bootstrap stub reinstall ─────────────────────────────────────────────────
// After __resetModuleState() clears the vis.gl singleton, the old importLibrary
// stub (from the failed load) is still at window.google.maps.importLibrary.
// We delete the stale stub in retry(), then reinstall a fresh one here so the
// next APIProvider mount picks up the fast-path and injects a new script tag.
function reinstallMapsBootstrapStub(apiKey, language, region) {
  if (typeof window === 'undefined') return;
  const g = (window.google = window.google || {});
  const maps = (g.maps = g.maps || {});
  if (maps.importLibrary) return; // stub already present (shouldn't happen after delete)

  const libs = new Set();
  const sp = new URLSearchParams();
  sp.set('key', apiKey);
  if (language) sp.set('language', language);
  if (region)   sp.set('region', region);
  sp.set('solution_channel', SOLUTION_CHANNEL);

  let bootstrapPromise;
  const triggerBootstrap = () =>
    bootstrapPromise ||
    (bootstrapPromise = new Promise(async (resolve, reject) => {
      // One microtask pause: allows concurrent importLibrary(name) calls
      // (from Promise.all(['core','maps'])) to register names before URL is built.
      await Promise.resolve();
      sp.set('libraries', [...libs].join(','));
      sp.set('callback', 'google.maps.__ib__');
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?${sp}`;
      maps.__ib__ = resolve;
      script.onerror = () => reject(new Error('Google Maps JavaScript API could not load.'));
      document.head.appendChild(script);
    }));

  maps.importLibrary = (name, ...args) => {
    libs.add(name);
    return triggerBootstrap().then(() => maps.importLibrary(name, ...args));
  };
}

// ── Inner diagnostics component (rendered inside APIProvider context) ─────────
function MapProviderDiagnostics({ cfg, retryCount }) {
  const isLoaded = useApiIsLoaded();
  const status   = useApiLoadingStatus();

  // DEV-only: full status table written to console and diagnostics global
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const scriptEl = !!document.querySelector('script[src*="maps.googleapis.com"]');
    const diag = {
      configured:               cfg.configured,
      keyLength:                cfg.apiKey.length,
      keySuffix:                cfg.configured ? maskedKey(cfg.apiKey) : '(none)',
      hostname:                 window.location.hostname,
      providerRendered:         true,
      loaderEntered:            status !== 'NOT_LOADED',
      scriptInjectionAttempted: scriptEl,
      scriptPresent:            scriptEl,
      googleMapsAvailable:      !!window.google?.maps,
      loaderState:              status,
      failureCode:              null,
      retryCount,
    };
    window.__FIELDCORE_MAPS_DIAGNOSTICS__ = diag;
    console.group('[FieldCore Maps Diagnostics]');
    console.table(diag);
    console.groupEnd();
  }, [status, isLoaded, cfg, retryCount]);

  // Production-safe: log network-level script load failure.
  // NOTE: Do NOT dispatch fieldcore:maps:auth-failure here — network failure is not
  // an auth failure. gm_authFailure (installed in installGlobalHandlers) handles key rejection.
  useEffect(() => {
    if (status !== 'FAILED') return;
    console.error('[MapProvider] Maps JS script failed to load (network error or request blocked)');
  }, [status]);

  return null;
}

// ── MapProvider ───────────────────────────────────────────────────────────────
export function MapProvider({ children }) {
  // ── Runtime config (NOT module scope) ────────────────────────────────────
  // getGoogleMapsClientConfig() reads import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  // which Vite replaces with the literal build-time value. useMemo prevents
  // repeated calls on re-renders; the result is always the same within a session.
  const cfg = useMemo(() => getGoogleMapsClientConfig(), []);

  // ── Retry mechanism ───────────────────────────────────────────────────────
  // Incrementing retryKey unmounts and remounts APIProvider, giving the vis.gl
  // loader a fresh mount with clean module-state (after __resetModuleState()).
  const [retryKey, setRetryKey] = useState(0);

  const retry = useCallback(() => {
    // 1. Reset vis.gl module-scope singletons (loadingStatus → NOT_LOADED,
    //    serializedApiParams → undefined, listeners cleared)
    try { __resetModuleState(); } catch {}

    // 2. Only destroy + reinstall the bootstrap stub when Maps is NOT yet fully loaded.
    //    If window.google.maps.Map exists, the real API is already running — deleting
    //    importLibrary would force a duplicate <script> injection on the next APIProvider mount.
    const mapsFullyLoaded = typeof window !== 'undefined' && !!window.google?.maps?.Map;
    if (!mapsFullyLoaded) {
      try {
        if (window.google?.maps?.importLibrary) delete window.google.maps.importLibrary;
        if (window.google?.maps?.__ib__)         delete window.google.maps.__ib__;
      } catch {}
      reinstallMapsBootstrapStub(cfg.apiKey, 'en', 'US');
    }

    // 3. Force APIProvider unmount + remount via key change
    setRetryKey(k => k + 1);

    // 4. Signal GoogleMap (and any other children) to reset their lifecycle state
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fieldcore:maps:retry'));
    }
  }, [cfg.apiKey]);

  // ── Global handlers ───────────────────────────────────────────────────────
  // Run after client mount, once per session (module-scope guard).
  useEffect(() => {
    if (cfg.configured) installGlobalHandlers(cfg.apiKey);
  }, [cfg]);

  // ── Dev diagnostics ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__FIELDCORE_MAPS_DIAGNOSTICS__ = {
      configured:               cfg.configured,
      keyLength:                cfg.apiKey.length,
      keySuffix:                cfg.configured ? maskedKey(cfg.apiKey) : '(none)',
      hostname:                 window.location.hostname,
      providerRendered:         false,
      loaderEntered:            false,
      scriptInjectionAttempted: false,
      scriptPresent:            false,
      googleMapsAvailable:      false,
      loaderState:              'NOT_LOADED',
      failureCode:              cfg.failureReason,
      retryCount:               retryKey,
    };
    console.log(
      '[MapProvider] init | configured:', cfg.configured,
      '| keyLength:', cfg.apiKey.length,
      '| keySuffix:', cfg.configured ? maskedKey(cfg.apiKey) : '(none)',
      '| hostname:', window.location.hostname,
      '| failureReason:', cfg.failureReason,
    );
  }, [cfg, retryKey]);

  // ── Gate: no API key → render children with retry context ────────────────
  // Map components render their own placeholder; no APIProvider is mounted.
  // APIProvider must render whenever key is present AND in browser.
  // It must NOT depend on jobs / technicians / coordinates / mapId / Places.
  if (!cfg.configured) {
    return (
      <MapRetryContext.Provider value={retry}>
        {children}
      </MapRetryContext.Provider>
    );
  }

  return (
    <MapRetryContext.Provider value={retry}>
      {/*
       * key={retryKey} forces a full unmount + remount on retry.
       * libraries={STABLE_EMPTY_LIBRARIES} provides a stable array reference so
       * APIProvider's loader useEffect doesn't re-run on every re-render.
       * APIProvider always loads 'core' and 'maps' regardless of the libraries prop.
       */}
      <APIProvider
        key={retryKey}
        apiKey={cfg.apiKey}
        language="en"
        region="US"
        libraries={STABLE_EMPTY_LIBRARIES}
      >
        <MapProviderDiagnostics cfg={cfg} retryCount={retryKey} />
        {children}
      </APIProvider>
    </MapRetryContext.Provider>
  );
}
