/**
 * FieldCore Authority — Preview Seed Behavioral Tests
 *
 * Validates the safety and correctness guarantees of the preview seed tooling:
 *  1. No direct SQL write to VERIFIED status (static + behavioral)
 *  2. Verification metadata and audit trail produced by real service path
 *  3. VERIFIED instrument cannot be re-verified (idempotency proof)
 *  4. Stage 4 eligibility filter works for VERIFIED instruments
 *  5. No fake document rows created via the direct SQL lifecycle bypass
 *  6. Reviewer capability isolation (no AUTHORITY_EVALUATE)
 *  7. Production guard exists in source
 *
 * These tests use a real database with isolated synthetic accounts.
 * Storage (R2) is mocked so no cloud resources are required.
 */

require('dotenv').config();

// ── Mock authorityStorage (R2) — same pattern as authority.test.js ───────────
jest.mock('../services/authorityStorage', () => {
  const crypto = require('crypto');
  let _last = Buffer.from('%PDF-1.4\n%%EOF');
  return {
    isConfigured:       jest.fn().mockReturnValue(true),
    upload:             jest.fn().mockImplementation(async (buf, { accountId } = {}) => {
      _last = buf;
      return {
        storageKey:    `authority/${accountId || 'test'}/${crypto.randomUUID()}`,
        contentSha256: crypto.createHash('sha256').update(buf).digest('hex'),
        byteSize:      buf.length,
      };
    }),
    getStream:          jest.fn().mockImplementation(async () => {
      const { Readable } = require('stream');
      return Readable.from([_last]);
    }),
    deleteObject:       jest.fn().mockResolvedValue(undefined),
    generateStorageKey: jest.fn().mockImplementation(id => `authority/${id}/${crypto.randomUUID()}`),
    _resetClient:       jest.fn(),
  };
});

const fs   = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const pool             = require('../db/pool');
const { runMigrations } = require('../db/migrate');
const authorityService = require('../services/authorityService');

const SEED_SOURCE_PATH = path.resolve(__dirname, '../../scripts/authority-preview-seed.js');

// ── Test state ────────────────────────────────────────────────────────────────
let acctId, ownerId, reviewerId;
const CLEANUP_ACCOUNTS = [];

