'use strict';

/**
 * Authority Engine — Stage 4 Tests
 *
 * Covers:
 *   Section 1:  DB migration — authority_evaluations table and indexes
 *   Section 2:  Reason codes registry
 *   Section 3:  Policy registry
 *   Section 4:  Restriction evaluators (monetary_limit, date_window, unknown)
 *   Section 5:  Canonical fingerprint helper
 *   Section 6:  Pure engine core — all evaluation paths (no I/O)
 *   Section 7:  Static safety constraints (no DB/AI imports in core)
 *   Section 8:  Service — happy path AUTHORIZED
 *   Section 9:  Service — instrument status checks (NOT_AUTHORIZED)
 *   Section 10: Service — requesting party checks
 *   Section 11: Service — temporal bounds checks
 *   Section 12: Service — permission / prohibition checks
 *   Section 13: Service — restriction evaluation
 *   Section 14: Service — MANUAL_REVIEW paths
 *   Section 15: Service — INSUFFICIENT_INFORMATION paths
 *   Section 16: Idempotency — valid replay returns original result
 *   Section 17: Idempotency — stale replay returns MANUAL_REVIEW
 *   Section 18: Idempotency — unique key constraint
 *   Section 19: Concurrency — FOR SHARE prevents evaluate/transition races (structural)
 *   Section 20: Audit — evaluation.completed written inside transaction
 *   Section 21: Fingerprint excludes status; snapshot captures it
 *   Section 22: HTTP routes — POST /evaluate, GET /evaluations, GET /evaluations/:id
 *   Section 23: Tenant isolation — cross-account evaluation rejected
 *   Section 24: Input validation — missing required fields
 *   Section 25: Evaluation persists policy_version
 */

require('dotenv').config();

const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const request = require('supertest');
const app     = require('../app');
const pool    = require('../db/pool');
const { runMigrations } = require('../db/migrate');

const { OUTCOMES, REASON_CODES, isValidReasonCode, outcomeFor } = require('../services/authorityReasonCodes');
const policyRegistry      = require('../services/authorityPolicyRegistry');
const { evaluateRestriction, hasHandler } = require('../services/authorityRestrictionEvaluators');
const { computeFingerprint, captureEvaluationState } = require('../services/authorityFingerprint');
const { evaluate }        = require('../services/authorityEngineCore');
const evaluationService   = require('../services/authorityEvaluationService');
const authorityService    = require('../services/authorityService');
const audit               = require('../services/audit');

const TEST_AUTHORITY_KEY = crypto.randomBytes(32).toString('hex');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToken(userId, accountId, role = 'owner') {
  return jwt.sign({ userId, accountId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function ik() {
  return crypto.randomUUID();
}

// ── Test state ────────────────────────────────────────────────────────────────

let accountId, userId, token;
let accountB_Id, userB_Id;

// Canonical test fixture (principal party, agent party, instrument, participant)
let principalParty, agentParty, verifiedInstr, agentParticipant;
let grantedPerm, monetaryRestriction;

const CLEANUP = [];

beforeAll(async () => {
  process.env.AUTHORITY_ENABLED             = 'true';
  process.env.AUTHORITY_DATA_ENCRYPTION_KEY = TEST_AUTHORITY_KEY;

  await runMigrations();

  const hash = await bcrypt.hash('engine-test-pw', 10);

  // Institution account A
  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan, account_type) VALUES ($1,'institution','institution') RETURNING id`,
    ['__TEST_ENGINE_A__']
  );
  accountId = acct.id;
  CLEANUP.push({ table: 'accounts', id: accountId });

  const { rows: [u] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Engine Tester A',$2,$3,'owner') RETURNING id`,
    [accountId, `eng-a-${Date.now()}@fieldcore.test`, hash]
  );
  userId = u.id;
  token  = makeToken(userId, accountId, 'owner');

  // Institution account B (for isolation tests)
  const { rows: [acctB] } = await pool.query(
    `INSERT INTO accounts (name, plan, account_type) VALUES ($1,'institution','institution') RETURNING id`,
    ['__TEST_ENGINE_B__']
  );
  accountB_Id = acctB.id;
  CLEANUP.push({ table: 'accounts', id: accountB_Id });

  const { rows: [uB] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Engine Tester B',$2,$3,'owner') RETURNING id`,
    [accountB_Id, `eng-b-${Date.now()}@fieldcore.test`, hash]
  );
  userB_Id = uB.id;

  // Create principal and agent parties
  principalParty = await authorityService.createParty(accountId, userId, {
    partyType: 'person', displayName: 'Test Principal',
  });
  agentParty = await authorityService.createParty(accountId, userId, {
    partyType: 'person', displayName: 'Test Agent',
  });

  // Create instrument
  verifiedInstr = await authorityService.createInstrument(accountId, userId, {
    instrumentType: 'power_of_attorney',
    effectiveDate:  '2025-01-01',
    expirationDate: '2035-12-31',
    jurisdiction:   'Delaware, USA',
  });

  // Add participants
  await authorityService.addParticipant(accountId, userId, verifiedInstr.id,
    { partyId: principalParty.id, role: 'principal', sequence: 1 });
  agentParticipant = await authorityService.addParticipant(accountId, userId, verifiedInstr.id,
    { partyId: agentParty.id, role: 'agent', sequence: 2 });

  // Add permission
  grantedPerm = await authorityService.addPermission(accountId, userId, verifiedInstr.id, {
    actionKey: 'BANKING.WIRE_TRANSFER',
    grantType: 'granted',
  });

  // Add monetary restriction (limit 10000 cents = $100)
  monetaryRestriction = await authorityService.addRestriction(accountId, userId, verifiedInstr.id, {
    restrictionType: 'monetary_limit',
    parameters: { amount: 10000, currency: 'USD' },
    permissionId: grantedPerm.id,
  });

  // Grant capabilities and transition instrument to VERIFIED
  await pool.query(
    `INSERT INTO platform_user_capabilities (user_id, capability)
     VALUES ($1,'AUTHORITY_INSTRUMENT_VERIFY'),($1,'AUTHORITY_INSTRUMENT_REJECT')
     ON CONFLICT DO NOTHING`,
    [userId]
  );
  await authorityService.transitionInstrument(accountId, userId, verifiedInstr.id, 'PENDING_REVIEW');
  await authorityService.transitionInstrument(accountId, userId, verifiedInstr.id, 'VERIFIED');

  // Re-fetch with verified status
  verifiedInstr = await authorityService.getInstrument(accountId, verifiedInstr.id);
}, 60000);

afterAll(async () => {
  for (const { table, id } of [...CLEANUP].reverse()) {
    try { await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]); } catch {}
  }
  await pool.end();
}, 30000);

// ═══════════════════════════════════════════════════════════════════════════════
// Section 1: DB Migration — authority_evaluations table exists
// ═══════════════════════════════════════════════════════════════════════════════

