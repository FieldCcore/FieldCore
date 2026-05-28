const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const pool    = require('../db/pool');
const emailSvc = require('../services/email');
const stripe   = require('stripe')((process.env.STRIPE_SECRET_KEY || '').trim());

const PORTAL_JWT_SECRET = process.env.JWT_SECRET + '_portal';
const TOKEN_TTL_HOURS   = 48;
const LINK_TTL_HOURS    = 48;

function portalAuth(req, res, next) {
  const header = req.headers.authorization;
  const rawToken = header
    ? header.replace('Bearer ', '')
    : req.query.token; // allow ?token= for direct browser links (receipts)
  if (!rawToken) return res.status(401).json({ error: 'Unauthorized.' });
  try {
    req.portalUser = jwt.verify(rawToken, PORTAL_JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

// POST /api/portal/request-access — send magic link
router.post('/request-access', async (req, res) => {
  const { email, account_id } = req.body;
  if (!email || !account_id) return res.status(400).json({ error: 'email and account_id required.' });

  try {
    const clientRes = await pool.query(
      'SELECT id, name, email FROM clients WHERE account_id = $1 AND LOWER(email) = LOWER($2) LIMIT 1',
      [account_id, email]
    );
    if (!clientRes.rows.length) return res.json({ ok: true }); // don't reveal non-existence

    const client = clientRes.rows[0];
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + LINK_TTL_HOURS * 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO client_portal_tokens (client_id, account_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)',
      [client.id, account_id, tokenHash, expiresAt]
    );

    const appUrl = process.env.APP_URL || 'https://getfieldcore.com';
    const link = `${appUrl}/client?token=${rawToken}&account=${account_id}`;

    await emailSvc.send({
      to: client.email,
      subject: 'Your FieldCore client portal link',
      html: emailSvc.wrap(`
        <p style="font-size:15px;color:#1C2333">Hi ${escHtml(client.name?.split(' ')[0] || 'there')},</p>
        <p style="color:#5F667A;line-height:1.7">Here's your secure link to access your client portal. It expires in 48 hours.</p>
        <div style="margin:24px 0">
          <a href="${link}" style="display:inline-block;padding:12px 28px;background:#1C2333;color:#D6B58A;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none">Access your portal →</a>
        </div>
        <p style="font-size:12px;color:#9ca3af">If you didn't request this link, you can safely ignore this email. Link expires ${expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.</p>
      `),
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[portal/request-access]', err);
    res.status(500).json({ error: 'Failed to send access link.' });
  }
});

// GET /api/portal/auth?token=xxx&account=yyy
router.get('/auth', async (req, res) => {
  const { token, account } = req.query;
  if (!token || !account) return res.status(400).json({ error: 'token and account required.' });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  try {
    const r = await pool.query(`
      SELECT t.*, c.name, c.email, c.phone
      FROM client_portal_tokens t
      JOIN clients c ON c.id = t.client_id
      WHERE t.token_hash = $1
        AND t.account_id = $2
        AND t.expires_at > NOW()
        AND t.used_at IS NULL
    `, [tokenHash, account]);

    if (!r.rows.length) return res.status(401).json({ error: 'Link expired or already used.' });

    const row = r.rows[0];
    await pool.query('UPDATE client_portal_tokens SET used_at = NOW() WHERE id = $1', [row.id]);

    const portalToken = jwt.sign(
      { clientId: row.client_id, accountId: row.account_id, name: row.name, email: row.email },
      PORTAL_JWT_SECRET,
      { expiresIn: `${TOKEN_TTL_HOURS}h` }
    );

    res.json({ token: portalToken, name: row.name, email: row.email });
  } catch (err) {
    console.error('[portal/auth]', err);
    res.status(500).json({ error: 'Authentication failed.' });
  }
});

// GET /api/portal/me
router.get('/me', portalAuth, async (req, res) => {
  const { clientId, accountId } = req.portalUser;
  try {
    const r = await pool.query(
      'SELECT id, name, email, phone, address, ltv, tier, created_at FROM clients WHERE id=$1 AND account_id=$2',
      [clientId, accountId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found.' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load profile.' });
  }
});

// PUT /api/portal/me
router.put('/me', portalAuth, async (req, res) => {
  const { clientId, accountId } = req.portalUser;
  const { phone, address, email } = req.body;
  try {
    const r = await pool.query(
      'UPDATE clients SET phone=COALESCE($1,phone), address=COALESCE($2,address), email=COALESCE($3,email) WHERE id=$4 AND account_id=$5 RETURNING id,name,email,phone,address',
      [phone || null, address || null, email || null, clientId, accountId]
    );
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// GET /api/portal/invoices
router.get('/invoices', portalAuth, async (req, res) => {
  const { clientId, accountId } = req.portalUser;
  try {
    const r = await pool.query(`
      SELECT i.id, i.amount, i.status, i.payment_link, i.paid_at, i.created_at,
             j.service_type, j.scheduled_at, j.notes,
             COALESCE(i.tax_amount, 0) AS tax_amount
      FROM invoices i
      JOIN jobs j ON j.id = i.job_id
      WHERE i.client_id = $1 AND i.account_id = $2
      ORDER BY i.created_at DESC
      LIMIT 50
    `, [clientId, accountId]);
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load invoices.' });
  }
});

// GET /api/portal/appointments
router.get('/appointments', portalAuth, async (req, res) => {
  const { clientId, accountId } = req.portalUser;
  try {
    const r = await pool.query(`
      SELECT j.id, j.service_type, j.status, j.scheduled_at, j.amount, j.notes,
             u.name AS tech_name
      FROM jobs j
      LEFT JOIN users u ON u.id = j.tech_id
      WHERE j.client_id = $1 AND j.account_id = $2
      ORDER BY j.scheduled_at DESC
      LIMIT 30
    `, [clientId, accountId]);
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load appointments.' });
  }
});

// POST /api/portal/invoices/:id/pay — create Stripe checkout for unpaid invoice
router.post('/invoices/:id/pay', portalAuth, async (req, res) => {
  const { clientId, accountId } = req.portalUser;
  try {
    const r = await pool.query(`
      SELECT i.*, a.stripe_connect_account_id, a.stripe_connect_status, j.service_type
      FROM invoices i
      JOIN accounts a ON a.id = i.account_id
      JOIN jobs j ON j.id = i.job_id
      WHERE i.id = $1 AND i.client_id = $2 AND i.account_id = $3 AND i.status = 'pending'
    `, [req.params.id, clientId, accountId]);

    if (!r.rows.length) return res.status(404).json({ error: 'Invoice not found or already paid.' });
    const invoice = r.rows[0];

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

    // Save payment link to invoice
    await pool.query('UPDATE invoices SET payment_link = $1 WHERE id = $2', [session.url, invoice.id]);

    res.json({ url: session.url });
  } catch (err) {
    console.error('[portal/pay]', err);
    res.status(500).json({ error: 'Failed to create payment session.' });
  }
});

// GET /api/portal/invoices/:id/receipt — HTML receipt (printable / save as PDF)
router.get('/invoices/:id/receipt', portalAuth, async (req, res) => {
  const { clientId, accountId } = req.portalUser;
  try {
    const r = await pool.query(`
      SELECT i.id, i.amount, i.status, i.paid_at, i.created_at, i.tax_amount,
             j.service_type, j.scheduled_at, j.notes,
             c.name AS client_name, c.email AS client_email, c.address AS client_address,
             a.name AS business_name,
             bp.phone AS business_phone, bp.address AS business_address,
             bp.city, bp.state, bp.zip
      FROM invoices i
      JOIN jobs j ON j.id = i.job_id
      JOIN clients c ON c.id = i.client_id
      JOIN accounts a ON a.id = i.account_id
      LEFT JOIN business_profiles bp ON bp.account_id = i.account_id
      WHERE i.id = $1 AND i.client_id = $2 AND i.account_id = $3
    `, [req.params.id, clientId, accountId]);

    if (!r.rows.length) return res.status(404).json({ error: 'Invoice not found.' });
    const inv = r.rows[0];

    const subtotal = parseFloat(inv.amount) - parseFloat(inv.tax_amount || 0);
    const tax      = parseFloat(inv.tax_amount || 0);
    const total    = parseFloat(inv.amount);
    const fmt$     = n => `$${n.toFixed(2)}`;
    const fmtDate  = d => d ? new Date(d).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) : '—';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Receipt · ${inv.service_type} · ${fmtDate(inv.paid_at || inv.created_at)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: white; color: #1C2333; max-width: 600px; margin: 48px auto; padding: 0 24px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 24px; border-bottom: 2px solid #1C2333; margin-bottom: 28px; }
  .logo { font-weight: 800; font-size: 20px; letter-spacing: .08em; color: #1C2333; }
  .logo sup { font-size: 10px; }
  .badge { padding: 4px 12px; border-radius: 99px; font-size: 11px; font-weight: 700; background: ${inv.status === 'paid' ? '#DCFCE7' : '#FEF3C7'}; color: ${inv.status === 'paid' ? '#15803D' : '#B45309'}; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
  .party-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: #8A90A2; margin-bottom: 6px; }
  .party-name { font-size: 15px; font-weight: 700; color: #1C2333; margin-bottom: 2px; }
  .party-detail { font-size: 13px; color: #5F667A; line-height: 1.6; }
  .items { border: 1px solid #E6E6E6; border-radius: 8px; overflow: hidden; margin-bottom: 24px; }
  .item-row { display: flex; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid #E6E6E6; font-size: 14px; }
  .item-row:last-child { border-bottom: none; }
  .item-label { color: #5F667A; }
  .totals { border: 1px solid #E6E6E6; border-radius: 8px; overflow: hidden; margin-bottom: 24px; }
  .total-row { display: flex; justify-content: space-between; padding: 11px 16px; font-size: 14px; border-bottom: 1px solid #E6E6E6; }
  .total-row:last-child { border-bottom: none; background: #1C2333; color: white; font-weight: 700; font-size: 15px; border-radius: 0 0 8px 8px; }
  .footer { text-align: center; font-size: 12px; color: #8A90A2; border-top: 1px solid #E6E6E6; padding-top: 20px; }
  @media print { body { margin: 0; } button { display: none; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="logo">FIELDCORE<sup>™</sup></div>
    <div style="font-size:12px;color:#8A90A2;margin-top:4px">Payment Receipt</div>
  </div>
  <div style="text-align:right">
    <span class="badge">${inv.status.toUpperCase()}</span>
    <div style="font-size:12px;color:#8A90A2;margin-top:6px">Invoice #${inv.id.slice(-8).toUpperCase()}</div>
    <div style="font-size:12px;color:#8A90A2">${fmtDate(inv.paid_at || inv.created_at)}</div>
  </div>
</div>

<div class="parties">
  <div>
    <div class="party-label">Billed From</div>
    <div class="party-name">${escHtml(inv.business_name)}</div>
    <div class="party-detail">
      ${inv.business_address ? escHtml(inv.business_address) + '<br>' : ''}
      ${inv.city ? escHtml(inv.city) + ', ' + escHtml(inv.state || '') + ' ' + escHtml(inv.zip || '') + '<br>' : ''}
      ${inv.business_phone ? escHtml(inv.business_phone) : ''}
    </div>
  </div>
  <div>
    <div class="party-label">Billed To</div>
    <div class="party-name">${escHtml(inv.client_name)}</div>
    <div class="party-detail">
      ${inv.client_email ? escHtml(inv.client_email) + '<br>' : ''}
      ${inv.client_address ? escHtml(inv.client_address) : ''}
    </div>
  </div>
</div>

<div class="items">
  <div class="item-row" style="background:#F8F7F5;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.06em;">
    <span style="color:#8A90A2">Service</span>
    <span style="color:#8A90A2">Amount</span>
  </div>
  <div class="item-row">
    <div>
      <div style="font-weight:600">${escHtml(inv.service_type)}</div>
      ${inv.scheduled_at ? `<div class="item-label" style="font-size:12px;margin-top:2px">${fmtDate(inv.scheduled_at)}</div>` : ''}
      ${inv.notes ? `<div class="item-label" style="font-size:12px;margin-top:2px">${escHtml(inv.notes)}</div>` : ''}
    </div>
    <div style="font-weight:600">${fmt$(subtotal)}</div>
  </div>
</div>

<div class="totals">
  <div class="total-row"><span>Subtotal</span><span>${fmt$(subtotal)}</span></div>
  ${tax > 0 ? `<div class="total-row"><span>Tax</span><span>${fmt$(tax)}</span></div>` : ''}
  <div class="total-row"><span>Total</span><span>${fmt$(total)}</span></div>
</div>

${inv.status === 'paid' ? `<div style="background:#F0FDF4;border:1px solid rgba(21,128,61,.2);border-radius:8px;padding:14px 18px;margin-bottom:24px;font-size:13px;color:#15803D;font-weight:600;display:flex;align-items:center;gap:8px">✓ Payment received ${fmtDate(inv.paid_at)}</div>` : ''}

<div style="text-align:center;margin-bottom:24px">
  <button onclick="window.print()" style="padding:10px 24px;background:#1C2333;color:#D6B58A;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Print / Save as PDF</button>
</div>

<div class="footer">
  Receipt generated by FieldCore · getfieldcore.com<br>
  Questions? Contact ${escHtml(inv.business_name)} or support@getfieldcore.com
</div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error('[portal/receipt]', err);
    res.status(500).json({ error: 'Failed to generate receipt.' });
  }
});

function escHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = router;
