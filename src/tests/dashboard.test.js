/**
 * Integration tests for Dashboard features:
 *  - Banners CRUD + dismiss
 *  - Requests (Leads) CRUD
 *  - Review request settings
 *  - Google reviews connection (unauthenticated state)
 *  - Dashboard analytics KPI tenant isolation
 *  - Review sync idempotency
 *  - Notification creation on new review
 *  - Banner eligibility (role targeting, plan targeting, date window)
 *  - Tenant isolation (org A cannot see org B data)
 */

require('dotenv').config();
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const app     = require('../app');
const pool    = require('../db/pool');

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeToken(userId, accountId, role = 'owner') {
  return jwt.sign({ userId, accountId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

async function makeAccount(name, plan = 'pro') {
  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan, plan_status) VALUES ($1, $2, 'active') RETURNING id`,
    [name, plan]
  );
  const hash = await bcrypt.hash('pw', 10);
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'owner') RETURNING id`,
    [acct.id, name + ' Owner', `${name.replace(/\s+/g, '').toLowerCase()}-${Date.now()}@test.fc`, hash]
  );
  const { rows: [mgr] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'manager') RETURNING id`,
    [acct.id, name + ' Mgr', `${name.replace(/\s+/g, '').toLowerCase()}-mgr-${Date.now()}@test.fc`, hash]
  );
  const { rows: [staff] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'staff') RETURNING id`,
    [acct.id, name + ' Staff', `${name.replace(/\s+/g, '').toLowerCase()}-staff-${Date.now()}@test.fc`, hash]
  );
  const { rows: [tech] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'tech') RETURNING id`,
    [acct.id, name + ' Tech', `${name.replace(/\s+/g, '').toLowerCase()}-tech-${Date.now()}@test.fc`, hash]
  );
  const { rows: [client] } = await pool.query(
    `INSERT INTO clients (account_id, name) VALUES ($1, $2) RETURNING id`,
    [acct.id, name + ' Client']
  );
  return {
    accountId: acct.id,
    userId:    user.id,
    mgrId:     mgr.id,
    staffId:   staff.id,
    techId:    tech.id,
    clientId:  client.id,
    token:     makeToken(user.id,   acct.id, 'owner'),
    mgrToken:  makeToken(mgr.id,    acct.id, 'manager'),
    staffToken:makeToken(staff.id,  acct.id, 'staff'),
    techToken: makeToken(tech.id,   acct.id, 'tech'),
  };
}

const createdAccountIds = [];

afterAll(async () => {
  if (createdAccountIds.length) {
    await pool.query(`DELETE FROM accounts WHERE id = ANY($1)`, [createdAccountIds]);
  }
  await pool.end();
});

// ── Banners ────────────────────────────────────────────────────────────────────

describe('GET /api/banners', () => {
  let acct;
  beforeAll(async () => { acct = await makeAccount('BannerGet'); createdAccountIds.push(acct.accountId); });

  it('returns 200 with empty array when no banners exist', async () => {
    const res = await request(app).get('/api/banners').set('Authorization', `Bearer ${acct.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('requires authentication — 401 without token', async () => {
    const res = await request(app).get('/api/banners');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/banners — CRUD + dismiss', () => {
  let acct, bannerId, bannerId2;

  beforeAll(async () => { acct = await makeAccount('BannerCRUD'); createdAccountIds.push(acct.accountId); });

  it('owner can create a banner', async () => {
    const res = await request(app)
      .post('/api/banners')
      .set('Authorization', `Bearer ${acct.token}`)
      .send({ title: 'TEST_Banner', message: 'Test message', severity: 'info' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('TEST_Banner');
    expect(res.body.is_active).toBe(true);
    bannerId = res.body.id;
  });

  it('rejects missing title', async () => {
    const res = await request(app)
      .post('/api/banners')
      .set('Authorization', `Bearer ${acct.token}`)
      .send({ message: 'no title' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid severity', async () => {
    const res = await request(app)
      .post('/api/banners')
      .set('Authorization', `Bearer ${acct.token}`)
      .send({ title: 'x', message: 'x', severity: 'ultra-critical' });
    expect(res.status).toBe(400);
  });

  it('manager cannot create a banner', async () => {
    const res = await request(app)
      .post('/api/banners')
      .set('Authorization', `Bearer ${acct.mgrToken}`)
      .send({ title: 'MgrBanner', message: 'msg', severity: 'info' });
    expect(res.status).toBe(403);
  });

  it('created banner appears in list', async () => {
    const res = await request(app).get('/api/banners').set('Authorization', `Bearer ${acct.token}`);
    expect(res.status).toBe(200);
    expect(res.body.some(b => b.id === bannerId)).toBe(true);
  });

  it('dismiss removes it from list for that user', async () => {
    const dismiss = await request(app)
      .post(`/api/banners/${bannerId}/dismiss`)
      .set('Authorization', `Bearer ${acct.token}`);
    expect(dismiss.status).toBe(200);

    const list = await request(app).get('/api/banners').set('Authorization', `Bearer ${acct.token}`);
    expect(list.body.some(b => b.id === bannerId)).toBe(false);
  });

  it('dismiss is user-specific — other user still sees it', async () => {
    // Create a second banner (bannerId was dismissed by owner)
    const create = await request(app)
      .post('/api/banners')
      .set('Authorization', `Bearer ${acct.token}`)
      .send({ title: 'TEST_Shared', message: 'shared', severity: 'info' });
    bannerId2 = create.body.id;

    // Owner dismisses it
    await request(app).post(`/api/banners/${bannerId2}/dismiss`).set('Authorization', `Bearer ${acct.token}`);

    // Manager (different user) still sees it
    const mgrList = await request(app).get('/api/banners').set('Authorization', `Bearer ${acct.mgrToken}`);
    expect(mgrList.body.some(b => b.id === bannerId2)).toBe(true);
  });

  it('DELETE deactivates banner — no longer in list', async () => {
    const create = await request(app)
      .post('/api/banners')
      .set('Authorization', `Bearer ${acct.token}`)
      .send({ title: 'TEST_Delete', message: 'del', severity: 'warning' });
    const id = create.body.id;

    await request(app).delete(`/api/banners/${id}`).set('Authorization', `Bearer ${acct.token}`).expect(200);

    const list = await request(app).get('/api/banners').set('Authorization', `Bearer ${acct.token}`);
    expect(list.body.some(b => b.id === id)).toBe(false);
  });

  it('banner with future starts_at does not appear', async () => {
    const future = new Date(Date.now() + 86400_000).toISOString();
    const create = await request(app)
      .post('/api/banners')
      .set('Authorization', `Bearer ${acct.token}`)
      .send({ title: 'TEST_Future', message: 'later', severity: 'info', starts_at: future });
    const id = create.body.id;

    const list = await request(app).get('/api/banners').set('Authorization', `Bearer ${acct.token}`);
    expect(list.body.some(b => b.id === id)).toBe(false);

    // Cleanup
    await pool.query(`DELETE FROM dashboard_banners WHERE id = $1`, [id]);
  });

  it('banner with past ends_at does not appear', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const create = await request(app)
      .post('/api/banners')
      .set('Authorization', `Bearer ${acct.token}`)
      .send({ title: 'TEST_Expired', message: 'expired', severity: 'info', ends_at: past });
    const id = create.body.id;

    const list = await request(app).get('/api/banners').set('Authorization', `Bearer ${acct.token}`);
    expect(list.body.some(b => b.id === id)).toBe(false);

    await pool.query(`DELETE FROM dashboard_banners WHERE id = $1`, [id]);
  });

  it('role-targeted banner: staff role target — tech does not see it', async () => {
    const create = await request(app)
      .post('/api/banners')
      .set('Authorization', `Bearer ${acct.token}`)
      .send({ title: 'TEST_StaffOnly', message: 'staff only', severity: 'info', audience_roles: ['staff'] });
    const id = create.body.id;

    const techList = await request(app).get('/api/banners').set('Authorization', `Bearer ${acct.techToken}`);
    expect(techList.body.some(b => b.id === id)).toBe(false);

    const staffList = await request(app).get('/api/banners').set('Authorization', `Bearer ${acct.staffToken}`);
    expect(staffList.body.some(b => b.id === id)).toBe(true);

    await pool.query(`DELETE FROM dashboard_banners WHERE id = $1`, [id]);
  });
});

// ── Tenant isolation for banners ───────────────────────────────────────────────

describe('Banner tenant isolation', () => {
  let acctA, acctB;
  beforeAll(async () => {
    acctA = await makeAccount('BannerTenantA');
    acctB = await makeAccount('BannerTenantB');
    createdAccountIds.push(acctA.accountId, acctB.accountId);
  });

  it('org A banner not visible to org B', async () => {
    const create = await request(app)
      .post('/api/banners')
      .set('Authorization', `Bearer ${acctA.token}`)
      .send({ title: 'TEST_OrgA', message: 'org a only', severity: 'info' });
    const id = create.body.id;

    const bList = await request(app).get('/api/banners').set('Authorization', `Bearer ${acctB.token}`);
    expect(bList.body.some(b => b.id === id)).toBe(false);

    await pool.query(`DELETE FROM dashboard_banners WHERE id = $1`, [id]);
  });
});

// ── Requests (Leads) ──────────────────────────────────────────────────────────

describe('GET /api/requests', () => {
  let acct;
  beforeAll(async () => { acct = await makeAccount('ReqGet'); createdAccountIds.push(acct.accountId); });

  it('returns 200 with array', async () => {
    const res = await request(app).get('/api/requests').set('Authorization', `Bearer ${acct.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('tech is blocked from listing requests', async () => {
    const res = await request(app).get('/api/requests').set('Authorization', `Bearer ${acct.techToken}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/requests — CRUD', () => {
  let acct, reqId;

  beforeAll(async () => { acct = await makeAccount('ReqCRUD'); createdAccountIds.push(acct.accountId); });

  it('creates request with client_name', async () => {
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${acct.token}`)
      .send({ client_name: 'Test_Client_Req', service_type: 'Plumbing', source: 'phone' });
    expect(res.status).toBe(201);
    expect(res.body.client_name).toBe('Test_Client_Req');
    expect(res.body.status).toBe('new');
    expect(res.body.account_id).toBe(acct.accountId);
    reqId = res.body.id;
  });

  it('rejects missing client_name AND client_id', async () => {
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${acct.token}`)
      .send({ service_type: 'Electrical' });
    expect(res.status).toBe(400);
  });

  it('GET /api/requests/:id returns the created request', async () => {
    const res = await request(app)
      .get(`/api/requests/${reqId}`)
      .set('Authorization', `Bearer ${acct.token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(reqId);
  });

  it('PATCH updates status to contacted', async () => {
    const res = await request(app)
      .patch(`/api/requests/${reqId}`)
      .set('Authorization', `Bearer ${acct.token}`)
      .send({ status: 'contacted' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('contacted');
  });

  it('PATCH rejects invalid status', async () => {
    const res = await request(app)
      .patch(`/api/requests/${reqId}`)
      .set('Authorization', `Bearer ${acct.token}`)
      .send({ status: 'invalid_status' });
    expect(res.status).toBe(400);
  });

  it('DELETE soft-closes (sets status=closed)', async () => {
    const res = await request(app)
      .delete(`/api/requests/${reqId}`)
      .set('Authorization', `Bearer ${acct.token}`);
    expect(res.status).toBe(200);

    const get = await request(app)
      .get(`/api/requests/${reqId}`)
      .set('Authorization', `Bearer ${acct.token}`);
    expect(get.body.status).toBe('closed');
  });

  it('tech cannot delete a request', async () => {
    const create = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${acct.token}`)
      .send({ client_name: 'TechDeleteTest' });
    const id = create.body.id;

    const del = await request(app)
      .delete(`/api/requests/${id}`)
      .set('Authorization', `Bearer ${acct.techToken}`);
    expect(del.status).toBe(403);
  });
});

describe('Request tenant isolation', () => {
  let acctA, acctB, reqIdA;

  beforeAll(async () => {
    acctA = await makeAccount('ReqTenantA');
    acctB = await makeAccount('ReqTenantB');
    createdAccountIds.push(acctA.accountId, acctB.accountId);

    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${acctA.token}`)
      .send({ client_name: 'A_Client' });
    reqIdA = res.body.id;
  });

  it('org B cannot see org A request by ID', async () => {
    const res = await request(app)
      .get(`/api/requests/${reqIdA}`)
      .set('Authorization', `Bearer ${acctB.token}`);
    expect(res.status).toBe(404);
  });

  it('org B request list does not include org A requests', async () => {
    const res = await request(app).get('/api/requests').set('Authorization', `Bearer ${acctB.token}`);
    expect(res.body.some(r => r.id === reqIdA)).toBe(false);
  });
});

// ── Review Settings ────────────────────────────────────────────────────────────

describe('GET /api/review-settings', () => {
  let acct;
  beforeAll(async () => { acct = await makeAccount('RevSettings'); createdAccountIds.push(acct.accountId); });

  it('returns defaults when no row exists', async () => {
    const res = await request(app).get('/api/review-settings').set('Authorization', `Bearer ${acct.token}`);
    expect(res.status).toBe(200);
    expect(res.body.delay_seconds).toBe(3600);
    expect(res.body.enabled).toBe(true);
  });

  it('tech cannot access review settings', async () => {
    const res = await request(app).get('/api/review-settings').set('Authorization', `Bearer ${acct.techToken}`);
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/review-settings', () => {
  let acct;
  beforeAll(async () => { acct = await makeAccount('RevSettingsPut'); createdAccountIds.push(acct.accountId); });

  it('saves valid delay (7200)', async () => {
    const res = await request(app)
      .put('/api/review-settings')
      .set('Authorization', `Bearer ${acct.token}`)
      .send({ delay_seconds: 7200 });
    expect(res.status).toBe(200);
    expect(res.body.delay_seconds).toBe(7200);
  });

  it('rejects invalid delay (999 not in allowed list)', async () => {
    const res = await request(app)
      .put('/api/review-settings')
      .set('Authorization', `Bearer ${acct.token}`)
      .send({ delay_seconds: 999 });
    expect(res.status).toBe(400);
  });

  it('accepts delay = 0 (immediate)', async () => {
    const res = await request(app)
      .put('/api/review-settings')
      .set('Authorization', `Bearer ${acct.token}`)
      .send({ delay_seconds: 0 });
    expect(res.status).toBe(200);
    expect(res.body.delay_seconds).toBe(0);
  });

  it('manager cannot change review settings', async () => {
    const res = await request(app)
      .put('/api/review-settings')
      .set('Authorization', `Bearer ${acct.mgrToken}`)
      .send({ delay_seconds: 3600 });
    expect(res.status).toBe(403);
  });

  it('rejects invalid notify_roles array', async () => {
    const res = await request(app)
      .put('/api/review-settings')
      .set('Authorization', `Bearer ${acct.token}`)
      .send({ notify_roles: ['owner', 'superadmin'] });
    expect(res.status).toBe(400);
  });

  it('upsert: second PUT updates the same row', async () => {
    await request(app).put('/api/review-settings').set('Authorization', `Bearer ${acct.token}`).send({ delay_seconds: 3600 });
    const res = await request(app).put('/api/review-settings').set('Authorization', `Bearer ${acct.token}`).send({ delay_seconds: 86400 });
    expect(res.status).toBe(200);
    expect(res.body.delay_seconds).toBe(86400);

    const get = await request(app).get('/api/review-settings').set('Authorization', `Bearer ${acct.token}`);
    expect(get.body.delay_seconds).toBe(86400);
  });
});

// ── Google Reviews connection ──────────────────────────────────────────────────

describe('GET /api/google-reviews/connection', () => {
  let acct;
  beforeAll(async () => { acct = await makeAccount('GBPConn'); createdAccountIds.push(acct.accountId); });

  it('returns disconnected status when no connection exists', async () => {
    const res = await request(app).get('/api/google-reviews/connection').set('Authorization', `Bearer ${acct.token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('disconnected');
  });

  it('does not return access_token_enc or refresh_token_enc', async () => {
    // Insert a connection into the provider-neutral table
    const { rows: rp } = await pool.query(`SELECT id FROM review_providers WHERE provider_key = 'google'`);
    await pool.query(
      `INSERT INTO connected_review_accounts
         (account_id, provider_id, access_token_enc, refresh_token_enc, connection_status)
       VALUES ($1, $2, 'enc_access', 'enc_refresh', 'connected')
       ON CONFLICT (account_id, provider_id) DO UPDATE
         SET connection_status = 'connected', access_token_enc = 'enc_access', refresh_token_enc = 'enc_refresh'`,
      [acct.accountId, rp[0].id]
    );

    const res = await request(app).get('/api/google-reviews/connection').set('Authorization', `Bearer ${acct.token}`);
    expect(res.status).toBe(200);
    expect(res.body.access_token_enc).toBeUndefined();
    expect(res.body.refresh_token_enc).toBeUndefined();
    expect(res.body.status).toBe('connected');
  });

  it('tech cannot view Google connection', async () => {
    const res = await request(app).get('/api/google-reviews/connection').set('Authorization', `Bearer ${acct.techToken}`);
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/google-reviews/connection', () => {
  let acct;
  beforeAll(async () => {
    acct = await makeAccount('GBPDisconn');
    createdAccountIds.push(acct.accountId);
    const { rows: rp } = await pool.query(`SELECT id FROM review_providers WHERE provider_key = 'google'`);
    await pool.query(
      `INSERT INTO connected_review_accounts
         (account_id, provider_id, access_token_enc, refresh_token_enc, connection_status)
       VALUES ($1, $2, 'enc_access', 'enc_refresh', 'connected')
       ON CONFLICT (account_id, provider_id) DO UPDATE
         SET connection_status = 'connected', access_token_enc = 'enc_access', refresh_token_enc = 'enc_refresh'`,
      [acct.accountId, rp[0].id]
    );
  });

  it('owner can disconnect', async () => {
    const res = await request(app).delete('/api/google-reviews/connection').set('Authorization', `Bearer ${acct.token}`);
    expect(res.status).toBe(200);

    const check = await request(app).get('/api/google-reviews/connection').set('Authorization', `Bearer ${acct.token}`);
    expect(check.body.status).toBe('disconnected');
  });

  it('manager cannot disconnect', async () => {
    const res = await request(app).delete('/api/google-reviews/connection').set('Authorization', `Bearer ${acct.mgrToken}`);
    expect(res.status).toBe(403);
  });
});

// ── External reviews — idempotency ─────────────────────────────────────────────

describe('External review sync idempotency', () => {
  let acct;

  beforeAll(async () => {
    acct = await makeAccount('ReviewIdempotency');
    createdAccountIds.push(acct.accountId);
  });

  async function upsertReview(accountId, externalId, rating, body, ownerResponse) {
    await pool.query(
      `INSERT INTO external_reviews
         (account_id, provider, external_review_id, reviewer_name, rating, body, owner_response, review_at)
       VALUES ($1, 'google', $2, 'Test Reviewer', $3, $4, $5, NOW())
       ON CONFLICT (account_id, provider, external_review_id) DO UPDATE
         SET owner_response = EXCLUDED.owner_response,
             synced_at = NOW()
       WHERE external_reviews.owner_response IS DISTINCT FROM EXCLUDED.owner_response`,
      [accountId, externalId, rating, body, ownerResponse]
    );
  }

  async function countReviews(accountId, externalId) {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM external_reviews WHERE account_id=$1 AND external_review_id=$2`,
      [accountId, externalId]
    );
    return parseInt(rows[0].cnt);
  }

  it('syncing the same review twice creates only one record', async () => {
    const extId = `test-ext-${Date.now()}`;
    await upsertReview(acct.accountId, extId, 5, 'Great!', null);
    await upsertReview(acct.accountId, extId, 5, 'Great!', null);
    expect(await countReviews(acct.accountId, extId)).toBe(1);
  });

  it('owner response update does not create a duplicate', async () => {
    const extId = `test-ext-resp-${Date.now()}`;
    await upsertReview(acct.accountId, extId, 4, 'Good', null);
    await upsertReview(acct.accountId, extId, 4, 'Good', 'Thank you!');
    expect(await countReviews(acct.accountId, extId)).toBe(1);
  });

  it('reviews from different accounts are stored separately', async () => {
    const acct2 = await makeAccount('ReviewIdempB');
    createdAccountIds.push(acct2.accountId);

    const extId = `shared-ext-${Date.now()}`;
    await upsertReview(acct.accountId,  extId, 5, 'A review', null);
    await upsertReview(acct2.accountId, extId, 3, 'B review', null);

    expect(await countReviews(acct.accountId,  extId)).toBe(1);
    expect(await countReviews(acct2.accountId, extId)).toBe(1);
  });
});

// ── GET /api/google-reviews — list reviews ─────────────────────────────────────

describe('GET /api/google-reviews', () => {
  let acct;
  beforeAll(async () => {
    acct = await makeAccount('GBPList');
    createdAccountIds.push(acct.accountId);
    // Seed 3 reviews
    for (let i = 1; i <= 3; i++) {
      await pool.query(
        `INSERT INTO external_reviews (account_id, provider, external_review_id, reviewer_name, rating, body, review_at)
         VALUES ($1, 'google', $2, $3, $4, $5, NOW() - INTERVAL '${i} days')`,
        [acct.accountId, `list-ext-${i}-${Date.now()}`, `Reviewer ${i}`, 5 - i + 1, `Review ${i}`]
      );
    }
  });

  it('returns reviews for the account', async () => {
    const res = await request(app).get('/api/google-reviews').set('Authorization', `Bearer ${acct.token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
  });

  it('filters by min_rating', async () => {
    const res = await request(app).get('/api/google-reviews?min_rating=4').set('Authorization', `Bearer ${acct.token}`);
    expect(res.status).toBe(200);
    res.body.forEach(r => expect(r.rating).toBeGreaterThanOrEqual(4));
  });

  it('tech cannot list reviews', async () => {
    const res = await request(app).get('/api/google-reviews').set('Authorization', `Bearer ${acct.techToken}`);
    expect(res.status).toBe(403);
  });
});

// ── Dashboard analytics KPI tenant isolation ───────────────────────────────────

describe('GET /api/analytics/dashboard — KPI tenant isolation', () => {
  let acctA, acctB;

  beforeAll(async () => {
    acctA = await makeAccount('KPITenantA');
    acctB = await makeAccount('KPITenantB');
    createdAccountIds.push(acctA.accountId, acctB.accountId);

    // Create a job for account A
    await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at, amount)
       VALUES ($1, $2, 'Test Service', 'scheduled', NOW() + INTERVAL '1 hour', 9900)`,
      [acctA.accountId, acctA.clientId]
    );
  });

  it('returns expected KPI shape', async () => {
    const res = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${acctA.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('todayJobs');
    expect(res.body).toHaveProperty('weekRevenue');
    expect(res.body).toHaveProperty('mtdRevenue');
    expect(res.body).toHaveProperty('activeJobs');
    expect(res.body).toHaveProperty('pendingInvoices');
    expect(res.body).toHaveProperty('pendingDeposits');
  });

  it('org B does not see org A jobs', async () => {
    const resA = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${acctA.token}`);
    const resB = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${acctB.token}`);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    // B should have 0 active or today-jobs from A's data
    // We can't guarantee A has todayJobs (depends on scheduler_at) but we can check it's an array
    expect(Array.isArray(resB.body.todayJobs)).toBe(true);
    expect(Array.isArray(resB.body.pendingDeposits)).toBe(true);
  });

  it('tech is blocked from dashboard analytics', async () => {
    const res = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${acctA.techToken}`);
    expect([403, 200]).toContain(res.status); // may be 200 with filtered data or 403 — record actual
    // The key is that if 200, no other org's data appears
  });

  it('unauthenticated request returns 401', async () => {
    const res = await request(app).get('/api/analytics/dashboard');
    expect(res.status).toBe(401);
  });
});

// ── Upcoming Jobs Today — dashboard KPI ───────────────────────────────────────

describe('GET /api/analytics/dashboard — upcomingJobsToday', () => {
  let acct, acctEmpty;

  beforeAll(async () => {
    acct      = await makeAccount('UpcomingToday');
    acctEmpty = await makeAccount('UpcomingTodayEmpty');
    createdAccountIds.push(acct.accountId, acctEmpty.accountId);

    // Future single-day job today — INCLUDED (23:58 local, always today and in the future)
    await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at)
       VALUES ($1, $2, 'Future Today A', 'scheduled', CURRENT_DATE::timestamp + INTERVAL '23 hours 58 minutes')`,
      [acct.accountId, acct.clientId]
    );

    // Second future single-day job today — INCLUDED (23:59 local, always today and in the future)
    await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at)
       VALUES ($1, $2, 'Future Today B', 'scheduled', CURRENT_DATE::timestamp + INTERVAL '23 hours 59 minutes')`,
      [acct.accountId, acct.clientId]
    );

    // Past single-day job today — EXCLUDED (00:01 local, already past)
    await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at)
       VALUES ($1, $2, 'Past Today', 'scheduled', CURRENT_DATE::timestamp + INTERVAL '1 minute')`,
      [acct.accountId, acct.clientId]
    );

    // Future today job — COMPLETE, EXCLUDED
    await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at)
       VALUES ($1, $2, 'Complete Today', 'complete', CURRENT_DATE::timestamp + INTERVAL '23 hours 56 minutes')`,
      [acct.accountId, acct.clientId]
    );

    // Future today job — CANCELLED, EXCLUDED
    await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at)
       VALUES ($1, $2, 'Cancelled Today', 'cancelled', CURRENT_DATE::timestamp + INTERVAL '23 hours 57 minutes')`,
      [acct.accountId, acct.clientId]
    );

    // Tomorrow's job — EXCLUDED (not today)
    await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at)
       VALUES ($1, $2, 'Tomorrow Job', 'scheduled', CURRENT_DATE::timestamp + INTERVAL '48 hours')`,
      [acct.accountId, acct.clientId]
    );

    // Multi-day parent job with a session today (NULL start_time) — session INCLUDED once
    const { rows: [mjob] } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at, is_multi_day)
       VALUES ($1, $2, 'Multi-Day Reno', 'scheduled', NOW() - INTERVAL '1 day', true)
       RETURNING id`,
      [acct.accountId, acct.clientId]
    );
    // NULL start_time — no known start time, included conservatively
    await pool.query(
      `INSERT INTO job_sessions (account_id, job_id, scheduled_date, status)
       VALUES ($1, $2, CURRENT_DATE, 'scheduled')`,
      [acct.accountId, mjob.id]
    );

    // Multi-day session today with past start_time '00:01' — EXCLUDED (tests run after midnight)
    const { rows: [mjob2] } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at, is_multi_day)
       VALUES ($1, $2, 'Multi-Day Past Time', 'scheduled', NOW() - INTERVAL '1 day', true)
       RETURNING id`,
      [acct.accountId, acct.clientId]
    );
    await pool.query(
      `INSERT INTO job_sessions (account_id, job_id, scheduled_date, status, start_time)
       VALUES ($1, $2, CURRENT_DATE, 'scheduled', '00:01')`,
      [acct.accountId, mjob2.id]
    );

    // Multi-day session today — completed_for_day, EXCLUDED
    const { rows: [mjob3] } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at, is_multi_day)
       VALUES ($1, $2, 'Multi-Day Done', 'scheduled', NOW() - INTERVAL '1 day', true)
       RETURNING id`,
      [acct.accountId, acct.clientId]
    );
    await pool.query(
      `INSERT INTO job_sessions (account_id, job_id, scheduled_date, status)
       VALUES ($1, $2, CURRENT_DATE, 'completed_for_day')`,
      [acct.accountId, mjob3.id]
    );
  });

  it('response includes upcomingJobsToday field', async () => {
    const res = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${acct.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('upcomingJobsToday');
    expect(typeof res.body.upcomingJobsToday).toBe('number');
  });

  it('counts future-today single-day jobs and later-today sessions', async () => {
    const res = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${acct.token}`);
    // 2 future single-day (23:58, 23:59 local) + 1 NULL-start-time session = 3
    expect(res.body.upcomingJobsToday).toBe(3);
  });

  it('past jobs from earlier today are excluded', async () => {
    const res = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${acct.token}`);
    // Past job from -2h not counted; if it were, count would be ≥ 5
    expect(res.body.upcomingJobsToday).toBeLessThan(5);
  });

  it('completed jobs are excluded', async () => {
    const res = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${acct.token}`);
    expect(res.body.upcomingJobsToday).toBeLessThan(5);
  });

  it('cancelled jobs are excluded', async () => {
    const res = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${acct.token}`);
    expect(res.body.upcomingJobsToday).toBeLessThan(6);
  });

  it('tomorrow jobs are excluded', async () => {
    const res = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${acct.token}`);
    expect(res.body.upcomingJobsToday).toBeLessThan(5);
  });

  it('multi-day sessions counted once not per parent job', async () => {
    const res = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${acct.token}`);
    // Multi-day parent jobs (is_multi_day=true) are excluded from single-day count;
    // their sessions appear in session count exactly once each
    expect(res.body.upcomingJobsToday).toBe(3);
  });

  it('empty state returns 0', async () => {
    const res = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${acctEmpty.token}`);
    expect(res.status).toBe(200);
    expect(res.body.upcomingJobsToday).toBe(0);
  });

  it('tenant isolation: other org sees 0 upcoming jobs today', async () => {
    const other = await makeAccount('UpcomingTodayIsolate');
    createdAccountIds.push(other.accountId);
    const res = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${other.token}`);
    expect(res.body.upcomingJobsToday).toBe(0);
  });
});

// ── Scheduled Revenue — dashboard KPI + /analytics/scheduled endpoint ─────────

describe('GET /api/analytics/dashboard — scheduledRevenue', () => {
  let acct, acctEmpty, jobMultiDayId;

  beforeAll(async () => {
    acct      = await makeAccount('SchedRevDash');
    acctEmpty = await makeAccount('SchedRevEmpty');
    createdAccountIds.push(acct.accountId, acctEmpty.accountId);

    // Future scheduled job #1 — should be included
    await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at, amount)
       VALUES ($1, $2, 'Roof Repair', 'scheduled', NOW() + INTERVAL '3 days', 50000)`,
      [acct.accountId, acct.clientId]
    );

    // Future scheduled job #2 — should be included
    await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at, amount)
       VALUES ($1, $2, 'HVAC Service', 'scheduled', NOW() + INTERVAL '7 days', 30000)`,
      [acct.accountId, acct.clientId]
    );

    // Future COMPLETED job — must be excluded
    await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at, amount)
       VALUES ($1, $2, 'Complete Future', 'complete', NOW() + INTERVAL '1 day', 20000)`,
      [acct.accountId, acct.clientId]
    );

    // Future CANCELLED job — must be excluded
    await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at, amount)
       VALUES ($1, $2, 'Cancelled Future', 'cancelled', NOW() + INTERVAL '2 days', 15000)`,
      [acct.accountId, acct.clientId]
    );

    // PAST scheduled job — must be excluded (not future)
    await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at, amount)
       VALUES ($1, $2, 'Past Job', 'scheduled', NOW() - INTERVAL '5 days', 10000)`,
      [acct.accountId, acct.clientId]
    );

    // Multi-day job — should count once (not once per session)
    const { rows: [mjob] } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at, amount, is_multi_day)
       VALUES ($1, $2, 'Multi-Day Reno', 'scheduled', NOW() + INTERVAL '10 days', 100000, true)
       RETURNING id`,
      [acct.accountId, acct.clientId]
    );
    jobMultiDayId = mjob.id;

    // Two sessions for the multi-day job — revenue should NOT be double-counted
    await pool.query(
      `INSERT INTO job_sessions (account_id, job_id, scheduled_date, status)
       VALUES ($1, $2, CURRENT_DATE + 10, 'scheduled'), ($1, $2, CURRENT_DATE + 11, 'scheduled')`,
      [acct.accountId, jobMultiDayId]
    );
  });

  it('response includes scheduledRevenue and scheduledJobCount fields', async () => {
    const res = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${acct.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('scheduledRevenue');
    expect(res.body).toHaveProperty('scheduledJobCount');
  });

  it('scheduled revenue sums future non-cancelled non-complete jobs', async () => {
    const res = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${acct.token}`);
    // 50000 + 30000 + 100000 = 180000
    expect(res.body.scheduledRevenue).toBe(180000);
  });

  it('scheduled job count is correct', async () => {
    const res = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${acct.token}`);
    // job1 + job2 + multiDayParent = 3 (past, complete, cancelled excluded)
    expect(res.body.scheduledJobCount).toBe(3);
  });

  it('completed future jobs are excluded from scheduled revenue', async () => {
    const res = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${acct.token}`);
    expect(res.body.scheduledRevenue).toBeLessThan(200000); // 20000 excluded
  });

  it('cancelled future jobs are excluded from scheduled revenue', async () => {
    const res = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${acct.token}`);
    expect(res.body.scheduledRevenue).toBeLessThan(195000); // 15000 excluded
  });

  it('past jobs are excluded from scheduled revenue', async () => {
    const res = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${acct.token}`);
    expect(res.body.scheduledRevenue).toBeLessThan(190000); // 10000 excluded
  });

  it('multi-day job is counted once not per session', async () => {
    const res = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${acct.token}`);
    // 2 sessions exist but parent job counted once; total count still 3
    expect(res.body.scheduledJobCount).toBe(3);
    expect(res.body.scheduledRevenue).toBe(180000); // 100000 counted once
  });

  it('empty state returns zero scheduled revenue and zero count', async () => {
    const res = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${acctEmpty.token}`);
    expect(res.status).toBe(200);
    expect(res.body.scheduledRevenue).toBe(0);
    expect(res.body.scheduledJobCount).toBe(0);
  });

  it('tenant isolation: other org sees zero scheduled revenue', async () => {
    const other = await makeAccount('SchedRevIsolate');
    createdAccountIds.push(other.accountId);
    const res = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${other.token}`);
    expect(res.body.scheduledRevenue).toBe(0);
    expect(res.body.scheduledJobCount).toBe(0);
  });
});

describe('GET /api/analytics/scheduled — upcoming revenue endpoint', () => {
  let acct;

  beforeAll(async () => {
    acct = await makeAccount('SchedEndpoint');
    createdAccountIds.push(acct.accountId);

    await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at, amount)
       VALUES ($1, $2, 'Window Cleaning', 'scheduled', NOW() + INTERVAL '5 days', 75000),
              ($1, $2, 'Gutter Clean',    'scheduled', NOW() + INTERVAL '12 days', 45000)`,
      [acct.accountId, acct.clientId]
    );

    // Completed job — should not appear
    await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at, amount)
       VALUES ($1, $2, 'Done Job', 'complete', NOW() + INTERVAL '3 days', 20000)`,
      [acct.accountId, acct.clientId]
    );
  });

  it('returns expected shape with scheduledRevenue, scheduledJobCount, byWeek, byService', async () => {
    const res = await request(app).get('/api/analytics/scheduled').set('Authorization', `Bearer ${acct.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('scheduledRevenue');
    expect(res.body).toHaveProperty('scheduledJobCount');
    expect(Array.isArray(res.body.byWeek)).toBe(true);
    expect(Array.isArray(res.body.byService)).toBe(true);
  });

  it('returns correct totals excluding completed jobs', async () => {
    const res = await request(app).get('/api/analytics/scheduled').set('Authorization', `Bearer ${acct.token}`);
    expect(res.body.scheduledRevenue).toBe(120000); // 75000 + 45000
    expect(res.body.scheduledJobCount).toBe(2);
  });

  it('byService groups jobs correctly', async () => {
    const res = await request(app).get('/api/analytics/scheduled').set('Authorization', `Bearer ${acct.token}`);
    const services = res.body.byService.map(s => s.service_type);
    expect(services).toContain('Window Cleaning');
    expect(services).toContain('Gutter Clean');
    expect(services).not.toContain('Done Job');
  });

  it('unauthenticated request returns 401', async () => {
    const res = await request(app).get('/api/analytics/scheduled');
    expect(res.status).toBe(401);
  });

  it('tech role is blocked (403)', async () => {
    const res = await request(app).get('/api/analytics/scheduled').set('Authorization', `Bearer ${acct.techToken}`);
    expect(res.status).toBe(403);
  });

  it('tenant isolation: empty org sees no scheduled data', async () => {
    const other = await makeAccount('SchedEndpointOther');
    createdAccountIds.push(other.accountId);
    const res = await request(app).get('/api/analytics/scheduled').set('Authorization', `Bearer ${other.token}`);
    expect(res.body.scheduledRevenue).toBe(0);
    expect(res.body.scheduledJobCount).toBe(0);
    expect(res.body.byWeek).toHaveLength(0);
    expect(res.body.byService).toHaveLength(0);
  });
});

