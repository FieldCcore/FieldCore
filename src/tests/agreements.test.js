'use strict';
require('dotenv').config();
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const app     = require('../app');
const pool    = require('../db/pool');
const { runMigrations } = require('../db/migrate');

function makeToken(userId, accountId, role = 'owner') {
  return jwt.sign({ userId, accountId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

let accountId, userId, token;
let otherAccountId, otherToken;
let clientId;

beforeAll(async () => {
  await runMigrations();
  const hash = await bcrypt.hash('pw', 10);

  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
    [`__TEST_AGR_${Date.now()}__`]
  );
  accountId = acct.id;

  const { rows: [u] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Agr Owner',$2,$3,'owner') RETURNING id`,
    [accountId, `agr-owner-${Date.now()}@test.fc`, hash]
  );
  userId = u.id;
  token  = makeToken(userId, accountId, 'owner');

  const { rows: [acct2] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
    [`__TEST_AGR_OTHER_${Date.now()}__`]
  );
  otherAccountId = acct2.id;
  const { rows: [u2] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Other','agr-other-${Date.now()}@test.fc',$2,'owner') RETURNING id`,
    [otherAccountId, hash]
  );
  otherToken = makeToken(u2.id, otherAccountId, 'owner');

  const { rows: [c] } = await pool.query(
    `INSERT INTO clients (account_id, name, email) VALUES ($1,'Test Client','client@test.fc') RETURNING id`,
    [accountId]
  );
  clientId = c.id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM accounts WHERE name LIKE '__TEST_AGR_%'`);
  await pool.end();
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('Agreements — auth', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/agreements').send({});
    expect(res.status).toBe(401);
  });
  it('returns 401 on GET without token', async () => {
    const res = await request(app).get('/api/agreements');
    expect(res.status).toBe(401);
  });
});

// ── Create ────────────────────────────────────────────────────────────────────

describe('Agreements — create', () => {
  it('creates a basic monthly agreement', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Monthly AC Service', plan_price: 200 });
    expect(res.status).toBe(201);
    expect(res.body.cadence).toBe('monthly');
    expect(res.body.billing_trigger).toBe('first_day');
    expect(res.body.included_services_per_period).toBe(1);
    expect(res.body.extra_occurrence_policy).toBe('all_included');
  });

  it('creates agreement with every_2_weeks cadence', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'Bi-Weekly Service',
        cadence: 'every_2_weeks', billing_cadence: 'monthly',
        billing_trigger: 'first_completed',
        included_services_per_period: 2,
        plan_price: 200,
      });
    expect(res.status).toBe(201);
    expect(res.body.cadence).toBe('every_2_weeks');
    expect(res.body.billing_cadence).toBe('monthly');
    expect(res.body.billing_trigger).toBe('first_completed');
    expect(res.body.included_services_per_period).toBe(2);
  });

  it('creates agreement with every_3_weeks cadence', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: '3-Week Service', cadence: 'every_3_weeks', plan_price: 100 });
    expect(res.status).toBe(201);
    expect(res.body.cadence).toBe('every_3_weeks');
  });

  it('creates agreement with every_4_weeks cadence', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: '4-Week Service', cadence: 'every_4_weeks', plan_price: 150 });
    expect(res.status).toBe(201);
    expect(res.body.cadence).toBe('every_4_weeks');
  });

  it('creates agreement with specific_day billing trigger', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'Specific Day Billing',
        billing_trigger: 'specific_day', billing_day: 15,
        plan_price: 300,
      });
    expect(res.status).toBe(201);
    expect(res.body.billing_trigger).toBe('specific_day');
    expect(res.body.billing_day).toBe(15);
  });

  it('creates agreement with custom cadence + service_interval_days', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'Custom 10-Day Service',
        cadence: 'custom', service_interval_days: 10,
        plan_price: 120,
      });
    expect(res.status).toBe(201);
    expect(res.body.cadence).toBe('custom');
    expect(res.body.service_interval_days).toBe(10);
  });

  it('creates agreement with every_service billing cadence', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'Per-Service Billing',
        billing_cadence: 'every_service', billing_trigger: 'every_service',
        plan_price: 75,
      });
    expect(res.status).toBe(201);
    expect(res.body.billing_cadence).toBe('every_service');
  });

  it('creates agreement with extra_occurrence_policy = max_n', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'Max-N Agreement',
        included_services_per_period: 2,
        extra_occurrence_policy: 'max_n',
        plan_price: 200,
      });
    expect(res.status).toBe(201);
    expect(res.body.extra_occurrence_policy).toBe('max_n');
  });

  it('creates agreement with missed_service_policy = credit', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'Credit Missed Agreement',
        missed_service_policy: 'credit',
        plan_price: 100,
      });
    expect(res.status).toBe(201);
    expect(res.body.missed_service_policy).toBe('credit');
  });

  it('creates agreement with missed_service_policy = rollover', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'Rollover Missed Agreement',
        missed_service_policy: 'rollover',
        plan_price: 100,
      });
    expect(res.status).toBe(201);
    expect(res.body.missed_service_policy).toBe('rollover');
  });

  it('defaults missed_service_policy to no_adjustment', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Default Missed Policy', plan_price: 50 });
    expect(res.status).toBe(201);
    expect(res.body.missed_service_policy).toBe('no_adjustment');
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe('Agreements — validation', () => {
  it('rejects missing client_id', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'No Client' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/client_id/i);
  });

  it('rejects missing name', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it('rejects invalid cadence', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Test', cadence: 'hourly', plan_price: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cadence/i);
  });

  it('rejects invalid billing_trigger', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Test', billing_trigger: 'never', plan_price: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/billing_trigger/i);
  });

  it('rejects specific_day trigger without valid billing_day', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Test', billing_trigger: 'specific_day', billing_day: 35, plan_price: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/billing_day/i);
  });

  it('rejects custom cadence without service_interval_days', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Test', cadence: 'custom', plan_price: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/service_interval_days/i);
  });

  it('rejects invalid extra_occurrence_policy', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Test', extra_occurrence_policy: 'ignore', plan_price: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/extra_occurrence_policy/i);
  });

  it('rejects invalid missed_service_policy', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Test', missed_service_policy: 'delete', plan_price: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missed_service_policy/i);
  });
});

// ── PATCH ─────────────────────────────────────────────────────────────────────

describe('Agreements — patch', () => {
  let agrId;
  beforeAll(async () => {
    const { rows: [a] } = await pool.query(
      `INSERT INTO recurring_agreements (account_id, client_id, name, cadence, billing_cadence, plan_price, created_by)
       VALUES ($1,$2,'Patch Test','monthly','monthly',100,$3) RETURNING id`,
      [accountId, clientId, userId]
    );
    agrId = a.id;
  });

  it('updates billing_trigger', async () => {
    const res = await request(app)
      .patch(`/api/agreements/${agrId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ billing_trigger: 'first_completed' });
    expect(res.status).toBe(200);
    expect(res.body.billing_trigger).toBe('first_completed');
  });

  it('updates included_services_per_period', async () => {
    const res = await request(app)
      .patch(`/api/agreements/${agrId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ included_services_per_period: 4 });
    expect(res.status).toBe(200);
    expect(res.body.included_services_per_period).toBe(4);
  });

  it('updates cadence to every_2_weeks', async () => {
    const res = await request(app)
      .patch(`/api/agreements/${agrId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cadence: 'every_2_weeks' });
    expect(res.status).toBe(200);
    expect(res.body.cadence).toBe('every_2_weeks');
  });
});

