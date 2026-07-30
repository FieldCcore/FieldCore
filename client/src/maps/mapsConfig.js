// Single source of truth for the Google Maps client configuration.
// Both MapProvider and GoogleMap consume this — never read import.meta.env directly
// in those files so the diagnostic reason is always explicit.

function sanitize(raw) {
  if (raw === undefined || raw === null) return '';
  // Trim whitespace, strip wrapping quotes, then trim again (handles `"  "` → empty)
  return String(raw).trim().replace(/^["']|["']$/g, '').trim();
}

function resolveFailureReason(raw) {
  if (raw === undefined) return 'MAP_CONFIG_MISSING_API_KEY';
  if (raw === null)      return 'MAP_CONFIG_MISSING_API_KEY';
  if (sanitize(raw) === '') return 'MAP_CONFIG_EMPTY_API_KEY';
  return null;
}

/**
 * Returns the resolved Maps configuration for the current build.
 *
 * Result shape:
 *   { apiKey: string, mapId: string|null, libraries: [], configured: bool, failureReason: string|null }
 *
 * failureReason codes:
 *   MAP_CONFIG_MISSING_API_KEY — VITE_GOOGLE_MAPS_API_KEY was not defined at build time
 *   MAP_CONFIG_EMPTY_API_KEY  — variable was present but empty (or only whitespace/quotes)
 */
export function getGoogleMapsClientConfig() {
  const rawKey   = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const rawMapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID;

  const apiKey = sanitize(rawKey);
  const mapId  = sanitize(rawMapId) || null;

  if (!apiKey) {
    const failureReason = resolveFailureReason(rawKey);

    console.warn(
      `[FieldCore Maps] Loader skipped — ${failureReason}`,
      '\n  Set VITE_GOOGLE_MAPS_API_KEY in:',
      '\n    • Local dev: client/.env.local',
      '\n    • Production: Vercel Dashboard → Project → Settings → Environment Variables',
      '\n  Variable must be prefixed VITE_ for Vite to expose it in the browser bundle.',
      '\n  After adding to Vercel, trigger a Production redeploy (not just a env-var save).',
    );

    return { apiKey: '', mapId: null, libraries: [], configured: false, failureReason };
  }

  return { apiKey, mapId, libraries: [], configured: true, failureReason: null };
}

/** Masked display version of the key — safe to log. Last 4 chars only. */
export function maskedKey(apiKey) {
  if (!apiKey) return '(none)';
  if (apiKey.length <= 8) return '…' + apiKey.slice(-4);
  return apiKey.slice(0, 6) + '…' + apiKey.slice(-4);
}
