// Coordinate utilities for the Dispatch viewport engine.
// Pure functions — no side effects, no DOM, no React.

// GPS freshness thresholds — kept in sync with technicianStatusPresentation.js and src/routes/dispatch.js
export const TECH_LIVE_MS        = 5  * 60 * 1000;  // ≤ 5 min  → live
export const TECH_STALE_MS       = 30 * 60 * 1000;  // 5–30 min → stale; > 30 min → offline

/**
 * Returns true only for a finite, in-range, non-(0,0) coordinate pair.
 * Accepts numbers or parseable numeric strings.
 * Rejects: null, undefined, NaN, ±Infinity, out-of-range, and 0°N 0°E
 * (which is a common database sentinel for a missing geocode).
 */
export function isValidCoord(lat, lng) {
  const nlat = _parseNum(lat);
  const nlng = _parseNum(lng);
  if (!isFinite(nlat) || !isFinite(nlng)) return false;
  if (nlat < -90  || nlat > 90)  return false;
  if (nlng < -180 || nlng > 180) return false;
  if (nlat === 0  && nlng === 0)  return false;
  return true;
}

/**
 * Classify GPS freshness of a technician from their last-update timestamp.
 * Returns location freshness only — not operational status.
 *
 * @param {string|Date|null} updatedAt
 * @returns {'live'|'stale'|'offline'|'no_location'}
 */
export function classifyTechGPS(updatedAt) {
  if (!updatedAt) return 'no_location';
  const age = Date.now() - new Date(updatedAt).getTime();
  if (age <= TECH_LIVE_MS)  return 'live';
  if (age <= TECH_STALE_MS) return 'stale';
  return 'offline';
}

/**
 * Extract valid { lat, lng } points from a collection using named keys.
 * Skips any item whose coordinate pair fails isValidCoord.
 */
export function extractValidPoints(items, latKey = 'lat', lngKey = 'lng') {
  return (items || []).reduce((acc, item) => {
    if (item && isValidCoord(item[latKey], item[lngKey])) {
      acc.push({ lat: _parseNum(item[latKey]), lng: _parseNum(item[lngKey]) });
    }
    return acc;
  }, []);
}

function _parseNum(v) {
  if (v == null) return NaN;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v));
  return isNaN(n) ? NaN : n;
}
