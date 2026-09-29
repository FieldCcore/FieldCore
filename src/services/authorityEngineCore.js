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
 * Evaluation order (hard-coded; first failing check wins for hard-gate paths):
 *   1. Input guard — delegate party provided
 *   2. Instrument status checks (terminal statuses → NOT_AUTHORIZED)
 *   3. Policy registry — instrument type semantics known
 *   4. Principal party check (if provided, must be in principalRoles)
 *   5. Delegate party role check — agent/conditional/unknown/principal
 *   6. Delegate participant active status
 *   7. Effective / expiration date bounds (against action_time)
 *   8. Action key format valid, not prohibited, grant exists
 *   9. Action key format valid (isActionKeyValid)
 *  10. Restrictions — sort by id, collect ALL results, aggregate
 *  11. All checks passed → AUTHORIZED
 *
 * Rich output fields:
 *   decision                — primary outcome string (AUTHORIZED | NOT_AUTHORIZED | ...)
 *   outcome                 — alias for decision (backward compat)
 *   reasonCodes             — array of all reason codes
 *   reasonCode              — alias for reasonCodes[0] (backward compat)
 *   missingFields           — array of field names that prevented determination
 *   manualReviewReasons     — array of human-readable reasons requiring review
 *   matchedPermissionIds    — IDs of permissions that matched the action
 *   appliedRestrictionIds   — IDs of restrictions that were evaluated and passed
 *   blockingPermissionIds   — IDs of permissions that blocked the action
 *   blockingRestrictionIds  — IDs of restrictions that blocked the action
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

// Build an empty rich output scaffold (all arrays initialized).
function _emptyOutput() {
  return {
    missingFields:          [],
    manualReviewReasons:    [],
    matchedPermissionIds:   [],
    appliedRestrictionIds:  [],
    blockingPermissionIds:  [],
    blockingRestrictionIds: [],
  };
}

// Build a hard-gate result (single reason code, no restriction traversal).
function _hardGate(decision, reasonCode, extra = {}) {
  const base = _emptyOutput();
  return {
    decision,
    outcome:                decision,  // backward compat
    reasonCodes:            [reasonCode],
    reasonCode,                        // backward compat alias
    missingFields:          extra.missingFields          || base.missingFields,
    manualReviewReasons:    extra.manualReviewReasons    || base.manualReviewReasons,
    matchedPermissionIds:   extra.matchedPermissionIds   || base.matchedPermissionIds,
    appliedRestrictionIds:  [],
    blockingPermissionIds:  extra.blockingPermissionIds  || base.blockingPermissionIds,
    blockingRestrictionIds: [],
  };
}

// Build the AUTHORIZED result.
function _authorized(matchedPermissionIds, appliedRestrictionIds) {
  return {
    decision:               OUTCOMES.AUTHORIZED,
    outcome:                OUTCOMES.AUTHORIZED,
    reasonCodes:            ['EXPLICITLY_GRANTED'],
    reasonCode:             'EXPLICITLY_GRANTED',
    missingFields:          [],
    manualReviewReasons:    [],
    matchedPermissionIds:   matchedPermissionIds || [],
    appliedRestrictionIds:  appliedRestrictionIds || [],
    blockingPermissionIds:  [],
    blockingRestrictionIds: [],
  };
}

// Map a restriction reason code to its outcome key.
function _outcomeForRestrictionCode(reasonCode) {
  const map = {
    MISSING_REQUEST_AMOUNT:      'INSUFFICIENT_INFO',
    MISSING_CURRENCY:            'INSUFFICIENT_INFO',
    MISSING_ACTION_TIME:         'INSUFFICIENT_INFO',
    MONETARY_LIMIT_EXCEEDED:     'NOT_AUTHORIZED',
    DATE_WINDOW_RESTRICTION:     'NOT_AUTHORIZED',
    CURRENCY_MISMATCH:           'MANUAL_REVIEW',
    BOUNDARY_SEMANTICS_UNDEFINED:'MANUAL_REVIEW',
    CUMULATIVE_LIMIT_UNSUPPORTED:'MANUAL_REVIEW',
    TIMEZONE_BOUNDARY_AMBIGUOUS: 'MANUAL_REVIEW',
  };
  return map[reasonCode] || 'MANUAL_REVIEW';
}

