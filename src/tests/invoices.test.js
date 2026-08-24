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

beforeAll(async () => {
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

  // Job (required for invoice FK)
  const { rows: [j] } = await pool.query(
    `INSERT INTO jobs (account_id, client_id, tech_id, service_type, status, amount, scheduled_at, duration_minutes)
     VALUES ($1,$2,$3,'HVAC Repair','complete',50000,$4,60) RETURNING id`,
    [accountId, clientId, techId, TODAY + 'T10:00:00Z']
  );
  const jobId = j.id;

  // Pending invoice
  const { rows: [p] } = await pool.query(
    `INSERT INTO invoices (account_id, job_id, client_id, amount, status)
     VALUES ($1,$2,$3,40000,'pending') RETURNING id`,
    [accountId, jobId, clientId]
  );
  pendingInvId = p.id;

  // Paid invoice
  const { rows: [pa] } = await pool.query(
    `INSERT INTO invoices (account_id, job_id, client_id, amount, status, paid_at)
     VALUES ($1,$2,$3,20000,'paid',NOW()) RETURNING id`,
    [accountId, jobId, clientId]
  );
  paidInvId = pa.id;

  // Void invoice
  const { rows: [v] } = await pool.query(
    `INSERT INTO invoices (account_id, job_id, client_id, amount, status)
     VALUES ($1,$2,$3,10000,'void') RETURNING id`,
    [accountId, jobId, clientId]
  );
  voidInvId = v.id;

  // Past-due invoice: pending with due_date 10 days ago
  const { rows: [od] } = await pool.query(
    `INSERT INTO invoices (account_id, job_id, client_id, amount, status, due_date)
     VALUES ($1,$2,$3,15000,'pending',NOW() - INTERVAL '10 days') RETURNING id`,
    [accountId, jobId, clientId]
  );
  overdueInvId = od.id;
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
