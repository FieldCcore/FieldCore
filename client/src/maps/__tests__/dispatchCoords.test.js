import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isValidCoord,
  classifyTechGPS,
  extractValidPoints,
  TECH_LIVE_MS,
  TECH_STALE_MS,
} from '../dispatchCoords';

// ── isValidCoord ─────────────────────────────────────────────────────────────

describe('isValidCoord', () => {
  it('accepts a valid US coordinate', () => {
    expect(isValidCoord(25.7617, -80.1918)).toBe(true);   // Miami
  });

  it('accepts a valid southern-hemisphere coordinate', () => {
    expect(isValidCoord(-33.8688, 151.2093)).toBe(true);  // Sydney
  });

  it('accepts a valid European coordinate', () => {
    expect(isValidCoord(51.5074, -0.1278)).toBe(true);    // London
  });

  it('accepts numeric strings', () => {
    expect(isValidCoord('25.7617', '-80.1918')).toBe(true);
  });

  it('accepts boundary values lat=90, lng=180', () => {
    expect(isValidCoord(90, 180)).toBe(true);
  });

  it('accepts boundary values lat=-90, lng=-180', () => {
    expect(isValidCoord(-90, -180)).toBe(true);
  });

  it('rejects 0, 0 (missing-data sentinel)', () => {
    expect(isValidCoord(0, 0)).toBe(false);
  });

  it('rejects null', () => {
    expect(isValidCoord(null, null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidCoord(undefined, undefined)).toBe(false);
  });

  it('rejects NaN', () => {
    expect(isValidCoord(NaN, NaN)).toBe(false);
  });

  it('rejects Infinity', () => {
    expect(isValidCoord(Infinity, 0)).toBe(false);
  });

  it('rejects -Infinity', () => {
    expect(isValidCoord(-Infinity, 0)).toBe(false);
  });

  it('rejects lat > 90', () => {
    expect(isValidCoord(91, 0)).toBe(false);
  });

  it('rejects lat < -90', () => {
    expect(isValidCoord(-91, 0)).toBe(false);
  });

  it('rejects lng > 180', () => {
    expect(isValidCoord(0, 181)).toBe(false);
  });

  it('rejects lng < -180', () => {
    expect(isValidCoord(0, -181)).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidCoord('', '')).toBe(false);
  });

  it('rejects non-numeric string', () => {
    expect(isValidCoord('abc', 'def')).toBe(false);
  });

  it('rejects lat=0, lng=valid (partial zero)', () => {
    // 0,0 specific guard — a non-zero lat with zero lng IS valid (e.g. 51.5, 0 = London area)
    expect(isValidCoord(0, 0)).toBe(false);
    expect(isValidCoord(51.5, 0)).toBe(true);  // Greenwich meridian
  });
});

// ── classifyTechGPS ──────────────────────────────────────────────────────────

describe('classifyTechGPS', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns live for timestamp less than TECH_LIVE_MS ago', () => {
    const now = Date.now();
    const ts  = new Date(now - TECH_LIVE_MS + 1000).toISOString();
    expect(classifyTechGPS(ts)).toBe('live');
  });

  it('returns stale for timestamp exactly at TECH_LIVE_MS boundary (just over)', () => {
    const now = Date.now();
    const ts  = new Date(now - TECH_LIVE_MS - 1).toISOString();
    expect(classifyTechGPS(ts)).toBe('stale');
  });

  it('returns stale for timestamp between TECH_LIVE_MS and TECH_STALE_MS', () => {
    const now = Date.now();
    const ts  = new Date(now - (TECH_LIVE_MS + TECH_STALE_MS) / 2).toISOString();
    expect(classifyTechGPS(ts)).toBe('stale');
  });

  it('returns unavailable for timestamp beyond TECH_STALE_MS', () => {
    const now = Date.now();
    const ts  = new Date(now - TECH_STALE_MS - 1000).toISOString();
    expect(classifyTechGPS(ts)).toBe('unavailable');
  });

  it('returns unavailable for null', () => {
    expect(classifyTechGPS(null)).toBe('unavailable');
  });

  it('returns unavailable for undefined', () => {
    expect(classifyTechGPS(undefined)).toBe('unavailable');
  });

  it('returns unavailable for empty string', () => {
    expect(classifyTechGPS('')).toBe('unavailable');
  });

  it('accepts a Date object', () => {
    const recent = new Date(Date.now() - 30000);
    expect(classifyTechGPS(recent)).toBe('live');
  });
});

// ── extractValidPoints ───────────────────────────────────────────────────────

describe('extractValidPoints', () => {
  it('extracts points with default key names', () => {
    const items = [
      { lat: 25.7617, lng: -80.1918 },
      { lat: 0,       lng: 0 },          // invalid (0,0)
      { lat: 51.5074, lng: -0.1278 },
    ];
    const pts = extractValidPoints(items);
    expect(pts).toHaveLength(2);
    expect(pts[0]).toEqual({ lat: 25.7617, lng: -80.1918 });
    expect(pts[1]).toEqual({ lat: 51.5074, lng: -0.1278 });
  });

  it('extracts points with custom key names', () => {
    const items = [{ service_lat: '25.7617', service_lng: '-80.1918' }];
    const pts   = extractValidPoints(items, 'service_lat', 'service_lng');
    expect(pts).toHaveLength(1);
    expect(pts[0].lat).toBeCloseTo(25.7617);
  });

  it('returns empty array for empty input', () => {
    expect(extractValidPoints([])).toEqual([]);
  });

  it('returns empty array when all items are invalid', () => {
    const items = [{ lat: 0, lng: 0 }, { lat: null, lng: null }];
    expect(extractValidPoints(items)).toHaveLength(0);
  });

  it('handles null items gracefully', () => {
    const items = [null, { lat: 25.7617, lng: -80.1918 }, undefined];
    const pts   = extractValidPoints(items);
    expect(pts).toHaveLength(1);
  });
});
