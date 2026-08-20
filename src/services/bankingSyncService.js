'use strict';

const pool                  = require('../db/pool');
const { encrypt, decrypt }  = require('./crypto');
const { plaidBankingAdapter } = require('./plaidBankingAdapter');

const CONN_STATUSES = {
  CONNECTED:       'CONNECTED',
  SYNCING:         'SYNCING',
  DEGRADED:        'DEGRADED',
  REAUTH_REQUIRED: 'REAUTH_REQUIRED',
  SYNC_ERROR:      'SYNC_ERROR',
  DISCONNECTED:    'DISCONNECTED',
};

// ── Internal helpers ──────────────────────────────────────────────────────────

async function getConnection(connectionId, accountId) {
  const { rows } = await pool.query(
    `SELECT * FROM bank_connections WHERE id = $1 AND account_id = $2`,
    [connectionId, accountId]
  );
  return rows[0] || null;
}

async function getConnectionByItemId(itemId) {
  const { rows } = await pool.query(
    `SELECT * FROM bank_connections WHERE provider_item_id = $1 AND status != 'DISCONNECTED'`,
    [itemId]
  );
  return rows[0] || null;
}

async function setConnectionStatus(connectionId, status, extra = {}) {
  const fields = ['status = $2', 'updated_at = NOW()'];
  const params = [connectionId, status];

  if (extra.lastSyncAt !== undefined) {
    params.push(extra.lastSyncAt || null);
    fields.push(`last_sync_at = $${params.length}`);
  }
  if (extra.lastSuccessfulSyncAt !== undefined) {
    params.push(extra.lastSuccessfulSyncAt || null);
    fields.push(`last_successful_sync_at = $${params.length}`);
  }
  if (extra.lastErrorCode !== undefined) {
    params.push(extra.lastErrorCode || null);
    fields.push(`last_error_code = $${params.length}`);
  }
  if (extra.lastErrorMessageSafe !== undefined) {
    params.push(extra.lastErrorMessageSafe || null);
    fields.push(`last_error_message_safe = $${params.length}`);
  }

  await pool.query(
    `UPDATE bank_connections SET ${fields.join(', ')} WHERE id = $1`,
    params
  );
}

async function getSyncCursor(connectionId, accountId) {
  const { rows } = await pool.query(
    `SELECT cursor FROM bank_sync_cursors WHERE connection_id = $1 AND account_id = $2`,
    [connectionId, accountId]
  );
  return rows[0]?.cursor || null;
}

async function upsertSyncCursor(connectionId, accountId, cursor) {
  await pool.query(
    `INSERT INTO bank_sync_cursors (connection_id, account_id, cursor)
     VALUES ($1, $2, $3)
     ON CONFLICT (connection_id) DO UPDATE SET cursor = EXCLUDED.cursor, updated_at = NOW()`,
    [connectionId, accountId, cursor]
  );
}

// ── Account upsert ────────────────────────────────────────────────────────────

async function upsertAccounts(connectionId, accountId, accounts) {
  const saved = [];
  for (const acct of accounts) {
    const { rows } = await pool.query(
      `INSERT INTO bank_accounts (
         bank_connection_id, account_id, provider_account_id,
         name, official_name, mask, type, subtype, currency,
         current_balance, available_balance, limit_balance,
         include_in_cash_position, is_active
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,TRUE)
       ON CONFLICT (bank_connection_id, provider_account_id)
       DO UPDATE SET
         name               = EXCLUDED.name,
         official_name      = EXCLUDED.official_name,
         mask               = EXCLUDED.mask,
         current_balance    = EXCLUDED.current_balance,
         available_balance  = EXCLUDED.available_balance,
         limit_balance      = EXCLUDED.limit_balance,
         updated_at         = NOW()
       RETURNING *`,
      [
        connectionId, accountId, acct.providerAccountId,
        acct.name, acct.officialName, acct.mask, acct.type, acct.subtype, acct.currency,
        acct.currentBalance, acct.availableBalance, acct.limitBalance,
        acct.includeInCashPosition,
      ]
    );
    saved.push(rows[0]);
  }
  return saved;
}

