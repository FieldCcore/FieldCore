const nodemailer = require('nodemailer');

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function send({ to, subject, html }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[Email skipped — SMTP not configured] To: ${to} | ${subject}`);
    return;
  }
  await transporter.sendMail({
    from: process.env.FROM_EMAIL || 'noreply@fieldcore.app',
    to, subject, html,
  });
}

function wrap(content) {
  const appUrl = process.env.APP_URL || 'https://fieldcore.app';
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f0;font-family:system-ui,sans-serif">
<div style="max-width:560px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;border:1px solid #e5e0d8">
  <div style="background:#1C2333;padding:22px 32px">
    <div style="color:#D6B58A;font-size:16px;font-weight:800;letter-spacing:.05em">FIELDCORE™</div>
  </div>
  <div style="padding:32px">${content}</div>
  <div style="padding:14px 32px;background:#f9f7f3;border-top:1px solid #e5e0d8;font-size:11px;color:#9ca3af">
    Sent via FieldCore &middot; <a href="${appUrl}" style="color:#9ca3af">fieldcore.app</a>
  </div>
</div>
</body></html>`;
}

function fmtDt(scheduledAt) {
  const dt = new Date(scheduledAt);
  return {
    date: dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    time: dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
}

function detail(label, value) {
  return `<div style="margin-bottom:14px">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;margin-bottom:3px">${label}</div>
    <div style="font-size:15px;font-weight:600;color:#1C2333">${value}</div>
  </div>`;
}

function card(inner) {
  return `<div style="background:#f9f7f3;border-radius:8px;padding:20px;margin-bottom:24px;border:1px solid #e5e0d8">${inner}</div>`;
}

function confirmationHtml(clientName, serviceType, scheduledAt) {
  const { date, time } = fmtDt(scheduledAt);
  return wrap(`
    <h2 style="margin:0 0 6px;color:#1C2333;font-size:20px;font-weight:700">Appointment Confirmed</h2>
    <p style="color:#6b7280;margin:0 0 24px;font-size:14px">Hi ${clientName}, your appointment has been confirmed.</p>
    ${card(detail('Service', serviceType) + detail('Date', date) + detail('Time', time))}
    <p style="color:#6b7280;font-size:13px;margin:0">Questions? Reply to this email and we'll get back to you.</p>
  `);
}

function reminderHtml(clientName, serviceType, scheduledAt) {
  const { date, time } = fmtDt(scheduledAt);
  return wrap(`
    <h2 style="margin:0 0 6px;color:#1C2333;font-size:20px;font-weight:700">Appointment Reminder</h2>
    <p style="color:#6b7280;margin:0 0 24px;font-size:14px">Hi ${clientName}, a friendly reminder about your appointment tomorrow.</p>
    ${card(detail('Service', serviceType) + detail('Date', date) + detail('Time', time))}
    <p style="color:#6b7280;font-size:13px;margin:0">See you soon!</p>
  `);
}

function invoiceHtml(clientName, serviceType, amount, payLink, businessName) {
  return wrap(`
    <h2 style="margin:0 0 6px;color:#1C2333;font-size:20px;font-weight:700">Invoice from ${businessName}</h2>
    <p style="color:#6b7280;margin:0 0 24px;font-size:14px">Hi ${clientName}, you have a new invoice ready for payment.</p>
    ${card(
      detail('Service', serviceType) +
      `<div style="display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid #e5e0d8;margin-top:4px">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af">Amount Due</div>
        <div style="font-size:28px;font-weight:800;color:#1C2333">$${parseFloat(amount).toFixed(2)}</div>
      </div>`
    )}
    <a href="${payLink}" style="display:inline-block;background:#1C2333;color:#D6B58A;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:.02em">Pay Now →</a>
    <p style="color:#9ca3af;font-size:11px;margin-top:14px">Or visit: ${payLink}</p>
  `);
}

module.exports = { send, confirmationHtml, reminderHtml, invoiceHtml };
