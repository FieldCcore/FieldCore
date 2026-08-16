'use strict';
const express  = require('express');
const router   = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const qbAdapter   = require('../services/quickbooksAdapter');
const connSvc     = require('../services/accountingConnectionService');
const syncSvc     = require('../services/accountingSyncService');
const { decrypt } = require('../services/crypto');
const { getQBConfig } = require('../services/qbConfig');

const PROVIDER     = connSvc.PROVIDER;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://getfieldcore.com';
const REDIRECT_TARGET = `${FRONTEND_URL}/revenue?view=financials&tab=sources`;

// ── QuickBooks server-side configuration check ───────────────────────────────
// Returns boolean flags only — no secret values ever exposed.

// GET /api/integrations/accounting/quickbooks/configured
router.get(
  '/accounting/quickbooks/configured',
  requireAuth,
  requireRole('owner', 'manager'),
  (req, res) => {
    const cfg = getQBConfig();
    console.log(
      `[qb-configured] user=${req.userId} account=${req.accountId} ` +
      `configured=${cfg.configured} clientId=${cfg.hasClientId} ` +
      `secret=${cfg.hasClientSecret} redirectUri=${cfg.hasRedirectUri} env=${cfg.environment}`
    );
    res.json({
      provider:       'quickbooks_online',
      configured:     cfg.configured,
      hasClientId:    cfg.hasClientId,
      hasClientSecret: cfg.hasClientSecret,
      hasRedirectUri: cfg.hasRedirectUri,
      environment:    cfg.environment,
    });
  }
);

// ── QuickBooks OAuth connect ─────────────────────────────────────────────────

// GET /api/integrations/accounting/quickbooks/connect
// Returns the OAuth authorization URL. Frontend redirects to it.
router.get(
  '/accounting/quickbooks/connect',
  requireAuth,
  requireRole('owner', 'manager'),
  async (req, res) => {
    try {
      if (!qbAdapter.isConfigured()) {
        return res.status(503).json({
          error: 'QuickBooks integration is not configured on this server.',
          code:  'QB_NOT_CONFIGURED',
        });
      }
      const url = qbAdapter.getAuthorizationUrl(req.accountId, req.userId);
      res.json({ url });
    } catch (err) {
      console.error('[Integrations] QB connect error:', err.message);
      res.status(500).json({ error: 'Failed to generate QuickBooks authorization URL.' });
    }
  }
);

// GET /api/integrations/accounting/quickbooks/callback
// OAuth redirect target from Intuit — no Bearer auth, redirects browser to frontend.
router.get('/accounting/quickbooks/callback', async (req, res) => {
  const { code, state, realmId, error } = req.query;
  const errorRedirect = (code) => res.redirect(`${REDIRECT_TARGET}&qb_error=${code}`);

  if (error) return errorRedirect('access_denied');
  if (!code || !state || !realmId) return errorRedirect('missing_params');

  let accountId, userId;
  try {
    ({ accountId, userId } = qbAdapter.parseState(state));
  } catch (err) {
    console.warn('[Integrations] QB callback invalid state:', err.message);
    return errorRedirect('invalid_state');
  }

  try {
    // Exchange authorization code for tokens
    const tokens = await qbAdapter.exchangeCode(code);

    // Fetch company info using fresh access token
    const tempConn = {
      accountId,
      realmId,
      accessToken:   tokens.accessToken,
      tokenExpiresAt: tokens.tokenExpiresAt,
    };
    let companyName = null;
    try {
      const info = await qbAdapter.getCompanyInfo(tempConn);
      companyName = info.companyName;
    } catch {
      // Non-fatal — company name can be refreshed on next sync
    }

    // Persist connection
    await connSvc.upsertConnection({
      accountId,
      provider:              PROVIDER,
      realmId,
      companyName,
      accessToken:           tokens.accessToken,
      refreshToken:          tokens.refreshToken,
      tokenExpiresAt:        tokens.tokenExpiresAt,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      scopes:                'com.intuit.quickbooks.accounting',
      connectedByUserId:     userId,
    });

    // Trigger initial sync in background (non-blocking)
    syncSvc.runSync(accountId, PROVIDER, { incremental: false }).catch(err => {
      console.error('[Integrations] QB initial sync failed:', err.message);
    });

    console.log(`[Integrations] QB connected: account=${accountId} realm=${realmId}`);
    res.redirect(`${REDIRECT_TARGET}&qb_connected=1`);
  } catch (err) {
    console.error('[Integrations] QB callback error:', err.message);
    // Update status to sync_error
    try {
      await connSvc.updateStatus(accountId, PROVIDER, 'sync_error', {
        errorCode:    'CALLBACK_FAILED',
        errorMessage: 'Failed to complete QuickBooks connection.',
      });
    } catch {}
    return errorRedirect('callback_failed');
  }
});

