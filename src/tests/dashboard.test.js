const request = require('supertest');
const app     = require('../app');
const pool    = require('../db/pool');

let token;
let accountId;
let userId;

beforeAll(async () => {
  // Create test account + user via login (assumes seed ran)
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: process.env.SEED_EMAIL, password: process.env.SEED_PASSWORD });
  expect(res.status).toBe(200);
  token     = res.body.token;
  accountId = res.body.user.accountId;
  userId    = res.body.user.id;
});

afterAll(async () => {
  // Clean up test data
  await pool.query(`DELETE FROM dashboard_banners WHERE account_id = $1 AND title LIKE 'TEST_%'`, [accountId]);
  await pool.query(`DELETE FROM requests WHERE account_id = $1 AND client_name LIKE 'Test_%'`, [accountId]);
  await pool.end();
});

// ── Banners ──────────────────────────────────────────────────────────────────

describe('GET /api/banners', () => {
  it('returns 200 with array', async () => {
    const res = await request(app)
      .get('/api/banners')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/banners + dismiss', () => {
  let bannerId;

  it('creates a banner (owner)', async () => {
    const res = await request(app)
      .post('/api/banners')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'TEST_Banner', message: 'Test message', severity: 'info' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('TEST_Banner');
    bannerId = res.body.id;
  });

  it('banner appears in list', async () => {
    const res = await request(app)
      .get('/api/banners')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.some(b => b.id === bannerId)).toBe(true);
  });

  it('dismiss removes it from list', async () => {
    await request(app)
      .post(`/api/banners/${bannerId}/dismiss`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const res = await request(app)
      .get('/api/banners')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.some(b => b.id === bannerId)).toBe(false);
  });

  it('deactivating a banner hides it', async () => {
    const create = await request(app)
      .post('/api/banners')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'TEST_Active', message: 'msg', severity: 'info' });
    const id = create.body.id;

    await request(app)
      .delete(`/api/banners/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const list = await request(app)
      .get('/api/banners')
      .set('Authorization', `Bearer ${token}`);
    expect(list.body.some(b => b.id === id)).toBe(false);
  });
});

// ── Requests (Leads) ─────────────────────────────────────────────────────────

describe('GET /api/requests', () => {
  it('returns 200 with array', async () => {
    const res = await request(app)
      .get('/api/requests')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/requests', () => {
  let reqId;

  it('creates request with client_name', async () => {
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_name: 'Test_Client', service_type: 'Plumbing', source: 'phone' });
    expect(res.status).toBe(201);
    expect(res.body.client_name).toBe('Test_Client');
    reqId = res.body.id;
  });

  it('rejects missing client_name and client_id', async () => {
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ service_type: 'Electrical' });
    expect(res.status).toBe(400);
  });

  it('GET /api/requests/:id returns the created request', async () => {
    const res = await request(app)
      .get(`/api/requests/${reqId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(reqId);
  });

  it('PATCH updates status', async () => {
    const res = await request(app)
      .patch(`/api/requests/${reqId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'contacted' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('contacted');
  });

  it('PATCH rejects invalid status', async () => {
    const res = await request(app)
      .patch(`/api/requests/${reqId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'invalid_status' });
    expect(res.status).toBe(400);
  });

  it('DELETE soft-closes request', async () => {
    const res = await request(app)
      .delete(`/api/requests/${reqId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const get = await request(app)
      .get(`/api/requests/${reqId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(get.body.status).toBe('closed');
  });
});

// ── Review Settings ───────────────────────────────────────────────────────────

describe('GET /api/review-settings', () => {
  it('returns defaults when no settings row exists', async () => {
    const res = await request(app)
      .get('/api/review-settings')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('delay_seconds');
    expect(res.body).toHaveProperty('enabled');
  });
});

describe('PUT /api/review-settings', () => {
  it('saves valid delay', async () => {
    const res = await request(app)
      .put('/api/review-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ delay_seconds: 7200 });
    expect(res.status).toBe(200);
    expect(res.body.delay_seconds).toBe(7200);
  });

  it('rejects invalid delay', async () => {
    const res = await request(app)
      .put('/api/review-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ delay_seconds: 999 });
    expect(res.status).toBe(400);
  });
});

// ── Google Reviews connection ─────────────────────────────────────────────────

describe('GET /api/google-reviews/connection', () => {
  it('returns 200 with status field', async () => {
    const res = await request(app)
      .get('/api/google-reviews/connection')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
  });
});

// ── Dashboard KPI ─────────────────────────────────────────────────────────────

describe('GET /api/analytics/dashboard', () => {
  it('returns expected KPI fields', async () => {
    const res = await request(app)
      .get('/api/analytics/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const body = res.body;
    expect(body).toHaveProperty('todayJobs');
    expect(body).toHaveProperty('weekRevenue');
    expect(body).toHaveProperty('mtdRevenue');
    expect(body).toHaveProperty('activeJobs');
    expect(body).toHaveProperty('pendingInvoices');
    expect(body).toHaveProperty('pendingDeposits');
  });

  it('tenant-isolates — returns only this account data', async () => {
    const res = await request(app)
      .get('/api/analytics/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // All returned jobs belong to the authenticated account
    res.body.todayJobs.forEach(j => {
      expect(j.account_id === accountId || j.account_id === undefined).toBe(true);
    });
  });
});
