const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

// GET /api/deposits
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, c.name AS client_name, j.service_type
       FROM deposits d
       JOIN clients c ON c.id = d.client_id
       JOIN jobs j ON j.id = d.job_id
       WHERE d.account_id = $1
       ORDER BY d.created_at DESC`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/deposits/:id/retain — manually retain a deposit (no-show)
router.patch('/:id/retain', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE deposits SET status = 'collected'
       WHERE id = $1 AND account_id = $2 RETURNING *`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/deposits/:id/refund
router.patch('/:id/refund', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE deposits SET status = 'refunded'
       WHERE id = $1 AND account_id = $2 RETURNING *`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
