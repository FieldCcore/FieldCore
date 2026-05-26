const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const email   = require('../services/email');

// POST /api/contact — general contact form
router.post('/', async (req, res) => {
  const { name, company, message, type = 'General', website, notes } = req.body;
  let { email: fromEmail } = req.body;

  if (!name || !fromEmail || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }

  const inboxAddr = process.env.CONTACT_EMAIL || 'info@getfieldcore.com';
  const isPartner = type === 'Partnership';

  try {
    // Save partner applications to DB
    if (isPartner) {
      // Parse type from message if it's a partner application
      const partnerType = notes ? req.body.partner_type || 'Referral Partner' : 'Referral Partner';
      await pool.query(
        `INSERT INTO partner_applications (name, email, company, website, type, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [name.trim(), fromEmail.toLowerCase(), company || null, website || null, partnerType, message]
      ).catch(() => {}); // non-fatal if table doesn't exist yet
    }

    // Notify internal team
    await email.send({
      to:      inboxAddr,
      subject: `[FieldCore ${isPartner ? 'Partner' : 'Contact'}] ${type}: ${name}${company ? ` — ${company}` : ''}`,
      html: email.wrap(`
        <p style="margin:0 0 16px">
          <strong>From:</strong> ${escHtml(name)}${company ? ` · ${escHtml(company)}` : ''}<br>
          <strong>Email:</strong> <a href="mailto:${escHtml(fromEmail)}">${escHtml(fromEmail)}</a><br>
          ${website ? `<strong>Website:</strong> ${escHtml(website)}<br>` : ''}
          <strong>Type:</strong> ${escHtml(type)}
        </p>
        <div style="background:#f9f7f3;border-radius:8px;padding:16px;font-size:14px;line-height:1.7;white-space:pre-wrap">${escHtml(message)}</div>
      `),
    });

    // Auto-reply
    await email.send({
      to:      fromEmail,
      subject: isPartner ? 'Partner application received — FieldCore' : 'We received your message — FieldCore',
      html: email.wrap(`
        <p style="font-size:15px;color:#1C2333">Hi ${escHtml(name.split(' ')[0])},</p>
        ${isPartner
          ? `<p style="color:#5F667A;line-height:1.7">Thanks for applying to the FieldCore Partner Program. We review all applications within 24 hours and will follow up at this email address.</p>`
          : `<p style="color:#5F667A;line-height:1.7">Thanks for reaching out. We've received your message and will get back to you within one business day.</p>`
        }
        <p style="color:#5F667A;line-height:1.7">In the meantime, check out our <a href="${process.env.APP_URL || 'https://getfieldcore.com'}/faq" style="color:#1C2333">FAQ</a> for common questions.</p>
        <p style="color:#5F667A">— The FieldCore Team</p>
      `),
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[contact] error:', err);
    res.json({ ok: true, warning: 'Message logged but email not sent.' });
  }
});

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = router;
