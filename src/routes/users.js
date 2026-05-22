const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

// GET /api/users — list team members (used for tech assignment dropdown)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, role, phone, email, created_at
       FROM users WHERE account_id = $1 ORDER BY name`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users — add team member
router.post('/', requireAuth, async (req, res) => {
  const { name, email, phone, role, password } = req.body;
  if (!name || !email || !role || !password)
    return res.status(400).json({ error: 'name, email, role, and password are required.' });
  if (!['owner', 'manager', 'tech'].includes(role))
    return res.status(400).json({ error: 'role must be owner, manager, or tech.' });
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

// PATCH /api/users/:id — edit team member
router.patch('/:id', requireAuth, async (req, res) => {
  const allowed = ['name', 'email', 'phone', 'role'];
  const updates = [];
  const values  = [];
  let i = 1;

  allowed.forEach(f => {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      values.push(req.body[f] || null);
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

// DELETE /api/users/:id — remove team member
router.delete('/:id', requireAuth, async (req, res) => {
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
