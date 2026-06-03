const axios = require('axios');
const pool  = require('../db/pool');

const BASE_URL = 'https://api.sendblue.co/api';

function isConfigured() {
  return !!(process.env.SENDBLUE_API_KEY_ID && process.env.SENDBLUE_API_SECRET_KEY);
}

function headers() {
  return {
    'sb-api-key-id':     process.env.SENDBLUE_API_KEY_ID,
    'sb-api-secret-key': process.env.SENDBLUE_API_SECRET_KEY,
    'Content-Type': 'application/json',
  };
}

// Normalize E.164 — Sendblue requires +1XXXXXXXXXX format
function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  return phone.startsWith('+') ? phone : `+${digits}`;
}

// Send a message to a client via Sendblue (iMessage → RCS → SMS fallback)
async function send(accountId, clientId, to, body) {
  const toNorm = normalizePhone(to);

  if (!isConfigured()) {
    console.log(`[Sendblue not configured] To: ${toNorm} | ${body}`);
    await pool.query(
      `INSERT INTO messages (account_id, client_id, direction, body, provider, status, phone_number)
       VALUES ($1,$2,'outbound',$3,'sendblue','logged',$4)`,
      [accountId, clientId, body, toNorm]
    );
    return null;
  }

  const callbackUrl = `${process.env.APP_URL}/api/webhooks/sendblue`;

  const response = await axios.post(
    `${BASE_URL}/send-message`,
    {
      number:          toNorm,
      content:         body,
      send_style:      'regular',
      status_callback: callbackUrl,
    },
    { headers: headers() }
  );

  const msg = response.data;

  await pool.query(
    `INSERT INTO messages (account_id, client_id, direction, body, provider, provider_id, status, phone_number)
     VALUES ($1,$2,'outbound',$3,'sendblue',$4,$5,$6)`,
    [accountId, clientId, body, msg.message_handle, msg.status || 'sent', toNorm]
  );

  return msg;
}

// Handle inbound Sendblue webhook — store message and match to client
async function handleInbound(payload) {
  const { from_number, content, message_handle, account_email } = payload;

  if (!content || !from_number) return;

  const normalized = normalizePhone(from_number);

  // Match client by phone across all accounts
  const { rows: clients } = await pool.query(
    `SELECT id, account_id, name FROM clients
     WHERE regexp_replace(phone, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g')
     LIMIT 1`,
    [normalized]
  );
  const client = clients[0];

  await pool.query(
    `INSERT INTO messages (account_id, client_id, direction, body, provider, provider_id, status, phone_number)
     VALUES ($1,$2,'inbound',$3,'sendblue',$4,'delivered',$5)`,
    [client?.account_id ?? null, client?.id ?? null, content, message_handle, normalized]
  );

  return client;
}

// Get message history for a phone number (inbound + outbound)
async function getHistory(accountId, clientId) {
  const { rows } = await pool.query(
    `SELECT * FROM messages
     WHERE account_id = $1 AND client_id = $2 AND provider IN ('sendblue','twilio')
     ORDER BY created_at ASC`,
    [accountId, clientId]
  );
  return rows;
}

module.exports = { send, handleInbound, getHistory, isConfigured, normalizePhone };
