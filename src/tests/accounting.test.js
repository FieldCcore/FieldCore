'use strict';
require('dotenv').config();
const request = require('supertest');
const app     = require('../app');
const pool    = require('../db/pool');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const { encrypt, decrypt } = require('../services/crypto');
const qbAdapter = require('../services/quickbooksAdapter');
const connSvc   = require('../services/accountingConnectionService');
const syncSvc   = require('../services/accountingSyncService');
const { runMigrations } = require('../db/migrate');

// ── Test fixtures ─────────────────────────────────────────────────────────────

let testAccountId;
let ownerToken;

beforeAll(async () => {
  await runMigrations();

  const { rows: acctRows } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
    [`__TEST_ACCOUNTING_${Date.now()}__`]
  );
  testAccountId = acctRows[0].id;

  const hash = await bcrypt.hash('Password1!', 10);
  const { rows: userRows } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'owner') RETURNING id`,
    [testAccountId, 'QB Test', `qbtest+${Date.now()}@test.com`, hash]
  );
  const userId = userRows[0].id;

  ownerToken = jwt.sign(
    { userId, accountId: testAccountId, role: 'owner' },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}, 30000);

afterAll(async () => {
  await pool.query(`DELETE FROM accounting_account_mappings WHERE account_id = $1`, [testAccountId]);
  await pool.query(`DELETE FROM accounting_synced_records WHERE account_id = $1`, [testAccountId]);
  await pool.query(`DELETE FROM accounting_connections WHERE account_id = $1`, [testAccountId]);
  await pool.query(`DELETE FROM users WHERE account_id = $1`, [testAccountId]);
  await pool.query(`DELETE FROM accounts WHERE id = $1`, [testAccountId]);
  await pool.end();
});

// ── 1. Encryption ─────────────────────────────────────────────────────────────

describe('Token encryption', () => {
  it('round-trips a QB access token through AES-256-GCM', () => {
    const original = 'eyJhbGciOiJSUzI1NiJ9.fake-access-token';
    const stored   = encrypt(original);
    expect(stored).toMatch(/^[0-9a-f]+\.[0-9a-f]+\.[0-9a-f]+$/);
    expect(decrypt(stored)).toBe(original);
  });

  it('produces unique ciphertext for each call (random IV)', () => {
    const token = 'same-token-value';
    expect(encrypt(token)).not.toBe(encrypt(token));
  });

  it('decrypted tokens do not appear in the ciphertext', () => {
    const token    = 'secret-refresh-token-value';
    const ciphertext = encrypt(token);
    expect(ciphertext).not.toContain(token);
  });
});

// ── 2. OAuth state ────────────────────────────────────────────────────────────

describe('QuickBooks OAuth state', () => {
  it('creates and parses a valid CSRF state', () => {
    const state   = qbAdapter.createState(testAccountId, 'user-123');
    const parsed  = qbAdapter.parseState(state);
    expect(parsed.accountId).toBe(testAccountId);
    expect(parsed.userId).toBe('user-123');
    expect(parsed.nonce).toBeDefined();
  });

  it('rejects a tampered state', () => {
    const state   = qbAdapter.createState(testAccountId, 'user-123');
    const tampered = state.slice(0, -4) + 'XXXX';
    expect(() => qbAdapter.parseState(tampered)).toThrow();
  });

  it('rejects an expired state (>15 min old)', () => {
    const old = Date.now() - 16 * 60 * 1000;
    const payload = JSON.stringify({ accountId: testAccountId, userId: 'u', nonce: 'n', ts: old });
    const crypto  = require('crypto');
    const sig     = crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev-secret')
      .update(payload).digest('hex');
    const state = Buffer.from(JSON.stringify({ payload, sig }), 'utf8').toString('base64url');
    expect(() => qbAdapter.parseState(state)).toThrow('expired');
  });
});

// ── 3. QB not configured guard ────────────────────────────────────────────────

describe('GET /api/integrations/accounting/quickbooks/connect', () => {
  it('returns 503 when QB credentials are not configured', async () => {
    const origId = process.env.QUICKBOOKS_CLIENT_ID;
    delete process.env.QUICKBOOKS_CLIENT_ID;

    const res = await request(app)
      .get('/api/integrations/accounting/quickbooks/connect')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('QB_NOT_CONFIGURED');
    process.env.QUICKBOOKS_CLIENT_ID = origId;
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .get('/api/integrations/accounting/quickbooks/connect');
    expect(res.status).toBe(401);
  });
});

// ── 4. Connection CRUD ────────────────────────────────────────────────────────

describe('AccountingConnectionService', () => {
  it('returns not_connected status for a fresh account', async () => {
    const status = await connSvc.getConnectionStatus(testAccountId);
    expect(status.status).toBe('not_connected');
  });

  it('upserts a connection and retrieves it', async () => {
    await connSvc.upsertConnection({
      accountId:     testAccountId,
      provider:      'quickbooks_online',
      realmId:       'realm-test-001',
      companyName:   'Test HVAC LLC',
      accessToken:   'at-test-001',
      refreshToken:  'rt-test-001',
      tokenExpiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const conn = await connSvc.getConnection(testAccountId);
    expect(conn).not.toBeNull();
    expect(conn.realm_id).toBe('realm-test-001');
    expect(conn.company_name).toBe('Test HVAC LLC');
    expect(conn.status).toBe('connected');
  });

  it('decrypts stored tokens correctly', async () => {
    const tokens = await connSvc.getDecryptedTokens(testAccountId);
    expect(tokens.accessToken).toBe('at-test-001');
    expect(tokens.refreshToken).toBe('rt-test-001');
  });

  it('getConnectionStatus returns connected info', async () => {
    const status = await connSvc.getConnectionStatus(testAccountId);
    expect(status.status).toBe('connected');
    expect(status.companyName).toBe('Test HVAC LLC');
    expect(status.statusLabel).toBe('Connected');
  });

  it('updates status to reauth_required', async () => {
    await connSvc.updateStatus(testAccountId, 'quickbooks_online', 'reauth_required', {
      errorCode:    'AUTH_EXPIRED',
      errorMessage: 'Token expired.',
    });
    const conn = await connSvc.getConnection(testAccountId);
    expect(conn.status).toBe('reauth_required');
    expect(conn.last_error_code).toBe('AUTH_EXPIRED');
  });

  it('marks sync started → syncing', async () => {
    // Reset to connected first
    await connSvc.upsertConnection({
      accountId:    testAccountId,
      realmId:      'realm-test-001',
      companyName:  'Test HVAC LLC',
      accessToken:  'at',
      refreshToken: 'rt',
      tokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    await connSvc.markSyncStarted(testAccountId, 'quickbooks_online');
    const conn = await connSvc.getConnection(testAccountId);
    expect(conn.status).toBe('syncing');
    expect(conn.last_sync_attempt_at).not.toBeNull();
  });

  it('marks sync completed → connected with timestamps', async () => {
    await connSvc.markSyncCompleted(testAccountId, 'quickbooks_online');
    const conn = await connSvc.getConnection(testAccountId);
    expect(conn.status).toBe('connected');
    expect(conn.last_sync_at).not.toBeNull();
    expect(conn.last_successful_sync_at).not.toBeNull();
  });

  it('marks sync failed → sync_error with error code', async () => {
    await connSvc.markSyncCompleted(testAccountId, 'quickbooks_online', {
      hadError:     true,
      errorCode:    'ACCOUNTS_SYNC_FAILED',
      errorMessage: 'Test error',
    });
    const conn = await connSvc.getConnection(testAccountId);
    expect(conn.status).toBe('sync_error');
    expect(conn.last_error_code).toBe('ACCOUNTS_SYNC_FAILED');
  });

  it('disconnect clears tokens and sets disconnected_at', async () => {
    await connSvc.disconnect(testAccountId, 'quickbooks_online');
    const conn = await connSvc.getConnection(testAccountId);
    expect(conn.status).toBe('disconnected');
    expect(conn.access_token_enc).toBeNull();
    expect(conn.refresh_token_enc).toBeNull();
    expect(conn.disconnected_at).not.toBeNull();
  });
});

// ── 5. Tenant isolation ───────────────────────────────────────────────────────

describe('Tenant isolation', () => {
  let otherAccountId;

  beforeAll(async () => {
    const { rows } = await pool.query(
      `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
      [`__TEST_ACCOUNTING_OTHER_${Date.now()}__`]
    );
    otherAccountId = rows[0].id;
    // Connect the other tenant
    await connSvc.upsertConnection({
      accountId:    otherAccountId,
      realmId:      'realm-other-999',
      companyName:  'Other Co',
      accessToken:  'at-other',
      refreshToken: 'rt-other',
      tokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM accounting_connections WHERE account_id = $1`, [otherAccountId]);
    await pool.query(`DELETE FROM accounts WHERE id = $1`, [otherAccountId]);
  });

  it('testAccountId cannot read otherAccountId connection', async () => {
    const conn = await connSvc.getConnection(testAccountId);
    // After the disconnect in previous tests, testAccountId connection is disconnected
    // and should NOT return otherAccountId's connection
    expect(conn?.realm_id).not.toBe('realm-other-999');
  });

  it('getDecryptedTokens for own account does not leak other tenant tokens', async () => {
    const tokens = await connSvc.getDecryptedTokens(testAccountId);
    // testAccountId was disconnected above — tokens should be null or cleared
    expect(tokens?.accessToken).not.toBe('at-other');
  });
});

// ── 6. Status API (requires auth) ────────────────────────────────────────────

describe('GET /api/integrations/accounting/quickbooks/status', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .get('/api/integrations/accounting/quickbooks/status');
    expect(res.status).toBe(401);
  });

  it('returns status for authenticated owner', async () => {
    const res = await request(app)
      .get('/api/integrations/accounting/quickbooks/status')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('provider', 'quickbooks_online');
  });
});

// ── 6b. Configured diagnostic endpoint ───────────────────────────────────────

describe('GET /api/integrations/accounting/quickbooks/configured', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .get('/api/integrations/accounting/quickbooks/configured');
    expect(res.status).toBe(401);
  });

  it('returns boolean config flags — never exposes secret values', async () => {
    const res = await request(app)
      .get('/api/integrations/accounting/quickbooks/configured')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('provider', 'quickbooks_online');
    expect(typeof res.body.configured).toBe('boolean');
    expect(typeof res.body.hasClientId).toBe('boolean');
    expect(typeof res.body.hasClientSecret).toBe('boolean');
    expect(typeof res.body.hasRedirectUri).toBe('boolean');
    // Must never return actual secret values
    expect(res.body).not.toHaveProperty('clientId');
    expect(res.body).not.toHaveProperty('clientSecret');
    expect(res.body).not.toHaveProperty('redirectUri');
  });
});

// ── 7. Disconnect API ────────────────────────────────────────────────────────

describe('POST /api/integrations/accounting/quickbooks/disconnect', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/integrations/accounting/quickbooks/disconnect');
    expect(res.status).toBe(401);
  });

  it('disconnects when authenticated', async () => {
    // Reconnect first
    await connSvc.upsertConnection({
      accountId:    testAccountId,
      realmId:      'realm-test-002',
      companyName:  'Test LLC 2',
      accessToken:  'at-2',
      refreshToken: 'rt-2',
      tokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    const res = await request(app)
      .post('/api/integrations/accounting/quickbooks/disconnect')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.disconnected).toBe(true);

    const conn = await connSvc.getConnection(testAccountId);
    expect(conn.status).toBe('disconnected');
    expect(conn.access_token_enc).toBeNull();
  });
});

// ── 8. Account mapping CRUD ───────────────────────────────────────────────────

describe('Account mapping', () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO accounting_account_mappings
         (account_id, provider, provider_account_id, provider_account_name, provider_account_type)
       VALUES ($1,'quickbooks_online','5000','Materials','Cost of Goods Sold')
       ON CONFLICT DO NOTHING`,
      [testAccountId]
    );
  });

  it('gets mappings for account', async () => {
    const mappings = await syncSvc.getMappings(testAccountId, 'quickbooks_online');
    expect(Array.isArray(mappings)).toBe(true);
    const target = mappings.find(m => m.provider_account_id === '5000');
    expect(target).toBeDefined();
  });

  it('updates a mapping category', async () => {
    await syncSvc.updateMapping(testAccountId, 'quickbooks_online', '5000', {
      fieldcoreCategory: 'cogs',
      isIgnored: false,
    });
    const mappings = await syncSvc.getMappings(testAccountId, 'quickbooks_online');
    const target   = mappings.find(m => m.provider_account_id === '5000');
    expect(target.fieldcore_category).toBe('cogs');
    expect(target.is_direct_cost).toBe(true);
  });

  it('marks a mapping as ignored', async () => {
    await syncSvc.updateMapping(testAccountId, 'quickbooks_online', '5000', {
      fieldcoreCategory: null,
      isIgnored: true,
    });
    const { rows } = await pool.query(
      `SELECT is_ignored FROM accounting_account_mappings
       WHERE account_id = $1 AND provider_account_id = '5000'`,
      [testAccountId]
    );
    expect(rows[0].is_ignored).toBe(true);
  });

  it('PATCH /mappings/:id returns 400 for invalid category', async () => {
    // Reconnect to have a valid auth session
    await connSvc.upsertConnection({
      accountId:    testAccountId,
      realmId:      'realm-test-003',
      companyName:  'Test LLC 3',
      accessToken:  'at-3',
      refreshToken: 'rt-3',
      tokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    const res = await request(app)
      .patch('/api/integrations/accounting/quickbooks/mappings/5000')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ fieldcoreCategory: 'invalid_category' });

    expect(res.status).toBe(400);
  });
});

