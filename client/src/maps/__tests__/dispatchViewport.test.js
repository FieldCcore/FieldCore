import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveDispatchViewport } from '../dispatchViewport';

// Helpers to build test fixtures ─────────────────────────────────────────────

function makeTech(lat, lng, ageMs = 0) {
  return { lat, lng, updated_at: new Date(Date.now() - ageMs).toISOString(), is_available: true };
}

const LIVE_MS  = 60 * 1000;        // 1 min → live
const STALE_MS = 5  * 60 * 1000;   // 5 min → stale
const OLD_MS   = 20 * 60 * 1000;   // 20 min → unavailable

function makeJob(lat, lng, status = 'scheduled') {
  return { service_lat: lat, service_lng: lng, status };
}

// ── Empty / fallback ─────────────────────────────────────────────────────────

describe('resolveDispatchViewport — fallback', () => {
  it('returns fallback when called with no arguments', () => {
    const v = resolveDispatchViewport();
    expect(v.mode).toBe('center_zoom');
    expect(v.source).toBe('fallback');
    expect(v.center.lat).toBeCloseTo(39.5);   // continental US
    expect(v.center.lng).toBeCloseTo(-98.35);
    expect(v.zoom).toBe(4);
  });

  it('returns fallback when all data is empty and no account location', () => {
    const v = resolveDispatchViewport({ technicians: [], jobs: [], dispatchSettings: null });
    expect(v.source).toBe('fallback');
  });
});

// ── Business address ─────────────────────────────────────────────────────────

describe('resolveDispatchViewport — business address', () => {
  it('uses business address when no live data exists', () => {
    const v = resolveDispatchViewport({
      technicians:     [],
      jobs:            [],
      accountLocation: { lat: 25.7617, lng: -80.1918 },
    });
    expect(v.mode).toBe('center_zoom');
    expect(v.source).toBe('business_address');
    expect(v.center.lat).toBeCloseTo(25.7617);
    expect(v.center.lng).toBeCloseTo(-80.1918);
    expect(v.zoom).toBe(11);
  });

  it('uses dispatch_default_zoom from settings when available', () => {
    const v = resolveDispatchViewport({
      technicians:      [],
      jobs:             [],
      accountLocation:  { lat: 25.7617, lng: -80.1918 },
      dispatchSettings: { dispatch_default_zoom: 13 },
    });
    expect(v.zoom).toBe(13);
  });

  it('ignores invalid account location', () => {
    const v = resolveDispatchViewport({
      technicians:     [],
      jobs:            [],
      accountLocation: { lat: 0, lng: 0 },
    });
    expect(v.source).toBe('fallback');
  });
});

// ── Live techs + jobs ─────────────────────────────────────────────────────────

describe('resolveDispatchViewport — live techs + jobs (Priority A)', () => {
  it('fits bounds to live techs and scheduled jobs', () => {
    const v = resolveDispatchViewport({
      technicians: [makeTech(25.7617, -80.1918, LIVE_MS)],
      jobs:        [makeJob(25.8, -80.2, 'scheduled')],
    });
    expect(v.mode).toBe('fit_bounds');
    expect(v.source).toBe('techs_and_jobs');
    expect(v.bounds).toHaveLength(2);
    expect(v.pointCount).toBe(2);
  });

  it('includes in_progress jobs', () => {
    const v = resolveDispatchViewport({
      technicians: [makeTech(25.7617, -80.1918, LIVE_MS)],
      jobs:        [makeJob(25.8, -80.2, 'in_progress')],
    });
    expect(v.source).toBe('techs_and_jobs');
    expect(v.pointCount).toBe(2);
  });

  it('excludes completed jobs by default', () => {
    const v = resolveDispatchViewport({
      technicians: [makeTech(25.7617, -80.1918, LIVE_MS)],
      jobs:        [makeJob(25.8, -80.2, 'complete')],
    });
    // Only the tech point, no job point
    expect(v.source).toBe('techs');  // live tech but no job → falls to C
    expect(v.pointCount).toBe(1);
  });

  it('includes completed jobs when dispatch_include_completed is true', () => {
    const v = resolveDispatchViewport({
      technicians:      [makeTech(25.7617, -80.1918, LIVE_MS)],
      jobs:             [makeJob(25.8, -80.2, 'complete')],
      dispatchSettings: { dispatch_include_completed: true },
    });
    expect(v.source).toBe('techs_and_jobs');
    expect(v.pointCount).toBe(2);
  });

  it('excludes cancelled jobs by default', () => {
    const v = resolveDispatchViewport({
      technicians: [],
      jobs:        [makeJob(25.8, -80.2, 'cancelled')],
      accountLocation: { lat: 25.7617, lng: -80.1918 },
    });
    expect(v.source).toBe('business_address');
  });

  it('includes cancelled jobs when dispatch_include_cancelled is true', () => {
    const v = resolveDispatchViewport({
      technicians:      [],
      jobs:             [makeJob(25.8, -80.2, 'cancelled')],
      dispatchSettings: { dispatch_include_cancelled: true },
    });
    expect(v.source).toBe('jobs');
    expect(v.pointCount).toBe(1);
  });

  it('skips jobs with invalid coordinates', () => {
    const v = resolveDispatchViewport({
      technicians: [makeTech(25.7617, -80.1918, LIVE_MS)],
      jobs:        [{ service_lat: 0, service_lng: 0, status: 'scheduled' }],
    });
    // No valid job point → only the tech
    expect(v.source).toBe('techs');
    expect(v.pointCount).toBe(1);
  });
});

