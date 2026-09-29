'use strict';

/**
 * Authority Engine — reason code registry.
 *
 * Each code maps to a canonical outcome. These codes are stable identifiers
 * written to authority_evaluations.reason_code. Never rename or remove a code
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
  EXPLICITLY_GRANTED:           { outcome: OUTCOMES.AUTHORIZED,        label: 'Action is explicitly granted with no blocking restrictions' },

  // NOT_AUTHORIZED
  INSTRUMENT_NOT_VERIFIED:      { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Instrument is not in VERIFIED status' },
  INSTRUMENT_REVOKED:           { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Instrument has been revoked' },
  INSTRUMENT_EXPIRED_STATUS:    { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Instrument is in EXPIRED status' },
  INSTRUMENT_SUPERSEDED:        { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Instrument has been superseded by another instrument' },
  INSTRUMENT_REJECTED:          { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Instrument has been rejected' },
  BEFORE_EFFECTIVE_DATE:        { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Action time is before instrument effective_date' },
  AFTER_EXPIRATION_DATE:        { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Action time is after instrument expiration_date' },
  DATE_WINDOW_RESTRICTION:      { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Action time falls outside an explicit date_window restriction' },
  MONETARY_LIMIT_EXCEEDED:      { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Request amount exceeds monetary_limit restriction' },
  ACTION_EXPLICITLY_PROHIBITED: { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Action key is explicitly prohibited for this instrument' },
  REQUESTING_PARTY_NOT_AGENT:   { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Requesting party is not linked to the instrument as an agent-role participant' },
  PARTICIPANT_INACTIVE:         { outcome: OUTCOMES.NOT_AUTHORIZED,    label: 'Requesting party participant link is not active' },

  // INSUFFICIENT_INFORMATION
  NO_INSTRUMENT_PROVIDED:       { outcome: OUTCOMES.INSUFFICIENT_INFO, label: 'No instrument was provided in the request' },
  NO_VERIFIED_INSTRUMENT:       { outcome: OUTCOMES.INSUFFICIENT_INFO, label: 'No VERIFIED instrument covers this action' },
  ACTION_NOT_IN_INSTRUMENT:     { outcome: OUTCOMES.INSUFFICIENT_INFO, label: 'Requested action key is not present in the instrument permissions' },
  MISSING_EFFECTIVE_DATE:       { outcome: OUTCOMES.INSUFFICIENT_INFO, label: 'Instrument has no effective_date and action_time cannot be validated' },
  MISSING_ACTION_TIME:          { outcome: OUTCOMES.INSUFFICIENT_INFO, label: 'action_time is required for date validation but was not provided' },
  MISSING_REQUEST_AMOUNT:       { outcome: OUTCOMES.INSUFFICIENT_INFO, label: 'Monetary restriction exists but request amount was not provided' },
  REQUESTING_PARTY_UNKNOWN:     { outcome: OUTCOMES.INSUFFICIENT_INFO, label: 'Requesting party ID was not provided' },

  // MANUAL_REVIEW
  UNKNOWN_INSTRUMENT_TYPE:      { outcome: OUTCOMES.MANUAL_REVIEW,     label: 'Instrument type has no confirmed role semantics in the policy registry' },
  UNKNOWN_RESTRICTION_TYPE:     { outcome: OUTCOMES.MANUAL_REVIEW,     label: 'Restriction type has no handler in the engine' },
  UNSUPPORTED_ACTION_DOMAIN:    { outcome: OUTCOMES.MANUAL_REVIEW,     label: 'Action key domain has no confirmed semantics in the policy registry' },
  IDEMPOTENCY_REPLAY_STALE:     { outcome: OUTCOMES.MANUAL_REVIEW,     label: 'Idempotency replay rejected: inputs have changed since original evaluation' },
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
