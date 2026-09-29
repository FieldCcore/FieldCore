'use strict';

/**
 * Authority Engine — Timezone Envelope Helper.
 *
 * Provides date-only boundary evaluation using the plausible-timezone envelope.
 * Given an absolute ISO-8601 timestamp, we compute the earliest and latest
 * calendar date it could represent across all UTC offsets from UTC-12 to
 * UTC+14. If a boundary decision is the same in every timezone, we return a
 * definitive answer; otherwise we return AMBIGUOUS (→ MANUAL_REVIEW).
 *
 * Design constraint: NO I/O, NO DB, NO clock reads. Pure function.
 */

// UTC offset range: UTC-12:00 to UTC+14:00 (26 hours total span).
const MIN_OFFSET_HOURS = -12;
const MAX_OFFSET_HOURS = 14;

/**
 * Given an absolute ISO-8601 timestamp (with timezone info), compute the
 * earliest and latest plausible calendar date across all timezones UTC-12 to UTC+14.
 *
 * @param {string} isoTimestamp
 * @returns {{ earliest: string, latest: string } | null}
 */
function getDateEnvelope(isoTimestamp) {
  const ts = new Date(isoTimestamp);
  if (isNaN(ts.getTime())) return null;
  const utcMs = ts.getTime();

  // local_time = utc_time + offset. UTC-12 gives the smallest local time,
  // UTC+14 gives the largest local time.
  const minLocalMs = utcMs + (MIN_OFFSET_HOURS * 3600000);
  const maxLocalMs = utcMs + (MAX_OFFSET_HOURS * 3600000);

  function toDateStr(ms) {
    const d = new Date(ms);
    return d.toISOString().slice(0, 10);
  }

  return {
    earliest: toDateStr(minLocalMs),
    latest:   toDateStr(maxLocalMs),
  };
}

/**
 * Returns true if the ISO timestamp string includes explicit timezone info
 * (either 'Z' or ±hh:mm).
 *
 * @param {string} isoStr
 * @returns {boolean}
 */
function hasTimezoneInfo(isoStr) {
  if (typeof isoStr !== 'string') return false;
  return /[Zz]|[+-]\d{2}:\d{2}$/.test(isoStr);
}

/**
 * Evaluate a date-only comparison against a boundary using the timezone
 * envelope.
 *
 * @param {string} actionTime     ISO-8601 timestamp
 * @param {'from'|'to'} boundaryType  'from' = lower bound (inclusive),
 *                                    'to'   = upper bound (inclusive)
 * @param {string} boundaryDate   'YYYY-MM-DD'
 * @returns {'BEFORE' | 'AFTER' | 'INSIDE' | 'AMBIGUOUS'}
 */
function evaluateDateBoundary(actionTime, boundaryType, boundaryDate) {
  if (!hasTimezoneInfo(actionTime)) {
    // No explicit timezone info — envelope cannot be computed; treat as ambiguous.
    return 'AMBIGUOUS';
  }

  const envelope = getDateEnvelope(actionTime);
  if (!envelope) return 'AMBIGUOUS';

  if (boundaryType === 'from') {
    // Lower bound: actionDate must be >= boundaryDate (inclusive).
    // If even the LATEST local date is before the boundary → BEFORE (unanimous).
    if (envelope.latest < boundaryDate) return 'BEFORE';
    // If even the EARLIEST local date is >= boundary → INSIDE (unanimous).
    if (envelope.earliest >= boundaryDate) return 'INSIDE';
    return 'AMBIGUOUS';
  } else {
    // Upper bound: actionDate must be <= boundaryDate (inclusive).
    // If even the EARLIEST local date is after the boundary → AFTER (unanimous).
    if (envelope.earliest > boundaryDate) return 'AFTER';
    // If even the LATEST local date is <= boundary → INSIDE (unanimous).
    if (envelope.latest <= boundaryDate) return 'INSIDE';
    return 'AMBIGUOUS';
  }
}

module.exports = {
  MIN_OFFSET_HOURS,
  MAX_OFFSET_HOURS,
  getDateEnvelope,
  hasTimezoneInfo,
  evaluateDateBoundary,
};
