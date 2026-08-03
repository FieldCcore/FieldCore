import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';

const POLL_MS = 60_000; // workloads refresh every 60s (less critical than schedule)

/**
 * Fetches and polls technician workload data from /api/dispatch/workloads.
 * Returns { workloads, loading, error, refresh }.
 *
 * workloads: array of WorkloadEntry objects keyed by techId.
 * byTechId: Map<techId, WorkloadEntry> for O(1) lookup.
 */
export function useDispatchWorkloads(dispatchDate, enabled = true) {
  const [workloads,  setWorkloads]  = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const mountedRef  = useRef(true);
  const timerRef    = useRef(null);

  const fetch = useCallback(() => {
    if (!enabled) return;
    const params = dispatchDate ? { date: dispatchDate } : {};
    api.get('/dispatch/workloads', { params })
      .then(r => {
        if (mountedRef.current) {
          setWorkloads(r.data.workloads || []);
          setError(null);
        }
      })
      .catch(() => {
        // Silently keep last known workloads; only set error on first-load failure
        if (mountedRef.current && workloads.length === 0) setError('Could not load workload data.');
      });
  }, [enabled, dispatchDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;
    setLoading(true);
    const params = dispatchDate ? { date: dispatchDate } : {};
    api.get('/dispatch/workloads', { params })
      .then(r => {
        if (mountedRef.current) {
          setWorkloads(r.data.workloads || []);
          setError(null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mountedRef.current) {
          setError('Could not load workload data.');
          setLoading(false);
        }
      });

    timerRef.current = setInterval(() => {
      if (!document.hidden) fetch();
    }, POLL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(timerRef.current);
    };
  }, [dispatchDate, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const byTechId = new Map(workloads.map(w => [w.techId, w]));

  return { workloads, byTechId, loading, error, refresh: fetch };
}
