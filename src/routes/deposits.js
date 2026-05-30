const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const stripe  = require('stripe')((process.env.STRIPE_SECRET_KEY || '').trim());
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/deposits
router.get('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, c.name AS client_name, j.service_type
       FROM deposits d
       JOIN clients c ON c.id = d.client_id
       JOIN jobs j ON j.id = d.job_id
       WHERE d.account_id = $1
       ORDER BY d.created_at DESC`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/deposits/:id/retain — manually retain a deposit (no-show)
router.patch('/:id/retain', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE deposits SET status = 'collected'
       WHERE id = $1 AND account_id = $2 RETURNING *`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/deposits/:id/refund
router.patch('/:id/refund', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM deposits WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const deposit = rows[0];

    // Issue Stripe refund if deposit was charged
    if (process.env.STRIPE_SECRET_KEY && deposit.status === 'collected' &&
        (deposit.stripe_charge_id || deposit.stripe_payment_intent_id)) {
      const refundParams = deposit.stripe_charge_id
        ? { charge: deposit.stripe_charge_id }
        : { payment_intent: deposit.stripe_payment_intent_id };
      try {
        await stripe.refunds.create(refundParams);
      } catch (stripeErr) {
        return res.status(502).json({ error: `Stripe refund failed: ${stripeErr.message}` });
      }
    }

    const { rows: updated } = await pool.query(
      `UPDATE deposits SET status = 'refunded', refunded_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
