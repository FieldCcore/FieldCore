'use strict';

/**
 * Stage 5 — External Authority Evaluation API routes.
 *
 * MOUNT PATH: /api/v1/authority/*
 *
 * IMPORTANT ARCHITECTURAL CONSTRAINTS:
 *   - This module MUST NOT import TEST_POLICY_REGISTRY, authorityExtractionService,
 *     authorityAnthropicProvider, authorityFakeProvider, or any AI/extraction path.
 *   - This module MUST NEVER pass a third `opts` argument to
 *     evaluateAuthority — doing so would allow an external caller to
 *     inject a custom policy registry or clock. See Stage 5 spec.
 *   - Machine actors NEVER carry user_id — the evaluation row is written
 *     with actor_type='api_credential'.
 */

const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();

const { authorityApiAuth }    = require('../middleware/authorityApiAuth');
const rateLimit               = require('../middleware/authorityRateLimit');
const requestCorrelation      = require('../middleware/requestCorrelation');
const evaluationService       = require('../services/authorityEvaluationService');
const audit                   = require('../services/audit');

const API_VERSION = '2026-09-29';

// Known request fields — anything else → VALIDATION_FAILED 400.
const KNOWN_BODY_FIELDS = new Set([
  'instrument_id', 'principal_party_id', 'delegate_party_id',
  'action_key', 'requested_at', 'amount_minor', 'currency',
]);

// Explicitly prohibited body patterns — reject even if syntactically nested.
// These match evaluation-time control surfaces that MUST never cross the
// external boundary (e.g. test-only clock or policy-registry injection).
const PROHIBITED_BODY_KEY_RE = /^(is_authorized|role_active|legal_validity|evaluation_date|as_of|effective_at|historical_at|_policyRegistry|clockFn|policyRegistry|clock|tenant_id|tenantId|account_id|accountId)$/i;

// ── Helpers ───────────────────────────────────────────────────────────────────

function _err(res, status, code, message, extra) {
  const body = {
    error:   code,
    code,
    message: message || code,
    request_id: res.req && res.req.requestId ? res.req.requestId : undefined,
    api_version: API_VERSION,
  };
  if (extra && typeof extra === 'object') Object.assign(body, extra);
  return res.status(status).json(body);
}

/** Sha-256 of a value used to bound namespaced idempotency-key length. */
function _hashHex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

/**
 * Validate the request body strictly. Returns { ok:true, body } or
 * { ok:false, error:{ code, message, extra? } }.
 */
function _validateBody(rawBody) {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', message: 'Request body must be a JSON object.' } };
  }

  // Reject prohibited patterns anywhere in the top level.
  for (const key of Object.keys(rawBody)) {
    if (PROHIBITED_BODY_KEY_RE.test(key)) {
      return { ok: false, error: {
        code: 'VALIDATION_FAILED',
        message: `Prohibited request field: ${key}`,
        extra: { prohibited_field: key },
      } };
    }
  }

  const unknown = Object.keys(rawBody).filter(k => !KNOWN_BODY_FIELDS.has(k));
  if (unknown.length) {
    return { ok: false, error: {
      code: 'VALIDATION_FAILED',
      message: `Unknown request fields: ${unknown.join(', ')}`,
      extra: { unknown_fields: unknown },
    } };
  }

  const required = ['instrument_id', 'principal_party_id', 'delegate_party_id', 'action_key', 'requested_at'];
  const missing  = required.filter(k => !rawBody[k]);
  if (missing.length) {
    return { ok: false, error: {
      code: 'VALIDATION_FAILED',
      message: `Missing required fields: ${missing.join(', ')}`,
      extra: { missing_fields: missing },
    } };
  }

  // Basic type checks.
  for (const k of required) {
    if (typeof rawBody[k] !== 'string') {
      return { ok: false, error: {
        code: 'VALIDATION_FAILED',
        message: `${k} must be a string.`,
      } };
    }
  }
  if (rawBody.amount_minor !== undefined && !Number.isInteger(rawBody.amount_minor)) {
    return { ok: false, error: {
      code: 'VALIDATION_FAILED',
      message: 'amount_minor must be an integer (minor units).',
    } };
  }
  if (rawBody.currency !== undefined && (typeof rawBody.currency !== 'string' || !/^[A-Z]{3}$/.test(rawBody.currency))) {
    return { ok: false, error: {
      code: 'VALIDATION_FAILED',
      message: 'currency must be an ISO 4217 3-letter code.',
    } };
  }

  return { ok: true, body: rawBody };
}

