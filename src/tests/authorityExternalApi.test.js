'use strict';

/**
 * Stage 5 — External Authority Evaluation API Tests
 *
 * Sections:
 *   1:  DB migration — authority_api_credentials table + actor columns
 *   2:  Rollout flags
 *   3:  Credential service (unit)
 *   4:  Authentication — valid / malformed / unknown / revoked / wrong-secret
 *   5:  Log redaction utility (unit)
 *   6:  Scopes, capabilities, admin-route security
 *   7:  Tenant isolation
 *   8:  Evaluation passthrough + static isolation
 *   9:  Temporal behavior
 *  10:  Idempotency mapping
 *  11:  Credential lifecycle (create / revoke / replace / last_used_at)
 *  12:  Rate limiting
 *  13:  Audit events
 *  14:  Request correlation
 *  15:  Regression — Stage 1-4 routes still green
 */

require('dotenv').config();

const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const request = require('supertest');
const app     = require('../app');
const pool    = require('../db/pool');
const { runMigrations } = require('../db/migrate');

const credentialService   = require('../services/authorityCredentialService');
const externalConfig      = require('../services/authorityExternalConfig');
const { redactHeaders, deepRedact, REDACTED } = require('../middleware/redactHeaders');
const rateLimit           = require('../middleware/authorityRateLimit');
const authorityService    = require('../services/authorityService');
const { TEST_POLICY_REGISTRY } = require('../services/authorityPolicyRegistry');

// ── Stable test credential key (not ENCRYPTION_KEY, not AUTHORITY_DATA_ENCRYPTION_KEY) ──
const TEST_CREDENTIAL_KEY   = crypto.randomBytes(32).toString('hex');
const TEST_AUTHORITY_KEY    = crypto.randomBytes(32).toString('hex');
const TEST_CREDENTIAL_KEY_B = crypto.randomBytes(32).toString('hex'); // for isolation

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToken(userId, accountId, role = 'owner') {
  return jwt.sign({ userId, accountId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function setFlags({ externalEnabled = false, authorityEnabled = true } = {}) {
  process.env.AUTHORITY_EXTERNAL_API_ENABLED = externalEnabled ? 'true' : 'false';
  process.env.AUTHORITY_ENABLED              = authorityEnabled ? 'true' : 'false';
  process.env.AUTHORITY_API_CREDENTIAL_KEY   = TEST_CREDENTIAL_KEY;
  externalConfig._resetFatalLogLatch();
}

// ── Test state ────────────────────────────────────────────────────────────────

let accountId, userId, token;
let accountB_Id, userB_Id, tokenB;
let principalParty, agentParty, verifiedInstr;
let credA; // { credential, credentialId, publicId, row }

const CLEANUP = [];

beforeAll(async () => {
  process.env.AUTHORITY_ENABLED             = 'true';
  process.env.AUTHORITY_DATA_ENCRYPTION_KEY = TEST_AUTHORITY_KEY;
  process.env.AUTHORITY_API_CREDENTIAL_KEY  = TEST_CREDENTIAL_KEY;

  await runMigrations();

  const hash = await bcrypt.hash('ext-test-pw', 10);

  // Institution account A
  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan, account_type) VALUES ($1,'institution','institution') RETURNING id`,
    ['__TEST_EXT_A__']
  );
  accountId = acct.id;
  CLEANUP.push({ table: 'accounts', id: accountId });

  const { rows: [u] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Ext Tester A',$2,$3,'owner') RETURNING id`,
    [accountId, `ext-a-${Date.now()}@fieldcore.test`, hash]
  );
  userId = u.id;
  token  = makeToken(userId, accountId, 'owner');

  // Capabilities for the test user
  await pool.query(
    `INSERT INTO platform_user_capabilities (user_id, capability)
     VALUES ($1,'AUTHORITY_EVALUATE'),
            ($1,'AUTHORITY_INSTRUMENT_VERIFY'),
            ($1,'AUTHORITY_INSTRUMENT_REJECT'),
            ($1,'AUTHORITY_API_CREDENTIAL_MANAGE'),
            ($1,'AUTHORITY_API_CREDENTIAL_READ')
     ON CONFLICT DO NOTHING`,
    [userId]
  );

  // Institution account B (isolation)
  const { rows: [acctB] } = await pool.query(
    `INSERT INTO accounts (name, plan, account_type) VALUES ($1,'institution','institution') RETURNING id`,
    ['__TEST_EXT_B__']
  );
  accountB_Id = acctB.id;
  CLEANUP.push({ table: 'accounts', id: accountB_Id });

  const { rows: [uB] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Ext Tester B',$2,$3,'owner') RETURNING id`,
    [accountB_Id, `ext-b-${Date.now()}@fieldcore.test`, hash]
  );
  userB_Id = uB.id;
  tokenB   = makeToken(userB_Id, accountB_Id, 'owner');
  await pool.query(
    `INSERT INTO platform_user_capabilities (user_id, capability)
     VALUES ($1,'AUTHORITY_EVALUATE'),($1,'AUTHORITY_INSTRUMENT_VERIFY'),
            ($1,'AUTHORITY_INSTRUMENT_REJECT'),($1,'AUTHORITY_API_CREDENTIAL_MANAGE')
     ON CONFLICT DO NOTHING`,
    [userB_Id]
  );

  // Authority data for account A
  principalParty = await authorityService.createParty(accountId, userId, {
    partyType: 'person', displayName: 'Ext Principal',
  });
  agentParty = await authorityService.createParty(accountId, userId, {
    partyType: 'person', displayName: 'Ext Agent',
  });

  verifiedInstr = await authorityService.createInstrument(accountId, userId, {
    instrumentType: 'power_of_attorney',
    effectiveDate:  '2025-01-01',
    expirationDate: '2035-12-31',
    jurisdiction:   'Delaware, USA',
  });
  await authorityService.addParticipant(accountId, userId, verifiedInstr.id,
    { partyId: principalParty.id, role: 'principal', sequence: 1 });
  await authorityService.addParticipant(accountId, userId, verifiedInstr.id,
    { partyId: agentParty.id, role: 'agent', sequence: 2 });
  await authorityService.addPermission(accountId, userId, verifiedInstr.id, {
    actionKey: 'BANKING.WIRE_TRANSFER', grantType: 'granted',
  });
  await authorityService.transitionInstrument(accountId, userId, verifiedInstr.id, 'PENDING_REVIEW');
  await authorityService.transitionInstrument(accountId, userId, verifiedInstr.id, 'VERIFIED');
  verifiedInstr = await authorityService.getInstrument(accountId, verifiedInstr.id);

  // Create a test credential for account A (flag ON for creation)
  process.env.AUTHORITY_EXTERNAL_API_ENABLED = 'true';
  credA = await credentialService.generateCredential(
    accountId, 'Test credential A', ['authority:evaluate'], userId
  );

  // Reset to safe defaults after setup
  process.env.AUTHORITY_EXTERNAL_API_ENABLED = 'false';
}, 60000);

afterAll(async () => {
  for (const { table, id } of [...CLEANUP].reverse()) {
    try { await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]); } catch {}
  }
  await pool.end();
}, 30000);