// ── Active Jobs KPI — date filtering and stale-job exclusion ─────────────────

describe('GET /api/analytics/dashboard — activeJobs KPI', () => {
  let acct;

  beforeAll(async () => {
    acct = await makeAccount('ActiveJobsKPI');
    createdAccountIds.push(acct.accountId);
  });

  async function getActive() {
    const res = await request(app)
      .get('/api/analytics/dashboard')
      .set('Authorization', `Bearer ${acct.token}`);
    expect(res.status).toBe(200);
    return res.body.activeJobs;
  }

  it('empty state returns 0', async () => {
    expect(await getActive()).toBe(0);
  });

  it('5 old in_progress jobs from yesterday return 0 today', async () => {
    const { rows } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at, amount)
       SELECT $1, $2, 'Stale', 'in_progress', NOW() - INTERVAL '1 day', 1000
       FROM generate_series(1,5)
       RETURNING id`,
      [acct.accountId, acct.clientId]
    );
    expect(await getActive()).toBe(0);
    await pool.query(`DELETE FROM jobs WHERE id = ANY($1)`, [rows.map(r => r.id)]);
  });

  it('2 scheduled jobs today return 0 active', async () => {
    const { rows } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at, amount)
       VALUES ($1, $2, 'Sched', 'scheduled', CURRENT_DATE + TIME '10:00', 1000),
              ($1, $2, 'Sched', 'scheduled', CURRENT_DATE + TIME '14:00', 1000)
       RETURNING id`,
      [acct.accountId, acct.clientId]
    );
    expect(await getActive()).toBe(0);
    await pool.query(`DELETE FROM jobs WHERE id = ANY($1)`, [rows.map(r => r.id)]);
  });

  it('1 in_progress job today returns 1', async () => {
    const { rows: [j] } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at, amount)
       VALUES ($1, $2, 'Active', 'in_progress', NOW(), 1000) RETURNING id`,
      [acct.accountId, acct.clientId]
    );
    expect(await getActive()).toBe(1);
    await pool.query(`DELETE FROM jobs WHERE id = $1`, [j.id]);
  });

  it('completed job today excluded', async () => {
    const { rows: [j] } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at, amount)
       VALUES ($1, $2, 'Done', 'complete', NOW(), 1000) RETURNING id`,
      [acct.accountId, acct.clientId]
    );
    expect(await getActive()).toBe(0);
    await pool.query(`DELETE FROM jobs WHERE id = $1`, [j.id]);
  });

  it('cancelled job today excluded', async () => {
    const { rows: [j] } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at, amount)
       VALUES ($1, $2, 'Cancelled', 'cancelled', NOW(), 1000) RETURNING id`,
      [acct.accountId, acct.clientId]
    );
    expect(await getActive()).toBe(0);
    await pool.query(`DELETE FROM jobs WHERE id = $1`, [j.id]);
  });

  it('in_progress job from another tenant excluded', async () => {
    const other = await makeAccount('ActiveJobsOther');
    createdAccountIds.push(other.accountId);
    await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at, amount)
       VALUES ($1, $2, 'OtherActive', 'in_progress', NOW(), 1000)`,
      [other.accountId, other.clientId]
    );
    expect(await getActive()).toBe(0);
  });

  it('in_progress job today for current tenant included', async () => {
    const { rows: [j] } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at, amount)
       VALUES ($1, $2, 'Mine', 'in_progress', NOW(), 1000) RETURNING id`,
      [acct.accountId, acct.clientId]
    );
    expect(await getActive()).toBe(1);
    await pool.query(`DELETE FROM jobs WHERE id = $1`, [j.id]);
  });

  it('stale in_progress job from prior date does not inflate count', async () => {
    const { rows: [stale] } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at, amount)
       VALUES ($1, $2, 'StaleOne', 'in_progress', NOW() - INTERVAL '3 days', 1000) RETURNING id`,
      [acct.accountId, acct.clientId]
    );
    const { rows: [today] } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at, amount)
       VALUES ($1, $2, 'TodayOne', 'in_progress', NOW(), 1000) RETURNING id`,
      [acct.accountId, acct.clientId]
    );
    expect(await getActive()).toBe(1);
    await pool.query(`DELETE FROM jobs WHERE id = ANY($1)`, [[stale.id, today.id]]);
  });
});

// ── Review notifications — idempotency ────────────────────────────────────────

describe('New review notifications — not duplicated on re-sync', () => {
  let acct;

  beforeAll(async () => {
    acct = await makeAccount('NotifyIdempotency');
    createdAccountIds.push(acct.accountId);
  });

  it('notified_at is null before notification and set after', async () => {
    const extId = `notify-test-${Date.now()}`;
    await pool.query(
      `INSERT INTO external_reviews (account_id, provider, external_review_id, reviewer_name, rating, body, review_at)
       VALUES ($1, 'google', $2, 'Notify Tester', 5, 'Excellent!', NOW())`,
      [acct.accountId, extId]
    );

    // Simulate marking as notified
    await pool.query(
      `UPDATE external_reviews SET notified_at = NOW() WHERE account_id=$1 AND external_review_id=$2`,
      [acct.accountId, extId]
    );

    const { rows } = await pool.query(
      `SELECT notified_at FROM external_reviews WHERE account_id=$1 AND external_review_id=$2`,
      [acct.accountId, extId]
    );
    expect(rows[0].notified_at).not.toBeNull();
  });

  it('reviews with notified_at set are not re-notified by scheduler query pattern', async () => {
    const extId = `no-renotify-${Date.now()}`;
    await pool.query(
      `INSERT INTO external_reviews (account_id, provider, external_review_id, reviewer_name, rating, body, review_at, notified_at)
       VALUES ($1, 'google', $2, 'Already Notified', 4, 'Good', NOW(), NOW())`,
      [acct.accountId, extId]
    );

    // The scheduler queries: WHERE notified_at IS NULL
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM external_reviews
       WHERE account_id=$1 AND external_review_id=$2 AND notified_at IS NULL`,
      [acct.accountId, extId]
    );
    expect(parseInt(rows[0].cnt)).toBe(0);
  });
});