async function updateBalances(connectionId, accountId, balanceMap) {
  for (const [providerAccountId, balances] of Object.entries(balanceMap)) {
    await pool.query(
      `UPDATE bank_accounts
       SET current_balance   = $1,
           available_balance = $2,
           limit_balance     = $3,
           updated_at        = NOW()
       WHERE bank_connection_id = $4
         AND account_id = $5
         AND provider_account_id = $6`,
      [
        balances.currentBalance, balances.availableBalance, balances.limitBalance,
        connectionId, accountId, providerAccountId,
      ]
    );

    // Balance snapshot
    await pool.query(
      `INSERT INTO bank_balance_snapshots (account_id, bank_account_id, current_balance, available_balance, captured_at)
       SELECT $1, ba.id, $2, $3, NOW()
       FROM bank_accounts ba
       WHERE ba.bank_connection_id = $4
         AND ba.account_id = $5
         AND ba.provider_account_id = $6`,
      [accountId, balances.currentBalance, balances.availableBalance, connectionId, accountId, providerAccountId]
    );
  }
}

// ── Transfer detection ────────────────────────────────────────────────────────
// Detects transactions that are internal transfers between the business's own accounts.
// Matches: same absolute amount, opposite directions, within 2 business days, same connection.

async function detectInternalTransfers(connectionId, accountId, newTxIds) {
  if (newTxIds.length === 0) return;

  await pool.query(
    `UPDATE bank_transactions t1
     SET reconciliation_status = 'TRANSFER'
     FROM bank_transactions t2
     WHERE t1.bank_connection_id = $1
       AND t1.account_id = $2
       AND t2.bank_connection_id = $1
       AND t2.account_id = $2
       AND t1.id != t2.id
       AND t1.amount = t2.amount
       AND t1.direction != t2.direction
       AND ABS(t1.posted_date - t2.posted_date) <= 2
       AND t1.pending = FALSE
       AND t2.pending = FALSE
       AND t1.reconciliation_status = 'UNMATCHED'
       AND t2.reconciliation_status = 'UNMATCHED'
       AND (t1.id = ANY($3::uuid[]) OR t2.id = ANY($3::uuid[]))`,
    [connectionId, accountId, newTxIds]
  );
}

// ── Transaction upsert ────────────────────────────────────────────────────────

async function upsertTransactions(connectionId, accountId, transactions) {
  const upsertedIds = [];

  for (const tx of transactions) {
    // Find local bank_account.id by provider_account_id
    const { rows: acctRows } = await pool.query(
      `SELECT id FROM bank_accounts WHERE bank_connection_id = $1 AND provider_account_id = $2`,
      [connectionId, tx.providerAccountId]
    );
    if (!acctRows[0]) continue;
    const bankAccountId = acctRows[0].id;

    const { rows } = await pool.query(
      `INSERT INTO bank_transactions (
         account_id, bank_connection_id, bank_account_id,
         provider_transaction_id, provider_pending_transaction_id,
         authorized_date, posted_date, description, merchant_name,
         amount, direction, currency, pending,
         personal_finance_category_primary, personal_finance_category_detailed,
         payment_channel, iso_currency_code, unofficial_currency_code,
         reconciliation_status, excluded_from_analytics, raw_metadata_safe
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'UNMATCHED',FALSE,$19)
       ON CONFLICT (account_id, provider_transaction_id) DO UPDATE SET
         description                         = EXCLUDED.description,
         merchant_name                       = EXCLUDED.merchant_name,
         amount                              = EXCLUDED.amount,
         direction                           = EXCLUDED.direction,
         pending                             = EXCLUDED.pending,
         posted_date                         = EXCLUDED.posted_date,
         authorized_date                     = EXCLUDED.authorized_date,
         personal_finance_category_primary   = EXCLUDED.personal_finance_category_primary,
         personal_finance_category_detailed  = EXCLUDED.personal_finance_category_detailed,
         provider_pending_transaction_id     = EXCLUDED.provider_pending_transaction_id,
         raw_metadata_safe                   = EXCLUDED.raw_metadata_safe,
         updated_at                          = NOW()
       RETURNING id`,
      [
        accountId, connectionId, bankAccountId,
        tx.providerTransactionId, tx.providerPendingTransactionId,
        tx.authorizedDate, tx.postedDate, tx.description, tx.merchantName,
        tx.amount, tx.direction, tx.currency, tx.pending,
        tx.personalFinanceCategoryPrimary, tx.personalFinanceCategoryDetailed,
        tx.paymentChannel, tx.isoCurrencyCode, tx.unofficialCurrencyCode,
        JSON.stringify(tx.rawMetadataSafe),
      ]
    );
    if (rows[0]) upsertedIds.push(rows[0].id);
  }

  return upsertedIds;
}

