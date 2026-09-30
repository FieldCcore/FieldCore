'use strict';

/**
 * Stage 5 — External Authority API authentication middleware.
 *
 * Responsibilities:
 *   1. Enforce AUTHORITY_EXTERNAL_API_ENABLED (effective) — 403 when OFF.
 *   2. Require Authorization: Bearer <credential> — 401 when missing.
 *   3. Strict-parse the credential; malformed → dummy HMAC + 401 (NO DB lookup).
 *   4. Lookup by publicId; unknown → dummy HMAC + 401.
 *   5. Constant-time verify the secret; mismatch → 401.
 *   6. Reject non-active credentials → 401 (identical wire response).
 *   7. Reject if the credential's account is not an authority-eligible
 *      institution or AUTHORITY_ENABLED is off → 403 AUTHORITY_API_UNAVAILABLE.
 *   8. Enforce the endpoint's required scope → 403 INSUFFICIENT_SCOPE.
 *   9. Populate req.machineActor and schedule a throttled last_used_at write.
 *  10. NEVER log the Authorization header value.
 */

const pool                   = require('../db/pool');
const externalConfig         = require('../services/authorityExternalConfig');
const credentialService      = require('../services/authorityCredentialService');
const audit                  = require('../services/audit');

// Wire error codes — snake-case internal, upper-case external code strings.
const CODES = Object.freeze({
  AUTHORITY_API_UNAVAILABLE: 'AUTHORITY_API_UNAVAILABLE',
  AUTHENTICATION_FAILED:     'AUTHENTICATION_FAILED',
  INSUFFICIENT_SCOPE:        'INSUFFICIENT_SCOPE',
});

/** Build a consistent error body. Never includes credential material. */
function _err(res, status, code, message) {
  return res.status(status).json({
    error:   code,
    code,
    message: message || code,
    request_id: res.req && res.req.requestId ? res.req.requestId : undefined,
  });
}

/**
 * Return an Express middleware requiring `scope` for this endpoint.
 *
 * @param {string} requiredScope  e.g. 'authority:evaluate'
 */
function authorityApiAuth(requiredScope) {
  if (typeof requiredScope !== 'string' || !requiredScope) {
    throw new Error('authorityApiAuth: requiredScope is required.');
  }

  return async function _authorityApiAuth(req, res, next) {
    // Step 1: flag check.
    if (!externalConfig.isExternalApiEnabled()) {
      return _err(res, 403, CODES.AUTHORITY_API_UNAVAILABLE,
        'External Authority API is not enabled.');
    }

    // Step 2: header check.
    const header = req.headers && req.headers.authorization;
    if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) {
      _audit(req, 'authority.api.authentication_failed', {
        reason: 'missing_authorization_header',
      });
      return _err(res, 401, CODES.AUTHENTICATION_FAILED, 'Authentication required.');
    }
    const raw = header.slice(7).trim();

    // Steps 3, 4, 5: strict-parse + lookup + constant-time verify happen
    // atomically inside credentialService.verifyCredential(). Malformed or
    // unknown credentials get a dummy HMAC and return null with no DB write.
    let verified;
    try {
      verified = await credentialService.verifyCredential(raw);
    } catch (err) {
      // Only reached on catastrophic infra failure. Do not leak details.
      _audit(req, 'authority.api.authentication_failed', {
        reason: 'verifier_error',
      });
      return _err(res, 401, CODES.AUTHENTICATION_FAILED, 'Authentication failed.');
    }
    if (!verified) {
      _audit(req, 'authority.api.authentication_failed', {
        reason: 'invalid_credential',
      });
      return _err(res, 401, CODES.AUTHENTICATION_FAILED, 'Authentication failed.');
    }
    const cred = verified.row;

    // Step 6: status active.
    if (cred.status !== 'active') {
      _audit(req, 'authority.api.authentication_failed', {
        credential_id: cred.id,
        reason:        'credential_' + cred.status,
      });
      return _err(res, 401, CODES.AUTHENTICATION_FAILED, 'Authentication failed.');
    }

    // Step 7: account eligibility (AUTHORITY_ENABLED + institution).
    if (process.env.AUTHORITY_ENABLED !== 'true') {
      return _err(res, 403, CODES.AUTHORITY_API_UNAVAILABLE,
        'Authority feature is not enabled for this environment.');
    }
    try {
      const { rows } = await pool.query(
        `SELECT account_type FROM accounts WHERE id = $1`,
        [cred.account_id]
      );
      if (!rows.length || rows[0].account_type !== 'institution') {
        return _err(res, 403, CODES.AUTHORITY_API_UNAVAILABLE,
          'Account is not eligible for external Authority API.');
      }
    } catch (err) {
      return _err(res, 403, CODES.AUTHORITY_API_UNAVAILABLE,
        'Account eligibility check failed.');
    }

    // Step 8: scope check.
    const scopes = Array.isArray(cred.scopes) ? cred.scopes : [];
    if (!scopes.includes(requiredScope)) {
      _audit(req, 'authority.api.scope_denied', {
        credential_id: cred.id,
        required_scope: requiredScope,
      });
      return _err(res, 403, CODES.INSUFFICIENT_SCOPE,
        `Credential is missing required scope: ${requiredScope}.`);
    }

    // Step 9: populate req.machineActor.
    req.machineActor = Object.freeze({
      actor_type:    'api_credential',
      credential_id: cred.id,
      account_id:    cred.account_id,
      scopes:        scopes.slice(),
    });

    // Step 10: schedule throttled last_used_at write.
    credentialService.touchCredentialLastUsed(cred.id);

    return next();
  };
}

// ── Audit helper ──────────────────────────────────────────────────────────────

function _audit(req, action, details) {
  try {
    // Never include the Authorization header. Only aggregate metadata.
    audit.log(
      null, null, action,
      'authority_api', null,
      { ...(details || {}), request_id: req && req.requestId ? req.requestId : null,
        path: req && req.path ? req.path : null,
        method: req && req.method ? req.method : null,
      },
      req && req.ip ? req.ip : null
    );
  } catch { /* audit MUST NOT break auth flow */ }
}

module.exports = { authorityApiAuth, CODES };
