/**
 * Maps API repair — verifies that all three backend proxy routes behave
 * correctly when unauthenticated, when the server key is missing, and when
 * required parameters are absent.
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
let savedKey;

beforeAll(async () => {
  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, $2) RETURNING id`,
    ['__TEST_MAPS_REPAIR__', 'pro']
  );
  accountId = acct.id;

  const hash = await bcrypt.hash('pw123', 10);
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [accountId, 'Maps Test Owner', `maps-repair-${Date.now()}@fieldcore.test`, hash, 'owner']
  );
  userId = user.id;
  token  = makeToken(userId, accountId, 'owner');
});

afterAll(async () => {
  await pool.query(`DELETE FROM accounts WHERE id = $1`, [accountId]);
  await pool.end();
});

beforeEach(() => {
  savedKey = process.env.GOOGLE_MAPS_API_KEY;
});

afterEach(() => {
  if (savedKey !== undefined) {
    process.env.GOOGLE_MAPS_API_KEY = savedKey;
  } else {
    delete process.env.GOOGLE_MAPS_API_KEY;
  }
});

// ── Authentication guard ──────────────────────────────────────────────────────

describe('Maps routes — authentication', () => {
  test('GET /api/maps/geocode requires auth', async () => {
    const res = await request(app).get('/api/maps/geocode?address=Tampa+FL');
    expect(res.status).toBe(401);
  });

  test('GET /api/maps/autocomplete requires auth', async () => {
    const res = await request(app).get('/api/maps/autocomplete?input=Tampa');
    expect(res.status).toBe(401);
  });

  test('POST /api/maps/route requires auth', async () => {
    const res = await request(app).post('/api/maps/route').send({
      origin:      { address: '1 Main St Tampa FL' },
      destination: { address: '2 Oak Ave Tampa FL' },
    });
    expect(res.status).toBe(401);
  });
});

// ── Missing server key — graceful degradation ─────────────────────────────────

describe('Maps routes — missing GOOGLE_MAPS_API_KEY', () => {
  beforeEach(() => {
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  test('GET /api/maps/geocode returns 503 when key is absent', async () => {
    const res = await request(app)
      .get('/api/maps/geocode?address=Tampa+FL')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty('error');
  });

  test('GET /api/maps/autocomplete returns empty predictions when key is absent', async () => {
    const res = await request(app)
      .get('/api/maps/autocomplete?input=Tampa')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ predictions: [] });
  });

  test('POST /api/maps/route returns 503 when key is absent', async () => {
    const res = await request(app)
      .post('/api/maps/route')
      .set('Authorization', `Bearer ${token}`)
      .send({
        origin:      { address: '1 Main St Tampa FL' },
        destination: { address: '2 Oak Ave Tampa FL' },
      });
    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty('error');
  });
});

// ── Missing required parameters ────────────────────────────────────────────────

describe('Maps routes — missing required params', () => {
  test('GET /api/maps/geocode 400 when address is missing', async () => {
    const res = await request(app)
      .get('/api/maps/geocode')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/address/i);
  });

  test('GET /api/maps/geocode 400 when address is empty string', async () => {
    const res = await request(app)
      .get('/api/maps/geocode?address=')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  test('POST /api/maps/route 400 when origin is missing', async () => {
    const res = await request(app)
      .post('/api/maps/route')
      .set('Authorization', `Bearer ${token}`)
      .send({ destination: { address: '2 Oak Ave Tampa FL' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/origin/i);
  });

  test('POST /api/maps/route 400 when destination is missing', async () => {
    const res = await request(app)
      .post('/api/maps/route')
      .set('Authorization', `Bearer ${token}`)
      .send({ origin: { address: '1 Main St Tampa FL' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/destination/i);
  });
});

// ── Autocomplete input validation ─────────────────────────────────────────────

describe('GET /api/maps/autocomplete — input validation', () => {
  test('returns empty predictions when input is too short (< 3 chars)', async () => {
    const res = await request(app)
      .get('/api/maps/autocomplete?input=Ta')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ predictions: [] });
  });

  test('returns empty predictions when input is missing', async () => {
    const res = await request(app)
      .get('/api/maps/autocomplete')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ predictions: [] });
  });
});

// ── /api/maps/place-details — auth and input validation ──────────────────────

describe('GET /api/maps/place-details — authentication', () => {
  test('requires auth', async () => {
    const res = await request(app).get('/api/maps/place-details?placeId=ChIJN1t_tDeuEmsRUsoyG83frY4');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/maps/place-details — missing GOOGLE_MAPS_API_KEY', () => {
  beforeEach(() => { delete process.env.GOOGLE_MAPS_API_KEY; });

  test('returns 503 when key is absent', async () => {
    const res = await request(app)
      .get('/api/maps/place-details?placeId=ChIJN1t_tDeuEmsRUsoyG83frY4')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty('error');
  });
});

describe('GET /api/maps/place-details — input validation', () => {
  test('returns 400 when placeId is missing', async () => {
    const res = await request(app)
      .get('/api/maps/place-details')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/placeId/i);
  });

  test('returns 400 when placeId is empty string', async () => {
    const res = await request(app)
      .get('/api/maps/place-details?placeId=')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/maps/place-details — key never exposed in responses', () => {
  const dummyKey = 'AIzaFAKEKEY_place_details_test_only';

  beforeEach(() => { process.env.GOOGLE_MAPS_API_KEY = dummyKey; });

  test('error response does not contain the API key', async () => {
    const res = await request(app)
      .get('/api/maps/place-details?placeId=INVALID_PLACE_ID_FOR_TESTING')
      .set('Authorization', `Bearer ${token}`);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(dummyKey);
  });
});

// ── Frontend isolation — server key never referenced in browser code ──────────

describe('AddressAutocomplete.jsx — server key isolation', () => {
  const fs   = require('fs');
  const path = require('path');

  const source = fs.readFileSync(
    path.resolve(__dirname, '../../client/src/components/AddressAutocomplete.jsx'),
    'utf8',
  );

  test('does not reference GOOGLE_MAPS_SERVER_KEY', () => {
    expect(source).not.toContain('GOOGLE_MAPS_SERVER_KEY');
  });

  test('does not reference process.env in browser component', () => {
    expect(source).not.toContain('process.env');
  });

  test('does not import loadGoogleMaps or Maps libraries directly', () => {
    expect(source).not.toContain('loadGoogleMaps');
    expect(source).not.toContain('useMapsLibrary');
    expect(source).not.toContain('google.maps.places');
  });

  test('uses server proxy endpoint, not Google directly', () => {
    expect(source).toContain('/maps/autocomplete');
    expect(source).toContain('/maps/place-details');
  });
});

// ── Key masking — responses never expose the raw API key ─────────────────────

describe('Maps routes — key never exposed in responses', () => {
  const dummyKey = 'AIzaFAKEKEY_for_testing_purposes_only';

  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = dummyKey;
  });

  test('geocode error response does not contain the API key', async () => {
    const res = await request(app)
      .get('/api/maps/geocode?address=NOTAREALPLACE_12345_XYZZY')
      .set('Authorization', `Bearer ${token}`);
    // Request may fail (no valid key) but the response must never leak the key
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(dummyKey);
  });

  test('route error response does not contain the API key', async () => {
    const res = await request(app)
      .post('/api/maps/route')
      .set('Authorization', `Bearer ${token}`)
      .send({
        origin:      { address: '1 Main St Tampa FL' },
        destination: { address: '2 Oak Ave Tampa FL' },
      });
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(dummyKey);
  });
});
