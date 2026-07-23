/**
 * Integration tests for multi-day job endpoints.
 * Requires a live DATABASE_URL — run against a test DB in CI.
 *
 * Setup: beforeAll inserts a scratch account, user, and client.
 * Teardown: afterAll deletes all rows created by this run (cascades handle children).
 */

require('dotenv').config();
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const app     = require('../app');
const pool    = require('../db/pool');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToken(userId, accountId, role = 'owner') {
  return jwt.sign({ userId, accountId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

let accountId, userId, clientId, token;
const createdJobIds = [];

beforeAll(async () => {
  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, $2) RETURNING id`,
    ['__TEST_ACCOUNT__', 'pro']
  );
  accountId = acct.id;

  const hash = await bcrypt.hash('test-pw-123', 10);
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [accountId, 'Test Owner', `test-owner-${Date.now()}@fieldcore.test`, hash, 'owner']
  );
  userId = user.id;
  token  = makeToken(userId, accountId, 'owner');

  const { rows: [client] } = await pool.query(
    `INSERT INTO clients (account_id, name, email, phone)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [accountId, 'Test Client', 'client@fieldcore.test', '5550001234']
  );
  clientId = client.id;
});

afterAll(async () => {
  if (accountId) {
    // Delete account cascades to all child records (jobs, invoices, clients, users)
    await pool.query(`DELETE FROM accounts WHERE id = $1`, [accountId]);
  }
  await pool.end();
});

// ── Auth guard ────────────────────────────────────────────────────────────────

describe('Auth guard', () => {
  it('rejects request with no token', async () => {
    const res = await request(app).get('/api/jobs');
    expect(res.status).toBe(401);
  });

  it('rejects request with a bad token', async () => {
    const res = await request(app)
      .get('/api/jobs')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});

// ── Create multi-day job ──────────────────────────────────────────────────────

describe('POST /api/jobs — multi-day creation', () => {
  it('creates a multi-day job with sessions', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id:            clientId,
        service_type:         'Roofing',
        is_multi_day:         true,
        title:                'Roof Replacement',
        scope_of_work:        'Full tear-off and replacement',
        estimated_start_date: '2026-08-01',
        estimated_end_date:   '2026-08-03',
        billing_method:       'fixed',
        amount:               500000,
        priority:             'high',
        sessions: [
          { scheduled_date: '2026-08-01', start_time: '08:00', estimated_hours: 8, title: 'Day 1 - Tear Off' },
          { scheduled_date: '2026-08-02', start_time: '08:00', estimated_hours: 8, title: 'Day 2 - Underlayment' },
          { scheduled_date: '2026-08-03', start_time: '08:00', estimated_hours: 6, title: 'Day 3 - Shingles & Cleanup' },
        ],
      });

    // POST /api/jobs returns { ...job, sessions: [...] }
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.is_multi_day).toBe(true);
    expect(res.body.title).toBe('Roof Replacement');
    expect(Array.isArray(res.body.sessions)).toBe(true);
    expect(res.body.sessions).toHaveLength(3);
    expect(res.body.sessions[0].title).toBe('Day 1 - Tear Off');
    expect(res.body.sessions[0].status).toBe('scheduled');

    createdJobIds.push(res.body.id);
  });

  it('creates a single-day job (existing behaviour unbroken)', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id:    clientId,
        service_type: 'HVAC Tune-up',
        scheduled_at: '2026-08-05T09:00:00Z',
        amount:       15000,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    createdJobIds.push(res.body.id);
  });

  it('rejects job creation without required fields', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId });  // missing service_type

    expect(res.status).toBe(400);
  });
});

// ── Sessions CRUD ─────────────────────────────────────────────────────────────

