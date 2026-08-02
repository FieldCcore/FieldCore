const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const VALID_STATUSES = new Set(['available', 'en_route', 'on_job', 'break', 'off_duty']);

// GET /api/workforce/status
// Returns clock-in state and operational status for all techs in the account.
router.get('/status', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         u.id, u.name, u.role,
         u.clocked_in_at, u.clocked_out_at,
         u.operational_status,
         u.last_presence_at,
         u.location_tracking_enabled,
         u.tracking_required
       FROM users u
       JOIN account_memberships am ON am.user_id = u.id AND am.account_id = $1
       WHERE u.role IN ('tech','manager','owner')
       ORDER BY u.name`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[workforce] GET /status error:', err.message);
    res.status(500).json({ error: 'Failed to fetch workforce status' });
  }
});

// POST /api/workforce/clock-in
// Clocks in the authenticated user.
router.post('/clock-in', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE users
       SET clocked_in_at      = NOW(),
           clocked_out_at     = NULL,
           operational_status = 'available',
           last_presence_at   = NOW()
       WHERE id = $1
       RETURNING id, clocked_in_at, operational_status`,
      [req.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[workforce] POST /clock-in error:', err.message);
    res.status(500).json({ error: 'Clock-in failed' });
  }
});

// POST /api/workforce/clock-out
// Clocks out the authenticated user.
router.post('/clock-out', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE users
       SET clocked_out_at     = NOW(),
           operational_status = 'off_duty',
           last_presence_at   = NOW()
       WHERE id = $1
       RETURNING id, clocked_out_at, operational_status`,
      [req.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[workforce] POST /clock-out error:', err.message);
    res.status(500).json({ error: 'Clock-out failed' });
  }
});

// PATCH /api/workforce/status
// Updates the authenticated user's operational_status.
// Body: { status: 'available' | 'en_route' | 'on_job' | 'break' | 'off_duty' }
router.patch('/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  if (!status || !VALID_STATUSES.has(status)) {
    return res.status(400).json({
      error: `Invalid status. Must be one of: ${[...VALID_STATUSES].join(', ')}`,
    });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE users
       SET operational_status = $1,
           last_presence_at   = NOW()
       WHERE id = $2
       RETURNING id, operational_status, last_presence_at`,
      [status, req.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[workforce] PATCH /status error:', err.message);
    res.status(500).json({ error: 'Status update failed' });
  }
});

// PATCH /api/workforce/:userId/status
// Owner/manager can update any tech's status.
router.patch('/:userId/status', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { userId } = req.params;
  const { status } = req.body;
  if (!status || !VALID_STATUSES.has(status)) {
    return res.status(400).json({
      error: `Invalid status. Must be one of: ${[...VALID_STATUSES].join(', ')}`,
    });
  }
  try {
    // Verify the target user belongs to this account
    const memberCheck = await pool.query(
      `SELECT 1 FROM account_memberships WHERE user_id = $1 AND account_id = $2`,
      [userId, req.accountId]
    );
    if (!memberCheck.rows.length) return res.status(404).json({ error: 'User not found in account' });

    const { rows } = await pool.query(
      `UPDATE users
       SET operational_status = $1,
           last_presence_at   = NOW()
       WHERE id = $2
       RETURNING id, operational_status, last_presence_at`,
      [status, userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[workforce] PATCH /:userId/status error:', err.message);
    res.status(500).json({ error: 'Status update failed' });
  }
});

module.exports = router;
