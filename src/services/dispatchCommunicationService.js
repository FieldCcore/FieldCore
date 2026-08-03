'use strict';
const pool   = require('../db/pool');
const sms    = require('./sms');
const notify = require('./notify');

const TEMPLATES = {
  on_the_way:   ({ techName, serviceType }) =>
    `${techName} is on the way for your ${serviceType} appointment. See you soon!`,
  running_late: ({ techName, serviceType }) =>
    `${techName} is running a little behind for your ${serviceType} appointment. We appreciate your patience.`,
  job_assigned: ({ clientName, serviceType }) =>
    `You have a new dispatch: ${serviceType} for ${clientName}. Check the FieldCore app for details.`,
  job_rescheduled: ({ serviceType, scheduledTime }) =>
    `Your ${serviceType} appointment has been updated. New time: ${scheduledTime}.`,
};

function buildMessage(template, variables, customMessage) {
  if (template === 'custom') return customMessage || '';
  const fn = TEMPLATES[template];
  return fn ? fn(variables) : customMessage || '';
}

/**
 * Sends a quick dispatch communication to client and/or technician.
 *
 * @param {{
 *   accountId, jobId, actorId, actorName,
 *   template, customMessage, recipient,   // recipient: 'client'|'tech'|'both'
 * }}
 * @returns {{ sent: boolean, clientResult, techResult, commId }}
 */
async function sendQuickMessage({
  accountId, jobId, actorId, actorName,
  template, customMessage, recipient,
}) {
  // ── Fetch job + client + tech ─────────────────────────────────────────────
  const { rows: [job] } = await pool.query(
    `SELECT j.*, c.name AS client_name, c.phone AS client_phone,
            u.name AS tech_name, u.phone AS tech_phone, u.id AS tech_id,
            EXTRACT(HOUR FROM j.scheduled_at) AS sched_hour
     FROM jobs j
     JOIN clients c ON c.id = j.client_id
     LEFT JOIN users u ON u.id = j.tech_id
     WHERE j.id = $1 AND j.account_id = $2`,
    [jobId, accountId]
  );
  if (!job) throw new Error('Job not found.');

  const scheduledTime = job.scheduled_at
    ? new Date(job.scheduled_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '';

  const variables = {
    techName:    job.tech_name || 'Your technician',
    clientName:  job.client_name,
    serviceType: job.service_type,
    scheduledTime,
  };

  const clientMessage = buildMessage(template, variables, customMessage);
  const techMessage   = template === 'job_assigned'
    ? buildMessage('job_assigned', variables, customMessage)
    : buildMessage(template, variables, customMessage);

  if (!clientMessage && !techMessage) throw new Error('Message body is empty.');

  let clientResult = null;
  let techResult   = null;
  let status       = 'sent';
  let errorMsg     = null;

  // ── Send to client via SMS ────────────────────────────────────────────────
  if ((recipient === 'client' || recipient === 'both') && job.client_phone) {
    try {
      clientResult = await sms.send(accountId, job.client_id, job.client_phone, clientMessage);
      if (clientResult?.blocked) status = 'blocked';
    } catch (err) {
      status   = 'failed';
      errorMsg = err.message;
    }
  }

  // ── Notify tech in-app ────────────────────────────────────────────────────
  if ((recipient === 'tech' || recipient === 'both') && job.tech_id) {
    try {
      await notify.create(accountId, 'dispatch_comm', 'Dispatch Update', techMessage, `/jobs`);
      techResult = { delivered: true };
    } catch (err) {
      techResult = { delivered: false, error: err.message };
    }
  }

  // ── Persist to dispatch_communications ───────────────────────────────────
  const { rows: [comm] } = await pool.query(
    `INSERT INTO dispatch_communications
       (account_id, job_id, tech_id, actor_id, recipient, template, message,
        client_phone, tech_phone, status, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      accountId, jobId, job.tech_id || null, actorId,
      recipient, template || 'custom',
      recipient === 'tech' ? techMessage : clientMessage,
      job.client_phone || null,
      job.tech_phone   || null,
      status, errorMsg,
    ]
  );

  // ── Log to dispatch_activity_log ──────────────────────────────────────────
  await pool.query(
    `INSERT INTO dispatch_activity_log
       (account_id, job_id, tech_id, event_type, actor_id, actor_name, details)
     VALUES ($1,$2,$3,'communication.sent',$4,$5,$6)`,
    [
      accountId, jobId, job.tech_id || null, actorId, actorName || null,
      JSON.stringify({
        recipient, template,
        clientNotified: (recipient === 'client' || recipient === 'both') && !!job.client_phone,
        techNotified:   (recipient === 'tech'   || recipient === 'both') && !!job.tech_id,
        commId: comm.id,
      }),
    ]
  ).catch(e => console.error('[dispatchComm] activity log failed:', e.message));

  return { sent: true, status, clientResult, techResult, commId: comm.id };
}

module.exports = { sendQuickMessage };
