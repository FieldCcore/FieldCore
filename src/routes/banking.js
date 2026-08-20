'use strict';

const express  = require('express');
const router   = express.Router();
const pool     = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getPlaidConfig, getPlaidStatusSafe } = require('../services/plaidConfig');
const { plaidBankingAdapter } = require('../services/plaidBankingAdapter');
const { decrypt } = require('../services/crypto');
const bankingSync = require('../services/bankingSyncService');

const WEBHOOK_BASE = process.env.BACKEND_URL || process.env.RAILWAY_STATIC_URL || '';

// ── GET /api/integrations/banking/plaid/status ────────────────────────────────
// Safe status — no secrets ever included.

router.get('/plaid/status', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const validEnvironments = ['sandbox', 'development', 'production'];
    const clientId    = (process.env.PLAID_CLIENT_ID || '').trim();
    const secret      = (process.env.PLAID_SECRET    || '').trim();
    const environment = (process.env.PLAID_ENV       || '').trim().toLowerCase();

    const diagnostics = {
      clientIdPresent:    clientId.length > 0,
      clientIdLength:     clientId.length,
      secretPresent:      secret.length > 0,
      secretLength:       secret.length,
      environment:        environment || null,
      environmentValid:   validEnvironments.includes(environment),
    };

    const plaidStatus = getPlaidStatusSafe();
    if (!plaidStatus.configured) {
      return res.json({ ...plaidStatus, connected: false, status: null, diagnostics });
    }
    const connStatus = await bankingSync.getConnectionStatus(req.accountId);
    return res.json({ ...plaidStatus, ...connStatus, diagnostics });
  } catch (err) {
    console.error('[banking] status error:', err.message);
    res.status(500).json({ error: 'Could not load banking status.' });
  }
});

// ── POST /api/integrations/banking/plaid/link-token ───────────────────────────
// Creates a Plaid Link token. Token is never stored or returned after use.

router.post('/plaid/link-token', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const cfg = getPlaidConfig();
  if (!cfg.configured) {
    return res.status(503).json({ error: 'Banking integration is not configured on this server.', code: 'BANKING_NOT_CONFIGURED' });
  }

  try {
    const webhookUrl = WEBHOOK_BASE
      ? `${WEBHOOK_BASE}/api/integrations/banking/plaid/webhook`
      : undefined;

    const result = await plaidBankingAdapter.createLinkToken({
      userId:     req.userId,
      accountId:  req.accountId,
      webhookUrl,
    });

    res.json({ linkToken: result.linkToken });
  } catch (err) {
    console.error('[banking] link-token error:', err.message);
    res.status(500).json({ error: 'Could not create bank link token.' });
  }
});

// ── POST /api/integrations/banking/plaid/exchange ─────────────────────────────
// Exchanges public_token for access_token (server-side only).
// Never returns access_token or item_id to the frontend.

router.post('/plaid/exchange', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { publicToken } = req.body;
  if (!publicToken || typeof publicToken !== 'string') {
    return res.status(400).json({ error: 'publicToken is required.' });
  }

  const cfg = getPlaidConfig();
  if (!cfg.configured) {
    return res.status(503).json({ error: 'Banking integration is not configured.', code: 'BANKING_NOT_CONFIGURED' });
  }

  try {
    // Exchange public token
    const { accessToken, itemId } = await plaidBankingAdapter.exchangePublicToken(publicToken);

    // Fetch accounts and institution
    const { accounts, institutionId } = await plaidBankingAdapter.getAccounts({ accessToken });
    const institution = institutionId
      ? await plaidBankingAdapter.getInstitution(institutionId)
      : { institutionId: null, name: 'Unknown Institution', url: null, logo: null };

    // Persist connection, accounts
    const connection = await bankingSync.createConnection({
      accountId:  req.accountId,
      accessToken,
      itemId,
      institution,
      accounts,
    });

    // Trigger initial transaction sync in background
    bankingSync.runSync(connection.id, req.accountId).catch(err =>
      console.error('[banking] initial sync failed:', err.message)
    );

    console.log(`[banking] connected: account=${req.accountId} institution=${institution.name} accounts=${accounts.length}`);

    res.json({
      connected:       true,
      institutionName: institution.name,
      accountCount:    accounts.length,
      accounts:        accounts.map(a => ({
        name:    a.name,
        mask:    a.mask,
        type:    a.type,
        subtype: a.subtype,
      })),
    });
  } catch (err) {
    console.error('[banking] exchange error:', err.message);
    res.status(500).json({ error: 'Could not connect bank account.' });
  }
});

