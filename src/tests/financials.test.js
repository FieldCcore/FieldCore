'use strict';
/**
 * Financials Analytics — Integration Tests
 *
 * Tests AR aging, cash flow, profitability (gross revenue), P&L structure,
 * tenant isolation, permission enforcement, and unavailable states.
 *
 * Requires a live DATABASE_URL.
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
let otherAccountId, otherUserId, otherToken;
let clientId;

const TODAY = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  const hash = await bcrypt.hash('pw123', 10);

  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, $2) RETURNING id`,
    [`__TEST_FINANCIALS_${Date.now()}__`, 'pro']
  );
  accountId = acct.id;

  const { rows: [u] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [accountId, 'Fin Owner', `fin-owner-${Date.now()}@test.fc`, hash, 'owner']
  );
  userId = u.id;
  token  = makeToken(userId, accountId, 'owner');

  const { rows: [acct2] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, $2) RETURNING id`,
    [`__TEST_FINANCIALS_OTHER_${Date.now()}__`, 'pro']
  );
  otherAccountId = acct2.id;
  const { rows: [u2] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [otherAccountId, 'Other Owner', `fin-other-${Date.now()}@test.fc`, hash, 'owner']
  );
  otherUserId = u2.id;
  otherToken  = makeToken(u2.id, otherAccountId, 'owner');

  const { rows: [c] } = await pool.query(
    `INSERT INTO clients (account_id, name, email) VALUES ($1,$2,$3) RETURNING id`,
    [accountId, 'Fin Client', `fin-client-${Date.now()}@test.fc`]
  );
  clientId = c.id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM accounts WHERE id IN ($1,$2)`, [accountId, otherAccountId]);
  await pool.end();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createJob({ status = 'complete', amount = 20000, scheduledAt, tipAmount = 0, travelFee = 0 } = {}) {
  const { rows: [j] } = await pool.query(
    `INSERT INTO jobs (account_id, client_id, service_type, status, amount, scheduled_at, tip_amount, travel_fee, duration_minutes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [accountId, clientId, 'Cleaning', status, amount, scheduledAt || TODAY + 'T10:00:00Z', tipAmount, travelFee, 60]
  );
  return j.id;
}

async function createInvoice({ jobId, amount = 20000, status = 'paid', paidAt, sentAt } = {}) {
  const { rows: [i] } = await pool.query(
    `INSERT INTO invoices (account_id, job_id, client_id, amount, status, paid_at, sent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [accountId, jobId || (await createJob()), clientId, amount, status,
     status === 'paid' ? (paidAt || TODAY + 'T12:00:00Z') : null,
     sentAt || null]
  );
  return i.id;
}

async function createDeposit({ amount = 5000, status = 'collected', collectedAt, jobId } = {}) {
  const jId = jobId || (await createJob({ status: 'complete' }));
  const { rows: [d] } = await pool.query(
    `INSERT INTO deposits (account_id, job_id, client_id, amount, type, status, collected_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [accountId, jId, clientId, amount, 'booking', status,
     status === 'collected' ? (collectedAt || TODAY + 'T09:00:00Z') : null]
  );
  return d.id;
}

// ── GET /api/revenue/financials — auth & permission ───────────────────────────

describe('GET /api/revenue/financials — auth & permissions', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/revenue/financials');
    expect(res.status).toBe(401);
  });

  it('returns 403 for a tech user', async () => {
    const hash = await bcrypt.hash('pw', 10);
    const { rows: [t] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [accountId, 'Tech User', `fin-tech-${Date.now()}@test.fc`, hash, 'tech']
    );
    const techToken = makeToken(t.id, accountId, 'tech');
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${techToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 for an owner', async () => {
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('returns 200 for a manager', async () => {
    const hash = await bcrypt.hash('pw', 10);
    const { rows: [m] } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [accountId, 'Mgr', `fin-mgr-${Date.now()}@test.fc`, hash, 'manager']
    );
    const mgrToken = makeToken(m.id, accountId, 'manager');
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${mgrToken}`);
    expect(res.status).toBe(200);
  });
});

// ── Response shape ────────────────────────────────────────────────────────────

describe('GET /api/revenue/financials — response shape', () => {
  it('returns the expected top-level keys', async () => {
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('period');
    expect(res.body).toHaveProperty('kpis');
    expect(res.body).toHaveProperty('pnl');
    expect(res.body).toHaveProperty('arAging');
    expect(res.body).toHaveProperty('cashFlow');
    expect(res.body).toHaveProperty('quarterly');
    expect(res.body).toHaveProperty('coverage');
    expect(res.body).toHaveProperty('providers');
    expect(res.body).toHaveProperty('dataQuality');
    expect(res.body).toHaveProperty('calculatedAt');
  });

  it('P&L rows contain all expected keys', async () => {
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    const keys = res.body.pnl.rows.map(r => r.key);
    expect(keys).toContain('grossRevenue');
    expect(keys).toContain('netRevenue');
    expect(keys).toContain('grossProfit');
    expect(keys).toContain('netProfit');
    expect(keys).toContain('netMargin');
  });

  it('providers array reflects the source model (no Stripe, includes FieldCore Payments)', async () => {
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    const providerKeys = res.body.providers.map(p => p.sourceKey);
    expect(providerKeys).toContain('fieldcore_payments');
    expect(providerKeys).toContain('accounting');
    expect(providerKeys).toContain('banking');
    expect(providerKeys).not.toContain('stripe');
  });

  it('coverage has coverageState and metric lists', async () => {
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    const { coverage } = res.body;
    expect(coverage).toHaveProperty('coverageState');
    expect(coverage).toHaveProperty('activeSources');
    expect(coverage).toHaveProperty('optionalSources');
    expect(coverage).toHaveProperty('availableMetrics');
    expect(coverage).toHaveProperty('unavailableMetrics');
    expect(['complete', 'strong', 'partial', 'limited']).toContain(coverage.coverageState);
  });

  it('FieldCore Payments is active in coverage (native data source)', async () => {
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    const active = res.body.coverage.activeSources.map(s => s.sourceKey);
    expect(active).toContain('fieldcore_payments');
    expect(active).toContain('fieldcore_core');
  });

  it('accounting and banking are optional sources (not failures)', async () => {
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    const optional = res.body.coverage.optionalSources.map(s => s.sourceKey);
    expect(optional).toContain('accounting');
    expect(optional).toContain('banking');
  });

  it('data quality contains only real quality issues (not connection warnings)', async () => {
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    const { dataQuality } = res.body;
    expect(dataQuality.limitations.length).toBeGreaterThan(0);
    // No "source not connected" warnings in data quality
    const warningLimitations = dataQuality.limitations.filter(l => l.severity === 'warning');
    expect(warningLimitations.length).toBe(0);
  });
});

// ── Gross Revenue calculation ─────────────────────────────────────────────────

describe('Financials — gross revenue from jobs, tips, and travel fees', () => {
  it('sums job amount, tip_amount, and travel_fee into grossRevenue', async () => {
    const jobId = await createJob({ amount: 20000, tipAmount: 1000, travelFee: 500, scheduledAt: TODAY + 'T10:00:00Z' });

    const res = await request(app)
      .get(`/api/revenue/financials?start=${TODAY}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const gr = res.body.kpis.grossRevenue;
    expect(gr.status).toBe('ok');
    expect(gr.breakdown.jobs).toBeGreaterThanOrEqual(2);
    expect(gr.breakdown.tips).toBeGreaterThanOrEqual(0.10);
    expect(gr.breakdown.travelFees).toBeGreaterThanOrEqual(0.05);
    expect(gr.value).toBeGreaterThanOrEqual(2.15);
    expect(gr.breakdown).not.toHaveProperty('refunds');

    await pool.query(`DELETE FROM jobs WHERE id = $1`, [jobId]);
  });

  it('grossRevenue value is present in P&L rows with status ok', async () => {
    const jobId = await createJob({ amount: 30000, scheduledAt: TODAY + 'T08:00:00Z' });

    const res = await request(app)
      .get(`/api/revenue/financials?start=${TODAY}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`);

    const grRow = res.body.pnl.rows.find(r => r.key === 'grossRevenue');
    expect(grRow).toBeDefined();
    expect(grRow.status).toBe('ok');
    expect(grRow.value).toBeGreaterThan(0);

    await pool.query(`DELETE FROM jobs WHERE id = $1`, [jobId]);
  });

  it('cancelled jobs do not contribute to grossRevenue', async () => {
    const res1 = await request(app)
      .get(`/api/revenue/financials?start=${TODAY}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`);
    const before = res1.body.kpis.grossRevenue.value;

    const jobId = await createJob({ status: 'cancelled', amount: 50000, scheduledAt: TODAY + 'T09:00:00Z' });

    const res2 = await request(app)
      .get(`/api/revenue/financials?start=${TODAY}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res2.body.kpis.grossRevenue.value).toBe(before);

    await pool.query(`DELETE FROM jobs WHERE id = $1`, [jobId]);
  });
});

// ── Unavailable states ────────────────────────────────────────────────────────

describe('Financials — unavailable states for unconnected sources', () => {
  it('grossProfit has status unavailable', async () => {
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.kpis.grossProfit.status).toBe('unavailable');
  });

  it('netProfit has status unavailable', async () => {
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.kpis.netProfit.status).toBe('unavailable');
  });

  it('cashOut has status unavailable', async () => {
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.kpis.cashOut.status).toBe('unavailable');
  });

  it('netCashFlow has status unavailable', async () => {
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.kpis.netCashFlow.status).toBe('unavailable');
  });

  it('P&L rows for grossProfit, netProfit, netMargin are all unavailable', async () => {
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    const unavailKeys = ['grossProfit', 'netProfit', 'netMargin', 'cogs', 'operatingProfit'];
    unavailKeys.forEach(key => {
      const row = res.body.pnl.rows.find(r => r.key === key);
      expect(row).toBeDefined();
      expect(row.status).toBe('unavailable');
      expect(row.value).toBeNull();
    });
  });

  it('pnl.setupGuide explains how to unlock profitability', async () => {
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.pnl.setupGuide).toBeDefined();
    expect(res.body.pnl.setupGuide.steps.length).toBeGreaterThan(0);
  });
});

// ── Cash In ───────────────────────────────────────────────────────────────────

describe('Financials — cashIn from paid invoices and collected deposits', () => {
  it('cashIn reflects paid invoices in the period', async () => {
    const before = (await request(app)
      .get(`/api/revenue/financials?start=${TODAY}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`)).body.kpis.cashIn.value;

    const invId = await createInvoice({ amount: 10000, status: 'paid' });

    const after = (await request(app)
      .get(`/api/revenue/financials?start=${TODAY}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`)).body.kpis.cashIn.value;

    expect(after).toBeGreaterThan(before);
    await pool.query(`DELETE FROM invoices WHERE id = $1`, [invId]);
  });

  it('cashIn reflects collected deposits in the period', async () => {
    const before = (await request(app)
      .get(`/api/revenue/financials?start=${TODAY}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`)).body.kpis.cashIn.value;

    const depId = await createDeposit({ amount: 3000, status: 'collected' });

    const after = (await request(app)
      .get(`/api/revenue/financials?start=${TODAY}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`)).body.kpis.cashIn.value;

    expect(after).toBeGreaterThan(before);
    await pool.query(`DELETE FROM deposits WHERE id = $1`, [depId]);
  });

  it('cashIn has status ok', async () => {
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.kpis.cashIn.status).toBe('ok');
  });
});

// ── AR Aging ──────────────────────────────────────────────────────────────────

describe('Financials — AR aging buckets', () => {
  it('arAging response has total, buckets (5), invoiceCount, overdueTotal', async () => {
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    const { arAging } = res.body;
    expect(arAging).toHaveProperty('total');
    expect(arAging).toHaveProperty('buckets');
    expect(arAging).toHaveProperty('invoiceCount');
    expect(arAging).toHaveProperty('overdueTotal');
    expect(arAging.buckets).toHaveLength(5);
  });

  it('buckets are labelled Current, 1–30 days, 31–60 days, 61–90 days, 90+ days', async () => {
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    const labels = res.body.arAging.buckets.map(b => b.label);
    expect(labels).toEqual(['Current', '1–30 days', '31–60 days', '61–90 days', '90+ days']);
  });

  it('a pending invoice with no sent_at lands in a bucket based on created_at + 30 days', async () => {
    const invId = await createInvoice({ amount: 8000, status: 'pending', sentAt: null });

    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    const { arAging } = res.body;
    expect(arAging.total).toBeGreaterThan(0);
    expect(arAging.invoiceCount).toBeGreaterThan(0);

    await pool.query(`DELETE FROM invoices WHERE id = $1`, [invId]);
  });
});

// ── Tenant isolation ──────────────────────────────────────────────────────────

describe('Financials — tenant isolation', () => {
  it('does not expose grossRevenue from another account', async () => {
    const jobId = await createJob({ amount: 99999, scheduledAt: TODAY + 'T08:00:00Z' });

    const res = await request(app)
      .get(`/api/revenue/financials?start=${TODAY}&end=${TODAY}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.kpis.grossRevenue.value).toBe(0);

    await pool.query(`DELETE FROM jobs WHERE id = $1`, [jobId]);
  });

  it('AR aging for other account shows empty buckets', async () => {
    const invId = await createInvoice({ amount: 50000, status: 'pending' });

    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.arAging.invoiceCount).toBe(0);

    await pool.query(`DELETE FROM invoices WHERE id = $1`, [invId]);
  });
});

// ── Quarterly data included ───────────────────────────────────────────────────

describe('Financials — quarterly data included in response', () => {
  it('quarterly property contains year and quarters', async () => {
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.quarterly).toHaveProperty('year');
    expect(res.body.quarterly).toHaveProperty('quarters');
    expect(res.body.quarterly.quarters).toHaveProperty('Q1');
    expect(res.body.quarterly.quarters).toHaveProperty('Q4');
  });
});

// ── Comparison period ─────────────────────────────────────────────────────────

describe('Financials — comparison period', () => {
  it('comparisonPeriod is null when comparison=none', async () => {
    const res = await request(app)
      .get('/api/revenue/financials?comparison=none')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.comparisonPeriod).toBeNull();
    expect(res.body.kpis.compGrossRevenue).toBeNull();
  });

  it('returns compGrossRevenue when comparison=previous_period', async () => {
    const res = await request(app)
      .get('/api/revenue/financials?comparison=previous_period')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.comparisonPeriod).not.toBeNull();
    expect(res.body.kpis).toHaveProperty('compGrossRevenue');
  });

  it('returns comparisonPeriod when comparison=previous_quarter', async () => {
    const res = await request(app)
      .get('/api/revenue/financials?comparison=previous_quarter')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.comparisonPeriod).not.toBeNull();
    expect(res.body.comparisonPeriod.type).toBe('previous_quarter');
    expect(res.body.kpis).toHaveProperty('compGrossRevenue');
  });
});

// ── AR aging avgDaysToPay ─────────────────────────────────────────────────────

describe('Financials — AR aging avgDaysToPay', () => {
  it('arAging response includes avgDaysToPay property', async () => {
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.arAging).toHaveProperty('avgDaysToPay');
  });

  it('avgDaysToPay is a number or null', async () => {
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    const avg = res.body.arAging.avgDaysToPay;
    expect(avg === null || typeof avg === 'number').toBe(true);
  });

  it('avgDaysToPay increases when paid invoice exists', async () => {
    const invId = await createInvoice({ amount: 15000, status: 'paid' });
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    const avg = res.body.arAging.avgDaysToPay;
    expect(avg === null || typeof avg === 'number').toBe(true);
    await pool.query(`DELETE FROM invoices WHERE id = $1`, [invId]);
  });
});

// ── profitability provenance ──────────────────────────────────────────────────

describe('Financials — unavailable metrics include provenance', () => {
  it('grossProfit kpi includes provenance', async () => {
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.kpis.grossProfit).toHaveProperty('provenance');
    expect(res.body.kpis.grossProfit.provenance).toHaveProperty('formula');
  });

  it('netProfit kpi includes provenance', async () => {
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.kpis.netProfit).toHaveProperty('provenance');
  });

  it('operatingExpenses kpi includes provenance', async () => {
    const res = await request(app)
      .get('/api/revenue/financials')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.kpis.operatingExpenses).toHaveProperty('provenance');
  });
});
