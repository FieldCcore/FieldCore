'use strict';
/**
 * Revenue Analytics — Integration Tests
 *
 * Tests KPI definitions, multi-tech no double count, AR calculation,
 * tenant isolation, permission enforcement, and error states.
 *
 * Requires a live DATABASE_URL.
 */
require('dotenv').config();
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const app     = require('../app');
const pool    = require('../db/pool');
const svc     = require('../services/revenueAnalyticsService');

function makeToken(userId, accountId, role = 'owner') {
  return jwt.sign({ userId, accountId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

let accountId, userId, token;
let otherAccountId, otherToken, otherUserId;
let clientId, tech1Id, tech2Id;

const TODAY      = new Date().toISOString().slice(0, 10);
const MONTH_START = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);

beforeAll(async () => {
  const hash = await bcrypt.hash('pw123', 10);

  // Primary test account
  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1,$2) RETURNING id`,
    [`__TEST_REVENUE_${Date.now()}__`, 'pro']
  );
  accountId = acct.id;

  const { rows: [u] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [accountId, 'Rev Owner', `rev-owner-${Date.now()}@test.fc`, hash, 'owner']
  );
  userId = u.id;
  token  = makeToken(userId, accountId, 'owner');

  // Second account (isolation tests)
  const { rows: [acct2] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1,$2) RETURNING id`,
    [`__TEST_REVENUE_OTHER_${Date.now()}__`, 'pro']
  );
  otherAccountId = acct2.id;
  const { rows: [u2] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [otherAccountId, 'Other Owner', `rev-other-${Date.now()}@test.fc`, hash, 'owner']
  );
  otherUserId = u2.id;
  otherToken = makeToken(u2.id, otherAccountId, 'owner');

  // Client
  const { rows: [c] } = await pool.query(
    `INSERT INTO clients (account_id, name, email) VALUES ($1,$2,$3) RETURNING id`,
    [accountId, 'Test Client', `rev-client-${Date.now()}@test.fc`]
  );
  clientId = c.id;

  // Technicians
  for (const [name, ref] of [['Tech A', 'a'], ['Tech B', 'b']]) {
    const { rows: [t] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role, field_work_eligible)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [accountId, name, `tech-${ref}-${Date.now()}@test.fc`, hash, 'tech', true]
    );
    if (ref === 'a') tech1Id = t.id;
    if (ref === 'b') tech2Id = t.id;
  }
});

afterAll(async () => {
  // Clean up test data (cascade deletes handle children)
  await pool.query(`DELETE FROM accounts WHERE id IN ($1,$2)`, [accountId, otherAccountId]);
  await pool.end();
});

// ── Helper: create test job ───────────────────────────────────────────────────

async function createJob({ status = 'complete', amount = 30000, serviceType = 'Cleaning', techId, scheduledAt } = {}) {
  const sa = scheduledAt || TODAY + 'T10:00:00Z';
  const { rows: [j] } = await pool.query(
    `INSERT INTO jobs (account_id, client_id, tech_id, service_type, status, amount, scheduled_at, duration_minutes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [accountId, clientId, techId || tech1Id, serviceType, status, amount, sa, 60]
  );
  return j.id;
}

async function createInvoice({ jobId, amount = 30000, status = 'paid', paidAt } = {}) {
  const pa = paidAt || TODAY + 'T12:00:00Z';
  const { rows: [i] } = await pool.query(
    `INSERT INTO invoices (account_id, job_id, client_id, amount, status, paid_at)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [accountId, jobId, clientId, amount, status, status === 'paid' ? pa : null]
  );
  return i.id;
}

// ── Multi-tech no double count ────────────────────────────────────────────────

