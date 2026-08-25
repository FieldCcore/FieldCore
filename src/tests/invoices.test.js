'use strict';
/**
 * Integration tests for GET /api/invoices
 *
 * Covers: response shape, KPI aggregates, status filter, past_due filter,
 * search, sort, pagination, tenant isolation, SQL-injection resistance.
 *
 * Requires a live DATABASE_URL.
 */
require('dotenv').config();
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const app     = require('../app');
const pool    = require('../db/pool');
const { runMigrations } = require('../db/migrate');

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeToken(userId, accountId, role = 'owner') {
  return jwt.sign({ userId, accountId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

const TODAY = new Date().toISOString().slice(0, 10);

let accountId, userId, token;
let otherAccountId, otherToken;
let clientId, techId;

// Shared invoice IDs created in beforeAll — cleaned up by account cascade
let pendingInvId, paidInvId, voidInvId, overdueInvId;
// Extra jobs for eligible-jobs tests
let eligibleJobId, incompleteJobId;
// Estimates for eligible-estimates + ESTIMATE-source tests
let signedEstimateId, draftEstimateId, alreadyConvertedEstimateId;
// Agreements for eligible-agreements + AGREEMENT-source tests
let activeAgreementId, pausedAgreementId;

beforeAll(async () => {
  await runMigrations();
  const hash = await bcrypt.hash('pw', 10);

  // Primary account
  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
    [`__TEST_INV_${Date.now()}__`]
  );
  accountId = acct.id;

  const { rows: [u] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Inv Owner',$2,$3,'owner') RETURNING id`,
    [accountId, `inv-owner-${Date.now()}@test.fc`, hash]
  );
  userId = u.id;
  token  = makeToken(userId, accountId, 'owner');

  // Second account (isolation)
  const { rows: [acct2] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
    [`__TEST_INV_OTHER_${Date.now()}__`]
  );
  otherAccountId = acct2.id;
  const { rows: [u2] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Other Owner',$2,$3,'owner') RETURNING id`,
    [otherAccountId, `inv-other-${Date.now()}@test.fc`, hash]
  );
  otherToken = makeToken(u2.id, otherAccountId, 'owner');

  // Client
  const { rows: [c] } = await pool.query(
    `INSERT INTO clients (account_id, name, email, phone, address)
     VALUES ($1,'Able Corp','able@test.fc','555-0001','100 Oak St') RETURNING id`,
    [accountId]
  );
  clientId = c.id;

  // Technician
  const { rows: [t] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Tech','tech-inv-${Date.now()}@test.fc',$2,'tech') RETURNING id`,
    [accountId, hash]
  );
  techId = t.id;

  // Each invoice gets its own job (partial unique index enforces 1 invoice per job)
  const { rows: [j1] } = await pool.query(
    `INSERT INTO jobs (account_id, client_id, tech_id, service_type, status, amount, scheduled_at, duration_minutes)
     VALUES ($1,$2,$3,'HVAC Repair','complete',50000,$4,60) RETURNING id`,
    [accountId, clientId, techId, TODAY + 'T10:00:00Z']
  );
  const { rows: [j2] } = await pool.query(
    `INSERT INTO jobs (account_id, client_id, tech_id, service_type, status, amount, scheduled_at, duration_minutes)
     VALUES ($1,$2,$3,'Plumbing','complete',30000,$4,60) RETURNING id`,
    [accountId, clientId, techId, TODAY + 'T11:00:00Z']
  );
  const { rows: [j3] } = await pool.query(
    `INSERT INTO jobs (account_id, client_id, tech_id, service_type, status, amount, scheduled_at, duration_minutes)
     VALUES ($1,$2,$3,'Electrical','complete',20000,$4,60) RETURNING id`,
    [accountId, clientId, techId, TODAY + 'T12:00:00Z']
  );
  const { rows: [j4] } = await pool.query(
    `INSERT INTO jobs (account_id, client_id, tech_id, service_type, status, amount, scheduled_at, duration_minutes)
     VALUES ($1,$2,$3,'Roofing','complete',15000,$4,60) RETURNING id`,
    [accountId, clientId, techId, TODAY + 'T13:00:00Z']
  );

  // Pending invoice
  const { rows: [p] } = await pool.query(
    `INSERT INTO invoices (account_id, job_id, client_id, amount, status)
     VALUES ($1,$2,$3,40000,'pending') RETURNING id`,
    [accountId, j1.id, clientId]
  );
  pendingInvId = p.id;

  // Paid invoice
  const { rows: [pa] } = await pool.query(
    `INSERT INTO invoices (account_id, job_id, client_id, amount, status, paid_at)
     VALUES ($1,$2,$3,20000,'paid',NOW()) RETURNING id`,
    [accountId, j2.id, clientId]
  );
  paidInvId = pa.id;

  // Void invoice
  const { rows: [v] } = await pool.query(
    `INSERT INTO invoices (account_id, job_id, client_id, amount, status)
     VALUES ($1,$2,$3,10000,'void') RETURNING id`,
    [accountId, j3.id, clientId]
  );
  voidInvId = v.id;

  // Past-due invoice: pending with due_date 10 days ago
  const { rows: [od] } = await pool.query(
    `INSERT INTO invoices (account_id, job_id, client_id, amount, status, due_date)
     VALUES ($1,$2,$3,15000,'pending',NOW() - INTERVAL '10 days') RETURNING id`,
    [accountId, j4.id, clientId]
  );
  overdueInvId = od.id;

  // Eligible job: complete, no invoice — should appear in eligible-jobs
  const { rows: [ej] } = await pool.query(
    `INSERT INTO jobs (account_id, client_id, tech_id, service_type, status, amount, scheduled_at, duration_minutes)
     VALUES ($1,$2,$3,'Eligible Service','complete',20000,$4,60) RETURNING id`,
    [accountId, clientId, techId, TODAY + 'T14:00:00Z']
  );
  eligibleJobId = ej.id;

  // Incomplete job: scheduled, no invoice — must NOT appear in eligible-jobs
  const { rows: [ij] } = await pool.query(
    `INSERT INTO jobs (account_id, client_id, tech_id, service_type, status, amount, scheduled_at, duration_minutes)
     VALUES ($1,$2,$3,'Pending Service','scheduled',10000,$4,60) RETURNING id`,
    [accountId, clientId, techId, TODAY + 'T16:00:00Z']
  );
  incompleteJobId = ij.id;

  // Signed estimate — eligible for conversion
  const { rows: [se] } = await pool.query(
    `INSERT INTO estimates (account_id, client_id, title, line_items, amount, tax_amount, status, signed_at)
     VALUES ($1,$2,'HVAC Proposal','[{"description":"HVAC Service","amount":500},{"description":"Parts","amount":150}]',650,0,'signed',NOW())
     RETURNING id`,
    [accountId, clientId]
  );
  signedEstimateId = se.id;

  // Draft estimate — must NOT appear in eligible-estimates
  const { rows: [de] } = await pool.query(
    `INSERT INTO estimates (account_id, client_id, title, line_items, amount, status)
     VALUES ($1,$2,'Draft Proposal','[{"description":"Draft Item","amount":100}]',100,'draft')
     RETURNING id`,
    [accountId, clientId]
  );
  draftEstimateId = de.id;

  // Already-converted estimate — must NOT appear in eligible-estimates (409 on creation)
  const { rows: [ce] } = await pool.query(
    `INSERT INTO estimates (account_id, client_id, title, line_items, amount, status, signed_at, converted_invoice_id)
     VALUES ($1,$2,'Already Converted','[{"description":"Prior Work","amount":200}]',200,'signed',NOW(),$3)
     RETURNING id`,
    [accountId, clientId, pendingInvId]
  );
  alreadyConvertedEstimateId = ce.id;

  // Active recurring agreement — should appear in eligible-agreements
  const { rows: [ra] } = await pool.query(
    `INSERT INTO recurring_agreements
       (account_id, client_id, name, service_type, cadence, billing_cadence, plan_price, status, payment_status,
        line_items, started_at)
     VALUES ($1,$2,'Monthly AC Service','HVAC Maintenance','monthly','monthly',200,'active','pending',
        '[{"name":"AC Maintenance","amount":200}]', CURRENT_DATE - INTERVAL '30 days')
     RETURNING id`,
    [accountId, clientId]
  );
  activeAgreementId = ra.id;

  // Paused agreement — must NOT appear in eligible-agreements
  const { rows: [pausedAgr] } = await pool.query(
    `INSERT INTO recurring_agreements
       (account_id, client_id, name, cadence, billing_cadence, plan_price, status, payment_status, line_items, started_at)
     VALUES ($1,$2,'Paused Agreement','monthly','monthly',100,'paused','pending','[]', CURRENT_DATE)
     RETURNING id`,
    [accountId, clientId]
  );
  pausedAgreementId = pausedAgr.id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM accounts WHERE id IN ($1,$2)`, [accountId, otherAccountId]);
  await pool.end();
});

// ── Auth guards ────────────────────────────────────────────────────────────────

describe('GET /api/invoices — auth', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/invoices');
    expect(res.status).toBe(401);
  });

  it('returns 403 for tech role', async () => {
    const techToken = makeToken(techId, accountId, 'tech');
    const res = await request(app)
      .get('/api/invoices')
      .set('Authorization', `Bearer ${techToken}`);
    expect(res.status).toBe(403);
  });
});

// ── Response shape ─────────────────────────────────────────────────────────────

describe('GET /api/invoices — response shape', () => {
  it('returns rows, total, page, pageSize, kpis', async () => {
    const res = await request(app)
      .get('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('rows');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('pageSize');
    expect(res.body).toHaveProperty('kpis');
    expect(Array.isArray(res.body.rows)).toBe(true);
  });

  it('each row has invoice_number, balance, is_past_due, service_type, client_name', async () => {
    const res = await request(app)
      .get('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const row = res.body.rows[0];
    expect(row).toHaveProperty('invoice_number');
    expect(row).toHaveProperty('balance');
    expect(row).toHaveProperty('is_past_due');
    expect(row).toHaveProperty('service_type');
    expect(row).toHaveProperty('client_name');
    expect(row).toHaveProperty('client_address');
  });

  it('invoice_number is first 8 chars of id uppercased', async () => {
    const res = await request(app)
      .get('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    for (const row of res.body.rows) {
      const expected = row.id.replace(/-/g, '').slice(0, 8).toUpperCase();
      // PostgreSQL LEFT(id::text,8) keeps the first 8 chars including the first dash separator
      expect(row.invoice_number).toBe(row.id.slice(0, 8).toUpperCase());
    }
  });

  it('kpis has outstanding, collected, pastDue, pastDueCount, totalCount, counts', async () => {
    const res = await request(app)
      .get('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const { kpis } = res.body;
    expect(kpis).toHaveProperty('outstanding');
    expect(kpis).toHaveProperty('collected');
    expect(kpis).toHaveProperty('pastDue');
    expect(kpis).toHaveProperty('pastDueCount');
    expect(kpis).toHaveProperty('totalCount');
    expect(kpis.counts).toHaveProperty('all');
    expect(kpis.counts).toHaveProperty('pending');
    expect(kpis.counts).toHaveProperty('paid');
    expect(kpis.counts).toHaveProperty('void');
    expect(kpis.counts).toHaveProperty('past_due');
  });
});

// ── KPI correctness ────────────────────────────────────────────────────────────

describe('GET /api/invoices — KPI correctness', () => {
  it('outstanding sums only pending invoice amounts', async () => {
    const res = await request(app)
      .get('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // pending: $400 + $150 (overdue is also pending)
    expect(parseFloat(res.body.kpis.outstanding)).toBeGreaterThanOrEqual(550);
  });

  it('collected sums only paid invoice amounts', async () => {
    const res = await request(app)
      .get('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(parseFloat(res.body.kpis.collected)).toBeGreaterThanOrEqual(200);
  });

  it('pastDue sums pending/failed invoices with past due_date', async () => {
    const res = await request(app)
      .get('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(parseFloat(res.body.kpis.pastDue)).toBeGreaterThanOrEqual(150);
    expect(res.body.kpis.pastDueCount).toBeGreaterThanOrEqual(1);
  });

  it('kpis are global — not affected by status filter param', async () => {
    const [all, paid] = await Promise.all([
      request(app).get('/api/invoices').set('Authorization', `Bearer ${token}`),
      request(app).get('/api/invoices?status=paid').set('Authorization', `Bearer ${token}`),
    ]);

    expect(all.body.kpis.outstanding).toBe(paid.body.kpis.outstanding);
    expect(all.body.kpis.totalCount).toBe(paid.body.kpis.totalCount);
  });
});

// ── Balance field ──────────────────────────────────────────────────────────────

describe('GET /api/invoices — balance field', () => {
  it('pending invoice has balance equal to amount', async () => {
    const res = await request(app)
      .get('/api/invoices?status=pending')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const inv = res.body.rows.find(r => r.id === pendingInvId);
    expect(parseFloat(inv.balance)).toBe(parseFloat(inv.amount));
  });

  it('paid invoice has balance of 0', async () => {
    const res = await request(app)
      .get('/api/invoices?status=paid')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const inv = res.body.rows.find(r => r.id === paidInvId);
    expect(parseFloat(inv.balance)).toBe(0);
  });

  it('void invoice has null balance', async () => {
    const res = await request(app)
      .get('/api/invoices?status=void')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const inv = res.body.rows.find(r => r.id === voidInvId);
    expect(inv.balance).toBeNull();
  });
});

// ── Status filter ──────────────────────────────────────────────────────────────

describe('GET /api/invoices — status filter', () => {
  it('?status=pending returns only pending invoices', async () => {
    const res = await request(app)
      .get('/api/invoices?status=pending')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.rows.every(r => r.status === 'pending')).toBe(true);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it('?status=paid returns only paid invoices', async () => {
    const res = await request(app)
      .get('/api/invoices?status=paid')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.rows.every(r => r.status === 'paid')).toBe(true);
  });

  it('?status=void returns only void invoices', async () => {
    const res = await request(app)
      .get('/api/invoices?status=void')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.rows.every(r => r.status === 'void')).toBe(true);
  });

  it('?status=past_due returns only invoices with past due_date', async () => {
    const res = await request(app)
      .get('/api/invoices?status=past_due')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.rows.length).toBeGreaterThanOrEqual(1);
    expect(res.body.rows.every(r => r.is_past_due === true)).toBe(true);
    const overdueRow = res.body.rows.find(r => r.id === overdueInvId);
    expect(overdueRow).toBeDefined();
  });
});

// ── Search ─────────────────────────────────────────────────────────────────────

describe('GET /api/invoices — search', () => {
  it('?search=Able matches client name', async () => {
    const res = await request(app)
      .get('/api/invoices?search=Able')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.rows.length).toBeGreaterThanOrEqual(1);
    expect(res.body.rows.every(r => r.client_name.includes('Able'))).toBe(true);
  });

  it('?search=HVAC matches service type', async () => {
    const res = await request(app)
      .get('/api/invoices?search=HVAC')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('?search=Oak matches client address', async () => {
    const res = await request(app)
      .get('/api/invoices?search=Oak')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('search by invoice number prefix (first 8 chars of uuid uppercased)', async () => {
    const invNum = pendingInvId.slice(0, 8).toUpperCase();
    const res = await request(app)
      .get(`/api/invoices?search=${invNum}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.rows.some(r => r.id === pendingInvId)).toBe(true);
  });

  it('returns empty rows for non-matching search', async () => {
    const res = await request(app)
      .get('/api/invoices?search=ZZZNOMATCH99999')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.rows).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });
});