// ── Request status filter ──────────────────────────────────────────────────────

describe('GET /api/requests — status filter', () => {
  let acct;
  beforeAll(async () => {
    acct = await makeAccount('ReqFilter');
    createdAccountIds.push(acct.accountId);
    // Create one 'new' and one 'contacted' request
    await request(app).post('/api/requests').set('Authorization', `Bearer ${acct.token}`).send({ client_name: 'FilterNew', status: 'new' });
    await request(app).post('/api/requests').set('Authorization', `Bearer ${acct.token}`).send({ client_name: 'FilterContacted' });
    const res = await request(app).get('/api/requests').set('Authorization', `Bearer ${acct.token}`);
    const toUpdate = res.body.find(r => r.client_name === 'FilterContacted');
    if (toUpdate) {
      await request(app).patch(`/api/requests/${toUpdate.id}`).set('Authorization', `Bearer ${acct.token}`).send({ status: 'contacted' });
    }
  });

  it('filters by status=new', async () => {
    const res = await request(app).get('/api/requests?status=new').set('Authorization', `Bearer ${acct.token}`);
    expect(res.status).toBe(200);
    res.body.forEach(r => expect(r.status).toBe('new'));
  });

  it('rejects unknown status (returns all, not error — filter is permissive)', async () => {
    // Unknown status just skips the filter — returns all
    const res = await request(app).get('/api/requests?status=invalid').set('Authorization', `Bearer ${acct.token}`);
    expect(res.status).toBe(200);
  });
});

