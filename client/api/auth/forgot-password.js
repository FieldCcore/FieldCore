import crypto from 'crypto';
import { getPool } from '../_lib.js';
import { sendEmail, emailWrap } from '../_email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const pool = getPool();
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

    const appUrl   = process.env.APP_URL || 'https://www.getfieldcore.com';
    const resetUrl = `${appUrl}/reset-password?token=${token}`;

    await sendEmail({
      to:      email.trim(),
      subject: 'Reset your FieldCore password',
      html: emailWrap(`
        <p style="font-size:15px;color:#1C2333">Hi there,</p>
        <p style="color:#5F667A;line-height:1.7">You requested a password reset for your FieldCore account.</p>
        <div style="margin:24px 0">
          <a href="${resetUrl}" style="display:inline-block;padding:12px 28px;background:#1C2333;color:#D6B58A;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none">Reset Password →</a>
        </div>
        <p style="font-size:12px;color:#9ca3af">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      `),
    });

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('[auth/forgot-password]', err.message);
    res.status(500).json({ error: 'Failed to process request.' });
  }
}