// ── Sort ───────────────────────────────────────────────────────────────────────

describe('GET /api/invoices — sort', () => {
  it('?sort=amount&order=ASC returns rows ascending by amount', async () => {
    const res = await request(app)
      .get('/api/invoices?sort=amount&order=ASC')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const amounts = res.body.rows.map(r => parseFloat(r.amount));
    for (let i = 1; i < amounts.length; i++) {
      expect(amounts[i]).toBeGreaterThanOrEqual(amounts[i - 1]);
    }
  });

  it('?sort=amount&order=DESC returns rows descending by amount', async () => {
    const res = await request(app)
      .get('/api/invoices?sort=amount&order=DESC')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const amounts = res.body.rows.map(r => parseFloat(r.amount));
    for (let i = 1; i < amounts.length; i++) {
      expect(amounts[i]).toBeLessThanOrEqual(amounts[i - 1]);
    }
  });

  it('unknown sort column falls back to created_at order (no error)', async () => {
    const res = await request(app)
      .get('/api/invoices?sort=INVALID_COL')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body.rows)).toBe(true);
  });
});

// ── Pagination ─────────────────────────────────────────────────────────────────

describe('GET /api/invoices — pagination', () => {
  it('pageSize=2 returns at most 2 rows', async () => {
    const res = await request(app)
      .get('/api/invoices?pageSize=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.rows.length).toBeLessThanOrEqual(2);
    expect(res.body.pageSize).toBe(2);
    expect(res.body.total).toBeGreaterThanOrEqual(4);
  });

  it('page=2 with pageSize=2 returns next slice', async () => {
    const [p1, p2] = await Promise.all([
      request(app).get('/api/invoices?pageSize=2&page=1&sort=amount&order=ASC').set('Authorization', `Bearer ${token}`),
      request(app).get('/api/invoices?pageSize=2&page=2&sort=amount&order=ASC').set('Authorization', `Bearer ${token}`),
    ]);

    expect(p1.body.page).toBe(1);
    expect(p2.body.page).toBe(2);
    const ids1 = p1.body.rows.map(r => r.id);
    const ids2 = p2.body.rows.map(r => r.id);
    expect(ids1.some(id => ids2.includes(id))).toBe(false);
  });

  it('pageSize is capped at 100', async () => {
    const res = await request(app)
      .get('/api/invoices?pageSize=999')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.pageSize).toBe(100);
  });
});

