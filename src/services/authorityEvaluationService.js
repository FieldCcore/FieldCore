'use strict';

/**
 * Authority Evaluation Service — loader, persister, and service entry point.
 *
 * evaluateAuthority(request, actorContext) is the single public entry point.
 * It:
 *   1. Validates inputs
 *   2. Loads canonical data from DB (with FOR SHARE lock on instrument)
 *   3. Checks idempotency key — returns stale replay or cached result
 *   4. Delegates to pure engine core (no I/O in core)
 *   5. Persists the evaluation row atomically with idempotency key
 *   6. Returns the evaluation result
 *
 * Concurrency note:
 *   We take SELECT ... FOR SHARE on the instrument to prevent concurrent
 *   status-transition transactions (which use FOR UPDATE) from racing with
 *   our load+evaluate step. A concurrent FOR UPDATE will block until our
 *   transaction commits, ensuring we never evaluate stale status.
 *
 * AI isolation guarantee:
 *   This module does not import @anthropic-ai/sdk or any AI provider.
 *
 * Audit:
 *   Every evaluation (including replays) writes one audit record.
 */

const pool        = require('../db/pool');
const audit       = require('./audit');
const crypto      = require('crypto');
const authorityCrypto = require('./authorityCrypto');

const { evaluate }               = require('./authorityEngineCore');
const policyRegistry             = require('./authorityPolicyRegistry');
const restrictionEvaluators      = require('./authorityRestrictionEvaluators');
const { computeFingerprint, captureEvaluationState } = require('./authorityFingerprint');
const { OUTCOMES }               = require('./authorityReasonCodes');

// ── Constants ─────────────────────────────────────────────────────────────────

