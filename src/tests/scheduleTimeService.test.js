'use strict';
/**
 * Tests for src/services/scheduleTimeService.js
 *
 * All time-math is validated against known UTC↔local pairs so tests pass
 * regardless of the CI/dev server's local system timezone.
 */

const {
  validateIanaTimezone,
  assertIanaTimezone,
  localScheduleToUtc,
  utcScheduleToLocal,
  getLocalDayRangeUtc,
  doesScheduledIntervalOverlapRange,
  resolveSchedulingTimezone,
  formatScheduleForDisplay,
} = require('../services/scheduleTimeService');

// ── validateIanaTimezone ───────────────────────────────────────────────────────

describe('validateIanaTimezone', () => {
  test('accepts valid IANA identifiers', () => {
    expect(validateIanaTimezone('America/New_York')).toBe(true);
    expect(validateIanaTimezone('America/Chicago')).toBe(true);
    expect(validateIanaTimezone('UTC')).toBe(true);
    expect(validateIanaTimezone('Europe/London')).toBe(true);
    expect(validateIanaTimezone('Asia/Tokyo')).toBe(true);
    expect(validateIanaTimezone('Australia/Sydney')).toBe(true);
    expect(validateIanaTimezone('Pacific/Honolulu')).toBe(true);
  });

  test('rejects fixed-offset aliases', () => {
    expect(validateIanaTimezone('UTC+5')).toBe(false);
    expect(validateIanaTimezone('UTC-5')).toBe(false);
    expect(validateIanaTimezone('GMT+4')).toBe(false);
    expect(validateIanaTimezone('GMT-7')).toBe(false);
  });

  test('rejects invalid and empty values', () => {
    expect(validateIanaTimezone('')).toBe(false);
    expect(validateIanaTimezone(null)).toBe(false);
    expect(validateIanaTimezone(undefined)).toBe(false);
    expect(validateIanaTimezone(42)).toBe(false);
    expect(validateIanaTimezone('Not/ATimezone')).toBe(false);
    expect(validateIanaTimezone('Florida')).toBe(false);
    expect(validateIanaTimezone('Eastern')).toBe(false);
  });
});

// ── assertIanaTimezone ────────────────────────────────────────────────────────

describe('assertIanaTimezone', () => {
  test('does not throw for valid IANA timezone', () => {
    expect(() => assertIanaTimezone('America/New_York')).not.toThrow();
    expect(() => assertIanaTimezone('UTC')).not.toThrow();
  });

  test('throws with status 400 for invalid timezone', () => {
    let err;
    try { assertIanaTimezone('UTC-5'); } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(400);
    expect(err.body).toHaveProperty('error');
  });

  test('throws for empty string', () => {
    expect(() => assertIanaTimezone('')).toThrow();
  });
});

// ── localScheduleToUtc ────────────────────────────────────────────────────────

