'use strict';
/**
 * Job Activity Service — authoritative writer for dispatch_activity_log.
 *
 * All domain mutations route through recordActivity(). Never scatter direct
 * INSERT statements across route handlers.
 */
const pool = require('../db/pool');
const { categoryFor } = require('../constants/activityEventTypes');

/**
 * Record a job activity event.
 *
 * @param {object} opts
 * @param {string}  opts.accountId    - tenant UUID (required)
 * @param {string}  opts.jobId        - job UUID (required)
 * @param {string}  opts.eventType    - normalized event type (required)
 * @param {object}  [opts.actor]      - { id, name, type } — type: 'user'|'system'|'backfill'
 * @param {string}  [opts.summary]    - human-readable description
 * @param {object}  [opts.metadata]   - safe structured data (serialized as JSONB)
 * @param {Date}    [opts.occurredAt] - when the event happened (defaults to now)
 * @param {string}  [opts.source]     - 'domain'|'historical_backfill'|'system'
 * @param {string}  [opts.idempotencyKey] - deduplication key for backfill/system events
 * @param {string}  [opts.techId]     - technician UUID if relevant
 * @returns {object|null} inserted row, or null if duplicate/error (never throws)
 */
async function recordActivity({
  accountId,
  jobId,
  eventType,
  actor = null,
  summary = null,
  metadata = {},
  occurredAt = new Date(),
  source = 'domain',
  idempotencyKey = null,
  techId = null,
}) {
  if (!accountId || !jobId || !eventType) {
    console.error('[jobActivity] recordActivity called with missing required fields', { accountId, jobId, eventType });
    return null;
  }

  const category  = categoryFor(eventType);
  const actorId   = actor?.id   ?? null;
  const actorName = actor?.name ?? null;
  const actorType = actor?.type ?? (actor?.id ? 'user' : 'system');

  try {
    const { rows } = await pool.query(
      `INSERT INTO dispatch_activity_log
         (account_id, job_id, tech_id, event_type, category, actor_id, actor_name, actor_type,
          summary, details, source, occurred_at, idempotency_key, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING *`,
      [
        accountId, jobId, techId, eventType, category,
        actorId, actorName, actorType,
        summary, JSON.stringify(metadata),
        source,
        occurredAt instanceof Date ? occurredAt : new Date(occurredAt),
        idempotencyKey,
      ],
    );
    return rows[0] ?? null;
  } catch (err) {
    // Never break the primary mutation because of a display-layer failure.
    console.error(JSON.stringify({
      event: 'job_activity.write_error',
      accountId, jobId, eventType,
      error: err.message,
      code: err.code,
    }));
    return null;
  }
}

/**
 * Idempotent backfill — derives historical events from persisted job fields.
 * Safe to call multiple times; duplicate keys are silently ignored.
 *
 * @param {string} accountId - limit to this tenant; omit to backfill all
 * @returns {{ attempted, created, skipped }} counts
 */
