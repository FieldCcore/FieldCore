const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/workforce-roles
// Returns system roles (account_id IS NULL) plus tenant custom roles, ordered for display.
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description, category, is_system_role,
              field_work_eligible, dispatch_visible_default,
              location_tracking_default, clock_in_allowed, sort_order
       FROM workforce_roles
       WHERE account_id IS NULL OR account_id = $1
       ORDER BY sort_order, name`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[workforce-roles] GET / error:', err.message);
    res.status(500).json({ error: 'Failed to load workforce roles' });
  }
});

// POST /api/workforce-roles
// Create a tenant-scoped custom role (owner/manager only).
router.post('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const {
    name, description, category = 'custom',
    field_work_eligible = false, dispatch_visible_default = false,
    location_tracking_default = 'disabled', clock_in_allowed = false,
  } = req.body;

  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  const VALID_CATEGORIES = ['owner','admin','operations','office','field','sales','contractor','custom'];
  if (!VALID_CATEGORIES.includes(category))
    return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });

  const VALID_POLICIES = ['disabled','optional','required_while_clocked_in','required_during_assigned_jobs','always_during_shift'];
  if (!VALID_POLICIES.includes(location_tracking_default))
    return res.status(400).json({ error: `location_tracking_default must be one of: ${VALID_POLICIES.join(', ')}` });

  try {
    const { rows } = await pool.query(
      `INSERT INTO workforce_roles
         (account_id, name, description, category, is_system_role,
          field_work_eligible, dispatch_visible_default,
          location_tracking_default, clock_in_allowed)
       VALUES ($1, $2, $3, $4, FALSE, $5, $6, $7, $8)
       RETURNING *`,
      [req.accountId, name.trim(), description || null, category,
       field_work_eligible, dispatch_visible_default, location_tracking_default, clock_in_allowed]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A role with that name already exists.' });
    console.error('[workforce-roles] POST / error:', err.message);
    res.status(500).json({ error: 'Failed to create workforce role' });
  }
});

module.exports = router;
