'use strict';

/**
 * Authority Engine — Restriction Evaluator Registry.
 *
 * Each handler receives:
 *   restriction  — a single restriction row (from the canonical loader)
 *   request      — the normalized EvaluationRequest
 *   context      — { evaluated_at: ISOString, action_time: ISOString|null }
 *
 * Returns one of:
 *   { pass: true }
 *   { pass: false, reasonCode: string }   — reason code from REASON_CODES registry
 *   { unknown: true }                     — restriction type not understood → MANUAL_REVIEW
 *
 * Design constraint: NO I/O, NO DB, NO clock reads. All inputs are pre-fetched.
 * Date comparisons use the caller-supplied evaluated_at / action_time.
 */

const { REASON_CODES } = require('./authorityReasonCodes');

// Normalize a date value (string or JS Date) to 'YYYY-MM-DD'.
function _toDateStr(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

// ── monetary_limit ────────────────────────────────────────────────────────────
// parameters: { amount: integer (minor units), currency: string }
// request: { amount?: integer, currency?: string }

function _evaluateMonetaryLimit(restriction, request) {
  const params = restriction.parameters || {};
  const limitAmount = params.amount;

  if (typeof limitAmount !== 'number' || !Number.isInteger(limitAmount)) {
    // Malformed restriction — cannot evaluate, escalate
    return { unknown: true };
  }

  const reqAmount = request.amount;
  if (reqAmount === null || reqAmount === undefined) {
    return { pass: false, reasonCode: 'MISSING_REQUEST_AMOUNT' };
  }
  if (typeof reqAmount !== 'number' || !Number.isInteger(reqAmount)) {
    return { pass: false, reasonCode: 'MISSING_REQUEST_AMOUNT' };
  }

  if (reqAmount > limitAmount) {
    return { pass: false, reasonCode: 'MONETARY_LIMIT_EXCEEDED' };
  }
  return { pass: true };
}

// ── date_window ───────────────────────────────────────────────────────────────
// Stored columns: effective_from (date), effective_to (date) — both nullable.
// Evaluates against action_time. If action_time is absent → MISSING_ACTION_TIME.

function _evaluateDateWindow(restriction, _request, context) {
  const actionTime = context.action_time;
  if (!actionTime) {
    return { pass: false, reasonCode: 'MISSING_ACTION_TIME' };
  }

  // Compare date portions only; normalize DB Date objects or strings to 'YYYY-MM-DD'
  const actionDate = _toDateStr(actionTime);
  const from = restriction.effective_from ? _toDateStr(restriction.effective_from) : null;
  const to   = restriction.effective_to   ? _toDateStr(restriction.effective_to)   : null;

  if (from && actionDate < from) {
    return { pass: false, reasonCode: 'DATE_WINDOW_RESTRICTION' };
  }
  if (to && actionDate > to) {
    return { pass: false, reasonCode: 'DATE_WINDOW_RESTRICTION' };
  }
  return { pass: true };
}

// ── Handler registry ──────────────────────────────────────────────────────────

const HANDLERS = Object.freeze({
  monetary_limit: _evaluateMonetaryLimit,
  date_window:    _evaluateDateWindow,
});

/**
 * Evaluate a single restriction against the request and context.
 *
 * @param {object} restriction
 * @param {object} request
 * @param {{ evaluated_at: string, action_time: string|null }} context
 * @returns {{ pass: boolean, reasonCode?: string } | { unknown: true }}
 */
function evaluateRestriction(restriction, request, context) {
  const handler = HANDLERS[restriction.restriction_type];
  if (!handler) {
    return { unknown: true };
  }
  return handler(restriction, request, context);
}

/**
 * Return true if we have a handler for this restriction type.
 * @param {string} restrictionType
 * @returns {boolean}
 */
function hasHandler(restrictionType) {
  return Object.prototype.hasOwnProperty.call(HANDLERS, restrictionType);
}

module.exports = { evaluateRestriction, hasHandler, HANDLERS };
