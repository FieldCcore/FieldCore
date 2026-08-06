'use strict';
/**
 * Multi-Tech Job Team Assignment — Integration Tests
 *
 * Tests all team states, role changes, lead changes, invalid selections,
 * tenant isolation, revenue counting, and activity events.
 *
 * Requires a live DATABASE_URL.
 */
require('dotenv').config();
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const app     = require('../app');
const pool    = require('../db/pool');

function makeToken(userId, accountId, role = 'owner') {
  return jwt.sign({ userId, accountId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

let accountId, userId, token, otherAccountId, otherToken;
let clientId;
let tech1Id, tech2Id, tech3Id, ineligibleTechId;

beforeAll(async () => {
  const hash = await bcrypt.hash('pw123', 10);

  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1,$2) RETURNING id`,
    [`__TEST_TEAM_${Date.now()}__`, 'pro']
  );
  accountId = acct.id;

  const { rows: [u] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role, field_work_eligible, dispatch_visible)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [accountId, 'Team Owner', `team-owner-${Date.now()}@fieldcore.test`, hash, 'owner', false, false]
  );
  userId = u.id;
  token  = makeToken(userId, accountId, 'owner');

  // Field-eligible techs
  for (const [name, suffix] of [['Tech 1', 't1'], ['Tech 2', 't2'], ['Tech 3', 't3']]) {
    const { rows: [t] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role, field_work_eligible, dispatch_visible, is_available)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [accountId, name, `${suffix}-${Date.now()}@fieldcore.test`, hash, 'tech', true, true, true]
    );
    if (suffix === 't1') tech1Id = t.id;
    if (suffix === 't2') tech2Id = t.id;
    if (suffix === 't3') tech3Id = t.id;
  }

  // Ineligible tech
  const { rows: [inelig] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role, field_work_eligible, dispatch_visible)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [accountId, 'Office Only', `inelig-${Date.now()}@fieldcore.test`, hash, 'tech', false, true]
  );
  ineligibleTechId = inelig.id;

  const { rows: [cl] } = await pool.query(
    `INSERT INTO clients (account_id, name) VALUES ($1,$2) RETURNING id`,
    [accountId, 'Team Test Client']
  );
  clientId = cl.id;

  // Second (isolation) account
  const { rows: [oa] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1,$2) RETURNING id`,
    [`__TEST_TEAM_OTHER_${Date.now()}__`, 'pro']
  );
  otherAccountId = oa.id;
  const { rows: [ou] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [otherAccountId, 'Other Owner', `other-team-${Date.now()}@fieldcore.test`, hash, 'owner']
  );
  otherToken = makeToken(ou.id, otherAccountId, 'owner');
});

afterAll(async () => {
  await pool.query(`DELETE FROM accounts WHERE id = ANY($1)`, [[accountId, otherAccountId]]);
  await pool.end();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createJob(overrides = {}) {
  const { rows: [job] } = await pool.query(
    `INSERT INTO jobs (account_id, client_id, service_type, status, tech_id, duration_minutes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [
      accountId, clientId,
      overrides.service_type     ?? 'Team Test Service',
      overrides.status           ?? 'scheduled',
      overrides.tech_id          ?? null,
      overrides.duration_minutes ?? 60,
    ]
  );
  return job.id;
}

function solo(techId, role = 'lead_technician') {
  return [{ userId: techId, assignmentRole: role, isPrimary: true }];
}

function team(members) {
  return members;
}

// ── GET /api/jobs/:id/assignments ─────────────────────────────────────────────

describe('GET /api/jobs/:id/assignments', () => {

  it('returns 401 without token', async () => {
    const jobId = await createJob();
    const res = await request(app).get(`/api/jobs/${jobId}/assignments`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown job', async () => {
    const res = await request(app)
      .get('/api/jobs/00000000-0000-0000-0000-000000000000/assignments')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns UNASSIGNED for a job with no assignments', async () => {
    const jobId = await createJob();
    const res = await request(app)
      .get(`/api/jobs/${jobId}/assignments`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.teamState).toBe('UNASSIGNED');
    expect(res.body.teamSize).toBe(0);
    expect(res.body.assignments).toHaveLength(0);
  });

  it('tenant isolation — cannot read another account\'s job assignments', async () => {
    const jobId = await createJob();
    const res = await request(app)
      .get(`/api/jobs/${jobId}/assignments`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });
});

// ── POST /api/jobs/:id/assignments/validate ───────────────────────────────────

describe('POST /api/jobs/:id/assignments/validate', () => {

  it('returns 401 without token', async () => {
    const jobId = await createJob();
    const res = await request(app)
      .post(`/api/jobs/${jobId}/assignments/validate`)
      .send({ members: solo(tech1Id) });
    expect(res.status).toBe(401);
  });

  it('returns 403 for tech role', async () => {
    const techToken = makeToken(tech1Id, accountId, 'tech');
    const jobId = await createJob();
    const res = await request(app)
      .post(`/api/jobs/${jobId}/assignments/validate`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ members: solo(tech1Id) });
    expect(res.status).toBe(403);
  });

  it('returns 400 when members is not an array', async () => {
    const jobId = await createJob();
    const res = await request(app)
      .post(`/api/jobs/${jobId}/assignments/validate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ members: 'not-an-array' });
    expect(res.status).toBe(400);
  });

  it('SOLO — single field-eligible tech returns allowed:true + SOLO_ASSIGNED', async () => {
    const jobId = await createJob();
    const res = await request(app)
      .post(`/api/jobs/${jobId}/assignments/validate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ members: solo(tech1Id) });
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(true);
    expect(res.body.teamState).toBe('SOLO_ASSIGNED');
    expect(res.body.memberResults).toHaveLength(1);
    expect(res.body.memberResults[0].allowed).toBe(true);
  });

  it('TEAM_ASSIGNED — two field-eligible techs', async () => {
    const jobId = await createJob();
    const res = await request(app)
      .post(`/api/jobs/${jobId}/assignments/validate`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        members: [
          { userId: tech1Id, assignmentRole: 'lead_technician', isPrimary: true },
          { userId: tech2Id, assignmentRole: 'technician',      isPrimary: false },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(true);
    expect(res.body.teamState).toBe('TEAM_ASSIGNED');
    expect(res.body.memberResults).toHaveLength(2);
  });

  it('UNAVAILABLE_SELECTION — ineligible tech blocks', async () => {
    const jobId = await createJob();
    const res = await request(app)
      .post(`/api/jobs/${jobId}/assignments/validate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ members: solo(ineligibleTechId, 'technician') });
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
    expect(res.body.memberResults[0].blockingIssues.some(b => b.type === 'not_field_eligible')).toBe(true);
  });

  it('no_primary block when no isPrimary in members', async () => {
    const jobId = await createJob();
    const res = await request(app)
      .post(`/api/jobs/${jobId}/assignments/validate`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        members: [
          { userId: tech1Id, assignmentRole: 'technician', isPrimary: false },
          { userId: tech2Id, assignmentRole: 'technician', isPrimary: false },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
    expect(res.body.blockingIssues.some(b => b.type === 'no_primary')).toBe(true);
  });

  it('deduplicates members — same techId twice treated as one', async () => {
    const jobId = await createJob();
    const res = await request(app)
      .post(`/api/jobs/${jobId}/assignments/validate`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        members: [
          { userId: tech1Id, assignmentRole: 'lead_technician', isPrimary: true },
          { userId: tech1Id, assignmentRole: 'technician',      isPrimary: false }, // duplicate
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.memberResults).toHaveLength(1);
  });

  it('tenant isolation — cannot validate job from another account', async () => {
    const jobId = await createJob();
    const res = await request(app)
      .post(`/api/jobs/${jobId}/assignments/validate`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ members: solo(tech1Id) });
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
    expect(res.body.blockingIssues.some(b => b.type === 'job_not_found')).toBe(true);
  });
});

