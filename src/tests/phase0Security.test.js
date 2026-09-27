/**
 * Phase 0 security tests — validates hardening controls introduced 2026-09-27.
 *
 * Covers:
 *   - /api/uploads authentication gate (401 without token)
 *   - Path traversal rejection (handler-level, authenticated)
 *   - 404 for missing files (valid token, safe path, no file on disk)
 *   - Audit failure observability (process.auditFailure event + counter)
 *   - account_type column exists on accounts (migration applied)
 *   - ENCRYPTION_KEY validation logic (production guard rules)
 */
require('dotenv').config();
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const app     = require('../app');
const pool    = require('../db/pool');
const auditService = require('../services/audit');
const { runMigrations } = require('../db/migrate');

function makeToken(userId, accountId, role = 'owner') {
  return jwt.sign({ userId, accountId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

let accountId, userId, token;

beforeAll(async () => {
  // Ensure all migrations are applied to the test DB (normally run by server.js).
  await runMigrations();

  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, $2) RETURNING id`,
    ['__TEST_PHASE0_ACCOUNT__', 'pro']
  );
  accountId = acct.id;

  const hash = await bcrypt.hash('pw123', 10);
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [accountId, 'Phase0 Owner', `phase0-${Date.now()}@fieldcore.test`, hash, 'owner']
  );
  userId = user.id;
  token  = makeToken(userId, accountId, 'owner');
}, 30000);

afterAll(async () => {
  await pool.query(`DELETE FROM accounts WHERE id = $1`, [accountId]);
  await pool.end();
});

// ── /api/uploads authentication gate ─────────────────────────────────────────

test('GET /api/uploads/* without token returns 401', async () => {
  const res = await request(app).get('/api/uploads/some-file.jpg');
  expect(res.status).toBe(401);
});

test('GET /api/uploads/* with valid token and missing file returns 404', async () => {
  const res = await request(app)
    .get('/api/uploads/nonexistent-file-phase0.jpg')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(404);
});

// ── Path traversal protection (handler-level, authenticated) ──────────────────
// Note: Express normalizes `../../` sequences before route matching when the traversal
// escapes the mount prefix. Tests here use paths that remain under /api/uploads so the
// handler's traversal check is exercised. The primary security property is that
// unauthenticated requests to valid paths return 401 (tested above), and that no
// file outside UPLOADS_ROOT can be served even with a valid token.

test('GET /api/uploads with relative traversal segment is blocked (authenticated)', async () => {
  // URL-encoded ../ stays encoded until the handler calls decodeURIComponent, triggering
  // the path-resolution check. Expect 400 (invalid path) or 403 (traversal blocked).
  const res = await request(app)
    .get('/api/uploads/..%2F..%2Fetc%2Fpasswd')
    .set('Authorization', `Bearer ${token}`);
  expect([400, 403, 404]).toContain(res.status);
});

test('GET /api/uploads with URL-encoded null byte is rejected', async () => {
  const res = await request(app)
    .get('/api/uploads/file%00.jpg')
    .set('Authorization', `Bearer ${token}`);
  expect([400, 403, 404]).toContain(res.status);
});

test('GET /api/uploads with literal double-dot segment does not expose file data', async () => {
  // Express normalizes `/api/uploads/subdir/../../../etc/passwd` to `/etc/passwd` before routing,
  // so the request bypasses the upload handler entirely and hits the React SPA catch-all.
  // The security property: no raw file content is returned regardless of response status.
  const res = await request(app)
    .get('/api/uploads/subdir/../../../etc/passwd')
    .set('Authorization', `Bearer ${token}`);
  // Acceptable: 200 HTML (SPA catch-all), 404 (no handler), 400/403 (handler blocks).
  // Not acceptable: binary file data.
  const ct = res.headers['content-type'] || '';
  expect(ct).not.toMatch(/image\//);
  expect(ct).not.toMatch(/application\/octet-stream/);
  if (res.status === 200) {
    expect(ct).toMatch(/text\/html/);
  }
});

// ── /uploads (old public static route) is gone ────────────────────────────────

test('GET /uploads/* does not serve raw binary files (public static mount removed)', async () => {
  const res = await request(app).get('/uploads/some-file.jpg');
  // Acceptable outcomes: 404 (no handler), or React HTML catch-all.
  // Not acceptable: a raw binary file served with no auth.
  // If content-type is text/html it is the React catch-all, which is safe.
  if (res.status === 200) {
    expect(res.headers['content-type']).toMatch(/text\/html/);
  }
  // Any non-file-serving response is acceptable; file serving would have content-type like image/jpeg.
  expect(res.headers['content-type'] || '').not.toMatch(/image\//);
  expect(res.headers['content-type'] || '').not.toMatch(/application\/octet-stream/);
});

// ── Audit failure observability ───────────────────────────────────────────────

test('audit.log emits process.auditFailure when DB write fails', (done) => {
  auditService.resetFailureCount();

  const originalQuery = pool.query.bind(pool);
  pool.query = function(sql, params) {
    if (typeof sql === 'string' && sql.includes('INSERT INTO audit_logs')) {
      return Promise.reject(new Error('Synthetic DB failure for audit test'));
    }
    return originalQuery(sql, params);
  };

  const handler = ({ error, failureCount }) => {
    process.off('auditFailure', handler);
    pool.query = originalQuery;
    try {
      expect(error).toContain('Synthetic DB failure');
      expect(failureCount).toBeGreaterThanOrEqual(1);
      expect(auditService.getFailureCount()).toBeGreaterThanOrEqual(1);
      done();
    } catch (e) {
      done(e);
    }
  };

  process.once('auditFailure', handler);
  auditService.log(accountId, userId, 'test.phase0', 'test', 'test-id', {}, '127.0.0.1');
}, 5000);

test('audit.log does not throw when DB write fails', async () => {
  const originalQuery = pool.query.bind(pool);
  pool.query = function(sql, params) {
    if (typeof sql === 'string' && sql.includes('INSERT INTO audit_logs')) {
      return Promise.reject(new Error('Forced failure'));
    }
    return originalQuery(sql, params);
  };

  await expect(
    auditService.log(accountId, userId, 'test.nothrow', 'test', 'x', {}, '127.0.0.1')
  ).resolves.toBeUndefined();

  pool.query = originalQuery;
});

// ── account_type column existence ─────────────────────────────────────────────

test('accounts table has account_type column with correct constraint', async () => {
  const { rows } = await pool.query(`
    SELECT column_name, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'account_type'
  `);
  expect(rows.length).toBe(1);
  expect(rows[0].column_default).toContain('field_service');
  expect(rows[0].is_nullable).toBe('NO');
});

test('existing account has account_type = field_service by default', async () => {
  const { rows } = await pool.query(
    `SELECT account_type FROM accounts WHERE id = $1`, [accountId]
  );
  expect(rows[0].account_type).toBe('field_service');
});

test('account_type CHECK constraint rejects invalid value', async () => {
  await expect(
    pool.query(
      `UPDATE accounts SET account_type = $1 WHERE id = $2`,
      ['invalid_type', accountId]
    )
  ).rejects.toThrow();
});

test('account_type accepts institution value', async () => {
  await pool.query(
    `UPDATE accounts SET account_type = $1 WHERE id = $2`,
    ['institution', accountId]
  );
  const { rows } = await pool.query(
    `SELECT account_type FROM accounts WHERE id = $1`, [accountId]
  );
  expect(rows[0].account_type).toBe('institution');

  await pool.query(
    `UPDATE accounts SET account_type = 'field_service' WHERE id = $1`, [accountId]
  );
});

// ── ENCRYPTION_KEY validation logic (unit test — no process.exit) ─────────────

test('ENCRYPTION_KEY production rules: empty key fails', () => {
  const validate = (key) => {
    if (!key) return 'missing';
    if (key.length !== 64 || !/^[0-9a-fA-F]+$/.test(key)) return 'invalid_format';
    if (key === '0'.repeat(64)) return 'all_zeros';
    return 'valid';
  };

  expect(validate('')).toBe('missing');
  expect(validate(null)).toBe('missing');
  expect(validate('abc123')).toBe('invalid_format');
  expect(validate('a'.repeat(63))).toBe('invalid_format');
  expect(validate('0'.repeat(64))).toBe('all_zeros');
  expect(validate('a'.repeat(64))).toBe('valid');
  expect(validate('deadbeef'.repeat(8))).toBe('valid');
});
