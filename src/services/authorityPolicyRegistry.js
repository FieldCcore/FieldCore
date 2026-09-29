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
 *   agentRoles  — participant roles that can act on behalf of the principal
 *   principalRoles — participant roles that ARE the principal
 *
 * Design constraint: this file contains NO I/O, NO DB calls, NO clock reads.
 * It is a pure data registry.
 */

const POLICY_VERSION = '1.0.0';

// ── Per-instrument-type role classifications ──────────────────────────────────
// Only confirmed semantics based on legal domain knowledge of each type.
// "co_agent" and "successor_agent" are agent variants for POA instruments.

const INSTRUMENT_POLICIES = Object.freeze({
  power_of_attorney: Object.freeze({
    agentRoles:     new Set(['agent', 'co_agent', 'successor_agent', 'authorized_representative']),
    principalRoles: new Set(['principal']),
  }),
  durable_power_of_attorney: Object.freeze({
    agentRoles:     new Set(['agent', 'co_agent', 'successor_agent', 'authorized_representative']),
    principalRoles: new Set(['principal']),
  }),
  guardianship_order: Object.freeze({
    agentRoles:     new Set(['guardian']),
    principalRoles: new Set(['principal']),
  }),
  trust: Object.freeze({
    agentRoles:     new Set(['trustee', 'co_trustee', 'authorized_representative']),
    principalRoles: new Set(['principal']),
  }),
  corporate_resolution: Object.freeze({
    agentRoles:     new Set(['authorized_representative']),
    principalRoles: new Set(['principal']),
  }),
  letter_of_authorization: Object.freeze({
    agentRoles:     new Set(['agent', 'authorized_representative']),
    principalRoles: new Set(['principal']),
  }),
  // healthcare_proxy and court_order: roles depend heavily on jurisdiction-specific
  // interpretation. Policy engine escalates to MANUAL_REVIEW for these types.
});

// ── Action domain classifications ─────────────────────────────────────────────
// Action key format: DOMAIN.ACTION (e.g. BANKING.WIRE_TRANSFER)
// Only domains with confirmed semantics are listed here.
// An unlisted domain produces UNSUPPORTED_ACTION_DOMAIN → MANUAL_REVIEW.

const SUPPORTED_ACTION_DOMAINS = Object.freeze(new Set([
  'BANKING',
  'HEALTHCARE',
  'REAL_ESTATE',
  'LEGAL',
  'FINANCIAL',
  'CUSTOM_DOMAIN',
]));

// ── Registry API ──────────────────────────────────────────────────────────────

/**
 * Look up the policy for an instrument type.
 * Returns null if the type has no confirmed policy (triggers MANUAL_REVIEW).
 *
 * @param {string} instrumentType
 * @returns {{ agentRoles: Set<string>, principalRoles: Set<string> } | null}
 */
function getPolicyForType(instrumentType) {
  return INSTRUMENT_POLICIES[instrumentType] || null;
}

/**
 * Return true if the action key's domain has confirmed semantics.
 * @param {string} actionKey  e.g. "BANKING.WIRE_TRANSFER"
 * @returns {boolean}
 */
function isActionDomainSupported(actionKey) {
  if (typeof actionKey !== 'string') return false;
  const dot = actionKey.indexOf('.');
  if (dot < 0) return false;
  return SUPPORTED_ACTION_DOMAINS.has(actionKey.slice(0, dot));
}

module.exports = {
  POLICY_VERSION,
  INSTRUMENT_POLICIES,
  SUPPORTED_ACTION_DOMAINS,
  getPolicyForType,
  isActionDomainSupported,
};
