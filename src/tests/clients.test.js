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
let clientId1, clientId2;

beforeAll(async () => {
  await runMigrations();
  const hash = await bcrypt.hash('pw', 10);

  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
    [`__TEST_CLIENTS_${Date.now()}__`]
  );
  accountId = acct.id;

  const { rows: [u] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Client Owner',$2,$3,'owner') RETURNING id`,
    [accountId, `client-owner-${Date.now()}@test.fc`, hash]
  );
  userId = u.id;
  token  = makeToken(userId, accountId, 'owner');

  const { rows: [acct2] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
    [`__TEST_CLIENTS_OTHER_${Date.now()}__`]
  );
  otherAccountId = acct2.id;
  const { rows: [u2] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Other','client-other-${Date.now()}@test.fc',$2,'owner') RETURNING id`,
    [otherAccountId, hash]
  );
  otherToken = makeToken(u2.id, otherAccountId, 'owner');

  const { rows: [c1] } = await pool.query(
    `INSERT INTO clients (account_id, name, email, phone, address, city, state, zip)
     VALUES ($1,'Kevin Caines','kevin@kmcdetail.com','754-555-0001','100 Coral Springs Blvd','Coral Springs','FL','33065')
     RETURNING id`,
    [accountId]
  );
  clientId1 = c1.id;

  const { rows: [c2] } = await pool.query(
    `INSERT INTO clients (account_id, name, email, phone, address, city, state, zip)
     VALUES ($1,'ABC Landscaping','info@abclandscape.com','555-900-2222','200 Palm Ave','Boca Raton','FL','33431')
     RETURNING id`,
    [accountId]
  );
  clientId2 = c2.id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM accounts WHERE name LIKE '__TEST_CLIENTS_%'`);
  await pool.end();
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('GET /api/clients/search — auth', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/clients/search?q=Kevin');
    expect(res.status).toBe(401);
  });
});

// ── Basic behavior ────────────────────────────────────────────────────────────

describe('GET /api/clients/search — basic', () => {
  it('returns 200 [] when q is empty', async () => {
    const res = await request(app)
      .get('/api/clients/search')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns results for 1-character query', async () => {
    const res = await request(app)
      .get('/api/clients/search?q=K')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.some(r => r.id === clientId1)).toBe(true);
  });

  it('includes address fields in response', async () => {
    const res = await request(app)
      .get('/api/clients/search?q=Kevin')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const c = res.body.find(r => r.id === clientId1);
    expect(c).toMatchObject({
      id:      clientId1,
      name:    'Kevin Caines',
      email:   'kevin@kmcdetail.com',
      phone:   '754-555-0001',
      address: '100 Coral Springs Blvd',
      city:    'Coral Springs',
      state:   'FL',
      zip:     '33065',
    });
  });
});

// ── Search fields ─────────────────────────────────────────────────────────────

describe('GET /api/clients/search — search fields', () => {
  it('searches by name', async () => {
    const res = await request(app)
      .get('/api/clients/search?q=Caines')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.some(r => r.id === clientId1)).toBe(true);
  });

  it('searches by email', async () => {
    const res = await request(app)
      .get('/api/clients/search?q=kmcdetail')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.some(r => r.id === clientId1)).toBe(true);
  });

  it('searches by phone', async () => {
    const res = await request(app)
      .get('/api/clients/search?q=754-555')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.some(r => r.id === clientId1)).toBe(true);
  });

  it('searches by address', async () => {
    const res = await request(app)
      .get('/api/clients/search?q=Coral+Springs+Blvd')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.some(r => r.id === clientId1)).toBe(true);
  });

  it('searches by city', async () => {
    const res = await request(app)
      .get('/api/clients/search?q=Coral+Springs')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.some(r => r.id === clientId1)).toBe(true);
  });

  it('returns [] when no match', async () => {
    const res = await request(app)
      .get('/api/clients/search?q=ZZZNOTEXIST_XYZ')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body).toEqual([]);
  });

  it('is case-insensitive', async () => {
    const res = await request(app)
      .get('/api/clients/search?q=kevin+caines')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.some(r => r.id === clientId1)).toBe(true);
  });

  it('limits results to 10', async () => {
    const res = await request(app)
      .get('/api/clients/search?q=Coral+Springs')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.length).toBeLessThanOrEqual(10);
  });
});

// ── Tenant isolation ──────────────────────────────────────────────────────────

describe('GET /api/clients/search — tenant isolation', () => {
  it('other account cannot see this account clients', async () => {
    const res = await request(app)
      .get('/api/clients/search?q=Kevin')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.map(r => r.id);
    expect(ids).not.toContain(clientId1);
    expect(ids).not.toContain(clientId2);
  });
});
