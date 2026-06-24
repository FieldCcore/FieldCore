const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const ENTITY_COLS = `
  a.id, a.name, a.legal_name, a.dba, a.business_type, a.ein,
  a.address, a.city, a.state, a.zip, a.phone, a.entity_email,
  a.plan, a.plan_status, a.created_at, a.updated_at,
  a.is_active, a.stripe_connect_account_id, a.stripe_connect_status`;

// Verify the requesting user has owner access to a given entity
async function verifyOwnerAccess(userId, entityId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM users u
     LEFT JOIN account_memberships am ON am.account_id = $2 AND am.user_id = $1 AND am.role = 'owner'
     WHERE u.id = $1 AND (u.account_id = $2 OR am.user_id IS NOT NULL)`,
    [userId, entityId]
  );
  return rows.length > 0;
}

// GET /api/entities — all entities the current owner can manage
router.get('/', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${ENTITY_COLS},
              (u.account_id = a.id) AS is_home,
              ((SELECT COUNT(*) FROM users u2 WHERE u2.account_id = a.id) +
               (SELECT COUNT(*) FROM account_memberships am2 WHERE am2.account_id = a.id)) AS member_count
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

// GET /api/entities/:id — single entity detail
router.get('/:id', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const ok = await verifyOwnerAccess(req.userId, req.params.id);
    if (!ok) return res.status(403).json({ error: 'Access denied.' });

    const { rows } = await pool.query(
      `SELECT ${ENTITY_COLS} FROM accounts a WHERE a.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Entity not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/entities — create new entity (Scale plan required)
router.post('/', requireAuth, requireRole('owner'), async (req, res) => {
  const { name, legal_name, dba, business_type, ein, address, city, state, zip, phone, entity_email } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Business name is required.' });

  const planRes = await pool.query(`SELECT plan FROM accounts WHERE id = $1`, [req.accountId]);
  if (planRes.rows[0]?.plan !== 'scale') {
    return res.status(403).json({ error: 'Multi-entity management requires the Scale plan.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO accounts
         (name, legal_name, dba, business_type, ein, address, city, state, zip, phone, entity_email, plan, plan_status, is_active, onboarded)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'scale','active',TRUE,TRUE)
       RETURNING ${ENTITY_COLS.replace(/a\./g, '')}`,
      [name.trim(), legal_name || null, dba || null, business_type || null, ein || null,
       address || null, city || null, state || null, zip || null, phone || null, entity_email || null]
    );
    const newAccount = rows[0];
    await client.query(
      `INSERT INTO account_memberships (user_id, account_id, role) VALUES ($1, $2, 'owner')`,
      [req.userId, newAccount.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ ...newAccount, is_home: false, member_count: 1 });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PATCH /api/entities/:id — update entity details
router.patch('/:id', requireAuth, requireRole('owner'), async (req, res) => {
  const allowed = ['name', 'legal_name', 'dba', 'business_type', 'ein',
                   'address', 'city', 'state', 'zip', 'phone', 'entity_email', 'is_active'];
  const updates = [];
  const values  = [];
  let i = 1;

  allowed.forEach(f => {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      values.push(req.body[f] ?? null);
    }
  });

  if (!updates.length) return res.status(400).json({ error: 'No fields to update.' });

  const ok = await verifyOwnerAccess(req.userId, req.params.id);
  if (!ok) return res.status(403).json({ error: 'Access denied.' });

  updates.push(`updated_at = NOW()`);
  values.push(req.params.id);

  try {
    const { rows } = await pool.query(
      `UPDATE accounts SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Entity not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/entities/:id — deactivate entity (soft delete; can't remove home account)
router.delete('/:id', requireAuth, requireRole('owner'), async (req, res) => {
  const homeRes = await pool.query(`SELECT account_id FROM users WHERE id = $1`, [req.userId]);
  if (homeRes.rows[0]?.account_id === req.params.id) {
    return res.status(400).json({ error: 'Cannot delete your home entity.' });
  }

  const ok = await verifyOwnerAccess(req.userId, req.params.id);
  if (!ok) return res.status(403).json({ error: 'Access denied.' });

  try {
    await pool.query(
      `UPDATE accounts SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/entities/:id/members
router.get('/:id/members', requireAuth, requireRole('owner'), async (req, res) => {
  const ok = await verifyOwnerAccess(req.userId, req.params.id);
  if (!ok) return res.status(403).json({ error: 'Access denied.' });

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
  if (!['owner', 'manager', 'tech', 'staff'].includes(role))
    return res.status(400).json({ error: 'Invalid role.' });

  const ok = await verifyOwnerAccess(req.userId, req.params.id);
  if (!ok) return res.status(403).json({ error: 'Access denied.' });

  try {
    const { rows: found } = await pool.query(
      `SELECT id, name FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [email.trim()]
    );
    if (!found.length)
      return res.status(404).json({ error: 'No FieldCore user found with that email address.' });

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

// DELETE /api/entities/:id/members/:userId
router.delete('/:id/members/:userId', requireAuth, requireRole('owner'), async (req, res) => {
  const ok = await verifyOwnerAccess(req.userId, req.params.id);
  if (!ok) return res.status(403).json({ error: 'Access denied.' });

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
