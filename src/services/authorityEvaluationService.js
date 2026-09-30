'use strict';

/**
 * Authority Evaluation Service — loader, persister, and service entry point.
 *
 * evaluateAuthority(request, actorContext, opts) is the single public entry point.
 * It:
 *   1. Validates inputs (both identities mandatory; requestedAt required; strict schema)
 *   2. Opens DB transaction, takes FOR SHARE lock on instrument
 *   3. Captures evaluatedAt AFTER lock acquisition (post-lock temporal consistency)
 *   4. Validates requestedAt vs evaluatedAt skew AFTER the lock (Part 2 closure)
 *   5. Checks idempotency — returns cached result or HTTP 409 on conflict / stale
 *   6. Delegates to pure engine core (no I/O in core)
 *   7. Persists the evaluation row atomically with audit inside the transaction
 *   8. Returns the evaluation result
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
 *
 *   Stale-replay audit exception: when the freshness check fails, we ROLLBACK
 *   (a stale replay must not commit any state change). The stale-replay event
 *   is then written via `audit.log` (pool-level, outside any transaction). This
 *   is the correct pattern because (a) there is no active transaction to attach
 *   the audit row to after ROLLBACK, and (b) the event records an attempted
 *   (rejected) replay, not a committed state change.
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

// Part 10 closure: strict request schema — only these top-level fields are accepted.
const KNOWN_REQUEST_FIELDS = new Set([
  'instrumentId', 'delegatePartyId', 'principalPartyId', 'actionKey',
  'idempotencyKey', 'requestedAt', 'amount', 'currency',
]);

// Statuses that are terminal (evaluation of a replay must fail freshness).
const TERMINAL_STATUSES = new Set(['REVOKED', 'EXPIRED', 'SUPERSEDED', 'REJECTED']);

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

function _unprocessable(msg, extra = {}) {
  const e = new Error(msg);
  e.statusCode = 422;
  Object.assign(e, extra);
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

/**
 * Part 12 closure: validate that a party belongs to the same tenant.
 * The FKs on principal_party_id and delegate_party_id have been dropped —
 * this service-level check is the enforcer.
 */
async function _assertPartyBelongsToTenant(txClient, accountId, partyId, label) {
  const { rows } = await txClient.query(
    `SELECT id FROM authority_parties WHERE id = $1 AND account_id = $2`,
    [partyId, accountId]
  );
  if (!rows.length) {
    throw _badRequest(`${label} does not belong to this account.`);
  }
}

// ── Request fingerprint ───────────────────────────────────────────────────────

/**
 * Compute a SHA-256 fingerprint over the SEMANTIC content of the evaluation
 * request. Delivery metadata (idempotencyKey, requestedAt) is intentionally
 * excluded so that legitimate retries of the same semantic request produce
 * the same fingerprint even when time has passed.
 */
