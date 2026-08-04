import { useState, useCallback, useRef } from 'react';
import api from '../api';

const VALID_CATEGORIES = ['job', 'location', 'emergency', 'communication', 'dispatch'];

/**
 * Loads dispatch activity for a job or technician on demand.
 *
 * Call: loadActivity('job', jobId) or loadActivity('tech', techId)
 *
 * Distinguishes between loading / success / empty / error states.
 * Never substitutes a failed request with an empty result.
 */
export function useDispatchActivity() {
  const [items,    setItems]    = useState([]);     // normalized activity items
  const [subject,  setSubject]  = useState(null);   // { type, id }
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);   // error string or null
  const [hasData,  setHasData]  = useState(false);  // true once a successful fetch returned items
  const [category, setCategory] = useState(null);   // active filter or null
  const abortRef = useRef(null);

  const loadActivity = useCallback(async (type, id, options = {}) => {
    if (!type || !id) return;

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setSubject({ type, id });
    if (options.category !== undefined) setCategory(options.category ?? null);

    try {
      const params = {};
      if (options.category && VALID_CATEGORIES.includes(options.category)) {
        params.category = options.category;
      }

      const url = type === 'job'
        ? `/dispatch/jobs/${id}/activity`
        : `/dispatch/technicians/${id}/activity`;

      const res = await api.get(url, {
        params,
        signal: controller.signal,
      });

      // Support both new shape (items) and legacy shape (events) for compatibility
      const data = res.data.items ?? res.data.events ?? [];
      setItems(data);
      setHasData(true);
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      // Report the real error — never collapse to empty array
      const msg = err.response?.data?.error
        || (err.response?.status === 403 ? 'You do not have permission to view this activity.'
          : err.response?.status === 404 ? 'Job not found.'
          : 'Activity could not be loaded.');
      setError(msg);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async (cursor) => {
    if (!subject || !cursor || loading) return;
    setLoading(true);
    try {
      const url = subject.type === 'job'
        ? `/dispatch/jobs/${subject.id}/activity`
        : `/dispatch/technicians/${subject.id}/activity`;
      const res = await api.get(url, { params: { cursor, category: category || undefined } });
      const more = res.data.items ?? res.data.events ?? [];
      setItems(prev => [...prev, ...more]);
    } catch {
      // Pagination failure is non-fatal
    } finally {
      setLoading(false);
    }
  }, [subject, loading, category]);

  const filterByCategory = useCallback((cat) => {
    if (!subject) return;
    setCategory(cat || null);
    loadActivity(subject.type, subject.id, { category: cat || null });
  }, [subject, loadActivity]);

  const clearActivity = useCallback(() => {
    abortRef.current?.abort();
    setItems([]);
    setSubject(null);
    setError(null);
    setHasData(false);
    setCategory(null);
  }, []);

  // Invalidate and refetch after a mutation
  const invalidate = useCallback(() => {
    if (!subject) return;
    loadActivity(subject.type, subject.id, { category });
  }, [subject, category, loadActivity]);

  return {
    items,
    // Legacy alias so existing consumers (DispatchActivityTimeline) keep working
    events: items,
    subject, loading, error, hasData, category,
    loadActivity, loadMore, filterByCategory, clearActivity, invalidate,
  };
}