// Aggregate outcome precedence: NOT_AUTHORIZED > MANUAL_REVIEW > INSUFFICIENT_INFO > AUTHORIZED
const OUTCOME_RANK = {
  [OUTCOMES.NOT_AUTHORIZED]:    4,
  [OUTCOMES.MANUAL_REVIEW]:     3,
  [OUTCOMES.INSUFFICIENT_INFO]: 2,
  [OUTCOMES.AUTHORIZED]:        1,
};

/**
 * @param {object} inputs         - { instrument, participants, permissions, restrictions }
 * @param {object} request        - { delegatePartyId?, requestingPartyId?, principalPartyId?,
 *                                    actionKey, amount, currency }
 * @param {object} temporalContext - { evaluated_at: ISOString, action_time: ISOString|null }
 * @param {object} policyRegistry - { getPolicyForType, isActionKeyValid }
 * @param {object} restrictionEvaluators - { evaluateRestriction }
 * @returns {object}  Rich evaluation result
 */
function evaluate(inputs, request, temporalContext, policyRegistry, restrictionEvaluators) {
  const { instrument, participants, permissions, restrictions } = inputs;
  // Closure Part 3: delegatePartyId only — no requestingPartyId fallback
  const delegatePartyId  = request.delegatePartyId || null;
  const principalPartyId = request.principalPartyId || null;
  const { actionKey, amount, currency }            = request;
  const { action_time }                            = temporalContext;

  // ── 1. Input guard ──────────────────────────────────────────────────────────
  if (!delegatePartyId) {
    return _hardGate(OUTCOMES.INSUFFICIENT_INFO, 'REQUESTING_PARTY_UNKNOWN',
      { missingFields: ['delegatePartyId'] });
  }

  if (!instrument) {
    return _hardGate(OUTCOMES.INSUFFICIENT_INFO, 'NO_INSTRUMENT_PROVIDED',
      { missingFields: ['instrument'] });
  }

  // ── 2. Instrument status ────────────────────────────────────────────────────
  const status = instrument.status;
  if (status === 'REVOKED')    return _hardGate(OUTCOMES.NOT_AUTHORIZED, 'INSTRUMENT_REVOKED');
  if (status === 'EXPIRED')    return _hardGate(OUTCOMES.NOT_AUTHORIZED, 'INSTRUMENT_EXPIRED_STATUS');
  if (status === 'SUPERSEDED') return _hardGate(OUTCOMES.NOT_AUTHORIZED, 'INSTRUMENT_SUPERSEDED');
  if (status === 'REJECTED')   return _hardGate(OUTCOMES.NOT_AUTHORIZED, 'INSTRUMENT_REJECTED');
  if (status !== 'VERIFIED')   return _hardGate(OUTCOMES.NOT_AUTHORIZED, 'INSTRUMENT_NOT_VERIFIED');

  // ── 3. Policy registry — instrument type semantics ──────────────────────────
  const policy = policyRegistry.getPolicyForType(instrument.instrument_type);
  if (!policy) {
    return _hardGate(OUTCOMES.MANUAL_REVIEW, 'UNKNOWN_INSTRUMENT_TYPE',
      { manualReviewReasons: [`Instrument type '${instrument.instrument_type}' has no confirmed policy`] });
  }

  // ── 4. Principal party check ────────────────────────────────────────────────
  // Correction 4: if principalPartyId provided, verify it is in a principalRole participant slot
  if (principalPartyId) {
    const principalParticipant = (participants || []).find(
      p => p.party_id === principalPartyId
    );
    if (!principalParticipant || !policy.principalRoles.has(principalParticipant.role)) {
      return _hardGate(OUTCOMES.NOT_AUTHORIZED, 'PRINCIPAL_MISMATCH');
    }
  }

  // ── 5. Delegate party role check ────────────────────────────────────────────
  // Correction 2: check ALL role sets before returning NOT_AUTHORIZED
  const delegateParticipant = (participants || []).find(
    p => p.party_id === delegatePartyId
  );

  if (!delegateParticipant) {
    // Not in instrument at all
    return _hardGate(OUTCOMES.NOT_AUTHORIZED, 'REQUESTING_PARTY_NOT_AGENT');
  }

  const delegateRole = delegateParticipant.role;

  if (policy.principalRoles.has(delegateRole)) {
    // Principal cannot act as agent
    return _hardGate(OUTCOMES.NOT_AUTHORIZED, 'REQUESTING_PARTY_NOT_AGENT');
  }

  if (policy.conditionalRoles && policy.conditionalRoles.has(delegateRole)) {
    // Correction 3: conditional roles (co_agent, successor_agent) require activation state
    return _hardGate(OUTCOMES.MANUAL_REVIEW, 'CONDITIONAL_ROLE_ACTIVATION_UNDEFINED',
      { manualReviewReasons: [`Delegate role '${delegateRole}' is conditional and activation state is not defined`] });
  }

  if (!policy.agentRoles.has(delegateRole)) {
    // Role exists but is unrecognized for acting semantics
    return _hardGate(OUTCOMES.MANUAL_REVIEW, 'UNDEFINED_ROLE_SEMANTICS',
      { manualReviewReasons: [`Delegate role '${delegateRole}' has no machine-readable acting semantics`] });
  }

  // ── 6. Delegate participant active status ───────────────────────────────────
  if (delegateParticipant.status !== 'active') {
    return _hardGate(OUTCOMES.NOT_AUTHORIZED, 'DELEGATE_PARTICIPANT_INACTIVE');
  }

  // ── 7. Effective / expiration date bounds ───────────────────────────────────
  const effDate = instrument.effective_date  ? _toDateStr(instrument.effective_date)  : null;
  const expDate = instrument.expiration_date ? _toDateStr(instrument.expiration_date) : null;

  if (effDate || expDate) {
    if (!action_time) {
      return _hardGate(OUTCOMES.INSUFFICIENT_INFO, 'MISSING_ACTION_TIME',
        { missingFields: ['action_time'] });
    }
    const actionDate = String(action_time).slice(0, 10);
    if (effDate && actionDate < effDate) {
      return _hardGate(OUTCOMES.NOT_AUTHORIZED, 'BEFORE_EFFECTIVE_DATE');
    }
    if (expDate && actionDate > expDate) {
      return _hardGate(OUTCOMES.NOT_AUTHORIZED, 'AFTER_EXPIRATION_DATE');
    }
  }

  // ── 8. Action key — format, prohibition, grant ─────────────────────────────
  if (!actionKey) {
    return _hardGate(OUTCOMES.INSUFFICIENT_INFO, 'ACTION_NOT_IN_INSTRUMENT',
      { missingFields: ['actionKey'] });
  }

  // Check for explicit prohibition (most restrictive wins)
  const prohibitedPerm = (permissions || []).find(
    p => p.action_key === actionKey && p.grant_type === 'prohibited'
  );
  if (prohibitedPerm) {
    return _hardGate(OUTCOMES.NOT_AUTHORIZED, 'ACTION_EXPLICITLY_PROHIBITED',
      { blockingPermissionIds: [prohibitedPerm.id] });
  }

  // Part 9 closure: collect ALL grants for this action key, sort deterministically by id.
  const grantedPerms = [...(permissions || [])]
    .filter(p => p.action_key === actionKey && p.grant_type === 'granted')
    .sort((a, b) => a.id < b.id ? -1 : 1);
  if (grantedPerms.length === 0) {
    return _hardGate(OUTCOMES.NOT_AUTHORIZED, 'NO_APPLICABLE_GRANT');
  }
  const grantedPermIds = grantedPerms.map(p => p.id);

  // ── 9. Action key format validation (format only, no allowlist) ─────────────
  if (!policyRegistry.isActionKeyValid(actionKey)) {
    return _hardGate(OUTCOMES.MANUAL_REVIEW, 'UNSUPPORTED_ACTION_DOMAIN',
      { manualReviewReasons: [`Action key '${actionKey}' has invalid format`] });
  }

  // ── 10. Restrictions ─────────────────────────────────────────────────────────
  // Apply restrictions scoped to any of the granted permissions or instrument-wide (null permission_id).
  // Sort by id for deterministic order; collect ALL results.
  const grantedPermIdSet = new Set(grantedPermIds);
  const applicableRestrictions = [...(restrictions || [])]
    .filter(r => r.permission_id === null || grantedPermIdSet.has(r.permission_id))
    .sort((a, b) => a.id < b.id ? -1 : 1);

  const allReasonCodes      = [];
  const allMissingFields    = [];
  const allManualReasons    = [];
  const passedRestrictionIds   = [];
  const blockingRestrictionIds = [];
  let aggregatedOutcome     = OUTCOMES.AUTHORIZED;

  for (const restriction of applicableRestrictions) {
    const result = restrictionEvaluators.evaluateRestriction(
      restriction, { amount, currency }, temporalContext
    );
    if (result.unknown) {
      const code = 'UNKNOWN_RESTRICTION_TYPE';
      allReasonCodes.push(code);
      allManualReasons.push(`Unknown restriction type: ${restriction.restriction_type}`);
      blockingRestrictionIds.push(restriction.id);
      if (OUTCOME_RANK[OUTCOMES.MANUAL_REVIEW] > OUTCOME_RANK[aggregatedOutcome]) {
        aggregatedOutcome = OUTCOMES.MANUAL_REVIEW;
      }
    } else if (!result.pass) {
      const code = result.reasonCode;
      allReasonCodes.push(code);
      blockingRestrictionIds.push(restriction.id);
      const outcomeKey = _outcomeForRestrictionCode(code);
      const thisOutcome = OUTCOMES[outcomeKey];
      if (OUTCOME_RANK[thisOutcome] > OUTCOME_RANK[aggregatedOutcome]) {
        aggregatedOutcome = thisOutcome;
      }
      if (outcomeKey === 'INSUFFICIENT_INFO') {
        allMissingFields.push(code === 'MISSING_REQUEST_AMOUNT' ? 'amount'
          : code === 'MISSING_CURRENCY' ? 'currency'
          : code === 'MISSING_ACTION_TIME' ? 'action_time'
          : code);
      } else if (outcomeKey === 'MANUAL_REVIEW') {
        allManualReasons.push(code);
      }
    } else {
      passedRestrictionIds.push(restriction.id);
    }
  }

  // ── 11. Result assembly ─────────────────────────────────────────────────────
  if (allReasonCodes.length === 0) {
    // All restrictions passed (or none applicable) — AUTHORIZED
    return _authorized(grantedPermIds, passedRestrictionIds);
  }

  // Aggregate all reason codes across all failing restrictions
  return {
    decision:               aggregatedOutcome,
    outcome:                aggregatedOutcome,
    reasonCodes:            allReasonCodes,
    reasonCode:             allReasonCodes[0],
    missingFields:          allMissingFields,
    manualReviewReasons:    allManualReasons,
    matchedPermissionIds:   grantedPermIds,
    appliedRestrictionIds:  passedRestrictionIds,
    blockingPermissionIds:  [],
    blockingRestrictionIds: blockingRestrictionIds,
  };
}

module.exports = { evaluate };