// ── End date ──────────────────────────────────────────────────────────────────

describe('Agreements — end date', () => {
  it('creates agreement with end_condition_type=date and end_date', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'Limited Term Agreement',
        plan_price: 250,
        started_at: '2026-09-01',
        end_condition_type: 'date',
        end_date: '2026-12-31',
      });
    expect(res.status).toBe(201);
    expect(res.body.end_date).toMatch(/2026-12-31/);
  });

  it('creates agreement without end_date (open-ended)', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Open-Ended Agreement', plan_price: 100 });
    expect(res.status).toBe(201);
    expect(res.body.end_date).toBeNull();
  });

  it('patches end_condition_type=date and end_date onto an existing agreement', async () => {
    const create = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Patch EndDate Agr', plan_price: 80 });
    expect(create.status).toBe(201);
    const res = await request(app)
      .patch(`/api/agreements/${create.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ end_condition_type: 'date', end_date: '2027-06-30' });
    expect(res.status).toBe(200);
    expect(res.body.end_date).toMatch(/2027-06-30/);
  });
});

// ── Draft status ──────────────────────────────────────────────────────────────

describe('Agreements — draft status', () => {
  it('accepts status=draft on create', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Draft Agreement', plan_price: 50, payment_status: 'pending' });
    expect(res.status).toBe(201);
    // default status is active; patch it to draft
    const patch = await request(app)
      .patch(`/api/agreements/${res.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'draft' });
    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe('draft');
  });

  it('accepts status transitions: draft → active', async () => {
    const create = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Activate Agreement', plan_price: 50, payment_status: 'pending' });
    await request(app)
      .patch(`/api/agreements/${create.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'draft' });
    const activate = await request(app)
      .patch(`/api/agreements/${create.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'active' });
    expect(activate.status).toBe(200);
    expect(activate.body.status).toBe('active');
  });
});

