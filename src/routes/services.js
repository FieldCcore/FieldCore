const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

// GET /api/services/search?q= — service catalog autocomplete
router.get('/search', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  try {
    const params = [req.accountId];
    let whereSearch = '';
    if (q.length >= 1) {
      params.push(`%${q}%`);
      const p = params.length;
      whereSearch = ` AND (
        name                      ILIKE $${p}
        OR COALESCE(description,'') ILIKE $${p}
        OR COALESCE(category,'')  ILIKE $${p}
        OR COALESCE(sku,'')       ILIKE $${p}
      )`;
    }
    const { rows } = await pool.query(
      `SELECT id, name, description, price, category, sku, duration_minutes
       FROM service_templates
       WHERE account_id = $1
         AND is_active = TRUE${whereSearch}
       ORDER BY sort_order ASC, name ASC
       LIMIT 20`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