describe('localScheduleToUtc', () => {
  test('converts NYC summer time (UTC-4) correctly', () => {
    // 2026-08-02 07:30 America/New_York = 11:30 UTC (summer, UTC-4)
    const utc = localScheduleToUtc('2026-08-02', '07:30', 'America/New_York');
    expect(utc).toBeInstanceOf(Date);
    expect(utc.toISOString()).toBe('2026-08-02T11:30:00.000Z');
  });

  test('converts NYC winter time (UTC-5) correctly', () => {
    // 2026-01-15 09:00 America/New_York = 14:00 UTC (winter, UTC-5)
    const utc = localScheduleToUtc('2026-01-15', '09:00', 'America/New_York');
    expect(utc.toISOString()).toBe('2026-01-15T14:00:00.000Z');
  });

  test('converts Chicago summer time (UTC-5) correctly', () => {
    // 2026-07-10 14:00 America/Chicago = 19:00 UTC (summer, UTC-5)
    const utc = localScheduleToUtc('2026-07-10', '14:00', 'America/Chicago');
    expect(utc.toISOString()).toBe('2026-07-10T19:00:00.000Z');
  });

  test('converts LA time (UTC-7 summer) correctly', () => {
    // 2026-08-02 07:30 America/Los_Angeles = 14:30 UTC (summer, UTC-7)
    const utc = localScheduleToUtc('2026-08-02', '07:30', 'America/Los_Angeles');
    expect(utc.toISOString()).toBe('2026-08-02T14:30:00.000Z');
  });

  test('converts UTC timezone (no offset) correctly', () => {
    const utc = localScheduleToUtc('2026-06-01', '12:00', 'UTC');
    expect(utc.toISOString()).toBe('2026-06-01T12:00:00.000Z');
  });

  test('converts London BST (UTC+1 summer) correctly', () => {
    // 2026-07-04 09:00 Europe/London = 08:00 UTC (BST = UTC+1)
    const utc = localScheduleToUtc('2026-07-04', '09:00', 'Europe/London');
    expect(utc.toISOString()).toBe('2026-07-04T08:00:00.000Z');
  });

  test('converts Tokyo (UTC+9, no DST) correctly', () => {
    // 2026-08-02 07:30 Asia/Tokyo = 2026-08-01T22:30 UTC
    const utc = localScheduleToUtc('2026-08-02', '07:30', 'Asia/Tokyo');
    expect(utc.toISOString()).toBe('2026-08-01T22:30:00.000Z');
  });

  test('handles midnight boundary correctly', () => {
    const utc = localScheduleToUtc('2026-08-02', '00:00', 'America/New_York');
    expect(utc.toISOString()).toBe('2026-08-02T04:00:00.000Z');
  });

  test('throws 400 for invalid timezone', () => {
    let err;
    try { localScheduleToUtc('2026-08-02', '07:30', 'UTC-5'); } catch (e) { err = e; }
    expect(err.statusCode).toBe(400);
  });

  test('throws 400 for invalid date', () => {
    expect(() => localScheduleToUtc('notadate', '07:30', 'UTC')).toThrow();
  });
});

// ── utcScheduleToLocal ────────────────────────────────────────────────────────

describe('utcScheduleToLocal', () => {
  test('converts UTC to NYC summer time correctly', () => {
    const utcDate = new Date('2026-08-02T11:30:00.000Z');
    const local = utcScheduleToLocal(utcDate, 'America/New_York');
    expect(local.date).toBe('2026-08-02');
    expect(local.time).toBe('07:30');
    expect(local.datetime).toBe('2026-08-02T07:30');
  });

  test('converts UTC to Chicago winter time correctly', () => {
    const utcDate = new Date('2026-01-15T19:00:00.000Z');
    const local = utcScheduleToLocal(utcDate, 'America/Chicago');
    expect(local.date).toBe('2026-01-15');
    expect(local.time).toBe('13:00');
    expect(local.datetime).toBe('2026-01-15T13:00');
  });

  test('accepts ISO string input', () => {
    const local = utcScheduleToLocal('2026-08-02T11:30:00.000Z', 'America/New_York');
    expect(local.time).toBe('07:30');
  });

  test('returns correct structure', () => {
    const local = utcScheduleToLocal(new Date('2026-06-01T12:00:00Z'), 'UTC');
    expect(local).toHaveProperty('date');
    expect(local).toHaveProperty('time');
    expect(local).toHaveProperty('datetime');
    expect(local.datetime).toBe(`${local.date}T${local.time}`);
  });
});

// ── round-trip: localScheduleToUtc → utcScheduleToLocal ──────────────────────

