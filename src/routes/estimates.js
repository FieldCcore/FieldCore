const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const email   = require('../services/email');

function escHtml(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

let _tableReady = false;
async function ensureTable() {
  if (_tableReady) return;
  const c = await pool.connect();
  try {
    await c.query(`
      CREATE TABLE IF NOT EXISTS estimates (
        id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        client_id      UUID NOT NULL REFERENCES clients(id),
        job_id         UUID REFERENCES jobs(id),
        title          TEXT NOT NULL DEFAULT 'Service Estimate',
        line_items     JSONB NOT NULL DEFAULT '[]',
        amount         NUMERIC(10,2) NOT NULL DEFAULT 0,
        tax_amount     NUMERIC(10,2) DEFAULT 0,
        status         TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','sent','signed','declined','expired')),
        notes          TEXT,
        valid_until    DATE,
        signing_token  TEXT UNIQUE,
        signed_at      TIMESTAMPTZ,
        signature_data TEXT,
        sent_at        TIMESTAMPTZ,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_estimates_account ON estimates(account_id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_estimates_client  ON estimates(client_id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_estimates_token   ON estimates(signing_token)`);

    // New columns — additive, safe to run each boot
    await c.query(`ALTER TABLE estimates ADD COLUMN IF NOT EXISTS estimate_number      INTEGER`);
    await c.query(`ALTER TABLE estimates ADD COLUMN IF NOT EXISTS estimate_date        DATE`);
    await c.query(`ALTER TABLE estimates ADD COLUMN IF NOT EXISTS client_message       TEXT`);
    await c.query(`ALTER TABLE estimates ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT`);
    await c.query(`ALTER TABLE estimates ADD COLUMN IF NOT EXISTS discount             NUMERIC(10,2) DEFAULT 0`);
    await c.query(`ALTER TABLE estimates ADD COLUMN IF NOT EXISTS location_id          UUID`);
    await c.query(`ALTER TABLE estimates ADD COLUMN IF NOT EXISTS converted_invoice_id UUID`);
    // Validity + deposit structured fields
    await c.query(`ALTER TABLE estimates ADD COLUMN IF NOT EXISTS validity_days          INTEGER CHECK (validity_days IN (30,60,90))`);
    await c.query(`ALTER TABLE estimates ADD COLUMN IF NOT EXISTS deposit_required       BOOLEAN DEFAULT FALSE`);
    await c.query(`ALTER TABLE estimates ADD COLUMN IF NOT EXISTS deposit_type           TEXT CHECK (deposit_type IN ('percentage','fixed'))`);
    await c.query(`ALTER TABLE estimates ADD COLUMN IF NOT EXISTS deposit_percentage     NUMERIC(5,2) CHECK (deposit_percentage > 0 AND deposit_percentage <= 100)`);
    await c.query(`ALTER TABLE estimates ADD COLUMN IF NOT EXISTS deposit_fixed_amount   NUMERIC(10,2) CHECK (deposit_fixed_amount >= 0)`);
    await c.query(`ALTER TABLE estimates ADD COLUMN IF NOT EXISTS custom_terms           TEXT`);

    _tableReady = true;
    console.log('[estimates] table ready');
  } catch (err) {
    console.error('[estimates] ensureTable failed:', err.message);
  } finally {
    c.release();
  }
}

router.use((req, res, next) => { ensureTable().then(next).catch(next); });

// ─── Date helper: adds days to a yyyy-MM-dd string without UTC shift ────────
function calculateExpiry(dateStr, days) {
  if (!dateStr || !days) return null;
  const parts = String(dateStr).split('-');
  if (parts.length !== 3) return null;
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  d.setDate(d.getDate() + parseInt(days));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ─── Shared totals calculator ─────────────────────────────────────────────
function computeTotals(lineItems, discount, taxRate) {
  const validItems = lineItems.map(item => {
    const qty       = Math.max(0, parseFloat(item.quantity) || 1);
    const price     = Math.max(0, parseFloat(item.unit_price ?? item.amount) || 0);
    const lineTotal = parseFloat((qty * price).toFixed(2));
    return {
      name:        item.name || item.description || 'Service',
      description: item.description || '',
      quantity:    qty,
      unit_price:  price,
      taxable:     item.taxable !== false,
      line_total:  lineTotal,
      amount:      lineTotal,
    };
  });

  const subtotal       = parseFloat(validItems.reduce((s, i) => s + i.line_total, 0).toFixed(2));
  const discountAmount = parseFloat(Math.min(Math.max(parseFloat(discount) || 0, 0), subtotal).toFixed(2));

  const taxableSubtotal = parseFloat(
    validItems.filter(i => i.taxable).reduce((s, i) => s + i.line_total, 0).toFixed(2)
  );
  const discountRatio        = subtotal > 0 ? discountAmount / subtotal : 0;
  const taxableAfterDiscount = parseFloat((taxableSubtotal * (1 - discountRatio)).toFixed(2));
  const taxAmount            = parseFloat((taxableAfterDiscount * parseFloat(taxRate || 0)).toFixed(2));
  const total                = parseFloat((subtotal - discountAmount + taxAmount).toFixed(2));

  return { validItems, subtotal, discountAmount, taxAmount, total };
}

// GET /api/estimates — list all estimates for account
router.get('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.*, c.name AS client_name, c.email AS client_email
       FROM estimates e
       JOIN clients c ON c.id = e.client_id
       WHERE e.account_id = $1
       ORDER BY e.created_at DESC`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/estimates — create estimate
router.post('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const {
    client_id, title, line_items, notes, job_id,
    estimate_date, client_message, terms_and_conditions, discount, location_id,
    validity_days, deposit_required, deposit_type, deposit_percentage, deposit_fixed_amount, custom_terms,
  } = req.body;

  if (!client_id || !Array.isArray(line_items) || line_items.length === 0) {
    return res.status(400).json({ error: 'client_id and line_items are required' });
  }

  // Validate validity_days
  const vdays = parseInt(validity_days) || 30;
  if (![30, 60, 90].includes(vdays)) {
    return res.status(400).json({ error: 'validity_days must be 30, 60, or 90' });
  }

  // Validate deposit fields if deposit is required
  const depReq  = deposit_required === true || deposit_required === 'true';
  const depType = depReq ? deposit_type : null;
  let depPerc   = null;
  let depFixed  = null;
  if (depReq) {
    if (depType === 'percentage') {
      const p = parseFloat(deposit_percentage);
      if (isNaN(p) || p <= 0 || p > 100) return res.status(400).json({ error: 'deposit_percentage must be between 0 and 100' });
      depPerc = p;
    } else if (depType === 'fixed') {
      const f = parseFloat(deposit_fixed_amount);
      if (isNaN(f) || f < 0) return res.status(400).json({ error: 'deposit_fixed_amount must be >= 0' });
      depFixed = f;
    }
  }

  try {
    const [settingsRes, numRes] = await Promise.all([
      pool.query(`SELECT tax_rate FROM booking_settings WHERE account_id = $1`, [req.accountId]),
      pool.query(`SELECT COALESCE(MAX(estimate_number), 0) + 1 AS next FROM estimates WHERE account_id = $1`, [req.accountId]),
    ]);
    const taxRate     = parseFloat(settingsRes.rows[0]?.tax_rate || 0);
    const estimateNum = numRes.rows[0].next;
    const { validItems, discountAmount, taxAmount, total } = computeTotals(line_items, discount, taxRate);

    // Calculate valid_until from estimate_date + validity_days (timezone-safe)
    const estDateStr  = estimate_date || new Date().toISOString().slice(0, 10);
    const validUntil  = calculateExpiry(estDateStr, vdays);

    const { rows } = await pool.query(
      `INSERT INTO estimates
         (account_id, client_id, job_id, title, line_items, amount, tax_amount,
          notes, valid_until, estimate_number, estimate_date, client_message,
          terms_and_conditions, discount, location_id,
          validity_days, deposit_required, deposit_type,
          deposit_percentage, deposit_fixed_amount, custom_terms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING *`,
      [
        req.accountId, client_id, job_id || null,
        title || 'Service Estimate',
        JSON.stringify(validItems),
        total, taxAmount,
        notes || null,
        validUntil,
        estimateNum,
        estDateStr,
        client_message || null,
        terms_and_conditions || null,
        discountAmount,
        location_id || null,
        vdays,
        depReq,
        depType,
        depPerc,
        depFixed,
        custom_terms || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/estimates/next-number — preview next estimate number
router.get('/next-number', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const [numRes, settingsRes] = await Promise.all([
      pool.query(`SELECT COALESCE(MAX(estimate_number), 0) + 1 AS next FROM estimates WHERE account_id = $1`, [req.accountId]),
      pool.query(`SELECT tax_rate FROM booking_settings WHERE account_id = $1`, [req.accountId]),
    ]);
    res.json({
      next_number: numRes.rows[0].next,
      tax_rate:    parseFloat(settingsRes.rows[0]?.tax_rate || 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/estimates/sign/:token — public: fetch estimate for signing page
router.get('/sign/:token', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.*, c.name AS client_name, c.email AS client_email,
              a.name AS business_name
       FROM estimates e
       JOIN clients c ON c.id = e.client_id
       JOIN accounts a ON a.id = e.account_id
       WHERE e.signing_token = $1`,
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Estimate not found or link expired.' });
    const est = rows[0];
    if (est.status === 'signed') return res.json({ ...est, already_signed: true });
    if (est.status === 'expired') return res.status(410).json({ error: 'This estimate has expired.' });
    if (est.valid_until && new Date(est.valid_until) < new Date()) {
      return res.status(410).json({ error: 'This estimate has expired.' });
    }
    res.json(est);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/estimates/sign/:token — public: submit signature
router.post('/sign/:token', async (req, res) => {
  const { signature_data } = req.body;
  if (!signature_data) return res.status(400).json({ error: 'signature_data is required' });
  try {
    const { rows } = await pool.query(
      `UPDATE estimates
       SET status = 'signed', signed_at = NOW(), signature_data = $1
       WHERE signing_token = $2
         AND status IN ('sent','draft')
       RETURNING *`,
      [signature_data, req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Estimate not found or already signed.' });
    res.json({ success: true, signed_at: rows[0].signed_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/estimates/:id
router.get('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.*, c.name AS client_name, c.email AS client_email,
              inv.invoice_number AS converted_invoice_number
       FROM estimates e
       JOIN clients c ON c.id = e.client_id
       LEFT JOIN invoices inv ON inv.id = e.converted_invoice_id
       WHERE e.id = $1 AND e.account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/estimates/:id — update draft estimate
router.patch('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const {
    title, line_items, notes,
    estimate_date, client_message, terms_and_conditions, discount, location_id,
    validity_days, deposit_required, deposit_type, deposit_percentage, deposit_fixed_amount, custom_terms,
  } = req.body;
  try {
    const estRes = await pool.query(
      `SELECT * FROM estimates WHERE id = $1 AND account_id = $2`, [req.params.id, req.accountId]
    );
    if (!estRes.rows.length) return res.status(404).json({ error: 'Not found' });
    if (estRes.rows[0].status !== 'draft') return res.status(400).json({ error: 'Can only edit draft estimates' });

    const existing = estRes.rows[0];

    let amount    = existing.amount;
    let taxAmt    = existing.tax_amount;
    let validItems = existing.line_items;

    if (line_items) {
      const settingsRes = await pool.query(
        `SELECT tax_rate FROM booking_settings WHERE account_id = $1`, [req.accountId]
      );
      const taxRate  = parseFloat(settingsRes.rows[0]?.tax_rate || 0);
      const disc     = discount !== undefined ? discount : (existing.discount || 0);
      const computed = computeTotals(line_items, disc, taxRate);
      validItems     = computed.validItems;
      amount         = computed.total;
      taxAmt         = computed.taxAmount;
    }

    // Recalculate valid_until when estimate_date or validity_days changes
    const newEstDate  = estimate_date  !== undefined ? estimate_date  : existing.estimate_date;
    const newVdays    = validity_days  !== undefined ? parseInt(validity_days) : existing.validity_days;
    if (newVdays !== null && newVdays !== undefined && ![30, 60, 90].includes(newVdays)) {
      return res.status(400).json({ error: 'validity_days must be 30, 60, or 90' });
    }
    const newValidUntil = (newEstDate && newVdays) ? calculateExpiry(String(newEstDate), newVdays) : existing.valid_until;

    // Deposit fields
    const depReq = deposit_required !== undefined ? (deposit_required === true || deposit_required === 'true') : existing.deposit_required;

    const { rows } = await pool.query(
      `UPDATE estimates SET
         title                 = COALESCE($1,  title),
         line_items            = $2,
         notes                 = COALESCE($3,  notes),
         valid_until           = $4,
         amount                = $5,
         tax_amount            = $6,
         estimate_date         = COALESCE($7,  estimate_date),
         client_message        = COALESCE($8,  client_message),
         terms_and_conditions  = COALESCE($9,  terms_and_conditions),
         discount              = COALESCE($10, discount),
         location_id           = COALESCE($11, location_id),
         validity_days         = COALESCE($12, validity_days),
         deposit_required      = $13,
         deposit_type          = COALESCE($14, deposit_type),
         deposit_percentage    = COALESCE($15, deposit_percentage),
         deposit_fixed_amount  = COALESCE($16, deposit_fixed_amount),
         custom_terms          = COALESCE($17, custom_terms)
       WHERE id = $18 AND account_id = $19
       RETURNING *`,
      [
        title, JSON.stringify(validItems), notes, newValidUntil,
        amount, taxAmt,
        estimate_date, client_message, terms_and_conditions, discount, location_id,
        newVdays !== undefined ? newVdays : null,
        depReq,
        deposit_type !== undefined ? deposit_type : null,
        deposit_percentage !== undefined ? parseFloat(deposit_percentage) : null,
        deposit_fixed_amount !== undefined ? parseFloat(deposit_fixed_amount) : null,
        custom_terms !== undefined ? custom_terms : null,
        req.params.id, req.accountId,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/estimates/:id/send — email signing link to client
router.post('/:id/send', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.*, c.name AS client_name, c.email AS client_email, a.name AS business_name
       FROM estimates e
       JOIN clients c ON c.id = e.client_id
       JOIN accounts a ON a.id = e.account_id
       WHERE e.id = $1 AND e.account_id = $2`,
      [req.params.id, req.accountId]
    );
    const est = rows[0];
    if (!est) return res.status(404).json({ error: 'Not found' });
    if (!est.client_email) return res.status(400).json({ error: 'Client has no email address' });

    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `UPDATE estimates SET signing_token = $1, status = 'sent', sent_at = NOW() WHERE id = $2`,
      [token, est.id]
    );

    const appUrl  = process.env.APP_URL || 'https://www.getfieldcore.com';
    const signUrl = `${appUrl}/sign/${token}`;

    await email.send({
      to:      est.client_email,
      subject: `Estimate from ${est.business_name} — $${parseFloat(est.amount).toFixed(2)}`,
      html:    email.wrap(`
        <p>Hi ${escHtml(est.client_name?.split(' ')[0] || 'there')},</p>
        <p>${escHtml(est.business_name)} has sent you a service estimate for <strong>${escHtml(est.title)}</strong> totaling <strong>$${parseFloat(est.amount).toFixed(2)}</strong>.</p>
        <p>Please review and sign the estimate using the link below:</p>
        <div style="margin:24px 0">
          <a href="${signUrl}" style="display:inline-block;padding:12px 28px;background:#1C2333;color:#D6B58A;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none">Review &amp; Sign Estimate →</a>
        </div>
        ${est.valid_until ? `<p style="font-size:12px;color:#9ca3af">This estimate is valid until ${new Date(est.valid_until).toLocaleDateString('en-US', {month:'long',day:'numeric',year:'numeric'})}.</p>` : ''}
      `),
    });

    res.json({ success: true, sign_url: signUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/estimates/:id/void
router.post('/:id/void', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE estimates SET status = 'expired' WHERE id = $1 AND account_id = $2 RETURNING *`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/estimates/:id/convert-to-job
router.post('/:id/convert-to-job', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const estRes = await pool.query(
      `SELECT e.*, c.address AS client_address, c.city AS client_city, c.state AS client_state
       FROM estimates e
       JOIN clients c ON c.id = e.client_id
       WHERE e.id = $1 AND e.account_id = $2`,
      [req.params.id, req.accountId]
    );
    const est = estRes.rows[0];
    if (!est) return res.status(404).json({ error: 'Estimate not found' });
    if (est.status !== 'signed') {
      return res.status(400).json({ error: 'Only signed estimates can be converted to jobs' });
    }
    if (est.converted_job_id) {
      return res.status(409).json({ error: 'This estimate has already been converted to a job', job_id: est.converted_job_id });
    }

    const { rows: [job] } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, amount, notes,
                         service_address, service_city, service_state, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'scheduled') RETURNING *`,
      [req.accountId, est.client_id, est.title, est.amount, est.notes || null,
       est.client_address || null, est.client_city || null, est.client_state || null]
    );

    await pool.query(
      `UPDATE estimates SET converted_job_id = $1 WHERE id = $2`,
      [job.id, est.id]
    );

    res.status(201).json({ job, estimate_id: est.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
