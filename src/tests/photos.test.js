/**
 * Integration tests for job photo endpoints.
 * Covers: photo_category field, GET by account, DELETE isolation.
 * Storage (R2/S3) is NOT configured in CI — upload tests verify 503 not 404.
 */
require('dotenv').config();
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const app     = require('../app');
const pool    = require('../db/pool');

function makeToken(userId, accountId, role = 'owner') {
  return jwt.sign({ userId, accountId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

let accountId, userId, token, jobId;
let otherAccountId, otherUserId, otherToken;
const insertedPhotoIds = [];

beforeAll(async () => {
  // Primary tenant
  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, $2) RETURNING id`,
    ['__TEST_PHOTOS_ACCOUNT__', 'pro']
  );
  accountId = acct.id;

  const hash = await bcrypt.hash('pw123', 10);
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [accountId, 'Photo Owner', `photos-owner-${Date.now()}@fieldcore.test`, hash, 'owner']
  );
  userId = user.id;
  token  = makeToken(userId, accountId, 'owner');

  const { rows: [client] } = await pool.query(
    `INSERT INTO clients (account_id, name) VALUES ($1, $2) RETURNING id`,
    [accountId, 'Photo Client']
  );

  const { rows: [job] } = await pool.query(
    `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at)
     VALUES ($1,$2,$3,$4,NOW()) RETURNING id`,
    [accountId, client.id, 'Test Service', 'scheduled']
  );
  jobId = job.id;

  // Second tenant for isolation tests
  const { rows: [acct2] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, $2) RETURNING id`,
    ['__TEST_PHOTOS_OTHER__', 'pro']
  );
  otherAccountId = acct2.id;
  const { rows: [user2] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [otherAccountId, 'Other Owner', `photos-other-${Date.now()}@fieldcore.test`, hash, 'owner']
  );
  otherUserId = user2.id;
  otherToken  = makeToken(otherUserId, otherAccountId, 'owner');

  // Seed photos directly — bypasses storage so we can test the API shape
  const categories = ['before', 'after', 'general'];
  for (const cat of categories) {
    const { rows: [p] } = await pool.query(
      `INSERT INTO job_photos (job_id, account_id, url, filename, photo_category)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [jobId, accountId, `https://cdn.test/${cat}.jpg`, `${cat}.jpg`, cat]
    );
    insertedPhotoIds.push(p.id);
  }
});

afterAll(async () => {
  await pool.query(`DELETE FROM accounts WHERE id IN ($1,$2)`, [accountId, otherAccountId]);
  await pool.end();
});

// ── GET photos ────────────────────────────────────────────────────────────────

test('GET /api/mobile/jobs/:id/photos returns photos with photo_category', async () => {
  const res = await request(app)
    .get(`/api/mobile/jobs/${jobId}/photos`)
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.body.length).toBe(3);

  const cats = res.body.map(p => p.photo_category);
  expect(cats).toContain('before');
  expect(cats).toContain('after');
  expect(cats).toContain('general');
});

test('GET photos returns before before general before after (sort order)', async () => {
  const res = await request(app)
    .get(`/api/mobile/jobs/${jobId}/photos`)
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  const cats = res.body.map(p => p.photo_category);
  // Expected order: before(1), general(2), after(3)
  expect(cats[0]).toBe('before');
  expect(cats[1]).toBe('general');
  expect(cats[2]).toBe('after');
});

test('GET photos returns url field on each photo', async () => {
  const res = await request(app)
    .get(`/api/mobile/jobs/${jobId}/photos`)
    .set('Authorization', `Bearer ${token}`);

  res.body.forEach(p => {
    expect(typeof p.url).toBe('string');
    expect(p.url.length).toBeGreaterThan(0);
  });
});

test('GET photos rejects unauthenticated request', async () => {
  const res = await request(app).get(`/api/mobile/jobs/${jobId}/photos`);
  expect(res.status).toBe(401);
});

// ── Tenant isolation ──────────────────────────────────────────────────────────

test('GET photos: other tenant cannot see this account\'s photos', async () => {
  const res = await request(app)
    .get(`/api/mobile/jobs/${jobId}/photos`)
    .set('Authorization', `Bearer ${otherToken}`);

  // Returns 200 but empty — scoped to account_id
  expect(res.status).toBe(200);
  expect(res.body.length).toBe(0);
});

// ── DELETE photos ─────────────────────────────────────────────────────────────

test('DELETE /api/mobile/jobs/:id/photos/:pid removes the photo', async () => {
  // Insert a throwaway photo
  const { rows: [p] } = await pool.query(
    `INSERT INTO job_photos (job_id, account_id, url, filename, photo_category)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [jobId, accountId, 'https://cdn.test/del.jpg', 'del.jpg', 'general']
  );

  const res = await request(app)
    .delete(`/api/mobile/jobs/${jobId}/photos/${p.id}`)
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(res.body.deleted).toBe(true);

  // Confirm gone from DB
  const { rows } = await pool.query(`SELECT id FROM job_photos WHERE id = $1`, [p.id]);
  expect(rows.length).toBe(0);
});

test('DELETE photo: other tenant gets 404', async () => {
  const photoId = insertedPhotoIds[0];
  const res = await request(app)
    .delete(`/api/mobile/jobs/${jobId}/photos/${photoId}`)
    .set('Authorization', `Bearer ${otherToken}`);

  expect(res.status).toBe(404);
});

test('DELETE photo: tech role is forbidden', async () => {
  const hash = await bcrypt.hash('pw', 10);
  const { rows: [tech] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [accountId, 'Tech User', `tech-${Date.now()}@fieldcore.test`, hash, 'tech']
  );
  const techToken = makeToken(tech.id, accountId, 'tech');

  const res = await request(app)
    .delete(`/api/mobile/jobs/${jobId}/photos/${insertedPhotoIds[1]}`)
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(403);
});

test('DELETE nonexistent photo returns 404', async () => {
  const res = await request(app)
    .delete(`/api/mobile/jobs/${jobId}/photos/00000000-0000-0000-0000-000000000000`)
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(404);
});

// ── Upload endpoint availability ──────────────────────────────────────────────

test('POST upload returns 503 (not 404) when storage is unconfigured', async () => {
  const res = await request(app)
    .post(`/api/mobile/jobs/${jobId}/photos`)
    .set('Authorization', `Bearer ${token}`)
    .attach('photo', Buffer.from('fake-image'), { filename: 'test.jpg', contentType: 'image/jpeg' });

  // Storage not configured in test env — expect 503, not 404 (route exists)
  expect([400, 503]).toContain(res.status);
});
