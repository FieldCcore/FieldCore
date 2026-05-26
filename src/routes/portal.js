const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const pool    = require('../db/pool');
const emailSvc = require('../services/email');

const PORTAL_JWT_SECRET = process.env.JWT_SECRET + '_portal';
const TOKEN_TTL_HOURS   = 24;
const LINK_TTL_MINUTES  = 30;

function portalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Unauthorized.' });
  try {
    const token = header.replace('Bearer ', '');
    req.portalUser = jwt.verify(token, PORTAL_JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

// POST /api/portal/request-access — client provides email, we send magic link
router.post('/request-access', async (req, res) => {
  const { email, account_id } = req.body;
  if (!email || !account_id) return res.status(400).json({ error: 'email and account_id required.' });

  try {
    const clientRes = await pool.query(
      'SELECT id, name, email FROM clients WHERE account_id = $1 AND LOWER(email) = LOWER($2) LIMIT 1',
      [account_id, email]
    );
    // Always return 200 — don't reveal whether email exists
    if (!clientRes.rows.length) return res.json({ ok: true });

    const client = clientRes.rows[0];
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + LINK_TTL_MINUTES * 60 * 1000);

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
        <p style="color:#5F667A;line-height:1.7">Here's your secure link to access your client portal. It expires in ${LINK_TTL_MINUTES} minutes.</p>
        <div style="margin:24px 0">
          <a href="${link}" style="display:inline-block;padding:12px 28px;background:#1C2333;color:#D6B58A;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none">Access your portal →</a>
        </div>
        <p style="font-size:12px;color:#9ca3af">If you didn't request this link, you can safely ignore this email.</p>
      `),
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[portal/request-access]', err);
    res.status(500).json({ error: 'Failed to send access link.' });
  }
});

// GET /api/portal/auth?token=xxx&account=yyy — exchange magic link for JWT
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

// GET /api/portal/me — client profile
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

// GET /api/portal/invoices
router.get('/invoices', portalAuth, async (req, res) => {
  const { clientId, accountId } = req.portalUser;
  try {
    const r = await pool.query(`
      SELECT i.*, j.service_type, j.scheduled_at
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

// PUT /api/portal/me — update contact info
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

function escHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = router;
