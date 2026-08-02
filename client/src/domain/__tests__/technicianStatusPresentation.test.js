import { describe, it, expect } from 'vitest';
import {
  getTechStatus,
  getTechStatusPresentation,
  TECH_LEGEND_ITEMS,
  TECH_STALE_LEGEND_ITEM,
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
  it('Tech Live GPS badge color differs from all job legend colors', () => {
    const { color } = getTechStatusPresentation('live');
    JOB_COLORS_IN_LEGEND.forEach(jobColor => {
      expect(color).not.toBe(jobColor);
    });
  });

  it('Tech Live GPS markerColor differs from all job legend colors', () => {
    const { markerColor } = getTechStatusPresentation('live');
    JOB_COLORS_IN_LEGEND.forEach(jobColor => {
      expect(markerColor).not.toBe(jobColor);
    });
  });

  it('Tech Location Stale badge color differs from all job legend colors', () => {
    const { color } = getTechStatusPresentation('stale');
    JOB_COLORS_IN_LEGEND.forEach(jobColor => {
      expect(color).not.toBe(jobColor);
    });
  });

  it('Tech Location Stale markerColor differs from all job legend colors', () => {
    const { markerColor } = getTechStatusPresentation('stale');
    JOB_COLORS_IN_LEGEND.forEach(jobColor => {
      expect(markerColor).not.toBe(jobColor);
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

describe('Compact legend color uniqueness', () => {
  it('live tech legend color and job colors are all unique', () => {
    const techColors = TECH_LEGEND_ITEMS.map(item => item.color);
    const jobColors  = [
      getJobMarkerColor('scheduled'),
      getJobMarkerColor('in_progress'),
      getJobMarkerColor('complete'),
      getJobMarkerColor('cancelled'),
    ];
    const allColors = [...techColors, ...jobColors];
    expect(new Set(allColors).size).toBe(allColors.length);
  });

  it('TECH_LEGEND_ITEMS only contains the live entry (stale is conditional)', () => {
    expect(TECH_LEGEND_ITEMS).toHaveLength(1);
    expect(TECH_LEGEND_ITEMS[0].key).toBe('live');
  });

  it('TECH_STALE_LEGEND_ITEM is exported separately', () => {
    expect(TECH_STALE_LEGEND_ITEM.key).toBe('stale');
    expect(TECH_STALE_LEGEND_ITEM.label).toBe('Tech — Location Stale');
  });
});

// ── getTechStatusPresentation ─────────────────────────────────────────────────

describe('getTechStatusPresentation', () => {
  it('returns object with key, label, color, bg, markerColor, priority', () => {
    const p = getTechStatusPresentation('live');
    expect(p).toHaveProperty('key');
    expect(p).toHaveProperty('label');
    expect(p).toHaveProperty('color');
    expect(p).toHaveProperty('bg');
    expect(p).toHaveProperty('markerColor');
    expect(p).toHaveProperty('priority');
  });

  it('live GPS markerColor is blue/cyan #0EA5E9 (never green)', () => {
    const { markerColor } = getTechStatusPresentation('live');
    expect(markerColor).toBe('#0EA5E9');
    expect(markerColor).not.toBe('#2E7D32');
    expect(markerColor).not.toBe(CAL_STATUS_COLOR.complete);
  });

  it('live GPS label is Live GPS', () => {
    expect(getTechStatusPresentation('live').label).toBe('Live GPS');
  });

  it('stale label is Location Stale (not GPS Stale)', () => {
    expect(getTechStatusPresentation('stale').label).toBe('Location Stale');
  });

  it('stale markerColor is the same blue as live (warning ring is added by renderer)', () => {
    expect(getTechStatusPresentation('stale').markerColor).toBe('#0EA5E9');
  });

  it('busy (On Job) color is blue', () => {
    expect(getTechStatusPresentation('busy').color).toBe('#1565C0');
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

  it('contains live entry', () => {
    expect(TECH_LEGEND_ITEMS.map(i => i.key)).toContain('live');
  });

  it('does not contain stale (stale is exported as TECH_STALE_LEGEND_ITEM)', () => {
    expect(TECH_LEGEND_ITEMS.map(i => i.key)).not.toContain('stale');
  });

  it('live legend color is the marker blue #0EA5E9', () => {
    const live = TECH_LEGEND_ITEMS.find(i => i.key === 'live');
    expect(live.color).toBe('#0EA5E9');
  });

  it('live legend color matches live markerColor from getTechStatusPresentation', () => {
    const live = TECH_LEGEND_ITEMS.find(i => i.key === 'live');
    expect(live.color).toBe(getTechStatusPresentation('live').markerColor);
  });
});

// ── getTechStatus ─────────────────────────────────────────────────────────────

const NOW      = Date.now();
const LIVE_TS  = new Date(NOW - 2 * 60_000).toISOString();   // 2 min ago  → live (≤ 5 min)
const STALE_TS = new Date(NOW - 10 * 60_000).toISOString();  // 10 min ago → stale (5–30 min)
const OLD_TS   = new Date(NOW - 35 * 60_000).toISOString();  // 35 min ago → offline (> 30 min)

const TECH           = { id: 't1', is_available: true  };
const TECH_UNAVAILABLE = { id: 't1', is_available: false };
const LIVE_LOC       = { user_id: 't1', lat: 30, lng: -97, updated_at: LIVE_TS  };
const STALE_LOC      = { user_id: 't1', lat: 30, lng: -97, updated_at: STALE_TS };
const OLD_LOC        = { user_id: 't1', lat: 30, lng: -97, updated_at: OLD_TS   };
const ACTIVE_JOB     = { id: 'j1', tech_id: 't1', status: 'in_progress' };

describe('getTechStatus', () => {
  it('returns off when is_available=false', () => {
    expect(getTechStatus(TECH_UNAVAILABLE, [LIVE_LOC], []).key).toBe('off');
  });

  it('returns busy (On Job) when has active job with live GPS', () => {
    expect(getTechStatus(TECH, [LIVE_LOC], [ACTIVE_JOB]).key).toBe('busy');
  });

  it('returns live when has fresh GPS and no active job', () => {
    expect(getTechStatus(TECH, [LIVE_LOC], []).key).toBe('live');
  });

  it('returns stale when GPS is between 5 and 30 minutes old', () => {
    expect(getTechStatus(TECH, [STALE_LOC], []).key).toBe('stale');
  });

  it('returns offline when GPS is older than 30 minutes', () => {
    expect(getTechStatus(TECH, [OLD_LOC], []).key).toBe('offline');
  });

  it('returns available when no GPS location at all', () => {
    expect(getTechStatus(TECH, [], []).key).toBe('available');
  });

  it('returns presentation object with markerColor', () => {
    const result = getTechStatus(TECH, [LIVE_LOC], []);
    expect(result).toHaveProperty('markerColor');
    expect(result.markerColor).toBe('#0EA5E9');
  });

  it('enriches result with locationFreshness', () => {
    expect(getTechStatus(TECH, [LIVE_LOC],  []).locationFreshness).toBe('live');
    expect(getTechStatus(TECH, [STALE_LOC], []).locationFreshness).toBe('stale');
    expect(getTechStatus(TECH, [OLD_LOC],   []).locationFreshness).toBe('offline');
    expect(getTechStatus(TECH, [],          []).locationFreshness).toBe('no_location');
  });

  it('enriches result with isStale', () => {
    expect(getTechStatus(TECH, [LIVE_LOC],  []).isStale).toBe(false);
    expect(getTechStatus(TECH, [STALE_LOC], []).isStale).toBe(true);
    expect(getTechStatus(TECH, [OLD_LOC],   []).isStale).toBe(false);
  });

  it('on-job tech with stale GPS has key=busy and isStale=true', () => {
    const result = getTechStatus(TECH, [STALE_LOC], [ACTIVE_JOB]);
    expect(result.key).toBe('busy');
    expect(result.isStale).toBe(true);
  });
});

// ── GPS threshold exports ─────────────────────────────────────────────────────

describe('GPS_LIVE_MS and GPS_STALE_MS', () => {
  it('GPS_LIVE_MS is 5 minutes', () => {
    expect(GPS_LIVE_MS).toBe(5 * 60 * 1000);
  });

  it('GPS_STALE_MS is 30 minutes', () => {
    expect(GPS_STALE_MS).toBe(30 * 60 * 1000);
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