// ── 9. Sync service unit tests (no QB API needed) ────────────────────────────

describe('AccountingSyncService', () => {
  it('suggestCategory maps COGS accounts correctly', () => {
    expect(syncSvc.suggestCategory('Cost of Goods Sold', '')).toBe('cogs');
  });

  it('suggestCategory maps Expense/Advertising to operating_expenses', () => {
    expect(syncSvc.suggestCategory('Expense', 'Advertising')).toBe('operating_expenses');
  });

  it('suggestCategory maps Tax expense to taxes', () => {
    expect(syncSvc.suggestCategory('Other Expense', 'IncomeTaxExpense')).toBe('taxes');
  });

  it('suggestCategory returns null for unknown type', () => {
    expect(syncSvc.suggestCategory('Equity', 'OpeningBalance')).toBeNull();
  });

  it('getAccountingTotals returns zeros when no records', async () => {
    const totals = await syncSvc.getAccountingTotals(
      testAccountId, 'quickbooks_online', '2026-01-01', '2026-12-31'
    );
    expect(totals.cogsCents).toBe(0);
    expect(totals.opexCents).toBe(0);
    expect(totals.taxCents).toBe(0);
  });
});

// ── 10. Unmapped account detection ───────────────────────────────────────────

describe('Unmapped account count', () => {
  it('counts unmapped active accounts correctly', async () => {
    // Insert an unmapped account
    await pool.query(
      `INSERT INTO accounting_account_mappings
         (account_id, provider, provider_account_id, provider_account_name,
          provider_account_type, fieldcore_category, is_ignored, is_active)
       VALUES ($1,'quickbooks_online','9999','Unknown Acct','Expense',NULL,FALSE,TRUE)
       ON CONFLICT DO NOTHING`,
      [testAccountId]
    );

    const count = await connSvc.getUnmappedAccountCount(testAccountId, 'quickbooks_online');
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

// ── 11. Sync endpoint permission checks ──────────────────────────────────────

describe('POST /api/integrations/accounting/quickbooks/sync', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/integrations/accounting/quickbooks/sync');
    expect(res.status).toBe(401);
  });

  it('returns 409 when status is not_connected', async () => {
    await connSvc.disconnect(testAccountId, 'quickbooks_online');
    const res = await request(app)
      .post('/api/integrations/accounting/quickbooks/sync')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(409);
  });
});

// ── 12. Webhook signature validation ─────────────────────────────────────────

describe('POST /api/integrations/accounting/quickbooks/webhook', () => {
  it('returns 200 with no webhook token configured (permissive)', async () => {
    const origToken = process.env.QUICKBOOKS_WEBHOOK_TOKEN;
    delete process.env.QUICKBOOKS_WEBHOOK_TOKEN;

    const res = await request(app)
      .post('/api/integrations/accounting/quickbooks/webhook')
      .send({ eventNotifications: [] });

    expect(res.status).toBe(200);
    process.env.QUICKBOOKS_WEBHOOK_TOKEN = origToken;
  });

  it('returns 401 when webhook signature is invalid', async () => {
    process.env.QUICKBOOKS_WEBHOOK_TOKEN = 'test-webhook-secret';
    const res = await request(app)
      .post('/api/integrations/accounting/quickbooks/webhook')
      .set('intuit-signature', 'bad-signature')
      .send({ eventNotifications: [] });

    expect(res.status).toBe(401);
    delete process.env.QUICKBOOKS_WEBHOOK_TOKEN;
  });
});

// ── 13a. getAccountingDetails — period filtering and provenance ───────────────

describe('getAccountingDetails — period filtering', () => {
  const PROVIDER = 'quickbooks_online';
  const IN_PERIOD_DATE  = '2026-08-10';
  const OUT_PERIOD_DATE = '2026-07-01';
  const PERIOD_START    = '2026-08-01';
  const PERIOD_END      = '2026-08-31';

  let opexAccountId;

  beforeAll(async () => {
    // Ensure connected
    await connSvc.upsertConnection({
      accountId:    testAccountId,
      realmId:      'realm-details-test',
      companyName:  'Details Test LLC',
      accessToken:  'at-det',
      refreshToken: 'rt-det',
      tokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    // Insert an operating-expense account mapping
    opexAccountId = 'acct-opex-det-001';
    await pool.query(
      `INSERT INTO accounting_account_mappings
         (account_id, provider, provider_account_id, provider_account_name,
          provider_account_type, fieldcore_category, is_operating_expense,
          mapping_confidence, is_active)
       VALUES ($1,$2,$3,'Advertising','Expense','operating_expenses',TRUE,'high_confidence',TRUE)
       ON CONFLICT (account_id, provider, provider_account_id) DO UPDATE
         SET is_operating_expense = TRUE, fieldcore_category = 'operating_expenses'`,
      [testAccountId, PROVIDER, opexAccountId]
    );

    // Insert in-period expense record: $54.00 → 5400 cents
    await pool.query(
      `INSERT INTO accounting_synced_records
         (account_id, provider, record_type, provider_record_id, amount_cents,
          currency, accounting_date, provider_account_id, fieldcore_category, synced_at)
       VALUES ($1,$2,'expense','exp-in-period-001',5400,'USD',$3,$4,'operating_expenses',NOW())
       ON CONFLICT (account_id, provider, record_type, provider_record_id) DO UPDATE
         SET amount_cents = 5400, accounting_date = $3`,
      [testAccountId, PROVIDER, IN_PERIOD_DATE, opexAccountId]
    );

    // Insert out-of-period expense record: $999.00 — must be excluded
    await pool.query(
      `INSERT INTO accounting_synced_records
         (account_id, provider, record_type, provider_record_id, amount_cents,
          currency, accounting_date, provider_account_id, fieldcore_category, synced_at)
       VALUES ($1,$2,'expense','exp-out-period-001',99900,'USD',$3,$4,'operating_expenses',NOW())
       ON CONFLICT (account_id, provider, record_type, provider_record_id) DO UPDATE
         SET amount_cents = 99900, accounting_date = $3`,
      [testAccountId, PROVIDER, OUT_PERIOD_DATE, opexAccountId]
    );
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM accounting_synced_records
       WHERE account_id = $1 AND provider_record_id IN ('exp-in-period-001','exp-out-period-001')`,
      [testAccountId]
    );
    await pool.query(
      `DELETE FROM accounting_account_mappings
       WHERE account_id = $1 AND provider_account_id = $2`,
      [testAccountId, opexAccountId]
    );
  });

  it('getAccountingTotals sums only in-period records', async () => {
    const totals = await syncSvc.getAccountingTotals(
      testAccountId, PROVIDER, PERIOD_START, PERIOD_END
    );
    // Only the in-period $54.00 (5400 cents) should be counted
    expect(totals.opexCents).toBe(5400);
    expect(totals.hasOpExAccounts).toBe(true);
  });

  it('getAccountingTotals excludes out-of-period records', async () => {
    const totals = await syncSvc.getAccountingTotals(
      testAccountId, PROVIDER, PERIOD_START, PERIOD_END
    );
    // Out-of-period record is $999 — if it were included, opexCents would be 105300
    expect(totals.opexCents).toBeLessThan(99900);
  });

  it('getAccountingTotals returns 0 when period has no records', async () => {
    const totals = await syncSvc.getAccountingTotals(
      testAccountId, PROVIDER, '2025-01-01', '2025-01-31'
    );
    expect(totals.opexCents).toBe(0);
  });

  it('getAccountingDetails returns source records with provenance', async () => {
    const records = await syncSvc.getAccountingDetails(
      testAccountId, PROVIDER, PERIOD_START, PERIOD_END
    );
    expect(records.length).toBeGreaterThanOrEqual(1);
    const target = records.find(r => r.providerRecordId === 'exp-in-period-001');
    expect(target).toBeDefined();
    expect(target.amountCents).toBe(5400);
    expect(target.amountDollars).toBe(54);
    expect(target.isOperatingExpense).toBe(true);
    expect(target.accountName).toBe('Advertising');
    expect(target.recordType).toBe('expense');
  });

  it('getAccountingDetails excludes out-of-period records', async () => {
    const records = await syncSvc.getAccountingDetails(
      testAccountId, PROVIDER, PERIOD_START, PERIOD_END
    );
    const outPeriod = records.find(r => r.providerRecordId === 'exp-out-period-001');
    expect(outPeriod).toBeUndefined();
  });

  it('account balance alone does not contribute — no synced record means zero opex', async () => {
    // Remove synced records but keep the account mapping
    await pool.query(
      `DELETE FROM accounting_synced_records
       WHERE account_id = $1 AND provider_record_id = 'exp-in-period-001'`,
      [testAccountId]
    );
    const totals = await syncSvc.getAccountingTotals(
      testAccountId, PROVIDER, PERIOD_START, PERIOD_END
    );
    // hasOpExAccounts is still true (account exists) but opexCents must be 0
    expect(totals.hasOpExAccounts).toBe(true);
    expect(totals.opexCents).toBe(0);

    // Re-insert for subsequent tests
    await pool.query(
      `INSERT INTO accounting_synced_records
         (account_id, provider, record_type, provider_record_id, amount_cents,
          currency, accounting_date, provider_account_id, fieldcore_category, synced_at)
       VALUES ($1,$2,'expense','exp-in-period-001',5400,'USD',$3,$4,'operating_expenses',NOW())
       ON CONFLICT (account_id, provider, record_type, provider_record_id) DO UPDATE
         SET amount_cents = 5400, accounting_date = $3`,
      [testAccountId, PROVIDER, IN_PERIOD_DATE, opexAccountId]
    );
  });

  it('GET /financials/details returns 400 without date params', async () => {
    const res = await request(app)
      .get('/api/integrations/accounting/quickbooks/financials/details')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(400);
  });

  it('GET /financials/details returns opex source records for authenticated owner', async () => {
    const res = await request(app)
      .get(`/api/integrations/accounting/quickbooks/financials/details?start=${PERIOD_START}&end=${PERIOD_END}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('opex');
    expect(res.body).toHaveProperty('cogs');
    expect(res.body).toHaveProperty('taxes');
    expect(res.body).toHaveProperty('period');
    expect(Array.isArray(res.body.opex)).toBe(true);
    const target = res.body.opex.find(r => r.providerRecordId === 'exp-in-period-001');
    expect(target).toBeDefined();
    expect(target.amountCents).toBe(5400);
  });

  it('GET /financials/details returns 401 without auth', async () => {
    const res = await request(app)
      .get(`/api/integrations/accounting/quickbooks/financials/details?start=${PERIOD_START}&end=${PERIOD_END}`);
    expect(res.status).toBe(401);
  });
});

// ── 13. Financial coverage with QB connected ─────────────────────────────────

describe('Financial coverage — QB accounting source', () => {
  const { resolveSourceStatuses } = require('../services/financialCoverageService');

  it('accounting source is not_connected when no QB connection', async () => {
    // Ensure disconnected
    await connSvc.disconnect(testAccountId, 'quickbooks_online');
    const statuses = await resolveSourceStatuses(testAccountId);
    expect(statuses.accounting.status).toBe('not_connected');
  });

  it('accounting source is active (connected) when QB is active', async () => {
    await connSvc.upsertConnection({
      accountId:    testAccountId,
      realmId:      'realm-cov-test',
      companyName:  'Coverage Test LLC',
      accessToken:  'at-cov',
      refreshToken: 'rt-cov',
      tokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    const statuses = await resolveSourceStatuses(testAccountId);
    // mapAccountingStatus maps 'connected' → 'active' for the coverage system
    expect(statuses.accounting.status).toBe('active');
    expect(statuses.accounting.connectionInfo).toBeDefined();
    expect(statuses.accounting.connectionInfo.companyName).toBe('Coverage Test LLC');
  });
});
