import { useState, useCallback } from 'react';
import api from '../api';

/**
 * Loads dispatch activity for a job or technician on demand.
 * Call loadActivity('job', jobId) or loadActivity('tech', techId).
 */
export function useDispatchActivity() {
  const [events,  setEvents]  = useState([]);
  const [subject, setSubject] = useState(null); // { type, id }
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const loadActivity = useCallback(async (type, id, date) => {
    if (!type || !id) return;
    setLoading(true);
    setError(null);
    setSubject({ type, id });
    try {
      const params = date ? { date } : {};
      const url    = type === 'job'
        ? `/dispatch/jobs/${id}/activity`
        : `/dispatch/technicians/${id}/activity`;
      const res    = await api.get(url, { params });
      setEvents(res.data.events || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load activity.');
    } finally {
      setLoading(false);
    }
  }, []);

  const clearActivity = useCallback(() => {
    setEvents([]);
    setSubject(null);
    setError(null);
  }, []);

  return { events, subject, loading, error, loadActivity, clearActivity };
}
