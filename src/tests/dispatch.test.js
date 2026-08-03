'use strict';
/**
 * Integration tests for GET /api/dispatch/summary and GET /api/dispatch/schedule.
 *
 * Verifies:
 *   - Auth enforcement (401 without token)
 *   - Response shape: normalized metric array + legacy fields
 *   - Metric status fields are valid enum values
 *   - Schedule returns jobs/sessions arrays with dateLocal + timezone
 *   - Date parameter validation (400 on bad format)
 *   - Tenant isolation (no cross-account data leakage)
 */
require('dotenv').config();
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const app     = require('../app');
const pool    = require('../db/pool');

const VALID_METRIC_STATUSES = new Set([
  'active', 'no_data', 'not_configured', 'disabled', 'unavailable', 'stale',
]);

function makeToken(userId, accountId, role = 'owner') {
  return jwt.sign({ userId, accountId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

let accountId, userId, token;
let otherAccountId, otherUserId, otherToken;
let clientId;

beforeAll(async () => {
  // Primary test account
  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, $2) RETURNING id`,
    ['__TEST_DISPATCH__', 'pro']
  );
  accountId = acct.id;

  const hash = await bcrypt.hash('pw123', 10);
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [accountId, 'Dispatch Owner', `dispatch-${Date.now()}@fieldcore.test`, hash, 'owner']
  );
  userId = user.id;
  token  = makeToken(userId, accountId, 'owner');

  const { rows: [client] } = await pool.query(
    `INSERT INTO clients (account_id, name) VALUES ($1, $2) RETURNING id`,
    [accountId, 'Dispatch Client']
  );
  clientId = client.id;

  // Second account for isolation checks
  const { rows: [other] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, $2) RETURNING id`,
    ['__TEST_DISPATCH_OTHER__', 'pro']
  );
  otherAccountId = other.id;

  const { rows: [otherUser] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [otherAccountId, 'Other Owner', `dispatch-other-${Date.now()}@fieldcore.test`, hash, 'owner']
  );
  otherUserId = otherUser.id;
  otherToken  = makeToken(otherUserId, otherAccountId, 'owner');
});

afterAll(async () => {
  await pool.query(`DELETE FROM accounts WHERE id = ANY($1)`, [[accountId, otherAccountId]]);
});

// ── /api/dispatch/summary ──────────────────────────────────────────────────────

describe('GET /api/dispatch/summary', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/dispatch/summary');
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid token', async () => {
    const res = await request(app)
      .get('/api/dispatch/summary')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('includes a metrics array', async () => {
    const res = await request(app)
      .get('/api/dispatch/summary')
      .set('Authorization', `Bearer ${token}`);
    expect(Array.isArray(res.body.metrics)).toBe(true);
    expect(res.body.metrics.length).toBeGreaterThanOrEqual(1);
  });

  it('every metric has required normalized fields', async () => {
    const res = await request(app)
      .get('/api/dispatch/summary')
      .set('Authorization', `Bearer ${token}`);
    for (const m of res.body.metrics) {
      expect(typeof m.key).toBe('string');
      expect(typeof m.label).toBe('string');
      expect(VALID_METRIC_STATUSES.has(m.status)).toBe(true);
      expect(typeof m.displayValue).toBe('string');
      expect(typeof m.enabled).toBe('boolean');
      expect(typeof m.configured).toBe('boolean');
    }
  });

  it('includes legacy liveTechnicians, activeJobs, todaysJobs, completedToday fields', async () => {
    const res = await request(app)
      .get('/api/dispatch/summary')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body).toHaveProperty('liveTechnicians');
    expect(res.body).toHaveProperty('activeJobs');
    expect(res.body).toHaveProperty('todaysJobs');
    expect(res.body).toHaveProperty('completedToday');
    expect(typeof res.body.liveTechnicians.total).toBe('number');
    expect(typeof res.body.activeJobs.total).toBe('number');
    expect(typeof res.body.todaysJobs.total).toBe('number');
  });

  it('includes generatedAt ISO timestamp and timezone string', async () => {
    const res = await request(app)
      .get('/api/dispatch/summary')
      .set('Authorization', `Bearer ${token}`);
    expect(typeof res.body.generatedAt).toBe('string');
    expect(() => new Date(res.body.generatedAt)).not.toThrow();
    expect(typeof res.body.timezone).toBe('string');
    expect(res.body.timezone.length).toBeGreaterThan(0);
  });

  it('accepts a valid ?date= parameter', async () => {
    const res = await request(app)
      .get('/api/dispatch/summary?date=2025-01-15')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.dateLocal).toBe('2025-01-15');
    expect(res.body.isToday).toBe(false);
  });

  it('does not leak data from another account', async () => {
    // Insert a job under the primary account
    await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status)
       VALUES ($1, $2, 'Leak Test Job', 'scheduled')`,
      [accountId, clientId]
    );
    // Other account should see zero scheduled jobs for its own tenant
    const res = await request(app)
      .get('/api/dispatch/summary')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.todaysJobs.total).toBe(0);
  });
});

// ── /api/dispatch/schedule ──────────────────────────────────────────────────────

describe('GET /api/dispatch/schedule', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/dispatch/schedule');
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid token', async () => {
    const res = await request(app)
      .get('/api/dispatch/schedule')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('returns jobs and sessions arrays', async () => {
    const res = await request(app)
      .get('/api/dispatch/schedule')
      .set('Authorization', `Bearer ${token}`);
    expect(Array.isArray(res.body.jobs)).toBe(true);
    expect(Array.isArray(res.body.sessions)).toBe(true);
  });

  it('includes dateLocal, timezone, and generatedAt in response', async () => {
    const res = await request(app)
      .get('/api/dispatch/schedule')
      .set('Authorization', `Bearer ${token}`);
    expect(typeof res.body.dateLocal).toBe('string');
    expect(/^\d{4}-\d{2}-\d{2}$/.test(res.body.dateLocal)).toBe(true);
    expect(typeof res.body.timezone).toBe('string');
    expect(typeof res.body.generatedAt).toBe('string');
  });

  it('returns 400 for an invalid date parameter', async () => {
    const res = await request(app)
      .get('/api/dispatch/schedule?date=not-a-date')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid date/i);
  });

  it('accepts a valid ?date= parameter', async () => {
    const res = await request(app)
      .get('/api/dispatch/schedule?date=2025-06-15')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.dateLocal).toBe('2025-06-15');
  });

  it('does not return jobs from another account', async () => {
    const res = await request(app)
      .get('/api/dispatch/schedule')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    // All returned jobs must belong to the other account — none from primary account
    for (const job of res.body.jobs) {
      expect(job.account_id).toBe(otherAccountId);
    }
  });
});
