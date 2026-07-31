import { useCallback, useEffect, useRef, useState } from 'react';

// ── Persisted hints (informational only — browser remains authoritative) ──────
// We never use persisted state to gate location features or override the browser.

export const PREFS_KEY = 'fc_loc_prefs';

export function getLocPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); }
  catch { return {}; }
}

export function saveLocPrefs(updates) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...getLocPrefs(), ...updates }));
  } catch {}
}

// ── Permission state labels ───────────────────────────────────────────────────
// 'unknown'           — not yet queried
// 'prompt'            — browser will ask on first getCurrentPosition
// 'granted'           — user allowed this origin
// 'denied'            — user blocked this origin
// 'unavailable'       — Permissions API absent; conservative default
// 'unsupported'       — navigator.geolocation not present
// 'insecure_context'  — page is not served over HTTPS

// maximumAge: 0 forces a fresh fix — no cached result accepted.
const GEO_OPTIONS = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };

function locationErrorMessage(err) {
  if (!err) return 'Your device could not determine its current location.';
  switch (err.code) {
    case 1:  return 'Location permission was denied or blocked by browser, operating-system, or site policy.';
    case 2:  return 'Your device could not determine its current location.';
    case 3:  return 'Location lookup timed out.';
    default: return 'Your device could not determine its current location.';
  }
}

/**
 * Unified Dispatch location hook.
 *
 * The browser is authoritative. Cached state in localStorage is informational
 * only — it never gates access or overrides the live browser permission.
 *
 * @param {object}   [opts]
 * @param {function} [opts.onLocated]  called with GeolocationPosition on success
 * @param {function} [opts.onDenied]   called when getCurrentPosition returns PERMISSION_DENIED
 *
 * @returns {{
 *   permissionState: string,
 *   status: 'idle'|'checking'|'success'|'error',
 *   message: string|null,
 *   tryAgain: () => Promise<void>,
 *   centerOnMe: () => void,
 *   refreshPermission: () => Promise<string>,
 * }}
 */
export function useDispatchLocation({ onLocated, onDenied } = {}) {
  const [permissionState, setPermissionState] = useState('unknown');
  const [status,          setStatus]          = useState('idle');
  const [message,         setMessage]         = useState(null);

  // Keep the latest callbacks in refs so stable closures always call the
  // current version without needing them as hook dependencies.
  const onLocatedRef = useRef(onLocated);
  const onDeniedRef  = useRef(onDenied);
  useEffect(() => { onLocatedRef.current = onLocated; }, [onLocated]);
  useEffect(() => { onDeniedRef.current  = onDenied;  }, [onDenied]);

  // ── Permission query ────────────────────────────────────────────────────────
  // Re-queries the browser's live permission state. Does NOT call getCurrentPosition.
  const refreshPermission = useCallback(async () => {
    if (!navigator.permissions?.query) {
      setPermissionState('unavailable');
      return 'unavailable';
    }
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      setPermissionState(result.state);
      saveLocPrefs({
        lastPermissionStatus:    result.state,
        lastPermissionCheckedAt: new Date().toISOString(),
      });
      return result.state;
    } catch {
      setPermissionState('unavailable');
      return 'unavailable';
    }
  }, []);

  // ── Core location request ───────────────────────────────────────────────────
  // Calls getCurrentPosition directly. Used by both centerOnMe and the granted
  // path of tryAgain. Stable — callbacks are read through refs.
  const requestCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setPermissionState('unsupported');
      setStatus('error');
      setMessage('Location is not supported by this browser.');
      return;
    }
    setStatus('checking');
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPermissionState('granted');
        setStatus('success');
        setMessage(null);
        saveLocPrefs({
          lastPermissionStatus:    'granted',
          lastPermissionCheckedAt: new Date().toISOString(),
        });
        onLocatedRef.current?.(pos);
      },
      (err) => {
        if (err.code === 1 /* PERMISSION_DENIED */) {
          setPermissionState('denied');
          saveLocPrefs({
            lastPermissionStatus:    'denied',
            lastPermissionCheckedAt: new Date().toISOString(),
          });
          onDeniedRef.current?.();
        }
        setStatus('error');
        setMessage(locationErrorMessage(err));
      },
      GEO_OPTIONS
    );
  }, []); // stable — all external references go through refs

  // ── Try Again ───────────────────────────────────────────────────────────────
  // Calls getCurrentPosition directly from the user's click event — no async
  // permission pre-check that could lose user activation or bail out because a
  // Permissions-Policy header made the Permissions API report 'denied' while the
  // actual browser site permission is Allow. The real result from the OS / browser
  // always comes through the success/error callbacks below.
  const tryAgain = useCallback(() => {
    requestCurrentLocation();
  }, [requestCurrentLocation]);

  // ── Initialize: query permission + subscribe to change event ───────────────
  useEffect(() => {
    if (window.isSecureContext === false) {
      setPermissionState('insecure_context');
      return;
    }
    if (!navigator.geolocation) {
      setPermissionState('unsupported');
      return;
    }
    if (!navigator.permissions?.query) {
      const saved = getLocPrefs().lastPermissionStatus;
      setPermissionState(saved && saved !== 'unknown' ? saved : 'unavailable');
      return;
    }

    let mounted = true;
    let permStatus    = null;
    let changeHandler = null;

    navigator.permissions.query({ name: 'geolocation' })
      .then(s => {
        if (!mounted) return;
        permStatus = s;
        setPermissionState(s.state);
        saveLocPrefs({
          lastPermissionStatus:    s.state,
          lastPermissionCheckedAt: new Date().toISOString(),
        });

        changeHandler = () => {
          if (!mounted) return;
          setPermissionState(s.state);
          saveLocPrefs({
            lastPermissionStatus:    s.state,
            lastPermissionCheckedAt: new Date().toISOString(),
          });
          if (s.state === 'granted') { setMessage(null); setStatus('idle'); }
        };
        s.addEventListener('change', changeHandler);
      })
      .catch(() => {
        if (mounted) setPermissionState('unavailable');
      });

    return () => {
      mounted = false;
      if (permStatus && changeHandler) permStatus.removeEventListener('change', changeHandler);
    };
  }, []);

  // ── Refresh on tab focus / visibility return ────────────────────────────────
  // When the user returns from browser settings after granting permission,
  // we recheck so the UI updates without a page reload.
  useEffect(() => {
    async function refresh() {
      const state = await refreshPermission();
      if (state === 'granted') { setMessage(null); setStatus('idle'); }
    }
    function onVisibility() { if (document.visibilityState === 'visible') refresh(); }
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshPermission]);

  return {
    permissionState,
    status,
    message,
    tryAgain,
    centerOnMe: requestCurrentLocation,
    refreshPermission,
  };
}