async function removeTransactions(accountId, providerTransactionIds) {
  if (providerTransactionIds.length === 0) return;
  await pool.query(
    `DELETE FROM bank_transactions
     WHERE account_id = $1 AND provider_transaction_id = ANY($2::text[])`,
    [accountId, providerTransactionIds]
  );
}

// ── Reconciliation with FieldCore Payments ────────────────────────────────────
// Matches bank deposits (CASH_IN, posted, not TRANSFER) against deposits/payouts.

async function reconcileWithFieldCorePayments(accountId) {
  // Match bank CASH_IN transactions to fieldcore deposits by amount + date proximity
  await pool.query(
    `INSERT INTO financial_reconciliation_matches
       (account_id, bank_transaction_id, fieldcore_payment_id, match_type, confidence, status, matched_at)
     SELECT
       bt.account_id,
       bt.id,
       d.id,
       'bank_to_deposit',
       'high',
       'MATCHED',
       NOW()
     FROM bank_transactions bt
     JOIN deposits d ON d.account_id = bt.account_id
       AND ROUND(d.amount::numeric, 2) = bt.amount
       AND ABS(bt.posted_date - COALESCE(d.collected_at::date, d.created_at::date)) <= 3
     WHERE bt.account_id = $1
       AND bt.direction = 'CASH_IN'
       AND bt.pending = FALSE
       AND bt.reconciliation_status = 'UNMATCHED'
       AND NOT EXISTS (
         SELECT 1 FROM financial_reconciliation_matches frm
         WHERE frm.bank_transaction_id = bt.id
       )
     ON CONFLICT DO NOTHING`,
    [accountId]
  );

  // Update reconciliation_status for matched transactions
  await pool.query(
    `UPDATE bank_transactions bt
     SET reconciliation_status = 'MATCHED',
         updated_at = NOW()
     FROM financial_reconciliation_matches frm
     WHERE frm.bank_transaction_id = bt.id
       AND bt.account_id = $1
       AND bt.reconciliation_status = 'UNMATCHED'`,
    [accountId]
  );
}

// ── Main sync orchestrator ────────────────────────────────────────────────────

