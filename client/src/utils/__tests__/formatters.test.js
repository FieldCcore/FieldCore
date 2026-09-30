import { describe, it, expect } from 'vitest';
import { formatMinorUnits, formatDateOnly, formatTimestamp, truncateMiddle } from '../formatters';

describe('formatMinorUnits', () => {
  it('formats USD cents as dollar display', () => {
    expect(formatMinorUnits(5000, 'USD')).toBe('USD 50.00');
  });

  it('formats USD zero cents', () => {
    expect(formatMinorUnits(0, 'USD')).toBe('USD 0.00');
  });

  it('formats JPY (zero decimal) correctly', () => {
    expect(formatMinorUnits(1500, 'JPY')).toBe('JPY 1500');
  });

  it('formats KWD (3 decimal) correctly', () => {
    expect(formatMinorUnits(1500, 'KWD')).toBe('KWD 1.500');
  });

  it('formats CLF (4 decimal) correctly', () => {
    expect(formatMinorUnits(10000, 'CLF')).toBe('CLF 1.0000');
  });

  it('returns — for null', () => {
    expect(formatMinorUnits(null, 'USD')).toBe('—');
  });

  it('returns — for undefined', () => {
    expect(formatMinorUnits(undefined, 'USD')).toBe('—');
  });

  it('returns — for empty string', () => {
    expect(formatMinorUnits('', 'USD')).toBe('—');
  });

  it('defaults to 2 decimal places for unknown currency', () => {
    expect(formatMinorUnits(100, 'XYZ')).toBe('XYZ 1.00');
  });

  it('formats without currency code prefix when code is empty', () => {
    const result = formatMinorUnits(500, '');
    expect(result).toBe('5.00');
  });

  it('handles large amounts', () => {
    expect(formatMinorUnits(100000000, 'USD')).toBe('USD 1000000.00');
  });
});

describe('formatDateOnly', () => {
  it('formats a valid ISO date string', () => {
    expect(formatDateOnly('2024-03-15')).toBe('Mar 15, 2024');
  });

  it('returns — for null', () => {
    expect(formatDateOnly(null)).toBe('—');
  });

  it('returns — for undefined', () => {
    expect(formatDateOnly(undefined)).toBe('—');
  });

  it('returns — for empty string', () => {
    expect(formatDateOnly('')).toBe('—');
  });

  it('does not apply timezone shift — date part only', () => {
    // 2024-01-01 must always be Jan 1, regardless of local timezone
    expect(formatDateOnly('2024-01-01')).toBe('Jan 1, 2024');
  });

  it('works with ISO datetime strings (uses date part only)', () => {
    expect(formatDateOnly('2024-06-20T14:30:00Z')).toBe('Jun 20, 2024');
  });

  it('formats December correctly', () => {
    expect(formatDateOnly('2023-12-31')).toBe('Dec 31, 2023');
  });

  it('returns — for invalid month', () => {
    expect(formatDateOnly('2024-13-01')).toBe('—');
  });
});

describe('formatTimestamp', () => {
  it('returns — for null', () => {
    expect(formatTimestamp(null)).toBe('—');
  });

  it('returns — for undefined', () => {
    expect(formatTimestamp(undefined)).toBe('—');
  });

  it('returns — for empty string', () => {
    expect(formatTimestamp('')).toBe('—');
  });

  it('returns a non-empty string for a valid ISO timestamp', () => {
    const result = formatTimestamp('2024-03-15T10:30:00Z');
    expect(result).not.toBe('—');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes year in output', () => {
    const result = formatTimestamp('2024-03-15T10:30:00Z');
    expect(result).toContain('2024');
  });
});

describe('truncateMiddle', () => {
  it('returns the string unchanged when shorter than maxLen', () => {
    expect(truncateMiddle('hello', 10)).toBe('hello');
  });

  it('returns the string unchanged when equal to maxLen', () => {
    expect(truncateMiddle('hello', 5)).toBe('hello');
  });

  it('truncates a long string with ellipsis in the middle', () => {
    const result = truncateMiddle('abcdefghijklmnopqrstuvwxyz', 10);
    expect(result).toContain('…');
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it('preserves start and end characters', () => {
    const str = 'STARTXXXXXXXXXXXXXXXXXXXXXXEND';
    const result = truncateMiddle(str, 12);
    expect(result.startsWith('START')).toBe(true);
    expect(result.endsWith('END')).toBe(true);
  });

  it('returns empty string for empty input', () => {
    expect(truncateMiddle('', 10)).toBe('');
  });

  it('returns empty string for null/undefined', () => {
    expect(truncateMiddle(null, 10)).toBe('');
    expect(truncateMiddle(undefined, 10)).toBe('');
  });

  it('uses default maxLen of 20 when not specified', () => {
    const long = 'a'.repeat(30);
    const result = truncateMiddle(long);
    expect(result.length).toBeLessThanOrEqual(20);
  });
});
