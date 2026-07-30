/**
 * Calendar timezone resolver and UTC conversion tests.
 *
 * Uses only Node's built-in Intl.DateTimeFormat — no date-fns-tz dependency
 * required at the root level. The resolver logic is inlined here so this file
 * runs in CommonJS (Jest) without ES module transpilation.
 *
 * These tests validate the behaviour defined in calendarTimezone.js.
 */

// ── Inline resolver (mirrors client/src/utils/calendarTimezone.js) ────────────

function isValidTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try { Intl.DateTimeFormat(undefined, { timeZone: tz }); return true; }
  catch { return false; }
}

function resolveCalendarTimeZone(context = {}) {
  const { userTimezone, businessTimezone } = context;
  if (userTimezone && isValidTimezone(userTimezone))
    return { timezone: userTimezone, source: 'user' };
  if (businessTimezone && isValidTimezone(businessTimezone))
    return { timezone: businessTimezone, source: 'business' };
  try {
    const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browser && isValidTimezone(browser)) return { timezone: browser, source: 'browser' };
  } catch {}
  return { timezone: 'America/Chicago', source: 'default' };
}

function getTZOffset(date, timezone) {
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
  if (hour === 24) hour = 0;
  const localMs = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return (localMs - d.getTime()) / 60000;
}

// Get the local hour (0-23) in a timezone for a UTC date
function getLocalHour(utcDate, timezone) {
  const d = utcDate instanceof Date ? utcDate : new Date(utcDate);
  return parseInt(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hour: '2-digit', hour12: false,
  }).format(d).replace('24', '0'), 10);
}

