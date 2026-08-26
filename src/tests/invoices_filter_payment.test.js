'use strict';
// Filter system + manual payment recording regression tests
// INV-FILTER and INV-PAYMENT

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
let clientId, techId;
let filterClientId, filterInvId;
let pendingInvId, paidInvId;

beforeAll(async () => {
  await runMigrations();
  const hash = await bcrypt.hash('pw', 10);

  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
    [`__TEST_FILTER_${Date.now()}__`]
  );
  accountId = acct.id;

  const { rows: [u] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Filter Owner',$2,$3,'owner') RETURNING id`,
    [accountId, `filter-owner-${Date.now()}@test.fc`, hash]
  );
  userId = u.id;
  token  = makeToken(userId, accountId, 'owner');

  const { rows: [acct2] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
    [`__TEST_FILTER_OTHER_${Date.now()}__`]
  );
  otherAccountId = acct2.id;
  const { rows: [u2] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Other Owner',$2,$3,'owner') RETURNING id`,
    [otherAccountId, `filter-other-${Date.now()}@test.fc`, hash]
  );
  otherToken = makeToken(u2.id, otherAccountId, 'owner');

  const { rows: [c] } = await pool.query(
    `INSERT INTO clients (account_id, name, email) VALUES ($1,'Main Client','main@test.fc') RETURNING id`,
    [accountId]
  );
  clientId = c.id;

  const { rows: [fc] } = await pool.query(
    `INSERT INTO clients (account_id, name, email) VALUES ($1,'Filter Client','fc@test.fc') RETURNING id`,
    [accountId]
  );
  filterClientId = fc.id;

  const { rows: [t] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Tech User','tech-fp@test.fc',$2,'tech') RETURNING id`,
    [accountId, hash]
  );
  techId = t.id;

  // Create invoices for filter tests
  const r1 = await request(app).post('/api/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send({ source_type: 'MANUAL', client_id: clientId, line_items: [{ name: 'Svc A', quantity: 1, unit_price: 100 }], status: 'pending' });
  pendingInvId = r1.body.id;

  const r2 = await request(app).post('/api/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send({ source_type: 'MANUAL', client_id: clientId, line_items: [{ name: 'Svc B', quantity: 1, unit_price: 500 }], status: 'pending' });
  // mark as paid
  await pool.query(`UPDATE invoices SET status='paid' WHERE id=$1`, [r2.body.id]);
  paidInvId = r2.body.id;

  // Invoice for specific filter client
  const r3 = await request(app).post('/api/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send({ source_type: 'MANUAL', client_id: filterClientId, line_items: [{ name: 'FC Svc', quantity: 1, unit_price: 77 }] });
  filterInvId = r3.body.id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM accounts WHERE id IN ($1,$2)`, [accountId, otherAccountId]);
});

// ── client_id filter ───────────────────────────────────────────────────────────

describe('GET /api/invoices — client_id filter', () => {
  it('returns only invoices for the specified client', async () => {
    const res = await request(app)
      .get(`/api/invoices?client_id=${filterClientId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const ids = res.body.rows.map(r => r.id);
    expect(ids).toContain(filterInvId);
    ids.forEach(id => expect(id).toBe(filterInvId));
  });

  it('tenant isolation: other account cannot see this client invoices', async () => {
    const res = await request(app)
      .get(`/api/invoices?client_id=${filterClientId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(res.body.rows).toHaveLength(0);
  });
});

// ── source filter ──────────────────────────────────────────────────────────────

describe('GET /api/invoices — source filter', () => {
  it('source=manual returns only MANUAL invoices', async () => {
    const res = await request(app)
      .get('/api/invoices?source=manual')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    res.body.rows.forEach(r => expect(r.source_type).toBe('MANUAL'));
  });

  it('source=recurring returns only AGREEMENT invoices', async () => {
    const res = await request(app)
      .get('/api/invoices?source=recurring')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    res.body.rows.forEach(r => expect(r.source_type).toBe('AGREEMENT'));
  });

  it('invalid source is ignored — returns all', async () => {
    const base     = await request(app).get('/api/invoices').set('Authorization', `Bearer ${token}`).expect(200);
    const filtered = await request(app).get('/api/invoices?source=INVALID').set('Authorization', `Bearer ${token}`).expect(200);
    expect(filtered.body.total).toBe(base.body.total);
  });
});

// ── amount range filter ────────────────────────────────────────────────────────

describe('GET /api/invoices — amount_min / amount_max filter', () => {
  it('amount_min excludes invoices below threshold', async () => {
    const res = await request(app)
      .get('/api/invoices?amount_min=200')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    res.body.rows.forEach(r => expect(parseFloat(r.amount)).toBeGreaterThanOrEqual(200));
  });

  it('amount_max excludes invoices above threshold', async () => {
    const res = await request(app)
      .get('/api/invoices?amount_max=150')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    res.body.rows.forEach(r => expect(parseFloat(r.amount)).toBeLessThanOrEqual(150));
  });

  it('amount_min + amount_max as a combined range', async () => {
    const res = await request(app)
      .get('/api/invoices?amount_min=50&amount_max=200')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    res.body.rows.forEach(r => {
      const amt = parseFloat(r.amount);
      expect(amt).toBeGreaterThanOrEqual(50);
      expect(amt).toBeLessThanOrEqual(200);
    });
  });
});

// ── due date filter ────────────────────────────────────────────────────────────

describe('GET /api/invoices — due_start / due_end filter', () => {
  it('due_start filters invoices due on or after the date', async () => {
    const res = await request(app)
      .get('/api/invoices?due_start=2030-01-01')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    res.body.rows.forEach(r => {
      if (r.due_date) expect(r.due_date.slice(0, 10) >= '2030-01-01').toBe(true);
    });
  });

  it('due_end filters invoices due on or before the date', async () => {
    const res = await request(app)
      .get('/api/invoices?due_end=2020-12-31')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    res.body.rows.forEach(r => {
      if (r.due_date) expect(r.due_date.slice(0, 10) <= '2020-12-31').toBe(true);
    });
  });
});

// ── balance filter ─────────────────────────────────────────────────────────────

describe('GET /api/invoices — balanceEq0 filter', () => {
  it('balanceEq0=true returns only paid invoices', async () => {
    const res = await request(app)
      .get('/api/invoices?balanceEq0=true')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    res.body.rows.forEach(r => expect(r.status).toBe('paid'));
  });
});

describe('GET /api/invoices — balanceGt0 filter', () => {
  it('balanceGt0=true returns only pending/failed invoices with amount > 0', async () => {
    const res = await request(app)
      .get('/api/invoices?balanceGt0=true')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    res.body.rows.forEach(r => {
      expect(['pending','failed']).toContain(r.status);
      expect(parseFloat(r.amount)).toBeGreaterThan(0);
    });
  });
});

// ── service filter ─────────────────────────────────────────────────────────────

describe('GET /api/invoices — service filter', () => {
  it('returns 200 (may be empty) for service filter on test data', async () => {
    const res = await request(app)
      .get('/api/invoices?service=Lawn')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(res.body.rows)).toBe(true);
  });
});

// ── combined filters ───────────────────────────────────────────────────────────

describe('GET /api/invoices — combined filters', () => {
  it('status + amount_min narrows the result set correctly', async () => {
    const res = await request(app)
      .get('/api/invoices?status=pending&amount_min=1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    res.body.rows.forEach(r => {
      expect(r.status).toBe('pending');
      expect(parseFloat(r.amount)).toBeGreaterThanOrEqual(1);
    });
  });

  it('source=manual + status=pending returns matching subset', async () => {
    const res = await request(app)
      .get('/api/invoices?source=manual&status=pending')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    res.body.rows.forEach(r => {
      expect(r.source_type).toBe('MANUAL');
      expect(r.status).toBe('pending');
    });
  });

  it('client_id + amount_min combination is correctly applied', async () => {
    const res = await request(app)
      .get(`/api/invoices?client_id=${clientId}&amount_min=50`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    res.body.rows.forEach(r => {
      expect(r.client_id).toBe(clientId);
      expect(parseFloat(r.amount)).toBeGreaterThanOrEqual(50);
    });
  });
});

// ── POST /api/invoices/:id/payments ───────────────────────────────────────────

describe('POST /api/invoices/:id/payments — auth + validation', () => {
  let payInvId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type: 'MANUAL',
        client_id:   clientId,
        line_items:  [{ name: 'Pay Test', quantity: 1, unit_price: 150 }],
        status:      'pending',
      })
      .expect(201);
    payInvId = res.body.id;
  });

  it('401 without token', async () => {
    await request(app).post(`/api/invoices/${payInvId}/payments`).expect(401);
  });

  it('403 for tech role', async () => {
    const techTok = makeToken(techId, accountId, 'tech');
    await request(app)
      .post(`/api/invoices/${payInvId}/payments`)
      .set('Authorization', `Bearer ${techTok}`)
      .send({ amount: 150, method: 'cash' })
      .expect(403);
  });

  it('400 when method is invalid', async () => {
    const res = await request(app)
      .post(`/api/invoices/${payInvId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 150, method: 'wire' })
      .expect(400);
    expect(res.body.error).toMatch(/method/i);
  });

  it('400 when amount is zero or negative', async () => {
    const res = await request(app)
      .post(`/api/invoices/${payInvId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 0, method: 'cash' })
      .expect(400);
    expect(res.body.error).toMatch(/amount/i);
  });

  it('records cash payment and marks invoice paid', async () => {
    const res = await request(app)
      .post(`/api/invoices/${payInvId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 150, method: 'cash', date: '2026-08-25', note: 'Paid at door' })
      .expect(200);
    expect(res.body.status).toBe('paid');
    expect(res.body.paid_method).toBe('cash');
    expect(res.body.paid_at).toBeTruthy();
  });

  it('400 when invoice is already paid', async () => {
    const res = await request(app)
      .post(`/api/invoices/${payInvId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 150, method: 'cash' })
      .expect(400);
    expect(res.body.error).toMatch(/already paid/i);
  });
});

describe('POST /api/invoices/:id/payments — check with reference', () => {
  let checkInvId;

  beforeAll(async () => {
    const { rows: [inv] } = await pool.query(
      `INSERT INTO invoices (account_id, client_id, source_type, amount, subtotal, line_items, status, invoice_number)
       VALUES ($1,$2,'MANUAL',200,200,$3,'pending',88881) RETURNING id`,
      [accountId, clientId, JSON.stringify([{ name: 'Check Test', amount: 200 }])]
    );
    checkInvId = inv.id;
  });

  it('records check payment with check number in note', async () => {
    const res = await request(app)
      .post(`/api/invoices/${checkInvId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 200, method: 'check', reference: '1042' })
      .expect(200);
    expect(res.body.status).toBe('paid');
    expect(res.body.paid_method).toBe('check');
    expect(res.body.payment_note).toMatch(/Ref: 1042/);
  });
});

describe('POST /api/invoices/:id/payments — isolation', () => {
  let isoInvId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type: 'MANUAL',
        client_id:   clientId,
        line_items:  [{ name: 'ISO Test', quantity: 1, unit_price: 99 }],
        status:      'pending',
      });
    isoInvId = res.body.id;
  });

  it('404 when invoice belongs to another account', async () => {
    await request(app)
      .post(`/api/invoices/${isoInvId}/payments`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ amount: 99, method: 'cash' })
      .expect(404);
  });

  it('404 for non-existent invoice UUID', async () => {
    await request(app)
      .post('/api/invoices/00000000-0000-0000-0000-000000000000/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 99, method: 'cash' })
      .expect(404);
  });
});

describe('POST /api/invoices/:id/payments — void invoice', () => {
  let voidInvId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type: 'MANUAL',
        client_id:   clientId,
        line_items:  [{ name: 'Void Test', quantity: 1, unit_price: 50 }],
        status:      'pending',
      });
    voidInvId = res.body.id;
    await pool.query(`UPDATE invoices SET status='void' WHERE id=$1`, [voidInvId]);
  });

  it('400 when trying to record payment on void invoice', async () => {
    const res = await request(app)
      .post(`/api/invoices/${voidInvId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 50, method: 'cash' })
      .expect(400);
    expect(res.body.error).toMatch(/void/i);
  });
});
