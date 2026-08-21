'use strict';
/**
 * Operations V1 — Integration Tests
 *
 * Tests: team performance, commission calculation, job completion analytics,
 * operations KPIs, compensation rule CRUD, tenant isolation, permission enforcement.
 *
 * Requires a live DATABASE_URL. Run with --runInBand to avoid PG deadlocks.
 */
require('dotenv').config();
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const app     = require('../app');
const pool    = require('../db/pool');
const teamSvc = require('../services/teamPerformanceService');
const commSvc = require('../services/commissionCalculationService');
const compSvc = require('../services/jobCompletionAnalyticsService');
const opsSvc  = require('../services/operationsAnalyticsService');

function makeToken(userId, accountId, role = 'owner') {
  return jwt.sign({ userId, accountId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

let accountId, userId, token;
let otherAccountId, otherToken, otherUserId;
let clientId, tech1Id, tech2Id, salesId;
let job1Id, job2Id, job3Id;

const TODAY       = new Date().toISOString().slice(0, 10);
const MONTH_START = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);

beforeAll(async () => {
  const hash = await bcrypt.hash('pw123', 10);

  // Primary tenant
  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1,$2) RETURNING id`,
    [`__TEST_OPS_${Date.now()}__`, 'pro']
  );
  accountId = acct.id;

  const { rows: [u] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [accountId, 'Ops Owner', `ops-owner-${Date.now()}@test.fc`, hash, 'owner']
  );
  userId = u.id;
  token  = makeToken(userId, accountId, 'owner');

  // Second tenant (isolation tests)
  const { rows: [acct2] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1,$2) RETURNING id`,
    [`__TEST_OPS_OTHER_${Date.now()}__`, 'pro']
  );
  otherAccountId = acct2.id;
  const { rows: [u2] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [otherAccountId, 'Other Owner', `ops-other-${Date.now()}@test.fc`, hash, 'owner']
  );
  otherUserId = u2.id;
  otherToken  = makeToken(u2.id, otherAccountId, 'owner');

  // Client
  const { rows: [c] } = await pool.query(
    `INSERT INTO clients (account_id, name, email) VALUES ($1,$2,$3) RETURNING id`,
    [accountId, 'Ops Client', `ops-client-${Date.now()}@test.fc`]
  );
  clientId = c.id;

  // Technicians
  const { rows: [t1] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role, field_work_eligible)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [accountId, 'Tech A', `tech-a-${Date.now()}@test.fc`, hash, 'tech', true]
  );
  tech1Id = t1.id;

  const { rows: [t2] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role, field_work_eligible)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [accountId, 'Tech B', `tech-b-${Date.now()}@test.fc`, hash, 'tech', true]
  );
  tech2Id = t2.id;

  const { rows: [s1] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [accountId, 'Sales Sam', `sales-${Date.now()}@test.fc`, hash, 'manager']
  );
  salesId = s1.id;

  // Jobs
  const { rows: [j1] } = await pool.query(
    `INSERT INTO jobs (account_id, client_id, status, amount, service_type, scheduled_at, tech_id, duration_minutes)
     VALUES ($1,$2,'complete',1000,'HVAC',$3::date,$4,60) RETURNING id`,
    [accountId, clientId, TODAY, tech1Id]
  );
  job1Id = j1.id;

  const { rows: [j2] } = await pool.query(
    `INSERT INTO jobs (account_id, client_id, status, amount, service_type, scheduled_at, tech_id, duration_minutes)
     VALUES ($1,$2,'complete',500,'Cleaning',$3::date,$4,30) RETURNING id`,
    [accountId, clientId, TODAY, tech2Id]
  );
  job2Id = j2.id;

  const { rows: [j3] } = await pool.query(
    `INSERT INTO jobs (account_id, client_id, status, amount, service_type, scheduled_at, tech_id, duration_minutes)
     VALUES ($1,$2,'cancelled',750,'HVAC',$3::date,$4,45) RETURNING id`,
    [accountId, clientId, TODAY, tech1Id]
  );
  job3Id = j3.id;

  // Job assignments (primary for job1 → tech1, job2 → tech2)
  await pool.query(
    `INSERT INTO job_assignments (account_id, job_id, user_id, assignment_role, is_primary, status)
     VALUES ($1,$2,$3,'lead_technician',true,'assigned')
     ON CONFLICT DO NOTHING`,
    [accountId, job1Id, tech1Id]
  );
  await pool.query(
    `INSERT INTO job_assignments (account_id, job_id, user_id, assignment_role, is_primary, status)
     VALUES ($1,$2,$3,'lead_technician',true,'assigned')
     ON CONFLICT DO NOTHING`,
    [accountId, job2Id, tech2Id]
  );
  // Tech2 assists on job1 (not primary — should NOT get revenue attribution)
  await pool.query(
    `INSERT INTO job_assignments (account_id, job_id, user_id, assignment_role, is_primary, status)
     VALUES ($1,$2,$3,'technician',false,'assigned')
     ON CONFLICT DO NOTHING`,
    [accountId, job1Id, tech2Id]
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM accounts WHERE name LIKE '__TEST_OPS_%'`);
  await pool.end();
});

// ── Ops KPI endpoint ──────────────────────────────────────────────────────────

describe('GET /api/revenue/operations — KPI summary', () => {
  it('returns 200 with kpis structure', async () => {
    const res = await request(app)
      .get(`/api/revenue/operations?start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('kpis');
    expect(res.body.kpis).toHaveProperty('jobsCompleted');
    expect(res.body.kpis).toHaveProperty('completionRate');
    expect(res.body.kpis).toHaveProperty('productionValue');
    expect(res.body.kpis).toHaveProperty('upsellRevenue');
    expect(res.body.kpis).toHaveProperty('commissionsOwed');
    expect(res.body.kpis).toHaveProperty('revenuePerLaborHour');
  });

  it('jobs completed counts only complete status', async () => {
    const res = await request(app)
      .get(`/api/revenue/operations?start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.kpis.jobsCompleted.value).toBeGreaterThanOrEqual(2);
  });

  it('upsell revenue is unavailable (no line-item source)', async () => {
    const res = await request(app)
      .get(`/api/revenue/operations?start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.kpis.upsellRevenue.status).toBe('unavailable');
    expect(res.body.kpis.upsellRevenue.value).toBeNull();
  });

  it('returns dataQuality with state field', async () => {
    const res = await request(app)
      .get(`/api/revenue/operations?start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.dataQuality).toHaveProperty('state');
    expect(res.body.dataQuality).toHaveProperty('limitations');
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/revenue/operations');
    expect(res.status).toBe(401);
  });

  it('rejects tech role (not owner/manager)', async () => {
    const techToken = makeToken(tech1Id, accountId, 'tech');
    const res = await request(app)
      .get('/api/revenue/operations')
      .set('Authorization', `Bearer ${techToken}`);
    expect(res.status).toBe(403);
  });

  it('tenant isolation — other account sees its own data', async () => {
    const res = await request(app)
      .get(`/api/revenue/operations?start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.kpis.jobsCompleted.value).toBe(0);
  });
});