// ── Jobs only (Priority B) ────────────────────────────────────────────────────

describe('resolveDispatchViewport — jobs only (Priority B)', () => {
  it('fits bounds to jobs when no live techs', () => {
    const v = resolveDispatchViewport({
      technicians: [],
      jobs:        [makeJob(25.7617, -80.1918), makeJob(25.8, -80.2)],
    });
    expect(v.mode).toBe('fit_bounds');
    expect(v.source).toBe('jobs');
    expect(v.pointCount).toBe(2);
  });

  it('uses a single job point', () => {
    const v = resolveDispatchViewport({
      technicians: [],
      jobs:        [makeJob(25.7617, -80.1918)],
    });
    expect(v.source).toBe('jobs');
    expect(v.pointCount).toBe(1);
  });
});

// ── Live techs only (Priority C) ─────────────────────────────────────────────

describe('resolveDispatchViewport — live techs only (Priority C)', () => {
  it('fits bounds to live techs when no relevant jobs', () => {
    const v = resolveDispatchViewport({
      technicians: [makeTech(25.7617, -80.1918, LIVE_MS)],
      jobs:        [],
    });
    expect(v.mode).toBe('fit_bounds');
    expect(v.source).toBe('techs');
    expect(v.pointCount).toBe(1);
  });
});

// ── Stale techs (Priority D) ──────────────────────────────────────────────────

describe('resolveDispatchViewport — stale techs (Priority D)', () => {
  it('falls back to stale techs when no live techs or jobs', () => {
    const v = resolveDispatchViewport({
      technicians: [makeTech(25.7617, -80.1918, STALE_MS)],
      jobs:        [],
    });
    expect(v.mode).toBe('fit_bounds');
    expect(v.source).toBe('stale_techs');
    expect(v.pointCount).toBe(1);
  });

  it('prefers live techs over stale techs', () => {
    const v = resolveDispatchViewport({
      technicians: [
        makeTech(25.7617, -80.1918, LIVE_MS),
        makeTech(26.0,    -80.3,    STALE_MS),
      ],
      jobs: [],
    });
    expect(v.source).toBe('techs');
    expect(v.pointCount).toBe(1); // only the live tech
  });

  it('ignores unavailable techs (> 15 min)', () => {
    const v = resolveDispatchViewport({
      technicians: [makeTech(25.7617, -80.1918, OLD_MS)],
      jobs:        [],
      accountLocation: { lat: 40.7128, lng: -74.006 },
    });
    expect(v.source).toBe('business_address');
  });
});

// ── Radius service area (Priority E) ──────────────────────────────────────────

describe('resolveDispatchViewport — radius service area (Priority E)', () => {
  it('returns fit_bounds for a radius configuration', () => {
    const v = resolveDispatchViewport({
      technicians:      [],
      jobs:             [],
      dispatchSettings: {
        dispatch_service_area_type:    'radius',
        dispatch_center_lat:           25.7617,
        dispatch_center_lng:           -80.1918,
        dispatch_service_radius_miles: 25,
      },
    });
    expect(v.mode).toBe('fit_bounds');
    expect(v.source).toBe('service_area_radius');
    expect(v.bounds).toHaveLength(2); // SW + NE corners
  });

  it('ignores radius config when live techs exist', () => {
    const v = resolveDispatchViewport({
      technicians:      [makeTech(25.7617, -80.1918, LIVE_MS)],
      jobs:             [],
      dispatchSettings: {
        dispatch_service_area_type:    'radius',
        dispatch_center_lat:           25.7617,
        dispatch_center_lng:           -80.1918,
        dispatch_service_radius_miles: 25,
      },
    });
    expect(v.source).toBe('techs');
  });
});

// ── Custom center (Priority F) ─────────────────────────────────────────────────