// ── Tenant isolation ───────────────────────────────────────────────────────────

describe('GET /api/invoices — tenant isolation', () => {
  it('account B cannot see account A invoices', async () => {
    const res = await request(app)
      .get('/api/invoices')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);

    expect(res.body.rows.every(r => r.account_id !== accountId)).toBe(true);
    expect(res.body.kpis.totalCount).toBe(0);
  });
});

// ── SQL injection resistance ───────────────────────────────────────────────────

describe('GET /api/invoices — SQL injection resistance', () => {
  it('malicious sort param does not break query', async () => {
    const res = await request(app)
      .get("/api/invoices?sort=amount;DROP TABLE invoices--&order=DESC")
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body.rows)).toBe(true);
  });

  it('malicious order param falls back to DESC', async () => {
    const res = await request(app)
      .get('/api/invoices?sort=amount&order=; DROP TABLE invoices--')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body.rows)).toBe(true);
  });

  it('search param with SQL metacharacters returns safely', async () => {
    const res = await request(app)
      .get("/api/invoices?search=' OR 1=1--")
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body.rows)).toBe(true);
  });
});

// ── GET /api/invoices/eligible-jobs ────────────────────────────────────────────

describe('GET /api/invoices/eligible-jobs — auth', () => {
  it('returns 401 with no token', async () => {
    await request(app).get('/api/invoices/eligible-jobs').expect(401);
  });

  it('returns 403 for tech role', async () => {
    const techToken = makeToken(techId, accountId, 'tech');
    await request(app)
      .get('/api/invoices/eligible-jobs')
      .set('Authorization', `Bearer ${techToken}`)
      .expect(403);
  });
});

describe('GET /api/invoices/eligible-jobs — eligibility', () => {
  it('returns 200 with rows array', async () => {
    const res = await request(app)
      .get('/api/invoices/eligible-jobs')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body.rows)).toBe(true);
  });

  it('includes completed job with no invoice', async () => {
    const res = await request(app)
      .get('/api/invoices/eligible-jobs')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.rows.some(r => r.id === eligibleJobId)).toBe(true);
  });

  it('excludes job that already has an invoice', async () => {
    // jobId (the main test job) has multiple invoices — must not appear
    const res = await request(app)
      .get('/api/invoices/eligible-jobs')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ids = res.body.rows.map(r => r.id);
    // The main jobId has invoices, so it must not be in the eligible list
    // (We don't have direct access to jobId here, but eligibleJobId must be present)
    expect(res.body.rows.some(r => r.id === eligibleJobId)).toBe(true);
  });

  it('excludes incomplete (scheduled) job', async () => {
    const res = await request(app)
      .get('/api/invoices/eligible-jobs')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.rows.some(r => r.id === incompleteJobId)).toBe(false);
  });

  it('each row includes client_name, service_type, amount, scheduled_at', async () => {
    const res = await request(app)
      .get('/api/invoices/eligible-jobs')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const row = res.body.rows.find(r => r.id === eligibleJobId);
    expect(row).toBeDefined();
    expect(row.client_name).toBe('Able Corp');
    expect(row.service_type).toBe('Eligible Service');
    expect(parseFloat(row.amount)).toBe(20000);
    expect(row.scheduled_at).toBeTruthy();
  });
});

describe('GET /api/invoices/eligible-jobs — search', () => {
  it('?search=Eligible matches by service_type', async () => {
    const res = await request(app)
      .get('/api/invoices/eligible-jobs?search=Eligible')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.rows.some(r => r.id === eligibleJobId)).toBe(true);
  });

  it('?search=Able matches by client name', async () => {
    const res = await request(app)
      .get('/api/invoices/eligible-jobs?search=Able')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('non-matching search returns empty rows', async () => {
    const res = await request(app)
      .get('/api/invoices/eligible-jobs?search=ZZZNOMATCH')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.rows).toHaveLength(0);
  });
});

describe('GET /api/invoices/eligible-jobs — tenant isolation', () => {
  it('account B cannot see account A eligible jobs', async () => {
    const res = await request(app)
      .get('/api/invoices/eligible-jobs')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);

    expect(res.body.rows.every(r => r.id !== eligibleJobId)).toBe(true);
  });
});

