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

const TODAY = new Date().toISOString().slice(0, 10);

let accountId, userId, token, clientId, jobId, invoiceId;

// Shared invoice is reset to known state before each payment test via beforeEach
async function resetInvoice() {
  // Reset to pending with full balance = 1000
  await pool.query(
    `UPDATE invoices SET status='pending', balance=1000.00, paid_at=NULL, paid_method=NULL
     WHERE id=$1`,
    [invoiceId]
  );
  // Remove any payment_allocations for this invoice so history is clean
  await pool.query(
    `DELETE FROM payment_allocations WHERE invoice_id=$1`,
    [invoiceId]
  );
  await pool.query(
    `DELETE FROM payments WHERE account_id=$1 AND client_id=$2`,
    [accountId, clientId]
  );
}

beforeAll(async () => {
  await runMigrations();
  const hash = await bcrypt.hash('pw', 10);

  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
    [`__TEST_PASS2_${Date.now()}__`]
  );
  accountId = acct.id;

  const { rows: [u] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Pay Owner',$2,$3,'owner') RETURNING id`,
    [accountId, `pay-pass2-${Date.now()}@test.fc`, hash]
  );
  userId = u.id;
  token  = makeToken(userId, accountId);

  const { rows: [c] } = await pool.query(
    `INSERT INTO clients (account_id, name, email) VALUES ($1,'Ledger Client','ledger@test.fc') RETURNING id`,
    [accountId]
  );
  clientId = c.id;

  const { rows: [j] } = await pool.query(
    `INSERT INTO jobs (account_id, client_id, service_type, status, amount, scheduled_at, duration_minutes)
     VALUES ($1,$2,'Audit Service','complete',1000,$3,60) RETURNING id`,
    [accountId, clientId, TODAY + 'T09:00:00Z']
  );
  jobId = j.id;

  // Create a $1,000 invoice linked to the job
  const res = await request(app)
    .post('/api/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send({
      source_type:   'JOB',
      job_id:        jobId,
      subject:       'Audit Service Invoice',
      line_items:    [{ name: 'Audit Service', quantity: 1, unit_price: 1000, taxable: false }],
      payment_terms: 'net_30',
      status:        'pending',
    });
  expect(res.statusCode).toBe(201);
  invoiceId = res.body.id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM accounts WHERE id = $1`, [accountId]);
});

// ── Section 1: Payment Ledger ────────────────────────────────────────────────
describe('Payment ledger — canonical records', () => {
  beforeEach(resetInvoice);

  it('POST payment creates payments row + payment_allocations row', async () => {
    const res = await request(app)
      .post(`/api/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 250, method: 'cash', date: TODAY });

    expect(res.statusCode).toBe(200);
    expect(res.body.payment_id).toBeTruthy();

    const { rows: pa } = await pool.query(
      `SELECT * FROM payment_allocations WHERE invoice_id=$1`, [invoiceId]
    );
    expect(pa).toHaveLength(1);
    expect(parseFloat(pa[0].amount)).toBe(250);

    const { rows: p } = await pool.query(
      `SELECT * FROM payments WHERE id=$1`, [pa[0].payment_id]
    );
    expect(p).toHaveLength(1);
    expect(parseFloat(p[0].amount)).toBe(250);
    expect(p[0].method).toBe('CASH');
    expect(p[0].account_id).toBe(accountId);
    expect(p[0].client_id).toBe(clientId);
  });
});

