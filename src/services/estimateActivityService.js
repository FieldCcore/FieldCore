'use strict';

const pool   = require('../db/pool');
const notify = require('./notify');
const { ESTIMATE } = require('../constants/estimateEventTypes');

// Default window after first view before a follow-up notification fires.
// Architected as a constant so it can become a per-account setting later.
const FOLLOW_UP_HOURS = 48;

/**
 * Record one activity event on an estimate.
 * If idempotencyKey is provided, duplicate inserts are silently ignored.
 * Returns the inserted row or null (on conflict or DB error).
 */
async function record({
  accountId, estimateId, clientId, relatedJobId,
  eventType, actorId, actorType = 'user',
  summary, details = {}, idempotencyKey, occurredAt,
}) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO estimate_activity
         (account_id, estimate_id, client_id, related_job_id, event_type,
          actor_id, actor_type, summary, details, idempotency_key, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11,NOW()))
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        accountId, estimateId,
        clientId    || null,
        relatedJobId || null,
        eventType,
        actorId  || null,
        actorType,
        summary  || null,
        JSON.stringify(details),
        idempotencyKey || null,
        occurredAt     || null,
      ]
    );
    return rows[0] || null;
  } catch (err) {
    console.error('[estimate-activity] record failed:', err.message);
    return null;
  }
}

/**
 * Record an activity event and — if it was inserted (not a duplicate) —
 * create an in-app notification for the account.
 */
async function recordWithNotify(activityOpts, notifyOpts) {
  const activity = await record(activityOpts);
  if (activity && notifyOpts) {
    await notify.create(
      activityOpts.accountId,
      notifyOpts.type,
      notifyOpts.title,
      notifyOpts.body  || null,
      notifyOpts.link  || null
    );
  }
  return activity;
}

module.exports = { record, recordWithNotify, FOLLOW_UP_HOURS, EVENTS: ESTIMATE };
