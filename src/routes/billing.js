const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { requireAuth, requireRole } = require('../middleware/auth');

const PRICE_IDS = {
  growth: process.env.STRIPE_PRICE_GROWTH,
  scale:  process.env.STRIPE_PRICE_SCALE,
};

// GET /api/billing — current plan, status, subscription presence
router.get('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT plan, plan_status, stripe_customer_id, stripe_subscription_id FROM accounts WHERE id = $1`,
      [req.accountId]
    );
    const acct = rows[0] || {};
    res.json({
      plan:            acct.plan            || 'starter',
      status:          acct.plan_status     || 'active',
      hasSubscription: !!acct.stripe_subscription_id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/billing/checkout — Stripe Checkout session (subscription mode)
router.post('/checkout', requireAuth, requireRole('owner'), async (req, res) => {
  const { plan } = req.body;
  const priceId  = PRICE_IDS[plan];
  if (!priceId) return res.status(400).json({ error: 'Invalid plan. Must be growth or scale.' });

  try {
    const { rows } = await pool.query(
      `SELECT a.stripe_customer_id, a.name AS account_name, u.email, u.name AS user_name
       FROM accounts a JOIN users u ON u.id = $1
       WHERE a.id = $2`,
      [req.userId, req.accountId]
    );
    const row = rows[0];

    let customerId = row.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email:    row.email,
        name:     row.account_name,
        metadata: { account_id: req.accountId },
      });
      customerId = customer.id;
      await pool.query(
        `UPDATE accounts SET stripe_customer_id = $1 WHERE id = $2`,
        [customerId, req.accountId]
      );
    }

    const appUrl  = process.env.APP_URL || 'http://localhost:5173';
    const session = await stripe.checkout.sessions.create({
      mode:     'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata: { account_id: req.accountId } },
      metadata: { account_id: req.accountId, plan },
      success_url: `${appUrl}/billing?upgraded=1`,
      cancel_url:  `${appUrl}/billing`,
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/billing/portal — Stripe Customer Portal session
router.post('/portal', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT stripe_customer_id FROM accounts WHERE id = $1`,
      [req.accountId]
    );
    const customerId = rows[0]?.stripe_customer_id;
    if (!customerId)
      return res.status(400).json({ error: 'No billing account found. Subscribe to a plan first.' });

    const appUrl  = process.env.APP_URL || 'http://localhost:5173';
    const session = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: `${appUrl}/billing`,
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
