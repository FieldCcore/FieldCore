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

let accountId, userId, token;
let otherAccountId, otherToken;
let clientId, clientId2;

beforeAll(async () => {
  await runMigrations();
  const hash = await bcrypt.hash('pw', 10);

  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
    [`__TEST_CLOC_${Date.now()}__`]
  );
  accountId = acct.id;

  const { rows: [u] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Loc Owner',$2,$3,'owner') RETURNING id`,
    [accountId, `cloc-owner-${Date.now()}@test.fc`, hash]
  );
  userId = u.id;
  token  = makeToken(userId, accountId, 'owner');

  const { rows: [acct2] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
    [`__TEST_CLOC_OTHER_${Date.now()}__`]
  );
  otherAccountId = acct2.id;
  const { rows: [u2] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Other','cloc-other-${Date.now()}@test.fc',$2,'owner') RETURNING id`,
    [otherAccountId, hash]
  );
  otherToken = makeToken(u2.id, otherAccountId, 'owner');

  const { rows: [c1] } = await pool.query(
    `INSERT INTO clients (account_id, name, email) VALUES ($1,'Loc Client','loc@test.fc') RETURNING id`,
    [accountId]
  );
  clientId = c1.id;

  const { rows: [c2] } = await pool.query(
    `INSERT INTO clients (account_id, name, email) VALUES ($1,'Other Client','other@test.fc') RETURNING id`,
    [accountId]
  );
  clientId2 = c2.id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM accounts WHERE name LIKE '__TEST_CLOC_%'`);
  await pool.end();
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('GET /api/clients/:id/locations — auth', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get(`/api/clients/${clientId}/locations`);
    expect(res.status).toBe(401);
  });
});

// ── GET locations ─────────────────────────────────────────────────────────────

describe('GET /api/clients/:id/locations', () => {
  it('returns empty array when no locations', async () => {
    const res = await request(app)
      .get(`/api/clients/${clientId}/locations`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it('returns 404 when client belongs to another account', async () => {
    const { rows: [other] } = await pool.query(
      `INSERT INTO clients (account_id, name) VALUES ($1,'X Tenant') RETURNING id`,
      [otherAccountId]
    );
    const res = await request(app)
      .get(`/api/clients/${other.id}/locations`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

// ── POST locations ────────────────────────────────────────────────────────────

describe('POST /api/clients/:id/locations', () => {
  it('creates a location and returns it', async () => {
    const res = await request(app)
      .post(`/api/clients/${clientId}/locations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Home', address: '123 Oak St', city: 'Boca Raton', state: 'FL', zip: '33431' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      label:   'Home',
      address: '123 Oak St',
      city:    'Boca Raton',
      state:   'FL',
      zip:     '33431',
      is_primary: true,
    });
    expect(res.body.id).toBeTruthy();
    expect(res.body.account_id).toBe(accountId);
    expect(res.body.client_id).toBe(clientId);
  });

  it('auto-sets first location as primary', async () => {
    const { rows: [c] } = await pool.query(
      `INSERT INTO clients (account_id, name) VALUES ($1,'Auto Primary') RETURNING id`,
      [accountId]
    );
    const res = await request(app)
      .post(`/api/clients/${c.id}/locations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Office', address: '999 Pine Ave', city: 'Miami', state: 'FL', zip: '33101' });
    expect(res.status).toBe(201);
    expect(res.body.is_primary).toBe(true);
  });

  it('second location is not automatically primary', async () => {
    const res = await request(app)
      .post(`/api/clients/${clientId}/locations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Office', address: '456 Elm Ave', city: 'Fort Lauderdale', state: 'FL', zip: '33301' });
    expect(res.status).toBe(201);
    expect(res.body.is_primary).toBe(false);
  });

  it('deduplicates by place_id (ON CONFLICT DO NOTHING returns existing)', async () => {
    const { rows: [c] } = await pool.query(
      `INSERT INTO clients (account_id, name) VALUES ($1,'Dedup Client') RETURNING id`,
      [accountId]
    );
    const payload = { label: 'Dedup', address: '10 Dedup Blvd', city: 'Miami', state: 'FL', zip: '33100', place_id: 'dedup-place-xyz-789' };
    const r1 = await request(app)
      .post(`/api/clients/${c.id}/locations`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    const r2 = await request(app)
      .post(`/api/clients/${c.id}/locations`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(200);
    expect(r1.body.id).toBe(r2.body.id);
  });

  it('requires address field', async () => {
    const res = await request(app)
      .post(`/api/clients/${clientId}/locations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'No Address' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when client belongs to another account', async () => {
    const { rows: [other] } = await pool.query(
      `INSERT INTO clients (account_id, name) VALUES ($1,'X') RETURNING id`,
      [otherAccountId]
    );
    const res = await request(app)
      .post(`/api/clients/${other.id}/locations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Home', address: '1 St' });
    expect(res.status).toBe(404);
  });

  it('stores lat/lng and place_id when provided', async () => {
    const { rows: [c] } = await pool.query(
      `INSERT INTO clients (account_id, name) VALUES ($1,'Geo Client') RETURNING id`,
      [accountId]
    );
    const res = await request(app)
      .post(`/api/clients/${c.id}/locations`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        label:    'Main',
        address:  '500 Federal Hwy',
        city:     'Boca Raton',
        state:    'FL',
        zip:      '33432',
        lat:      26.3683,
        lng:      -80.1289,
        place_id: 'ChIJabcdef123',
      });
    expect(res.status).toBe(201);
    expect(parseFloat(res.body.lat)).toBeCloseTo(26.3683, 3);
    expect(parseFloat(res.body.lng)).toBeCloseTo(-80.1289, 3);
    expect(res.body.place_id).toBe('ChIJabcdef123');
  });
});

// ── PATCH location ────────────────────────────────────────────────────────────

describe('PATCH /api/clients/:id/locations/:locationId', () => {
  let locationId;

  beforeAll(async () => {
    const { rows: [c] } = await pool.query(
      `INSERT INTO clients (account_id, name) VALUES ($1,'Patch Client') RETURNING id`,
      [accountId]
    );
    const res = await request(app)
      .post(`/api/clients/${c.id}/locations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Old', address: '1 Old St', city: 'OldCity', state: 'FL', zip: '11111' });
    locationId = res.body.id;
    // store c.id for later tests
    clientId = c.id;
  });

  it('updates allowed fields', async () => {
    const res = await request(app)
      .patch(`/api/clients/${clientId}/locations/${locationId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Updated', address: '2 New St', city: 'NewCity' });
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('Updated');
    expect(res.body.address).toBe('2 New St');
    expect(res.body.city).toBe('NewCity');
  });

  it('returns 404 for unknown location', async () => {
    const res = await request(app)
      .patch(`/api/clients/${clientId}/locations/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'X' });
    expect(res.status).toBe(404);
  });
});

// ── DELETE location ───────────────────────────────────────────────────────────

describe('DELETE /api/clients/:id/locations/:locationId', () => {
  let delClientId, delLocationId;

  beforeAll(async () => {
    const { rows: [c] } = await pool.query(
      `INSERT INTO clients (account_id, name) VALUES ($1,'Del Client') RETURNING id`,
      [accountId]
    );
    delClientId = c.id;
    const res = await request(app)
      .post(`/api/clients/${delClientId}/locations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'To Delete', address: '99 Delete Rd', city: 'Gone', state: 'FL', zip: '00000' });
    delLocationId = res.body.id;
  });

  it('deletes the location', async () => {
    const res = await request(app)
      .delete(`/api/clients/${delClientId}/locations/${delLocationId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const check = await request(app)
      .get(`/api/clients/${delClientId}/locations`)
      .set('Authorization', `Bearer ${token}`);
    expect(check.body.find(l => l.id === delLocationId)).toBeUndefined();
  });

  it('returns 404 for already-deleted location', async () => {
    const res = await request(app)
      .delete(`/api/clients/${delClientId}/locations/${delLocationId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 when location belongs to another account', async () => {
    const { rows: [oc] } = await pool.query(
      `INSERT INTO clients (account_id, name) VALUES ($1,'OC') RETURNING id`,
      [otherAccountId]
    );
    const r = await request(app)
      .post(`/api/clients/${oc.id}/locations`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ label: 'X', address: '1 X St' });
    const res = await request(app)
      .delete(`/api/clients/${oc.id}/locations/${r.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

// ── Set primary ───────────────────────────────────────────────────────────────

describe('POST /api/clients/:id/locations/:locationId/primary', () => {
  let primClientId, loc1Id, loc2Id;

  beforeAll(async () => {
    const { rows: [c] } = await pool.query(
      `INSERT INTO clients (account_id, name) VALUES ($1,'Primary Client') RETURNING id`,
      [accountId]
    );
    primClientId = c.id;
    const r1 = await request(app)
      .post(`/api/clients/${primClientId}/locations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Loc A', address: '1 A St', city: 'Miami', state: 'FL', zip: '33100' });
    loc1Id = r1.body.id;
    const r2 = await request(app)
      .post(`/api/clients/${primClientId}/locations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Loc B', address: '2 B St', city: 'Miami', state: 'FL', zip: '33101' });
    loc2Id = r2.body.id;
  });

  it('sets the specified location as primary', async () => {
    const res = await request(app)
      .post(`/api/clients/${primClientId}/locations/${loc2Id}/primary`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(loc2Id);
    expect(res.body.is_primary).toBe(true);
  });

  it('unsets other locations as primary', async () => {
    const res = await request(app)
      .get(`/api/clients/${primClientId}/locations`)
      .set('Authorization', `Bearer ${token}`);
    const locs = res.body;
    const l1 = locs.find(l => l.id === loc1Id);
    const l2 = locs.find(l => l.id === loc2Id);
    expect(l1.is_primary).toBe(false);
    expect(l2.is_primary).toBe(true);
  });

  it('returns 404 for unknown location', async () => {
    const res = await request(app)
      .post(`/api/clients/${primClientId}/locations/00000000-0000-0000-0000-000000000000/primary`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

// ── GET returns primary first ─────────────────────────────────────────────────

describe('GET /api/clients/:id/locations — ordering', () => {
  let orderClientId;

  beforeAll(async () => {
    const { rows: [c] } = await pool.query(
      `INSERT INTO clients (account_id, name) VALUES ($1,'Order Client') RETURNING id`,
      [accountId]
    );
    orderClientId = c.id;
    await request(app)
      .post(`/api/clients/${orderClientId}/locations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'First', address: '1 First St' });
    const r2 = await request(app)
      .post(`/api/clients/${orderClientId}/locations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Second', address: '2 Second St' });
    await request(app)
      .post(`/api/clients/${orderClientId}/locations/${r2.body.id}/primary`)
      .set('Authorization', `Bearer ${token}`);
  });

  it('returns primary location first', async () => {
    const res = await request(app)
      .get(`/api/clients/${orderClientId}/locations`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body[0].is_primary).toBe(true);
    expect(res.body[0].label).toBe('Second');
  });
});

// ── Tenant isolation ──────────────────────────────────────────────────────────

describe('tenant isolation', () => {
  it('cannot list locations of another account client (returns 404)', async () => {
    const { rows: [oc] } = await pool.query(
      `INSERT INTO clients (account_id, name) VALUES ($1,'Iso Client') RETURNING id`,
      [otherAccountId]
    );
    await request(app)
      .post(`/api/clients/${oc.id}/locations`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ label: 'X', address: '1 X St' });

    const res = await request(app)
      .get(`/api/clients/${oc.id}/locations`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('cannot post location to another account client (returns 404)', async () => {
    const { rows: [oc] } = await pool.query(
      `INSERT INTO clients (account_id, name) VALUES ($1,'Iso2') RETURNING id`,
      [otherAccountId]
    );
    const res = await request(app)
      .post(`/api/clients/${oc.id}/locations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Home', address: '1 St' });
    expect(res.status).toBe(404);
  });
});
