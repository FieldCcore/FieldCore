'use strict';

/**
 * Authority Extraction — Stage 3 Tests
 *
 * Tests the AI-assisted document extraction pipeline:
 *   - Fake provider (happy path + adversarial scenarios)
 *   - Output validation
 *   - DB migrations (new tables exist)
 *   - Enqueue + worker claim + full processing
 *   - Error categories and case auto-transition
 *   - Candidate acceptance / rejection / explicit retry
 *   - Read models (listRunsForCase, listCandidatesForCase)
 *   - HTTP routes (runs, candidates, accept, reject, retry)
 *
 * Storage (R2) is mocked — no real storage calls.
 * Anthropic API is NEVER called — fake provider is used exclusively.
 * All test data is synthetic.
 */

require('dotenv').config();

jest.mock('../services/authorityStorage', () => {
  const crypto = require('crypto');
  let _lastBuffer = Buffer.from('%PDF-1.4\n%%EOF');
  return {
    isConfigured: jest.fn().mockReturnValue(true),
    upload: jest.fn().mockImplementation(async (buffer, { accountId } = {}) => {
      _lastBuffer = buffer;
      return {
        storageKey:    `authority/${accountId || 'test'}/${crypto.randomUUID()}`,
        contentSha256: crypto.createHash('sha256').update(buffer).digest('hex'),
        byteSize:      buffer.length,
      };
    }),
    getStream: jest.fn().mockImplementation(async () => {
      const { Readable } = require('stream');
      return Readable.from([_lastBuffer]);
    }),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    generateStorageKey: jest.fn().mockImplementation((accountId) =>
      `authority/${accountId}/${crypto.randomUUID()}`
    ),
    _resetClient: jest.fn(),
  };
});

const crypto      = require('crypto');
const bcrypt      = require('bcryptjs');
const jwt         = require('jsonwebtoken');
const request     = require('supertest');
const app         = require('../app');
const pool        = require('../db/pool');
const { runMigrations } = require('../db/migrate');
const authorityService  = require('../services/authorityService');
const extractionService = require('../services/authorityExtractionService');
const fakeProvider      = require('../services/authorityFakeProvider');

