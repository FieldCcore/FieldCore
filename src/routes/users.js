const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { checkUserLimit } = require('../middleware/planLimits');

// GET /api/users — list team members (used for tech assignment dropdown)
router.get('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, role, phone, email, is_contractor, tax_classification, created_at
       FROM users WHERE account_id = $1 ORDER BY name`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users — add team member (owner/manager only)
router.post('/', requireAuth, requireRole('owner', 'manager'), checkUserLimit, async (req, res) => {
  const { name, email, phone, role, password } = req.body;
  if (!name || !email || !role || !password)
    return res.status(400).json({ error: 'name, email, role, and password are required.' });
  if (!['owner', 'manager', 'tech', 'staff'].includes(role))
    return res.status(400).json({ error: 'role must be owner, manager, tech, or staff.' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (account_id, name, email, phone, role, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, phone, role, created_at`,
      [req.accountId, name.trim(), email.trim().toLowerCase(), phone || null, role, hash]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A user with that email already exists.' });
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/me/availability — tech sets themselves available/unavailable
router.patch('/me/availability', requireAuth, async (req, res) => {
  const { available } = req.body;
  if (typeof available !== 'boolean')
    return res.status(400).json({ error: 'available (boolean) is required.' });
  try {
    await pool.query(
      'UPDATE users SET is_available = $1 WHERE id = $2',
      [available, req.userId]
    );
    res.json({ ok: true, available });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/:id — edit team member (owner/manager only)
router.patch('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const allowed = ['name', 'email', 'phone', 'role', 'is_contractor', 'tax_classification', 'contractor_tax_id'];
  const updates = [];
  const values  = [];
  let i = 1;

  allowed.forEach(f => {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      values.push(req.body[f] ?? null);
    }
  });

  if (req.body.password) {
    if (req.body.password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    const hash = await bcrypt.hash(req.body.password, 12);
    updates.push(`password_hash = $${i++}`);
    values.push(hash);
  }

  if (!updates.length) return res.status(400).json({ error: 'No fields to update.' });

  values.push(req.params.id, req.accountId);
  try {
    const { rows } = await pool.query(
      `UPDATE users SET ${updates.join(', ')}
       WHERE id = $${i} AND account_id = $${i + 1}
       RETURNING id, name, email, phone, role, created_at`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already in use.' });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id/memberships — cross-account memberships for a user (owner only)
router.get('/:id/memberships', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    // Verify the target user belongs to the requesting account before exposing their memberships
    const { rows: userCheck } = await pool.query(
      `SELECT 1 FROM users WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!userCheck.length) return res.status(404).json({ error: 'User not found.' });

    const { rows } = await pool.query(
      `SELECT am.account_id, a.name AS account_name, am.role
       FROM account_memberships am
       JOIN accounts a ON a.id = am.account_id
       WHERE am.user_id = $1
       ORDER BY a.name`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:id/memberships — grant access to this account (owner only)
router.post('/:id/memberships', requireAuth, requireRole('owner'), async (req, res) => {
  const { role = 'manager' } = req.body;
  if (!['owner', 'manager', 'tech', 'staff'].includes(role))
    return res.status(400).json({ error: 'role must be owner, manager, tech, or staff.' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO account_memberships (user_id, account_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, account_id) DO UPDATE SET role = $3
       RETURNING account_id, role`,
      [req.params.id, req.accountId, role]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id/memberships/:accountId — revoke access (owner only, own account only)
router.delete('/:id/memberships/:accountId', requireAuth, requireRole('owner'), async (req, res) => {
  if (req.params.accountId !== req.accountId)
    return res.status(403).json({ error: 'You can only manage memberships for your own account.' });

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM account_memberships WHERE user_id = $1 AND account_id = $2`,
      [req.params.id, req.params.accountId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Membership not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id — remove team member (owner only)
router.delete('/:id', requireAuth, requireRole('owner'), async (req, res) => {
  if (req.userId === req.params.id)
    return res.status(400).json({ error: 'You cannot remove your own account.' });

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM users WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!rowCount) return res.status(404).json({ error: 'User not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
