/**
 * Authority-domain encryption module.
 *
 * Uses a SEPARATE key (AUTHORITY_DATA_ENCRYPTION_KEY) from the general ENCRYPTION_KEY.
 * Produces a versioned ciphertext envelope that supports future key rotation and
 * KMS migration without changing call sites.
 *
 * Envelope format: v{version}:{keyId}:{ivHex}:{encHex}:{tagHex}
 *
 * Fields encrypted with this module: authority_parties.display_name,
 *   authority_documents.original_filename
 */
const crypto = require('crypto');

const ALG      = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit IV for AES-256-GCM

// Key-version and key-id stored in the envelope allow rotation and future KMS look-up.
const KEY_VERSION = process.env.AUTHORITY_KEY_VERSION || '1';
const KEY_ID      = process.env.AUTHORITY_KEY_ID      || 'k1';

// ── Key provider abstraction ──────────────────────────────────────────────────
// Returns the raw key Buffer. Throws if the key is absent or invalid.
// Replace this function body to swap for KMS without changing call sites.
function _loadKey() {
  const hex = process.env.AUTHORITY_DATA_ENCRYPTION_KEY || '';
  if (!hex) {
    throw new Error(
      '[authorityCrypto] AUTHORITY_DATA_ENCRYPTION_KEY is not set. Authority encryption unavailable.'
    );
  }
  if (hex.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(
      '[authorityCrypto] AUTHORITY_DATA_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).'
    );
  }
  if (hex === '0'.repeat(64)) {
    throw new Error(
      '[authorityCrypto] AUTHORITY_DATA_ENCRYPTION_KEY is the all-zeros placeholder. Set a real key.'
    );
  }
  const general = (process.env.ENCRYPTION_KEY || '').toLowerCase();
  if (general && hex.toLowerCase() === general) {
    throw new Error(
      '[authorityCrypto] AUTHORITY_DATA_ENCRYPTION_KEY must differ from ENCRYPTION_KEY.'
    );
  }
  return Buffer.from(hex, 'hex');
}

// ── Encryption ────────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string with the Authority key.
 * A fresh random 96-bit IV is generated on every call, so the same plaintext
 * produces different ciphertext each time.
 *
 * @param {string} plaintext
 * @returns {string}  versioned ciphertext envelope
 */
function encrypt(plaintext) {
  const key    = _loadKey();
  const iv     = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const enc    = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return `v${KEY_VERSION}:${KEY_ID}:${iv.toString('hex')}:${enc.toString('hex')}:${tag.toString('hex')}`;
}

// ── Decryption ────────────────────────────────────────────────────────────────

/**
 * Decrypt a versioned ciphertext envelope produced by encrypt().
 * Throws on any failure — never returns partial or garbage plaintext.
 *
 * @param {string} stored  versioned ciphertext envelope
 * @returns {string}  plaintext
 */
function decrypt(stored) {
  if (!stored || typeof stored !== 'string') {
    throw new Error('[authorityCrypto] Invalid ciphertext: expected a non-empty string.');
  }
  const parts = stored.split(':');
  if (parts.length !== 5) {
    throw new Error(
      '[authorityCrypto] Invalid ciphertext envelope — expected 5 colon-separated parts.'
    );
  }
  const [version, , ivHex, encHex, tagHex] = parts;
  if (version !== 'v1') {
    throw new Error(
      `[authorityCrypto] Unsupported envelope version "${version}". Only v1 is supported.`
    );
  }
  const key      = _loadKey();
  const iv       = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  try {
    const plain = Buffer.concat([
      decipher.update(Buffer.from(encHex, 'hex')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } catch {
    throw new Error(
      '[authorityCrypto] Decryption failed — ciphertext may be tampered or the wrong key is in use.'
    );
  }
}

// ── Validation helpers ────────────────────────────────────────────────────────

/** Returns the current key version (stored in the envelope for rotation tracking). */
function getKeyVersion() {
  return KEY_VERSION;
}

/**
 * Validate the Authority key configuration without loading or using key material.
 * Used by startup checks and config tests.
 *
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateKeyConfig() {
  const hex     = process.env.AUTHORITY_DATA_ENCRYPTION_KEY || '';
  if (!hex)                                               return { valid: false, reason: 'missing' };
  if (hex.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) return { valid: false, reason: 'invalid_format' };
  if (hex === '0'.repeat(64))                             return { valid: false, reason: 'all_zeros' };
  const general = (process.env.ENCRYPTION_KEY || '').toLowerCase();
  if (general && hex.toLowerCase() === general)           return { valid: false, reason: 'same_as_general_key' };
  return { valid: true };
}

module.exports = { encrypt, decrypt, getKeyVersion, validateKeyConfig };
