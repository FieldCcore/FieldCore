/**
 * resolveDispatchKpiSet
 *
 * Deterministic resolver that returns the ordered list of KPI metric keys
 * to display, based on tenant settings and available data signals.
 *
 * Output is always an array of 5 strings (no duplicates, no unsupported keys).
 * Order is stable — same input always produces same output.
 */

// All supported metric keys that have real backend implementations
export const SUPPORTED_METRICS = new Set([
  'liveTechnicians',
  'activeJobs',
  'todaysJobs',
  'completedToday',
  'averageResponse',
]);

// Default ordering when adaptive is off or no substitutions apply
const DEFAULT_ORDER = [
  'liveTechnicians',
  'activeJobs',
  'todaysJobs',
  'completedToday',
  'averageResponse',
];

const FIFTH_PREF_MAP = {
  average_response: 'averageResponse',
};

/**
 * @param {object} opts
 * @param {object}  opts.settings          — dispatch_settings row (KPI fields)
 * @param {number}  opts.technicianCount   — number of tech-role users
 * @param {boolean} opts.gpsAvailable      — any GPS location in last 15 min
 * @param {boolean} opts.jobsAvailable     — any jobs exist for today
 * @param {string}  opts.userRole          — 'owner'|'manager'|'tech'|'staff'
 * @returns {string[]}  — ordered array of 5 metric keys
 */
export function resolveDispatchKpiSet({
  settings         = {},
  technicianCount  = 0,
  gpsAvailable     = false,
  jobsAvailable    = true,
  userRole         = 'tech',
} = {}) {
  const fixedLayout    = settings.kpi_fixed_layout         !== false ? !!settings.kpi_fixed_layout : false;
  const adaptive       = !fixedLayout && (settings.kpi_adaptive_kpis_enabled !== false);
  const fifthPrefRaw   = settings.kpi_fifth_preference ?? 'average_response';
  const fifthPref      = FIFTH_PREF_MAP[fifthPrefRaw] ?? 'averageResponse';

  // Visibility overrides — default all true when no settings row exists
  const show = {
    liveTechnicians: settings.kpi_show_live_techs          !== false,
    activeJobs:      settings.kpi_show_active_jobs         !== false,
    todaysJobs:      settings.kpi_show_todays_jobs         !== false,
    completedToday:  settings.kpi_show_completed_today     !== false,
    averageResponse: settings.kpi_show_avg_response        !== false,
  };

  if (fixedLayout) {
    // Fixed mode: return in default order, skip hidden ones but keep 5 slots
    return dedupe(DEFAULT_ORDER.filter(k => show[k])).slice(0, 5);
  }

  // Adaptive mode
  const base = [...DEFAULT_ORDER.filter(k => show[k])];

  // Replace averageResponse with fifthPref if preferred and both are supported
  if (fifthPref !== 'averageResponse' && SUPPORTED_METRICS.has(fifthPref)) {
    const idx = base.indexOf('averageResponse');
    if (idx !== -1) base[idx] = fifthPref;
  }

  // Solo technician: de-emphasize Live Techs if there's only one
  if (adaptive && technicianCount === 1) {
    const liveIdx = base.indexOf('liveTechnicians');
    if (liveIdx !== -1) {
      // Move todaysJobs to front for solo operator clarity
      base.splice(liveIdx, 1);
      base.unshift('todaysJobs');
    }
  }

  return dedupe(base.filter(k => SUPPORTED_METRICS.has(k))).slice(0, 5);
}

function dedupe(arr) {
  return [...new Set(arr)];
}
