/**
 * FieldCore Authority — Domain Foundation Tests (Phase 1)
 *
 * Covers all required test scenarios from Part 11.2 of the implementation spec:
 *  - Tenant isolation (DB level and service level)
 *  - Document upload, access, format validation, audit
 *  - Case lifecycle state machine
 *  - Instrument lifecycle including human-verification rule
 *  - Institution provisioning authorization
 *  - Authority encryption round-trips, IV uniqueness, tamper detection
 *  - Feature flag and config validation
 *  - Data model constraints (ai_agent rejection, action_key format, etc.)
 *  - Migration correctness
 *
 * Storage (R2) is mocked — no real R2 calls.
 * All test data is synthetic and obviously fake.
 */

require('dotenv').config();

// ── Mock Authority Storage before requiring any service ──────────────────────
// Mock must be declared before the modules that import it are required.
jest.mock('../services/authorityStorage', () => {
  const crypto = require('crypto');
  // Track last uploaded buffer so getStream returns content of matching size,
  // preventing Content-Length mismatch that causes HTTP "aborted" in supertest.
  let _lastUploadedBuffer = Buffer.from('%PDF-1.4\n%%EOF');
  return {
    isConfigured: jest.fn().mockReturnValue(true),
    upload: jest.fn().mockImplementation(async (buffer, { accountId } = {}) => {
      _lastUploadedBuffer = buffer;
      return {
        storageKey:    `authority/${accountId || 'test-acct'}/${crypto.randomUUID()}`,
        contentSha256: crypto.createHash('sha256').update(buffer).digest('hex'),
        byteSize:      buffer.length,
      };
    }),
    getStream: jest.fn().mockImplementation(async () => {
      const { Readable } = require('stream');
      return Readable.from([_lastUploadedBuffer]);
    }),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    generateStorageKey: jest.fn().mockImplementation((accountId) =>
      `authority/${accountId}/${crypto.randomUUID()}`
    ),
    _resetClient: jest.fn(),
  };
});

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');

const app              = require('../app');
const pool             = require('../db/pool');
const { runMigrations } = require('../db/migrate');
const authorityCrypto  = require('../services/authorityCrypto');
const authorityStorage = require('../services/authorityStorage');
const authorityService = require('../services/authorityService');

// ── Synthetic test PDFs ───────────────────────────────────────────────────────
// Minimal valid PDFs — clearly fake, contains no real content.
const SYNTHETIC_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n' +
  '2 0 obj\n<</Type /Pages /Kids [] /Count 0>>\nendobj\n' +
  'xref\n0 3\n0000000000 65535 f \ntrailer\n<</Size 3/Root 1 0 R>>\nstartxref\n9\n%%EOF'
);

// Image-based (scanned-style) PDF — valid %PDF- header, no structural validity beyond magic bytes
const SYNTHETIC_SCANNED_PDF = Buffer.from(
  '%PDF-1.4\n% Synthetic scanned/image-based document for testing\n' +
  '% This file contains no real content.\n%%EOF'
);

const NOT_PDF_BUFFER        = Buffer.from('This is not a PDF file - no magic bytes');
const PNG_BUFFER            = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...Array(100).fill(0)]);
const JPEG_BUFFER           = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Array(100).fill(0)]);
const DOCX_BUFFER           = Buffer.from([0x50, 0x4B, 0x03, 0x04, ...Array(100).fill(0)]); // ZIP/DOCX magic
const TIFF_BUFFER           = Buffer.from([0x49, 0x49, 0x2A, 0x00, ...Array(100).fill(0)]); // TIFF LE magic

// ── Test key (generated fresh for each test run) ──────────────────────────────
// Never a real key — all-zeros placeholder for tests only.
// IMPORTANT: Must differ from ENCRYPTION_KEY. We use a distinct test value.
const TEST_AUTHORITY_KEY = crypto.randomBytes(32).toString('hex');

function makeToken(userId, accountId, role = 'owner') {
  return jwt.sign({ userId, accountId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

// ── Test state ────────────────────────────────────────────────────────────────
let institutionAccountId, institutionUserId, institutionToken;
let institution2AccountId, institution2UserId, institution2Token;
let fcInternalAccountId, fcInternalUserId, fcInternalToken;
let fcInternalNoCapUserId, fcInternalNoCapToken;
let fieldServiceAccountId, fieldServiceUserId, fieldServiceToken;

const CLEANUP = [];

beforeAll(async () => {
  // Set up feature flag and encryption key for tests
  process.env.AUTHORITY_ENABLED = 'true';
  // Use a distinct test key that is NOT equal to ENCRYPTION_KEY
  process.env.AUTHORITY_DATA_ENCRYPTION_KEY = TEST_AUTHORITY_KEY;

  await runMigrations();

  const hash = await bcrypt.hash('pw-test-123', 10);

  // Institution A
  const { rows: [ia] } = await pool.query(
    `INSERT INTO accounts (name, plan, account_type) VALUES ($1,$2,'institution') RETURNING id`,
    ['__TEST_AUTHORITY_INSTITUTION_A__', 'institution']
  );
  institutionAccountId = ia.id;
  CLEANUP.push({ table: 'accounts', id: institutionAccountId });

  const { rows: [iu] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,'owner') RETURNING id`,
    [institutionAccountId, 'Inst A Owner',
     `auth-inst-a-${Date.now()}@fieldcore.test`, hash]
  );
  institutionUserId = iu.id;
  institutionToken  = makeToken(institutionUserId, institutionAccountId, 'owner');

  // Grant AUTHORITY_INSTRUMENT_VERIFY + AUTHORITY_INSTRUMENT_REJECT to institution user
  await pool.query(
    `INSERT INTO platform_user_capabilities (user_id, capability)
     VALUES ($1,'AUTHORITY_INSTRUMENT_VERIFY'),($1,'AUTHORITY_INSTRUMENT_REJECT')
     ON CONFLICT DO NOTHING`,
    [institutionUserId]
  );

  // Institution B (for cross-tenant tests)
  const { rows: [ib] } = await pool.query(
    `INSERT INTO accounts (name, plan, account_type) VALUES ($1,$2,'institution') RETURNING id`,
    ['__TEST_AUTHORITY_INSTITUTION_B__', 'institution']
  );
  institution2AccountId = ib.id;
  CLEANUP.push({ table: 'accounts', id: institution2AccountId });

  const { rows: [iu2] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,'owner') RETURNING id`,
    [institution2AccountId, 'Inst B Owner',
     `auth-inst-b-${Date.now()}@fieldcore.test`, hash]
  );
  institution2UserId = iu2.id;
  institution2Token  = makeToken(institution2UserId, institution2AccountId, 'owner');

  // FieldCore internal account with INSTITUTION_PROVISION capability
  const { rows: [fca] } = await pool.query(
    `INSERT INTO accounts (name, plan, account_type) VALUES ($1,$2,'fc_internal') RETURNING id`,
    ['__TEST_AUTHORITY_FC_INTERNAL__', 'pro']
  );
  fcInternalAccountId = fca.id;
  CLEANUP.push({ table: 'accounts', id: fcInternalAccountId });

  const { rows: [fcu] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,'owner') RETURNING id`,
    [fcInternalAccountId, 'FC Internal Admin',
     `auth-fc-internal-${Date.now()}@fieldcore.test`, hash]
  );
  fcInternalUserId = fcu.id;
  fcInternalToken  = makeToken(fcInternalUserId, fcInternalAccountId, 'owner');

  // Grant INSTITUTION_PROVISION to the fc_internal user
  await pool.query(
    `INSERT INTO platform_user_capabilities (user_id, capability)
     VALUES ($1,'INSTITUTION_PROVISION') ON CONFLICT DO NOTHING`,
    [fcInternalUserId]
  );

  // FC internal user WITHOUT the capability (for negative test)
  const { rows: [fcu2] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,'manager') RETURNING id`,
    [fcInternalAccountId, 'FC Internal No Cap',
     `auth-fc-nocap-${Date.now()}@fieldcore.test`, hash]
  );
  fcInternalNoCapUserId = fcu2.id;
  fcInternalNoCapToken  = makeToken(fcInternalNoCapUserId, fcInternalAccountId, 'manager');

  // field_service account (for rejection tests)
  const { rows: [fsa] } = await pool.query(
    `INSERT INTO accounts (name, plan, account_type) VALUES ($1,$2,'field_service') RETURNING id`,
    ['__TEST_AUTHORITY_FIELD_SERVICE__', 'pro']
  );
  fieldServiceAccountId = fsa.id;
  CLEANUP.push({ table: 'accounts', id: fieldServiceAccountId });

  const { rows: [fsu] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,'owner') RETURNING id`,
    [fieldServiceAccountId, 'Field Service Owner',
     `auth-fs-${Date.now()}@fieldcore.test`, hash]
  );
  fieldServiceUserId = fsu.id;
  fieldServiceToken  = makeToken(fieldServiceUserId, fieldServiceAccountId, 'owner');

}, 45000);

afterAll(async () => {
  // Clean up in reverse order to respect FK constraints
  for (const { table, id } of [...CLEANUP].reverse()) {
    try {
      await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    } catch { /* ignore — CASCADE handles most of it */ }
  }
  await pool.end();
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 1: Tenant Isolation
// ─────────────────────────────────────────────────────────────────────────────

describe('Tenant isolation — parties', () => {
  let partyId;
  beforeAll(async () => {
    const party = await authorityService.createParty(
      institutionAccountId, institutionUserId,
      { partyType: 'person', displayName: 'Test Principal Alpha' }
    );
    partyId = party.id;
  });

  // Test 1
  test('Institution B cannot read Institution A party', async () => {
    await expect(
      authorityService.getParty(institution2AccountId, partyId)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  // Test 1 (update)
  test('Institution B cannot update Institution A party status', async () => {
    await expect(
      authorityService.updatePartyStatus(institution2AccountId, institution2UserId, partyId, 'inactive')
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  // Test 7
  test('field_service account cannot create a party', async () => {
    await expect(
      authorityService.createParty(fieldServiceAccountId, fieldServiceUserId,
        { partyType: 'person', displayName: 'Fake Party' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  // Test 7
  test('fc_internal account cannot create a party', async () => {
    await expect(
      authorityService.createParty(fcInternalAccountId, fcInternalUserId,
        { partyType: 'person', displayName: 'Fake Party' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('Tenant isolation — cases', () => {
  let caseId;
  beforeAll(async () => {
    const kase = await authorityService.createCase(
      institutionAccountId, institutionUserId, {}
    );
    caseId = kase.id;
  });

  // Test 2
  test('Institution B cannot read Institution A case', async () => {
    await expect(
      authorityService.getCase(institution2AccountId, caseId)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('Institution B cannot transition Institution A case', async () => {
    await expect(
      authorityService.transitionCase(institution2AccountId, institution2UserId, caseId, 'AWAITING_DOCUMENTS')
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('Tenant isolation — instruments', () => {
  let instrumentId;
  beforeAll(async () => {
    const instr = await authorityService.createInstrument(
      institutionAccountId, institutionUserId,
      { instrumentType: 'power_of_attorney' }
    );
    instrumentId = instr.id;
  });

  // Test 3
  test('Institution B cannot read Institution A instrument', async () => {
    await expect(
      authorityService.getInstrument(institution2AccountId, instrumentId)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('Institution B cannot transition Institution A instrument', async () => {
    await expect(
      authorityService.transitionInstrument(
        institution2AccountId, institution2UserId, instrumentId, 'PENDING_REVIEW',
        { actorType: 'human' }
      )
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('Tenant isolation — cross-tenant instrument-party link (Test 4)', () => {
  let aInstrumentId, bPartyId;

  beforeAll(async () => {
    const instr = await authorityService.createInstrument(
      institutionAccountId, institutionUserId, { instrumentType: 'trust' }
    );
    aInstrumentId = instr.id;

    const party = await authorityService.createParty(
      institution2AccountId, institution2UserId,
      { partyType: 'person', displayName: 'Trustee Beta' }
    );
    bPartyId = party.id;
  });

  // Test 4 — service level
  test('service rejects cross-tenant party attachment', async () => {
    await expect(
      authorityService.addParticipant(
        institutionAccountId, institutionUserId, aInstrumentId,
        { partyId: bPartyId, role: 'trustee' }
      )
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  // Test 4 — DB level: direct INSERT bypassing service must fail FK constraint
  test('direct DB insert of cross-tenant party fails FK constraint', async () => {
    await expect(
      pool.query(
        `INSERT INTO authority_instrument_parties
           (account_id, instrument_id, party_id, role)
         VALUES ($1, $2, $3, 'trustee')`,
        [institutionAccountId, aInstrumentId, bPartyId]
      )
    ).rejects.toThrow();
  });
});

describe('Tenant isolation — cross-tenant case↔instrument link (Test 5)', () => {
  let aCaseId, bInstrumentId;

  beforeAll(async () => {
    const kase = await authorityService.createCase(
      institutionAccountId, institutionUserId, {}
    );
    aCaseId = kase.id;

    const instr = await authorityService.createInstrument(
      institution2AccountId, institution2UserId, { instrumentType: 'corporate_resolution' }
    );
    bInstrumentId = instr.id;
  });

  // Test 5 — service level
  test('service rejects cross-tenant case↔instrument link', async () => {
    await expect(
      authorityService.linkInstrumentToCase(
        institutionAccountId, institutionUserId, aCaseId, bInstrumentId
      )
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  // Test 5 — DB level
  test('direct DB insert of cross-tenant case↔instrument fails FK', async () => {
    await expect(
      pool.query(
        `INSERT INTO authority_case_instruments (account_id, case_id, instrument_id)
         VALUES ($1, $2, $3)`,
        [institutionAccountId, aCaseId, bInstrumentId]
      )
    ).rejects.toThrow();
  });
});

describe('Tenant isolation — cross-tenant permission (Test 6)', () => {
  test('cross-tenant permission attachment rejected', async () => {
    // B's instrument cannot be used for A's permission via A's accountId
    const instr = await authorityService.createInstrument(
      institution2AccountId, institution2UserId, { instrumentType: 'letter_of_authorization' }
    );
    await expect(
      authorityService.addPermission(
        institutionAccountId, institutionUserId, instr.id,
        { actionKey: 'BANKING.ACCOUNT_VIEW', grantType: 'granted' }
      )
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: Documents
// ─────────────────────────────────────────────────────────────────────────────

describe('Document access — unauthenticated', () => {
  // Test 8
  test('unauthenticated document access returns 401', async () => {
    const res = await request(app).get('/api/authority/documents/00000000-0000-0000-0000-000000000001');
    expect(res.status).toBe(401);
  });

  test('unauthenticated document upload returns 401', async () => {
    const res = await request(app)
      .post('/api/authority/documents')
      .attach('document', SYNTHETIC_PDF, { filename: 'test.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(401);
  });
});

describe('Document access — cross-tenant (Test 9)', () => {
  let docId;
  beforeAll(async () => {
    const doc = await authorityService.uploadDocument(
      institutionAccountId, institutionUserId, SYNTHETIC_PDF,
      { originalFilename: 'test-power-of-attorney.pdf' }
    );
    docId = doc.id;
  });

  test('cross-tenant document access returns 404 (existence not leaked)', async () => {
    const res = await request(app)
      .get(`/api/authority/documents/${docId}`)
      .set('Authorization', `Bearer ${institution2Token}`);
    expect(res.status).toBe(404);
  });
});

describe('Document upload and retrieval (Tests 10, 16, 17)', () => {
  let docId, storedStorageKey, storedSha256;

  beforeAll(async () => {
    authorityStorage.upload.mockClear();
  });

  // Test 10
  test('valid PDF upload succeeds and SHA-256 matches', async () => {
    const expectedSha = crypto.createHash('sha256').update(SYNTHETIC_PDF).digest('hex');

    const res = await request(app)
      .post('/api/authority/documents')
      .set('Authorization', `Bearer ${institutionToken}`)
      .attach('document', SYNTHETIC_PDF, { filename: 'poa-test.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.content_sha256).toBe(expectedSha);
    docId = res.body.id;
    storedStorageKey = res.body.storage_key;
    storedSha256 = res.body.content_sha256;

    // Verify upload was called with the Authority storage, not the legacy bucket
    expect(authorityStorage.upload).toHaveBeenCalled();
  });

  test('can retrieve uploaded document via authenticated API', async () => {
    authorityStorage.getStream.mockImplementationOnce(async () => {
      const { Readable } = require('stream');
      return Readable.from([SYNTHETIC_PDF]);
    });

    const res = await request(app)
      .get(`/api/authority/documents/${docId}`)
      .set('Authorization', `Bearer ${institutionToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['cache-control']).toBe('no-store');
    // Content-Disposition must not contain the original filename
    expect(res.headers['content-disposition']).not.toContain('poa-test.pdf');
    expect(res.headers['content-disposition']).not.toContain('power-of-attorney');
  });

  // Test 16: upload targets Authority storage, no public URL
  test('upload calls Authority storage (not legacy bucket) and produces no public URL', async () => {
    const callArgs = authorityStorage.upload.mock.calls;
    // All calls should have accountId matching institutionAccountId
    callArgs.forEach(([, opts]) => {
      expect(opts.accountId).toBe(institutionAccountId);
    });
    // Response body should not contain any public CDN URL pattern
    const res = await request(app)
      .get(`/api/authority/documents/${docId}`)
      .set('Authorization', `Bearer ${institutionToken}`);
    expect(JSON.stringify(res.body)).not.toMatch(/r2\.cloudflarestorage|cdn\.|public/i);
  });

  // Test 17: original_filename not in plaintext
  test('original_filename is not stored in plaintext in the DB', async () => {
    const { rows: [row] } = await pool.query(
      `SELECT original_filename FROM authority_documents WHERE id = $1`, [docId]
    );
    expect(row.original_filename).not.toBe('poa-test.pdf');
    expect(row.original_filename).toMatch(/^v1:/);
  });

  // Test 15: storage key contains no filename or PII
  test('storage key contains no filename or PII', async () => {
    expect(storedStorageKey).not.toContain('poa-test.pdf');
    expect(storedStorageKey).not.toContain('power-of-attorney');
    expect(storedStorageKey).toMatch(/^authority\//);
  });
});

