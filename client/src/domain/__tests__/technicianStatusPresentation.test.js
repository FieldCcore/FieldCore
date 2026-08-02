import { describe, it, expect } from 'vitest';
import {
  getTechStatus,
  getTechStatusPresentation,
  TECH_LEGEND_ITEMS,
  GPS_LIVE_MS,
  GPS_STALE_MS,
  ACTIVE_STATUSES,
} from '../technicianStatusPresentation';
import {
  CAL_STATUS_COLOR,
  getJobMarkerColor,
} from '../jobStatusPresentation';

// ── Color conflict guard ───────────────────────────────────────────────────────
// Tech colors MUST be distinct from all four Calendar job status colors.
// This assertion is structural — failing it means the legend has duplicate colors.

const JOB_COLORS_IN_LEGEND = [
  CAL_STATUS_COLOR.scheduled,   // gray    #8A90A2
  CAL_STATUS_COLOR.in_progress, // gold    #D4A000
  CAL_STATUS_COLOR.complete,    // green   #2E7D32
  CAL_STATUS_COLOR.cancelled,   // red     #C62828
];

describe('Tech color uniqueness — must not duplicate Calendar job colors', () => {
  it('Tech Live GPS color differs from all job legend colors', () => {
    const { color } = getTechStatusPresentation('live');
    JOB_COLORS_IN_LEGEND.forEach(jobColor => {
      expect(color).not.toBe(jobColor);
    });
  });

  it('Tech GPS Stale color differs from all job legend colors', () => {
    const { color } = getTechStatusPresentation('stale');
    JOB_COLORS_IN_LEGEND.forEach(jobColor => {
      expect(color).not.toBe(jobColor);
    });
  });

  it('Tech On Job color differs from all job legend colors', () => {
    const { color } = getTechStatusPresentation('busy');
    JOB_COLORS_IN_LEGEND.forEach(jobColor => {
      expect(color).not.toBe(jobColor);
    });
  });

  it('Tech Available color differs from all job legend colors', () => {
    const { color } = getTechStatusPresentation('available');
    JOB_COLORS_IN_LEGEND.forEach(jobColor => {
      expect(color).not.toBe(jobColor);
    });
  });

  it('Tech Offline color differs from job Scheduled gray', () => {
    const { color } = getTechStatusPresentation('offline');
    expect(color).not.toBe(CAL_STATUS_COLOR.scheduled);
  });
});

// ── Compact legend uniqueness ─────────────────────────────────────────────────
// No two compact legend entries may share the same resolved hex color.

describe('Compact legend color uniqueness', () => {
  it('all 6 compact legend colors are unique', () => {
    const techColors = TECH_LEGEND_ITEMS.map(item => item.color);
    const jobColors = [
      getJobMarkerColor('scheduled'),
      getJobMarkerColor('in_progress'),
      getJobMarkerColor('complete'),
      getJobMarkerColor('cancelled'),
    ];
    const allColors = [...techColors, ...jobColors];
    expect(new Set(allColors).size).toBe(allColors.length);
  });

  it('TECH_LEGEND_ITEMS entries are mutually unique colors', () => {
    const colors = TECH_LEGEND_ITEMS.map(item => item.color);
    expect(new Set(colors).size).toBe(colors.length);
  });
});

// ── getTechStatusPresentation ─────────────────────────────────────────────────

describe('getTechStatusPresentation', () => {
  it('returns object with key, label, color, bg, markerRing, priority', () => {
    const p = getTechStatusPresentation('live');
    expect(p).toHaveProperty('key');
    expect(p).toHaveProperty('label');
    expect(p).toHaveProperty('color');
    expect(p).toHaveProperty('bg');
    expect(p).toHaveProperty('markerRing');
    expect(p).toHaveProperty('priority');
  });

  it('live has teal color (not green)', () => {
    const { color } = getTechStatusPresentation('live');
    expect(color).toBe('#00796B');
    expect(color).not.toBe('#2E7D32');
  });

  it('stale has amber/orange color', () => {
    expect(getTechStatusPresentation('stale').color).toBe('#E65100');
  });

  it('busy (On Job) has blue color', () => {
    expect(getTechStatusPresentation('busy').color).toBe('#1565C0');
  });

  it('available has cyan color', () => {
    expect(getTechStatusPresentation('available').color).toBe('#00ACC1');
  });

  it('offline has dark blue-gray color (not job scheduled gray)', () => {
    const { color } = getTechStatusPresentation('offline');
    expect(color).toBe('#455A64');
    expect(color).not.toBe('#8A90A2');
  });

  it('unknown key returns offline fallback without throwing', () => {
    expect(() => getTechStatusPresentation('totally_unknown')).not.toThrow();
    const p = getTechStatusPresentation('totally_unknown');
    expect(p).toHaveProperty('color');
  });
});

