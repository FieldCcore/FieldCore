'use strict';
require('dotenv').config();
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const app     = require('../app');
const pool    = require('../db/pool');
const { runMigrations } = require('../db/migrate');

function makeToken(userId, accountId, role = 'owner') {
  return jwt.sign({ userId, accountId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

let accountId, userId, token, techId, techToken;
let otherAccountId, otherToken;
let clientId;
let jobId;

beforeAll(async () => {
  await runMigrations();
  const hash = await bcrypt.hash('pw', 10);

  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
    [`__TEST_JSVC_${Date.now()}__`]
  );
  accountId = acct.id;

  const { rows: [u] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Owner','jsvc-owner-${Date.now()}@test.fc',$2,'owner') RETURNING id`,
    [accountId, hash]
  );
  userId = u.id;
  token  = makeToken(userId, accountId, 'owner');

  const { rows: [tech] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Tech','jsvc-tech-${Date.now()}@test.fc',$2,'tech') RETURNING id`,
    [accountId, hash]
  );
  techId    = tech.id;
  techToken = makeToken(techId, accountId, 'tech');

  const { rows: [acct2] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
    [`__TEST_JSVC_OTHER_${Date.now()}__`]
  );
  otherAccountId = acct2.id;
  const { rows: [u2] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Other','jsvc-other-${Date.now()}@test.fc',$2,'owner') RETURNING id`,
    [otherAccountId, hash]
  );
  otherToken = makeToken(u2.id, otherAccountId, 'owner');

  const { rows: [c] } = await pool.query(
    `INSERT INTO clients (account_id, name, email) VALUES ($1,'SvcClient','svc@test.fc') RETURNING id`,
    [accountId]
  );
  clientId = c.id;

  // Create a job to attach services to
  const { rows: [j] } = await pool.query(
    `INSERT INTO jobs (account_id, client_id, service_type, status)
     VALUES ($1,$2,'Detail','scheduled') RETURNING id`,
    [accountId, clientId]
  );
  jobId = j.id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM accounts WHERE name LIKE '__TEST_JSVC_%'`);
  await pool.end();
});

// ── GET /api/jobs/:id includes services, team, assets ─────────────────────────

describe('GET /api/jobs/:id — enriched detail', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get(`/api/jobs/${jobId}`);
    expect(res.status).toBe(401);
  });

  it('returns job with empty services/team/assets arrays', async () => {
    const res = await request(app)
      .get(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.services)).toBe(true);
    expect(Array.isArray(res.body.team)).toBe(true);
    expect(Array.isArray(res.body.assets)).toBe(true);
  });

  it('returns 404 for another tenant job', async () => {
    const res = await request(app)
      .get(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });
});

// ── POST /api/jobs — creates services inline ──────────────────────────────────

describe('POST /api/jobs — with service lines', () => {
  let newJobId;

  it('creates a job with service lines', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id:    clientId,
        service_type: 'Full Detail',
        services: [
          { service_name: 'Exterior Wash', asset_label: '2025 Ford F-150', duration_minutes: 60 },
          { service_name: 'Interior Clean', asset_label: '2025 Ford F-150', duration_minutes: 30, service_notes: 'Use odor eliminator' },
        ],
      });
    expect(res.status).toBe(201);
    newJobId = res.body.id;
  });

  it('services appear in GET /api/jobs/:id after creation', async () => {
    const res = await request(app)
      .get(`/api/jobs/${newJobId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.services).toHaveLength(2);
    expect(res.body.services[0].service_name).toBe('Exterior Wash');
    expect(res.body.services[0].asset_label).toBe('2025 Ford F-150');
    expect(res.body.services[1].service_name).toBe('Interior Clean');
    expect(res.body.services[1].service_notes).toBe('Use odor eliminator');
  });

  it('includes instructions field in job response', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id:    clientId,
        service_type: 'Pool Service',
        instructions: 'Gate code is 1234. Park in driveway.',
      });
    expect(res.status).toBe(201);
    const detail = await request(app)
      .get(`/api/jobs/${res.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detail.body.instructions).toBe('Gate code is 1234. Park in driveway.');
  });
});

// ── PUT /api/jobs/:id/services — replace services ─────────────────────────────

describe('PUT /api/jobs/:id/services', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).put(`/api/jobs/${jobId}/services`).send({ services: [] });
    expect(res.status).toBe(401);
  });

  it('returns 403 for tech role', async () => {
    const res = await request(app)
      .put(`/api/jobs/${jobId}/services`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ services: [] });
    expect(res.status).toBe(403);
  });

  it('replaces service lines', async () => {
    // First insert a service
    await request(app)
      .put(`/api/jobs/${jobId}/services`)
      .set('Authorization', `Bearer ${token}`)
      .send({ services: [{ service_name: 'Old Service' }] });

    // Now replace
    const res = await request(app)
      .put(`/api/jobs/${jobId}/services`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        services: [
          { service_name: 'Full Detail', asset_label: 'Vehicle 1', duration_minutes: 90 },
          { service_name: 'Headlight Restoration', asset_label: 'Vehicle 1' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.services).toHaveLength(2);
    expect(res.body.services[0].service_name).toBe('Full Detail');
    expect(res.body.services[0].duration_minutes).toBe(90);
    expect(res.body.services[1].service_name).toBe('Headlight Restoration');
  });

  it('clears all services with empty array', async () => {
    const res = await request(app)
      .put(`/api/jobs/${jobId}/services`)
      .set('Authorization', `Bearer ${token}`)
      .send({ services: [] });
    expect(res.status).toBe(200);
    expect(res.body.services).toHaveLength(0);
    const detail = await request(app)
      .get(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detail.body.services).toHaveLength(0);
  });

  it('returns 404 for another tenant job', async () => {
    const res = await request(app)
      .put(`/api/jobs/${jobId}/services`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ services: [] });
    expect(res.status).toBe(404);
  });
});

// ── GET /api/jobs/:id — location label from client_locations ─────────────────

describe('GET /api/jobs/:id — location label', () => {
  it('returns location_label when job references a client_location', async () => {
    const { rows: [loc] } = await pool.query(
      `INSERT INTO client_locations (account_id, client_id, label, address, city, state, zip)
       VALUES ($1,$2,'Main Residence','123 Oak St','Coral Springs','FL','33071') RETURNING id`,
      [accountId, clientId]
    );
    const { rows: [j] } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, location_id,
        service_address, service_city, service_state, service_zip)
       VALUES ($1,$2,'Wash',$3,'123 Oak St','Coral Springs','FL','33071') RETURNING id`,
      [accountId, clientId, loc.id]
    );
    const res = await request(app)
      .get(`/api/jobs/${j.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.location_label).toBe('Main Residence');
    expect(res.body.service_address).toBe('123 Oak St');
  });

  it('returns null location_label when no location_id', async () => {
    const { rows: [j] } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, service_address)
       VALUES ($1,$2,'Wash','456 Elm St') RETURNING id`,
      [accountId, clientId]
    );
    const res = await request(app)
      .get(`/api/jobs/${j.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.location_label).toBeNull();
    expect(res.body.service_address).toBe('456 Elm St');
  });
});

// ── GET /api/jobs/:id — full team from job_assignments ────────────────────────

describe('GET /api/jobs/:id — full team', () => {
  it('returns team array with assignment roles', async () => {
    await pool.query(
      `INSERT INTO job_assignments (job_id, account_id, user_id, assignment_role, is_primary, removed_at)
       VALUES ($1,$2,$3,'lead_technician',true,NULL)`,
      [jobId, accountId, techId]
    );
    const res = await request(app)
      .get(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const lead = res.body.team.find(m => m.user_id === techId);
    expect(lead).toBeTruthy();
    expect(lead.is_primary).toBe(true);
    expect(lead.assignment_role).toBe('lead_technician');
  });
});
