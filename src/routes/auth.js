const express    = require('express');
const router     = express.Router();
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const pool       = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRES = '7d';

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required.' });

  try {
    const { rows } = await pool.query(
      `SELECT u.*, a.name AS account_name
       FROM users u
       JOIN accounts a ON a.id = u.account_id
       WHERE lower(u.email) = lower($1)
       LIMIT 1`,
      [email.trim()]
    );

    const user = rows[0];
    if (!user || !user.password_hash)
      return res.status(401).json({ error: 'Invalid email or password.' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Invalid email or password.' });

    const token = jwt.sign(
      { userId: user.id, accountId: user.account_id, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      token,
      user: {
        id:           user.id,
        name:         user.name,
        email:        user.email,
        role:         user.role,
        accountId:    user.account_id,
        accountName:  user.account_name,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/me — verify token and return user (used on app load)
router.get('/me', async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: 'No token.' });

  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.account_id,
              a.name AS account_name
       FROM users u JOIN accounts a ON a.id = u.account_id
       WHERE u.id = $1`,
      [payload.userId]
    );
    if (!rows.length) return res.status(401).json({ error: 'User not found.' });
    res.json({ user: { ...rows[0], accountId: rows[0].account_id, accountName: rows[0].account_name } });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  try {
    const { rows } = await pool.query(
      'SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1',
      [email.trim()]
    );

    if (!rows.length) return res.json({ message: 'If that email exists, a reset link has been sent.' });

    const userId = rows[0].id;

    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);

    const token     = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [userId, tokenHash, expiresAt]
    );

    const appUrl   = process.env.APP_URL || 'http://localhost:5173';
    const resetUrl = `${appUrl}/reset-password?token=${token}`;

    if (process.env.SMTP_HOST) {
      const transporter = nodemailer.createTransport({
        host:   process.env.SMTP_HOST,
        port:   parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_PORT === '465',
        auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });

      await transporter.sendMail({
        from:    process.env.FROM_EMAIL || 'noreply@fieldcore.app',
        to:      email.trim(),
        subject: 'Reset your FieldCore password',
        html: `
          <p>You requested a password reset for your FieldCore account.</p>
          <p style="margin:24px 0;">
            <a href="${resetUrl}" style="background:#D6B58A;color:#1C2333;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;">
              Reset Password
            </a>
          </p>
          <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
          <p style="color:#999;font-size:12px;margin-top:20px;">${resetUrl}</p>
        `,
      });
    } else {
      console.log(`[dev] Password reset link for ${email}: ${resetUrl}`);
    }

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and new password are required.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  try {
    const { rows } = await pool.query(
      `SELECT user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND expires_at > NOW()`,
      [tokenHash]
    );

    if (!rows.length) return res.status(400).json({ error: 'Reset link is invalid or has expired.' });

    const userId = rows[0].user_id;
    const hash   = await bcrypt.hash(password, 12);

    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);

    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/accounts — list all accounts the user can access (home + memberships)
router.get('/accounts', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.name,
              CASE WHEN u.account_id = a.id THEN u.role ELSE am.role END AS role,
              (u.account_id = a.id) AS is_home
       FROM accounts a
       JOIN users u ON u.id = $1
       LEFT JOIN account_memberships am ON am.account_id = a.id AND am.user_id = $1
       WHERE a.id = u.account_id OR am.user_id = $1
       ORDER BY is_home DESC, a.name`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/switch — issue a new JWT scoped to a different account
router.post('/switch', requireAuth, async (req, res) => {
  const { account_id } = req.body;
  if (!account_id) return res.status(400).json({ error: 'account_id is required.' });

  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.name,
              CASE WHEN u.account_id = a.id THEN u.role ELSE am.role END AS role
       FROM accounts a
       JOIN users u ON u.id = $1
       LEFT JOIN account_memberships am ON am.account_id = a.id AND am.user_id = $1
       WHERE a.id = $2 AND (u.account_id = a.id OR am.user_id = $1)`,
      [req.userId, account_id]
    );
    if (!rows.length) return res.status(403).json({ error: 'Access denied to this account.' });

    const account = rows[0];
    const token = jwt.sign(
      { userId: req.userId, accountId: account.id, role: account.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );
    res.json({
      token,
      user: { accountId: account.id, accountName: account.name, role: account.role },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/seed-owner — dev-only: create an owner account + user with password
// Remove or gate behind NODE_ENV check before production
router.post('/seed-owner', async (req, res) => {
  if (process.env.NODE_ENV === 'production')
    return res.status(403).json({ error: 'Not available in production.' });

  const { accountName, name, email, password } = req.body;
  if (!accountName || !name || !email || !password)
    return res.status(400).json({ error: 'accountName, name, email, and password are required.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: acctRows } = await client.query(
      `INSERT INTO accounts (name) VALUES ($1)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [accountName]
    );

    let accountId;
    if (acctRows.length) {
      accountId = acctRows[0].id;
    } else {
      const { rows } = await client.query(
        `SELECT id FROM accounts WHERE name = $1`, [accountName]
      );
      accountId = rows[0].id;
    }

    const hash = await bcrypt.hash(password, 12);
    const { rows: userRows } = await client.query(
      `INSERT INTO users (account_id, role, name, email, password_hash)
       VALUES ($1, 'owner', $2, $3, $4)
       ON CONFLICT (account_id, email) DO UPDATE SET password_hash = $4
       RETURNING id`,
      [accountId, name, email, hash]
    );

    await client.query('COMMIT');
    res.json({ accountId, userId: userRows[0].id, message: 'Owner created.' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