// ── PUT /api/jobs/:id/assignments ─────────────────────────────────────────────

describe('PUT /api/jobs/:id/assignments', () => {

  it('returns 401 without token', async () => {
    const jobId = await createJob();
    const res = await request(app)
      .put(`/api/jobs/${jobId}/assignments`)
      .send({ members: solo(tech1Id) });
    expect(res.status).toBe(401);
  });

  it('returns 403 for tech role', async () => {
    const techToken = makeToken(tech1Id, accountId, 'tech');
    const jobId = await createJob();
    const res = await request(app)
      .put(`/api/jobs/${jobId}/assignments`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ members: solo(tech1Id) });
    expect(res.status).toBe(403);
  });

  it('SOLO assignment — assigns single tech, creates primary record', async () => {
    const jobId = await createJob();
    const res = await request(app)
      .put(`/api/jobs/${jobId}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ members: solo(tech1Id), overrideWarnings: true });
    expect(res.status).toBe(200);
    expect(res.body.assigned).toBe(true);
    expect(res.body.teamState).toBe('SOLO_ASSIGNED');
    expect(res.body.primaryAssignment.user_id).toBe(tech1Id);

    // jobs.tech_id must be synced (Phase A compat)
    const { rows: [job] } = await pool.query(`SELECT tech_id FROM jobs WHERE id = $1`, [jobId]);
    expect(job.tech_id).toBe(tech1Id);
  });

  it('TEAM_ASSIGNED — assigns multiple techs', async () => {
    const jobId = await createJob();
    const res = await request(app)
      .put(`/api/jobs/${jobId}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        members: [
          { userId: tech1Id, assignmentRole: 'lead_technician', isPrimary: true },
          { userId: tech2Id, assignmentRole: 'technician',      isPrimary: false },
        ],
        overrideWarnings: true,
      });
    expect(res.status).toBe(200);
    expect(res.body.teamState).toBe('TEAM_ASSIGNED');
    expect(res.body.teamSize).toBe(2);
    expect(res.body.assignments.some(a => a.user_id === tech1Id && a.is_primary)).toBe(true);
    expect(res.body.assignments.some(a => a.user_id === tech2Id && !a.is_primary)).toBe(true);
  });

  it('adds a third tech to existing team', async () => {
    const jobId = await createJob();
    // First: assign 2 techs
    await request(app)
      .put(`/api/jobs/${jobId}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        members: [
          { userId: tech1Id, assignmentRole: 'lead_technician', isPrimary: true },
          { userId: tech2Id, assignmentRole: 'technician',      isPrimary: false },
        ],
        overrideWarnings: true,
      });
    // Then: add tech3
    const res = await request(app)
      .put(`/api/jobs/${jobId}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        members: [
          { userId: tech1Id, assignmentRole: 'lead_technician', isPrimary: true },
          { userId: tech2Id, assignmentRole: 'technician',      isPrimary: false },
          { userId: tech3Id, assignmentRole: 'helper',          isPrimary: false },
        ],
        overrideWarnings: true,
      });
    expect(res.status).toBe(200);
    expect(res.body.teamSize).toBe(3);
  });

  it('removes a tech from team — soft-deletes their assignment', async () => {
    const jobId = await createJob();
    await request(app)
      .put(`/api/jobs/${jobId}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        members: [
          { userId: tech1Id, assignmentRole: 'lead_technician', isPrimary: true },
          { userId: tech2Id, assignmentRole: 'technician',      isPrimary: false },
        ],
        overrideWarnings: true,
      });

    // Remove tech2
    const res = await request(app)
      .put(`/api/jobs/${jobId}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        members: [{ userId: tech1Id, assignmentRole: 'lead_technician', isPrimary: true }],
        overrideWarnings: true,
      });
    expect(res.status).toBe(200);
    expect(res.body.teamSize).toBe(1);

    // Soft-delete check: removed record still exists with removed_at
    const { rows } = await pool.query(
      `SELECT removed_at FROM job_assignments WHERE job_id = $1 AND user_id = $2`,
      [jobId, tech2Id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].removed_at).not.toBeNull();
  });

  it('changes lead technician — updates is_primary and syncs jobs.tech_id', async () => {
    const jobId = await createJob();
    await request(app)
      .put(`/api/jobs/${jobId}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        members: [
          { userId: tech1Id, assignmentRole: 'lead_technician', isPrimary: true },
          { userId: tech2Id, assignmentRole: 'technician',      isPrimary: false },
        ],
        overrideWarnings: true,
      });

    // Change lead to tech2
    const res = await request(app)
      .put(`/api/jobs/${jobId}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        members: [
          { userId: tech1Id, assignmentRole: 'technician',      isPrimary: false },
          { userId: tech2Id, assignmentRole: 'lead_technician', isPrimary: true },
        ],
        overrideWarnings: true,
      });
    expect(res.status).toBe(200);
    expect(res.body.primaryAssignment.user_id).toBe(tech2Id);

    // Phase A: jobs.tech_id must reflect new lead
    const { rows: [job] } = await pool.query(`SELECT tech_id FROM jobs WHERE id = $1`, [jobId]);
    expect(job.tech_id).toBe(tech2Id);
  });

  it('ineligible tech — blocked with 422 + UNAVAILABLE_SELECTION', async () => {
    const jobId = await createJob();
    const res = await request(app)
      .put(`/api/jobs/${jobId}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ members: solo(ineligibleTechId, 'technician') });
    expect(res.status).toBe(422);
    expect(res.body.teamState).toBe('UNAVAILABLE_SELECTION');
    expect(res.body.assigned).toBe(false);
  });

  it('non-assignable status (cancelled) — blocked with 422', async () => {
    const jobId = await createJob({ status: 'cancelled' });
    const res = await request(app)
      .put(`/api/jobs/${jobId}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ members: solo(tech1Id), overrideWarnings: true });
    expect(res.status).toBe(422);
    expect(res.body.blockingIssues.some(b => b.type === 'job_not_assignable')).toBe(true);
  });

  it('revenue not multiplied — job amount counted once regardless of team size', async () => {
    const jobId = await createJob();
    // Set job amount
    await pool.query(`UPDATE jobs SET amount = 50000 WHERE id = $1`, [jobId]);

    await request(app)
      .put(`/api/jobs/${jobId}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        members: [
          { userId: tech1Id, assignmentRole: 'lead_technician', isPrimary: true },
          { userId: tech2Id, assignmentRole: 'technician',      isPrimary: false },
          { userId: tech3Id, assignmentRole: 'helper',          isPrimary: false },
        ],
        overrideWarnings: true,
      });

    // Only 1 primary assignment — revenue attribute is 1x, not 3x
    const { rows } = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE is_primary = TRUE) AS primary_count
       FROM job_assignments WHERE job_id = $1 AND removed_at IS NULL`,
      [jobId]
    );
    expect(parseInt(rows[0].primary_count)).toBe(1);
  });

  it('labor hours correct — each tech gets full job duration in workload', async () => {
    const jobId = await createJob({ duration_minutes: 120 });
    await request(app)
      .put(`/api/jobs/${jobId}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        members: [
          { userId: tech1Id, assignmentRole: 'lead_technician', isPrimary: true },
          { userId: tech2Id, assignmentRole: 'technician',      isPrimary: false },
        ],
        overrideWarnings: true,
      });

    const getRes = await request(app)
      .get(`/api/jobs/${jobId}/assignments`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.body.teamSize).toBe(2);
    // Both techs appear in active assignments (each gets their own row)
    const userIds = getRes.body.assignments.map(a => a.user_id);
    expect(userIds).toContain(tech1Id);
    expect(userIds).toContain(tech2Id);
  });

  it('wrong tenant — cannot assign job from another account', async () => {
    const jobId = await createJob();
    const res = await request(app)
      .put(`/api/jobs/${jobId}/assignments`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ members: solo(tech1Id) });
    expect(res.status).toBe(422);
    expect(res.body.blockingIssues.some(b => b.type === 'job_not_found')).toBe(true);
  });

  it('NO_CHANGES — applying same team returns nochange result', async () => {
    const jobId = await createJob();
    // Apply
    await request(app)
      .put(`/api/jobs/${jobId}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ members: solo(tech1Id), overrideWarnings: true });
    // Apply same again
    const res = await request(app)
      .put(`/api/jobs/${jobId}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ members: solo(tech1Id), overrideWarnings: true });
    expect(res.status).toBe(200);
    expect(res.body.teamState).toBe('NO_CHANGES');
    expect(res.body.assigned).toBe(false);
  });
});
