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

async function send({ to, subject, html, attachments }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[Email skipped — SMTP not configured] To: ${to} | ${subject}`);
    return;
  }
  await transporter.sendMail({
    from: process.env.FROM_EMAIL || 'noreply@getfieldcore.com',
    to, subject, html,
    ...(attachments?.length ? { attachments } : {}),
  });
}

function wrap(content) {
  const appUrl = process.env.APP_URL || '';
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

function invoiceHtml(clientName, serviceType, amount, payLink, businessName, taxAmount = 0) {
  const tax      = parseFloat(taxAmount || 0);
  const total    = parseFloat(amount);
  const subtotal = total - tax;
  const taxLines = tax > 0 ? `
    <div style="display:flex;justify-content:space-between;font-size:13px;color:#6b7280;margin-bottom:4px">
      <span>Subtotal</span><span>$${subtotal.toFixed(2)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:13px;color:#6b7280;margin-bottom:10px">
      <span>Tax</span><span>$${tax.toFixed(2)}</span>
    </div>` : '';
  return wrap(`
    <h2 style="margin:0 0 6px;color:#1C2333;font-size:20px;font-weight:700">Invoice from ${businessName}</h2>
    <p style="color:#6b7280;margin:0 0 24px;font-size:14px">Hi ${clientName}, you have a new invoice ready for payment.</p>
    ${card(
      detail('Service', serviceType) +
      taxLines +
      `<div style="display:flex;justify-content:space-between;align-items:center;padding-top:${tax > 0 ? 10 : 14}px;border-top:1px solid #e5e0d8;margin-top:4px">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af">Amount Due</div>
        <div style="font-size:28px;font-weight:800;color:#1C2333">$${total.toFixed(2)}</div>
      </div>`
    )}
    <a href="${payLink}" style="display:inline-block;background:#1C2333;color:#D6B58A;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:.02em">Pay Now →</a>
    <p style="color:#9ca3af;font-size:11px;margin-top:14px">Or visit: ${payLink}</p>
  `);
}

function noShowOperatorHtml(job, record, depositRetained) {
  return wrap(`
    <h2 style="margin:0 0 6px;color:#B52A2A;font-size:20px;font-weight:700">No-Show Declared</h2>
    <p style="color:#6b7280;margin:0 0 24px;font-size:14px">A no-show has been automatically documented for the following appointment.</p>
    ${card(
      detail('Client', record.client_name) +
      detail('Service', job.service_type) +
      detail('Scheduled', new Date(record.scheduled_at).toLocaleString('en-US')) +
      detail('Declared At', new Date(record.declared_at).toLocaleString('en-US')) +
      detail('Grace Period', `${record.grace_period_minutes} minutes`) +
      detail('Deposit Retained', `$${parseFloat(depositRetained).toFixed(2)}`) +
      detail('Technician', record.tech_name || 'Unassigned')
    )}
    <p style="color:#6b7280;font-size:13px;margin:0">Log in to FieldCore to download the full no-show documentation PDF.</p>
  `);
}

function billingRenewalHtml(accountName, daysUntil, amount, nextDate) {
  const label = daysUntil === 0 ? 'today' : `in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`;
  return wrap(`
    <h2 style="margin:0 0 6px;color:#1C2333;font-size:20px;font-weight:700">Upcoming Renewal</h2>
    <p style="color:#6b7280;margin:0 0 24px;font-size:14px">Hi ${accountName}, your FieldCore subscription renews ${label}.</p>
    ${card(
      detail('Renewal Date', new Date(nextDate).toLocaleDateString('en-US', { dateStyle: 'long' })) +
      detail('Amount', `$${parseFloat(amount).toFixed(2)}`)
    )}
    <p style="color:#6b7280;font-size:13px;margin:0">To update your payment method or manage your subscription, visit the Billing page in your FieldCore dashboard.</p>
  `);
}

function billingReceiptHtml(accountName, amount, planName, invoicePdfUrl) {
  return wrap(`
    <h2 style="margin:0 0 6px;color:#1C2333;font-size:20px;font-weight:700">Payment Receipt</h2>
    <p style="color:#6b7280;margin:0 0 24px;font-size:14px">Thank you, ${accountName}! Your FieldCore subscription has been renewed.</p>
    ${card(
      detail('Plan', planName) +
      detail('Amount Charged', `$${parseFloat(amount).toFixed(2)}`)
    )}
    ${invoicePdfUrl ? `<a href="${invoicePdfUrl}" style="display:inline-block;background:#1C2333;color:#D6B58A;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px">Download Receipt →</a>` : ''}
    <p style="color:#9ca3af;font-size:12px;margin-top:14px">Questions? Contact us at info@getfieldcore.com</p>
  `);
}

function billingFailedHtml(accountName) {
  const appUrl = process.env.APP_URL || '';
  return wrap(`
    <h2 style="margin:0 0 6px;color:#B52A2A;font-size:20px;font-weight:700">Payment Failed</h2>
    <p style="color:#6b7280;margin:0 0 24px;font-size:14px">Hi ${accountName}, we were unable to charge your payment method for your FieldCore subscription.</p>
    <p style="color:#6b7280;line-height:1.7;font-size:14px">Please update your payment method to avoid any interruption in service.</p>
    <a href="${appUrl}/billing" style="display:inline-block;background:#B52A2A;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px">Update Payment Method →</a>
    <p style="color:#9ca3af;font-size:12px;margin-top:14px">If you have questions, contact us at info@getfieldcore.com</p>
  `);
}

function reviewRequestHtml(clientName, serviceType, businessName, reviewUrl) {
  return wrap(`
    <h2 style="margin:0 0 6px;color:#1C2333;font-size:20px;font-weight:700">How did we do?</h2>
    <p style="color:#6b7280;margin:0 0 24px;font-size:14px">Hi ${clientName}, thanks for choosing ${businessName} for your <strong>${serviceType}</strong>. We'd love your feedback — it only takes 30 seconds.</p>
    <a href="${reviewUrl}" style="display:inline-block;background:#1C2333;color:#D6B58A;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:.02em">Leave a Review →</a>
    <p style="color:#9ca3af;font-size:11px;margin-top:14px">Or visit: ${reviewUrl}</p>
  `);
}

function billingCancelledHtml(accountName, accessEndsAt) {
  return wrap(`
    <h2 style="margin:0 0 6px;color:#1C2333;font-size:20px;font-weight:700">Cancellation Confirmed</h2>
    <p style="color:#6b7280;margin:0 0 24px;font-size:14px">Hi ${accountName}, your FieldCore subscription has been cancelled.</p>
    ${card(
      detail('Access Ends', new Date(accessEndsAt).toLocaleDateString('en-US', { dateStyle: 'long' }))
    )}
    <p style="color:#6b7280;line-height:1.7;font-size:14px">You will retain read-only access until the end of your current billing period. We're sorry to see you go — if there's anything we can improve, please let us know at info@getfieldcore.com.</p>
  `);
}

module.exports = {
  send, wrap, confirmationHtml, reminderHtml, invoiceHtml,
  noShowOperatorHtml, billingRenewalHtml, billingReceiptHtml,
  billingFailedHtml, billingCancelledHtml, reviewRequestHtml,
};
