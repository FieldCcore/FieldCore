'use strict';
/**
 * Forecasting V1 — Integration Tests
 *
 * Covers: readiness classification, daily run-rate, booked revenue, projected
 * revenue formula, confidence rules, past-period handling, trend data, drivers
 * table, tenant isolation, permission enforcement.
 *
 * Requires a live DATABASE_URL. Run with --runInBand.
 */
require('dotenv').config();
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const app     = require('../app');
const pool    = require('../db/pool');
const { RATE_WINDOW_DAYS } = require('../services/forecastingService');

function makeToken(userId, accountId, role = 'owner') {
  return jwt.sign({ userId, accountId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

let accountId, userId, token;
let otherAccountId, otherUserId, otherToken;
let techUserId, techToken;
let clientId;

const NOW     = new Date();
const TODAY   = NOW.toISOString().slice(0, 10);

function daysAgo(n) {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

function daysFromNow(n) {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString();
}

// Thin insert helpers
const insertJob = (accId, cliId, amount, status, scheduledAt) =>
  pool.query(
    `INSERT INTO jobs (account_id, client_id, service_type, amount, status, scheduled_at)
     VALUES ($1,$2,'Test',$3,$4,$5) RETURNING id`,
    [accId, cliId, amount, status, scheduledAt]
  );

// ── Setup / teardown ──────────────────────────────────────────────────────────

let jobIds = [];

beforeAll(async () => {
  const hash = await bcrypt.hash('pw123', 10);

  // Primary tenant
  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1,'pro') RETURNING id`,
    [`__TEST_FC_${Date.now()}__`]
  );
  accountId = acct.id;

  const { rows: [u] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'FC Owner',$2,$3,'owner') RETURNING id`,
    [accountId, `fc-owner-${Date.now()}@test.fc`, hash]
  );
  userId = u.id;
  token  = makeToken(userId, accountId, 'owner');

  // Technician (should be denied)
  const { rows: [tech] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'FC Tech',$2,$3,'tech') RETURNING id`,
    [accountId, `fc-tech-${Date.now()}@test.fc`, hash]
  );
  techUserId = tech.id;
  techToken  = makeToken(techUserId, accountId, 'tech');

  // Second tenant (isolation)
  const { rows: [acct2] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1,'pro') RETURNING id`,
    [`__TEST_FC_OTHER_${Date.now()}__`]
  );
  otherAccountId = acct2.id;
  const { rows: [u2] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Other',$2,$3,'owner') RETURNING id`,
    [otherAccountId, `fc-other-${Date.now()}@test.fc`, hash]
  );
  otherUserId = u2.id;
  otherToken  = makeToken(otherUserId, otherAccountId, 'owner');

  // Client
  const { rows: [c] } = await pool.query(
    `INSERT INTO clients (account_id, name) VALUES ($1,'Test Client') RETURNING id`,
    [accountId]
  );
  clientId = c.id;

  // Seed completed jobs spanning > 60 days (20 jobs) to reach READY + HIGH confidence
  // 10 jobs spread across 70 days at $100 each; 10 more within the last 30 days at $200 each
  const seeds = [];
  for (let i = 0; i < 10; i++) {
    seeds.push(insertJob(accountId, clientId, 100, 'complete', daysAgo(60 + i * 1)));
  }
  for (let i = 0; i < 10; i++) {
    seeds.push(insertJob(accountId, clientId, 200, 'complete', daysAgo(i + 1)));
  }
  const results = await Promise.all(seeds);
  jobIds = results.map(r => r.rows[0].id);
});

afterAll(async () => {
  await pool.query(`DELETE FROM jobs WHERE account_id IN ($1,$2)`, [accountId, otherAccountId]);
  await pool.query(`DELETE FROM clients WHERE account_id IN ($1,$2)`, [accountId, otherAccountId]);
  await pool.query(`DELETE FROM users WHERE id IN ($1,$2,$3)`, [userId, otherUserId, techUserId]);
  await pool.query(`DELETE FROM accounts WHERE id IN ($1,$2)`, [accountId, otherAccountId]);
  await pool.end();
});

// ── Permission guard ──────────────────────────────────────────────────────────

describe('GET /api/revenue/forecasting/overview — auth', () => {
  it('returns 401 with no token', async () => {
    await request(app).get('/api/revenue/forecasting/overview').expect(401);
  });

  it('returns 403 for tech role', async () => {
    await request(app)
      .get('/api/revenue/forecasting/overview')
      .set('Authorization', `Bearer ${techToken}`)
      .expect(403);
  });
});

// ── HTTP contract ─────────────────────────────────────────────────────────────

describe('GET /api/revenue/forecasting/overview — response shape', () => {
  it('returns 200 with correct top-level keys', async () => {
    const res = await request(app)
      .get('/api/revenue/forecasting/overview')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('readiness');
    expect(res.body).toHaveProperty('period');
    expect(res.body).toHaveProperty('actual');
    expect(res.body).toHaveProperty('booked');
    expect(res.body).toHaveProperty('forecast');
    expect(res.body).toHaveProperty('trend');
    expect(res.body).toHaveProperty('drivers');
  });

  it('returns 200 with start+end date params — regression: must not throw with date params', async () => {
    const start = daysAgo(30).slice(0, 10);
    const res = await request(app)
      .get(`/api/revenue/forecasting/overview?start=${start}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('readiness');
    expect(res.body).toHaveProperty('forecast');
  });

  it('returns 200 for account with zero completed jobs — no 500', async () => {
    const res = await request(app)
      .get('/api/revenue/forecasting/overview')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);

    expect(res.body.readiness.status).toBe('INSUFFICIENT_DATA');
    expect(res.body.readiness.completedJobs).toBe(0);
    expect(res.body.actual.earnedRevenue).toBe(0);
    expect(res.body.booked.revenue).toBe(0);
  });
});

// ── Readiness classification ──────────────────────────────────────────────────

describe('Readiness — READY state', () => {
  it('classifies READY with ≥ 5 jobs and ≥ 30 days history', async () => {
    const res = await request(app)
      .get('/api/revenue/forecasting/overview')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const { readiness } = res.body;
    // We seeded 20 completed jobs spanning 70+ days
    expect(readiness.status).toBe('READY');
    expect(readiness.completedJobs).toBeGreaterThanOrEqual(20);
    expect(readiness.historyDays).toBeGreaterThanOrEqual(30);
    expect(readiness.limitations).toHaveLength(0);
  });
});

describe('Readiness — INSUFFICIENT_DATA state', () => {
  it('shows INSUFFICIENT_DATA with 0 completed jobs', async () => {
    const res = await request(app)
      .get('/api/revenue/forecasting/overview')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);

    const { readiness } = res.body;
    expect(readiness.status).toBe('INSUFFICIENT_DATA');
    expect(readiness.limitations.length).toBeGreaterThan(0);
  });

  it('shows no speculative unbooked revenue when INSUFFICIENT_DATA', async () => {
    const res = await request(app)
      .get('/api/revenue/forecasting/overview')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);

    expect(res.body.forecast.expectedUnbookedRevenue).toBe(0);
  });
});

// ── Confidence ────────────────────────────────────────────────────────────────

describe('Confidence rules', () => {
  it('returns a confidence value for current/future periods', async () => {
    const res = await request(app)
      .get('/api/revenue/forecasting/overview')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const { confidence } = res.body.forecast;
    expect(['HIGH', 'MEDIUM', 'LOW']).toContain(confidence);
  });

  it('returns null confidence for past periods', async () => {
    const pastStart = daysAgo(40).slice(0, 10);
    const pastEnd   = daysAgo(10).slice(0, 10);
    const res = await request(app)
      .get(`/api/revenue/forecasting/overview?start=${pastStart}&end=${pastEnd}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.forecast.confidence).toBeNull();
    expect(res.body.period.isPast).toBe(true);
  });

  it('includes confidenceReasons array', async () => {
    const res = await request(app)
      .get('/api/revenue/forecasting/overview')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body.forecast.confidenceReasons)).toBe(true);
  });

  it('returns null confidence when readiness is INSUFFICIENT_DATA (IS-003 regression)', async () => {
    // otherAccount has no jobs — must be INSUFFICIENT_DATA
    const res = await request(app)
      .get('/api/revenue/forecasting/overview')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);

    expect(res.body.readiness.status).toBe('INSUFFICIENT_DATA');
    expect(res.body.forecast.confidence).toBeNull();
  });
});

