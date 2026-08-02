/**
 * jobStatusPresentation.js
 *
 * Single source of truth for job status colors, labels, and normalization.
 * Calendar and Dispatch both import from here — no separate color maps allowed.
 *
 * Calendar colors are the authority. Marker hex values must match CAL_STATUS_COLOR.
 */

// ── Alias normalization ───────────────────────────────────────────────────────

const STATUS_ALIAS = {
  complete:              'complete',
  completed:             'complete',
  done:                  'complete',
  canceled:              'cancelled',
  cancelled:             'cancelled',
  in_progress:           'in_progress',
  inprogress:            'in_progress',
  active:                'in_progress',
  on_job:                'in_progress',
  partially_completed:   'in_progress', // Calendar remaps to in_progress
  scheduled:             'scheduled',
  assigned:              'scheduled',
  dispatched:            'scheduled',
  en_route:              'en_route',
  enroute:               'en_route',
  arrived:               'arrived',
  paused:                'paused',
  awaiting_client:       'awaiting_client',
  awaitingclient:        'awaiting_client',
  awaiting_parts:        'awaiting_parts',
  awaitingparts:         'awaiting_parts',
  ready_for_inspection:  'ready_for_inspection',
  readyforinspection:    'ready_for_inspection',
  no_show:               'no_show',
  noshow:                'no_show',
  no_show_clock:         'no_show',
};

export function normalizeJobStatus(status) {
  if (!status) return 'scheduled';
  const key = String(status).toLowerCase().replace(/[-\s]/g, '_');
  return STATUS_ALIAS[key] ?? key;
}

// ── Calendar event colors (source of truth) ───────────────────────────────────
// These values drive Calendar event backgrounds. All marker colors below must
// be derived from these or be consistent with them.

export const CAL_STATUS_COLOR = {
  scheduled:           '#8A90A2',
  in_progress:         '#D4A000',
  partially_completed: '#D4A000',
  complete:            '#2E7D32',
  cancelled:           '#C62828',
};

export const SESSION_CAL_COLOR = {
  scheduled:         '#8A90A2',
  in_progress:       '#D4A000',
  completed_for_day: '#2E7D32',
  cancelled:         '#C62828',
};

// ── Per-canonical-status presentation ────────────────────────────────────────
// markerColor: solid hex used in SVG map markers — matches Calendar color scheme
// badgeBg/badgeColor: CSS variables used in status chips / drawer badges

const PRESENTATIONS = {
  scheduled: {
    label:       'Scheduled',
    markerColor: '#8A90A2',
    badgeBg:     'var(--off)',
    badgeColor:  'var(--steel)',
    priority:    3,
  },
  in_progress: {
    label:       'Active',
    markerColor: '#D4A000',       // matches CAL_STATUS_COLOR.in_progress
    badgeBg:     'var(--yellow-lt)',
    badgeColor:  'var(--yellow)',
    priority:    1,
  },
  en_route: {
    label:       'En Route',
    markerColor: '#D4A000',       // active-family: on the way
    badgeBg:     'var(--yellow-lt)',
    badgeColor:  'var(--yellow)',
    priority:    1,
  },
  arrived: {
    label:       'Arrived',
    markerColor: '#D4A000',
    badgeBg:     'var(--yellow-lt)',
    badgeColor:  'var(--yellow)',
    priority:    1,
  },
  paused: {
    label:       'Paused',
    markerColor: '#E65100',       // --amber: paused/waiting family
    badgeBg:     'var(--amber-lt)',
    badgeColor:  'var(--amber)',
    priority:    2,
  },
  awaiting_client: {
    label:       'Awaiting Client',
    markerColor: '#E65100',
    badgeBg:     'var(--amber-lt)',
    badgeColor:  'var(--amber)',
    priority:    2,
  },
  awaiting_parts: {
    label:       'Awaiting Parts',
    markerColor: '#E65100',
    badgeBg:     'var(--amber-lt)',
    badgeColor:  'var(--amber)',
    priority:    2,
  },
  ready_for_inspection: {
    label:       'Pending Inspection',
    markerColor: '#2E7D32',       // nearly done: green family
    badgeBg:     'var(--green-lt)',
    badgeColor:  'var(--green)',
    priority:    2,
  },
  complete: {
    label:       'Completed',
    markerColor: '#2E7D32',       // matches CAL_STATUS_COLOR.complete
    badgeBg:     'var(--green-lt)',
    badgeColor:  'var(--green)',
    priority:    4,
  },
  cancelled: {
    label:       'Cancelled',
    markerColor: '#C62828',       // matches CAL_STATUS_COLOR.cancelled
    badgeBg:     'var(--red-lt)',
    badgeColor:  'var(--red)',
    priority:    5,
  },
  no_show: {
    label:       'No-show',
    markerColor: '#C62828',
    badgeBg:     'var(--red-lt)',
    badgeColor:  'var(--red)',
    priority:    5,
  },
};

const FALLBACK = {
  label:       'Unknown',
  markerColor: '#8A90A2',
  badgeBg:     'var(--off)',
  badgeColor:  'var(--steel)',
  priority:    99,
};

export function getJobStatusPresentation(status) {
  const normalized = normalizeJobStatus(status);
  return PRESENTATIONS[normalized] ?? FALLBACK;
}

// Convenience: get badge style object for inline React styles
export function getJobStatusBadgeStyle(status) {
  const p = getJobStatusPresentation(status);
  return { background: p.badgeBg, color: p.badgeColor };
}

// Convenience: get marker fill color
export function getJobMarkerColor(status) {
  return getJobStatusPresentation(status).markerColor;
}
