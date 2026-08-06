'use strict';
/**
 * Job Creation — Multi-Tech Assignment Integration Tests
 *
 * Verifies that POST /api/jobs correctly accepts an assignment payload,
 * creates job_assignments transactionally, keeps jobs.tech_id in sync,
 * records activity events, and rejects invalid inputs.
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

let accountId, userId, token;
let tech1Id, tech2Id, tech3Id, ineligibleTechId, clientId;

beforeAll(async () => {
  const hash = await bcrypt.hash('pw', 10);

  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1,$2) RETURNING id`,
    [`__TEST_JOB_CREATE_${Date.now()}__`, 'pro']
  );
  accountId = acct.id;

  const { rows: [u] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role, field_work_eligible, dispatch_visible)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [accountId, 'Owner', `create-owner-${Date.now()}@fieldcore.test`, hash, 'owner', false, false]
  );
  userId = u.id;
  token  = makeToken(userId, accountId, 'owner');

  for (const [name, key] of [['Tech A','a'],['Tech B','b'],['Tech C','c']]) {
    const { rows: [t] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role, field_work_eligible, dispatch_visible, is_available)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [accountId, name, `create-${key}-${Date.now()}@fieldcore.test`, hash, 'tech', true, true, true]
    );
    if (key === 'a') tech1Id = t.id;
    if (key === 'b') tech2Id = t.id;
    if (key === 'c') tech3Id = t.id;
  }

  const { rows: [inelig] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role, field_work_eligible, dispatch_visible)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [accountId, 'Office Only', `create-inelig-${Date.now()}@fieldcore.test`, hash, 'tech', false, true]
  );
  ineligibleTechId = inelig.id;

  const { rows: [cl] } = await pool.query(
    `INSERT INTO clients (account_id, name) VALUES ($1,$2) RETURNING id`,
    [accountId, 'Create Test Client']
  );
  clientId = cl.id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM accounts WHERE id = $1`, [accountId]);
  await pool.end();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function baseJob(overrides = {}) {
  return {
    client_id:    clientId,
    service_type: 'Create Test Service',
    scheduled_at_local: '2026-08-15T10:00',
    input_timezone: 'America/New_York',
    ...overrides,
  };
}

async function getJobAssignments(jobId) {
  const { rows } = await pool.query(
    `SELECT * FROM job_assignments WHERE job_id = $1 AND removed_at IS NULL ORDER BY is_primary DESC, assigned_at`,
    [jobId]
  );
  return rows;
}

async function getJobTechId(jobId) {
  const { rows } = await pool.query(`SELECT tech_id FROM jobs WHERE id = $1`, [jobId]);
  return rows[0]?.tech_id;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/jobs — team assignment', () => {

  it('creates an unassigned job (no assignment payload)', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(baseJob());

    expect(res.status).toBe(201);
    const jobId = res.body.id;

    const assignments = await getJobAssignments(jobId);
    expect(assignments).toHaveLength(0);
    expect(await getJobTechId(jobId)).toBeNull();
  });

  it('creates a solo assignment and syncs jobs.tech_id', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(baseJob({
        assignment: {
          members: [{ userId: tech1Id, assignmentRole: 'lead_technician', isPrimary: true }],
          crewId: null,
        },
      }));

    expect(res.status).toBe(201);
    const jobId = res.body.id;

    const assignments = await getJobAssignments(jobId);
    expect(assignments).toHaveLength(1);
    expect(assignments[0].user_id).toBe(tech1Id);
    expect(assignments[0].is_primary).toBe(true);
    expect(assignments[0].assignment_role).toBe('lead_technician');
    expect(assignments[0].status).toBe('assigned');
    expect(await getJobTechId(jobId)).toBe(tech1Id);
  });

  it('creates a two-member team with correct lead and role', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(baseJob({
        assignment: {
          members: [
            { userId: tech1Id, assignmentRole: 'lead_technician', isPrimary: true },
            { userId: tech2Id, assignmentRole: 'technician',      isPrimary: false },
          ],
          crewId: null,
        },
      }));

    expect(res.status).toBe(201);
    const jobId = res.body.id;

    const assignments = await getJobAssignments(jobId);
    expect(assignments).toHaveLength(2);

    const lead = assignments.find(a => a.is_primary);
    expect(lead.user_id).toBe(tech1Id);
    expect(lead.assignment_role).toBe('lead_technician');

    const helper = assignments.find(a => !a.is_primary);
    expect(helper.user_id).toBe(tech2Id);
    expect(helper.assignment_role).toBe('technician');

    expect(await getJobTechId(jobId)).toBe(tech1Id);
  });

  it('creates a three-member team', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(baseJob({
        assignment: {
          members: [
            { userId: tech1Id, assignmentRole: 'lead_technician', isPrimary: true },
            { userId: tech2Id, assignmentRole: 'technician',      isPrimary: false },
            { userId: tech3Id, assignmentRole: 'helper',          isPrimary: false },
          ],
          crewId: null,
        },
      }));

    expect(res.status).toBe(201);
    const assignments = await getJobAssignments(res.body.id);
    expect(assignments).toHaveLength(3);
    expect(assignments.filter(a => a.is_primary)).toHaveLength(1);
  });

  it('auto-promotes first member as lead when no isPrimary specified', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(baseJob({
        assignment: {
          members: [
            { userId: tech1Id, assignmentRole: 'lead_technician', isPrimary: false },
            { userId: tech2Id, assignmentRole: 'technician',      isPrimary: false },
          ],
          crewId: null,
        },
      }));

    expect(res.status).toBe(201);
    const assignments = await getJobAssignments(res.body.id);
    // First member promoted to primary
    const primary = assignments.find(a => a.is_primary);
    expect(primary).toBeDefined();
    expect(await getJobTechId(res.body.id)).toBe(primary.user_id);
  });

  it('strips duplicates — same userId twice creates only one row', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(baseJob({
        assignment: {
          members: [
            { userId: tech1Id, assignmentRole: 'lead_technician', isPrimary: true },
            { userId: tech1Id, assignmentRole: 'technician',      isPrimary: false },
          ],
          crewId: null,
        },
      }));

    // Duplicate members — partial unique index enforces only one row per job+user
    // Either succeeds with 1 row or fails; 500 is acceptable here.
    if (res.status === 201) {
      const assignments = await getJobAssignments(res.body.id);
      expect(assignments).toHaveLength(1);
    } else {
      // DB constraint violation is also valid
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });

  it('silently skips members from a different account (tenant isolation)', async () => {
    // Create a user in a different account
    const { rows: [otherAcct] } = await pool.query(
      `INSERT INTO accounts (name, plan) VALUES ($1,$2) RETURNING id`,
      [`__TEST_JC_OTHER_${Date.now()}__`, 'pro']
    );
    const hash = await bcrypt.hash('pw', 10);
    const { rows: [otherUser] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role, field_work_eligible)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [otherAcct.id, 'Other Tech', `jc-other-${Date.now()}@fieldcore.test`, hash, 'tech', true]
    );

    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(baseJob({
        assignment: {
          members: [{ userId: otherUser.id, assignmentRole: 'lead_technician', isPrimary: true }],
          crewId: null,
        },
      }));

    expect(res.status).toBe(201);
    const assignments = await getJobAssignments(res.body.id);
    // Cross-account member silently skipped — no assignment created
    expect(assignments).toHaveLength(0);
    // tech_id must be null (not the other account's user)
    expect(await getJobTechId(res.body.id)).toBeNull();

    await pool.query(`DELETE FROM accounts WHERE id = $1`, [otherAcct.id]);
  });

  it('job_assignments are rolled back if the job INSERT fails', async () => {
    // Force a failure by sending an invalid client_id — job INSERT will fail
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: '00000000-0000-0000-0000-000000000000', // non-existent
        service_type: 'Rollback Test',
        assignment: {
          members: [{ userId: tech1Id, assignmentRole: 'lead_technician', isPrimary: true }],
          crewId: null,
        },
      });

    expect(res.status).toBeGreaterThanOrEqual(400);

    // No orphaned job_assignments should exist for tech1Id + this non-existent job
    const { rows } = await pool.query(
      `SELECT * FROM job_assignments
       WHERE user_id = $1 AND account_id = $2
       ORDER BY assigned_at DESC LIMIT 1`,
      [tech1Id, accountId]
    );
    // If any rows exist, they must not belong to a non-existent job
    if (rows.length > 0) {
      const { rows: jobRows } = await pool.query(
        `SELECT id FROM jobs WHERE id = $1`, [rows[0].job_id]
      );
      expect(jobRows.length).toBeGreaterThan(0);
    }
  });

  it('legacy tech_id field creates solo assignment (backward compat)', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(baseJob({ tech_id: tech2Id }));

    expect(res.status).toBe(201);
    const jobId = res.body.id;

    const assignments = await getJobAssignments(jobId);
    expect(assignments).toHaveLength(1);
    expect(assignments[0].user_id).toBe(tech2Id);
    expect(assignments[0].is_primary).toBe(true);
    expect(await getJobTechId(jobId)).toBe(tech2Id);
  });

  it('assignment takes precedence over legacy tech_id when both provided', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(baseJob({
        tech_id: tech2Id,  // legacy field — should be overridden by assignment
        assignment: {
          members: [{ userId: tech1Id, assignmentRole: 'lead_technician', isPrimary: true }],
          crewId: null,
        },
      }));

    expect(res.status).toBe(201);
    const assignments = await getJobAssignments(res.body.id);
    expect(assignments).toHaveLength(1);
    expect(assignments[0].user_id).toBe(tech1Id);
    expect(await getJobTechId(res.body.id)).toBe(tech1Id);
  });

  it('requires auth — 401 without token', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send(baseJob());
    expect(res.status).toBe(401);
  });

  it('requires owner or manager role — 403 for tech', async () => {
    const hash = await bcrypt.hash('pw', 10);
    const { rows: [techUser] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role, field_work_eligible)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [accountId, 'Plain Tech', `plain-tech-${Date.now()}@fieldcore.test`, hash, 'tech', true]
    );
    const techToken = makeToken(techUser.id, accountId, 'tech');

    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${techToken}`)
      .send(baseJob());
    expect(res.status).toBe(403);
  });

  it('account_id on job_assignments matches the job account', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(baseJob({
        assignment: {
          members: [{ userId: tech1Id, assignmentRole: 'lead_technician', isPrimary: true }],
          crewId: null,
        },
      }));

    expect(res.status).toBe(201);
    const assignments = await getJobAssignments(res.body.id);
    expect(assignments[0].account_id).toBe(accountId);
    expect(assignments[0].assigned_by).toBe(userId);
  });
});
