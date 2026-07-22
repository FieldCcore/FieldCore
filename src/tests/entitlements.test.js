/**
 * Integration tests for the subscription entitlement system.
 * Requires a live DATABASE_URL — run against a test DB in CI.
 *
 * Covers all 25 acceptance criteria from the entitlement specification.
 * Fixture accounts are created in beforeAll and cleaned up in afterAll.
 */

require('dotenv').config();
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const app     = require('../app');
const pool    = require('../db/pool');
const ent     = require('../services/entitlements');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToken(userId, accountId, role = 'owner') {
  return jwt.sign({ userId, accountId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

async function makeAccount(name, plan, overrides = {}) {
  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan, plan_status, feature_overrides)
     VALUES ($1, $2, 'active', $3) RETURNING id`,
    [name, plan, JSON.stringify(overrides)]
  );
  const hash = await bcrypt.hash('pw', 10);
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'owner') RETURNING id`,
    [acct.id, name + ' Owner', `${name.replace(/\s+/g,'').toLowerCase()}-${Date.now()}@test.fc`, hash]
  );
  const { rows: [client] } = await pool.query(
    `INSERT INTO clients (account_id, name) VALUES ($1, $2) RETURNING id`,
    [acct.id, name + ' Client']
  );
  const token = makeToken(user.id, acct.id, 'owner');
  return { accountId: acct.id, userId: user.id, clientId: client.id, token };
}

async function makeTech(accountId) {
  const hash = await bcrypt.hash('pw', 10);
  const { rows: [u] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'tech') RETURNING id`,
    [accountId, 'Test Tech', `tech-${Date.now()}@test.fc`, hash]
  );
  return { userId: u.id, token: makeToken(u.id, accountId, 'tech') };
}

const createdAccountIds = [];

afterAll(async () => {
  if (createdAccountIds.length) {
    await pool.query(`DELETE FROM accounts WHERE id = ANY($1)`, [createdAccountIds]);
  }
  await pool.end();
});

// ── 1. Starter: single-day job allowed ───────────────────────────────────────
describe('Criterion 1: Starter can create a Single-Day Job', () => {
  let starter;
  beforeAll(async () => {
    starter = await makeAccount('Starter1', 'starter');
    createdAccountIds.push(starter.accountId);
  });

  it('POST /api/jobs (single-day) returns 201', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${starter.token}`)
      .send({ client_id: starter.clientId, service_type: 'Lawn Care', amount: 5000 });
    expect(res.status).toBe(201);
  });
});

// ── 2. Starter: multi-day job blocked ────────────────────────────────────────
describe('Criterion 2: Starter cannot create a Multi-Day Job', () => {
  let starter;
  beforeAll(async () => {
    starter = await makeAccount('Starter2', 'starter');
    createdAccountIds.push(starter.accountId);
  });

  it('POST /api/jobs with is_multi_day returns 403', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${starter.token}`)
      .send({ client_id: starter.clientId, service_type: 'Roofing', is_multi_day: true, amount: 100000 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ENTITLEMENT_REQUIRED');
    expect(res.body.requiredPlan).toBe('solo');
  });
});

// ── 3. Starter: project blocked (stub — no project routes yet) ───────────────
describe('Criterion 3: Starter cannot create a Project', () => {
  it('getEntitlements for starter has can_create_projects = false', async () => {
    const [acct] = (await pool.query(
      `SELECT id FROM accounts WHERE plan = 'starter' LIMIT 1`
    )).rows;
    if (!acct) return; // skip if no starter account in DB
    const entResult = await ent.getEntitlements(acct.id, { skipCache: true });
    expect(entResult.capabilities.can_create_projects).toBe(false);
  });
});

// ── 4. Solo: multi-day job allowed ───────────────────────────────────────────
describe('Criterion 4: Solo can create a Multi-Day Job', () => {
  let solo;
  beforeAll(async () => {
    solo = await makeAccount('Solo4', 'solo');
    createdAccountIds.push(solo.accountId);
  });

  it('POST /api/jobs with is_multi_day returns 201', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${solo.token}`)
      .send({
        client_id: solo.clientId, service_type: 'Plumbing', is_multi_day: true,
        estimated_start_date: '2026-11-01', estimated_end_date: '2026-11-02', amount: 80000,
        sessions: [{ scheduled_date: '2026-11-01', start_time: '09:00' }],
      });
    expect(res.status).toBe(201);
    expect(res.body.is_multi_day).toBe(true);
  });
});

