const express    = require('express');
const router     = express.Router();
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const pool       = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const audit      = require('../services/audit');

const JWT_SECRET          = process.env.JWT_SECRET;
const ACCESS_EXPIRES      = '15m';
const REFRESH_EXPIRES     = '7d';
const REFRESH_EXPIRES_MS  = 7 * 24 * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES     = 30;

function getIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
}

function getUserAgent(req) {
  return req.headers['user-agent']?.slice(0, 200) || 'unknown';
}

// Issue access + refresh token pair and create a session record
async function issueTokens(user, ipAddress, userAgent) {
  const payload = { userId: user.id, accountId: user.account_id, role: user.role };

  const accessToken  = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_EXPIRES });
  const refreshToken = crypto.randomBytes(40).toString('hex');
  const refreshHash  = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt    = new Date(Date.now() + REFRESH_EXPIRES_MS);

  // Parse device from user agent (simple heuristic)
  let deviceInfo = 'Unknown device';
  if (userAgent.includes('iPhone'))          deviceInfo = 'iPhone';
  else if (userAgent.includes('Android'))    deviceInfo = 'Android';
  else if (userAgent.includes('iPad'))       deviceInfo = 'iPad';
  else if (userAgent.includes('Mac'))        deviceInfo = 'Mac';
  else if (userAgent.includes('Windows'))    deviceInfo = 'Windows';
  else if (userAgent.includes('Linux'))      deviceInfo = 'Linux';

  await pool.query(
    `INSERT INTO user_sessions (user_id, account_id, refresh_token_hash, device_info, ip_address, user_agent, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [user.id, user.account_id, refreshHash, deviceInfo, ipAddress, userAgent, expiresAt]
  );

  return { accessToken, refreshToken };
}

function validatePassword(password) {
  if (password.length < 8)             return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password))         return 'Password must contain at least one uppercase letter.';
  if (!/[a-z]/.test(password))         return 'Password must contain at least one lowercase letter.';
  if (!/[0-9]/.test(password))         return 'Password must contain at least one number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character.';
  return null;
}

async function checkBruteForce(email, ipAddress) {
  const windowStart = new Date(Date.now() - LOCKOUT_MINUTES * 60 * 1000);

  // Check if user is locked
  const { rows: userRows } = await pool.query(
    `SELECT id, locked_until, failed_attempts FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [email.trim()]
  );
  const user = userRows[0];
  if (user?.locked_until && new Date(user.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000);
    return { locked: true, minutesLeft: mins };
  }

  // Count recent failures from this IP
  const { rows: ipRows } = await pool.query(
    `SELECT COUNT(*) FROM login_attempts WHERE ip_address = $1 AND success = FALSE AND created_at > $2`,
    [ipAddress, windowStart]
  );
  if (parseInt(ipRows[0].count) >= 10) {
    return { locked: true, minutesLeft: LOCKOUT_MINUTES };
  }

  return { locked: false };
}

