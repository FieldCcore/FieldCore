import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isValidCoord,
  classifyTechGPS,
  extractValidPoints,
  resolveJobCoordinates,
  TECH_LIVE_MS,
  TECH_STALE_MS,
} from '../dispatchCoords';

// ── isValidCoord ─────────────────────────────────────────────────────────────

describe('isValidCoord', () => {
  it('accepts a valid US coordinate', () => {
    expect(isValidCoord(25.7617, -80.1918)).toBe(true);   // Miami
  });

  it('accepts Deerfield Beach FL coordinate (26.1224, -80.1373)', () => {
    expect(isValidCoord(26.1224, -80.1373)).toBe(true);
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

  it('returns offline for timestamp beyond TECH_STALE_MS', () => {
    const now = Date.now();
    const ts  = new Date(now - TECH_STALE_MS - 1000).toISOString();
    expect(classifyTechGPS(ts)).toBe('offline');
  });

  it('returns no_location for null', () => {
    expect(classifyTechGPS(null)).toBe('no_location');
  });

  it('returns no_location for undefined', () => {
    expect(classifyTechGPS(undefined)).toBe('no_location');
  });

  it('returns no_location for empty string', () => {
    expect(classifyTechGPS('')).toBe('no_location');
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

// ── resolveJobCoordinates ────────────────────────────────────────────────────

describe('resolveJobCoordinates', () => {
  it('returns service coords when both service_lat and service_lng are valid', () => {
    const job = { service_lat: 25.7617, service_lng: -80.1918, client_lat: 1.0, client_lng: 1.0 };
    expect(resolveJobCoordinates(job)).toEqual({ lat: 25.7617, lng: -80.1918 });
  });

  it('falls back to client coords when service coords are null', () => {
    const job = { service_lat: null, service_lng: null, client_lat: 51.5074, client_lng: -0.1278 };
    expect(resolveJobCoordinates(job)).toEqual({ lat: 51.5074, lng: -0.1278 });
  });

  it('falls back to client coords when service coords are 0,0 sentinel', () => {
    const job = { service_lat: 0, service_lng: 0, client_lat: 51.5074, client_lng: -0.1278 };
    expect(resolveJobCoordinates(job)).toEqual({ lat: 51.5074, lng: -0.1278 });
  });

  it('returns null when no valid coords exist on the job', () => {
    const job = { service_lat: null, service_lng: null, client_lat: null, client_lng: null };
    expect(resolveJobCoordinates(job)).toBeNull();
  });

  it('returns null when job is null', () => {
    expect(resolveJobCoordinates(null)).toBeNull();
  });

  it('returns null when job is undefined', () => {
    expect(resolveJobCoordinates(undefined)).toBeNull();
  });

  it('accepts numeric strings for service coords', () => {
    const job = { service_lat: '26.1224', service_lng: '-80.1373' };
    const result = resolveJobCoordinates(job);
    expect(result).not.toBeNull();
    expect(result.lat).toBeCloseTo(26.1224);
    expect(result.lng).toBeCloseTo(-80.1373);
  });

  it('does not return service coords when only one coordinate is valid', () => {
    const job = { service_lat: 25.7617, service_lng: null, client_lat: 51.5074, client_lng: -0.1278 };
    // service pair is invalid (lat valid, lng null) — should fall back to client
    expect(resolveJobCoordinates(job)).toEqual({ lat: 51.5074, lng: -0.1278 });
  });
});
