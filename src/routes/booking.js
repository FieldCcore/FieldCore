const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const smsService   = require('../services/sms');
const emailService = require('../services/email');
const notify       = require('../services/notify');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PLATFORM_FEE = parseFloat(process.env.PLATFORM_FEE_PERCENT || '1') / 100;

// ── Public routes (no auth — used by the embeddable widget) ──────────────────

// GET /api/booking/:accountId — fetch public booking config including hours + service templates
router.get('/:accountId', async (req, res) => {
  try {
    const [settingsRes, hoursRes, closuresRes, servicesRes] = await Promise.all([
      pool.query(
        `SELECT bs.services, bs.deposit_amount, bs.deposit_rules, bs.agreement_text, bs.business_name
         FROM booking_settings bs WHERE bs.account_id = $1`,
        [req.params.accountId]
      ),
      pool.query(
        `SELECT day_of_week, open_time, close_time, is_closed
         FROM business_hours WHERE account_id = $1 ORDER BY day_of_week`,
        [req.params.accountId]
      ),
      pool.query(
        `SELECT closure_date FROM holiday_closures WHERE account_id = $1 AND closure_date >= CURRENT_DATE`,
        [req.params.accountId]
      ),
      pool.query(
        `SELECT id, name, duration_minutes, buffer_minutes, price, description
         FROM service_templates WHERE account_id = $1 AND is_active = true ORDER BY sort_order, name`,
        [req.params.accountId]
      ),
    ]);

    if (!settingsRes.rows.length) return res.status(404).json({ error: 'Booking page not found' });
    res.json({
      ...settingsRes.rows[0],
      hours:            hoursRes.rows,
      holiday_closures: closuresRes.rows.map(r => r.closure_date),
      service_templates: servicesRes.rows,
    });
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
    // Validate against business hours if configured
    if (scheduled_at) {
      const apptDate = new Date(scheduled_at);
      const dayOfWeek = apptDate.getDay(); // 0=Sun
      const apptTime = `${String(apptDate.getHours()).padStart(2,'0')}:${String(apptDate.getMinutes()).padStart(2,'0')}`;

      const [hoursRes, closureRes] = await Promise.all([
        pool.query('SELECT * FROM business_hours WHERE account_id=$1 AND day_of_week=$2', [accountId, dayOfWeek]),
        pool.query(
          'SELECT 1 FROM holiday_closures WHERE account_id=$1 AND closure_date=$2',
          [accountId, apptDate.toISOString().slice(0,10)]
        ),
      ]);

      if (closureRes.rows.length) {
        return res.status(400).json({ error: 'This date is not available — the business is closed.' });
      }

      if (hoursRes.rows.length) {
        const dayHours = hoursRes.rows[0];
        if (dayHours.is_closed) {
          return res.status(400).json({ error: 'The business is closed on this day. Please choose another date.' });
        }
        if (dayHours.open_time && dayHours.close_time) {
          if (apptTime < dayHours.open_time || apptTime > dayHours.close_time) {
            return res.status(400).json({ error: `Appointments are available ${dayHours.open_time} – ${dayHours.close_time} on this day.` });
          }
        }
      }
    }

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

    // Check if deposit is required
    const settingsResult = await pool.query(
      `SELECT bs.deposit_amount, bs.deposit_rules, bs.business_name,
              a.stripe_connect_account_id, a.stripe_connect_status
       FROM booking_settings bs
       JOIN accounts a ON a.id = bs.account_id
       WHERE bs.account_id = $1`,
      [accountId]
    );
    const settings = settingsResult.rows[0];

    // Start with global default
    let depositAmount = parseFloat(settings?.deposit_amount || 0);

    // Per-service rule overrides global
    const rules = Array.isArray(settings?.deposit_rules) ? settings.deposit_rules : [];
    const matchedRule = rules.find(r => r.service && service && r.service.toLowerCase() === service.toLowerCase());
    if (matchedRule) {
      if (matchedRule.type === 'percent') {
        const jobAmt = parseFloat(req.body.amount || 0);
        depositAmount = jobAmt > 0 ? (jobAmt * matchedRule.amount) / 100 : matchedRule.amount;
      } else {
        depositAmount = parseFloat(matchedRule.amount || 0);
      }
    }

    // Client tier overrides
    if (client.tier === 'vip') {
      // VIP clients: waive deposit entirely, even if a service rule applies
      depositAmount = 0;
    } else if (client.tier === 'at_risk') {
      // At-risk clients: enforce at least the global deposit minimum
      const globalMinimum = parseFloat(settings?.deposit_amount || 0);
      if (depositAmount < globalMinimum) depositAmount = globalMinimum;
    }

    if (depositAmount > 0 && process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.endsWith('_')) {
      const depositCents = Math.round(depositAmount * 100);
      const sessionParams = {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            unit_amount: depositCents,
            product_data: { name: `Deposit — ${service}` },
          },
          quantity: 1,
        }],
        customer_email: email || undefined,
        metadata: { job_id: job.id, account_id: accountId, client_id: client.id },
        success_url: `${process.env.APP_URL || 'http://localhost:5173'}/book-confirm?job=${job.id}`,
        cancel_url:  `${process.env.APP_URL || 'http://localhost:5173'}/book/${accountId}`,
      };

      // Route to operator's connected account when verified
      if (settings?.stripe_connect_account_id && settings?.stripe_connect_status === 'active') {
        sessionParams.payment_intent_data = {
          application_fee_amount: Math.round(depositCents * PLATFORM_FEE),
          transfer_data:          { destination: settings.stripe_connect_account_id },
        };
      }

      const session = await stripe.checkout.sessions.create(sessionParams);

      // Record deposit as pending — SMS confirmation sent by webhook after payment
      await pool.query(
        `INSERT INTO deposits (account_id, job_id, client_id, amount, type, status)
         VALUES ($1,$2,$3,$4,'deposit','pending')`,
        [accountId, job.id, client.id, depositAmount]
      );

      notify.create(accountId, 'booking_new',
        `New booking: ${name}`,
        `${service} · deposit required`,
        '/jobs'
      );
      return res.json({ job_id: job.id, checkout_url: session.url, requires_deposit: true });
    }

    // No deposit required — confirm immediately via SMS + email
    if (phone) {
      smsService.send(
        accountId, client.id, phone,
        smsService.confirmationBody(name, service, scheduled_at)
      ).then(() =>
        pool.query(`UPDATE jobs SET confirmation_sent = TRUE WHERE id = $1`, [job.id])
      ).catch(err => console.error('[Booking SMS]', err.message));
    }
    if (email) {
      emailService.send({
        to:      email,
        subject: `Your ${service} appointment is confirmed`,
        html:    emailService.confirmationHtml(name, service, scheduled_at),
      }).catch(err => console.error('[Booking email]', err.message));
    }

    notify.create(accountId, 'booking_new',
      `New booking: ${name}`,
      `${service} · no deposit`,
      '/jobs'
    );

    res.json({ job_id: job.id, requires_deposit: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/booking/confirm/:jobId — public, returns minimal job info for confirmation page
router.get('/confirm/:jobId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT j.id, j.service_type, j.scheduled_at, j.status
       FROM jobs j WHERE j.id = $1`,
      [req.params.jobId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Job not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Operator routes (auth required) ──────────────────────────────────────────

// GET /api/booking-settings — get operator's booking config
router.get('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
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
router.put('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { services, deposit_amount, deposit_rules, agreement_text, business_name, tax_rate } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO booking_settings (account_id, services, deposit_amount, deposit_rules, agreement_text, business_name, tax_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (account_id) DO UPDATE SET
         services       = EXCLUDED.services,
         deposit_amount = EXCLUDED.deposit_amount,
         deposit_rules  = EXCLUDED.deposit_rules,
         agreement_text = EXCLUDED.agreement_text,
         business_name  = EXCLUDED.business_name,
         tax_rate       = EXCLUDED.tax_rate
       RETURNING *`,
      [
        req.accountId,
        JSON.stringify(services),
        deposit_amount ?? 0,
        JSON.stringify(deposit_rules ?? []),
        agreement_text,
        business_name,
        tax_rate ?? 0,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
