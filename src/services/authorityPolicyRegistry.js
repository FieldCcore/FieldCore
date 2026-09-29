'use strict';

/**
 * Authority Engine — Policy Registry.
 *
 * Maps instrument types to role semantics. Only instrument types and roles
 * whose semantics have been confirmed through schema inspection are listed.
 * Unknown types produce MANUAL_REVIEW — never AUTHORIZED.
 *
 * POLICY VERSION must be bumped whenever the classification changes.
 * The version is written to every authority_evaluations row so that
 * policy changes can be traced to specific evaluation records.
 *
 * Classification rules:
 *   agentRoles       — participant roles that can unambiguously act on behalf of the principal
 *   conditionalRoles — roles that require external activation state before acting (e.g. successor_agent)
 *   principalRoles   — participant roles that ARE the principal
 *
 * Design constraint: this file contains NO I/O, NO DB calls, NO clock reads.
 * It is a pure data registry.
 */

const POLICY_VERSION = '2.0.0';

// ── Action key format ──────────────────────────────────────────────────────────
// Valid format: DOMAIN.ACTION — both segments uppercase alphanumeric + underscore,
// 1-30 chars each, starting with a letter. No allowlist — any valid format is accepted.
const ACTION_KEY_FORMAT_RE = /^[A-Z][A-Z0-9_]{0,29}\.[A-Z][A-Z0-9_]{0,29}$/;

// ── Per-instrument-type role classifications ──────────────────────────────────
// Only confirmed semantics based on legal domain knowledge of each type.
// Correction 3: co_agent and successor_agent are CONDITIONAL roles (require external
// activation state) — moved out of agentRoles into conditionalRoles.

const INSTRUMENT_POLICIES = Object.freeze({
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
  // healthcare_proxy and court_order: roles depend heavily on jurisdiction-specific
  // interpretation. Policy engine escalates to MANUAL_REVIEW for these types.
});

// ── Registry API ──────────────────────────────────────────────────────────────

/**
 * Look up the policy for an instrument type.
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
  ACTION_KEY_FORMAT_RE,
  getPolicyForType,
  isActionKeyValid,
  isActionDomainSupported,
};