async function recordLoginAttempt(email, ipAddress, success) {
  await pool.query(
    `INSERT INTO login_attempts (email, ip_address, success) VALUES ($1,$2,$3)`,
    [email.toLowerCase().trim(), ipAddress, success]
  );

  if (!success) {
    // Increment user failed_attempts counter
    const { rows } = await pool.query(
      `UPDATE users SET failed_attempts = failed_attempts + 1
       WHERE lower(email) = lower($1)
       RETURNING id, failed_attempts, name, email`,
      [email.trim()]
    );
    const user = rows[0];
    if (user && user.failed_attempts >= MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      await pool.query(
        `UPDATE users SET locked_until = $1 WHERE id = $2`,
        [lockedUntil, user.id]
      );
      // Alert admin
      audit.alertAdmin(
        `Account locked: ${user.email}`,
        `Account ${user.email} has been locked for ${LOCKOUT_MINUTES} minutes after ${MAX_FAILED_ATTEMPTS} consecutive failed login attempts.\n\nIP: ${ipAddress}`
      );
      audit.log(null, user.id, 'account_locked', 'user', user.id, { ip: ipAddress, attempts: user.failed_attempts }, ipAddress);
    }

    // Alert admin if IP has 10+ failures in 5 minutes
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const { rows: recentRows } = await pool.query(
      `SELECT COUNT(*) FROM login_attempts WHERE ip_address = $1 AND success = FALSE AND created_at > $2`,
      [ipAddress, fiveMinAgo]
    );
    if (parseInt(recentRows[0].count) >= 10) {
      audit.alertAdmin(
        `Brute force detected from IP ${ipAddress}`,
        `More than 10 failed login attempts in 5 minutes from IP: ${ipAddress}\n\nTarget email: ${email}`
      );
    }
  } else {
    // Reset counter on success
    await pool.query(
      `UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE lower(email) = lower($1)`,
      [email.trim()]
    );
  }
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required.' });

  const ipAddress = getIp(req);
  const userAgent = getUserAgent(req);

  try {
    // Brute force check — inside try/catch so a DB error returns 500 instead of hanging
    const bf = await checkBruteForce(email, ipAddress);
    if (bf.locked) {
      await pool.query(`INSERT INTO login_attempts (email, ip_address, success) VALUES ($1,$2,FALSE)`, [email, ipAddress]);
      return res.status(429).json({ error: `Account locked. Try again in ${bf.minutesLeft} minutes.` });
    }
    const { rows } = await pool.query(
      `SELECT u.*, a.name AS account_name, a.plan, a.plan_status, a.onboarded
       FROM users u
       JOIN accounts a ON a.id = u.account_id
       WHERE lower(u.email) = lower($1)
       LIMIT 1`,
      [email.trim()]
    );

    const user = rows[0];
    if (!user || !user.password_hash) {
      await recordLoginAttempt(email, ipAddress, false);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await recordLoginAttempt(email, ipAddress, false);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    await recordLoginAttempt(email, ipAddress, true);
    audit.log(user.account_id, user.id, 'login', 'user', user.id, { ip: ipAddress }, ipAddress);

    const { accessToken, refreshToken } = await issueTokens(user, ipAddress, userAgent);

    res.json({
      token:        accessToken,  // kept as 'token' for backward compat
      refreshToken,
      user: {
        id:          user.id,
        name:        user.name,
        email:       user.email,
        role:        user.role,
        accountId:   user.account_id,
        accountName: user.account_name,
        plan:        user.plan,
        planStatus:  user.plan_status,
        onboarded:   user.onboarded,
      },
    });
  } catch (err) {
    console.error('[login]', err.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// POST /api/auth/refresh — exchange refresh token for new access token
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken is required.' });

  const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  try {
    const { rows } = await pool.query(
      `SELECT s.*, u.role, u.name, u.email, a.plan, a.plan_status, a.onboarded, a.name AS account_name
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       JOIN accounts a ON a.id = s.account_id
       WHERE s.refresh_token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()`,
      [refreshHash]
    );

    if (!rows.length) return res.status(401).json({ error: 'Invalid or expired refresh token.' });

    const session = rows[0];
    const payload = { userId: session.user_id, accountId: session.account_id, role: session.role };
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_EXPIRES });

    await pool.query(
      `UPDATE user_sessions SET last_active_at = NOW() WHERE refresh_token_hash = $1`,
      [refreshHash]
    );

    res.json({
      token: accessToken,
      user: {
        id:          session.user_id,
        name:        session.name,
        email:       session.email,
        role:        session.role,
        accountId:   session.account_id,
        accountName: session.account_name,
        plan:        session.plan,
        planStatus:  session.plan_status,
        onboarded:   session.onboarded,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Token refresh failed.' });
  }
});

// POST /api/auth/logout — revoke current session
router.post('/logout', requireAuth, async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await pool.query(
      `UPDATE user_sessions SET revoked_at = NOW() WHERE refresh_token_hash = $1 AND user_id = $2`,
      [refreshHash, req.userId]
    ).catch(() => {});
  }
  res.json({ ok: true });
});

// POST /api/auth/logout-all — revoke all sessions for this user
router.post('/logout-all', requireAuth, async (req, res) => {
  await pool.query(
    `UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
    [req.userId]
  );
  audit.log(req.accountId, req.userId, 'logout_all_sessions', 'user', req.userId, {}, getIp(req));
  res.json({ ok: true });
});

// GET /api/auth/sessions — list active sessions for current user
router.get('/sessions', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, device_info, ip_address, last_active_at, created_at, expires_at
       FROM user_sessions
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
       ORDER BY last_active_at DESC`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/sessions/:id — revoke a specific session
router.delete('/sessions/:id', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE user_sessions SET revoked_at = NOW()
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [req.params.id, req.userId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Session not found.' });
    audit.log(req.accountId, req.userId, 'revoke_session', 'user_session', req.params.id, {}, getIp(req));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me — verify token and return user
// Uses payload.accountId (not u.account_id) so entity-switched tokens return the correct business.
router.get('/me', async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: 'No token.' });

  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.is_available,
              CASE WHEN u.account_id = $2 THEN u.role ELSE am.role END AS role,
              a.name AS account_name, a.plan, a.plan_status, a.onboarded
       FROM users u
       JOIN accounts a ON a.id = $2
       LEFT JOIN account_memberships am ON am.account_id = $2 AND am.user_id = u.id
       WHERE u.id = $1`,
      [payload.userId, payload.accountId]
    );
    if (!rows.length) return res.status(401).json({ error: 'User not found.' });
    const r = rows[0];
    res.json({
      user: {
        id:           r.id,
        name:         r.name,
        email:        r.email,
        role:         r.role,
        account_id:   payload.accountId,
        accountId:    payload.accountId,
        accountName:  r.account_name,
        plan:         r.plan,
        planStatus:   r.plan_status,
        onboarded:    r.onboarded,
        is_available: r.is_available,
      },
    });
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
    res.status(500).json({ error: 'Request failed. Please try again.' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and new password are required.' });

  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ error: pwError });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  try {
    const { rows } = await pool.query(
      `SELECT user_id FROM password_reset_tokens WHERE token_hash = $1 AND expires_at > NOW()`,
      [tokenHash]
    );

    if (!rows.length) return res.status(400).json({ error: 'Reset link is invalid or has expired.' });

    const userId = rows[0].user_id;
    const hash   = await bcrypt.hash(password, 12);

    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);
    // Revoke all sessions on password reset
    await pool.query(`UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1`, [userId]);

    audit.log(null, userId, 'password_reset', 'user', userId, {}, getIp(req));
    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Reset failed. Please try again.' });
  }
});

// PATCH /api/auth/me/password — authenticated user changes their own password
router.patch('/me/password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ error: 'current_password and new_password are required.' });

  const pwError = validatePassword(new_password);
  if (pwError) return res.status(400).json({ error: pwError });

  try {
    const { rows } = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found.' });

    const valid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });

    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.userId]);
    // Revoke all other sessions (except current one) on password change
    const { refreshToken } = req.body;
    const currentHash = refreshToken ? crypto.createHash('sha256').update(refreshToken).digest('hex') : null;
    await pool.query(
      `UPDATE user_sessions SET revoked_at = NOW()
       WHERE user_id = $1 AND ($2::TEXT IS NULL OR refresh_token_hash != $2)`,
      [req.userId, currentHash]
    );

    audit.log(req.accountId, req.userId, 'password_changed', 'user', req.userId, {}, getIp(req));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

// GET /api/auth/accounts — list accounts user can access
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
    res.status(500).json({ error: 'Failed to load accounts.' });
  }
});

// POST /api/auth/switch — issue tokens scoped to a different account
router.post('/switch', requireAuth, async (req, res) => {
  const { account_id } = req.body;
  if (!account_id) return res.status(400).json({ error: 'account_id is required.' });

  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.name, a.plan, a.plan_status, a.onboarded,
              CASE WHEN u.account_id = a.id THEN u.role ELSE am.role END AS role
       FROM accounts a
       JOIN users u ON u.id = $1
       LEFT JOIN account_memberships am ON am.account_id = a.id AND am.user_id = $1
       WHERE a.id = $2 AND (u.account_id = a.id OR am.user_id = $1)`,
      [req.userId, account_id]
    );
    if (!rows.length) return res.status(403).json({ error: 'Access denied to this account.' });

    const account = rows[0];
    // Build a synthetic user object for issueTokens
    const userForTokens = { id: req.userId, account_id: account.id, role: account.role };
    const { accessToken, refreshToken } = await issueTokens(userForTokens, getIp(req), getUserAgent(req));

    res.json({
      token:        accessToken,
      refreshToken,
      user: {
        accountId:   account.id,
        accountName: account.name,
        role:        account.role,
        plan:        account.plan,
        planStatus:  account.plan_status,
        onboarded:   account.onboarded,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Account switch failed.' });
  }
});

// GET /api/auth/audit-log — security events for this account (owner/manager only)
router.get('/audit-log', requireAuth, async (req, res) => {
  if (!['owner', 'manager'].includes(req.userRole))
    return res.status(403).json({ error: 'Forbidden.' });

  try {
    const { rows } = await pool.query(
      `SELECT al.*, u.name AS user_name, u.email AS user_email
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.account_id = $1
       ORDER BY al.created_at DESC
       LIMIT 200`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/seed-owner — dev-only, requires SEED_SECRET env var
router.post('/seed-owner', async (req, res) => {
  if (process.env.NODE_ENV === 'production')
    return res.status(403).json({ error: 'Not available in production.' });

  const seedSecret = process.env.SEED_SECRET;
  if (!seedSecret || req.headers['x-seed-secret'] !== seedSecret)
    return res.status(403).json({ error: 'Invalid or missing seed secret.' });

  const { accountName, name, email, password } = req.body;
  if (!accountName || !name || !email || !password)
    return res.status(400).json({ error: 'accountName, name, email, and password are required.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: acctRows } = await client.query(
      `INSERT INTO accounts (name) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id`,
      [accountName]
    );
    let accountId;
    if (acctRows.length) {
      accountId = acctRows[0].id;
    } else {
      const { rows } = await client.query(`SELECT id FROM accounts WHERE name = $1`, [accountName]);
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
    res.status(500).json({ error: 'Seed failed.' });
  } finally {
    client.release();
  }
});

module.exports = router;
