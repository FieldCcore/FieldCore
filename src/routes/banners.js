const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/banners — list eligible banners for current user
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*,
              EXISTS(
                SELECT 1 FROM dashboard_banner_dismissals d
                WHERE d.banner_id = b.id AND d.user_id = $2
              ) AS dismissed
       FROM dashboard_banners b
       WHERE b.is_active = TRUE
         AND (b.account_id IS NULL OR b.account_id = $1)
         AND (b.starts_at IS NULL OR b.starts_at <= NOW())
         AND (b.ends_at   IS NULL OR b.ends_at   >= NOW())
         AND (b.audience_roles IS NULL OR $3 = ANY(b.audience_roles))
         AND (b.required_plan IS NULL OR b.required_plan IN (
               SELECT p.plan FROM accounts p WHERE p.id = $1
             ))
       ORDER BY b.priority DESC, b.created_at DESC`,
      [req.accountId, req.userId, req.userRole]
    );
    res.json(rows.filter(r => !r.dismissed));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/banners/:id/dismiss — record dismissal
router.post('/:id/dismiss', requireAuth, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO dashboard_banner_dismissals (banner_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (banner_id, user_id) DO NOTHING`,
      [req.params.id, req.userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/banners — create banner (owner only)
router.post('/', requireAuth, requireRole('owner'), async (req, res) => {
  const {
    banner_type = 'announcement', title, message,
    severity = 'info', icon,
    primary_action_label, primary_action_url,
    secondary_action_label, secondary_action_url,
    dismissible = true, starts_at, ends_at,
    priority = 0, audience_roles, required_plan,
    is_global = false,
  } = req.body;

  if (!title || !message) {
    return res.status(400).json({ error: 'title and message are required.' });
  }

  const VALID_SEVERITIES = ['info', 'success', 'warning', 'critical'];
  if (!VALID_SEVERITIES.includes(severity)) {
    return res.status(400).json({ error: 'Invalid severity.' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO dashboard_banners
         (account_id, banner_type, title, message, severity, icon,
          primary_action_label, primary_action_url,
          secondary_action_label, secondary_action_url,
          dismissible, starts_at, ends_at,
          priority, audience_roles, required_plan, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,TRUE)
       RETURNING *`,
      [
        is_global ? null : req.accountId,
        banner_type, title, message, severity, icon || null,
        primary_action_label || null, primary_action_url || null,
        secondary_action_label || null, secondary_action_url || null,
        dismissible, starts_at || null, ends_at || null,
        priority,
        audience_roles || null,
        required_plan || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/banners/:id — update banner (owner only)
router.patch('/:id', requireAuth, requireRole('owner'), async (req, res) => {
  const allowed = [
    'banner_type','title','message','severity','icon',
    'primary_action_label','primary_action_url',
    'secondary_action_label','secondary_action_url',
    'dismissible','starts_at','ends_at','priority',
    'audience_roles','required_plan','is_active',
  ];

  const updates = [];
  const values  = [];
  let i = 1;

  allowed.forEach(f => {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      values.push(req.body[f] ?? null);
    }
  });

  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update.' });

  updates.push(`updated_at = NOW()`);
  values.push(req.params.id, req.accountId);

  try {
    const { rows } = await pool.query(
      `UPDATE dashboard_banners SET ${updates.join(', ')}
       WHERE id = $${i} AND (account_id = $${i + 1} OR account_id IS NULL)
       RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Banner not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/banners/:id — deactivate (owner only)
router.delete('/:id', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE dashboard_banners SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND (account_id = $2 OR account_id IS NULL)`,
      [req.params.id, req.accountId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Banner not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