/** Map a Stage 4 evaluation result to the snake-case external response. */
function _toExternalResponse(result, req, instrumentStatus) {
  return {
    evaluation_id:                result.evaluationId,
    decision:                     result.decision || result.outcome,
    instrument_id:                result.instrumentId,
    principal_party_id:           result.principalPartyId,
    delegate_party_id:            result.delegatePartyId,
    action_key:                   result.actionKey,
    reason_codes:                 result.reasonCodes || [],
    missing_fields:               result.missingFields || [],
    manual_review_reasons:        result.manualReviewReasons || [],
    matched_permission_ids:       result.matchedPermissionIds || [],
    applied_restriction_ids:      result.appliedRestrictionIds || [],
    blocking_permission_ids:      result.blockingPermissionIds || [],
    blocking_restriction_ids:     result.blockingRestrictionIds || [],
    rule_version:                 result.ruleVersion || null,
    policy_registry_version:      result.policyRegistryVersion || null,
    evaluated_at:                 result.evaluatedAt,
    action_time:                  result.actionTime || null,
    action_time_source:           result.actionTimeSource || 'requestedAt',
    instrument_status_at_evaluation: instrumentStatus || result.instrumentStatusAtEvaluation || null,
    replayed:                     !!result.replayed,
    replay_checked_at:            result.replayCheckedAt || null,
    request_id:                   req.requestId,
    api_version:                  API_VERSION,
  };
}

