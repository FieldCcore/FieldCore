import { useState, useEffect, useCallback } from 'react';

// ── User preferences (informational only — browser remains authoritative) ────
// We never store a fake "granted" flag that disagrees with the browser.
// These values are hints used for UI decisions, not for bypassing browser policy.

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

// ── Permission states ─────────────────────────────────────────────────────────
// 'unknown'           — initial, not yet queried
// 'prompt'            — browser will ask if we call getCurrentPosition
// 'granted'           — user has allowed geolocation for this origin
// 'denied'            — user has blocked geolocation for this origin
// 'unsupported'       — navigator.geolocation not available
// 'insecure_context'  — HTTPS required but context is not secure
// 'unavailable'       — Permissions API missing, assume prompt as conservative default

/**
 * Shared location-permission hook.
 *
 * The browser remains the authoritative source.  This hook reads from the
 * Permissions API and subscribes to changes.  The stored `lastPermissionStatus`
 * in localStorage is informational only — we never trust it over the browser.
 */
export function useLocationPermission() {
  const [permState, setPermState] = useState('unknown');
  const [checking,  setChecking]  = useState(false);

  useEffect(() => {
    if (window.isSecureContext === false) {
      setPermState('insecure_context');
      return;
    }
    if (!navigator.geolocation) {
      setPermState('unsupported');
      return;
    }
    if (!navigator.permissions) {
      // No Permissions API (older browsers). Start with a conservative default.
      // The stored hint may help avoid a flash of "unknown" but is never trusted
      // to gate permission-required actions.
      const saved = getLocPrefs().lastPermissionStatus;
      setPermState(saved && saved !== 'unknown' ? saved : 'unavailable');
      return;
    }

    let status = null;
    let handler = null;

    navigator.permissions.query({ name: 'geolocation' })
      .then(s => {
        status  = s;
        setPermState(s.state);
        saveLocPrefs({
          lastPermissionStatus:      s.state,
          lastPermissionCheckedAt:   new Date().toISOString(),
        });

        handler = () => {
          setPermState(status.state);
          saveLocPrefs({
            lastPermissionStatus:    status.state,
            lastPermissionCheckedAt: new Date().toISOString(),
          });
        };
        status.addEventListener('change', handler);
      })
      .catch(() => {
        setPermState('unavailable');
      });

    return () => {
      if (status && handler) status.removeEventListener('change', handler);
    };
  }, []);

  /**
   * Request the user's current position.  Requires a user gesture when the
   * browser policy demands interaction (state === 'prompt').
   * Returns a Promise<GeolocationPosition>.
   */
  const requestLocation = useCallback((opts = {}) => {
    if (!navigator.geolocation) return Promise.reject(new Error('UNSUPPORTED'));
    return new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout:            10000,
        maximumAge:         60000,
        ...opts,
      })
    );
  }, []);

  /**
   * Re-query the Permissions API.  Use after "Try Again" or when the user
   * says they updated their browser settings.  Does not call getCurrentPosition.
   */
  const recheck = useCallback(async () => {
    if (!navigator.permissions || !navigator.geolocation) return;
    setChecking(true);
    try {
      const s = await navigator.permissions.query({ name: 'geolocation' });
      setPermState(s.state);
      saveLocPrefs({
        lastPermissionStatus:    s.state,
        lastPermissionCheckedAt: new Date().toISOString(),
      });
    } catch {
      // ignore
    } finally {
      setChecking(false);
    }
  }, []);

  return { permState, checking, requestLocation, recheck };
}
