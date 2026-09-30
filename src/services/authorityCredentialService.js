'use strict';

/**
 * Stage 5 — Authority API Credential Service.
 *
 * Machine credentials for the external Authority Evaluation API.
 *
 * Secret model
 * ────────────
 *   Credential format: `fc_dev_<publicId>_<secret>`
 *     publicId: 16 url-safe base64 chars ( 96 bits, random)
 *     secret:   43 url-safe base64 chars (256 bits, random)
 *     Total:    67 chars, strict parse regex enforced.
 *
 *   We store an HMAC-SHA256 verifier keyed by AUTHORITY_API_CREDENTIAL_KEY,
 *   computed over `publicId + ':' + secret`. The raw secret is returned to
 *   the caller ONCE at issuance and NEVER persisted anywhere in the system.
 *
 *   AUTHORITY_API_CREDENTIAL_KEY is a SEPARATE secret from ENCRYPTION_KEY
 *   and AUTHORITY_DATA_ENCRYPTION_KEY. Compromising one does not compromise
 *   the others.
 *
 * Timing-safety
 * ─────────────
 *   verifyCredential() runs a dummy HMAC + timingSafeEqual on malformed inputs
 *   so the pre-DB code path takes similar wall time regardless of whether the
 *   caller supplied a well-formed credential. This is a defense-in-depth
 *   measure — the primary control is that malformed credentials never touch
 *   the database.
 */

const crypto = require('crypto');
const pool   = require('../db/pool');
const {
  CREDENTIAL_KEY_ENV_VAR,
  validateCredentialKey,
} = require('./authorityExternalConfig');

// ── Registry ──────────────────────────────────────────────────────────────────

const VALID_SCOPES = Object.freeze([
  'authority:evaluate',
  'authority:evaluations:read',
]);

const CREDENTIAL_PREFIX      = 'fc_dev_';
const PUBLIC_ID_LENGTH       = 16;   // url-safe base64 chars → 96 bits
const SECRET_LENGTH          = 43;   // url-safe base64 chars → 256 bits
const CREDENTIAL_FORMAT_RE   = /^fc_dev_([A-Za-z0-9_-]{16})_([A-Za-z0-9_-]{43})$/;
const HMAC_ALGORITHM         = 'hmac-sha256';
const VERIFIER_VERSION       = 1;

// A stable dummy verifier used for constant-time comparison against unknown
// or malformed credentials. Must be the same width as a real HMAC-SHA256 hex.
const DUMMY_VERIFIER_HEX = '0'.repeat(64);

// ── Helpers ───────────────────────────────────────────────────────────────────

function _requireKey() {
  const raw = process.env[CREDENTIAL_KEY_ENV_VAR] || '';
  const v = validateCredentialKey(raw);
  if (!v.valid) {
    const err = new Error(`${CREDENTIAL_KEY_ENV_VAR} is ${v.reason}`);
    err.code = 'CREDENTIAL_KEY_UNAVAILABLE';
    throw err;
  }
  // Normalize hex → bytes, base64 → bytes.
  const s = raw.trim();
  if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0) return Buffer.from(s, 'hex');
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function _randomBase64Url(bytes) {
  // Generate at least `bytes` random bytes then base64url encode; slice to
  // the desired string length so we produce exactly N chars from the alphabet.
  // 32 raw bytes → 43 base64 chars (unpadded), 12 raw bytes → 16 base64 chars.
  const raw = crypto.randomBytes(bytes);
  return raw.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function _newPublicId() {
  // 12 bytes → 16 base64url chars
  const s = _randomBase64Url(12);
  return s.slice(0, PUBLIC_ID_LENGTH);
}

function _newSecret() {
  // 32 bytes → 43 base64url chars
  const s = _randomBase64Url(32);
  return s.slice(0, SECRET_LENGTH);
}

function _computeVerifier(key, publicId, secret) {
  return crypto.createHmac('sha256', key)
    .update(`${publicId}:${secret}`, 'utf8')
    .digest('hex');
}

function _timingSafeEqualHex(aHex, bHex) {
  if (typeof aHex !== 'string' || typeof bHex !== 'string') return false;
  if (aHex.length !== bHex.length) {
    // Still burn ~equal work on unequal-length inputs.
    try {
      const buf = Buffer.from(DUMMY_VERIFIER_HEX, 'hex');
      crypto.timingSafeEqual(buf, buf);
    } catch { /* swallow */ }
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(aHex, 'hex'), Buffer.from(bHex, 'hex'));
  } catch {
    return false;
  }
}

