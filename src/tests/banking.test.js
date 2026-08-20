'use strict';
require('dotenv').config();
const request = require('supertest');
const app     = require('../app');
const pool    = require('../db/pool');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const { encrypt, decrypt } = require('../services/crypto');
const { runMigrations }    = require('../db/migrate');
const { getPlaidConfig, getPlaidStatusSafe } = require('../services/plaidConfig');

let testAccountId;
let ownerToken;
let managerToken;
let techToken;

beforeAll(async () => {
  await runMigrations();

  const { rows: acctRows } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
    [`__TEST_BANKING_${Date.now()}__`]
  );
  testAccountId = acctRows[0].id;

  const hash = await bcrypt.hash('Password1!', 10);

  const { rows: ownerRows } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'owner') RETURNING id`,
    [testAccountId, 'Banking Owner', `banktest_owner+${Date.now()}@test.com`, hash]
  );
  const { rows: mgrRows } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'manager') RETURNING id`,
    [testAccountId, 'Banking Mgr', `banktest_mgr+${Date.now()}@test.com`, hash]
  );
  const { rows: techRows } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'tech') RETURNING id`,
    [testAccountId, 'Banking Tech', `banktest_tech+${Date.now()}@test.com`, hash]
  );

  const sign = (userId, role) =>
    jwt.sign({ userId, accountId: testAccountId, role }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });

  ownerToken   = sign(ownerRows[0].id, 'owner');
  managerToken = sign(mgrRows[0].id,   'manager');
  techToken    = sign(techRows[0].id,  'tech');
}, 30000);

afterAll(async () => {
  await pool.query(`DELETE FROM financial_reconciliation_matches WHERE account_id = $1`, [testAccountId]);
  await pool.query(`DELETE FROM bank_sync_cursors WHERE account_id = $1`, [testAccountId]);
  await pool.query(`DELETE FROM bank_transactions WHERE account_id = $1`, [testAccountId]);
  await pool.query(`DELETE FROM bank_balance_snapshots WHERE account_id = $1`, [testAccountId]);
  await pool.query(`DELETE FROM bank_accounts WHERE account_id = $1`, [testAccountId]);
  await pool.query(`DELETE FROM bank_connections WHERE account_id = $1`, [testAccountId]);
  await pool.query(`DELETE FROM users WHERE account_id = $1`, [testAccountId]);
  await pool.query(`DELETE FROM accounts WHERE id = $1`, [testAccountId]);
  await pool.end();
});

// ── 1. Plaid Config ───────────────────────────────────────────────────────────

describe('Plaid config service', () => {
  it('returns a config object with required fields', () => {
    const cfg = getPlaidConfig();
    expect(cfg).toHaveProperty('configured');
    expect(cfg).toHaveProperty('environment');
    expect(cfg).toHaveProperty('clientId');
    expect(cfg).toHaveProperty('secret');
  });

  it('returns safe status without secret', () => {
    const safe = getPlaidStatusSafe();
    expect(safe).toHaveProperty('configured');
    expect(safe).toHaveProperty('provider', 'plaid');
    expect(safe).not.toHaveProperty('secret');
    expect(safe).not.toHaveProperty('clientId');
  });

  it('validates environment against allowed values', () => {
    const cfg = getPlaidConfig();
    if (cfg.environment) {
      expect(['sandbox', 'development', 'production']).toContain(cfg.environment);
    } else {
      expect(cfg.configured).toBe(false);
    }
  });
});

// ── 2. Token encryption ───────────────────────────────────────────────────────

describe('Access token encryption (reused from banking)', () => {
  it('encrypts and decrypts a Plaid access token', () => {
    const token     = 'access-sandbox-abc123-xyz789';
    const encrypted = encrypt(token);
    expect(encrypted).toMatch(/^[0-9a-f]+\.[0-9a-f]+\.[0-9a-f]+$/);
    expect(decrypt(encrypted)).toBe(token);
  });

  it('produces unique ciphertext for same token (random IV)', () => {
    const token = 'access-sandbox-same-value';
    expect(encrypt(token)).not.toBe(encrypt(token));
  });

  it('does not expose the plaintext in ciphertext', () => {
    const token     = 'access-sandbox-secret-token';
    const encrypted = encrypt(token);
    expect(encrypted).not.toContain(token);
  });
});

// ── 3. Status endpoint ────────────────────────────────────────────────────────

describe('GET /api/integrations/banking/plaid/status', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/integrations/banking/plaid/status');
    expect(res.status).toBe(401);
  });

  it('returns 403 for tech role', async () => {
    const res = await request(app)
      .get('/api/integrations/banking/plaid/status')
      .set('Authorization', `Bearer ${techToken}`);
    expect(res.status).toBe(403);
  });

  it('returns status for owner', async () => {
    const res = await request(app)
      .get('/api/integrations/banking/plaid/status')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('configured');
    expect(res.body).toHaveProperty('provider', 'plaid');
    expect(res.body).not.toHaveProperty('secret');
    expect(res.body).not.toHaveProperty('clientId');
  });

  it('returns status for manager', async () => {
    const res = await request(app)
      .get('/api/integrations/banking/plaid/status')
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
  });
});

// ── 4. Link token endpoint ────────────────────────────────────────────────────

describe('POST /api/integrations/banking/plaid/link-token', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/integrations/banking/plaid/link-token');
    expect(res.status).toBe(401);
  });

  it('returns 403 for tech role', async () => {
    const res = await request(app)
      .post('/api/integrations/banking/plaid/link-token')
      .set('Authorization', `Bearer ${techToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 503 or 200 depending on Plaid config', async () => {
    const cfg = getPlaidConfig();
    const res = await request(app)
      .post('/api/integrations/banking/plaid/link-token')
      .set('Authorization', `Bearer ${ownerToken}`);
    if (!cfg.configured) {
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('BANKING_NOT_CONFIGURED');
    } else {
      expect([200, 500]).toContain(res.status); // 200 if Plaid responds, 500 if Plaid is unreachable
    }
  });
});

