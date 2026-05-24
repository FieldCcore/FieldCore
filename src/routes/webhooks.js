const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const twilio = require('twilio');
const smsService = require('../services/sms');

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
      `UPDATE invoices SET status = 'paid', paid_at = NOW()
       WHERE stripe_payment_intent_id = $1 AND status != 'paid'
       RETURNING client_id, amount`,
      [pi.id]
    );
    if (rows.length) {
      await pool.query(
        `UPDATE clients SET ltv = ltv + $1 WHERE id = $2`,
        [rows[0].amount, rows[0].client_id]
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
        `UPDATE invoices SET status = 'paid', paid_at = NOW()
         WHERE id = $1 AND status != 'paid'
         RETURNING client_id, amount`,
        [invoiceId]
      );
      if (rows.length) {
        await pool.query(
          `UPDATE clients SET ltv = ltv + $1 WHERE id = $2`,
          [rows[0].amount, rows[0].client_id]
        );
      }
    }

    // Booking deposit payment
    const jobId = session.metadata?.job_id;
    if (jobId) {
      const paymentIntentId = session.payment_intent || null;

      await pool.query(
        `UPDATE deposits
         SET status = 'collected', collected_at = NOW(), stripe_payment_intent_id = $1
         WHERE job_id = $2 AND status = 'pending'`,
        [paymentIntentId, jobId]
      );

      // Send confirmation SMS now that deposit is confirmed
      const { rows: jobRows } = await pool.query(
        `SELECT j.id, j.service_type, j.scheduled_at, j.account_id, j.confirmation_sent,
                c.id AS client_id, c.name AS client_name, c.phone AS client_phone
         FROM jobs j JOIN clients c ON c.id = j.client_id
         WHERE j.id = $1`,
        [jobId]
      );
      const job = jobRows[0];
      if (job?.client_phone && !job.confirmation_sent) {
        smsService.send(
          job.account_id,
          job.client_id,
          job.client_phone,
          smsService.confirmationBody(job.client_name, job.service_type, job.scheduled_at)
        ).then(() =>
          pool.query(`UPDATE jobs SET confirmation_sent = TRUE WHERE id = $1`, [job.id])
        ).catch(err => console.error('[Deposit webhook SMS]', err.message));
      }
    }
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