// ── TECH_LEGEND_ITEMS ─────────────────────────────────────────────────────────

describe('TECH_LEGEND_ITEMS', () => {
  it('is an array', () => {
    expect(Array.isArray(TECH_LEGEND_ITEMS)).toBe(true);
  });

  it('contains live and stale entries', () => {
    const keys = TECH_LEGEND_ITEMS.map(i => i.key);
    expect(keys).toContain('live');
    expect(keys).toContain('stale');
  });

  it('colors are derived from TECH_PRESENTATIONS (not hardcoded separately)', () => {
    const live  = TECH_LEGEND_ITEMS.find(i => i.key === 'live');
    const stale = TECH_LEGEND_ITEMS.find(i => i.key === 'stale');
    expect(live.color).toBe(getTechStatusPresentation('live').color);
    expect(stale.color).toBe(getTechStatusPresentation('stale').color);
  });

  it('live legend color is teal', () => {
    expect(TECH_LEGEND_ITEMS.find(i => i.key === 'live').color).toBe('#00796B');
  });

  it('stale legend color is orange/amber', () => {
    expect(TECH_LEGEND_ITEMS.find(i => i.key === 'stale').color).toBe('#E65100');
  });
});

// ── getTechStatus ─────────────────────────────────────────────────────────────

const NOW = Date.now();
const LIVE_TS  = new Date(NOW - 30_000).toISOString();   // 30s ago
const STALE_TS = new Date(NOW - 5 * 60_000).toISOString(); // 5 min ago
const OLD_TS   = new Date(NOW - 20 * 60_000).toISOString(); // 20 min ago

const TECH = { id: 't1', is_available: true };
const TECH_UNAVAILABLE = { id: 't1', is_available: false };
const LIVE_LOC  = { user_id: 't1', lat: 30, lng: -97, updated_at: LIVE_TS  };
const STALE_LOC = { user_id: 't1', lat: 30, lng: -97, updated_at: STALE_TS };
const OLD_LOC   = { user_id: 't1', lat: 30, lng: -97, updated_at: OLD_TS   };
const ACTIVE_JOB = { id: 'j1', tech_id: 't1', status: 'in_progress' };

describe('getTechStatus', () => {
  it('returns off when is_available=false', () => {
    const result = getTechStatus(TECH_UNAVAILABLE, [LIVE_LOC], []);
    expect(result.key).toBe('off');
  });

  it('returns busy (On Job) when has active job with live GPS', () => {
    const result = getTechStatus(TECH, [LIVE_LOC], [ACTIVE_JOB]);
    expect(result.key).toBe('busy');
  });

  it('returns live when has fresh GPS and no active job', () => {
    const result = getTechStatus(TECH, [LIVE_LOC], []);
    expect(result.key).toBe('live');
  });

  it('returns stale when GPS is between 2 and 15 minutes old', () => {
    const result = getTechStatus(TECH, [STALE_LOC], []);
    expect(result.key).toBe('stale');
  });

  it('returns offline when GPS is older than 15 minutes', () => {
    const result = getTechStatus(TECH, [OLD_LOC], []);
    expect(result.key).toBe('offline');
  });

  it('returns available when no GPS location at all', () => {
    const result = getTechStatus(TECH, [], []);
    expect(result.key).toBe('available');
  });

  it('returns presentation object with color', () => {
    const result = getTechStatus(TECH, [LIVE_LOC], []);
    expect(result).toHaveProperty('color');
    expect(result.color).toBe('#00796B');
  });
});

// ── GPS threshold exports ─────────────────────────────────────────────────────

describe('GPS_LIVE_MS and GPS_STALE_MS', () => {
  it('GPS_LIVE_MS is 2 minutes', () => {
    expect(GPS_LIVE_MS).toBe(2 * 60 * 1000);
  });

  it('GPS_STALE_MS is 15 minutes', () => {
    expect(GPS_STALE_MS).toBe(15 * 60 * 1000);
  });
});

// ── ACTIVE_STATUSES ───────────────────────────────────────────────────────────

describe('ACTIVE_STATUSES', () => {
  it('contains in_progress', () => {
    expect(ACTIVE_STATUSES.has('in_progress')).toBe(true);
  });

  it('contains paused', () => {
    expect(ACTIVE_STATUSES.has('paused')).toBe(true);
  });

  it('does not contain scheduled', () => {
    expect(ACTIVE_STATUSES.has('scheduled')).toBe(false);
  });

  it('does not contain complete', () => {
    expect(ACTIVE_STATUSES.has('complete')).toBe(false);
  });
});
