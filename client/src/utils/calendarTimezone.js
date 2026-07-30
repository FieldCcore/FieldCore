/**
 * Calendar timezone utilities — single shared resolver for all Calendar surfaces.
 *
 * All components that display job times (Calendar grid, event cards, drawer) MUST
 * use resolveCalendarTimeZone() as their single source of timezone truth.
 * Never scatter raw new Date() formatting, toLocaleString() without timeZone,
 * hardcoded offsets, or hardcoded timezone identifiers across components.
 *
 * Timezone precedence:
 *   1. userTimezone   — per-user override (users.timezone column — reserved for future)
 *   2. businessTimezone — business_profiles.timezone per account (current source of truth)
 *   3. browser timezone — Intl.DateTimeFormat().resolvedOptions().timeZone
 *   4. 'America/Chicago' — geographically central US safe default
 */

import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Returns true if tz is a recognized IANA timezone identifier.
 * Uses Intl.DateTimeFormat which has the IANA DB embedded in all modern runtimes.
 */
export function isValidTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ── Resolver ──────────────────────────────────────────────────────────────────

/**
 * Resolve the active calendar display timezone.
 *
 * @param {object}      context
 * @param {string|null} [context.userTimezone]     – per-user override (future)
 * @param {string|null} [context.businessTimezone] – business_profiles.timezone
 * @returns {{ timezone: string, source: 'user'|'business'|'browser'|'default' }}
 */
export function resolveCalendarTimeZone(context = {}) {
  const { userTimezone, businessTimezone } = context;

  if (userTimezone && isValidTimezone(userTimezone)) {
    return { timezone: userTimezone, source: 'user' };
  }

  if (businessTimezone && isValidTimezone(businessTimezone)) {
    return { timezone: businessTimezone, source: 'business' };
  }

  try {
    const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browser && isValidTimezone(browser)) {
      return { timezone: browser, source: 'browser' };
    }
  } catch {
    // Intl not available — fall through to default
  }

  return { timezone: 'America/Chicago', source: 'default' };
}

// ── Display formatting ────────────────────────────────────────────────────────

/**
 * Format a UTC date using a date-fns format string in the given IANA timezone.
 *
 * Wraps date-fns-tz formatInTimeZone. Falls back to browser local with a
 * console warning on invalid timezone — never silently produces Invalid Date.
 *
 * @param {Date|string|number} date       – UTC timestamp (Date object or ISO string)
 * @param {string}             formatStr  – date-fns format string, e.g. 'MMM d, yyyy h:mm a'
 * @param {string}             timezone   – IANA identifier, e.g. 'America/New_York'
 * @returns {string}
 */
export function formatTZ(date, formatStr, timezone) {
  const d = date instanceof Date ? date : new Date(date);
  if (!d || isNaN(d.getTime())) {
    if (typeof window !== 'undefined') console.warn('[calendarTimezone] formatTZ: invalid date', date);
    return '—';
  }

  const resolvedTZ = isValidTimezone(timezone)
    ? timezone
    : (() => {
        if (typeof window !== 'undefined') console.warn('[calendarTimezone] formatTZ: invalid timezone, using browser', timezone);
        try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'America/Chicago'; }
      })();

  return formatInTimeZone(d, resolvedTZ, formatStr);
}

// ── UTC offset (DST-correct) ──────────────────────────────────────────────────

/**
 * Returns the UTC offset for a timezone at a given moment, in minutes.
 * Handles DST transitions correctly.
 * Example: America/New_York in summer → -240 (UTC-4)
 *
 * @param {Date|string|number} date
 * @param {string}             timezone
 * @returns {number} offset in minutes
 */
export function getTZOffset(date, timezone) {
  if (!isValidTimezone(timezone)) return 0;
  const d = date instanceof Date ? date : new Date(date);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (type) => parseInt(parts.find(p => p.type === type)?.value ?? '0', 10);
  let hour = get('hour');
  if (hour === 24) hour = 0; // midnight edge-case
  const localMs = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return (localMs - d.getTime()) / 60000;
}

// ── Calendar slot conversion ──────────────────────────────────────────────────

/**
 * Convert a UTC Date to the wall-clock time in the target timezone as a
 * "fake-local" Date — useful when you need the same hour/minute numbers that
 * a user in that timezone would see, expressed as a plain Date for date-fns
 * arithmetic.
 *
 * ⚠ react-big-calendar limitation: RBC event grid placement uses the browser's
 * local Date methods, so this conversion only places events correctly when the
 * browser timezone matches the target timezone. Use formatTZ() for labels.
 */
export function toCalendarLocal(utcDate, timezone) {
  const d = utcDate instanceof Date ? utcDate : new Date(utcDate);
  if (!isValidTimezone(timezone)) return d;
  return toZonedTime(d, timezone);
}

/**
 * Convert a "calendar-local" Date (as given by react-big-calendar's
 * onSelectSlot, onEventDrop, or onEventResize) back to a UTC Date.
 * Treats the input date as wall-clock time in the given timezone.
 *
 * Example: user in NYC clicks a 2pm slot (browser reads as 2pm Eastern = UTC 18:00).
 * fromCalendarLocal(slotDate, 'America/New_York') → Date at 18:00 UTC.
 */
export function fromCalendarLocal(localDate, timezone) {
  const d = localDate instanceof Date ? localDate : new Date(localDate);
  if (!isValidTimezone(timezone)) return d;
  return fromZonedTime(d, timezone);
}