const IDEMPOTENCY_FRESHNESS_FIELDS = [
  // Fields that must be identical for a replay to be valid
  'instrument_id', 'requesting_party_id', 'action_key',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function _badRequest(msg) {
  const e = new Error(msg);
  e.statusCode = 400;
  return e;
}

function _notFound() {
  const e = new Error('Not found.');
  e.statusCode = 404;
  return e;
}

function _forbidden(msg) {
  const e = new Error(msg || 'Forbidden.');
  e.statusCode = 403;
  return e;
}

async function _assertInstitutionAccount(accountId) {
  const { rows } = await pool.query(
    `SELECT account_type FROM accounts WHERE id = $1`, [accountId]
  );
  if (!rows.length || rows[0].account_type !== 'institution') {
    throw _forbidden('Authority evaluation requires an institution account.');
  }
}

// ── Loader ────────────────────────────────────────────────────────────────────

/**
 * Load all canonical data for an instrument within a transaction.
 * Takes FOR SHARE on the instrument row.
 *
 * @param {object} txClient  - pg PoolClient in an active transaction
 * @param {string} accountId
 * @param {string} instrumentId
 * @returns {{ instrument, participants, permissions, restrictions }}
 */
async function _loadCanonicalData(txClient, accountId, instrumentId) {
  // Lock instrument FOR SHARE (prevents concurrent FOR UPDATE status transitions)
  const { rows: instrRows } = await txClient.query(
    `SELECT id, account_id, instrument_type, status,
            effective_date, expiration_date, jurisdiction,
            verified_at, revoked_at, expired_at, rejected_at,
            superseded_by_instrument_id
     FROM authority_instruments
     WHERE account_id = $1 AND id = $2
     FOR SHARE`,
    [accountId, instrumentId]
  );
  if (!instrRows.length) return null;
  const instrument = instrRows[0];

  const [participantsResult, permissionsResult, restrictionsResult] = await Promise.all([
    txClient.query(
      `SELECT id, party_id, role, status, sequence
       FROM authority_instrument_parties
       WHERE account_id = $1 AND instrument_id = $2
       ORDER BY sequence ASC NULLS LAST, id ASC`,
      [accountId, instrumentId]
    ),
    txClient.query(
      `SELECT id, action_key, grant_type, participant_id
       FROM authority_permissions
       WHERE account_id = $1 AND instrument_id = $2
       ORDER BY id ASC`,
      [accountId, instrumentId]
    ),
    txClient.query(
      `SELECT id, permission_id, restriction_type, parameters,
              effective_from, effective_to
       FROM authority_restrictions
       WHERE account_id = $1 AND instrument_id = $2
       ORDER BY id ASC`,
      [accountId, instrumentId]
    ),
  ]);

  return {
    instrument,
    participants: participantsResult.rows,
    permissions:  permissionsResult.rows,
    restrictions: restrictionsResult.rows,
  };
}

// ── Idempotency ───────────────────────────────────────────────────────────────

/**
 * Check if an idempotency key already exists for this account.
 * Returns the existing row if found, null otherwise.
 */
async function _checkIdempotency(txClient, accountId, idempotencyKey) {
  const { rows } = await txClient.query(
    `SELECT id, outcome, reason_code, reason_detail,
            canonical_rules_fingerprint, evaluation_state_snapshot,
            instrument_id, requesting_party_id, requested_action_key,
            evaluated_at, policy_version
     FROM authority_evaluations
     WHERE account_id = $1 AND idempotency_key = $2`,
    [accountId, idempotencyKey]
  );
  return rows[0] || null;
}

/**
 * Validate that a replay is fresh: the key fields of the original request
 * match the new request. If they differ, return IDEMPOTENCY_REPLAY_STALE.
 */
function _validateReplayFreshness(existing, request) {
  if (existing.instrument_id !== request.instrumentId) return false;
  if (existing.requesting_party_id !== request.requestingPartyId) return false;
  if (existing.requested_action_key !== (request.actionKey || null)) return false;
  return true;
}

// ── Persister ─────────────────────────────────────────────────────────────────

async function _persistEvaluation(txClient, {
  accountId, instrumentId, idempotencyKey,
  outcome, reasonCode, reasonDetail,
  policyVersion, fingerprint, stateSnapshot,
  runtimeContext, evaluatedAt, actionTime,
  actionKey, requestingPartyId,
}) {
  // Encrypt runtime_context if present
  let encryptedContext = null;
  if (runtimeContext) {
    encryptedContext = authorityCrypto.encrypt(
      typeof runtimeContext === 'string' ? runtimeContext : JSON.stringify(runtimeContext)
    );
  }

  const stateSnapshotJson = typeof stateSnapshot === 'string'
    ? stateSnapshot
    : JSON.stringify(stateSnapshot);

  const { rows } = await txClient.query(
    `INSERT INTO authority_evaluations
       (account_id, instrument_id, idempotency_key,
        outcome, reason_code, reason_detail,
        policy_version, canonical_rules_fingerprint, evaluation_state_snapshot,
        runtime_context, evaluated_at, action_time,
        requested_action_key, requesting_party_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id`,
    [
      accountId, instrumentId, idempotencyKey,
      outcome, reasonCode, reasonDetail || null,
      policyVersion, fingerprint, stateSnapshotJson,
      encryptedContext, evaluatedAt, actionTime || null,
      actionKey || null, requestingPartyId || null,
    ]
  );
  return rows[0].id;
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * evaluateAuthority(request, actorContext) → EvaluationResult
 *
 * @param {object} request
 *   instrumentId        {string}  UUID of the authority_instruments row
 *   requestingPartyId   {string}  UUID of the authority_parties row for the delegate
 *   actionKey           {string}  e.g. "BANKING.WIRE_TRANSFER"
 *   amount              {number|null}  integer minor-units (required for monetary restrictions)
 *   currency            {string|null}  ISO 4217 (e.g. "USD")
 *   actionTime          {string|null}  ISO-8601 timestamp for date checks (default: evaluatedAt)
 *   idempotencyKey      {string}  caller-supplied deduplication key
 *
 * @param {object} actorContext
 *   accountId           {string}  from req.accountId (JWT)
 *   userId              {string}  from req.userId (JWT)
 *   ipAddress           {string|null}
 *
 * @returns {Promise<{
 *   evaluationId: string,
 *   outcome: string,
 *   reasonCode: string,
 *   reasonDetail: string|null,
 *   isReplay: boolean,
 *   evaluated_at: string,
 * }>}
 */
async function evaluateAuthority(request, actorContext) {
  const {
    instrumentId, requestingPartyId, actionKey,
    amount, currency, actionTime, idempotencyKey,
  } = request;
  const { accountId, userId, ipAddress } = actorContext;

  // ── Validate required inputs ──────────────────────────────────────────────
  if (!instrumentId)   throw _badRequest('instrumentId is required.');
  if (!idempotencyKey) throw _badRequest('idempotencyKey is required.');

  await _assertInstitutionAccount(accountId);

  const evaluatedAt = new Date().toISOString();
  const effectiveActionTime = actionTime || evaluatedAt;

  const txClient = await pool.connect();
  try {
    await txClient.query('BEGIN');

    // ── Idempotency check ─────────────────────────────────────────────────
    const existing = await _checkIdempotency(txClient, accountId, idempotencyKey);
    if (existing) {
      // Validate freshness before replaying
      if (!_validateReplayFreshness(existing, request)) {
        // Stale replay — inputs changed; return MANUAL_REVIEW
        await txClient.query('ROLLBACK');
        await audit.log(
          accountId, userId, 'authority.evaluation.replay_stale',
          'authority_evaluation', existing.id,
          { idempotencyKey, instrumentId, requestingPartyId },
          ipAddress
        );
        return {
          evaluationId:  existing.id,
          outcome:       OUTCOMES.MANUAL_REVIEW,
          reasonCode:    'IDEMPOTENCY_REPLAY_STALE',
          reasonDetail:  null,
          isReplay:      true,
          evaluated_at:  existing.evaluated_at,
        };
      }
      // Valid replay — return original result
      await txClient.query('ROLLBACK');
      await audit.log(
        accountId, userId, 'authority.evaluation.replayed',
        'authority_evaluation', existing.id,
        { idempotencyKey, outcome: existing.outcome },
        ipAddress
      );
      return {
        evaluationId:  existing.id,
        outcome:       existing.outcome,
        reasonCode:    existing.reason_code,
        reasonDetail:  existing.reason_detail || null,
        isReplay:      true,
        evaluated_at:  existing.evaluated_at,
      };
    }

    // ── Load canonical data ───────────────────────────────────────────────
    const canonicalData = await _loadCanonicalData(txClient, accountId, instrumentId);
    if (!canonicalData) {
      await txClient.query('ROLLBACK');
      throw _notFound();
    }
    const { instrument, participants, permissions, restrictions } = canonicalData;

    // ── Compute fingerprint and state snapshot ────────────────────────────
    const fingerprint   = computeFingerprint(instrument, participants, permissions, restrictions);
    const stateSnapshot = captureEvaluationState(instrument);

    // ── Pure evaluation ───────────────────────────────────────────────────
    const engineRequest = { requestingPartyId, actionKey, amount, currency };
    const temporalContext = { evaluated_at: evaluatedAt, action_time: effectiveActionTime };

    const { outcome, reasonCode, reasonDetail } = evaluate(
      { instrument, participants, permissions, restrictions },
      engineRequest,
      temporalContext,
      policyRegistry,
      restrictionEvaluators
    );

    // ── Persist result ────────────────────────────────────────────────────
    const evaluationId = await _persistEvaluation(txClient, {
      accountId,
      instrumentId,
      idempotencyKey,
      outcome,
      reasonCode,
      reasonDetail: reasonDetail || null,
      policyVersion: policyRegistry.POLICY_VERSION,
      fingerprint,
      stateSnapshot,
      runtimeContext: null,
      evaluatedAt,
      actionTime: actionTime || null,
      actionKey:  actionKey  || null,
      requestingPartyId: requestingPartyId || null,
    });

    await audit.logInTx(
      txClient, accountId, userId, 'authority.evaluation.completed',
      'authority_evaluation', evaluationId,
      { outcome, reasonCode, instrumentId, requestingPartyId },
      ipAddress
    );

    await txClient.query('COMMIT');

    return {
      evaluationId,
      outcome,
      reasonCode,
      reasonDetail: reasonDetail || null,
      isReplay:     false,
      evaluated_at: evaluatedAt,
    };
  } catch (err) {
    try { await txClient.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    txClient.release();
  }
}

/**
 * getEvaluation(accountId, evaluationId) — read a single evaluation record.
 * Does not decrypt runtime_context.
 */
async function getEvaluation(accountId, evaluationId) {
  const { rows } = await pool.query(
    `SELECT id, instrument_id, idempotency_key, outcome, reason_code, reason_detail,
            policy_version, canonical_rules_fingerprint, evaluation_state_snapshot,
            evaluated_at, action_time, requested_action_key, requesting_party_id,
            created_at
     FROM authority_evaluations
     WHERE account_id = $1 AND id = $2`,
    [accountId, evaluationId]
  );
  if (!rows.length) {
    const e = new Error('Not found.'); e.statusCode = 404; throw e;
  }
  return rows[0];
}

/**
 * listEvaluations(accountId, { instrumentId, limit, offset }) — paginated list.
 */
async function listEvaluations(accountId, { instrumentId, limit = 50, offset = 0 } = {}) {
  const params = [accountId];
  let filter = '';
  if (instrumentId) {
    params.push(instrumentId);
    filter = `AND instrument_id = $${params.length}`;
  }
  const safeLimit  = Math.min(Math.max(parseInt(limit,  10) || 50, 1), 200);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
  params.push(safeLimit, safeOffset);

  const { rows } = await pool.query(
    `SELECT id, instrument_id, outcome, reason_code, reason_detail,
            policy_version, evaluated_at, action_time, requested_action_key,
            requesting_party_id, created_at
     FROM authority_evaluations
     WHERE account_id = $1 ${filter}
     ORDER BY evaluated_at DESC, id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

module.exports = { evaluateAuthority, getEvaluation, listEvaluations };
