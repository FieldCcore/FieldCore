'use strict';

/**
 * Authority Engine — Policy Registry.
 *
 * PRODUCTION: agentRoles sets are intentionally empty. No instrument type has
 * confirmed machine-readable FieldCore acting semantics. Any delegate whose role
 * is not in principalRoles or conditionalRoles resolves to UNDEFINED_ROLE_SEMANTICS
 * → MANUAL_REVIEW. AUTHORIZED is unreachable via the production registry.
 *
 * TEST-ONLY: Use TEST_POLICY_REGISTRY (exported below) to inject role semantics
 * in unit/integration tests that exercise the AUTHORIZED evaluation path.
 *
 * POLICY_VERSION must be bumped whenever the classification logic changes.
 * The version is written to every authority_evaluations row so that policy
 * changes can be traced to specific evaluation records.
 *
 * Classification rules:
 *   agentRoles       — participant roles that can unambiguously act on behalf of principal
 *   conditionalRoles — roles requiring external activation state (e.g. successor_agent)
 *   principalRoles   — participant roles that ARE the principal
 *
 * Design constraint: this file contains NO I/O, NO DB calls, NO clock reads.
 * It is a pure data registry.
 */

const POLICY_VERSION = '3.0.0';

// ── Action key format ──────────────────────────────────────────────────────────
// Valid format: DOMAIN.ACTION — both segments uppercase alphanumeric + underscore,
// 1-30 chars each, starting with a letter. No allowlist — any valid format is accepted.
const ACTION_KEY_FORMAT_RE = /^[A-Z][A-Z0-9_]{0,29}\.[A-Z][A-Z0-9_]{0,29}$/;

// ── PRODUCTION policy registry — empty agentRoles ────────────────────────────
// Part 2 closure: no instrument type has confirmed machine-readable acting semantics.
// agentRoles must be populated from an explicit FieldCore semantic source before
// any instrument type can produce AUTHORIZED evaluations.

const INSTRUMENT_POLICIES = Object.freeze({
  power_of_attorney: Object.freeze({
    agentRoles:       new Set(),
    conditionalRoles: new Set(['co_agent', 'successor_agent']),
    principalRoles:   new Set(['principal']),
  }),
  durable_power_of_attorney: Object.freeze({
    agentRoles:       new Set(),
    conditionalRoles: new Set(['co_agent', 'successor_agent']),
    principalRoles:   new Set(['principal']),
  }),
  guardianship_order: Object.freeze({
    agentRoles:       new Set(),
    conditionalRoles: new Set(),
    principalRoles:   new Set(['principal']),
  }),
  trust: Object.freeze({
    agentRoles:       new Set(),
    conditionalRoles: new Set(['co_trustee']),
    principalRoles:   new Set(['principal']),
  }),
  corporate_resolution: Object.freeze({
    agentRoles:       new Set(),
    conditionalRoles: new Set(),
    principalRoles:   new Set(['principal']),
  }),
  letter_of_authorization: Object.freeze({
    agentRoles:       new Set(),
    conditionalRoles: new Set(),
    principalRoles:   new Set(['principal']),
  }),
  // healthcare_proxy and court_order: no confirmed policy → MANUAL_REVIEW
});

// ── TEST-ONLY policy registry — with agentRoles populated ────────────────────
// Use this in unit/integration tests that exercise the AUTHORIZED evaluation path.
// NEVER use this registry in production code paths.

const TEST_INSTRUMENT_POLICIES = Object.freeze({
  power_of_attorney: Object.freeze({
    agentRoles:       new Set(['agent', 'authorized_representative']),
    conditionalRoles: new Set(['co_agent', 'successor_agent']),
    principalRoles:   new Set(['principal']),
  }),
  durable_power_of_attorney: Object.freeze({
    agentRoles:       new Set(['agent', 'authorized_representative']),
    conditionalRoles: new Set(['co_agent', 'successor_agent']),
    principalRoles:   new Set(['principal']),
  }),
  guardianship_order: Object.freeze({
    agentRoles:       new Set(['guardian']),
    conditionalRoles: new Set(),
    principalRoles:   new Set(['principal']),
  }),
  trust: Object.freeze({
    agentRoles:       new Set(['trustee', 'authorized_representative']),
    conditionalRoles: new Set(['co_trustee']),
    principalRoles:   new Set(['principal']),
  }),
  corporate_resolution: Object.freeze({
    agentRoles:       new Set(['authorized_representative']),
    conditionalRoles: new Set(),
    principalRoles:   new Set(['principal']),
  }),
  letter_of_authorization: Object.freeze({
    agentRoles:       new Set(['agent', 'authorized_representative']),
    conditionalRoles: new Set(),
    principalRoles:   new Set(['principal']),
  }),
});

// Convenience registry object for test injection via evaluateAuthority opts._policyRegistry
const TEST_POLICY_REGISTRY = {
  POLICY_VERSION,
  getPolicyForType: (t) => TEST_INSTRUMENT_POLICIES[t] || null,
  isActionKeyValid,
  isActionDomainSupported: isActionKeyValid,
};

// ── Registry API ──────────────────────────────────────────────────────────────

/**
 * Look up the production policy for an instrument type.
 * Returns null if the type has no confirmed policy (triggers MANUAL_REVIEW).
 *
 * @param {string} instrumentType
 * @returns {{ agentRoles: Set<string>, conditionalRoles: Set<string>, principalRoles: Set<string> } | null}
 */
function getPolicyForType(instrumentType) {
  return INSTRUMENT_POLICIES[instrumentType] || null;
}

/**
 * Return true if the action key has a valid format (DOMAIN.ACTION).
 * Does NOT use an allowlist — any correctly formatted key is valid.
 * @param {string} actionKey  e.g. "BANKING.WIRE_TRANSFER"
 * @returns {boolean}
 */
function isActionKeyValid(actionKey) {
  if (typeof actionKey !== 'string') return false;
  return ACTION_KEY_FORMAT_RE.test(actionKey);
}

/**
 * Deprecated alias for isActionKeyValid — kept for backward compatibility.
 * @param {string} actionKey
 * @returns {boolean}
 */
function isActionDomainSupported(actionKey) {
  return isActionKeyValid(actionKey);
}

module.exports = {
  POLICY_VERSION,
  INSTRUMENT_POLICIES,
  TEST_INSTRUMENT_POLICIES,
  TEST_POLICY_REGISTRY,
  ACTION_KEY_FORMAT_RE,
  getPolicyForType,
  isActionKeyValid,
  isActionDomainSupported,
};
