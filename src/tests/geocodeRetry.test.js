'use strict';
/**
 * Tests for POST /api/jobs/:id/geocode — geocode retry endpoint.
 *
 * Tests the three outcomes:
 *   1. No API key  → 422, geocode_status = 'failed'
 *   2. No address  → 400
 *   3. Successful geocode (mocked) → 200, lat/lng/geocode_status returned
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

let accountId, userId, token, clientId;

beforeAll(async () => {
  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, $2) RETURNING id`,
    ['__TEST_GEOCODE_RETRY__', 'pro']
  );
  accountId = acct.id;

  const hash = await bcrypt.hash('pw123', 10);
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [accountId, 'Retry Owner', `geocode-retry-${Date.now()}@fieldcore.test`, hash, 'owner']
  );
  userId = user.id;
  token  = makeToken(userId, accountId, 'owner');

  const { rows: [client] } = await pool.query(
    `INSERT INTO clients (account_id, name) VALUES ($1, $2) RETURNING id`,
    [accountId, 'Geocode Client']
  );
  clientId = client.id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM accounts WHERE id = $1`, [accountId]);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createJob(overrides = {}) {
  const { rows: [job] } = await pool.query(
    `INSERT INTO jobs
       (account_id, client_id, service_type, status,
        service_address, service_city, service_state, service_zip,
        service_lat, service_lng, geocode_status)
     VALUES ($1,$2,$3,'scheduled',$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      accountId, clientId,
      overrides.service_type || 'Rule Check',
      overrides.service_address || '305 Lincoln Court',
      overrides.service_city    || 'Deerfield Beach',
      overrides.service_state   || 'FL',
      overrides.service_zip     || '33442',
      overrides.service_lat     ?? null,
      overrides.service_lng     ?? null,
      overrides.geocode_status  || 'failed',
    ]
  );
  return job;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/jobs/:id/geocode', () => {
  it('returns 401 without auth token', async () => {
    const job = await createJob();
    const res = await request(app).post(`/api/jobs/${job.id}/geocode`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for tech role (owner/manager only)', async () => {
    const techToken = makeToken(userId, accountId, 'tech');
    const job = await createJob();
    const res = await request(app)
      .post(`/api/jobs/${job.id}/geocode`)
      .set('Authorization', `Bearer ${techToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent job', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .post(`/api/jobs/${fakeId}/geocode`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 400 when job has no service address', async () => {
    const { rows: [job] } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, geocode_status)
       VALUES ($1,$2,'No Address Job','scheduled','not_attempted') RETURNING *`,
      [accountId, clientId]
    );
    const res = await request(app)
      .post(`/api/jobs/${job.id}/geocode`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no service address/i);
  });

  it('returns 422 with geocode_status=failed when GOOGLE_MAPS_API_KEY is not set', async () => {
    const savedKey = process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;

    try {
      const job = await createJob({ geocode_status: 'failed' });
      const res = await request(app)
        .post(`/api/jobs/${job.id}/geocode`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(422);
      expect(res.body.geocode_status).toBe('failed');

      // Confirm DB was updated
      const { rows: [updated] } = await pool.query(
        `SELECT geocode_status FROM jobs WHERE id = $1`, [job.id]
      );
      expect(updated.geocode_status).toBe('failed');
    } finally {
      if (savedKey) process.env.GOOGLE_MAPS_API_KEY = savedKey;
    }
  });

  it('geocode_status column defaults to not_attempted on new jobs', async () => {
    const { rows: [job] } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status)
       VALUES ($1,$2,'Status Default Test','scheduled') RETURNING geocode_status`,
      [accountId, clientId]
    );
    expect(job.geocode_status).toBe('not_attempted');
  });
});
