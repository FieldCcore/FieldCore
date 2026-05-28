const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/entities — entities where the current user is owner (home + cross-account)
router.get('/', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.name, a.plan, a.plan_status, a.created_at,
              (u.account_id = a.id) AS is_home,
              (SELECT COUNT(*) FROM users u2 WHERE u2.account_id = a.id) AS member_count
       FROM accounts a
       JOIN users u ON u.id = $1
       LEFT JOIN account_memberships am ON am.account_id = a.id AND am.user_id = $1
       WHERE a.id = u.account_id OR (am.user_id = $1 AND am.role = 'owner')
       ORDER BY (u.account_id = a.id) DESC, a.name`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/entities — create a new entity (Scale plan only)
router.post('/', requireAuth, requireRole('owner'), async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Entity name is required.' });

  const planRes = await pool.query(`SELECT plan FROM accounts WHERE id = $1`, [req.accountId]);
  if (planRes.rows[0]?.plan !== 'scale') {
    return res.status(403).json({ error: 'Multi-entity management requires the Scale plan.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO accounts (name, plan, plan_status) VALUES ($1, 'scale', 'active') RETURNING *`,
      [name.trim()]
    );
    const newAccount = rows[0];
    await client.query(
      `INSERT INTO account_memberships (user_id, account_id, role) VALUES ($1, $2, 'owner')`,
      [req.userId, newAccount.id]
    );
    await client.query('COMMIT');
    res.status(201).json(newAccount);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET /api/entities/:id/members — home users + cross-account members of an entity
router.get('/:id/members', requireAuth, requireRole('owner'), async (req, res) => {
  const access = await pool.query(
    `SELECT 1 FROM users u
     LEFT JOIN account_memberships am ON am.account_id = $2 AND am.user_id = $1 AND am.role = 'owner'
     WHERE u.id = $1 AND (u.account_id = $2 OR am.user_id IS NOT NULL)`,
    [req.userId, req.params.id]
  );
  if (!access.rows.length) return res.status(403).json({ error: 'Access denied.' });

  try {
    const { rows: homeUsers } = await pool.query(
      `SELECT id, name, email, role, 'home' AS membership_type
       FROM users WHERE account_id = $1 ORDER BY name`,
      [req.params.id]
    );
    const { rows: crossMembers } = await pool.query(
      `SELECT u.id, u.name, u.email, am.role, 'cross' AS membership_type
       FROM account_memberships am
       JOIN users u ON u.id = am.user_id
       WHERE am.account_id = $1 ORDER BY u.name`,
      [req.params.id]
    );
    res.json([...homeUsers, ...crossMembers]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/entities/:id/members — invite existing FieldCore user by email
router.post('/:id/members', requireAuth, requireRole('owner'), async (req, res) => {
  const { email, role = 'manager' } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required.' });
  if (!['owner', 'manager', 'tech'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });

  const access = await pool.query(
    `SELECT 1 FROM users u
     LEFT JOIN account_memberships am ON am.account_id = $2 AND am.user_id = $1 AND am.role = 'owner'
     WHERE u.id = $1 AND (u.account_id = $2 OR am.user_id IS NOT NULL)`,
    [req.userId, req.params.id]
  );
  if (!access.rows.length) return res.status(403).json({ error: 'Access denied.' });

  try {
    const { rows: found } = await pool.query(
      `SELECT id, name FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [email.trim()]
    );
    if (!found.length) return res.status(404).json({ error: 'No FieldCore user found with that email address.' });

    const target = found[0];
    const { rows } = await pool.query(
      `INSERT INTO account_memberships (user_id, account_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, account_id) DO UPDATE SET role = $3
       RETURNING *`,
      [target.id, req.params.id, role]
    );
    res.status(201).json({ ...rows[0], name: target.name, email: email.trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/entities/:id/members/:userId — remove cross-account membership
router.delete('/:id/members/:userId', requireAuth, requireRole('owner'), async (req, res) => {
  const access = await pool.query(
    `SELECT 1 FROM users u
     LEFT JOIN account_memberships am ON am.account_id = $2 AND am.user_id = $1 AND am.role = 'owner'
     WHERE u.id = $1 AND (u.account_id = $2 OR am.user_id IS NOT NULL)`,
    [req.userId, req.params.id]
  );
  if (!access.rows.length) return res.status(403).json({ error: 'Access denied.' });

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM account_memberships WHERE user_id = $1 AND account_id = $2`,
      [req.params.userId, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Membership not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