describe('Session management', () => {
  let jobId, sessionId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id:            clientId,
        service_type:         'Plumbing',
        is_multi_day:         true,
        title:                'Plumbing Reroute',
        estimated_start_date: '2026-09-01',
        estimated_end_date:   '2026-09-02',
        billing_method:       'time_materials',
        amount:               0,
        sessions: [
          { scheduled_date: '2026-09-01', start_time: '09:00', estimated_hours: 6 },
        ],
      });
    expect(res.status).toBe(201);
    jobId     = res.body.id;
    sessionId = res.body.sessions[0].id;
    createdJobIds.push(jobId);
  });

  it('GET /api/jobs/:id returns the job with sessions array', async () => {
    const res = await request(app)
      .get(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${token}`);

    // GET /api/jobs/:id returns the job object directly with sessions embedded
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(jobId);
    expect(Array.isArray(res.body.sessions)).toBe(true);
    expect(res.body.sessions.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/jobs/:id/sessions adds a new session', async () => {
    const res = await request(app)
      .post(`/api/jobs/${jobId}/sessions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        scheduled_date:  '2026-09-02',
        start_time:      '09:00',
        estimated_hours: 4,
        title:           'Day 2 - Finishing',
      });

    expect(res.status).toBe(201);
    expect(res.body.id || res.body.session?.id).toBeTruthy();
  });

  it('PATCH /api/jobs/:id/sessions/:sid/status updates status to in_progress', async () => {
    const res = await request(app)
      .patch(`/api/jobs/${jobId}/sessions/${sessionId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'in_progress' });

    expect(res.status).toBe(200);
    // Response is the updated session object
    const updated = res.body.session || res.body;
    expect(updated.status).toBe('in_progress');
  });

  it('rejects an invalid session status value', async () => {
    const res = await request(app)
      .patch(`/api/jobs/${jobId}/sessions/${sessionId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'on_fire' });

    expect(res.status).toBe(400);
  });

  it('POST /api/jobs/:id/sessions/:sid/complete closes out a session', async () => {
    const res = await request(app)
      .post(`/api/jobs/${jobId}/sessions/${sessionId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        work_completed: 'Rerouted supply lines in kitchen',
        work_remaining: 'Second bathroom pending',
        completion_pct: 50,
        actual_hours:   5.5,
      });

    expect(res.status).toBe(200);
    const updated = res.body.session || res.body;
    expect(updated.status).toBe('completed_for_day');
  });
});

// ── GET /api/jobs/sessions ────────────────────────────────────────────────────

describe('GET /api/jobs/sessions', () => {
  it('returns a sessions array for a date range', async () => {
    const res = await request(app)
      .get('/api/jobs/sessions?date_from=2026-08-01&date_to=2026-09-30')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const sessions = res.body.sessions || res.body;
    expect(Array.isArray(sessions)).toBe(true);
  });

  it('returns empty array for a date range with no sessions', async () => {
    const res = await request(app)
      .get('/api/jobs/sessions?date_from=2000-01-01&date_to=2000-01-02')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const sessions = res.body.sessions || res.body;
    expect(sessions).toHaveLength(0);
  });
});

// ── Tenant isolation ──────────────────────────────────────────────────────────

describe('Tenant isolation', () => {
  let otherAccountId, otherToken, otherJobId;

  beforeAll(async () => {
    const { rows: [acct] } = await pool.query(
      `INSERT INTO accounts (name, plan) VALUES ($1, $2) RETURNING id`,
      ['__TEST_OTHER_ACCOUNT__', 'starter']
    );
    otherAccountId = acct.id;

    const hash = await bcrypt.hash('pw', 10);
    const { rows: [user] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [otherAccountId, 'Other Owner', `other-${Date.now()}@fieldcore.test`, hash, 'owner']
    );
    otherToken = makeToken(user.id, otherAccountId, 'owner');

    const { rows: [client] } = await pool.query(
      `INSERT INTO clients (account_id, name) VALUES ($1, $2) RETURNING id`,
      [otherAccountId, 'Other Client']
    );
    const { rows: [job] } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, amount)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [otherAccountId, client.id, 'Pest Control', 'scheduled', 9900]
    );
    otherJobId = job.id;
  });

  afterAll(async () => {
    if (otherAccountId) {
      await pool.query(`DELETE FROM accounts WHERE id = $1`, [otherAccountId]);
    }
  });

  it('cannot access another account\'s job (returns 404)', async () => {
    const res = await request(app)
      .get(`/api/jobs/${otherJobId}`)
      .set('Authorization', `Bearer ${token}`);

    expect([403, 404]).toContain(res.status);
  });

  it('cannot add sessions to another account\'s job', async () => {
    const res = await request(app)
      .post(`/api/jobs/${otherJobId}/sessions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ scheduled_date: '2026-09-10', start_time: '09:00' });

    expect([403, 404]).toContain(res.status);
  });
});

// ── Role enforcement ──────────────────────────────────────────────────────────

describe('Role enforcement', () => {
  let techToken, jobId, sessionId;

  beforeAll(async () => {
    const hash = await bcrypt.hash('pw', 10);
    const { rows: [tech] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [accountId, 'Test Tech', `tech-${Date.now()}@fieldcore.test`, hash, 'tech']
    );
    techToken = makeToken(tech.id, accountId, 'tech');

    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id:            clientId,
        service_type:         'Electrical',
        is_multi_day:         true,
        title:                'Role Test Job',
        estimated_start_date: '2026-10-01',
        estimated_end_date:   '2026-10-02',
        billing_method:       'fixed',
        amount:               30000,
        sessions: [{ scheduled_date: '2026-10-01', start_time: '08:00' }],
      });
    expect(res.status).toBe(201);
    jobId     = res.body.id;
    sessionId = res.body.sessions[0].id;
    createdJobIds.push(jobId);
  });

  it('tech cannot complete the parent job (403)', async () => {
    const res = await request(app)
      .post(`/api/jobs/${jobId}/complete`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({});

    expect(res.status).toBe(403);
  });

  it('tech cannot add a session to a job (403)', async () => {
    const res = await request(app)
      .post(`/api/jobs/${jobId}/sessions`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ scheduled_date: '2026-10-02', start_time: '09:00' });

    expect(res.status).toBe(403);
  });

  it('owner can complete the parent job — returns complete job and generates invoice', async () => {
    // First close out the session
    await request(app)
      .post(`/api/jobs/${jobId}/sessions/${sessionId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ work_completed: 'Done', completion_pct: 100, actual_hours: 8 });

    // Complete the parent job
    const res = await request(app)
      .post(`/api/jobs/${jobId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'All complete' });

    // POST /api/jobs/:id/complete returns the updated job row directly
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('complete');
    expect(res.body.id).toBe(jobId);

    // Verify the invoice was inserted into the DB (it's not returned in the response)
    const { rows: invoices } = await pool.query(
      `SELECT id FROM invoices WHERE job_id = $1 AND account_id = $2`, [jobId, accountId]
    );
    expect(invoices.length).toBeGreaterThanOrEqual(1);
  });

  it('cannot complete an already-complete job (409)', async () => {
    const res = await request(app)
      .post(`/api/jobs/${jobId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(409);
  });
});
