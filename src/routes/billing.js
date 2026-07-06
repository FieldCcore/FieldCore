const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const stripe  = require('stripe')((process.env.STRIPE_SECRET_KEY || '').trim());
const email   = require('../services/email');
const { requireAuth, requireRole } = require('../middleware/auth');

const PRICE_IDS = {
  solo:  process.env.STRIPE_PRICE_SOLO,
  pro:   process.env.STRIPE_PRICE_PRO,
  scale: process.env.STRIPE_PRICE_SCALE,
};

const PLAN_AMOUNTS = { solo: 49, pro: 99, scale: 199 };

// ── GET /api/billing ──────────────────────────────────────────────────────────
router.get('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT plan, plan_status, stripe_customer_id, stripe_subscription_id,
              stripe_connect_account_id, stripe_connect_status, cancelled_at
       FROM accounts WHERE id = $1`,
      [req.accountId]
    );
    const acct = rows[0] || {};

    let subscription = null;
    let paymentMethod = null;

    if (acct.stripe_subscription_id && process.env.STRIPE_SECRET_KEY) {
      try {
        const sub = await stripe.subscriptions.retrieve(acct.stripe_subscription_id, {
          expand: ['default_payment_method', 'latest_invoice'],
        });
        const pm = sub.default_payment_method || sub.customer?.invoice_settings?.default_payment_method;
        subscription = {
          id:             sub.id,
          status:         sub.status,
          current_period_end:   sub.current_period_end,
          current_period_start: sub.current_period_start,
          cancel_at_period_end: sub.cancel_at_period_end,
          cancel_at:      sub.cancel_at,
          amount:         sub.items.data[0]?.price?.unit_amount / 100 || 0,
        };
        if (pm?.card) {
          paymentMethod = {
            id:    pm.id,
            brand: pm.card.brand,
            last4: pm.card.last4,
            exp_month: pm.card.exp_month,
            exp_year:  pm.card.exp_year,
            type:  'card',
          };
        } else if (pm?.us_bank_account) {
          paymentMethod = {
            id:        pm.id,
            bank_name: pm.us_bank_account.bank_name,
            last4:     pm.us_bank_account.last4,
            type:      'bank_account',
          };
        }
      } catch (stripeErr) {
        console.error('[billing GET] Stripe subscription fetch failed:', stripeErr.message);
      }
    }

    res.json({
      plan:            acct.plan            || 'starter',
      status:          acct.plan_status     || 'active',
      hasSubscription: !!acct.stripe_subscription_id,
      subscription,
      paymentMethod,
      connect: {
        account_id:   acct.stripe_connect_account_id || null,
        status:       acct.stripe_connect_status     || 'not_connected',
        platform_fee: parseFloat(process.env.PLATFORM_FEE_PERCENT || '1'),
      },
      testCheckout: process.env.ENABLE_STRIPE_TEST_TOOLS === 'true',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/billing/history ──────────────────────────────────────────────────
router.get('/history', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT stripe_customer_id FROM accounts WHERE id = $1`, [req.accountId]
    );
    const customerId = rows[0]?.stripe_customer_id;

    // Return local billing events first (fast)
    const { rows: local } = await pool.query(
      `SELECT * FROM billing_events WHERE account_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.accountId]
    );

    // If connected to Stripe, supplement with Stripe invoices
    if (customerId && process.env.STRIPE_SECRET_KEY) {
      try {
        const invoices = await stripe.invoices.list({ customer: customerId, limit: 50 });
        const stripeHistory = invoices.data.map(inv => ({
          id:                   inv.id,
          stripe_invoice_id:    inv.id,
          amount:               inv.amount_paid / 100,
          status:               inv.status === 'paid' ? 'paid' : inv.status,
          description:          inv.lines?.data[0]?.description || 'Subscription',
          payment_method_last4: inv.payment_intent?.payment_method?.card?.last4 || null,
          payment_method_brand: inv.payment_intent?.payment_method?.card?.brand || null,
          invoice_pdf_url:      inv.invoice_pdf,
          period_start:         inv.period_start ? new Date(inv.period_start * 1000) : null,
          period_end:           inv.period_end   ? new Date(inv.period_end   * 1000) : null,
          created_at:           new Date(inv.created * 1000),
        }));
        return res.json(stripeHistory);
      } catch (stripeErr) {
        console.error('[billing/history] Stripe fetch failed:', stripeErr.message);
      }
    }

    res.json(local);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/billing/payment-methods ─────────────────────────────────────────
router.get('/payment-methods', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT stripe_customer_id FROM accounts WHERE id = $1`, [req.accountId]
    );
    const customerId = rows[0]?.stripe_customer_id;
    if (!customerId) return res.json([]);

    const [cards, banks] = await Promise.all([
      stripe.paymentMethods.list({ customer: customerId, type: 'card' }),
      stripe.paymentMethods.list({ customer: customerId, type: 'us_bank_account' }),
    ]);
    const customer = await stripe.customers.retrieve(customerId);
    const defaultPmId = customer.invoice_settings?.default_payment_method;

    const methods = [
      ...cards.data.map(pm => ({
        id:        pm.id,
        type:      'card',
        brand:     pm.card.brand,
        last4:     pm.card.last4,
        exp_month: pm.card.exp_month,
        exp_year:  pm.card.exp_year,
        is_default: pm.id === defaultPmId,
      })),
      ...banks.data.map(pm => ({
        id:          pm.id,
        type:        'bank_account',
        bank_name:   pm.us_bank_account.bank_name,
        last4:       pm.us_bank_account.last4,
        status:      pm.us_bank_account.status || 'new',
        is_default:  pm.id === defaultPmId,
      })),
    ];

    res.json(methods);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/billing/payment-methods/setup ───────────────────────────────────