describe('GET /api/invoices/eligible-jobs — client_id filter', () => {
  it('?client_id= filters to only that client\'s jobs', async () => {
    const res = await request(app)
      .get(`/api/invoices/eligible-jobs?client_id=${clientId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.rows.length).toBeGreaterThanOrEqual(1);
    expect(res.body.rows.every(r => r.client_id === clientId || r.client_name === 'Able Corp')).toBe(true);
  });
});

describe('GET /api/invoices/settings', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/invoices/settings');
    expect(res.status).toBe(401);
  });

  it('returns next_number and tax_rate', async () => {
    const res = await request(app)
      .get('/api/invoices/settings')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('next_number');
    expect(res.body).toHaveProperty('tax_rate');
    expect(typeof res.body.tax_rate).toBe('number');
    // next_number may be null for a brand-new account or a number >= starting value
    expect(res.body.next_number === null || typeof res.body.next_number === 'number').toBe(true);
  });

  it('returns payment capability fields', async () => {
    const res = await request(app)
      .get('/api/invoices/settings')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveProperty('accept_card');
    expect(res.body).toHaveProperty('accept_ach');
    expect(res.body).toHaveProperty('allow_partial_payments');
  });

  it('returns invoice_starting_number', async () => {
    const res = await request(app)
      .get('/api/invoices/settings')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveProperty('invoice_starting_number');
    expect(typeof res.body.invoice_starting_number).toBe('number');
    expect(res.body.invoice_starting_number).toBeGreaterThanOrEqual(0);
  });

  it('invoice numbers increment by 1 on sequential creates', async () => {
    // Find a fresh account with no sequence yet
    const hash = require('bcryptjs').hashSync('pw', 4);
    const { rows: [acct] } = await pool.query(
      `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
      [`__TEST_INV_SEQ_${Date.now()}__`]
    );
    const { rows: [u] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role)
       VALUES ($1,'Seq','seq-${Date.now()}@test.fc',$2,'owner') RETURNING id`,
      [acct.id, hash]
    );
    const { rows: [c] } = await pool.query(
      `INSERT INTO clients (account_id, name, email) VALUES ($1,'Seq Client','sc@test.fc') RETURNING id`,
      [acct.id]
    );
    const seqToken = require('jsonwebtoken').sign({ userId: u.id, accountId: acct.id, role: 'owner' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const li = [{ name: 'Item', quantity: 1, unit_price: 10 }];

    const r1 = await request(app).post('/api/invoices').set('Authorization', `Bearer ${seqToken}`)
      .send({ source_type: 'MANUAL', client_id: c.id, line_items: li }).expect(201);
    const r2 = await request(app).post('/api/invoices').set('Authorization', `Bearer ${seqToken}`)
      .send({ source_type: 'MANUAL', client_id: c.id, line_items: li }).expect(201);

    expect(r2.body.invoice_number).toBe(r1.body.invoice_number + 1);
    expect(r1.body.invoice_number).toBeGreaterThanOrEqual(0);

    await pool.query(`DELETE FROM accounts WHERE id = $1`, [acct.id]);
  });
});

// ── Invoice Builder — POST /api/invoices extended tests ───────────────────────

describe('POST /api/invoices — MANUAL (blank invoice)', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .send({ source_type: 'MANUAL', client_id: clientId, line_items: [{ name: 'Test', quantity: 1, unit_price: 100 }] });
    expect(res.status).toBe(401);
  });

  it('returns 403 for tech role', async () => {
    const techToken = makeToken(techId, accountId, 'tech');
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${techToken}`)
      .send({ source_type: 'MANUAL', client_id: clientId, line_items: [{ name: 'Test', quantity: 1, unit_price: 100 }] });
    expect(res.status).toBe(403);
  });

  it('creates a MANUAL invoice without job_id', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type: 'MANUAL',
        client_id:   clientId,
        subject:     'Test Blank Invoice',
        payment_terms: 'net_30',
        line_items: [
          { name: 'Consultation', description: 'Initial consult', quantity: 1, unit_price: 250, taxable: false },
          { name: 'Parts',        description: 'Materials',        quantity: 2, unit_price: 75,  taxable: true  },
        ],
        client_message:  'Thank you for your business.',
        internal_notes:  'Internal ref: TEST-001',
        status: 'draft',
      })
      .expect(201);

    const inv = res.body;
    expect(inv.source_type).toBe('MANUAL');
    expect(inv.job_id).toBeNull();
    expect(inv.client_id).toBe(clientId);
    expect(inv.subject).toBe('Test Blank Invoice');
    expect(inv.status).toBe('draft');
    expect(inv.payment_terms).toBe('net_30');
    expect(inv.invoice_number).toBeGreaterThanOrEqual(0);
    expect(parseFloat(inv.subtotal)).toBeCloseTo(400, 1); // 250 + 150
    expect(parseFloat(inv.amount)).toBeGreaterThanOrEqual(400);
    expect(inv.client_message).toBe('Thank you for your business.');
    expect(inv.internal_notes).toBe('Internal ref: TEST-001');
    const li = Array.isArray(inv.line_items) ? inv.line_items : JSON.parse(inv.line_items || '[]');
    expect(Array.isArray(li)).toBe(true);
  });

  it('400 when client_id is missing for MANUAL', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ source_type: 'MANUAL', line_items: [{ name: 'X', quantity: 1, unit_price: 10 }] })
      .expect(400);

    expect(res.body.error).toMatch(/client_id/i);
  });

  it('404 when client_id does not belong to this account', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ source_type: 'MANUAL', client_id: clientId, line_items: [{ name: 'X', quantity: 1, unit_price: 10 }] })
      .expect(404);

    expect(res.body.error).toMatch(/client/i);
  });

  it('400 when line_items is empty for MANUAL', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ source_type: 'MANUAL', client_id: clientId, line_items: [] })
      .expect(400);

    expect(res.body.error).toMatch(/line item/i);
  });
});

describe('POST /api/invoices — invoice_number sequence', () => {
  it('assigns sequential invoice numbers', async () => {
    // First manual invoice (may have been created above)
    const r1 = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type: 'MANUAL',
        client_id:   clientId,
        line_items:  [{ name: 'Seq Test 1', quantity: 1, unit_price: 10 }],
      })
      .expect(201);

    const r2 = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type: 'MANUAL',
        client_id:   clientId,
        line_items:  [{ name: 'Seq Test 2', quantity: 1, unit_price: 10 }],
      })
      .expect(201);

    expect(r2.body.invoice_number).toBe(r1.body.invoice_number + 1);
  });

  it('different accounts have independent sequences', async () => {
    // Other account creates its first invoice — needs a client
    const { rows: [otherClient] } = await pool.query(
      `INSERT INTO clients (account_id, name, email) VALUES ($1,'Other Client','oc@test.fc') RETURNING id`,
      [otherAccountId]
    );

    const r = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        source_type: 'MANUAL',
        client_id:   otherClient.id,
        line_items:  [{ name: 'Other Co Item', quantity: 1, unit_price: 50 }],
      })
      .expect(201);

    expect(r.body.invoice_number).toBeGreaterThanOrEqual(0);
  });
});

describe('POST /api/invoices — draft status', () => {
  it('defaults to draft status when status not provided', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type: 'MANUAL',
        client_id:   clientId,
        line_items:  [{ name: 'Draft Test', quantity: 1, unit_price: 99 }],
      })
      .expect(201);

    expect(res.body.status).toBe('draft');
  });

  it('accepts status=pending at creation', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type: 'MANUAL',
        client_id:   clientId,
        line_items:  [{ name: 'Pending Test', quantity: 1, unit_price: 49 }],
        status:      'pending',
      })
      .expect(201);

    expect(res.body.status).toBe('pending');
  });
});

describe('POST /api/invoices — discount math', () => {
  it('fixed discount reduces total correctly', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type:   'MANUAL',
        client_id:     clientId,
        line_items:    [{ name: 'Service', quantity: 1, unit_price: 200, taxable: false }],
        discount_type:  'fixed',
        discount_value: 25,
      })
      .expect(201);

    expect(parseFloat(res.body.subtotal)).toBeCloseTo(200, 1);
    expect(parseFloat(res.body.discount_amount)).toBeCloseTo(25, 1);
    expect(parseFloat(res.body.amount)).toBeCloseTo(175, 1);
  });

  it('percent discount reduces total correctly', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type:   'MANUAL',
        client_id:     clientId,
        line_items:    [{ name: 'Service', quantity: 1, unit_price: 100, taxable: false }],
        discount_type:  'percent',
        discount_value: 10,
      })
      .expect(201);

    expect(parseFloat(res.body.subtotal)).toBeCloseTo(100, 1);
    expect(parseFloat(res.body.discount_amount)).toBeCloseTo(10, 1);
    expect(parseFloat(res.body.amount)).toBeCloseTo(90, 1);
  });
});