describe('DB Migration — authority_evaluations', () => {
  test('1.1 authority_evaluations table exists', async () => {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'authority_evaluations'`
    );
    expect(rows.length).toBe(1);
  });

  test('1.2 required columns present', async () => {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'authority_evaluations'`
    );
    const cols = rows.map(r => r.column_name);
    for (const col of [
      'id','account_id','instrument_id','idempotency_key',
      'outcome','reason_code','reason_detail','policy_version',
      'canonical_rules_fingerprint','evaluation_state_snapshot',
      'runtime_context','evaluated_at','action_time',
      'requested_action_key','requesting_party_id','created_at',
    ]) {
      expect(cols).toContain(col);
    }
  });

  test('1.3 unique index on (account_id, idempotency_key)', async () => {
    const { rows } = await pool.query(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE tablename = 'authority_evaluations' AND indexname = 'idx_ae_idempotency'`
    );
    expect(rows.length).toBe(1);
    expect(rows[0].indexdef).toMatch(/UNIQUE/);
  });

  test('1.4 index on (account_id, instrument_id, evaluated_at DESC)', async () => {
    const { rows } = await pool.query(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'authority_evaluations' AND indexname = 'idx_ae_instrument'`
    );
    expect(rows.length).toBe(1);
  });

  test('1.5 index on (account_id, outcome, evaluated_at DESC)', async () => {
    const { rows } = await pool.query(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'authority_evaluations' AND indexname = 'idx_ae_outcome'`
    );
    expect(rows.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 2: Reason codes registry
// ═══════════════════════════════════════════════════════════════════════════════

describe('Reason codes registry', () => {
  test('2.1 OUTCOMES has four values', () => {
    expect(Object.keys(OUTCOMES)).toHaveLength(4);
    expect(OUTCOMES.AUTHORIZED).toBe('AUTHORIZED');
    expect(OUTCOMES.NOT_AUTHORIZED).toBe('NOT_AUTHORIZED');
    expect(OUTCOMES.INSUFFICIENT_INFO).toBe('INSUFFICIENT_INFORMATION');
    expect(OUTCOMES.MANUAL_REVIEW).toBe('MANUAL_REVIEW');
  });

  test('2.2 every REASON_CODE has an outcome and a label', () => {
    for (const [code, meta] of Object.entries(REASON_CODES)) {
      expect(typeof meta.outcome).toBe('string');
      expect(typeof meta.label).toBe('string');
      expect(Object.values(OUTCOMES)).toContain(meta.outcome);
    }
  });

  test('2.3 isValidReasonCode returns true for known codes', () => {
    expect(isValidReasonCode('EXPLICITLY_GRANTED')).toBe(true);
    expect(isValidReasonCode('INSTRUMENT_NOT_VERIFIED')).toBe(true);
    expect(isValidReasonCode('MONETARY_LIMIT_EXCEEDED')).toBe(true);
  });

  test('2.4 isValidReasonCode returns false for unknown code', () => {
    expect(isValidReasonCode('NOT_A_REAL_CODE')).toBe(false);
  });

  test('2.5 outcomeFor returns correct outcome', () => {
    expect(outcomeFor('EXPLICITLY_GRANTED')).toBe(OUTCOMES.AUTHORIZED);
    expect(outcomeFor('INSTRUMENT_NOT_VERIFIED')).toBe(OUTCOMES.NOT_AUTHORIZED);
    expect(outcomeFor('ACTION_NOT_IN_INSTRUMENT')).toBe(OUTCOMES.INSUFFICIENT_INFO);
    expect(outcomeFor('UNKNOWN_INSTRUMENT_TYPE')).toBe(OUTCOMES.MANUAL_REVIEW);
  });

  test('2.6 outcomeFor throws on unknown code', () => {
    expect(() => outcomeFor('GARBAGE')).toThrow();
  });

  test('2.7 IDEMPOTENCY_REPLAY_STALE maps to MANUAL_REVIEW', () => {
    expect(outcomeFor('IDEMPOTENCY_REPLAY_STALE')).toBe(OUTCOMES.MANUAL_REVIEW);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 3: Policy registry
// ═══════════════════════════════════════════════════════════════════════════════

describe('Policy registry', () => {
  test('3.1 power_of_attorney has agent role "agent"', () => {
    const p = policyRegistry.getPolicyForType('power_of_attorney');
    expect(p).not.toBeNull();
    expect(p.agentRoles.has('agent')).toBe(true);
    expect(p.principalRoles.has('principal')).toBe(true);
  });

  test('3.2 durable_power_of_attorney includes co_agent and successor_agent', () => {
    const p = policyRegistry.getPolicyForType('durable_power_of_attorney');
    expect(p.agentRoles.has('co_agent')).toBe(true);
    expect(p.agentRoles.has('successor_agent')).toBe(true);
  });

  test('3.3 guardianship_order has guardian as agent', () => {
    const p = policyRegistry.getPolicyForType('guardianship_order');
    expect(p.agentRoles.has('guardian')).toBe(true);
  });

  test('3.4 trust has trustee and co_trustee as agents', () => {
    const p = policyRegistry.getPolicyForType('trust');
    expect(p.agentRoles.has('trustee')).toBe(true);
    expect(p.agentRoles.has('co_trustee')).toBe(true);
  });

  test('3.5 healthcare_proxy returns null (MANUAL_REVIEW path)', () => {
    const p = policyRegistry.getPolicyForType('healthcare_proxy');
    expect(p).toBeNull();
  });

  test('3.6 court_order returns null (MANUAL_REVIEW path)', () => {
    const p = policyRegistry.getPolicyForType('court_order');
    expect(p).toBeNull();
  });

  test('3.7 unknown type returns null', () => {
    const p = policyRegistry.getPolicyForType('UNKNOWN_RANDOM_TYPE');
    expect(p).toBeNull();
  });

  test('3.8 BANKING domain is supported', () => {
    expect(policyRegistry.isActionDomainSupported('BANKING.WIRE_TRANSFER')).toBe(true);
  });

  test('3.9 CUSTOM_DOMAIN is supported', () => {
    expect(policyRegistry.isActionDomainSupported('CUSTOM_DOMAIN.NEW_ACTION')).toBe(true);
  });

  test('3.10 unknown domain returns false', () => {
    expect(policyRegistry.isActionDomainSupported('WEIRD_DOMAIN.ACTION')).toBe(false);
  });

  test('3.11 action key with no dot returns false', () => {
    expect(policyRegistry.isActionDomainSupported('BANKING')).toBe(false);
    expect(policyRegistry.isActionDomainSupported('')).toBe(false);
    expect(policyRegistry.isActionDomainSupported(null)).toBe(false);
  });

  test('3.12 POLICY_VERSION is a non-empty string', () => {
    expect(typeof policyRegistry.POLICY_VERSION).toBe('string');
    expect(policyRegistry.POLICY_VERSION.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 4: Restriction evaluators
// ═══════════════════════════════════════════════════════════════════════════════

describe('Restriction evaluators', () => {
  const ctx = { evaluated_at: '2026-06-15T10:00:00Z', action_time: '2026-06-15T10:00:00Z' };

  // monetary_limit
  test('4.1 monetary_limit passes when amount < limit', () => {
    const r = evaluateRestriction(
      { restriction_type: 'monetary_limit', parameters: { amount: 10000, currency: 'USD' } },
      { amount: 5000 }, ctx
    );
    expect(r).toEqual({ pass: true });
  });

  test('4.2 monetary_limit passes when amount == limit', () => {
    const r = evaluateRestriction(
      { restriction_type: 'monetary_limit', parameters: { amount: 10000, currency: 'USD' } },
      { amount: 10000 }, ctx
    );
    expect(r).toEqual({ pass: true });
  });

  test('4.3 monetary_limit fails when amount > limit', () => {
    const r = evaluateRestriction(
      { restriction_type: 'monetary_limit', parameters: { amount: 10000, currency: 'USD' } },
      { amount: 15000 }, ctx
    );
    expect(r.pass).toBe(false);
    expect(r.reasonCode).toBe('MONETARY_LIMIT_EXCEEDED');
  });

  test('4.4 monetary_limit returns MISSING_REQUEST_AMOUNT when amount not provided', () => {
    const r = evaluateRestriction(
      { restriction_type: 'monetary_limit', parameters: { amount: 10000, currency: 'USD' } },
      {}, ctx
    );
    expect(r.pass).toBe(false);
    expect(r.reasonCode).toBe('MISSING_REQUEST_AMOUNT');
  });

  test('4.5 monetary_limit returns unknown for malformed parameters', () => {
    const r = evaluateRestriction(
      { restriction_type: 'monetary_limit', parameters: { amount: 'not-a-number' } },
      { amount: 100 }, ctx
    );
    expect(r.unknown).toBe(true);
  });

  // date_window
  test('4.6 date_window passes when action_time within window', () => {
    const r = evaluateRestriction(
      { restriction_type: 'date_window', effective_from: '2026-01-01', effective_to: '2026-12-31' },
      {}, ctx
    );
    expect(r).toEqual({ pass: true });
  });

  test('4.7 date_window fails when action_time before effective_from', () => {
    const r = evaluateRestriction(
      { restriction_type: 'date_window', effective_from: '2027-01-01', effective_to: '2027-12-31' },
      {}, ctx
    );
    expect(r.pass).toBe(false);
    expect(r.reasonCode).toBe('DATE_WINDOW_RESTRICTION');
  });

  test('4.8 date_window fails when action_time after effective_to', () => {
    const r = evaluateRestriction(
      { restriction_type: 'date_window', effective_from: '2025-01-01', effective_to: '2025-12-31' },
      {}, ctx
    );
    expect(r.pass).toBe(false);
    expect(r.reasonCode).toBe('DATE_WINDOW_RESTRICTION');
  });

  test('4.9 date_window returns MISSING_ACTION_TIME when action_time null', () => {
    const r = evaluateRestriction(
      { restriction_type: 'date_window', effective_from: '2026-01-01', effective_to: '2026-12-31' },
      {}, { evaluated_at: '2026-06-15T10:00:00Z', action_time: null }
    );
    expect(r.pass).toBe(false);
    expect(r.reasonCode).toBe('MISSING_ACTION_TIME');
  });

  test('4.10 date_window passes with no bounds (unbounded)', () => {
    const r = evaluateRestriction(
      { restriction_type: 'date_window', effective_from: null, effective_to: null },
      {}, ctx
    );
    expect(r).toEqual({ pass: true });
  });

  // Unknown type
  test('4.11 unknown restriction type returns { unknown: true }', () => {
    const r = evaluateRestriction(
      { restriction_type: 'totally_unknown_restriction' },
      {}, ctx
    );
    expect(r.unknown).toBe(true);
  });

  test('4.12 hasHandler returns true for known types', () => {
    expect(hasHandler('monetary_limit')).toBe(true);
    expect(hasHandler('date_window')).toBe(true);
  });

  test('4.13 hasHandler returns false for unknown type', () => {
    expect(hasHandler('approval_required')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 5: Canonical fingerprint helper
// ═══════════════════════════════════════════════════════════════════════════════

describe('Canonical fingerprint', () => {
  const instr = {
    instrument_type: 'power_of_attorney',
    effective_date:  '2025-01-01',
    expiration_date: '2035-12-31',
    jurisdiction:    'Delaware, USA',
    status:          'VERIFIED',
    verified_at:     '2026-01-01T00:00:00Z',
    revoked_at:      null,
    expired_at:      null,
    rejected_at:     null,
    superseded_by_instrument_id: null,
  };
  const parts = [{ id: 'p1', role: 'agent', status: 'active' }];
  const perms = [{ id: 'q1', action_key: 'BANKING.WIRE_TRANSFER', grant_type: 'granted' }];
  const restr = [{ id: 'r1', restriction_type: 'monetary_limit', parameters: { amount: 10000 }, effective_from: null, effective_to: null }];

  test('5.1 produces a 64-char hex string', () => {
    const fp = computeFingerprint(instr, parts, perms, restr);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  test('5.2 same inputs produce same fingerprint (deterministic)', () => {
    const fp1 = computeFingerprint(instr, parts, perms, restr);
    const fp2 = computeFingerprint(instr, parts, perms, restr);
    expect(fp1).toBe(fp2);
  });

  test('5.3 different instrument_type changes fingerprint', () => {
    const fp1 = computeFingerprint(instr, parts, perms, restr);
    const fp2 = computeFingerprint({ ...instr, instrument_type: 'trust' }, parts, perms, restr);
    expect(fp1).not.toBe(fp2);
  });

  test('5.4 adding a permission changes fingerprint', () => {
    const fp1 = computeFingerprint(instr, parts, perms, restr);
    const fp2 = computeFingerprint(instr, parts,
      [...perms, { id: 'q2', action_key: 'BANKING.TRANSFER', grant_type: 'granted' }],
      restr
    );
    expect(fp1).not.toBe(fp2);
  });

  test('5.5 fingerprint is invariant to participant sort order', () => {
    const parts2 = [
      { id: 'p2', role: 'principal', status: 'active' },
      { id: 'p1', role: 'agent',     status: 'active' },
    ];
    const parts2rev = [
      { id: 'p1', role: 'agent',     status: 'active' },
      { id: 'p2', role: 'principal', status: 'active' },
    ];
    expect(computeFingerprint(instr, parts2, perms, restr))
      .toBe(computeFingerprint(instr, parts2rev, perms, restr));
  });

  test('5.6 status change does NOT change fingerprint', () => {
    const fp1 = computeFingerprint(instr, parts, perms, restr);
    const fp2 = computeFingerprint({ ...instr, status: 'REVOKED' }, parts, perms, restr);
    expect(fp1).toBe(fp2);
  });

  test('5.7 captureEvaluationState includes status and verified_at', () => {
    const snap = captureEvaluationState(instr);
    expect(snap.status).toBe('VERIFIED');
    expect(snap.verified_at).toBe('2026-01-01T00:00:00Z');
  });

  test('5.8 captureEvaluationState does NOT include instrument_type', () => {
    const snap = captureEvaluationState(instr);
    expect(snap.instrument_type).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 6: Pure engine core
// ═══════════════════════════════════════════════════════════════════════════════

describe('Pure engine core', () => {
  // Standard verified instrument for most tests
  const BASE_INSTR = {
    instrument_type: 'power_of_attorney',
    status: 'VERIFIED',
    effective_date:  '2025-01-01',
    expiration_date: '2035-12-31',
  };
  const AGENT_ID = 'agent-party-uuid-001';
  const PARTS    = [{ party_id: AGENT_ID, role: 'agent', status: 'active' }];
  const PERMS    = [{ id: 'perm-1', action_key: 'BANKING.WIRE_TRANSFER', grant_type: 'granted' }];
  const RESTR    = [];
  const CTX      = { evaluated_at: '2026-06-15T10:00:00Z', action_time: '2026-06-15T10:00:00Z' };
  const REQ      = { requestingPartyId: AGENT_ID, actionKey: 'BANKING.WIRE_TRANSFER', amount: null };

  const restrictionEvals = require('../services/authorityRestrictionEvaluators');

  function run(overrides = {}) {
    const inputs  = { instrument: BASE_INSTR, participants: PARTS, permissions: PERMS, restrictions: RESTR, ...overrides.inputs };
    const req     = { ...REQ, ...overrides.req };
    const ctx     = { ...CTX, ...overrides.ctx };
    return evaluate(inputs, req, ctx, policyRegistry, restrictionEvals);
  }

  test('6.1 AUTHORIZED — all conditions met', () => {
    const result = run();
    expect(result.outcome).toBe(OUTCOMES.AUTHORIZED);
    expect(result.reasonCode).toBe('EXPLICITLY_GRANTED');
  });

  test('6.2 NOT_AUTHORIZED — REVOKED status', () => {
    const r = run({ inputs: { instrument: { ...BASE_INSTR, status: 'REVOKED' } } });
    expect(r.outcome).toBe(OUTCOMES.NOT_AUTHORIZED);
    expect(r.reasonCode).toBe('INSTRUMENT_REVOKED');
  });

  test('6.3 NOT_AUTHORIZED — EXPIRED status', () => {
    const r = run({ inputs: { instrument: { ...BASE_INSTR, status: 'EXPIRED' } } });
    expect(r.outcome).toBe(OUTCOMES.NOT_AUTHORIZED);
    expect(r.reasonCode).toBe('INSTRUMENT_EXPIRED_STATUS');
  });

  test('6.4 NOT_AUTHORIZED — SUPERSEDED status', () => {
    const r = run({ inputs: { instrument: { ...BASE_INSTR, status: 'SUPERSEDED' } } });
    expect(r.outcome).toBe(OUTCOMES.NOT_AUTHORIZED);
    expect(r.reasonCode).toBe('INSTRUMENT_SUPERSEDED');
  });

  test('6.5 NOT_AUTHORIZED — REJECTED status', () => {
    const r = run({ inputs: { instrument: { ...BASE_INSTR, status: 'REJECTED' } } });
    expect(r.outcome).toBe(OUTCOMES.NOT_AUTHORIZED);
    expect(r.reasonCode).toBe('INSTRUMENT_REJECTED');
  });

  test('6.6 NOT_AUTHORIZED — UNVERIFIED status', () => {
    const r = run({ inputs: { instrument: { ...BASE_INSTR, status: 'UNVERIFIED' } } });
    expect(r.outcome).toBe(OUTCOMES.NOT_AUTHORIZED);
    expect(r.reasonCode).toBe('INSTRUMENT_NOT_VERIFIED');
  });

  test('6.7 MANUAL_REVIEW — unknown instrument type', () => {
    const r = run({ inputs: { instrument: { ...BASE_INSTR, instrument_type: 'healthcare_proxy' } } });
    expect(r.outcome).toBe(OUTCOMES.MANUAL_REVIEW);
    expect(r.reasonCode).toBe('UNKNOWN_INSTRUMENT_TYPE');
  });

  test('6.8 NOT_AUTHORIZED — requesting party not in instrument', () => {
    const r = run({ req: { requestingPartyId: 'unknown-party-id', actionKey: 'BANKING.WIRE_TRANSFER' } });
    expect(r.outcome).toBe(OUTCOMES.NOT_AUTHORIZED);
    expect(r.reasonCode).toBe('REQUESTING_PARTY_NOT_AGENT');
  });

  test('6.9 NOT_AUTHORIZED — participant is inactive', () => {
    const inactiveParts = [{ party_id: AGENT_ID, role: 'agent', status: 'inactive' }];
    const r = run({ inputs: { participants: inactiveParts } });
    expect(r.outcome).toBe(OUTCOMES.NOT_AUTHORIZED);
    expect(r.reasonCode).toBe('PARTICIPANT_INACTIVE');
  });

  test('6.10 NOT_AUTHORIZED — principal role cannot act as agent', () => {
    const principalParts = [{ party_id: AGENT_ID, role: 'principal', status: 'active' }];
    const r = run({ inputs: { participants: principalParts } });
    expect(r.outcome).toBe(OUTCOMES.NOT_AUTHORIZED);
    expect(r.reasonCode).toBe('REQUESTING_PARTY_NOT_AGENT');
  });

  test('6.11 NOT_AUTHORIZED — before effective_date', () => {
    const r = run({ ctx: { ...CTX, action_time: '2024-12-31' } });
    expect(r.outcome).toBe(OUTCOMES.NOT_AUTHORIZED);
    expect(r.reasonCode).toBe('BEFORE_EFFECTIVE_DATE');
  });

  test('6.12 NOT_AUTHORIZED — after expiration_date', () => {
    const r = run({ ctx: { ...CTX, action_time: '2036-01-01' } });
    expect(r.outcome).toBe(OUTCOMES.NOT_AUTHORIZED);
    expect(r.reasonCode).toBe('AFTER_EXPIRATION_DATE');
  });

  test('6.13 INSUFFICIENT_INFO — action key not in instrument', () => {
    const r = run({ req: { ...REQ, actionKey: 'BANKING.ACH_TRANSFER' } });
    expect(r.outcome).toBe(OUTCOMES.INSUFFICIENT_INFO);
    expect(r.reasonCode).toBe('ACTION_NOT_IN_INSTRUMENT');
  });

  test('6.14 NOT_AUTHORIZED — action explicitly prohibited', () => {
    const prohibPerms = [
      { id: 'perm-1', action_key: 'BANKING.WIRE_TRANSFER', grant_type: 'prohibited' },
    ];
    const r = run({ inputs: { permissions: prohibPerms } });
    expect(r.outcome).toBe(OUTCOMES.NOT_AUTHORIZED);
    expect(r.reasonCode).toBe('ACTION_EXPLICITLY_PROHIBITED');
  });

  test('6.15 MANUAL_REVIEW — unsupported action domain', () => {
    const altPerms = [{ id: 'perm-1', action_key: 'ALIEN_DOMAIN.ACTION', grant_type: 'granted' }];
    const r = run({ inputs: { permissions: altPerms }, req: { ...REQ, actionKey: 'ALIEN_DOMAIN.ACTION' } });
    expect(r.outcome).toBe(OUTCOMES.MANUAL_REVIEW);
    expect(r.reasonCode).toBe('UNSUPPORTED_ACTION_DOMAIN');
  });

  test('6.16 NOT_AUTHORIZED — monetary_limit exceeded', () => {
    const restrWithLimit = [{
      id: 'r1', restriction_type: 'monetary_limit',
      parameters: { amount: 10000, currency: 'USD' },
      permission_id: 'perm-1',
      effective_from: null, effective_to: null,
    }];
    const r = run({ inputs: { restrictions: restrWithLimit }, req: { ...REQ, amount: 15000 } });
    expect(r.outcome).toBe(OUTCOMES.NOT_AUTHORIZED);
    expect(r.reasonCode).toBe('MONETARY_LIMIT_EXCEEDED');
  });

  test('6.17 AUTHORIZED — amount exactly at monetary_limit', () => {
    const restrWithLimit = [{
      id: 'r1', restriction_type: 'monetary_limit',
      parameters: { amount: 10000, currency: 'USD' },
      permission_id: 'perm-1',
      effective_from: null, effective_to: null,
    }];
    const r = run({ inputs: { restrictions: restrWithLimit }, req: { ...REQ, amount: 10000 } });
    expect(r.outcome).toBe(OUTCOMES.AUTHORIZED);
  });

  test('6.18 MANUAL_REVIEW — unknown restriction type', () => {
    const unknownRestr = [{
      id: 'r1', restriction_type: 'approval_required',
      parameters: null, permission_id: 'perm-1',
    }];
    const r = run({ inputs: { restrictions: unknownRestr } });
    expect(r.outcome).toBe(OUTCOMES.MANUAL_REVIEW);
    expect(r.reasonCode).toBe('UNKNOWN_RESTRICTION_TYPE');
  });

  test('6.19 INSUFFICIENT_INFO — requesting party not provided', () => {
    const r = run({ req: { ...REQ, requestingPartyId: null } });
    expect(r.outcome).toBe(OUTCOMES.INSUFFICIENT_INFO);
    expect(r.reasonCode).toBe('REQUESTING_PARTY_UNKNOWN');
  });

  test('6.20 INSUFFICIENT_INFO — no instrument provided', () => {
    const inputs = { instrument: null, participants: PARTS, permissions: PERMS, restrictions: RESTR };
    const r = evaluate(inputs, REQ, CTX, policyRegistry, require('../services/authorityRestrictionEvaluators'));
    expect(r.outcome).toBe(OUTCOMES.INSUFFICIENT_INFO);
    expect(r.reasonCode).toBe('NO_INSTRUMENT_PROVIDED');
  });

  test('6.21 restriction scoped to specific permission — skipped for different permission', () => {
    // restriction permission_id = 'perm-2', but the granted perm is 'perm-1'
    const restrForOtherPerm = [{
      id: 'r1', restriction_type: 'monetary_limit',
      parameters: { amount: 5000, currency: 'USD' },
      permission_id: 'perm-2',  // not the granted perm
      effective_from: null, effective_to: null,
    }];
    const r = run({ inputs: { restrictions: restrForOtherPerm }, req: { ...REQ, amount: 9000 } });
    expect(r.outcome).toBe(OUTCOMES.AUTHORIZED);
  });

  test('6.22 instrument-wide restriction (null permission_id) applies to all actions', () => {
    const restrInstrWide = [{
      id: 'r1', restriction_type: 'monetary_limit',
      parameters: { amount: 5000, currency: 'USD' },
      permission_id: null,
      effective_from: null, effective_to: null,
    }];
    const r = run({ inputs: { restrictions: restrInstrWide }, req: { ...REQ, amount: 9000 } });
    expect(r.outcome).toBe(OUTCOMES.NOT_AUTHORIZED);
    expect(r.reasonCode).toBe('MONETARY_LIMIT_EXCEEDED');
  });

  test('6.23 trust instrument — trustee role is authorized', () => {
    const trustInstr = { ...BASE_INSTR, instrument_type: 'trust' };
    const trusteeParts = [{ party_id: AGENT_ID, role: 'trustee', status: 'active' }];
    const r = evaluate(
      { instrument: trustInstr, participants: trusteeParts, permissions: PERMS, restrictions: [] },
      REQ, CTX, policyRegistry, require('../services/authorityRestrictionEvaluators')
    );
    expect(r.outcome).toBe(OUTCOMES.AUTHORIZED);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 7: Static safety constraints
// ═══════════════════════════════════════════════════════════════════════════════

describe('Static safety constraints', () => {
  test('7.1 authorityEngineCore.js does not import pool', () => {
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(__dirname, '../services/authorityEngineCore.js'), 'utf8'
    );
    expect(src).not.toMatch(/require\s*\(\s*['"]\.\.\/db\/pool['"]/);
    expect(src).not.toMatch(/require\s*\(\s*['"]\.\/pool['"]/);
  });

  test('7.2 authorityEngineCore.js does not require @anthropic-ai/sdk', () => {
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(__dirname, '../services/authorityEngineCore.js'), 'utf8'
    );
    expect(src).not.toMatch(/require\s*\(\s*['"]@anthropic-ai/);
  });

  test('7.3 authorityFingerprint.js does not import pool', () => {
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(__dirname, '../services/authorityFingerprint.js'), 'utf8'
    );
    expect(src).not.toMatch(/require\s*\(\s*['"]\.\.\/db\/pool['"]/);
  });

  test('7.4 authorityRestrictionEvaluators.js does not import pool', () => {
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(__dirname, '../services/authorityRestrictionEvaluators.js'), 'utf8'
    );
    expect(src).not.toMatch(/require\s*\(\s*['"]\.\.\/db\/pool['"]/);
  });

  test('7.5 authorityEvaluationService.js does not require @anthropic-ai/sdk', () => {
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(__dirname, '../services/authorityEvaluationService.js'), 'utf8'
    );
    expect(src).not.toMatch(/require\s*\(\s*['"]@anthropic-ai/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 8: Service — happy path AUTHORIZED
// ═══════════════════════════════════════════════════════════════════════════════

describe('Service — AUTHORIZED happy path', () => {
  test('8.1 returns AUTHORIZED for verified instrument + valid agent + valid action', async () => {
    const result = await evaluationService.evaluateAuthority(
      {
        instrumentId:      verifiedInstr.id,
        requestingPartyId: agentParty.id,
        actionKey:         'BANKING.WIRE_TRANSFER',
        amount:            5000,
        currency:          'USD',
        idempotencyKey:    ik(),
      },
      { accountId, userId, ipAddress: null }
    );
    expect(result.outcome).toBe(OUTCOMES.AUTHORIZED);
    expect(result.reasonCode).toBe('EXPLICITLY_GRANTED');
    expect(result.isReplay).toBe(false);
    expect(typeof result.evaluationId).toBe('string');
    expect(typeof result.evaluated_at).toBe('string');
  });

  test('8.2 evaluation row persisted to DB', async () => {
    const idKey = ik();
    const result = await evaluationService.evaluateAuthority(
      {
        instrumentId:      verifiedInstr.id,
        requestingPartyId: agentParty.id,
        actionKey:         'BANKING.WIRE_TRANSFER',
        amount:            5000,
        idempotencyKey:    idKey,
      },
      { accountId, userId, ipAddress: null }
    );
    const row = await evaluationService.getEvaluation(accountId, result.evaluationId);
    expect(row.outcome).toBe(OUTCOMES.AUTHORIZED);
    expect(row.reason_code).toBe('EXPLICITLY_GRANTED');
    expect(row.instrument_id).toBe(verifiedInstr.id);
    expect(row.requesting_party_id).toBe(agentParty.id);
    expect(row.requested_action_key).toBe('BANKING.WIRE_TRANSFER');
    expect(row.policy_version).toBe(policyRegistry.POLICY_VERSION);
  });

  test('8.3 canonical_rules_fingerprint is a 64-char hex string in DB', async () => {
    const idKey = ik();
    const result = await evaluationService.evaluateAuthority(
      {
        instrumentId:      verifiedInstr.id,
        requestingPartyId: agentParty.id,
        actionKey:         'BANKING.WIRE_TRANSFER',
        amount:            5000,
        idempotencyKey:    idKey,
      },
      { accountId, userId, ipAddress: null }
    );
    const { rows } = await pool.query(
      `SELECT canonical_rules_fingerprint FROM authority_evaluations WHERE id = $1`,
      [result.evaluationId]
    );
    expect(rows[0].canonical_rules_fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  test('8.4 evaluation_state_snapshot is JSON in DB', async () => {
    const idKey = ik();
    const result = await evaluationService.evaluateAuthority(
      {
        instrumentId:      verifiedInstr.id,
        requestingPartyId: agentParty.id,
        actionKey:         'BANKING.WIRE_TRANSFER',
        amount:            5000,
        idempotencyKey:    idKey,
      },
      { accountId, userId, ipAddress: null }
    );
    const { rows } = await pool.query(
      `SELECT evaluation_state_snapshot FROM authority_evaluations WHERE id = $1`,
      [result.evaluationId]
    );
    const snap = JSON.parse(rows[0].evaluation_state_snapshot);
    expect(snap.status).toBe('VERIFIED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 9: Service — instrument status checks
// ═══════════════════════════════════════════════════════════════════════════════

describe('Service — instrument status checks', () => {
  // Create a separate instrument we can transition for each test
  async function makeInstrumentWithStatus(targetStatus) {
    const instr = await authorityService.createInstrument(accountId, userId, {
      instrumentType: 'power_of_attorney',
      effectiveDate:  '2025-01-01',
      expirationDate: '2035-12-31',
    });
    // Transition through states to reach target
    if (targetStatus === 'UNVERIFIED') return instr;
    if (targetStatus === 'PENDING_REVIEW') {
      await authorityService.transitionInstrument(accountId, userId, instr.id, 'PENDING_REVIEW');
      return authorityService.getInstrument(accountId, instr.id);
    }
    if (targetStatus === 'VERIFIED') {
      await authorityService.transitionInstrument(accountId, userId, instr.id, 'PENDING_REVIEW');
      await authorityService.transitionInstrument(accountId, userId, instr.id, 'VERIFIED');
      return authorityService.getInstrument(accountId, instr.id);
    }
    if (targetStatus === 'REVOKED') {
      await authorityService.transitionInstrument(accountId, userId, instr.id, 'PENDING_REVIEW');
      await authorityService.transitionInstrument(accountId, userId, instr.id, 'VERIFIED');
      await authorityService.transitionInstrument(accountId, userId, instr.id, 'REVOKED', { revocationReason: 'test' });
      return authorityService.getInstrument(accountId, instr.id);
    }
    if (targetStatus === 'REJECTED') {
      await authorityService.transitionInstrument(accountId, userId, instr.id, 'PENDING_REVIEW');
      await authorityService.transitionInstrument(accountId, userId, instr.id, 'REJECTED', { rejectionReason: 'test' });
      return authorityService.getInstrument(accountId, instr.id);
    }
    return instr;
  }

  test('9.1 UNVERIFIED instrument → NOT_AUTHORIZED', async () => {
    const instr = await makeInstrumentWithStatus('UNVERIFIED');
    const r = await evaluationService.evaluateAuthority(
      { instrumentId: instr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', idempotencyKey: ik() },
      { accountId, userId, ipAddress: null }
    );
    expect(r.outcome).toBe(OUTCOMES.NOT_AUTHORIZED);
    expect(r.reasonCode).toBe('INSTRUMENT_NOT_VERIFIED');
  });

  test('9.2 REVOKED instrument → NOT_AUTHORIZED', async () => {
    const instr = await makeInstrumentWithStatus('REVOKED');
    const r = await evaluationService.evaluateAuthority(
      { instrumentId: instr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', idempotencyKey: ik() },
      { accountId, userId, ipAddress: null }
    );
    expect(r.outcome).toBe(OUTCOMES.NOT_AUTHORIZED);
    expect(r.reasonCode).toBe('INSTRUMENT_REVOKED');
  });

  test('9.3 REJECTED instrument → NOT_AUTHORIZED', async () => {
    const instr = await makeInstrumentWithStatus('REJECTED');
    const r = await evaluationService.evaluateAuthority(
      { instrumentId: instr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', idempotencyKey: ik() },
      { accountId, userId, ipAddress: null }
    );
    expect(r.outcome).toBe(OUTCOMES.NOT_AUTHORIZED);
    expect(r.reasonCode).toBe('INSTRUMENT_REJECTED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 10: Service — requesting party checks
// ═══════════════════════════════════════════════════════════════════════════════

describe('Service — requesting party checks', () => {
  test('10.1 principal party cannot act as agent → NOT_AUTHORIZED', async () => {
    const r = await evaluationService.evaluateAuthority(
      { instrumentId: verifiedInstr.id, requestingPartyId: principalParty.id, actionKey: 'BANKING.WIRE_TRANSFER', idempotencyKey: ik() },
      { accountId, userId, ipAddress: null }
    );
    expect(r.outcome).toBe(OUTCOMES.NOT_AUTHORIZED);
    expect(r.reasonCode).toBe('REQUESTING_PARTY_NOT_AGENT');
  });

  test('10.2 unknown party → NOT_AUTHORIZED (not a participant)', async () => {
    const r = await evaluationService.evaluateAuthority(
      { instrumentId: verifiedInstr.id, requestingPartyId: crypto.randomUUID(), actionKey: 'BANKING.WIRE_TRANSFER', idempotencyKey: ik() },
      { accountId, userId, ipAddress: null }
    );
    expect(r.outcome).toBe(OUTCOMES.NOT_AUTHORIZED);
    expect(r.reasonCode).toBe('REQUESTING_PARTY_NOT_AGENT');
  });

  test('10.3 null requesting party → INSUFFICIENT_INFORMATION', async () => {
    const r = await evaluationService.evaluateAuthority(
      { instrumentId: verifiedInstr.id, requestingPartyId: null, actionKey: 'BANKING.WIRE_TRANSFER', idempotencyKey: ik() },
      { accountId, userId, ipAddress: null }
    );
    expect(r.outcome).toBe(OUTCOMES.INSUFFICIENT_INFO);
    expect(r.reasonCode).toBe('REQUESTING_PARTY_UNKNOWN');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 11: Service — temporal bounds via action_time
// ═══════════════════════════════════════════════════════════════════════════════

describe('Service — temporal bounds', () => {
  test('11.1 action_time before effective_date → NOT_AUTHORIZED', async () => {
    const r = await evaluationService.evaluateAuthority(
      {
        instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id,
        actionKey: 'BANKING.WIRE_TRANSFER', amount: 100,
        actionTime: '2024-06-01T00:00:00Z',
        idempotencyKey: ik(),
      },
      { accountId, userId, ipAddress: null }
    );
    expect(r.outcome).toBe(OUTCOMES.NOT_AUTHORIZED);
    expect(r.reasonCode).toBe('BEFORE_EFFECTIVE_DATE');
  });

  test('11.2 action_time after expiration_date → NOT_AUTHORIZED', async () => {
    const r = await evaluationService.evaluateAuthority(
      {
        instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id,
        actionKey: 'BANKING.WIRE_TRANSFER', amount: 100,
        actionTime: '2037-01-01T00:00:00Z',
        idempotencyKey: ik(),
      },
      { accountId, userId, ipAddress: null }
    );
    expect(r.outcome).toBe(OUTCOMES.NOT_AUTHORIZED);
    expect(r.reasonCode).toBe('AFTER_EXPIRATION_DATE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 12: Service — permission checks
// ═══════════════════════════════════════════════════════════════════════════════

describe('Service — permission checks', () => {
  test('12.1 action not in instrument → INSUFFICIENT_INFORMATION', async () => {
    const r = await evaluationService.evaluateAuthority(
      { instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.ACH_TRANSFER', idempotencyKey: ik() },
      { accountId, userId, ipAddress: null }
    );
    expect(r.outcome).toBe(OUTCOMES.INSUFFICIENT_INFO);
    expect(r.reasonCode).toBe('ACTION_NOT_IN_INSTRUMENT');
  });

  test('12.2 prohibited action → NOT_AUTHORIZED', async () => {
    // Create a fresh instrument with a prohibited permission (instruments are locked after VERIFIED)
    const prohibInstr = await authorityService.createInstrument(accountId, userId, {
      instrumentType: 'power_of_attorney',
      effectiveDate:  '2025-01-01',
    });
    await authorityService.addParticipant(accountId, userId, prohibInstr.id,
      { partyId: agentParty.id, role: 'agent', sequence: 1 });
    await authorityService.addPermission(accountId, userId, prohibInstr.id,
      { actionKey: 'BANKING.TRANSFER', grantType: 'prohibited' });
    await authorityService.transitionInstrument(accountId, userId, prohibInstr.id, 'PENDING_REVIEW');
    await authorityService.transitionInstrument(accountId, userId, prohibInstr.id, 'VERIFIED');

    const r = await evaluationService.evaluateAuthority(
      { instrumentId: prohibInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.TRANSFER', idempotencyKey: ik() },
      { accountId, userId, ipAddress: null }
    );
    expect(r.outcome).toBe(OUTCOMES.NOT_AUTHORIZED);
    expect(r.reasonCode).toBe('ACTION_EXPLICITLY_PROHIBITED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 13: Service — restriction evaluation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Service — restriction evaluation', () => {
  test('13.1 amount within monetary_limit → AUTHORIZED', async () => {
    const r = await evaluationService.evaluateAuthority(
      { instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', amount: 9999, idempotencyKey: ik() },
      { accountId, userId, ipAddress: null }
    );
    expect(r.outcome).toBe(OUTCOMES.AUTHORIZED);
  });

  test('13.2 amount exceeds monetary_limit → NOT_AUTHORIZED', async () => {
    const r = await evaluationService.evaluateAuthority(
      { instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', amount: 15000, idempotencyKey: ik() },
      { accountId, userId, ipAddress: null }
    );
    expect(r.outcome).toBe(OUTCOMES.NOT_AUTHORIZED);
    expect(r.reasonCode).toBe('MONETARY_LIMIT_EXCEEDED');
  });

  test('13.3 monetary_limit restriction without request amount → INSUFFICIENT_INFORMATION', async () => {
    const r = await evaluationService.evaluateAuthority(
      { instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', amount: null, idempotencyKey: ik() },
      { accountId, userId, ipAddress: null }
    );
    expect(r.outcome).toBe(OUTCOMES.INSUFFICIENT_INFO);
    expect(r.reasonCode).toBe('MISSING_REQUEST_AMOUNT');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 14: Service — MANUAL_REVIEW paths
// ═══════════════════════════════════════════════════════════════════════════════

describe('Service — MANUAL_REVIEW paths', () => {
  test('14.1 healthcare_proxy instrument → MANUAL_REVIEW (unknown type)', async () => {
    const instr = await authorityService.createInstrument(accountId, userId, {
      instrumentType: 'healthcare_proxy',
      effectiveDate:  '2025-01-01',
    });
    await authorityService.addParticipant(accountId, userId, instr.id,
      { partyId: agentParty.id, role: 'agent', sequence: 1 });
    await authorityService.addPermission(accountId, userId, instr.id,
      { actionKey: 'HEALTHCARE.CONSENT', grantType: 'granted' });
    await authorityService.transitionInstrument(accountId, userId, instr.id, 'PENDING_REVIEW');
    await authorityService.transitionInstrument(accountId, userId, instr.id, 'VERIFIED');

    const r = await evaluationService.evaluateAuthority(
      { instrumentId: instr.id, requestingPartyId: agentParty.id, actionKey: 'HEALTHCARE.CONSENT', idempotencyKey: ik() },
      { accountId, userId, ipAddress: null }
    );
    expect(r.outcome).toBe(OUTCOMES.MANUAL_REVIEW);
    expect(r.reasonCode).toBe('UNKNOWN_INSTRUMENT_TYPE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 15: Service — INSUFFICIENT_INFORMATION paths
// ═══════════════════════════════════════════════════════════════════════════════

describe('Service — INSUFFICIENT_INFORMATION paths', () => {
  test('15.1 instrument not found → 404 thrown', async () => {
    await expect(evaluationService.evaluateAuthority(
      { instrumentId: crypto.randomUUID(), requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', idempotencyKey: ik() },
      { accountId, userId, ipAddress: null }
    )).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 16: Idempotency — valid replay
// ═══════════════════════════════════════════════════════════════════════════════

describe('Idempotency — valid replay', () => {
  test('16.1 second call with same key returns identical outcome', async () => {
    const idKey = ik();
    const r1 = await evaluationService.evaluateAuthority(
      { instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', amount: 5000, idempotencyKey: idKey },
      { accountId, userId, ipAddress: null }
    );
    const r2 = await evaluationService.evaluateAuthority(
      { instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', amount: 5000, idempotencyKey: idKey },
      { accountId, userId, ipAddress: null }
    );
    expect(r2.isReplay).toBe(true);
    expect(r2.evaluationId).toBe(r1.evaluationId);
    expect(r2.outcome).toBe(r1.outcome);
    expect(r2.reasonCode).toBe(r1.reasonCode);
  });

  test('16.2 replay does not create a new DB row', async () => {
    const idKey = ik();
    const r1 = await evaluationService.evaluateAuthority(
      { instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', amount: 5000, idempotencyKey: idKey },
      { accountId, userId, ipAddress: null }
    );
    await evaluationService.evaluateAuthority(
      { instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', amount: 5000, idempotencyKey: idKey },
      { accountId, userId, ipAddress: null }
    );
    const { rows } = await pool.query(
      `SELECT COUNT(*) FROM authority_evaluations WHERE account_id = $1 AND idempotency_key = $2`,
      [accountId, idKey]
    );
    expect(parseInt(rows[0].count, 10)).toBe(1);
  });

  test('16.3 same key in different account is independent', async () => {
    const idKey = ik();
    const r1 = await evaluationService.evaluateAuthority(
      { instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', amount: 5000, idempotencyKey: idKey },
      { accountId, userId, ipAddress: null }
    );
    // Account B uses same key but for their own non-existent instrument — expect 404
    await expect(evaluationService.evaluateAuthority(
      { instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', idempotencyKey: idKey },
      { accountId: accountB_Id, userId: userB_Id, ipAddress: null }
    )).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 17: Idempotency — stale replay
// ═══════════════════════════════════════════════════════════════════════════════

describe('Idempotency — stale replay', () => {
  test('17.1 changed instrumentId with same key → MANUAL_REVIEW IDEMPOTENCY_REPLAY_STALE', async () => {
    const idKey = ik();
    // First evaluation
    await evaluationService.evaluateAuthority(
      { instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', amount: 5000, idempotencyKey: idKey },
      { accountId, userId, ipAddress: null }
    );
    // Second evaluation — different instrumentId, same key
    const diffInstr = await authorityService.createInstrument(accountId, userId, {
      instrumentType: 'power_of_attorney',
      effectiveDate:  '2025-01-01',
    });
    const r2 = await evaluationService.evaluateAuthority(
      { instrumentId: diffInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', idempotencyKey: idKey },
      { accountId, userId, ipAddress: null }
    );
    expect(r2.outcome).toBe(OUTCOMES.MANUAL_REVIEW);
    expect(r2.reasonCode).toBe('IDEMPOTENCY_REPLAY_STALE');
    expect(r2.isReplay).toBe(true);
  });

  test('17.2 changed requestingPartyId with same key → MANUAL_REVIEW IDEMPOTENCY_REPLAY_STALE', async () => {
    const idKey = ik();
    await evaluationService.evaluateAuthority(
      { instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', amount: 5000, idempotencyKey: idKey },
      { accountId, userId, ipAddress: null }
    );
    const r2 = await evaluationService.evaluateAuthority(
      { instrumentId: verifiedInstr.id, requestingPartyId: principalParty.id, actionKey: 'BANKING.WIRE_TRANSFER', idempotencyKey: idKey },
      { accountId, userId, ipAddress: null }
    );
    expect(r2.outcome).toBe(OUTCOMES.MANUAL_REVIEW);
    expect(r2.reasonCode).toBe('IDEMPOTENCY_REPLAY_STALE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 18: Idempotency — unique constraint backing
// ═══════════════════════════════════════════════════════════════════════════════

describe('Idempotency — DB constraint', () => {
  test('18.1 direct DB insert with duplicate key throws unique violation', async () => {
    const idKey = `test-constraint-${ik()}`;
    // Insert once manually
    await pool.query(
      `INSERT INTO authority_evaluations
         (account_id, instrument_id, idempotency_key, outcome, reason_code,
          policy_version, canonical_rules_fingerprint, evaluation_state_snapshot, evaluated_at)
       VALUES ($1,$2,$3,'AUTHORIZED','EXPLICITLY_GRANTED','1.0.0','aabb','{}',now())`,
      [accountId, verifiedInstr.id, idKey]
    );
    // Second insert should throw
    await expect(pool.query(
      `INSERT INTO authority_evaluations
         (account_id, instrument_id, idempotency_key, outcome, reason_code,
          policy_version, canonical_rules_fingerprint, evaluation_state_snapshot, evaluated_at)
       VALUES ($1,$2,$3,'AUTHORIZED','EXPLICITLY_GRANTED','1.0.0','aabb','{}',now())`,
      [accountId, verifiedInstr.id, idKey]
    )).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 19: Concurrency — FOR SHARE structural check
// ═══════════════════════════════════════════════════════════════════════════════

describe('Concurrency — FOR SHARE structural check', () => {
  test('19.1 evaluationService source contains FOR SHARE', () => {
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(__dirname, '../services/authorityEvaluationService.js'), 'utf8'
    );
    expect(src).toMatch(/FOR SHARE/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 20: Audit — evaluation.completed written inside transaction
// ═══════════════════════════════════════════════════════════════════════════════

describe('Audit — evaluation.completed', () => {
  test('20.1 audit record authority.evaluation.completed written after successful evaluation', async () => {
    const idKey = ik();
    const result = await evaluationService.evaluateAuthority(
      { instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', amount: 5000, idempotencyKey: idKey },
      { accountId, userId, ipAddress: '127.0.0.1' }
    );
    const { rows } = await pool.query(
      `SELECT action, entity_id FROM audit_logs
       WHERE account_id = $1 AND action = 'authority.evaluation.completed'
       AND entity_id = $2`,
      [accountId, result.evaluationId]
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('20.2 audit failure rolls back evaluation row', async () => {
    const idKey = ik();
    const spy = jest.spyOn(audit, 'logInTx').mockRejectedValueOnce(new Error('simulated audit failure'));
    try {
      await expect(evaluationService.evaluateAuthority(
        { instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', amount: 5000, idempotencyKey: idKey },
        { accountId, userId, ipAddress: null }
      )).rejects.toThrow('simulated audit failure');
      // Evaluation row must NOT exist (rolled back)
      const { rows } = await pool.query(
        `SELECT id FROM authority_evaluations WHERE account_id = $1 AND idempotency_key = $2`,
        [accountId, idKey]
      );
      expect(rows.length).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 21: Fingerprint vs. snapshot invariants
// ═══════════════════════════════════════════════════════════════════════════════

describe('Fingerprint vs. snapshot invariants', () => {
  test('21.1 two evaluations on same instrument produce same fingerprint', async () => {
    const r1 = await evaluationService.evaluateAuthority(
      { instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', amount: 5000, idempotencyKey: ik() },
      { accountId, userId, ipAddress: null }
    );
    const r2 = await evaluationService.evaluateAuthority(
      { instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', amount: 5000, idempotencyKey: ik() },
      { accountId, userId, ipAddress: null }
    );
    const [row1] = await Promise.all([
      pool.query(`SELECT canonical_rules_fingerprint FROM authority_evaluations WHERE id = $1`, [r1.evaluationId]),
    ]);
    const [row2] = await Promise.all([
      pool.query(`SELECT canonical_rules_fingerprint FROM authority_evaluations WHERE id = $1`, [r2.evaluationId]),
    ]);
    expect(row1.rows[0].canonical_rules_fingerprint).toBe(row2.rows[0].canonical_rules_fingerprint);
  });

  test('21.2 evaluation_state_snapshot contains status field', async () => {
    const r = await evaluationService.evaluateAuthority(
      { instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', amount: 5000, idempotencyKey: ik() },
      { accountId, userId, ipAddress: null }
    );
    const { rows } = await pool.query(
      `SELECT evaluation_state_snapshot FROM authority_evaluations WHERE id = $1`,
      [r.evaluationId]
    );
    const snap = JSON.parse(rows[0].evaluation_state_snapshot);
    expect(snap.status).toBe('VERIFIED');
    expect(snap.verified_at).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 22: HTTP routes
// ═══════════════════════════════════════════════════════════════════════════════

describe('HTTP routes', () => {
  test('22.1 POST /api/authority/evaluate — 201 AUTHORIZED', async () => {
    const res = await request(app)
      .post('/api/authority/evaluate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        instrumentId:      verifiedInstr.id,
        requestingPartyId: agentParty.id,
        actionKey:         'BANKING.WIRE_TRANSFER',
        amount:            5000,
        currency:          'USD',
        idempotencyKey:    ik(),
      });
    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe(OUTCOMES.AUTHORIZED);
    expect(typeof res.body.evaluationId).toBe('string');
    expect(res.body.isReplay).toBe(false);
  });

  test('22.2 POST /api/authority/evaluate — 200 on replay', async () => {
    const idKey = ik();
    await request(app)
      .post('/api/authority/evaluate')
      .set('Authorization', `Bearer ${token}`)
      .send({ instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', amount: 5000, idempotencyKey: idKey });
    const res = await request(app)
      .post('/api/authority/evaluate')
      .set('Authorization', `Bearer ${token}`)
      .send({ instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', amount: 5000, idempotencyKey: idKey });
    expect(res.status).toBe(200);
    expect(res.body.isReplay).toBe(true);
  });

  test('22.3 POST /api/authority/evaluate — 400 if missing instrumentId', async () => {
    const res = await request(app)
      .post('/api/authority/evaluate')
      .set('Authorization', `Bearer ${token}`)
      .send({ requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', idempotencyKey: ik() });
    expect(res.status).toBe(400);
  });

  test('22.4 POST /api/authority/evaluate — 400 if missing idempotencyKey', async () => {
    const res = await request(app)
      .post('/api/authority/evaluate')
      .set('Authorization', `Bearer ${token}`)
      .send({ instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER' });
    expect(res.status).toBe(400);
  });

  test('22.5 POST /api/authority/evaluate — 401 without token', async () => {
    const res = await request(app)
      .post('/api/authority/evaluate')
      .send({ instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id, idempotencyKey: ik() });
    expect(res.status).toBe(401);
  });

  test('22.6 GET /api/authority/evaluations — returns array', async () => {
    const res = await request(app)
      .get('/api/authority/evaluations')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('22.7 GET /api/authority/evaluations — filters by instrumentId', async () => {
    const res = await request(app)
      .get(`/api/authority/evaluations?instrumentId=${verifiedInstr.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    for (const row of res.body) {
      expect(row.instrument_id).toBe(verifiedInstr.id);
    }
  });

  test('22.8 GET /api/authority/evaluations/:id — returns evaluation', async () => {
    const first = await evaluationService.evaluateAuthority(
      { instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', amount: 5000, idempotencyKey: ik() },
      { accountId, userId, ipAddress: null }
    );
    const res = await request(app)
      .get(`/api/authority/evaluations/${first.evaluationId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(first.evaluationId);
    expect(res.body.outcome).toBe(first.outcome);
  });

  test('22.9 GET /api/authority/evaluations/:id — 404 for unknown id', async () => {
    const res = await request(app)
      .get(`/api/authority/evaluations/${crypto.randomUUID()}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('22.10 GET /api/authority/evaluations — does not return runtime_context', async () => {
    const res = await request(app)
      .get('/api/authority/evaluations')
      .set('Authorization', `Bearer ${token}`);
    for (const row of res.body) {
      expect(row.runtime_context).toBeUndefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 23: Tenant isolation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Tenant isolation', () => {
  test('23.1 account B cannot evaluate instrument owned by account A', async () => {
    const tokenB = makeToken(userB_Id, accountB_Id, 'owner');
    const res = await request(app)
      .post('/api/authority/evaluate')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        instrumentId:      verifiedInstr.id,
        requestingPartyId: agentParty.id,
        actionKey:         'BANKING.WIRE_TRANSFER',
        amount:            5000,
        idempotencyKey:    ik(),
      });
    // 403 (not institution B) or 404 (instrument not found for acct B)
    expect([403, 404]).toContain(res.status);
  });

  test('23.2 account B cannot list evaluations from account A', async () => {
    const tokenB = makeToken(userB_Id, accountB_Id, 'owner');
    const res = await request(app)
      .get('/api/authority/evaluations')
      .set('Authorization', `Bearer ${tokenB}`);
    // Either 403 (non-institution) or 200 with empty array (tenant-isolated)
    if (res.status === 200) {
      for (const row of res.body) {
        expect(row.account_id).not.toBe(accountId);
      }
    } else {
      expect(res.status).toBe(403);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 24: Input validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Input validation', () => {
  test('24.1 missing instrumentId throws 400', async () => {
    await expect(evaluationService.evaluateAuthority(
      { requestingPartyId: agentParty.id, idempotencyKey: ik() },
      { accountId, userId, ipAddress: null }
    )).rejects.toMatchObject({ statusCode: 400 });
  });

  test('24.2 missing idempotencyKey throws 400', async () => {
    await expect(evaluationService.evaluateAuthority(
      { instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id },
      { accountId, userId, ipAddress: null }
    )).rejects.toMatchObject({ statusCode: 400 });
  });

  test('24.3 non-institution account throws 403', async () => {
    // field_service is a valid non-institution account type
    const { rows: [fsAcct] } = await pool.query(
      `INSERT INTO accounts (name, plan, account_type) VALUES ('FS Regular','starter','field_service') RETURNING id`
    );
    try {
      await expect(evaluationService.evaluateAuthority(
        { instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', idempotencyKey: ik() },
        { accountId: fsAcct.id, userId, ipAddress: null }
      )).rejects.toMatchObject({ statusCode: 403 });
    } finally {
      await pool.query(`DELETE FROM accounts WHERE id = $1`, [fsAcct.id]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 25: policy_version persistence
// ═══════════════════════════════════════════════════════════════════════════════

describe('policy_version persistence', () => {
  test('25.1 evaluation row stores current POLICY_VERSION', async () => {
    const r = await evaluationService.evaluateAuthority(
      { instrumentId: verifiedInstr.id, requestingPartyId: agentParty.id, actionKey: 'BANKING.WIRE_TRANSFER', amount: 5000, idempotencyKey: ik() },
      { accountId, userId, ipAddress: null }
    );
    const { rows } = await pool.query(
      `SELECT policy_version FROM authority_evaluations WHERE id = $1`, [r.evaluationId]
    );
    expect(rows[0].policy_version).toBe(policyRegistry.POLICY_VERSION);
  });
});