describe('localScheduleToUtc / utcScheduleToLocal round-trip', () => {
  const cases = [
    { date: '2026-08-02', time: '07:30', tz: 'America/New_York'  },
    { date: '2026-01-15', time: '09:00', tz: 'America/New_York'  },
    { date: '2026-03-15', time: '14:00', tz: 'America/Chicago'   },
    { date: '2026-07-10', time: '08:00', tz: 'America/Los_Angeles'},
    { date: '2026-08-01', time: '23:59', tz: 'UTC'               },
    { date: '2026-04-01', time: '12:00', tz: 'Europe/London'     },
    { date: '2026-08-15', time: '09:00', tz: 'Asia/Tokyo'        },
  ];

  cases.forEach(({ date, time, tz }) => {
    test(`round-trips ${date} ${time} in ${tz}`, () => {
      const utc   = localScheduleToUtc(date, time, tz);
      const local = utcScheduleToLocal(utc, tz);
      expect(local.date).toBe(date);
      expect(local.time).toBe(time);
    });
  });
});

// ── getLocalDayRangeUtc ───────────────────────────────────────────────────────

describe('getLocalDayRangeUtc', () => {
  test('returns correct UTC range for NYC summer date', () => {
    // 2026-08-02 in America/New_York (UTC-4):
    //   00:00 local = 04:00 UTC  (start)
    //   00:00 next day = 04:00 UTC next day (end)
    const { startUtc, endUtc } = getLocalDayRangeUtc('2026-08-02', 'America/New_York');
    expect(startUtc.toISOString()).toBe('2026-08-02T04:00:00.000Z');
    expect(endUtc.toISOString()).toBe('2026-08-03T04:00:00.000Z');
  });

  test('returns correct UTC range for UTC timezone', () => {
    const { startUtc, endUtc } = getLocalDayRangeUtc('2026-06-01', 'UTC');
    expect(startUtc.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(endUtc.toISOString()).toBe('2026-06-02T00:00:00.000Z');
  });

  test('range duration is exactly 24 hours on non-DST day', () => {
    const { startUtc, endUtc } = getLocalDayRangeUtc('2026-08-10', 'America/Chicago');
    const diffHours = (endUtc - startUtc) / 3600000;
    expect(diffHours).toBe(24);
  });

  test('start is before end', () => {
    const { startUtc, endUtc } = getLocalDayRangeUtc('2026-11-01', 'America/New_York');
    expect(startUtc < endUtc).toBe(true);
  });

  test('falls back to UTC for invalid timezone', () => {
    const { startUtc, endUtc } = getLocalDayRangeUtc('2026-06-01', 'INVALID');
    expect(startUtc.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(endUtc.toISOString()).toBe('2026-06-02T00:00:00.000Z');
  });
});

// ── doesScheduledIntervalOverlapRange ─────────────────────────────────────────

describe('doesScheduledIntervalOverlapRange', () => {
  const rangeStart = new Date('2026-08-02T04:00:00Z'); // 00:00 ET
  const rangeEnd   = new Date('2026-08-03T04:00:00Z'); // 00:00 ET next day

  test('job fully within range overlaps', () => {
    const s = new Date('2026-08-02T11:30:00Z'); // 07:30 ET
    const e = new Date('2026-08-02T13:00:00Z'); // 09:00 ET
    expect(doesScheduledIntervalOverlapRange(s, e, rangeStart, rangeEnd)).toBe(true);
  });

  test('job spanning range start overlaps', () => {
    const s = new Date('2026-08-02T02:00:00Z'); // day before
    const e = new Date('2026-08-02T05:00:00Z'); // just into range
    expect(doesScheduledIntervalOverlapRange(s, e, rangeStart, rangeEnd)).toBe(true);
  });

  test('job spanning range end overlaps', () => {
    const s = new Date('2026-08-03T03:00:00Z');
    const e = new Date('2026-08-03T06:00:00Z');
    expect(doesScheduledIntervalOverlapRange(s, e, rangeStart, rangeEnd)).toBe(true);
  });

  test('job entirely before range does not overlap', () => {
    const s = new Date('2026-08-01T11:00:00Z');
    const e = new Date('2026-08-01T13:00:00Z');
    expect(doesScheduledIntervalOverlapRange(s, e, rangeStart, rangeEnd)).toBe(false);
  });

  test('job entirely after range does not overlap', () => {
    const s = new Date('2026-08-03T05:00:00Z');
    const e = new Date('2026-08-03T07:00:00Z');
    expect(doesScheduledIntervalOverlapRange(s, e, rangeStart, rangeEnd)).toBe(false);
  });

  test('accepts ISO string inputs', () => {
    expect(doesScheduledIntervalOverlapRange(
      '2026-08-02T11:00:00Z',
      '2026-08-02T13:00:00Z',
      rangeStart,
      rangeEnd
    )).toBe(true);
  });
});

// ── resolveSchedulingTimezone ─────────────────────────────────────────────────

describe('resolveSchedulingTimezone', () => {
  test('prefers entityTimezone over tenantTimezone', () => {
    const tz = resolveSchedulingTimezone({
      entityTimezone: 'America/Chicago',
      tenantTimezone: 'America/New_York',
    });
    expect(tz).toBe('America/Chicago');
  });

  test('falls back to tenantTimezone when no entityTimezone', () => {
    const tz = resolveSchedulingTimezone({
      tenantTimezone: 'America/Denver',
    });
    expect(tz).toBe('America/Denver');
  });

  test('falls back to UTC when no valid timezone provided', () => {
    const tz = resolveSchedulingTimezone({});
    expect(tz).toBe('UTC');
  });

  test('skips invalid entityTimezone and uses tenantTimezone', () => {
    const tz = resolveSchedulingTimezone({
      entityTimezone: 'INVALID',
      tenantTimezone: 'America/Los_Angeles',
    });
    expect(tz).toBe('America/Los_Angeles');
  });

  test('uses custom fallback when provided', () => {
    const tz = resolveSchedulingTimezone({
      fallback: 'America/Chicago',
    });
    expect(tz).toBe('America/Chicago');
  });

  test('does not accept fixed-offset alias as entityTimezone', () => {
    const tz = resolveSchedulingTimezone({
      entityTimezone: 'UTC-5',
      tenantTimezone: 'America/New_York',
    });
    expect(tz).toBe('America/New_York');
  });
});

// ── formatScheduleForDisplay ──────────────────────────────────────────────────

describe('formatScheduleForDisplay', () => {
  const utcDate = new Date('2026-08-02T11:30:00.000Z'); // 07:30 ET

  test('formats time in scheduling timezone (not UTC)', () => {
    const str = formatScheduleForDisplay(utcDate, 'America/New_York', { showDate: false });
    expect(str).toMatch(/7:30/); // should show 7:30 AM, not 11:30 AM
  });

  test('shows date when showDate is true', () => {
    const str = formatScheduleForDisplay(utcDate, 'America/New_York', { showDate: true, showTime: false });
    expect(str).toMatch(/Aug/);
    expect(str).toMatch(/2/);
  });

  test('can show timezone label', () => {
    const str = formatScheduleForDisplay(utcDate, 'America/New_York', { showTZLabel: true });
    expect(str).toMatch(/ET|EST|EDT/);
  });

  test('accepts ISO string input', () => {
    const str = formatScheduleForDisplay('2026-08-02T11:30:00.000Z', 'America/New_York', { showDate: false });
    expect(str).toMatch(/7:30/);
  });

  test('falls back to UTC for invalid timezone', () => {
    const str = formatScheduleForDisplay(utcDate, 'INVALID', { showDate: false });
    // should still return something (not throw)
    expect(typeof str).toBe('string');
    expect(str.length).toBeGreaterThan(0);
  });

  test('formats correctly in UTC timezone', () => {
    const str = formatScheduleForDisplay(utcDate, 'UTC', { showDate: false, showTime: true, hour12: false });
    expect(str).toMatch(/11:30/);
  });
});