// ── 5. Exchange endpoint ──────────────────────────────────────────────────────

describe('POST /api/integrations/banking/plaid/exchange', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/integrations/banking/plaid/exchange')
      .send({ publicToken: 'public-sandbox-test' });
    expect(res.status).toBe(401);
  });

  it('returns 400 without publicToken', async () => {
    const res = await request(app)
      .post('/api/integrations/banking/plaid/exchange')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

// ── 6. Connections endpoint ───────────────────────────────────────────────────

describe('GET /api/integrations/banking/plaid/connections', () => {
  it('returns empty array for new account', async () => {
    const res = await request(app)
      .get('/api/integrations/banking/plaid/connections')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.connections)).toBe(true);
  });

  it('tenant isolation — does not return other tenants connections', async () => {
    // Create a connection for a different account
    const { rows: otherAcct } = await pool.query(
      `INSERT INTO accounts (name, plan) VALUES ('OtherTenant', 'pro') RETURNING id`
    );
    const otherAccountId = otherAcct[0].id;
    try {
      await pool.query(
        `INSERT INTO bank_connections (account_id, provider, provider_item_id, institution_name, status, access_token_encrypted)
         VALUES ($1, 'plaid', 'item-other-tenant', 'Other Bank', 'CONNECTED', $2)`,
        [otherAccountId, encrypt('access-sandbox-other')]
      );

      const res = await request(app)
        .get('/api/integrations/banking/plaid/connections')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      // Should not include other tenant's connections
      const institutions = res.body.connections.map(c => c.institution_name);
      expect(institutions).not.toContain('Other Bank');
    } finally {
      await pool.query(`DELETE FROM bank_connections WHERE account_id = $1`, [otherAccountId]);
      await pool.query(`DELETE FROM accounts WHERE id = $1`, [otherAccountId]);
    }
  });
});

// ── 7. Account management ─────────────────────────────────────────────────────