// ── Schedule preview ──────────────────────────────────────────────────────────

describe('Agreements — schedule preview', () => {
  it('returns next 4 service dates for monthly cadence', async () => {
    const res = await request(app)
      .post('/api/agreements/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ cadence: 'monthly', started_at: '2026-01-01', count: 4 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.services)).toBe(true);
    expect(res.body.services.length).toBe(4);
    res.body.services.forEach(d => expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('all preview dates are in the future', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app)
      .post('/api/agreements/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ cadence: 'monthly', started_at: '2020-01-15', count: 4 });
    expect(res.status).toBe(200);
    res.body.services.forEach(d => expect(d >= today).toBe(true));
  });

  it('returns weekly cadence dates 7 days apart', async () => {
    const res = await request(app)
      .post('/api/agreements/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ cadence: 'weekly', started_at: '2026-01-01', count: 3 });
    expect(res.status).toBe(200);
    const dates = res.body.services;
    expect(dates.length).toBe(3);
    const diff0 = (new Date(dates[1]) - new Date(dates[0])) / 86400000;
    const diff1 = (new Date(dates[2]) - new Date(dates[1])) / 86400000;
    expect(diff0).toBe(7);
    expect(diff1).toBe(7);
  });

  it('returns every_2_weeks cadence dates exactly 14 days apart', async () => {
    const res = await request(app)
      .post('/api/agreements/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ cadence: 'every_2_weeks', started_at: '2026-01-01', count: 3 });
    expect(res.status).toBe(200);
    const dates = res.body.services;
    expect(dates.length).toBe(3);
    const diff = (new Date(dates[1]) - new Date(dates[0])) / 86400000;
    expect(diff).toBe(14);
  });

  it('clamps count to 8 maximum', async () => {
    const res = await request(app)
      .post('/api/agreements/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ cadence: 'weekly', started_at: '2026-01-01', count: 20 });
    expect(res.status).toBe(200);
    expect(res.body.services.length).toBeLessThanOrEqual(8);
  });

  it('custom cadence uses service_interval_days', async () => {
    const res = await request(app)
      .post('/api/agreements/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ cadence: 'custom', started_at: '2026-01-01', service_interval_days: 10, count: 3 });
    expect(res.status).toBe(200);
    const dates = res.body.services;
    const diff = (new Date(dates[1]) - new Date(dates[0])) / 86400000;
    expect(diff).toBe(10);
  });

  it('preview requires auth', async () => {
    const res = await request(app)
      .post('/api/agreements/preview')
      .send({ cadence: 'monthly', started_at: '2026-01-01' });
    expect(res.status).toBe(401);
  });
});

// ── Tenant isolation ──────────────────────────────────────────────────────────

describe('Agreements — tenant isolation', () => {
  let agrId;
  beforeAll(async () => {
    const { rows: [a] } = await pool.query(
      `INSERT INTO recurring_agreements (account_id, client_id, name, cadence, billing_cadence, plan_price, created_by)
       VALUES ($1,$2,'Isolation Test','monthly','monthly',100,$3) RETURNING id`,
      [accountId, clientId, userId]
    );
    agrId = a.id;
  });

  it('other account cannot read agreements from this account', async () => {
    const res = await request(app)
      .get('/api/agreements')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.map(a => a.id);
    expect(ids).not.toContain(agrId);
  });

  it('other account gets 404 on direct access', async () => {
    const res = await request(app)
      .get(`/api/agreements/${agrId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });
});

// ── V2: new extra_occurrence_policy values ────────────────────────────────────

describe('Agreements V2 — extra_occurrence_policy expansion', () => {
  it('creates with extra_occurrence_policy = charge_per_additional + additional_service_price', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'Charge Per Additional',
        extra_occurrence_policy: 'charge_per_additional',
        additional_service_price: 49.99,
        plan_price: 200,
      });
    expect(res.status).toBe(201);
    expect(res.body.extra_occurrence_policy).toBe('charge_per_additional');
    expect(parseFloat(res.body.additional_service_price)).toBeCloseTo(49.99);
  });

  it('rejects charge_per_additional without additional_service_price', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'Missing Price',
        extra_occurrence_policy: 'charge_per_additional',
        plan_price: 200,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/additional_service_price/i);
  });

  it('creates with extra_occurrence_policy = approval_required', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Approval Required', extra_occurrence_policy: 'approval_required', plan_price: 100 });
    expect(res.status).toBe(201);
    expect(res.body.extra_occurrence_policy).toBe('approval_required');
  });

  it('creates with extra_occurrence_policy = no_additional', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'No Additional', extra_occurrence_policy: 'no_additional', plan_price: 100 });
    expect(res.status).toBe(201);
    expect(res.body.extra_occurrence_policy).toBe('no_additional');
  });
});

// ── V2: new missed_service_policy values ──────────────────────────────────────

describe('Agreements V2 — missed_service_policy expansion', () => {
  it('creates with missed_service_policy = reschedule', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Reschedule Missed', missed_service_policy: 'reschedule', plan_price: 100 });
    expect(res.status).toBe(201);
    expect(res.body.missed_service_policy).toBe('reschedule');
  });

  it('creates with missed_service_policy = carry_forward', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Carry Forward Missed', missed_service_policy: 'carry_forward', plan_price: 100 });
    expect(res.status).toBe(201);
    expect(res.body.missed_service_policy).toBe('carry_forward');
  });

  it('creates with missed_service_policy = forfeited', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Forfeited Missed', missed_service_policy: 'forfeited', plan_price: 100 });
    expect(res.status).toBe(201);
    expect(res.body.missed_service_policy).toBe('forfeited');
  });
});

// ── V2: scheduling controls ───────────────────────────────────────────────────

describe('Agreements V2 — scheduling controls', () => {
  it('stores preferred_weekday for weekly cadence', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'Monday Weekly',
        cadence: 'weekly', preferred_weekday: 1, plan_price: 100,
      });
    expect(res.status).toBe(201);
    expect(res.body.preferred_weekday).toBe(1);
  });

  it('stores preferred_weekday = 0 (Sunday)', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'Sunday Weekly',
        cadence: 'every_2_weeks', preferred_weekday: 0, plan_price: 100,
      });
    expect(res.status).toBe(201);
    expect(res.body.preferred_weekday).toBe(0);
  });

  it('rejects preferred_weekday out of range (7)', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Bad Weekday', preferred_weekday: 7, plan_price: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/preferred_weekday/i);
  });

  it('rejects preferred_weekday out of range (-1)', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Bad Weekday Neg', preferred_weekday: -1, plan_price: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/preferred_weekday/i);
  });

  it('stores service_day_of_month for monthly cadence', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: '15th Monthly',
        cadence: 'monthly', service_day_of_month: 15, plan_price: 100,
      });
    expect(res.status).toBe(201);
    expect(res.body.service_day_of_month).toBe(15);
  });

  it('rejects service_day_of_month = 0', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Bad DOM', service_day_of_month: 0, plan_price: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/service_day_of_month/i);
  });

  it('rejects service_day_of_month = 32', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Bad DOM High', service_day_of_month: 32, plan_price: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/service_day_of_month/i);
  });
});

// ── V2: end conditions ────────────────────────────────────────────────────────

describe('Agreements V2 — end conditions', () => {
  it('stores end_after_occurrences when end_condition_type=service_count', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'After 12 Services',
        end_condition_type: 'service_count',
        end_after_occurrences: 12, plan_price: 100,
      });
    expect(res.status).toBe(201);
    expect(res.body.end_after_occurrences).toBe(12);
  });

  it('stores end_after_periods when end_condition_type=billing_period_count', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'After 6 Periods',
        end_condition_type: 'billing_period_count',
        end_after_periods: 6, plan_price: 100,
      });
    expect(res.status).toBe(201);
    expect(res.body.end_after_periods).toBe(6);
  });

  it('end_after_occurrences and end_after_periods default to null', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'No End Conditions', plan_price: 100 });
    expect(res.status).toBe(201);
    expect(res.body.end_after_occurrences).toBeNull();
    expect(res.body.end_after_periods).toBeNull();
  });
});

// ── V2: billing trigger — days_before_first_service ──────────────────────────

describe('Agreements V2 — days_before_first_service trigger', () => {
  it('creates with days_before_first_service trigger + days_before_service', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'Bill 7 Days Before',
        billing_trigger: 'days_before_first_service',
        days_before_service: 7,
        plan_price: 200,
      });
    expect(res.status).toBe(201);
    expect(res.body.billing_trigger).toBe('days_before_first_service');
    expect(res.body.days_before_service).toBe(7);
  });

  it('rejects days_before_first_service trigger without days_before_service', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'Missing Days Before',
        billing_trigger: 'days_before_first_service',
        plan_price: 200,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/days_before_service/i);
  });
});

// ── V2: billing_day accepts 29–31 ─────────────────────────────────────────────

describe('Agreements V2 — billing_day extended range', () => {
  it('accepts billing_day = 29', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Day 29', billing_trigger: 'specific_day', billing_day: 29, plan_price: 100 });
    expect(res.status).toBe(201);
    expect(res.body.billing_day).toBe(29);
  });

  it('accepts billing_day = 31', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Day 31', billing_trigger: 'specific_day', billing_day: 31, plan_price: 100 });
    expect(res.status).toBe(201);
    expect(res.body.billing_day).toBe(31);
  });

  it('rejects billing_day = 32', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Day 32', billing_trigger: 'specific_day', billing_day: 32, plan_price: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/billing_day/i);
  });
});

// ── V2: payment_behavior ──────────────────────────────────────────────────────

describe('Agreements V2 — payment_behavior', () => {
  it('defaults payment_behavior to send_invoice', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Default Payment Behavior', plan_price: 100 });
    expect(res.status).toBe(201);
    expect(res.body.payment_behavior).toBe('send_invoice');
  });

  it('creates with payment_behavior = create_only', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Draft Only', payment_behavior: 'create_only', plan_price: 100 });
    expect(res.status).toBe(201);
    expect(res.body.payment_behavior).toBe('create_only');
  });

  it('creates with payment_behavior = auto_charge_card', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Auto Charge Card', payment_behavior: 'auto_charge_card', plan_price: 100 });
    expect(res.status).toBe(201);
    expect(res.body.payment_behavior).toBe('auto_charge_card');
  });

  it('creates with payment_behavior = auto_charge_ach', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Auto Charge ACH', payment_behavior: 'auto_charge_ach', plan_price: 100 });
    expect(res.status).toBe(201);
    expect(res.body.payment_behavior).toBe('auto_charge_ach');
  });

  it('rejects invalid payment_behavior', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Bad Behavior', payment_behavior: 'wire_transfer', plan_price: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/payment_behavior/i);
  });

  it('patches payment_behavior to auto_charge_card', async () => {
    const create = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Patch Payment Behavior', plan_price: 100 });
    expect(create.status).toBe(201);
    const res = await request(app)
      .patch(`/api/agreements/${create.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ payment_behavior: 'auto_charge_card' });
    expect(res.status).toBe(200);
    expect(res.body.payment_behavior).toBe('auto_charge_card');
  });
});

// ── V2: discounts ─────────────────────────────────────────────────────────────

describe('Agreements V2 — discounts', () => {
  it('defaults discount_type to none', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'No Discount', plan_price: 100 });
    expect(res.status).toBe(201);
    expect(res.body.discount_type).toBe('none');
  });

  it('creates with percent discount', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'Percent Discount',
        discount_type: 'percent', discount_value: 10, discount_name: 'Loyalty 10%',
        plan_price: 200,
      });
    expect(res.status).toBe(201);
    expect(res.body.discount_type).toBe('percent');
    expect(parseFloat(res.body.discount_value)).toBeCloseTo(10);
    expect(res.body.discount_name).toBe('Loyalty 10%');
  });

  it('creates with fixed discount', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'Fixed Discount',
        discount_type: 'fixed', discount_value: 25.00, discount_name: 'First month off',
        plan_price: 200,
      });
    expect(res.status).toBe(201);
    expect(res.body.discount_type).toBe('fixed');
    expect(parseFloat(res.body.discount_value)).toBeCloseTo(25);
    expect(res.body.discount_name).toBe('First month off');
  });

  it('rejects invalid discount_type', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Bad Discount', discount_type: 'coupon', plan_price: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/discount_type/i);
  });

  it('patches discount_type and discount_value', async () => {
    const create = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Patch Discount', plan_price: 200 });
    expect(create.status).toBe(201);
    const res = await request(app)
      .patch(`/api/agreements/${create.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ discount_type: 'percent', discount_value: 15, discount_name: 'Spring sale' });
    expect(res.status).toBe(200);
    expect(res.body.discount_type).toBe('percent');
    expect(parseFloat(res.body.discount_value)).toBeCloseTo(15);
    expect(res.body.discount_name).toBe('Spring sale');
  });
});

// ── V2: taxability ────────────────────────────────────────────────────────────

describe('Agreements V2 — taxability', () => {
  it('defaults taxable to false', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Default Taxable', plan_price: 100 });
    expect(res.status).toBe(201);
    expect(res.body.taxable).toBe(false);
  });

  it('creates with taxable = true', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Taxable Agreement', taxable: true, plan_price: 100 });
    expect(res.status).toBe(201);
    expect(res.body.taxable).toBe(true);
  });

  it('patches taxable to true', async () => {
    const create = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Patch Taxable', plan_price: 100 });
    expect(create.status).toBe(201);
    const res = await request(app)
      .patch(`/api/agreements/${create.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ taxable: true });
    expect(res.status).toBe(200);
    expect(res.body.taxable).toBe(true);
  });
});

