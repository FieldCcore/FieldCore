// Startup check — visible in Railway/server logs when process starts.
// Server geocoding uses ONLY GOOGLE_MAPS_SERVER_KEY. No browser-key fallback.
(function () {
  const sk = (process.env.GOOGLE_MAPS_SERVER_KEY || '').trim();
  const fingerprint = sk.length >= 8 ? `${sk.slice(0, 6)}…${sk.slice(-4)}` : sk ? '(short)' : null;
  console.log('[Geocode] startup check', {
    googleMapsServerKeyPresent:     !!sk,
    googleMapsServerKeyLength:      sk.length,
    googleMapsServerKeyFingerprint: fingerprint,
    browserKeyFallbackEnabled:      false,
  });
  if (!sk) {
    console.error('[Geocode] GOOGLE_MAPS_SERVER_KEY is absent — geocoding disabled until this variable is set in Railway (Application restrictions: None, API restrictions: Geocoding API, Places API (New))');
  }
}());

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
 * Uses GOOGLE_MAPS_SERVER_KEY exclusively. No browser-key fallback.
 * Reads the env var on each call so the test suite can control it via process.env.
 *
 * Returns on success:
 *   { lat, lng, formatted_address, place_id, geocode_provider_status: 'OK' }
 *
 * Returns on failure:
 *   { error: true, geocode_provider_status, geocode_error }
 *
 * Never throws. Never logs the full key value.
 */
async function geocodeAddress(address) {
  const key = (process.env.GOOGLE_MAPS_SERVER_KEY || '').trim();

  if (!key) {
    const reason =
      'GOOGLE_MAPS_SERVER_KEY is not configured. ' +
      'Set this variable in Railway for the backend service (production environment). ' +
      'The key must have Application restrictions: None and API restrictions: Geocoding API. ' +
      'Browser-key fallback is intentionally disabled — server geocoding never falls back to GOOGLE_MAPS_API_KEY.';
    console.error('[Geocode] configuration error', {
      geocode_provider_status: 'NO_API_KEY',
      geocode_error: reason,
    });
    return { error: true, geocode_provider_status: 'NO_API_KEY', geocode_error: reason };
  }

  const trimmed = (address || '').trim();
  if (!trimmed) {
    return { error: true, geocode_provider_status: 'INVALID_REQUEST', geocode_error: 'Address is empty.' };
  }

  const fingerprint = key.length >= 8 ? `${key.slice(0, 6)}…${key.slice(-4)}` : '(short)';
  console.log('[Geocode] request', {
    keySource:      'GOOGLE_MAPS_SERVER_KEY',
    keyFingerprint: fingerprint,
    address:        trimmed,
  });

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
      console.log('[Geocode] success', { lat: loc.lat, lng: loc.lng, formatted_address, place_id });
      return { lat: loc.lat, lng: loc.lng, formatted_address, place_id, geocode_provider_status: 'OK' };
    }

    const providerStatus = body.status || 'UNKNOWN_ERROR';
    let geocode_error;
    if (providerStatus === 'ZERO_RESULTS') {
      geocode_error = 'We could not find this address. Check the street, city, and state.';
    } else if (providerStatus === 'REQUEST_DENIED') {
      const detail = body.error_message ||
        'Geocoding API is not enabled or the key has Application restrictions. ' +
        'Ensure GOOGLE_MAPS_SERVER_KEY has Application restrictions: None in Google Cloud Console.';
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
    console.error('[Geocode] network error', { geocode_provider_status: 'FETCH_ERROR', geocode_error });
    return { error: true, geocode_provider_status: 'FETCH_ERROR', geocode_error };
  }
}

module.exports = { geocodeAddress, buildGeocodableAddress };
