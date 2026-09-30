'use strict';

/**
 * Stage 5 — External Authority API rate limiting.
 *
 * IMPORTANT — LIMITATIONS:
 *   This is an in-process sliding-window rate limiter backed by a plain Map.
 *   It is NOT distributed. Behind a load balancer with N app instances, each
 *   instance enforces its own quota, so effective global limits are up to
 *   N-times the configured value. This is documented and considered
 *   acceptable for MVP. Swap for a Redis-backed implementation when the
 *   platform ships a shared store.
 *
 * Fail-open policy:
 *   We are limiting an authorization API. Failing closed (deny on rate
 *   limiter fault) would deny legitimate evaluation traffic during a
 *   store-outage scenario. Failing open — briefly permitting traffic to
 *   exceed the configured cap during limiter fault — is the lesser evil.
 *   This decision is explicit and documented here.
 *
 * Keys:
 *   perCredential:  credential public_id (via req.machineActor.credential_id)
 *   perTenant:      req.machineActor.account_id
 *   preAuth:        req.ip
 *   No key contains raw credential material.
 *
 * Configurable via env:
 *   AUTHORITY_API_RATE_LIMIT_PER_CREDENTIAL   default 60/min
 *   AUTHORITY_API_RATE_LIMIT_PER_TENANT       default 300/min
 *   AUTHORITY_API_RATE_LIMIT_PRE_AUTH         default 200/min
 */

const audit = require('../services/audit');

const WINDOW_MS = 60 * 1000; // 1 minute sliding window

function _intFromEnv(name, def) {
  const raw = parseInt(process.env[name] || '', 10);
  if (isNaN(raw) || raw <= 0) return def;
  return raw;
}

function limitPerCredential() { return _intFromEnv('AUTHORITY_API_RATE_LIMIT_PER_CREDENTIAL', 60); }
function limitPerTenant()     { return _intFromEnv('AUTHORITY_API_RATE_LIMIT_PER_TENANT',      300); }
function limitPreAuth()       { return _intFromEnv('AUTHORITY_API_RATE_LIMIT_PRE_AUTH',       200); }

// ── Sliding-window buckets ────────────────────────────────────────────────────

const _buckets = new Map(); // key → number[]  (timestamps ms)

function _prune(bucket, now) {
  const cutoff = now - WINDOW_MS;
  while (bucket.length && bucket[0] <= cutoff) bucket.shift();
}

/**
 * @returns {{ allowed: boolean, retryAfterMs: number, count: number }}
 */
function _consume(key, limit) {
  try {
    const now = Date.now();
    let bucket = _buckets.get(key);
    if (!bucket) { bucket = []; _buckets.set(key, bucket); }
    _prune(bucket, now);
    if (bucket.length >= limit) {
      const retryAfterMs = Math.max(0, (bucket[0] + WINDOW_MS) - now);
      return { allowed: false, retryAfterMs, count: bucket.length };
    }
    bucket.push(now);
    return { allowed: true, retryAfterMs: 0, count: bucket.length };
  } catch {
    // Fail-open (documented above).
    return { allowed: true, retryAfterMs: 0, count: 0 };
  }
}

function _send429(res, req, key, scope, retryAfterMs) {
  try {
    audit.log(
      null, null, 'authority.api.rate_limited',
      'authority_api', null,
      { scope, key_kind: scope, retry_after_ms: retryAfterMs,
        request_id: req && req.requestId ? req.requestId : null },
      req && req.ip ? req.ip : null
    );
  } catch { /* swallow */ }
  res.set('Retry-After', String(Math.ceil(retryAfterMs / 1000) || 1));
  return res.status(429).json({
    error:   'RATE_LIMITED',
    code:    'RATE_LIMITED',
    message: `Rate limit exceeded (${scope}).`,
    retry_after_seconds: Math.ceil(retryAfterMs / 1000) || 1,
    request_id: req && req.requestId ? req.requestId : undefined,
  });
}

// ── Middlewares ───────────────────────────────────────────────────────────────

function preAuth(req, res, next) {
  const key = `preauth:${req.ip || 'unknown'}`;
  const r = _consume(key, limitPreAuth());
  if (!r.allowed) return _send429(res, req, key, 'pre_auth', r.retryAfterMs);
  return next();
}

function perCredential(req, res, next) {
  const cid = req.machineActor && req.machineActor.credential_id;
  if (!cid) return next(); // No credential (should not happen after auth) — do not block.
  const key = `cred:${cid}`;
  const r = _consume(key, limitPerCredential());
  if (!r.allowed) return _send429(res, req, key, 'per_credential', r.retryAfterMs);
  return next();
}

function perTenant(req, res, next) {
  const aid = req.machineActor && req.machineActor.account_id;
  if (!aid) return next();
  const key = `tenant:${aid}`;
  const r = _consume(key, limitPerTenant());
  if (!r.allowed) return _send429(res, req, key, 'per_tenant', r.retryAfterMs);
  return next();
}

function _resetForTest() { _buckets.clear(); }

module.exports = {
  preAuth,
  perCredential,
  perTenant,
  _resetForTest,
  limitPerCredential,
  limitPerTenant,
  limitPreAuth,
};