// ── V2: preview with preferredWeekday and serviceDayOfMonth ──────────────────

describe('Agreements V2 — preview scheduling controls', () => {
  it('preview with preferred_weekday snaps all dates to that weekday', async () => {
    const res = await request(app)
      .post('/api/agreements/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ cadence: 'weekly', started_at: '2026-01-01', preferred_weekday: 1, count: 4 });
    expect(res.status).toBe(200);
    const dates = res.body.services;
    expect(dates.length).toBe(4);
    dates.forEach(d => {
      const day = new Date(d + 'T00:00:00').getDay();
      expect(day).toBe(1); // Monday
    });
  });

  it('preview with service_day_of_month uses that day for monthly', async () => {
    const res = await request(app)
      .post('/api/agreements/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ cadence: 'monthly', started_at: '2026-01-01', service_day_of_month: 15, count: 3 });
    expect(res.status).toBe(200);
    const dates = res.body.services;
    expect(dates.length).toBe(3);
    dates.forEach(d => {
      const dom = parseInt(d.slice(8, 10), 10);
      expect(dom).toBe(15);
    });
  });
});

// ── V2: service catalog search ────────────────────────────────────────────────

describe('Agreements — service catalog search', () => {
  it('returns 200 from GET /api/agreements/services', async () => {
    const res = await request(app)
      .get('/api/agreements/services?q=')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('requires auth on service catalog search', async () => {
    const res = await request(app).get('/api/agreements/services?q=test');
    expect(res.status).toBe(401);
  });
});

// ── V6: end_condition_type ────────────────────────────────────────────────────

describe('Agreements V6 — end_condition_type', () => {
  it('defaults end_condition_type to none', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'No End Condition', plan_price: 100 });
    expect(res.status).toBe(201);
    expect(res.body.end_condition_type).toBe('none');
    expect(res.body.end_date).toBeNull();
    expect(res.body.end_after_occurrences).toBeNull();
    expect(res.body.end_after_periods).toBeNull();
  });

  it('rejects invalid end_condition_type', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Bad End Cond', end_condition_type: 'forever', plan_price: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/end_condition_type/i);
  });

  it('creates with end_condition_type=date and stores end_date', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'End By Date',
        end_condition_type: 'date',
        started_at: '2026-09-01',
        end_date: '2026-12-31',
        plan_price: 200,
      });
    expect(res.status).toBe(201);
    expect(res.body.end_condition_type).toBe('date');
    expect(res.body.end_date).toMatch(/2026-12-31/);
    expect(res.body.end_after_occurrences).toBeNull();
    expect(res.body.end_after_periods).toBeNull();
  });

  it('rejects end_condition_type=date without end_date', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'Missing End Date',
        end_condition_type: 'date',
        plan_price: 100,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/end_date/i);
  });

  it('rejects end_condition_type=date when end_date precedes started_at', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'Inverted Date Range',
        end_condition_type: 'date',
        started_at: '2026-10-01',
        end_date: '2026-09-01',
        plan_price: 100,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/end_date/i);
  });

  it('creates with end_condition_type=service_count and stores end_after_occurrences', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'After 1 Service',
        end_condition_type: 'service_count',
        end_after_occurrences: 1,
        plan_price: 100,
      });
    expect(res.status).toBe(201);
    expect(res.body.end_condition_type).toBe('service_count');
    expect(res.body.end_after_occurrences).toBe(1);
    expect(res.body.end_date).toBeNull();
    expect(res.body.end_after_periods).toBeNull();
  });

  it('creates with end_condition_type=service_count, multiple occurrences', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'After 5 Services',
        end_condition_type: 'service_count',
        end_after_occurrences: 5,
        plan_price: 100,
      });
    expect(res.status).toBe(201);
    expect(res.body.end_condition_type).toBe('service_count');
    expect(res.body.end_after_occurrences).toBe(5);
  });

  it('rejects end_condition_type=service_count without end_after_occurrences', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'Missing Occurrences',
        end_condition_type: 'service_count',
        plan_price: 100,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/end_after_occurrences/i);
  });

  it('rejects end_condition_type=service_count with end_after_occurrences=0', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'Zero Occurrences',
        end_condition_type: 'service_count',
        end_after_occurrences: 0,
        plan_price: 100,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/end_after_occurrences/i);
  });

  it('creates with end_condition_type=billing_period_count after 1 period', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'After 1 Period',
        end_condition_type: 'billing_period_count',
        end_after_periods: 1,
        plan_price: 100,
      });
    expect(res.status).toBe(201);
    expect(res.body.end_condition_type).toBe('billing_period_count');
    expect(res.body.end_after_periods).toBe(1);
    expect(res.body.end_date).toBeNull();
    expect(res.body.end_after_occurrences).toBeNull();
  });

  it('creates with end_condition_type=billing_period_count, multiple periods', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'After 12 Periods',
        end_condition_type: 'billing_period_count',
        end_after_periods: 12,
        plan_price: 100,
      });
    expect(res.status).toBe(201);
    expect(res.body.end_condition_type).toBe('billing_period_count');
    expect(res.body.end_after_periods).toBe(12);
  });

  it('rejects end_condition_type=billing_period_count without end_after_periods', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'Missing Periods',
        end_condition_type: 'billing_period_count',
        plan_price: 100,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/end_after_periods/i);
  });

  it('rejects end_condition_type=billing_period_count with end_after_periods=0', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId, name: 'Zero Periods',
        end_condition_type: 'billing_period_count',
        end_after_periods: 0,
        plan_price: 100,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/end_after_periods/i);
  });

  it('patches end_condition_type from none to service_count', async () => {
    const create = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Patch End Cond', plan_price: 100 });
    expect(create.status).toBe(201);
    expect(create.body.end_condition_type).toBe('none');

    const res = await request(app)
      .patch(`/api/agreements/${create.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ end_condition_type: 'service_count', end_after_occurrences: 3 });
    expect(res.status).toBe(200);
    expect(res.body.end_condition_type).toBe('service_count');
  });

  it('accepts status=completed on PATCH', async () => {
    const create = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Complete Me', plan_price: 100 });
    expect(create.status).toBe(201);

    const res = await request(app)
      .patch(`/api/agreements/${create.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
  });

  it('rejects invalid end_condition_type on PATCH', async () => {
    const create = await request(app)
      .post('/api/agreements')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, name: 'Patch Bad End Cond', plan_price: 100 });
    expect(create.status).toBe(201);

    const res = await request(app)
      .patch(`/api/agreements/${create.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ end_condition_type: 'never' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/end_condition_type/i);
  });
});

// ── V6: preview end condition cutoffs ─────────────────────────────────────────

describe('Agreements V6 — preview end condition cutoffs', () => {
  it('end_condition_type=date filters preview dates after end_date', async () => {
    const res = await request(app)
      .post('/api/agreements/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cadence: 'monthly',
        started_at: '2026-09-01',
        count: 6,
        end_condition_type: 'date',
        end_date: '2026-11-30',
      });
    expect(res.status).toBe(200);
    const dates = res.body.services;
    expect(Array.isArray(dates)).toBe(true);
    dates.forEach(d => expect(d <= '2026-11-30').toBe(true));
    expect(dates.length).toBeLessThanOrEqual(3);
  });

  it('end_condition_type=service_count limits preview to N dates', async () => {
    const res = await request(app)
      .post('/api/agreements/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cadence: 'weekly',
        started_at: '2026-01-01',
        count: 8,
        end_condition_type: 'service_count',
        end_after_occurrences: 3,
      });
    expect(res.status).toBe(200);
    expect(res.body.services.length).toBe(3);
  });

  it('end_condition_type=none does not truncate preview', async () => {
    const res = await request(app)
      .post('/api/agreements/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cadence: 'weekly',
        started_at: '2026-01-01',
        count: 6,
        end_condition_type: 'none',
      });
    expect(res.status).toBe(200);
    expect(res.body.services.length).toBe(6);
  });

  it('end_condition_type=billing_period_count does not truncate preview', async () => {
    const res = await request(app)
      .post('/api/agreements/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cadence: 'monthly',
        started_at: '2026-01-01',
        count: 4,
        end_condition_type: 'billing_period_count',
        end_after_periods: 2,
      });
    expect(res.status).toBe(200);
    expect(res.body.services.length).toBe(4);
  });
});
