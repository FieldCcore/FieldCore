'use strict';

/**
 * Authority Engine Core — Pure Deterministic Evaluation.
 *
 * This module is CLOCK-FREE and I/O-FREE. It accepts all inputs pre-loaded
 * and returns a decision without touching the database, clock, or any AI.
 *
 * Failure-safe semantics: any undefined, ambiguous, or unknown input produces
 * MANUAL_REVIEW (never AUTHORIZED). The engine only returns AUTHORIZED when
 * all conditions have been positively verified.
 *
 * STATIC SAFETY CONSTRAINT: this file must never import:
 *   - ../db/pool  (or any DB module)
 *   - @anthropic-ai/sdk  (or any AI SDK)
 *   - Any module that calls Date.now() or new Date() internally
 *     (authorityCrypto is permitted — it uses crypto.randomBytes, not clock)
 *
 * Evaluation order (hard-coded; first failing check wins):
 *   1. Input guard — requesting party provided
 *   2. Instrument status checks (terminal statuses → NOT_AUTHORIZED)
 *   3. Policy registry — instrument type semantics known
 *   4. Requesting party is an agent-role participant (active)
 *   5. Effective / expiration date bounds (against action_time)
 *   6. Action key is present and not prohibited
 *   7. Action domain is supported
 *   8. Restrictions apply (monetary_limit, date_window, unknown → MANUAL_REVIEW)
 *   9. All checks passed → AUTHORIZED
 *
 * @param {object} inputs         - pre-loaded canonical data (from loader)
 * @param {object} request        - EvaluationRequest (requestingPartyId, actionKey, amount, currency)
 * @param {object} temporalContext - { evaluated_at: ISOString, action_time: ISOString|null }
 * @param {object} policyRegistry - { getPolicyForType, isActionDomainSupported }
 * @param {object} restrictionEvaluators - { evaluateRestriction }
 * @returns {{ outcome, reasonCode, reasonDetail? }}
 */

const { OUTCOMES } = require('./authorityReasonCodes');

