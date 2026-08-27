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

const TODAY = new Date().toISOString().slice(0, 10);

let accountId, userId, token;
let otherAccountId, otherToken;
let clientId, jobId;
let inv1Id, inv2Id, paidInvId;

beforeAll(async () => {
  await runMigrations();
  const hash = await bcrypt.hash('pw', 10);

  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
    [`__TEST_PAY_WS_${Date.now()}__`]
  );
  accountId = acct.id;

  const { rows: [u] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'PW Owner',$2,$3,'owner') RETURNING id`,
    [accountId, `pw-owner-${Date.now()}@test.fc`, hash]
  );
  userId = u.id;
  token  = makeToken(userId, accountId, 'owner');

  const { rows: [acct2] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
    [`__TEST_PAY_WS2_${Date.now()}__`]
  );
  otherAccountId = acct2.id;
  const { rows: [u2] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'PW Other',$2,$3,'owner') RETURNING id`,
    [otherAccountId, `pw-other-${Date.now()}@test.fc`, hash]
  );
  otherToken = makeToken(u2.id, otherAccountId, 'owner');

  const { rows: [cl] } = await pool.query(
    `INSERT INTO clients (account_id, name, email, address, city, state, zip)
     VALUES ($1,'Acme Corp','acme@test.fc','123 Main St','Springfield','IL','62701') RETURNING id`,
    [accountId]
  );
  clientId = cl.id;

  const { rows: [j1] } = await pool.query(
    `INSERT INTO jobs (account_id, client_id, service_type, status, amount, scheduled_at)
     VALUES ($1,$2,'Window Cleaning','complete',300.00,NOW()) RETURNING id`,
    [accountId, clientId]
  );
  const { rows: [j2] } = await pool.query(
    `INSERT INTO jobs (account_id, client_id, service_type, status, amount, scheduled_at)
     VALUES ($1,$2,'Pressure Wash','complete',200.00,NOW()) RETURNING id`,
    [accountId, clientId]
  );
  const { rows: [j3] } = await pool.query(
    `INSERT INTO jobs (account_id, client_id, service_type, status, amount, scheduled_at)
     VALUES ($1,$2,'HVAC','complete',100.00,NOW()) RETURNING id`,
    [accountId, clientId]
  );
  jobId = j1.id;

  const { rows: [i1] } = await pool.query(
    `INSERT INTO invoices (account_id, client_id, job_id, amount, balance, status, invoice_number)
     VALUES ($1,$2,$3,300.00,300.00,'pending',1001) RETURNING id`,
    [accountId, clientId, j1.id]
  );
  inv1Id = i1.id;

  const { rows: [i2] } = await pool.query(
    `INSERT INTO invoices (account_id, client_id, job_id, amount, balance, status, invoice_number)
     VALUES ($1,$2,$3,200.00,200.00,'pending',1002) RETURNING id`,
    [accountId, clientId, j2.id]
  );
  inv2Id = i2.id;

  const { rows: [ip] } = await pool.query(
    `INSERT INTO invoices (account_id, client_id, job_id, amount, balance, status, invoice_number)
     VALUES ($1,$2,$3,100.00,0.00,'paid',1003) RETURNING id`,
    [accountId, clientId, j3.id]
  );
  paidInvId = ip.id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM payment_allocations WHERE account_id = ANY($1::uuid[])`, [[accountId, otherAccountId]]);
  await pool.query(`DELETE FROM accounts WHERE id = ANY($1::uuid[])`, [[accountId, otherAccountId]]);
  await pool.end();
});

// ── GET /api/payments/outstanding ─────────────────────────────────────────────

describe('GET /api/payments/outstanding', () => {
  it('returns 400 without client_id', async () => {
    const r = await request(app).get('/api/payments/outstanding')
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(400);
  });

  it('returns only pending/partially_paid invoices', async () => {
    const r = await request(app)
      .get(`/api/payments/outstanding?client_id=${clientId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    const ids = r.body.map(i => i.id);
    expect(ids).toContain(inv1Id);
    expect(ids).toContain(inv2Id);
    expect(ids).not.toContain(paidInvId);
  });

  it('returns expected fields on each row', async () => {
    const r = await request(app)
      .get(`/api/payments/outstanding?client_id=${clientId}`)
      .set('Authorization', `Bearer ${token}`);
    const row = r.body[0];
    expect(row).toHaveProperty('id');
    expect(row).toHaveProperty('invoice_number');
    expect(row).toHaveProperty('amount');
    expect(row).toHaveProperty('balance');
    expect(row).toHaveProperty('status');
    expect(row).toHaveProperty('client_name');
  });

  it('enforces tenant isolation — cannot see other account invoices', async () => {
    const r = await request(app)
      .get(`/api/payments/outstanding?client_id=${clientId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(0);
  });

  it('rejects unauthenticated request', async () => {
    const r = await request(app)
      .get(`/api/payments/outstanding?client_id=${clientId}`);
    expect(r.status).toBe(401);
  });
});

// ── POST /api/payments ─────────────────────────────────────────────────────────

describe('POST /api/payments — validation', () => {
  it('returns 400 without client_id', async () => {
    const r = await request(app).post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ method: 'CASH', allocations: [{ invoice_id: inv1Id, amount: 50 }] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/client_id/i);
  });

  it('returns 400 with invalid method', async () => {
    const r = await request(app).post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, method: 'BITCOIN', allocations: [{ invoice_id: inv1Id, amount: 50 }] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/method/i);
  });

  it('returns 400 with empty allocations', async () => {
    const r = await request(app).post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, method: 'CASH', allocations: [] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/allocations/i);
  });

  it('returns 400 when reference missing for CASHAPP', async () => {
    const r = await request(app).post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, method: 'CASHAPP', allocations: [{ invoice_id: inv1Id, amount: 50 }] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/reference/i);
  });

  it('returns 400 when allocation exceeds invoice balance', async () => {
    const r = await request(app).post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, method: 'CASH', allocations: [{ invoice_id: inv1Id, amount: 9999 }] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/balance/i);
  });

  it('returns 400 when trying to pay an already paid invoice', async () => {
    const r = await request(app).post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, method: 'CASH', allocations: [{ invoice_id: paidInvId, amount: 50 }] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/eligible|paid|void/i);
  });
});

describe('POST /api/payments — partial payment', () => {
  it('marks invoice as partially_paid when partial amount given', async () => {
    const partialAmt = 100;
    const r = await request(app).post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId,
        method: 'CHECK',
        reference: 'CHK-001',
        payment_date: TODAY,
        allocations: [{ invoice_id: inv1Id, amount: partialAmt }],
      });
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('payment_id');
    const updatedInv = r.body.invoices.find(i => i.id === inv1Id);
    expect(updatedInv.status).toBe('partially_paid');
    expect(parseFloat(updatedInv.balance)).toBeCloseTo(200, 1);
  });

  it('subsequent partial payment reduces balance further', async () => {
    const r = await request(app).post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId,
        method: 'CASH',
        payment_date: TODAY,
        allocations: [{ invoice_id: inv1Id, amount: 100 }],
      });
    expect(r.status).toBe(200);
    const updatedInv = r.body.invoices.find(i => i.id === inv1Id);
    expect(parseFloat(updatedInv.balance)).toBeCloseTo(100, 1);
  });
});

describe('POST /api/payments — full payment across two invoices', () => {
  it('pays both invoices in one transaction', async () => {
    // inv1 has 100 left, inv2 has 200 — pay both fully
    const r = await request(app).post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientId,
        method: 'CASH',
        payment_date: TODAY,
        allocations: [
          { invoice_id: inv1Id, amount: 100 },
          { invoice_id: inv2Id, amount: 200 },
        ],
      });
    expect(r.status).toBe(200);
    expect(r.body.invoices).toHaveLength(2);
    const i1 = r.body.invoices.find(i => i.id === inv1Id);
    const i2 = r.body.invoices.find(i => i.id === inv2Id);
    expect(i1.status).toBe('paid');
    expect(i2.status).toBe('paid');
    expect(parseFloat(i1.balance)).toBeCloseTo(0, 2);
    expect(parseFloat(i2.balance)).toBeCloseTo(0, 2);
  });
});

describe('POST /api/payments — tenant isolation', () => {
  it('cannot record payment against another account client', async () => {
    const r = await request(app).post('/api/payments')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        client_id: clientId,
        method: 'CASH',
        allocations: [{ invoice_id: inv1Id, amount: 50 }],
      });
    expect(r.status).toBe(404);
  });

  it('rejects unauthenticated request', async () => {
    const r = await request(app).post('/api/payments')
      .send({ client_id: clientId, method: 'CASH', allocations: [{ invoice_id: inv1Id, amount: 50 }] });
    expect(r.status).toBe(401);
  });
});
