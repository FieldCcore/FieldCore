const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const stripe  = require('stripe')((process.env.STRIPE_SECRET_KEY || '').trim());
const { requireAuth, requireRole } = require('../middleware/auth');

const APP_URL = (process.env.APP_URL || 'https://www.getfieldcore.com').replace(/\/$/, '');

async function verifyOwnerAccess(userId, entityId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM users u
     LEFT JOIN account_memberships am ON am.account_id = $2 AND am.user_id = $1 AND am.role = 'owner'
     WHERE u.id = $1 AND (u.account_id = $2 OR am.user_id IS NOT NULL)`,
    [userId, entityId]
  );
  return rows.length > 0;
}

// POST /api/connect/onboard — start Stripe Express onboarding for an entity
router.post('/onboard', requireAuth, requireRole('owner'), async (req, res) => {
  const { entity_id } = req.body;
  if (!entity_id) return res.status(400).json({ error: 'entity_id is required.' });

  const ok = await verifyOwnerAccess(req.userId, entity_id);
  if (!ok) return res.status(403).json({ error: 'Access denied.' });

  try {
    const { rows } = await pool.query(
      `SELECT id, name, stripe_connect_account_id FROM accounts WHERE id = $1`,
      [entity_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Entity not found.' });
    const entity = rows[0];

    let connectAccountId = entity.stripe_connect_account_id;

    if (!connectAccountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        capabilities: {
          card_payments: { requested: true },
          transfers:     { requested: true },
        },
        metadata: { entity_id: entity.id, entity_name: entity.name },
      });
      connectAccountId = account.id;
      await pool.query(
        `UPDATE accounts SET stripe_connect_account_id = $1, stripe_connect_status = 'pending'
         WHERE id = $2`,
        [connectAccountId, entity_id]
      );
    }

    const accountLink = await stripe.accountLinks.create({
      account:     connectAccountId,
      refresh_url: `${APP_URL}/api/connect/refresh?entity_id=${entity_id}`,
      return_url:  `${APP_URL}/entities?connect=success&entity=${entity_id}`,
      type:        'account_onboarding',
    });

    res.json({ url: accountLink.url });
  } catch (err) {
    console.error('[Connect onboard]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/connect/refresh — regenerate expired Stripe account link (browser redirect from Stripe)
router.get('/refresh', async (req, res) => {
  const { entity_id } = req.query;
  if (!entity_id) return res.redirect(`${APP_URL}/entities`);

  try {
    const { rows } = await pool.query(
      `SELECT stripe_connect_account_id FROM accounts WHERE id = $1`,
      [entity_id]
    );
    if (!rows.length || !rows[0].stripe_connect_account_id) {
      return res.redirect(`${APP_URL}/entities`);
    }

    const accountLink = await stripe.accountLinks.create({
      account:     rows[0].stripe_connect_account_id,
      refresh_url: `${APP_URL}/api/connect/refresh?entity_id=${entity_id}`,
      return_url:  `${APP_URL}/entities?connect=success&entity=${entity_id}`,
      type:        'account_onboarding',
    });

    res.redirect(accountLink.url);
  } catch (err) {
    console.error('[Connect refresh]', err.message);
    res.redirect(`${APP_URL}/entities`);
  }
});

// GET /api/connect/dashboard/:entityId — generate Stripe Express dashboard login link
router.get('/dashboard/:entityId', requireAuth, requireRole('owner'), async (req, res) => {
  const ok = await verifyOwnerAccess(req.userId, req.params.entityId);
  if (!ok) return res.status(403).json({ error: 'Access denied.' });

  try {
    const { rows } = await pool.query(
      `SELECT stripe_connect_account_id, stripe_connect_status FROM accounts WHERE id = $1`,
      [req.params.entityId]
    );
    if (!rows.length || !rows[0].stripe_connect_account_id) {
      return res.status(404).json({ error: 'No connected account found.' });
    }
    if (rows[0].stripe_connect_status !== 'active') {
      return res.status(400).json({ error: 'Account is not fully verified yet.' });
    }

    const loginLink = await stripe.accounts.createLoginLink(rows[0].stripe_connect_account_id);
    res.json({ url: loginLink.url });
  } catch (err) {
    console.error('[Connect dashboard]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
