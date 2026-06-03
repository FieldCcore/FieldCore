const twilio      = require('twilio');
const pool        = require('../db/pool');
const sendblue    = require('./sendblue');

// Twilio client — used only for voice (calls, voicemail)
function getClient() {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || sid === 'AC' || token === '') return null;
  return twilio(sid, token);
}

// Route all outbound client messages through Sendblue (iMessage/RCS/SMS)
// Twilio stays voice-only
async function send(accountId, clientId, to, body) {
  return sendblue.send(accountId, clientId, to, body);
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