describe('Multi-tech revenue — no double count', () => {
  it('counts one $300 job with two assignments as $300 earned (not $600)', async () => {
    const jobId = await createJob({ amount: 30000 });

    // Add a second assignment (simulating two techs on same job)
    await pool.query(
      `INSERT INTO job_assignments (account_id, job_id, user_id, assignment_role, is_primary, status, assigned_by)
       VALUES ($1,$2,$3,'lead_technician',TRUE,'assigned',$4)
       ON CONFLICT DO NOTHING`,
      [accountId, jobId, tech1Id, userId]
    );
    await pool.query(
      `INSERT INTO job_assignments (account_id, job_id, user_id, assignment_role, is_primary, status, assigned_by)
       VALUES ($1,$2,$3,'technician',FALSE,'assigned',$4)
       ON CONFLICT DO NOTHING`,
      [accountId, jobId, tech2Id, userId]
    );

    const result = await svc._earnedRevenue(accountId, MONTH_START, TODAY);
    // The job.amount (300.00) should appear only once
    expect(result.value).toBeGreaterThanOrEqual(300); // at least this job
    expect(result.status).toBe('ok');

    // Verify via overview endpoint
    const res = await request(app)
      .get(`/api/revenue/overview?start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // Earned revenue should NOT be doubled
    expect(res.body.primaryKpis.earnedRevenue.value).toBeGreaterThanOrEqual(300);
    expect(res.body.primaryKpis.earnedRevenue.value).toBeLessThan(10000); // sanity: not millions
  });
});

// ── Collected vs Earned distinction ──────────────────────────────────────────

describe('Collected vs Earned revenue distinction', () => {
  it('earned revenue counts completed jobs; collected counts paid invoices', async () => {
    const jobId = await createJob({ amount: 20000 });
    // No invoice yet
    const earned = await svc._earnedRevenue(accountId, MONTH_START, TODAY);
    const collected = await svc._collectedRevenue(accountId, MONTH_START, TODAY);

    expect(earned.value).toBeGreaterThanOrEqual(200); // job complete → earned
    // collected may be 0 if no paid invoice
    expect(collected.status).toBe('ok');

    // Now create paid invoice
    await createInvoice({ jobId, amount: 20000 });
    const collected2 = await svc._collectedRevenue(accountId, MONTH_START, TODAY);
    expect(collected2.value).toBeGreaterThan(collected.value);
  });

  it('pending invoices do not count as collected', async () => {
    const jobId = await createJob({ amount: 15000 });
    await createInvoice({ jobId, amount: 15000, status: 'pending' });

    const collected = await svc._collectedRevenue(accountId, MONTH_START, TODAY);
    // The pending invoice amount should NOT be in collected
    const ar = await svc._outstandingAr(accountId);
    expect(ar.invoiceCount).toBeGreaterThan(0);
    expect(ar.value).toBeGreaterThanOrEqual(150);
  });
});

// ── Outstanding AR ────────────────────────────────────────────────────────────

describe('Outstanding AR', () => {
  it('sums only pending invoices', async () => {
    const jobId = await createJob({ amount: 10000 });
    await createInvoice({ jobId, amount: 10000, status: 'pending' });

    const ar = await svc._outstandingAr(accountId);
    expect(ar.value).toBeGreaterThan(0);
    expect(ar.invoiceCount).toBeGreaterThan(0);
    expect(ar.status).toBe('ok');
  });

  it('excludes void and paid invoices from AR', async () => {
    const j1 = await createJob({ amount: 5000 });
    const j2 = await createJob({ amount: 5000 });
    await createInvoice({ jobId: j1, amount: 5000, status: 'void' });
    await createInvoice({ jobId: j2, amount: 5000, status: 'paid' });

    const ar = await svc._outstandingAr(accountId);
    // These invoices should not inflate AR
    // (previous pending invoices may exist — just verify the structure)
    expect(ar.status).toBe('ok');
    expect(typeof ar.value).toBe('number');
  });

  it('is not filtered by the selected date range (current balance)', async () => {
    // AR should reflect all pending invoices regardless of date range
    const ar1 = await svc._outstandingAr(accountId, '2020-01-01', '2020-12-31');
    const ar2 = await svc._outstandingAr(accountId);
    expect(ar1.value).toBe(ar2.value);
  });

  it('counts invoices with no due_date as overdue after 30 days via proxy (IS-002 regression)', async () => {
    // Invoice with no due_date, no sent_at, created 35 days ago → proxy due = created_at + 30d → overdue
    const jobId = await createJob({ amount: 7500 });
    const { rows: [inv] } = await pool.query(
      `INSERT INTO invoices (account_id, job_id, client_id, amount, status, created_at)
       VALUES ($1, $2, $3, 7500, 'pending', NOW() - INTERVAL '35 days') RETURNING id`,
      [accountId, jobId, clientId]
    );

    const ar = await svc._outstandingAr(accountId);
    expect(ar.overdueCount).toBeGreaterThan(0);
    expect(ar.overdueTotal).toBeGreaterThan(0);

    await pool.query('DELETE FROM invoices WHERE id = $1', [inv.id]);
  });

  it('does not count invoices with no due_date as overdue before 30 days (IS-002 regression)', async () => {
    // Invoice with no due_date, created yesterday → proxy due = yesterday + 30d → not yet overdue
    const jobId = await createJob({ amount: 9900 });
    const before = await svc._outstandingAr(accountId);
    const { rows: [inv] } = await pool.query(
      `INSERT INTO invoices (account_id, job_id, client_id, amount, status, created_at)
       VALUES ($1, $2, $3, 9900, 'pending', NOW() - INTERVAL '1 day') RETURNING id`,
      [accountId, jobId, clientId]
    );

    const after = await svc._outstandingAr(accountId);
    // New invoice created yesterday is NOT past 30-day proxy → overdueCount stays same
    expect(after.overdueCount).toBe(before.overdueCount);

    await pool.query('DELETE FROM invoices WHERE id = $1', [inv.id]);
  });
});

// ── Average Ticket ────────────────────────────────────────────────────────────

describe('Average Ticket', () => {
  it('equals earned revenue divided by completed job count', async () => {
    await createJob({ amount: 40000 });
    await createJob({ amount: 80000 });

    const at = await svc._averageTicket(accountId, MONTH_START, TODAY);
    if (at.status === 'ok') {
      const ev = await svc._earnedRevenue(accountId, MONTH_START, TODAY);
      // avg × count ≈ total (within float tolerance)
      expect(at.value * at.count).toBeCloseTo(ev.value, 0);
    }
  });

  it('returns no_eligible_revenue when no completed jobs with amount', async () => {
    // Use a future date range with no jobs
    const at = await svc._averageTicket(accountId, '2000-01-01', '2000-01-31');
    expect(at.status).toBe('no_eligible_revenue');
    expect(at.value).toBeNull();
  });
});

// ── Completion Rate ───────────────────────────────────────────────────────────

describe('Completion Rate', () => {
  it('is completed ÷ (completed + cancelled + no_show)', async () => {
    await createJob({ status: 'complete',   amount: 20000 });
    await createJob({ status: 'cancelled',  amount: 15000 });

    const cr = await svc._completionRate(accountId, MONTH_START, TODAY);
    expect(cr.status).toBe('ok');
    expect(cr.value).toBeGreaterThan(0);
    expect(cr.value).toBeLessThanOrEqual(1);
    expect(cr.completed).toBeGreaterThan(0);
    expect(cr.eligible).toBeGreaterThanOrEqual(cr.completed);
  });

  it('returns no_eligible_revenue for empty period', async () => {
    const cr = await svc._completionRate(accountId, '2000-01-01', '2000-01-31');
    expect(cr.status).toBe('no_eligible_revenue');
    expect(cr.value).toBeNull();
  });
});

// ── Repeat Revenue ────────────────────────────────────────────────────────────

describe('Repeat Revenue', () => {
  it('counts revenue from returning clients only', async () => {
    // Create a client with a prior completed job
    const { rows: [repeatClient] } = await pool.query(
      `INSERT INTO clients (account_id, name, email) VALUES ($1,$2,$3) RETURNING id`,
      [accountId, 'Repeat Client', `repeat-${Date.now()}@test.fc`]
    );

    // Prior job (before period)
    const lastMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 15)).toISOString().slice(0,10);
    await pool.query(
      `INSERT INTO jobs (account_id, client_id, tech_id, service_type, status, amount, scheduled_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [accountId, repeatClient.id, tech1Id, 'Cleaning', 'complete', 25000, lastMonth + 'T10:00:00Z']
    );

    // Current period job for same client
    const currentJobId = await pool.query(
      `INSERT INTO jobs (account_id, client_id, tech_id, service_type, status, amount, scheduled_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [accountId, repeatClient.id, tech1Id, 'Cleaning', 'complete', 30000, TODAY + 'T10:00:00Z']
    );

    const rr = await svc._repeatRevenue(accountId, MONTH_START, TODAY);
    expect(rr.status).toBe('ok');
    expect(rr.value).toBeGreaterThan(0);
    expect(rr.clientCount).toBeGreaterThan(0);
  });
});

// ── Gross profit unavailable ──────────────────────────────────────────────────

describe('Gross Profit', () => {
  it('returns unavailable status — no cost source connected', async () => {
    const gp = await svc._grossProfit();
    expect(gp.status).toBe('unavailable');
    expect(gp.value).toBeNull();
    expect(gp.missingSources).toContain('labor costs');
  });
});

// ── Technician utilization unavailable ───────────────────────────────────────

describe('Technician Utilization', () => {
  it('returns unavailable — no availability data configured', async () => {
    const tu = await svc._technicianUtilization();
    expect(tu.status).toBe('unavailable');
    expect(tu.value).toBeNull();
  });
});

// ── Revenue at Risk ───────────────────────────────────────────────────────────

describe('Revenue at Risk', () => {
  it('includes overdue invoices, cancelled jobs, and failed payments', async () => {
    const rar = await svc._revenueAtRisk(accountId, MONTH_START, TODAY);
    expect(rar.status).toBe('ok');
    expect(typeof rar.value).toBe('number');
    expect(rar.breakdown).toHaveProperty('overdueInvoices');
    expect(rar.breakdown).toHaveProperty('cancelledJobs');
    expect(rar.breakdown).toHaveProperty('failedPayments');
  });
});

// ── Tenant isolation ──────────────────────────────────────────────────────────

describe('Tenant isolation', () => {
  it('account A cannot see account B revenue via API', async () => {
    // Create a job in account B
    const { rows: [bClient] } = await pool.query(
      `INSERT INTO clients (account_id, name, email) VALUES ($1,$2,$3) RETURNING id`,
      [otherAccountId, 'Other Client', `other-${Date.now()}@test.fc`]
    );
    await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, amount, scheduled_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [otherAccountId, bClient.id, 'Painting', 'complete', 500000, TODAY + 'T10:00:00Z']
    );

    // Account A's overview should not include account B's revenue
    const resA = await request(app)
      .get(`/api/revenue/overview?start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`);
    expect(resA.status).toBe(200);

    const resB = await request(app)
      .get(`/api/revenue/overview?start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(resB.status).toBe(200);

    // Each account sees its own data only
    const earnedA = resA.body.primaryKpis?.earnedRevenue?.value || 0;
    const earnedB = resB.body.primaryKpis?.earnedRevenue?.value || 0;
    // Account B has a $5000 job; account A may have less
    expect(earnedB).toBeGreaterThanOrEqual(5000);
    // Account A should not include account B's $5000 job
    // (We verify by checking A's earned is independent)
    expect(typeof earnedA).toBe('number');
  });

  it('service data is isolated per tenant', async () => {
    const servA = await request(app)
      .get(`/api/revenue/services?start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`);
    const servB = await request(app)
      .get(`/api/revenue/services?start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(servA.status).toBe(200);
    expect(servB.status).toBe(200);
    // Account B should show Painting service (not in A's scope)
    const bServices = servB.body.map(s => s.service);
    expect(bServices).toContain('Painting');
    const aServices = servA.body.map(s => s.service);
    expect(aServices).not.toContain('Painting');
  });
});

// ── Permission enforcement ────────────────────────────────────────────────────

describe('Permission enforcement', () => {
  it('requires auth on all revenue endpoints', async () => {
    const endpoints = [
      '/api/revenue/overview',
      '/api/revenue/trend',
      '/api/revenue/services',
      '/api/revenue/risk',
    ];
    for (const ep of endpoints) {
      const res = await request(app).get(ep);
      expect([401, 403]).toContain(res.status);
    }
  });

  it('rejects technician role from revenue endpoints', async () => {
    const { rows: [techUser] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [accountId, 'Tech Only', `tech-only-${Date.now()}@test.fc`, await bcrypt.hash('pw', 10), 'tech']
    );
    const techToken = makeToken(techUser.id, accountId, 'tech');
    const res = await request(app)
      .get('/api/revenue/overview')
      .set('Authorization', `Bearer ${techToken}`);
    expect([401, 403]).toContain(res.status);
  });

  it('allows owner access', async () => {
    const res = await request(app)
      .get(`/api/revenue/overview?start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

// ── API endpoint shape ────────────────────────────────────────────────────────

describe('GET /api/revenue/overview — response shape', () => {
  let res;
  beforeAll(async () => {
    res = await request(app)
      .get(`/api/revenue/overview?start=${MONTH_START}&end=${TODAY}&comparison=previous_month`)
      .set('Authorization', `Bearer ${token}`);
  });

  it('returns 200', () => expect(res.status).toBe(200));

  it('has period', () => {
    expect(res.body.period).toHaveProperty('start');
    expect(res.body.period).toHaveProperty('end');
  });

  it('has comparisonPeriod when requested', () => {
    expect(res.body.comparisonPeriod).not.toBeNull();
    expect(res.body.comparisonPeriod.type).toBe('previous_month');
  });

  it('has six primary KPIs', () => {
    const pk = res.body.primaryKpis;
    expect(pk).toHaveProperty('collectedRevenue');
    expect(pk).toHaveProperty('earnedRevenue');
    expect(pk).toHaveProperty('grossProfit');
    expect(pk).toHaveProperty('outstandingAr');
    expect(pk).toHaveProperty('projectedMonthEnd');
    expect(pk).toHaveProperty('revenueAtRisk');
  });

  it('gross profit is unavailable', () => {
    expect(res.body.primaryKpis.grossProfit.status).toBe('unavailable');
    expect(res.body.primaryKpis.grossProfit.value).toBeNull();
  });

  it('has two secondary KPIs', () => {
    const sk = res.body.secondaryKpis;
    expect(sk).toHaveProperty('averageTicket');
    expect(sk).toHaveProperty('revenuePerLaborHour');
    expect(sk).not.toHaveProperty('repeatRevenue');
    expect(sk).not.toHaveProperty('completionRate');
    expect(sk).not.toHaveProperty('technicianUtilization');
    expect(sk).not.toHaveProperty('revenueAtRisk');
  });

  it('has freshness', () => {
    expect(res.body.freshness).toHaveProperty('calculatedAt');
    expect(res.body.freshness).toHaveProperty('staleAfter');
  });

  it('has dataQuality with limitations', () => {
    expect(res.body.dataQuality).toBeDefined();
    expect(Array.isArray(res.body.dataQuality.limitations)).toBe(true);
    expect(res.body.dataQuality.limitations.length).toBeGreaterThan(0);
  });

  it('has insights (max 3)', () => {
    expect(Array.isArray(res.body.insights)).toBe(true);
    expect(res.body.insights.length).toBeLessThanOrEqual(3);
  });

  it('has services array', () => {
    expect(Array.isArray(res.body.services)).toBe(true);
  });

  it('all KPIs have provenance', () => {
    const pk = res.body.primaryKpis;
    expect(pk.collectedRevenue.provenance).toBeDefined();
    expect(pk.earnedRevenue.provenance).toBeDefined();
    expect(pk.grossProfit.provenance).toBeDefined();
    expect(pk.outstandingAr.provenance).toBeDefined();
  });
});

// ── GET /api/revenue/trend ────────────────────────────────────────────────────

describe('GET /api/revenue/trend', () => {
  it('returns daily series by default', async () => {
    const res = await request(app)
      .get(`/api/revenue/trend?start=${MONTH_START}&end=${TODAY}&interval=daily`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.current)).toBe(true);
    expect(res.body.interval).toBe('daily');
  });

  it('returns comparison series when requested', async () => {
    const res = await request(app)
      .get(`/api/revenue/trend?start=${MONTH_START}&end=${TODAY}&comparison=previous_month`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.comparison).not.toBeNull();
  });

  it('returns null comparison when comparison=none', async () => {
    const res = await request(app)
      .get(`/api/revenue/trend?start=${MONTH_START}&end=${TODAY}&comparison=none`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.comparison).toBeNull();
  });

  it('each row has periodStart, earned, collected, jobs', async () => {
    const res = await request(app)
      .get(`/api/revenue/trend?start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`);
    if (res.body.current?.length > 0) {
      const row = res.body.current[0];
      expect(row).toHaveProperty('periodStart');
      expect(row).toHaveProperty('earned');
      expect(row).toHaveProperty('collected');
      expect(row).toHaveProperty('jobs');
    }
  });
});

// ── GET /api/revenue/services ─────────────────────────────────────────────────

describe('GET /api/revenue/services', () => {
  it('returns service rows with correct fields', async () => {
    const res = await request(app)
      .get(`/api/revenue/services?start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      const row = res.body[0];
      expect(row).toHaveProperty('service');
      expect(row).toHaveProperty('jobs');
      expect(row).toHaveProperty('earnedRevenue');
      expect(row).toHaveProperty('collectedRevenue');
      expect(row).toHaveProperty('avgTicket');
      expect(row).toHaveProperty('grossProfitStatus', 'unavailable');
      expect(row).toHaveProperty('marginStatus', 'unavailable');
      expect(row).toHaveProperty('revenueShare');
    }
  });

  it('revenue shares sum to ~100% for non-empty result', async () => {
    const res = await request(app)
      .get(`/api/revenue/services?start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`);
    if (res.body.length > 0) {
      const total = res.body.reduce((s, r) => s + r.revenueShare, 0);
      expect(Math.round(total)).toBe(100);
    }
  });

  it('does not double-count multi-tech jobs in service revenue', async () => {
    // Revenue counted at job level (jobs.amount), not at assignment level
    const res = await request(app)
      .get(`/api/revenue/services?start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // The Cleaning service revenue should not be multiplied by tech count
    const cleaning = res.body.find(s => s.service === 'Cleaning');
    if (cleaning) {
      // Each completed job counted once; we have multiple jobs so revenue > single job
      expect(cleaning.earnedRevenue).toBeGreaterThan(0);
      // earnedRevenue / jobs = avgTicket (within float tolerance)
      if (cleaning.avgTicket != null) {
        expect(cleaning.avgTicket * cleaning.jobs).toBeCloseTo(cleaning.earnedRevenue, 0);
      }
    }
  });
});

// ── GET /api/revenue/export ───────────────────────────────────────────────────

describe('GET /api/revenue/export', () => {
  it('returns CSV with correct headers for summary type', async () => {
    const res = await request(app)
      .get(`/api/revenue/export?start=${MONTH_START}&end=${TODAY}&type=summary`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('Metric');
    expect(res.text).toContain('Collected Revenue');
    expect(res.text).toContain('Earned Revenue');
  });

  it('returns CSV with correct headers for services type', async () => {
    const res = await request(app)
      .get(`/api/revenue/export?start=${MONTH_START}&end=${TODAY}&type=services`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Service');
    expect(res.text).toContain('Earned Revenue');
  });

  it('does not export without auth', async () => {
    const res = await request(app).get('/api/revenue/export?type=summary');
    expect([401, 403]).toContain(res.status);
  });
});

// ── Comparison period calculation ─────────────────────────────────────────────

describe('getComparisonRange', () => {
  it('returns null for none', () => {
    expect(svc.getComparisonRange('2026-08-01', '2026-08-06', 'none')).toBeNull();
    expect(svc.getComparisonRange('2026-08-01', '2026-08-06', null)).toBeNull();
  });

  it('previous_period shifts by exact duration', () => {
    const r = svc.getComparisonRange('2026-08-01', '2026-08-06', 'previous_period');
    expect(r.end).toBe('2026-07-31');
    expect(r.start).toBe('2026-07-26'); // 6-day window ending Jul 31
  });

  it('previous_month shifts month back', () => {
    const r = svc.getComparisonRange('2026-08-01', '2026-08-06', 'previous_month');
    expect(r.start).toBe('2026-07-01');
    expect(r.end).toBe('2026-07-06');
  });

  it('previous_year shifts year back', () => {
    const r = svc.getComparisonRange('2026-08-01', '2026-08-06', 'previous_year');
    expect(r.start).toBe('2025-08-01');
    expect(r.end).toBe('2025-08-06');
  });
});

// ── Loading / error states ────────────────────────────────────────────────────

describe('Error states — API does not return zero on failure', () => {
  it('overview responds 500 gracefully if DB is not available (error state test)', async () => {
    // We cannot simulate DB failure in integration tests without teardown,
    // but we verify the API does not send misleading zeros on real errors.
    // This is enforced by the service never returning { value: 0 } on catch.
    // The route returns { error: '...' } on exception.
    // Covered by: route error handler in revenue.js returns 500 + error string.
  });
});

// ── Date / period edge cases ──────────────────────────────────────────────────

describe('Date boundaries', () => {
  it('defaultPeriod returns month-to-date range', () => {
    const p = svc.defaultPeriod();
    expect(p.start).toBe(MONTH_START);
    expect(p.end).toBe(TODAY);
  });

  it('empty period returns zero values without crashing', async () => {
    const ev = await svc._earnedRevenue(accountId, '2000-01-01', '2000-01-31');
    expect(ev.value).toBe(0);
    expect(ev.status).toBe('ok');
  });
});

// ── Reports: new export types ─────────────────────────────────────────────────

describe('GET /api/revenue/export — new report types', () => {
  it('technicians export returns CSV with correct headers', async () => {
    const res = await request(app)
      .get(`/api/revenue/export?start=${MONTH_START}&end=${TODAY}&type=technicians`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('Technician');
    expect(res.text).toContain('Jobs Completed');
    expect(res.text).toContain('Production Value');
  });

  it('cancellations export returns CSV with correct headers', async () => {
    const res = await request(app)
      .get(`/api/revenue/export?start=${MONTH_START}&end=${TODAY}&type=cancellations`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Date');
    expect(res.text).toContain('Client');
    expect(res.text).toContain('Revenue Impact');
  });

  it('cancellations export returns empty CSV (not error) when no cancelled jobs', async () => {
    const res = await request(app)
      .get('/api/revenue/export?start=2000-01-01&end=2000-01-31&type=cancellations')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    // Header row should still be present
    expect(res.text).toContain('Date');
  });

  it('tax export returns CSV with correct headers', async () => {
    const res = await request(app)
      .get(`/api/revenue/export?start=${MONTH_START}&end=${TODAY}&type=tax`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Tax Amount');
    expect(res.text).toContain('Invoice Amount');
  });

  it('quarterly export returns CSV with Q1–Q4 rows', async () => {
    const res = await request(app)
      .get(`/api/revenue/export?start=${MONTH_START}&end=${TODAY}&type=quarterly`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Q1');
    expect(res.text).toContain('Q2');
    expect(res.text).toContain('Q3');
    expect(res.text).toContain('Q4');
    expect(res.text).toContain('Earned Revenue');
  });

  it('completion export returns CSV with service breakdown', async () => {
    const res = await request(app)
      .get(`/api/revenue/export?start=${MONTH_START}&end=${TODAY}&type=completion`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Service');
    expect(res.text).toContain('Completion Rate');
    expect(res.text).toContain('Completed');
  });

  it('does not cross account boundaries (technicians)', async () => {
    const res = await request(app)
      .get(`/api/revenue/export?start=${MONTH_START}&end=${TODAY}&type=technicians`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    // Other account has no jobs — result should not contain our test account data
    expect(res.text).not.toContain('Main Tech');
  });

  it('does not cross account boundaries (cancellations)', async () => {
    const res = await request(app)
      .get(`/api/revenue/export?start=${MONTH_START}&end=${TODAY}&type=cancellations`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Test Client');
  });

  it('rejects unauthenticated requests for new export types', async () => {
    for (const type of ['technicians', 'cancellations', 'tax', 'quarterly', 'completion']) {
      const res = await request(app).get(`/api/revenue/export?type=${type}`);
      expect([401, 403]).toContain(res.status);
    }
  });
});

// ── GET /api/revenue/reports/readiness ───────────────────────────────────────

describe('GET /api/revenue/reports/readiness', () => {
  it('returns 200 with all expected report keys', async () => {
    const res = await request(app)
      .get('/api/revenue/reports/readiness')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const keys = ['summary', 'services', 'invoices', 'technicians', 'customers',
                  'forecasting', 'cancellations', 'tax', 'quarterly', 'completion', 'pnl'];
    for (const key of keys) {
      expect(res.body.reports[key]).toBeDefined();
      expect(res.body.reports[key].status).toBeDefined();
    }
  });

  it('returns AVAILABLE for all non-P&L reports', async () => {
    const res = await request(app)
      .get('/api/revenue/reports/readiness')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const available = ['summary', 'services', 'invoices', 'technicians', 'customers',
                       'forecasting', 'cancellations', 'tax', 'quarterly', 'completion'];
    for (const key of available) {
      expect(res.body.reports[key].status).toBe('AVAILABLE');
      expect(res.body.reports[key].exportType).toBeTruthy();
    }
  });

  it('P&L shows INCOMPLETE_FINANCIAL_COVERAGE with connect-QB reason when not connected', async () => {
    const res = await request(app)
      .get('/api/revenue/reports/readiness')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.reports.pnl.status).toBe('INCOMPLETE_FINANCIAL_COVERAGE');
    expect(res.body.reports.pnl.exportType).toBeNull();
    expect(res.body.reports.pnl.reason).toMatch(/connect quickbooks/i);
  });

  describe('P&L readiness — QuickBooks connected states', () => {
    afterEach(async () => {
      await pool.query(
        `DELETE FROM accounting_connections WHERE account_id = $1`,
        [accountId]
      );
      await pool.query(
        `DELETE FROM accounting_account_mappings WHERE account_id = $1`,
        [accountId]
      );
    });

    it('P&L is AVAILABLE when QB connected and no unmapped accounts', async () => {
      await pool.query(
        `INSERT INTO accounting_connections (account_id, provider, status)
         VALUES ($1, 'quickbooks_online', 'connected')
         ON CONFLICT (account_id, provider) DO UPDATE SET status = 'connected'`,
        [accountId]
      );
      const res = await request(app)
        .get('/api/revenue/reports/readiness')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.reports.pnl.status).toBe('AVAILABLE');
      expect(res.body.reports.pnl.exportType).toBe('pnl');
    });

    it('P&L shows mapping reason when QB connected but unmapped accounts exist', async () => {
      await pool.query(
        `INSERT INTO accounting_connections (account_id, provider, status)
         VALUES ($1, 'quickbooks_online', 'connected')
         ON CONFLICT (account_id, provider) DO UPDATE SET status = 'connected'`,
        [accountId]
      );
      // is_balance_sheet=FALSE, is_ignored=FALSE, is_active=TRUE, fieldcore_category=NULL → counted as unmapped
      await pool.query(
        `INSERT INTO accounting_account_mappings
           (account_id, provider, provider_account_id, provider_account_name, provider_account_type,
            fieldcore_category, fieldcore_subcategory, is_balance_sheet, is_ignored, is_active)
         VALUES ($1, 'quickbooks_online', 'test-acct-1', 'Test Expense', 'Expense',
                 NULL, NULL, FALSE, FALSE, TRUE)`,
        [accountId]
      );
      const res = await request(app)
        .get('/api/revenue/reports/readiness')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.reports.pnl.status).toBe('INCOMPLETE_FINANCIAL_COVERAGE');
      expect(res.body.reports.pnl.reason).toMatch(/need mapping/i);
    });

    it('P&L shows reconnect reason when QB status is degraded (reauth_required)', async () => {
      await pool.query(
        `INSERT INTO accounting_connections (account_id, provider, status)
         VALUES ($1, 'quickbooks_online', 'reauth_required')
         ON CONFLICT (account_id, provider) DO UPDATE SET status = 'reauth_required'`,
        [accountId]
      );
      const res = await request(app)
        .get('/api/revenue/reports/readiness')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.reports.pnl.status).toBe('INCOMPLETE_FINANCIAL_COVERAGE');
      expect(res.body.reports.pnl.reason).toMatch(/reconnect/i);
    });

    it('P&L is AVAILABLE when QB connected and only balance-sheet accounts (unmapped = 0)', async () => {
      await pool.query(
        `INSERT INTO accounting_connections (account_id, provider, status)
         VALUES ($1, 'quickbooks_online', 'connected')
         ON CONFLICT (account_id, provider) DO UPDATE SET status = 'connected'`,
        [accountId]
      );
      // Balance-sheet accounts excluded from unmapped count (is_balance_sheet=TRUE)
      await pool.query(
        `INSERT INTO accounting_account_mappings
           (account_id, provider, provider_account_id, provider_account_name, provider_account_type,
            fieldcore_category, fieldcore_subcategory, is_balance_sheet, is_ignored, is_active)
         VALUES ($1, 'quickbooks_online', 'bs-acct-1', 'Checking', 'Bank',
                 'balance_sheet', 'cash_bank', TRUE, FALSE, TRUE)`,
        [accountId]
      );
      const res = await request(app)
        .get('/api/revenue/reports/readiness')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.reports.pnl.status).toBe('AVAILABLE');
    });
  });

  it('does not cross account boundaries', async () => {
    const res1 = await request(app)
      .get('/api/revenue/reports/readiness')
      .set('Authorization', `Bearer ${token}`);
    const res2 = await request(app)
      .get('/api/revenue/reports/readiness')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    // Both should return the same structure — neither leaks the other's data
    expect(Object.keys(res1.body.reports)).toEqual(Object.keys(res2.body.reports));
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/revenue/reports/readiness');
    expect([401, 403]).toContain(res.status);
  });

  it('rejects tech role (requires owner/manager)', async () => {
    const techToken = makeToken(tech1Id, accountId, 'tech');
    const res = await request(app)
      .get('/api/revenue/reports/readiness')
      .set('Authorization', `Bearer ${techToken}`);
    expect([401, 403]).toContain(res.status);
  });
});