// Returns a SetupIntent client_secret for Stripe Elements card form
router.post('/payment-methods/setup', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.stripe_customer_id, a.name AS account_name, u.email
       FROM accounts a JOIN users u ON u.id = $1
       WHERE a.id = $2`,
      [req.userId, req.accountId]
    );
    let { stripe_customer_id: customerId, account_name, email: userEmail } = rows[0] || {};

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userEmail, name: account_name,
        metadata: { account_id: req.accountId },
      });
      customerId = customer.id;
      await pool.query(`UPDATE accounts SET stripe_customer_id = $1 WHERE id = $2`, [customerId, req.accountId]);
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      metadata: { account_id: req.accountId },
    });

    res.json({ client_secret: setupIntent.client_secret, customer_id: customerId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/billing/payment-methods/attach ──────────────────────────────────
router.post('/payment-methods/attach', requireAuth, requireRole('owner'), async (req, res) => {
  const { payment_method_id, set_default } = req.body;
  if (!payment_method_id) return res.status(400).json({ error: 'payment_method_id required' });
  try {
    const { rows } = await pool.query(
      `SELECT stripe_customer_id FROM accounts WHERE id = $1`, [req.accountId]
    );
    const customerId = rows[0]?.stripe_customer_id;
    if (!customerId) return res.status(400).json({ error: 'No Stripe customer found.' });

    await stripe.paymentMethods.attach(payment_method_id, { customer: customerId });

    if (set_default !== false) {
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: payment_method_id },
      });
      // Also update subscription default payment method if active subscription
      const { rows: acctRows } = await pool.query(
        `SELECT stripe_subscription_id FROM accounts WHERE id = $1`, [req.accountId]
      );
      if (acctRows[0]?.stripe_subscription_id) {
        await stripe.subscriptions.update(acctRows[0].stripe_subscription_id, {
          default_payment_method: payment_method_id,
        });
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/billing/payment-methods/bank ────────────────────────────────────
// Add bank account via routing + account number (micro-deposit verification)
router.post('/payment-methods/bank', requireAuth, requireRole('owner'), async (req, res) => {
  const { routing_number, account_number, account_holder_name, account_type } = req.body;
  if (!routing_number || !account_number || !account_holder_name) {
    return res.status(400).json({ error: 'routing_number, account_number, and account_holder_name are required.' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT a.stripe_customer_id, a.name AS account_name, u.email
       FROM accounts a JOIN users u ON u.id = $1 WHERE a.id = $2`,
      [req.userId, req.accountId]
    );
    let { stripe_customer_id: customerId, account_name, email: userEmail } = rows[0] || {};

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userEmail, name: account_name,
        metadata: { account_id: req.accountId },
      });
      customerId = customer.id;
      await pool.query(`UPDATE accounts SET stripe_customer_id = $1 WHERE id = $2`, [customerId, req.accountId]);
    }

    const token = await stripe.tokens.create({
      bank_account: {
        country:              'US',
        currency:             'usd',
        account_holder_name,
        account_holder_type:  account_type || 'individual',
        routing_number,
        account_number,
      },
    });

    const bankAccount = await stripe.customers.createSource(customerId, { source: token.id });
    res.json({
      ok:             true,
      bank_account_id: bankAccount.id,
      bank_name:      bankAccount.bank_name,
      last4:          bankAccount.last4,
      status:         bankAccount.status,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/billing/payment-methods/:id/default ────────────────────────────
router.post('/payment-methods/:id/default', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT stripe_customer_id, stripe_subscription_id FROM accounts WHERE id = $1`, [req.accountId]
    );
    const { stripe_customer_id: customerId, stripe_subscription_id: subId } = rows[0] || {};
    if (!customerId) return res.status(400).json({ error: 'No Stripe customer found.' });

    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: req.params.id },
    });
    if (subId) {
      await stripe.subscriptions.update(subId, { default_payment_method: req.params.id });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/billing/payment-methods/:id ───────────────────────────────────
router.delete('/payment-methods/:id', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    await stripe.paymentMethods.detach(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/billing/checkout — Stripe Checkout session (subscription) ────────
router.post('/checkout', requireAuth, requireRole('owner'), async (req, res) => {
  const { plan } = req.body;
  const priceId  = PRICE_IDS[plan];

  console.log('=== STRIPE CHECKOUT START ===');
  console.log({ plan, accountId: req.accountId, hasPriceId: !!priceId });

  if (!['solo', 'pro', 'scale'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan. Must be solo, pro, or scale.' });
  }
  if (!priceId) {
    return res.status(500).json({ error: `STRIPE_PRICE_${plan.toUpperCase()} is not configured on the server.` });
  }

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
      await pool.query(`UPDATE accounts SET stripe_customer_id = $1 WHERE id = $2`, [customerId, req.accountId]);
    }
    console.log({ customerId, isNew: !row.stripe_customer_id });

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

    console.log('=== STRIPE CHECKOUT OK ===');
    console.log({ plan, hasUrl: !!session.url });

    if (!session.url) {
      return res.status(500).json({ error: 'Stripe session created but no checkout URL was returned.' });
    }

    res.json({ url: session.url });
  } catch (err) {
    console.error('=== STRIPE CHECKOUT ERROR ===');
    console.error({ type: err.type, code: err.code, message: err.message, statusCode: err.statusCode, param: err.param });
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/billing/cancel ──────────────────────────────────────────────────
router.post('/cancel', requireAuth, requireRole('owner'), async (req, res) => {
  const { reason, additional_feedback } = req.body;
  try {
    const { rows } = await pool.query(
      `SELECT a.stripe_subscription_id, a.stripe_customer_id, a.name,
              u.email AS owner_email, u.name AS owner_name
       FROM accounts a JOIN users u ON u.account_id = a.id AND u.role = 'owner'
       WHERE a.id = $1`,
      [req.accountId]
    );
    const acct = rows[0];
    if (!acct?.stripe_subscription_id) {
      return res.status(400).json({ error: 'No active subscription to cancel.' });
    }

    // Cancel at period end (not immediate)
    const sub = await stripe.subscriptions.update(acct.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    const accessEndsAt = new Date(sub.current_period_end * 1000);

    // Record reason
    await pool.query(
      `INSERT INTO cancel_reasons (account_id, reason, additional_feedback)
       VALUES ($1,$2,$3)`,
      [req.accountId, reason || null, additional_feedback || null]
    );

    await pool.query(
      `UPDATE accounts SET cancel_reason = $1, cancelled_at = NOW() WHERE id = $2`,
      [reason || null, req.accountId]
    );

    // Email operator confirmation
    if (acct.owner_email) {
      email.send({
        to:      acct.owner_email,
        subject: 'Your FieldCore subscription has been cancelled',
        html:    email.billingCancelledHtml(acct.owner_name || acct.name, accessEndsAt),
      }).catch(err => console.error('[billing cancel email]', err.message));
    }

    // Notify admin
    email.send({
      to:      (process.env.ADMIN_EMAILS || 'admin@getfieldcore.com').split(',')[0].trim(),
      subject: `Operator cancelled — ${acct.name}`,
      html:    email.wrap(`
        <p><strong>${acct.name}</strong> (${acct.owner_email}) has cancelled their FieldCore subscription.</p>
        <p><strong>Reason:</strong> ${reason || 'Not provided'}</p>
        <p><strong>Feedback:</strong> ${additional_feedback || 'None'}</p>
        <p><strong>Access ends:</strong> ${accessEndsAt.toLocaleDateString('en-US', { dateStyle: 'long' })}</p>
      `),
    }).catch(err => console.error('[billing cancel admin email]', err.message));

    res.json({ ok: true, access_ends_at: accessEndsAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/billing/portal — Stripe Customer Portal ────────────────────────
router.post('/portal', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT stripe_customer_id FROM accounts WHERE id = $1`, [req.accountId]
    );
    const customerId = rows[0]?.stripe_customer_id;
    if (!customerId) return res.status(400).json({ error: 'No billing account found. Subscribe to a plan first.' });

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

// ── POST /api/billing/connect ─────────────────────────────────────────────────
router.post('/connect', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT stripe_connect_account_id FROM accounts WHERE id = $1`, [req.accountId]
    );
    let connectId = rows[0]?.stripe_connect_account_id;

    if (!connectId) {
      const account = await stripe.accounts.create({
        type:     'express',
        metadata: { account_id: req.accountId },
      });
      connectId = account.id;
      await pool.query(
        `UPDATE accounts SET stripe_connect_account_id = $1, stripe_connect_status = 'pending' WHERE id = $2`,
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

// ── POST /api/billing/connect/account-session ─────────────────────────────────
router.post('/connect/account-session', requireAuth, requireRole('owner'), async (req, res) => {
  const secretKey = (process.env.STRIPE_SECRET_KEY || '').trim();
  const stripeKeyMode = secretKey.startsWith('sk_test') ? 'test'
                      : secretKey.startsWith('sk_live') ? 'live'
                      : 'unknown';

  console.log('=== CONNECT ACCOUNT-SESSION START ===');
  console.log({
    accountId:      req.accountId,
    hasStripeSecret: !!secretKey,
    stripeKeyMode,
    hasAppUrl:      !!process.env.APP_URL,
  });

  try {
    const { rows } = await pool.query(
      `SELECT stripe_connect_account_id, stripe_connect_status FROM accounts WHERE id = $1`,
      [req.accountId]
    );
    const row = rows[0];
    let connectId = row?.stripe_connect_account_id;

    console.log({
      storedConnectAccountId: connectId || null,
      stripeConnectStatus:    row?.stripe_connect_status || null,
    });

    if (!connectId) {
      const account = await stripe.accounts.create({
        type:     'express',
        metadata: { account_id: req.accountId },
      });
      connectId = account.id;
      console.log('  created connect account:', connectId);
      await pool.query(
        `UPDATE accounts SET stripe_connect_account_id = $1, stripe_connect_status = 'pending' WHERE id = $2`,
        [connectId, req.accountId]
      );
    }

    const sessionParams = {
      account:    connectId,
      components: { account_onboarding: { enabled: true } },
    };
    console.log('  accountSessions.create params:', JSON.stringify(sessionParams));

    const accountSession = await stripe.accountSessions.create(sessionParams);

    if (!accountSession.client_secret) {
      console.error('=== STRIPE CONNECT ERROR: client_secret missing from accountSessions.create response ===');
      return res.status(500).json({ error: 'Missing Stripe account session client_secret' });
    }

    console.log('=== CONNECT ACCOUNT-SESSION OK ===', {
      sessionId:          accountSession.id,
      connectId,
      hasClientSecret:    true,
    });

    res.json({
      client_secret: accountSession.client_secret,
      account_id:    connectId,
      key_mode:      stripeKeyMode,
    });
  } catch (err) {
    console.error('=== STRIPE CONNECT ERROR ===');
    console.error({
      where:      'connect/account-session',
      type:       err.type,
      code:       err.code,
      message:    err.message,
      param:      err.param,
      statusCode: err.statusCode,
      requestId:  err.requestId,
      raw:        err.raw,
      stack:      err.stack,
    });
    res.status(err.statusCode || 500).json({
      error: err.message || 'Stripe Connect account session failed',
      code:  err.code  || null,
      type:  err.type  || null,
      param: err.param || null,
    });
  }
});

// ── POST /api/billing/connect/login ──────────────────────────────────────────
router.post('/connect/login', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT stripe_connect_account_id, stripe_connect_status FROM accounts WHERE id = $1`,
      [req.accountId]
    );
    const { stripe_connect_account_id: connectId, stripe_connect_status: status } = rows[0] || {};
    if (!connectId) return res.status(400).json({ error: 'No connected Stripe account.' });
    if (status !== 'active') return res.status(400).json({ error: 'Account is not yet verified by Stripe.' });

    const link = await stripe.accounts.createLoginLink(connectId);
    res.json({ url: link.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/billing/connect/payout-schedule ─────────────────────────────────
router.get('/connect/payout-schedule', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT stripe_connect_account_id, stripe_connect_status FROM accounts WHERE id = $1`,
      [req.accountId]
    );
    const { stripe_connect_account_id: connectId, stripe_connect_status: status } = rows[0] || {};
    if (!connectId || status !== 'active') return res.json({ interval: 'daily', available: false });
    const account = await stripe.accounts.retrieve(connectId);
    const schedule = account.settings?.payouts?.schedule || {};
    res.json({ interval: schedule.interval || 'daily', available: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/billing/connect/payout-schedule ─────────────────────────────────
router.post('/connect/payout-schedule', requireAuth, requireRole('owner'), async (req, res) => {
  const { interval } = req.body;
  if (!['daily', 'weekly', 'monthly', 'manual'].includes(interval)) {
    return res.status(400).json({ error: 'interval must be daily, weekly, monthly, or manual.' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT stripe_connect_account_id, stripe_connect_status FROM accounts WHERE id = $1`,
      [req.accountId]
    );
    const { stripe_connect_account_id: connectId, stripe_connect_status: status } = rows[0] || {};
    if (!connectId) return res.status(400).json({ error: 'No connected Stripe account.' });
    if (status !== 'active') return res.status(400).json({ error: 'Stripe account not yet verified.' });
    const schedule = { interval };
    if (interval === 'weekly')  schedule.weekly_anchor  = 'monday';
    if (interval === 'monthly') schedule.monthly_anchor = 1;
    await stripe.accounts.update(connectId, { settings: { payouts: { schedule } } });
    res.json({ ok: true, interval });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── GET /api/billing/connect/dashboard ───────────────────────────────────────
router.get('/connect/dashboard', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT stripe_connect_account_id, stripe_connect_status FROM accounts WHERE id = $1`,
      [req.accountId]
    );
    const { stripe_connect_account_id: connectId, stripe_connect_status: dbStatus } = rows[0] || {};

    if (!connectId) {
      return res.json({ connected: false, status: 'not_connected' });
    }

    const account = await stripe.accounts.retrieve(connectId);
    const capabilities = account.capabilities || {};
    const requirements = account.requirements || {};
    const payoutSchedule = account.settings?.payouts?.schedule || {};

    // Derive live status from Stripe — never trust the stale DB column alone.
    // active = Stripe has submitted details AND enabled charges (no past-due blocks).
    const pastDue = requirements.past_due || [];
    const liveStatus = (account.details_submitted && account.charges_enabled && pastDue.length === 0)
      ? 'active' : 'pending';

    // Auto-heal the DB if webhook missed or fired with wrong logic.
    if (liveStatus !== dbStatus) {
      await pool.query(
        `UPDATE accounts SET stripe_connect_status = $1 WHERE stripe_connect_account_id = $2`,
        [liveStatus, connectId]
      );
    }

    let balance       = null;
    let recentPayouts = [];
    let pendingPayouts = [];
    let bankAccount   = null;

    if (liveStatus === 'active') {
      const [balRes, payRes, extRes] = await Promise.all([
        stripe.balance.retrieve({ stripeAccount: connectId }),
        stripe.payouts.list({ limit: 10 }, { stripeAccount: connectId }),
        stripe.accounts.listExternalAccounts(connectId, { object: 'bank_account', limit: 1 }),
      ]);
      balance = { available: balRes.available, pending: balRes.pending };

      const mapPayout = p => ({
        id:           p.id,
        amount:       p.amount,
        currency:     p.currency,
        arrival_date: p.arrival_date,
        created:      p.created,
        status:       p.status,
        method:       p.method,
        description:  p.description,
      });
      recentPayouts  = payRes.data.map(mapPayout);
      pendingPayouts = recentPayouts.filter(p => p.status === 'pending' || p.status === 'in_transit');

      const ba = extRes.data[0];
      if (ba) bankAccount = { bank_name: ba.bank_name, last4: ba.last4, routing_number: ba.routing_number, currency: ba.currency };
    }

    res.json({
      connected: true,
      status: liveStatus,
      account_id: connectId,
      details_submitted: account.details_submitted ?? false,
      charges_enabled:   account.charges_enabled   ?? false,
      payouts_enabled:   account.payouts_enabled    ?? false,
      display_name: account.business_profile?.name || account.settings?.dashboard?.display_name || null,
      country: account.country,
      email:   account.email,
      capabilities,
      requirements: {
        currently_due:        requirements.currently_due        || [],
        eventually_due:       requirements.eventually_due       || [],
        past_due:             requirements.past_due             || [],
        pending_verification: requirements.pending_verification || [],
        disabled_reason:      requirements.disabled_reason      || null,
        errors:               requirements.errors               || [],
      },
      balance,
      recent_payouts:  recentPayouts,
      pending_payouts: pendingPayouts,
      bank_account:    bankAccount,
      payout_schedule: payoutSchedule,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── POST /api/billing/connect/login-link ─────────────────────────────────────
router.post('/connect/login-link', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT stripe_connect_account_id, stripe_connect_status FROM accounts WHERE id = $1`,
      [req.accountId]
    );
    const { stripe_connect_account_id: connectId } = rows[0] || {};
    if (!connectId) return res.status(400).json({ error: 'No connected Stripe account.' });

    const secretKey = (process.env.STRIPE_SECRET_KEY || '').trim();
    if (secretKey.startsWith('sk_test')) {
      return res.json({ url: null, test_mode: true });
    }

    const link = await stripe.accounts.createLoginLink(connectId);
    res.json({ url: link.url, test_mode: false });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── GET /api/billing/admin-metrics ───────────────────────────────────────────
router.get('/admin-metrics', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    // Only the FieldCore admin account can see platform-wide metrics
    const { rows: [acct] } = await pool.query(
      `SELECT u.email FROM users u WHERE u.id = $1`, [req.userId]
    );
    const adminEmails = (process.env.ADMIN_EMAILS || 'admin@getfieldcore.com').split(',').map(e => e.trim());
    if (!adminEmails.includes(acct?.email)) {
      return res.status(403).json({ error: 'Admin access only.' });
    }

    const { rows: metrics } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE plan != 'starter' AND plan_status = 'active')        AS active_subscriptions,
        COUNT(*) FILTER (WHERE plan_status = 'past_due')                            AS past_due,
        COUNT(*) FILTER (WHERE cancelled_at IS NOT NULL)                            AS total_cancelled,
        COUNT(*) FILTER (WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())) AS new_this_month,
        SUM(CASE WHEN plan = 'solo'  AND plan_status = 'active' THEN 49
                 WHEN plan = 'pro'   AND plan_status = 'active' THEN 99
                 WHEN plan = 'scale' AND plan_status = 'active' THEN 199
                 ELSE 0 END)                                                         AS mrr
      FROM accounts
    `);

    res.json(metrics[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/billing/test-tools-status ───────────────────────────────────────
router.get('/test-tools-status', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT plan FROM accounts WHERE id = $1`,
      [req.accountId]
    );
    res.json({
      enabled:     process.env.ENABLE_STRIPE_TEST_TOOLS === 'true',
      isOwner:     req.userRole === 'owner',
      accountPlan: rows[0]?.plan || 'starter',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/billing/test-checkout — internal test tool only ────────────────
router.post('/test-checkout', requireAuth, requireRole('owner'), async (req, res) => {
  if (process.env.ENABLE_STRIPE_TEST_TOOLS !== 'true') {
    return res.status(403).json({ error: 'Test tools are not enabled.' });
  }

  const { plan } = req.body;
  if (plan !== 'pro' && plan !== 'scale') {
    return res.status(400).json({ error: 'Test checkout only supports pro or scale.' });
  }

  const priceId = PRICE_IDS[plan];
  if (!priceId) {
    return res.status(400).json({ error: `STRIPE_PRICE_${plan.toUpperCase()} is not configured.` });
  }

  try {
    const { rows } = await pool.query(
      `SELECT a.stripe_customer_id, a.name AS account_name, u.email, u.name AS user_name
       FROM accounts a JOIN users u ON u.id = $1
       WHERE a.id = $2`,
      [req.userId, req.accountId]
    );
    const row = rows[0];

    let customerId = row?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email:    row.email,
        name:     row.account_name,
        metadata: { account_id: req.accountId },
      });
      customerId = customer.id;
      await pool.query(`UPDATE accounts SET stripe_customer_id = $1 WHERE id = $2`, [customerId, req.accountId]);
    }

    console.log(`[test-checkout] account_id=${req.accountId} plan=${plan}`);

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

module.exports = router;