async function runSync(connectionId, accountId) {
  const conn = await getConnection(connectionId, accountId);
  if (!conn) throw new Error(`Connection ${connectionId} not found`);
  if (conn.status === 'DISCONNECTED') throw new Error('Connection is disconnected');

  const accessToken = decrypt(conn.access_token_encrypted);
  const now = new Date().toISOString();

  await setConnectionStatus(connectionId, CONN_STATUSES.SYNCING, { lastSyncAt: now });

  try {
    // Sync balances
    const balanceMap = await plaidBankingAdapter.getBalances({ accessToken });
    await updateBalances(connectionId, accountId, balanceMap);

    // Sync transactions (cursor-based)
    const cursor = await getSyncCursor(connectionId, accountId);
    const syncResult = await plaidBankingAdapter.syncTransactions({ accessToken, cursor });

    // Upsert added + modified
    const all = [...syncResult.added, ...syncResult.modified];
    const upsertedIds = await upsertTransactions(connectionId, accountId, all);

    // Remove removed transactions
    await removeTransactions(accountId, syncResult.removed);

    // Save new cursor
    if (syncResult.nextCursor) {
      await upsertSyncCursor(connectionId, accountId, syncResult.nextCursor);
    }

    // Detect internal transfers among newly synced transactions
    await detectInternalTransfers(connectionId, accountId, upsertedIds);

    // Reconcile with FieldCore Payments
    await reconcileWithFieldCorePayments(accountId);

    const successNow = new Date().toISOString();
    await setConnectionStatus(connectionId, CONN_STATUSES.CONNECTED, {
      lastSyncAt: successNow,
      lastSuccessfulSyncAt: successNow,
      lastErrorCode: null,
      lastErrorMessageSafe: null,
    });

    console.log(
      `[banking-sync] complete: connectionId=${connectionId} ` +
      `added=${syncResult.added.length} modified=${syncResult.modified.length} removed=${syncResult.removed.length} ` +
      `cursor=${syncResult.nextCursor ? 'saved' : 'none'}`
    );

    return {
      added:    syncResult.added.length,
      modified: syncResult.modified.length,
      removed:  syncResult.removed.length,
    };
  } catch (err) {
    const errorCode    = err.response?.data?.error_code    || 'SYNC_FAILED';
    const errorMessage = err.response?.data?.display_message
                      || err.response?.data?.error_message
                      || err.message
                      || 'Sync failed';

    const newStatus = errorCode === 'ITEM_LOGIN_REQUIRED' || errorCode?.includes('INVALID_ACCESS_TOKEN')
      ? CONN_STATUSES.REAUTH_REQUIRED
      : CONN_STATUSES.SYNC_ERROR;

    await setConnectionStatus(connectionId, newStatus, {
      lastSyncAt: new Date().toISOString(),
      lastErrorCode: errorCode,
      lastErrorMessageSafe: errorMessage.substring(0, 500),
    });

    console.error(`[banking-sync] connectionId=${connectionId} error=${errorCode}: ${errorMessage}`);
    throw err;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

async function createConnection({ accountId, accessToken, itemId, institution, accounts }) {
  const accessTokenEncrypted = encrypt(accessToken);

  const { rows } = await pool.query(
    `INSERT INTO bank_connections (
       account_id, provider, provider_item_id, institution_id,
       institution_name, status, access_token_encrypted
     ) VALUES ($1, 'plaid', $2, $3, $4, 'CONNECTED', $5)
     RETURNING *`,
    [accountId, itemId, institution.institutionId, institution.name, accessTokenEncrypted]
  );
  const connection = rows[0];

  await upsertAccounts(connection.id, accountId, accounts);

  const now = new Date().toISOString();
  await setConnectionStatus(connection.id, CONN_STATUSES.CONNECTED, {
    lastSyncAt: now,
    lastSuccessfulSyncAt: now,
  });

  return connection;
}

async function getConnections(accountId) {
  const { rows } = await pool.query(
    `SELECT bc.*,
            json_agg(ba.* ORDER BY ba.created_at) FILTER (WHERE ba.id IS NOT NULL) AS accounts
     FROM bank_connections bc
     LEFT JOIN bank_accounts ba ON ba.bank_connection_id = bc.id AND ba.is_active = TRUE
     WHERE bc.account_id = $1 AND bc.status != 'DISCONNECTED'
     GROUP BY bc.id
     ORDER BY bc.created_at DESC`,
    [accountId]
  );
  return rows.map(r => ({ ...r, access_token_encrypted: undefined }));
}

async function getConnectionStatus(accountId) {
  const { rows } = await pool.query(
    `SELECT bc.id, bc.status, bc.institution_name, bc.last_sync_at, bc.last_successful_sync_at,
            bc.last_error_code, bc.last_error_message_safe,
            COUNT(ba.id) FILTER (WHERE ba.is_active = TRUE AND ba.include_in_cash_position = TRUE) AS cash_account_count,
            COALESCE(SUM(ba.current_balance) FILTER (WHERE ba.is_active = TRUE AND ba.include_in_cash_position = TRUE), 0) AS total_cash_position
     FROM bank_connections bc
     LEFT JOIN bank_accounts ba ON ba.bank_connection_id = bc.id
     WHERE bc.account_id = $1 AND bc.status != 'DISCONNECTED'
     GROUP BY bc.id
     ORDER BY bc.created_at DESC
     LIMIT 1`,
    [accountId]
  );

  if (!rows[0]) {
    return { connected: false, configured: true, status: null };
  }

  const conn = rows[0];
  return {
    connected:          true,
    status:             conn.status,
    institutionName:    conn.institution_name,
    accountCount:       parseInt(conn.cash_account_count, 10) || 0,
    totalCashPosition:  parseFloat(conn.total_cash_position) || 0,
    lastSyncAt:         conn.last_sync_at,
    lastSuccessfulSyncAt: conn.last_successful_sync_at,
    lastErrorCode:      conn.last_error_code,
    lastErrorMessageSafe: conn.last_error_message_safe,
  };
}

async function disconnectConnection(connectionId, accountId) {
  const conn = await getConnection(connectionId, accountId);
  if (!conn) throw new Error('Connection not found');

  try {
    const accessToken = decrypt(conn.access_token_encrypted);
    await plaidBankingAdapter.removeItem({ accessToken });
  } catch (err) {
    console.warn(`[banking] Plaid removeItem failed (best-effort): ${err.message}`);
  }

  await pool.query(
    `UPDATE bank_connections
     SET status = 'DISCONNECTED',
         access_token_encrypted = NULL,
         disconnected_at = NOW(),
         updated_at = NOW()
     WHERE id = $1 AND account_id = $2`,
    [connectionId, accountId]
  );

  await pool.query(
    `UPDATE bank_accounts SET is_active = FALSE, updated_at = NOW()
     WHERE bank_connection_id = $1 AND account_id = $2`,
    [connectionId, accountId]
  );
}

async function getCashFlowSummary(accountId, { start, end, includePending = false } = {}) {
  const params = [accountId];
  let dateFilter = '';
  if (start) { params.push(start); dateFilter += ` AND bt.posted_date >= $${params.length}::date`; }
  if (end)   { params.push(end);   dateFilter += ` AND bt.posted_date <= $${params.length}::date`; }

  const pendingFilter = includePending ? '' : ' AND bt.pending = FALSE';

  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(bt.amount) FILTER (WHERE bt.direction = 'CASH_IN'), 0)  AS cash_in,
       COALESCE(SUM(bt.amount) FILTER (WHERE bt.direction = 'CASH_OUT'), 0) AS cash_out
     FROM bank_transactions bt
     JOIN bank_connections bc ON bc.id = bt.bank_connection_id
     WHERE bt.account_id = $1
       AND bt.reconciliation_status NOT IN ('TRANSFER', 'EXCLUDED')
       AND bt.excluded_from_analytics = FALSE
       AND bc.status != 'DISCONNECTED'
       ${dateFilter}${pendingFilter}`,
    params
  );

  const cashIn  = parseFloat(rows[0].cash_in)  || 0;
  const cashOut = parseFloat(rows[0].cash_out) || 0;
  return { cashIn, cashOut, netCashFlow: cashIn - cashOut };
}

async function getTotalCashPosition(accountId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(ba.current_balance), 0) AS total,
            COUNT(ba.id)::int AS account_count,
            array_agg(DISTINCT ba.currency) AS currencies
     FROM bank_accounts ba
     JOIN bank_connections bc ON bc.id = ba.bank_connection_id
     WHERE ba.account_id = $1
       AND ba.is_active = TRUE
       AND ba.include_in_cash_position = TRUE
       AND bc.status != 'DISCONNECTED'`,
    [accountId]
  );
  const r = rows[0];
  const currencies = (r.currencies || []).filter(Boolean);
  const isMultiCurrency = currencies.length > 1;
  return {
    total:           parseFloat(r.total) || 0,
    accountCount:    r.account_count || 0,
    currencies,
    isMultiCurrency,
  };
}

