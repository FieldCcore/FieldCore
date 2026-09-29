'use strict';

/**
 * Authority Engine — reason code registry.
 *
 * Each code maps to a canonical outcome. These codes are stable identifiers
 * written to authority_evaluations.reason_codes. Never rename or remove a code
 * once it has been written to production — add new codes instead.
 *
 * Outcomes:
 *   AUTHORIZED           — delegate is permitted to perform the requested action
 *   NOT_AUTHORIZED       — delegate is definitively not permitted
 *   INSUFFICIENT_INFO    — required data is absent; cannot make a determination
 *   MANUAL_REVIEW        — semantics are ambiguous or unsupported; human review needed
 */

const OUTCOMES = Object.freeze({
  AUTHORIZED:        'AUTHORIZED',
  NOT_AUTHORIZED:    'NOT_AUTHORIZED',
  INSUFFICIENT_INFO: 'INSUFFICIENT_INFORMATION',
  MANUAL_REVIEW:     'MANUAL_REVIEW',
});

// ── Reason codes ──────────────────────────────────────────────────────────────

const REASON_CODES = Object.freeze({
  // AUTHORIZED
  EXPLICITLY_GRANTED:                    { outcome: OUTCOMES.AUTHORIZED,        label: 'Action is explicitly granted with no blocking restrictions' },

  // NOT_AUTHORIZED
  INSTRUMENT_NOT_VERIFIED:               { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Instrument is not in VERIFIED status' },
  INSTRUMENT_REVOKED:                    { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Instrument has been revoked' },
  INSTRUMENT_EXPIRED_STATUS:             { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Instrument is in EXPIRED status' },
  INSTRUMENT_SUPERSEDED:                 { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Instrument has been superseded by another instrument' },
  INSTRUMENT_REJECTED:                   { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Instrument has been rejected' },
  BEFORE_EFFECTIVE_DATE:                 { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Action time is before instrument effective_date' },
  AFTER_EXPIRATION_DATE:                 { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Action time is after instrument expiration_date' },
  DATE_WINDOW_RESTRICTION:               { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Action time falls outside an explicit date_window restriction' },
  MONETARY_LIMIT_EXCEEDED:               { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Request amount exceeds monetary_limit restriction' },
  ACTION_EXPLICITLY_PROHIBITED:          { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Action key is explicitly prohibited for this instrument' },
  PRINCIPAL_MISMATCH:                    { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Principal party does not match the instrument principal participant' },
  DELEGATE_NOT_AGENT:                    { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Delegate party is not linked to the instrument as an agent-role participant' },
  DELEGATE_PARTICIPANT_INACTIVE:         { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Delegate party participant link is not active' },
  // Legacy alias kept for backward compatibility — use DELEGATE_NOT_AGENT going forward
  REQUESTING_PARTY_NOT_AGENT:            { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Requesting party is not linked to the instrument as an agent-role participant' },
  PARTICIPANT_INACTIVE:                  { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Requesting party participant link is not active' },
  NO_APPLICABLE_GRANT:                   { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'No granted permission exists for the requested action key' },

  // INSUFFICIENT_INFORMATION
  NO_INSTRUMENT_PROVIDED:                { outcome: OUTCOMES.INSUFFICIENT_INFO, label: 'No instrument was provided in the request' },
  NO_VERIFIED_INSTRUMENT:                { outcome: OUTCOMES.INSUFFICIENT_INFO, label: 'No VERIFIED instrument covers this action' },
  ACTION_NOT_IN_INSTRUMENT:              { outcome: OUTCOMES.INSUFFICIENT_INFO, label: 'Requested action key is not present in the instrument permissions' },
  MISSING_EFFECTIVE_DATE:                { outcome: OUTCOMES.INSUFFICIENT_INFO, label: 'Instrument has no effective_date and action_time cannot be validated' },
  MISSING_ACTION_TIME:                   { outcome: OUTCOMES.INSUFFICIENT_INFO, label: 'action_time is required for date validation but was not provided' },
  MISSING_REQUEST_AMOUNT:                { outcome: OUTCOMES.INSUFFICIENT_INFO, label: 'Monetary restriction exists but request amount was not provided' },
  MISSING_CURRENCY:                      { outcome: OUTCOMES.INSUFFICIENT_INFO, label: 'Monetary restriction has a currency requirement but no currency was provided' },
  REQUESTING_PARTY_UNKNOWN:              { outcome: OUTCOMES.INSUFFICIENT_INFO, label: 'Requesting party ID was not provided' },
  DELEGATE_PARTY_UNKNOWN:                { outcome: OUTCOMES.INSUFFICIENT_INFO, label: 'Delegate party ID was not provided' },
  PRINCIPAL_PARTY_UNKNOWN:               { outcome: OUTCOMES.INSUFFICIENT_INFO, label: 'Principal party ID was not provided' },

  // MANUAL_REVIEW
  UNKNOWN_INSTRUMENT_TYPE:               { outcome: OUTCOMES.MANUAL_REVIEW,     label: 'Instrument type has no confirmed role semantics in the policy registry' },
  UNKNOWN_RESTRICTION_TYPE:              { outcome: OUTCOMES.MANUAL_REVIEW,     label: 'Restriction type has no handler in the engine' },
  UNSUPPORTED_ACTION_DOMAIN:             { outcome: OUTCOMES.MANUAL_REVIEW,     label: 'Action key domain syntax is invalid' },
  UNDEFINED_ROLE_SEMANTICS:              { outcome: OUTCOMES.MANUAL_REVIEW,     label: 'Delegate role exists in instrument but has no machine-readable acting semantics defined' },
  CONDITIONAL_ROLE_ACTIVATION_UNDEFINED: { outcome: OUTCOMES.MANUAL_REVIEW,     label: 'Delegate role is conditional (e.g. successor_agent) and its activation state is not defined' },
  UNKNOWN_ROLE:                          { outcome: OUTCOMES.MANUAL_REVIEW,     label: 'Delegate role is not recognized' },
  CURRENCY_MISMATCH:                     { outcome: OUTCOMES.MANUAL_REVIEW,     label: 'Request currency differs from restriction currency and no approved FX conversion exists' },
  BOUNDARY_SEMANTICS_UNDEFINED:          { outcome: OUTCOMES.MANUAL_REVIEW,     label: 'Amount or date is exactly at a restriction boundary and inclusive/exclusive semantics are not defined' },
  CUMULATIVE_LIMIT_UNSUPPORTED:          { outcome: OUTCOMES.MANUAL_REVIEW,     label: 'Restriction specifies cumulative, periodic, or aggregate limits which require external state' },
  TIMEZONE_BOUNDARY_AMBIGUOUS:           { outcome: OUTCOMES.MANUAL_REVIEW,     label: 'Date window boundary outcome is timezone-dependent and no canonical timezone is defined' },
  TIMEZONE_AMBIGUOUS:                    { outcome: OUTCOMES.MANUAL_REVIEW,     label: 'Date window envelope spans the boundary and outcome is timezone-dependent' },
  AMOUNT_BOUNDARY_SEMANTICS_UNDEFINED:   { outcome: OUTCOMES.MANUAL_REVIEW,     label: 'Amount is exactly at monetary limit and inclusive/exclusive boundary semantics are not defined' },
  PERMISSION_SCOPE_SEMANTICS_UNDEFINED:  { outcome: OUTCOMES.MANUAL_REVIEW,     label: 'Participant-scoped permission semantics are undefined for this configuration' },
  // Idempotency codes — these are HTTP transport errors, NOT evaluation decisions.
  // They are registered here only so the codebase has a canonical source of truth.
  IDEMPOTENCY_KEY_CONFLICT:              { outcome: OUTCOMES.MANUAL_REVIEW,     label: 'Idempotency key reused with a different request fingerprint (HTTP 409 only — not an evaluation decision)' },
  IDEMPOTENCY_REPLAY_STALE:              { outcome: OUTCOMES.MANUAL_REVIEW,     label: 'Idempotency replay rejected: current state no longer matches original evaluation (HTTP 409 only — not an evaluation decision)' },
  REQUESTED_AT_OUTSIDE_SUPPORTED_WINDOW: { outcome: OUTCOMES.MANUAL_REVIEW,     label: 'requestedAt is outside the supported ±5 minute skew window relative to server-observed time (HTTP 422 only — not an evaluation decision)' },
});

/**
 * Validate that a reason_code string is registered.
 * @param {string} code
 * @returns {boolean}
 */
function isValidReasonCode(code) {
  return Object.prototype.hasOwnProperty.call(REASON_CODES, code);
}

/**
 * Return the outcome for a registered reason code.
 * Throws if the code is not registered.
 * @param {string} code
 * @returns {string}  one of the OUTCOMES values
 */
function outcomeFor(code) {
  if (!isValidReasonCode(code)) {
    throw new Error(`[authorityReasonCodes] Unknown reason code: ${code}`);
  }
  return REASON_CODES[code].outcome;
}

module.exports = { OUTCOMES, REASON_CODES, isValidReasonCode, outcomeFor };