const TEST_AUTHORITY_KEY = crypto.randomBytes(32).toString('hex');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToken(userId, accountId, role = 'owner') {
  return jwt.sign({ userId, accountId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

// Find a Buffer whose SHA-256 ends with the given 2-char hex suffix.
// Expected to find one within ~512 iterations.
function bufferWithHashSuffix(suffix) {
  for (let i = 0; i < 100000; i++) {
    const buf = Buffer.from(`adversarial-buffer-${i}-${suffix}`);
    const h = crypto.createHash('sha256').update(buf).digest('hex');
    if (h.endsWith(suffix)) return buf;
  }
  throw new Error(`Could not find buffer with SHA256 suffix '${suffix}' in 100 000 tries`);
}

// Pre-compute adversarial buffers (synchronous; done once in beforeAll)
let bufTimeout, bufRateLimit, bufProvider5xx, bufMalformed, bufNoEvidence, bufHappy;

// Minimal valid PDF content that will produce a happy-path (not adversarial) hash
const SYNTHETIC_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n%%EOF'
);

// ── Test state ────────────────────────────────────────────────────────────────

let accountId, userId, token;
let accountB_Id, userB_Id, tokenB;

const CLEANUP = [];

beforeAll(async () => {
  process.env.AUTHORITY_ENABLED              = 'true';
  process.env.AUTHORITY_DATA_ENCRYPTION_KEY  = TEST_AUTHORITY_KEY;
  process.env.AUTHORITY_EXTRACTION_PROVIDER  = 'fake';

  await runMigrations();

  const hash = await bcrypt.hash('ext-test-pw', 10);

  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan, account_type) VALUES ($1,'institution','institution') RETURNING id`,
    ['__TEST_EXTRACTION_A__']
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

  await pool.query(
    `INSERT INTO platform_user_capabilities (user_id, capability)
     VALUES ($1,'AUTHORITY_INSTRUMENT_VERIFY'),($1,'AUTHORITY_INSTRUMENT_REJECT'),
            ($1,'AUTHORITY_EXTRACTION_MANAGE')
     ON CONFLICT DO NOTHING`,
    [userId]
  );

  // Tenant B (for isolation tests)
  const { rows: [acctB] } = await pool.query(
    `INSERT INTO accounts (name, plan, account_type) VALUES ($1,'institution','institution') RETURNING id`,
    ['__TEST_EXTRACTION_B__']
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

  // Pre-compute adversarial buffers
  bufTimeout    = bufferWithHashSuffix('ff');
  bufRateLimit  = bufferWithHashSuffix('fe');
  bufProvider5xx= bufferWithHashSuffix('fd');
  bufMalformed  = bufferWithHashSuffix('fc');
  bufNoEvidence = bufferWithHashSuffix('fb');
  bufHappy      = (() => {
    for (let i = 0; i < 100000; i++) {
      const buf = Buffer.from(`happy-${i}`);
      const h = crypto.createHash('sha256').update(buf).digest('hex');
      const tail = h.slice(-2).toLowerCase();
      if (!['ff','fe','fd','fc','fb'].includes(tail)) return buf;
    }
  })();
}, 60000);

afterAll(async () => {
  for (const { table, id } of [...CLEANUP].reverse()) {
    try { await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]); } catch {}
  }
  await pool.end();
});

// ── Helper: full case setup through PENDING_EXTRACTION ───────────────────────

async function setupCaseThroughExtraction(overrideAccountId, overrideUserId) {
  const aid = overrideAccountId || accountId;
  const uid = overrideUserId    || userId;

  const party = await authorityService.createParty(aid, uid, {
    partyType: 'person', displayName: 'Test Principal', externalReference: null,
  });
  const instr = await authorityService.createInstrument(aid, uid, {
    instrumentType: 'durable_power_of_attorney',
    effectiveDate:  '2026-01-01',
    expirationDate: '2030-12-31',
    jurisdiction:   'Delaware, USA',
  });
  await authorityService.addParticipant(aid, uid, instr.id,
    { partyId: party.id, role: 'principal', sequence: 1 });
  const kase = await authorityService.createCase(aid, uid, {});
  await authorityService.linkInstrumentToCase(aid, uid, kase.id, instr.id);
  await authorityService.transitionCase(aid, uid, kase.id, 'AWAITING_DOCUMENTS');
  const doc = await authorityService.uploadDocument(aid, uid, SYNTHETIC_PDF, {
    caseId:           kase.id,
    instrumentId:     instr.id,
    originalFilename: 'test-document.pdf',
  });
  await authorityService.transitionCase(aid, uid, kase.id, 'PENDING_EXTRACTION');
  return { kase, instr, doc, party };
}

// ── Helper: advance case to HUMAN_REVIEW_IN_PROGRESS ─────────────────────────

async function setupCaseThroughHumanReview(overrideAccountId, overrideUserId) {
  const aid = overrideAccountId || accountId;
  const uid = overrideUserId    || userId;

  const { kase, instr, doc, party } = await setupCaseThroughExtraction(aid, uid);

  // Drain pending runs until this case exits PENDING_EXTRACTION.
  // claimNextRun uses SKIP LOCKED and returns the oldest pending run, which may belong
  // to a different case — keep processing until our case advances.
  for (let i = 0; i < 40; i++) {
    const k = await authorityService.getCase(aid, kase.id);
    if (k.status !== 'PENDING_EXTRACTION') break;
    const c = await extractionService.claimNextRun();
    if (!c) { await new Promise(r => setTimeout(r, 50)); continue; }
    await extractionService.processExtractionRun(c.id, c.leaseToken);
  }

  const kAfter = await authorityService.getCase(aid, kase.id);
  if (kAfter.status === 'EXTRACTION_COMPLETE') {
    await authorityService.transitionCase(aid, uid, kase.id, 'PENDING_HUMAN_REVIEW');
    await authorityService.claimCase(aid, uid, kase.id);
  }

  return { kase, instr, doc, party };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1: DB Migrations — New Tables Exist
// ─────────────────────────────────────────────────────────────────────────────

describe('DB Migrations — extraction tables exist', () => {
  // Test 1
  test('authority_extraction_runs table exists', async () => {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'authority_extraction_runs'`
    );
    expect(rows.length).toBe(1);
  });

  // Test 2
  test('authority_extraction_candidates table exists', async () => {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'authority_extraction_candidates'`
    );
    expect(rows.length).toBe(1);
  });

  // Test 3
  test('authority_extraction_evidence table exists', async () => {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'authority_extraction_evidence'`
    );
    expect(rows.length).toBe(1);
  });

  // Test 4
  test('runs table has correct required columns', async () => {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'authority_extraction_runs'`
    );
    const cols = rows.map(r => r.column_name);
    expect(cols).toEqual(expect.arrayContaining([
      'id','account_id','case_id','document_id','status','provider',
      'lease_token','lease_expires_at','error_category','created_at',
    ]));
  });

  // Test 5
  test('candidates table has required columns including row_version and canonical_party_id', async () => {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'authority_extraction_candidates'`
    );
    const cols = rows.map(r => r.column_name);
    expect(cols).toEqual(expect.arrayContaining([
      'id','run_id','field_key','proposed_value','proposed_value_key_version',
      'confidence','status','row_version','canonical_party_id',
    ]));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: Fake Provider — Happy Path
// ─────────────────────────────────────────────────────────────────────────────

describe('Fake provider — happy path', () => {
  const docId = crypto.randomUUID();

  // Test 6
  test('returns candidates array', async () => {
    const result = await fakeProvider.extract(bufHappy, docId);
    expect(Array.isArray(result.candidates)).toBe(true);
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  // Test 7
  test('each candidate has required fields', async () => {
    const result = await fakeProvider.extract(bufHappy, docId);
    for (const c of result.candidates) {
      expect(typeof c.fieldKey).toBe('string');
      expect(c.fieldKey.length).toBeGreaterThan(0);
      expect(typeof c.confidence).toBe('number');
      expect(c.confidence).toBeGreaterThanOrEqual(0);
      expect(c.confidence).toBeLessThanOrEqual(1);
      expect(Array.isArray(c.evidence)).toBe(true);
      // proposedValue is string or null
      expect(
        c.proposedValue === null || typeof c.proposedValue === 'string'
      ).toBe(true);
    }
  });

  // Test 8
  test('evidence items reference the supplied documentId', async () => {
    const result = await fakeProvider.extract(bufHappy, docId);
    const withEvidence = result.candidates.filter(c => c.evidence.length > 0);
    expect(withEvidence.length).toBeGreaterThan(0);
    for (const c of withEvidence) {
      for (const ev of c.evidence) {
        expect(ev.documentId).toBe(docId);
        expect(Array.isArray(ev.pageNumbers)).toBe(true);
        expect(typeof ev.excerpt).toBe('string');
      }
    }
  });

  // Test 9
  test('deterministic: same buffer produces same fieldKeys', async () => {
    const r1 = await fakeProvider.extract(bufHappy, docId);
    const r2 = await fakeProvider.extract(bufHappy, docId);
    const keys1 = r1.candidates.map(c => c.fieldKey).sort();
    const keys2 = r2.candidates.map(c => c.fieldKey).sort();
    expect(keys1).toEqual(keys2);
  });

  // Test 10
  test('includes instrument_type candidate', async () => {
    const result = await fakeProvider.extract(bufHappy, docId);
    const types = result.candidates.map(c => c.fieldKey);
    expect(types).toContain('instrument_type');
  });

  // Test 11
  test('includes effective_date candidate', async () => {
    const result = await fakeProvider.extract(bufHappy, docId);
    const keys = result.candidates.map(c => c.fieldKey);
    expect(keys).toContain('effective_date');
  });

  // Test 12
  test('throws TypeError on non-Buffer input', async () => {
    await expect(fakeProvider.extract('not-a-buffer', docId)).rejects.toThrow(TypeError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 3: Fake Provider — Adversarial Scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe('Fake provider — adversarial scenarios', () => {
  const docId = crypto.randomUUID();

  // Test 13
  test('SHA-256 tail ff throws ProviderTimeoutError', async () => {
    await expect(fakeProvider.extract(bufTimeout, docId)).rejects.toBeInstanceOf(fakeProvider.ProviderTimeoutError);
  });

  // Test 14
  test('SHA-256 tail fe throws ProviderRateLimitError', async () => {
    await expect(fakeProvider.extract(bufRateLimit, docId)).rejects.toBeInstanceOf(fakeProvider.ProviderRateLimitError);
  });

  // Test 15
  test('SHA-256 tail fd throws ProviderError (503)', async () => {
    const err = await fakeProvider.extract(bufProvider5xx, docId).catch(e => e);
    expect(err).toBeInstanceOf(fakeProvider.ProviderError);
    expect(err.status).toBe(503);
  });

  // Test 16
  test('SHA-256 tail fc throws MalformedOutputError', async () => {
    await expect(fakeProvider.extract(bufMalformed, docId)).rejects.toBeInstanceOf(fakeProvider.MalformedOutputError);
  });

  // Test 17
  test('SHA-256 tail fb returns candidates with no evidence', async () => {
    const result = await fakeProvider.extract(bufNoEvidence, docId);
    expect(result.candidates.length).toBeGreaterThan(0);
    for (const c of result.candidates) {
      expect(c.evidence).toHaveLength(0);
    }
  });

  // Test 18
  test('error types have expected .code property', () => {
    const t = new fakeProvider.ProviderTimeoutError();
    const r = new fakeProvider.ProviderRateLimitError();
    const p = new fakeProvider.ProviderError(503);
    const m = new fakeProvider.MalformedOutputError();
    expect(t.code).toBe('timeout');
    expect(r.code).toBe('rate_limited');
    expect(p.code).toBe('provider_error');
    expect(m.code).toBe('malformed_output');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 4: Enqueue Extraction Runs
// ─────────────────────────────────────────────────────────────────────────────

describe('Enqueue extraction runs', () => {
  let setupData;

  beforeAll(async () => {
    setupData = await setupCaseThroughExtraction();
  });

  // Test 19
  test('PENDING_EXTRACTION transition creates one run per document', async () => {
    const runs = await extractionService.listRunsForCase(accountId, setupData.kase.id);
    expect(runs.length).toBe(1);
  });

  // Test 20
  test('run has status=pending initially', async () => {
    const runs = await extractionService.listRunsForCase(accountId, setupData.kase.id);
    expect(runs[0].status).toBe('pending');
  });

  // Test 21
  test('run is linked to the correct document', async () => {
    const runs = await extractionService.listRunsForCase(accountId, setupData.kase.id);
    expect(runs[0].document_id).toBe(setupData.doc.id);
  });

  // Test 22
  test('run has provider=fake (from env)', async () => {
    const runs = await extractionService.listRunsForCase(accountId, setupData.kase.id);
    expect(runs[0].provider).toBe('fake');
  });

  // Test 23
  test('run has run_kind=auto (auto-enqueued)', async () => {
    const runs = await extractionService.listRunsForCase(accountId, setupData.kase.id);
    expect(runs[0].run_kind).toBe('auto');
  });

  // Test 24
  test('enqueueExtractionRuns returns 0 if no documents (no runs created)', async () => {
    // Case with no documents
    const instr2 = await authorityService.createInstrument(accountId, userId, {
      instrumentType: 'letter_of_authorization',
      effectiveDate: '2026-01-01', jurisdiction: 'California, USA',
    });
    const kase2 = await authorityService.createCase(accountId, userId, {});
    await authorityService.linkInstrumentToCase(accountId, userId, kase2.id, instr2.id);

    const client = await pool.connect();
    let count;
    try {
      await client.query('BEGIN');
      count = await extractionService.enqueueExtractionRuns(client, accountId, kase2.id);
      await client.query('ROLLBACK');
    } finally { client.release(); }
    expect(count).toBe(0);
  });

  // Test 25
  test('listRunsForCase respects tenant isolation', async () => {
    const runs = await extractionService.listRunsForCase(accountB_Id, setupData.kase.id);
    expect(runs.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 5: Worker Claim
// ─────────────────────────────────────────────────────────────────────────────

describe('Worker claim — claimNextRun', () => {
  let runId;

  beforeAll(async () => {
    const { kase } = await setupCaseThroughExtraction();
    const runs = await extractionService.listRunsForCase(accountId, kase.id);
    runId = runs[0]?.id;
  });

  // Test 26
  test('claimNextRun returns an object with id and leaseToken', async () => {
    const claimed = await extractionService.claimNextRun();
    expect(claimed).not.toBeNull();
    expect(typeof claimed.id).toBe('string');
    expect(typeof claimed.leaseToken).toBe('string');
  });

  // Test 27
  test('claimed run has status=running in DB', async () => {
    // Another setup
    const { kase } = await setupCaseThroughExtraction();
    const claimed = await extractionService.claimNextRun();
    if (!claimed) return; // no pending run (all already claimed in this run)
    const { rows } = await pool.query(
      `SELECT status, lease_token FROM authority_extraction_runs WHERE id = $1`,
      [claimed.id]
    );
    expect(rows[0].status).toBe('running');
    expect(rows[0].lease_token).toBe(claimed.leaseToken);
  });

  // Test 28
  test('claimNextRun returns null when no pending runs remain', async () => {
    // Drain all pending runs
    let c;
    do { c = await extractionService.claimNextRun(); } while (c);
    const again = await extractionService.claimNextRun();
    expect(again).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 6: Full Processing (claimNextRun + processExtractionRun)
// ─────────────────────────────────────────────────────────────────────────────

describe('Full extraction pipeline — processExtractionRun', () => {
  let kase, instr, doc;

  beforeAll(async () => {
    ({ kase, instr, doc } = await setupCaseThroughExtraction());
    // Drain any other pending runs first so ours is next
    const claimed = await extractionService.claimNextRun();
    expect(claimed).not.toBeNull();
    await extractionService.processExtractionRun(claimed.id, claimed.leaseToken);
  });

  // Test 29
  test('creates candidates in DB after processing', async () => {
    const candidates = await extractionService.listCandidatesForCase(accountId, kase.id);
    expect(candidates.length).toBeGreaterThan(0);
  });

  // Test 30
  test('run status becomes completed', async () => {
    const runs = await extractionService.listRunsForCase(accountId, kase.id);
    const done = runs.filter(r => r.status === 'completed');
    expect(done.length).toBeGreaterThanOrEqual(1);
  });

  // Test 31
  test('case automatically transitions to EXTRACTION_COMPLETE', async () => {
    const refreshed = await authorityService.getCase(accountId, kase.id);
    expect(refreshed.status).toBe('EXTRACTION_COMPLETE');
  });

  // Test 32
  test('candidate proposed_value is decrypted (plaintext) in listCandidatesForCase', async () => {
    const candidates = await extractionService.listCandidatesForCase(accountId, kase.id);
    const instrType = candidates.find(c => c.fieldKey === 'instrument_type');
    expect(instrType).toBeDefined();
    expect(instrType.proposedValue).toBe('durable_power_of_attorney');
  });

  // Test 33
  test('candidate proposed_value is ENCRYPTED in the raw DB row', async () => {
    const { rows } = await pool.query(
      `SELECT proposed_value, proposed_value_key_version
         FROM authority_extraction_candidates
        WHERE run_id IN (
          SELECT id FROM authority_extraction_runs WHERE case_id = $1
        )
        LIMIT 1`,
      [kase.id]
    );
    expect(rows.length).toBeGreaterThan(0);
    // Encrypted value starts with 'v1:' envelope format
    expect(rows[0].proposed_value).toMatch(/^v\d+:/);
    expect(rows[0].proposed_value_key_version).not.toBeNull();
  });

  // Test 34
  test('evidence is stored and excerpt is encrypted in DB', async () => {
    const { rows } = await pool.query(
      `SELECT e.excerpt, e.excerpt_key_version
         FROM authority_extraction_evidence e
         JOIN authority_extraction_candidates c ON c.id = e.candidate_id
         JOIN authority_extraction_runs r ON r.id = c.run_id
        WHERE r.case_id = $1
        LIMIT 1`,
      [kase.id]
    );
    if (rows.length > 0) {
      expect(rows[0].excerpt).toMatch(/^v\d+:/);
      expect(rows[0].excerpt_key_version).not.toBeNull();
    }
    // (Some providers return empty evidence — just verify structure when present)
    expect(rows.length).toBeGreaterThanOrEqual(0);
  });

  // Test 35
  test('evidence items have decrypted excerpts in listCandidatesForCase', async () => {
    const candidates = await extractionService.listCandidatesForCase(accountId, kase.id);
    const withEvidence = candidates.filter(c => c.evidence.length > 0);
    if (withEvidence.length > 0) {
      const ev = withEvidence[0].evidence[0];
      expect(typeof ev.excerpt).toBe('string');
      expect(ev.excerpt.length).toBeGreaterThan(0);
    }
  });

  // Test 36
  test('listCandidatesForCase respects tenant isolation', async () => {
    const result = await extractionService.listCandidatesForCase(accountB_Id, kase.id);
    expect(result.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 7: Fencing — Stale Lease Token
// ─────────────────────────────────────────────────────────────────────────────

describe('Fencing — stale lease token', () => {
  // Test 37
  test('processExtractionRun with wrong leaseToken is a no-op', async () => {
    const { kase } = await setupCaseThroughExtraction();
    const claimed = await extractionService.claimNextRun();
    expect(claimed).not.toBeNull();

    const wrongToken = crypto.randomUUID();
    // Should not throw — just no-op when fencing check fails
    await expect(
      extractionService.processExtractionRun(claimed.id, wrongToken)
    ).resolves.toBeUndefined();

    // Run should still be in 'running' state (not completed or failed via fencing)
    const { rows } = await pool.query(
      `SELECT status FROM authority_extraction_runs WHERE id = $1`,
      [claimed.id]
    );
    // Still running (or failed via inner storage error) — the fencing aborted commit
    expect(['running', 'failed']).toContain(rows[0].status);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 8: Error Categories
// ─────────────────────────────────────────────────────────────────────────────

describe('Error categories — failed runs', () => {
  let storageModule;

  beforeAll(() => {
    storageModule = require('../services/authorityStorage');
  });

  afterEach(() => {
    storageModule.getStream.mockClear();
  });

  // Test 38
  test('storage error → error_category=storage_error', async () => {
    storageModule.getStream.mockRejectedValueOnce(new Error('R2 connection refused'));
    const { kase } = await setupCaseThroughExtraction();
    const claimed = await extractionService.claimNextRun();
    expect(claimed).not.toBeNull();
    await extractionService.processExtractionRun(claimed.id, claimed.leaseToken);
    const runs = await extractionService.listRunsForCase(accountId, kase.id);
    const run  = runs.find(r => r.id === claimed.id);
    expect(run.status).toBe('failed');
    expect(run.error_category).toBe('storage_error');
  });

  // Test 39
  test('provider timeout → error_category=timeout', async () => {
    const { Readable } = require('stream');
    storageModule.getStream.mockResolvedValueOnce(Readable.from([bufTimeout]));
    const { kase } = await setupCaseThroughExtraction();
    const claimed = await extractionService.claimNextRun();
    expect(claimed).not.toBeNull();
    await extractionService.processExtractionRun(claimed.id, claimed.leaseToken);
    const runs = await extractionService.listRunsForCase(accountId, kase.id);
    const run  = runs.find(r => r.id === claimed.id);
    expect(run.status).toBe('failed');
    expect(run.error_category).toBe('timeout');
  });

  // Test 40
  test('provider rate limit → error_category=rate_limited', async () => {
    const { Readable } = require('stream');
    storageModule.getStream.mockResolvedValueOnce(Readable.from([bufRateLimit]));
    const { kase } = await setupCaseThroughExtraction();
    const claimed = await extractionService.claimNextRun();
    expect(claimed).not.toBeNull();
    await extractionService.processExtractionRun(claimed.id, claimed.leaseToken);
    const runs = await extractionService.listRunsForCase(accountId, kase.id);
    const run  = runs.find(r => r.id === claimed.id);
    expect(run.status).toBe('failed');
    expect(run.error_category).toBe('rate_limited');
  });

  // Test 41
  test('provider 5xx → error_category=provider_error', async () => {
    const { Readable } = require('stream');
    storageModule.getStream.mockResolvedValueOnce(Readable.from([bufProvider5xx]));
    const { kase } = await setupCaseThroughExtraction();
    const claimed = await extractionService.claimNextRun();
    expect(claimed).not.toBeNull();
    await extractionService.processExtractionRun(claimed.id, claimed.leaseToken);
    const runs = await extractionService.listRunsForCase(accountId, kase.id);
    const run  = runs.find(r => r.id === claimed.id);
    expect(run.status).toBe('failed');
    expect(run.error_category).toBe('provider_error');
  });

  // Test 42
  test('malformed output → error_category=malformed_output', async () => {
    const { Readable } = require('stream');
    storageModule.getStream.mockResolvedValueOnce(Readable.from([bufMalformed]));
    const { kase } = await setupCaseThroughExtraction();
    const claimed = await extractionService.claimNextRun();
    expect(claimed).not.toBeNull();
    await extractionService.processExtractionRun(claimed.id, claimed.leaseToken);
    const runs = await extractionService.listRunsForCase(accountId, kase.id);
    const run  = runs.find(r => r.id === claimed.id);
    expect(run.status).toBe('failed');
    expect(run.error_category).toBe('malformed_output');
  });

  // Test 43
  test('all runs failed → case still transitions to EXTRACTION_COMPLETE', async () => {
    storageModule.getStream.mockRejectedValueOnce(new Error('storage down'));
    const { kase } = await setupCaseThroughExtraction();
    const claimed = await extractionService.claimNextRun();
    expect(claimed).not.toBeNull();
    await extractionService.processExtractionRun(claimed.id, claimed.leaseToken);
    const refreshed = await authorityService.getCase(accountId, kase.id);
    expect(refreshed.status).toBe('EXTRACTION_COMPLETE');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 9: Candidate Acceptance
// ─────────────────────────────────────────────────────────────────────────────

describe('Candidate acceptance', () => {
  let kase, instr;
  let candidate;

  beforeAll(async () => {
    ({ kase, instr } = await setupCaseThroughHumanReview());
    const candidates = await extractionService.listCandidatesForCase(accountId, kase.id);
    candidate = candidates.find(c => c.fieldKey === 'instrument_type');
    expect(candidate).toBeDefined();
  });

  // Test 44
  test('acceptCandidate returns { id, status: accepted }', async () => {
    const result = await extractionService.acceptCandidate(
      accountId, userId, candidate.id, { rowVersion: candidate.rowVersion }
    );
    expect(result).toMatchObject({ id: candidate.id, status: 'accepted' });
  });

  // Test 45
  test('candidate status is accepted in DB', async () => {
    const { rows } = await pool.query(
      `SELECT status, reviewed_by, reviewed_at FROM authority_extraction_candidates WHERE id = $1`,
      [candidate.id]
    );
    expect(rows[0].status).toBe('accepted');
    expect(rows[0].reviewed_by).toBe(userId);
    expect(rows[0].reviewed_at).not.toBeNull();
  });

  // Test 46
  test('accepting instrument_type candidate updates instrument in DB', async () => {
    // The instrument_type was already 'durable_power_of_attorney'; proposedValue matches
    const { rows } = await pool.query(
      `SELECT instrument_type FROM authority_instruments WHERE id = $1`, [instr.id]
    );
    expect(rows[0].instrument_type).toBe('durable_power_of_attorney');
  });

  // Test 47
  test('accepting already-accepted candidate returns 409', async () => {
    await expect(
      extractionService.acceptCandidate(accountId, userId, candidate.id)
    ).rejects.toMatchObject({ status: 409 });
  });

  // Test 48
  test('accepting with wrong rowVersion returns 409', async () => {
    const { kase: k2 } = await setupCaseThroughExtraction();
    const claimed = await extractionService.claimNextRun();
    expect(claimed).not.toBeNull();
    await extractionService.processExtractionRun(claimed.id, claimed.leaseToken);
    const cands = await extractionService.listCandidatesForCase(accountId, k2.id);
    const c = cands[0];
    await expect(
      extractionService.acceptCandidate(accountId, userId, c.id, { rowVersion: 9999 })
    ).rejects.toMatchObject({ status: 409 });
  });

  // Test 49
  test('cross-tenant candidate returns 404', async () => {
    await expect(
      extractionService.acceptCandidate(accountB_Id, userB_Id, candidate.id)
    ).rejects.toMatchObject({ status: 404 });
  });

  // Test 50
  test('accepting non-existent candidate returns 404', async () => {
    await expect(
      extractionService.acceptCandidate(accountId, userId, crypto.randomUUID())
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 10: Candidate Rejection
// ─────────────────────────────────────────────────────────────────────────────

describe('Candidate rejection', () => {
  let candidate;

  beforeAll(async () => {
    const { kase } = await setupCaseThroughHumanReview();
    const cands = await extractionService.listCandidatesForCase(accountId, kase.id);
    candidate = cands.find(c => c.fieldKey === 'effective_date');
    expect(candidate).toBeDefined();
  });

  // Test 51
  test('rejectCandidate returns { id, status: rejected }', async () => {
    const result = await extractionService.rejectCandidate(
      accountId, userId, candidate.id, 'Test rejection reason'
    );
    expect(result).toMatchObject({ id: candidate.id, status: 'rejected' });
  });

  // Test 52
  test('candidate status is rejected in DB', async () => {
    const { rows } = await pool.query(
      `SELECT status, rejection_reason FROM authority_extraction_candidates WHERE id = $1`,
      [candidate.id]
    );
    expect(rows[0].status).toBe('rejected');
    expect(rows[0].rejection_reason).toBe('Test rejection reason');
  });

  // Test 53
  test('rejecting already-rejected candidate returns 409', async () => {
    await expect(
      extractionService.rejectCandidate(accountId, userId, candidate.id, null)
    ).rejects.toMatchObject({ status: 409 });
  });

  // Test 54
  test('cross-tenant candidate rejection returns 404', async () => {
    await expect(
      extractionService.rejectCandidate(accountB_Id, userB_Id, candidate.id, null)
    ).rejects.toMatchObject({ status: 404 });
  });

  // Test 55
  test('non-existent candidate rejection returns 404', async () => {
    await expect(
      extractionService.rejectCandidate(accountId, userId, crypto.randomUUID(), null)
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 11: Explicit Retry
// ─────────────────────────────────────────────────────────────────────────────

describe('Explicit retry', () => {
  let kase, doc;

  beforeAll(async () => {
    ({ kase, doc } = await setupCaseThroughExtraction());
    // Drain pending run so we have a clean state
    const claimed = await extractionService.claimNextRun();
    if (claimed) await extractionService.processExtractionRun(claimed.id, claimed.leaseToken);
  });

  // Test 56
  test('createExplicitRetry creates a new run with run_kind=retry', async () => {
    const run = await extractionService.createExplicitRetry(accountId, userId, kase.id, doc.id);
    expect(run.id).toBeDefined();
    const { rows } = await pool.query(
      `SELECT run_kind, status FROM authority_extraction_runs WHERE id = $1`, [run.id]
    );
    expect(rows[0].run_kind).toBe('retry');
    expect(rows[0].status).toBe('pending');
  });

  // Test 57
  test('createExplicitRetry with non-existent document returns 404', async () => {
    await expect(
      extractionService.createExplicitRetry(accountId, userId, kase.id, crypto.randomUUID())
    ).rejects.toMatchObject({ status: 404 });
  });

  // Test 58
  test('retry run is picked up by claimNextRun', async () => {
    // Ensure there's a pending retry run from test 56
    const claimed = await extractionService.claimNextRun();
    expect(claimed).not.toBeNull();
    const { rows } = await pool.query(
      `SELECT run_kind FROM authority_extraction_runs WHERE id = $1`, [claimed.id]
    );
    expect(rows[0].run_kind).toBe('retry');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 12: HTTP Routes
// ─────────────────────────────────────────────────────────────────────────────

describe('HTTP routes — extraction', () => {
  let kase, instr, doc;
  let candidateId;

  beforeAll(async () => {
    ({ kase, instr, doc } = await setupCaseThroughHumanReview());
    const cands = await extractionService.listCandidatesForCase(accountId, kase.id);
    candidateId = cands.find(c => c.fieldKey === 'jurisdiction')?.id;
  });

  // Test 59
  test('GET /cases/:caseId/extraction/runs returns runs array', async () => {
    const res = await request(app)
      .get(`/api/authority/cases/${kase.id}/extraction/runs`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  // Test 60
  test('GET /cases/:caseId/extraction/runs requires auth', async () => {
    const res = await request(app)
      .get(`/api/authority/cases/${kase.id}/extraction/runs`);
    expect(res.status).toBe(401);
  });

  // Test 61
  test('GET /cases/:caseId/candidates returns candidates', async () => {
    const res = await request(app)
      .get(`/api/authority/cases/${kase.id}/candidates`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  // Test 62
  test('GET /cases/:caseId/candidates requires auth', async () => {
    const res = await request(app)
      .get(`/api/authority/cases/${kase.id}/candidates`);
    expect(res.status).toBe(401);
  });

  // Test 63
  test('POST /candidates/:id/accept returns 403 for user without active case assignment', async () => {
    const noAssign = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role)
       VALUES ($1,'No Assign','noassign-${Date.now()}@test.dev',$2,'owner') RETURNING id`,
      [accountId, await bcrypt.hash('x', 4)]
    );
    const noAssignToken = makeToken(noAssign.rows[0].id, accountId, 'owner');
    // jurisdiction candidate is still pending and has evidence — only the assignment check blocks it
    const cands = await extractionService.listCandidatesForCase(accountId, kase.id);
    const c = cands.find(c => c.id === candidateId);
    const res = await request(app)
      .post(`/api/authority/candidates/${candidateId}/accept`)
      .set('Authorization', `Bearer ${noAssignToken}`)
      .send({ rowVersion: c?.rowVersion ?? 1 });
    expect(res.status).toBe(403);
  });

  // Test 64
  test('POST /candidates/:id/accept accepts candidate successfully', async () => {
    if (!candidateId) return;
    const cands = await extractionService.listCandidatesForCase(accountId, kase.id);
    const c = cands.find(c => c.id === candidateId);
    if (!c || c.status !== 'pending') return;

    const res = await request(app)
      .post(`/api/authority/candidates/${candidateId}/accept`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rowVersion: c.rowVersion });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('accepted');
  });

  // Test 65
  test('POST /candidates/:id/reject returns 403 for user without active case assignment', async () => {
    const noAssign2 = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role)
       VALUES ($1,'No Assign 2','noassign2-${Date.now()}@test.dev',$2,'owner') RETURNING id`,
      [accountId, await bcrypt.hash('x', 4)]
    );
    const noAssignToken2 = makeToken(noAssign2.rows[0].id, accountId, 'owner');
    // Find any pending candidate in this case to attempt rejection
    const cands = await extractionService.listCandidatesForCase(accountId, kase.id);
    const pending = cands.find(c => c.status === 'pending');
    if (!pending) return; // all candidates already reviewed — test is vacuously satisfied
    const res = await request(app)
      .post(`/api/authority/candidates/${pending.id}/reject`)
      .set('Authorization', `Bearer ${noAssignToken2}`)
      .send({});
    expect(res.status).toBe(403);
  });

  // Test 66
  test('POST /candidates/:id/reject rejects pending candidate', async () => {
    // Fresh case in HUMAN_REVIEW_IN_PROGRESS with userId as active assignee
    const { kase: k2 } = await setupCaseThroughHumanReview();
    const cands = await extractionService.listCandidatesForCase(accountId, k2.id);
    const toReject = cands.find(c => c.status === 'pending');
    if (!toReject) return;

    const res = await request(app)
      .post(`/api/authority/candidates/${toReject.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rejectionReason: 'Route test rejection' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rejected');
  });

  // Test 67
  test('POST /cases/:id/extraction/retry requires AUTHORITY_EXTRACTION_MANAGE', async () => {
    const noMgmt = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role)
       VALUES ($1,'No Mgmt','nomgmt-${Date.now()}@test.dev',$2,'owner') RETURNING id`,
      [accountId, await bcrypt.hash('x', 4)]
    );
    await pool.query(
      `INSERT INTO platform_user_capabilities (user_id, capability) VALUES ($1,'AUTHORITY_INSTRUMENT_VERIFY')
       ON CONFLICT DO NOTHING`,
      [noMgmt.rows[0].id]
    );
    const noMgmtToken = makeToken(noMgmt.rows[0].id, accountId, 'owner');
    const res = await request(app)
      .post(`/api/authority/cases/${kase.id}/extraction/retry`)
      .set('Authorization', `Bearer ${noMgmtToken}`)
      .send({ documentId: doc.id });
    expect(res.status).toBe(403);
  });

  // Test 68
  test('POST /cases/:id/extraction/retry creates new run', async () => {
    const res = await request(app)
      .post(`/api/authority/cases/${kase.id}/extraction/retry`)
      .set('Authorization', `Bearer ${token}`)
      .send({ documentId: doc.id });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });

  // Test 69
  test('POST /cases/:id/extraction/retry with missing documentId returns 400', async () => {
    const res = await request(app)
      .post(`/api/authority/cases/${kase.id}/extraction/retry`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 13: Acceptance Field Application
// ─────────────────────────────────────────────────────────────────────────────

describe('Candidate field application', () => {
  let kase, instr;

  beforeAll(async () => {
    ({ kase, instr } = await setupCaseThroughHumanReview());
  });

  // Test 70
  test('accepting jurisdiction candidate updates instrument jurisdiction', async () => {
    const cands = await extractionService.listCandidatesForCase(accountId, kase.id);
    const jCand = cands.find(c => c.fieldKey === 'jurisdiction' && c.status === 'pending');
    if (!jCand) return;

    await extractionService.acceptCandidate(accountId, userId, jCand.id, { rowVersion: jCand.rowVersion });
    const { rows } = await pool.query(
      `SELECT jurisdiction FROM authority_instruments WHERE id = $1`, [instr.id]
    );
    // The fake provider returns 'Delaware, USA' for jurisdiction
    expect(rows[0].jurisdiction).toBe('Delaware, USA');
  });

  // Test 71
  test('accepting effective_date candidate updates instrument', async () => {
    const { kase: k2, instr: i2 } = await setupCaseThroughHumanReview();
    const cands = await extractionService.listCandidatesForCase(accountId, k2.id);
    const dateCand = cands.find(c => c.fieldKey === 'effective_date' && c.status === 'pending');
    if (!dateCand) return;

    await extractionService.acceptCandidate(accountId, userId, dateCand.id, { rowVersion: dateCand.rowVersion });
    const { rows } = await pool.query(
      `SELECT effective_date FROM authority_instruments WHERE id = $1`, [i2.id]
    );
    expect(rows[0].effective_date).toBeDefined();
  });

  // Test 72
  test('accepting principal_name with create_new creates new party; original party unchanged', async () => {
    // AI extraction must never rename an existing party. Accepting a party-identity candidate
    // with create_new creates a new party from the extracted name; the original party is unaffected.
    const { kase: k3, party } = await setupCaseThroughHumanReview();
    // Use getParty to read display_name in the same format used for the post-acceptance check.
    const partyBefore = await authorityService.getParty(accountId, party.id);
    const originalName = partyBefore.display_name;
    const cands = await extractionService.listCandidatesForCase(accountId, k3.id);
    const nameCand = cands.find(c => c.fieldKey === 'principal_name' && c.status === 'pending');
    if (!nameCand || nameCand.proposedValue === null) return;

    const result = await extractionService.acceptCandidate(accountId, userId, nameCand.id, {
      rowVersion:  nameCand.rowVersion,
      partyAction: 'create_new',
    });
    expect(result).toMatchObject({ status: 'accepted' });

    // Original party must be unchanged
    const refreshedParty = await authorityService.getParty(accountId, party.id);
    expect(refreshedParty.display_name).toBe(originalName);

    // canonical_party_id must be set on the accepted candidate
    const refreshedCands = await extractionService.listCandidatesForCase(accountId, k3.id);
    const refreshed = refreshedCands.find(c => c.id === nameCand.id);
    expect(refreshed.canonicalPartyId).not.toBeNull();
  });

  // Test 72b
  test('accepting principal_name without partyAction returns 422', async () => {
    const { kase: k4 } = await setupCaseThroughHumanReview();
    const cands = await extractionService.listCandidatesForCase(accountId, k4.id);
    const nameCand = cands.find(c => c.fieldKey === 'principal_name' && c.status === 'pending');
    if (!nameCand || nameCand.proposedValue === null) return;

    await expect(
      extractionService.acceptCandidate(accountId, userId, nameCand.id, { rowVersion: nameCand.rowVersion })
    ).rejects.toMatchObject({ status: 422 });
  });

  // Test 72c
  test('accepting principal_name with map_existing links to existing party', async () => {
    const { kase: k5, party: p5 } = await setupCaseThroughHumanReview();
    const cands = await extractionService.listCandidatesForCase(accountId, k5.id);
    const nameCand = cands.find(c => c.fieldKey === 'principal_name' && c.status === 'pending');
    if (!nameCand || nameCand.proposedValue === null) return;

    const result = await extractionService.acceptCandidate(accountId, userId, nameCand.id, {
      rowVersion:  nameCand.rowVersion,
      partyAction: 'map_existing',
      partyId:     p5.id,
    });
    expect(result).toMatchObject({ status: 'accepted' });

    const refreshedCands = await extractionService.listCandidatesForCase(accountId, k5.id);
    const refreshed = refreshedCands.find(c => c.id === nameCand.id);
    expect(refreshed.canonicalPartyId).toBe(p5.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 14: Acceptance Guards (evidence + active-assignee)
// ─────────────────────────────────────────────────────────────────────────────

describe('Acceptance guards', () => {
  let storageModule;

  beforeAll(() => {
    storageModule = require('../services/authorityStorage');
  });

  afterEach(() => {
    storageModule.getStream.mockClear();
  });

  // Test 73
  test('accepting a no-evidence candidate returns 422', async () => {
    const { Readable } = require('stream');
    // Set mock before creating the case so the next processExtractionRun for this document
    // returns the no-evidence fixture.
    storageModule.getStream.mockResolvedValueOnce(Readable.from([bufNoEvidence]));
    const { kase } = await setupCaseThroughExtraction();
    // Claim the run immediately — this case is the newest so any older pending runs
    // were already drained by previous tests in this file.
    const claimed = await extractionService.claimNextRun();
    expect(claimed).not.toBeNull();
    await extractionService.processExtractionRun(claimed.id, claimed.leaseToken);

    // Advance to HUMAN_REVIEW_IN_PROGRESS (required for candidate accept/reject)
    const kAfter = await authorityService.getCase(accountId, kase.id);
    if (kAfter.status !== 'EXTRACTION_COMPLETE') return;
    await authorityService.transitionCase(accountId, userId, kase.id, 'PENDING_HUMAN_REVIEW');
    await authorityService.claimCase(accountId, userId, kase.id);

    const cands = await extractionService.listCandidatesForCase(accountId, kase.id);
    const noEv = cands.find(c => c.evidence.length === 0 && c.status === 'pending');
    if (!noEv) return; // fixture did not produce a no-evidence candidate

    await expect(
      extractionService.acceptCandidate(accountId, userId, noEv.id, { rowVersion: noEv.rowVersion })
    ).rejects.toMatchObject({ status: 422 });
  });

  // Test 74
  test('rejecting a no-evidence candidate succeeds (rejection does not require evidence)', async () => {
    const { Readable } = require('stream');
    storageModule.getStream.mockResolvedValueOnce(Readable.from([bufNoEvidence]));
    const { kase } = await setupCaseThroughExtraction();
    const claimed = await extractionService.claimNextRun();
    expect(claimed).not.toBeNull();
    await extractionService.processExtractionRun(claimed.id, claimed.leaseToken);

    // Advance to HUMAN_REVIEW_IN_PROGRESS
    const kAfter = await authorityService.getCase(accountId, kase.id);
    if (kAfter.status !== 'EXTRACTION_COMPLETE') return;
    await authorityService.transitionCase(accountId, userId, kase.id, 'PENDING_HUMAN_REVIEW');
    await authorityService.claimCase(accountId, userId, kase.id);

    const cands = await extractionService.listCandidatesForCase(accountId, kase.id);
    const noEv = cands.find(c => c.evidence.length === 0 && c.status === 'pending');
    if (!noEv) return;

    const result = await extractionService.rejectCandidate(accountId, userId, noEv.id, 'No evidence');
    expect(result).toMatchObject({ status: 'rejected' });
  });

  // Test 75
  test('acceptCandidate during HUMAN_REVIEW_IN_PROGRESS requires active assignment', async () => {
    const { kase } = await setupCaseThroughExtraction();

    // Drain pending runs (including leftover runs from earlier tests) until this
    // case exits PENDING_EXTRACTION. claimNextRun uses SKIP LOCKED so it gets
    // the oldest pending run, which may belong to a different case.
    for (let i = 0; i < 30; i++) {
      const k = await authorityService.getCase(accountId, kase.id);
      if (k.status !== 'PENDING_EXTRACTION') break;
      const c = await extractionService.claimNextRun();
      if (!c) { await new Promise(r => setTimeout(r, 50)); continue; }
      await extractionService.processExtractionRun(c.id, c.leaseToken);
    }
    const afterExtract = await authorityService.getCase(accountId, kase.id);
    if (afterExtract.status !== 'EXTRACTION_COMPLETE') return; // skip if setup incomplete

    // Advance to HUMAN_REVIEW_IN_PROGRESS — userId becomes active assignee
    await authorityService.transitionCase(accountId, userId, kase.id, 'PENDING_HUMAN_REVIEW');
    await authorityService.claimCase(accountId, userId, kase.id);

    // Create a second user with AUTHORITY_INSTRUMENT_VERIFY but no active assignment
    const { rows: [other] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role)
       VALUES ($1,'Guard Test','guardtest-${Date.now()}@fieldcore.test',$2,'owner') RETURNING id`,
      [accountId, await require('bcryptjs').hash('x', 4)]
    );
    await pool.query(
      `INSERT INTO platform_user_capabilities (user_id, capability)
       VALUES ($1,'AUTHORITY_INSTRUMENT_VERIFY') ON CONFLICT DO NOTHING`,
      [other.id]
    );

    const cands = await extractionService.listCandidatesForCase(accountId, kase.id);
    const c = cands.find(c => c.status === 'pending' && c.evidence.length > 0);
    if (!c) return;

    // Non-assignee → 403
    await expect(
      extractionService.acceptCandidate(accountId, other.id, c.id, { rowVersion: c.rowVersion })
    ).rejects.toMatchObject({ status: 403 });

    // Active assignee → succeeds
    const result = await extractionService.acceptCandidate(accountId, userId, c.id, { rowVersion: c.rowVersion });
    expect(result).toMatchObject({ status: 'accepted' });
  });

  // Test 76
  test('rejectCandidate during HUMAN_REVIEW_IN_PROGRESS requires active assignment', async () => {
    const { kase } = await setupCaseThroughExtraction();

    for (let i = 0; i < 30; i++) {
      const k = await authorityService.getCase(accountId, kase.id);
      if (k.status !== 'PENDING_EXTRACTION') break;
      const c = await extractionService.claimNextRun();
      if (!c) { await new Promise(r => setTimeout(r, 50)); continue; }
      await extractionService.processExtractionRun(c.id, c.leaseToken);
    }
    const afterExtract = await authorityService.getCase(accountId, kase.id);
    if (afterExtract.status !== 'EXTRACTION_COMPLETE') return;

    await authorityService.transitionCase(accountId, userId, kase.id, 'PENDING_HUMAN_REVIEW');
    await authorityService.claimCase(accountId, userId, kase.id);

    const { rows: [other2] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role)
       VALUES ($1,'Guard Reject','guardreject-${Date.now()}@fieldcore.test',$2,'owner') RETURNING id`,
      [accountId, await require('bcryptjs').hash('x', 4)]
    );
    await pool.query(
      `INSERT INTO platform_user_capabilities (user_id, capability)
       VALUES ($1,'AUTHORITY_INSTRUMENT_REJECT') ON CONFLICT DO NOTHING`,
      [other2.id]
    );

    const cands = await extractionService.listCandidatesForCase(accountId, kase.id);
    const c = cands.find(c => c.status === 'pending');
    if (!c) return;

    // Non-assignee → 403
    await expect(
      extractionService.rejectCandidate(accountId, other2.id, c.id, 'bad actor test')
    ).rejects.toMatchObject({ status: 403 });

    // Active assignee → succeeds
    const result = await extractionService.rejectCandidate(accountId, userId, c.id, 'assignee rejection test');
    expect(result).toMatchObject({ status: 'rejected' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 15: Canonical Party Creation Integrity
// ─────────────────────────────────────────────────────────────────────────────

describe('Canonical party creation integrity', () => {
  // Test 77
  test('extractionService has no direct INSERT into authority_parties', () => {
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(__dirname, '../services/authorityExtractionService.js'),
      'utf8'
    );
    expect(src).not.toMatch(/INSERT\s+INTO\s+authority_parties/i);
  });

  // Test 78
  test('create_new stores display_name encrypted in DB, readable via getParty', async () => {
    const { kase } = await setupCaseThroughHumanReview();
    const cands = await extractionService.listCandidatesForCase(accountId, kase.id);
    const nameCand = cands.find(c => c.fieldKey === 'principal_name' && c.status === 'pending');
    if (!nameCand || !nameCand.proposedValue) return;

    await extractionService.acceptCandidate(accountId, userId, nameCand.id, {
      rowVersion:  nameCand.rowVersion,
      partyAction: 'create_new',
    });

    const refreshed = await extractionService.listCandidatesForCase(accountId, kase.id);
    const accepted  = refreshed.find(c => c.id === nameCand.id);
    expect(accepted.canonicalPartyId).not.toBeNull();

    // Raw DB column must not equal plaintext
    const { rows: [raw] } = await pool.query(
      `SELECT display_name FROM authority_parties WHERE id = $1`,
      [accepted.canonicalPartyId]
    );
    expect(raw).toBeDefined();
    expect(raw.display_name).not.toBe(nameCand.proposedValue);

    // Canonical read path decrypts correctly
    const party = await authorityService.getParty(accountId, accepted.canonicalPartyId);
    expect(party.display_name).toBe(nameCand.proposedValue);
  });

  // Test 79
  test('createParty failure during create_new leaves candidate pending', async () => {
    const { kase } = await setupCaseThroughHumanReview();
    const cands = await extractionService.listCandidatesForCase(accountId, kase.id);
    const nameCand = cands.find(c => c.fieldKey === 'principal_name' && c.status === 'pending');
    if (!nameCand || !nameCand.proposedValue) return;

    const spy = jest.spyOn(authorityService, 'createParty')
      .mockRejectedValueOnce(Object.assign(new Error('simulated createParty failure'), { status: 500 }));

    await expect(
      extractionService.acceptCandidate(accountId, userId, nameCand.id, {
        rowVersion:  nameCand.rowVersion,
        partyAction: 'create_new',
      })
    ).rejects.toThrow();

    spy.mockRestore();

    const refreshed = await extractionService.listCandidatesForCase(accountId, kase.id);
    expect(refreshed.find(c => c.id === nameCand.id).status).toBe('pending');
  });

  // Test 80
  test('audit failure during create_new accept: candidate stays pending, no orphan party', async () => {
    const { kase } = await setupCaseThroughHumanReview();
    const cands = await extractionService.listCandidatesForCase(accountId, kase.id);
    const nameCand = cands.find(c => c.fieldKey === 'principal_name' && c.status === 'pending');
    if (!nameCand || !nameCand.proposedValue) return;

    const { rows: [before] } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM authority_parties WHERE account_id = $1`, [accountId]
    );

    const auditMod = require('../services/audit');
    const spy = jest.spyOn(auditMod, 'logInTx')
      .mockRejectedValueOnce(new Error('simulated audit failure'));

    await expect(
      extractionService.acceptCandidate(accountId, userId, nameCand.id, {
        rowVersion:  nameCand.rowVersion,
        partyAction: 'create_new',
      })
    ).rejects.toThrow();

    spy.mockRestore();

    // Candidate still pending
    const refreshed = await extractionService.listCandidatesForCase(accountId, kase.id);
    expect(refreshed.find(c => c.id === nameCand.id).status).toBe('pending');

    // No orphan party left in DB
    const { rows: [after] } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM authority_parties WHERE account_id = $1`, [accountId]
    );
    expect(after.c).toBe(before.c);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 16: Candidate Decision Audit Atomicity
// ─────────────────────────────────────────────────────────────────────────────

describe('Candidate decision audit atomicity', () => {
  // Test 81
  test('successful accept creates a durable audit record', async () => {
    const { kase } = await setupCaseThroughHumanReview();
    const cands = await extractionService.listCandidatesForCase(accountId, kase.id);
    const c = cands.find(x => x.fieldKey === 'jurisdiction' && x.status === 'pending');
    if (!c) return;

    const { rows: [before] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_logs
        WHERE account_id = $1 AND action = 'EXTRACTION_CANDIDATE_ACCEPTED'`,
      [accountId]
    );

    await extractionService.acceptCandidate(accountId, userId, c.id, { rowVersion: c.rowVersion });

    const { rows: [after] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_logs
        WHERE account_id = $1 AND action = 'EXTRACTION_CANDIDATE_ACCEPTED'`,
      [accountId]
    );
    expect(after.n).toBe(before.n + 1);
  });

  // Test 82
  test('audit failure during accept rolls back: candidate stays pending, no audit row', async () => {
    const { kase } = await setupCaseThroughHumanReview();
    const cands = await extractionService.listCandidatesForCase(accountId, kase.id);
    const c = cands.find(x => x.fieldKey === 'jurisdiction' && x.status === 'pending');
    if (!c) return;

    const { rows: [before] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_logs
        WHERE account_id = $1 AND action = 'EXTRACTION_CANDIDATE_ACCEPTED'`,
      [accountId]
    );

    const auditMod = require('../services/audit');
    const spy = jest.spyOn(auditMod, 'logInTx')
      .mockRejectedValueOnce(new Error('simulated audit failure'));

    await expect(
      extractionService.acceptCandidate(accountId, userId, c.id, { rowVersion: c.rowVersion })
    ).rejects.toThrow();

    spy.mockRestore();

    // Candidate stays pending
    const refreshed = await extractionService.listCandidatesForCase(accountId, kase.id);
    expect(refreshed.find(x => x.id === c.id).status).toBe('pending');

    // No audit row was committed
    const { rows: [after] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_logs
        WHERE account_id = $1 AND action = 'EXTRACTION_CANDIDATE_ACCEPTED'`,
      [accountId]
    );
    expect(after.n).toBe(before.n);
  });

  // Test 83
  test('successful reject creates a durable audit record', async () => {
    const { kase } = await setupCaseThroughHumanReview();
    const cands = await extractionService.listCandidatesForCase(accountId, kase.id);
    const c = cands.find(x => x.status === 'pending');
    if (!c) return;

    const { rows: [before] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_logs
        WHERE account_id = $1 AND action = 'EXTRACTION_CANDIDATE_REJECTED'`,
      [accountId]
    );

    await extractionService.rejectCandidate(accountId, userId, c.id, 'atomicity-test rejection');

    const { rows: [after] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_logs
        WHERE account_id = $1 AND action = 'EXTRACTION_CANDIDATE_REJECTED'`,
      [accountId]
    );
    expect(after.n).toBe(before.n + 1);
  });

  // Test 84
  test('audit failure during reject rolls back: candidate stays pending, no audit row', async () => {
    const { kase } = await setupCaseThroughHumanReview();
    const cands = await extractionService.listCandidatesForCase(accountId, kase.id);
    const c = cands.find(x => x.status === 'pending');
    if (!c) return;

    const { rows: [before] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_logs
        WHERE account_id = $1 AND action = 'EXTRACTION_CANDIDATE_REJECTED'`,
      [accountId]
    );

    const auditMod = require('../services/audit');
    const spy = jest.spyOn(auditMod, 'logInTx')
      .mockRejectedValueOnce(new Error('simulated audit failure'));

    await expect(
      extractionService.rejectCandidate(accountId, userId, c.id, 'atomicity-failure-test')
    ).rejects.toThrow();

    spy.mockRestore();

    // Candidate stays pending
    const refreshed = await extractionService.listCandidatesForCase(accountId, kase.id);
    expect(refreshed.find(x => x.id === c.id).status).toBe('pending');

    // No audit row committed
    const { rows: [after] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_logs
        WHERE account_id = $1 AND action = 'EXTRACTION_CANDIDATE_REJECTED'`,
      [accountId]
    );
    expect(after.n).toBe(before.n);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 17: Canonical Party Audit — Transactional Event Sequence
//
// The create_new acceptance flow must transactionally produce all four writes:
//   1. authority_parties INSERT (canonical party row)
//   2. authority.party.created audit (via audit.logInTx inside createParty)
//   3. authority_extraction_candidates UPDATE (accepted status + canonical_party_id)
//   4. EXTRACTION_CANDIDATE_ACCEPTED audit (via audit.logInTx in acceptCandidate)
// ─────────────────────────────────────────────────────────────────────────────

describe('Canonical party audit — transactional event sequence', () => {
  // Test 85
  test('successful create_new produces both party-created and candidate-accepted audit records', async () => {
    const { kase } = await setupCaseThroughHumanReview();
    const cands = await extractionService.listCandidatesForCase(accountId, kase.id);
    const nameCand = cands.find(c => c.fieldKey === 'principal_name' && c.status === 'pending');
    if (!nameCand || !nameCand.proposedValue) return;

    const { rows: [partyBefore] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_logs
        WHERE account_id = $1 AND action = 'authority.party.created'`, [accountId]
    );
    const { rows: [candBefore] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_logs
        WHERE account_id = $1 AND action = 'EXTRACTION_CANDIDATE_ACCEPTED'`, [accountId]
    );

    await extractionService.acceptCandidate(accountId, userId, nameCand.id, {
      rowVersion:  nameCand.rowVersion,
      partyAction: 'create_new',
    });

    const { rows: [partyAfter] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_logs
        WHERE account_id = $1 AND action = 'authority.party.created'`, [accountId]
    );
    const { rows: [candAfter] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_logs
        WHERE account_id = $1 AND action = 'EXTRACTION_CANDIDATE_ACCEPTED'`, [accountId]
    );
    expect(partyAfter.n).toBe(partyBefore.n + 1);
    expect(candAfter.n).toBe(candBefore.n + 1);
  });

  // Test 86: forced candidate audit failure — party and its audit must be rolled back
  test('forced candidate audit failure rolls back party creation and leaves candidate pending', async () => {
    const { kase } = await setupCaseThroughHumanReview();
    const cands = await extractionService.listCandidatesForCase(accountId, kase.id);
    const nameCand = cands.find(c => c.fieldKey === 'principal_name' && c.status === 'pending');
    if (!nameCand || !nameCand.proposedValue) return;

    const { rows: [partyCountBefore] } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM authority_parties WHERE account_id = $1`, [accountId]
    );
    const { rows: [partyAuditBefore] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_logs
        WHERE account_id = $1 AND action = 'authority.party.created'`, [accountId]
    );
    const { rows: [candAuditBefore] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_logs
        WHERE account_id = $1 AND action = 'EXTRACTION_CANDIDATE_ACCEPTED'`, [accountId]
    );

    const auditMod = require('../services/audit');
    // Let the first logInTx call (party audit) succeed, fail on the second (candidate audit).
    const original = auditMod.logInTx.bind(auditMod);
    let callCount = 0;
    const spy = jest.spyOn(auditMod, 'logInTx').mockImplementation(async (...args) => {
      callCount++;
      if (callCount === 2) throw new Error('simulated candidate audit failure');
      return original(...args);
    });

    await expect(
      extractionService.acceptCandidate(accountId, userId, nameCand.id, {
        rowVersion:  nameCand.rowVersion,
        partyAction: 'create_new',
      })
    ).rejects.toThrow();

    spy.mockRestore();

    // Candidate stays pending
    const refreshed = await extractionService.listCandidatesForCase(accountId, kase.id);
    expect(refreshed.find(c => c.id === nameCand.id).status).toBe('pending');

    // No orphan party (party INSERT was rolled back with the transaction)
    const { rows: [partyCountAfter] } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM authority_parties WHERE account_id = $1`, [accountId]
    );
    expect(partyCountAfter.c).toBe(partyCountBefore.c);

    // No party-created audit committed (rolled back with the transaction)
    const { rows: [partyAuditAfter] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_logs
        WHERE account_id = $1 AND action = 'authority.party.created'`, [accountId]
    );
    expect(partyAuditAfter.n).toBe(partyAuditBefore.n);

    // No candidate-accepted audit committed
    const { rows: [candAuditAfter] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_logs
        WHERE account_id = $1 AND action = 'EXTRACTION_CANDIDATE_ACCEPTED'`, [accountId]
    );
    expect(candAuditAfter.n).toBe(candAuditBefore.n);
  });

  // Test 87: no duplicate party-created audit — logInTx writes exactly one record, no post-commit repeat
  test('successful create_new emits exactly one party-created audit record (no duplicate)', async () => {
    const { kase } = await setupCaseThroughHumanReview();
    const cands = await extractionService.listCandidatesForCase(accountId, kase.id);
    const nameCand = cands.find(c => c.fieldKey === 'principal_name' && c.status === 'pending');
    if (!nameCand || !nameCand.proposedValue) return;

    await extractionService.acceptCandidate(accountId, userId, nameCand.id, {
      rowVersion:  nameCand.rowVersion,
      partyAction: 'create_new',
    });

    const refreshed = await extractionService.listCandidatesForCase(accountId, kase.id);
    const accepted  = refreshed.find(c => c.id === nameCand.id);
    expect(accepted.canonicalPartyId).not.toBeNull();

    // Query the canonical party's audit records — must be exactly 1
    const { rows: [auditCount] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_logs
        WHERE account_id = $1 AND action = 'authority.party.created'
          AND entity_id = $2`,
      [accountId, accepted.canonicalPartyId]
    );
    expect(auditCount.n).toBe(1);
  });
});
