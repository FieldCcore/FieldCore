const express = require('express');
const router  = express.Router();
const email   = require('../services/email');

// POST /api/contact — public contact form
router.post('/', async (req, res) => {
  const { name, company, message, type = 'General' } = req.body;
  let { email: fromEmail } = req.body;

  if (!name || !fromEmail || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }

  // basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }

  const inboxAddr = process.env.CONTACT_EMAIL || 'info@getfieldcore.com';
  const subject   = `[FieldCore Contact] ${type}: ${name}${company ? ` — ${company}` : ''}`;

  try {
    // Notify internal team
    await email.send({
      to:      inboxAddr,
      subject,
      html: email.wrap(`
        <p style="margin:0 0 16px"><strong>From:</strong> ${escHtml(name)}${company ? ` · ${escHtml(company)}` : ''}<br>
        <strong>Email:</strong> <a href="mailto:${escHtml(fromEmail)}">${escHtml(fromEmail)}</a><br>
        <strong>Type:</strong> ${escHtml(type)}</p>
        <div style="background:#f9f7f3;border-radius:8px;padding:16px;font-size:14px;line-height:1.7;white-space:pre-wrap">${escHtml(message)}</div>
      `),
    });

    // Auto-reply to sender
    await email.send({
      to:      fromEmail,
      subject: 'We received your message — FieldCore',
      html: email.wrap(`
        <p style="font-size:15px;color:#1C2333">Hi ${escHtml(name.split(' ')[0])},</p>
        <p style="color:#5F667A;line-height:1.7">Thanks for reaching out. We've received your message and will get back to you within one business day.</p>
        <p style="color:#5F667A;line-height:1.7">In the meantime, feel free to explore the platform or check out our <a href="${process.env.APP_URL || 'https://getfieldcore.com'}/faq" style="color:#1C2333">FAQ</a>.</p>
        <p style="color:#5F667A">— The FieldCore Team</p>
      `),
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[contact] email error:', err);
    // Don't fail the request if email is misconfigured in dev
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
