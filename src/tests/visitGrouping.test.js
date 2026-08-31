'use strict';
require('dotenv').config();
const pool    = require('../db/pool');
const bcrypt  = require('bcryptjs');
const { runMigrations }   = require('../db/migrate');
const { processAgreement } = require('../services/agreementScheduler');

// ── Test data handles ─────────────────────────────────────────────────────────
let accountId, clientId, locationAId, locationBId;

beforeAll(async () => {
  await runMigrations();
  const hash = await bcrypt.hash('pw', 10);

  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1,'pro') RETURNING id`,
    [`__TEST_VG_${Date.now()}__`]
  );
  accountId = acct.id;

  await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'VG Owner',$2,$3,'owner')`,
    [accountId, `vg-owner-${Date.now()}@test.fc`, hash]
  );

  const { rows: [c] } = await pool.query(
    `INSERT INTO clients (account_id, name, email) VALUES ($1,'VG Client','vg@test.fc') RETURNING id`,
    [accountId]
  );
  clientId = c.id;

  const { rows: [la] } = await pool.query(
    `INSERT INTO client_locations (account_id, client_id, label, address, is_primary)
     VALUES ($1,$2,'Home','123 Main St',true) RETURNING id`,
    [accountId, clientId]
  );
  locationAId = la.id;

  const { rows: [lb] } = await pool.query(
    `INSERT INTO client_locations (account_id, client_id, label, address, is_primary)
     VALUES ($1,$2,'Office','456 Oak Ave',false) RETURNING id`,
    [accountId, clientId]
  );
  locationBId = lb.id;
}, 60000);

afterAll(async () => {
  await pool.query(`DELETE FROM accounts WHERE name LIKE '__TEST_VG_%'`);
  await pool.end();
}, 30000);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createAgreement(schedules, extra = {}) {
  const { rows: [agr] } = await pool.query(
    `INSERT INTO recurring_agreements
       (account_id, client_id, name, billing_cadence, plan_price, status)
     VALUES ($1,$2,$3,'monthly',100,'active') RETURNING *`,
    [accountId, clientId, `VG Test ${Date.now()}`]
  );

  for (let i = 0; i < schedules.length; i++) {
    const s = schedules[i];
    await pool.query(
      `INSERT INTO recurring_agreement_schedules
         (account_id, agreement_id, service_type, cadence, started_at,
          preferred_start_time, duration_minutes, preferred_weekday,
          location_id, service_address, status, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11)`,
      [
        accountId, agr.id,
        s.service_type || 'Service',
        s.cadence || 'weekly',
        s.started_at || '2026-09-01',
        s.start_time || '09:00',
        s.duration || 120,
        s.weekday ?? 1,    // Monday = 1
        s.location_id || null,
        s.address || null,
        i,
      ]
    );
  }

  const { rows: [full] } = await pool.query(
    `SELECT * FROM recurring_agreements WHERE id = $1`, [agr.id]
  );
  return full;
}

async function jobsForAgreement(agreementId) {
  const { rows } = await pool.query(
    `SELECT j.*,
            (SELECT COUNT(*)::int FROM job_services js WHERE js.job_id = j.id) AS svc_count
     FROM jobs j
     WHERE j.agreement_id = $1 AND j.status != 'cancelled'
     ORDER BY j.scheduled_at`,
    [agreementId]
  );
  return rows;
}

async function occurrencesForAgreement(agreementId) {
  const { rows } = await pool.query(
    `SELECT * FROM agreement_schedule_occurrences WHERE agreement_id = $1 ORDER BY occurrence_date`,
    [agreementId]
  );
  return rows;
}

// ── 1. Same location, sequential times → one job ──────────────────────────────
describe('same client, same location, sequential times', () => {
  it('groups into one Calendar visit', async () => {
    const agr = await createAgreement([
      { service_type: 'Detail A', start_time: '09:00', duration: 120, location_id: locationAId },
      { service_type: 'Detail B', start_time: '11:00', duration: 120, location_id: locationAId },
    ]);

    await processAgreement(agr);
    const jobs = await jobsForAgreement(agr.id);

    // All jobs on the same date should share ONE job
    const byDate = {};
    for (const j of jobs) {
      const d = j.scheduled_at.toISOString().slice(0, 10);
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(j);
    }

    for (const [date, dayJobs] of Object.entries(byDate)) {
      expect(dayJobs).toHaveLength(1);
      // Parent window: 9:00 AM start, 4h duration (240 min)
      const j = dayJobs[0];
      expect(j.svc_count).toBe(2);
      expect(j.duration_minutes).toBe(240);
    }
  }, 30000);
});