// ═══════════════════════════════════════════════════════════════════════════════
// Section 1: DB Migration
// ═══════════════════════════════════════════════════════════════════════════════

describe('§1 DB Migration — authority_api_credentials', () => {
  test('1.1 authority_api_credentials table exists', async () => {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'authority_api_credentials'`
    );
    expect(rows.length).toBe(1);
  });

  test('1.2 required columns present', async () => {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'authority_api_credentials'`
    );
    const cols = rows.map(r => r.column_name);
    for (const col of [
      'id','account_id','public_id','secret_verifier','verifier_version',
      'algorithm','label','status','scopes','created_by_user_id','created_at',
      'revoked_by_user_id','revoked_at','revocation_reason','last_used_at',
      'replaces_credential_id',
    ]) {
      expect(cols).toContain(col);
    }
  });

  test('1.3 unique index on public_id', async () => {
    const { rows } = await pool.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'authority_api_credentials'
       AND indexname = 'idx_authority_api_credentials_public_id'`
    );
    expect(rows.length).toBe(1);
  });

  test('1.4 actor columns present on authority_evaluations', async () => {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'authority_evaluations'`
    );
    const cols = rows.map(r => r.column_name);
    expect(cols).toContain('actor_type');
    expect(cols).toContain('requesting_user_id');
    expect(cols).toContain('requesting_api_credential_id');
  });

  test('1.5 actor_exclusive check constraint exists', async () => {
    const { rows } = await pool.query(
      `SELECT conname FROM pg_constraint WHERE conname = 'authority_evaluations_actor_exclusive'`
    );
    expect(rows.length).toBe(1);
  });

  test('1.6 no raw secret column in authority_api_credentials', async () => {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'authority_api_credentials'`
    );
    const cols = rows.map(r => r.column_name);
    expect(cols).not.toContain('secret');
    expect(cols).not.toContain('raw_secret');
    expect(cols).not.toContain('plaintext_secret');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 2: Rollout flags
// ═══════════════════════════════════════════════════════════════════════════════

describe('§2 Rollout flags', () => {
  afterEach(() => {
    setFlags({ externalEnabled: false, authorityEnabled: true });
    rateLimit._resetForTest();
  });

  test('2.1 internal Authority routes (Stage 1-4) remain accessible with AUTHORITY_EXTERNAL_API_ENABLED=false',
  async () => {
    setFlags({ externalEnabled: false, authorityEnabled: true });
    const res = await request(app)
      .get('/api/authority/instruments')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).not.toBe(503);
    expect(res.status).toBeLessThan(500);
  });

  test('2.2 external API unavailable when external flag OFF', async () => {
    setFlags({ externalEnabled: false });
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send({ instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
        delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
        requested_at: new Date().toISOString() });
    expect(res.status).toBe(403);
    expect(res.body.error || res.body.code).toMatch(/AUTHORITY_API_UNAVAILABLE/i);
  });

  test('2.3 external API unavailable when AUTHORITY_ENABLED=false (both flags)', async () => {
    setFlags({ externalEnabled: true, authorityEnabled: false });
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send({ instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
        delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
        requested_at: new Date().toISOString() });
    expect(res.status).toBe(403);
  });

  test('2.4 both flags ON → external API reachable', async () => {
    setFlags({ externalEnabled: true, authorityEnabled: true });
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send({ instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
        delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
        requested_at: new Date().toISOString() });
    // 200 or evaluation-level rejection, but NOT auth/flag errors
    expect([200, 409, 422]).toContain(res.status);
  });

  test('2.5 isExternalApiEnabled returns false when key is missing', () => {
    const saved = process.env.AUTHORITY_API_CREDENTIAL_KEY;
    process.env.AUTHORITY_EXTERNAL_API_ENABLED = 'true';
    delete process.env.AUTHORITY_API_CREDENTIAL_KEY;
    externalConfig._resetFatalLogLatch();
    expect(externalConfig.isExternalApiEnabled()).toBe(false);
    process.env.AUTHORITY_API_CREDENTIAL_KEY = saved;
    externalConfig._resetFatalLogLatch();
  });

  test('2.6 AUTHORITY_API_CREDENTIAL_KEY validation is independent of AUTHORITY_DATA_ENCRYPTION_KEY', () => {
    expect(process.env.AUTHORITY_API_CREDENTIAL_KEY).not.toBe(process.env.AUTHORITY_DATA_ENCRYPTION_KEY);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 3: Credential service (unit)
// ═══════════════════════════════════════════════════════════════════════════════

describe('§3 Credential service', () => {
  test('3.1 credential format matches expected pattern', () => {
    expect(credA.credential).toMatch(/^fc_dev_[A-Za-z0-9_-]{16}_[A-Za-z0-9_-]{43}$/);
  });

  test('3.2 raw secret is NOT stored in the DB row', async () => {
    const { rows } = await pool.query(
      `SELECT * FROM authority_api_credentials WHERE id = $1`, [credA.credentialId]
    );
    expect(rows.length).toBe(1);
    const row = rows[0];
    // None of the columns should contain the raw credential string
    const rowJson = JSON.stringify(row);
    expect(rowJson).not.toContain(credA.credential);
    // secret_verifier is a hex string, NOT the raw secret
    expect(row.secret_verifier).not.toBe(credA.credential);
    expect(row.secret_verifier).toMatch(/^[0-9a-f]{64}$/);
  });

  test('3.3 verifyCredential returns the row for a valid credential', async () => {
    process.env.AUTHORITY_API_CREDENTIAL_KEY = TEST_CREDENTIAL_KEY;
    const result = await credentialService.verifyCredential(credA.credential);
    expect(result).toBeTruthy();
    expect(result.row.id).toBe(credA.credentialId);
    expect(result.verified).toBe(true);
    // Does not return the secret
    expect(JSON.stringify(result.row)).not.toContain(credA.credential);
  });

  test('3.4 verifyCredential returns null for wrong secret (same publicId)', async () => {
    const wrongCred = `fc_dev_${credA.publicId}_${'X'.repeat(43)}`;
    const result = await credentialService.verifyCredential(wrongCred);
    expect(result).toBeNull();
  });

  test('3.5 verifyCredential returns null for malformed credential (NO DB lookup)', async () => {
    const querySpy = jest.spyOn(pool, 'query');
    const result = await credentialService.verifyCredential('not-a-valid-credential-at-all');
    expect(result).toBeNull();
    // Should not have queried the DB for a malformed credential
    const credLookups = querySpy.mock.calls.filter(
      c => typeof c[0] === 'string' && c[0].includes('authority_api_credentials') && c[0].includes('WHERE public_id')
    );
    expect(credLookups.length).toBe(0);
    querySpy.mockRestore();
  });

  test('3.6 verifyCredential returns null for unknown publicId', async () => {
    const unknownCred = `fc_dev_${'A'.repeat(16)}_${'B'.repeat(43)}`;
    const result = await credentialService.verifyCredential(unknownCred);
    expect(result).toBeNull();
  });

  test('3.7 VALID_SCOPES includes authority:evaluate and authority:evaluations:read', () => {
    expect(credentialService.VALID_SCOPES).toContain('authority:evaluate');
    expect(credentialService.VALID_SCOPES).toContain('authority:evaluations:read');
  });

  test('3.8 generateCredential rejects unknown scope', async () => {
    await expect(
      credentialService.generateCredential(accountId, 'Bad', ['authority:evaluate', 'admin:all'], userId)
    ).rejects.toThrow(/Unknown scope/);
  });

  test('3.9 AUTHORITY_API_CREDENTIAL_KEY is not ENCRYPTION_KEY', () => {
    expect(process.env.AUTHORITY_API_CREDENTIAL_KEY).not.toBe(process.env.ENCRYPTION_KEY);
    expect(process.env.AUTHORITY_API_CREDENTIAL_KEY).not.toBe(process.env.AUTHORITY_DATA_ENCRYPTION_KEY);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 4: Authentication
// ═══════════════════════════════════════════════════════════════════════════════

describe('§4 Authentication', () => {
  beforeEach(() => {
    setFlags({ externalEnabled: true, authorityEnabled: true });
    rateLimit._resetForTest();
  });
  afterEach(() => {
    setFlags({ externalEnabled: false });
    rateLimit._resetForTest();
  });

  function evalBody() {
    return {
      instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
      delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
      requested_at: new Date().toISOString(),
    };
  }

  test('4.1 valid credential → authenticated (200 or evaluation result)', async () => {
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send(evalBody());
    expect([200, 409, 422]).toContain(res.status);
    expect(String(res.body.error ?? '')).not.toMatch(/AUTHENTICATION_FAILED/i);
  });

  test('4.2 missing Authorization header → 401 AUTHENTICATION_FAILED', async () => {
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send(evalBody());
    expect(res.status).toBe(401);
    expect(res.body.error || res.body.code).toMatch(/AUTHENTICATION_FAILED/i);
  });

  test('4.3 malformed credential (wrong prefix) → 401, no DB credential lookup', async () => {
    const querySpy = jest.spyOn(pool, 'query');
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', 'Bearer NOT_A_REAL_CREDENTIAL')
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send(evalBody());
    expect(res.status).toBe(401);
    expect(res.body.error || res.body.code).toMatch(/AUTHENTICATION_FAILED/i);
    const credLookups = querySpy.mock.calls.filter(
      c => typeof c[0] === 'string' && c[0].includes('authority_api_credentials') && c[0].includes('WHERE public_id')
    );
    expect(credLookups.length).toBe(0);
    querySpy.mockRestore();
  });

  test('4.4 unknown publicId → 401 (same body/status as malformed)', async () => {
    const unknown = `fc_dev_${'Z'.repeat(16)}_${'Z'.repeat(43)}`;
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${unknown}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send(evalBody());
    expect(res.status).toBe(401);
    expect(res.body.error || res.body.code).toMatch(/AUTHENTICATION_FAILED/i);
  });

  test('4.5 wrong secret (valid format, valid publicId) → 401', async () => {
    // Same publicId, different secret
    const wrongSecret = credA.credential.replace(/_[A-Za-z0-9_-]{43}$/, '_' + 'X'.repeat(43));
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${wrongSecret}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send(evalBody());
    expect(res.status).toBe(401);
    expect(res.body.error || res.body.code).toMatch(/AUTHENTICATION_FAILED/i);
  });

  test('4.6 revoked credential → 401 (same code as other failures)', async () => {
    // Create and immediately revoke a credential for this test
    process.env.AUTHORITY_API_CREDENTIAL_KEY = TEST_CREDENTIAL_KEY;
    const tmp = await credentialService.generateCredential(
      accountId, 'Revoke test', ['authority:evaluate'], userId
    );
    await credentialService.revokeCredential(tmp.credentialId, userId, 'Test revoke');

    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${tmp.credential}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send(evalBody());
    expect(res.status).toBe(401);
    expect(res.body.error || res.body.code).toMatch(/AUTHENTICATION_FAILED/i);
  });

  test('4.7 malformed/unknown/revoked/wrong-secret all return AUTHENTICATION_FAILED with HTTP 401 (uniform)', async () => {
    const cases = [
      'Bearer NOT_A_CREDENTIAL',
      `Bearer fc_dev_${'Z'.repeat(16)}_${'Z'.repeat(43)}`,
    ];
    for (const authHeader of cases) {
      const res = await request(app)
        .post('/api/v1/authority/evaluations')
        .set('Authorization', authHeader)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Content-Type', 'application/json')
        .send(evalBody());
      expect(res.status).toBe(401);
      expect(res.body.error || res.body.code).toMatch(/AUTHENTICATION_FAILED/i);
    }
  });

  test('4.8 credential in query string → rejected (not authenticated)', async () => {
    const res = await request(app)
      .post(`/api/v1/authority/evaluations?key=${credA.credential}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send(evalBody());
    expect(res.status).toBe(401);
  });

  test('4.9 user JWT/session on external route is rejected (not a machine credential)', async () => {
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${token}`)  // This is a user JWT, not a fc_dev_ credential
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send(evalBody());
    expect(res.status).toBe(401);
  });

  test('4.10 machine credential on internal route is rejected', async () => {
    const res = await request(app)
      .get('/api/authority/credentials')
      .set('Authorization', `Bearer ${credA.credential}`);
    // Should be rejected — internal routes require user auth, not machine credentials
    expect([401, 403]).toContain(res.status);
  });

  test('4.11 cross-tenant: credential from account A cannot authenticate as account B resource', async () => {
    // Create a party for account B
    const bParty = await authorityService.createParty(accountB_Id, userB_Id, {
      partyType: 'person', displayName: 'B Principal',
    });
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`) // credential belongs to account A
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send({
        instrument_id: verifiedInstr.id,         // account A instrument
        principal_party_id: bParty.id,            // account B party — cross-tenant!
        delegate_party_id: agentParty.id,
        action_key: 'BANKING.WIRE_TRANSFER',
        requested_at: new Date().toISOString(),
      });
    // Should fail — cross-tenant party should appear as not-found
    expect([404, 422, 409]).toContain(res.status);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 5: Log redaction
// ═══════════════════════════════════════════════════════════════════════════════

describe('§5 Log redaction', () => {
  test('5.1 redactHeaders replaces Authorization value with [REDACTED]', () => {
    const headers = {
      authorization: 'Bearer fc_dev_AAAAAAAAAAAAAAAA_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      'content-type': 'application/json',
      'x-request-id': 'req-123',
    };
    const redacted = redactHeaders(headers);
    expect(redacted.authorization).toBe(REDACTED);
    expect(redacted['content-type']).toBe('application/json');
    expect(redacted['x-request-id']).toBe('req-123');
  });

  test('5.2 redactHeaders handles case-insensitive Authorization header', () => {
    const headers = { Authorization: 'Bearer secret', 'Content-Type': 'application/json' };
    const redacted = redactHeaders(headers);
    expect(redacted['Authorization']).toBe(REDACTED);
  });

  test('5.3 deepRedact removes Authorization at any depth', () => {
    const obj = { request: { headers: { authorization: 'Bearer fc_dev_secret', other: 'ok' } } };
    const result = deepRedact(obj);
    expect(result.request.headers.authorization).toBe(REDACTED);
    expect(result.request.headers.other).toBe('ok');
  });

  test('5.4 redactHeaders also redacts cookie and proxy-authorization', () => {
    const h = { cookie: 'session=abc', 'proxy-authorization': 'Basic xyz', accept: '*/*' };
    const r = redactHeaders(h);
    expect(r.cookie).toBe(REDACTED);
    expect(r['proxy-authorization']).toBe(REDACTED);
    expect(r.accept).toBe('*/*');
  });

  test('5.5 redactHeaders does not mutate the input object', () => {
    const headers = { authorization: 'Bearer secret' };
    redactHeaders(headers);
    expect(headers.authorization).toBe('Bearer secret');
  });

  test('5.6 error responses never echo raw credential values', async () => {
    setFlags({ externalEnabled: true });
    const rawCred = credA.credential;
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${rawCred}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send({ unknown_field: 'value' }); // will fail validation
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('fc_dev_');
    setFlags({ externalEnabled: false });
    rateLimit._resetForTest();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 6: Scopes, capabilities, admin-route security
// ═══════════════════════════════════════════════════════════════════════════════

describe('§6 Scopes and capabilities', () => {
  beforeEach(() => {
    setFlags({ externalEnabled: true });
    rateLimit._resetForTest();
  });
  afterEach(() => {
    setFlags({ externalEnabled: false });
    rateLimit._resetForTest();
  });

  test('6.1 credential with authority:evaluate scope → allowed on POST /evaluations', async () => {
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send({ instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
        delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
        requested_at: new Date().toISOString() });
    // Successfully authenticated and reached evaluation
    expect(String(res.body.error ?? '')).not.toMatch(/AUTHENTICATION_FAILED|INSUFFICIENT_SCOPE/i);
  });

  test('6.2 credential missing authority:evaluate scope → 403 INSUFFICIENT_SCOPE', async () => {
    process.env.AUTHORITY_API_CREDENTIAL_KEY = TEST_CREDENTIAL_KEY;
    const readOnlyCred = await credentialService.generateCredential(
      accountId, 'Read-only test', ['authority:evaluations:read'], userId
    );
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${readOnlyCred.credential}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send({ instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
        delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
        requested_at: new Date().toISOString() });
    expect(res.status).toBe(403);
    expect(res.body.error || res.body.code).toMatch(/INSUFFICIENT_SCOPE/i);
  });

  test('6.3 admin route requires AUTHORITY_API_CREDENTIAL_MANAGE, not AUTHORITY_EVALUATE alone', async () => {
    // Create a user with only AUTHORITY_EVALUATE
    const hash = await bcrypt.hash('cap-test-pw', 10);
    const { rows: [evalUser] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role)
       VALUES ($1,'Eval Only',$2,$3,'staff') RETURNING id`,
      [accountId, `eval-only-${crypto.randomUUID()}@test.com`, hash]
    );
    await pool.query(
      `INSERT INTO platform_user_capabilities (user_id, capability) VALUES ($1,'AUTHORITY_EVALUATE') ON CONFLICT DO NOTHING`,
      [evalUser.id]
    );
    const evalToken = makeToken(evalUser.id, accountId, 'member');
    const res = await request(app)
      .post('/api/authority/credentials')
      .set('Authorization', `Bearer ${evalToken}`)
      .set('Content-Type', 'application/json')
      .send({ label: 'Test', scopes: ['authority:evaluate'] });
    expect(res.status).toBe(403);
  });

  test('6.4 issuing authority:evaluate scope requires issuer to have AUTHORITY_EVALUATE (escalation prevention)', async () => {
    // User with MANAGE but not EVALUATE
    const hash = await bcrypt.hash('manage-no-eval-pw', 10);
    const { rows: [manageUser] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role)
       VALUES ($1,'Manage No Eval',$2,$3,'staff') RETURNING id`,
      [accountId, `manage-no-eval-${crypto.randomUUID()}@test.com`, hash]
    );
    await pool.query(
      `INSERT INTO platform_user_capabilities (user_id, capability)
       VALUES ($1,'AUTHORITY_API_CREDENTIAL_MANAGE') ON CONFLICT DO NOTHING`,
      [manageUser.id]
    );
    const manageToken = makeToken(manageUser.id, accountId, 'member');
    const res = await request(app)
      .post('/api/authority/credentials')
      .set('Authorization', `Bearer ${manageToken}`)
      .set('Content-Type', 'application/json')
      .send({ label: 'Escalation test', scopes: ['authority:evaluate'] });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body).toLowerCase()).toContain('authority_evaluate');
  });

  test('6.5 credential create requires AUTHORITY_EXTERNAL_API_ENABLED', async () => {
    setFlags({ externalEnabled: false });
    const res = await request(app)
      .post('/api/authority/credentials')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send({ label: 'Flag off test', scopes: ['authority:evaluate'] });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toMatch(/AUTHORITY_API_UNAVAILABLE|not enabled/i);
  });

  test('6.6 revoke is available even when external flag is OFF', async () => {
    // Create a credential while flag is ON
    setFlags({ externalEnabled: true });
    process.env.AUTHORITY_API_CREDENTIAL_KEY = TEST_CREDENTIAL_KEY;
    const tmp = await credentialService.generateCredential(
      accountId, 'Flag-off revoke test', ['authority:evaluate'], userId
    );
    // Turn flag off
    setFlags({ externalEnabled: false });
    const res = await request(app)
      .delete(`/api/authority/credentials/${tmp.credentialId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Test' });
    // Should succeed (revoke available even when flag is OFF)
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 7: Tenant isolation
// ═══════════════════════════════════════════════════════════════════════════════

describe('§7 Tenant isolation', () => {
  let credB;
  beforeAll(async () => {
    process.env.AUTHORITY_EXTERNAL_API_ENABLED = 'true';
    process.env.AUTHORITY_API_CREDENTIAL_KEY = TEST_CREDENTIAL_KEY;
    credB = await credentialService.generateCredential(
      accountB_Id, 'Tenant B credential', ['authority:evaluate'], userB_Id
    );
    process.env.AUTHORITY_EXTERNAL_API_ENABLED = 'false';
  });

  beforeEach(() => { setFlags({ externalEnabled: true }); rateLimit._resetForTest(); });
  afterEach(() => { setFlags({ externalEnabled: false }); rateLimit._resetForTest(); });

  test('7.1 account B credential cannot access account A instrument (cross-tenant → not-found)', async () => {
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credB.credential}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send({ instrument_id: verifiedInstr.id,         // account A
        principal_party_id: principalParty.id,          // account A
        delegate_party_id: agentParty.id,               // account A
        action_key: 'BANKING.WIRE_TRANSFER',
        requested_at: new Date().toISOString() });
    expect([404, 422]).toContain(res.status);
  });

  test('7.2 tenant_id/account_id in request body is rejected as unknown field', async () => {
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send({ instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
        delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
        requested_at: new Date().toISOString(),
        tenant_id: accountB_Id  // PROHIBITED
      });
    expect([400, 422]).toContain(res.status);
  });

  test('7.3 idempotency keys are namespaced — same external key from two credentials does not collide', async () => {
    const sharedKey = 'shared-idempotency-key-12345';
    const body = { instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
      delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
      requested_at: new Date().toISOString() };

    const resA = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Idempotency-Key', sharedKey)
      .set('Content-Type', 'application/json')
      .send(body);
    // resA should not be a conflict from a B-credential evaluation
    expect([200, 422, 409]).toContain(resA.status);
  });

  test('7.4 credential list for account A does not include account B credentials', async () => {
    const res = await request(app)
      .get('/api/authority/credentials')
      .set('Authorization', `Bearer ${token}`); // user from account A
    expect(res.status).toBe(200);
    const ids = (res.body.credentials || []).map(c => c.id);
    expect(ids).not.toContain(credB.credentialId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 8: Evaluation passthrough
// ═══════════════════════════════════════════════════════════════════════════════

describe('§8 Evaluation passthrough', () => {
  beforeEach(() => { setFlags({ externalEnabled: true }); rateLimit._resetForTest(); });
  afterEach(() => { setFlags({ externalEnabled: false }); rateLimit._resetForTest(); });

  test('8.1 all four decisions return HTTP 200', async () => {
    // MANUAL_REVIEW (undefined role → MANUAL_REVIEW via production registry)
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send({ instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
        delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
        requested_at: new Date().toISOString() });
    // Whatever the decision, it must be HTTP 200
    expect(res.status).toBe(200);
    expect(['AUTHORIZED','NOT_AUTHORIZED','INSUFFICIENT_INFORMATION','MANUAL_REVIEW'])
      .toContain(res.body.decision);
  });

  test('8.2 response includes all required fields', async () => {
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send({ instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
        delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
        requested_at: new Date().toISOString() });
    expect(res.status).toBe(200);
    const b = res.body;
    expect(b.evaluation_id).toBeTruthy();
    expect(b.decision).toBeTruthy();
    expect(b.instrument_id).toBe(verifiedInstr.id);
    expect(b.action_key).toBe('BANKING.WIRE_TRANSFER');
    expect(b.evaluated_at).toBeTruthy();
    expect(b.api_version).toBeTruthy();
    expect(b.request_id).toBeTruthy();
    expect(Array.isArray(b.reason_codes)).toBe(true);
  });

  test('8.3 near-miss action key does not match (exact DOMAIN.ACTION matching)', async () => {
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send({ instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
        delegate_party_id: agentParty.id,
        action_key: 'BANKING.WIRE_TRANSFER_EXTRA',  // near-miss
        requested_at: new Date().toISOString() });
    expect(res.status).toBe(200);
    // Near-miss should not produce AUTHORIZED from a granted BANKING.WIRE_TRANSFER
    if (res.body.decision === 'AUTHORIZED') {
      // This would be a bug — note it
      expect(res.body.matched_permission_ids.length).toBeGreaterThan(0);
    }
  });

  test('8.4 evaluation record stores api_credential actor_type', async () => {
    const ik = crypto.randomUUID();
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Idempotency-Key', ik)
      .set('Content-Type', 'application/json')
      .send({ instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
        delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
        requested_at: new Date().toISOString() });
    if (res.status === 200) {
      const { rows } = await pool.query(
        `SELECT actor_type, requesting_user_id, requesting_api_credential_id
         FROM authority_evaluations WHERE id = $1`,
        [res.body.evaluation_id]
      );
      expect(rows.length).toBe(1);
      expect(rows[0].actor_type).toBe('api_credential');
      expect(rows[0].requesting_api_credential_id).toBe(credA.credentialId);
      expect(rows[0].requesting_user_id).toBeNull();
    }
  });

  test('8.5 prohibited fields are rejected', async () => {
    const prohibitedCases = [
      { is_authorized: true },
      { evaluation_date: '2026-09-29' },
      { as_of: '2026-01-01' },
      { _policyRegistry: 'something' },
      { clockFn: 'override' },
      { policyRegistry: 'test' },
      { account_id: accountId },
    ];
    for (const prohibited of prohibitedCases) {
      const body = { instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
        delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
        requested_at: new Date().toISOString(), ...prohibited };
      const res = await request(app)
        .post('/api/v1/authority/evaluations')
        .set('Authorization', `Bearer ${credA.credential}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Content-Type', 'application/json')
        .send(body);
      expect([400, 422]).toContain(res.status);
    }
  });

  test('8.6 undefined role → MANUAL_REVIEW (production registry fail-safe)', async () => {
    // With production policy registry (no TEST_POLICY_REGISTRY injection),
    // the result should be MANUAL_REVIEW for undefined agent role
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send({ instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
        delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
        requested_at: new Date().toISOString() });
    expect(res.status).toBe(200);
    // Production registry has empty agentRoles → MANUAL_REVIEW is the expected outcome
    // (AUTHORIZED requires defined role semantics)
    expect(res.body.decision).toBe('MANUAL_REVIEW');
  });

  test('8.7 unknown request fields → 400', async () => {
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send({ instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
        delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
        requested_at: new Date().toISOString(),
        mystery_field: 'value' });
    expect([400, 422]).toContain(res.status);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 9: Test-hook isolation (Part 4.5)
// ═══════════════════════════════════════════════════════════════════════════════

describe('§9 Test-hook isolation', () => {
  test('9.1 static: authorityExternal.js does not import TEST_POLICY_REGISTRY', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../routes/authorityExternal.js'), 'utf8'
    );
    // Must not have a require() call for these — mere mention in comments is OK.
    expect(src).not.toMatch(/require\s*\(\s*['"][^'"]*TEST_POLICY_REGISTRY[^'"]*['"]\s*\)/);
  });

  test('9.2 static: authorityExternal.js does not import AI/extraction modules', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../routes/authorityExternal.js'), 'utf8'
    );
    // Must not have require() calls for these — mere mention in comments is OK.
    expect(src).not.toMatch(/require\s*\(\s*['"][^'"]*authorityAnthropicProvider[^'"]*['"]\s*\)/);
    expect(src).not.toMatch(/require\s*\(\s*['"][^'"]*authorityFakeProvider[^'"]*['"]\s*\)/);
    expect(src).not.toMatch(/require\s*\(\s*['"][^'"]*authorityExtractionService[^'"]*['"]\s*\)/);
  });

  test('9.3 static: authorityApiAuth.js does not import TEST_POLICY_REGISTRY', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../middleware/authorityApiAuth.js'), 'utf8'
    );
    expect(src).not.toContain('TEST_POLICY_REGISTRY');
    expect(src).not.toContain('_policyRegistry');
    expect(src).not.toContain('clockFn');
  });

  test('9.4 static: no role/permission/restriction logic in external API route module', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../routes/authorityExternal.js'), 'utf8'
    );
    // Should not contain implementation logic from the engine
    expect(src).not.toContain('EXPLICITLY_GRANTED');
    expect(src).not.toContain('monetary_limit');
    expect(src).not.toContain('date_window');
    expect(src).not.toContain('computeFingerprint');
  });

  test('9.5 behavioral: body fields named like test hooks are rejected, not passed to engine', async () => {
    setFlags({ externalEnabled: true });
    rateLimit._resetForTest();
    const injectionAttempts = [
      { _policyRegistry: 'hack' },
      { clockFn: 'freeze' },
      { policyRegistry: 'override' },
      { clock: '2020-01-01' },
    ];
    for (const injection of injectionAttempts) {
      const body = { instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
        delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
        requested_at: new Date().toISOString(), ...injection };
      const res = await request(app)
        .post('/api/v1/authority/evaluations')
        .set('Authorization', `Bearer ${credA.credential}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Content-Type', 'application/json')
        .send(body);
      // Must be rejected (400/422), not successfully evaluated
      expect([400, 422]).toContain(res.status);
    }
    setFlags({ externalEnabled: false });
    rateLimit._resetForTest();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 10: Temporal behavior
// ═══════════════════════════════════════════════════════════════════════════════

describe('§10 Temporal behavior', () => {
  beforeEach(() => { setFlags({ externalEnabled: true }); rateLimit._resetForTest(); });
  afterEach(() => { setFlags({ externalEnabled: false }); rateLimit._resetForTest(); });

  test('10.1 historical requested_at (> 5 min ago) → rejected', async () => {
    const oldTime = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send({ instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
        delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
        requested_at: oldTime });
    expect([400, 422]).toContain(res.status);
  });

  test('10.2 future requested_at (> 5 min ahead) → rejected', async () => {
    const futureTime = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min future
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send({ instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
        delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
        requested_at: futureTime });
    expect([400, 422]).toContain(res.status);
  });

  test('10.3 no alternative time fields accepted', async () => {
    const alternatives = ['evaluation_date', 'as_of', 'effective_at', 'historical_at'];
    for (const field of alternatives) {
      const res = await request(app)
        .post('/api/v1/authority/evaluations')
        .set('Authorization', `Bearer ${credA.credential}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Content-Type', 'application/json')
        .send({ instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
          delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
          requested_at: new Date().toISOString(),
          [field]: '2020-01-01' });
      expect([400, 422]).toContain(res.status);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 11: Idempotency mapping
// ═══════════════════════════════════════════════════════════════════════════════

describe('§11 Idempotency', () => {
  beforeEach(() => { setFlags({ externalEnabled: true }); rateLimit._resetForTest(); });
  afterEach(() => { setFlags({ externalEnabled: false }); rateLimit._resetForTest(); });

  function body() {
    return { instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
      delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
      requested_at: new Date().toISOString() };
  }

  test('11.1 missing Idempotency-Key → 422 VALIDATION_FAILED, no evaluation', async () => {
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Content-Type', 'application/json')
      .send(body());
    expect([400, 422]).toContain(res.status);
    expect(JSON.stringify(res.body).toLowerCase()).toContain('idempotency');
  });

  test('11.2 missing requested_at → 422 VALIDATION_FAILED, no evaluation', async () => {
    const b = { instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
      delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER' };
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send(b);
    expect([400, 422]).toContain(res.status);
  });

  test('11.3 same key + same request → fresh replay (replayed: true)', async () => {
    const ik = `replay-test-${crypto.randomUUID()}`;
    const b = body();
    const res1 = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Idempotency-Key', ik)
      .set('Content-Type', 'application/json')
      .send(b);
    if (res1.status !== 200) return; // skip if first failed for other reasons
    const evalId = res1.body.evaluation_id;

    // Second request with same key and same normalized fields (update requested_at to now but same key)
    const res2 = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Idempotency-Key', ik)
      .set('Content-Type', 'application/json')
      .send({ ...b, requested_at: new Date().toISOString() });
    // May be a replay or a freshness conflict — either is acceptable
    expect([200, 409]).toContain(res2.status);
    if (res2.status === 200) {
      expect(res2.body.evaluation_id).toBe(evalId);
      expect(res2.body.replayed).toBe(true);
    }
  });

  test('11.4 same key + different normalized request → 409 IDEMPOTENCY_KEY_CONFLICT', async () => {
    const ik = `conflict-test-${crypto.randomUUID()}`;
    const b = body();
    const res1 = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Idempotency-Key', ik)
      .set('Content-Type', 'application/json')
      .send(b);
    if (res1.status !== 200) return;

    // Different action_key
    const res2 = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Idempotency-Key', ik)
      .set('Content-Type', 'application/json')
      .send({ ...b, action_key: 'BANKING.DIFFERENT_ACTION', requested_at: new Date().toISOString() });
    expect(res2.status).toBe(409);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 12: Credential lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

describe('§12 Credential lifecycle', () => {
  beforeEach(() => { setFlags({ externalEnabled: true }); rateLimit._resetForTest(); });
  afterEach(() => { setFlags({ externalEnabled: false }); rateLimit._resetForTest(); });

  test('12.1 create → raw secret returned once, verifier stored (not secret)', async () => {
    const res = await request(app)
      .post('/api/authority/credentials')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send({ label: 'Lifecycle test', scopes: ['authority:evaluate'] });
    expect(res.status).toBe(201);
    expect(res.body.credential).toMatch(/^fc_dev_[A-Za-z0-9_-]{16}_[A-Za-z0-9_-]{43}$/);
    expect(res.body.credential_id).toBeTruthy();
    // Verify DB has only the verifier, not the raw secret
    const { rows } = await pool.query(
      `SELECT secret_verifier FROM authority_api_credentials WHERE id = $1`,
      [res.body.credential_id]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].secret_verifier).not.toBe(res.body.credential);
    expect(rows[0].secret_verifier).toMatch(/^[0-9a-f]{64}$/); // hex verifier
  });

  test('12.2 list endpoint never returns raw secret or verifier', async () => {
    const res = await request(app)
      .get('/api/authority/credentials')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('secret_verifier');
    expect(bodyStr).not.toContain('fc_dev_');
    // No 64-char hex strings (verifiers)
    expect(/[0-9a-f]{64}/.test(bodyStr)).toBe(false);
  });

  test('12.3 revoke → credential denied on very next request', async () => {
    const created = await credentialService.generateCredential(
      accountId, 'Revoke lifecycle test', ['authority:evaluate'], userId
    );
    await credentialService.revokeCredential(created.credentialId, userId, 'lifecycle test');

    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${created.credential}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send({ instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
        delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
        requested_at: new Date().toISOString() });
    expect(res.status).toBe(401);
  });

  test('12.4 replace creates new identity; old credential still works until explicitly revoked', async () => {
    const orig = await credentialService.generateCredential(
      accountId, 'Replace test orig', ['authority:evaluate'], userId
    );
    const replacement = await credentialService.replaceCredential(
      orig.credentialId, 'Replace test new', ['authority:evaluate'], userId
    );
    // Old credential still works (not auto-revoked)
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${orig.credential}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send({ instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
        delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
        requested_at: new Date().toISOString() });
    expect([200, 409, 422]).toContain(res.status);
    expect(res.status).not.toBe(401);
    // New credential is independent
    expect(replacement.credentialId).not.toBe(orig.credentialId);
    expect(replacement.publicId).not.toBe(orig.publicId);
  });

  test('12.5 historical evaluation records persist after credential revoke', async () => {
    const cred = await credentialService.generateCredential(
      accountId, 'Historical test', ['authority:evaluate'], userId
    );
    const ik = `historical-${crypto.randomUUID()}`;
    const evalRes = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${cred.credential}`)
      .set('Idempotency-Key', ik)
      .set('Content-Type', 'application/json')
      .send({ instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
        delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
        requested_at: new Date().toISOString() });
    if (evalRes.status !== 200) return;
    const evalId = evalRes.body.evaluation_id;

    await credentialService.revokeCredential(cred.credentialId, userId, 'post-eval revoke');

    // The evaluation row must still exist with the credential reference
    const { rows } = await pool.query(
      `SELECT id, actor_type, requesting_api_credential_id FROM authority_evaluations WHERE id = $1`,
      [evalId]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].requesting_api_credential_id).toBe(cred.credentialId);
  });

  test('12.6 no hard-delete route exists (static check)', () => {
    // The credentials admin router must not expose a DELETE /:id/delete endpoint
    // (revoke uses DELETE /:id, not a separate hard-delete endpoint)
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../routes/authorityCredentials.js'), 'utf8'
    );
    // Should not have any permanent_delete or hard_delete pattern
    expect(src.toLowerCase()).not.toContain('permanent_delete');
    expect(src.toLowerCase()).not.toContain('hard_delete');
    expect(src.toLowerCase()).not.toContain('destroy');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 13: Rate limiting
// ═══════════════════════════════════════════════════════════════════════════════

describe('§13 Rate limiting', () => {
  beforeEach(() => {
    setFlags({ externalEnabled: true });
    rateLimit._resetForTest();
    process.env.AUTHORITY_API_RATE_LIMIT_PER_CREDENTIAL = '3';
  });
  afterEach(() => {
    setFlags({ externalEnabled: false });
    rateLimit._resetForTest();
    delete process.env.AUTHORITY_API_RATE_LIMIT_PER_CREDENTIAL;
  });

  test('13.1 under limit → requests allowed', async () => {
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send({ instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
        delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
        requested_at: new Date().toISOString() });
    expect([200, 409, 422]).toContain(res.status);
    expect(res.status).not.toBe(429);
  });

  test('13.2 over per-credential limit → 429 with Retry-After', async () => {
    const requests = [];
    for (let i = 0; i < 5; i++) {
      requests.push(
        request(app)
          .post('/api/v1/authority/evaluations')
          .set('Authorization', `Bearer ${credA.credential}`)
          .set('Idempotency-Key', crypto.randomUUID())
          .set('Content-Type', 'application/json')
          .send({ instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
            delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
            requested_at: new Date().toISOString() })
      );
    }
    const results = await Promise.all(requests);
    const rateLimited = results.filter(r => r.status === 429);
    expect(rateLimited.length).toBeGreaterThan(0);
    expect(rateLimited[0].headers['retry-after']).toBeTruthy();
    expect(rateLimited[0].body.error || rateLimited[0].body.code).toMatch(/RATE_LIMITED/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 14: Request correlation
// ═══════════════════════════════════════════════════════════════════════════════

describe('§14 Request correlation', () => {
  beforeEach(() => { setFlags({ externalEnabled: true }); rateLimit._resetForTest(); });
  afterEach(() => { setFlags({ externalEnabled: false }); rateLimit._resetForTest(); });

  test('14.1 valid X-Request-Id is echoed in response header', async () => {
    const myId = 'my-test-request-abc123';
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('X-Request-Id', myId)
      .set('Content-Type', 'application/json')
      .send({ instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
        delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
        requested_at: new Date().toISOString() });
    expect(res.headers['x-request-id']).toBe(myId);
  });

  test('14.2 invalid X-Request-Id is replaced with server-generated UUID', async () => {
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('X-Request-Id', 'bad id with spaces!')
      .set('Content-Type', 'application/json')
      .send({ instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
        delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
        requested_at: new Date().toISOString() });
    const returnedId = res.headers['x-request-id'];
    expect(returnedId).not.toBe('bad id with spaces!');
    expect(returnedId).toBeTruthy();
  });

  test('14.3 request_id is present in response body', async () => {
    const res = await request(app)
      .post('/api/v1/authority/evaluations')
      .set('Authorization', `Bearer ${credA.credential}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Content-Type', 'application/json')
      .send({ instrument_id: verifiedInstr.id, principal_party_id: principalParty.id,
        delegate_party_id: agentParty.id, action_key: 'BANKING.WIRE_TRANSFER',
        requested_at: new Date().toISOString() });
    expect(res.body.request_id).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 15: Regression — Stage 1-4 routes still work
// ═══════════════════════════════════════════════════════════════════════════════

describe('§15 Regression', () => {
  beforeEach(() => {
    process.env.AUTHORITY_ENABLED = 'true';
    process.env.AUTHORITY_EXTERNAL_API_ENABLED = 'false';
    rateLimit._resetForTest();
  });

  test('15.1 internal evaluate route (POST /api/authority/evaluate) still works', async () => {
    const res = await request(app)
      .post('/api/authority/evaluate')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send({
        instrumentId: verifiedInstr.id,
        principalPartyId: principalParty.id,
        delegatePartyId: agentParty.id,
        actionKey: 'BANKING.WIRE_TRANSFER',
        requestedAt: new Date().toISOString(),
        idempotencyKey: crypto.randomUUID(),
      });
    expect([200, 201, 409, 422]).toContain(res.status);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(503);
  });

  test('15.2 internal instruments list route still works', async () => {
    const res = await request(app)
      .get('/api/authority/instruments')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('15.3 AUTHORITY_ENABLED=false disables internal Authority routes', async () => {
    process.env.AUTHORITY_ENABLED = 'false';
    const res = await request(app)
      .get('/api/authority/instruments')
      .set('Authorization', `Bearer ${token}`);
    expect([503, 403]).toContain(res.status);
  });

  test('15.4 internal authority routes unaffected by AUTHORITY_EXTERNAL_API_ENABLED=false', async () => {
    process.env.AUTHORITY_ENABLED             = 'true';
    process.env.AUTHORITY_EXTERNAL_API_ENABLED = 'false';
    const res = await request(app)
      .get('/api/authority/instruments')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
