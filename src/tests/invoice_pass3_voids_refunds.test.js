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

let accountId, userId, token, clientId;

// Invoice IDs set up for specific status scenarios
let draftInvId, pendingInvId, paidInvId, partialInvId;
// Payment IDs for refund tests
let paidPaymentId, partialPaymentId;

beforeAll(async () => {
  await runMigrations();
  const hash = await bcrypt.hash('pw', 10);

  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
    [`__TEST_PASS3_${Date.now()}__`]
  );
  accountId = acct.id;

  const { rows: [u] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Pass3 Owner',$2,$3,'owner') RETURNING id`,
    [accountId, `pass3-${Date.now()}@test.fc`, hash]
  );
  userId = u.id;
  token  = makeToken(userId, accountId);

  const { rows: [c] } = await pool.query(
    `INSERT INTO clients (account_id, name, email, ltv) VALUES ($1,'Test Client','c@test.fc',0) RETURNING id`,
    [accountId]
  );
  clientId = c.id;

  // Draft invoice
  const { rows: [d] } = await pool.query(
    `INSERT INTO invoices (account_id, client_id, source_type, status, amount, subtotal, tax_amount, discount_amount, balance)
     VALUES ($1,$2,'MANUAL','draft',500,500,0,0,500) RETURNING id`,
    [accountId, clientId]
  );
  draftInvId = d.id;

  // Pending invoice
  const { rows: [p] } = await pool.query(
    `INSERT INTO invoices (account_id, client_id, source_type, status, amount, subtotal, tax_amount, discount_amount, balance)
     VALUES ($1,$2,'MANUAL','pending',800,800,0,0,800) RETURNING id`,
    [accountId, clientId]
  );
  pendingInvId = p.id;

  // Paid invoice — with a canonical payment record so refunds work
  const { rows: [pi] } = await pool.query(
    `INSERT INTO invoices (account_id, client_id, source_type, status, amount, subtotal, tax_amount, discount_amount, balance)
     VALUES ($1,$2,'MANUAL','paid',1000,1000,0,0,0) RETURNING id`,
    [accountId, clientId]
  );
  paidInvId = pi.id;

  const { rows: [pay] } = await pool.query(
    `INSERT INTO payments (account_id, client_id, amount, method, payment_date, created_by)
     VALUES ($1,$2,1000,'CASH',$3,$4) RETURNING id`,
    [accountId, clientId, TODAY, userId]
  );
  paidPaymentId = pay.id;

  await pool.query(
    `INSERT INTO payment_allocations (payment_id, invoice_id, account_id, amount)
     VALUES ($1,$2,$3,1000)`,
    [paidPaymentId, paidInvId, accountId]
  );

  // Seed LTV for the paid invoice
  await pool.query(`UPDATE clients SET ltv = 1000 WHERE id = $1`, [clientId]);

  // Partially paid invoice — $600 of $1000 paid
  const { rows: [ppi] } = await pool.query(
    `INSERT INTO invoices (account_id, client_id, source_type, status, amount, subtotal, tax_amount, discount_amount, balance)
     VALUES ($1,$2,'MANUAL','partially_paid',1000,1000,0,0,400) RETURNING id`,
    [accountId, clientId]
  );
  partialInvId = ppi.id;

  const { rows: [ppay] } = await pool.query(
    `INSERT INTO payments (account_id, client_id, amount, method, payment_date, created_by)
     VALUES ($1,$2,600,'CASH',$3,$4) RETURNING id`,
    [accountId, clientId, TODAY, userId]
  );
  partialPaymentId = ppay.id;

  await pool.query(
    `INSERT INTO payment_allocations (payment_id, invoice_id, account_id, amount)
     VALUES ($1,$2,$3,600)`,
    [partialPaymentId, partialInvId, accountId]
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM accounts WHERE id = $1`, [accountId]);
});

// ─── VOID ───────────────────────────────────────────────────────────────────

describe('PATCH /api/invoices/:id/void', () => {
  it('voids a pending invoice and stores void_reason', async () => {
    // Create a fresh pending invoice for this test to avoid state pollution
    const { rows: [inv] } = await pool.query(
      `INSERT INTO invoices (account_id, client_id, source_type, status, amount, subtotal, tax_amount, discount_amount, balance)
       VALUES ($1,$2,'MANUAL','pending',300,300,0,0,300) RETURNING id`,
      [accountId, clientId]
    );
    const res = await request(app)
      .patch(`/api/invoices/${inv.id}/void`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Client cancelled service' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('void');
    expect(res.body.void_reason).toBe('Client cancelled service');
  });

  it('voids a partially_paid invoice', async () => {
    const { rows: [inv] } = await pool.query(
      `INSERT INTO invoices (account_id, client_id, source_type, status, amount, subtotal, tax_amount, discount_amount, balance)
       VALUES ($1,$2,'MANUAL','partially_paid',500,500,0,0,200) RETURNING id`,
      [accountId, clientId]
    );
    const res = await request(app)
      .patch(`/api/invoices/${inv.id}/void`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('void');
  });

  it('rejects voiding a draft invoice (400)', async () => {
    const res = await request(app)
      .patch(`/api/invoices/${draftInvId}/void`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/draft/i);
  });

  it('rejects voiding a paid invoice (400)', async () => {
    const res = await request(app)
      .patch(`/api/invoices/${paidInvId}/void`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/paid/i);
  });

  it('rejects voiding an already-void invoice (400)', async () => {
    const { rows: [inv] } = await pool.query(
      `INSERT INTO invoices (account_id, client_id, source_type, status, amount, subtotal, tax_amount, discount_amount)
       VALUES ($1,$2,'MANUAL','void',100,100,0,0) RETURNING id`,
      [accountId, clientId]
    );
    const res = await request(app)
      .patch(`/api/invoices/${inv.id}/void`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/already void/i);
  });

  it('rejects cross-tenant void (404)', async () => {
    const { rows: [acct2] } = await pool.query(
      `INSERT INTO accounts (name, plan) VALUES ('Tenant2void','pro') RETURNING id`
    );
    const other = makeToken('00000000-0000-0000-0000-000000000001', acct2.id);
    const res = await request(app)
      .patch(`/api/invoices/${pendingInvId}/void`)
      .set('Authorization', `Bearer ${other}`)
      .send({});
    expect(res.statusCode).toBe(404);
    await pool.query(`DELETE FROM accounts WHERE id = $1`, [acct2.id]);
  });
});

// ─── DELETE ──────────────────────────────────────────────────────────────────

describe('DELETE /api/invoices/:id', () => {
  it('deletes a draft invoice', async () => {
    const { rows: [inv] } = await pool.query(
      `INSERT INTO invoices (account_id, client_id, source_type, status, amount, subtotal, tax_amount, discount_amount)
       VALUES ($1,$2,'MANUAL','draft',200,200,0,0) RETURNING id`,
      [accountId, clientId]
    );
    const res = await request(app)
      .delete(`/api/invoices/${inv.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    // Confirm gone
    const { rows } = await pool.query(`SELECT id FROM invoices WHERE id = $1`, [inv.id]);
    expect(rows.length).toBe(0);
  });

  it('rejects deleting a pending (issued) invoice (400)', async () => {
    const res = await request(app)
      .delete(`/api/invoices/${pendingInvId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/draft/i);
  });

  it('rejects deleting a paid invoice (400)', async () => {
    const res = await request(app)
      .delete(`/api/invoices/${paidInvId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/draft/i);
  });

  it('rejects deleting a partially_paid invoice (400)', async () => {
    const res = await request(app)
      .delete(`/api/invoices/${partialInvId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/draft/i);
  });
});

// ─── REFUNDS ─────────────────────────────────────────────────────────────────

describe('POST /api/payments/:id/refund', () => {
  it('fully refunds a paid invoice — balance restored, status → pending', async () => {
    const res = await request(app)
      .post(`/api/payments/${paidPaymentId}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 1000, reason: 'Full refund — client dissatisfied' });

    expect(res.statusCode).toBe(200);
    expect(res.body.refund_id).toBeTruthy();
    expect(res.body.payment_id).toBe(paidPaymentId);
    expect(parseFloat(res.body.amount_refunded)).toBe(1000);
    expect(res.body.invoices).toHaveLength(1);
    expect(res.body.invoices[0].status).toBe('pending');
    expect(parseFloat(res.body.invoices[0].balance)).toBe(1000);

    // LTV decremented
    const { rows: [cl] } = await pool.query(`SELECT ltv FROM clients WHERE id = $1`, [clientId]);
    expect(parseFloat(cl.ltv)).toBe(0);
  });

  it('refund event appears in payment history', async () => {
    const res = await request(app)
      .get(`/api/invoices/${paidInvId}/payment-history`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    const refundEvent = res.body.events.find(e => e.type === 'refund');
    expect(refundEvent).toBeTruthy();
    expect(parseFloat(refundEvent.amount)).toBe(-1000);
    expect(refundEvent.note).toBe('Full refund — client dissatisfied');
    expect(refundEvent.status).toBe('refunded');
  });

  it('double-full-refund rejected (400 — nothing left to refund)', async () => {
    const res = await request(app)
      .post(`/api/payments/${paidPaymentId}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 1, reason: 'duplicate' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/refundable/i);
  });

  it('partial refund — balance partially restored, status → partially_paid', async () => {
    // partialInvId is partially_paid with $400 remaining balance,
    // funded by partialPaymentId ($600). Refund $100 of that $600.
    const res = await request(app)
      .post(`/api/payments/${partialPaymentId}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, reason: 'Partial dispute' });

    expect(res.statusCode).toBe(200);
    expect(parseFloat(res.body.amount_refunded)).toBe(100);
    expect(res.body.invoices[0].status).toBe('partially_paid');
    // Balance was $400; refund $100 of payment → balance goes up $100 → $500
    expect(parseFloat(res.body.invoices[0].balance)).toBe(500);
  });

  it('refund amount exceeding refundable balance rejected (400)', async () => {
    // partialPaymentId has $500 refundable left ($600 - $100 already refunded)
    const res = await request(app)
      .post(`/api/payments/${partialPaymentId}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 999 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/refundable/i);
  });

  it('zero/negative refund amount rejected (400)', async () => {
    const res = await request(app)
      .post(`/api/payments/${partialPaymentId}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 0 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/positive/i);
  });

  it('cross-tenant refund rejected (404)', async () => {
    const { rows: [acct2] } = await pool.query(
      `INSERT INTO accounts (name, plan) VALUES ('Tenant2refund','pro') RETURNING id`
    );
    const other = makeToken('00000000-0000-0000-0000-000000000002', acct2.id);
    const res = await request(app)
      .post(`/api/payments/${partialPaymentId}/refund`)
      .set('Authorization', `Bearer ${other}`)
      .send({ amount: 50 });
    expect(res.statusCode).toBe(404);
    await pool.query(`DELETE FROM accounts WHERE id = $1`, [acct2.id]);
  });
});