// ── 2. Same location, overlapping / parallel times → one job ──────────────────
describe('same client, same location, parallel times', () => {
  it('groups into one visit, parent duration = overlap window (not sum)', async () => {
    const agr = await createAgreement([
      { service_type: 'Vehicle A', start_time: '09:00', duration: 120, location_id: locationAId },
      { service_type: 'Vehicle B', start_time: '09:00', duration: 120, location_id: locationAId },
    ]);

    await processAgreement(agr);
    const jobs = await jobsForAgreement(agr.id);

    for (const j of jobs) {
      expect(j.svc_count).toBe(2);
      // 9:00–11:00 for both → parent duration = 120, NOT 240
      expect(j.duration_minutes).toBe(120);
    }
  }, 30000);
});

// ── 3. Same location, large time gap → two separate jobs ──────────────────────
describe('same client, same location, large time gap', () => {
  it('creates separate appointments when gap > 60 min', async () => {
    const agr = await createAgreement([
      { service_type: 'Morning', start_time: '08:00', duration: 120, location_id: locationAId },
      { service_type: 'Evening', start_time: '17:00', duration: 120, location_id: locationAId },
    ]);

    await processAgreement(agr);
    const jobs = await jobsForAgreement(agr.id);

    // Each date should have 2 jobs (morning + evening)
    const byDate = {};
    for (const j of jobs) {
      const d = j.scheduled_at.toISOString().slice(0, 10);
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(j);
    }
    for (const dayJobs of Object.values(byDate)) {
      expect(dayJobs).toHaveLength(2);
    }
  }, 30000);
});

// ── 4. Different canonical locations → separate appointments ──────────────────
describe('same client, different location_id', () => {
  it('never groups occurrences at different locations', async () => {
    const agr = await createAgreement([
      { service_type: 'Home Service',   start_time: '09:00', duration: 120, location_id: locationAId },
      { service_type: 'Office Service', start_time: '09:00', duration: 120, location_id: locationBId },
    ]);

    await processAgreement(agr);
    const jobs = await jobsForAgreement(agr.id);

    // Each date: 2 jobs (one per location)
    const byDate = {};
    for (const j of jobs) {
      const d = j.scheduled_at.toISOString().slice(0, 10);
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(j);
    }
    for (const dayJobs of Object.values(byDate)) {
      expect(dayJobs).toHaveLength(2);
      // Each job should have exactly 1 service
      for (const j of dayJobs) expect(j.svc_count).toBe(1);
    }
  }, 30000);
});

// ── 5. Weekly + biweekly alternating pattern ─────────────────────────────────
describe('weekly + biweekly pattern', () => {
  it('groups on overlap weeks, solo on alternate weeks', async () => {
    const agr = await createAgreement([
      { service_type: 'Vehicle A', cadence: 'weekly',       start_time: '09:00', duration: 120, location_id: locationAId, started_at: '2026-09-07' },
      { service_type: 'Vehicle B', cadence: 'every_2_weeks',start_time: '11:00', duration: 120, location_id: locationAId, started_at: '2026-09-07' },
    ]);

    await processAgreement(agr);
    const jobs = await jobsForAgreement(agr.id);

    // Classify jobs by service count
    const grouped = jobs.filter(j => j.svc_count === 2);
    const solo    = jobs.filter(j => j.svc_count === 1);

    expect(grouped.length).toBeGreaterThan(0);
    expect(solo.length).toBeGreaterThan(0);
    // Total grouped + solo = total unique Mondays in horizon
    expect(grouped.length + solo.length).toBe(jobs.length);
  }, 30000);
});

// ── 6. Idempotency — running scheduler twice ──────────────────────────────────
describe('idempotency', () => {
  it('second scheduler run creates no duplicates', async () => {
    const agr = await createAgreement([
      { service_type: 'Svc A', start_time: '09:00', duration: 60, location_id: locationAId },
      { service_type: 'Svc B', start_time: '10:00', duration: 60, location_id: locationAId },
    ]);

    await processAgreement(agr);
    const jobs1 = await jobsForAgreement(agr.id);

    await processAgreement(agr);
    const jobs2 = await jobsForAgreement(agr.id);

    expect(jobs2.length).toBe(jobs1.length);
    // Same job IDs
    const ids1 = new Set(jobs1.map(j => j.id));
    const ids2 = new Set(jobs2.map(j => j.id));
    for (const id of ids1) expect(ids2.has(id)).toBe(true);
  }, 30000);
});