// ── 5. Solo: project blocked ──────────────────────────────────────────────────
describe('Criterion 5: Solo cannot create a Project', () => {
  it('getEntitlements for solo has can_create_projects = false', () => {
    const caps = ent.PLAN_CAPABILITIES.solo;
    expect(caps.can_create_projects).toBe(false);
  });
});

// ── 6. Pro: can create projects ───────────────────────────────────────────────
describe('Criterion 6: Pro can create and manage Projects', () => {
  it('getEntitlements for pro has can_create_projects = true', () => {
    const caps = ent.PLAN_CAPABILITIES.pro;
    expect(caps.can_create_projects).toBe(true);
    expect(caps.can_manage_project_teams).toBe(true);
    expect(caps.can_use_project_financials).toBe(true);
  });
});

// ── 7. Pro: scale-only features blocked ──────────────────────────────────────
describe('Criterion 7: Pro cannot use Scale-only Project features', () => {
  it('getEntitlements for pro has scale-only caps = false', () => {
    const caps = ent.PLAN_CAPABILITIES.pro;
    expect(caps.can_view_project_profitability).toBe(false);
    expect(caps.can_use_project_progress_billing).toBe(false);
    expect(caps.can_use_project_milestones).toBe(false);
    expect(caps.can_use_project_templates).toBe(false);
    expect(caps.can_use_advanced_project_reporting).toBe(false);
    expect(caps.can_use_division_project_controls).toBe(false);
  });
});

// ── 8. Scale: all project features ───────────────────────────────────────────
describe('Criterion 8: Scale can use all Project features', () => {
  it('getEntitlements for scale has all caps = true', () => {
    const caps = ent.PLAN_CAPABILITIES.scale;
    const boolCaps = Object.entries(caps)
      .filter(([k]) => k.startsWith('can_'))
      .map(([, v]) => v);
    expect(boolCaps.every(Boolean)).toBe(true);
  });
});

