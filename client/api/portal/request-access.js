import crypto from 'crypto';
import { getPool } from '../_lib.js';
import { sendEmail, emailWrap, escHtml } from '../_email.js';

const LINK_TTL_HOURS = 48;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, account_id } = req.body || {};
  if (!email || !account_id) return res.status(400).json({ error: 'email and account_id required.' });

  const pool = getPool();
  try {
    const clientRes = await pool.query(
      'SELECT id, name, email FROM clients WHERE account_id = $1 AND LOWER(email) = LOWER($2) LIMIT 1',
      [account_id, email]
    );
    if (!clientRes.rows.length) return res.json({ ok: true });

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

    await sendEmail({
      to: client.email,
      subject: 'Your FieldCore client portal link',
      html: emailWrap(`
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
}
