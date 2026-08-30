const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/clients
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*,
         (SELECT MAX(i.created_at) FROM invoices i WHERE i.client_id = c.id AND i.account_id = $1) AS last_invoice_at,
         (SELECT MAX(i.amount)     FROM invoices i WHERE i.client_id = c.id AND i.account_id = $1 AND i.created_at = (SELECT MAX(created_at) FROM invoices WHERE client_id = c.id AND account_id = $1)) AS last_invoice_amount,
         (SELECT i.status          FROM invoices i WHERE i.client_id = c.id AND i.account_id = $1 ORDER BY i.created_at DESC LIMIT 1) AS last_invoice_status,
         COALESCE((SELECT SUM(i.amount) FROM invoices i WHERE i.client_id = c.id AND i.account_id = $1 AND i.status = 'pending'), 0) AS outstanding_balance
       FROM clients c
       WHERE c.account_id = $1
       ORDER BY c.name`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clients
router.post('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { name, email, phone, address, city, state, zip, lat, lng, tier, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO clients (account_id, name, email, phone, address, city, state, zip, lat, lng, tier, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.accountId, name, email, phone, address, city, state, zip, lat || null, lng || null, tier || 'standard', notes]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/clients/search?q= — autocomplete for invoice builder and quick pickers
router.get('/search', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 1) return res.json([]);
  const like = `%${q}%`;
  try {
    const { rows } = await pool.query(
      `SELECT id, name, phone, email, address, city, state, zip, tier,
              card_on_file, payment_method_brand, payment_method_last4, stripe_payment_method_id
       FROM clients
       WHERE account_id = $1
         AND (
           name                  ILIKE $2
           OR COALESCE(email,'') ILIKE $2
           OR COALESCE(phone,'') ILIKE $2
           OR COALESCE(address,'') ILIKE $2
           OR COALESCE(city,'')  ILIKE $2
         )
       ORDER BY
         CASE WHEN LOWER(name) LIKE LOWER($3) THEN 0 ELSE 1 END,
         name ASC
       LIMIT 10`,
      [req.accountId, like, `${q}%`]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Segment Management ────────────────────────────────────────────────────────
// Must appear BEFORE /:id to avoid routing conflict.

// GET /api/clients/segments
router.get('/segments', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT cs.id, cs.name, cs.color,
              COUNT(csa.client_id)::int AS client_count
       FROM client_segments cs
       LEFT JOIN client_segment_assignments csa ON csa.segment_id = cs.id AND csa.account_id = $1
       WHERE cs.account_id = $1
       GROUP BY cs.id, cs.name, cs.color
       ORDER BY cs.name`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clients/segments
