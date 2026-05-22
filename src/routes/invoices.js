const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

// POST /api/invoices — generate invoice from completed job
router.post('/', requireAuth, async (req, res) => {
  const { job_id } = req.body;
  if (!job_id) return res.status(400).json({ error: 'job_id is required' });

  try {
    const [jobResult, settingsResult] = await Promise.all([
      pool.query(`SELECT * FROM jobs WHERE id = $1 AND account_id = $2`, [job_id, req.accountId]),
      pool.query(`SELECT tax_rate FROM booking_settings WHERE account_id = $1`, [req.accountId]),
    ]);
    const job = jobResult.rows[0];
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.status !== 'complete') {
      return res.status(400).json({ error: 'Job must be complete before invoicing' });
    }

    const taxRate   = parseFloat(settingsResult.rows[0]?.tax_rate || 0);
    const subtotal  = parseFloat(job.amount || 0);
    const taxAmount = subtotal > 0 ? parseFloat((subtotal * taxRate).toFixed(2)) : 0;
    const total     = subtotal + taxAmount;

    const { rows } = await pool.query(
      `INSERT INTO invoices (account_id, job_id, client_id, amount, tax_amount)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.accountId, job_id, job.client_id, total, taxAmount]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invoices
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, c.name AS client_name
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
       WHERE i.account_id = $1
       ORDER BY i.created_at DESC`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invoices/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone,
              c.stripe_payment_method_id, c.card_on_file,
              j.service_type, j.scheduled_at, j.tech_id
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
       JOIN jobs j ON j.id = i.job_id
       WHERE i.id = $1 AND i.account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/invoices/:id/void
router.patch('/:id/void', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE invoices SET status = 'void' WHERE id = $1 AND account_id = $2 RETURNING *`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
