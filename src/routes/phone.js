const express    = require('express');
const router     = express.Router();
const pool       = require('../db/pool');
const axios      = require('axios');
const { requireAuth, requireRole } = require('../middleware/auth');

const TELNYX_API = 'https://api.telnyx.com/v2';
const PLAN_LIMITS = { solo: 1, pro: 2, scale: 3, custom: 999, starter: 0 };

function telnyxClient() {
  const key = process.env.TELNYX_API_KEY;
  if (!key) throw new Error('TELNYX_API_KEY not configured');
  return axios.create({
    baseURL: TELNYX_API,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
}

// GET /api/phone/numbers
router.get('/numbers', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM phone_numbers WHERE account_id = $1 ORDER BY created_at DESC`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/phone/numbers/search — search available numbers
router.post('/numbers/search', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { area_code } = req.body;
  try {
    const client = telnyxClient();
    const r = await client.get('/available_phone_numbers', {
      params: {
        filter: {
          country_code:       'US',
          national_destination_code: area_code || undefined,
          features:           ['sms', 'voice'],
          limit:              10,
        },
      },
    });
    res.json(r.data.data || []);
  } catch (err) {
    const msg = err.response?.data?.errors?.[0]?.detail || err.message;
    res.status(err.response?.status || 500).json({ error: msg });
  }
});

// POST /api/phone/numbers/provision — buy a number
router.post('/numbers/provision', requireAuth, requireRole('owner'), async (req, res) => {
  const { phone_number, label } = req.body;
  if (!phone_number) return res.status(400).json({ error: 'phone_number is required' });

  try {
    // Check plan limit
    const [acctRes, countRes] = await Promise.all([
      pool.query(`SELECT plan FROM accounts WHERE id = $1`, [req.accountId]),
      pool.query(`SELECT COUNT(*) FROM phone_numbers WHERE account_id = $1 AND is_active = TRUE`, [req.accountId]),
    ]);
    const plan  = acctRes.rows[0]?.plan || 'starter';
    const limit = PLAN_LIMITS[plan] ?? 0;
    const count = parseInt(countRes.rows[0].count);
    if (count >= limit) {
      return res.status(403).json({ error: `Your ${plan} plan allows ${limit} phone number${limit !== 1 ? 's' : ''}. Upgrade to add more.` });
    }

    const client = telnyxClient();

    // Create TeXML application for this account if not exists, or reuse
    const appUrl     = process.env.APP_URL || 'https://api.fieldcore.app';
    const webhookUrl = `${appUrl}/api/webhooks/telnyx/voice`;

    let appId = null;
    try {
      const appRes = await client.post('/texml_applications', {
        application_name:   `FieldCore-${req.accountId.slice(0, 8)}`,
        webhook_event_url:  webhookUrl,
        inbound:            { channel_limit: 10, shaken_stir_enabled: false, sip_subdomain: null },
        outbound:           { channel_limit: 10, outbound_voice_profile_id: null },
      });
      appId = appRes.data.data?.id;
    } catch (e) {
      console.error('[Phone] TeXML app create error (non-fatal):', e.response?.data || e.message);
    }

    // Order the number
    const orderRes = await client.post('/phone_numbers', {
      phone_number,
      connection_id: appId || undefined,
    });
    const numData = orderRes.data.data;

    const { rows } = await pool.query(
      `INSERT INTO phone_numbers (account_id, telnyx_number_id, number, label, is_active)
       VALUES ($1,$2,$3,$4,TRUE) RETURNING *`,
      [req.accountId, numData.id, phone_number, label || phone_number]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    const msg = err.response?.data?.errors?.[0]?.detail || err.message;
    res.status(err.response?.status || 500).json({ error: msg });
  }
});

// DELETE /api/phone/numbers/:id — release number
router.delete('/numbers/:id', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM phone_numbers WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    if (rows[0].telnyx_number_id) {
      try {
        const client = telnyxClient();
        await client.delete(`/phone_numbers/${rows[0].telnyx_number_id}`);
      } catch (e) {
        console.error('[Phone] Telnyx release error (non-fatal):', e.response?.data || e.message);
      }
    }

    await pool.query(
      `UPDATE phone_numbers SET is_active = FALSE WHERE id = $1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/phone/numbers/:id — update settings
router.patch('/numbers/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { label, forward_to, business_hours_only, after_hours_message } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE phone_numbers SET
         label = COALESCE($1, label),
         forward_to = COALESCE($2, forward_to),
         business_hours_only = COALESCE($3, business_hours_only),
         after_hours_message = COALESCE($4, after_hours_message)
       WHERE id = $5 AND account_id = $6 RETURNING *`,
      [label, forward_to, business_hours_only, after_hours_message, req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/phone/calls
router.get('/calls', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit  || 50), 100);
  const offset = parseInt(req.query.offset || 0);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM call_logs WHERE account_id = $1
       ORDER BY started_at DESC LIMIT $2 OFFSET $3`,
      [req.accountId, limit, offset]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/phone/voicemails
router.get('/voicemails', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM voicemails WHERE account_id = $1 ORDER BY created_at DESC`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/phone/voicemails/:id/read
router.patch('/voicemails/:id/read', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE voicemails SET is_read = TRUE WHERE id = $1 AND account_id = $2 RETURNING *`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
