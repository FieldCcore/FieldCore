const twilio   = require('twilio');
const pool     = require('../db/pool');
const sendblue = require('./sendblue');

// Twilio client — used for voice (calls, voicemail) and SMS when provider=twilio
function getClient() {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || sid === 'AC' || token === '') return null;
  return twilio(sid, token);
}

const FROM = process.env.TWILIO_PHONE_NUMBER;

// MESSAGING_PROVIDER controls where outbound client messages go:
//   'twilio'   — Twilio SMS (default, active once SMS_ENABLED=true + A2P approved)
//   'sendblue' — Sendblue iMessage/RCS/SMS (activate after app store approval + $100/mo plan)
async function send(accountId, clientId, to, body) {
  // Opt-out guard — check sms_opt_outs before any send path
  const digits     = (to || '').replace(/\D/g, '');
  const normalized = digits.length === 10 ? `+1${digits}`
                   : digits.length === 11 && digits[0] === '1' ? `+${digits}`
                   : to;
  const { rows: optOutRows } = await pool.query(
    `SELECT 1 FROM sms_opt_outs WHERE normalized_phone = $1`,
    [normalized]
  );
  if (optOutRows.length > 0) {
    console.log(`[SMS blocked — opt-out] To: ${to}`);
    return { blocked: true };
  }

  const provider = process.env.MESSAGING_PROVIDER || 'twilio';

  if (provider === 'sendblue') {
    return sendblue.send(accountId, clientId, to, body);
  }

  // Twilio SMS (default)
  if (process.env.SMS_ENABLED !== 'true') {
    console.log(`[SMS disabled — A2P 10DLC pending] To: ${to} | ${body}`);
    return null;
  }
  const client = getClient();
  if (!client || !FROM || FROM === '+1') {
    console.log(`[SMS skipped — Twilio not configured] To: ${to} | ${body}`);
    return null;
  }
  const message = await client.messages.create({ body, from: FROM, to });
  await pool.query(
    `INSERT INTO messages (account_id, client_id, direction, body, provider, provider_id, status, phone_number)
     VALUES ($1,$2,'outbound',$3,'twilio',$4,$5,$6)`,
    [accountId, clientId, body, message.sid, message.status, to]
  );
  return message;
}

// Templates
function confirmationBody(clientName, serviceType, scheduledAt) {
  const dt      = new Date(scheduledAt);
  const dateStr = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `Hi ${clientName}, your ${serviceType} appointment is confirmed for ${dateStr} at ${timeStr}. Reply STOP to opt out.`;
}

function reminderBody(clientName, serviceType, scheduledAt) {
  const dt      = new Date(scheduledAt);
  const dateStr = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `Hi ${clientName}, reminder: your ${serviceType} appointment is tomorrow (${dateStr}) at ${timeStr}. Reply STOP to opt out.`;
}

function etaBody(clientName, minutes) {
  return `Hi ${clientName}, your technician is on the way and will arrive in approximately ${minutes} minutes. – FieldCore`;
}

function noShowClientBody(clientName, gracePeriod, depositAmount) {
  return `Hi ${clientName}, your technician has waited ${gracePeriod} minutes past your scheduled appointment time. Per our no-show policy, your deposit of $${parseFloat(depositAmount).toFixed(2)} has been retained. Please contact us to reschedule.`;
}

function noShowTechBody(clientName, address, depositAmount) {
  const addr = address ? ` at ${address}` : '';
  return `No-show confirmed for ${clientName}${addr}. Deposit of $${parseFloat(depositAmount).toFixed(2)} has been retained. You are now released. Please proceed to your next job or stand by.`;
}

module.exports = { send, confirmationBody, reminderBody, etaBody, noShowClientBody, noShowTechBody, getClient };