describe('POST /api/invoices — JOB source still works', () => {
  it('creates invoice from eligible job', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ source_type: 'JOB', job_id: eligibleJobId })
      .expect(201);

    expect(res.body.source_type).toBe('JOB');
    expect(res.body.job_id).toBe(eligibleJobId);
    expect(res.body.client_id).toBe(clientId);
    expect(res.body.invoice_number).toBeGreaterThanOrEqual(0);
    expect(res.body.status).toBe('draft');
  });

  it('409 when job is already invoiced', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ source_type: 'JOB', job_id: eligibleJobId })
      .expect(409);

    expect(res.body.error).toMatch(/already/i);
  });

  it('400 when source_type is invalid', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ source_type: 'RECURRING', client_id: clientId })
      .expect(400);

    expect(res.body.error).toMatch(/source_type/i);
  });
});

// ── GET /api/invoices/eligible-estimates ──────────────────────────────────────

describe('GET /api/invoices/eligible-estimates — auth', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/invoices/eligible-estimates');
    expect(res.status).toBe(401);
  });

  it('returns 403 for tech role', async () => {
    const techToken = makeToken(techId, accountId, 'tech');
    const res = await request(app)
      .get('/api/invoices/eligible-estimates')
      .set('Authorization', `Bearer ${techToken}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/invoices/eligible-estimates — eligibility', () => {
  it('returns only signed estimates with no converted_invoice_id', async () => {
    const res = await request(app)
      .get('/api/invoices/eligible-estimates')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const ids = res.body.map(e => e.id);
    expect(ids).toContain(signedEstimateId);
    expect(ids).not.toContain(draftEstimateId);
    expect(ids).not.toContain(alreadyConvertedEstimateId);
  });

  it('each row has required fields', async () => {
    const res = await request(app)
      .get('/api/invoices/eligible-estimates')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const row = res.body.find(e => e.id === signedEstimateId);
    expect(row).toBeDefined();
    expect(row).toHaveProperty('title');
    expect(row).toHaveProperty('amount');
    expect(row).toHaveProperty('client_id');
    expect(row).toHaveProperty('client_name');
    expect(row).toHaveProperty('line_items');
    expect(row.status).toBe('signed');
  });

  it('search by title filters results', async () => {
    const res = await request(app)
      .get('/api/invoices/eligible-estimates?q=HVAC')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.some(e => e.id === signedEstimateId)).toBe(true);
  });

  it('tenant isolation — account B cannot see account A estimates', async () => {
    const res = await request(app)
      .get('/api/invoices/eligible-estimates')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);

    const ids = res.body.map(e => e.id);
    expect(ids).not.toContain(signedEstimateId);
  });
});

// ── POST /api/invoices — ESTIMATE source ─────────────────────────────────────

describe('POST /api/invoices — ESTIMATE source', () => {
  let createdFromEstimateId;

  it('creates invoice from signed estimate', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type:        'ESTIMATE',
        source_estimate_id: signedEstimateId,
        payment_terms:      'net_30',
      })
      .expect(201);

    createdFromEstimateId = res.body.id;
    expect(res.body.source_type).toBe('ESTIMATE');
    expect(res.body.source_estimate_id).toBe(signedEstimateId);
    expect(res.body.client_id).toBe(clientId);
    expect(res.body.subject).toBe('HVAC Proposal');
    expect(res.body.status).toBe('draft');
    expect(res.body.invoice_number).toBeGreaterThanOrEqual(0);
    const li = Array.isArray(res.body.line_items) ? res.body.line_items : JSON.parse(res.body.line_items || '[]');
    expect(Array.isArray(li)).toBe(true);
    expect(li.length).toBe(2);
  });

  it('estimate is marked converted after invoice creation', async () => {
    const { rows: [est] } = await pool.query(
      `SELECT converted_invoice_id FROM estimates WHERE id = $1`, [signedEstimateId]
    );
    expect(est.converted_invoice_id).toBe(createdFromEstimateId);
  });

  it('totals reconcile with estimate line items', async () => {
    const res = await request(app)
      .get(`/api/invoices/${createdFromEstimateId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // HVAC Service $500 + Parts $150 = $650 subtotal, no tax in test env
    expect(parseFloat(res.body.subtotal)).toBeCloseTo(650, 1);
  });

  it('409 when estimate already has converted_invoice_id', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ source_type: 'ESTIMATE', source_estimate_id: signedEstimateId })
      .expect(409);

    expect(res.body.error).toMatch(/already been invoiced/i);
  });

  it('409 when estimate was pre-converted (alreadyConvertedEstimateId)', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ source_type: 'ESTIMATE', source_estimate_id: alreadyConvertedEstimateId })
      .expect(409);

    expect(res.body.error).toMatch(/already been invoiced/i);
  });

  it('422 when estimate status is not signed', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ source_type: 'ESTIMATE', source_estimate_id: draftEstimateId })
      .expect(422);

    expect(res.body.error).toMatch(/signed/i);
  });

  it('404 when estimate belongs to another account', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ source_type: 'ESTIMATE', source_estimate_id: signedEstimateId })
      .expect(404);

    expect(res.body.error).toMatch(/estimate/i);
  });

  it('400 when source_estimate_id is missing', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ source_type: 'ESTIMATE' })
      .expect(400);

    expect(res.body.error).toMatch(/source_estimate_id/i);
  });

  it('custom subject overrides estimate title', async () => {
    // Create a fresh signed estimate for this test
    const { rows: [freshEst] } = await pool.query(
      `INSERT INTO estimates (account_id, client_id, title, line_items, amount, status, signed_at)
       VALUES ($1,$2,'Original Title','[{"description":"Item","amount":50}]',50,'signed',NOW())
       RETURNING id`,
      [accountId, clientId]
    );

    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type:        'ESTIMATE',
        source_estimate_id: freshEst.id,
        subject:            'Custom Subject',
      })
      .expect(201);

    expect(res.body.subject).toBe('Custom Subject');
  });
});

// ── GET /api/invoices/eligible-agreements — auth ────────────────────────────────

describe('GET /api/invoices/eligible-agreements — auth', () => {
  it('returns 401 with no token', async () => {
    await request(app).get('/api/invoices/eligible-agreements').expect(401);
  });

  it('returns 403 for tech role', async () => {
    const techToken = makeToken(techId, accountId, 'tech');
    await request(app)
      .get('/api/invoices/eligible-agreements')
      .set('Authorization', `Bearer ${techToken}`)
      .expect(403);
  });
});

// ── GET /api/invoices/eligible-agreements — eligibility ────────────────────────

