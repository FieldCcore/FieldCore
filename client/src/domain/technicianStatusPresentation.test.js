import { describe, it, expect } from 'vitest';
import {
  getTechStatus,
  GPS_LIVE_MS,
  GPS_STALE_MS,
  TECH_PRESENTATIONS,
  STALE_WARNING_COLOR,
  ACTIVE_STATUSES,
} from './technicianStatusPresentation';
import { getJobStatusPresentation } from './jobStatusPresentation';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeLoc(ageMs, userId = 'tech1') {
  return {
    user_id:    userId,
    updated_at: new Date(Date.now() - ageMs).toISOString(),
    lat:        37.7749,
    lng:        -122.4194,
  };
}

const TECH       = { id: 'tech1', is_available: true  };
const TECH_OFF   = { id: 'tech1', is_available: false };
const ACTIVE_JOB = { tech_id: 'tech1', status: 'in_progress' };

// ── Calendar colors that tech colors must never duplicate ─────────────────────

const CAL = {
  scheduled:   '#8A90A2',
  in_progress: '#D4A000',
  complete:    '#2E7D32',
  cancelled:   '#C62828',
};

// ── Live GPS color ─────────────────────────────────────────────────────────────

describe('Live GPS color', () => {
  it('Live GPS marker color is not Job Completed green', () => {
    expect(TECH_PRESENTATIONS.live.markerColor).not.toBe(CAL.complete);
  });

  it('Live GPS does not visually match Job Completed', () => {
    expect(TECH_PRESENTATIONS.live.markerColor).not.toBe(
      getJobStatusPresentation('complete').markerColor,
    );
  });

  it('Live GPS uses the shared sky-blue marker token #0EA5E9', () => {
    expect(TECH_PRESENTATIONS.live.markerColor).toBe('#0EA5E9');
  });

  it('Live GPS badge text color is not green or green-adjacent', () => {
    expect(TECH_PRESENTATIONS.live.color).not.toBe(CAL.complete);
    // simple heuristic: blue text color should start with #0 or #1
    expect(TECH_PRESENTATIONS.live.color.toLowerCase()).toMatch(/^#[01]/);
  });
});

// ── Job Completed color unchanged ─────────────────────────────────────────────

describe('Job Completed color stays Calendar green', () => {
  it('Job Completed marker is still #2E7D32', () => {
    expect(getJobStatusPresentation('complete').markerColor).toBe('#2E7D32');
  });

  it('Job Completed and Live GPS markers are visually distinct', () => {
    const jobComplete = getJobStatusPresentation('complete').markerColor;
    const liveGps     = TECH_PRESENTATIONS.live.markerColor;
    expect(liveGps).not.toBe(jobComplete);
  });
});

// ── GPS freshness threshold boundaries ────────────────────────────────────────

describe('GPS freshness thresholds', () => {
  it('just under live threshold (5 min - 1 s) → live', () => {
    const st = getTechStatus(TECH, [makeLoc(GPS_LIVE_MS - 1000)], []);
    expect(st.key).toBe('live');
    expect(st.locationFreshness).toBe('live');
  });

  it('4 min → live', () => {
    expect(getTechStatus(TECH, [makeLoc(4 * 60 * 1000)], []).key).toBe('live');
  });

  it('5 min + 1 ms → stale', () => {
    const st = getTechStatus(TECH, [makeLoc(GPS_LIVE_MS + 1)], []);
    expect(st.key).toBe('stale');
    expect(st.locationFreshness).toBe('stale');
  });

  it('15 min → stale', () => {
    expect(getTechStatus(TECH, [makeLoc(15 * 60 * 1000)], []).key).toBe('stale');
  });

  it('≤ 30 min (stale threshold) → stale', () => {
    const st = getTechStatus(TECH, [makeLoc(GPS_STALE_MS)], []);
    expect(st.key).toBe('stale');
  });

  it('30 min + 1 ms → offline', () => {
    const st = getTechStatus(TECH, [makeLoc(GPS_STALE_MS + 1)], []);
    expect(st.key).toBe('offline');
    expect(st.locationFreshness).toBe('offline');
  });

  it('60 min → offline', () => {
    expect(getTechStatus(TECH, [makeLoc(60 * 60 * 1000)], []).key).toBe('offline');
  });
});

// ── Stale marker treatment ────────────────────────────────────────────────────

describe('Stale tech retains blue base marker color', () => {
  it('stale marker color is blue/cyan (#0EA5E9)', () => {
    const st = getTechStatus(TECH, [makeLoc(10 * 60 * 1000)], []);
    expect(st.markerColor).toBe('#0EA5E9');
  });

  it('stale marker color is not gold/In Progress', () => {
    const st = getTechStatus(TECH, [makeLoc(10 * 60 * 1000)], []);
    expect(st.markerColor).not.toBe(CAL.in_progress);
  });

  it('stale marker color is not Job Completed green', () => {
    const st = getTechStatus(TECH, [makeLoc(10 * 60 * 1000)], []);
    expect(st.markerColor).not.toBe(CAL.complete);
  });
});

describe('Stale tech receives warning flag', () => {
  it('stale tech has isStale = true', () => {
    const st = getTechStatus(TECH, [makeLoc(10 * 60 * 1000)], []);
    expect(st.isStale).toBe(true);
  });

  it('live tech has isStale = false', () => {
    const st = getTechStatus(TECH, [makeLoc(2 * 60 * 1000)], []);
    expect(st.isStale).toBe(false);
  });

  it('offline tech has isStale = false', () => {
    const st = getTechStatus(TECH, [makeLoc(35 * 60 * 1000)], []);
    expect(st.isStale).toBe(false);
  });
});

describe('Stale status includes last update time', () => {
  it('stale tech has lastLocationAt', () => {
    const st = getTechStatus(TECH, [makeLoc(10 * 60 * 1000)], []);
    expect(st.lastLocationAt).toBeTruthy();
    expect(new Date(st.lastLocationAt).getTime()).toBeLessThan(Date.now());
  });

  it('live tech has lastLocationAt', () => {
    const st = getTechStatus(TECH, [makeLoc(2 * 60 * 1000)], []);
    expect(st.lastLocationAt).toBeTruthy();
  });
});

// ── Stale vs Offline vs Unavailable distinction ───────────────────────────────

describe('Stale does not mean offline', () => {
  it('stale key is stale, not offline', () => {
    const st = getTechStatus(TECH, [makeLoc(10 * 60 * 1000)], []);
    expect(st.key).toBe('stale');
    expect(st.key).not.toBe('offline');
  });

  it('offline is distinct from stale', () => {
    const st = getTechStatus(TECH, [makeLoc(35 * 60 * 1000)], []);
    expect(st.key).toBe('offline');
    expect(st.key).not.toBe('stale');
  });
});

describe('Stale does not mean Off Duty or no-location', () => {
  it('off-duty tech is not stale', () => {
    const st = getTechStatus(TECH_OFF, [makeLoc(10 * 60 * 1000)], []);
    expect(st.key).toBe('off');
    expect(st.isStale).toBe(false);
  });

  it('tech with no location record is available, not stale', () => {
    const st = getTechStatus(TECH, [], []);
    expect(st.key).toBe('available');
    expect(st.isStale).toBe(false);
  });
});

// ── ACTIVE_STATUSES coverage ──────────────────────────────────────────────────

describe('ACTIVE_STATUSES covers all operational job statuses', () => {
  it('includes en_route and arrived as active statuses', () => {
    expect(ACTIVE_STATUSES.has('en_route')).toBe(true);
    expect(ACTIVE_STATUSES.has('arrived')).toBe(true);
    expect(ACTIVE_STATUSES.has('in_progress')).toBe(true);
    expect(ACTIVE_STATUSES.has('paused')).toBe(true);
  });

  it('excludes terminal and pre-work statuses', () => {
    expect(ACTIVE_STATUSES.has('scheduled')).toBe(false);
    expect(ACTIVE_STATUSES.has('complete')).toBe(false);
    expect(ACTIVE_STATUSES.has('cancelled')).toBe(false);
  });

  it('en_route makes tech busy', () => {
    const st = getTechStatus(TECH, [], [{ tech_id: 'tech1', status: 'en_route' }]);
    expect(st.key).toBe('busy');
  });

  it('arrived makes tech busy', () => {
    const st = getTechStatus(TECH, [], [{ tech_id: 'tech1', status: 'arrived' }]);
    expect(st.key).toBe('busy');
  });

  it('paused makes tech busy', () => {
    const st = getTechStatus(TECH, [], [{ tech_id: 'tech1', status: 'paused' }]);
    expect(st.key).toBe('busy');
  });

  it('awaiting_client makes tech busy', () => {
    const st = getTechStatus(TECH, [], [{ tech_id: 'tech1', status: 'awaiting_client' }]);
    expect(st.key).toBe('busy');
  });

  it('awaiting_parts makes tech busy', () => {
    const st = getTechStatus(TECH, [], [{ tech_id: 'tech1', status: 'awaiting_parts' }]);
    expect(st.key).toBe('busy');
  });

  it('scheduled job does NOT make tech busy', () => {
    const st = getTechStatus(TECH, [], [{ tech_id: 'tech1', status: 'scheduled' }]);
    expect(st.key).not.toBe('busy');
  });

  it('complete job does NOT make tech busy', () => {
    const st = getTechStatus(TECH, [], [{ tech_id: 'tech1', status: 'complete' }]);
    expect(st.key).not.toBe('busy');
  });
});

// ── Active-job tech with stale GPS ────────────────────────────────────────────

describe('Active-job tech can simultaneously have stale GPS', () => {
  it('on-job tech with stale GPS has key=busy and isStale=true', () => {
    const st = getTechStatus(TECH, [makeLoc(10 * 60 * 1000)], [ACTIVE_JOB]);
    expect(st.key).toBe('busy');
    expect(st.isStale).toBe(true);
    expect(st.locationFreshness).toBe('stale');
  });

  it('on-job tech with live GPS has key=busy and isStale=false', () => {
    const st = getTechStatus(TECH, [makeLoc(2 * 60 * 1000)], [ACTIVE_JOB]);
    expect(st.key).toBe('busy');
    expect(st.isStale).toBe(false);
  });

  it('on-job tech with stale GPS retains blue markerColor', () => {
    const st = getTechStatus(TECH, [makeLoc(10 * 60 * 1000)], [ACTIVE_JOB]);
    expect(st.markerColor).toBe('#1565C0');  // busy navy-blue, not amber
  });
});

// ── Color ambiguity: no tech color may match a Calendar job color ─────────────

describe('No tech presentation color matches a Calendar job color', () => {
  const calColors = Object.values(CAL);

  it('no tech markerColor duplicates a Calendar job color', () => {
    Object.values(TECH_PRESENTATIONS).forEach(p => {
      calColors.forEach(cal => {
        expect(p.markerColor).not.toBe(cal);
      });
    });
  });

  it('no tech badge text color duplicates Job Completed green', () => {
    Object.values(TECH_PRESENTATIONS).forEach(p => {
      expect(p.color).not.toBe(CAL.complete);
    });
  });
});

// ── Stale warning color is distinct from In Progress gold ────────────────────

describe('Stale warning color', () => {
  it('STALE_WARNING_COLOR is not Job In Progress gold', () => {
    expect(STALE_WARNING_COLOR).not.toBe(CAL.in_progress);
  });

  it('STALE_WARNING_COLOR is amber (#F59E0B)', () => {
    expect(STALE_WARNING_COLOR).toBe('#F59E0B');
  });
});

// ── Legend items ──────────────────────────────────────────────────────────────

describe('TECH_LEGEND_ITEMS only includes live by default', () => {
  it('TECH_LEGEND_ITEMS has exactly one entry', async () => {
    const { TECH_LEGEND_ITEMS } = await import('./technicianStatusPresentation');
    expect(TECH_LEGEND_ITEMS).toHaveLength(1);
    expect(TECH_LEGEND_ITEMS[0].key).toBe('live');
  });

  it('TECH_STALE_LEGEND_ITEM exists separately', async () => {
    const { TECH_STALE_LEGEND_ITEM } = await import('./technicianStatusPresentation');
    expect(TECH_STALE_LEGEND_ITEM.key).toBe('stale');
    expect(TECH_STALE_LEGEND_ITEM.label).toBe('Tech — Location Stale');
  });

  it('stale legend color matches stale markerColor (blue)', async () => {
    const { TECH_STALE_LEGEND_ITEM } = await import('./technicianStatusPresentation');
    expect(TECH_STALE_LEGEND_ITEM.color).toBe(TECH_PRESENTATIONS.stale.markerColor);
    expect(TECH_STALE_LEGEND_ITEM.color).toBe('#0EA5E9');
  });

  it('stale legend warningColor matches STALE_WARNING_COLOR', async () => {
    const { TECH_STALE_LEGEND_ITEM } = await import('./technicianStatusPresentation');
    expect(TECH_STALE_LEGEND_ITEM.warningColor).toBe(STALE_WARNING_COLOR);
  });
});