async function handleWebhookEvent(webhookEvent) {
  const { type, code, itemId } = webhookEvent;

  const conn = await getConnectionByItemId(itemId);
  if (!conn) return;

  if (type === 'TRANSACTIONS') {
    runSync(conn.id, conn.account_id).catch(err =>
      console.error(`[banking] webhook sync failed: ${err.message}`)
    );
  } else if (type === 'ITEM') {
    if (code === 'ERROR' || code === 'PENDING_EXPIRATION') {
      const errorCode = webhookEvent.errorCode;
      const newStatus = errorCode === 'ITEM_LOGIN_REQUIRED'
        ? CONN_STATUSES.REAUTH_REQUIRED
        : CONN_STATUSES.DEGRADED;
      await setConnectionStatus(conn.id, newStatus, { lastErrorCode: errorCode || code });
    }
  }
}

// Resets connections stuck in SYNCING state (e.g. after server restart mid-sync).
// Called once at startup after migrations complete.
async function recoverStaleSyncingConnections() {
  try {
    const { rows } = await pool.query(
      `UPDATE bank_connections
       SET status                 = 'SYNC_ERROR',
           last_error_code        = 'SERVER_RESTART',
           last_error_message_safe = 'Sync was interrupted by a server restart. Click Retry Sync to resume.',
           updated_at             = NOW()
       WHERE status = 'SYNCING'
         AND updated_at < NOW() - INTERVAL '10 minutes'
       RETURNING id, institution_name`
    );
    if (rows.length > 0) {
      console.warn(
        `[banking] Recovered ${rows.length} stale SYNCING connection(s): ` +
        rows.map(r => r.institution_name || r.id).join(', ')
      );
    }
  } catch (err) {
    console.error('[banking] recoverStaleSyncingConnections error:', err.message);
  }
}

module.exports = {
  runSync,
  createConnection,
  getConnections,
  getConnectionStatus,
  disconnectConnection,
  upsertAccounts,
  getCashFlowSummary,
  getTotalCashPosition,
  handleWebhookEvent,
  recoverStaleSyncingConnections,
  CONN_STATUSES,
};