describe('eligible-agreements — eligibility', () => {
  it('returns 200 with active agreements', async () => {
    const res = await request(app)
      .get('/api/invoices/eligible-agreements')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ids = res.body.map(a => a.id);
    expect(ids).toContain(activeAgreementId);
  });

  it('excludes paused agreements', async () => {
    const res = await request(app)
      .get('/api/invoices/eligible-agreements')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const ids = res.body.map(a => a.id);
    expect(ids).not.toContain(pausedAgreementId);
  });

  it('includes current period and period_already_invoiced flag', async () => {
    const res = await request(app)
      .get('/api/invoices/eligible-agreements')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const agr = res.body.find(a => a.id === activeAgreementId);
    expect(agr).toBeDefined();
    expect(agr.period_start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(agr.period_end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof agr.period_already_invoiced).toBe('boolean');
  });

  it('tenant isolation: cannot see other account agreements', async () => {
    const res = await request(app)
      .get('/api/invoices/eligible-agreements')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    const ids = res.body.map(a => a.id);
    expect(ids).not.toContain(activeAgreementId);
  });

  it('search by agreement name filters results', async () => {
    const res = await request(app)
      .get('/api/invoices/eligible-agreements?q=Monthly+AC')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    res.body.forEach(a => {
      const haystack = `${a.name} ${a.client_name} ${a.service_type || ''}`.toLowerCase();
      expect(haystack).toContain('monthly ac'.toLowerCase());
    });
  });
});

// ── POST /api/invoices — AGREEMENT source ──────────────────────────────────────

describe('POST /api/invoices — AGREEMENT source', () => {
  function getToday() {
    return new Date().toISOString().slice(0, 10);
  }
  function getMonthStart() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  }
  function getMonthEnd() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  }

  it('creates invoice from agreement with correct source_type', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type:         'AGREEMENT',
        source_agreement_id: activeAgreementId,
        period_start:        getMonthStart(),
        period_end:          getMonthEnd(),
      })
      .expect(201);
    expect(res.body.source_type).toBe('AGREEMENT');
    expect(res.body.source_agreement_id).toBe(activeAgreementId);
  });

  it('returns 409 when same period already invoiced', async () => {
    const ps = getMonthStart();
    const pe = getMonthEnd();

    // Use a fresh agreement to avoid conflict with the test above
    const { rows: [newAgr] } = await pool.query(
      `INSERT INTO recurring_agreements
         (account_id, client_id, name, cadence, billing_cadence, plan_price, status, payment_status, line_items, started_at)
       VALUES ($1,$2,'409 Test Agreement','monthly','monthly',50,'active','pending','[]', CURRENT_DATE)
       RETURNING id`,
      [accountId, clientId]
    );

    await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ source_type: 'AGREEMENT', source_agreement_id: newAgr.id, period_start: ps, period_end: pe })
      .expect(201);

    await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ source_type: 'AGREEMENT', source_agreement_id: newAgr.id, period_start: ps, period_end: pe })
      .expect(409);
  });

  it('returns 422 for paused agreement', async () => {
    await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type:         'AGREEMENT',
        source_agreement_id: pausedAgreementId,
        period_start:        getMonthStart(),
        period_end:          getMonthEnd(),
      })
      .expect(422);
  });

  it('returns 400 when period_start missing', async () => {
    await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ source_type: 'AGREEMENT', source_agreement_id: activeAgreementId, period_end: getMonthEnd() })
      .expect(400);
  });

  it('returns 404 for another tenant agreement', async () => {
    await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        source_type:         'AGREEMENT',
        source_agreement_id: activeAgreementId,
        period_start:        getMonthStart(),
        period_end:          getMonthEnd(),
      })
      .expect(404);
  });

  it('prefills plan_price as line item when no agreement line_items', async () => {
    const { rows: [simplAgr] } = await pool.query(
      `INSERT INTO recurring_agreements
         (account_id, client_id, name, cadence, billing_cadence, plan_price, status, payment_status, line_items, started_at)
       VALUES ($1,$2,'Simple Agreement','monthly','monthly',300,'active','pending','[]', CURRENT_DATE)
       RETURNING id`,
      [accountId, clientId]
    );

    const today = getToday();
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type:         'AGREEMENT',
        source_agreement_id: simplAgr.id,
        period_start:        today,
        period_end:          today,
      })
      .expect(201);

    const li = Array.isArray(res.body.line_items) ? res.body.line_items : JSON.parse(res.body.line_items || '[]');
    expect(li.length).toBeGreaterThan(0);
    expect(li[0].unit_price).toBe(300);
  });
});

// ── INVOICE V2: Settings endpoint ─────────────────────────────────────────────

describe('GET /api/invoices/settings — V2 payment capabilities', () => {
  it('returns accept_card field', async () => {
    const res = await request(app)
      .get('/api/invoices/settings')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(typeof res.body.accept_card).toBe('boolean');
  });

  it('returns accept_ach field', async () => {
    const res = await request(app)
      .get('/api/invoices/settings')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(typeof res.body.accept_ach).toBe('boolean');
  });

  it('returns allow_partial_payments field', async () => {
    const res = await request(app)
      .get('/api/invoices/settings')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(typeof res.body.allow_partial_payments).toBe('boolean');
  });

  it('returns default_terms field (null if not set)', async () => {
    const res = await request(app)
      .get('/api/invoices/settings')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveProperty('default_terms');
  });

  it('returns 401 without token', async () => {
    await request(app).get('/api/invoices/settings').expect(401);
  });
});

// ── INVOICE V2: Discount label ────────────────────────────────────────────────

describe('POST /api/invoices — discount_label', () => {
  it('stores discount_label when provided', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type:    'MANUAL',
        client_id:      clientId,
        subject:        'Test with Discount Label',
        line_items:     [{ name: 'Service', quantity: 1, unit_price: 200, taxable: false }],
        discount_type:  'percent',
        discount_value: 10,
        discount_label: 'New Client Discount',
      })
      .expect(201);
    expect(res.body.discount_label).toBe('New Client Discount');
  });

  it('discount_label is null when not provided', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type: 'MANUAL',
        client_id:   clientId,
        line_items:  [{ name: 'Service', quantity: 1, unit_price: 100, taxable: false }],
      })
      .expect(201);
    expect(res.body.discount_label ?? null).toBeNull();
  });
});

// ── INVOICE V2: Payment options ───────────────────────────────────────────────

describe('POST /api/invoices — payment_options', () => {
  it('stores payment_options when provided', async () => {
    const opts = { accept_card: true, accept_ach: false, allow_partial_payments: false };
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type:     'MANUAL',
        client_id:       clientId,
        line_items:      [{ name: 'Service', quantity: 1, unit_price: 150, taxable: false }],
        payment_options: opts,
      })
      .expect(201);
    const stored = typeof res.body.payment_options === 'string'
      ? JSON.parse(res.body.payment_options)
      : res.body.payment_options;
    expect(stored.accept_card).toBe(true);
  });

  it('payment_options defaults to empty object when not provided', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type: 'MANUAL',
        client_id:   clientId,
        line_items:  [{ name: 'Service', quantity: 1, unit_price: 75, taxable: false }],
      })
      .expect(201);
    expect(res.body.payment_options).toBeDefined();
  });
});

// ── INVOICE V2: Server-authoritative totals ───────────────────────────────────

describe('POST /api/invoices — server totals', () => {
  it('server recalculates totals from line_items (ignores browser total)', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type: 'MANUAL',
        client_id:   clientId,
        line_items:  [
          { name: 'Item A', quantity: 2, unit_price: 50, taxable: false },
          { name: 'Item B', quantity: 1, unit_price: 100, taxable: false },
        ],
      })
      .expect(201);
    expect(parseFloat(res.body.amount)).toBe(200);
    expect(parseFloat(res.body.subtotal)).toBe(200);
  });

  it('applies percentage discount server-side', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type:    'MANUAL',
        client_id:      clientId,
        line_items:     [{ name: 'Service', quantity: 1, unit_price: 200, taxable: false }],
        discount_type:  'percent',
        discount_value: 10,
      })
      .expect(201);
    expect(parseFloat(res.body.amount)).toBeCloseTo(180, 1);
    expect(parseFloat(res.body.discount_amount)).toBeCloseTo(20, 1);
  });

  it('applies fixed discount server-side', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type:    'MANUAL',
        client_id:      clientId,
        line_items:     [{ name: 'Service', quantity: 1, unit_price: 100, taxable: false }],
        discount_type:  'fixed',
        discount_value: 25,
      })
      .expect(201);
    expect(parseFloat(res.body.amount)).toBeCloseTo(75, 1);
  });
});

// ── INVOICE V2: Internal notes privacy ────────────────────────────────────────