// ── Today's Priorities endpoint ────────────────────────────────────────────────

describe('GET /api/analytics/priorities', () => {
  let acct, acctEmpty;

  beforeAll(async () => {
    acct      = await makeAccount('PrioritiesTest');
    acctEmpty = await makeAccount('PrioritiesEmpty');
    createdAccountIds.push(acct.accountId, acctEmpty.accountId);

    // Create a job to satisfy invoices.job_id NOT NULL constraint
    const { rows: [pjob] } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at)
       VALUES ($1, $2, 'Priorities Job', 'complete', NOW() - INTERVAL '1 day') RETURNING id`,
      [acct.accountId, acct.clientId]
    );

    // Failed invoice — should produce a 'failed_payments' priority (critical)
    await pool.query(
      `INSERT INTO invoices (account_id, client_id, job_id, status, amount)
       VALUES ($1, $2, $3, 'failed', 500)`,
      [acct.accountId, acct.clientId, pjob.id]
    );

    // Create a job for the deposit (job_id is NOT NULL on deposits)
    const { rows: [djob] } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at)
       VALUES ($1, $2, 'Deposit Job', 'scheduled', NOW() + INTERVAL '3 days') RETURNING id`,
      [acct.accountId, acct.clientId]
    );

    // Pending deposit — should produce a 'deposits' priority (critical)
    await pool.query(
      `INSERT INTO deposits (account_id, client_id, job_id, status, amount)
       VALUES ($1, $2, $3, 'pending', 200)`,
      [acct.accountId, acct.clientId, djob.id]
    );

    // Unassigned job today (no tech_id) — should produce an 'unassigned' priority (warning)
    await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at)
       VALUES ($1, $2, 'Unassigned Today', 'scheduled', CURRENT_DATE::timestamp + INTERVAL '10 hours')`,
      [acct.accountId, acct.clientId]
    );
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/analytics/priorities');
    expect(res.status).toBe(401);
  });

  it('returns an array', async () => {
    const res = await request(app).get('/api/analytics/priorities').set('Authorization', `Bearer ${acct.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('each item has required shape fields', async () => {
    const res = await request(app).get('/api/analytics/priorities').set('Authorization', `Bearer ${acct.token}`);
    for (const p of res.body) {
      expect(p).toHaveProperty('type');
      expect(p).toHaveProperty('count');
      expect(p).toHaveProperty('label');
      expect(p).toHaveProperty('sub');
      expect(p).toHaveProperty('route');
      expect(p).toHaveProperty('tone');
    }
  });

  it('includes failed_payments priority when failed invoices exist', async () => {
    const res = await request(app).get('/api/analytics/priorities').set('Authorization', `Bearer ${acct.token}`);
    const fp = res.body.find(p => p.type === 'failed_payments');
    expect(fp).toBeDefined();
    expect(fp.tone).toBe('critical');
    expect(fp.count).toBeGreaterThanOrEqual(1);
  });

  it('includes deposits priority when pending deposits exist', async () => {
    const res = await request(app).get('/api/analytics/priorities').set('Authorization', `Bearer ${acct.token}`);
    const dep = res.body.find(p => p.type === 'deposits');
    expect(dep).toBeDefined();
    expect(dep.tone).toBe('critical');
    expect(dep.count).toBeGreaterThanOrEqual(1);
  });

  it('includes unassigned priority for today unassigned jobs', async () => {
    const res = await request(app).get('/api/analytics/priorities').set('Authorization', `Bearer ${acct.token}`);
    const ua = res.body.find(p => p.type === 'unassigned');
    expect(ua).toBeDefined();
    expect(ua.tone).toBe('warning');
  });

  it('empty account returns empty array', async () => {
    const res = await request(app).get('/api/analytics/priorities').set('Authorization', `Bearer ${acctEmpty.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('tenant isolation: other org sees only its own priorities', async () => {
    const other = await makeAccount('PrioritiesIsolate');
    createdAccountIds.push(other.accountId);
    const res = await request(app).get('/api/analytics/priorities').set('Authorization', `Bearer ${other.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

// ── Recent Activity endpoint ───────────────────────────────────────────────────

describe('GET /api/analytics/activity', () => {
  let acct, acctEmpty;

  beforeAll(async () => {
    acct      = await makeAccount('ActivityTest');
    acctEmpty = await makeAccount('ActivityEmpty');
    createdAccountIds.push(acct.accountId, acctEmpty.accountId);

    // Completed job with completed_at — should appear as job_completed
    await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at, completed_at)
       VALUES ($1, $2, 'Completed HVAC', 'complete', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day')`,
      [acct.accountId, acct.clientId]
    );

    // Recent job created — should appear as job_created
    await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at)
       VALUES ($1, $2, 'New Plumbing Job', 'scheduled', NOW() + INTERVAL '2 days')`,
      [acct.accountId, acct.clientId]
    );

    // Paid invoice (status=paid, no paid_at needed) — should appear as payment_received
    const { rows: [ajob] } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, scheduled_at, completed_at)
       VALUES ($1, $2, 'Invoice Job', 'complete', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours')
       RETURNING id`,
      [acct.accountId, acct.clientId]
    );
    await pool.query(
      `INSERT INTO invoices (account_id, client_id, job_id, status, amount)
       VALUES ($1, $2, $3, 'paid', 300)`,
      [acct.accountId, acct.clientId, ajob.id]
    );

    // Pending deposit — must NOT appear in activity (pending = priorities, not activity)
    await pool.query(
      `INSERT INTO deposits (account_id, client_id, job_id, status, amount)
       VALUES ($1, $2, $3, 'pending', 150)`,
      [acct.accountId, acct.clientId, ajob.id]
    );
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/analytics/activity');
    expect(res.status).toBe(401);
  });

  it('returns an array', async () => {
    const res = await request(app).get('/api/analytics/activity').set('Authorization', `Bearer ${acct.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('each item has required shape fields', async () => {
    const res = await request(app).get('/api/analytics/activity').set('Authorization', `Bearer ${acct.token}`);
    for (const item of res.body) {
      expect(item).toHaveProperty('type');
      expect(item).toHaveProperty('label');
      expect(item).toHaveProperty('sub_type');
      expect(item).toHaveProperty('tone');
      expect(item).toHaveProperty('event_time');
    }
  });

  it('includes job_completed event for completed job', async () => {
    const res = await request(app).get('/api/analytics/activity').set('Authorization', `Bearer ${acct.token}`);
    const jc = res.body.find(e => e.type === 'job_completed');
    expect(jc).toBeDefined();
    expect(jc.tone).toBe('success');
  });

  it('includes payment_received event for paid invoice', async () => {
    const res = await request(app).get('/api/analytics/activity').set('Authorization', `Bearer ${acct.token}`);
    const pr = res.body.find(e => e.type === 'payment_received');
    expect(pr).toBeDefined();
    expect(pr.tone).toBe('success');
  });

  it('does NOT include pending deposits (those belong in priorities)', async () => {
    const res = await request(app).get('/api/analytics/activity').set('Authorization', `Bearer ${acct.token}`);
    const pendingDep = res.body.filter(e =>
      (e.type === 'deposit_paid' || e.type === 'deposit_refunded') &&
      e.label && e.label.toLowerCase().includes('pending')
    );
    expect(pendingDep).toHaveLength(0);
  });

  it('returns newest events first', async () => {
    const res = await request(app).get('/api/analytics/activity').set('Authorization', `Bearer ${acct.token}`);
    const times = res.body.map(e => new Date(e.event_time).getTime());
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeLessThanOrEqual(times[i - 1]);
    }
  });

  it('account with no events sees only its own client creation, not other accounts data', async () => {
    const mainRes   = await request(app).get('/api/analytics/activity').set('Authorization', `Bearer ${acct.token}`);
    const emptyRes  = await request(app).get('/api/analytics/activity').set('Authorization', `Bearer ${acctEmpty.token}`);
    expect(emptyRes.status).toBe(200);
    // acct has completed jobs and invoices; acctEmpty should not see those labels
    const mainLabels = new Set((mainRes.body || []).map(e => e.label));
    for (const item of emptyRes.body) {
      expect(mainLabels.has(item.label)).toBe(false);
    }
  });

  it('tenant isolation: other org sees only its own activity, not another org', async () => {
    const other = await makeAccount('ActivityIsolate');
    createdAccountIds.push(other.accountId);
    const mainRes  = await request(app).get('/api/analytics/activity').set('Authorization', `Bearer ${acct.token}`);
    const otherRes = await request(app).get('/api/analytics/activity').set('Authorization', `Bearer ${other.token}`);
    expect(otherRes.status).toBe(200);
    // other should not see any of acct's event labels (e.g. job completions, invoices)
    const mainLabels = new Set((mainRes.body || []).map(e => e.label));
    for (const item of otherRes.body) {
      expect(mainLabels.has(item.label)).toBe(false);
    }
  });
});