router.post('/segments', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { name, color } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required.' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO client_segments (account_id, name, color) VALUES ($1,$2,$3) RETURNING *`,
      [req.accountId, name.trim(), color || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A segment with that name already exists.' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/clients/segments/:segmentId
router.delete('/segments/:segmentId', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM client_segments WHERE id = $1 AND account_id = $2`,
      [req.params.segmentId, req.accountId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Segment not found.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clients/:id/segments — assign client to a segment
router.post('/:id/segments', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { segmentId } = req.body;
  if (!segmentId) return res.status(400).json({ error: 'segmentId is required.' });
  try {
    // Verify segment belongs to this account
    const segCheck = await pool.query(
      `SELECT id FROM client_segments WHERE id = $1 AND account_id = $2`,
      [segmentId, req.accountId]
    );
    if (!segCheck.rows.length) return res.status(404).json({ error: 'Segment not found.' });

    const { rows } = await pool.query(
      `INSERT INTO client_segment_assignments (account_id, client_id, segment_id)
       VALUES ($1,$2,$3)
       ON CONFLICT (client_id, segment_id) DO NOTHING
       RETURNING *`,
      [req.accountId, req.params.id, segmentId]
    );
    res.status(201).json(rows[0] || { ok: true, alreadyAssigned: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/clients/:id/segments/:segmentId — remove assignment
router.delete('/:id/segments/:segmentId', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM client_segment_assignments
       WHERE client_id = $1 AND segment_id = $2 AND account_id = $3`,
      [req.params.id, req.params.segmentId, req.accountId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Assignment not found.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/clients/:id — with full job history
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const clientResult = await pool.query(
      `SELECT * FROM clients WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!clientResult.rows.length) return res.status(404).json({ error: 'Not found' });

    const jobsResult = await pool.query(
      `SELECT j.*, u.name AS tech_name
       FROM jobs j
       LEFT JOIN users u ON u.id = j.tech_id
       WHERE j.client_id = $1 AND j.account_id = $2
       ORDER BY j.scheduled_at DESC`,
      [req.params.id, req.accountId]
    );

    res.json({ ...clientResult.rows[0], jobs: jobsResult.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/clients/:id
router.patch('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const fields = ['name','email','phone','address','city','state','zip','lat','lng','tier','notes','card_on_file'];
  const updates = [];
  const values = [];
  let i = 1;

  fields.forEach((f) => {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      values.push(req.body[f]);
    }
  });

  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

  values.push(req.params.id, req.accountId);
  try {
    const { rows } = await pool.query(
      `UPDATE clients SET ${updates.join(', ')}
       WHERE id = $${i} AND account_id = $${i + 1} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Client Locations ──────────────────────────────────────────────────────────

// GET /api/clients/:id/locations
router.get('/:id/locations', requireAuth, async (req, res) => {
  try {
    const clientCheck = await pool.query(
      `SELECT id FROM clients WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!clientCheck.rows.length) return res.status(404).json({ error: 'Client not found.' });

    const { rows } = await pool.query(
      `SELECT * FROM client_locations
       WHERE client_id = $1 AND account_id = $2
       ORDER BY is_primary DESC, created_at ASC`,
      [req.params.id, req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clients/:id/locations
router.post('/:id/locations', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const clientId = req.params.id;
  const {
    label = 'Service Location', address, city, state, zip, country,
    lat, lng, place_id, formatted_address, access_instructions, is_primary,
  } = req.body;

  if (!address || !address.trim()) return res.status(400).json({ error: 'address is required.' });

  try {
    const clientCheck = await pool.query(
      `SELECT id FROM clients WHERE id = $1 AND account_id = $2`,
      [clientId, req.accountId]
    );
    if (!clientCheck.rows.length) return res.status(404).json({ error: 'Client not found.' });

    // Dedup by place_id: if this exact place is already saved, return it
    if (place_id) {
      const existing = await pool.query(
        `SELECT * FROM client_locations WHERE client_id = $1 AND account_id = $2 AND place_id = $3`,
        [clientId, req.accountId, place_id]
      );
      if (existing.rows.length) return res.status(200).json(existing.rows[0]);
    }

    const isFirst = (await pool.query(
      `SELECT COUNT(*) FROM client_locations WHERE client_id = $1 AND account_id = $2`,
      [clientId, req.accountId]
    )).rows[0].count === '0';

    const makePrimary = isFirst || !!is_primary;

    // If setting as primary, unset existing primary
    if (makePrimary) {
      await pool.query(
        `UPDATE client_locations SET is_primary = false WHERE client_id = $1 AND account_id = $2`,
        [clientId, req.accountId]
      );
    }

    const { rows } = await pool.query(
      `INSERT INTO client_locations
         (account_id, client_id, label, address, city, state, zip, country,
          lat, lng, place_id, formatted_address, access_instructions, is_primary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        req.accountId, clientId, label.trim(), address.trim(),
        city || null, state || null, zip || null, country || null,
        lat || null, lng || null, place_id || null, formatted_address || null,
        access_instructions || null, makePrimary,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/clients/:id/locations/:locationId
router.patch('/:id/locations/:locationId', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { label, address, city, state, zip, country, lat, lng,
          place_id, formatted_address, access_instructions } = req.body;

  const allowed = ['label','address','city','state','zip','country','lat','lng',
                   'place_id','formatted_address','access_instructions'];
  const updates = [];
  const values  = [];
  let i = 1;

  const body = { label, address, city, state, zip, country, lat, lng,
                 place_id, formatted_address, access_instructions };
  allowed.forEach(f => {
    if (body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      values.push(body[f]);
    }
  });
  if (!updates.length) return res.status(400).json({ error: 'No fields to update.' });

  updates.push(`updated_at = NOW()`);
  values.push(req.params.locationId, req.accountId);

  try {
    const { rows } = await pool.query(
      `UPDATE client_locations SET ${updates.join(', ')}
       WHERE id = $${i} AND account_id = $${i + 1} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Location not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/clients/:id/locations/:locationId
router.delete('/:id/locations/:locationId', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM client_locations WHERE id = $1 AND account_id = $2 AND client_id = $3 RETURNING *`,
      [req.params.locationId, req.accountId, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Location not found.' });
    res.json({ ok: true });
  } catch (err) {
    // FK violation — location referenced by active jobs
    if (err.code === '23503') return res.status(409).json({ error: 'This location is referenced by one or more jobs and cannot be deleted.' });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clients/:id/locations/:locationId/primary
router.post('/:id/locations/:locationId/primary', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { id: clientId, locationId } = req.params;
  try {
    const check = await pool.query(
      `SELECT id FROM client_locations WHERE id = $1 AND client_id = $2 AND account_id = $3`,
      [locationId, clientId, req.accountId]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'Location not found.' });

    await pool.query(
      `UPDATE client_locations SET is_primary = false WHERE client_id = $1 AND account_id = $2`,
      [clientId, req.accountId]
    );
    const { rows } = await pool.query(
      `UPDATE client_locations SET is_primary = true, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [locationId]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
