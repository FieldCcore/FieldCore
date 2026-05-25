const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

// POST /api/onboarding/complete — save business name + services, mark account onboarded
router.post('/complete', requireAuth, requireRole('owner'), async (req, res) => {
  const { business_name, services } = req.body;
  if (!business_name?.trim())
    return res.status(400).json({ error: 'business_name is required.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO booking_settings (account_id, business_name, services)
       VALUES ($1, $2, $3)
       ON CONFLICT (account_id) DO UPDATE
         SET business_name = EXCLUDED.business_name,
             services      = EXCLUDED.services`,
      [req.accountId, business_name.trim(), JSON.stringify(services || [])]
    );

    await client.query(
      `UPDATE accounts SET onboarded = TRUE WHERE id = $1`,
      [req.accountId]
    );

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
