import { useState, useEffect } from 'react';
import api from '../api';

/**
 * usePriorities — shared priority engine for the Dashboard.
 *
 * Fetches /api/analytics/priorities and returns a sorted array of
 * actionable items. Each item: { type, count, label, sub, route, tone }
 *
 * Reusable across any Dashboard widget that needs to surface priorities.
 */
export default function usePriorities() {
  const [priorities, setPriorities] = useState([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    api.get('/analytics/priorities')
      .then(r => setPriorities(Array.isArray(r.data) ? r.data : []))
      .catch(() => setPriorities([]))
      .finally(() => setLoading(false));
  }, []);

  return { priorities, loading };
}