// ── Section 2: Multiple Payments ────────────────────────────────────────────
describe('Multiple payments on one invoice', () => {
  beforeEach(resetInvoice);

  it('$250 payment → balance $750; $400 payment → balance $350', async () => {
    const p1 = await request(app)
      .post(`/api/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 250, method: 'cash', date: TODAY });
    expect(p1.statusCode).toBe(200);
    expect(parseFloat(p1.body.balance)).toBe(750);
    expect(p1.body.status).toBe('partially_paid');

    const p2 = await request(app)
      .post(`/api/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 400, method: 'check', date: TODAY });
    expect(p2.statusCode).toBe(200);
    expect(parseFloat(p2.body.balance)).toBe(350);
    expect(p2.body.status).toBe('partially_paid');

    // Both allocation records persist independently
    const { rows: allocs } = await pool.query(
      `SELECT pa.amount FROM payment_allocations pa WHERE pa.invoice_id=$1 ORDER BY pa.created_at`,
      [invoiceId]
    );
    expect(allocs).toHaveLength(2);
    expect(parseFloat(allocs[0].amount)).toBe(250);
    expect(parseFloat(allocs[1].amount)).toBe(400);
  });

  it('$1,000 full payment marks invoice as paid with balance=0', async () => {
    const res = await request(app)
      .post(`/api/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 1000, method: 'cash', date: TODAY });
    expect(res.statusCode).toBe(200);
    expect(parseFloat(res.body.balance)).toBe(0);
    expect(res.body.status).toBe('paid');
  });
});

// ── Section 3: Partial Payment Status ───────────────────────────────────────
describe('Partial payment status transitions', () => {
  beforeEach(resetInvoice);

  it('unpaid → pending status; partial → partially_paid; full → paid', async () => {
    const { rows: [before] } = await pool.query(
      `SELECT status FROM invoices WHERE id=$1`, [invoiceId]
    );
    expect(before.status).toBe('pending');

    await request(app)
      .post(`/api/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 500, method: 'cash' });

    const { rows: [partial] } = await pool.query(
      `SELECT status, balance FROM invoices WHERE id=$1`, [invoiceId]
    );
    expect(partial.status).toBe('partially_paid');
    expect(parseFloat(partial.balance)).toBe(500);

    await request(app)
      .post(`/api/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 500, method: 'cash' });

    const { rows: [paid] } = await pool.query(
      `SELECT status, balance FROM invoices WHERE id=$1`, [invoiceId]
    );
    expect(paid.status).toBe('paid');
    expect(parseFloat(paid.balance)).toBe(0);
  });
});

// ── Section 4: Overapplication Protection ───────────────────────────────────
describe('Overapplication protection', () => {
  beforeEach(resetInvoice);

  it('rejects payment exceeding remaining balance', async () => {
    // First pay $800, leaving $200 balance
    await request(app)
      .post(`/api/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 800, method: 'cash' });

    // Attempt to pay $300 (exceeds $200 remaining)
    const res = await request(app)
      .post(`/api/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 300, method: 'cash' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/exceeds/i);

    // Balance must still be $200
    const { rows: [inv] } = await pool.query(
      `SELECT balance FROM invoices WHERE id=$1`, [invoiceId]
    );
    expect(parseFloat(inv.balance)).toBe(200);
  });

  it('rejects payment on an already-paid invoice', async () => {
    await pool.query(`UPDATE invoices SET status='paid', balance=0 WHERE id=$1`, [invoiceId]);
    const res = await request(app)
      .post(`/api/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, method: 'cash' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/paid/i);
  });

  it('rejects zero and negative amounts', async () => {
    const r1 = await request(app)
      .post(`/api/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 0, method: 'cash' });
    expect(r1.statusCode).toBe(400);

    const r2 = await request(app)
      .post(`/api/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: -50, method: 'cash' });
    expect(r2.statusCode).toBe(400);
  });
});

// ── Section 5: Payment History ───────────────────────────────────────────────
describe('Payment history — canonical traceability', () => {
  beforeEach(resetInvoice);

  it('payment history shows each partial payment separately', async () => {
    const p1 = await request(app)
      .post(`/api/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 300, method: 'cash', date: TODAY });
    const p2 = await request(app)
      .post(`/api/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 200, method: 'check', date: TODAY });

    const hist = await request(app)
      .get(`/api/invoices/${invoiceId}/payment-history`)
      .set('Authorization', `Bearer ${token}`);

    expect(hist.statusCode).toBe(200);
    const pmts = hist.body.events.filter(e => e.type === 'payment');
    expect(pmts).toHaveLength(2);
    const amounts = pmts.map(e => e.amount).sort((a, b) => a - b);
    expect(amounts[0]).toBe(200);
    expect(amounts[1]).toBe(300);
    // Both have canonical payment_ids
    expect(pmts[0].payment_id).toBeTruthy();
    expect(pmts[1].payment_id).toBeTruthy();
  });
});

