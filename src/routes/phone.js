const express    = require('express');
const router     = express.Router();
const pool       = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const PLAN_LIMITS = { solo: 1, pro: 2, scale: 3, custom: 999, starter: 0 };

function getTwilio() {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('Twilio credentials not configured');
  return require('twilio')(sid, token);
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

// POST /api/phone/numbers/search — search available numbers by area code
router.post('/numbers/search', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { area_code } = req.body;
  try {
    const client  = getTwilio();
    const results = await client.availablePhoneNumbers('US').local.list({
      areaCode:            area_code || undefined,
      voiceEnabled:        true,
      smsEnabled:          true,
      limit:               10,
    });
    res.json(results.map(n => ({ phone_number: n.phoneNumber, friendly_name: n.friendlyName, region: n.region })));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
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
      return res.status(403).json({
        error: `Your ${plan} plan allows ${limit} phone number${limit !== 1 ? 's' : ''}. Upgrade to add more.`,
      });
    }

    const appUrl    = process.env.APP_URL || 'https://api.fieldcore.app';
    const voiceUrl  = `${appUrl}/api/webhooks/twilio/voice`;
    const smsUrl    = `${appUrl}/api/webhooks/twilio`;

    const client    = getTwilio();
    const incoming  = await client.incomingPhoneNumbers.create({
      phoneNumber: phone_number,
      voiceUrl,
      smsUrl,
      friendlyName: label || `FieldCore-${req.accountId.slice(0, 8)}`,
    });

    const { rows } = await pool.query(
      `INSERT INTO phone_numbers (account_id, telnyx_number_id, number, label, is_active)
       VALUES ($1,$2,$3,$4,TRUE) RETURNING *`,
      [req.accountId, incoming.sid, phone_number, label || phone_number]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
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
        const client = getTwilio();
        await client.incomingPhoneNumbers(rows[0].telnyx_number_id).remove();
      } catch (e) {
        console.error('[Phone] Twilio release error (non-fatal):', e.message);
      }
    }

    await pool.query(`UPDATE phone_numbers SET is_active = FALSE WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/phone/numbers/:id — update label / forwarding / hours settings
router.patch('/numbers/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { label, forward_to, business_hours_only, after_hours_message } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE phone_numbers SET
         label               = COALESCE($1, label),
         forward_to          = COALESCE($2, forward_to),
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
      `SELECT * FROM call_logs WHERE account_id = $1 ORDER BY started_at DESC LIMIT $2 OFFSET $3`,
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

// GET /api/phone/calls/latest-inbound — real-time CallerID polling (last 30 seconds)
router.get('/calls/latest-inbound', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT cl.*, c.tier, c.ltv, c.notes AS client_notes,
              (SELECT j.service_type FROM jobs j WHERE j.client_id = cl.client_id AND j.account_id = cl.account_id ORDER BY j.scheduled_at DESC LIMIT 1) AS last_service,
              (SELECT j.scheduled_at  FROM jobs j WHERE j.client_id = cl.client_id AND j.account_id = cl.account_id ORDER BY j.scheduled_at DESC LIMIT 1) AS last_service_at,
              (SELECT SUM(i.amount)   FROM invoices i WHERE i.client_id = cl.client_id AND i.account_id = cl.account_id AND i.status = 'pending') AS open_balance
       FROM call_logs cl
       LEFT JOIN clients c ON c.id = cl.client_id
       WHERE cl.account_id = $1
         AND cl.direction = 'inbound'
         AND cl.started_at > NOW() - INTERVAL '30 seconds'
         AND cl.status = 'in_progress'
       ORDER BY cl.started_at DESC
       LIMIT 1`,
      [req.accountId]
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/phone/calls/outbound — click-to-call: Twilio calls operator first, then client
router.post('/calls/outbound', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { client_id, operator_number } = req.body;
  if (!client_id || !operator_number) {
    return res.status(400).json({ error: 'client_id and operator_number are required' });
  }

  try {
    const [clientRes, numRes] = await Promise.all([
      pool.query(`SELECT * FROM clients WHERE id = $1 AND account_id = $2`, [client_id, req.accountId]),
      pool.query(`SELECT * FROM phone_numbers WHERE account_id = $1 AND is_active = TRUE LIMIT 1`, [req.accountId]),
    ]);
    const client = clientRes.rows[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!client.phone) return res.status(400).json({ error: 'Client has no phone number' });

    const fromNumber = numRes.rows[0]?.number;
    if (!fromNumber) return res.status(400).json({ error: 'No active phone number on account' });

    const appUrl = process.env.APP_URL || 'https://fieldcore-production-ee0d.up.railway.app';
    const twilioClient = getTwilio();

    // Call the operator first; when answered, bridge to client
    const call = await twilioClient.calls.create({
      to:   operator_number,
      from: fromNumber,
      url:  `${appUrl}/api/webhooks/twilio/bridge?client_phone=${encodeURIComponent(client.phone)}&client_name=${encodeURIComponent(client.name || '')}`,
    });

    // Log outbound call
    const { rows } = await pool.query(
      `INSERT INTO call_logs (account_id, direction, from_number, to_number, client_id, client_name, status)
       VALUES ($1,'outbound',$2,$3,$4,$5,'in_progress') RETURNING *`,
      [req.accountId, fromNumber, client.phone, client_id, client.name]
    );

    res.json({ call_sid: call.sid, log: rows[0] });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
