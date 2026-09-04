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

// POST /api/payments/charge — charge card on file (charges remaining balance)
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

    // Charge the remaining balance, not the full original amount
    const chargeAmount = parseFloat(invoice.balance ?? invoice.amount);
    if (chargeAmount <= 0) return res.status(400).json({ error: 'No remaining balance to charge' });

    const stripeCustomerId = clientResult.rows[0]?.stripe_customer_id;

    const paymentIntent = await stripe.paymentIntents.create({
      amount:               Math.round(chargeAmount * 100),
      currency:             'usd',
      payment_method:       payment_method_id,
      customer:             stripeCustomerId || undefined,
      confirm:              true,
      off_session:          true,
      payment_method_types: ['card'],
      metadata:             { invoice_id, account_id: req.accountId },
    });

    const paymentDate = new Date().toISOString().slice(0, 10);

    // Canonical payment + allocation records
    const payRes = await pool.query(
      `INSERT INTO payments (account_id, client_id, amount, method, payment_date, provider_transaction_id, created_by)
       VALUES ($1, $2, $3, 'CARD', $4, $5, $6)
       RETURNING id`,
      [req.accountId, invoice.client_id, chargeAmount, paymentDate, paymentIntent.id, req.userId]
    );
    const paymentId = payRes.rows[0].id;

    await pool.query(
      `INSERT INTO payment_allocations (payment_id, invoice_id, account_id, amount)
       VALUES ($1, $2, $3, $4)`,
      [paymentId, invoice_id, req.accountId, chargeAmount]
    );

    await pool.query(
      `UPDATE invoices SET status = 'paid', balance = 0, stripe_payment_intent_id = $1
       WHERE id = $2 AND account_id = $3`,
      [paymentIntent.id, invoice_id, req.accountId]
    );

    await pool.query(
      `UPDATE clients SET ltv = ltv + $1 WHERE id = $2 AND account_id = $3`,
      [chargeAmount, invoice.client_id, req.accountId]
    );

    res.json({ status: paymentIntent.status, payment_intent_id: paymentIntent.id, payment_id: paymentId });
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
      `UPDATE clients SET card_on_file = TRUE, stripe_customer_id = $1, stripe_payment_method_id = $2 WHERE id = $3 AND account_id = $4`,
      [stripeCustomerId, payment_method_id, client_id, req.accountId]
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
      `SELECT i.*, c.name AS client_name, c.email AS client_email,
              COALESCE(j.service_type, i.subject, 'Service') AS service_type
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
       LEFT JOIN jobs j ON j.id = i.job_id
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

// GET /api/payments/outstanding?client_id=X — outstanding invoices for workspace
router.get('/outstanding', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { client_id } = req.query;
  if (!client_id) return res.status(400).json({ error: 'client_id is required' });
  try {
    const { rows } = await pool.query(
      `SELECT
         i.id,
         i.invoice_number,
         i.amount,
         COALESCE(i.balance, i.amount)                              AS balance,
         i.status,
         i.due_date,
         i.created_at,
         COALESCE(j.service_address, c.address)                    AS service_address,
         c.address  AS client_address,
         c.city     AS client_city,
         c.state    AS client_state,
         c.zip      AS client_zip,
         c.name     AS client_name
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
       LEFT JOIN jobs j ON j.id = i.job_id
       WHERE i.account_id = $1
         AND i.client_id  = $2
         AND i.status IN ('pending','partially_paid')
       ORDER BY i.due_date ASC NULLS LAST, i.created_at DESC`,
      [req.accountId, client_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments — record a payment and allocate across invoices
// Body: { client_id, method, payment_date, reference, note, allocations: [{invoice_id, amount}] }
router.post('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const VALID_METHODS = ['CARD','ACH','CASH','CHECK','CASHAPP','PAYPAL','VENMO','ZELLE','EXTERNAL_CARD','EXTERNAL_ACH','OTHER'];
  const { client_id, method, payment_date, reference = '', note = '', allocations = [] } = req.body;

  if (!client_id) return res.status(400).json({ error: 'client_id is required' });
  if (!method || !VALID_METHODS.includes(method)) {
    return res.status(400).json({ error: `method must be one of: ${VALID_METHODS.join(', ')}` });
  }
  if (!Array.isArray(allocations) || allocations.length === 0) {
    return res.status(400).json({ error: 'allocations must be a non-empty array' });
  }

  const EXTERNAL_REF_REQUIRED = ['CASHAPP','PAYPAL','VENMO','ZELLE'];
  if (EXTERNAL_REF_REQUIRED.includes(method) && !reference.trim()) {
    return res.status(400).json({ error: `reference is required for ${method}` });
  }

  const totalAmount = allocations.reduce((s, a) => s + parseFloat(a.amount || 0), 0);
  if (totalAmount <= 0) return res.status(400).json({ error: 'total payment amount must be > 0' });

  const paymentDate = payment_date || new Date().toISOString().slice(0, 10);
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    // Verify client belongs to this account
    const clientRes = await dbClient.query(
      `SELECT id FROM clients WHERE id = $1 AND account_id = $2`,
      [client_id, req.accountId]
    );
    if (!clientRes.rows.length) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ error: 'Client not found' });
    }

    // Verify all invoices belong to this client and account — FOR UPDATE prevents
    // concurrent requests from both reading the same stale balance and both passing
    // overapplication validation before either commits.
    const invoiceIds = allocations.map(a => a.invoice_id);
    const invRes = await dbClient.query(
      `SELECT id, amount, COALESCE(balance, amount) AS balance, status
       FROM invoices
       WHERE id = ANY($1) AND account_id = $2 AND client_id = $3
       FOR UPDATE`,
      [invoiceIds, req.accountId, client_id]
    );
    if (invRes.rows.length !== invoiceIds.length) {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ error: 'One or more invoices not found or do not belong to this client' });
    }

    // Check invoices are eligible (pending or partially_paid)
    const ineligible = invRes.rows.filter(r => !['pending','partially_paid'].includes(r.status));
    if (ineligible.length) {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ error: 'One or more invoices are not eligible for payment (paid or void)' });
    }

    // Validate allocation amounts do not exceed remaining balance
    const invMap = Object.fromEntries(invRes.rows.map(r => [r.id, r]));
    for (const a of allocations) {
      const inv = invMap[a.invoice_id];
      if (!inv) continue;
      const alloc = parseFloat(a.amount);
      if (alloc <= 0) {
        await dbClient.query('ROLLBACK');
        return res.status(400).json({ error: `Allocation amount must be > 0 for invoice ${a.invoice_id}` });
      }
      if (alloc > parseFloat(inv.balance) + 0.001) {
        await dbClient.query('ROLLBACK');
        return res.status(400).json({ error: `Allocation $${alloc} exceeds remaining balance $${inv.balance} for invoice ${inv.id}` });
      }
    }

    // Insert payment record
    const payRes = await dbClient.query(
      `INSERT INTO payments (account_id, client_id, amount, method, payment_date, reference, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [req.accountId, client_id, totalAmount, method, paymentDate,
       reference.trim() || null, note.trim() || null, req.userId]
    );
    const paymentId = payRes.rows[0].id;

    // Insert allocations and update invoice balances/statuses
    const updatedInvoices = [];
    for (const a of allocations) {
      const alloc = parseFloat(a.amount);
      const inv = invMap[a.invoice_id];
      const newBalance = Math.max(0, parseFloat(inv.balance) - alloc);
      const newStatus = newBalance <= 0.001 ? 'paid' : 'partially_paid';
      const paidAt = newStatus === 'paid' ? new Date().toISOString() : null;

      await dbClient.query(
        `INSERT INTO payment_allocations (payment_id, invoice_id, account_id, amount)
         VALUES ($1, $2, $3, $4)`,
        [paymentId, a.invoice_id, req.accountId, alloc]
      );

      const updRes = await dbClient.query(
        `UPDATE invoices
         SET balance      = $1,
             status       = $2,
             paid_at      = COALESCE(paid_at, $3),
             paid_method  = COALESCE(paid_method, $4),
             payment_note = COALESCE(payment_note, $5)
         WHERE id = $6 AND account_id = $7
         RETURNING *`,
        [newBalance, newStatus, paidAt, method, note.trim() || null, a.invoice_id, req.accountId]
      );

      if (newStatus === 'paid') {
        await dbClient.query(
          `UPDATE clients SET ltv = ltv + $1 WHERE id = $2 AND account_id = $3`,
          [alloc, client_id, req.accountId]
        );
      }
      updatedInvoices.push(updRes.rows[0]);
    }

    await dbClient.query('COMMIT');
    res.json({ payment_id: paymentId, invoices: updatedInvoices });
  } catch (err) {
    await dbClient.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

// POST /api/payments/:id/refund — partial or full refund of a recorded payment
router.post('/:id/refund', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { amount, reason = '' } = req.body;
  const refundAmt = parseFloat(amount);
  if (!refundAmt || refundAmt <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    // Lock the payment to prevent concurrent refunds
    const { rows: payRows } = await dbClient.query(
      `SELECT * FROM payments WHERE id = $1 AND account_id = $2 FOR UPDATE`,
      [req.params.id, req.accountId]
    );
    if (!payRows.length) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ error: 'Payment not found' });
    }
    const payment = payRows[0];

    // Total already refunded for this payment
    const { rows: [refRow] } = await dbClient.query(
      `SELECT COALESCE(SUM(amount), 0) AS already_refunded FROM payment_refunds WHERE payment_id = $1`,
      [payment.id]
    );
    const alreadyRefunded = parseFloat(refRow.already_refunded);
    const refundable = parseFloat(payment.amount) - alreadyRefunded;

    if (refundAmt > refundable + 0.001) {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({
        error: `Refund $${refundAmt.toFixed(2)} exceeds refundable balance $${refundable.toFixed(2)}`,
      });
    }

    // Issue Stripe refund if this was a card payment with a provider transaction ID
    let providerRefundId = null;
    if (payment.provider_transaction_id && payment.method === 'CARD') {
      try {
        const stripeRefund = await stripe.refunds.create({
          payment_intent: payment.provider_transaction_id,
          amount:         Math.round(refundAmt * 100),
        });
        providerRefundId = stripeRefund.id;
      } catch (stripeErr) {
        await dbClient.query('ROLLBACK');
        return res.status(502).json({ error: `Stripe refund failed: ${stripeErr.message}` });
      }
    }

    // Record the canonical refund event
    const { rows: [refundRow] } = await dbClient.query(
      `INSERT INTO payment_refunds (payment_id, account_id, amount, reason, provider_refund_id, refunded_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [payment.id, req.accountId, refundAmt, reason.trim() || null, providerRefundId, req.userId]
    );
    const refundId = refundRow.id;

    // Get payment allocations to distribute refund proportionally across invoices
    const { rows: allocRows } = await dbClient.query(
      `SELECT invoice_id, amount AS allocated_amount FROM payment_allocations WHERE payment_id = $1`,
      [payment.id]
    );

    const totalAllocated = allocRows.reduce((s, r) => s + parseFloat(r.allocated_amount), 0);
    const updatedInvoices = [];

    for (const alloc of allocRows) {
      const ratio = totalAllocated > 0 ? parseFloat(alloc.allocated_amount) / totalAllocated : 1;
      const invoiceRefundAmt = Math.round(refundAmt * ratio * 100) / 100;

      const { rows: invRows } = await dbClient.query(
        `SELECT id, amount, COALESCE(balance, 0) AS balance, status, client_id
         FROM invoices WHERE id = $1 AND account_id = $2 FOR UPDATE`,
        [alloc.invoice_id, req.accountId]
      );
      if (!invRows.length) continue;
      const inv = invRows[0];
      const prevPaid = inv.status === 'paid';

      const newBalance = Math.min(parseFloat(inv.amount), parseFloat(inv.balance) + invoiceRefundAmt);
      const newStatus  = newBalance <= 0.001       ? 'paid'
                       : newBalance >= parseFloat(inv.amount) - 0.001 ? 'pending'
                       : 'partially_paid';

      const { rows: [updated] } = await dbClient.query(
        `UPDATE invoices SET balance = $1, status = $2 WHERE id = $3 AND account_id = $4 RETURNING *`,
        [newBalance, newStatus, alloc.invoice_id, req.accountId]
      );

      // Reverse LTV if invoice moved out of paid status
      if (prevPaid && newStatus !== 'paid') {
        await dbClient.query(
          `UPDATE clients SET ltv = GREATEST(0, ltv - $1) WHERE id = $2 AND account_id = $3`,
          [invoiceRefundAmt, inv.client_id, req.accountId]
        );
      }
      updatedInvoices.push(updated);
    }

    await dbClient.query('COMMIT');
    res.json({ refund_id: refundId, payment_id: payment.id, amount_refunded: refundAmt, invoices: updatedInvoices });
  } catch (err) {
    await dbClient.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

module.exports = router;
