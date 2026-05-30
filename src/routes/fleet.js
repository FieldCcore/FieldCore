const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/fleet/tech-locations — last GPS check-in per tech for today
router.get('/tech-locations', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (j.tech_id)
         j.tech_id,
         u.name  AS tech_name,
         j.checkin_lat,
         j.checkin_lng,
         j.checkin_at,
         j.service_type,
         j.id AS job_id
       FROM jobs j
       JOIN users u ON u.id = j.tech_id
       WHERE j.account_id = $1
         AND j.checkin_lat IS NOT NULL
         AND j.checkin_at::date = CURRENT_DATE
       ORDER BY j.tech_id, j.checkin_at DESC`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fleet
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.*, u.name AS tech_name
       FROM fleet_vehicles f
       LEFT JOIN users u ON u.id = f.tech_id
       WHERE f.account_id = $1
       ORDER BY f.created_at DESC`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fleet
router.post('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { make, model, plate, year, tech_id } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO fleet_vehicles (account_id, make, model, plate, year, tech_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.accountId, make || null, model || null, plate || null, year || null, tech_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/fleet/:id
router.patch('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { make, model, plate, year, tech_id } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE fleet_vehicles SET make=$1, model=$2, plate=$3, year=$4, tech_id=$5
       WHERE id=$6 AND account_id=$7 RETURNING *`,
      [make || null, model || null, plate || null, year || null, tech_id || null, req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Vehicle not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/fleet/:id
router.delete('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM fleet_vehicles WHERE id=$1 AND account_id=$2`,
      [req.params.id, req.accountId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Vehicle not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
