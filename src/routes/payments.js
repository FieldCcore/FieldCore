const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const stripe = require('stripe')((process.env.STRIPE_SECRET_KEY || '').trim());

// POST /api/payments/setup-intent — card on file setup
router.post('/setup-intent', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { client_id } = req.body;
  if (!client_id) return res.status(400).json({ error: 'client_id is required' });

  try {
    const clientResult = await pool.query(
      `SELECT * FROM clients WHERE id = $1 AND account_id = $2`,
      [client_id, req.accountId]
    );
    const client = clientResult.rows[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const setupIntent = await stripe.setupIntents.create({
      metadata: { client_id, account_id: req.accountId },
    });

    res.json({ client_secret: setupIntent.client_secret });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/charge — charge card on file
router.post('/charge', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { invoice_id, payment_method_id } = req.body;
  if (!invoice_id || !payment_method_id) {
    return res.status(400).json({ error: 'invoice_id and payment_method_id are required' });
  }

  try {
    const [invoiceResult, clientResult] = await Promise.all([
      pool.query(`SELECT * FROM invoices WHERE id = $1 AND account_id = $2`, [invoice_id, req.accountId]),
      pool.query(
        `SELECT c.stripe_customer_id FROM invoices i JOIN clients c ON c.id = i.client_id WHERE i.id = $1`,
        [invoice_id]
      ),
    ]);
    const invoice = invoiceResult.rows[0];
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status === 'paid') return res.status(400).json({ error: 'Already paid' });

    const stripeCustomerId = clientResult.rows[0]?.stripe_customer_id;

    const paymentIntent = await stripe.paymentIntents.create({
      amount:               Math.round(invoice.amount * 100),
      currency:             'usd',
      payment_method:       payment_method_id,
      customer:             stripeCustomerId || undefined,
      confirm:              true,
      off_session:          true,
      payment_method_types: ['card'],
      metadata:             { invoice_id, account_id: req.accountId },
    });

    await pool.query(
      `UPDATE invoices SET status = 'paid', stripe_payment_intent_id = $1 WHERE id = $2`,
      [paymentIntent.id, invoice_id]
    );

    await pool.query(
      `UPDATE clients SET ltv = ltv + $1 WHERE id = $2`,
      [invoice.amount, invoice.client_id]
    );

    res.json({ status: paymentIntent.status, payment_intent_id: paymentIntent.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/save-card — save PaymentMethod to client after SetupIntent confirms
router.post('/save-card', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { client_id, payment_method_id } = req.body;
  if (!client_id || !payment_method_id) {
    return res.status(400).json({ error: 'client_id and payment_method_id are required' });
  }
  try {
    const clientResult = await pool.query(
      `SELECT * FROM clients WHERE id = $1 AND account_id = $2`,
      [client_id, req.accountId]
    );
    const client = clientResult.rows[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });

    // Ensure Stripe customer exists
    let stripeCustomerId = client.stripe_customer_id;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: client.name,
        email: client.email || undefined,
        phone: client.phone || undefined,
        metadata: { client_id, account_id: req.accountId },
      });
      stripeCustomerId = customer.id;
    }

    // Attach payment method to customer
    await stripe.paymentMethods.attach(payment_method_id, { customer: stripeCustomerId });
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: payment_method_id },
    });

    await pool.query(
      `UPDATE clients SET card_on_file = TRUE, stripe_customer_id = $1, stripe_payment_method_id = $2 WHERE id = $3`,
      [stripeCustomerId, payment_method_id, client_id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/payment-link — create Stripe Checkout Session link
router.post('/payment-link', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { invoice_id } = req.body;
  if (!invoice_id) return res.status(400).json({ error: 'invoice_id is required' });

  try {
    const result = await pool.query(
      `SELECT i.*, c.name AS client_name, c.email AS client_email, j.service_type
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
       JOIN jobs j ON j.id = i.job_id
       WHERE i.id = $1 AND i.account_id = $2`,
      [invoice_id, req.accountId]
    );
    const invoice = result.rows[0];
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status === 'paid') return res.status(400).json({ error: 'Already paid' });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(invoice.amount * 100),
          product_data: { name: invoice.service_type },
        },
        quantity: 1,
      }],
      customer_email: invoice.client_email || undefined,
      metadata: { invoice_id, account_id: req.accountId },
      success_url: `${process.env.APP_URL || 'http://localhost:5173'}/invoices?paid=true`,
      cancel_url:  `${process.env.APP_URL || 'http://localhost:5173'}/invoices`,
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