// ── Section 6: Balance Reconciliation ───────────────────────────────────────
describe('Balance reconciliation', () => {
  beforeEach(resetInvoice);

  it('invoice.amount - SUM(payment_allocations) = invoice.balance', async () => {
    await request(app)
      .post(`/api/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 250, method: 'cash' });
    await request(app)
      .post(`/api/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 400, method: 'check' });

    const { rows: [inv] } = await pool.query(
      `SELECT amount, balance FROM invoices WHERE id=$1`, [invoiceId]
    );
    const { rows: [agg] } = await pool.query(
      `SELECT COALESCE(SUM(amount),0) AS total_paid
       FROM payment_allocations WHERE invoice_id=$1`, [invoiceId]
    );

    const expected = parseFloat(inv.amount) - parseFloat(agg.total_paid);
    expect(parseFloat(inv.balance)).toBeCloseTo(expected, 2);
    expect(parseFloat(inv.balance)).toBeCloseTo(350, 2);
  });
});

// ── Section 7: KPI Integrity ────────────────────────────────────────────────
describe('KPI integrity — outstanding includes partially_paid', () => {
  it('outstanding KPI uses remaining balance, not full amount', async () => {
    // Fresh invoice at full $1,000 is pending
    await resetInvoice();
    const before = await request(app)
      .get('/api/invoices')
      .set('Authorization', `Bearer ${token}`);
    const kpiBefore = before.body.kpis;

    // Pay $400 → invoice becomes partially_paid with $600 remaining
    await request(app)
      .post(`/api/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 400, method: 'cash' });

    const after = await request(app)
      .get('/api/invoices')
      .set('Authorization', `Bearer ${token}`);
    const kpiAfter = after.body.kpis;

    // Outstanding should drop by $400 (the amount paid)
    expect(parseFloat(kpiAfter.outstanding))
      .toBeCloseTo(parseFloat(kpiBefore.outstanding) - 400, 1);

    // Collected should increase by $400
    expect(parseFloat(kpiAfter.collected))
      .toBeCloseTo(parseFloat(kpiBefore.collected) + 400, 1);

    // partially_paid count should be in counts
    expect(kpiAfter.counts.partially_paid).toBeGreaterThan(0);
  });
});

// ── Section 8: Tenant Isolation ─────────────────────────────────────────────
describe('Tenant isolation on payments', () => {
  it('cannot pay another account invoice', async () => {
    const { rows: [acct2] } = await pool.query(
      `INSERT INTO accounts (name, plan) VALUES ('Tenant2Pay','pro') RETURNING id`
    );
    const otherToken = makeToken('00000000-0000-0000-0000-000000000002', acct2.id);
    const res = await request(app)
      .post(`/api/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ amount: 100, method: 'cash' });
    expect(res.statusCode).toBe(404);
    await pool.query(`DELETE FROM accounts WHERE id=$1`, [acct2.id]);
  });
});

