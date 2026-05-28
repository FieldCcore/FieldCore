const express      = require('express');
const router       = require('express').Router();
const pool         = require('../db/pool');
const stripe       = require('stripe')((process.env.STRIPE_SECRET_KEY || '').trim());
const smsService   = require('../services/sms');
const emailService = require('../services/email');
const notify       = require('../services/notify');

// POST /api/webhooks/stripe
// Raw body required — mount before express.json()
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const { rows } = await pool.query(
      `UPDATE invoices i SET status = 'paid', paid_at = NOW()
       FROM clients c
       WHERE i.stripe_payment_intent_id = $1 AND i.status != 'paid' AND c.id = i.client_id
       RETURNING i.account_id, i.client_id, i.amount, c.name AS client_name`,
      [pi.id]
    );
    if (rows.length) {
      const r = rows[0];
      await pool.query(`UPDATE clients SET ltv = ltv + $1 WHERE id = $2`, [r.amount, r.client_id]);
      notify.create(r.account_id, 'invoice_paid',
        `Invoice paid: ${r.client_name}`,
        `$${parseFloat(r.amount).toFixed(2)} received`,
        '/invoices'
      );
    }
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const chargeId = session.payment_intent;

    // Invoice payment via Checkout
    const invoiceId = session.metadata?.invoice_id;
    if (invoiceId) {
      const { rows } = await pool.query(
        `UPDATE invoices i SET status = 'paid', paid_at = NOW()
         FROM clients c
         WHERE i.id = $1 AND i.status != 'paid' AND c.id = i.client_id
         RETURNING i.account_id, i.client_id, i.amount, c.name AS client_name`,
        [invoiceId]
      );
      if (rows.length) {
        const r = rows[0];
        await pool.query(`UPDATE clients SET ltv = ltv + $1 WHERE id = $2`, [r.amount, r.client_id]);
        notify.create(r.account_id, 'invoice_paid',
          `Invoice paid: ${r.client_name}`,
          `$${parseFloat(r.amount).toFixed(2)} received`,
          '/invoices'
        );
      }
    }

    // Booking deposit payment
    const jobId = session.metadata?.job_id;
    if (jobId) {
      const paymentIntentId = session.payment_intent || null;

      // Fetch the charge ID from the payment intent so refunds can be issued later
      let chargeId = null;
      if (paymentIntentId && process.env.STRIPE_SECRET_KEY) {
        try {
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
          chargeId = pi.latest_charge || null;
        } catch (e) {
          console.error('[Deposit webhook] Could not retrieve charge ID:', e.message);
        }
      }

      await pool.query(
        `UPDATE deposits
         SET status = 'collected', collected_at = NOW(),
             stripe_payment_intent_id = $1, stripe_charge_id = $2
         WHERE job_id = $3 AND status = 'pending'`,
        [paymentIntentId, chargeId, jobId]
      );

      // Send confirmation SMS now that deposit is confirmed
      const { rows: jobRows } = await pool.query(
        `SELECT j.id, j.service_type, j.scheduled_at, j.account_id, j.confirmation_sent,
                c.id AS client_id, c.name AS client_name, c.phone AS client_phone, c.email AS client_email
         FROM jobs j JOIN clients c ON c.id = j.client_id
         WHERE j.id = $1`,
        [jobId]
      );
      const job = jobRows[0];
      if (job && !job.confirmation_sent) {
        if (job.client_phone) {
          smsService.send(
            job.account_id, job.client_id, job.client_phone,
            smsService.confirmationBody(job.client_name, job.service_type, job.scheduled_at)
          ).then(() =>
            pool.query(`UPDATE jobs SET confirmation_sent = TRUE WHERE id = $1`, [job.id])
          ).catch(err => console.error('[Deposit webhook SMS]', err.message));
        }
        if (job.client_email) {
          emailService.send({
            to:      job.client_email,
            subject: `Your ${job.service_type} appointment is confirmed`,
            html:    emailService.confirmationHtml(job.client_name, job.service_type, job.scheduled_at),
          }).catch(err => console.error('[Deposit webhook email]', err.message));
        }
        notify.create(job.account_id, 'deposit_collected',
          `Deposit collected: ${job.client_name}`,
          `${job.service_type} · $${session.amount_total ? (session.amount_total / 100).toFixed(2) : '—'}`,
          '/deposits'
        );
      }
    }
  }

  // ── Platform subscription events ──────────────────────────
  function priceIdToPlan(priceId) {
    if (priceId === process.env.STRIPE_PRICE_SOLO)  return 'solo';
    if (priceId === process.env.STRIPE_PRICE_PRO)   return 'pro';
    if (priceId === process.env.STRIPE_PRICE_SCALE) return 'scale';
    return 'starter';
  }

  if (event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated') {
    const sub     = event.data.object;
    const priceId = sub.items.data[0]?.price?.id;
    const plan    = priceIdToPlan(priceId);
    await pool.query(
      `UPDATE accounts
       SET plan = $1, plan_status = $2, stripe_subscription_id = $3,
           renewal_7d_sent = FALSE, renewal_3d_sent = FALSE
       WHERE stripe_customer_id = $4`,
      [plan, sub.status, sub.id, sub.customer]
    );
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    await pool.query(
      `UPDATE accounts
       SET plan = 'starter', plan_status = 'active', stripe_subscription_id = NULL
       WHERE stripe_customer_id = $1`,
      [sub.customer]
    );
  }

  if (event.type === 'invoice.payment_succeeded') {
    const inv = event.data.object;
    if (inv.subscription) {
      // Platform subscription renewal — record billing event + send receipt
      const { rows: [acct] } = await pool.query(
        `SELECT a.id, a.name, a.plan, u.email AS owner_email
         FROM accounts a
         JOIN users u ON u.account_id = a.id AND u.role = 'owner'
         WHERE a.stripe_customer_id = $1`,
        [inv.customer]
      );
      if (acct) {
        await pool.query(
          `INSERT INTO billing_events
             (account_id, stripe_invoice_id, amount, status, description,
              invoice_pdf_url, period_start, period_end)
           VALUES ($1,$2,$3,'paid',$4,$5,
             to_timestamp($6), to_timestamp($7))
           ON CONFLICT DO NOTHING`,
          [
            acct.id, inv.id,
            inv.amount_paid / 100,
            `${acct.plan?.charAt(0).toUpperCase() + acct.plan?.slice(1)} plan subscription`,
            inv.invoice_pdf || null,
            inv.period_start || null,
            inv.period_end   || null,
          ]
        );
        if (acct.owner_email && inv.amount_paid > 0) {
          const planName = { solo: 'Solo', pro: 'Pro', scale: 'Scale' }[acct.plan] || acct.plan;
          emailService.send({
            to:      acct.owner_email,
            subject: `Receipt — FieldCore ${planName} · $${(inv.amount_paid / 100).toFixed(2)}`,
            html:    emailService.billingReceiptHtml(acct.name, inv.amount_paid / 100, planName, inv.invoice_pdf),
          }).catch(err => console.error('[webhook receipt email]', err.message));
        }
      }
    }
  }

  if (event.type === 'invoice.payment_failed') {
    const inv = event.data.object;
    await pool.query(
      `UPDATE accounts SET plan_status = 'past_due' WHERE stripe_customer_id = $1`,
      [inv.customer]
    );
    // Email operator about failure
    const { rows: [acct] } = await pool.query(
      `SELECT a.name, u.email AS owner_email
       FROM accounts a JOIN users u ON u.account_id = a.id AND u.role = 'owner'
       WHERE a.stripe_customer_id = $1`,
      [inv.customer]
    );
    if (acct?.owner_email) {
      emailService.send({
        to:      acct.owner_email,
        subject: 'Action required — FieldCore payment failed',
        html:    emailService.billingFailedHtml(acct.name),
      }).catch(err => console.error('[webhook payment failed email]', err.message));
    }
  }

  // ── Connect account verification ──────────────────────────
  if (event.type === 'account.updated') {
    const acct   = event.data.object;
    const status = acct.charges_enabled ? 'active' : 'pending';
    await pool.query(
      `UPDATE accounts SET stripe_connect_status = $1 WHERE stripe_connect_account_id = $2`,
      [status, acct.id]
    );
  }

  res.json({ received: true });
});

// POST /api/webhooks/twilio — incoming SMS
router.post('/twilio', express.urlencoded({ extended: false }), async (req, res) => {
  const { From, Body, MessageSid } = req.body;

  // Find client by phone number across all accounts
  const clientResult = await pool.query(
    `SELECT * FROM clients WHERE phone = $1 LIMIT 1`,
    [From]
  );
  const client = clientResult.rows[0];

  await pool.query(
    `INSERT INTO messages (account_id, client_id, direction, body, twilio_sid)
     VALUES ($1,$2,'inbound',$3,$4)`,
    [client?.account_id ?? null, client?.id ?? null, Body, MessageSid]
  );

  // Empty TwiML response (no auto-reply)
  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>');
});

module.exports = router;
