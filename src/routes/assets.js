const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/assets
router.get('/', requireAuth, requireRole('owner', 'manager', 'staff'), async (req, res) => {
  const { client_id, search } = req.query;
  const values = [req.accountId];
  let where = `WHERE a.account_id = $1 AND a.status != 'retired'`;

  if (client_id) {
    values.push(client_id);
    where += ` AND a.client_id = $${values.length}`;
  }
  if (search?.trim()) {
    values.push(`%${search.trim()}%`);
    const n = values.length;
    where += ` AND (a.name ILIKE $${n} OR a.unit_number ILIKE $${n} OR a.serial_number ILIKE $${n})`;
  }

  try {
    const { rows } = await pool.query(`
      SELECT a.*, c.name AS client_name
      FROM assets a
      LEFT JOIN clients c ON c.id = a.client_id
      ${where}
      ORDER BY a.name ASC
      LIMIT 100
    `, values);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/assets
router.post('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { name, client_id, asset_type, unit_number, serial_number, vin, description, notes } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Asset name is required.' });

  try {
    const { rows } = await pool.query(`
      INSERT INTO assets
        (account_id, client_id, name, asset_type, unit_number, serial_number, vin, description, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `, [
      req.accountId, client_id || null, name.trim(),
      asset_type || null, unit_number || null, serial_number || null,
      vin || null, description || null, notes || null, req.userId,
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