// ── GET /api/integrations/banking/plaid/connections ──────────────────────────
// Returns all active bank connections and their accounts.

router.get('/plaid/connections', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const connections = await bankingSync.getConnections(req.accountId);
    res.json({ connections });
  } catch (err) {
    console.error('[banking] connections error:', err.message);
    res.status(500).json({ error: 'Could not load bank connections.' });
  }
});

// ── POST /api/integrations/banking/plaid/sync ─────────────────────────────────
// Triggers a manual sync for a connection.

router.post('/plaid/sync', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { connectionId } = req.body;
  if (!connectionId) {
    return res.status(400).json({ error: 'connectionId is required.' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, status, last_sync_at FROM bank_connections WHERE id = $1 AND account_id = $2 AND status != 'DISCONNECTED'`,
      [connectionId, req.accountId]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Connection not found.' });
    }
    if (rows[0].status === 'SYNCING') {
      const lastSync = rows[0].last_sync_at;
      const ageMs    = lastSync ? Date.now() - new Date(lastSync).getTime() : Infinity;
      if (ageMs < 5 * 60 * 1000) {
        return res.json({ syncing: true, message: 'A sync is already in progress.' });
      }
      // Stale SYNCING (> 5 minutes) — allow re-trigger to recover from stuck state
    }

    bankingSync.runSync(connectionId, req.accountId).catch(err =>
      console.error('[banking] manual sync failed:', err.message)
    );

    res.json({ accepted: true, message: 'Sync started.' });
  } catch (err) {
    console.error('[banking] sync trigger error:', err.message);
    res.status(500).json({ error: 'Could not start sync.' });
  }
});

// ── POST /api/integrations/banking/plaid/disconnect ──────────────────────────
// Revokes Plaid access and marks connection DISCONNECTED.
// Historical transactions are preserved.

router.post('/plaid/disconnect', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { connectionId } = req.body;
  if (!connectionId) {
    return res.status(400).json({ error: 'connectionId is required.' });
  }

  try {
    await bankingSync.disconnectConnection(connectionId, req.accountId);
    console.log(`[banking] disconnected: account=${req.accountId} connection=${connectionId}`);
    res.json({ disconnected: true });
  } catch (err) {
    console.error('[banking] disconnect error:', err.message);
    res.status(500).json({ error: 'Could not disconnect bank account.' });
  }
});

// ── PATCH /api/integrations/banking/plaid/accounts/:id ───────────────────────
// Update account settings (include_in_cash_position toggle).

router.patch('/plaid/accounts/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { include_in_cash_position, is_active } = req.body;
  const updates = [];
  const params  = [req.params.id, req.accountId];

  if (include_in_cash_position !== undefined) {
    updates.push(`include_in_cash_position = $${params.length + 1}`);
    params.push(!!include_in_cash_position);
  }
  if (is_active !== undefined) {
    updates.push(`is_active = $${params.length + 1}`);
    params.push(!!is_active);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update.' });
  }

  try {
    const { rowCount } = await pool.query(
      `UPDATE bank_accounts SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $1 AND account_id = $2`,
      params
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Account not found.' });
    res.json({ updated: true });
  } catch (err) {
    console.error('[banking] account patch error:', err.message);
    res.status(500).json({ error: 'Could not update account.' });
  }
});

// ── GET /api/integrations/banking/plaid/transactions ─────────────────────────
// Bank transaction list with filters.

router.get('/plaid/transactions', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const {
    start, end, account_id: bankAccountId, direction, status,
    search, pending, page = '1', limit = '50',
  } = req.query;

  const pageNum   = Math.max(1, parseInt(page, 10) || 1);
  const limitNum  = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const offset    = (pageNum - 1) * limitNum;

  const params = [req.accountId];
  const filters = [`bt.account_id = $1`];

  if (start)         { params.push(start);         filters.push(`bt.posted_date >= $${params.length}::date`); }
  if (end)           { params.push(end);           filters.push(`bt.posted_date <= $${params.length}::date`); }
  if (bankAccountId) { params.push(bankAccountId); filters.push(`bt.bank_account_id = $${params.length}`); }
  if (direction)     { params.push(direction);     filters.push(`bt.direction = $${params.length}`); }
  if (status)        { params.push(status);        filters.push(`bt.reconciliation_status = $${params.length}`); }
  if (pending === 'true')  filters.push(`bt.pending = TRUE`);
  if (pending === 'false') filters.push(`bt.pending = FALSE`);
  if (search) {
    params.push(`%${search}%`);
    filters.push(`(bt.description ILIKE $${params.length} OR bt.merchant_name ILIKE $${params.length})`);
  }

  const where = filters.join(' AND ');

  try {
    const [txRows, countRows] = await Promise.all([
      pool.query(
        `SELECT bt.id, bt.posted_date, bt.authorized_date, bt.description, bt.merchant_name,
                bt.amount, bt.direction, bt.currency, bt.pending, bt.reconciliation_status,
                bt.personal_finance_category_primary, bt.personal_finance_category_detailed,
                bt.provider_transaction_id,
                ba.name AS account_name, ba.mask AS account_mask, ba.type AS account_type,
                bc.institution_name
         FROM bank_transactions bt
         JOIN bank_accounts ba ON ba.id = bt.bank_account_id
         JOIN bank_connections bc ON bc.id = bt.bank_connection_id
         WHERE ${where}
         ORDER BY bt.posted_date DESC, bt.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limitNum, offset]
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM bank_transactions bt WHERE ${where}`, params),
    ]);

    res.json({
      transactions: txRows.rows,
      total:        countRows.rows[0].total,
      page:         pageNum,
      limit:        limitNum,
    });
  } catch (err) {
    console.error('[banking] transactions error:', err.message);
    res.status(500).json({ error: 'Could not load transactions.' });
  }
});

// ── GET /api/integrations/banking/plaid/cash-flow ────────────────────────────

router.get('/plaid/cash-flow', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { start, end, include_pending } = req.query;
  try {
    const summary = await bankingSync.getCashFlowSummary(req.accountId, {
      start,
      end,
      includePending: include_pending === 'true',
    });
    res.json(summary);
  } catch (err) {
    console.error('[banking] cash-flow error:', err.message);
    res.status(500).json({ error: 'Could not load cash flow.' });
  }
});

// ── GET /api/integrations/banking/plaid/cash-position ────────────────────────

router.get('/plaid/cash-position', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const position = await bankingSync.getTotalCashPosition(req.accountId);
    res.json(position);
  } catch (err) {
    console.error('[banking] cash-position error:', err.message);
    res.status(500).json({ error: 'Could not load cash position.' });
  }
});

// ── POST /api/integrations/banking/plaid/webhook ─────────────────────────────
// Inbound Plaid webhook. Acknowledge immediately, process in background.

router.post('/plaid/webhook', async (req, res) => {
  res.status(200).json({ received: true });

  try {
    const event = await plaidBankingAdapter.handleWebhook({ body: req.body, headers: req.headers });
    if (event?.itemId) {
      bankingSync.handleWebhookEvent(event).catch(err =>
        console.error('[banking] webhook processing error:', err.message)
      );
    }
  } catch (err) {
    console.error('[banking] webhook error:', err.message);
  }
});

module.exports = router;
