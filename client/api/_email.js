import nodemailer from 'nodemailer';

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

export async function sendEmail({ to, subject, html }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[Email skipped – SMTP not configured] To: ${to} | ${subject}`);
    return;
  }
  await transporter.sendMail({
    from: process.env.FROM_EMAIL || 'noreply@getfieldcore.com',
    to, subject, html,
  });
}

export function emailWrap(content) {
  const appUrl = process.env.APP_URL || 'https://getfieldcore.com';
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f0;font-family:system-ui,sans-serif">
<div style="max-width:560px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;border:1px solid #e5e0d8">
  <div style="background:#1C2333;padding:22px 32px">
    <div style="color:#D6B58A;font-size:16px;font-weight:800;letter-spacing:.05em">FIELDCORE™</div>
  </div>
  <div style="padding:32px">${content}</div>
  <div style="padding:14px 32px;background:#f9f7f3;border-top:1px solid #e5e0d8;font-size:11px;color:#9ca3af">
    Sent via FieldCore &middot; <a href="${appUrl}" style="color:#9ca3af">getfieldcore.com</a>
  </div>
</div>
</body></html>`;
}

export function escHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
