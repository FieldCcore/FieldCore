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
let svcId1, svcId2, svcIdInactive;

beforeAll(async () => {
  await runMigrations();
  const hash = await bcrypt.hash('pw', 10);

  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
    [`__TEST_SVC_${Date.now()}__`]
  );
  accountId = acct.id;

  const { rows: [u] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Svc Owner',$2,$3,'owner') RETURNING id`,
    [accountId, `svc-owner-${Date.now()}@test.fc`, hash]
  );
  userId = u.id;
  token  = makeToken(userId, accountId, 'owner');

  const { rows: [acct2] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
    [`__TEST_SVC_OTHER_${Date.now()}__`]
  );
  otherAccountId = acct2.id;
  const { rows: [u2] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Other','svc-other-${Date.now()}@test.fc',$2,'owner') RETURNING id`,
    [otherAccountId, hash]
  );
  otherToken = makeToken(u2.id, otherAccountId, 'owner');

  // Insert service templates
  const { rows: [s1] } = await pool.query(
    `INSERT INTO service_templates (account_id, name, description, price, category, sku, is_active, sort_order)
     VALUES ($1,'Premium Mobile Detail','Full exterior and interior detail',200,'Auto Detailing','PMD-001',TRUE,1)
     RETURNING id`,
    [accountId]
  );
  svcId1 = s1.id;

  const { rows: [s2] } = await pool.query(
    `INSERT INTO service_templates (account_id, name, description, price, category, sku, is_active, sort_order)
     VALUES ($1,'Basic Wash','Exterior wash only',50,'Auto Detailing',NULL,TRUE,2)
     RETURNING id`,
    [accountId]
  );
  svcId2 = s2.id;

  const { rows: [s3] } = await pool.query(
    `INSERT INTO service_templates (account_id, name, description, price, category, sku, is_active, sort_order)
     VALUES ($1,'Old Service (Inactive)','Discontinued service',99,'Other',NULL,FALSE,99)
     RETURNING id`,
    [accountId]
  );
  svcIdInactive = s3.id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM accounts WHERE name LIKE '__TEST_SVC_%'`);
  await pool.end();
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('GET /api/services/search — auth', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/services/search');
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid token', async () => {
    const res = await request(app)
      .get('/api/services/search')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── Results ───────────────────────────────────────────────────────────────────

describe('GET /api/services/search — results', () => {
  it('returns all active services when q is empty', async () => {
    const res = await request(app)
      .get('/api/services/search')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = res.body.map(r => r.id);
    expect(ids).toContain(svcId1);
    expect(ids).toContain(svcId2);
  });

  it('excludes inactive services', async () => {
    const res = await request(app)
      .get('/api/services/search')
      .set('Authorization', `Bearer ${token}`);
    const ids = res.body.map(r => r.id);
    expect(ids).not.toContain(svcIdInactive);
  });

  it('returns correct fields', async () => {
    const res = await request(app)
      .get('/api/services/search')
      .set('Authorization', `Bearer ${token}`);
    const svc = res.body.find(r => r.id === svcId1);
    expect(svc).toMatchObject({
      id:          svcId1,
      name:        'Premium Mobile Detail',
      description: 'Full exterior and interior detail',
      price:       expect.any(String),
      category:    'Auto Detailing',
      sku:         'PMD-001',
    });
  });
});

// ── Search ────────────────────────────────────────────────────────────────────

describe('GET /api/services/search — search query', () => {
  it('filters by name', async () => {
    const res = await request(app)
      .get('/api/services/search?q=Premium')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe(svcId1);
  });

  it('filters by description', async () => {
    const res = await request(app)
      .get('/api/services/search?q=exterior+wash+only')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.some(r => r.id === svcId2)).toBe(true);
  });

  it('filters by category', async () => {
    const res = await request(app)
      .get('/api/services/search?q=Auto+Detailing')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it('filters by sku', async () => {
    const res = await request(app)
      .get('/api/services/search?q=PMD-001')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body[0].id).toBe(svcId1);
  });

  it('returns [] when no match', async () => {
    const res = await request(app)
      .get('/api/services/search?q=ZZZNOTEXIST99')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('is case-insensitive', async () => {
    const res = await request(app)
      .get('/api/services/search?q=premium+mobile')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body[0].id).toBe(svcId1);
  });
});

// ── Tenant isolation ──────────────────────────────────────────────────────────

describe('GET /api/services/search — tenant isolation', () => {
  it('other account cannot see this account services', async () => {
    const res = await request(app)
      .get('/api/services/search')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.map(r => r.id);
    expect(ids).not.toContain(svcId1);
    expect(ids).not.toContain(svcId2);
  });

  it('other account search returns 200 with []', async () => {
    const res = await request(app)
      .get('/api/services/search?q=Premium')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