// ── Section 9: Deposit Allocation ────────────────────────────────────────────
describe('Deposit allocation — canonical ledger', () => {
  let depositId;

  beforeAll(async () => {
    await resetInvoice();
    // Create a collected deposit for this client
    const { rows: [dep] } = await pool.query(
      `INSERT INTO deposits (account_id, client_id, job_id, amount, status, collected_at)
       VALUES ($1,$2,$3,200.00,'collected',NOW()) RETURNING id`,
      [accountId, clientId, jobId]
    );
    depositId = dep.id;
  });

  it('applies deposit credit and reduces invoice balance', async () => {
    await resetInvoice();
    const res = await request(app)
      .post(`/api/invoices/${invoiceId}/apply-deposit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ deposit_id: depositId, amount: 150 });

    expect(res.statusCode).toBe(200);
    expect(parseFloat(res.body.invoice.balance)).toBe(850);
    expect(res.body.invoice.status).toBe('partially_paid');

    // Allocation record exists
    const { rows: da } = await pool.query(
      `SELECT * FROM deposit_allocations WHERE deposit_id=$1 AND invoice_id=$2 AND voided_at IS NULL`,
      [depositId, invoiceId]
    );
    expect(da).toHaveLength(1);
    expect(parseFloat(da[0].amount)).toBe(150);
  });

  it('prevents duplicate deposit application to the same invoice', async () => {
    // deposit was applied above; try again
    const res = await request(app)
      .post(`/api/invoices/${invoiceId}/apply-deposit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ deposit_id: depositId, amount: 50 });
    expect(res.statusCode).toBe(409);
  });

  it('rejects deposit amount exceeding available deposit balance', async () => {
    await resetInvoice();
    // Try to apply $500 from a $200 deposit (even though some may be allocated — use fresh deposit)
    const { rows: [dep2] } = await pool.query(
      `INSERT INTO deposits (account_id, client_id, job_id, amount, status, collected_at)
       VALUES ($1,$2,$3,50.00,'collected',NOW()) RETURNING id`,
      [accountId, clientId, jobId]
    );
    const res = await request(app)
      .post(`/api/invoices/${invoiceId}/apply-deposit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ deposit_id: dep2.id, amount: 100 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/exceeds/i);
  });
});

// ── Section 10: Workspace multi-invoice payment ───────────────────────────────
describe('POST /api/payments — workspace multi-invoice allocation', () => {
  let inv2Id;

  beforeAll(async () => {
    await resetInvoice();
    // Create a second job + invoice for the same client
    const { rows: [j2] } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, status, amount, scheduled_at, duration_minutes)
       VALUES ($1,$2,'Second Service','complete',500,$3,60) RETURNING id`,
      [accountId, clientId, TODAY + 'T10:00:00Z']
    );
    const r2 = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type: 'JOB', job_id: j2.id,
        line_items:  [{ name: 'Second Service', quantity: 1, unit_price: 500, taxable: false }],
        payment_terms: 'due_on_receipt', status: 'pending',
      });
    expect(r2.statusCode).toBe(201);
    inv2Id = r2.body.id;
  });

  it('splits one payment across two invoices via allocations', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id:    clientId,
        method:       'CASH',
        payment_date: TODAY,
        allocations: [
          { invoice_id: invoiceId, amount: 200 },
          { invoice_id: inv2Id,    amount: 300 },
        ],
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.payment_id).toBeTruthy();

    // Invoice 1: $1000 - $200 = $800 remaining
    const { rows: [i1] } = await pool.query(
      `SELECT balance, status FROM invoices WHERE id=$1`, [invoiceId]
    );
    expect(parseFloat(i1.balance)).toBe(800);
    expect(i1.status).toBe('partially_paid');

    // Invoice 2: $500 - $300 = $200 remaining
    const { rows: [i2] } = await pool.query(
      `SELECT balance, status FROM invoices WHERE id=$1`, [inv2Id]
    );
    expect(parseFloat(i2.balance)).toBe(200);
    expect(i2.status).toBe('partially_paid');

    // Two allocation rows for one payment
    const { rows: allocs } = await pool.query(
      `SELECT amount FROM payment_allocations WHERE payment_id=$1 ORDER BY amount`,
      [res.body.payment_id]
    );
    expect(allocs).toHaveLength(2);
    expect(parseFloat(allocs[0].amount)).toBe(200);
    expect(parseFloat(allocs[1].amount)).toBe(300);
  });

  it('workspace payment rejects allocation exceeding invoice balance', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id:    clientId,
        method:       'CASH',
        payment_date: TODAY,
        allocations: [{ invoice_id: invoiceId, amount: 9999 }],
      });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/exceeds/i);
  });
});