describe('resolveDispatchViewport — custom center (Priority F)', () => {
  it('returns center_zoom for a custom center configuration', () => {
    const v = resolveDispatchViewport({
      technicians:      [],
      jobs:             [],
      dispatchSettings: {
        dispatch_service_area_type: 'custom_center',
        dispatch_center_lat:        40.7128,
        dispatch_center_lng:        -74.006,
        dispatch_default_zoom:      12,
      },
    });
    expect(v.mode).toBe('center_zoom');
    expect(v.source).toBe('custom_center');
    expect(v.center.lat).toBeCloseTo(40.7128);
    expect(v.zoom).toBe(12);
  });

  it('uses default zoom 11 when not specified', () => {
    const v = resolveDispatchViewport({
      technicians:      [],
      jobs:             [],
      dispatchSettings: {
        dispatch_service_area_type: 'custom_center',
        dispatch_center_lat:        40.7128,
        dispatch_center_lng:        -74.006,
      },
    });
    expect(v.zoom).toBe(11);
  });
});

// ── User location (Priority H) ─────────────────────────────────────────────────

describe('resolveDispatchViewport — user location (Priority H)', () => {
  it('ignores user location unless userRequestedLocation is true', () => {
    const v = resolveDispatchViewport({
      technicians:           [],
      jobs:                  [],
      userLocation:          { lat: 25.7617, lng: -80.1918 },
      userRequestedLocation: false,
    });
    expect(v.source).toBe('fallback');
  });

  it('uses user location when explicitly requested and no tenant data', () => {
    const v = resolveDispatchViewport({
      technicians:           [],
      jobs:                  [],
      userLocation:          { lat: 25.7617, lng: -80.1918 },
      userRequestedLocation: true,
    });
    expect(v.mode).toBe('center_zoom');
    expect(v.source).toBe('user_location');
    expect(v.center.lat).toBeCloseTo(25.7617);
    expect(v.zoom).toBe(14);
  });

  it('still prefers business address over user location even when requested', () => {
    const v = resolveDispatchViewport({
      technicians:           [],
      jobs:                  [],
      accountLocation:       { lat: 40.7128, lng: -74.006 },
      userLocation:          { lat: 25.7617, lng: -80.1918 },
      userRequestedLocation: true,
    });
    // business address wins over user location in priority chain
    expect(v.source).toBe('business_address');
  });
});

// ── Coordinate edge cases ──────────────────────────────────────────────────────

describe('resolveDispatchViewport — coordinate validation', () => {
  it('skips techs with null coordinates', () => {
    const v = resolveDispatchViewport({
      technicians: [{ lat: null, lng: null, updated_at: new Date().toISOString() }],
      jobs:        [],
    });
    expect(v.source).toBe('fallback');
  });

  it('skips techs with 0,0 coordinates', () => {
    const v = resolveDispatchViewport({
      technicians: [makeTech(0, 0, LIVE_MS)],
      jobs:        [],
    });
    expect(v.source).toBe('fallback');
  });

  it('skips jobs with NaN coordinates', () => {
    const v = resolveDispatchViewport({
      technicians: [],
      jobs:        [{ service_lat: NaN, service_lng: NaN, status: 'scheduled' }],
    });
    expect(v.source).toBe('fallback');
  });

  it('skips jobs with string garbage coordinates', () => {
    const v = resolveDispatchViewport({
      technicians: [],
      jobs:        [{ service_lat: 'abc', service_lng: 'def', status: 'scheduled' }],
    });
    expect(v.source).toBe('fallback');
  });

  it('accepts numeric string coordinates', () => {
    const v = resolveDispatchViewport({
      technicians: [],
      jobs:        [{ service_lat: '25.7617', service_lng: '-80.1918', status: 'scheduled' }],
    });
    expect(v.source).toBe('jobs');
    expect(v.pointCount).toBe(1);
  });
});

// ── Multi-status jobs ──────────────────────────────────────────────────────────

describe('resolveDispatchViewport — job status filtering', () => {
  const statuses = ['scheduled', 'in_progress', 'en_route', 'partially_completed', 'paused'];
  statuses.forEach(status => {
    it(`includes ${status} jobs by default`, () => {
      const v = resolveDispatchViewport({
        technicians: [],
        jobs:        [makeJob(25.7617, -80.1918, status)],
      });
      expect(v.source).toBe('jobs');
    });
  });

  ['complete', 'cancelled', 'no_show'].forEach(status => {
    it(`excludes ${status} jobs by default`, () => {
      const v = resolveDispatchViewport({
        technicians: [],
        jobs:        [makeJob(25.7617, -80.1918, status)],
      });
      expect(v.source).toBe('fallback');
    });
  });
});
