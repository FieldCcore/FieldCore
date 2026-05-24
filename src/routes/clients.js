const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/clients
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM clients WHERE account_id = $1 ORDER BY name`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clients
router.post('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { name, email, phone, address, tier, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO clients (account_id, name, email, phone, address, tier, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.accountId, name, email, phone, address, tier || 'standard', notes]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/clients/:id — with full job history
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const clientResult = await pool.query(
      `SELECT * FROM clients WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!clientResult.rows.length) return res.status(404).json({ error: 'Not found' });

    const jobsResult = await pool.query(
      `SELECT j.*, u.name AS tech_name
       FROM jobs j
       LEFT JOIN users u ON u.id = j.tech_id
       WHERE j.client_id = $1
       ORDER BY j.scheduled_at DESC`,
      [req.params.id]
    );

    res.json({ ...clientResult.rows[0], jobs: jobsResult.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/clients/:id
router.patch('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const fields = ['name','email','phone','address','tier','notes','card_on_file'];
  const updates = [];
  const values = [];
  let i = 1;

  fields.forEach((f) => {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      values.push(req.body[f]);
    }
  });

  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

  values.push(req.params.id, req.accountId);
  try {
    const { rows } = await pool.query(
      `UPDATE clients SET ${updates.join(', ')}
       WHERE id = $${i} AND account_id = $${i + 1} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