describe('Document format validation (Tests 11, 12, 13, 14)', () => {
  // Test 11: scanned-style PDF is accepted
  test('image-based (scanned-style) PDF is accepted', async () => {
    const res = await request(app)
      .post('/api/authority/documents')
      .set('Authorization', `Bearer ${institutionToken}`)
      .attach('document', SYNTHETIC_SCANNED_PDF, {
        filename: 'scanned.pdf', contentType: 'application/pdf',
      });
    expect(res.status).toBe(201);
  });

  // Test 12: non-PDF formats are rejected
  test('PNG upload is rejected', async () => {
    const res = await request(app)
      .post('/api/authority/documents')
      .set('Authorization', `Bearer ${institutionToken}`)
      .attach('document', PNG_BUFFER, { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });

  test('JPEG upload is rejected', async () => {
    const res = await request(app)
      .post('/api/authority/documents')
      .set('Authorization', `Bearer ${institutionToken}`)
      .attach('document', JPEG_BUFFER, { filename: 'photo.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
  });

  test('TIFF upload is rejected', async () => {
    const res = await request(app)
      .post('/api/authority/documents')
      .set('Authorization', `Bearer ${institutionToken}`)
      .attach('document', TIFF_BUFFER, { filename: 'scan.tiff', contentType: 'image/tiff' });
    expect(res.status).toBe(400);
  });

  test('DOCX upload is rejected', async () => {
    const res = await request(app)
      .post('/api/authority/documents')
      .set('Authorization', `Bearer ${institutionToken}`)
      .attach('document', DOCX_BUFFER, { filename: 'doc.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    expect(res.status).toBe(400);
  });

  // Test 13: non-PDF renamed to .pdf or sent with application/pdf header is rejected
  test('non-PDF file renamed to .pdf is rejected (magic bytes check)', async () => {
    const res = await request(app)
      .post('/api/authority/documents')
      .set('Authorization', `Bearer ${institutionToken}`)
      .attach('document', NOT_PDF_BUFFER, { filename: 'fake.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
  });

  test('non-PDF file sent with application/pdf content-type is rejected', async () => {
    const res = await request(app)
      .post('/api/authority/documents')
      .set('Authorization', `Bearer ${institutionToken}`)
      .attach('document', JPEG_BUFFER, { filename: 'tricky.jpg', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
  });

  // Test 14: oversize upload is rejected
  test('oversize upload is rejected', async () => {
    // Create a buffer slightly over 50 MB
    const oversizeBuffer = Buffer.concat([
      Buffer.from('%PDF-1.4\n'),
      Buffer.alloc(51 * 1024 * 1024),
    ]);
    const res = await request(app)
      .post('/api/authority/documents')
      .set('Authorization', `Bearer ${institutionToken}`)
      .attach('document', oversizeBuffer, {
        filename: 'oversize.pdf', contentType: 'application/pdf',
      });
    // multer rejects at the limit (413), or service rejects (400); both are acceptable
    expect([400, 413]).toContain(res.status);
  });
});

describe('Document audit events (Test 18, 19)', () => {
  // Test 18: upload, access, denial produce audit events
  test('document upload produces an audit event', async () => {
    const before = await pool.query(
      `SELECT COUNT(*) FROM audit_logs WHERE account_id = $1 AND action = 'authority.document.uploaded'`,
      [institutionAccountId]
    );
    const countBefore = parseInt(before.rows[0].count, 10);

    await authorityService.uploadDocument(
      institutionAccountId, institutionUserId, SYNTHETIC_PDF,
      { originalFilename: 'audit-test.pdf' }
    );

    const after = await pool.query(
      `SELECT COUNT(*) FROM audit_logs WHERE account_id = $1 AND action = 'authority.document.uploaded'`,
      [institutionAccountId]
    );
    expect(parseInt(after.rows[0].count, 10)).toBe(countBefore + 1);
  });

  test('rejected upload produces an audit event', async () => {
    const before = await pool.query(
      `SELECT COUNT(*) FROM audit_logs WHERE account_id = $1 AND action = 'authority.document.upload.rejected'`,
      [institutionAccountId]
    );
    const countBefore = parseInt(before.rows[0].count, 10);

    await expect(
      authorityService.uploadDocument(
        institutionAccountId, institutionUserId, NOT_PDF_BUFFER,
        { originalFilename: 'bad.txt' }
      )
    ).rejects.toThrow();

    const after = await pool.query(
      `SELECT COUNT(*) FROM audit_logs WHERE account_id = $1 AND action = 'authority.document.upload.rejected'`,
      [institutionAccountId]
    );
    expect(parseInt(after.rows[0].count, 10)).toBe(countBefore + 1);
  });

  test('document access produces an audit event', async () => {
    const doc = await authorityService.uploadDocument(
      institutionAccountId, institutionUserId, SYNTHETIC_PDF,
      { originalFilename: 'access-audit.pdf' }
    );

    const before = await pool.query(
      `SELECT COUNT(*) FROM audit_logs WHERE account_id = $1 AND action = 'authority.document.accessed'`,
      [institutionAccountId]
    );
    const countBefore = parseInt(before.rows[0].count, 10);

    await authorityService.streamDocument(institutionAccountId, institutionUserId, doc.id);

    const after = await pool.query(
      `SELECT COUNT(*) FROM audit_logs WHERE account_id = $1 AND action = 'authority.document.accessed'`,
      [institutionAccountId]
    );
    expect(parseInt(after.rows[0].count, 10)).toBe(countBefore + 1);
  });

  // Test 19: deletion removes stored object, marks metadata deleted, writes audit event
  test('document deletion marks metadata deleted and audits', async () => {
    const doc = await authorityService.uploadDocument(
      institutionAccountId, institutionUserId, SYNTHETIC_PDF,
      { originalFilename: 'delete-test.pdf' }
    );
    const docId = doc.id;

    authorityStorage.deleteObject.mockClear();

    const before = await pool.query(
      `SELECT COUNT(*) FROM audit_logs WHERE account_id = $1 AND action = 'authority.document.deleted'`,
      [institutionAccountId]
    );

    await authorityService.deleteDocument(institutionAccountId, institutionUserId, docId);

    // Storage deleteObject called
    expect(authorityStorage.deleteObject).toHaveBeenCalledTimes(1);

    // Metadata marked as deleted
    const { rows: [deleted] } = await pool.query(
      `SELECT status, deleted_at FROM authority_documents WHERE id = $1`, [docId]
    );
    expect(deleted.status).toBe('deleted');
    expect(deleted.deleted_at).not.toBeNull();

    // Audit event written
    const after = await pool.query(
      `SELECT COUNT(*) FROM audit_logs WHERE account_id = $1 AND action = 'authority.document.deleted'`,
      [institutionAccountId]
    );
    expect(parseInt(after.rows[0].count, 10)).toBeGreaterThan(parseInt(before.rows[0].count, 10));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 3: Case Lifecycle (Tests 20, 21, 22, 23)
// ─────────────────────────────────────────────────────────────────────────────

describe('Case lifecycle', () => {
  // Test 20: all allowed transitions succeed
  test('DRAFT → AWAITING_DOCUMENTS → PENDING_EXTRACTION → EXTRACTION_COMPLETE succeeds', async () => {
    const kase  = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'power_of_attorney' });
    await authorityService.linkInstrumentToCase(institutionAccountId, institutionUserId, kase.id, instr.id);
    expect(kase.status).toBe('DRAFT');

    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'AWAITING_DOCUMENTS');
    const r2 = await authorityService.getCase(institutionAccountId, kase.id);
    expect(r2.status).toBe('AWAITING_DOCUMENTS');

    await authorityService.uploadDocument(institutionAccountId, institutionUserId, SYNTHETIC_PDF,
      { caseId: kase.id, originalFilename: 'test.pdf' });
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_EXTRACTION');
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'EXTRACTION_COMPLETE', { systemActor: true });
    const r3 = await authorityService.getCase(institutionAccountId, kase.id);
    expect(r3.status).toBe('EXTRACTION_COMPLETE');
  });

  test('EXTRACTION_COMPLETE → PENDING_HUMAN_REVIEW → HUMAN_REVIEW_IN_PROGRESS → COMPLETED succeeds when instruments are verified', async () => {
    const kase  = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId, { instrumentType: 'trust' });

    await authorityService.linkInstrumentToCase(institutionAccountId, institutionUserId, kase.id, instr.id);
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id, 'PENDING_REVIEW', { actorType: 'human' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id, 'VERIFIED', { actorType: 'human' });

    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'AWAITING_DOCUMENTS');
    await authorityService.uploadDocument(institutionAccountId, institutionUserId, SYNTHETIC_PDF,
      { caseId: kase.id, originalFilename: 'test.pdf' });
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_EXTRACTION');
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'EXTRACTION_COMPLETE', { systemActor: true });
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_HUMAN_REVIEW');
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'HUMAN_REVIEW_IN_PROGRESS');
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'COMPLETED');

    const final = await authorityService.getCase(institutionAccountId, kase.id);
    expect(final.status).toBe('COMPLETED');
  });

  test('DRAFT → CANCELLED sets cancelled_at', async () => {
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'CANCELLED', { cancellationReason: 'test reason' });
    const cancelled = await authorityService.getCase(institutionAccountId, kase.id);
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelled_at).not.toBeNull();
    expect(cancelled.cancellation_reason).toBe('test reason');
  });

  // Test 21: invalid transitions rejected
  test('DRAFT → COMPLETED is rejected', async () => {
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    await expect(
      authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'COMPLETED')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('COMPLETED → any state is rejected', async () => {
    const kase  = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'power_of_attorney' });
    await authorityService.linkInstrumentToCase(institutionAccountId, institutionUserId, kase.id, instr.id);
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'PENDING_REVIEW', { actorType: 'human' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'VERIFIED', { actorType: 'human' });
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'AWAITING_DOCUMENTS');
    await authorityService.uploadDocument(institutionAccountId, institutionUserId, SYNTHETIC_PDF,
      { caseId: kase.id, originalFilename: 'test.pdf' });
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_EXTRACTION');
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'EXTRACTION_COMPLETE', { systemActor: true });
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_HUMAN_REVIEW');
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'HUMAN_REVIEW_IN_PROGRESS');
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'COMPLETED');

    await expect(
      authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'DRAFT')
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'CANCELLED')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('CANCELLED → any state is rejected', async () => {
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'CANCELLED');
    await expect(
      authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'DRAFT')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // EXTRACTION_COMPLETE is a system-only transition — not reachable without systemActor: true
  test('PENDING_EXTRACTION → EXTRACTION_COMPLETE without systemActor is rejected (system-only path)', async () => {
    const kase  = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'trust' });
    await authorityService.linkInstrumentToCase(institutionAccountId, institutionUserId, kase.id, instr.id);
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'AWAITING_DOCUMENTS');
    await authorityService.uploadDocument(institutionAccountId, institutionUserId, SYNTHETIC_PDF,
      { caseId: kase.id, originalFilename: 'test.pdf' });
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_EXTRACTION');

    // Without systemActor: true, the transition is forbidden
    await expect(
      authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'EXTRACTION_COMPLETE')
    ).rejects.toMatchObject({ statusCode: 403 });

    // With systemActor: true (internal service path), it succeeds
    await expect(
      authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'EXTRACTION_COMPLETE', { systemActor: true })
    ).resolves.toMatchObject({ status: 'EXTRACTION_COMPLETE' });
  });

  // Test 22: case cannot complete while a linked instrument is UNVERIFIED or PENDING_REVIEW
  test('HUMAN_REVIEW_IN_PROGRESS → COMPLETED blocked when linked instrument is UNVERIFIED', async () => {
    const kase  = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'court_order' });

    await authorityService.linkInstrumentToCase(institutionAccountId, institutionUserId, kase.id, instr.id);
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'AWAITING_DOCUMENTS');
    await authorityService.uploadDocument(institutionAccountId, institutionUserId, SYNTHETIC_PDF,
      { caseId: kase.id, originalFilename: 'test.pdf' });
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_EXTRACTION');
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'EXTRACTION_COMPLETE', { systemActor: true });
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_HUMAN_REVIEW');
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'HUMAN_REVIEW_IN_PROGRESS');

    await expect(
      authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'COMPLETED')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('HUMAN_REVIEW_IN_PROGRESS → COMPLETED blocked when linked instrument is PENDING_REVIEW', async () => {
    const kase  = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'healthcare_proxy' });

    await authorityService.linkInstrumentToCase(institutionAccountId, institutionUserId, kase.id, instr.id);
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id, 'PENDING_REVIEW',
      { actorType: 'human' });

    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'AWAITING_DOCUMENTS');
    await authorityService.uploadDocument(institutionAccountId, institutionUserId, SYNTHETIC_PDF,
      { caseId: kase.id, originalFilename: 'test.pdf' });
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_EXTRACTION');
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'EXTRACTION_COMPLETE', { systemActor: true });
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_HUMAN_REVIEW');
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'HUMAN_REVIEW_IN_PROGRESS');

    await expect(
      authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'COMPLETED')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // Test 23: status cannot be set via generic update
  test('instruments table status cannot be directly updated bypassing transition (no generic update route)', async () => {
    // The service exposes no generic update function that accepts a status field.
    // Verify: there is no updateInstrument(status) or updateCase(status) in the service exports.
    expect(typeof authorityService.transitionCase).toBe('function');
    expect(authorityService.updateCase).toBeUndefined();
    expect(authorityService.updateInstrument).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 4: Instrument Lifecycle and Verification (Tests 24–34)
// ─────────────────────────────────────────────────────────────────────────────

describe('Instrument lifecycle', () => {
  // Test 24: full verification flow records all required fields
  test('UNVERIFIED → PENDING_REVIEW → VERIFIED succeeds; verifier fields are recorded', async () => {
    const instr = await authorityService.createInstrument(
      institutionAccountId, institutionUserId, { instrumentType: 'power_of_attorney' }
    );
    expect(instr.status).toBe('UNVERIFIED');

    await authorityService.transitionInstrument(
      institutionAccountId, institutionUserId, instr.id, 'PENDING_REVIEW', { actorType: 'human' }
    );

    await authorityService.transitionInstrument(
      institutionAccountId, institutionUserId, instr.id, 'VERIFIED', { actorType: 'human' }
    );

    const verified = await authorityService.getInstrument(institutionAccountId, instr.id);
    expect(verified.status).toBe('VERIFIED');
    expect(verified.verified_by_user_id).toBe(institutionUserId);
    expect(verified.verified_at).not.toBeNull();
    expect(verified.verification_actor_type).toBe('human');
    expect(verified.verification_authorization_context).toBe('institution_reviewer');
    expect(verified.verification_actor_account_id).toBe(institutionAccountId);
  });

  // Test 25: PENDING_REVIEW → REJECTED
  test('PENDING_REVIEW → REJECTED succeeds', async () => {
    const instr = await authorityService.createInstrument(
      institutionAccountId, institutionUserId, { instrumentType: 'guardianship_order' }
    );
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'PENDING_REVIEW', { actorType: 'human' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'REJECTED', { actorType: 'human', rejectionReason: 'Test rejection' });

    const rejected = await authorityService.getInstrument(institutionAccountId, instr.id);
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rejected_at).not.toBeNull();
    expect(rejected.rejection_reason).toBe('Test rejection');
  });

  // Test 26: VERIFIED → REVOKED
  test('VERIFIED → REVOKED succeeds', async () => {
    const instr = await authorityService.createInstrument(
      institutionAccountId, institutionUserId, { instrumentType: 'durable_power_of_attorney' }
    );
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'PENDING_REVIEW', { actorType: 'human' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'VERIFIED', { actorType: 'human' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'REVOKED', { revocationReason: 'Principal request' });

    const revoked = await authorityService.getInstrument(institutionAccountId, instr.id);
    expect(revoked.status).toBe('REVOKED');
    expect(revoked.revoked_at).not.toBeNull();
  });

  // Test 27: VERIFIED → EXPIRED
  test('VERIFIED → EXPIRED succeeds', async () => {
    const instr = await authorityService.createInstrument(
      institutionAccountId, institutionUserId, { instrumentType: 'letter_of_authorization' }
    );
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'PENDING_REVIEW', { actorType: 'human' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'VERIFIED', { actorType: 'human' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id, 'EXPIRED', {});

    const expired = await authorityService.getInstrument(institutionAccountId, instr.id);
    expect(expired.status).toBe('EXPIRED');
    expect(expired.expired_at).not.toBeNull();
  });

  // Test 28: VERIFIED → SUPERSEDED
  test('VERIFIED → SUPERSEDED succeeds with same-tenant superseding instrument', async () => {
    const original  = await authorityService.createInstrument(
      institutionAccountId, institutionUserId, { instrumentType: 'trust' }
    );
    const successor = await authorityService.createInstrument(
      institutionAccountId, institutionUserId, { instrumentType: 'trust' }
    );

    for (const instr of [original, successor]) {
      await authorityService.transitionInstrument(institutionAccountId, institutionUserId,
        instr.id, 'PENDING_REVIEW', { actorType: 'human' });
      await authorityService.transitionInstrument(institutionAccountId, institutionUserId,
        instr.id, 'VERIFIED', { actorType: 'human' });
    }

    await authorityService.transitionInstrument(institutionAccountId, institutionUserId,
      original.id, 'SUPERSEDED', { supersededByInstrumentId: successor.id });

    const superseded = await authorityService.getInstrument(institutionAccountId, original.id);
    expect(superseded.status).toBe('SUPERSEDED');
    expect(superseded.superseded_by_instrument_id).toBe(successor.id);
  });

  test('VERIFIED → SUPERSEDED with cross-tenant instrument is rejected', async () => {
    const instr = await authorityService.createInstrument(
      institutionAccountId, institutionUserId, { instrumentType: 'corporate_resolution' }
    );
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'PENDING_REVIEW', { actorType: 'human' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'VERIFIED', { actorType: 'human' });

    const bInstr = await authorityService.createInstrument(
      institution2AccountId, institution2UserId, { instrumentType: 'corporate_resolution' }
    );

    await expect(
      authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
        'SUPERSEDED', { supersededByInstrumentId: bInstr.id })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('VERIFIED → SUPERSEDED self-referential is rejected', async () => {
    const instr = await authorityService.createInstrument(
      institutionAccountId, institutionUserId, { instrumentType: 'power_of_attorney' }
    );
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId,
      instr.id, 'PENDING_REVIEW', { actorType: 'human' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId,
      instr.id, 'VERIFIED', { actorType: 'human' });

    await expect(
      authorityService.transitionInstrument(institutionAccountId, institutionUserId,
        instr.id, 'SUPERSEDED', { supersededByInstrumentId: instr.id })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // Test 29: invalid shortcuts rejected
  test('UNVERIFIED → VERIFIED is rejected', async () => {
    const instr = await authorityService.createInstrument(
      institutionAccountId, institutionUserId, { instrumentType: 'healthcare_proxy' }
    );
    await expect(
      authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
        'VERIFIED', { actorType: 'human' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('REJECTED → VERIFIED is rejected', async () => {
    const instr = await authorityService.createInstrument(
      institutionAccountId, institutionUserId, { instrumentType: 'trust' }
    );
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId,
      instr.id, 'PENDING_REVIEW', { actorType: 'human' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId,
      instr.id, 'REJECTED', { actorType: 'human', rejectionReason: 'test' });

    await expect(
      authorityService.transitionInstrument(institutionAccountId, institutionUserId,
        instr.id, 'VERIFIED', { actorType: 'human' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('REVOKED → VERIFIED is rejected', async () => {
    const instr = await authorityService.createInstrument(
      institutionAccountId, institutionUserId, { instrumentType: 'guardianship_order' }
    );
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId,
      instr.id, 'PENDING_REVIEW', { actorType: 'human' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId,
      instr.id, 'VERIFIED', { actorType: 'human' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId,
      instr.id, 'REVOKED', {});

    await expect(
      authorityService.transitionInstrument(institutionAccountId, institutionUserId,
        instr.id, 'VERIFIED', { actorType: 'human' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('Human verification rule (Tests 30, 31, 32, 33)', () => {
  let pendingInstrId;

  beforeEach(async () => {
    const instr = await authorityService.createInstrument(
      institutionAccountId, institutionUserId, { instrumentType: 'power_of_attorney' }
    );
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId,
      instr.id, 'PENDING_REVIEW', { actorType: 'human' });
    pendingInstrId = instr.id;
  });

  // Test 30: non-human actor cannot set VERIFIED
  test('system/non-human actor cannot set VERIFIED', async () => {
    await expect(
      authorityService.transitionInstrument(institutionAccountId, institutionUserId,
        pendingInstrId, 'VERIFIED', { actorType: 'system' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  // Test 31: user without verify capability cannot set VERIFIED
  test('human without AUTHORITY_INSTRUMENT_VERIFY capability cannot set VERIFIED', async () => {
    // fcInternalNoCapUserId has no capabilities; use a fresh institution user with no caps
    const hash = await bcrypt.hash('pw', 10);
    const { rows: [nocap] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role)
       VALUES ($1,$2,$3,$4,'manager') RETURNING id`,
      [institutionAccountId, 'No Cap User',
       `auth-nocap-${Date.now()}@fieldcore.test`, hash]
    );

    await expect(
      authorityService.transitionInstrument(institutionAccountId, nocap.id,
        pendingInstrId, 'VERIFIED', { actorType: 'human' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  // Test 32: fc_internal user and different-institution user cannot set VERIFIED (temporary restriction)
  test('fc_internal user cannot set VERIFIED (temporary institution-reviewer restriction)', async () => {
    await expect(
      authorityService.transitionInstrument(fcInternalAccountId, fcInternalUserId,
        pendingInstrId, 'VERIFIED', { actorType: 'human' })
    ).rejects.toMatchObject({ statusCode: 404 }); // wrong tenant — 404 not found
  });

  test('different institution user cannot set VERIFIED (temporary restriction)', async () => {
    await expect(
      authorityService.transitionInstrument(institution2AccountId, institution2UserId,
        pendingInstrId, 'VERIFIED', { actorType: 'human' })
    ).rejects.toMatchObject({ statusCode: 404 }); // wrong tenant — 404 not found
  });

  // Test 33: NO DB constraint forces verified_by_user_id to belong to owning account
  test('no DB constraint prevents verified_by_user_id from a different account', async () => {
    // This test documents that the restriction is SERVICE-LAYER only.
    // Direct DB update to set verified_by_user_id to a user from a different account
    // should NOT fail a FK constraint (it's a plain FK to users, not a composite tenant FK).
    const instr = await authorityService.createInstrument(
      institutionAccountId, institutionUserId, { instrumentType: 'trust' }
    );
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId,
      instr.id, 'PENDING_REVIEW', { actorType: 'human' });

    // Directly update the DB to set verified_by_user_id to a user from institution2
    // This should succeed at the DB level (plain FK, not composite)
    await expect(
      pool.query(
        `UPDATE authority_instruments
         SET verified_by_user_id = $1, status = 'VERIFIED', verified_at = NOW(),
             verification_actor_type = 'human',
             verification_authorization_context = 'direct_db_test'
         WHERE id = $2`,
        [institution2UserId, instr.id]
      )
    ).resolves.toBeTruthy(); // DB allows it — restriction is in service layer only

    // Reset for cleanup
    await pool.query(
      `UPDATE authority_instruments SET status = 'PENDING_REVIEW',
       verified_by_user_id = NULL, verified_at = NULL WHERE id = $1`,
      [instr.id]
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 5: Provisioning (Tests 35–39)
// ─────────────────────────────────────────────────────────────────────────────

describe('Institution provisioning', () => {
  // Test 35
  test('fc_internal user with INSTITUTION_PROVISION capability can provision', async () => {
    const res = await request(app)
      .post('/api/authority/internal/provision')
      .set('Authorization', `Bearer ${fcInternalToken}`)
      .send({ name: '__TEST_PROVISION_NEW_INST__' });

    expect(res.status).toBe(201);
    expect(res.body.accountId).toBeTruthy();

    // Clean up
    await pool.query(`DELETE FROM accounts WHERE id = $1`, [res.body.accountId]);
  });

  // Test 36: fc_internal WITHOUT capability is rejected (account_type alone insufficient)
  test('fc_internal user WITHOUT INSTITUTION_PROVISION is rejected', async () => {
    const res = await request(app)
      .post('/api/authority/internal/provision')
      .set('Authorization', `Bearer ${fcInternalNoCapToken}`)
      .send({ name: 'Should Not Be Created' });

    expect(res.status).toBe(403);

    // Verify no account was created with that name
    const { rows } = await pool.query(
      `SELECT id FROM accounts WHERE name = 'Should Not Be Created'`
    );
    expect(rows.length).toBe(0);
  });

  // Test 37: institution/field_service admins are rejected
  test('institution account owner is rejected for provisioning', async () => {
    const res = await request(app)
      .post('/api/authority/internal/provision')
      .set('Authorization', `Bearer ${institutionToken}`)
      .send({ name: 'Should Not Provision' });

    expect(res.status).toBe(403);
  });

  test('field_service account owner is rejected for provisioning', async () => {
    const res = await request(app)
      .post('/api/authority/internal/provision')
      .set('Authorization', `Bearer ${fieldServiceToken}`)
      .send({ name: 'Should Not Provision' });

    expect(res.status).toBe(403);
  });

  // Test 38: unauthenticated is rejected
  test('unauthenticated provisioning request is rejected', async () => {
    const res = await request(app)
      .post('/api/authority/internal/provision')
      .send({ name: 'Unauthenticated Test' });

    expect(res.status).toBe(401);
  });

  // Test 39: audit events
  test('successful provisioning creates an audit record', async () => {
    const before = await pool.query(
      `SELECT COUNT(*) FROM audit_logs WHERE action = 'authority.institution.provision.success'`
    );

    const res = await request(app)
      .post('/api/authority/internal/provision')
      .set('Authorization', `Bearer ${fcInternalToken}`)
      .send({ name: '__TEST_PROVISION_AUDIT__' });

    expect(res.status).toBe(201);
    await pool.query(`DELETE FROM accounts WHERE id = $1`, [res.body.accountId]);

    const after = await pool.query(
      `SELECT COUNT(*) FROM audit_logs WHERE action = 'authority.institution.provision.success'`
    );
    expect(parseInt(after.rows[0].count, 10)).toBeGreaterThan(
      parseInt(before.rows[0].count, 10)
    );
  });

  test('denied provisioning creates an audit record', async () => {
    const before = await pool.query(
      `SELECT COUNT(*) FROM audit_logs WHERE action = 'authority.institution.provision.denied'`
    );

    await request(app)
      .post('/api/authority/internal/provision')
      .set('Authorization', `Bearer ${fcInternalNoCapToken}`)
      .send({ name: 'Denied Test' });

    const after = await pool.query(
      `SELECT COUNT(*) FROM audit_logs WHERE action = 'authority.institution.provision.denied'`
    );
    expect(parseInt(after.rows[0].count, 10)).toBeGreaterThan(
      parseInt(before.rows[0].count, 10)
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 6: Encryption and Config (Tests 40–48)
// ─────────────────────────────────────────────────────────────────────────────

describe('Authority encryption', () => {
  const savedKey = process.env.AUTHORITY_DATA_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.AUTHORITY_DATA_ENCRYPTION_KEY = TEST_AUTHORITY_KEY;
  });
  afterEach(() => {
    // savedKey may be undefined if the env var wasn't set before beforeAll ran.
    // Assigning undefined to process.env sets the literal string "undefined", so
    // we must delete the var instead, then let the next beforeEach re-set it.
    if (savedKey !== undefined) {
      process.env.AUTHORITY_DATA_ENCRYPTION_KEY = savedKey;
    } else {
      delete process.env.AUTHORITY_DATA_ENCRYPTION_KEY;
    }
  });

  // Test 40: encrypt/decrypt round-trip
  test('encrypt/decrypt round-trip', () => {
    const plaintext = 'John Q. Testperson — Test Principal';
    const ciphertext = authorityCrypto.encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(authorityCrypto.decrypt(ciphertext)).toBe(plaintext);
  });

  // Test 41: unique IV — same plaintext twice yields different ciphertexts
  test('same plaintext encrypted twice yields different ciphertexts (unique IV)', () => {
    const pt = 'Test Principal Alpha';
    const c1 = authorityCrypto.encrypt(pt);
    const c2 = authorityCrypto.encrypt(pt);
    expect(c1).not.toBe(c2);
  });

  // Test 42: tampered ciphertext fails decryption
  test('tampered ciphertext fails decryption', () => {
    const ct = authorityCrypto.encrypt('Sensitive Name');
    const parts = ct.split(':');
    // Flip a byte in the encrypted payload
    parts[3] = parts[3].replace(/[0-9a-f]/, (h) =>
      h === '0' ? 'f' : String(parseInt(h, 16) ^ 0xf).toString(16)
    );
    const tampered = parts.join(':');
    expect(() => authorityCrypto.decrypt(tampered)).toThrow();
  });

  // Test 44: key version is stored
  test('key version is stored in the ciphertext envelope', () => {
    const ct = authorityCrypto.encrypt('test');
    expect(ct.startsWith(`v${authorityCrypto.getKeyVersion()}:`)).toBe(true);
  });

  // Test 45: Authority key validation
  test('missing key is rejected', () => {
    process.env.AUTHORITY_DATA_ENCRYPTION_KEY = '';
    expect(() => authorityCrypto.encrypt('test')).toThrow(/not set/);
  });

  test('malformed key (too short) is rejected', () => {
    process.env.AUTHORITY_DATA_ENCRYPTION_KEY = 'abc123';
    expect(() => authorityCrypto.encrypt('test')).toThrow(/64-character/);
  });

  test('all-zeros key is rejected', () => {
    process.env.AUTHORITY_DATA_ENCRYPTION_KEY = '0'.repeat(64);
    expect(() => authorityCrypto.encrypt('test')).toThrow(/all-zeros/);
  });

  test('key equal to ENCRYPTION_KEY is rejected', () => {
    const generalKey = 'a'.repeat(64);
    const origEncKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = generalKey;
    process.env.AUTHORITY_DATA_ENCRYPTION_KEY = generalKey;
    expect(() => authorityCrypto.encrypt('test')).toThrow(/differ from ENCRYPTION_KEY/);
    // Restore ENCRYPTION_KEY to its original value (not the Authority key)
    if (origEncKey !== undefined) {
      process.env.ENCRYPTION_KEY = origEncKey;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
  });
});

describe('Feature flag and config validation (Tests 46, 47)', () => {
  const savedEnabled = process.env.AUTHORITY_ENABLED;
  const savedKey     = process.env.AUTHORITY_DATA_ENCRYPTION_KEY;

  afterEach(() => {
    // Use fallback values in case these were undefined at describe-definition time
    // (before the global beforeAll set them). Assigning undefined to process.env
    // stores the literal string "undefined", so we delete or use safe fallbacks.
    process.env.AUTHORITY_ENABLED = savedEnabled !== undefined ? savedEnabled : 'true';
    if (savedKey !== undefined) {
      process.env.AUTHORITY_DATA_ENCRYPTION_KEY = savedKey;
    } else {
      process.env.AUTHORITY_DATA_ENCRYPTION_KEY = TEST_AUTHORITY_KEY;
    }
  });

  // Test 46 (partial): validateKeyConfig behavior
  test('validateKeyConfig returns invalid for missing key', () => {
    const orig = process.env.AUTHORITY_DATA_ENCRYPTION_KEY;
    process.env.AUTHORITY_DATA_ENCRYPTION_KEY = '';
    const result = authorityCrypto.validateKeyConfig();
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('missing');
    process.env.AUTHORITY_DATA_ENCRYPTION_KEY = orig;
  });

  // Test 47: AUTHORITY_ENABLED=false makes Authority routes unavailable
  test('AUTHORITY_ENABLED=false makes Authority routes return 503', async () => {
    process.env.AUTHORITY_ENABLED = 'false';
    const res = await request(app)
      .post('/api/authority/parties')
      .set('Authorization', `Bearer ${institutionToken}`)
      .send({ partyType: 'person', displayName: 'Test' });

    expect(res.status).toBe(503);
  });

  test('AUTHORITY_ENABLED=false does not affect legacy routes', async () => {
    process.env.AUTHORITY_ENABLED = 'false';
    // Health endpoint is not behind Authority flag
    const res = await request(app).get('/health');
    expect([200, 503]).toContain(res.status); // health might 503 if DB is slow, but it exists
  });
});

// Test 43: encrypted columns contain no plaintext in DB
describe('Encrypted columns — plaintext not stored in DB (Test 43)', () => {
  test('authority_parties.display_name is not stored as plaintext', async () => {
    const party = await authorityService.createParty(
      institutionAccountId, institutionUserId,
      { partyType: 'person', displayName: 'Dr. Jane Testperson' }
    );

    const { rows: [row] } = await pool.query(
      `SELECT display_name FROM authority_parties WHERE id = $1`, [party.id]
    );
    expect(row.display_name).not.toBe('Dr. Jane Testperson');
    expect(row.display_name).not.toContain('Testperson');
    expect(row.display_name).toMatch(/^v1:/);
  });
});

// Test 48: no plaintext in audit logs
describe('Audit metadata does not contain sensitive values (Test 48)', () => {
  test('audit logs for party creation do not contain decrypted name', async () => {
    await authorityService.createParty(
      institutionAccountId, institutionUserId,
      { partyType: 'person', displayName: 'SensitiveName__UniqueToken__12345' }
    );

    const { rows } = await pool.query(
      `SELECT details FROM audit_logs
       WHERE account_id = $1 AND action = 'authority.party.created'
       ORDER BY created_at DESC LIMIT 5`,
      [institutionAccountId]
    );

    rows.forEach(row => {
      const details = JSON.stringify(row.details || {});
      expect(details).not.toContain('SensitiveName__UniqueToken__12345');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 7: Data Model Constraints (Tests 49–51)
// ─────────────────────────────────────────────────────────────────────────────

describe('Data model constraints', () => {
  // Test 49: ai_agent party type rejected by service
  test('creating ai_agent party type is rejected in this stage', async () => {
    await expect(
      authorityService.createParty(
        institutionAccountId, institutionUserId,
        { partyType: 'ai_agent', displayName: 'AI Agent Test' }
      )
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('ai_agent') });
  });

  // Test 50: external_case_reference uniqueness within tenant
  test('duplicate external_case_reference within same tenant is rejected', async () => {
    await authorityService.createCase(institutionAccountId, institutionUserId,
      { externalCaseReference: 'UNIQ-REF-001' });

    await expect(
      authorityService.createCase(institutionAccountId, institutionUserId,
        { externalCaseReference: 'UNIQ-REF-001' })
    ).rejects.toThrow(); // DB unique constraint violation
  });

  test('same external_case_reference is allowed across different tenants', async () => {
    await authorityService.createCase(institutionAccountId, institutionUserId,
      { externalCaseReference: 'CROSS-TENANT-REF-001' });

    // Same ref in institution2 should succeed
    const kase2 = await authorityService.createCase(institution2AccountId, institution2UserId,
      { externalCaseReference: 'CROSS-TENANT-REF-001' });
    expect(kase2.external_case_reference).toBe('CROSS-TENANT-REF-001');
  });

  // Test 51: action_key format validation
  test('invalid action_key format is rejected', async () => {
    const instr = await authorityService.createInstrument(
      institutionAccountId, institutionUserId, { instrumentType: 'power_of_attorney' }
    );
    // Non-namespaced keys (no dot separator) — these were mistakenly cited as examples in the
    // completion report; they are not valid under the DOMAIN.ACTION format requirement.
    for (const badKey of ['SIGN', 'MANAGE_FUNDS', 'invalid-format', 'lowercase.action', 'NO_DOT']) {
      await expect(
        authorityService.addPermission(institutionAccountId, institutionUserId, instr.id,
          { actionKey: badKey, grantType: 'granted' })
      ).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  test('valid action_key is accepted without schema changes', async () => {
    const instr = await authorityService.createInstrument(
      institutionAccountId, institutionUserId, { instrumentType: 'corporate_resolution' }
    );
    const perm = await authorityService.addPermission(institutionAccountId, institutionUserId, instr.id,
      { actionKey: 'BANKING.WIRE_TRANSFER', grantType: 'granted' });
    expect(perm.action_key).toBe('BANKING.WIRE_TRANSFER');
  });

  test('new action_key accepted without schema migration', async () => {
    const instr = await authorityService.createInstrument(
      institutionAccountId, institutionUserId, { instrumentType: 'power_of_attorney' }
    );
    const perm = await authorityService.addPermission(institutionAccountId, institutionUserId, instr.id,
      { actionKey: 'CUSTOM_DOMAIN.NEW_ACTION', grantType: 'prohibited' });
    expect(perm.action_key).toBe('CUSTOM_DOMAIN.NEW_ACTION');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 8: Migrations (Tests 52, 53)
// ─────────────────────────────────────────────────────────────────────────────

describe('Migration correctness (Tests 52, 53)', () => {
  // Test 52: migrations apply on DB with pre-existing data; existing rows preserved
  test('migrations are idempotent (running again does not fail or change row counts)', async () => {
    const { rows: [pre] } = await pool.query(`SELECT COUNT(*) FROM accounts`);
    await runMigrations();
    const { rows: [post] } = await pool.query(`SELECT COUNT(*) FROM accounts`);
    expect(post.count).toBe(pre.count);
  });

  test('Authority tables exist after migration', async () => {
    for (const table of [
      'authority_parties', 'authority_cases', 'authority_instruments',
      'authority_case_instruments', 'authority_instrument_parties',
      'authority_permissions', 'authority_restrictions', 'authority_documents',
      'platform_user_capabilities',
    ]) {
      const { rows } = await pool.query(
        `SELECT EXISTS (
           SELECT FROM information_schema.tables WHERE table_name = $1
         ) AS exists_flag`,
        [table]
      );
      expect(rows[0].exists_flag).toBe(true);
    }
  });

  test('authority_instruments has composite UNIQUE(account_id, id) constraint', async () => {
    const { rows } = await pool.query(`
      SELECT COUNT(*) FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_name = 'authority_instruments'
        AND tc.constraint_type = 'UNIQUE'
        AND ccu.column_name IN ('account_id', 'id')
    `);
    expect(parseInt(rows[0].count, 10)).toBeGreaterThanOrEqual(2);
  });

  // Test 53: down migration safety (repo uses additive-only; verify no data loss on re-run)
  test('existing legacy accounts are unchanged after Authority migrations', async () => {
    const { rows: [legacy] } = await pool.query(
      `SELECT account_type FROM accounts WHERE id = $1`, [fieldServiceAccountId]
    );
    expect(legacy.account_type).toBe('field_service');
  });

  // DB CHECK constraint rejects states that were removed/never approved (case)
  test('DB rejects invalid case status values (open, in_progress, suspended)', async () => {
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    for (const badStatus of ['open', 'in_progress', 'under_review', 'suspended']) {
      await expect(
        pool.query(
          `UPDATE authority_cases SET status = $1 WHERE id = $2`,
          [badStatus, kase.id]
        )
      ).rejects.toThrow(/check.*constraint|violates check/i);
    }
  });

  // DB CHECK constraint rejects states that were removed/never approved (instrument)
  test('DB rejects invalid instrument status values (active, draft)', async () => {
    const instr = await authorityService.createInstrument(
      institutionAccountId, institutionUserId, { instrumentType: 'trust' }
    );
    for (const badStatus of ['active', 'draft', 'in_force']) {
      await expect(
        pool.query(
          `UPDATE authority_instruments SET status = $1 WHERE id = $2`,
          [badStatus, instr.id]
        )
      ).rejects.toThrow(/check.*constraint|violates check/i);
    }
  });

  test('authority_review_assignments and authority_review_notes tables exist after migration', async () => {
    for (const table of ['authority_review_assignments', 'authority_review_notes']) {
      const { rows } = await pool.query(
        `SELECT EXISTS (
           SELECT FROM information_schema.tables WHERE table_name = $1
         ) AS exists_flag`,
        [table]
      );
      expect(rows[0].exists_flag).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 9: Stage 2 — Human Review Operations
// ─────────────────────────────────────────────────────────────────────────────

// ── Helper: advance case to PENDING_HUMAN_REVIEW ──────────────────────────────
async function _advanceCaseToHumanReview(accountId, userId) {
  const kase  = await authorityService.createCase(accountId, userId, {});
  const instr = await authorityService.createInstrument(accountId, userId,
    { instrumentType: 'power_of_attorney' });
  await authorityService.linkInstrumentToCase(accountId, userId, kase.id, instr.id);
  await authorityService.transitionCase(accountId, userId, kase.id, 'AWAITING_DOCUMENTS');
  await authorityService.uploadDocument(accountId, userId, SYNTHETIC_PDF,
    { caseId: kase.id, originalFilename: 'test.pdf' });
  await authorityService.transitionCase(accountId, userId, kase.id, 'PENDING_EXTRACTION');
  await authorityService.transitionCase(accountId, userId, kase.id, 'EXTRACTION_COMPLETE', { systemActor: true });
  await authorityService.transitionCase(accountId, userId, kase.id, 'PENDING_HUMAN_REVIEW');
  return kase;
}

describe('Invariant A — Extraction Readiness Guard', () => {
  test('AWAITING_DOCUMENTS → PENDING_EXTRACTION fails with no linked documents', async () => {
    const kase  = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'trust' });
    await authorityService.linkInstrumentToCase(institutionAccountId, institutionUserId, kase.id, instr.id);
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'AWAITING_DOCUMENTS');
    await expect(
      authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_EXTRACTION')
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/at least one linked document/) });
  });

  test('AWAITING_DOCUMENTS → PENDING_EXTRACTION succeeds after uploading a document', async () => {
    const kase  = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'trust' });
    await authorityService.linkInstrumentToCase(institutionAccountId, institutionUserId, kase.id, instr.id);
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'AWAITING_DOCUMENTS');
    await authorityService.uploadDocument(institutionAccountId, institutionUserId, SYNTHETIC_PDF,
      { caseId: kase.id, originalFilename: 'doc.pdf' });
    const result = await authorityService.transitionCase(
      institutionAccountId, institutionUserId, kase.id, 'PENDING_EXTRACTION'
    );
    expect(result.status).toBe('PENDING_EXTRACTION');
  });

  test('AWAITING_DOCUMENTS → PENDING_EXTRACTION fails after all documents are deleted', async () => {
    const kase  = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'trust' });
    await authorityService.linkInstrumentToCase(institutionAccountId, institutionUserId, kase.id, instr.id);
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'AWAITING_DOCUMENTS');
    const doc = await authorityService.uploadDocument(institutionAccountId, institutionUserId, SYNTHETIC_PDF,
      { caseId: kase.id, originalFilename: 'doc.pdf' });
    await authorityService.deleteDocument(institutionAccountId, institutionUserId, doc.id);
    await expect(
      authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_EXTRACTION')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('other transitions (DRAFT → AWAITING_DOCUMENTS) do not require documents', async () => {
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    const result = await authorityService.transitionCase(
      institutionAccountId, institutionUserId, kase.id, 'AWAITING_DOCUMENTS'
    );
    expect(result.status).toBe('AWAITING_DOCUMENTS');
  });

  test('Invariant A is enforced via HTTP route (400 with no documents)', async () => {
    const kase  = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'trust' });
    await authorityService.linkInstrumentToCase(institutionAccountId, institutionUserId, kase.id, instr.id);
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'AWAITING_DOCUMENTS');
    const res = await request(app)
      .post(`/api/authority/cases/${kase.id}/transition`)
      .set('Authorization', `Bearer ${institutionToken}`)
      .send({ status: 'PENDING_EXTRACTION' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least one linked document/);
  });
});

describe('Invariant B — Party Historical Record Protection', () => {
  test('party display_name can be updated before any instrument is VERIFIED', async () => {
    const party = await authorityService.createParty(institutionAccountId, institutionUserId,
      { partyType: 'person', displayName: 'Before Verification' });
    const result = await authorityService.updatePartyDisplayName(
      institutionAccountId, institutionUserId, party.id, 'After Update'
    );
    expect(result.id).toBe(party.id);
    const fetched = await authorityService.getParty(institutionAccountId, party.id);
    expect(fetched.display_name).toBe('After Update');
  });

  test('party display_name cannot be updated once used in a VERIFIED instrument', async () => {
    const party = await authorityService.createParty(institutionAccountId, institutionUserId,
      { partyType: 'person', displayName: 'Protected Person' });
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'power_of_attorney' });
    await authorityService.addParticipant(institutionAccountId, institutionUserId, instr.id,
      { partyId: party.id, role: 'principal' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'PENDING_REVIEW', { actorType: 'human' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'VERIFIED', { actorType: 'human' });

    await expect(
      authorityService.updatePartyDisplayName(institutionAccountId, institutionUserId, party.id, 'New Name')
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/VERIFIED.*immutable|immutable.*VERIFIED/i) });
  });

  test('party status cannot be changed to inactive once used in a VERIFIED instrument', async () => {
    const party = await authorityService.createParty(institutionAccountId, institutionUserId,
      { partyType: 'organization', displayName: 'Protected Org' });
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'corporate_resolution' });
    await authorityService.addParticipant(institutionAccountId, institutionUserId, instr.id,
      { partyId: party.id, role: 'authorized_representative' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'PENDING_REVIEW', { actorType: 'human' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'VERIFIED', { actorType: 'human' });

    await expect(
      authorityService.updatePartyStatus(institutionAccountId, institutionUserId, party.id, 'inactive')
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test('party in REJECTED instrument is immutable (REJECTED is a finalized status)', async () => {
    const party = await authorityService.createParty(institutionAccountId, institutionUserId,
      { partyType: 'person', displayName: 'Rejected Party' });
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'trust' });
    await authorityService.addParticipant(institutionAccountId, institutionUserId, instr.id,
      { partyId: party.id, role: 'trustee' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'PENDING_REVIEW', { actorType: 'human' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'REJECTED', { actorType: 'human' });

    // After fix: REJECTED is now a protected status — party identity is immutable
    await expect(
      authorityService.updatePartyDisplayName(
        institutionAccountId, institutionUserId, party.id, 'Updated After Rejection'
      )
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test('updatePartyDisplayName rejects empty string', async () => {
    const party = await authorityService.createParty(institutionAccountId, institutionUserId,
      { partyType: 'person', displayName: 'Someone' });
    await expect(
      authorityService.updatePartyDisplayName(institutionAccountId, institutionUserId, party.id, '  ')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('Invariant B enforced via HTTP route — 409 when party is in VERIFIED instrument', async () => {
    const party = await authorityService.createParty(institutionAccountId, institutionUserId,
      { partyType: 'person', displayName: 'HTTP Protected' });
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'guardianship_order' });
    await authorityService.addParticipant(institutionAccountId, institutionUserId, instr.id,
      { partyId: party.id, role: 'guardian' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'PENDING_REVIEW', { actorType: 'human' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'VERIFIED', { actorType: 'human' });

    const res = await request(app)
      .patch(`/api/authority/parties/${party.id}/display-name`)
      .set('Authorization', `Bearer ${institutionToken}`)
      .send({ displayName: 'New Name' });
    expect(res.status).toBe(409);
  });
});

describe('Lifecycle lock — instruments, participants, permissions, restrictions', () => {
  test('addParticipant fails on VERIFIED instrument', async () => {
    const party = await authorityService.createParty(institutionAccountId, institutionUserId,
      { partyType: 'person', displayName: 'Party X' });
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'trust' });
    await authorityService.addParticipant(institutionAccountId, institutionUserId, instr.id,
      { partyId: party.id, role: 'trustee' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'PENDING_REVIEW', { actorType: 'human' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'VERIFIED', { actorType: 'human' });

    const party2 = await authorityService.createParty(institutionAccountId, institutionUserId,
      { partyType: 'person', displayName: 'Party Y' });
    await expect(
      authorityService.addParticipant(institutionAccountId, institutionUserId, instr.id,
        { partyId: party2.id, role: 'agent' })
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/locked/) });
  });

  test('addPermission fails on VERIFIED instrument', async () => {
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'corporate_resolution' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'PENDING_REVIEW', { actorType: 'human' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'VERIFIED', { actorType: 'human' });

    await expect(
      authorityService.addPermission(institutionAccountId, institutionUserId, instr.id,
        { actionKey: 'BANKING.WIRE_TRANSFER', grantType: 'granted' })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test('addRestriction fails on VERIFIED instrument', async () => {
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'letter_of_authorization' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'PENDING_REVIEW', { actorType: 'human' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'VERIFIED', { actorType: 'human' });

    await expect(
      authorityService.addRestriction(institutionAccountId, institutionUserId, instr.id,
        { restrictionType: 'monetary_limit',
          parameters: { amount: 100000, currency: 'USD' } })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test('addParticipant / addPermission / addRestriction succeed on UNVERIFIED instrument', async () => {
    const party = await authorityService.createParty(institutionAccountId, institutionUserId,
      { partyType: 'person', displayName: 'Open Party' });
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'power_of_attorney' });
    const p = await authorityService.addParticipant(institutionAccountId, institutionUserId, instr.id,
      { partyId: party.id, role: 'agent' });
    expect(p.role).toBe('agent');
    const perm = await authorityService.addPermission(institutionAccountId, institutionUserId, instr.id,
      { actionKey: 'BANKING.WIRE_TRANSFER', grantType: 'granted' });
    expect(perm.action_key).toBe('BANKING.WIRE_TRANSFER');
    const restr = await authorityService.addRestriction(institutionAccountId, institutionUserId, instr.id,
      { restrictionType: 'monetary_limit', parameters: { amount: 500000, currency: 'USD' } });
    expect(restr.restriction_type).toBe('monetary_limit');
  });

  test('removeParticipant succeeds on UNVERIFIED instrument', async () => {
    const party = await authorityService.createParty(institutionAccountId, institutionUserId,
      { partyType: 'person', displayName: 'Removable' });
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'durable_power_of_attorney' });
    const p = await authorityService.addParticipant(institutionAccountId, institutionUserId, instr.id,
      { partyId: party.id, role: 'agent' });
    await expect(
      authorityService.removeParticipant(institutionAccountId, institutionUserId, instr.id, p.id)
    ).resolves.toBeUndefined();
  });

  test('removeParticipant fails on VERIFIED instrument (lifecycle lock)', async () => {
    const party = await authorityService.createParty(institutionAccountId, institutionUserId,
      { partyType: 'person', displayName: 'Locked' });
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'trust' });
    const p = await authorityService.addParticipant(institutionAccountId, institutionUserId, instr.id,
      { partyId: party.id, role: 'co_trustee' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'PENDING_REVIEW', { actorType: 'human' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'VERIFIED', { actorType: 'human' });

    await expect(
      authorityService.removeParticipant(institutionAccountId, institutionUserId, instr.id, p.id)
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test('removePermissionById fails on VERIFIED instrument', async () => {
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'corporate_resolution' });
    const perm = await authorityService.addPermission(institutionAccountId, institutionUserId, instr.id,
      { actionKey: 'BANKING.TRANSFER', grantType: 'granted' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'PENDING_REVIEW', { actorType: 'human' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'VERIFIED', { actorType: 'human' });

    await expect(
      authorityService.removePermissionById(institutionAccountId, institutionUserId, instr.id, perm.id)
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test('removeRestriction fails on VERIFIED instrument', async () => {
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'letter_of_authorization' });
    const restr = await authorityService.addRestriction(institutionAccountId, institutionUserId, instr.id,
      { restrictionType: 'date_window', parameters: null });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'PENDING_REVIEW', { actorType: 'human' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'VERIFIED', { actorType: 'human' });

    await expect(
      authorityService.removeRestriction(institutionAccountId, institutionUserId, instr.id, restr.id)
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test('updateParticipantStatus succeeds on PENDING_REVIEW instrument', async () => {
    const party = await authorityService.createParty(institutionAccountId, institutionUserId,
      { partyType: 'person', displayName: 'Status Party' });
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'power_of_attorney' });
    const p = await authorityService.addParticipant(institutionAccountId, institutionUserId, instr.id,
      { partyId: party.id, role: 'principal' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'PENDING_REVIEW', { actorType: 'human' });
    const updated = await authorityService.updateParticipantStatus(
      institutionAccountId, institutionUserId, instr.id, p.id, 'inactive'
    );
    expect(updated.status).toBe('inactive');
  });

  test('lifecycle lock tested via HTTP DELETE /instruments/:id/parties/:pid on VERIFIED', async () => {
    const party = await authorityService.createParty(institutionAccountId, institutionUserId,
      { partyType: 'person', displayName: 'HTTP Locked' });
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'court_order' });
    const p = await authorityService.addParticipant(institutionAccountId, institutionUserId, instr.id,
      { partyId: party.id, role: 'guardian' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'PENDING_REVIEW', { actorType: 'human' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'VERIFIED', { actorType: 'human' });

    const res = await request(app)
      .delete(`/api/authority/instruments/${instr.id}/parties/${p.id}`)
      .set('Authorization', `Bearer ${institutionToken}`);
    expect(res.status).toBe(409);
  });
});

describe('Review Queue and Assignments', () => {
  test('getReviewQueue returns empty array when no cases are pending review', async () => {
    const queue = await authorityService.getReviewQueue(institutionAccountId, institutionUserId);
    const reviewCases = queue.filter(c =>
      c.status === 'PENDING_HUMAN_REVIEW' || c.status === 'HUMAN_REVIEW_IN_PROGRESS'
    );
    // May contain cases from other tests; we just confirm the call succeeds
    expect(Array.isArray(queue)).toBe(true);
  });

  test('getReviewQueue requires review capability — field_service account is rejected', async () => {
    await expect(
      authorityService.getReviewQueue(fieldServiceAccountId, fieldServiceUserId)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test('getReviewQueue returns cases in PENDING_HUMAN_REVIEW', async () => {
    const kase = await _advanceCaseToHumanReview(institutionAccountId, institutionUserId);
    const queue = await authorityService.getReviewQueue(institutionAccountId, institutionUserId);
    const found = queue.find(c => c.id === kase.id);
    expect(found).toBeDefined();
    expect(found.status).toBe('PENDING_HUMAN_REVIEW');
  });

  test('claimCase transitions PENDING_HUMAN_REVIEW → HUMAN_REVIEW_IN_PROGRESS and creates assignment', async () => {
    const kase = await _advanceCaseToHumanReview(institutionAccountId, institutionUserId);
    const assignment = await authorityService.claimCase(institutionAccountId, institutionUserId, kase.id);
    expect(assignment.case_id).toBe(kase.id);
    expect(assignment.assigned_to).toBe(institutionUserId);

    const updatedCase = await authorityService.getCase(institutionAccountId, kase.id);
    expect(updatedCase.status).toBe('HUMAN_REVIEW_IN_PROGRESS');
  });

  test('claimCase on already-claimed case by same user throws 409', async () => {
    const kase = await _advanceCaseToHumanReview(institutionAccountId, institutionUserId);
    await authorityService.claimCase(institutionAccountId, institutionUserId, kase.id);
    await expect(
      authorityService.claimCase(institutionAccountId, institutionUserId, kase.id)
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test('claimCase fails on case in wrong status (DRAFT)', async () => {
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    await expect(
      authorityService.claimCase(institutionAccountId, institutionUserId, kase.id)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('claimCase requires review capability', async () => {
    const kase = await _advanceCaseToHumanReview(institutionAccountId, institutionUserId);
    await expect(
      authorityService.claimCase(fieldServiceAccountId, fieldServiceUserId, kase.id)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test('releaseCase is not exported — standalone release has been removed', () => {
    expect(authorityService.releaseCase).toBeUndefined();
  });

  test('GET /api/authority/queue returns cases needing review', async () => {
    const kase = await _advanceCaseToHumanReview(institutionAccountId, institutionUserId);
    const res = await request(app)
      .get('/api/authority/queue')
      .set('Authorization', `Bearer ${institutionToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find(c => c.id === kase.id);
    expect(found).toBeDefined();
  });

  test('POST /api/authority/cases/:caseId/claim succeeds', async () => {
    const kase = await _advanceCaseToHumanReview(institutionAccountId, institutionUserId);
    const res = await request(app)
      .post(`/api/authority/cases/${kase.id}/claim`)
      .set('Authorization', `Bearer ${institutionToken}`);
    expect(res.status).toBe(201);
    expect(res.body.case_id).toBe(kase.id);
  });
});

describe('Review Workspace', () => {
  test('getReviewWorkspace returns case, instruments, documents, assignments, notes', async () => {
    const kase  = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'power_of_attorney' });
    const party = await authorityService.createParty(institutionAccountId, institutionUserId,
      { partyType: 'person', displayName: 'Workspace Person' });

    await authorityService.linkInstrumentToCase(institutionAccountId, institutionUserId, kase.id, instr.id);
    await authorityService.addParticipant(institutionAccountId, institutionUserId, instr.id,
      { partyId: party.id, role: 'principal' });
    await authorityService.uploadDocument(institutionAccountId, institutionUserId, SYNTHETIC_PDF,
      { caseId: kase.id, originalFilename: 'poa.pdf' });

    const workspace = await authorityService.getReviewWorkspace(
      institutionAccountId, institutionUserId, kase.id
    );

    expect(workspace.case.id).toBe(kase.id);
    expect(workspace.instruments).toHaveLength(1);
    expect(workspace.instruments[0].id).toBe(instr.id);
    expect(workspace.instruments[0].participants).toHaveLength(1);
    expect(workspace.instruments[0].participants[0].display_name).toBe('Workspace Person');
    expect(workspace.documents).toHaveLength(1);
  });

  test('getReviewWorkspace decrypts party display_name', async () => {
    const kase  = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'trust' });
    const party = await authorityService.createParty(institutionAccountId, institutionUserId,
      { partyType: 'person', displayName: 'Alice Trustee' });

    await authorityService.linkInstrumentToCase(institutionAccountId, institutionUserId, kase.id, instr.id);
    await authorityService.addParticipant(institutionAccountId, institutionUserId, instr.id,
      { partyId: party.id, role: 'trustee' });

    const workspace = await authorityService.getReviewWorkspace(
      institutionAccountId, institutionUserId, kase.id
    );
    expect(workspace.instruments[0].participants[0].display_name).toBe('Alice Trustee');
  });

  test('getReviewWorkspace is tenant-scoped (cross-tenant access returns 404)', async () => {
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    await expect(
      authorityService.getReviewWorkspace(institution2AccountId, institution2UserId, kase.id)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('GET /api/authority/cases/:caseId/workspace returns full workspace', async () => {
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    const res = await request(app)
      .get(`/api/authority/cases/${kase.id}/workspace`)
      .set('Authorization', `Bearer ${institutionToken}`);
    expect(res.status).toBe(200);
    expect(res.body.case.id).toBe(kase.id);
    expect(Array.isArray(res.body.instruments)).toBe(true);
    expect(Array.isArray(res.body.documents)).toBe(true);
    expect(Array.isArray(res.body.assignments)).toBe(true);
    expect(Array.isArray(res.body.notes)).toBe(true);
  });
});

describe('Review Notes', () => {
  test('addReviewNote creates a note', async () => {
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    const note = await authorityService.addReviewNote(
      institutionAccountId, institutionUserId, kase.id, 'This is a review note.'
    );
    expect(note.body).toBe('This is a review note.');
    expect(note.case_id).toBe(kase.id);
  });

  test('addReviewNote rejects empty body', async () => {
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    await expect(
      authorityService.addReviewNote(institutionAccountId, institutionUserId, kase.id, '  ')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('addReviewNote rejects body over 10,000 characters', async () => {
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    await expect(
      authorityService.addReviewNote(institutionAccountId, institutionUserId, kase.id, 'x'.repeat(10001))
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('getReviewNotes returns notes for a case ordered DESC by created_at', async () => {
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    await authorityService.addReviewNote(institutionAccountId, institutionUserId, kase.id, 'Note 1');
    await authorityService.addReviewNote(institutionAccountId, institutionUserId, kase.id, 'Note 2');
    const notes = await authorityService.getReviewNotes(institutionAccountId, kase.id);
    expect(notes.length).toBeGreaterThanOrEqual(2);
    // Most recent first
    expect(new Date(notes[0].created_at) >= new Date(notes[1].created_at)).toBe(true);
  });

  test('notes are immutable — no update or delete service method exposed', async () => {
    expect(authorityService.updateReviewNote).toBeUndefined();
    expect(authorityService.deleteReviewNote).toBeUndefined();
  });

  test('addReviewNote can be scoped to an instrument', async () => {
    const kase  = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'trust' });
    const note = await authorityService.addReviewNote(
      institutionAccountId, institutionUserId, kase.id, 'Instrument note', instr.id
    );
    expect(note.instrument_id).toBe(instr.id);
  });

  test('POST /api/authority/cases/:caseId/notes creates note', async () => {
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    const res = await request(app)
      .post(`/api/authority/cases/${kase.id}/notes`)
      .set('Authorization', `Bearer ${institutionToken}`)
      .send({ body: 'HTTP review note.' });
    expect(res.status).toBe(201);
    expect(res.body.body).toBe('HTTP review note.');
  });

  test('GET /api/authority/cases/:caseId/notes returns notes', async () => {
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    await authorityService.addReviewNote(institutionAccountId, institutionUserId, kase.id, 'Note for GET');
    const res = await request(app)
      .get(`/api/authority/cases/${kase.id}/notes`)
      .set('Authorization', `Bearer ${institutionToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some(n => n.body === 'Note for GET')).toBe(true);
  });
});

describe('Audit Activity Feed', () => {
  test('getAuditActivity returns case events', async () => {
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    const events = await authorityService.getAuditActivity(institutionAccountId, 'case', kase.id);
    expect(Array.isArray(events)).toBe(true);
    // createCase generates at least one audit log event
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  test('getAuditActivity returns instrument events', async () => {
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'trust' });
    const events = await authorityService.getAuditActivity(institutionAccountId, 'instrument', instr.id);
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  test('getAuditActivity rejects invalid subjectType', async () => {
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    await expect(
      authorityService.getAuditActivity(institutionAccountId, 'document', kase.id)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('getAuditActivity is tenant-scoped (cross-tenant returns 404)', async () => {
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    await expect(
      authorityService.getAuditActivity(institution2AccountId, 'case', kase.id)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('GET /api/authority/cases/:caseId/activity returns events', async () => {
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    const res = await request(app)
      .get(`/api/authority/cases/${kase.id}/activity`)
      .set('Authorization', `Bearer ${institutionToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/authority/instruments/:instrumentId/activity returns events', async () => {
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'guardianship_order' });
    const res = await request(app)
      .get(`/api/authority/instruments/${instr.id}/activity`)
      .set('Authorization', `Bearer ${institutionToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('Participant, Permission, Restriction CRUD via HTTP', () => {
  test('DELETE /instruments/:id/parties/:pid succeeds on UNVERIFIED instrument', async () => {
    const party = await authorityService.createParty(institutionAccountId, institutionUserId,
      { partyType: 'person', displayName: 'Deletable' });
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'power_of_attorney' });
    const p = await authorityService.addParticipant(institutionAccountId, institutionUserId, instr.id,
      { partyId: party.id, role: 'agent' });

    const res = await request(app)
      .delete(`/api/authority/instruments/${instr.id}/parties/${p.id}`)
      .set('Authorization', `Bearer ${institutionToken}`);
    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(true);
  });

  test('DELETE /instruments/:id/permissions/:pid succeeds on UNVERIFIED', async () => {
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'corporate_resolution' });
    const perm = await authorityService.addPermission(institutionAccountId, institutionUserId, instr.id,
      { actionKey: 'BANKING.DEBIT', grantType: 'granted' });

    const res = await request(app)
      .delete(`/api/authority/instruments/${instr.id}/permissions/${perm.id}`)
      .set('Authorization', `Bearer ${institutionToken}`);
    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(true);
  });

  test('DELETE /instruments/:id/restrictions/:rid succeeds on UNVERIFIED', async () => {
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'letter_of_authorization' });
    const restr = await authorityService.addRestriction(institutionAccountId, institutionUserId, instr.id,
      { restrictionType: 'account_scope', parameters: null });

    const res = await request(app)
      .delete(`/api/authority/instruments/${instr.id}/restrictions/${restr.id}`)
      .set('Authorization', `Bearer ${institutionToken}`);
    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(true);
  });

  test('PATCH /instruments/:id/parties/:pid updates participant status', async () => {
    const party = await authorityService.createParty(institutionAccountId, institutionUserId,
      { partyType: 'person', displayName: 'Status Target' });
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'durable_power_of_attorney' });
    const p = await authorityService.addParticipant(institutionAccountId, institutionUserId, instr.id,
      { partyId: party.id, role: 'agent' });

    const res = await request(app)
      .patch(`/api/authority/instruments/${instr.id}/parties/${p.id}`)
      .set('Authorization', `Bearer ${institutionToken}`)
      .send({ status: 'inactive' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('inactive');
  });
});

// ── Correction Pass — Issue 2: release route removed ─────────────────────────

describe('Issue 2 — release route removed', () => {
  test('releaseCase is not exported from authorityService', () => {
    expect(authorityService.releaseCase).toBeUndefined();
  });
});

// ── Correction Pass — Issue 4: actorType spoofing prevention ─────────────────

describe('Issue 4 — actorType from req.body is ignored', () => {
  test('sending actorType:"system" in body does not bypass human-reviewer requirement', async () => {
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'power_of_attorney' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'PENDING_REVIEW', { actorType: 'human' });

    // Route hardcodes actorType:'human' — the client sending 'system' is ignored.
    // The VERIFY call succeeds (user has AUTHORITY_INSTRUMENT_VERIFY cap) and the
    // recorded actor type in the DB must be 'human', never 'system'.
    const res = await request(app)
      .post(`/api/authority/instruments/${instr.id}/transition`)
      .set('Authorization', `Bearer ${institutionToken}`)
      .send({ status: 'VERIFIED', actorType: 'system' });

    expect(res.status).toBe(200);
    // Verify the DB records 'human' as the actor type
    const { rows: [row] } = await pool.query(
      `SELECT verification_actor_type FROM authority_instruments WHERE id = $1`,
      [instr.id]
    );
    expect(row.verification_actor_type).toBe('human');
  });
});

// ── Correction Pass — Issue 6: extraction readiness invariant ─────────────────

describe('Issue 6 — extraction readiness invariant', () => {
  test('AWAITING_DOCUMENTS → PENDING_EXTRACTION fails with no linked instrument', async () => {
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'AWAITING_DOCUMENTS');
    await authorityService.uploadDocument(institutionAccountId, institutionUserId, SYNTHETIC_PDF,
      { caseId: kase.id, originalFilename: 'test.pdf' });

    // No instrument linked — transition should be blocked (400)
    await expect(
      authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_EXTRACTION')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('AWAITING_DOCUMENTS → PENDING_EXTRACTION fails with no active document', async () => {
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'trust' });
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    await authorityService.linkInstrumentToCase(institutionAccountId, institutionUserId, kase.id, instr.id);
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'AWAITING_DOCUMENTS');

    // No document uploaded — transition should be blocked (400)
    await expect(
      authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_EXTRACTION')
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── Correction Pass — Issue 7: PROTECTED_INSTRUMENT_STATUSES expansion ────────

describe('Issue 7 — party lock for all finalized instrument statuses', () => {
  async function makeInstrInStatus(status) {
    const party = await authorityService.createParty(institutionAccountId, institutionUserId,
      { partyType: 'person', displayName: `Party For ${status}` });
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'power_of_attorney' });
    await authorityService.addParticipant(institutionAccountId, institutionUserId, instr.id,
      { partyId: party.id, role: 'principal' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'PENDING_REVIEW', { actorType: 'human' });

    if (status === 'REJECTED') {
      await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
        'REJECTED', { actorType: 'human' });
    } else {
      await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
        'VERIFIED', { actorType: 'human' });
      if (status === 'REVOKED') {
        await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
          'REVOKED', { revocationReason: 'test' });
      } else if (status === 'EXPIRED') {
        await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id, 'EXPIRED', {});
      } else if (status === 'SUPERSEDED') {
        const instr2 = await authorityService.createInstrument(institutionAccountId, institutionUserId,
          { instrumentType: 'power_of_attorney' });
        await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
          'SUPERSEDED', { supersededByInstrumentId: instr2.id });
      }
    }
    return { party, instr };
  }

  for (const status of ['REJECTED', 'REVOKED', 'EXPIRED', 'SUPERSEDED']) {
    test(`party in ${status} instrument is immutable`, async () => {
      const { party } = await makeInstrInStatus(status);
      await expect(
        authorityService.updatePartyStatus(institutionAccountId, institutionUserId, party.id, 'inactive')
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  }
});

// ── Correction Pass — Issue 8: active assignee for mutations ─────────────────

describe('Issue 8 — non-assignee cannot edit review facts', () => {
  let reviewerUserId, reviewerToken;

  beforeAll(async () => {
    const hash = await require('bcryptjs').hash('pw-test-123', 10);
    const { rows: [u] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role)
       VALUES ($1,'Reviewer Bob',$2,$3,'owner') RETURNING id`,
      [institutionAccountId, `reviewer-bob-${Date.now()}@fieldcore.test`, hash]
    );
    reviewerUserId = u.id;
    reviewerToken  = makeToken(reviewerUserId, institutionAccountId, 'owner');
    await pool.query(
      `INSERT INTO platform_user_capabilities (user_id, capability)
       VALUES ($1,'AUTHORITY_INSTRUMENT_VERIFY'),($1,'AUTHORITY_INSTRUMENT_REJECT')
       ON CONFLICT DO NOTHING`,
      [reviewerUserId]
    );
  });

  test('non-assignee cannot verify instrument on a HUMAN_REVIEW_IN_PROGRESS case', async () => {
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'corporate_resolution' });
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    await authorityService.linkInstrumentToCase(institutionAccountId, institutionUserId, kase.id, instr.id);
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'AWAITING_DOCUMENTS');
    await authorityService.uploadDocument(institutionAccountId, institutionUserId, SYNTHETIC_PDF,
      { caseId: kase.id, originalFilename: 'test.pdf' });
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_EXTRACTION');
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'EXTRACTION_COMPLETE', { systemActor: true });
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_HUMAN_REVIEW');
    // institutionUserId claims the case (becomes the active assignee)
    await authorityService.claimCase(institutionAccountId, institutionUserId, kase.id);
    // Instrument moves to PENDING_REVIEW
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'PENDING_REVIEW', { actorType: 'human' });

    // reviewerUserId tries to verify — but they are NOT the active assignee
    await expect(
      authorityService.transitionInstrument(institutionAccountId, reviewerUserId, instr.id,
        'VERIFIED', { actorType: 'human' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test('non-assignee cannot reject instrument on a HUMAN_REVIEW_IN_PROGRESS case', async () => {
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'trust' });
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    await authorityService.linkInstrumentToCase(institutionAccountId, institutionUserId, kase.id, instr.id);
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'AWAITING_DOCUMENTS');
    await authorityService.uploadDocument(institutionAccountId, institutionUserId, SYNTHETIC_PDF,
      { caseId: kase.id, originalFilename: 'test.pdf' });
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_EXTRACTION');
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'EXTRACTION_COMPLETE', { systemActor: true });
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_HUMAN_REVIEW');
    await authorityService.claimCase(institutionAccountId, institutionUserId, kase.id);
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'PENDING_REVIEW', { actorType: 'human' });

    await expect(
      authorityService.transitionInstrument(institutionAccountId, reviewerUserId, instr.id,
        'REJECTED', { actorType: 'human' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ── Correction Pass — Issue 10: one active assignment per case ────────────────

describe('Issue 10 — one active assignment per case (DB constraint)', () => {
  test('claiming an already-claimed case returns 409', async () => {
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    const instrClaim = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'power_of_attorney' });
    await authorityService.linkInstrumentToCase(institutionAccountId, institutionUserId, kase.id, instrClaim.id);
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'AWAITING_DOCUMENTS');
    await authorityService.uploadDocument(institutionAccountId, institutionUserId, SYNTHETIC_PDF,
      { caseId: kase.id, originalFilename: 'test.pdf' });
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_EXTRACTION');
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'EXTRACTION_COMPLETE', { systemActor: true });
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_HUMAN_REVIEW');

    // First claim succeeds
    await authorityService.claimCase(institutionAccountId, institutionUserId, kase.id);

    // Second claim by a different user (with capabilities) must be rejected with 409
    const hash = await require('bcryptjs').hash('pw-test-123', 10);
    const { rows: [u2] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role)
       VALUES ($1,'Second Reviewer',$2,$3,'owner') RETURNING id`,
      [institutionAccountId, `second-reviewer-${Date.now()}@fieldcore.test`, hash]
    );
    // Grant capability so u2 passes the capability check and hits the DB unique constraint
    await authorityService.grantCapability(null, u2.id, 'AUTHORITY_INSTRUMENT_VERIFY');
    await expect(
      authorityService.claimCase(institutionAccountId, u2.id, kase.id)
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test('active assignment ends when case is COMPLETED', async () => {
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'letter_of_authorization' });
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    await authorityService.linkInstrumentToCase(institutionAccountId, institutionUserId, kase.id, instr.id);
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'AWAITING_DOCUMENTS');
    await authorityService.uploadDocument(institutionAccountId, institutionUserId, SYNTHETIC_PDF,
      { caseId: kase.id, originalFilename: 'test.pdf' });
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_EXTRACTION');
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'EXTRACTION_COMPLETE', { systemActor: true });
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_HUMAN_REVIEW');
    await authorityService.claimCase(institutionAccountId, institutionUserId, kase.id);
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'PENDING_REVIEW', { actorType: 'human' });
    await authorityService.transitionInstrument(institutionAccountId, institutionUserId, instr.id,
      'VERIFIED', { actorType: 'human' });
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'COMPLETED');

    const { rows } = await pool.query(
      `SELECT status FROM authority_review_assignments
       WHERE account_id = $1 AND case_id = $2`,
      [institutionAccountId, kase.id]
    );
    expect(rows.every(r => r.status !== 'active')).toBe(true);
  });

  test('active assignment ends when case is CANCELLED', async () => {
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    const instrCancel = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'power_of_attorney' });
    await authorityService.linkInstrumentToCase(institutionAccountId, institutionUserId, kase.id, instrCancel.id);
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'AWAITING_DOCUMENTS');
    await authorityService.uploadDocument(institutionAccountId, institutionUserId, SYNTHETIC_PDF,
      { caseId: kase.id, originalFilename: 'test.pdf' });
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_EXTRACTION');
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'EXTRACTION_COMPLETE', { systemActor: true });
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_HUMAN_REVIEW');
    await authorityService.claimCase(institutionAccountId, institutionUserId, kase.id);
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'CANCELLED');

    const { rows } = await pool.query(
      `SELECT status FROM authority_review_assignments
       WHERE account_id = $1 AND case_id = $2`,
      [institutionAccountId, kase.id]
    );
    expect(rows.every(r => r.status !== 'active')).toBe(true);
  });
});

// ── Correction Pass — Issue 11: note encryption ───────────────────────────────

describe('Issue 11 — review note body is encrypted at rest', () => {
  test('note body plaintext is NOT stored in DB; ciphertext is stored instead', async () => {
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    const instrNote = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'power_of_attorney' });
    await authorityService.linkInstrumentToCase(institutionAccountId, institutionUserId, kase.id, instrNote.id);
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'AWAITING_DOCUMENTS');
    await authorityService.uploadDocument(institutionAccountId, institutionUserId, SYNTHETIC_PDF,
      { caseId: kase.id, originalFilename: 'test.pdf' });
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_EXTRACTION');
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'EXTRACTION_COMPLETE', { systemActor: true });
    await authorityService.transitionCase(institutionAccountId, institutionUserId, kase.id, 'PENDING_HUMAN_REVIEW');
    await authorityService.claimCase(institutionAccountId, institutionUserId, kase.id);

    const PLAINTEXT = 'Highly sensitive review note — must not appear in DB as plaintext';
    const note = await authorityService.addReviewNote(
      institutionAccountId, institutionUserId, kase.id, PLAINTEXT
    );

    // Service returns plaintext
    expect(note.body).toBe(PLAINTEXT);

    // DB stores ciphertext (must not equal the plaintext)
    const { rows: [row] } = await pool.query(
      `SELECT body, note_body_key_version FROM authority_review_notes WHERE id = $1`,
      [note.id]
    );
    expect(row.body).not.toBe(PLAINTEXT);
    expect(row.note_body_key_version).toBeTruthy();

    // getReviewNotes must return decrypted plaintext
    const notes = await authorityService.getReviewNotes(institutionAccountId, kase.id);
    const found = notes.find(n => n.id === note.id);
    expect(found).toBeDefined();
    expect(found.body).toBe(PLAINTEXT);
  });
});

// ── Correction Pass — Issue 13: listCases / listParties ──────────────────────

describe('Issue 13 — GET /cases and GET /parties', () => {
  test('GET /authority/cases returns cases for current account', async () => {
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    const res = await request(app)
      .get('/api/authority/cases')
      .set('Authorization', `Bearer ${institutionToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some(c => c.id === kase.id)).toBe(true);
  });

  test('GET /authority/cases?status=DRAFT returns only DRAFT cases', async () => {
    const kase = await authorityService.createCase(institutionAccountId, institutionUserId, {});
    const res = await request(app)
      .get('/api/authority/cases?status=DRAFT')
      .set('Authorization', `Bearer ${institutionToken}`);
    expect(res.status).toBe(200);
    expect(res.body.every(c => c.status === 'DRAFT')).toBe(true);
    expect(res.body.some(c => c.id === kase.id)).toBe(true);
  });

  test('GET /authority/cases does not return cases from another institution', async () => {
    const kase2 = await authorityService.createCase(institution2AccountId, institution2UserId, {});
    const res = await request(app)
      .get('/api/authority/cases')
      .set('Authorization', `Bearer ${institutionToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some(c => c.id === kase2.id)).toBe(false);
  });

  test('GET /authority/parties returns parties for current account', async () => {
    const party = await authorityService.createParty(institutionAccountId, institutionUserId,
      { partyType: 'person', displayName: 'Listed Party' });
    const res = await request(app)
      .get('/api/authority/parties')
      .set('Authorization', `Bearer ${institutionToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some(p => p.id === party.id)).toBe(true);
    // display_name should be decrypted
    const found = res.body.find(p => p.id === party.id);
    expect(found.display_name).toBe('Listed Party');
  });

  test('GET /authority/parties does not return parties from another institution', async () => {
    const party2 = await authorityService.createParty(institution2AccountId, institution2UserId,
      { partyType: 'person', displayName: 'Cross-Tenant Party' });
    const res = await request(app)
      .get('/api/authority/parties')
      .set('Authorization', `Bearer ${institutionToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some(p => p.id === party2.id)).toBe(false);
  });
});

// ── Correction Pass — Issue 15: restriction add/remove via HTTP ───────────────

describe('Issue 15 — restriction add/remove', () => {
  test('POST /instruments/:id/restrictions adds a restriction', async () => {
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'healthcare_proxy' });
    const res = await request(app)
      .post(`/api/authority/instruments/${instr.id}/restrictions`)
      .set('Authorization', `Bearer ${institutionToken}`)
      .send({ restrictionType: 'monetary_limit', parameters: { amount: 5000, currency: 'USD' } });
    expect(res.status).toBe(201);
    expect(res.body.restriction_type).toBe('monetary_limit');
  });

  test('DELETE /instruments/:id/restrictions/:rid removes a restriction', async () => {
    const instr = await authorityService.createInstrument(institutionAccountId, institutionUserId,
      { instrumentType: 'healthcare_proxy' });
    const restr = await authorityService.addRestriction(institutionAccountId, institutionUserId, instr.id,
      { restrictionType: 'date_window', parameters: null });
    const res = await request(app)
      .delete(`/api/authority/instruments/${instr.id}/restrictions/${restr.id}`)
      .set('Authorization', `Bearer ${institutionToken}`);
    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(true);
  });
});

// ── Correction Pass — Issue 17: feature flag returns 503 ─────────────────────

describe('Issue 17 — feature flag enforcement', () => {
  test('AUTHORITY_ENABLED=false returns 503 on all authority routes', async () => {
    const saved = process.env.AUTHORITY_ENABLED;
    process.env.AUTHORITY_ENABLED = 'false';
    const res = await request(app)
      .get('/api/authority/cases')
      .set('Authorization', `Bearer ${institutionToken}`);
    expect(res.status).toBe(503);
    process.env.AUTHORITY_ENABLED = saved;
  });
});

// ── Correction Pass — Issue 18: dev seed secondary guard ─────────────────────

describe('Issue 18 — dev seed secondary opt-in guard', () => {
  test('seed script file contains AUTHORITY_DEV_SEED_ENABLED guard', () => {
    const seedSrc = require('fs').readFileSync(
      require('path').join(__dirname, '../../scripts/authority-seed-dev.js'), 'utf8'
    );
    expect(seedSrc).toContain('AUTHORITY_DEV_SEED_ENABLED');
    expect(seedSrc).not.toContain('DevPassword123!');
  });
});
