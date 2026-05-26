const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');

// GET /api/business-settings — full settings bundle
router.get('/', auth, async (req, res) => {
  const accountId = req.user.accountId;
  try {
    const [profileRes, hoursRes, closuresRes, servicesRes] = await Promise.all([
      pool.query('SELECT * FROM business_profiles WHERE account_id = $1', [accountId]),
      pool.query('SELECT * FROM business_hours WHERE account_id = $1 ORDER BY day_of_week', [accountId]),
      pool.query('SELECT * FROM holiday_closures WHERE account_id = $1 ORDER BY closure_date', [accountId]),
      pool.query('SELECT * FROM service_templates WHERE account_id = $1 ORDER BY sort_order, name', [accountId]),
    ]);

    // Build default hours if none exist
    let hours = hoursRes.rows;
    if (hours.length === 0) {
      hours = [0,1,2,3,4,5,6].map(d => ({
        day_of_week: d,
        open_time:   d === 0 || d === 6 ? null : '08:00',
        close_time:  d === 0 || d === 6 ? null : '17:00',
        is_closed:   d === 0 || d === 6,
      }));
    }

    res.json({
      profile:   profileRes.rows[0] || null,
      hours,
      closures:  closuresRes.rows,
      services:  servicesRes.rows,
    });
  } catch (err) {
    console.error('[business-settings GET]', err);
    res.status(500).json({ error: 'Failed to load settings.' });
  }
});

// PUT /api/business-settings/profile
router.put('/profile', auth, async (req, res) => {
  const accountId = req.user.accountId;
  const { business_name, phone, address, city, state, zip, website, description, timezone, vertical } = req.body;
  const { ein } = req.body;
  try {
    await pool.query(`
      INSERT INTO business_profiles (account_id, business_name, phone, address, city, state, zip, website, description, timezone, vertical, ein, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
      ON CONFLICT (account_id) DO UPDATE SET
        business_name = EXCLUDED.business_name,
        phone         = EXCLUDED.phone,
        address       = EXCLUDED.address,
        city          = EXCLUDED.city,
        state         = EXCLUDED.state,
        zip           = EXCLUDED.zip,
        website       = EXCLUDED.website,
        description   = EXCLUDED.description,
        timezone      = EXCLUDED.timezone,
        vertical      = EXCLUDED.vertical,
        ein           = EXCLUDED.ein,
        updated_at    = NOW()
    `, [accountId, business_name, phone, address, city, state, zip, website, description, timezone || 'America/New_York', vertical, ein || null]);

    // Sync name to accounts table if provided
    if (business_name) {
      await pool.query('UPDATE accounts SET name = $1 WHERE id = $2', [business_name, accountId]);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[business-settings PUT profile]', err);
    res.status(500).json({ error: 'Failed to save profile.' });
  }
});

// PUT /api/business-settings/hours — expects array of { day_of_week, open_time, close_time, is_closed }
router.put('/hours', auth, async (req, res) => {
  const accountId = req.user.accountId;
  const { hours } = req.body;
  if (!Array.isArray(hours)) return res.status(400).json({ error: 'hours must be an array.' });

  try {
    for (const h of hours) {
      await pool.query(`
        INSERT INTO business_hours (account_id, day_of_week, open_time, close_time, is_closed)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (account_id, day_of_week) DO UPDATE SET
          open_time  = EXCLUDED.open_time,
          close_time = EXCLUDED.close_time,
          is_closed  = EXCLUDED.is_closed
      `, [accountId, h.day_of_week, h.is_closed ? null : h.open_time, h.is_closed ? null : h.close_time, !!h.is_closed]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[business-settings PUT hours]', err);
    res.status(500).json({ error: 'Failed to save hours.' });
  }
});

// POST /api/business-settings/closures
router.post('/closures', auth, async (req, res) => {
  const accountId = req.user.accountId;
  const { closure_date, name, is_emergency } = req.body;
  if (!closure_date || !name) return res.status(400).json({ error: 'date and name required.' });
  try {
    const r = await pool.query(
      'INSERT INTO holiday_closures (account_id, closure_date, name, is_emergency) VALUES ($1,$2,$3,$4) RETURNING *',
      [accountId, closure_date, name, !!is_emergency]
    );
    res.json(r.rows[0]);
  } catch (err) {
    console.error('[closures POST]', err);
    res.status(500).json({ error: 'Failed to add closure.' });
  }
});

// DELETE /api/business-settings/closures/:id
router.delete('/closures/:id', auth, async (req, res) => {
  const accountId = req.user.accountId;
  try {
    await pool.query('DELETE FROM holiday_closures WHERE id = $1 AND account_id = $2', [req.params.id, accountId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete closure.' });
  }
});

// POST /api/business-settings/services
router.post('/services', auth, async (req, res) => {
  const accountId = req.user.accountId;
  const { name, duration_minutes, buffer_minutes, price, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name required.' });
  try {
    const r = await pool.query(
      'INSERT INTO service_templates (account_id, name, duration_minutes, buffer_minutes, price, description) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [accountId, name, duration_minutes || 60, buffer_minutes || 15, price || null, description || null]
    );
    res.json(r.rows[0]);
  } catch (err) {
    console.error('[services POST]', err);
    res.status(500).json({ error: 'Failed to create service.' });
  }
});

// PUT /api/business-settings/services/:id
router.put('/services/:id', auth, async (req, res) => {
  const accountId = req.user.accountId;
  const { name, duration_minutes, buffer_minutes, price, description, is_active } = req.body;
  try {
    const r = await pool.query(`
      UPDATE service_templates
      SET name=$1, duration_minutes=$2, buffer_minutes=$3, price=$4, description=$5, is_active=$6
      WHERE id=$7 AND account_id=$8
      RETURNING *
    `, [name, duration_minutes, buffer_minutes, price, description, is_active !== false, req.params.id, accountId]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found.' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update service.' });
  }
});

// DELETE /api/business-settings/services/:id
router.delete('/services/:id', auth, async (req, res) => {
  const accountId = req.user.accountId;
  try {
    await pool.query('DELETE FROM service_templates WHERE id=$1 AND account_id=$2', [req.params.id, accountId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete service.' });
  }
});

module.exports = router;
