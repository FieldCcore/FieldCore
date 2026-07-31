// Tenant-aware Dispatch viewport resolver.
// Pure function — no side effects, no DOM, no React.
//
// Priority order (highest → lowest):
//   A  Live techs + today's relevant jobs          → fit_bounds
//   B  Today's relevant jobs only                  → fit_bounds
//   C  Live techs only                             → fit_bounds
//   D  Stale techs (graceful degradation)          → fit_bounds
//   E  Radius-based service area                   → fit_bounds (2-point bbox)
//   F  Custom dispatch center + zoom               → center_zoom
//   G  Business address coordinates                → center_zoom
//   H  User geolocation (explicit request only)    → center_zoom
//   I  Persisted viewport from localStorage        → center_zoom
//   J  Geographic fallback                         → center_zoom

import { isValidCoord, classifyTechGPS } from './dispatchCoords';

// Neutral continental-US center. Used only when ZERO tenant data exists.
// Not South Florida. Displayed at zoom 4 so the whole US is visible.
const FALLBACK_CENTER = { lat: 39.5, lng: -98.35 };
const FALLBACK_ZOOM   = 4;

// Job statuses included in auto-framing by default.
const DEFAULT_ACTIVE_STATUSES = new Set([
  'scheduled', 'in_progress', 'en_route', 'partially_completed',
  'paused', 'awaiting_client', 'awaiting_parts', 'ready_for_inspection',
]);

/**
 * Resolve the best Dispatch map viewport from available tenant data.
 *
 * @param {object}     opts
 * @param {object[]}   opts.technicians           – from GET /api/mobile/locations
 * @param {object[]}   opts.jobs                  – from GET /api/jobs?date=today
 * @param {object|null} opts.dispatchSettings     – from GET /api/dispatch-settings
 * @param {object|null} opts.accountLocation      – { lat, lng } from accounts table
 * @param {object|null} opts.userLocation         – { lat, lng } from navigator.geolocation
 * @param {boolean}    opts.userRequestedLocation – true only on explicit Center-on-Me
 * @param {object|null} opts.persistedViewport    – { lat, lng, zoom } from localStorage
 *
 * @returns {{
 *   mode: 'fit_bounds'|'center_zoom',
 *   center: {lat:number,lng:number}|null,
 *   zoom: number|null,
 *   bounds: {lat:number,lng:number}[]|null,
 *   source: string,
 *   pointCount: number,
 *   reason: string,
 * }}
 */
