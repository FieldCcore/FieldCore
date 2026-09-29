'use strict';

/**
 * Authority Evaluation Service — loader, persister, and service entry point.
 *
 * evaluateAuthority(request, actorContext, opts) is the single public entry point.
 * It:
 *   1. Validates inputs (both identities mandatory; requestedAt required with idempotencyKey)
 *   2. Opens DB transaction, takes FOR SHARE lock on instrument
 *   3. Captures evaluatedAt AFTER lock acquisition (post-lock temporal consistency)
 *   4. Checks idempotency — returns cached result or HTTP 409 on conflict / stale
 *   5. Delegates to pure engine core (no I/O in core)
 *   6. Persists the evaluation row atomically with audit inside the transaction
 *   7. Returns the evaluation result
 *
 * Concurrency note:
 *   We take SELECT ... FOR SHARE on the instrument to prevent concurrent
 *   status-transition transactions (which use FOR UPDATE) from racing with
 *   our load+evaluate step.
 *
 * AI isolation guarantee:
 *   This module does not import @anthropic-ai/sdk or any AI provider.
 *
 * Audit:
 *   Every evaluation (including replays) writes one audit record inside its transaction.
 */

const pool        = require('../db/pool');
const audit       = require('./audit');
const crypto      = require('crypto');
const authorityCrypto = require('./authorityCrypto');

const { evaluate }               = require('./authorityEngineCore');
const _defaultPolicyRegistry     = require('./authorityPolicyRegistry');
const restrictionEvaluators      = require('./authorityRestrictionEvaluators');
const { computeFingerprint, recomputeFingerprint, captureEvaluationState, FINGERPRINT_ALGORITHM } = require('./authorityFingerprint');
const { OUTCOMES }               = require('./authorityReasonCodes');

// ── Constants ─────────────────────────────────────────────────────────────────

// Maximum allowed clock skew between evaluatedAt and requestedAt (5 minutes).
const REQUEST_CLOCK_SKEW_MS = 5 * 60 * 1000;

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

function _conflict(msg, extra = {}) {
  const e = new Error(msg || 'Conflict.');
  e.statusCode = 409;
  Object.assign(e, extra);
  return e;
}