/** Validate a scope array against VALID_SCOPES; returns a normalized frozen copy. */
function _normalizeScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    const e = new Error('scopes must be a non-empty array.'); e.statusCode = 400; throw e;
  }
  const out = [];
  for (const s of scopes) {
    if (typeof s !== 'string' || !VALID_SCOPES.includes(s)) {
      const e = new Error(`Unknown scope: ${s}`); e.statusCode = 400; throw e;
    }
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

function _validateLabel(label) {
  if (typeof label !== 'string' || !label.trim()) {
    const e = new Error('label is required.'); e.statusCode = 400; throw e;
  }
  if (label.length > 100) {
    const e = new Error('label must be ≤100 characters.'); e.statusCode = 400; throw e;
  }
  return label.trim();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a new credential and persist its verifier.
 *
 * Returns { credential, credentialId, publicId, row } — `credential` is the
 * ONLY time the raw secret string is available. The DB row contains the
 * verifier, never the secret.
 *
 * @param {string}  accountId
 * @param {string}  label
 * @param {string[]} scopes  — subset of VALID_SCOPES
 * @param {string|null} createdByUserId
 * @param {pg.Client} [client]  — optional transaction client
 */
async function generateCredential(accountId, label, scopes, createdByUserId, client) {
  const cleanLabel  = _validateLabel(label);
  const cleanScopes = _normalizeScopes(scopes);
  const key         = _requireKey();

  const publicId   = _newPublicId();
  const secret     = _newSecret();
  const verifier   = _computeVerifier(key, publicId, secret);
  const credential = `${CREDENTIAL_PREFIX}${publicId}_${secret}`;

  const q = client || pool;
  const { rows } = await q.query(
    `INSERT INTO authority_api_credentials
       (account_id, public_id, secret_verifier, verifier_version, algorithm,
        label, scopes, created_by_user_id, replaces_credential_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, account_id, public_id, label, status, scopes, created_at,
               created_by_user_id, replaces_credential_id`,
    [
      accountId, publicId, verifier, VERIFIER_VERSION, HMAC_ALGORITHM,
      cleanLabel, cleanScopes, createdByUserId || null, null,
    ]
  );
  return {
    credential,
    credentialId: rows[0].id,
    publicId,
    row:          rows[0],
  };
}

/**
 * Strictly parse and verify a raw credential string.
 *
 * Behaviour:
 *   - Malformed input → runs dummy HMAC then returns null (NO DB lookup).
 *   - Unknown publicId → runs dummy HMAC then returns null.
 *   - Present but verifier mismatch → constant-time compare then returns null.
 *   - Match → returns the full credential row (never includes the secret).
 *
 * Returns { row, verified: true } | null.
 */
async function verifyCredential(rawCredential) {
  let key;
  try { key = _requireKey(); }
  catch { /* key unavailable — do NOT reveal via timing */ }

  // Always compute one HMAC no matter what — keeps timing similar across paths.
  const dummyPublic = 'AAAAAAAAAAAAAAAA';
  const dummySecret = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const _burnHmac = key
    ? _computeVerifier(key, dummyPublic, dummySecret)
    : DUMMY_VERIFIER_HEX;

  if (typeof rawCredential !== 'string') {
    _timingSafeEqualHex(_burnHmac, DUMMY_VERIFIER_HEX);
    return null;
  }
  const m = CREDENTIAL_FORMAT_RE.exec(rawCredential);
  if (!m) {
    _timingSafeEqualHex(_burnHmac, DUMMY_VERIFIER_HEX);
    return null;
  }
  if (!key) {
    // Format is fine but we cannot verify without a key. Fail closed.
    _timingSafeEqualHex(_burnHmac, DUMMY_VERIFIER_HEX);
    return null;
  }

  const [, publicId, secret] = m;

  // Indexed lookup by public_id ONLY. Do not filter by status here — we want
  // to return the row so the caller can decide (auth middleware treats
  // revoked as auth-failed with an identical response shape).
  let row;
  try {
    const { rows } = await pool.query(
      `SELECT id, account_id, public_id, secret_verifier, verifier_version,
              algorithm, label, status, scopes, created_by_user_id, created_at,
              revoked_by_user_id, revoked_at, revocation_reason,
              last_used_at, replaces_credential_id
       FROM authority_api_credentials
       WHERE public_id = $1`,
      [publicId]
    );
    row = rows[0];
  } catch {
    _timingSafeEqualHex(_burnHmac, DUMMY_VERIFIER_HEX);
    return null;
  }

  if (!row) {
    // Unknown publicId — still perform a constant-time compare against a
    // dummy so verification wall time doesn't leak lookup-hit vs miss.
    _timingSafeEqualHex(_burnHmac, DUMMY_VERIFIER_HEX);
    return null;
  }

  const computed = _computeVerifier(key, publicId, secret);
  const ok = _timingSafeEqualHex(computed, row.secret_verifier || DUMMY_VERIFIER_HEX);
  if (!ok) return null;

  return { row, verified: true };
}

async function revokeCredential(credentialId, revokedByUserId, reason, client) {
  if (typeof credentialId !== 'string' || !credentialId) {
    const e = new Error('credentialId is required.'); e.statusCode = 400; throw e;
  }
  if (reason && (typeof reason !== 'string' || reason.length > 500)) {
    const e = new Error('reason must be ≤500 characters.'); e.statusCode = 400; throw e;
  }
  const q = client || pool;
  const { rows } = await q.query(
    `UPDATE authority_api_credentials
        SET status = 'revoked',
            revoked_by_user_id = $2,
            revoked_at = COALESCE(revoked_at, now()),
            revocation_reason = COALESCE($3, revocation_reason)
      WHERE id = $1
      RETURNING id, account_id, public_id, label, status, scopes,
                created_at, created_by_user_id,
                revoked_at, revoked_by_user_id, revocation_reason,
                last_used_at, replaces_credential_id`,
    [credentialId, revokedByUserId || null, reason || null]
  );
  return rows[0] || null;
}

/**
 * Create a new credential linked via replaces_credential_id. Does NOT
 * auto-revoke the old credential — callers rotate at their own pace.
 */
async function replaceCredential(oldCredentialId, newLabel, scopes, createdByUserId, client) {
  const cleanLabel  = _validateLabel(newLabel);
  const cleanScopes = _normalizeScopes(scopes);
  const key         = _requireKey();

  const q = client || pool;
  // Fetch the old credential to inherit account.
  const { rows: oldRows } = await q.query(
    `SELECT id, account_id FROM authority_api_credentials WHERE id = $1`,
    [oldCredentialId]
  );
  if (!oldRows.length) {
    const e = new Error('Credential to replace not found.'); e.statusCode = 404; throw e;
  }
  const accountId = oldRows[0].account_id;

  const publicId   = _newPublicId();
  const secret     = _newSecret();
  const verifier   = _computeVerifier(key, publicId, secret);
  const credential = `${CREDENTIAL_PREFIX}${publicId}_${secret}`;

  const { rows } = await q.query(
    `INSERT INTO authority_api_credentials
       (account_id, public_id, secret_verifier, verifier_version, algorithm,
        label, scopes, created_by_user_id, replaces_credential_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, account_id, public_id, label, status, scopes, created_at,
               created_by_user_id, replaces_credential_id`,
    [
      accountId, publicId, verifier, VERIFIER_VERSION, HMAC_ALGORITHM,
      cleanLabel, cleanScopes, createdByUserId || null, oldCredentialId,
    ]
  );
  return {
    credential,
    credentialId: rows[0].id,
    publicId,
    row:          rows[0],
  };
}

async function listCredentials(accountId, { limit = 100, offset = 0 } = {}) {
  const safeLimit  = Math.min(Math.max(parseInt(limit,  10) || 100, 1), 500);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
  const { rows } = await pool.query(
    `SELECT id, public_id, label, status, scopes,
            created_at, created_by_user_id,
            revoked_at, revoked_by_user_id, revocation_reason,
            last_used_at, replaces_credential_id
     FROM authority_api_credentials
     WHERE account_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [accountId, safeLimit, safeOffset]
  );
  return rows;
}

async function getCredential(credentialId, accountId) {
  const { rows } = await pool.query(
    `SELECT id, public_id, label, status, scopes,
            created_at, created_by_user_id,
            revoked_at, revoked_by_user_id, revocation_reason,
            last_used_at, replaces_credential_id
     FROM authority_api_credentials
     WHERE id = $1 AND account_id = $2`,
    [credentialId, accountId]
  );
  return rows[0] || null;
}

// ── last_used_at throttled writer (module-local; not distributed) ─────────────

const LAST_USED_THROTTLE_MS = 60 * 1000;
const _lastUsedFlushedAt = new Map();

/**
 * Fire-and-forget update to last_used_at for a credential. Throttled to at
 * most one write per 60s per credential to keep write amplification low on
 * hot credentials. Safe to call from an authenticated request handler.
 */
function touchCredentialLastUsed(credentialId) {
  if (!credentialId) return;
  const now = Date.now();
  const last = _lastUsedFlushedAt.get(credentialId) || 0;
  if (now - last < LAST_USED_THROTTLE_MS) return;
  _lastUsedFlushedAt.set(credentialId, now);
  // Fire and forget — errors here MUST NOT surface to the caller.
  pool.query(
    `UPDATE authority_api_credentials SET last_used_at = now() WHERE id = $1`,
    [credentialId]
  ).catch(() => { /* swallow */ });
}

function _resetLastUsedCacheForTest() { _lastUsedFlushedAt.clear(); }

module.exports = {
  VALID_SCOPES,
  CREDENTIAL_KEY_ENV_VAR,
  CREDENTIAL_PREFIX,
  CREDENTIAL_FORMAT_RE,
  HMAC_ALGORITHM,
  VERIFIER_VERSION,
  generateCredential,
  verifyCredential,
  revokeCredential,
  replaceCredential,
  listCredentials,
  getCredential,
  touchCredentialLastUsed,
  _resetLastUsedCacheForTest,
};
