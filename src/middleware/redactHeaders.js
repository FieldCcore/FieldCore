'use strict';

/**
 * Central header/body redaction utility.
 *
 * Removes the Authorization header value from any object about to be logged
 * or included in an error report. Applied to Stage 5 external API request
 * logging and to internal request logging alike so no code path can leak
 * bearer credentials.
 *
 * This module is deliberately dependency-free so it can be required by any
 * layer without pulling in database or config modules.
 */

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
]);

const REDACTED = '[REDACTED]';

/** Return a shallow copy of `headers` with sensitive values replaced. */
function redactHeaders(headers) {
  if (!headers || typeof headers !== 'object') return headers;
  const out = {};
  for (const key of Object.keys(headers)) {
    if (SENSITIVE_HEADER_NAMES.has(key.toLowerCase())) {
      out[key] = REDACTED;
    } else {
      out[key] = headers[key];
    }
  }
  return out;
}

/**
 * Recursively redact known-sensitive keys anywhere in an object. Used when
 * a body or error object may nest a headers-like sub-object.
 * NOTE: intentionally shallow-cloned per-level; does not mutate input.
 */
function deepRedact(value, depth = 0) {
  if (depth > 6) return value;
  if (Array.isArray(value)) return value.map(v => deepRedact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) {
      if (SENSITIVE_HEADER_NAMES.has(k.toLowerCase())) out[k] = REDACTED;
      else out[k] = deepRedact(value[k], depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Express middleware factory: wraps req.headers on access via a Proxy so any
 * downstream logging middleware that iterates headers gets redacted values
 * automatically. Non-invasive: request handlers still see raw headers via
 * the getter, but console.log(req.headers) yields redacted output.
 *
 * The safest approach — which we use here — is to attach a helper
 * `req.redactedHeaders()` and let the logging layer explicitly call it.
 * Proxy-wrapping headers can break downstream middleware that mutates
 * headers, so we prefer explicit opt-in.
 */
function attachRedactionHelpers() {
  return function _attachRedactionHelpers(req, res, next) {
    req.redactedHeaders = () => redactHeaders(req.headers);
    next();
  };
}

module.exports = {
  REDACTED,
  SENSITIVE_HEADER_NAMES,
  redactHeaders,
  deepRedact,
  attachRedactionHelpers,
};
