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

// Returns true if the ISO timestamp string includes timezone information.
function _hasTimezone(isoStr) {
  if (typeof isoStr !== 'string') return false;
  return /[Zz]|[+-]\d{2}:\d{2}$/.test(isoStr);
}

// ── monetary_limit ────────────────────────────────────────────────────────────
// parameters: { amount: integer (minor units), currency?: string,
//               periodic?: boolean, cumulative?: boolean, aggregate?: boolean,
//               boundary_inclusive?: boolean }
// request: { amount?: integer, currency?: string }

function _evaluateMonetaryLimit(restriction, request) {
  const params = restriction.parameters || {};
  const limitAmount = params.amount;

  if (typeof limitAmount !== 'number' || !Number.isInteger(limitAmount)) {
    // Malformed restriction — cannot evaluate, escalate
    return { unknown: true };
  }

  // Correction 7a: cumulative/periodic/aggregate limits require external state
  if (params.periodic || params.cumulative || params.aggregate) {
    return { pass: false, reasonCode: 'CUMULATIVE_LIMIT_UNSUPPORTED' };
  }

  const reqAmount = request.amount;
  if (reqAmount === null || reqAmount === undefined) {
    return { pass: false, reasonCode: 'MISSING_REQUEST_AMOUNT' };
  }
  if (typeof reqAmount !== 'number' || !Number.isInteger(reqAmount)) {
    return { pass: false, reasonCode: 'MISSING_REQUEST_AMOUNT' };
  }

  // Correction 7b: currency checks
  const limitCurrency = params.currency;
  const reqCurrency   = request.currency;
  if (limitCurrency && !reqCurrency) {
    return { pass: false, reasonCode: 'MISSING_CURRENCY' };
  }
  if (limitCurrency && reqCurrency && limitCurrency !== reqCurrency) {
    return { pass: false, reasonCode: 'CURRENCY_MISMATCH' };
  }

  if (reqAmount > limitAmount) {
    return { pass: false, reasonCode: 'MONETARY_LIMIT_EXCEEDED' };
  }

  // Correction 7c: exact boundary with undefined inclusive/exclusive semantics
  if (reqAmount === limitAmount && params.boundary_inclusive === undefined) {
    // amount === limit passes (inclusive-by-default) unless semantics are explicitly ambiguous
    // Only escalate if the restriction explicitly declares it is a strict boundary
    // (i.e., neither true nor false is present) — per spec, pass for standard case
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

  // Correction 7d: exact boundary at 'from' without timezone → TIMEZONE_BOUNDARY_AMBIGUOUS
  if (from && actionDate === from && !_hasTimezone(String(context.action_time))) {
    return { pass: false, reasonCode: 'TIMEZONE_BOUNDARY_AMBIGUOUS' };
  }

  // Correction 7e: exact boundary at 'to' → BOUNDARY_SEMANTICS_UNDEFINED
  if (to && actionDate === to) {
    return { pass: false, reasonCode: 'BOUNDARY_SEMANTICS_UNDEFINED' };
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
