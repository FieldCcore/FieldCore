import Stripe from 'stripe';
import { getPool } from '../../../_lib.js';
import { requirePortalAuth } from '../../../_portal_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const portalUser = requirePortalAuth(req, res);
  if (!portalUser) return;

  const { clientId, accountId } = portalUser;
  const { id } = req.query;
  const pool = getPool();

  try {
    const r = await pool.query(`
      SELECT i.*, a.stripe_connect_account_id, a.stripe_connect_status, j.service_type
      FROM invoices i
      JOIN accounts a ON a.id = i.account_id
      JOIN jobs j ON j.id = i.job_id
      WHERE i.id = $1 AND i.client_id = $2 AND i.account_id = $3 AND i.status = 'pending'
    `, [id, clientId, accountId]);

    if (!r.rows.length) return res.status(404).json({ error: 'Invoice not found or already paid.' });
    const invoice = r.rows[0];

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const appUrl = process.env.APP_URL || 'https://getfieldcore.com';
    const amountCents = Math.round(parseFloat(invoice.amount) * 100);
    const PLATFORM_FEE = parseFloat(process.env.PLATFORM_FEE_PERCENT || '1') / 100;

    const sessionParams = {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: { name: invoice.service_type || 'Service Invoice' },
        },
        quantity: 1,
      }],
      success_url: `${appUrl}/client?paid=1&invoice=${invoice.id}`,
      cancel_url:  `${appUrl}/client`,
      metadata:    { invoice_id: invoice.id, account_id: accountId },
    };

    if (invoice.stripe_connect_account_id && invoice.stripe_connect_status === 'active') {
      sessionParams.payment_intent_data = {
        application_fee_amount: Math.round(amountCents * PLATFORM_FEE),
        transfer_data: { destination: invoice.stripe_connect_account_id },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    await pool.query('UPDATE invoices SET payment_link = $1 WHERE id = $2', [session.url, invoice.id]);

    res.json({ url: session.url });
  } catch (err) {
    console.error('[portal/pay]', err);
    res.status(500).json({ error: 'Failed to create payment session.' });
  }
}
