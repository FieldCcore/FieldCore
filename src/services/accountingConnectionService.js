'use strict';
const pool            = require('../db/pool');
const { encrypt, decrypt } = require('./crypto');

const PROVIDER = 'quickbooks_online';

// Map DB status to customer-facing label
const STATUS_LABELS = {
  not_connected:    'Not Connected',
  connecting:       'Connecting',
  connected:        'Connected',
  syncing:          'Syncing',
  sync_error:       'Sync Error',
  reauth_required:  'Reauthorization Required',
  disconnected:     'Not Connected',
};

async function getConnection(accountId, provider = PROVIDER) {
  const { rows } = await pool.query(
    `SELECT * FROM accounting_connections WHERE account_id = $1 AND provider = $2 LIMIT 1`,
    [accountId, provider]
  );
  return rows[0] || null;
}

async function upsertConnection({
  accountId, provider = PROVIDER, realmId, companyName,
  accessToken, refreshToken, tokenExpiresAt, refreshTokenExpiresAt,
  scopes, connectedByUserId,
}) {
  const { rows } = await pool.query(
    `INSERT INTO accounting_connections
       (account_id, provider, realm_id, company_name, status,
        access_token_enc, refresh_token_enc, token_expires_at, refresh_token_expires_at,
        scopes, connected_by_user_id, connected_at, last_error_code, last_error_message_safe,
        disconnected_at, updated_at)
     VALUES ($1,$2,$3,$4,'connected',$5,$6,$7,$8,$9,$10,NOW(),NULL,NULL,NULL,NOW())
     ON CONFLICT (account_id, provider) DO UPDATE
       SET realm_id                   = EXCLUDED.realm_id,
           company_name               = EXCLUDED.company_name,
           status                     = 'connected',
           access_token_enc           = EXCLUDED.access_token_enc,
           refresh_token_enc          = COALESCE(EXCLUDED.refresh_token_enc, accounting_connections.refresh_token_enc),
           token_expires_at           = EXCLUDED.token_expires_at,
           refresh_token_expires_at   = COALESCE(EXCLUDED.refresh_token_expires_at, accounting_connections.refresh_token_expires_at),
           scopes                     = EXCLUDED.scopes,
           connected_by_user_id       = EXCLUDED.connected_by_user_id,
           connected_at               = NOW(),
           last_error_code            = NULL,
           last_error_message_safe    = NULL,
           disconnected_at            = NULL,
           updated_at                 = NOW()
     RETURNING *`,
    [
      accountId, provider, realmId, companyName,
      encrypt(accessToken),
      refreshToken ? encrypt(refreshToken) : null,
      tokenExpiresAt,
      refreshTokenExpiresAt || null,
      scopes || null,
      connectedByUserId || null,
    ]
  );
  return rows[0];
}

async function updateTokens(accountId, provider = PROVIDER, { accessToken, tokenExpiresAt }) {
  await pool.query(
    `UPDATE accounting_connections
     SET access_token_enc = $1, token_expires_at = $2, updated_at = NOW()
     WHERE account_id = $3 AND provider = $4`,
    [encrypt(accessToken), tokenExpiresAt, accountId, provider]
  );
}

async function updateStatus(accountId, provider = PROVIDER, status, opts = {}) {
  await pool.query(
    `UPDATE accounting_connections
     SET status                  = $1,
         last_error_code         = $2,
         last_error_message_safe = $3,
         updated_at              = NOW()
     WHERE account_id = $4 AND provider = $5`,
    [status, opts.errorCode || null, opts.errorMessage || null, accountId, provider]
  );
}

async function markSyncStarted(accountId, provider = PROVIDER) {
  await pool.query(
    `UPDATE accounting_connections
     SET status = 'syncing', last_sync_attempt_at = NOW(), updated_at = NOW()
     WHERE account_id = $1 AND provider = $2`,
    [accountId, provider]
  );
}

