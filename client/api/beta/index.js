import { getPool } from '../_lib.js';
import { sendEmail, emailWrap, escHtml } from '../_email.js';

const BETA_CAP = parseInt(process.env.BETA_CAP || '100');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email: fromEmail, company } = req.body || {};
  if (!name || !fromEmail) return res.status(400).json({ error: 'Name and email required.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) return res.status(400).json({ error: 'Invalid email.' });

  const pool = getPool();
  try {
    const existing = await pool.query('SELECT id, status, spot_number FROM beta_signups WHERE email = $1', [fromEmail.toLowerCase()]);
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return res.json({ ok: true, status: row.status, spot_number: row.spot_number, duplicate: true });
    }

    const countResult = await pool.query("SELECT COUNT(*) FROM beta_signups WHERE status = 'active'");
    const activeCount = parseInt(countResult.rows[0].count);

    let status, spotNumber;
    if (activeCount < BETA_CAP) {
      spotNumber = activeCount + 1;
      status = 'active';
    } else {
      spotNumber = null;
      status = 'waitlist';
    }

    await pool.query(
      'INSERT INTO beta_signups (name, email, company, spot_number, status) VALUES ($1, $2, $3, $4, $5)',
      [name.trim(), fromEmail.toLowerCase(), company?.trim() || null, spotNumber, status]
    );

    const firstName = escHtml(name.split(' ')[0]);
    if (status === 'active') {
      await sendEmail({
        to: fromEmail,
        subject: `You're in — Beta Spot #${spotNumber} secured · FieldCore`,
        html: emailWrap(`
          <p style="font-size:15px;color:#1C2333">Hi ${firstName},</p>
          <p style="color:#5F667A;line-height:1.7">You've secured <strong>Beta Spot #${spotNumber}</strong> — you're one of the first ${BETA_CAP} operators on FieldCore.</p>
          <p style="color:#5F667A;line-height:1.7">As a beta operator you get <strong>3 months free</strong> on any plan. We'll reach out within 24 hours to get you set up.</p>
          <div style="background:#f9f7f3;border-radius:10px;padding:20px 24px;margin:20px 0">
            <div style="font-size:11px;font-family:monospace;letter-spacing:.1em;color:#8A90A2;text-transform:uppercase;margin-bottom:6px">Your spot</div>
            <div style="font-family:'Georgia',serif;font-size:32px;color:#1C2333;font-weight:400">#${spotNumber} of ${BETA_CAP}</div>
          </div>
          <p style="color:#5F667A;line-height:1.7">— The FieldCore Team</p>
        `),
      });
    } else {
      await sendEmail({
        to: fromEmail,
        subject: "You're on the waitlist — FieldCore",
        html: emailWrap(`
          <p style="font-size:15px;color:#1C2333">Hi ${firstName},</p>
          <p style="color:#5F667A;line-height:1.7">All ${BETA_CAP} beta spots are currently filled, but you're on the waitlist. We'll notify you the moment a spot opens up.</p>
          <p style="color:#5F667A;line-height:1.7">— The FieldCore Team</p>
        `),
      });
    }

    res.json({ ok: true, status, spot_number: spotNumber, total_active: activeCount + (status === 'active' ? 1 : 0) });
  } catch (err) {
    console.error('[beta] error:', err);
    res.status(500).json({ error: 'Signup failed. Please try again.' });
  }
}