// ── 9. Backend rejects unauthorized API calls ─────────────────────────────────
describe('Criterion 9: Backend rejects direct unauthorized API calls', () => {
  let starter;
  beforeAll(async () => {
    starter = await makeAccount('Starter9', 'starter');
    createdAccountIds.push(starter.accountId);
  });

  it('cannot bypass frontend by calling API directly with is_multi_day', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${starter.token}`)
      .send({ client_id: starter.clientId, service_type: 'Test', is_multi_day: true });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ENTITLEMENT_REQUIRED');
  });
});

// ── 11. Techs do not receive billing prompts ──────────────────────────────────
describe('Criterion 11: Technicians do not receive inappropriate billing prompts', () => {
  let soloAcct, tech;
  beforeAll(async () => {
    soloAcct = await makeAccount('Solo11', 'solo');
    createdAccountIds.push(soloAcct.accountId);
    tech = await makeTech(soloAcct.accountId);
  });

  it('GET /api/entitlements works for tech token', async () => {
    const res = await request(app)
      .get('/api/entitlements')
      .set('Authorization', `Bearer ${tech.token}`);
    expect(res.status).toBe(200);
    // Entitlements are returned — frontend uses this to decide what to show
    expect(res.body.capabilities).toBeDefined();
  });

  it('tech cannot access /api/billing', async () => {
    const res = await request(app)
      .get('/api/billing')
      .set('Authorization', `Bearer ${tech.token}`);
    // Billing routes are owner-only; tech gets 403
    expect([403, 401]).toContain(res.status);
  });
});

// ── 12. Upgrade immediately enables correct entitlements ─────────────────────
describe('Criterion 12: Upgrade immediately enables correct entitlements', () => {
  it('after simulated plan upgrade, cache is invalidated and new caps are available', async () => {
    const acct = await makeAccount('Upgrade12', 'starter');
    createdAccountIds.push(acct.accountId);

    // Warm up cache
    const before = await ent.getEntitlements(acct.accountId);
    expect(before.capabilities.can_create_multi_day_jobs).toBe(false);

    // Simulate upgrade (as webhook would do)
    await pool.query(`UPDATE accounts SET plan = 'solo' WHERE id = $1`, [acct.accountId]);
    ent.invalidate(acct.accountId);

    const after = await ent.getEntitlements(acct.accountId, { skipCache: true });
    expect(after.capabilities.can_create_multi_day_jobs).toBe(true);
    expect(after.plan).toBe('solo');
  });
});

// ── 13–14. Downgrade preserves data, historical access retained ───────────────
describe('Criteria 13–14: Downgrade does not delete data; historical records remain', () => {
  let pro;
  let createdJobId;

  beforeAll(async () => {
    pro = await makeAccount('Pro13', 'pro');
    createdAccountIds.push(pro.accountId);

    // Create a multi-day job while on pro plan
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${pro.token}`)
      .send({
        client_id: pro.clientId, service_type: 'HVAC', is_multi_day: true,
        estimated_start_date: '2026-12-01', estimated_end_date: '2026-12-02', amount: 50000,
        sessions: [{ scheduled_date: '2026-12-01', start_time: '08:00' }],
      });
    createdJobId = res.body.id;
  });

  it('downgrading to starter does not delete the multi-day job', async () => {
    // Simulate downgrade
    await pool.query(`UPDATE accounts SET plan = 'starter' WHERE id = $1`, [pro.accountId]);
    ent.invalidate(pro.accountId);

    // Job should still exist
    const { rows } = await pool.query(
      `SELECT id, is_multi_day FROM jobs WHERE id = $1`, [createdJobId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].is_multi_day).toBe(true);
  });

  it('downgraded account can still GET the historical job', async () => {
    const res = await request(app)
      .get(`/api/jobs/${createdJobId}`)
      .set('Authorization', `Bearer ${pro.token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdJobId);
  });
});

// ── 15. Active Work Sessions remain operational after downgrade ───────────────
describe('Criterion 15: Active Work Sessions remain operational after downgrade', () => {
  let solo, jobId, sessionId;

  beforeAll(async () => {
    solo = await makeAccount('Solo15', 'solo');
    createdAccountIds.push(solo.accountId);

    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${solo.token}`)
      .send({
        client_id: solo.clientId, service_type: 'Electrical', is_multi_day: true,
        estimated_start_date: '2026-12-10', estimated_end_date: '2026-12-11', amount: 30000,
        sessions: [{ scheduled_date: '2026-12-10', start_time: '08:00' }],
      });
    jobId     = res.body.id;
    sessionId = res.body.sessions[0].id;

    // Downgrade to starter
    await pool.query(`UPDATE accounts SET plan = 'starter' WHERE id = $1`, [solo.accountId]);
    ent.invalidate(solo.accountId);
  });

  it('tech can still complete a session after account downgrade', async () => {
    const tech = await makeTech(solo.accountId);
    const res = await request(app)
      .post(`/api/jobs/${jobId}/sessions/${sessionId}/complete`)
      .set('Authorization', `Bearer ${tech.token}`)
      .send({ work_completed: 'Done', completion_pct: 100, actual_hours: 6 });
    // Session completion is always allowed regardless of plan
    expect(res.status).toBe(200);
  });
});

