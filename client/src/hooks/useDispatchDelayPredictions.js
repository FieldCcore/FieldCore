import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';

const POLL_MS = 60_000;

/**
 * Polls /dispatch/delay-predictions every 60 s when enabled.
 * Returns { predictions, byTechId (Map for O(1) lookup), loading, error, refresh }.
 */
export function useDispatchDelayPredictions(dispatchDate, enabled = true) {
  const [predictions, setPredictions] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const mountedRef = useRef(true);
  const timerRef   = useRef(null);

  const fetch = useCallback(() => {
    if (!enabled) return;
    const params = dispatchDate ? { date: dispatchDate } : {};
    api.get('/dispatch/delay-predictions', { params })
      .then(r => { if (mountedRef.current) { setPredictions(r.data.predictions || []); setError(null); } })
      .catch(() => { /* keep last known */ });
  }, [enabled, dispatchDate]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) { setPredictions([]); return; }
    setLoading(true);
    const params = dispatchDate ? { date: dispatchDate } : {};
    api.get('/dispatch/delay-predictions', { params })
      .then(r => {
        if (mountedRef.current) { setPredictions(r.data.predictions || []); setError(null); setLoading(false); }
      })
      .catch(() => {
        if (mountedRef.current) { setError('Could not load delay predictions.'); setLoading(false); }
      });

    timerRef.current = setInterval(() => { if (!document.hidden) fetch(); }, POLL_MS);
    return () => { mountedRef.current = false; clearInterval(timerRef.current); };
  }, [dispatchDate, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const byTechId = new Map(predictions.map(p => [p.techId, p]));
  return { predictions, byTechId, loading, error, refresh: fetch };
}
