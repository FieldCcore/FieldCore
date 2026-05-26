const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { requireAuth, requireRole } = require('../middleware/auth');

const PRICE_IDS = {
  growth: process.env.STRIPE_PRICE_GROWTH,
  scale:  process.env.STRIPE_PRICE_SCALE,
};

// GET /api/billing — current plan, status, subscription presence, connect status
router.get('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT plan, plan_status, stripe_customer_id, stripe_subscription_id,
              stripe_connect_account_id, stripe_connect_status
       FROM accounts WHERE id = $1`,
      [req.accountId]
    );
    const acct = rows[0] || {};
    res.json({
      plan:            acct.plan            || 'starter',
      status:          acct.plan_status     || 'active',
      hasSubscription: !!acct.stripe_subscription_id,
      connect: {
        account_id:   acct.stripe_connect_account_id || null,
        status:       acct.stripe_connect_status     || 'not_connected',
        platform_fee: parseFloat(process.env.PLATFORM_FEE_PERCENT || '1'),
      },
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

// POST /api/billing/connect — create Express account (or refresh onboarding link)
router.post('/connect', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT stripe_connect_account_id FROM accounts WHERE id = $1`,
      [req.accountId]
    );
    let connectId = rows[0]?.stripe_connect_account_id;

    if (!connectId) {
      const account = await stripe.accounts.create({
        type:     'express',
        metadata: { account_id: req.accountId },
      });
      connectId = account.id;
      await pool.query(
        `UPDATE accounts
         SET stripe_connect_account_id = $1, stripe_connect_status = 'pending'
         WHERE id = $2`,
        [connectId, req.accountId]
      );
    }

    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    const link = await stripe.accountLinks.create({
      account:     connectId,
      refresh_url: `${appUrl}/billing?connect=refresh`,
      return_url:  `${appUrl}/billing?connect=success`,
      type:        'account_onboarding',
    });

    res.json({ url: link.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/billing/connect/login — Stripe Express dashboard link
router.post('/connect/login', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT stripe_connect_account_id, stripe_connect_status FROM accounts WHERE id = $1`,
      [req.accountId]
    );
    const connectId = rows[0]?.stripe_connect_account_id;
    const status    = rows[0]?.stripe_connect_status;

    if (!connectId)
      return res.status(400).json({ error: 'No connected Stripe account.' });
    if (status !== 'active')
      return res.status(400).json({ error: 'Account is not yet verified by Stripe.' });

    const link = await stripe.accounts.createLoginLink(connectId);
    res.json({ url: link.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