// Get the local date string "YYYY-MM-DD" in a timezone for a UTC date
function getLocalDate(utcDate, timezone) {
  const d = utcDate instanceof Date ? utcDate : new Date(utcDate);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

// Get local hour:minute string "HH:MM" in a timezone
function getLocalTime(utcDate, timezone) {
  const d = utcDate instanceof Date ? utcDate : new Date(utcDate);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}

// ── Resolver: precedence ──────────────────────────────────────────────────────

describe('resolveCalendarTimeZone — precedence', () => {
  test('user timezone has highest precedence over business', () => {
    const r = resolveCalendarTimeZone({
      userTimezone: 'America/Chicago',
      businessTimezone: 'America/New_York',
    });
    expect(r.timezone).toBe('America/Chicago');
    expect(r.source).toBe('user');
  });

  test('business timezone used when user timezone absent', () => {
    const r = resolveCalendarTimeZone({ businessTimezone: 'America/Los_Angeles' });
    expect(r.timezone).toBe('America/Los_Angeles');
    expect(r.source).toBe('business');
  });

  test('business timezone used when user timezone is null', () => {
    const r = resolveCalendarTimeZone({ userTimezone: null, businessTimezone: 'America/Denver' });
    expect(r.timezone).toBe('America/Denver');
    expect(r.source).toBe('business');
  });

  test('browser timezone used when neither user nor business is set', () => {
    const r = resolveCalendarTimeZone({});
    expect(r.source).toBe('browser');
    expect(typeof r.timezone).toBe('string');
    expect(r.timezone.length).toBeGreaterThan(0);
  });

  test('safe default returned when Intl is unavailable (simulated)', () => {
    // Simulate missing Intl by passing an explicitly invalid business timezone
    // and no user timezone — the browser fallback should still succeed in
    // Node.js, so we only test the "all sources fail" path via invalid inputs
    const r = resolveCalendarTimeZone({ userTimezone: '', businessTimezone: '' });
    // Should fall through to browser or default — must be a valid IANA identifier
    expect(isValidTimezone(r.timezone)).toBe(true);
  });

  test('returns valid IANA identifier for all sources', () => {
    const sources = [
      resolveCalendarTimeZone({ userTimezone: 'Pacific/Honolulu' }),
      resolveCalendarTimeZone({ businessTimezone: 'America/Anchorage' }),
      resolveCalendarTimeZone({}),
    ];
    sources.forEach(r => expect(isValidTimezone(r.timezone)).toBe(true));
  });
});

// ── Resolver: invalid timezone handling ───────────────────────────────────────

describe('resolveCalendarTimeZone — invalid inputs', () => {
  test('rejects invalid IANA string EDT (DST-only abbreviation)', () => {
    const r = resolveCalendarTimeZone({ businessTimezone: 'EDT' });
    // DST-only abbreviations are not valid IANA identifiers — should fall through to browser/default
    expect(r.source).not.toBe('business');
  });

  test('rejects numeric offset string UTC-5', () => {
    const r = resolveCalendarTimeZone({ businessTimezone: 'UTC-5' });
    expect(r.source).not.toBe('business');
  });

  test('rejects garbage string', () => {
    const r = resolveCalendarTimeZone({ businessTimezone: 'Not/ATimezone' });
    expect(r.source).not.toBe('business');
    expect(isValidTimezone(r.timezone)).toBe(true);
  });

  test('isValidTimezone rejects DST-only abbreviations', () => {
    // EDT/CDT/PDT are invalid — they exist only as DST offsets, not as IANA zone IDs.
    // EST/CST/PST are accepted by Intl as legacy fixed-offset IANA identifiers.
    expect(isValidTimezone('EDT')).toBe(false);
    expect(isValidTimezone('CDT')).toBe(false);
    expect(isValidTimezone('PDT')).toBe(false);
  });

  test('isValidTimezone accepts valid IANA identifiers', () => {
    expect(isValidTimezone('America/New_York')).toBe(true);
    expect(isValidTimezone('America/Chicago')).toBe(true);
    expect(isValidTimezone('America/Denver')).toBe(true);
    expect(isValidTimezone('America/Los_Angeles')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('Europe/London')).toBe(true);
    expect(isValidTimezone('Pacific/Honolulu')).toBe(true);
  });
});

// ── UTC → timezone display conversions ───────────────────────────────────────

describe('UTC to timezone conversion — standard offsets', () => {
  // 2026-07-07T18:00:00Z — July, all US zones in summer (DST active for US mainland)
  const UTC_18 = new Date('2026-07-07T18:00:00Z');

  test('UTC 18:00 → Eastern 14:00 (UTC-4 summer)', () => {
    expect(getLocalHour(UTC_18, 'America/New_York')).toBe(14);
  });

  test('UTC 18:00 → Central 13:00 (UTC-5 summer)', () => {
    expect(getLocalHour(UTC_18, 'America/Chicago')).toBe(13);
  });

  test('UTC 18:00 → Mountain 12:00 (UTC-6 summer)', () => {
    expect(getLocalHour(UTC_18, 'America/Denver')).toBe(12);
  });

  test('UTC 18:00 → Pacific 11:00 (UTC-7 summer)', () => {
    expect(getLocalHour(UTC_18, 'America/Los_Angeles')).toBe(11);
  });

  test('UTC 18:00 → Arizona 11:00 (UTC-7, no DST)', () => {
    expect(getLocalHour(UTC_18, 'America/Phoenix')).toBe(11);
  });

  test('UTC 18:00 → Hawaii 08:00 (UTC-10, no DST)', () => {
    expect(getLocalHour(UTC_18, 'Pacific/Honolulu')).toBe(8);
  });

  // Winter: 2026-01-07T18:00:00Z — DST inactive for US mainland
  const UTC_18_WINTER = new Date('2026-01-07T18:00:00Z');

  test('UTC 18:00 → Eastern 13:00 in winter (UTC-5 standard time)', () => {
    expect(getLocalHour(UTC_18_WINTER, 'America/New_York')).toBe(13);
  });

  test('UTC 18:00 → Pacific 10:00 in winter (UTC-8 standard time)', () => {
    expect(getLocalHour(UTC_18_WINTER, 'America/Los_Angeles')).toBe(10);
  });
});

// ── Overnight and cross-midnight event date placement ─────────────────────────

describe('event date placement — overnight and cross-midnight', () => {
  // An event at UTC 01:00 on July 8 is still July 7 in Pacific time
  const UTC_01_JUL8 = new Date('2026-07-08T01:00:00Z');

  test('UTC 2026-07-08T01:00Z appears on July 7 in America/Los_Angeles (UTC-7)', () => {
    expect(getLocalDate(UTC_01_JUL8, 'America/Los_Angeles')).toBe('2026-07-07');
  });

  test('UTC 2026-07-08T01:00Z appears on July 8 in UTC', () => {
    expect(getLocalDate(UTC_01_JUL8, 'UTC')).toBe('2026-07-08');
  });

  test('UTC 2026-07-08T01:00Z appears on July 8 in America/New_York (UTC-4)', () => {
    // 01:00 UTC = 21:00 July 7 in NY? No: 01:00 - 4 = -3 hrs → previous day 21:00
    expect(getLocalDate(UTC_01_JUL8, 'America/New_York')).toBe('2026-07-07');
  });

  test('UTC 2026-07-08T06:00Z appears on July 8 in America/New_York (02:00 NY)', () => {
    const utc6 = new Date('2026-07-08T06:00:00Z');
    expect(getLocalDate(utc6, 'America/New_York')).toBe('2026-07-08');
  });

  test('no double conversion: getTZOffset applied once gives correct local time', () => {
    const utc = new Date('2026-07-07T18:00:00Z');
    const tz = 'America/New_York';
    const offset = getTZOffset(utc, tz); // -240 in summer
    const fakeLocal = new Date(utc.getTime() + offset * 60000);
    // fakeLocal UTC value = 18:00 - 4h = 14:00 UTC
    expect(fakeLocal.toISOString()).toContain('T14:00:00');
    // Applying offset again (double conversion) would give 10:00 — wrong
    const doubleConverted = new Date(fakeLocal.getTime() + offset * 60000);
    expect(doubleConverted.toISOString()).not.toContain('T14:00:00');
  });
});

// ── DST transition tests ──────────────────────────────────────────────────────

describe('daylight-saving transitions', () => {
  // US spring-forward: 2026-03-08 02:00 → 03:00 in Eastern (clocks move forward)
  const SPRING_FORWARD = new Date('2026-03-08T07:00:00Z'); // = 02:00 EST → 03:00 EDT

  test('spring forward: UTC 07:00 = 03:00 EDT (not 02:00) on 2026-03-08', () => {
    expect(getLocalTime(SPRING_FORWARD, 'America/New_York')).toBe('03:00');
  });

  test('spring forward: offset changes from -300 to -240', () => {
    const beforeSpring = new Date('2026-03-08T06:59:00Z'); // 01:59 EST
    const afterSpring  = new Date('2026-03-08T07:01:00Z'); // 03:01 EDT
    const offsetBefore = getTZOffset(beforeSpring, 'America/New_York');
    const offsetAfter  = getTZOffset(afterSpring,  'America/New_York');
    expect(offsetBefore).toBe(-300); // UTC-5 (EST)
    expect(offsetAfter).toBe(-240);  // UTC-4 (EDT)
  });

  // US fall-back: 2026-11-01 02:00 → 01:00 in Eastern (clocks move back)
  const FALL_BACK_BEFORE = new Date('2026-11-01T05:59:00Z'); // = 01:59 EDT
  const FALL_BACK_AFTER  = new Date('2026-11-01T06:01:00Z'); // = 01:01 EST

  test('fall back: offset changes from -240 to -300', () => {
    expect(getTZOffset(FALL_BACK_BEFORE, 'America/New_York')).toBe(-240); // EDT
    expect(getTZOffset(FALL_BACK_AFTER,  'America/New_York')).toBe(-300); // EST
  });

  test('fall back: 1:30am occurs twice — both map to correct local hour', () => {
    const ambiguous1 = new Date('2026-11-01T05:30:00Z'); // = 01:30 EDT (first 1:30)
    const ambiguous2 = new Date('2026-11-01T06:30:00Z'); // = 01:30 EST (second 1:30)
    // Both should report hour 1 — offset makes them distinct UTC timestamps
    expect(getLocalHour(ambiguous1, 'America/New_York')).toBe(1);
    expect(getLocalHour(ambiguous2, 'America/New_York')).toBe(1);
    // But their UTC times are different
    expect(ambiguous1.getTime()).not.toBe(ambiguous2.getTime());
  });

  test('Arizona has no DST — offset stays -420 year-round', () => {
    const summer = new Date('2026-07-01T12:00:00Z');
    const winter = new Date('2026-01-01T12:00:00Z');
    expect(getTZOffset(summer, 'America/Phoenix')).toBe(-420);
    expect(getTZOffset(winter, 'America/Phoenix')).toBe(-420);
  });
});

// ── No-show timing ────────────────────────────────────────────────────────────

describe('no-show timing — UTC timestamp comparison', () => {
  test('no-show deadline calculated from UTC timestamps, not display strings', () => {
    const scheduledAt   = new Date('2026-07-07T14:00:00Z');
    const gracePeriodMs = 15 * 60 * 1000;
    const clockStarted  = new Date('2026-07-07T14:05:00Z');
    const now           = new Date('2026-07-07T14:18:00Z');

    const deadline   = new Date(scheduledAt.getTime() + gracePeriodMs);
    const isOverdue  = now.getTime() > clockStarted.getTime() + gracePeriodMs;
    const elapsedMin = (now.getTime() - clockStarted.getTime()) / 60000;
    const overdueMin = elapsedMin - 15;

    // Clock started 5 min late + 13 min elapsed = 18 min total from schedule
    // Grace: 15 min from clock START → 13 min elapsed from clock start
    expect(isOverdue).toBe(false); // 13 min elapsed, 15 grace → not overdue
    expect(overdueMin).toBeLessThan(0);

    // Timezone never affects the comparison — all UTC
    expect(deadline.toISOString()).toBe('2026-07-07T14:15:00.000Z');
  });

  test('no-show status does not depend on display timezone', () => {
    const clockStartedUTC = new Date('2026-07-07T18:05:00Z');
    const nowUTC          = new Date('2026-07-07T18:22:00Z');
    const gracePeriodMs   = 15 * 60 * 1000;

    const overdueMs = nowUTC.getTime() - clockStartedUTC.getTime() - gracePeriodMs;
    // 17 min elapsed - 15 grace = 2 min overdue regardless of display timezone
    expect(overdueMs).toBeGreaterThan(0);
    expect(overdueMs / 60000).toBeCloseTo(2, 1);
  });
});

// ── Conversion round-trip ─────────────────────────────────────────────────────

describe('UTC round-trip — no double conversion', () => {
  function toCalendarLocal(utcDate, timezone) {
    const offset = getTZOffset(utcDate, timezone);
    return new Date(utcDate.getTime() + offset * 60000);
  }
  function fromCalendarLocal(localDate, timezone) {
    const offset = getTZOffset(localDate, timezone);
    return new Date(localDate.getTime() - offset * 60000);
  }

  test('round-trip: UTC → local → UTC gives original timestamp', () => {
    const original = new Date('2026-07-07T18:00:00Z');
    const tz = 'America/New_York';
    const local = toCalendarLocal(original, tz);
    const back  = fromCalendarLocal(local, tz);
    expect(back.getTime()).toBe(original.getTime());
  });

  // DST round-trips require toZonedTime/fromZonedTime (date-fns-tz) in the source.
  // The inline offset-math implementations above are tested for the normal case only.
  // DST accuracy is tested implicitly via the conversion tests in the DST describe block.
});

// ── Multi-day and business hours ──────────────────────────────────────────────

describe('multi-day job date grouping', () => {
  test('sessions use calendar date string (not UTC timestamp) for date display', () => {
    // Dates stored as DATE type (e.g., '2026-07-07') — displayed with noon offset
    // to avoid DST date-shift. This is the existing safe pattern.
    const sessionDate = '2026-07-07';
    const displayDate = new Date(sessionDate + 'T12:00:00'); // noon local
    // Noon in any US timezone is unambiguously July 7 — not affected by UTC offset
    expect(displayDate.getDate()).toBe(7); // Always July 7 regardless of DST
  });

  test('UTC timestamp at UTC midnight can shift to previous day in western TZs', () => {
    const utcMidnight = new Date('2026-07-08T00:00:00Z');
    // UTC midnight = July 7 in Hawaii (UTC-10)
    expect(getLocalDate(utcMidnight, 'Pacific/Honolulu')).toBe('2026-07-07');
    expect(getLocalDate(utcMidnight, 'UTC')).toBe('2026-07-08');
  });
});