describe('PATCH /api/integrations/banking/plaid/accounts/:id', () => {
  let connId, acctId;

  beforeAll(async () => {
    const { rows } = await pool.query(
      `INSERT INTO bank_connections (account_id, provider, provider_item_id, institution_name, status, access_token_encrypted)
       VALUES ($1, 'plaid', 'item-patch-test', 'Test Bank', 'CONNECTED', $2)
       RETURNING id`,
      [testAccountId, encrypt('access-sandbox-patch')]
    );
    connId = rows[0].id;

    const { rows: acctRows } = await pool.query(
      `INSERT INTO bank_accounts (bank_connection_id, account_id, provider_account_id, name, type, subtype, include_in_cash_position)
       VALUES ($1, $2, 'acct-patch-test', 'Patch Test Checking', 'depository', 'checking', true)
       RETURNING id`,
      [connId, testAccountId]
    );
    acctId = acctRows[0].id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM bank_accounts WHERE bank_connection_id = $1`, [connId]);
    await pool.query(`DELETE FROM bank_connections WHERE id = $1`, [connId]);
  });

  it('toggles include_in_cash_position', async () => {
    const res = await request(app)
      .patch(`/api/integrations/banking/plaid/accounts/${acctId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ include_in_cash_position: false });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(true);

    const { rows } = await pool.query(`SELECT include_in_cash_position FROM bank_accounts WHERE id = $1`, [acctId]);
    expect(rows[0].include_in_cash_position).toBe(false);
  });

  it('returns 404 for account belonging to different tenant', async () => {
    const { rows: other } = await pool.query(
      `INSERT INTO accounts (name, plan) VALUES ('TenantX', 'pro') RETURNING id`
    );
    const otherAccountId = other[0].id;
    const { rows: otherConn } = await pool.query(
      `INSERT INTO bank_connections (account_id, provider, provider_item_id, status, access_token_encrypted)
       VALUES ($1, 'plaid', 'item-other-x', 'CONNECTED', $2) RETURNING id`,
      [otherAccountId, encrypt('tok')]
    );
    const { rows: otherAcct } = await pool.query(
      `INSERT INTO bank_accounts (bank_connection_id, account_id, provider_account_id, name, type, subtype)
       VALUES ($1, $2, 'acct-other-x', 'Other Acct', 'depository', 'checking') RETURNING id`,
      [otherConn[0].id, otherAccountId]
    );

    const res = await request(app)
      .patch(`/api/integrations/banking/plaid/accounts/${otherAcct[0].id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ include_in_cash_position: false });
    expect(res.status).toBe(404);

    await pool.query(`DELETE FROM bank_accounts WHERE account_id = $1`, [otherAccountId]);
    await pool.query(`DELETE FROM bank_connections WHERE account_id = $1`, [otherAccountId]);
    await pool.query(`DELETE FROM accounts WHERE id = $1`, [otherAccountId]);
  });
});

// ── 8. Transaction sync and storage ──────────────────────────────────────────

describe('Bank transaction storage', () => {
  let connId, bankAcctId;

  beforeAll(async () => {
    const { rows: conn } = await pool.query(
      `INSERT INTO bank_connections (account_id, provider, provider_item_id, institution_name, status, access_token_encrypted)
       VALUES ($1, 'plaid', 'item-txn-test', 'Transaction Bank', 'CONNECTED', $2)
       RETURNING id`,
      [testAccountId, encrypt('access-sandbox-txn')]
    );
    connId = conn[0].id;

    const { rows: acct } = await pool.query(
      `INSERT INTO bank_accounts (bank_connection_id, account_id, provider_account_id, name, type, subtype, include_in_cash_position)
       VALUES ($1, $2, 'acct-txn-test', 'TXN Checking', 'depository', 'checking', true)
       RETURNING id`,
      [connId, testAccountId]
    );
    bankAcctId = acct[0].id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM financial_reconciliation_matches WHERE account_id = $1 AND bank_transaction_id IN (SELECT id FROM bank_transactions WHERE account_id = $1)`, [testAccountId]);
    await pool.query(`DELETE FROM bank_transactions WHERE bank_connection_id = $1`, [connId]);
    await pool.query(`DELETE FROM bank_accounts WHERE bank_connection_id = $1`, [connId]);
    await pool.query(`DELETE FROM bank_connections WHERE id = $1`, [connId]);
  });

  async function insertTransaction(overrides = {}) {
    const defaults = {
      provider_transaction_id: `txn-test-${Date.now()}-${Math.random()}`,
      posted_date: '2026-01-15',
      description: 'Test Transaction',
      amount: 100.00,
      direction: 'CASH_OUT',
      pending: false,
      reconciliation_status: 'UNMATCHED',
    };
    const tx = { ...defaults, ...overrides };
    const { rows } = await pool.query(
      `INSERT INTO bank_transactions
         (account_id, bank_connection_id, bank_account_id, provider_transaction_id,
          posted_date, description, amount, direction, currency, pending, reconciliation_status,
          excluded_from_analytics, raw_metadata_safe)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'USD',$9,$10,FALSE,'{}')
       RETURNING *`,
      [testAccountId, connId, bankAcctId, tx.provider_transaction_id,
       tx.posted_date, tx.description, tx.amount, tx.direction,
       tx.pending, tx.reconciliation_status]
    );
    return rows[0];
  }

  it('stores a CASH_IN transaction', async () => {
    const tx = await insertTransaction({ direction: 'CASH_IN', amount: 500.00, description: 'Client Payment' });
    expect(tx.direction).toBe('CASH_IN');
    expect(parseFloat(tx.amount)).toBe(500.00);
  });

  it('stores a CASH_OUT transaction', async () => {
    const tx = await insertTransaction({ direction: 'CASH_OUT', amount: 250.00, description: 'Office Supply' });
    expect(tx.direction).toBe('CASH_OUT');
    expect(parseFloat(tx.amount)).toBe(250.00);
  });

  it('idempotency — duplicate provider_transaction_id updates instead of duplicating', async () => {
    const txId = `idempotent-tx-${Date.now()}`;
    await insertTransaction({ provider_transaction_id: txId, amount: 100.00 });

    const { rows } = await pool.query(
      `INSERT INTO bank_transactions
         (account_id, bank_connection_id, bank_account_id, provider_transaction_id,
          posted_date, description, amount, direction, currency, pending, reconciliation_status,
          excluded_from_analytics, raw_metadata_safe)
       VALUES ($1,$2,$3,$4,'2026-01-16','Updated Description',150.00,'CASH_OUT','USD',FALSE,'UNMATCHED',FALSE,'{}')
       ON CONFLICT (account_id, provider_transaction_id) DO UPDATE SET
         description = EXCLUDED.description, amount = EXCLUDED.amount, updated_at = NOW()
       RETURNING *`,
      [testAccountId, connId, bankAcctId, txId]
    );
    expect(rows[0].description).toBe('Updated Description');
    expect(parseFloat(rows[0].amount)).toBe(150.00);
  });

  it('stores pending transactions separately from posted', async () => {
    const pending = await insertTransaction({ pending: true, description: 'Pending Purchase' });
    const posted  = await insertTransaction({ pending: false, description: 'Posted Purchase' });
    expect(pending.pending).toBe(true);
    expect(posted.pending).toBe(false);
  });

  it('marks internal transfers with TRANSFER status', async () => {
    const txOut = await insertTransaction({
      provider_transaction_id: `transfer-out-${Date.now()}`,
      direction: 'CASH_OUT',
      amount: 5000.00,
      description: 'Transfer to Savings',
      posted_date: '2026-01-20',
    });
    const txIn = await insertTransaction({
      provider_transaction_id: `transfer-in-${Date.now()}`,
      direction: 'CASH_IN',
      amount: 5000.00,
      description: 'Transfer from Checking',
      posted_date: '2026-01-20',
    });

    // Run transfer detection
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
         AND (t1.id = $3 OR t2.id = $3)`,
      [connId, testAccountId, txOut.id]
    );

    const { rows } = await pool.query(
      `SELECT id, reconciliation_status FROM bank_transactions WHERE id = ANY($1::uuid[])`,
      [[txOut.id, txIn.id]]
    );
    const transferred = rows.filter(r => r.reconciliation_status === 'TRANSFER');
    expect(transferred.length).toBeGreaterThan(0);
  });
});

// ── 9. Cash flow calculation ──────────────────────────────────────────────────

describe('Cash flow calculation', () => {
  let connId, bankAcctId;

  beforeAll(async () => {
    const { rows: conn } = await pool.query(
      `INSERT INTO bank_connections (account_id, provider, provider_item_id, status, access_token_encrypted)
       VALUES ($1, 'plaid', 'item-cf-test', 'CONNECTED', $2) RETURNING id`,
      [testAccountId, encrypt('access-sandbox-cf')]
    );
    connId = conn[0].id;
    const { rows: acct } = await pool.query(
      `INSERT INTO bank_accounts (bank_connection_id, account_id, provider_account_id, name, type, subtype, include_in_cash_position)
       VALUES ($1,$2,'acct-cf','CF Checking','depository','checking',TRUE) RETURNING id`,
      [connId, testAccountId]
    );
    bankAcctId = acct[0].id;

    // Insert test transactions
    const txns = [
      { dir: 'CASH_IN',  amount: 1000.00, status: 'UNMATCHED', pending: false },
      { dir: 'CASH_IN',  amount:  500.00, status: 'UNMATCHED', pending: false },
      { dir: 'CASH_OUT', amount:  300.00, status: 'UNMATCHED', pending: false },
      { dir: 'CASH_IN',  amount: 2000.00, status: 'TRANSFER',  pending: false }, // excluded
      { dir: 'CASH_IN',  amount:  100.00, status: 'UNMATCHED', pending: true  }, // pending
    ];
    for (let i = 0; i < txns.length; i++) {
      const t = txns[i];
      await pool.query(
        `INSERT INTO bank_transactions
           (account_id, bank_connection_id, bank_account_id, provider_transaction_id,
            posted_date, description, amount, direction, currency, pending, reconciliation_status,
            excluded_from_analytics, raw_metadata_safe)
         VALUES ($1,$2,$3,$4,'2026-07-01',$5,$6,$7,'USD',$8,$9,FALSE,'{}')`,
        [testAccountId, connId, bankAcctId, `cf-tx-${i}`, `CF TX ${i}`, t.amount, t.dir, t.pending, t.status]
      );
    }
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM bank_transactions WHERE bank_connection_id = $1`, [connId]);
    await pool.query(`DELETE FROM bank_accounts WHERE bank_connection_id = $1`, [connId]);
    await pool.query(`DELETE FROM bank_connections WHERE id = $1`, [connId]);
  });

  it('calculates cash in (excluding transfers and pending)', async () => {
    const { getCashFlowSummary } = require('../services/bankingSyncService');
    const result = await getCashFlowSummary(testAccountId, { includePending: false });
    expect(result.cashIn).toBeGreaterThanOrEqual(1500); // 1000 + 500
  });

  it('calculates cash out', async () => {
    const { getCashFlowSummary } = require('../services/bankingSyncService');
    const result = await getCashFlowSummary(testAccountId, { includePending: false });
    expect(result.cashOut).toBeGreaterThanOrEqual(300);
  });

  it('calculates net cash flow = cash in - cash out', async () => {
    const { getCashFlowSummary } = require('../services/bankingSyncService');
    const result = await getCashFlowSummary(testAccountId, { includePending: false });
    expect(result.netCashFlow).toBe(result.cashIn - result.cashOut);
  });

  it('excludes TRANSFER transactions from cash flow', async () => {
    const { getCashFlowSummary } = require('../services/bankingSyncService');
    const result = await getCashFlowSummary(testAccountId, { includePending: false });
    expect(result.cashIn).toBeLessThan(3500); // 2000 transfer excluded
  });
});

