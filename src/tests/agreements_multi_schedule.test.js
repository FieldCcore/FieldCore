'use strict';
require('dotenv').config();
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const app     = require('../app');
const pool    = require('../db/pool');
const { runMigrations } = require('../db/migrate');
const { processAgreement } = require('../services/agreementScheduler');

function makeToken(userId, accountId, role = 'owner') {
  return jwt.sign({ userId, accountId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

let accountId, userId, token;
let otherAccountId, otherToken;
let clientId, otherClientId;

beforeAll(async () => {
  await runMigrations();
  const hash = await bcrypt.hash('pw', 10);

  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1,'pro') RETURNING id`,
    [`__TEST_MS_${Date.now()}__`]
  );
  accountId = acct.id;

  const { rows: [u] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'MS Owner',$2,$3,'owner') RETURNING id`,
    [accountId, `ms-owner-${Date.now()}@test.fc`, hash]
  );
  userId = u.id;
  token  = makeToken(userId, accountId, 'owner');

  const { rows: [acct2] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1,'pro') RETURNING id`,
    [`__TEST_MS_OTHER_${Date.now()}__`]
  );
  otherAccountId = acct2.id;
  const { rows: [u2] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Other','ms-other-${Date.now()}@test.fc',$2,'owner') RETURNING id`,
    [otherAccountId, hash]
  );
  otherToken = makeToken(u2.id, otherAccountId, 'owner');

  const { rows: [c] } = await pool.query(
    `INSERT INTO clients (account_id, name, email) VALUES ($1,'MS Client','ms@test.fc') RETURNING id`,
    [accountId]
  );
  clientId = c.id;

  const { rows: [c2] } = await pool.query(
    `INSERT INTO clients (account_id, name, email) VALUES ($1,'Other Client','msother@test.fc') RETURNING id`,
    [otherAccountId]
  );
  otherClientId = c2.id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM accounts WHERE name LIKE '__TEST_MS_%'`);
  await pool.end();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createAgreement(overrides = {}) {
  const payload = {
    client_id:     clientId,
    name:          'Test Multi-Schedule Agreement',
    started_at:    '2026-08-27',
    billing_cadence:  'monthly',
    billing_trigger:  'first_day',
    plan_price:       100,
    payment_behavior: 'create_only',
    service_schedules: [
      {
        service_type: 'Vehicle 1 Detail',
        cadence:      'weekly',
        started_at:   '2026-08-27',
        service_address: '123 Main St',
      },
    ],
    ...overrides,
  };
  const res = await request(app)
    .post('/api/agreements')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
  return res;
}

// ── POST /api/agreements — multi-schedule creation ────────────────────────────

describe('POST /api/agreements — multi-schedule', () => {
  it('creates agreement with one schedule', async () => {
    const res = await createAgreement();
    expect(res.status).toBe(201);
    expect(res.body.service_schedules).toHaveLength(1);
    expect(res.body.service_schedules[0].service_type).toBe('Vehicle 1 Detail');
    expect(res.body.service_schedules[0].cadence).toBe('weekly');
  });

  it('creates agreement with two schedules', async () => {
    const res = await createAgreement({
      service_schedules: [
        { service_type: 'Vehicle 1', cadence: 'weekly', started_at: '2026-08-27', service_address: '123 Main' },
        { service_type: 'Vehicle 2', cadence: 'every_2_weeks', started_at: '2026-08-27', service_address: '123 Main' },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.service_schedules).toHaveLength(2);
    const types = res.body.service_schedules.map(s => s.service_type);
    expect(types).toContain('Vehicle 1');
    expect(types).toContain('Vehicle 2');
  });

  it('persists schedule fields — asset_label, service_address, cadence', async () => {
    const res = await createAgreement({
      service_schedules: [
        {
          service_type:    'Detail',
          asset_label:     'Unit A',
          service_address: '456 Oak Ave',
          cadence:         'monthly',
          service_day_of_month: 15,
          started_at:      '2026-08-27',
        },
      ],
    });
    expect(res.status).toBe(201);
    const s = res.body.service_schedules[0];
    expect(s.asset_label).toBe('Unit A');
    expect(s.service_address).toBe('456 Oak Ave');
    expect(s.service_day_of_month).toBe(15);
  });

  it('rejects invalid cadence', async () => {
    const res = await createAgreement({
      service_schedules: [{ service_type: 'X', cadence: 'hourly', started_at: '2026-08-27' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cadence/i);
  });

  it('rejects custom cadence without service_interval_days', async () => {
    const res = await createAgreement({
      service_schedules: [{ service_type: 'X', cadence: 'custom', started_at: '2026-08-27' }],
    });
    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/agreements').send({ name: 'x' });
    expect(res.status).toBe(401);
  });
});

// ── GET /api/agreements/:id — schedule embedding ──────────────────────────────

describe('GET /api/agreements/:id — schedule embedding', () => {
  let agreementId;

  beforeAll(async () => {
    const res = await createAgreement({
      service_schedules: [
        { service_type: 'Svc A', cadence: 'weekly',  started_at: '2026-08-27', service_address: '1 Main St' },
        { service_type: 'Svc B', cadence: 'monthly', started_at: '2026-08-27', service_address: '1 Main St' },
      ],
    });
    agreementId = res.body.id;
  });

  it('returns service_schedules array', async () => {
    const res = await request(app)
      .get(`/api/agreements/${agreementId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.service_schedules)).toBe(true);
    expect(res.body.service_schedules).toHaveLength(2);
  });

  it('schedule rows include all key fields', async () => {
    const res = await request(app)
      .get(`/api/agreements/${agreementId}`)
      .set('Authorization', `Bearer ${token}`);
    const s = res.body.service_schedules[0];
    expect(s).toHaveProperty('id');
    expect(s).toHaveProperty('cadence');
    expect(s).toHaveProperty('service_type');
    expect(s).toHaveProperty('status');
  });

  it('tenant isolation — other account cannot read', async () => {
    const res = await request(app)
      .get(`/api/agreements/${agreementId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });
});

// ── PATCH /api/agreements/:id — schedule update ───────────────────────────────

describe('PATCH /api/agreements/:id — schedule update', () => {
  let agreementId, schedule1Id;

  beforeAll(async () => {
    const res = await createAgreement({
      service_schedules: [
        { service_type: 'Initial Svc', cadence: 'weekly', started_at: '2026-08-27' },
      ],
    });
    agreementId = res.body.id;
    schedule1Id = res.body.service_schedules[0].id;
  });

  it('adds a second schedule via PATCH', async () => {
    const res = await request(app)
      .patch(`/api/agreements/${agreementId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        service_schedules: [
          { id: schedule1Id, service_type: 'Initial Svc', cadence: 'weekly', started_at: '2026-08-27' },
          { service_type: 'New Svc', cadence: 'monthly', started_at: '2026-09-01' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.service_schedules).toHaveLength(2);
  });
});

// ── PATCH /api/agreements/:id/schedules/:scheduleId — lifecycle ───────────────

describe('PATCH /api/agreements/:id/schedules/:scheduleId', () => {
  let agreementId, scheduleId;

  beforeAll(async () => {
    const res = await createAgreement({
      service_schedules: [
        { service_type: 'Lifecycle Svc', cadence: 'weekly', started_at: '2026-08-27' },
      ],
    });
    agreementId = res.body.id;
    scheduleId  = res.body.service_schedules[0].id;
  });

  it('pauses a schedule', async () => {
    const res = await request(app)
      .patch(`/api/agreements/${agreementId}/schedules/${scheduleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'paused' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('paused');
  });

  it('reactivates a paused schedule', async () => {
    const res = await request(app)
      .patch(`/api/agreements/${agreementId}/schedules/${scheduleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'active' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
  });

  it('cancels a schedule', async () => {
    const res = await request(app)
      .patch(`/api/agreements/${agreementId}/schedules/${scheduleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'cancelled' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
  });

  it('rejects invalid status value', async () => {
    const res = await request(app)
      .patch(`/api/agreements/${agreementId}/schedules/${scheduleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'deleted' });
    expect(res.status).toBe(400);
  });

  it('rejects request with no updatable fields', async () => {
    const res = await request(app)
      .patch(`/api/agreements/${agreementId}/schedules/${scheduleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('requires auth', async () => {
    const res = await request(app)
      .patch(`/api/agreements/${agreementId}/schedules/${scheduleId}`)
      .send({ status: 'paused' });
    expect(res.status).toBe(401);
  });

  it('tenant isolation — other account cannot mutate schedule', async () => {
    const createRes = await createAgreement({
      service_schedules: [{ service_type: 'X', cadence: 'monthly', started_at: '2026-08-27' }],
    });
    const sid = createRes.body.service_schedules[0].id;
    const aid = createRes.body.id;
    const res = await request(app)
      .patch(`/api/agreements/${aid}/schedules/${sid}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ status: 'paused' });
    expect(res.status).toBe(404);
  });
});

// ── scheduler — multi-schedule job generation ─────────────────────────────────

describe('agreementScheduler — multi-schedule job generation', () => {
  let agreementId, scheduleIds;

  beforeAll(async () => {
    // Two schedules, same address — should group into ONE job per date that overlaps
    const res = await createAgreement({
      name: 'Scheduler Multi Test',
      service_schedules: [
        {
          service_type:    'Vehicle 1',
          asset_label:     'Vehicle 1',
          cadence:         'weekly',
          preferred_weekday: 4,           // Thursday
          started_at:      '2026-08-27',
          service_address: '100 Group St',
        },
        {
          service_type:    'Vehicle 2',
          asset_label:     'Vehicle 2',
          cadence:         'every_2_weeks',
          preferred_weekday: 4,           // Thursday (same day, alternating)
          started_at:      '2026-08-27',
          service_address: '100 Group St',
        },
      ],
    });
    agreementId = res.body.id;
    scheduleIds = res.body.service_schedules.map(s => s.id);
  });

  it('generates jobs for active schedules', async () => {
    const agr = await pool.query(
      `SELECT ra.*, c.email AS client_email FROM recurring_agreements ra
       JOIN clients c ON c.id = ra.client_id
       WHERE ra.id = $1`,
      [agreementId]
    );
    await processAgreement(agr.rows[0]);

    const jobs = await pool.query(
      `SELECT * FROM jobs WHERE agreement_id = $1 AND status = 'scheduled'
       ORDER BY scheduled_at`,
      [agreementId]
    );
    expect(jobs.rows.length).toBeGreaterThan(0);
  });

  it('creates occurrence rows linking schedules to jobs', async () => {
    const occs = await pool.query(
      `SELECT * FROM agreement_schedule_occurrences WHERE agreement_id = $1`,
      [agreementId]
    );
    expect(occs.rows.length).toBeGreaterThan(0);
  });

  it('same-day grouping: shared address + date = ONE job', async () => {
    // Find a date where both schedules fire
    const occs = await pool.query(
      `SELECT occurrence_date, job_id FROM agreement_schedule_occurrences
       WHERE agreement_id = $1
       ORDER BY occurrence_date`,
      [agreementId]
    );

    // Group by (occurrence_date, job_id)
    const byDate = {};
    for (const row of occs.rows) {
      const d = row.occurrence_date instanceof Date
        ? row.occurrence_date.toISOString().slice(0, 10)
        : String(row.occurrence_date).slice(0, 10);
      if (!byDate[d]) byDate[d] = new Set();
      byDate[d].add(row.job_id);
    }

    // Any date that has 2 occurrence rows must have exactly 1 unique job_id
    for (const [, jobSet] of Object.entries(byDate)) {
      expect(jobSet.size).toBe(1);  // multiple schedules share ONE job
    }
  });

  it('idempotency — running scheduler twice does not create duplicate jobs', async () => {
    const agr = await pool.query(
      `SELECT * FROM recurring_agreements WHERE id = $1`,
      [agreementId]
    );
    await processAgreement(agr.rows[0]);

    const jobs = await pool.query(
      `SELECT COUNT(*) AS cnt FROM jobs WHERE agreement_id = $1 AND status = 'scheduled'`,
      [agreementId]
    );
    const occs = await pool.query(
      `SELECT COUNT(*) AS cnt FROM agreement_schedule_occurrences WHERE agreement_id = $1`,
      [agreementId]
    );

    // Run again — counts must not change
    await processAgreement(agr.rows[0]);

    const jobs2 = await pool.query(
      `SELECT COUNT(*) AS cnt FROM jobs WHERE agreement_id = $1 AND status = 'scheduled'`,
      [agreementId]
    );
    const occs2 = await pool.query(
      `SELECT COUNT(*) AS cnt FROM agreement_schedule_occurrences WHERE agreement_id = $1`,
      [agreementId]
    );

    expect(parseInt(jobs2.rows[0].cnt, 10)).toBe(parseInt(jobs.rows[0].cnt, 10));
    expect(parseInt(occs2.rows[0].cnt, 10)).toBe(parseInt(occs.rows[0].cnt, 10));
  });
});

// ── scheduler — different locations do NOT group ──────────────────────────────

describe('agreementScheduler — different locations prevent grouping', () => {
  let agreementId;

  beforeAll(async () => {
    const res = await createAgreement({
      name: 'Scheduler Split Test',
      service_schedules: [
        {
          service_type:    'Svc A',
          cadence:         'weekly',
          preferred_weekday: 1,           // Monday
          started_at:      '2026-08-27',
          service_address: '100 Alpha St',
        },
        {
          service_type:    'Svc B',
          cadence:         'weekly',
          preferred_weekday: 1,           // Monday, same day, DIFFERENT address
          started_at:      '2026-08-27',
          service_address: '200 Beta Ave',
        },
      ],
    });
    agreementId = res.body.id;
  });

  it('creates separate jobs for different service addresses on the same day', async () => {
    const agr = await pool.query(
      `SELECT * FROM recurring_agreements WHERE id = $1`,
      [agreementId]
    );
    await processAgreement(agr.rows[0]);

    const countRes = await pool.query(
      `SELECT COUNT(*) AS cnt FROM jobs WHERE agreement_id = $1 AND status = 'scheduled'`,
      [agreementId]
    );
    const occsRes = await pool.query(
      `SELECT COUNT(*) AS cnt FROM agreement_schedule_occurrences WHERE agreement_id = $1`,
      [agreementId]
    );

    const jobCount = parseInt(countRes.rows[0].cnt, 10);
    const occCount = parseInt(occsRes.rows[0].cnt, 10);

    // With different addresses: no grouping — each occurrence creates its own job
    // job_count == occurrence_count (unlike same-address where job_count < occurrence_count)
    expect(jobCount).toBe(occCount);
    expect(jobCount).toBeGreaterThan(0);
  });
});

// ── scheduler — single invoice per agreement per period ───────────────────────

describe('agreementScheduler — billing: one invoice per period regardless of schedule count', () => {
  let agreementId;

  beforeAll(async () => {
    const res = await createAgreement({
      name:             'Billing Single Invoice Test',
      billing_cadence:  'monthly',
      billing_trigger:  'first_day',
      plan_price:       200,
      payment_behavior: 'create_only',
      service_schedules: [
        { service_type: 'Svc X', cadence: 'weekly',  started_at: '2026-08-01', service_address: '5 Park Rd' },
        { service_type: 'Svc Y', cadence: 'weekly',  started_at: '2026-08-01', service_address: '5 Park Rd' },
        { service_type: 'Svc Z', cadence: 'monthly', started_at: '2026-08-01', service_address: '5 Park Rd' },
      ],
    });
    agreementId = res.body.id;
  });

  it('creates exactly one billing period per month regardless of schedule count', async () => {
    const agr = await pool.query(
      `SELECT * FROM recurring_agreements WHERE id = $1`,
      [agreementId]
    );
    await processAgreement(agr.rows[0]);

    const periods = await pool.query(
      `SELECT * FROM agreement_invoice_periods WHERE agreement_id = $1
       ORDER BY period_start`,
      [agreementId]
    );
    // Should be 1 or 2 periods (current + next) — never 3 (one per schedule)
    expect(periods.rows.length).toBeLessThanOrEqual(2);
    expect(periods.rows.length).toBeGreaterThanOrEqual(1);

    // All periods belong to this one agreement
    for (const p of periods.rows) {
      expect(p.agreement_id).toBe(agreementId);
    }
  });
});

// ── backfill — existing agreements get one child schedule ─────────────────────

describe('migration backfill', () => {
  it('existing agreements have at least one child schedule after migration', async () => {
    // The backfill migration creates a child schedule for every agreement that lacks one
    const res = await pool.query(
      `SELECT ra.id, COUNT(s.id) AS schedule_count
       FROM recurring_agreements ra
       LEFT JOIN recurring_agreement_schedules s ON s.agreement_id = ra.id
       WHERE ra.account_id = $1
       GROUP BY ra.id
       HAVING COUNT(s.id) = 0`,
      [accountId]
    );
    // No agreements should have 0 schedules after backfill
    expect(res.rows.length).toBe(0);
  });
});
