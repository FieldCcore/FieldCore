'use strict';

/**
 * Authority Engine — Currency Minor-Unit Exponent Map.
 *
 * Maps ISO 4217 currency codes to their minor-unit exponent (decimal places).
 *
 * Examples:
 *   USD → 2  ($1.00 = 100 cents)
 *   EUR → 2  (€1.00 = 100 cents)
 *   JPY → 0  (¥1 = 1 yen, zero-decimal)
 *   KWD → 3  (1 KWD = 1000 fils)
 *   BHD → 3
 *   OMR → 3
 *   TND → 3
 *   CLF → 4
 *   UYI → 0
 *
 * IMPORTANT: The Authority evaluation service accepts amounts in MINOR UNITS.
 * Callers are responsible for converting to minor units before submitting.
 * This map is used for documentation and for validation/UI display only.
 *
 * Design constraint: NO I/O, NO DB, pure data.
 */

/** @type {Record<string, number>} */
const CURRENCY_EXPONENTS = Object.freeze({
  // Two-decimal (most common)
  USD: 2, EUR: 2, GBP: 2, CAD: 2, AUD: 2, NZD: 2,
  CHF: 2, SEK: 2, NOK: 2, DKK: 2, SGD: 2, HKD: 2,
  MXN: 2, BRL: 2, ZAR: 2, INR: 2, CNY: 2, KRW: 2,
  AED: 2, SAR: 2, QAR: 2, MYR: 2, THB: 2, PHP: 2,
  IDR: 2, PLN: 2, CZK: 2, HUF: 2, RON: 2, TRY: 2,
  ILS: 2, EGP: 2, MAD: 2, NGN: 2, GHS: 2, KES: 2,
  COP: 2, PEN: 2, ARS: 2, CLP: 2,
  // Zero-decimal (no minor unit)
  JPY: 0, VND: 0, KRW: 0, PYG: 0, UGX: 0, RWF: 0,
  GNF: 0, XOF: 0, XAF: 0, XPF: 0, BIF: 0, DJF: 0,
  KMF: 0, MGA: 0,
  // Three-decimal
  KWD: 3, BHD: 3, OMR: 3, JOD: 3, TND: 3, LYD: 3, IQD: 3,
  // Four-decimal (special)
  CLF: 4, UYW: 4,
});

// Default exponent when a currency is not in the map (treat as 2 — most common)
const DEFAULT_EXPONENT = 2;

/**
 * Return the minor-unit exponent for an ISO 4217 currency code.
 * Returns DEFAULT_EXPONENT (2) for unknown currencies.
 *
 * @param {string} currencyCode  ISO 4217, e.g. 'USD', 'JPY', 'KWD'
 * @returns {number}  0, 2, 3, or 4
 */
function getExponent(currencyCode) {
  if (typeof currencyCode !== 'string') return DEFAULT_EXPONENT;
  const code = currencyCode.trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(CURRENCY_EXPONENTS, code)) {
    return CURRENCY_EXPONENTS[code];
  }
  return DEFAULT_EXPONENT;
}

/**
 * Return true if this currency uses zero decimal places (no minor unit).
 * For these currencies, 1 unit = 1 minor unit.
 *
 * @param {string} currencyCode
 * @returns {boolean}
 */
function isZeroDecimal(currencyCode) {
  return getExponent(currencyCode) === 0;
}

/**
 * Return true if this currency uses three decimal places.
 * @param {string} currencyCode
 * @returns {boolean}
 */
function isThreeDecimal(currencyCode) {
  return getExponent(currencyCode) === 3;
}

module.exports = {
  CURRENCY_EXPONENTS,
  DEFAULT_EXPONENT,
  getExponent,
  isZeroDecimal,
  isThreeDecimal,
};
