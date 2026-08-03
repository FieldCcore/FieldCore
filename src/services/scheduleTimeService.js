'use strict';
/**
 * scheduleTimeService — authoritative scheduling timezone service.
 *
 * All Calendar, Dispatch, Dashboard, and notification code that converts
 * between local wall-clock times and UTC instants MUST use this module.
 *
 * Rules:
 *  - Store schedules as UTC instants (TIMESTAMPTZ).
 *  - Retain the scheduling timezone (scheduling_timezone column) for audit.
 *  - NEVER use fixed offsets (UTC-5, -300 min, etc.) — use IANA identifiers.
 *  - DST transitions are handled by the Intl API (IANA rules embedded in Node).
 *
 * Timezone precedence for scheduling:
 *   entityTimezone ?? tenantTimezone ?? 'UTC'
 *
 * User display timezone is SEPARATE and controlled by user preferences.
 * It must NEVER alter stored UTC instants or business scheduling timezone.
 */

const FALLBACK_TZ = 'UTC';

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Returns true if tz is a recognised IANA timezone identifier.
 * Rejects fixed-offset strings like "UTC-5" or "GMT+4".
 * Uses Node's built-in Intl API (no external packages required).
 */
// Common timezone abbreviations that Intl.DateTimeFormat accepts but that do NOT
// handle DST and are often used by mistake instead of proper IANA identifiers.
// e.g. 'EST' maps to America/Panama (UTC-5 always) not America/New_York.
const BANNED_TZ_ABBREVIATIONS = new Set([
  'EST', 'EDT', 'CST', 'CDT', 'MST', 'MDT', 'PST', 'PDT',
  'AST', 'ADT', 'HST', 'AKST', 'AKDT',
  'CET', 'CEST', 'EET', 'EEST', 'WET', 'WEST',
  'IST', 'JST', 'KST', 'SGT', 'HKT', 'AEST', 'AEDT',
]);

function validateIanaTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  // Reject fixed-offset aliases that aren't proper IANA zone names.
  // Pure "UTC" is valid; "UTC+5" / "UTC-5" are not.
  if (/^(UTC|GMT)[+-]\d/.test(tz)) return false;
  // Reject common timezone abbreviations that skip DST transitions.
  if (BANNED_TZ_ABBREVIATIONS.has(tz.toUpperCase())) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Throws if the timezone is not a valid IANA identifier.
 * Used at route entry points to reject bad client input early.
 */
function assertIanaTimezone(tz) {
  if (!validateIanaTimezone(tz)) {
    const err = new Error(`Invalid IANA timezone: ${JSON.stringify(tz)}`);
    err.statusCode = 400;
    err.body = { error: `Invalid timezone: ${tz}. Use an IANA identifier such as America/New_York.` };
    throw err;
  }
}

// ── UTC ↔ local conversion helpers ────────────────────────────────────────────

/**
 * Get the UTC offset for a timezone at a given UTC moment, in minutes.
 * Handles DST transitions correctly via the Intl API.
 *
 * @param {Date}   utcDate
 * @param {string} ianaTimezone
 * @returns {number} offset in minutes (negative west of UTC, positive east)
 */
function _getUtcOffsetMinutes(utcDate, ianaTimezone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: ianaTimezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(utcDate);
  const get = (type) => parseInt(parts.find(p => p.type === type)?.value ?? '0', 10);
  let h = get('hour');
  if (h === 24) h = 0; // midnight edge case
  const localMs = Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'), get('second'));
  return (localMs - utcDate.getTime()) / 60000;
}

/**
 * Convert a naive local date+time to a UTC Date.
 *
 * Algorithm: use the UTC offset at approximately the target moment.
 * A second iteration resolves DST ambiguity at transitions.
 *
 * DST edge cases:
 *   - Spring-forward (nonexistent time): returns the post-forward equivalent.
 *   - Fall-back (repeated time): resolves to the FIRST occurrence (pre-fall-back).
 *
 * @param {string} localDate  'YYYY-MM-DD'
 * @param {string} localTime  'HH:MM' or 'HH:MM:SS'
 * @param {string} ianaTimezone
 * @returns {Date} UTC instant
 */
function localScheduleToUtc(localDate, localTime, ianaTimezone) {
  if (!validateIanaTimezone(ianaTimezone)) {
    throw Object.assign(
      new Error(`Invalid IANA timezone: ${ianaTimezone}`),
      { statusCode: 400, body: { error: `Invalid timezone: ${ianaTimezone}` } },
    );
  }

  const [y, mo, d] = localDate.split('-').map(Number);
  const [h, m]     = localTime.split(':').map(Number);
  if (isNaN(y) || isNaN(mo) || isNaN(d) || isNaN(h) || isNaN(m)) {
    throw Object.assign(
      new Error(`Invalid date/time: ${localDate} ${localTime}`),
      { statusCode: 400, body: { error: 'Invalid date or time value.' } },
    );
  }

  // Naive UTC guess (treat local as if it were UTC)
  const guessMs = Date.UTC(y, mo - 1, d, h, m, 0);
  const guessDate = new Date(guessMs);

  // Find offset at the guess point, then refine
  const offset1 = _getUtcOffsetMinutes(guessDate, ianaTimezone);
  const utc1    = new Date(guessMs - offset1 * 60000);

  // Second iteration handles DST transitions cleanly
  const offset2 = _getUtcOffsetMinutes(utc1, ianaTimezone);
  const utc2    = new Date(guessMs - offset2 * 60000);

  return utc2;
}

