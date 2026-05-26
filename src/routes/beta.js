const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const email   = require('../services/email');
const auth    = require('../middleware/auth');

const BETA_CAP = parseInt(process.env.BETA_CAP || '100');

// POST /api/beta — public signup
router.post('/', async (req, res) => {
  const { name, email: fromEmail, company } = req.body;
  if (!name || !fromEmail) return res.status(400).json({ error: 'Name and email required.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) return res.status(400).json({ error: 'Invalid email.' });

  try {
    // Check for duplicate
    const existing = await pool.query('SELECT id, status, spot_number FROM beta_signups WHERE email = $1', [fromEmail.toLowerCase()]);
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return res.json({
        ok: true,
        status:      row.status,
        spot_number: row.spot_number,
        duplicate:   true,
      });
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

    // Send welcome / waitlist email
    if (status === 'active') {
      await email.send({
        to: fromEmail,
        subject: `You're in — Beta Spot #${spotNumber} secured · FieldCore`,
        html: email.wrap(`
          <p style="font-size:15px;color:#1C2333">Hi ${escHtml(name.split(' ')[0])},</p>
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
      await email.send({
        to: fromEmail,
        subject: "You're on the waitlist — FieldCore",
        html: email.wrap(`
          <p style="font-size:15px;color:#1C2333">Hi ${escHtml(name.split(' ')[0])},</p>
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
});

// GET /api/beta/stats — authenticated (owner only)
router.get('/stats', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active')   AS active_count,
        COUNT(*) FILTER (WHERE status = 'waitlist') AS waitlist_count,
        $1::int                                      AS cap
      FROM beta_signups
    `, [BETA_CAP]);
    const { active_count, waitlist_count, cap } = r.rows[0];
    res.json({
      active_count:   parseInt(active_count),
      waitlist_count: parseInt(waitlist_count),
      cap:            parseInt(cap),
      spots_left:     Math.max(0, parseInt(cap) - parseInt(active_count)),
    });
  } catch (err) {
    console.error('[beta/stats]', err);
    res.status(500).json({ error: 'Failed to load stats.' });
  }
});

function escHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = router;
