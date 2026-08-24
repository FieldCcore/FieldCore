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