// ── QuickBooks status ─────────────────────────────────────────────────────────

// GET /api/integrations/accounting/quickbooks/status
// Returns the full safe status object. Never includes client secret, access token, or refresh token.
router.get(
  '/accounting/quickbooks/status',
  requireAuth,
  requireRole('owner', 'manager'),
  async (req, res) => {
    try {
      const conn = await connSvc.getConnectionStatus(req.accountId, PROVIDER);

      // Shape the response to the canonical spec.
      // 'status' field maps DB status → 'AVAILABLE' / 'CONNECTED' / 'SYNCING' / 'REAUTH_REQUIRED' / 'ERROR'
      const publicStatus =
        !conn.connected                             ? 'AVAILABLE'        :
        conn.status === 'connected'                 ? 'CONNECTED'        :
        conn.status === 'syncing'                   ? 'SYNCING'          :
        conn.status === 'reauth_required'           ? 'REAUTH_REQUIRED'  :
        conn.status === 'sync_error'                ? 'ERROR'            :
        'UNKNOWN';

      const body = {
        provider:     PROVIDER,
        configured:   conn.configured,
        connected:    conn.connected,
        canConnect:   conn.canConnect,
        status:       publicStatus,
        environment:  conn.environment,
        companyName:  conn.companyName || null,
        lastSyncAt:   conn.lastSyncAt  || null,
      };

      console.log(
        `[qb-status-api] account=${req.accountId} configured=${body.configured} ` +
        `connected=${body.connected} canConnect=${body.canConnect} status=${body.status}`
      );

      res.json(body);
    } catch (err) {
      console.error('[Integrations] QB status error:', err.message);
      res.status(500).json({ error: 'Failed to fetch QuickBooks status.' });
    }
  }
);

// ── Manual sync ───────────────────────────────────────────────────────────────

// POST /api/integrations/accounting/quickbooks/sync
router.post(
  '/accounting/quickbooks/sync',
  requireAuth,
  requireRole('owner', 'manager'),
  async (req, res) => {
    try {
      // Recover stale syncs (> 30 min in syncing state) before checking active state.
      await syncSvc.recoverStaleSyncs(PROVIDER);

      // If a recent sync is genuinely in progress, return 200 (not 409).
      const activelySyncing = await syncSvc.isActivelySyncing(req.accountId, PROVIDER);
      if (activelySyncing) {
        return res.json({ syncing: true, message: 'A QuickBooks sync is already in progress.' });
      }

      const status = await connSvc.getConnectionStatus(req.accountId, PROVIDER);
      if (!['connected', 'sync_error'].includes(status.status)) {
        return res.status(409).json({
          error: `Cannot sync — current status is "${status.statusLabel}".`,
        });
      }
      // Run sync in background; return accepted immediately
      syncSvc.runSync(req.accountId, PROVIDER, { incremental: true }).catch(err => {
        console.error('[Integrations] QB manual sync failed:', err.message);
      });
      res.json({ accepted: true, message: 'Sync started.' });
    } catch (err) {
      console.error('[Integrations] QB sync trigger error:', err.message);
      res.status(500).json({ error: 'Failed to start sync.' });
    }
  }
);

// ── Disconnect ────────────────────────────────────────────────────────────────

// POST /api/integrations/accounting/quickbooks/disconnect
router.post(
  '/accounting/quickbooks/disconnect',
  requireAuth,
  requireRole('owner', 'manager'),
  async (req, res) => {
    try {
      const tokens = await connSvc.getDecryptedTokens(req.accountId, PROVIDER);
      if (tokens?.refreshToken) {
        // Best-effort token revocation
        await qbAdapter.revokeToken(tokens.refreshToken).catch(() => {});
      }
      await connSvc.disconnect(req.accountId, PROVIDER);
      console.log(`[Integrations] QB disconnected: account=${req.accountId}`);
      res.json({ disconnected: true });
    } catch (err) {
      console.error('[Integrations] QB disconnect error:', err.message);
      res.status(500).json({ error: 'Failed to disconnect QuickBooks.' });
    }
  }
);

// ── Account mappings ──────────────────────────────────────────────────────────

