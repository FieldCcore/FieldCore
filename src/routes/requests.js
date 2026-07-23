const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const ALLOWED_STATUSES = ['new','contacted','awaiting_review','confirmed','converted','declined','closed'];

// GET /api/requests — list all requests for account
router.get('/', requireAuth, requireRole('owner','manager','staff'), async (req, res) => {
  const { status, limit = 50, offset = 0 } = req.query;
  try {
    const conditions = ['r.account_id = $1'];
    const params     = [req.accountId];
    if (status && ALLOWED_STATUSES.includes(status)) {
      conditions.push(`r.status = $${params.length + 1}`);
      params.push(status);
    }
    params.push(Math.min(parseInt(limit), 100), parseInt(offset));
    const { rows } = await pool.query(
      `SELECT r.*,
              c.name   AS client_name_linked,
              c.email  AS client_email_linked,
              c.phone  AS client_phone_linked,
              u1.name  AS assigned_to_name,
              u2.name  AS reviewed_by_name,
              u3.name  AS created_by_name
       FROM requests r
       LEFT JOIN clients c ON c.id = r.client_id
       LEFT JOIN users u1  ON u1.id = r.assigned_to
       LEFT JOIN users u2  ON u2.id = r.reviewed_by
       LEFT JOIN users u3  ON u3.id = r.created_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/requests/:id
router.get('/:id', requireAuth, requireRole('owner','manager','staff'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*,
              c.name   AS client_name_linked,
              u1.name  AS assigned_to_name,
              u2.name  AS reviewed_by_name
       FROM requests r
       LEFT JOIN clients c ON c.id = r.client_id
       LEFT JOIN users u1  ON u1.id = r.assigned_to
       LEFT JOIN users u2  ON u2.id = r.reviewed_by
       WHERE r.id = $1 AND r.account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Request not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/requests — create new request
router.post('/', requireAuth, async (req, res) => {
  const {
    client_id, client_name, client_email, client_phone,
    service_type, requested_date, requested_date_end, preferred_time,
    location, notes, internal_notes, source = 'direct',
    assigned_to, reviewed_by, follow_up_date,
  } = req.body;

  if (!client_name && !client_id) {
    return res.status(400).json({ error: 'client_name or client_id is required.' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO requests
         (account_id, client_id, client_name, client_email, client_phone,
          service_type, requested_date, requested_date_end, preferred_time,
          location, notes, internal_notes, source,
          assigned_to, reviewed_by, follow_up_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        req.accountId, client_id || null,
        client_name || null, client_email || null, client_phone || null,
        service_type || null, requested_date || null, requested_date_end || null,
        preferred_time || null, location || null,
        notes || null, internal_notes || null, source,
        assigned_to || null, reviewed_by || null, follow_up_date || null,
        req.userId,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/requests/:id — update request
router.patch('/:id', requireAuth, requireRole('owner','manager','staff'), async (req, res) => {
  const allowed = [
    'client_id','client_name','client_email','client_phone',
    'service_type','requested_date','requested_date_end','preferred_time',
    'location','notes','internal_notes','status','source',
    'assigned_to','reviewed_by','follow_up_date',
  ];

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
      `UPDATE requests SET ${updates.join(', ')}
       WHERE id = $${i} AND account_id = $${i + 1}
       RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Request not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/requests/:id — soft-delete by closing
router.delete('/:id', requireAuth, requireRole('owner','manager'), async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE requests SET status = 'closed', updated_at = NOW()
       WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Request not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
