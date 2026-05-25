const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

// GET /api/notifications — last 30, unread first
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM notifications
       WHERE account_id = $1
       ORDER BY read ASC, created_at DESC
       LIMIT 30`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/read-all
router.post('/read-all', requireAuth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET read = TRUE WHERE account_id = $1`,
      [req.accountId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/:id/read
router.post('/:id/read', requireAuth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET read = TRUE WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
