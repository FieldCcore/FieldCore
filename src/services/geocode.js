// Startup check — visible in Railway/server logs when process starts.
// Server geocoding prefers GOOGLE_MAPS_SERVER_KEY (no referrer restrictions) and
// falls back to GOOGLE_MAPS_API_KEY. Do not use a browser-restricted key for REST calls.
const _serverKey  = process.env.GOOGLE_MAPS_SERVER_KEY;
const _browserKey = process.env.GOOGLE_MAPS_API_KEY;
const _activeKey  = _serverKey || _browserKey;

console.log('[Geocode] startup check', {
  GOOGLE_MAPS_SERVER_KEY_set: !!_serverKey,
  GOOGLE_MAPS_API_KEY_set:    !!_browserKey,
  using: _serverKey ? 'GOOGLE_MAPS_SERVER_KEY' : (_browserKey ? 'GOOGLE_MAPS_API_KEY (browser key — may fail with referrer restrictions)' : 'NONE'),
});

/**
 * Build a geocodable address string from address components.
 * Trims values, omits nulls/blanks, joins with comma.
 */
function buildGeocodableAddress({ street, city, state, zip, country } = {}) {
  return [street, city, state, zip, country]
    .map(v => (v || '').trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * Server-side geocoding via Google Geocoding API.
 *
 * Returns on success:
 *   { lat, lng, formatted_address, place_id, geocode_provider_status: 'OK' }
 *
 * Returns on failure:
 *   { error: true, geocode_provider_status, geocode_error }
 *
 * Never throws. Never logs the API key value.
 */
async function geocodeAddress(address) {
  const key = _serverKey || _browserKey;

  if (!key) {
    const reason = 'Neither GOOGLE_MAPS_SERVER_KEY nor GOOGLE_MAPS_API_KEY is set. Configure GOOGLE_MAPS_SERVER_KEY in Railway (server key without referrer restrictions, Geocoding API enabled).';
    console.error('[Geocode] failed', { geocode_provider_status: 'NO_API_KEY', geocode_error: reason });
    return { error: true, geocode_provider_status: 'NO_API_KEY', geocode_error: reason };
  }

  const trimmed = (address || '').trim();
  if (!trimmed) {
    return { error: true, geocode_provider_status: 'INVALID_REQUEST', geocode_error: 'Address is empty.' };
  }

  console.log('[Geocode] request', { hasKey: true, keySource: _serverKey ? 'SERVER_KEY' : 'BROWSER_KEY', address: trimmed });

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', trimmed);
    url.searchParams.set('key', key);

    const res  = await fetch(url.toString());
    const body = await res.json();

    if (body.status === 'OK' && body.results?.[0]) {
      const loc               = body.results[0].geometry.location;
      const formatted_address = body.results[0].formatted_address;
      const place_id          = body.results[0].place_id || null;
      console.log('[Geocode] result', { found: true, lat: loc.lat, lng: loc.lng, formatted_address, place_id });
      return { lat: loc.lat, lng: loc.lng, formatted_address, place_id, geocode_provider_status: 'OK' };
    }

    // Distinct failure reasons with user-friendly descriptions
    const providerStatus = body.status || 'UNKNOWN_ERROR';
    let geocode_error;
    if (providerStatus === 'ZERO_RESULTS') {
      geocode_error = 'We could not find this address. Check the street, city, and state.';
    } else if (providerStatus === 'REQUEST_DENIED') {
      const detail = body.error_message || 'API key may have referrer restrictions or Geocoding API is not enabled. Use GOOGLE_MAPS_SERVER_KEY.';
      geocode_error = `Google Maps request denied — ${detail}`;
    } else if (providerStatus === 'INVALID_REQUEST') {
      geocode_error = 'Address is incomplete or malformed.';
    } else if (providerStatus === 'OVER_QUERY_LIMIT') {
      geocode_error = 'Geocoding rate limit exceeded. Try again shortly.';
    } else {
      geocode_error = body.error_message || `Google Maps returned: ${providerStatus}`;
    }

    console.error('[Geocode] failed', { geocode_provider_status: providerStatus, geocode_error });
    return { error: true, geocode_provider_status: providerStatus, geocode_error };
  } catch (err) {
    const geocode_error = `Network error contacting Google Maps: ${err.message}`;
    console.error('[Geocode] failed', { geocode_provider_status: 'FETCH_ERROR', geocode_error });
    return { error: true, geocode_provider_status: 'FETCH_ERROR', geocode_error };
  }
}

module.exports = { geocodeAddress, buildGeocodableAddress };