async function backfillJobHistory(accountId = null) {
  const t0 = Date.now();
  let attempted = 0, created = 0, skipped = 0;

  const accountFilter = accountId ? 'AND j.account_id = $1' : '';
  const params        = accountId ? [accountId] : [];

  const { rows: jobs } = await pool.query(
    `SELECT
       j.id, j.account_id, j.status, j.service_type, j.created_at,
       j.tech_id, j.completed_at, j.scheduled_at,
       j.service_lat, j.service_lng, j.geocode_status,
       j.is_emergency, j.emergency_status,
       j.emergency_declared_at, j.emergency_declared_by,
       j.emergency_priority, j.emergency_reason_code,
       j.emergency_response_target_minutes,
       j.emergency_deactivated_at, j.emergency_deactivation_reason
     FROM jobs j
     WHERE j.status NOT IN ('draft')
     ${accountFilter}
     ORDER BY j.created_at`,
    params,
  );

  for (const job of jobs) {
    const acct = job.account_id;
    const jid  = job.id;

    // ── job.created ──────────────────────────────────────────────────────────
    const iKeyCreated = `backfill:${jid}:job.created`;
    attempted++;
    const r1 = await recordActivity({
      accountId: acct, jobId: jid,
      eventType: 'job.created',
      actor: { type: 'system', name: 'System' },
      summary: `Job created — ${job.service_type || 'unknown service'}`,
      metadata: { service_type: job.service_type },
      occurredAt: new Date(job.created_at),
      source: 'historical_backfill',
      idempotencyKey: iKeyCreated,
    });
    if (r1) created++; else skipped++;

    // ── job.geocode_resolved ─────────────────────────────────────────────────
    if (job.service_lat && job.service_lng && job.geocode_status === 'done') {
      const iKeyGeo = `backfill:${jid}:job.geocode_resolved`;
      attempted++;
      const r2 = await recordActivity({
        accountId: acct, jobId: jid,
        eventType: 'job.geocode_resolved',
        actor: { type: 'system', name: 'System' },
        summary: 'Address located on map',
        metadata: { lat: job.service_lat, lng: job.service_lng },
        occurredAt: new Date(job.created_at), // best available timestamp
        source: 'historical_backfill',
        idempotencyKey: iKeyGeo,
      });
      if (r2) created++; else skipped++;
    }

    // ── job.assigned ─────────────────────────────────────────────────────────
    if (job.tech_id) {
      const iKeyAssign = `backfill:${jid}:job.assigned`;
      attempted++;
      const r3 = await recordActivity({
        accountId: acct, jobId: jid,
        eventType: 'job.assigned',
        actor: { type: 'system', name: 'System' },
        summary: 'Technician assigned',
        metadata: { techId: job.tech_id },
        occurredAt: new Date(job.created_at),
        source: 'historical_backfill',
        idempotencyKey: iKeyAssign,
        techId: job.tech_id,
      });
      if (r3) created++; else skipped++;
    }

    // ── job.emergency_activated ──────────────────────────────────────────────
    if (job.emergency_declared_at) {
      const iKeyEm = `backfill:${jid}:job.emergency_activated`;
      attempted++;
      let actorName = 'System';
      if (job.emergency_declared_by) {
        const { rows: [u] } = await pool.query('SELECT name FROM users WHERE id = $1', [job.emergency_declared_by])
          .catch(() => ({ rows: [{}] }));
        actorName = u?.name || 'System';
      }
      const r4 = await recordActivity({
        accountId: acct, jobId: jid,
        eventType: 'job.emergency_activated',
        actor: { id: job.emergency_declared_by, name: actorName, type: job.emergency_declared_by ? 'user' : 'system' },
        summary: `Emergency declared — ${job.emergency_priority?.toUpperCase() ?? 'unknown priority'}`,
        metadata: {
          priority: job.emergency_priority,
          reasonCode: job.emergency_reason_code,
          responseTargetMinutes: job.emergency_response_target_minutes,
        },
        occurredAt: new Date(job.emergency_declared_at),
        source: 'historical_backfill',
        idempotencyKey: iKeyEm,
      });
      if (r4) created++; else skipped++;
    }

    // ── job.emergency_resolved / deactivated ─────────────────────────────────
    if (job.emergency_deactivated_at && (job.emergency_status === 'resolved' || job.emergency_status === 'deactivated')) {
      const finalEvt = job.emergency_status === 'resolved' ? 'job.emergency_resolved' : 'job.emergency_deactivated';
      const iKeyFinal = `backfill:${jid}:${finalEvt}`;
      attempted++;
      const r5 = await recordActivity({
        accountId: acct, jobId: jid,
        eventType: finalEvt,
        actor: { type: 'system', name: 'System' },
        summary: job.emergency_status === 'resolved' ? 'Emergency resolved' : 'Emergency deactivated',
        metadata: { reason: job.emergency_deactivation_reason },
        occurredAt: new Date(job.emergency_deactivated_at),
        source: 'historical_backfill',
        idempotencyKey: iKeyFinal,
      });
      if (r5) created++; else skipped++;
    }

    // ── job.completed ────────────────────────────────────────────────────────
    if (job.status === 'complete' && job.completed_at) {
      const iKeyComp = `backfill:${jid}:job.completed`;
      attempted++;
      const r6 = await recordActivity({
        accountId: acct, jobId: jid,
        eventType: 'job.completed',
        actor: { type: 'system', name: 'System' },
        summary: 'Job completed',
        metadata: { service_type: job.service_type },
        occurredAt: new Date(job.completed_at),
        source: 'historical_backfill',
        idempotencyKey: iKeyComp,
      });
      if (r6) created++; else skipped++;
    }

    // ── job.cancelled ────────────────────────────────────────────────────────
    if (job.status === 'cancelled') {
      const iKeyCanc = `backfill:${jid}:job.cancelled`;
      attempted++;
      const r7 = await recordActivity({
        accountId: acct, jobId: jid,
        eventType: 'job.cancelled',
        actor: { type: 'system', name: 'System' },
        summary: 'Job cancelled',
        metadata: {},
        occurredAt: new Date(job.created_at),
        source: 'historical_backfill',
        idempotencyKey: iKeyCanc,
      });
      if (r7) created++; else skipped++;
    }
  }

  console.log(JSON.stringify({
    event: 'job_activity.backfill_complete',
    accountId: accountId || 'all',
    durationMs: Date.now() - t0,
    attempted, created, skipped,
  }));

  return { attempted, created, skipped };
}

module.exports = { recordActivity, backfillJobHistory };