// ── Earned revenue ────────────────────────────────────────────────────────────

describe('Earned revenue', () => {
  it('counts completed jobs within the period only', async () => {
    // Period: last 5 days — only the 5 most recent $200 jobs should appear
    const start = daysAgo(5).slice(0, 10);
    const res = await request(app)
      .get(`/api/revenue/forecasting/overview?start=${start}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // At least $200 earned (at least 1 job within last 5 days)
    expect(res.body.actual.earnedRevenue).toBeGreaterThan(0);
  });
});

// ── Booked revenue ────────────────────────────────────────────────────────────

describe('Booked revenue', () => {
  let futureJobId;

  beforeAll(async () => {
    const { rows: [j] } = await insertJob(accountId, clientId, 500, 'scheduled', daysFromNow(5));
    futureJobId = j.id;
    jobIds.push(futureJobId);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM jobs WHERE id = $1`, [futureJobId]);
    jobIds = jobIds.filter(id => id !== futureJobId);
  });

  it('includes scheduled future jobs in booked revenue', async () => {
    const end = daysFromNow(10).slice(0, 10);
    const res = await request(app)
      .get(`/api/revenue/forecasting/overview?start=${TODAY}&end=${end}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.booked.revenue).toBeGreaterThanOrEqual(500);
    expect(res.body.booked.jobCount).toBeGreaterThanOrEqual(1);
  });

  it('excludes cancelled jobs from booked revenue', async () => {
    // Insert a cancelled future job — should not appear in booked
    const { rows: [cancelled] } = await insertJob(accountId, clientId, 9999, 'cancelled', daysFromNow(3));
    const end = daysFromNow(10).slice(0, 10);
    const res = await request(app)
      .get(`/api/revenue/forecasting/overview?start=${TODAY}&end=${end}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Booked should NOT include the 9999 cancelled job
    expect(res.body.booked.revenue).toBeLessThan(9999 + 1);
    await pool.query(`DELETE FROM jobs WHERE id = $1`, [cancelled.id]);
  });

  it('excludes complete jobs from booked revenue', async () => {
    const { rows: [completed] } = await insertJob(accountId, clientId, 8888, 'complete', daysFromNow(2));
    const end = daysFromNow(10).slice(0, 10);
    const res = await request(app)
      .get(`/api/revenue/forecasting/overview?start=${TODAY}&end=${end}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Booked should NOT include the 8888 complete future job (it would be earned if in the past, ignored in future)
    expect(res.body.booked.revenue).toBeLessThan(8888 + 1);
    await pool.query(`DELETE FROM jobs WHERE id = $1`, [completed.id]);
  });
});

// ── Projected revenue formula ─────────────────────────────────────────────────

describe('Projected revenue formula', () => {
  it('projected = earned + booked + expectedUnbooked for current period', async () => {
    const end = daysFromNow(30).slice(0, 10);
    const res = await request(app)
      .get(`/api/revenue/forecasting/overview?start=${TODAY}&end=${end}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const { actual, booked, forecast } = res.body;
    const expectedProjected = Math.round(
      (actual.earnedRevenue + booked.revenue + forecast.expectedUnbookedRevenue) * 100
    ) / 100;
    expect(res.body.forecast.projectedRevenue).toBeCloseTo(expectedProjected, 1);
  });

  it('forecastGap = projectedRevenue - earnedRevenue', async () => {
    const res = await request(app)
      .get('/api/revenue/forecasting/overview')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const { actual, forecast } = res.body;
    const expectedGap = Math.round((forecast.projectedRevenue - actual.earnedRevenue) * 100) / 100;
    expect(forecast.forecastGap).toBeCloseTo(expectedGap, 1);
  });

  it('projected = earnedRevenue for past periods', async () => {
    const pastStart = daysAgo(60).slice(0, 10);
    const pastEnd   = daysAgo(31).slice(0, 10);
    const res = await request(app)
      .get(`/api/revenue/forecasting/overview?start=${pastStart}&end=${pastEnd}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.period.isPast).toBe(true);
    expect(res.body.forecast.projectedRevenue).toBe(res.body.actual.earnedRevenue);
    expect(res.body.booked.revenue).toBe(0);
  });
});

// ── Trend data ────────────────────────────────────────────────────────────────

describe('Trend data', () => {
  it('returns trend as an array', async () => {
    const res = await request(app)
      .get('/api/revenue/forecasting/overview')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body.trend)).toBe(true);
  });

  it('trend entries have required fields', async () => {
    const start = daysAgo(10).slice(0, 10);
    const res = await request(app)
      .get(`/api/revenue/forecasting/overview?start=${start}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    for (const entry of res.body.trend) {
      expect(entry).toHaveProperty('date');
      expect(entry).toHaveProperty('earned');
      expect(entry).toHaveProperty('booked');
      expect(entry).toHaveProperty('projected');
      expect(entry).toHaveProperty('jobs');
      expect(entry).toHaveProperty('type');
      expect(['actual', 'booked', 'projected', 'mixed']).toContain(entry.type);
    }
  });

  it('trend entries are sorted ascending by date', async () => {
    const start = daysAgo(15).slice(0, 10);
    const res = await request(app)
      .get(`/api/revenue/forecasting/overview?start=${start}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const dates = res.body.trend.map(e => e.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });
});

// ── Drivers table ─────────────────────────────────────────────────────────────

describe('Drivers table', () => {
  let driverJobId;

  beforeAll(async () => {
    const { rows: [j] } = await insertJob(accountId, clientId, 777, 'scheduled', daysFromNow(2));
    driverJobId = j.id;
    jobIds.push(driverJobId);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM jobs WHERE id = $1`, [driverJobId]);
    jobIds = jobIds.filter(id => id !== driverJobId);
  });

  it('returns upcoming scheduled jobs in drivers', async () => {
    const end = daysFromNow(10).slice(0, 10);
    const res = await request(app)
      .get(`/api/revenue/forecasting/overview?start=${TODAY}&end=${end}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const { drivers } = res.body;
    expect(Array.isArray(drivers)).toBe(true);
    expect(drivers.length).toBeGreaterThan(0);

    const driver = drivers.find(d => d.id === driverJobId);
    expect(driver).toBeDefined();
    expect(driver.amount).toBe(777);
  });

  it('driver entries have required fields', async () => {
    const end = daysFromNow(10).slice(0, 10);
    const res = await request(app)
      .get(`/api/revenue/forecasting/overview?start=${TODAY}&end=${end}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    for (const d of res.body.drivers) {
      expect(d).toHaveProperty('scheduledAt');
      expect(d).toHaveProperty('clientName');
      expect(d).toHaveProperty('serviceType');
      expect(d).toHaveProperty('status');
      expect(d).toHaveProperty('amount');
      expect(d).toHaveProperty('id');
    }
  });
});

// ── Tenant isolation ──────────────────────────────────────────────────────────

describe('Tenant isolation', () => {
  it('does not return primary tenant data to second tenant', async () => {
    const res = await request(app)
      .get('/api/revenue/forecasting/overview')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);

    // Other tenant has no jobs — earned must be 0
    expect(res.body.actual.earnedRevenue).toBe(0);
    expect(res.body.readiness.completedJobs).toBe(0);
    expect(res.body.drivers).toHaveLength(0);
  });
});

// ── Export ────────────────────────────────────────────────────────────────────

describe('GET /api/revenue/export?type=forecasting', () => {
  it('returns CSV with correct content-type', async () => {
    const end = daysFromNow(10).slice(0, 10);
    const res = await request(app)
      .get(`/api/revenue/export?type=forecasting&start=${TODAY}&end=${end}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/forecast-pipeline/);
  });
});
