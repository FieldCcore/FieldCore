// Pure config-parsing logic — CommonJS, no import.meta.env dependency.
// Same algorithm as client/src/maps/mapsConfig.js — keep in sync.
// Used by Jest tests (which cannot import Vite ESM modules).

function sanitize(raw) {
  if (raw === undefined || raw === null) return '';
  // Trim whitespace, strip wrapping quotes, then trim again (handles `"  "` → empty)
  return String(raw).trim().replace(/^["']|["']$/g, '').trim();
}

/**
 * Parse a raw VITE_GOOGLE_MAPS_API_KEY value into a resolved config.
 * @param {string|undefined} rawKey   — value of VITE_GOOGLE_MAPS_API_KEY
 * @param {string|undefined} rawMapId — value of VITE_GOOGLE_MAPS_MAP_ID (optional)
 * @returns {{ apiKey, mapId, configured, failureReason }}
 */
function parseMapsConfig(rawKey, rawMapId) {
  const apiKey = sanitize(rawKey);
  const mapId  = sanitize(rawMapId) || null;

  if (!apiKey) {
    let failureReason;
    if (rawKey === undefined || rawKey === null) {
      failureReason = 'MAP_CONFIG_MISSING_API_KEY';
    } else {
      failureReason = 'MAP_CONFIG_EMPTY_API_KEY';
    }
    return { apiKey: '', mapId: null, configured: false, failureReason };
  }

  return { apiKey, mapId, configured: true, failureReason: null };
}

/**
 * Masked display of a key — safe to log.
 * @param {string} apiKey
 */
function maskedKey(apiKey) {
  if (!apiKey) return '(none)';
  if (apiKey.length <= 8) return '…' + apiKey.slice(-4);
  return apiKey.slice(0, 6) + '…' + apiKey.slice(-4);
}

module.exports = { parseMapsConfig, maskedKey };
