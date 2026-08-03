import { useState, useCallback } from 'react';
import api from '../api';

/**
 * Manages route sequence fetch and save for a single technician.
 * Call loadRoute(techId, date?) to populate; saveRoute(techId, jobIds) to persist.
 */
export function useDispatchRouteSequence() {
  const [route,   setRoute]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState(null);

  const loadRoute = useCallback(async (techId, date) => {
    if (!techId) return;
    setLoading(true);
    setError(null);
    try {
      const params = date ? { date } : {};
      const res    = await api.get(`/dispatch/technicians/${techId}/route`, { params });
      setRoute(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load route.');
    } finally {
      setLoading(false);
    }
  }, []);

  const saveRoute = useCallback(async (techId, jobIds) => {
    if (!techId || !jobIds?.length) return false;
    setSaving(true);
    try {
      const res = await api.patch(`/dispatch/technicians/${techId}/route`, { jobIds });
      setRoute(res.data);
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const clearRoute = useCallback(() => {
    setRoute(null);
    setError(null);
  }, []);

  return { route, loading, saving, error, loadRoute, saveRoute, clearRoute };
}