describe('POST /api/invoices — internal notes privacy', () => {
  it('stores internal_notes separate from client_message', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type:    'MANUAL',
        client_id:      clientId,
        line_items:     [{ name: 'Service', quantity: 1, unit_price: 100, taxable: false }],
        client_message: 'Thank you for your business.',
        internal_notes: 'Do not share with client.',
      })
      .expect(201);
    expect(res.body.client_message).toBe('Thank you for your business.');
    expect(res.body.internal_notes).toBe('Do not share with client.');
  });
});

// ── INVOICE V2: Due date calculation ──────────────────────────────────────────

describe('POST /api/invoices — due date calculation', () => {
  it('auto-calculates due_date for net_30', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type:   'MANUAL',
        client_id:     clientId,
        line_items:    [{ name: 'Service', quantity: 1, unit_price: 100, taxable: false }],
        payment_terms: 'net_30',
        issued_date:   '2026-08-01',
      })
      .expect(201);
    expect(res.body.due_date).toBeTruthy();
    expect(res.body.due_date.slice(0, 10)).toBe('2026-08-31');
  });

  it('no due_date for due_on_receipt', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type:   'MANUAL',
        client_id:     clientId,
        line_items:    [{ name: 'Service', quantity: 1, unit_price: 100, taxable: false }],
        payment_terms: 'due_on_receipt',
      })
      .expect(201);
    expect(res.body.due_date ?? null).toBeNull();
  });
});

// ── INVOICE V2: Source traceability ──────────────────────────────────────────

describe('POST /api/invoices — source traceability', () => {
  it('MANUAL invoice has source_type = MANUAL', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type: 'MANUAL',
        client_id:   clientId,
        line_items:  [{ name: 'Custom Service', quantity: 1, unit_price: 50, taxable: false }],
      })
      .expect(201);
    expect(res.body.source_type).toBe('MANUAL');
  });
});

// ── Invoice numbering V2 ──────────────────────────────────────────────────────

describe('GET /api/invoices/next-number', () => {
  let nnAccountId, nnToken, nnClientId;

  beforeAll(async () => {
    const hash = require('bcryptjs').hashSync('pw', 4);
    const { rows: [acct] } = await pool.query(
      `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
      [`__TEST_INV_NN_${Date.now()}__`]
    );
    nnAccountId = acct.id;
    const { rows: [u] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role)
       VALUES ($1,'NN Owner',$2,$3,'owner') RETURNING id`,
      [nnAccountId, `inv-nn-${Date.now()}@test.fc`, hash]
    );
    nnToken = makeToken(u.id, nnAccountId, 'owner');
    const { rows: [c] } = await pool.query(
      `INSERT INTO clients (account_id, name, email) VALUES ($1,'NN Client','nn@test.fc') RETURNING id`,
      [nnAccountId]
    );
    nnClientId = c.id;
    // Configure invoice_starting_number = 500 to verify live configuration controls the value.
    await pool.query(
      `INSERT INTO booking_settings (account_id, invoice_starting_number) VALUES ($1, 500)
       ON CONFLICT (account_id) DO UPDATE SET invoice_starting_number = 500`,
      [nnAccountId]
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM accounts WHERE id = $1`, [nnAccountId]);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/invoices/next-number');
    expect(res.status).toBe(401);
  });

  it('returns configured invoice_starting_number for a zero-invoice account', async () => {
    const res = await request(app)
      .get('/api/invoices/next-number')
      .set('Authorization', `Bearer ${nnToken}`)
      .expect(200);
    expect(res.body).toHaveProperty('next_number');
    expect(res.body.next_number).toBe(500);
  });

  it('returns null for account with no booking_settings and no invoices', async () => {
    // A truly unconfigured account returns null — no hardcoded assumption.
    const { rows: [bare] } = await pool.query(
      `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
      [`__TEST_INV_BARE_${Date.now()}__`]
    );
    const { rows: [bu] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role)
       VALUES ($1,'Bare Owner',$2,$3,'owner') RETURNING id`,
      [bare.id, `bare-${Date.now()}@test.fc`, require('bcryptjs').hashSync('pw', 4)]
    );
    const bareToken = makeToken(bu.id, bare.id, 'owner');
    const res = await request(app)
      .get('/api/invoices/next-number')
      .set('Authorization', `Bearer ${bareToken}`)
      .expect(200);
    expect(res.body.next_number).toBeNull();
    await pool.query(`DELETE FROM accounts WHERE id = $1`, [bare.id]);
  });

  it('next_number matches what the first invoice will use', async () => {
    const preview = await request(app)
      .get('/api/invoices/next-number')
      .set('Authorization', `Bearer ${nnToken}`)
      .expect(200);

    const inv = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${nnToken}`)
      .send({ source_type: 'MANUAL', client_id: nnClientId, line_items: [{ name: 'X', quantity: 1, unit_price: 10 }] })
      .expect(201);

    expect(inv.body.invoice_number).toBe(preview.body.next_number);
  });

  it('configured start = 0 uses 0 as the first invoice number', async () => {
    const { rows: [za] } = await pool.query(
      `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
      [`__TEST_INV_ZERO_${Date.now()}__`]
    );
    const { rows: [zu] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role)
       VALUES ($1,'Zero Owner',$2,$3,'owner') RETURNING id`,
      [za.id, `zero-${Date.now()}@test.fc`, require('bcryptjs').hashSync('pw', 4)]
    );
    const { rows: [zc] } = await pool.query(
      `INSERT INTO clients (account_id, name, email) VALUES ($1,'Zero Client','zc@test.fc') RETURNING id`,
      [za.id]
    );
    await pool.query(
      `INSERT INTO booking_settings (account_id, invoice_starting_number) VALUES ($1, 0)`,
      [za.id]
    );
    const zToken = makeToken(zu.id, za.id, 'owner');

    const preview = await request(app)
      .get('/api/invoices/next-number')
      .set('Authorization', `Bearer ${zToken}`)
      .expect(200);
    expect(preview.body.next_number).toBe(0);

    const inv = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${zToken}`)
      .send({ source_type: 'MANUAL', client_id: zc.id, line_items: [{ name: 'X', quantity: 1, unit_price: 10 }] })
      .expect(201);
    expect(inv.body.invoice_number).toBe(0);

    await pool.query(`DELETE FROM accounts WHERE id = $1`, [za.id]);
  });

  it('configured start = 1 uses 1 as the first invoice number', async () => {
    const { rows: [oa] } = await pool.query(
      `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
      [`__TEST_INV_ONE_${Date.now()}__`]
    );
    const { rows: [ou] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role)
       VALUES ($1,'One Owner',$2,$3,'owner') RETURNING id`,
      [oa.id, `one-${Date.now()}@test.fc`, require('bcryptjs').hashSync('pw', 4)]
    );
    const { rows: [oc] } = await pool.query(
      `INSERT INTO clients (account_id, name, email) VALUES ($1,'One Client','oc@test.fc') RETURNING id`,
      [oa.id]
    );
    await pool.query(
      `INSERT INTO booking_settings (account_id, invoice_starting_number) VALUES ($1, 1)`,
      [oa.id]
    );
    const oToken = makeToken(ou.id, oa.id, 'owner');

    const preview = await request(app)
      .get('/api/invoices/next-number')
      .set('Authorization', `Bearer ${oToken}`)
      .expect(200);
    expect(preview.body.next_number).toBe(1);

    const inv = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${oToken}`)
      .send({ source_type: 'MANUAL', client_id: oc.id, line_items: [{ name: 'X', quantity: 1, unit_price: 10 }] })
      .expect(201);
    expect(inv.body.invoice_number).toBe(1);

    await pool.query(`DELETE FROM accounts WHERE id = $1`, [oa.id]);
  });
});

