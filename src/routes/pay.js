const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const stripe  = require('stripe')((process.env.STRIPE_SECRET_KEY || '').trim());

const PLATFORM_FEE = parseFloat(process.env.PLATFORM_FEE_PERCENT || '1') / 100;

// GET /api/pay/:invoiceId — public invoice details (no auth)
router.get('/:invoiceId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.id, i.amount, i.tax_amount, i.status,
              c.name  AS client_name,
              j.service_type,
              j.scheduled_at,
              a.name  AS business_name
       FROM invoices i
       JOIN clients  c ON c.id = i.client_id
       JOIN jobs     j ON j.id = i.job_id
       JOIN accounts a ON a.id = i.account_id
       WHERE i.id = $1`,
      [req.params.invoiceId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Invoice not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pay/:invoiceId/checkout — create Stripe Checkout session (no auth)
router.post('/:invoiceId/checkout', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, c.name AS client_name, c.email AS client_email,
              j.service_type,
              a.name AS business_name,
              a.stripe_connect_account_id, a.stripe_connect_status
       FROM invoices i
       JOIN clients  c ON c.id = i.client_id
       JOIN jobs     j ON j.id = i.job_id
       JOIN accounts a ON a.id = i.account_id
       WHERE i.id = $1`,
      [req.params.invoiceId]
    );
    const invoice = rows[0];
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
    if (invoice.status === 'paid')  return res.status(400).json({ error: 'This invoice has already been paid.' });
    if (invoice.status === 'void')  return res.status(400).json({ error: 'This invoice has been voided.' });

    const appUrl      = process.env.APP_URL || 'http://localhost:5173';
    const amountCents = Math.round(parseFloat(invoice.amount) * 100);

    const sessionParams = {
      mode:                 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency:     'usd',
          unit_amount:  amountCents,
          product_data: {
            name:        invoice.service_type,
            description: `Invoice from ${invoice.business_name}`,
          },
        },
        quantity: 1,
      }],
      customer_email: invoice.client_email || undefined,
      metadata:       { invoice_id: invoice.id, account_id: invoice.account_id },
      success_url:    `${appUrl}/pay/${invoice.id}?paid=1`,
      cancel_url:     `${appUrl}/pay/${invoice.id}`,
    };

    // Route to operator's connected account when verified
    if (invoice.stripe_connect_account_id && invoice.stripe_connect_status === 'active') {
      sessionParams.payment_intent_data = {
        application_fee_amount: Math.round(amountCents * PLATFORM_FEE),
        transfer_data:          { destination: invoice.stripe_connect_account_id },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
