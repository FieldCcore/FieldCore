import { useState, useEffect, useRef } from 'react';
import api from '../api';

const TTL_MS = 5 * 60 * 1000; // 5-minute cache

let _cache = null;
let _fetchedAt = 0;

// All flags default false until the server responds.
const FLAG_DEFAULTS = {
  dispatch_drag_assignment:    false,
  dispatch_conflict_engine:    false,
  dispatch_workload_balancing: false,
  dispatch_route_sequencing:   false,
  dispatch_service_areas:      false,
  dispatch_emergency_mode:     false,
  dispatch_delay_prediction:   false,
  dispatch_quick_communications: false,
  dispatch_activity_timeline:  false,
  dispatch_predictive_operations_foundation: false,
};

/**
 * Fetches dispatch feature flags once per session (5-min client cache).
 * Returns the merged flag state: server defaults + tenant overrides.
 */
export function useDispatchFeatureFlags() {
  const [flags, setFlags] = useState(_cache || FLAG_DEFAULTS);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const age = Date.now() - _fetchedAt;
    if (_cache && age < TTL_MS) { setFlags(_cache); return; }

    api.get('/dispatch/feature-flags')
      .then(r => {
        _cache     = { ...FLAG_DEFAULTS, ...r.data };
        _fetchedAt = Date.now();
        if (mounted.current) setFlags(_cache);
      })
      .catch(() => {
        // On error keep defaults — feature flags must not block rendering
      });

    return () => { mounted.current = false; };
  }, []);

  return flags;
}
