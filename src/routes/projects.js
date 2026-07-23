const express  = require('express');
const router   = express.Router();
const pool     = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { requireCapability }        = require('../services/entitlements');

const ALLOWED_STATUSES = ['draft','active','on_hold','completed','cancelled'];

// GET /api/projects
router.get('/', requireAuth, requireRole('owner','manager','staff'), async (req, res) => {
  try {
    await requireCapability(req.accountId, 'can_create_projects');
  } catch (err) {
    return res.status(err.statusCode || 403).json({ error: err.message, code: err.code });
  }

  const { status } = req.query;
  const values = [req.accountId];
  let where = 'WHERE p.account_id = $1';
  if (status && ALLOWED_STATUSES.includes(status)) {
    values.push(status);
    where += ` AND p.status = $${values.length}`;
  }

  try {
    const { rows } = await pool.query(
      `SELECT p.*,
              c.name AS client_name
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       ${where}
       ORDER BY p.created_at DESC`,
      values
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:id
router.get('/:id', requireAuth, requireRole('owner','manager','staff'), async (req, res) => {
  try {
    await requireCapability(req.accountId, 'can_create_projects');
  } catch (err) {
    return res.status(err.statusCode || 403).json({ error: err.message, code: err.code });
  }

  try {
    const { rows } = await pool.query(
      `SELECT p.*, c.name AS client_name
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       WHERE p.id = $1 AND p.account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Project not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects
router.post('/', requireAuth, requireRole('owner','manager'), async (req, res) => {
  try {
    await requireCapability(req.accountId, 'can_create_projects');
  } catch (err) {
    return res.status(err.statusCode || 403).json({ error: err.message, code: err.code });
  }

  const { name, description, client_id, status = 'active', start_date, end_date, location } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Project name is required.' });
  if (status && !ALLOWED_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO projects (account_id, name, description, client_id, status, start_date, end_date, location, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [req.accountId, name.trim(), description || null, client_id || null,
       status, start_date || null, end_date || null, location || null, req.userId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/projects/:id
router.patch('/:id', requireAuth, requireRole('owner','manager'), async (req, res) => {
  try {
    await requireCapability(req.accountId, 'can_create_projects');
  } catch (err) {
    return res.status(err.statusCode || 403).json({ error: err.message, code: err.code });
  }

  const allowed = ['name','description','client_id','status','start_date','end_date','location'];
  const updates = [];
  const values  = [];
  let i = 1;

  allowed.forEach(f => {
    if (req.body[f] !== undefined) {
      if (f === 'status' && !ALLOWED_STATUSES.includes(req.body[f])) return;
      updates.push(`${f} = $${i++}`);
      values.push(req.body[f] ?? null);
    }
  });

  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update.' });
  updates.push(`updated_at = NOW()`);
  values.push(req.params.id, req.accountId);

  try {
    const { rows } = await pool.query(
      `UPDATE projects SET ${updates.join(', ')}
       WHERE id = $${i} AND account_id = $${i + 1}
       RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Project not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:id — cancels the project (soft delete)
router.delete('/:id', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    await requireCapability(req.accountId, 'can_create_projects');
  } catch (err) {
    return res.status(err.statusCode || 403).json({ error: err.message, code: err.code });
  }

  try {
    const { rowCount } = await pool.query(
      `UPDATE projects SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Project not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