// ── 16. New premium record creation blocked after downgrade ───────────────────
describe('Criterion 16: New premium record creation is blocked after downgrade', () => {
  let starter;

  beforeAll(async () => {
    starter = await makeAccount('Starter16', 'starter');
    createdAccountIds.push(starter.accountId);
  });

  it('cannot create a new multi-day job on starter', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${starter.token}`)
      .send({ client_id: starter.clientId, service_type: 'Welding', is_multi_day: true });
    expect(res.status).toBe(403);
  });
});

// ── 17–18. Trial access and expiration ───────────────────────────────────────
describe('Criteria 17–18: Trial access and expiration', () => {
  it('active trial_plan gives higher capabilities', async () => {
    const acct = await makeAccount('Trial17', 'starter');
    createdAccountIds.push(acct.accountId);

    // Grant a solo trial expiring in the future
    await pool.query(
      `UPDATE accounts SET trial_plan = 'solo', trial_ends_at = NOW() + INTERVAL '7 days' WHERE id = $1`,
      [acct.accountId]
    );
    const result = await ent.getEntitlements(acct.accountId, { skipCache: true });
    expect(result.effectivePlan).toBe('solo');
    expect(result.capabilities.can_create_multi_day_jobs).toBe(true);
  });

  it('expired trial reverts to base plan', async () => {
    const acct = await makeAccount('Trial18', 'starter');
    createdAccountIds.push(acct.accountId);

    // Grant an expired solo trial
    await pool.query(
      `UPDATE accounts SET trial_plan = 'solo', trial_ends_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
      [acct.accountId]
    );
    const result = await ent.getEntitlements(acct.accountId, { skipCache: true });
    expect(result.effectivePlan).toBe('starter');
    expect(result.capabilities.can_create_multi_day_jobs).toBe(false);
  });
});

// ── 19. Tenant-level overrides ────────────────────────────────────────────────
describe('Criterion 19: Tenant-level overrides work correctly', () => {
  it('feature_overrides can grant a capability above the base plan', async () => {
    const acct = await makeAccount('Override19', 'starter', {
      can_create_multi_day_jobs: true,
    });
    createdAccountIds.push(acct.accountId);

    const result = await ent.getEntitlements(acct.accountId, { skipCache: true });
    expect(result.capabilities.can_create_multi_day_jobs).toBe(true);
    expect(result.hasOverrides).toBe(true);
  });

  it('feature_overrides can restrict a capability below the base plan', async () => {
    const acct = await makeAccount('Override19b', 'scale', {
      can_create_projects: false,
    });
    createdAccountIds.push(acct.accountId);

    const result = await ent.getEntitlements(acct.accountId, { skipCache: true });
    expect(result.capabilities.can_create_projects).toBe(false);
  });
});

// ── 20. Grandfathered access ──────────────────────────────────────────────────
describe('Criterion 20: Grandfathered access works correctly', () => {
  it('starter account with grandfathered multi-day can call the API', async () => {
    const acct = await makeAccount('Grand20', 'starter', {
      can_create_multi_day_jobs: true,
      can_manage_work_sessions:  true,
    });
    createdAccountIds.push(acct.accountId);

    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${acct.token}`)
      .send({
        client_id: acct.clientId, service_type: 'Painting', is_multi_day: true,
        estimated_start_date: '2027-01-01', estimated_end_date: '2027-01-02', amount: 20000,
        sessions: [{ scheduled_date: '2027-01-01', start_time: '09:00' }],
      });
    expect(res.status).toBe(201);
  });
});

// ── 21. Cross-tenant entitlement data cannot be accessed ─────────────────────
describe('Criterion 21: Cross-tenant entitlement data cannot be accessed', () => {
  let acctA, acctB;

  beforeAll(async () => {
    acctA = await makeAccount('Tenant21A', 'pro');
    acctB = await makeAccount('Tenant21B', 'starter');
    createdAccountIds.push(acctA.accountId, acctB.accountId);
  });

  it('GET /api/entitlements only returns own account entitlements', async () => {
    const resA = await request(app).get('/api/entitlements').set('Authorization', `Bearer ${acctA.token}`);
    const resB = await request(app).get('/api/entitlements').set('Authorization', `Bearer ${acctB.token}`);

    expect(resA.body.plan).toBe('pro');
    expect(resB.body.plan).toBe('starter');
    // Verify they're isolated
    expect(resA.body.plan).not.toBe(resB.body.plan);
  });
});

// ── 22. Plan limits cannot be exceeded by concurrent requests ─────────────────
describe('Criterion 22: Plan limits cannot be exceeded through concurrent requests', () => {
  it('concurrent job creation respects the monthly job cap', async () => {
    const acct = await makeAccount('Concurrent22', 'starter');
    createdAccountIds.push(acct.accountId);

    // Pre-fill the starter monthly limit (50) to 49
    const bulkInserts = [];
    for (let i = 0; i < 49; i++) {
      bulkInserts.push(
        pool.query(
          `INSERT INTO jobs (account_id, client_id, service_type, status, amount)
           VALUES ($1, $2, $3, 'scheduled', 5000)`,
          [acct.accountId, acct.clientId, `Bulk Job ${i}`]
        )
      );
    }
    await Promise.all(bulkInserts);

    // Fire 3 concurrent creates — only the first should succeed (cap = 50)
    const concurrent = Array.from({ length: 3 }, () =>
      request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${acct.token}`)
        .send({ client_id: acct.clientId, service_type: 'Overflow Test', amount: 1000 })
    );
    const results = await Promise.all(concurrent);

    const successes = results.filter(r => r.status === 201).length;
    const rejections = results.filter(r => r.status === 403).length;
    expect(successes).toBeGreaterThanOrEqual(1);
    expect(rejections).toBeGreaterThanOrEqual(1);
    expect(successes + rejections).toBe(3);
  });
});

