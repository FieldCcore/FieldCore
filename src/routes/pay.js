'use strict';
const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const stripe  = require('stripe')((process.env.STRIPE_SECRET_KEY || '').trim());

const PLATFORM_FEE = parseFloat(process.env.PLATFORM_FEE_PERCENT || '1') / 100;

// GET /api/pay/:invoiceId — public invoice details (no auth)
// Returns comprehensive data for the customer-facing invoice page.
router.get('/:invoiceId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         i.id, i.invoice_number, i.subject, i.status, i.source_type,
         i.amount, i.tax_amount, i.subtotal, i.balance,
         i.discount_type, i.discount_value, i.discount_label, i.discount_amount,
         i.line_items, i.client_message, i.terms,
         i.issued_date, i.due_date,
         i.source_agreement_id, i.agreement_period_id,

         c.name    AS client_name,
         c.email   AS client_email,
         c.phone   AS client_phone,
         c.address AS client_address,
         c.city    AS client_city,
         c.state   AS client_state,
         c.zip     AS client_zip,

         a.name    AS business_name,
         bp.phone  AS business_phone,
         bp.address AS business_address,
         bp.city   AS business_city,
         bp.state  AS business_state,
         bp.zip    AS business_zip,
         bp.logo_url AS business_logo_url,

         j.service_type, j.scheduled_at,

         ra.name              AS agreement_name,
         ra.billing_cadence   AS agreement_billing_cadence,

         aip.period_start, aip.period_end,

         COALESCE(bs.accept_card, TRUE)  AS accept_card,
         COALESCE(bs.accept_ach,  FALSE) AS accept_ach
       FROM invoices i
       JOIN clients  c   ON c.id   = i.client_id
       JOIN accounts a   ON a.id   = i.account_id
       LEFT JOIN business_profiles       bp  ON bp.account_id  = i.account_id
       LEFT JOIN jobs                    j   ON j.id            = i.job_id
       LEFT JOIN recurring_agreements    ra  ON ra.id           = i.source_agreement_id
       LEFT JOIN agreement_invoice_periods aip ON aip.id        = i.agreement_period_id
       LEFT JOIN booking_settings        bs  ON bs.account_id   = i.account_id
       WHERE i.id = $1`,
      [req.params.invoiceId]
    );

    if (!rows.length) return res.status(404).json({ error: 'Invoice not found.' });
    const inv = rows[0];

    // Attach service schedules for agreement invoices so the customer can see coverage detail
    let service_schedules = [];
    if (inv.source_agreement_id) {
      const schRes = await pool.query(
        `SELECT service_type, asset_label, cadence, preferred_weekday,
                service_day_of_month, service_interval_days, started_at,
                end_condition_type, end_date, service_address
         FROM recurring_agreement_schedules
         WHERE agreement_id = $1 AND status = 'active'
         ORDER BY sort_order`,
        [inv.source_agreement_id]
      );
      service_schedules = schRes.rows;
    }

    res.json({ ...inv, service_schedules });
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
              a.stripe_connect_account_id, a.stripe_connect_status,
              ra.name AS agreement_name,
              i.subject
       FROM invoices i
       JOIN clients  c  ON c.id  = i.client_id
       JOIN accounts a  ON a.id  = i.account_id
       LEFT JOIN jobs  j  ON j.id  = i.job_id
       LEFT JOIN recurring_agreements ra ON ra.id = i.source_agreement_id
       WHERE i.id = $1`,
      [req.params.invoiceId]
    );
    const invoice = rows[0];
    if (!invoice)                 return res.status(404).json({ error: 'Invoice not found.' });
    if (invoice.status === 'paid') return res.status(400).json({ error: 'This invoice has already been paid.' });
    if (invoice.status === 'void') return res.status(400).json({ error: 'This invoice has been voided.' });

    const appUrl      = process.env.APP_URL || 'http://localhost:5173';
    const amountCents = Math.round(parseFloat(invoice.amount) * 100);

    const productName = invoice.service_type
      || invoice.agreement_name
      || invoice.subject
      || `Invoice #${invoice.invoice_number}`
      || 'Services';

    const sessionParams = {
      mode:                 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency:     'usd',
          unit_amount:  amountCents,
          product_data: {
            name:        productName,
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