beforeAll(async () => {
  process.env.AUTHORITY_ENABLED = 'true';

  await runMigrations();

  const hash = await bcrypt.hash('pw-preview-seed-test', 10);

  // Institution account
  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan, account_type)
     VALUES ('__TEST_PREVIEW_SEED__', 'institution', 'institution') RETURNING id`,
  );
  acctId = acct.id;
  CLEANUP_ACCOUNTS.push(acctId);

  // Owner user
  const { rows: [owner] } = await pool.query(
    `INSERT INTO users (account_id, role, name, email, password_hash)
     VALUES ($1, 'owner', '__TEST__ Seed Owner', $2, $3) RETURNING id`,
    [acctId, `seed-owner-${Date.now()}@fieldcore.test`, hash]
  );
  ownerId = owner.id;
  await authorityService.grantCapability(null, ownerId, 'AUTHORITY_INSTRUMENT_VERIFY');
  await authorityService.grantCapability(null, ownerId, 'AUTHORITY_INSTRUMENT_REJECT');
  await authorityService.grantCapability(null, ownerId, 'AUTHORITY_EVALUATE');

  // Reviewer user — only VERIFY and REJECT (no EVALUATE)
  const { rows: [rev] } = await pool.query(
    `INSERT INTO users (account_id, role, name, email, password_hash)
     VALUES ($1, 'owner', '__TEST__ Seed Reviewer', $2, $3) RETURNING id`,
    [acctId, `seed-reviewer-${Date.now()}@fieldcore.test`, hash]
  );
  reviewerId = rev.id;
  await authorityService.grantCapability(null, reviewerId, 'AUTHORITY_INSTRUMENT_VERIFY');
  await authorityService.grantCapability(null, reviewerId, 'AUTHORITY_INSTRUMENT_REJECT');
  // Deliberately NOT granting AUTHORITY_EVALUATE to reviewer
});

afterAll(async () => {
  for (const id of CLEANUP_ACCOUNTS) {
    await pool.query(`DELETE FROM accounts WHERE id = $1`, [id]);
  }
  await pool.end();
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 1: Static source analysis
// ─────────────────────────────────────────────────────────────────────────────

describe('preview seed — static source analysis', () => {
  let src;

  beforeAll(() => {
    src = fs.readFileSync(SEED_SOURCE_PATH, 'utf8');
  });

  test('seed source does not contain a direct SQL write to VERIFIED status', () => {
    // Any SQL UPDATE that sets status to VERIFIED directly would bypass the
    // service layer's human-verification rule.
    expect(src).not.toMatch(/SET\s+status\s*=\s*['"`]VERIFIED['"`]/i);
  });

  test('seed source contains NODE_ENV production guard', () => {
    expect(src).toMatch(/NODE_ENV.*production/);
  });

  test('seed source contains AUTHORITY_PREVIEW_SEED_ENABLED env guard', () => {
    expect(src).toMatch(/AUTHORITY_PREVIEW_SEED_ENABLED/);
  });

  test('seed source marks direct SQL bypasses as LOCAL VISUAL PREVIEW ONLY', () => {
    expect(src).toMatch(/LOCAL VISUAL PREVIEW ONLY/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 2: Verification through real service path
// ─────────────────────────────────────────────────────────────────────────────

describe('preview seed — verification through real service (Mode B)', () => {
  let principal, agent, instrument, kase, assignment;

  beforeAll(async () => {
    principal = await authorityService.createParty(acctId, ownerId, {
      partyType:    'person',
      displayName:  '__TEST__ Seed Principal',
      externalReference: 'TEST-SEED-PRINCIPAL',
    });
    agent = await authorityService.createParty(acctId, ownerId, {
      partyType:    'person',
      displayName:  '__TEST__ Seed Agent',
      externalReference: 'TEST-SEED-AGENT',
    });

    instrument = await authorityService.createInstrument(acctId, ownerId, {
      instrumentType: 'durable_power_of_attorney',
      effectiveDate:  '2024-01-01',
      expirationDate: '2027-01-01',
      jurisdiction:   'CA',
    });

    kase = await authorityService.createCase(acctId, ownerId, {
      externalCaseReference: 'TEST-SEED-CASE-VERIFY',
    });
    await authorityService.linkInstrumentToCase(acctId, ownerId, kase.id, instrument.id);
    await authorityService.transitionCase(acctId, ownerId, kase.id, 'AWAITING_DOCUMENTS');

    // Add participants while case is at AWAITING_DOCUMENTS (no assignment guard)
    const p1 = await authorityService.addParticipant(acctId, ownerId, instrument.id, {
      partyId: principal.id, role: 'principal', sequence: 1,
    });
    const p2 = await authorityService.addParticipant(acctId, ownerId, instrument.id, {
      partyId: agent.id, role: 'agent', sequence: 1,
    });
    await authorityService.addPermission(acctId, ownerId, instrument.id, {
      actionKey: 'BANKING.WIRE_TRANSFER', grantType: 'granted', participantId: p2.id,
    });
    await authorityService.addRestriction(acctId, ownerId, instrument.id, {
      restrictionType: 'monetary_limit',
      parameters:      { amount: 50000000, currency: 'USD' },
      participantId:   p2.id,
    });

    await authorityService.transitionInstrument(acctId, ownerId, instrument.id, 'PENDING_REVIEW', {
      actorType: 'human',
    });

    // Direct SQL bypass — same as the seed uses (LOCAL VISUAL PREVIEW ONLY)
    await pool.query(
      `UPDATE authority_cases
       SET status = 'PENDING_HUMAN_REVIEW', status_changed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [kase.id]
    );

    // Reviewer claims case → HUMAN_REVIEW_IN_PROGRESS
    assignment = await authorityService.claimCase(acctId, reviewerId, kase.id);
  });

  test('transitionInstrument VERIFIED produces verified_by_user_id', async () => {
    const result = await authorityService.transitionInstrument(
      acctId, reviewerId, instrument.id, 'VERIFIED', { actorType: 'human' }
    );
    expect(result.status).toBe('VERIFIED');

    const { rows: [row] } = await pool.query(
      `SELECT verified_by_user_id, verified_at, verification_actor_type,
              verification_authorization_context
       FROM authority_instruments WHERE id = $1`,
      [instrument.id]
    );
    expect(row.verified_by_user_id).toBe(reviewerId);
    expect(row.verified_at).toBeTruthy();
    expect(row.verification_actor_type).toBe('human');
    expect(row.verification_authorization_context).toBe('institution_reviewer');
  });

  test('verification emits authority.instrument.verified audit event', async () => {
    const { rows } = await pool.query(
      `SELECT action, user_id FROM audit_logs
       WHERE account_id = $1 AND action = 'authority.instrument.verified'
         AND entity_id = $2`,
      [acctId, instrument.id]
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].user_id).toBe(reviewerId);
  });

  test('VERIFIED instrument cannot be re-verified (idempotency — only PENDING_REVIEW → VERIFIED)', async () => {
    await expect(
      authorityService.transitionInstrument(
        acctId, reviewerId, instrument.id, 'VERIFIED', { actorType: 'human' }
      )
    ).rejects.toThrow(/Cannot transition instrument from VERIFIED to VERIFIED/);
  });

  test('VERIFIED instrument is returned by listInstruments with status=VERIFIED filter', async () => {
    const rows = await authorityService.listInstruments(acctId, { status: 'VERIFIED' });
    const ids = rows.map(r => r.id);
    expect(ids).toContain(instrument.id);
  });

  test('PENDING_REVIEW instrument is NOT returned by listInstruments with status=VERIFIED filter', async () => {
    // Create a separate instrument that stays in PENDING_REVIEW
    const instrPending = await authorityService.createInstrument(acctId, ownerId, {
      instrumentType: 'trust',
      effectiveDate:  '2024-01-01',
      expirationDate: '2027-01-01',
      jurisdiction:   'NY',
    });
    await authorityService.transitionInstrument(acctId, ownerId, instrPending.id, 'PENDING_REVIEW', {
      actorType: 'human',
    });

    const rows = await authorityService.listInstruments(acctId, { status: 'VERIFIED' });
    const ids = rows.map(r => r.id);
    expect(ids).not.toContain(instrPending.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 3: No fake document rows from the direct SQL bypass
// ─────────────────────────────────────────────────────────────────────────────

describe('preview seed — no fake document rows from direct SQL bypass', () => {
  test('cases advanced via direct SQL have zero authority_documents rows', async () => {
    const instr = await authorityService.createInstrument(acctId, ownerId, {
      instrumentType: 'letter_of_authorization',
      effectiveDate:  '2024-01-01',
      expirationDate: '2025-01-01',
      jurisdiction:   'TX',
    });
    const kase = await authorityService.createCase(acctId, ownerId, {
      externalCaseReference: 'TEST-SEED-NODOC',
    });
    await authorityService.linkInstrumentToCase(acctId, ownerId, kase.id, instr.id);
    await authorityService.transitionCase(acctId, ownerId, kase.id, 'AWAITING_DOCUMENTS');

    // Direct SQL bypass — same pattern as the preview seed
    await pool.query(
      `UPDATE authority_cases
       SET status = 'PENDING_HUMAN_REVIEW', status_changed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [kase.id]
    );

    const { rows: [cnt] } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM authority_documents WHERE case_id = $1`,
      [kase.id]
    );
    expect(parseInt(cnt.cnt, 10)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 4: Reviewer capability isolation
// ─────────────────────────────────────────────────────────────────────────────

describe('preview seed — reviewer capability isolation', () => {
  test('reviewer has AUTHORITY_INSTRUMENT_VERIFY capability', async () => {
    const { rows } = await pool.query(
      `SELECT capability FROM platform_user_capabilities WHERE user_id = $1`,
      [reviewerId]
    );
    const caps = rows.map(r => r.capability);
    expect(caps).toContain('AUTHORITY_INSTRUMENT_VERIFY');
  });

  test('reviewer has AUTHORITY_INSTRUMENT_REJECT capability', async () => {
    const { rows } = await pool.query(
      `SELECT capability FROM platform_user_capabilities WHERE user_id = $1`,
      [reviewerId]
    );
    const caps = rows.map(r => r.capability);
    expect(caps).toContain('AUTHORITY_INSTRUMENT_REJECT');
  });

  test('reviewer does NOT have AUTHORITY_EVALUATE capability', async () => {
    const { rows } = await pool.query(
      `SELECT capability FROM platform_user_capabilities WHERE user_id = $1`,
      [reviewerId]
    );
    const caps = rows.map(r => r.capability);
    expect(caps).not.toContain('AUTHORITY_EVALUATE');
  });

  test('owner has AUTHORITY_EVALUATE capability', async () => {
    const { rows } = await pool.query(
      `SELECT capability FROM platform_user_capabilities WHERE user_id = $1`,
      [ownerId]
    );
    const caps = rows.map(r => r.capability);
    expect(caps).toContain('AUTHORITY_EVALUATE');
  });
});
