import { useState, useEffect, useCallback } from 'react';
import api from '../api';

/**
 * Fetches and toggles emergency dispatch mode.
 * Returns { active, activatedAt, loading, toggling, toggle }.
 * Only fetches when enabled (dispatch_emergency_mode flag is on).
 */
export function useDispatchEmergencyMode(enabled = true) {
  const [active,      setActive]      = useState(false);
  const [activatedAt, setActivatedAt] = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [toggling,    setToggling]    = useState(false);

  useEffect(() => {
    if (!enabled) { setActive(false); setActivatedAt(null); return; }
    setLoading(true);
    api.get('/dispatch/emergency-mode')
      .then(r => {
        setActive(r.data.active ?? false);
        setActivatedAt(r.data.activatedAt ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [enabled]);

  const toggle = useCallback(async () => {
    setToggling(true);
    try {
      const res = await api.patch('/dispatch/emergency-mode', { active: !active });
      setActive(res.data.active);
      setActivatedAt(res.data.activatedAt ?? null);
      return res.data.active;
    } catch {
      return active; // return unchanged state on failure
    } finally {
      setToggling(false);
    }
  }, [active]);

  return { active, activatedAt, loading, toggling, toggle };
}