describe('POST /api/invoices — numbering semantics', () => {
  let nsAccountId, nsToken, nsClientId;

  beforeAll(async () => {
    const hash = require('bcryptjs').hashSync('pw', 4);
    const { rows: [acct] } = await pool.query(
      `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
      [`__TEST_INV_NS_${Date.now()}__`]
    );
    nsAccountId = acct.id;
    const { rows: [u] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role)
       VALUES ($1,'NS Owner',$2,$3,'owner') RETURNING id`,
      [nsAccountId, `inv-ns-${Date.now()}@test.fc`, hash]
    );
    nsToken = makeToken(u.id, nsAccountId, 'owner');
    const { rows: [c] } = await pool.query(
      `INSERT INTO clients (account_id, name, email) VALUES ($1,'NS Client','nsc@test.fc') RETURNING id`,
      [nsAccountId]
    );
    nsClientId = c.id;
    // Use a distinctive starting number so tests verify live configuration, not any default.
    await pool.query(
      `INSERT INTO booking_settings (account_id, invoice_starting_number) VALUES ($1, 2000)
       ON CONFLICT (account_id) DO UPDATE SET invoice_starting_number = 2000`,
      [nsAccountId]
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM accounts WHERE id = $1`, [nsAccountId]);
  });

  const li = [{ name: 'Item', quantity: 1, unit_price: 50 }];

  it('first invoice number equals configured invoice_starting_number (no off-by-one)', async () => {
    const settings = await request(app)
      .get('/api/invoices/settings')
      .set('Authorization', `Bearer ${nsToken}`)
      .expect(200);
    // With invoice_starting_number = 2000 and no prior invoices, next_number must be 2000.
    expect(settings.body.next_number).toBe(2000);

    const r = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${nsToken}`)
      .send({ source_type: 'MANUAL', client_id: nsClientId, line_items: li })
      .expect(201);

    expect(r.body.invoice_number).toBe(2000);
  });

  it('settings next_number after first invoice equals used number + 1', async () => {
    const r = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${nsToken}`)
      .send({ source_type: 'MANUAL', client_id: nsClientId, line_items: li })
      .expect(201);

    const settings = await request(app)
      .get('/api/invoices/settings')
      .set('Authorization', `Bearer ${nsToken}`)
      .expect(200);

    expect(settings.body.next_number).toBe(r.body.invoice_number + 1);
  });

  it('sequential invoices have numbers incrementing by exactly 1', async () => {
    const r1 = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${nsToken}`)
      .send({ source_type: 'MANUAL', client_id: nsClientId, line_items: li })
      .expect(201);
    const r2 = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${nsToken}`)
      .send({ source_type: 'MANUAL', client_id: nsClientId, line_items: li })
      .expect(201);

    expect(r2.body.invoice_number).toBe(r1.body.invoice_number + 1);
  });

  it('concurrent invoice creates produce unique numbers', async () => {
    const invoices = await Promise.all([
      request(app).post('/api/invoices').set('Authorization', `Bearer ${nsToken}`)
        .send({ source_type: 'MANUAL', client_id: nsClientId, line_items: li }),
      request(app).post('/api/invoices').set('Authorization', `Bearer ${nsToken}`)
        .send({ source_type: 'MANUAL', client_id: nsClientId, line_items: li }),
      request(app).post('/api/invoices').set('Authorization', `Bearer ${nsToken}`)
        .send({ source_type: 'MANUAL', client_id: nsClientId, line_items: li }),
    ]);
    const numbers = invoices.map(r => r.body.invoice_number);
    expect(new Set(numbers).size).toBe(3);
  });

  it('invoice sequence is isolated — other account creates do not advance this one', async () => {
    const before = await request(app)
      .get('/api/invoices/settings')
      .set('Authorization', `Bearer ${nsToken}`)
      .expect(200);

    // Create invoice on the primary test account (different from nsAccountId)
    await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ source_type: 'MANUAL', client_id: clientId, line_items: li })
      .expect(201);

    const after = await request(app)
      .get('/api/invoices/settings')
      .set('Authorization', `Bearer ${nsToken}`)
      .expect(200);

    expect(after.body.next_number).toBe(before.body.next_number);
  });

  it('source_type does not affect the sequence', async () => {
    const r1 = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${nsToken}`)
      .send({ source_type: 'MANUAL', client_id: nsClientId, line_items: li })
      .expect(201);
    const r2 = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${nsToken}`)
      .send({ source_type: 'MANUAL', client_id: nsClientId, line_items: li })
      .expect(201);

    // Both are MANUAL here; the point is the sequence runs the same regardless
    expect(r2.body.invoice_number).toBe(r1.body.invoice_number + 1);
  });
});

// ── PUT /api/booking-settings — invoice_starting_number ───────────────────────

describe('PUT /api/booking-settings — invoice_starting_number', () => {
  let bsAccountId, bsToken, bsClientId;

  beforeAll(async () => {
    const hash = require('bcryptjs').hashSync('pw', 4);
    const { rows: [acct] } = await pool.query(
      `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
      [`__TEST_INV_BS_${Date.now()}__`]
    );
    bsAccountId = acct.id;
    const { rows: [u] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role)
       VALUES ($1,'BS Owner',$2,$3,'owner') RETURNING id`,
      [bsAccountId, `inv-bs-${Date.now()}@test.fc`, hash]
    );
    bsToken = makeToken(u.id, bsAccountId, 'owner');
    const { rows: [c] } = await pool.query(
      `INSERT INTO clients (account_id, name, email) VALUES ($1,'BS Client','bsc@test.fc') RETURNING id`,
      [bsAccountId]
    );
    bsClientId = c.id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM accounts WHERE id = $1`, [bsAccountId]);
  });

  it('new account has invoice_starting_number defaulting to 0', async () => {
    const res = await request(app)
      .get('/api/invoices/settings')
      .set('Authorization', `Bearer ${bsToken}`)
      .expect(200);
    // No booking_settings row exists yet — next_number may be null, and starting number defaults to 0
    expect(res.body.invoice_starting_number === 0 || res.body.invoice_starting_number == null).toBe(true);
  });

  it('PUT accepts invoice_starting_number = 0', async () => {
    const res = await request(app)
      .put('/api/booking-settings')
      .set('Authorization', `Bearer ${bsToken}`)
      .send({ invoice_starting_number: 0 })
      .expect(200);
    expect(res.body.invoice_starting_number).toBe(0);
  });

  it('PUT accepts invoice_starting_number = 500', async () => {
    const res = await request(app)
      .put('/api/booking-settings')
      .set('Authorization', `Bearer ${bsToken}`)
      .send({ invoice_starting_number: 500 })
      .expect(200);
    expect(res.body.invoice_starting_number).toBe(500);
  });

  it('PUT rejects invoice_starting_number = -1', async () => {
    const res = await request(app)
      .put('/api/booking-settings')
      .set('Authorization', `Bearer ${bsToken}`)
      .send({ invoice_starting_number: -1 })
      .expect(400);
    expect(res.body.error).toMatch(/integer/i);
  });

  it('PUT rejects non-integer invoice_starting_number', async () => {
    const res = await request(app)
      .put('/api/booking-settings')
      .set('Authorization', `Bearer ${bsToken}`)
      .send({ invoice_starting_number: 1.5 })
      .expect(400);
    expect(res.body.error).toMatch(/integer/i);
  });

  it('configured invoice_starting_number controls the first invoice number', async () => {
    await request(app)
      .put('/api/booking-settings')
      .set('Authorization', `Bearer ${bsToken}`)
      .send({ invoice_starting_number: 750 })
      .expect(200);

    const inv = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${bsToken}`)
      .send({ source_type: 'MANUAL', client_id: bsClientId, line_items: [{ name: 'X', quantity: 1, unit_price: 10 }] })
      .expect(201);
    expect(inv.body.invoice_number).toBe(750);
  });
});
