const twilio = require('twilio');
const pool   = require('../db/pool');

// Gracefully handle missing Twilio config
function getClient() {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || sid === 'AC' || token === '') return null;
  return twilio(sid, token);
}

const FROM = process.env.TWILIO_PHONE_NUMBER;

async function send(accountId, clientId, to, body) {
  const client = getClient();
  if (!client || !FROM || FROM === '+1') {
    console.log(`[SMS skipped — Twilio not configured] To: ${to} | ${body}`);
    return null;
  }
  const message = await client.messages.create({ body, from: FROM, to });
  await pool.query(
    `INSERT INTO messages (account_id, client_id, direction, body, twilio_sid)
     VALUES ($1,$2,'outbound',$3,$4)`,
    [accountId, clientId, body, message.sid]
  );
  return message;
}

// Templates
function confirmationBody(clientName, serviceType, scheduledAt) {
  const dt = new Date(scheduledAt);
  const dateStr = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `Hi ${clientName}, your ${serviceType} appointment is confirmed for ${dateStr} at ${timeStr}. Reply STOP to opt out.`;
}

function reminderBody(clientName, serviceType, scheduledAt) {
  const dt = new Date(scheduledAt);
  const dateStr = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `Hi ${clientName}, reminder: your ${serviceType} appointment is tomorrow (${dateStr}) at ${timeStr}. Reply STOP to opt out.`;
}

function etaBody(clientName, minutes) {
  return `Hi ${clientName}, your technician is on the way and will arrive in approximately ${minutes} minutes. – FieldCore`;
}

module.exports = { send, confirmationBody, reminderBody, etaBody, getClient };