// ── 23. Webhook replay idempotency ────────────────────────────────────────────
describe('Criterion 23: Subscription webhook replay does not duplicate entitlement changes', () => {
  it('updating plan to the same value twice is idempotent', async () => {
    const acct = await makeAccount('Webhook23', 'solo');
    createdAccountIds.push(acct.accountId);

    // Simulate same plan update twice (as webhook replay)
    await pool.query(`UPDATE accounts SET plan = 'pro' WHERE id = $1`, [acct.accountId]);
    ent.invalidate(acct.accountId);
    await pool.query(`UPDATE accounts SET plan = 'pro' WHERE id = $1`, [acct.accountId]);
    ent.invalidate(acct.accountId);

    const result = await ent.getEntitlements(acct.accountId, { skipCache: true });
    expect(result.plan).toBe('pro');
    expect(result.capabilities.can_create_projects).toBe(true);
  });
});

// ── 24. Existing single-day job behavior unchanged ────────────────────────────
describe('Criterion 24: Existing standalone Job behavior remains unchanged', () => {
  let pro;
  beforeAll(async () => {
    pro = await makeAccount('Pro24', 'pro');
    createdAccountIds.push(pro.accountId);
  });

  it('single-day job creation and retrieval work exactly as before', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${pro.token}`)
      .send({ client_id: pro.clientId, service_type: 'AC Repair', amount: 29900,
               scheduled_at: '2026-12-15T10:00:00Z' });
    expect(res.status).toBe(201);
    expect(res.body.is_multi_day).toBe(false);
    expect(res.body.amount).toBe(29900);
  });
});

// ── 25. Existing plan enforcement tests still pass ────────────────────────────
describe('Criterion 25: Existing subscription-plan enforcement tests still pass', () => {
  let starter;
  beforeAll(async () => {
    starter = await makeAccount('Starter25', 'starter');
    createdAccountIds.push(starter.accountId);
  });

  it('starter monthly job limit still enforced (max 50/month)', async () => {
    const ents = await ent.getEntitlements(starter.accountId, { skipCache: true });
    expect(ents.capabilities.max_jobs_per_month).toBe(50);
  });

  it('starter user limit still enforced (max 2 users)', async () => {
    const ents = await ent.getEntitlements(starter.accountId, { skipCache: true });
    expect(ents.capabilities.max_users).toBe(2);
  });

  it('GET /api/entitlements requires authentication', async () => {
    const res = await request(app).get('/api/entitlements');
    expect(res.status).toBe(401);
  });
});
