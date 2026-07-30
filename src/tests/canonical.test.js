/**
 * Canonical job information shape — verifies the API returns all fields
 * that the Calendar, Dispatch, and TechApp surfaces depend on.
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

let accountId, userId, token, clientId, jobId;

beforeAll(async () => {
  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, $2) RETURNING id`,
    ['__TEST_CANONICAL__', 'pro']
  );
  accountId = acct.id;

  const hash = await bcrypt.hash('pw123', 10);
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [accountId, 'Canonical Owner', `canonical-${Date.now()}@fieldcore.test`, hash, 'owner']
  );
  userId = user.id;
  token  = makeToken(userId, accountId, 'owner');

  const { rows: [client] } = await pool.query(
    `INSERT INTO clients (account_id, name) VALUES ($1, $2) RETURNING id`,
    [accountId, 'Canonical Client']
  );
  clientId = client.id;

  const { rows: [job] } = await pool.query(
    `INSERT INTO jobs (
       account_id, client_id, service_type, status, scheduled_at,
       service_address, service_city, service_state, service_zip,
       notes, scope_of_work, amount, duration_minutes
     ) VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [
      accountId, clientId, 'HVAC Inspection', 'scheduled',
      '123 Main St', 'Austin', 'TX', '78701',
      'Internal note', 'Customer-approved scope', 4999, 90,
    ]
  );
  jobId = job.id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM accounts WHERE id = $1`, [accountId]);
  await pool.end();
});

// ── List endpoint ─────────────────────────────────────────────────────────────

test('GET /api/jobs returns array including the test job', async () => {
  const res = await request(app)
    .get('/api/jobs')
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);

  const job = res.body.find(j => j.id === jobId);
  expect(job).toBeDefined();
});

test('GET /api/jobs returns canonical identity fields', async () => {
  const res = await request(app).get('/api/jobs').set('Authorization', `Bearer ${token}`);
  const job = res.body.find(j => j.id === jobId);

  expect(job.service_type).toBe('HVAC Inspection');
  expect(job.status).toBe('scheduled');
  expect(typeof job.is_multi_day).toBe('boolean');
});

test('GET /api/jobs includes client_name from JOIN', async () => {
  const res = await request(app).get('/api/jobs').set('Authorization', `Bearer ${token}`);
  const job = res.body.find(j => j.id === jobId);

  expect(job.client_name).toBe('Canonical Client');
  expect(job.client_id).toBe(clientId);
});

test('GET /api/jobs includes assignment fields (may be null)', async () => {
  const res = await request(app).get('/api/jobs').set('Authorization', `Bearer ${token}`);
  const job = res.body.find(j => j.id === jobId);

  expect('tech_name'        in job).toBe(true);
  expect('job_manager_name' in job).toBe(true);
});

test('GET /api/jobs includes scheduling fields', async () => {
  const res = await request(app).get('/api/jobs').set('Authorization', `Bearer ${token}`);
  const job = res.body.find(j => j.id === jobId);

  expect('scheduled_at'     in job).toBe(true);
  expect('duration_minutes' in job).toBe(true);
  expect(Number(job.duration_minutes)).toBe(90);
});

test('GET /api/jobs includes all address fields', async () => {
  const res = await request(app).get('/api/jobs').set('Authorization', `Bearer ${token}`);
  const job = res.body.find(j => j.id === jobId);

  expect(job.service_address).toBe('123 Main St');
  expect(job.service_city).toBe('Austin');
  expect(job.service_state).toBe('TX');
  expect(job.service_zip).toBe('78701');
});

test('GET /api/jobs includes content fields', async () => {
  const res = await request(app).get('/api/jobs').set('Authorization', `Bearer ${token}`);
  const job = res.body.find(j => j.id === jobId);

  expect(job.notes).toBe('Internal note');
  expect(job.scope_of_work).toBe('Customer-approved scope');
  expect(Number(job.amount)).toBe(4999);
});

// ── Single job endpoint ───────────────────────────────────────────────────────

test('GET /api/jobs/:id returns canonical fields', async () => {
  const res = await request(app)
    .get(`/api/jobs/${jobId}`)
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(res.body.id).toBe(jobId);
  expect(res.body.client_name).toBe('Canonical Client');
  expect(res.body.service_address).toBe('123 Main St');
  expect(Number(res.body.duration_minutes)).toBe(90);
});

// ── Auth + isolation ──────────────────────────────────────────────────────────

test('GET /api/jobs requires authentication', async () => {
  const res = await request(app).get('/api/jobs');
  expect(res.status).toBe(401);
});

test('GET /api/jobs/:id requires authentication', async () => {
  const res = await request(app).get(`/api/jobs/${jobId}`);
  expect(res.status).toBe(401);
});

test('GET /api/jobs enforces tenant isolation', async () => {
  const { rows: [acct2] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, $2) RETURNING id`,
    ['__TEST_CANONICAL_OTHER__', 'pro']
  );
  const hash = await bcrypt.hash('pw', 10);
  const { rows: [user2] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [acct2.id, 'Other', `can-other-${Date.now()}@fieldcore.test`, hash, 'owner']
  );
  const otherToken = makeToken(user2.id, acct2.id, 'owner');

  const res = await request(app)
    .get('/api/jobs')
    .set('Authorization', `Bearer ${otherToken}`);

  expect(res.status).toBe(200);
  const found = res.body.find(j => j.id === jobId);
  expect(found).toBeUndefined();

  await pool.query(`DELETE FROM accounts WHERE id = $1`, [acct2.id]);
});
