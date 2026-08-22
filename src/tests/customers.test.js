'use strict';
/**
 * Customers V1 — Integration Tests
 *
 * Covers: Top Clients, LTV eligibility, LTV calculation, churn classification,
 * segment CRUD, segment analytics, tenant isolation, export, permission enforcement.
 *
 * Requires a live DATABASE_URL. Run with --runInBand.
 */
require('dotenv').config();
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const app     = require('../app');
const pool    = require('../db/pool');
const custSvc = require('../services/customerAnalyticsService');

function makeToken(userId, accountId, role = 'owner') {
  return jwt.sign({ userId, accountId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

let accountId, userId, token;
let otherAccountId, otherUserId, otherToken;
let clientA, clientB, clientC;

const NOW_ISO = new Date().toISOString().slice(0, 10);

// A date 8 months ago — puts us well past the 6-month LTV eligibility gate
function monthsAgo(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString();
}

beforeAll(async () => {
  const hash = await bcrypt.hash('pw123', 10);

  // Primary tenant
  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1,$2) RETURNING id`,
    [`__TEST_CUST_${Date.now()}__`, 'pro']
  );
  accountId = acct.id;

  const { rows: [u] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [accountId, 'Cust Owner', `cust-owner-${Date.now()}@test.fc`, hash, 'owner']
  );
  userId = u.id;
  token  = makeToken(userId, accountId, 'owner');

  // Second tenant (isolation)
  const { rows: [acct2] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1,$2) RETURNING id`,
    [`__TEST_CUST_OTHER_${Date.now()}__`, 'pro']
  );
  otherAccountId = acct2.id;
  const { rows: [u2] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [otherAccountId, 'Other Owner', `cust-other-${Date.now()}@test.fc`, hash, 'owner']
  );
  otherUserId = u2.id;
  otherToken  = makeToken(otherUserId, otherAccountId, 'owner');

  // Seed business_profiles
  await pool.query(
    `INSERT INTO business_profiles (account_id, business_name, timezone)
     VALUES ($1,$2,$3) ON CONFLICT (account_id) DO NOTHING`,
    [accountId, 'Test Biz', 'America/New_York']
  );

  // Seed three clients for primary tenant
  const insertClient = async (name) => {
    const { rows: [c] } = await pool.query(
      `INSERT INTO clients (account_id, name) VALUES ($1,$2) RETURNING id`,
      [accountId, name]
    );
    return c.id;
  };
  clientA = await insertClient('Alpha Corp');
  clientB = await insertClient('Beta LLC');
  clientC = await insertClient('Gamma Inc');

  // Client for second tenant (isolation check)
  await pool.query(
    `INSERT INTO clients (account_id, name) VALUES ($1,$2)`,
    [otherAccountId, 'Other Client']
  );

  // Jobs: clientA has 4 complete jobs spanning 8 months
  //        clientB has 2 complete jobs (within the last 45 days → ACTIVE for a 60-day threshold)
  //        clientC has 1 complete job 100 days ago → AT_RISK for a 60-day threshold
  const insertJob = (clientId, amount, status, scheduledAt) => pool.query(
    `INSERT INTO jobs (account_id, client_id, service_type, amount, status, scheduled_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [accountId, clientId, 'Test Service', amount, status, scheduledAt]
  );

  // clientA: highest revenue, oldest → newest jobs (8 months span)
  await insertJob(clientA, 300, 'complete', monthsAgo(8));
  await insertJob(clientA, 400, 'complete', monthsAgo(4));
  await insertJob(clientA, 200, 'complete', monthsAgo(1));
  await insertJob(clientA, 150, 'cancelled', monthsAgo(0.5)); // cancelled — excluded from revenue

  // clientB: 2 complete jobs, last one 20 days ago → ACTIVE
  await insertJob(clientB, 200, 'complete', monthsAgo(7));
  await insertJob(clientB, 100, 'complete', monthsAgo(20 / 30));

  // clientC: 1 complete job 100 days ago (> 60-day threshold, ≤ 120 → AT_RISK)
  await insertJob(clientC, 50, 'complete', monthsAgo(100 / 30));
});

afterAll(async () => {
  // Clean up test data in dependency order
  await pool.query(`DELETE FROM client_segment_assignments WHERE account_id IN ($1,$2)`, [accountId, otherAccountId]);
  await pool.query(`DELETE FROM client_segments WHERE account_id IN ($1,$2)`, [accountId, otherAccountId]);
  await pool.query(`DELETE FROM jobs WHERE account_id IN ($1,$2)`, [accountId, otherAccountId]);
  await pool.query(`DELETE FROM clients WHERE account_id IN ($1,$2)`, [accountId, otherAccountId]);
  await pool.query(`DELETE FROM business_profiles WHERE account_id IN ($1,$2)`, [accountId, otherAccountId]);
  await pool.query(`DELETE FROM users WHERE id IN ($1,$2)`, [userId, otherUserId]);
  await pool.query(`DELETE FROM accounts WHERE id IN ($1,$2)`, [accountId, otherAccountId]);
  await pool.end();
});

// ── Top Clients ───────────────────────────────────────────────────────────────

describe('GET /api/revenue/customers/overview — Top Clients', () => {
  it('returns top clients ordered by earned revenue', async () => {
    const res = await request(app)
      .get('/api/revenue/customers/overview')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const { topClients } = res.body;
    expect(Array.isArray(topClients)).toBe(true);
    expect(topClients.length).toBeGreaterThanOrEqual(2);
    // clientA should be first (total 900 in complete jobs)
    expect(topClients[0].name).toBe('Alpha Corp');
    // Cancelled job should NOT be counted
    const alpha = topClients.find(c => c.name === 'Alpha Corp');
    expect(parseFloat(alpha.earned_revenue)).toBeCloseTo(900, 1);
  });

  it('returns activeClientCount in summary', async () => {
    const res = await request(app)
      .get('/api/revenue/customers/overview')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(typeof res.body.summary?.activeClientCount).toBe('number');
    expect(res.body.summary.activeClientCount).toBeGreaterThanOrEqual(1);
  });

  it('tenant isolation — cannot see other account clients', async () => {
    const res = await request(app)
      .get('/api/revenue/customers/overview')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);

    const { topClients } = res.body;
    const names = (topClients || []).map(c => c.name);
    expect(names).not.toContain('Alpha Corp');
    expect(names).not.toContain('Beta LLC');
  });

  it('returns 200 with start+end date params — regression: j alias in active count query', async () => {
    // Production always sends ?start=YYYY-MM-DD&end=YYYY-MM-DD. The dateFilter
    // references j.scheduled_at, which requires a `j` alias on the FROM clause.
    // Without the alias, PostgreSQL throws "missing FROM-clause entry for table j"
    // and the entire Promise.all rejects with 500. This test must pass date params.
    const start = monthsAgo(6).slice(0, 10);
    const end   = new Date().toISOString().slice(0, 10);

    const res = await request(app)
      .get('/api/revenue/customers/overview')
      .query({ start, end })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('topClients');
    expect(res.body).toHaveProperty('summary');
    expect(res.body).toHaveProperty('lifetimeValue');
    expect(res.body).toHaveProperty('churn');
    expect(res.body).toHaveProperty('segments');
  });

  it('requires authentication', async () => {
    await request(app)
      .get('/api/revenue/customers/overview')
      .expect(401);
  });
});

// ── LTV ───────────────────────────────────────────────────────────────────────

describe('customerAnalyticsService.getLtv', () => {
  it('returns eligible:false with INSUFFICIENT_HISTORY for a new account', async () => {
    // otherAccountId has no jobs
    const result = await custSvc.getLtv(otherAccountId);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('INSUFFICIENT_HISTORY');
    expect(result.data).toBeNull();
  });

  it('returns eligible:true and correct metrics when history spans >= 6 months', async () => {
    const result = await custSvc.getLtv(accountId);
    expect(result.eligible).toBe(true);
    expect(result.data).not.toBeNull();
    // clientA: 900, clientB: 300, clientC: 50 — avg = (900+300+50)/3 = 416.67
    expect(result.data.avgRevenuePerCustomer).toBeCloseTo(416.67, 0);
    // median = sorted [50, 300, 900] → 300
    expect(result.data.medianRevenuePerCustomer).toBeCloseTo(300, 0);
    expect(result.data.totalCustomers).toBe(3);
    expect(result.data.avgTicket).toBeGreaterThan(0);
  });

  it('includes topCustomers with names', async () => {
    const result = await custSvc.getLtv(accountId);
    expect(Array.isArray(result.data?.topCustomers)).toBe(true);
    const names = result.data.topCustomers.map(c => c.name);
    expect(names).toContain('Alpha Corp');
  });

  it('does not cross tenant boundary', async () => {
    const resultA = await custSvc.getLtv(accountId);
    const resultB = await custSvc.getLtv(otherAccountId);
    // Primary account has history; other account should not see it
    expect(resultA.eligible).toBe(true);
    expect(resultB.eligible).toBe(false);
  });
});

// ── Churn Analysis ────────────────────────────────────────────────────────────

describe('customerAnalyticsService.getChurnAnalysis', () => {
  it('returns configured:false when no inactivity threshold set', async () => {
    // otherAccountId has no business_profile entry or NULL threshold
    const result = await custSvc.getChurnAnalysis(otherAccountId);
    expect(result.configured).toBe(false);
    expect(result.inactivityDays).toBeNull();
  });

  it('correctly classifies clients after setting threshold', async () => {
    // clientC's job is ~122 days ago (monthsAgo(100/30) truncates setMonth to 4 months).
    // Use threshold=90 so AT_RISK window is 90–180 days — clientC falls in AT_RISK.
    await pool.query(
      `INSERT INTO business_profiles (account_id, business_name, timezone, customer_inactivity_days)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (account_id) DO UPDATE SET customer_inactivity_days = $4`,
      [accountId, 'Test Biz', 'America/New_York', 90]
    );

    const result = await custSvc.getChurnAnalysis(accountId);
    expect(result.configured).toBe(true);
    expect(result.inactivityDays).toBe(90);
    expect(result.counts).not.toBeNull();

    // clientA: last complete job ~30 days ago → ≤ 90 → ACTIVE
    // clientB: last complete job ~20 days ago → ≤ 90 → ACTIVE
    // clientC: last complete job ~122 days ago → > 90, ≤ 180 → AT_RISK
    expect(result.counts.active).toBeGreaterThanOrEqual(2);
    expect(result.counts.atRisk).toBeGreaterThanOrEqual(1);
    expect(result.counts.total).toBe(3);
  });

  it('populates atRiskClients with correct fields', async () => {
    const result = await custSvc.getChurnAnalysis(accountId);
    expect(Array.isArray(result.atRiskClients)).toBe(true);
    if (result.atRiskClients.length > 0) {
      const client = result.atRiskClients[0];
      expect(typeof client.id).toBe('string');
      expect(typeof client.name).toBe('string');
      expect(typeof client.daysSinceLastJob).toBe('number');
      expect(typeof client.totalJobs).toBe('number');
    }
  });

  it('excludes clients with 0 completed jobs', async () => {
    // Insert a client with no complete jobs
    const { rows: [newClient] } = await pool.query(
      `INSERT INTO clients (account_id, name) VALUES ($1,$2) RETURNING id`,
      [accountId, 'Zero Jobs Client']
    );
    await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, amount, status, scheduled_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [accountId, newClient.id, 'Test', 100, 'cancelled', monthsAgo(200 / 30)]
    );

    const result = await custSvc.getChurnAnalysis(accountId);
    const names = [
      ...result.atRiskClients.map(c => c.name),
    ];
    expect(names).not.toContain('Zero Jobs Client');

    // Cleanup
    await pool.query(`DELETE FROM jobs WHERE client_id = $1`, [newClient.id]);
    await pool.query(`DELETE FROM clients WHERE id = $1`, [newClient.id]);
  });
});

// ── Segment Management ────────────────────────────────────────────────────────

describe('Segment CRUD — /api/clients/segments', () => {
  let segmentId;

  it('creates a segment', async () => {
    const res = await request(app)
      .post('/api/clients/segments')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Residential', color: '#4CAF50' })
      .expect(201);

    expect(res.body.name).toBe('Residential');
    expect(res.body.account_id).toBe(accountId);
    segmentId = res.body.id;
  });

  it('rejects duplicate segment name in same account', async () => {
    await request(app)
      .post('/api/clients/segments')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Residential' })
      .expect(409);
  });

  it('lists segments with client count', async () => {
    const res = await request(app)
      .get('/api/clients/segments')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const found = res.body.find(s => s.name === 'Residential');
    expect(found).toBeDefined();
    expect(typeof found.client_count).toBe('number');
  });

  it('assigns a client to a segment', async () => {
    const res = await request(app)
      .post(`/api/clients/${clientA}/segments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ segmentId })
      .expect(201);

    expect(res.body).toBeDefined();
  });

  it('is idempotent on double-assignment', async () => {
    await request(app)
      .post(`/api/clients/${clientA}/segments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ segmentId })
      .expect(201);
  });

  it('removes a client-segment assignment', async () => {
    await request(app)
      .delete(`/api/clients/${clientA}/segments/${segmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('deletes the segment', async () => {
    await request(app)
      .delete(`/api/clients/segments/${segmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('tenant isolation — cannot delete other account segment', async () => {
    const { rows: [seg] } = await pool.query(
      `INSERT INTO client_segments (account_id, name) VALUES ($1,$2) RETURNING id`,
      [otherAccountId, 'Other Seg']
    );
    await request(app)
      .delete(`/api/clients/segments/${seg.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    // Cleanup
    await pool.query(`DELETE FROM client_segments WHERE id = $1`, [seg.id]);
  });
});

// ── Segment Analytics ─────────────────────────────────────────────────────────

describe('customerAnalyticsService.getSegmentAnalysis', () => {
  let seg1Id, seg2Id;

  beforeAll(async () => {
    // Create 2 segments and assign clients
    const { rows: [s1] } = await pool.query(
      `INSERT INTO client_segments (account_id, name, color) VALUES ($1,$2,$3) RETURNING id`,
      [accountId, 'Residential', '#4CAF50']
    );
    const { rows: [s2] } = await pool.query(
      `INSERT INTO client_segments (account_id, name, color) VALUES ($1,$2,$3) RETURNING id`,
      [accountId, 'Commercial', '#2196F3']
    );
    seg1Id = s1.id;
    seg2Id = s2.id;

    // clientA in both segments (multi-tag), clientB in Residential only
    await pool.query(
      `INSERT INTO client_segment_assignments (account_id, client_id, segment_id)
       VALUES ($1,$2,$3),($1,$2,$4),($1,$5,$3)`,
      [accountId, clientA, seg1Id, seg2Id, clientB]
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM client_segment_assignments WHERE segment_id IN ($1,$2)`, [seg1Id, seg2Id]);
    await pool.query(`DELETE FROM client_segments WHERE id IN ($1,$2)`, [seg1Id, seg2Id]);
  });

  it('returns configured:true with segment data', async () => {
    const result = await custSvc.getSegmentAnalysis(accountId);
    expect(result.configured).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBe(2);
  });

  it('includes earnedRevenue, avgTicket, revenueShare per segment', async () => {
    const result = await custSvc.getSegmentAnalysis(accountId);
    for (const seg of result.data) {
      expect(typeof seg.earnedRevenue).toBe('number');
      expect(typeof seg.revenueShare).toBe('number');
      expect(seg.clientCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('multi-tag revenue shares may sum > 100%', async () => {
    const result = await custSvc.getSegmentAnalysis(accountId);
    const totalShare = result.data.reduce((a, s) => a + s.revenueShare, 0);
    // clientA is in both → Residential gets its revenue AND Commercial gets its revenue → > 100%
    expect(totalShare).toBeGreaterThan(100);
  });

  it('returns configured:false when no segments exist', async () => {
    const result = await custSvc.getSegmentAnalysis(otherAccountId);
    expect(result.configured).toBe(false);
  });

  it('period scoping filters revenue by date', async () => {
    // Use a very narrow date range that excludes all jobs
    const result = await custSvc.getSegmentAnalysis(accountId, {
      start: '2000-01-01',
      end:   '2000-01-02',
    });
    if (result.data) {
      for (const seg of result.data) {
        expect(seg.earnedRevenue).toBe(0);
        expect(seg.jobCount).toBe(0);
      }
    }
  });
});

// ── Export ────────────────────────────────────────────────────────────────────

describe('GET /api/revenue/export?type=customers', () => {
  it('returns CSV with correct headers', async () => {
    const res = await request(app)
      .get('/api/revenue/export')
      .query({ type: 'customers', start: '2020-01-01', end: NOW_ISO })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('Client Name');
    expect(res.text).toContain('Alpha Corp');
  });

  it('requires authentication', async () => {
    await request(app)
      .get('/api/revenue/export')
      .query({ type: 'customers' })
      .expect(401);
  });
});

// ── Business Settings — customer_inactivity_days ──────────────────────────────

describe('PUT /api/business-settings/profile — customer_inactivity_days', () => {
  it('saves and retrieves customer_inactivity_days', async () => {
    await request(app)
      .put('/api/business-settings/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ business_name: 'Test Biz', timezone: 'America/New_York', customer_inactivity_days: 90 })
      .expect(200);

    const res = await request(app)
      .get('/api/business-settings')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.profile.customer_inactivity_days).toBe(90);
  });

  it('rejects out-of-range customer_inactivity_days', async () => {
    await request(app)
      .put('/api/business-settings/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ business_name: 'Test Biz', timezone: 'America/New_York', customer_inactivity_days: 5000 })
      .expect(400);
  });

  it('allows clearing the threshold with null', async () => {
    await request(app)
      .put('/api/business-settings/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ business_name: 'Test Biz', timezone: 'America/New_York', customer_inactivity_days: null })
      .expect(200);
  });
});
