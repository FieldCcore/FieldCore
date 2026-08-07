'use strict';

// Calendar-year period boundary utilities. UTC-only. No fiscal year support.

const QUARTER_MONTHS = { Q1: [1, 3], Q2: [4, 6], Q3: [7, 9], Q4: [10, 12] };

/**
 * Convert a Date object to a 'YYYY-MM-DD' string using UTC.
 */
function toIsoDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get the last day of a month (UTC) as a 'YYYY-MM-DD' string.
 */
function lastDayOfMonth(year, month) {
  // Month 1-12. Setting day=0 of next month gives last day of current month.
  const date = new Date(Date.UTC(year, month, 0));
  return toIsoDate(date);
}

/**
 * Return { start, end } boundaries for a named quarter in a given year.
 * Quarter is 'Q1'|'Q2'|'Q3'|'Q4'. Dates are 'YYYY-MM-DD' strings in UTC.
 */
function quarterBoundaries(quarter, year) {
  const [startMonth, endMonth] = QUARTER_MONTHS[quarter];
  const y = String(year);
  const startM = String(startMonth).padStart(2, '0');
  const start = `${y}-${startM}-01`;
  const end = lastDayOfMonth(year, endMonth);
  return { start, end };
}

/**
 * Return { start, end } for year-to-date: Jan 1 through today (UTC).
 */
function ytdBoundaries(year) {
  const y = String(year);
  const start = `${y}-01-01`;
  const end = toIsoDate(new Date());
  return { start, end };
}

/**
 * Return { start, end } for the full calendar year.
 */
function fullYearBoundaries(year) {
  const y = String(year);
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

/**
 * Return the quarter and year that precedes the given quarter.
 * Q1 wraps back to Q4 of the prior year.
 */
function previousQuarter(quarter, year) {
  const order = ['Q1', 'Q2', 'Q3', 'Q4'];
  const idx = order.indexOf(quarter);
  if (idx === 0) return { quarter: 'Q4', year: year - 1 };
  return { quarter: order[idx - 1], year };
}

/**
 * Parse a period string ('Q1'|'Q2'|'Q3'|'Q4'|'ytd'|'year') and return
 * { start, end, label }.
 */
function parsePeriod(str, year) {
  const y = year || currentYear();
  if (str === 'ytd') {
    const { start, end } = ytdBoundaries(y);
    return { start, end, label: formatPeriodLabel('ytd', y) };
  }
  if (str === 'year') {
    const { start, end } = fullYearBoundaries(y);
    return { start, end, label: formatPeriodLabel('year', y) };
  }
  if (QUARTER_MONTHS[str]) {
    const { start, end } = quarterBoundaries(str, y);
    return { start, end, label: formatPeriodLabel(str, y) };
  }
  throw new Error(`Unknown period "${str}". Expected Q1, Q2, Q3, Q4, ytd, or year.`);
}

/**
 * Format a human-readable label for a period.
 * 'Q1' → 'Q1 2026', 'ytd' → 'YTD 2026', 'year' → '2026'
 */
function formatPeriodLabel(period, year) {
  if (period === 'ytd') return `YTD ${year}`;
  if (period === 'year') return String(year);
  return `${period} ${year}`;
}

/**
 * Return the current UTC year as an integer.
 */
function currentYear() {
  return new Date().getUTCFullYear();
}

/**
 * Return the current UTC quarter as 'Q1'|'Q2'|'Q3'|'Q4'.
 */
function currentQuarter() {
  const m = new Date().getUTCMonth() + 1;
  if (m <= 3) return 'Q1';
  if (m <= 6) return 'Q2';
  if (m <= 9) return 'Q3';
  return 'Q4';
}

module.exports = {
  quarterBoundaries,
  ytdBoundaries,
  fullYearBoundaries,
  previousQuarter,
  parsePeriod,
  formatPeriodLabel,
  currentYear,
  currentQuarter,
};