async function markSyncCompleted(accountId, provider = PROVIDER, { hadError, errorCode, errorMessage } = {}) {
  if (hadError) {
    await pool.query(
      `UPDATE accounting_connections
       SET status = 'sync_error', last_sync_at = NOW(),
           last_error_code = $1, last_error_message_safe = $2, updated_at = NOW()
       WHERE account_id = $3 AND provider = $4`,
      [errorCode || 'SYNC_FAILED', errorMessage || 'Sync failed.', accountId, provider]
    );
  } else {
    await pool.query(
      `UPDATE accounting_connections
       SET status = 'connected', last_sync_at = NOW(), last_successful_sync_at = NOW(),
           last_error_code = NULL, last_error_message_safe = NULL, updated_at = NOW()
       WHERE account_id = $1 AND provider = $2`,
      [accountId, provider]
    );
  }
}

async function disconnect(accountId, provider = PROVIDER) {
  await pool.query(
    `UPDATE accounting_connections
     SET status = 'disconnected', access_token_enc = NULL, refresh_token_enc = NULL,
         token_expires_at = NULL, refresh_token_expires_at = NULL,
         disconnected_at = NOW(), updated_at = NOW()
     WHERE account_id = $1 AND provider = $2`,
    [accountId, provider]
  );
}

// Returns the safe status object exposed to the frontend.
async function getConnectionStatus(accountId, provider = PROVIDER) {
  const conn = await getConnection(accountId, provider);
  if (!conn || conn.status === 'not_connected' || conn.status === 'disconnected') {
    return {
      provider,
      status:       'not_connected',
      statusLabel:  STATUS_LABELS.not_connected,
      canConnect:   !!(process.env.QUICKBOOKS_CLIENT_ID && process.env.QUICKBOOKS_CLIENT_SECRET),
    };
  }

  const unmappedCount = await getUnmappedAccountCount(accountId, provider);

  return {
    provider,
    status:                 conn.status,
    statusLabel:            STATUS_LABELS[conn.status] || conn.status,
    companyName:            conn.company_name || null,
    realmId:                conn.realm_id || null,
    lastSyncAt:             conn.last_sync_at || null,
    lastSuccessfulSyncAt:   conn.last_successful_sync_at || null,
    lastSyncAttemptAt:      conn.last_sync_attempt_at || null,
    lastErrorCode:          conn.last_error_code || null,
    lastErrorMessageSafe:   conn.last_error_message_safe || null,
    connectedAt:            conn.connected_at || null,
    unmappedAccountCount:   unmappedCount,
    canConnect:             false,
  };
}

async function getUnmappedAccountCount(accountId, provider = PROVIDER) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM accounting_account_mappings
     WHERE account_id = $1 AND provider = $2
       AND fieldcore_category IS NULL AND is_ignored = FALSE AND is_active = TRUE`,
    [accountId, provider]
  );
  return parseInt(rows[0]?.cnt || 0);
}

// Returns decrypted tokens — server-side only, never returned to client.
async function getDecryptedTokens(accountId, provider = PROVIDER) {
  const conn = await getConnection(accountId, provider);
  if (!conn || !conn.access_token_enc) return null;
  return {
    accessToken:           decrypt(conn.access_token_enc),
    refreshToken:          conn.refresh_token_enc ? decrypt(conn.refresh_token_enc) : null,
    tokenExpiresAt:        conn.token_expires_at,
    refreshTokenExpiresAt: conn.refresh_token_expires_at,
    realmId:               conn.realm_id,
    status:                conn.status,
    accountId:             conn.account_id,
  };
}

module.exports = {
  PROVIDER,
  getConnection,
  upsertConnection,
  updateTokens,
  updateStatus,
  markSyncStarted,
  markSyncCompleted,
  disconnect,
  getConnectionStatus,
  getDecryptedTokens,
  getUnmappedAccountCount,
  STATUS_LABELS,
};
