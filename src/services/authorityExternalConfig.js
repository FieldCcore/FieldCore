'use strict';

/**
 * Stage 5 — External Authority Evaluation API configuration.
 *
 * Centralized feature-flag + key-validation logic for the external API.
 * Internal Stage 1-4 functionality is unaffected by any state read here.
 *
 * The exported functions read process.env at CALL TIME so tests can flip
 * environment variables temporarily without holding stale module state.
 *
 * Effective-enabled semantics
 * ───────────────────────────
 *   External API is EFFECTIVELY enabled iff:
 *     1. AUTHORITY_EXTERNAL_API_ENABLED === 'true'
 *     2. AUTHORITY_API_CREDENTIAL_KEY is present AND >= 32 bytes when decoded
 *
 * If the flag is ON but the key is missing/weak we fail-safe: the effective flag
 * evaluates to FALSE (routes will respond 403 AUTHORITY_API_UNAVAILABLE) and a
 * fatal error is logged ONCE per process to stderr. This deliberately avoids
 * crashing the server on boot so internal authority routes remain reachable.
 */

const CREDENTIAL_KEY_ENV_VAR = 'AUTHORITY_API_CREDENTIAL_KEY';
const FLAG_ENV_VAR           = 'AUTHORITY_EXTERNAL_API_ENABLED';

let _keyFatalLoggedFor = null;

/**
 * Validate the credential-key material (hex or base64), returning { valid, reason, bytes? }.
 * Never returns key material.
 */
function validateCredentialKey(raw) {
  if (!raw || typeof raw !== 'string') return { valid: false, reason: 'missing' };
  const s = raw.trim();
  if (!s) return { valid: false, reason: 'missing' };

  // Try hex first
  if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0) {
    const bytes = s.length / 2;
    if (bytes >= 32) return { valid: true, bytes };
    return { valid: false, reason: 'too_short', bytes };
  }
  // Try base64 / base64url
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    // Buffer.from ignores invalid chars silently — check character set first
    if (!/^[A-Za-z0-9+/=_-]+$/.test(s)) return { valid: false, reason: 'invalid_format' };
    const buf = Buffer.from(b64, 'base64');
    if (buf.length >= 32) return { valid: true, bytes: buf.length };
    return { valid: false, reason: 'too_short', bytes: buf.length };
  } catch {
    return { valid: false, reason: 'invalid_format' };
  }
}

/**
 * Raw flag value (does NOT consider key validity). Useful for admin-route logic
 * that must respect an operator's explicit disable irrespective of key state.
 */
function isFlagEnabled() {
  return process.env[FLAG_ENV_VAR] === 'true';
}

/**
 * True iff the external API is effectively usable right now (flag ON + key valid).
 * Also logs a one-time fatal message if the flag is ON but the key is unusable.
 */
function isExternalApiEnabled() {
  if (!isFlagEnabled()) return false;
  const key = process.env[CREDENTIAL_KEY_ENV_VAR] || '';
  const v = validateCredentialKey(key);
  if (!v.valid) {
    // Log ONCE per (reason, key-length) combo — never log key material.
    const sig = `${v.reason}:${key.length}`;
    if (_keyFatalLoggedFor !== sig) {
      _keyFatalLoggedFor = sig;
      process.stderr.write(
        `[authority-external][FATAL] ${FLAG_ENV_VAR}=true but ${CREDENTIAL_KEY_ENV_VAR} ` +
        `is ${v.reason}. External Authority API is DISABLED. Internal Authority routes ` +
        `are unaffected. Fix: set ${CREDENTIAL_KEY_ENV_VAR} to a >=32-byte hex or base64 secret.\n`
      );
    }
    return false;
  }
  return true;
}

/**
 * Return a redacted config snapshot for logs / /health-style endpoints.
 * NEVER returns key material — only booleans + byte length.
 */
function describeConfig() {
  const flag = isFlagEnabled();
  const key  = process.env[CREDENTIAL_KEY_ENV_VAR] || '';
  const v    = validateCredentialKey(key);
  return {
    flag_enabled:           flag,
    credential_key_present: !!key,
    credential_key_valid:   v.valid,
    credential_key_bytes:   v.valid ? v.bytes : (v.bytes || 0),
    effectively_enabled:    flag && v.valid,
  };
}

/**
 * Test-only: reset the "log once" latch so validation-fatal messages can
 * be re-observed within a test run when env vars change.
 */
function _resetFatalLogLatch() { _keyFatalLoggedFor = null; }

module.exports = {
  CREDENTIAL_KEY_ENV_VAR,
  FLAG_ENV_VAR,
  isFlagEnabled,
  isExternalApiEnabled,
  validateCredentialKey,
  describeConfig,
  _resetFatalLogLatch,
};