/**
 * Convert a UTC Date to local date and time in the given timezone.
 *
 * @param {Date|string} utcDate
 * @param {string}      ianaTimezone
 * @returns {{ date: string, time: string, datetime: string }}
 *   date     = 'YYYY-MM-DD'
 *   time     = 'HH:MM'
 *   datetime = 'YYYY-MM-DDTHH:MM'
 */
function utcScheduleToLocal(utcDate, ianaTimezone) {
  const d = utcDate instanceof Date ? utcDate : new Date(utcDate);
  if (!validateIanaTimezone(ianaTimezone)) {
    throw new Error(`Invalid IANA timezone: ${ianaTimezone}`);
  }
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: ianaTimezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (type) => parts.find(p => p.type === type)?.value ?? '00';
  let h = get('hour');
  if (h === '24') h = '00'; // midnight edge case
  const date     = `${get('year')}-${get('month')}-${get('day')}`;
  const time     = `${h}:${get('minute')}`;
  return { date, time, datetime: `${date}T${time}` };
}

// ── Date-range helpers ────────────────────────────────────────────────────────

/**
 * Calculate the UTC range for a local calendar date in a given timezone.
 * Returns a half-open interval: [startUtc, endUtc)
 *
 * Example: '2026-08-02' in 'America/New_York' (UTC-4)
 *   → startUtc = 2026-08-02T04:00:00Z
 *   → endUtc   = 2026-08-03T04:00:00Z
 *
 * @param {string} localDate   'YYYY-MM-DD'
 * @param {string} ianaTimezone
 * @returns {{ startUtc: Date, endUtc: Date }}
 */
function getLocalDayRangeUtc(localDate, ianaTimezone) {
  const tz = validateIanaTimezone(ianaTimezone) ? ianaTimezone : FALLBACK_TZ;
  const startUtc = localScheduleToUtc(localDate, '00:00', tz);
  const [y, mo, d] = localDate.split('-').map(Number);
  const nextDay = new Date(Date.UTC(y, mo - 1, d + 1));
  const nextDateStr = `${nextDay.getUTCFullYear()}-${String(nextDay.getUTCMonth() + 1).padStart(2, '0')}-${String(nextDay.getUTCDate()).padStart(2, '0')}`;
  const endUtc = localScheduleToUtc(nextDateStr, '00:00', tz);
  return { startUtc, endUtc };
}

/**
 * Returns true if a scheduled interval overlaps with a given UTC range.
 * Interval: [startUtc, endUtc)  — half-open.
 *
 * @param {Date|string} scheduledStartUtc
 * @param {Date|string} scheduledEndUtc
 * @param {Date}        rangeStartUtc
 * @param {Date}        rangeEndUtc
 * @returns {boolean}
 */
function doesScheduledIntervalOverlapRange(scheduledStartUtc, scheduledEndUtc, rangeStartUtc, rangeEndUtc) {
  const s = scheduledStartUtc instanceof Date ? scheduledStartUtc : new Date(scheduledStartUtc);
  const e = scheduledEndUtc   instanceof Date ? scheduledEndUtc   : new Date(scheduledEndUtc);
  return s < rangeEndUtc && e >= rangeStartUtc;
}

/**
 * Resolve the effective scheduling timezone using precedence:
 *   entityTimezone ?? tenantTimezone ?? fallback
 *
 * Validates each candidate with validateIanaTimezone; skips invalid ones.
 *
 * @param {{ entityTimezone?: string, tenantTimezone?: string, fallback?: string }} opts
 * @returns {string} IANA timezone identifier
 */
function resolveSchedulingTimezone({ entityTimezone, tenantTimezone, fallback = FALLBACK_TZ } = {}) {
  if (entityTimezone && validateIanaTimezone(entityTimezone)) return entityTimezone;
  if (tenantTimezone && validateIanaTimezone(tenantTimezone)) return tenantTimezone;
  return fallback;
}

/**
 * Format a UTC timestamp for display in a scheduling timezone.
 * Returns a human-readable string.
 *
 * @param {Date|string} utcDate
 * @param {string}      ianaTimezone
 * @param {object}      [opts]
 * @param {boolean}     [opts.showDate=true]
 * @param {boolean}     [opts.showTime=true]
 * @param {boolean}     [opts.showTZLabel=false]
 * @param {boolean}     [opts.hour12=true]
 * @returns {string}
 */
function formatScheduleForDisplay(utcDate, ianaTimezone, opts = {}) {
  const d  = utcDate instanceof Date ? utcDate : new Date(utcDate);
  const tz = validateIanaTimezone(ianaTimezone) ? ianaTimezone : FALLBACK_TZ;
  const { showDate = true, showTime = true, showTZLabel = false, hour12 = true } = opts;

  const fmtOpts = { timeZone: tz };
  if (showDate) Object.assign(fmtOpts, { month: 'short', day: 'numeric', year: 'numeric' });
  if (showTime) Object.assign(fmtOpts, { hour: 'numeric', minute: '2-digit', hour12 });
  if (showTZLabel) Object.assign(fmtOpts, { timeZoneName: 'short' });

  return d.toLocaleString('en-US', fmtOpts);
}

module.exports = {
  validateIanaTimezone,
  assertIanaTimezone,
  localScheduleToUtc,
  utcScheduleToLocal,
  getLocalDayRangeUtc,
  doesScheduledIntervalOverlapRange,
  resolveSchedulingTimezone,
  formatScheduleForDisplay,
};