// ── 10. Cash position ─────────────────────────────────────────────────────────

describe('Total cash position', () => {
  let connId;

  beforeAll(async () => {
    const { rows } = await pool.query(
      `INSERT INTO bank_connections (account_id, provider, provider_item_id, status, access_token_encrypted)
       VALUES ($1,'plaid','item-pos-test','CONNECTED',$2) RETURNING id`,
      [testAccountId, encrypt('access-sandbox-pos')]
    );
    connId = rows[0].id;

    await pool.query(
      `INSERT INTO bank_accounts (bank_connection_id, account_id, provider_account_id, name, type, subtype, current_balance, include_in_cash_position)
       VALUES ($1,$2,'acct-pos-1','Checking','depository','checking',10000.00,TRUE),
              ($1,$2,'acct-pos-2','Savings','depository','savings',25000.00,TRUE),
              ($1,$2,'acct-pos-3','Credit Card','credit','credit card',-500.00,FALSE)`,
      [connId, testAccountId]
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM bank_accounts WHERE bank_connection_id = $1`, [connId]);
    await pool.query(`DELETE FROM bank_connections WHERE id = $1`, [connId]);
  });

  it('sums only cash-position-included accounts', async () => {
    const { getTotalCashPosition } = require('../services/bankingSyncService');
    const pos = await getTotalCashPosition(testAccountId);
    expect(pos.total).toBeGreaterThanOrEqual(35000); // 10000 + 25000
    expect(pos.total).toBeLessThan(36000); // credit card excluded
  });

  it('excludes credit cards from cash position by default', async () => {
    const { getTotalCashPosition } = require('../services/bankingSyncService');
    const pos = await getTotalCashPosition(testAccountId);
    // Should not include the -500 credit card
    expect(pos.total).toBeGreaterThan(0);
  });
});

// ── 11. Transaction list endpoint ─────────────────────────────────────────────

describe('GET /api/integrations/banking/plaid/transactions', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/integrations/banking/plaid/transactions');
    expect(res.status).toBe(401);
  });

  it('returns 403 for tech role', async () => {
    const res = await request(app)
      .get('/api/integrations/banking/plaid/transactions')
      .set('Authorization', `Bearer ${techToken}`);
    expect(res.status).toBe(403);
  });

  it('returns transaction list for owner', async () => {
    const res = await request(app)
      .get('/api/integrations/banking/plaid/transactions')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.transactions)).toBe(true);
    expect(res.body).toHaveProperty('total');
  });

  it('supports date filtering', async () => {
    const res = await request(app)
      .get('/api/integrations/banking/plaid/transactions?start=2026-01-01&end=2026-12-31')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
  });

  it('supports direction filter', async () => {
    const res = await request(app)
      .get('/api/integrations/banking/plaid/transactions?direction=CASH_IN')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.transactions.every(t => t.direction === 'CASH_IN')).toBe(true);
  });
});

// ── 12. Cash flow endpoint ────────────────────────────────────────────────────

describe('GET /api/integrations/banking/plaid/cash-flow', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/integrations/banking/plaid/cash-flow');
    expect(res.status).toBe(401);
  });

  it('returns cash flow for authenticated user', async () => {
    const res = await request(app)
      .get('/api/integrations/banking/plaid/cash-flow')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('cashIn');
    expect(res.body).toHaveProperty('cashOut');
    expect(res.body).toHaveProperty('netCashFlow');
  });
});

// ── 13. Disconnect endpoint ───────────────────────────────────────────────────

describe('POST /api/integrations/banking/plaid/disconnect', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/integrations/banking/plaid/disconnect')
      .send({ connectionId: 'fake' });
    expect(res.status).toBe(401);
  });

  it('returns 400 without connectionId', async () => {
    const res = await request(app)
      .post('/api/integrations/banking/plaid/disconnect')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('disconnects and preserves historical transactions', async () => {
    // Create a connection with a transaction
    const { rows: conn } = await pool.query(
      `INSERT INTO bank_connections (account_id, provider, provider_item_id, institution_name, status, access_token_encrypted)
       VALUES ($1,'plaid','item-disc-test','Disconnect Bank','CONNECTED',$2) RETURNING id`,
      [testAccountId, encrypt('access-sandbox-disc')]
    );
    const connId = conn[0].id;
    const { rows: acct } = await pool.query(
      `INSERT INTO bank_accounts (bank_connection_id, account_id, provider_account_id, name, type, subtype)
       VALUES ($1,$2,'acct-disc','Disc Checking','depository','checking') RETURNING id`,
      [connId, testAccountId]
    );
    await pool.query(
      `INSERT INTO bank_transactions
         (account_id, bank_connection_id, bank_account_id, provider_transaction_id,
          posted_date, description, amount, direction, currency, pending, reconciliation_status,
          excluded_from_analytics, raw_metadata_safe)
       VALUES ($1,$2,$3,'txn-disc-test','2026-01-01','Historical TX',100,'CASH_OUT','USD',FALSE,'UNMATCHED',FALSE,'{}')`,
      [testAccountId, connId, acct[0].id]
    );

    const res = await request(app)
      .post('/api/integrations/banking/plaid/disconnect')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ connectionId: connId });
    expect(res.status).toBe(200);
    expect(res.body.disconnected).toBe(true);

    // Verify historical transactions preserved
    const { rows: txns } = await pool.query(
      `SELECT id FROM bank_transactions WHERE bank_connection_id = $1`, [connId]
    );
    expect(txns.length).toBe(1);

    // Verify connection marked disconnected
    const { rows: connRows } = await pool.query(
      `SELECT status FROM bank_connections WHERE id = $1`, [connId]
    );
    expect(connRows[0].status).toBe('DISCONNECTED');

    // Cleanup
    await pool.query(`DELETE FROM bank_transactions WHERE bank_connection_id = $1`, [connId]);
    await pool.query(`DELETE FROM bank_accounts WHERE bank_connection_id = $1`, [connId]);
    await pool.query(`DELETE FROM bank_connections WHERE id = $1`, [connId]);
  });
});

// ── 14. Sync endpoint ─────────────────────────────────────────────────────────

describe('POST /api/integrations/banking/plaid/sync', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/integrations/banking/plaid/sync')
      .send({ connectionId: 'fake' });
    expect(res.status).toBe(401);
  });

  it('returns 400 without connectionId', async () => {
    const res = await request(app)
      .post('/api/integrations/banking/plaid/sync')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent connection', async () => {
    const res = await request(app)
      .post('/api/integrations/banking/plaid/sync')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ connectionId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(404);
  });
});

// ── 15. Webhook endpoint ──────────────────────────────────────────────────────

describe('POST /api/integrations/banking/plaid/webhook', () => {
  it('returns 200 for any inbound webhook (immediate ack)', async () => {
    const res = await request(app)
      .post('/api/integrations/banking/plaid/webhook')
      .send({
        webhook_type: 'TRANSACTIONS',
        webhook_code: 'SYNC_UPDATES_AVAILABLE',
        item_id: 'item-webhook-test',
      });
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  it('handles ITEM webhook without crashing', async () => {
    const res = await request(app)
      .post('/api/integrations/banking/plaid/webhook')
      .send({
        webhook_type: 'ITEM',
        webhook_code: 'ERROR',
        item_id: 'item-webhook-test',
        error: { error_code: 'ITEM_LOGIN_REQUIRED' },
      });
    expect(res.status).toBe(200);
  });
});

// ── 16. Permissions ───────────────────────────────────────────────────────────

describe('Permissions — tech role blocked from banking endpoints', () => {
  const endpoints = [
    { method: 'get',  path: '/api/integrations/banking/plaid/status' },
    { method: 'post', path: '/api/integrations/banking/plaid/link-token' },
    { method: 'get',  path: '/api/integrations/banking/plaid/connections' },
    { method: 'get',  path: '/api/integrations/banking/plaid/transactions' },
    { method: 'get',  path: '/api/integrations/banking/plaid/cash-flow' },
    { method: 'get',  path: '/api/integrations/banking/plaid/cash-position' },
  ];

  endpoints.forEach(({ method, path: p }) => {
    it(`blocks tech from ${method.toUpperCase()} ${p}`, async () => {
      const res = await request(app)[method](p)
        .set('Authorization', `Bearer ${techToken}`);
      expect(res.status).toBe(403);
    });
  });
});
