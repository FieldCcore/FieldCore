const express  = require('express');
const router   = express.Router();
const pool     = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const audit    = require('../services/audit');

const BLOCK_TYPES = ['vacation', 'blocked', 'break', 'training', 'personal'];

// ── GET /api/availability — list blocks for the account (or a specific tech) ──
router.get('/', requireAuth, async (req, res) => {
  const { user_id, date_from, date_to } = req.query;

  const conditions = ['b.account_id = $1'];
  const values     = [req.accountId];
  let i = 2;

  // Techs can only see their own blocks; managers/owners see all
  if (req.userRole === 'tech') {
    conditions.push(`b.user_id = $${i++}`);
    values.push(req.userId);
  } else if (user_id) {
    conditions.push(`b.user_id = $${i++}`);
    values.push(user_id);
  }

  if (date_from) {
    conditions.push(`b.ends_at >= $${i++}`);
    values.push(date_from);
  }
  if (date_to) {
    conditions.push(`b.starts_at <= $${i++}`);
    values.push(date_to);
  }

  try {
    const { rows } = await pool.query(
      `SELECT b.*, u.name AS tech_name
       FROM   tech_availability_blocks b
       JOIN   users u ON u.id = b.user_id
       WHERE  ${conditions.join(' AND ')}
       ORDER  BY b.starts_at`,
      values
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/availability — create a block ───────────────────────────────────
router.post('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { user_id, block_type, title, starts_at, ends_at, is_all_day, notes } = req.body;

  if (!user_id || !starts_at || !ends_at) {
    return res.status(400).json({ error: 'user_id, starts_at, and ends_at are required' });
  }
  if (!BLOCK_TYPES.includes(block_type || 'blocked')) {
    return res.status(400).json({ error: `block_type must be one of: ${BLOCK_TYPES.join(', ')}` });
  }
  if (new Date(ends_at) <= new Date(starts_at)) {
    return res.status(400).json({ error: 'ends_at must be after starts_at' });
  }

  try {
    // Verify tech belongs to this account
    const { rows: techRows } = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND account_id = $2`, [user_id, req.accountId]
    );
    if (!techRows.length) return res.status(404).json({ error: 'Technician not found' });

    const { rows } = await pool.query(
      `INSERT INTO tech_availability_blocks
         (account_id, user_id, block_type, title, starts_at, ends_at, is_all_day, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        req.accountId, user_id, block_type || 'blocked',
        title || null, starts_at, ends_at,
        !!is_all_day, notes || null, req.userId,
      ]
    );

    audit.log(req.accountId, req.userId, 'availability_block.created', 'tech_availability_blocks', rows[0].id,
      { user_id, block_type: block_type || 'blocked', starts_at, ends_at }, req.ip);

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/availability/:id ───────────────────────────────────────────────
router.patch('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { block_type, title, starts_at, ends_at, is_all_day, notes } = req.body;

  try {
    const { rows: existing } = await pool.query(
      `SELECT * FROM tech_availability_blocks WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!existing.length) return res.status(404).json({ error: 'Block not found' });

    if (starts_at && ends_at && new Date(ends_at) <= new Date(starts_at)) {
      return res.status(400).json({ error: 'ends_at must be after starts_at' });
    }

    const updates = [];
    const values  = [];
    let i = 1;

    if (block_type  !== undefined) { updates.push(`block_type  = $${i++}`); values.push(block_type); }
    if (title       !== undefined) { updates.push(`title       = $${i++}`); values.push(title || null); }
    if (starts_at   !== undefined) { updates.push(`starts_at   = $${i++}`); values.push(starts_at); }
    if (ends_at     !== undefined) { updates.push(`ends_at     = $${i++}`); values.push(ends_at); }
    if (is_all_day  !== undefined) { updates.push(`is_all_day  = $${i++}`); values.push(!!is_all_day); }
    if (notes       !== undefined) { updates.push(`notes       = $${i++}`); values.push(notes || null); }

    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id, req.accountId);

    const { rows } = await pool.query(
      `UPDATE tech_availability_blocks SET ${updates.join(', ')}
       WHERE id = $${i} AND account_id = $${i + 1} RETURNING *`,
      values
    );

    audit.log(req.accountId, req.userId, 'availability_block.updated', 'tech_availability_blocks', req.params.id,
      { block_type, starts_at, ends_at }, req.ip);

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/availability/:id ──────────────────────────────────────────────
router.delete('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM tech_availability_blocks WHERE id = $1 AND account_id = $2 RETURNING *`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Block not found' });

    audit.log(req.accountId, req.userId, 'availability_block.deleted', 'tech_availability_blocks', req.params.id,
      { block_type: rows[0].block_type, starts_at: rows[0].starts_at }, req.ip);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