// Normalize a date value (string or JS Date) to 'YYYY-MM-DD'.
function _toDateStr(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  // JS Date object from pg driver
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

function evaluate(inputs, request, temporalContext, policyRegistry, restrictionEvaluators) {
  const { instrument, participants, permissions, restrictions } = inputs;
  const { requestingPartyId, actionKey, amount, currency }     = request;
  const { action_time }                                        = temporalContext;

  // ── 1. Input guard ──────────────────────────────────────────────────────────
  if (!requestingPartyId) {
    return { outcome: OUTCOMES.INSUFFICIENT_INFO, reasonCode: 'REQUESTING_PARTY_UNKNOWN' };
  }

  if (!instrument) {
    return { outcome: OUTCOMES.INSUFFICIENT_INFO, reasonCode: 'NO_INSTRUMENT_PROVIDED' };
  }

  // ── 2. Instrument status ────────────────────────────────────────────────────
  const status = instrument.status;
  if (status === 'REVOKED') {
    return { outcome: OUTCOMES.NOT_AUTHORIZED, reasonCode: 'INSTRUMENT_REVOKED' };
  }
  if (status === 'EXPIRED') {
    return { outcome: OUTCOMES.NOT_AUTHORIZED, reasonCode: 'INSTRUMENT_EXPIRED_STATUS' };
  }
  if (status === 'SUPERSEDED') {
    return { outcome: OUTCOMES.NOT_AUTHORIZED, reasonCode: 'INSTRUMENT_SUPERSEDED' };
  }
  if (status === 'REJECTED') {
    return { outcome: OUTCOMES.NOT_AUTHORIZED, reasonCode: 'INSTRUMENT_REJECTED' };
  }
  if (status !== 'VERIFIED') {
    return { outcome: OUTCOMES.NOT_AUTHORIZED, reasonCode: 'INSTRUMENT_NOT_VERIFIED' };
  }

  // ── 3. Policy registry — instrument type semantics ──────────────────────────
  const policy = policyRegistry.getPolicyForType(instrument.instrument_type);
  if (!policy) {
    return { outcome: OUTCOMES.MANUAL_REVIEW, reasonCode: 'UNKNOWN_INSTRUMENT_TYPE' };
  }

  // ── 4. Requesting party is an active agent ──────────────────────────────────
  const agentParticipant = (participants || []).find(
    p => p.party_id === requestingPartyId && policy.agentRoles.has(p.role)
  );
  if (!agentParticipant) {
    return { outcome: OUTCOMES.NOT_AUTHORIZED, reasonCode: 'REQUESTING_PARTY_NOT_AGENT' };
  }
  if (agentParticipant.status !== 'active') {
    return { outcome: OUTCOMES.NOT_AUTHORIZED, reasonCode: 'PARTICIPANT_INACTIVE' };
  }

  // ── 5. Effective / expiration date bounds ───────────────────────────────────
  // Normalize to YYYY-MM-DD strings — DB returns date columns as JS Date objects.
  const effDate  = instrument.effective_date
    ? _toDateStr(instrument.effective_date)
    : null;
  const expDate  = instrument.expiration_date
    ? _toDateStr(instrument.expiration_date)
    : null;

  if (effDate || expDate) {
    if (!action_time) {
      return { outcome: OUTCOMES.INSUFFICIENT_INFO, reasonCode: 'MISSING_ACTION_TIME' };
    }
    const actionDate = String(action_time).slice(0, 10);
    if (effDate && actionDate < effDate) {
      return { outcome: OUTCOMES.NOT_AUTHORIZED, reasonCode: 'BEFORE_EFFECTIVE_DATE' };
    }
    if (expDate && actionDate > expDate) {
      return { outcome: OUTCOMES.NOT_AUTHORIZED, reasonCode: 'AFTER_EXPIRATION_DATE' };
    }
  }

  // ── 6. Action key present and not prohibited ────────────────────────────────
  if (!actionKey) {
    return { outcome: OUTCOMES.INSUFFICIENT_INFO, reasonCode: 'ACTION_NOT_IN_INSTRUMENT' };
  }

  // Check for explicit prohibition first (most restrictive wins)
  const prohibitedPerm = (permissions || []).find(
    p => p.action_key === actionKey && p.grant_type === 'prohibited'
  );
  if (prohibitedPerm) {
    return { outcome: OUTCOMES.NOT_AUTHORIZED, reasonCode: 'ACTION_EXPLICITLY_PROHIBITED' };
  }

  const grantedPerm = (permissions || []).find(
    p => p.action_key === actionKey && p.grant_type === 'granted'
  );
  if (!grantedPerm) {
    return { outcome: OUTCOMES.INSUFFICIENT_INFO, reasonCode: 'ACTION_NOT_IN_INSTRUMENT' };
  }

  // ── 7. Action domain supported ──────────────────────────────────────────────
  if (!policyRegistry.isActionDomainSupported(actionKey)) {
    return { outcome: OUTCOMES.MANUAL_REVIEW, reasonCode: 'UNSUPPORTED_ACTION_DOMAIN' };
  }

  // ── 8. Restrictions ─────────────────────────────────────────────────────────
  // Apply restrictions that are either instrument-wide or scoped to the granted permission.
  const applicableRestrictions = (restrictions || []).filter(
    r => r.permission_id === null || r.permission_id === grantedPerm.id
  );

  for (const restriction of applicableRestrictions) {
    const result = restrictionEvaluators.evaluateRestriction(
      restriction, { amount, currency }, temporalContext
    );
    if (result.unknown) {
      return { outcome: OUTCOMES.MANUAL_REVIEW, reasonCode: 'UNKNOWN_RESTRICTION_TYPE',
               reasonDetail: restriction.restriction_type };
    }
    if (!result.pass) {
      return { outcome: OUTCOMES[_outcomeKeyFor(result.reasonCode)], reasonCode: result.reasonCode };
    }
  }

  // ── 9. All checks passed ────────────────────────────────────────────────────
  return { outcome: OUTCOMES.AUTHORIZED, reasonCode: 'EXPLICITLY_GRANTED' };
}

// Map a reason code to its OUTCOMES key (e.g. 'MONETARY_LIMIT_EXCEEDED' → 'NOT_AUTHORIZED')
function _outcomeKeyFor(reasonCode) {
  const map = {
    MISSING_REQUEST_AMOUNT:  'INSUFFICIENT_INFO',
    MISSING_ACTION_TIME:     'INSUFFICIENT_INFO',
    MONETARY_LIMIT_EXCEEDED: 'NOT_AUTHORIZED',
    DATE_WINDOW_RESTRICTION: 'NOT_AUTHORIZED',
  };
  return map[reasonCode] || 'MANUAL_REVIEW';
}

module.exports = { evaluate };
