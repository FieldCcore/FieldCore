import { useState, useEffect, useCallback } from 'react';
import api from '../api';

/**
 * Fetches service areas for the account.
 * Returns { areas, loading, error, refresh }.
 * Only fetches when enabled (dispatch_service_areas flag is on).
 */
export function useDispatchServiceAreas(enabled = true) {
  const [areas,   setAreas]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const fetch = useCallback(() => {
    if (!enabled) return;
    api.get('/dispatch/service-areas')
      .then(r => { setAreas(r.data.areas || []); setError(null); })
      .catch(() => { /* keep last known */ });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) { setAreas([]); return; }
    setLoading(true);
    api.get('/dispatch/service-areas')
      .then(r  => { setAreas(r.data.areas || []); setError(null); })
      .catch(() => setError('Failed to load service areas.'))
      .finally(() => setLoading(false));
  }, [enabled]);

  return { areas, loading, error, refresh: fetch };
}