// ── 7. Legacy job adoption ────────────────────────────────────────────────────
describe('legacy job adoption', () => {
  it('adopts a pre-existing job without occurrence rows instead of creating a duplicate', async () => {
    const agr = await createAgreement([
      { service_type: 'Svc A', start_time: '09:00', duration: 60, location_id: locationAId },
    ]);

    // Simulate a legacy job created by the old scheduler (no occurrence rows)
    const targetDate = '2026-09-15'; // a Monday
    const { rows: [legacy] } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, scheduled_at, status, agreement_id)
       VALUES ($1,$2,'Legacy Service',$3::timestamp,'scheduled',$4) RETURNING id`,
      [accountId, clientId, `${targetDate}T09:00:00`, agr.id]
    );

    await processAgreement(agr);
    const jobs = await jobsForAgreement(agr.id);

    // Should NOT have created a second job for the same date
    const sameDate = jobs.filter(j => j.scheduled_at.toISOString().slice(0, 10) === targetDate);
    expect(sameDate).toHaveLength(1);

    // The surviving job should be the legacy one (adopted)
    expect(sameDate[0].id).toBe(legacy.id);
  }, 30000);
});

// ── 8. Legacy repair — cancels orphaned legacy job when grouped job exists ────
describe('legacy repair', () => {
  it('cancels a legacy job when a grouped occurrence-linked job already covers the date', async () => {
    const agr = await createAgreement([
      { service_type: 'Svc A', start_time: '09:00', duration: 60, location_id: locationAId },
    ]);

    // First run creates proper grouped job
    await processAgreement(agr);
    const jobs = await jobsForAgreement(agr.id);
    expect(jobs.length).toBeGreaterThan(0);

    // Inject a second legacy job on the same first date (simulating old code)
    const firstDate = jobs[0].scheduled_at.toISOString().slice(0, 10);
    await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, scheduled_at, status, agreement_id)
       VALUES ($1,$2,'Legacy Duplicate',$3::timestamp,'scheduled',$4)`,
      [accountId, clientId, `${firstDate}T09:00:00`, agr.id]
    );

    // Second run should cancel the orphaned legacy job
    await processAgreement(agr);
    const { rows: allJobs } = await pool.query(
      `SELECT id, status FROM jobs WHERE agreement_id = $1 AND scheduled_at::date = $2`,
      [agr.id, firstDate]
    );
    const active    = allJobs.filter(j => j.status !== 'cancelled');
    const cancelled = allJobs.filter(j => j.status === 'cancelled');
    expect(active).toHaveLength(1);
    expect(cancelled).toHaveLength(1);
  }, 30000);
});

// ── 9. Tenant isolation ───────────────────────────────────────────────────────
describe('tenant isolation', () => {
  it('jobs created for one account are not visible to another', async () => {
    const { rows: [otherAcct] } = await pool.query(
      `INSERT INTO accounts (name, plan) VALUES ($1,'pro') RETURNING id`,
      [`__TEST_VG_OTHER_${Date.now()}__`]
    );

    const agr = await createAgreement([
      { service_type: 'Isolated Svc', start_time: '09:00', duration: 60, location_id: locationAId },
    ]);

    await processAgreement(agr);
    const { rows: otherJobs } = await pool.query(
      `SELECT id FROM jobs WHERE account_id = $1 AND agreement_id = $2`,
      [otherAcct.id, agr.id]
    );
    expect(otherJobs).toHaveLength(0);

    await pool.query(`DELETE FROM accounts WHERE id = $1`, [otherAcct.id]);
  }, 30000);
});

// ── 10. Parent visit window ───────────────────────────────────────────────────
describe('parent visit window', () => {
  it('uses earliest start and latest end across all services', async () => {
    const agr = await createAgreement([
      { service_type: 'First',  start_time: '08:00', duration: 90,  location_id: locationAId },
      { service_type: 'Second', start_time: '09:30', duration: 120, location_id: locationAId },
    ]);

    await processAgreement(agr);
    const jobs = await jobsForAgreement(agr.id);

    // Parent: start=08:00, end=max(09:30, 11:30)=11:30 → duration = 11:30-08:00 = 210min
    for (const j of jobs) {
      if (j.svc_count === 2) {
        const h = j.scheduled_at.toISOString().slice(11, 16); // "HH:MM" in UTC
        // Duration should be 210 min (8:00 to 11:30)
        expect(j.duration_minutes).toBe(210);
      }
    }
  }, 30000);
});

// ── 11. location_id takes precedence over address string ──────────────────────
describe('grouping key precedence', () => {
  it('uses location_id when set, ignores differing address strings', async () => {
    // Both schedules at same location_id but with DIFFERENT service_address strings
    const agr = await createAgreement([
      { service_type: 'Svc A', start_time: '09:00', duration: 60, location_id: locationAId, address: '123 Main Street' },
      { service_type: 'Svc B', start_time: '10:00', duration: 60, location_id: locationAId, address: '123 Main St'     },
    ]);

    await processAgreement(agr);
    const jobs = await jobsForAgreement(agr.id);

    // Despite differing address strings, location_id match → ONE job per date
    for (const j of jobs) {
      expect(j.svc_count).toBe(2);
    }
  }, 30000);
});
