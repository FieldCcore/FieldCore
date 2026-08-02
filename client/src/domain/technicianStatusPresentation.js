/**
 * technicianStatusPresentation.js
 *
 * Source of truth for technician operational status and GPS location freshness.
 * These are two distinct dimensions — a tech can be On Job AND have stale GPS simultaneously.
 *
 * Used by: DispatchTeamPanel, DispatchDrawer, DispatchMapLegend, Dispatch (markers)
 */

// GPS freshness thresholds — must match dispatchCoords.js and src/routes/dispatch.js
const GPS_LIVE_MS  = 5  * 60 * 1000;   // ≤ 5 min  → Live GPS
const GPS_STALE_MS = 30 * 60 * 1000;   // 5–30 min → Stale; > 30 min → Offline

// Active job statuses (must stay in sync with DispatchTeamPanel + dispatch.js)
const ACTIVE_STATUSES = new Set([
  'in_progress', 'paused', 'awaiting_client', 'awaiting_parts',
  'partially_completed', 'ready_for_inspection',
]);

// Calendar job-status colors are off-limits for tech markers and badges:
//   Scheduled → #8A90A2 (gray)   In Progress → #D4A000 (gold)
//   Completed  → #2E7D32 (green) Cancelled   → #C62828 (red)

// Stale warning: amber, visibly distinct from In Progress gold (#D4A000)
export const STALE_WARNING_COLOR = '#F59E0B';

// Each presentation has:
//   color       — text color for badges/chips in the team panel and drawer
//   bg          — background for badges/chips
//   markerColor — fill for the map marker circle body (may differ from color)
//
// For `stale`, the marker body stays blue (markerColor) while the badge uses
// amber text/bg. The amber warning ring is added by the marker renderer using
// STALE_WARNING_COLOR when isStale is true.

const TECH_PRESENTATIONS = {
  live: {
    key:         'live',
    label:       'Live GPS',
    color:       '#0284C7',            // sky-blue badge text — never green
    bg:          '#E0F4FF',
    markerColor: '#0EA5E9',            // vivid sky-blue marker body
    priority:    1,
  },
  busy: {
    key:         'busy',
    label:       'On Job',
    color:       '#1565C0',            // navy blue
    bg:          'var(--blue-lt)',
    markerColor: '#1565C0',
    priority:    1,
  },
  available: {
    key:         'available',
    label:       'Available',
    color:       '#0369A1',            // deep sky-blue (no GPS — not shown on map)
    bg:          '#E0F4FF',
    markerColor: '#0369A1',
    priority:    2,
  },
  stale: {
    key:         'stale',
    label:       'Location Stale',
    color:       '#B45309',            // amber-dark badge text (warning tone)
    bg:          '#FEF3C7',            // amber-light badge bg
    markerColor: '#0EA5E9',            // marker body stays blue; renderer adds amber ring
    priority:    3,
  },
  offline: {
    key:         'offline',
    label:       'Offline',
    color:       '#455A64',            // dark blue-gray
    bg:          '#ECEFF1',
    markerColor: '#455A64',
    priority:    4,
  },
  off: {
    key:         'off',
    label:       'Off Duty',
    color:       '#455A64',
    bg:          '#ECEFF1',
    markerColor: '#455A64',
    priority:    5,
  },
};

/**
 * Classify GPS freshness from a location record.
 * Isolated from operational status — a tech can be On Job and Stale simultaneously.
 *
 * @param {object|null} loc — location record with updated_at
 * @returns {'live'|'stale'|'offline'|'no_location'}
 */
function getLocationFreshness(loc) {
  if (!loc) return 'no_location';
  const age = Date.now() - new Date(loc.updated_at).getTime();
  if (age <= GPS_LIVE_MS)  return 'live';
  if (age <= GPS_STALE_MS) return 'stale';
  return 'offline';
}

/**
 * Derive the technician's display status from their data.
 *
 * Returns a TECH_PRESENTATIONS entry enriched with location-freshness fields:
 *   locationFreshness — 'live' | 'stale' | 'offline' | 'no_location'
 *   isStale           — true when GPS data is 5–30 min old (warning ring on marker)
 *   lastLocationAt    — ISO timestamp of last known location, or null
 *
 * A tech may simultaneously be On Job (operationalStatus) and Stale (locationFreshness).
 * Callers should check both key (for operational state) and isStale (for GPS warning).
 *
 * @param {object} tech     — technician record (is_available, id, name)
 * @param {Array}  techLocs — all location records
 * @param {Array}  jobs     — all jobs (to detect active assignment)
 * @returns {object}        — presentation enriched with freshness fields
 */
export function getTechStatus(tech, techLocs = [], jobs = []) {
  if (!tech.is_available) {
    return { ...TECH_PRESENTATIONS.off, locationFreshness: 'no_location', isStale: false, lastLocationAt: null };
  }

  const loc               = techLocs.find(l => l.user_id === tech.id);
  const locationFreshness = getLocationFreshness(loc);
  const isStale           = locationFreshness === 'stale';
  const lastLocationAt    = loc?.updated_at ?? null;
  const onJob             = jobs.some(j => j.tech_id === tech.id && ACTIVE_STATUSES.has(j.status));

  if (onJob) {
    // On Job is the primary operational state; GPS freshness is an overlay, not a replacement
    return { ...TECH_PRESENTATIONS.busy, locationFreshness, isStale, lastLocationAt };
  }
  if (!loc) {
    return { ...TECH_PRESENTATIONS.available, locationFreshness: 'no_location', isStale: false, lastLocationAt: null };
  }
  if (locationFreshness === 'offline') {
    return { ...TECH_PRESENTATIONS.offline, locationFreshness, isStale: false, lastLocationAt };
  }
  if (locationFreshness === 'stale') {
    return { ...TECH_PRESENTATIONS.stale, locationFreshness, isStale: true, lastLocationAt };
  }
  return { ...TECH_PRESENTATIONS.live, locationFreshness, isStale: false, lastLocationAt };
}

export function getTechStatusPresentation(key) {
  return TECH_PRESENTATIONS[key] ?? TECH_PRESENTATIONS.offline;
}

export { GPS_LIVE_MS, GPS_STALE_MS, ACTIVE_STATUSES, TECH_PRESENTATIONS };

// Live is always shown in the compact legend.
// Stale is conditional — only shown when at least one visible tech has stale GPS.
export const TECH_LEGEND_ITEMS = [
  { key: 'live', label: 'Tech — Live GPS', color: TECH_PRESENTATIONS.live.markerColor },
];

export const TECH_STALE_LEGEND_ITEM = {
  key:          'stale',
  label:        'Tech — Location Stale',
  color:        TECH_PRESENTATIONS.stale.markerColor,
  warningColor: STALE_WARNING_COLOR,
};