function computeRequestFingerprint(request) {
  const normalized = {
    instrumentId:     request.instrumentId     || null,
    delegatePartyId:  request.delegatePartyId  || null,
    principalPartyId: request.principalPartyId || null,
    actionKey:        request.actionKey        || null,
    amount:           request.amount           !== undefined ? request.amount : null,
    currency:         request.currency         || null,
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
            evaluated_at, action_time, action_time_source,
            policy_version, rule_version,
            request_fingerprint,
            missing_fields, manual_review_reasons,
            matched_permission_ids, applied_restriction_ids,
            blocking_permission_ids, blocking_restriction_ids
     FROM authority_evaluations
     WHERE account_id = $1 AND idempotency_key = $2`,
    [accountId, idempotencyKey]
  );
  return rows[0] || null;
}

/**
 * Part 3 closure — full replay freshness model (13 checks).
 *
 * Preconditions:
 *   - Caller has already taken FOR SHARE on the instrument.
 *   - Caller has already validated the requestedAt-vs-replayCheckedAt skew
 *     window BEFORE calling this function (check #3 lives in the service).
 *   - Caller has already validated policy_version equality (check #12 lives
 *     in the service so we can short-circuit before loading data).
 *
 * Checks performed here (all must pass):
 *   1. Instrument exists (currentData not null) — 'instrument_not_found'
 *   4. Lifecycle status transition eligibility — 'instrument_status_changed'
 *   5. Current status is NOT terminal — 'instrument_status_ineligible'
 *   6. Effective-date eligibility (using replayCheckedAt date)
 *      — 'before_effective_date'
 *   7. Expiration-date eligibility (using replayCheckedAt date)
 *      — 'after_expiration_date'
 *   8. Every date_window restriction that was applicable in the original
 *      evaluation must produce the same outcome with replayCheckedAt as
 *      action time — 'date_window_changed'
 *   9. canonical_rules_fingerprint match — 'canonical_rules_fingerprint_changed'
 *  10. evaluation_state_snapshot mutable fields match current state
 *      — 'evaluation_state_changed'
 *  11. rule_version match — 'rule_version_changed'
 *  13. Handler versions are composed into policy_version — no separate check.
 *
 * Returns { fresh: true } or { fresh: false, staleReason: string }.
 */
function _validateReplayFreshness(existing, request, currentData, replayCheckedAt, restrictionsForRecheck, opts = {}) {
  // Check 1: instrument exists
  if (!currentData || !currentData.instrument) {
    return { fresh: false, staleReason: 'instrument_not_found' };
  }

  // Check request-fingerprint match (semantic content); belongs alongside the
  // 8-check idempotency conflict path.
  const currentFingerprint = recomputeFingerprint(currentData);
  const newFingerprint     = computeRequestFingerprint(request);

  if (existing.request_fingerprint && newFingerprint !== existing.request_fingerprint) {
    return { fresh: false, staleReason: 'request_fingerprint_mismatch' };
  }

  // Semantic identity of the request (unchanged from prior implementation).
  if (existing.instrument_id !== request.instrumentId) {
    return { fresh: false, staleReason: 'instrument_id_changed' };
  }
  const newDelegate      = request.delegatePartyId || null;
  const existingDelegate = existing.delegate_party_id || existing.requesting_party_id || null;
  if (existingDelegate !== newDelegate) {
    return { fresh: false, staleReason: 'delegate_party_changed' };
  }
  if (existing.requested_action_key !== (request.actionKey || null)) {
    return { fresh: false, staleReason: 'action_key_changed' };
  }
  if ((existing.principal_party_id || null) !== (request.principalPartyId || null)) {
    return { fresh: false, staleReason: 'principal_party_changed' };
  }

  const currentStatus = currentData.instrument.status;

  // Parse original snapshot once.
  let originalSnapshot = null;
  try {
    originalSnapshot = typeof existing.evaluation_state_snapshot === 'string'
      ? JSON.parse(existing.evaluation_state_snapshot)
      : existing.evaluation_state_snapshot;
  } catch { originalSnapshot = null; }
  const originalStatus = originalSnapshot && originalSnapshot.status;

  // Check 4: lifecycle status transition.
  // If the current status differs from the original AND is terminal, that is a
  // stale transition. If both are still VERIFIED, we continue.
  if (originalStatus && originalStatus !== currentStatus) {
    return { fresh: false, staleReason: 'instrument_status_changed' };
  }

  // Check 5: current status must not be terminal.
  if (TERMINAL_STATUSES.has(currentStatus)) {
    return { fresh: false, staleReason: 'instrument_status_ineligible' };
  }

  // Check 6 & 7: effective-date / expiration-date eligibility using replayCheckedAt.
  const replayDate = String(replayCheckedAt).slice(0, 10);
  const effDate = currentData.instrument.effective_date
    ? _dateToStr(currentData.instrument.effective_date) : null;
  const expDate = currentData.instrument.expiration_date
    ? _dateToStr(currentData.instrument.expiration_date) : null;

  if (effDate && replayDate < effDate) {
    return { fresh: false, staleReason: 'before_effective_date' };
  }
  if (expDate && replayDate > expDate) {
    return { fresh: false, staleReason: 'after_expiration_date' };
  }

  // Check 8: date_window restrictions produce the same outcome at replayCheckedAt.
  // Re-evaluate each date_window restriction using replayCheckedAt; if any goes
  // from "would-pass" at original action time to "would-fail" at replay time (or
  // vice-versa), consider the replay stale.
  if (restrictionsForRecheck && restrictionsForRecheck.evaluators &&
      restrictionsForRecheck.originalActionTime && Array.isArray(currentData.restrictions)) {
    const evaluators = restrictionsForRecheck.evaluators;
    const originalActionTime = restrictionsForRecheck.originalActionTime;
    for (const r of currentData.restrictions) {
      if (r.restriction_type !== 'date_window') continue;
      const originalCtx = { evaluated_at: existing.evaluated_at, action_time: originalActionTime };
      const replayCtx   = { evaluated_at: replayCheckedAt, action_time: replayCheckedAt };
      const originalResult = evaluators.evaluateRestriction(r, {}, originalCtx);
      const replayResult   = evaluators.evaluateRestriction(r, {}, replayCtx);
      const originalPass = !!originalResult.pass;
      const replayPass   = !!replayResult.pass;
      if (originalPass !== replayPass) {
        return { fresh: false, staleReason: 'date_window_changed' };
      }
      // If reason codes differ between the two evaluations, we also treat as stale.
      if (!originalPass && !replayPass &&
          originalResult.reasonCode !== replayResult.reasonCode) {
        return { fresh: false, staleReason: 'date_window_changed' };
      }
    }
  }

  // Check 9: canonical rules fingerprint.
  if (existing.canonical_rules_fingerprint !== currentFingerprint) {
    return { fresh: false, staleReason: 'canonical_rules_fingerprint_changed' };
  }

  // Check 10: mutable evaluation state snapshot fields match current instrument state.
  const currentSnapshot = captureEvaluationState(currentData.instrument);
  if (originalSnapshot) {
    const keys = ['status', 'verified_at', 'revoked_at', 'expired_at', 'rejected_at', 'superseded_by'];
    for (const k of keys) {
      // Normalize date-ish values by stringifying non-null/undefined.
      const a = _normSnapshotVal(originalSnapshot[k]);
      const b = _normSnapshotVal(currentSnapshot[k]);
      if (a !== b) {
        return { fresh: false, staleReason: 'evaluation_state_changed' };
      }
    }
  }

  // Check 11: rule_version match. (policy_version is checked separately by caller.)
  if (opts.currentRuleVersion && existing.rule_version &&
      existing.rule_version !== opts.currentRuleVersion) {
    return { fresh: false, staleReason: 'rule_version_changed' };
  }

  return { fresh: true };
}

function _dateToStr(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

function _normSnapshotVal(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
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
  // Stage 5 additive:
  actorType, requestingUserId, requestingApiCredentialId,
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
        fingerprint_algorithm,
        actor_type, requesting_user_id, requesting_api_credential_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
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
      actorType || 'user',                // $28  Stage 5
      requestingUserId || null,           // $29
      requestingApiCredentialId || null,  // $30
    ]
  );
  return rows[0].id;
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * evaluateAuthority(request, actorContext, opts) → EvaluationResult
 *
 * Required request fields:
 *   instrumentId, delegatePartyId, principalPartyId, actionKey, requestedAt, idempotencyKey
 * Optional request fields:
 *   amount, currency
 *
 * NOTE: `actionTime` is NOT a request field (Part 1 closure). The action time is
 * derived from `requestedAt` and stored as `action_time` on the evaluation row.
 *
 * actorContext (Stage 4 shape — unchanged, backward compatible):
 *   { accountId, userId, ipAddress }
 *
 * actorContext (Stage 5 additive — machine actor):
 *   { actor_type: 'api_credential', credential_id, account_id, scopes: [...],
 *     ipAddress? }
 *   OR the equivalent legacy user actor written explicitly:
 *   { actor_type: 'user', user_id, account_id, ipAddress? }
 *
 * When the user actor form is used, requesting_user_id is written on the
 * evaluation row alongside actor_type='user'. Machine actor writes
 * requesting_api_credential_id and actor_type='api_credential' — user_id is
 * omitted entirely per the actor-exclusive CHECK constraint.
 *
 * CRITICAL: the external API path MUST call `evaluateAuthority(request,
 * machineActor)` with NO third `opts` argument. `_policyRegistry` and
 * `clockFn` are TEST-ONLY hooks; passing either from an external boundary
 * would defeat the entire deterministic-engine guarantee.
 *
 * @param {object} request
 * @param {object} actorContext
 * @param {object} [opts]
 *   clockFn         {function}  Injectable clock — returns Date. Defaults to () => new Date()
 *   _policyRegistry {object}    Injectable policy registry (TEST-ONLY).
 * @returns {Promise<EvaluationResult>}
 */
async function evaluateAuthority(request, actorContext, opts = {}) {
  // Part 10 closure: strict schema — reject unknown top-level fields.
  if (request && typeof request === 'object') {
    const unknownFields = Object.keys(request).filter(k => !KNOWN_REQUEST_FIELDS.has(k));
    if (unknownFields.length > 0) {
      throw _badRequest(`Unknown request fields: ${unknownFields.join(', ')}`);
    }
  }

  const {
    instrumentId, actionKey,
    amount, currency, idempotencyKey,
    requestedAt,
    delegatePartyId,
    principalPartyId,
  } = request;

  // ── Actor normalization (Stage 5 additive) ────────────────────────────────
  // Support three input shapes:
  //   (a) Stage 4 legacy: { accountId, userId, ipAddress }         → 'user'
  //   (b) Stage 5 user:   { actor_type:'user', user_id, account_id, ipAddress? }
  //   (c) Stage 5 mach:   { actor_type:'api_credential', credential_id,
  //                         account_id, scopes[], ipAddress? }
  const _actorType   = (actorContext && actorContext.actor_type) || 'user';
  const accountId    = actorContext && (actorContext.accountId ?? actorContext.account_id);
  const userId       = _actorType === 'user'
    ? (actorContext && (actorContext.userId ?? actorContext.user_id)) || null
    : null;
  const credentialId = _actorType === 'api_credential'
    ? (actorContext && actorContext.credential_id) || null
    : null;
  const machineScopes = _actorType === 'api_credential' && Array.isArray(actorContext.scopes)
    ? actorContext.scopes
    : null;
  const ipAddress    = actorContext && actorContext.ipAddress || null;

  // Machine actor authorization gate (additive; user actor is unchanged).
  if (_actorType === 'api_credential') {
    if (process.env.AUTHORITY_EXTERNAL_API_ENABLED !== 'true') {
      throw _forbidden('External Authority API is not enabled.');
    }
    if (!credentialId || !accountId) {
      throw _badRequest('Machine actor context is incomplete.');
    }
    if (!machineScopes || !machineScopes.includes('authority:evaluate')) {
      throw _forbidden('Credential is missing authority:evaluate scope.');
    }
    // AUTHORITY_ENABLED is checked below via _assertInstitutionAccount which
    // ensures the account is an authority-eligible institution.
  }

  // Injectable clock and policy registry (for testability)
  const clockFn        = opts.clockFn        || (() => new Date());
  const policyRegistry = opts._policyRegistry || _defaultPolicyRegistry;

  // ── Validate required inputs ──────────────────────────────────────────────
  if (!instrumentId)     throw _badRequest('instrumentId is required.');
  if (!idempotencyKey)   throw _badRequest('idempotencyKey is required.');
  if (!delegatePartyId)  throw _badRequest('delegatePartyId is required.');
  if (!principalPartyId) throw _badRequest('principalPartyId is required.');
  if (!actionKey)        throw _badRequest('actionKey is required.');
  if (!requestedAt)      throw _badRequest('requestedAt is required.');

  await _assertInstitutionAccount(accountId);

  // Part 2 closure: basic ISO-8601 syntax check pre-transaction (not the
  // authoritative skew check — that runs AFTER the lock).
  const requestedAtMs = new Date(requestedAt).getTime();
  if (isNaN(requestedAtMs)) {
    throw _unprocessable('requestedAt is not a valid ISO-8601 timestamp.', {
      reasonCode: 'REQUESTED_AT_OUTSIDE_SUPPORTED_WINDOW',
    });
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

      // Capture replayCheckedAt AFTER lock acquisition
      const replayCheckedAt = clockFn().toISOString();
      const replayCheckedAtMs = new Date(replayCheckedAt).getTime();

      // Part 2 closure: authoritative skew check for the REPLAY path.
      if (Math.abs(replayCheckedAtMs - requestedAtMs) > REQUEST_CLOCK_SKEW_MS) {
        await txClient.query('ROLLBACK');
        throw _unprocessable(
          `requestedAt is too far from server time (max skew: ${REQUEST_CLOCK_SKEW_MS / 1000}s).`,
          { reasonCode: 'REQUESTED_AT_OUTSIDE_SUPPORTED_WINDOW' }
        );
      }

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

      const freshness = _validateReplayFreshness(
        existing, request, currentData, replayCheckedAt,
        {
          evaluators: restrictionEvaluators,
          originalActionTime: existing.action_time,
        },
        { currentRuleVersion: policyRegistry.POLICY_VERSION }
      );

      if (!freshness.fresh) {
        const staleReason = freshness.staleReason;
        await txClient.query('ROLLBACK');
        // Stale-replay audit is written outside the transaction — see the
        // header comment for the architectural rationale.
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

      // Valid replay — audit inside the transaction and commit.
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

      // Part 13 closure: return a complete result object for replays.
      return {
        evaluationId:           existing.id,
        instrumentId:           existing.instrument_id,
        principalPartyId:       existing.principal_party_id || null,
        delegatePartyId:        existing.delegate_party_id  || existing.requesting_party_id || null,
        actionKey:              existing.requested_action_key || null,
        decision:               existing.outcome,
        outcome:                existing.outcome,
        reasonCodes:            existingReasonCodes,
        reasonCode:             existing.reason_code || existingReasonCodes[0] || null,
        reasonDetail:           existing.reason_detail || null,
        missingFields:          _parseJsonArray(existing.missing_fields),
        manualReviewReasons:    _parseJsonArray(existing.manual_review_reasons),
        matchedPermissionIds:   _parseJsonArray(existing.matched_permission_ids),
        appliedRestrictionIds:  _parseJsonArray(existing.applied_restriction_ids),
        blockingPermissionIds:  _parseJsonArray(existing.blocking_permission_ids),
        blockingRestrictionIds: _parseJsonArray(existing.blocking_restriction_ids),
        ruleVersion:            existing.rule_version || existing.policy_version || null,
        policyRegistryVersion:  existing.policy_version || null,
        evaluatedAt:            existing.evaluated_at,
        actionTime:             existing.action_time || null,
        actionTimeSource:       existing.action_time_source || null,
        instrumentStatusAtEvaluation: (currentData && currentData.instrument && currentData.instrument.status) || null,
        isReplay:               true,
        replayed:               true,
        replayCheckedAt,
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

    // ── Capture evaluatedAt AFTER lock acquisition (Closure Part 5/2) ────
    const evaluatedAt = clockFn().toISOString();
    const evaluatedAtMs = new Date(evaluatedAt).getTime();

    // Part 2 closure: authoritative skew check — POST-lock.
    if (Math.abs(evaluatedAtMs - requestedAtMs) > REQUEST_CLOCK_SKEW_MS) {
      await txClient.query('ROLLBACK');
      throw _unprocessable(
        `requestedAt is too far from server time (max skew: ${REQUEST_CLOCK_SKEW_MS / 1000}s).`,
        { reasonCode: 'REQUESTED_AT_OUTSIDE_SUPPORTED_WINDOW' }
      );
    }

    // Part 12 closure: tenant-safe party references.
    await _assertPartyBelongsToTenant(txClient, accountId, delegatePartyId,  'delegatePartyId');
    await _assertPartyBelongsToTenant(txClient, accountId, principalPartyId, 'principalPartyId');

    // ── Compute fingerprint and state snapshot ────────────────────────────
    const fingerprint   = computeFingerprint(instrument, participants, permissions, restrictions);
    const stateSnapshot = captureEvaluationState(instrument);

    // Part 1 closure: derive effective action time from requestedAt.
    const effectiveActionTime = requestedAt;
    const actionTimeSource    = 'requestedAt';

    // ── Pure evaluation ───────────────────────────────────────────────────
    const engineRequest = {
      delegatePartyId,
      principalPartyId,
      actionKey,
      amount,
      currency,
    };
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

    // Part 11 closure: build encrypted runtime context.
    const runtimeContext = {
      requestedAt,
      actionTime:       effectiveActionTime,
      actionTimeSource,
    };
    if (amount !== undefined && amount !== null) runtimeContext.amount   = amount;
    if (currency)                                runtimeContext.currency = currency;

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
      runtimeContext,
      evaluatedAt,
      actionTime:        effectiveActionTime,
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
      actorType:                 _actorType,
      requestingUserId:          userId,
      requestingApiCredentialId: credentialId,
    });

    await audit.logInTx(
      txClient, accountId, userId, 'authority.evaluation.completed',
      'authority_evaluation', evaluationId,
      { outcome: decision, reasonCode: reasonCode || (reasonCodes && reasonCodes[0]), instrumentId, delegatePartyId },
      ipAddress
    );

    await txClient.query('COMMIT');

    // Part 13 closure: complete result object.
    return {
      evaluationId,
      instrumentId,
      principalPartyId:       principalPartyId  || null,
      delegatePartyId:        delegatePartyId   || null,
      actionKey:              actionKey         || null,
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
      ruleVersion:            policyRegistry.POLICY_VERSION,
      policyRegistryVersion:  policyRegistry.POLICY_VERSION,
      evaluatedAt,
      actionTime:             effectiveActionTime,
      actionTimeSource,
      instrumentStatusAtEvaluation: instrument.status,
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
          `SELECT id, instrument_id, principal_party_id, delegate_party_id,
                  requesting_party_id, requested_action_key,
                  outcome, reason_codes, reason_code, reason_detail,
                  missing_fields, manual_review_reasons,
                  matched_permission_ids, applied_restriction_ids,
                  blocking_permission_ids, blocking_restriction_ids,
                  rule_version, policy_version, evaluated_at, action_time,
                  action_time_source
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
            instrumentId:           row.instrument_id,
            principalPartyId:       row.principal_party_id || null,
            delegatePartyId:        row.delegate_party_id  || row.requesting_party_id || null,
            actionKey:              row.requested_action_key || null,
            decision:               row.outcome,
            outcome:                row.outcome,
            reasonCodes:            existingReasonCodes,
            reasonCode:             row.reason_code || existingReasonCodes[0] || null,
            reasonDetail:           row.reason_detail || null,
            missingFields:          _parseJsonArray(row.missing_fields),
            manualReviewReasons:    _parseJsonArray(row.manual_review_reasons),
            matchedPermissionIds:   _parseJsonArray(row.matched_permission_ids),
            appliedRestrictionIds:  _parseJsonArray(row.applied_restriction_ids),
            blockingPermissionIds:  _parseJsonArray(row.blocking_permission_ids),
            blockingRestrictionIds: _parseJsonArray(row.blocking_restriction_ids),
            ruleVersion:            row.rule_version || row.policy_version || null,
            policyRegistryVersion:  row.policy_version || null,
            evaluatedAt:            row.evaluated_at,
            actionTime:             row.action_time || null,
            actionTimeSource:       row.action_time_source || null,
            instrumentStatusAtEvaluation: null,
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

function _parseJsonArray(v) {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  try {
    const parsed = typeof v === 'string' ? JSON.parse(v) : v;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * getEvaluation — read a single evaluation record.
 * NOTE: runtime_context is intentionally NOT selected — the encrypted payload
 * is never exposed on read.
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
 * NOTE: runtime_context is intentionally NOT selected.
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
