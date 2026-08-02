/**
 * technicianStatusPresentation.js
 *
 * Source of truth for technician GPS / availability state colors.
 * Kept separate from jobStatusPresentation — tech states are not job statuses.
 *
 * Used by: DispatchTeamPanel, DispatchDrawer, DispatchMapControls legend
 */

// GPS freshness thresholds — must match dispatchCoords.js and src/routes/dispatch.js
const GPS_LIVE_MS  = 2  * 60 * 1000;   // < 2 min  → Live GPS
const GPS_STALE_MS = 15 * 60 * 1000;   // 2–15 min → Stale; > 15 min → Offline

// Active job statuses (must stay in sync with DispatchTeamPanel + dispatch.js)
const ACTIVE_STATUSES = new Set([
  'in_progress', 'paused', 'awaiting_client', 'awaiting_parts',
  'partially_completed', 'ready_for_inspection',
]);

// Tech colors must never duplicate the four Calendar job-status colors:
//   Scheduled → #8A90A2 (gray)   In Progress → #D4A000 (gold)
//   Completed  → #2E7D32 (green) Cancelled   → #C62828 (red)

const TECH_PRESENTATIONS = {
  live: {
    key:        'live',
    label:      'Live GPS',
    color:      '#00796B',            // --teal  (distinct from job green)
    bg:         'var(--teal-lt)',
    markerRing: '#00796B',
    priority:   1,
  },
  busy: {
    key:        'busy',
    label:      'On Job',
    color:      '#1565C0',            // --blue
    bg:         'var(--blue-lt)',
    markerRing: '#1565C0',
    priority:   1,
  },
  available: {
    key:        'available',
    label:      'Available',
    color:      '#00ACC1',            // cyan (distinct from teal live GPS)
    bg:         '#E0F7FA',
    markerRing: '#00ACC1',
    priority:   2,
  },
  stale: {
    key:        'stale',
    label:      'GPS Stale',
    color:      '#E65100',            // --amber
    bg:         'var(--amber-lt)',
    markerRing: '#E65100',
    priority:   3,
  },
  offline: {
    key:        'offline',
    label:      'Offline',
    color:      '#455A64',            // dark blue-gray (distinct from job scheduled gray)
    bg:         '#ECEFF1',
    markerRing: '#455A64',
    priority:   4,
  },
  off: {
    key:        'off',
    label:      'Off Duty',
    color:      '#455A64',
    bg:         '#ECEFF1',
    markerRing: '#455A64',
    priority:   5,
  },
};

/**
 * Derive the technician's display status from their data.
 *
 * @param {object} tech     — technician record (is_available, id, name)
 * @param {Array}  techLocs — all location records
 * @param {Array}  jobs     — all jobs (to detect active assignment)
 * @returns {object}        — presentation from TECH_PRESENTATIONS
 */
export function getTechStatus(tech, techLocs = [], jobs = []) {
  if (!tech.is_available) return TECH_PRESENTATIONS.off;

  const loc = techLocs.find(l => l.user_id === tech.id);
  const age = loc ? Date.now() - new Date(loc.updated_at).getTime() : null;
  const onJob = jobs.some(j => j.tech_id === tech.id && ACTIVE_STATUSES.has(j.status));

  if (onJob)                   return TECH_PRESENTATIONS.busy;
  if (!loc)                    return TECH_PRESENTATIONS.available;
  if (age > GPS_STALE_MS)      return TECH_PRESENTATIONS.offline;
  if (age > GPS_LIVE_MS)       return TECH_PRESENTATIONS.stale;
  return                              TECH_PRESENTATIONS.live;
}

export function getTechStatusPresentation(key) {
  return TECH_PRESENTATIONS[key] ?? TECH_PRESENTATIONS.offline;
}

export { GPS_LIVE_MS, GPS_STALE_MS, ACTIVE_STATUSES };

// Compact legend entries — derived from TECH_PRESENTATIONS, not hardcoded
export const TECH_LEGEND_ITEMS = [
  { key: 'live',  label: 'Tech — Live GPS',  color: TECH_PRESENTATIONS.live.color  },
  { key: 'stale', label: 'Tech — GPS Stale', color: TECH_PRESENTATIONS.stale.color },
];
