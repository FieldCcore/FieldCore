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
    _tableReady = true;
    console.log('[estimates] table ready');
  } catch (err) {
    console.error('[estimates] ensureTable failed:', err.message);
  } finally {
    c.release();
  }
}

router.use((req, res, next) => { ensureTable().then(next).catch(next); });

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
  const { client_id, title, line_items, notes, valid_until, job_id } = req.body;
  if (!client_id || !Array.isArray(line_items) || line_items.length === 0) {
    return res.status(400).json({ error: 'client_id and line_items are required' });
  }
  try {
    const settingsRes = await pool.query(
      `SELECT tax_rate FROM booking_settings WHERE account_id = $1`, [req.accountId]
    );
    const taxRate  = parseFloat(settingsRes.rows[0]?.tax_rate || 0);
    const subtotal = line_items.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    const taxAmt   = subtotal > 0 ? parseFloat((subtotal * taxRate).toFixed(2)) : 0;
    const total    = parseFloat((subtotal + taxAmt).toFixed(2));

    const { rows } = await pool.query(
      `INSERT INTO estimates (account_id, client_id, job_id, title, line_items, amount, tax_amount, notes, valid_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.accountId, client_id, job_id || null, title || 'Service Estimate',
       JSON.stringify(line_items), total, taxAmt, notes || null, valid_until || null]
    );
    res.status(201).json(rows[0]);
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
      `SELECT e.*, c.name AS client_name, c.email AS client_email
       FROM estimates e JOIN clients c ON c.id = e.client_id
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
  const { title, line_items, notes, valid_until } = req.body;
  try {
    const estRes = await pool.query(
      `SELECT * FROM estimates WHERE id = $1 AND account_id = $2`, [req.params.id, req.accountId]
    );
    if (!estRes.rows.length) return res.status(404).json({ error: 'Not found' });
    if (estRes.rows[0].status !== 'draft') return res.status(400).json({ error: 'Can only edit draft estimates' });

    let amount = estRes.rows[0].amount;
    let taxAmt = estRes.rows[0].tax_amount;
    if (line_items) {
      const settingsRes = await pool.query(
        `SELECT tax_rate FROM booking_settings WHERE account_id = $1`, [req.accountId]
      );
      const taxRate  = parseFloat(settingsRes.rows[0]?.tax_rate || 0);
      const subtotal = line_items.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
      taxAmt  = parseFloat((subtotal * taxRate).toFixed(2));
      amount  = parseFloat((subtotal + taxAmt).toFixed(2));
    }

    const { rows } = await pool.query(
      `UPDATE estimates SET
         title      = COALESCE($1, title),
         line_items = COALESCE($2, line_items),
         notes      = COALESCE($3, notes),
         valid_until = COALESCE($4, valid_until),
         amount     = $5,
         tax_amount = $6
       WHERE id = $7 AND account_id = $8 RETURNING *`,
      [title, line_items ? JSON.stringify(line_items) : null, notes, valid_until, amount, taxAmt, req.params.id, req.accountId]
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