/** Map Stage 4 service errors → external HTTP + code. */
function _mapServiceError(err) {
  const status = err.statusCode || err.status || 500;
  const reason = err.reasonCode || err.code;

  // Idempotency / conflict errors carry structured detail.
  if (status === 409) {
    if (reason === 'IDEMPOTENCY_KEY_CONFLICT') {
      return { status: 409, code: 'IDEMPOTENCY_KEY_CONFLICT',
        message: err.message || 'Idempotency key conflict.',
        stale_reason: err.staleReason || undefined,
        evaluation_id: err.evaluationId || undefined };
    }
    return { status: 409, code: 'IDEMPOTENCY_REPLAY_STALE',
      message: err.message || 'Idempotent replay is stale.',
      stale_reason: err.staleReason || undefined,
      evaluation_id: err.evaluationId || undefined };
  }

  if (status === 422) {
    return { status: 422, code: reason || 'VALIDATION_FAILED',
      message: err.message || 'Request failed validation.' };
  }

  // Stage 4 uses 400 for missing/invalid fields. Map those to 422 to match
  // the external API contract; keep 400 semantics for structurally invalid.
  if (status === 400) {
    const code = reason ||
      (err.message && /Unknown request fields/.test(err.message) ? 'UNKNOWN_REQUEST_FIELDS'
       : err.message && /required/.test(err.message) ? 'MISSING_REQUIRED_FIELD'
       : 'VALIDATION_FAILED');
    // Unknown-fields is truly a 400 in our contract; missing/invalid → 422.
    if (code === 'UNKNOWN_REQUEST_FIELDS') {
      return { status: 400, code, message: err.message };
    }
    return { status: 422, code, message: err.message };
  }

  if (status === 404) return { status: 404, code: 'NOT_FOUND', message: 'Not found.' };
  if (status === 403) return { status: 403, code: 'FORBIDDEN', message: err.message || 'Forbidden.' };
  if (status === 503) return { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable.' };

  // Timeout errors surfaced by the DB adapter.
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('lock') && msg.includes('timeout')) {
    return { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'Lock timeout — please retry.' };
  }

  return { status: 500, code: 'INTERNAL_ERROR', message: 'Internal error.' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Middleware stack
// ═══════════════════════════════════════════════════════════════════════════════

// Body parser for this router — strict JSON, 100kb limit.
const externalBodyParser = express.json({ limit: '100kb', type: 'application/json', strict: true });

// Correlation ID must be attached BEFORE anything logs.
router.use(requestCorrelation.middleware());

// Pre-auth rate limit (IP-based) protects the auth path itself.
router.use(rateLimit.preAuth);

// Body parser (also handles empty bodies for methods that don't need one).
router.use(externalBodyParser);

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/v1/authority/evaluations
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/evaluations',
  authorityApiAuth('authority:evaluate'),
  rateLimit.perCredential,
  rateLimit.perTenant,
  async (req, res) => {
    try {
      const rawIdemp = req.headers['idempotency-key'];
      if (!rawIdemp || typeof rawIdemp !== 'string') {
        return _err(res, 422, 'VALIDATION_FAILED',
          'Idempotency-Key header is required.');
      }

      const check = _validateBody(req.body);
      if (!check.ok) {
        const e = check.error;
        // UNKNOWN_REQUEST_FIELDS is a client mistake → 400 per spec.
        const status = e.code === 'UNKNOWN_REQUEST_FIELDS' ? 400 : (e.code === 'VALIDATION_FAILED' && e.message && /Unknown/.test(e.message) ? 400 : 422);
        return _err(res, status, e.code, e.message, e.extra || undefined);
      }
      const body = check.body;

      // Namespace the idempotency key by credential so two credentials cannot
      // collide. If the combined length exceeds a conservative limit, hash it.
      const rawNamespaced = `api:${req.machineActor.credential_id}:${rawIdemp}`;
      const namespacedKey = rawNamespaced.length <= 200 ? rawNamespaced : `api-sha256:${_hashHex(rawNamespaced)}`;

      // Build normalized Stage 4 request (camelCase, integer amount).
      const stage4Request = {
        instrumentId:     body.instrument_id,
        delegatePartyId:  body.delegate_party_id,
        principalPartyId: body.principal_party_id,
        actionKey:        body.action_key,
        requestedAt:      body.requested_at,
        idempotencyKey:   namespacedKey,
      };
      if (body.amount_minor !== undefined) stage4Request.amount   = body.amount_minor;
      if (body.currency     !== undefined) stage4Request.currency = body.currency;

      // Machine actor context. CRITICAL: NO third `opts` argument.
      const machineActor = {
        actor_type:    'api_credential',
        credential_id: req.machineActor.credential_id,
        account_id:    req.machineActor.account_id,
        scopes:        req.machineActor.scopes,
        ipAddress:     req.ip || null,
      };

      // Boundary audit BEFORE the evaluation call, tagging with request_id.
      audit.log(
        req.machineActor.account_id, null,
        'authority.api.evaluation.requested',
        'authority_api', req.machineActor.credential_id,
        { request_id: req.requestId, action_key: body.action_key,
          instrument_id: body.instrument_id },
        req.ip || null
      );

      const result = await evaluationService.evaluateAuthority(stage4Request, machineActor);
      // ALL four decisions return HTTP 200. Replays included.
      return res.status(200).json(_toExternalResponse(result, req));
    } catch (err) {
      const mapped = _mapServiceError(err);
      return _err(res, mapped.status, mapped.code, mapped.message, {
        ...(mapped.stale_reason ? { stale_reason: mapped.stale_reason } : {}),
        ...(mapped.evaluation_id ? { evaluation_id: mapped.evaluation_id } : {}),
      });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/v1/authority/evaluations/:id  (optional, guarded by evaluations:read)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/evaluations/:id',
  authorityApiAuth('authority:evaluations:read'),
  rateLimit.perCredential,
  rateLimit.perTenant,
  async (req, res) => {
    try {
      const row = await evaluationService.getEvaluation(req.machineActor.account_id, req.params.id);
      return res.status(200).json({
        evaluation_id:            row.id,
        decision:                 row.outcome,
        instrument_id:            row.instrument_id,
        principal_party_id:       row.principal_party_id || null,
        delegate_party_id:        row.delegate_party_id || row.requesting_party_id || null,
        action_key:               row.requested_action_key || null,
        reason_codes:             Array.isArray(row.reason_codes) ? row.reason_codes : (row.reason_codes ? JSON.parse(row.reason_codes) : []),
        evaluated_at:             row.evaluated_at,
        action_time:              row.action_time || null,
        policy_registry_version:  row.policy_version || null,
        request_id:               req.requestId,
        api_version:              API_VERSION,
      });
    } catch (err) {
      const mapped = _mapServiceError(err);
      return _err(res, mapped.status, mapped.code, mapped.message);
    }
  }
);

module.exports = router;
