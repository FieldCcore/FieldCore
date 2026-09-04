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

let accountId, userId, token, clientId, jobId;
let draftInvId, draftInvNumber;

beforeAll(async () => {
  await runMigrations();
  const hash = await bcrypt.hash('pw', 10);

  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
    [`__TEST_DRAFT_EDIT_${Date.now()}__`]
  );
  accountId = acct.id;

  const { rows: [u] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,'Draft Owner',$2,$3,'owner') RETURNING id`,
    [accountId, `draft-edit-${Date.now()}@test.fc`, hash]
  );
  userId = u.id;
  token  = makeToken(userId, accountId);

  const { rows: [c] } = await pool.query(
    `INSERT INTO clients (account_id, name, email) VALUES ($1,'Kevin Caines','kevin@test.fc') RETURNING id`,
    [accountId]
  );
  clientId = c.id;

  // Create a complete job with job-level price override:
  // jobs.amount = 15000 (actual booked price $15,000)
  const { rows: [j] } = await pool.query(
    `INSERT INTO jobs (account_id, client_id, service_type, status, amount, scheduled_at, duration_minutes)
     VALUES ($1,$2,'Full Detail','complete',15000,$3,60) RETURNING id`,
    [accountId, clientId, TODAY + 'T09:00:00Z']
  );
  jobId = j.id;

  // Insert a job_services row with catalog price $150 (price_cents = 15000 cents)
  await pool.query(
    `INSERT INTO job_services (account_id, job_id, service_name, quantity, price_cents, sort_order)
     VALUES ($1,$2,'Full Detail',1,15000,0)`,
    [accountId, jobId]
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM accounts WHERE id = $1`, [accountId]);
});

// ── Defect 2: eligible-jobs returns both j.amount and line_items.price_cents ──
describe('eligible-jobs price data', () => {
  it('returns j.amount=15000 and line_items[0].price_cents=15000 (catalog)', async () => {
    const res = await request(app)
      .get(`/api/invoices/eligible-jobs?client_id=${clientId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    const job = res.body.rows.find(r => r.id === jobId);
    expect(job).toBeTruthy();
    // Authoritative job price
    expect(parseFloat(job.amount)).toBe(15000);
    // Catalog price stored in job_services (stale — $150 in cents)
    expect(job.line_items[0].price_cents).toBe(15000); // $150 catalog price
    // The discrepancy: line_items sum ($150) !== job.amount ($15,000)
    // Frontend fix: when these differ, use job.amount
    const lineItemsTotal = job.line_items.reduce((s, li) => s + (li.price_cents || 0) / 100 * (li.quantity || 1), 0);
    expect(lineItemsTotal).toBe(150); // catalog price
    expect(parseFloat(job.amount)).toBe(15000); // actual price
    // Confirms frontend must use job.amount when they diverge
    expect(Math.abs(lineItemsTotal - parseFloat(job.amount))).toBeGreaterThan(0.01);
  });
});

// ── Defect 1: PUT /api/invoices/:id updates draft in-place ────────────────────
describe('PUT /api/invoices/:id — draft edit', () => {
  it('creates a draft invoice from a job', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_type: 'JOB',
        job_id:      jobId,
        subject:     'Full Detail Service',
        line_items:  [{ name: 'Full Detail', quantity: 1, unit_price: 15000, taxable: false }],
        payment_terms: 'net_30',
        status:      'draft',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('draft');
    expect(parseFloat(res.body.amount)).toBe(15000);
    draftInvId     = res.body.id;
    draftInvNumber = res.body.invoice_number;
  });

  it('updates the draft in-place via PUT — same id and invoice_number', async () => {
    const res = await request(app)
      .put(`/api/invoices/${draftInvId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        subject:       'Full Detail — Updated',
        line_items:    [{ name: 'Full Detail', quantity: 1, unit_price: 15000, taxable: false }],
        payment_terms: 'net_30',
        internal_notes: 'Edited by test',
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(draftInvId);
    expect(res.body.invoice_number).toBe(draftInvNumber);
    expect(res.body.subject).toBe('Full Detail — Updated');
    expect(res.body.internal_notes).toBe('Edited by test');
    expect(parseFloat(res.body.amount)).toBe(15000);
    expect(res.body.status).toBe('draft');
    // job_id must still be linked
    expect(res.body.job_id).toBe(jobId);
  });

  it('rejects PUT on a non-draft invoice (404 simulated via wrong account)', async () => {
    // Manually set status to pending to test the guard
    await pool.query(`UPDATE invoices SET status='pending' WHERE id=$1`, [draftInvId]);
    const res = await request(app)
      .put(`/api/invoices/${draftInvId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ subject: 'Should fail' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/draft/i);
    // Restore for cleanup
    await pool.query(`UPDATE invoices SET status='draft' WHERE id=$1`, [draftInvId]);
  });

  it('rejects PUT on another account invoice (tenant isolation)', async () => {
    const { rows: [acct2] } = await pool.query(
      `INSERT INTO accounts (name, plan) VALUES ('Tenant2','pro') RETURNING id`
    );
    const other = makeToken('00000000-0000-0000-0000-000000000001', acct2.id);
    const res = await request(app)
      .put(`/api/invoices/${draftInvId}`)
      .set('Authorization', `Bearer ${other}`)
      .send({ subject: 'Cross-tenant attempt' });
    expect(res.statusCode).toBe(404);
    await pool.query(`DELETE FROM accounts WHERE id=$1`, [acct2.id]);
  });

  it('PUT preserves client_message and terms when omitted from request body', async () => {
    // First, set a client_message on the draft
    await pool.query(
      `UPDATE invoices SET client_message='Thank you for your business', terms='Net 30 terms apply' WHERE id=$1`,
      [draftInvId]
    );
    // PUT without client_message or terms — they must NOT be cleared to null
    const res = await request(app)
      .put(`/api/invoices/${draftInvId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        subject:    'Preservation test',
        line_items: [{ name: 'Full Detail', quantity: 1, unit_price: 15000, taxable: false }],
      });
    expect(res.statusCode).toBe(200);
    expect(res.body.client_message).toBe('Thank you for your business');
    expect(res.body.terms).toBe('Net 30 terms apply');
  });

  it('does NOT create a new invoice on second edit — no duplicate', async () => {
    const before = await pool.query(
      `SELECT COUNT(*) FROM invoices WHERE job_id=$1 AND account_id=$2`,
      [jobId, accountId]
    );
    await request(app)
      .put(`/api/invoices/${draftInvId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ subject: 'Third edit', line_items: [{ name: 'Full Detail', quantity: 1, unit_price: 15000, taxable: false }] });
    const after = await pool.query(
      `SELECT COUNT(*) FROM invoices WHERE job_id=$1 AND account_id=$2`,
      [jobId, accountId]
    );
    expect(parseInt(after.rows[0].count)).toBe(parseInt(before.rows[0].count));
  });
});