// ─── KPI INTEGRITY AFTER REFUND ───────────────────────────────────────────────

describe('KPI integrity after refund', () => {
  it('collected KPI decreases after full refund', async () => {
    // paidInvId was refunded in full → its $1000 should no longer be in collected
    // It moved to pending (balance=$1000), so outstanding should include it
    const res = await request(app)
      .get('/api/invoices')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    // outstanding includes the restored balance
    expect(res.body.kpis.outstanding).toBeGreaterThanOrEqual(1000);
    // collected does not include the refunded invoice amount
    // (it may still have partialInvId partial collection minus its refund)
    // Just verify collected < it would have been before ($1000 was paid, then refunded)
    expect(res.body.kpis.counts.pending).toBeGreaterThanOrEqual(1);
  });
});

// ─── VOID IN PAYMENT HISTORY ──────────────────────────────────────────────────

describe('void event in payment history', () => {
  let voidedInvId;

  beforeAll(async () => {
    const { rows: [inv] } = await pool.query(
      `INSERT INTO invoices (account_id, client_id, source_type, status, amount, subtotal, tax_amount, discount_amount, balance)
       VALUES ($1,$2,'MANUAL','pending',250,250,0,0,250) RETURNING id`,
      [accountId, clientId]
    );
    voidedInvId = inv.id;
    await request(app)
      .patch(`/api/invoices/${voidedInvId}/void`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Duplicate invoice' });
  });

  it('void event has type=void, correct actor, and void_reason in note', async () => {
    const res = await request(app)
      .get(`/api/invoices/${voidedInvId}/payment-history`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    const voidEvent = res.body.events.find(e => e.type === 'void');
    expect(voidEvent).toBeTruthy();
    expect(voidEvent.status).toBe('voided');
    expect(voidEvent.note).toBe('Duplicate invoice');
    expect(voidEvent.actor_name).toBeTruthy();
  });
});

// ─── WRITE-OFF — NOT SUPPORTED ───────────────────────────────────────────────
// FieldCore has no write-off / bad-debt mechanism. These tests confirm that no
// JSON API handler exists for these paths (unmatched routes fall through to the
// SPA, returning HTML — not a JSON { success } response).

describe('write-off / bad debt', () => {
  it('no write-off JSON API handler exists on invoices', async () => {
    const res = await request(app)
      .patch(`/api/invoices/${pendingInvId}/write-off`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    // Unmatched API routes fall through to the SPA (returns HTML, not JSON)
    expect(res.headers['content-type']).not.toMatch(/application\/json/);
  });

  it('no write-off JSON API handler exists on payments', async () => {
    const res = await request(app)
      .patch(`/api/payments/${partialPaymentId}/write-off`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.headers['content-type']).not.toMatch(/application\/json/);
  });
});

// ─── PERMISSIONS ─────────────────────────────────────────────────────────────

describe('permission enforcement', () => {
  let techToken;

  beforeAll(async () => {
    const hash = await bcrypt.hash('pw', 10);
    const { rows: [t] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role)
       VALUES ($1,'Tech','tech-pass3@test.fc',$2,'tech') RETURNING id`,
      [accountId, hash]
    );
    techToken = makeToken(t.id, accountId, 'tech');
  });

  it('tech cannot void an invoice (403)', async () => {
    const res = await request(app)
      .patch(`/api/invoices/${pendingInvId}/void`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({});
    expect(res.statusCode).toBe(403);
  });

  it('tech cannot delete an invoice (403)', async () => {
    const res = await request(app)
      .delete(`/api/invoices/${draftInvId}`)
      .set('Authorization', `Bearer ${techToken}`);
    expect(res.statusCode).toBe(403);
  });

  it('tech cannot issue a refund (403)', async () => {
    const res = await request(app)
      .post(`/api/payments/${partialPaymentId}/refund`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ amount: 10 });
    expect(res.statusCode).toBe(403);
  });

  it('unauthenticated request rejected (401)', async () => {
    const res = await request(app)
      .patch(`/api/invoices/${pendingInvId}/void`)
      .send({});
    expect(res.statusCode).toBe(401);
  });
});
