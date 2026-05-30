const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

// POST /api/push-tokens — save or update Expo push token for the authenticated user
router.post('/', requireAuth, async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token is required.' });

  try {
    await pool.query(
      `UPDATE users SET push_token = $1 WHERE id = $2`,
      [token, req.userId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
