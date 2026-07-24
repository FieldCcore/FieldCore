/**
 * googleReviews.js — compatibility shim
 *
 * All new code should import from:
 *   - src/services/crypto.js        (encrypt/decrypt)
 *   - src/services/reviewProviders  (getProvider)
 *
 * This module is kept so that existing callers (scheduler, tests) continue to
 * work while being updated incrementally.
 */

const pool             = require('../db/pool');
const { encrypt, decrypt } = require('./crypto');
const { getProvider }  = require('./reviewProviders');

async function getConnection(accountId) {
  const { rows } = await pool.query(
    `SELECT cra.*
     FROM connected_review_accounts cra
     JOIN review_providers rp ON rp.id = cra.provider_id AND rp.provider_key = 'google'
     WHERE cra.account_id = $1`,
    [accountId]
  );
  return rows[0] || null;
}

async function getValidToken(conn) {
  const provider = getProvider('google');
  return provider.getValidToken(conn);
}

async function syncReviews(accountId) {
  const conn = await getConnection(accountId);
  if (!conn || conn.connection_status === 'disconnected') return { synced: 0 };

  const { rows: locs } = await pool.query(
    `SELECT * FROM review_locations
     WHERE connected_account_id = $1 AND is_active = TRUE AND is_primary = TRUE
     LIMIT 1`,
    [conn.id]
  );
  const location = locs[0];
  if (!location) return { synced: 0, error: 'No active location selected' };

  try {
    const provider = getProvider('google');
    const result   = await provider.syncReviews(conn, location);
    return { synced: result.created };
  } catch (err) {
    await pool.query(
      `UPDATE connected_review_accounts
       SET connection_status = $1, last_sync_error = $2, updated_at = NOW()
       WHERE id = $3`,
      [err.message.includes('401') ? 'expired' : 'error', err.message, conn.id]
    );
    return { synced: 0, error: err.message };
  }
}

module.exports = { encrypt, decrypt, getConnection, syncReviews, getValidToken };