export function resolveDispatchViewport({
  technicians = [],
  jobs = [],
  dispatchSettings = null,
  accountLocation = null,
  userLocation = null,
  userRequestedLocation = false,
  persistedViewport = null,
} = {}) {
  const ds = dispatchSettings || {};
  const includedStatuses = _resolveJobStatuses(ds);

  // ── Collect live / stale tech points ──────────────────────────────────────
  const liveTechs  = [];
  const staleTechs = [];
  for (const t of technicians) {
    if (!isValidCoord(t.lat, t.lng)) continue;
    const freshness = classifyTechGPS(t.updated_at);
    const pt = { lat: _n(t.lat), lng: _n(t.lng) };
    if (freshness === 'live')  liveTechs.push(pt);
    if (freshness === 'stale') staleTechs.push(pt);
  }

  // ── Collect today's relevant job points ───────────────────────────────────
  const jobPoints = [];
  for (const j of jobs) {
    if (!includedStatuses.has(j.status)) continue;
    if (!isValidCoord(j.service_lat, j.service_lng)) continue;
    jobPoints.push({ lat: _n(j.service_lat), lng: _n(j.service_lng) });
  }

  // ── A. Live techs + jobs (both present) ──────────────────────────────────
  if (liveTechs.length > 0 && jobPoints.length > 0) {
    return _fitBounds(
      [...liveTechs, ...jobPoints],
      'techs_and_jobs',
      `${liveTechs.length} live tech(s) + ${jobPoints.length} job(s)`,
    );
  }

  // ── B. Jobs only ──────────────────────────────────────────────────────────
  if (jobPoints.length > 0) {
    return _fitBounds(jobPoints, 'jobs', `${jobPoints.length} job(s) with coordinates`);
  }

  // ── C. Live techs only ────────────────────────────────────────────────────
  if (liveTechs.length > 0) {
    return _fitBounds(liveTechs, 'techs', `${liveTechs.length} live tech(s)`);
  }

  // ── D. Stale techs (graceful degradation) ─────────────────────────────────
  if (staleTechs.length > 0) {
    return _fitBounds(staleTechs, 'stale_techs', `${staleTechs.length} stale tech(s)`);
  }

  // ── E. Radius-based service area ──────────────────────────────────────────
  if (
    ds.dispatch_service_area_type === 'radius' &&
    isValidCoord(ds.dispatch_center_lat, ds.dispatch_center_lng) &&
    parseFloat(ds.dispatch_service_radius_miles) > 0
  ) {
    const center = { lat: _n(ds.dispatch_center_lat), lng: _n(ds.dispatch_center_lng) };
    const bbox   = _radiusBbox(center, parseFloat(ds.dispatch_service_radius_miles));
    return _fitBounds(
      bbox,
      'service_area_radius',
      `${ds.dispatch_service_radius_miles} mi radius around configured center`,
    );
  }

  // ── F. Custom dispatch center ──────────────────────────────────────────────
  if (
    ds.dispatch_service_area_type === 'custom_center' &&
    isValidCoord(ds.dispatch_center_lat, ds.dispatch_center_lng)
  ) {
    return {
      mode:       'center_zoom',
      center:     { lat: _n(ds.dispatch_center_lat), lng: _n(ds.dispatch_center_lng) },
      zoom:       _zoom(ds.dispatch_default_zoom, 11),
      bounds:     null,
      source:     'custom_center',
      pointCount: 0,
      reason:     'Configured custom dispatch center',
    };
  }

  // ── G. Business address coordinates ───────────────────────────────────────
  if (accountLocation && isValidCoord(accountLocation.lat, accountLocation.lng)) {
    return {
      mode:       'center_zoom',
      center:     { lat: _n(accountLocation.lat), lng: _n(accountLocation.lng) },
      zoom:       _zoom(ds.dispatch_default_zoom, 11),
      bounds:     null,
      source:     'business_address',
      pointCount: 0,
      reason:     'Business address coordinates from accounts table',
    };
  }

  // ── H. User geolocation — only on explicit request ─────────────────────────
  if (
    userRequestedLocation &&
    userLocation &&
    isValidCoord(userLocation.lat, userLocation.lng)
  ) {
    return {
      mode:       'center_zoom',
      center:     { lat: userLocation.lat, lng: userLocation.lng },
      zoom:       14,
      bounds:     null,
      source:     'user_location',
      pointCount: 0,
      reason:     'Dispatcher location (explicitly requested)',
    };
  }

  // ── I. Persisted viewport from localStorage ──────────────────────────────────
  if (
    persistedViewport &&
    typeof persistedViewport.lat  === 'number' &&
    typeof persistedViewport.lng  === 'number' &&
    typeof persistedViewport.zoom === 'number'
  ) {
    return {
      mode:       'center_zoom',
      center:     { lat: persistedViewport.lat, lng: persistedViewport.lng },
      zoom:       persistedViewport.zoom,
      bounds:     null,
      source:     'persisted_viewport',
      pointCount: 0,
      reason:     'Restored last saved viewport position',
    };
  }

  // ── J. Safe geographic fallback ───────────────────────────────────────────
  return {
    mode:       'center_zoom',
    center:     FALLBACK_CENTER,
    zoom:       FALLBACK_ZOOM,
    bounds:     null,
    source:     'fallback',
    pointCount: 0,
    reason:     'No tenant data — set a service area in Company Settings.',
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _resolveJobStatuses(ds) {
  const statuses = new Set(DEFAULT_ACTIVE_STATUSES);
  if (ds.dispatch_include_completed) { statuses.add('complete'); statuses.add('completed_for_day'); }
  if (ds.dispatch_include_cancelled) { statuses.add('cancelled'); statuses.add('no_show'); }
  return statuses;
}

function _fitBounds(points, source, reason) {
  return {
    mode:       'fit_bounds',
    center:     null,
    zoom:       null,
    bounds:     points,
    source,
    pointCount: points.length,
    reason,
  };
}

// Approximate 2-point bounding box for a circle (center + radius in miles).
// Uses flat-earth approximation; good enough for dispatch framing at ≤ 500 mi.
function _radiusBbox(center, radiusMiles) {
  const latDelta = radiusMiles / 69;
  const lngDelta = radiusMiles / (69 * Math.cos((center.lat * Math.PI) / 180));
  return [
    { lat: center.lat - latDelta, lng: center.lng - lngDelta },
    { lat: center.lat + latDelta, lng: center.lng + lngDelta },
  ];
}

function _n(v) { return typeof v === 'number' ? v : parseFloat(v); }
function _zoom(v, fallback) {
  const z = parseInt(v, 10);
  return (isNaN(z) || z < 1 || z > 22) ? fallback : z;
}
