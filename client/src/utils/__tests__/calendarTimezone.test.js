/**
 * Client-side calendar timezone utility tests (Vitest + jsdom).
 * Tests formatTZ, resolveCalendarTimeZone, isValidTimezone,
 * toCalendarLocal, fromCalendarLocal, and getTZOffset.
 */
import { describe, it, expect } from 'vitest';
import {
  isValidTimezone,
  resolveCalendarTimeZone,
  formatTZ,
  getTZOffset,
  toCalendarLocal,
  fromCalendarLocal,
} from '../calendarTimezone';

// ── isValidTimezone ───────────────────────────────────────────────────────────

describe('isValidTimezone', () => {
  it('accepts valid IANA timezones', () => {
    expect(isValidTimezone('America/New_York')).toBe(true);
    expect(isValidTimezone('America/Chicago')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('Europe/London')).toBe(true);
    expect(isValidTimezone('Asia/Tokyo')).toBe(true);
    expect(isValidTimezone('Pacific/Auckland')).toBe(true);
  });

  it('rejects non-IANA strings', () => {
    expect(isValidTimezone('INVALID')).toBe(false);
    expect(isValidTimezone('Eastern')).toBe(false);
    expect(isValidTimezone('Florida')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
    expect(isValidTimezone(null)).toBe(false);
    expect(isValidTimezone(undefined)).toBe(false);
  });
});

// ── resolveCalendarTimeZone ───────────────────────────────────────────────────

describe('resolveCalendarTimeZone', () => {
  it('returns businessTimezone when valid', () => {
    const { timezone, source } = resolveCalendarTimeZone({ businessTimezone: 'America/New_York' });
    expect(timezone).toBe('America/New_York');
    expect(source).toBe('business');
  });

  it('prefers userTimezone over businessTimezone', () => {
    const { timezone, source } = resolveCalendarTimeZone({
      userTimezone: 'America/Denver',
      businessTimezone: 'America/New_York',
    });
    expect(timezone).toBe('America/Denver');
    expect(source).toBe('user');
  });

  it('skips invalid businessTimezone and falls to browser or default', () => {
    const { timezone } = resolveCalendarTimeZone({ businessTimezone: 'INVALID/ZONE' });
    expect(typeof timezone).toBe('string');
    expect(timezone.length).toBeGreaterThan(0);
  });

  it('returns a valid IANA timezone in all cases', () => {
    const result1 = resolveCalendarTimeZone({});
    const result2 = resolveCalendarTimeZone({ businessTimezone: null });
    const result3 = resolveCalendarTimeZone({ businessTimezone: 'America/Chicago' });
    for (const { timezone } of [result1, result2, result3]) {
      expect(isValidTimezone(timezone)).toBe(true);
    }
  });
});

// ── formatTZ ──────────────────────────────────────────────────────────────────

describe('formatTZ', () => {
  const utcDate = new Date('2026-08-02T11:30:00.000Z'); // 07:30 ET summer

  it('formats time in business timezone (not browser TZ)', () => {
    const str = formatTZ(utcDate, 'HH:mm', 'America/New_York');
    expect(str).toBe('07:30');
  });

  it('formats date in timezone correctly', () => {
    const str = formatTZ(utcDate, 'yyyy-MM-dd', 'America/New_York');
    expect(str).toBe('2026-08-02');
  });

  it('accepts ISO string input', () => {
    const str = formatTZ('2026-08-02T11:30:00.000Z', 'HH:mm', 'America/New_York');
    expect(str).toBe('07:30');
  });

  it('returns — for invalid date', () => {
    const str = formatTZ('not-a-date', 'HH:mm', 'America/New_York');
    expect(str).toBe('—');
  });

  it('falls back gracefully for invalid timezone (returns a string)', () => {
    const str = formatTZ(utcDate, 'HH:mm', 'INVALID');
    expect(typeof str).toBe('string');
    // Should not throw
  });

  it('formats in UTC when timezone is UTC', () => {
    const str = formatTZ(utcDate, 'HH:mm', 'UTC');
    expect(str).toBe('11:30');
  });

  it('formats correctly in Tokyo (UTC+9)', () => {
    // 11:30 UTC = 20:30 Tokyo
    const str = formatTZ(utcDate, 'HH:mm', 'Asia/Tokyo');
    expect(str).toBe('20:30');
  });
});

// ── getTZOffset ───────────────────────────────────────────────────────────────

describe('getTZOffset', () => {
  it('returns -240 for NYC in summer (UTC-4)', () => {
    const offset = getTZOffset(new Date('2026-08-02T00:00:00Z'), 'America/New_York');
    expect(offset).toBe(-240);
  });

  it('returns -300 for NYC in winter (UTC-5)', () => {
    const offset = getTZOffset(new Date('2026-01-15T00:00:00Z'), 'America/New_York');
    expect(offset).toBe(-300);
  });

  it('returns 0 for UTC', () => {
    const offset = getTZOffset(new Date('2026-08-02T12:00:00.000Z'), 'UTC');
    expect(offset).toBe(0);
  });

  it('returns 540 for Tokyo (UTC+9)', () => {
    const offset = getTZOffset(new Date('2026-08-02T00:00:00Z'), 'Asia/Tokyo');
    expect(offset).toBe(540);
  });

  it('returns 0 for invalid timezone', () => {
    const offset = getTZOffset(new Date(), 'INVALID');
    expect(offset).toBe(0);
  });
});

// ── toCalendarLocal / fromCalendarLocal round-trip ───────────────────────────

describe('toCalendarLocal and fromCalendarLocal', () => {
  it('toCalendarLocal returns a Date with hours matching the scheduling timezone', () => {
    const utcDate = new Date('2026-08-02T11:30:00.000Z'); // 07:30 ET
    const fakeLocal = toCalendarLocal(utcDate, 'America/New_York');
    expect(fakeLocal instanceof Date).toBe(true);
    expect(fakeLocal.getHours()).toBe(7);
    expect(fakeLocal.getMinutes()).toBe(30);
  });

  it('fromCalendarLocal converts fake-local date back to UTC', () => {
    const utcDate    = new Date('2026-08-02T11:30:00.000Z'); // 07:30 ET
    const fakeLocal  = toCalendarLocal(utcDate, 'America/New_York');
    const backToUtc  = fromCalendarLocal(fakeLocal, 'America/New_York');
    // UTC should be 11:30Z (within ±1 minute rounding)
    expect(Math.abs(backToUtc.getTime() - utcDate.getTime())).toBeLessThan(60000);
  });

  it('toCalendarLocal returns original date for invalid timezone', () => {
    const utcDate = new Date('2026-08-02T11:30:00.000Z');
    const result  = toCalendarLocal(utcDate, 'INVALID');
    expect(result).toEqual(utcDate);
  });

  it('handles Tokyo timezone correctly', () => {
    const utcDate  = new Date('2026-08-01T22:30:00.000Z'); // 07:30 Tokyo next day
    const fakeLoc  = toCalendarLocal(utcDate, 'Asia/Tokyo');
    expect(fakeLoc.getHours()).toBe(7);
    expect(fakeLoc.getMinutes()).toBe(30);
  });
});