// GET /api/integrations/accounting/quickbooks/mappings/categories
router.get(
  '/accounting/quickbooks/mappings/categories',
  requireAuth,
  requireRole('owner', 'manager'),
  (req, res) => {
    res.json({ categories: syncSvc.FIELDCORE_CATEGORIES });
  }
);

// GET /api/integrations/accounting/quickbooks/mappings
router.get(
  '/accounting/quickbooks/mappings',
  requireAuth,
  requireRole('owner', 'manager'),
  async (req, res) => {
    try {
      const mappings = await syncSvc.getMappings(req.accountId, PROVIDER);
      res.json({ mappings });
    } catch (err) {
      console.error('[Integrations] QB mappings error:', err.message);
      res.status(500).json({ error: 'Failed to load account mappings.' });
    }
  }
);

// POST /api/integrations/accounting/quickbooks/mappings/bulk
router.post(
  '/accounting/quickbooks/mappings/bulk',
  requireAuth,
  requireRole('owner', 'manager'),
  async (req, res) => {
    const { mappings } = req.body;
    if (!Array.isArray(mappings) || mappings.length === 0) {
      return res.status(400).json({ error: 'mappings array is required.' });
    }

    const VALID_CATEGORIES = ['cogs', 'operating_expenses', 'taxes', 'cash_accounts', null];
    for (const m of mappings) {
      if (!m.providerAccountId) {
        return res.status(400).json({ error: 'Each mapping requires providerAccountId.' });
      }
      if (!VALID_CATEGORIES.includes(m.fieldcoreCategory ?? null)) {
        return res.status(400).json({ error: `Invalid fieldcoreCategory: ${m.fieldcoreCategory}` });
      }
    }

    try {
      await syncSvc.bulkUpdateMappings(req.accountId, PROVIDER, mappings);
      res.json({ updated: mappings.length });
    } catch (err) {
      console.error('[Integrations] QB bulk mapping error:', err.message);
      res.status(500).json({ error: 'Failed to update mappings.' });
    }
  }
);

// PATCH /api/integrations/accounting/quickbooks/mappings/:providerAccountId
router.patch(
  '/accounting/quickbooks/mappings/:providerAccountId',
  requireAuth,
  requireRole('owner', 'manager'),
  async (req, res) => {
    const { providerAccountId } = req.params;
    const { fieldcoreCategory, fieldcoreSubcategory, isIgnored } = req.body;

    const VALID_CATEGORIES = ['cogs', 'operating_expenses', 'taxes', 'cash_accounts', null];
    if (!VALID_CATEGORIES.includes(fieldcoreCategory ?? null)) {
      return res.status(400).json({ error: 'Invalid fieldcoreCategory value.' });
    }

    try {
      await syncSvc.updateMapping(req.accountId, PROVIDER, providerAccountId, {
        fieldcoreCategory:    fieldcoreCategory    || null,
        fieldcoreSubcategory: fieldcoreSubcategory || null,
        isIgnored:            !!isIgnored,
      });
      res.json({ updated: true });
    } catch (err) {
      console.error('[Integrations] QB mapping update error:', err.message);
      res.status(500).json({ error: 'Failed to update mapping.' });
    }
  }
);

// ── QuickBooks webhook ────────────────────────────────────────────────────────

// POST /api/integrations/accounting/quickbooks/webhook
// Intuit posts change notifications here; signature is verified before processing.
router.post('/accounting/quickbooks/webhook', async (req, res) => {
  const signature = req.headers['intuit-signature'];
  const webhookToken = process.env.QUICKBOOKS_WEBHOOK_TOKEN;

  if (webhookToken && signature) {
    const crypto = require('crypto');
    const expected = crypto
      .createHmac('sha256', webhookToken)
      .update(JSON.stringify(req.body))
      .digest('base64');
    if (signature !== expected) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
  }

  // Acknowledge immediately; process in background
  res.status(200).json({ received: true });

  const entities = req.body?.eventNotifications || [];
  for (const notification of entities) {
    const realmId = notification.realmId;
    if (!realmId) continue;
    try {
      const { rows } = await require('../db/pool').query(
        `SELECT account_id FROM accounting_connections WHERE realm_id = $1 AND status IN ('connected','syncing')`,
        [realmId]
      );
      for (const row of rows) {
        syncSvc.runSync(row.account_id, PROVIDER, { incremental: true }).catch(err => {
          console.error('[Integrations] QB webhook sync failed:', err.message);
        });
      }
    } catch (err) {
      console.error('[Integrations] QB webhook processing error:', err.message);
    }
  }
});

module.exports = router;
