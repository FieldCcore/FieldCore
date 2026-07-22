import { useState, useEffect, useRef } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const _cache = new Map(); // accountId → { data, expiresAt }
const TTL    = 5 * 60 * 1000;

function getCached(accountId) {
  const entry = _cache.get(accountId);
  if (!entry || Date.now() > entry.expiresAt) { _cache.delete(accountId); return null; }
  return entry.data;
}

function setCached(accountId, data) {
  _cache.set(accountId, { data, expiresAt: Date.now() + TTL });
}

/**
 * Hook that returns the current account's effective entitlements.
 *
 * @returns {{ entitlements: object|null, loading: boolean, refresh: function }}
 *
 * Usage:
 *   const { entitlements, loading } = useEntitlements();
 *   if (!entitlements?.capabilities.can_create_multi_day_jobs) { ... }
 */
export function useEntitlements() {
  const { user } = useAuth();
  const accountId = user?.accountId;
  const [entitlements, setEntitlements] = useState(() => getCached(accountId));
  const [loading,      setLoading]      = useState(!getCached(accountId));
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!accountId) { setEntitlements(null); setLoading(false); return; }

    const cached = getCached(accountId);
    if (cached) { setEntitlements(cached); setLoading(false); return; }

    setLoading(true);
    api.get('/entitlements')
      .then(res => {
        if (!mountedRef.current) return;
        setCached(accountId, res.data);
        setEntitlements(res.data);
      })
      .catch(() => {
        // On error fall back to null — UI should default to most restrictive
        if (mountedRef.current) setEntitlements(null);
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
  }, [accountId]);

  function refresh() {
    if (accountId) _cache.delete(accountId);
    setLoading(true);
    api.get('/entitlements')
      .then(res => {
        if (!mountedRef.current) return;
        setCached(accountId, res.data);
        setEntitlements(res.data);
      })
      .catch(() => { if (mountedRef.current) setEntitlements(null); })
      .finally(() => { if (mountedRef.current) setLoading(false); });
  }

  return { entitlements, loading, refresh };
}

/** Invalidate the client-side cache for an account (call after upgrade/downgrade). */
export function invalidateEntitlementsCache(accountId) {
  if (accountId) _cache.delete(accountId);
  else _cache.clear();
}