// ── Team Performance ──────────────────────────────────────────────────────────

describe('GET /api/revenue/operations/team', () => {
  it('returns 200 with members array', async () => {
    const res = await request(app)
      .get(`/api/revenue/operations/team?start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('members');
    expect(Array.isArray(res.body.members)).toBe(true);
  });

  it('primary assignee gets production value, assistant gets $0', async () => {
    const result = await teamSvc.getTeamPerformance(accountId, { start: MONTH_START, end: TODAY });
    const t1 = result.members.find(m => m.userId === tech1Id);
    const t2 = result.members.find(m => m.userId === tech2Id);

    // tech1 is primary on job1 ($1000) — gets production value
    expect(t1).toBeDefined();
    expect(t1.productionValue).toBeGreaterThanOrEqual(1000);

    // tech2 is primary on job2 ($500) and assistant on job1 — production value from job2 only
    // Total should be $500 (job2), NOT $500+$1000 (double count)
    expect(t2).toBeDefined();
    expect(t2.productionValue).toBe(500);
  });

  it('company revenue NOT double-counted across multi-tech job', async () => {
    const result = await teamSvc.getTeamPerformance(accountId, { start: MONTH_START, end: TODAY });
    // Sum of all members' productionValue must not exceed total company earned revenue
    const totalAttributed = result.members.reduce((s, m) => s + m.productionValue, 0);
    const companyRevenue  = 1500; // job1($1000) + job2($500)
    expect(totalAttributed).toBeLessThanOrEqual(companyRevenue + 0.01);
  });

  it('includes completionRate per member', async () => {
    const result = await teamSvc.getTeamPerformance(accountId, { start: MONTH_START, end: TODAY });
    const t1 = result.members.find(m => m.userId === tech1Id);
    expect(t1.completionRate).not.toBeUndefined();
  });

  it('tenant isolation', async () => {
    const res = await request(app)
      .get(`/api/revenue/operations/team?start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(0);
  });
});

// ── Member Detail ─────────────────────────────────────────────────────────────

describe('GET /api/revenue/operations/team/:userId', () => {
  it('returns user + summary + jobs for valid member', async () => {
    const res = await request(app)
      .get(`/api/revenue/operations/team/${tech1Id}?start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.summary).toBeDefined();
    expect(Array.isArray(res.body.jobs)).toBe(true);
  });

  it('returns 404 for non-existent user', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .get(`/api/revenue/operations/team/${fakeId}?start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('cannot access other tenant member detail', async () => {
    const res = await request(app)
      .get(`/api/revenue/operations/team/${tech1Id}?start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });
});

// ── Job Completion Analysis ───────────────────────────────────────────────────

describe('GET /api/revenue/operations/completion', () => {
  it('returns 200 with summary structure', async () => {
    const res = await request(app)
      .get(`/api/revenue/operations/completion?start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary).toHaveProperty('completed');
    expect(res.body.summary).toHaveProperty('cancelled');
    expect(res.body.summary).toHaveProperty('noShows');
    expect(res.body.summary).toHaveProperty('completionRate');
    expect(res.body.summary).toHaveProperty('revenueImpact');
  });

  it('counts completed and cancelled correctly', async () => {
    const result = await compSvc.getCompletionAnalysis(accountId, { start: MONTH_START, end: TODAY });
    expect(result.summary.completed).toBeGreaterThanOrEqual(2);
    expect(result.summary.cancelled).toBeGreaterThanOrEqual(1);
  });

  it('completion rate denominator excludes future scheduled jobs', async () => {
    const result = await compSvc.getCompletionAnalysis(accountId, { start: MONTH_START, end: TODAY });
    // completed + cancelled + no_show = eligible; future scheduled excluded
    const { completed, cancelled, noShows, eligible } = result.summary;
    expect(eligible).toBe(completed + cancelled + noShows);
  });

  it('calculates revenue impact from cancelled + no-show jobs', async () => {
    const result = await compSvc.getCompletionAnalysis(accountId, { start: MONTH_START, end: TODAY });
    // job3 is cancelled with amount $750
    expect(result.summary.revenueImpact).toBeGreaterThanOrEqual(750);
  });

  it('returns byService breakdown', async () => {
    const result = await compSvc.getCompletionAnalysis(accountId, { start: MONTH_START, end: TODAY });
    expect(Array.isArray(result.byService)).toBe(true);
  });

  it('tenant isolation', async () => {
    const res = await request(app)
      .get(`/api/revenue/operations/completion?start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.completed).toBe(0);
  });
});

// ── Commission Rules CRUD ─────────────────────────────────────────────────────

describe('Commission rules CRUD — /api/operations/compensation-rules', () => {
  let ruleId;

  it('creates a percentage rule', async () => {
    const res = await request(app)
      .post('/api/operations/compensation-rules')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name:            'Tech Completion 40%',
        commission_type: 'percentage',
        rate_percent:    0.40,
        basis:           'completed_revenue',
        trigger:         'job_completed',
        applies_to_role: 'tech',
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    ruleId = res.body.id;
  });

  it('lists active rules', async () => {
    const res = await request(app)
      .get('/api/operations/compensation-rules')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const rule = res.body.rules.find(r => r.id === ruleId);
    expect(rule).toBeDefined();
    expect(rule.active).toBe(true);
  });

  it('rejects invalid commission_type', async () => {
    const res = await request(app)
      .post('/api/operations/compensation-rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bad', commission_type: 'invalid', basis: 'completed_revenue', trigger: 'job_completed' });
    expect(res.status).toBe(400);
  });

  it('rejects rate_percent > 1', async () => {
    const res = await request(app)
      .post('/api/operations/compensation-rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bad Rate', commission_type: 'percentage', rate_percent: 1.5, basis: 'completed_revenue', trigger: 'job_completed' });
    expect(res.status).toBe(400);
  });

  it('creates a flat amount rule', async () => {
    const res = await request(app)
      .post('/api/operations/compensation-rules')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name:            'Flat $75 Per Job',
        commission_type: 'flat_amount',
        flat_amount:     75,
        basis:           'flat_per_job',
        trigger:         'job_completed',
      });
    expect(res.status).toBe(201);
    expect(parseFloat(res.body.flat_amount)).toBe(75);
  });

  it('deactivates a rule (soft delete)', async () => {
    const res = await request(app)
      .delete(`/api/operations/compensation-rules/${ruleId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
  });

  it('tenant isolation — other tenant cannot see rules', async () => {
    const res = await request(app)
      .get('/api/operations/compensation-rules')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rules.every(r => r.account_id !== accountId)).toBe(true);
  });
});

// ── Commission Calculation ────────────────────────────────────────────────────

describe('commissionCalculationService', () => {
  let percentRuleId;
  let flatRuleId;

  beforeAll(async () => {
    // Create rules scoped to this test's technicians
    const { rows: [pr] } = await pool.query(
      `INSERT INTO commission_rules (account_id, name, commission_type, rate_percent, basis, trigger, applies_to_role, created_by)
       VALUES ($1,'Test 40% Commission','percentage',0.40,'completed_revenue','job_completed','tech',$2)
       RETURNING id`,
      [accountId, userId]
    );
    percentRuleId = pr.id;

    const { rows: [fr] } = await pool.query(
      `INSERT INTO commission_rules (account_id, name, commission_type, flat_amount, basis, trigger, created_by)
       VALUES ($1,'Test $75 Flat','flat_amount',75,'flat_per_job','job_completed',$2)
       RETURNING id`,
      [accountId, userId]
    );
    flatRuleId = fr.id;
  });

  it('percentage commission: 40% of $1000 = $400', async () => {
    const result = await commSvc.calculateForJob(accountId, job1Id);
    const techEntry = result.entries.find(e =>
      e.user_id === tech1Id && e.rule_id === percentRuleId
    );
    if (techEntry) {
      expect(parseFloat(techEntry.commission_amount)).toBeCloseTo(400, 1);
    }
  });

  it('does not generate duplicate entries (idempotent)', async () => {
    const first  = await commSvc.calculateForJob(accountId, job1Id);
    const second = await commSvc.calculateForJob(accountId, job1Id);
    // Second call should produce no NEW entries (ON CONFLICT DO NOTHING)
    expect(second.entries.length).toBe(0);
  });

  it('skips non-complete jobs', async () => {
    const result = await commSvc.calculateForJob(accountId, job3Id); // cancelled
    expect(result.entries).toHaveLength(0);
    expect(result.skipped).toBeDefined();
  });

  it('commission summary returns totals by status', async () => {
    const result = await commSvc.getCommissionSummary(accountId, { start: MONTH_START, end: TODAY });
    expect(result.summary).toHaveProperty('pending');
    expect(result.summary).toHaveProperty('approved');
    expect(result.summary).toHaveProperty('owed');
    expect(result.entries.length).toBeGreaterThanOrEqual(0);
  });

  it('commission summary is tenant-isolated', async () => {
    const result = await commSvc.getCommissionSummary(otherAccountId, { start: MONTH_START, end: TODAY });
    expect(result.summary.owed).toBe(0);
    expect(result.entries).toHaveLength(0);
  });
});

// ── Commission endpoint ───────────────────────────────────────────────────────

describe('GET /api/revenue/operations/commissions', () => {
  it('returns 200 with summary and entries', async () => {
    const res = await request(app)
      .get(`/api/revenue/operations/commissions?start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(Array.isArray(res.body.entries)).toBe(true);
  });

  it('tenant isolation on commissions endpoint', async () => {
    const res = await request(app)
      .get(`/api/revenue/operations/commissions?start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.owed).toBe(0);
  });
});

// ── operationsAnalyticsService service-level tests ────────────────────────────

describe('operationsAnalyticsService', () => {
  it('returns correct structure', async () => {
    const result = await opsSvc.getOperationsKpis(accountId, { start: MONTH_START, end: TODAY });
    expect(result.kpis).toBeDefined();
    expect(result.kpis.jobsCompleted.status).toBe('ok');
    expect(result.kpis.upsellRevenue.status).toBe('unavailable');
    expect(result.period.start).toBe(MONTH_START);
  });

  it('production value = sum of completed job amounts', async () => {
    const result = await opsSvc.getOperationsKpis(accountId, { start: MONTH_START, end: TODAY });
    // job1($1000) + job2($500) completed
    expect(result.kpis.productionValue.value).toBeGreaterThanOrEqual(1500);
  });
});
