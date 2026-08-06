'use strict';
/**
 * job_assignments migration backfill — Integration Tests
 *
 * Verifies that existing jobs.tech_id values are correctly backfilled
 * into job_assignments, that the backfill is idempotent on re-run,
 * and that NULL tech_ids are not backfilled.
 *
 * Requires a live DATABASE_URL with the current schema applied.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool   = require('../db/pool');

let accountId, techId, otherTechId, clientId;

beforeAll(async () => {
  const hash = await bcrypt.hash('pw', 10);

  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1,$2) RETURNING id`,
    [`__TEST_MIGR_${Date.now()}__`, 'pro']
  );
  accountId = acct.id;

  const { rows: [t1] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role, field_work_eligible, dispatch_visible)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [accountId, 'Tech Alpha', `migr-a-${Date.now()}@fieldcore.test`, hash, 'tech', true, true]
  );
  techId = t1.id;

  const { rows: [t2] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role, field_work_eligible, dispatch_visible)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [accountId, 'Tech Beta', `migr-b-${Date.now()}@fieldcore.test`, hash, 'tech', true, true]
  );
  otherTechId = t2.id;

  const { rows: [cl] } = await pool.query(
    `INSERT INTO clients (account_id, name) VALUES ($1,$2) RETURNING id`,
    [accountId, 'Migr Test Client']
  );
  clientId = cl.id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM accounts WHERE id = $1`, [accountId]);
  await pool.end();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createJob(overrides = {}) {
  const { rows: [j] } = await pool.query(
    `INSERT INTO jobs (account_id, client_id, service_type, status, tech_id, duration_minutes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [
      accountId, clientId,
      overrides.service_type ?? 'Migration Test',
      overrides.status       ?? 'scheduled',
      overrides.tech_id      ?? null,
      overrides.duration_minutes ?? 60,
    ]
  );
  return j.id;
}

async function runBackfill() {
  await pool.query(`
    INSERT INTO job_assignments
      (account_id, job_id, user_id, assignment_role, is_primary, status, assigned_at)
    SELECT
      j.account_id, j.id, j.tech_id, 'lead_technician', TRUE, 'assigned',
      COALESCE(j.updated_at, j.created_at)
    FROM jobs j
    WHERE j.tech_id IS NOT NULL
      AND j.account_id = $1
      AND NOT EXISTS (
        SELECT 1 FROM job_assignments ja
        WHERE ja.job_id = j.id AND ja.user_id = j.tech_id AND ja.removed_at IS NULL
      )
  `, [accountId]);
}

async function getActiveAssignments(jobId) {
  const { rows } = await pool.query(
    `SELECT * FROM job_assignments
     WHERE job_id = $1 AND removed_at IS NULL`,
    [jobId]
  );
  return rows;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('job_assignments backfill', () => {

  it('creates a primary assignment for a job with tech_id', async () => {
    const jobId = await createJob({ tech_id: techId });
    await runBackfill();

    const assignments = await getActiveAssignments(jobId);
    expect(assignments).toHaveLength(1);
    expect(assignments[0].user_id).toBe(techId);
    expect(assignments[0].is_primary).toBe(true);
    expect(assignments[0].assignment_role).toBe('lead_technician');
    expect(assignments[0].status).toBe('assigned');
    expect(assignments[0].account_id).toBe(accountId);
  });

  it('does NOT create an assignment for a job with NULL tech_id', async () => {
    const jobId = await createJob({ tech_id: null });
    await runBackfill();

    const assignments = await getActiveAssignments(jobId);
    expect(assignments).toHaveLength(0);
  });

  it('is idempotent — running twice creates no duplicates', async () => {
    const jobId = await createJob({ tech_id: techId });
    await runBackfill();
    await runBackfill(); // second run

    const assignments = await getActiveAssignments(jobId);
    expect(assignments).toHaveLength(1);
  });

  it('preserves account_id on backfilled assignments', async () => {
    const jobId = await createJob({ tech_id: techId });
    await runBackfill();

    const assignments = await getActiveAssignments(jobId);
    expect(assignments[0].account_id).toBe(accountId);
  });

  it('does not backfill across accounts — only affects scoped account', async () => {
    // Create a second account with its own tech + job
    const hash = await bcrypt.hash('pw', 10);
    const { rows: [acct2] } = await pool.query(
      `INSERT INTO accounts (name, plan) VALUES ($1,$2) RETURNING id`,
      [`__TEST_MIGR_OTHER_${Date.now()}__`, 'pro']
    );
    const { rows: [t3] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [acct2.id, 'Other Tech', `other-migr-${Date.now()}@fieldcore.test`, hash, 'tech']
    );
    const { rows: [cl2] } = await pool.query(
      `INSERT INTO clients (account_id, name) VALUES ($1,$2) RETURNING id`,
      [acct2.id, 'Other Client']
    );
    const { rows: [j2] } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, tech_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [acct2.id, cl2.id, 'Cross-Account Test', 'scheduled', t3.id]
    );

    // Only backfill for primary account
    await runBackfill(); // restricted to accountId

    // Other account's job should have 0 assignments from this backfill
    const otherAssignments = await pool.query(
      `SELECT * FROM job_assignments WHERE job_id = $1`, [j2.id]
    );
    expect(otherAssignments.rows).toHaveLength(0);

    // Cleanup
    await pool.query(`DELETE FROM accounts WHERE id = $1`, [acct2.id]);
  });

  it('partial unique index prevents duplicate active assignments', async () => {
    const jobId = await createJob({ tech_id: techId });
    // Insert first assignment manually
    await pool.query(
      `INSERT INTO job_assignments (account_id, job_id, user_id, assignment_role, is_primary, status, assigned_at)
       VALUES ($1,$2,$3,'lead_technician',TRUE,'assigned',NOW())`,
      [accountId, jobId, techId]
    );

    // Attempting a second active INSERT for same job+user should throw
    await expect(pool.query(
      `INSERT INTO job_assignments (account_id, job_id, user_id, assignment_role, is_primary, status, assigned_at)
       VALUES ($1,$2,$3,'lead_technician',TRUE,'assigned',NOW())`,
      [accountId, jobId, techId]
    )).rejects.toThrow();
  });

  it('allows re-assigning after soft-remove (removed_at IS NOT NULL)', async () => {
    const jobId = await createJob({ tech_id: techId });
    // Insert and then soft-remove
    const { rows: [ja] } = await pool.query(
      `INSERT INTO job_assignments (account_id, job_id, user_id, assignment_role, is_primary, status, assigned_at)
       VALUES ($1,$2,$3,'lead_technician',TRUE,'assigned',NOW()) RETURNING id`,
      [accountId, jobId, techId]
    );
    await pool.query(
      `UPDATE job_assignments SET removed_at = NOW() WHERE id = $1`,
      [ja.id]
    );

    // After soft-remove, inserting a new active row should succeed
    await expect(pool.query(
      `INSERT INTO job_assignments (account_id, job_id, user_id, assignment_role, is_primary, status, assigned_at)
       VALUES ($1,$2,$3,'lead_technician',TRUE,'assigned',NOW())`,
      [accountId, jobId, techId]
    )).resolves.toBeDefined();

    const active = await getActiveAssignments(jobId);
    expect(active).toHaveLength(1);
  });
});
