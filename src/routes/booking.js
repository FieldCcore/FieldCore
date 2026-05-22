const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const smsService = require('../services/sms');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ── Public routes (no auth — used by the embeddable widget) ──────────────────

// GET /api/booking/:accountId — fetch public booking config
router.get('/:accountId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT bs.services, bs.deposit_amount, bs.agreement_text, bs.business_name
       FROM booking_settings bs
       WHERE bs.account_id = $1`,
      [req.params.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Booking page not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/booking/:accountId/submit — create client + job, optionally start deposit checkout
router.post('/:accountId/submit', async (req, res) => {
  const accountId = req.params.accountId;
  const { name, email, phone, service, scheduled_at, agreed } = req.body;

  if (!name || !service || !scheduled_at) {
    return res.status(400).json({ error: 'name, service, and scheduled_at are required' });
  }
  if (!agreed) {
    return res.status(400).json({ error: 'You must agree to the terms to book.' });
  }

  try {
    // Upsert client by phone or email
    let client;
    if (phone || email) {
      const match = await pool.query(
        `SELECT * FROM clients WHERE account_id = $1 AND (phone = $2 OR email = $3) LIMIT 1`,
        [accountId, phone || null, email || null]
      );
      client = match.rows[0];
    }

    if (!client) {
      const inserted = await pool.query(
        `INSERT INTO clients (account_id, name, email, phone) VALUES ($1,$2,$3,$4) RETURNING *`,
        [accountId, name, email || null, phone || null]
      );
      client = inserted.rows[0];
    } else {
      // Update name in case it changed
      await pool.query(`UPDATE clients SET name = $1 WHERE id = $2`, [name, client.id]);
    }

    // Create the job
    const jobResult = await pool.query(
      `INSERT INTO jobs (account_id, client_id, service_type, scheduled_at, status)
       VALUES ($1,$2,$3,$4,'scheduled') RETURNING *`,
      [accountId, client.id, service, scheduled_at]
    );
    const job = jobResult.rows[0];

    // Send confirmation SMS if phone provided
    if (phone) {
      smsService.send(
        accountId, client.id, phone,
        smsService.confirmationBody(name, service, scheduled_at)
      ).then(() =>
        pool.query(`UPDATE jobs SET confirmation_sent = TRUE WHERE id = $1`, [job.id])
      ).catch(err => console.error('[Booking SMS]', err.message));
    }

    // Check if deposit is required
    const settingsResult = await pool.query(
      `SELECT deposit_amount, business_name FROM booking_settings WHERE account_id = $1`,
      [accountId]
    );
    const settings = settingsResult.rows[0];
    const depositAmount = parseFloat(settings?.deposit_amount || 0);

    if (depositAmount > 0 && process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.endsWith('_')) {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(depositAmount * 100),
            product_data: { name: `Deposit — ${service}` },
          },
          quantity: 1,
        }],
        customer_email: email || undefined,
        metadata: { job_id: job.id, account_id: accountId, client_id: client.id },
        success_url: `${process.env.APP_URL || 'http://localhost:5173'}/book-confirm?job=${job.id}`,
        cancel_url:  `${process.env.APP_URL || 'http://localhost:5173'}/book/${accountId}`,
      });

      // Record deposit
      await pool.query(
        `INSERT INTO deposits (account_id, job_id, client_id, amount, type, status)
         VALUES ($1,$2,$3,$4,'deposit','pending')`,
        [accountId, job.id, client.id, depositAmount]
      );

      return res.json({ job_id: job.id, checkout_url: session.url, requires_deposit: true });
    }

    res.json({ job_id: job.id, requires_deposit: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Operator routes (auth required) ──────────────────────────────────────────

// GET /api/booking-settings — get operator's booking config
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM booking_settings WHERE account_id = $1`,
      [req.accountId]
    );
    if (!rows.length) {
      // Auto-create default settings
      const inserted = await pool.query(
        `INSERT INTO booking_settings (account_id) VALUES ($1) RETURNING *`,
        [req.accountId]
      );
      return res.json(inserted.rows[0]);
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/booking-settings — update operator's booking config
router.put('/', requireAuth, async (req, res) => {
  const { services, deposit_amount, agreement_text, business_name } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO booking_settings (account_id, services, deposit_amount, agreement_text, business_name)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (account_id) DO UPDATE SET
         services       = EXCLUDED.services,
         deposit_amount = EXCLUDED.deposit_amount,
         agreement_text = EXCLUDED.agreement_text,
         business_name  = EXCLUDED.business_name
       RETURNING *`,
      [
        req.accountId,
        JSON.stringify(services),
        deposit_amount ?? 0,
        agreement_text,
        business_name,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