function _unprocessable(msg) {
  const e = new Error(msg);
  e.statusCode = 422;
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

// ── Request fingerprint ───────────────────────────────────────────────────────

/**
 * Compute a SHA-256 fingerprint over the normalized evaluation request fields.
 * Used for idempotency conflict detection (different request → HTTP 409).
 */
function computeRequestFingerprint(request) {
  const normalized = {
    instrumentId:     request.instrumentId     || null,
    delegatePartyId:  request.delegatePartyId  || null,
    principalPartyId: request.principalPartyId || null,
    actionKey:        request.actionKey        || null,
    amount:           request.amount           !== undefined ? request.amount : null,
    currency:         request.currency         || null,
    actionTime:       request.actionTime       || null,
  };
  return crypto.createHash('sha256')
    .update(JSON.stringify(normalized), 'utf8')
    .digest('hex');
}

// ── Loader ────────────────────────────────────────────────────────────────────

/**
 * Load all canonical data for an instrument within a transaction.
 * Takes FOR SHARE on the instrument row to block concurrent status transitions.
 */
async function _loadCanonicalData(txClient, accountId, instrumentId) {
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

async function _checkIdempotency(txClient, accountId, idempotencyKey) {
  const { rows } = await txClient.query(
    `SELECT id, outcome, reason_codes, reason_code, reason_detail,
            canonical_rules_fingerprint, evaluation_state_snapshot,
            instrument_id, requesting_party_id, delegate_party_id,
            principal_party_id, requested_action_key,
            evaluated_at, policy_version, rule_version,
            request_fingerprint
     FROM authority_evaluations
     WHERE account_id = $1 AND idempotency_key = $2`,
    [accountId, idempotencyKey]
  );
  return rows[0] || null;
}

/**
 * 8-point idempotency freshness model.
 *
 * Check 1: request_fingerprint — different normalized request → KEY_CONFLICT
 * Check 2: instrument_id
 * Check 3: delegate_party_id
 * Check 4: action_key
 * Check 5: principal_party_id
 * Check 6: policy_version
 * Check 7: canonical_rules_fingerprint (instrument state / rules changed)
 * Check 8: instrument lifecycle status — if REVOKED/EXPIRED/SUPERSEDED since original evaluation
 *
 * Returns { fresh: true } or { fresh: false, staleReason: string }.
 */
function _validateReplayFreshness(existing, request, currentData) {
  const currentFingerprint = currentData ? recomputeFingerprint(currentData) : null;
  const newFingerprint = computeRequestFingerprint(request);

  // Check 1: request fingerprint
  if (existing.request_fingerprint && newFingerprint !== existing.request_fingerprint) {
    return { fresh: false, staleReason: 'request_fingerprint_mismatch' };
  }

  // Check 2: instrument ID
  if (existing.instrument_id !== request.instrumentId) {
    return { fresh: false, staleReason: 'instrument_id_changed' };
  }

  // Check 3: delegate party
  const newDelegate = request.delegatePartyId || null;
  const existingDelegate = existing.delegate_party_id || existing.requesting_party_id || null;
  if (existingDelegate !== newDelegate) {
    return { fresh: false, staleReason: 'delegate_party_changed' };
  }

  // Check 4: action key
  if (existing.requested_action_key !== (request.actionKey || null)) {
    return { fresh: false, staleReason: 'action_key_changed' };
  }

  // Check 5: principal party
  if ((existing.principal_party_id || null) !== (request.principalPartyId || null)) {
    return { fresh: false, staleReason: 'principal_party_changed' };
  }

  // Check 6: policy version (requires policyRegistry reference — passed separately)
  // NOTE: caller must pass policyRegistry.POLICY_VERSION for this check — see call site.

  // Check 7: canonical rules fingerprint
  if (currentFingerprint && existing.canonical_rules_fingerprint !== currentFingerprint) {
    return { fresh: false, staleReason: 'canonical_rules_fingerprint_changed' };
  }

  // Check 8: instrument lifecycle status — if instrument transitioned to terminal status since
  // original evaluation, the replay is stale regardless of fingerprint equality.
  if (currentData && currentData.instrument) {
    const currentStatus = currentData.instrument.status;
    const TERMINAL_STATUSES = new Set(['REVOKED', 'EXPIRED', 'SUPERSEDED', 'REJECTED']);
    if (TERMINAL_STATUSES.has(currentStatus)) {
      // Parse snapshot to compare against original status
      let originalStatus = null;
      try {
        const snap = typeof existing.evaluation_state_snapshot === 'string'
          ? JSON.parse(existing.evaluation_state_snapshot)
          : existing.evaluation_state_snapshot;
        originalStatus = snap && snap.status;
      } catch {}
      if (originalStatus && originalStatus !== currentStatus) {
        return { fresh: false, staleReason: 'instrument_status_changed' };
      }
    }
  }

  return { fresh: true };
}

// ── Persister ─────────────────────────────────────────────────────────────────

async function _persistEvaluation(txClient, {
  accountId, instrumentId, idempotencyKey,
  outcome, reasonCodes, reasonCode, reasonDetail,
  policyVersion, fingerprint, stateSnapshot,
  runtimeContext, evaluatedAt, actionTime,
  actionKey, principalPartyId, delegatePartyId,
  missingFields, manualReviewReasons,
  matchedPermissionIds, appliedRestrictionIds,
  blockingPermissionIds, blockingRestrictionIds,
  ruleVersion, actionTimeSource, requestFingerprint,
}) {
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
        outcome, reason_codes, reason_code, reason_detail,
        policy_version, canonical_rules_fingerprint, evaluation_state_snapshot,
        runtime_context, evaluated_at, action_time,
        requested_action_key, principal_party_id, delegate_party_id, requesting_party_id,
        missing_fields, manual_review_reasons,
        matched_permission_ids, applied_restriction_ids,
        blocking_permission_ids, blocking_restriction_ids,
        rule_version, action_time_source, request_fingerprint,
        fingerprint_algorithm)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
     RETURNING id`,
    [
      accountId,                          // $1
      instrumentId,                       // $2
      idempotencyKey,                     // $3
      outcome,                            // $4
      JSON.stringify(reasonCodes || []),   // $5 reason_codes (JSONB)
      reasonCode || null,                 // $6 reason_code (scalar backward compat)
      reasonDetail || null,               // $7
      policyVersion,                      // $8
      fingerprint,                        // $9
      stateSnapshotJson,                  // $10
      encryptedContext,                   // $11
      evaluatedAt,                        // $12
      actionTime || null,                 // $13
      actionKey || null,                  // $14 requested_action_key
      principalPartyId || null,           // $15 principal_party_id
      delegatePartyId || null,            // $16 delegate_party_id
      delegatePartyId || null,            // $17 requesting_party_id (legacy alias column)
      JSON.stringify(missingFields || []),         // $18
      JSON.stringify(manualReviewReasons || []),   // $19
      JSON.stringify(matchedPermissionIds || []),  // $20
      JSON.stringify(appliedRestrictionIds || []), // $21
      JSON.stringify(blockingPermissionIds || []), // $22
      JSON.stringify(blockingRestrictionIds || []),// $23
      ruleVersion || null,                // $24
      actionTimeSource || null,           // $25
      requestFingerprint || null,         // $26
      FINGERPRINT_ALGORITHM,              // $27
    ]
  );
  return rows[0].id;
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * evaluateAuthority(request, actorContext, opts) → EvaluationResult
 *
 * @param {object} request
 *   instrumentId        {string}   UUID of the authority_instruments row [REQUIRED]
 *   delegatePartyId     {string}   UUID of the delegate party [REQUIRED]
 *   principalPartyId    {string}   UUID of the principal party [REQUIRED]
 *   actionKey           {string}   e.g. "BANKING.WIRE_TRANSFER"
 *   amount              {number|null}  integer minor-units (required for monetary restrictions)
 *   currency            {string|null}  ISO 4217 (e.g. "USD")
 *   actionTime          {string|null}  ISO-8601 timestamp for date checks
 *   requestedAt         {string}   ISO-8601 timestamp when request was created [REQUIRED when idempotencyKey provided]
 *   idempotencyKey      {string}   caller-supplied deduplication key [REQUIRED]
 *
 * @param {object} actorContext
 *   accountId           {string}  from req.accountId (JWT)
 *   userId              {string}  from req.userId (JWT)
 *   ipAddress           {string|null}
 *
 * @param {object} [opts]
 *   clockFn             {function}  Injectable clock — returns Date. Defaults to () => new Date()
 *   _policyRegistry     {object}    Injectable policy registry (TEST-ONLY). Defaults to production registry.
 *
 * @returns {Promise<EvaluationResult>}
 */
async function evaluateAuthority(request, actorContext, opts = {}) {
  const {
    instrumentId, actionKey,
    amount, currency, actionTime, idempotencyKey,
    requestedAt,
    delegatePartyId,
    principalPartyId,
  } = request;

  const { accountId, userId, ipAddress } = actorContext;

  // Injectable clock and policy registry (for testability)
  const clockFn        = opts.clockFn        || (() => new Date());
  const policyRegistry = opts._policyRegistry || _defaultPolicyRegistry;

  // ── Validate required inputs ──────────────────────────────────────────────
  if (!instrumentId)    throw _badRequest('instrumentId is required.');
  if (!idempotencyKey)  throw _badRequest('idempotencyKey is required.');
  if (!delegatePartyId) throw _badRequest('delegatePartyId is required.');
  if (!principalPartyId) throw _badRequest('principalPartyId is required.');

  // Closure Part 6: requestedAt is required when idempotencyKey is supplied
  if (!requestedAt) {
    throw _badRequest('requestedAt is required when idempotencyKey is provided.');
  }

  await _assertInstitutionAccount(accountId);

  // Pre-transaction clock read for skew validation
  const preTxTime      = clockFn();
  const preTxMs        = preTxTime.getTime();

  // Validate requestedAt
  const requestedAtMs = new Date(requestedAt).getTime();
  if (isNaN(requestedAtMs)) {
    throw _unprocessable('requestedAt is not a valid ISO-8601 timestamp.');
  }
  if (Math.abs(preTxMs - requestedAtMs) > REQUEST_CLOCK_SKEW_MS) {
    throw _unprocessable(
      `requestedAt is too far from server time (max skew: ${REQUEST_CLOCK_SKEW_MS / 1000}s).`
    );
  }

  const requestFingerprint = computeRequestFingerprint(request);

  const txClient = await pool.connect();
  try {
    await txClient.query('BEGIN');

    // ── Idempotency check ─────────────────────────────────────────────────
    const existing = await _checkIdempotency(txClient, accountId, idempotencyKey);
    if (existing) {
      // Load current canonical data (also acquires FOR SHARE)
      const currentData = await _loadCanonicalData(txClient, accountId, existing.instrument_id);

      // Capture evaluatedAt AFTER lock acquisition
      const evaluatedAt = clockFn().toISOString();

      // Policy version check (requires live policyRegistry reference)
      if (existing.policy_version !== policyRegistry.POLICY_VERSION) {
        await txClient.query('ROLLBACK');
        await audit.log(
          accountId, userId, 'authority.evaluation.replay_stale',
          'authority_evaluation', existing.id,
          { idempotencyKey, instrumentId: existing.instrument_id, delegatePartyId, staleReason: 'policy_version_changed' },
          ipAddress
        );
        throw _conflict('Idempotency key conflict: policy_version_changed', {
          reasonCode: 'IDEMPOTENCY_KEY_CONFLICT',
          evaluationId: existing.id,
          staleReason: 'policy_version_changed',
        });
      }

      const freshness = _validateReplayFreshness(existing, request, currentData);

      if (!freshness.fresh) {
        const staleReason = freshness.staleReason;
        await txClient.query('ROLLBACK');
        await audit.log(
          accountId, userId, 'authority.evaluation.replay_stale',
          'authority_evaluation', existing.id,
          { idempotencyKey, instrumentId: existing.instrument_id, delegatePartyId, staleReason },
          ipAddress
        );
        throw _conflict(`Idempotency key conflict: ${staleReason}`, {
          reasonCode:   'IDEMPOTENCY_KEY_CONFLICT',
          evaluationId: existing.id,
          staleReason,
        });
      }

      // Valid replay — audit inside a minimal inner transaction (Part 13)
      await audit.logInTx(
        txClient, accountId, userId, 'authority.evaluation.replayed',
        'authority_evaluation', existing.id,
        { idempotencyKey, outcome: existing.outcome },
        ipAddress
      );
      await txClient.query('COMMIT');

      const existingReasonCodes = existing.reason_codes
        ? (Array.isArray(existing.reason_codes) ? existing.reason_codes : JSON.parse(existing.reason_codes))
        : (existing.reason_code ? [existing.reason_code] : []);

      return {
        evaluationId:           existing.id,
        decision:               existing.outcome,
        outcome:                existing.outcome,
        reasonCodes:            existingReasonCodes,
        reasonCode:             existing.reason_code || existingReasonCodes[0] || null,
        reasonDetail:           existing.reason_detail || null,
        missingFields:          [],
        manualReviewReasons:    [],
        matchedPermissionIds:   [],
        appliedRestrictionIds:  [],
        blockingPermissionIds:  [],
        blockingRestrictionIds: [],
        isReplay:               true,
        replayed:               true,
        replayCheckedAt:        evaluatedAt,
        evaluated_at:           existing.evaluated_at,
      };
    }

    // ── Load canonical data (FOR SHARE lock) ─────────────────────────────
    const canonicalData = await _loadCanonicalData(txClient, accountId, instrumentId);
    if (!canonicalData) {
      await txClient.query('ROLLBACK');
      throw _notFound();
    }
    const { instrument, participants, permissions, restrictions } = canonicalData;

    // ── Capture evaluatedAt AFTER lock acquisition (Closure Part 5) ──────
    const evaluatedAt = clockFn().toISOString();

    // ── Compute fingerprint and state snapshot ────────────────────────────
    const fingerprint   = computeFingerprint(instrument, participants, permissions, restrictions);
    const stateSnapshot = captureEvaluationState(instrument);

    // ── Pure evaluation ───────────────────────────────────────────────────
    const engineRequest = {
      delegatePartyId,
      principalPartyId,
      actionKey,
      amount,
      currency,
    };
    const effectiveActionTime = actionTime || evaluatedAt;
    const temporalContext = { evaluated_at: evaluatedAt, action_time: effectiveActionTime };

    const engineResult = evaluate(
      { instrument, participants, permissions, restrictions },
      engineRequest,
      temporalContext,
      policyRegistry,
      restrictionEvaluators
    );

    const {
      decision,
      reasonCodes,
      reasonCode,
      reasonDetail,
      missingFields,
      manualReviewReasons,
      matchedPermissionIds,
      appliedRestrictionIds,
      blockingPermissionIds,
      blockingRestrictionIds,
    } = engineResult;

    const actionTimeSource = actionTime ? 'request' : 'evaluated_at';

    // ── Persist result + audit inside transaction ─────────────────────────
    const evaluationId = await _persistEvaluation(txClient, {
      accountId,
      instrumentId,
      idempotencyKey,
      outcome:           decision,
      reasonCodes:       reasonCodes || [reasonCode],
      reasonCode:        reasonCode || null,
      reasonDetail:      reasonDetail || null,
      policyVersion:     policyRegistry.POLICY_VERSION,
      fingerprint,
      stateSnapshot,
      runtimeContext:    null,
      evaluatedAt,
      actionTime:        actionTime || null,
      actionKey:         actionKey  || null,
      principalPartyId:  principalPartyId  || null,
      delegatePartyId:   delegatePartyId   || null,
      missingFields:     missingFields     || [],
      manualReviewReasons: manualReviewReasons || [],
      matchedPermissionIds:   matchedPermissionIds   || [],
      appliedRestrictionIds:  appliedRestrictionIds  || [],
      blockingPermissionIds:  blockingPermissionIds  || [],
      blockingRestrictionIds: blockingRestrictionIds || [],
      ruleVersion:       policyRegistry.POLICY_VERSION,
      actionTimeSource,
      requestFingerprint,
    });

    await audit.logInTx(
      txClient, accountId, userId, 'authority.evaluation.completed',
      'authority_evaluation', evaluationId,
      { outcome: decision, reasonCode: reasonCode || (reasonCodes && reasonCodes[0]), instrumentId, delegatePartyId },
      ipAddress
    );

    await txClient.query('COMMIT');

    return {
      evaluationId,
      decision,
      outcome:                decision,
      reasonCodes:            reasonCodes || [reasonCode],
      reasonCode:             reasonCode || null,
      reasonDetail:           reasonDetail || null,
      missingFields:          missingFields          || [],
      manualReviewReasons:    manualReviewReasons    || [],
      matchedPermissionIds:   matchedPermissionIds   || [],
      appliedRestrictionIds:  appliedRestrictionIds  || [],
      blockingPermissionIds:  blockingPermissionIds  || [],
      blockingRestrictionIds: blockingRestrictionIds || [],
      isReplay:               false,
      replayed:               false,
      evaluated_at:           evaluatedAt,
    };
  } catch (err) {
    try { await txClient.query('ROLLBACK'); } catch {}
    // 23505 = unique_violation — concurrent call with same idempotency key won the race.
    // Roll back and fetch the winner's row to return a replay, rather than surfacing a DB error.
    if (err.code === '23505' && idempotencyKey) {
      try {
        const { rows } = await pool.query(
          `SELECT id, outcome, reason_codes, reason_code, reason_detail, evaluated_at
           FROM authority_evaluations
           WHERE account_id = $1 AND idempotency_key = $2`,
          [accountId, idempotencyKey]
        );
        if (rows.length) {
          const row = rows[0];
          const existingReasonCodes = row.reason_codes
            ? (Array.isArray(row.reason_codes) ? row.reason_codes : JSON.parse(row.reason_codes))
            : (row.reason_code ? [row.reason_code] : []);
          return {
            evaluationId:           row.id,
            decision:               row.outcome,
            outcome:                row.outcome,
            reasonCodes:            existingReasonCodes,
            reasonCode:             row.reason_code || existingReasonCodes[0] || null,
            reasonDetail:           row.reason_detail || null,
            missingFields:          [],
            manualReviewReasons:    [],
            matchedPermissionIds:   [],
            appliedRestrictionIds:  [],
            blockingPermissionIds:  [],
            blockingRestrictionIds: [],
            isReplay:               true,
            replayed:               true,
            replayCheckedAt:        new Date().toISOString(),
            evaluated_at:           row.evaluated_at,
          };
        }
      } catch (_) {}
    }
    throw err;
  } finally {
    txClient.release();
  }
}

/**
 * getEvaluation — read a single evaluation record.
 */
async function getEvaluation(accountId, evaluationId) {
  const { rows } = await pool.query(
    `SELECT id, instrument_id, idempotency_key, outcome, reason_codes, reason_code, reason_detail,
            policy_version, canonical_rules_fingerprint, evaluation_state_snapshot,
            evaluated_at, action_time, requested_action_key, requesting_party_id,
            delegate_party_id, principal_party_id,
            missing_fields, manual_review_reasons,
            matched_permission_ids, applied_restriction_ids,
            blocking_permission_ids, blocking_restriction_ids,
            fingerprint_algorithm, created_at
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
 * listEvaluations — paginated list.
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
    `SELECT id, instrument_id, outcome, reason_codes, reason_code, reason_detail,
            policy_version, evaluated_at, action_time, requested_action_key,
            requesting_party_id, delegate_party_id, principal_party_id, created_at
     FROM authority_evaluations
     WHERE account_id = $1 ${filter}
     ORDER BY evaluated_at DESC, id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

module.exports = { evaluateAuthority, getEvaluation, listEvaluations };
