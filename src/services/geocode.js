// Startup check — visible in Railway/server logs when process starts.
console.log('[Geocode] startup check', { GOOGLE_MAPS_API_KEY_set: !!process.env.GOOGLE_MAPS_API_KEY });

// Server-side geocoding via Google Geocoding API.
// Returns { lat, lng, formatted_address } on success, null on failure.
// Never throws — all errors are caught and logged. Never prints the API key.
async function geocodeAddress(address) {
  const key = process.env.GOOGLE_MAPS_API_KEY;

  console.log('[Geocode] request', { hasKey: !!key, address });

  if (!key) {
    console.error('[Geocode] failed', {
      status: 'NO_API_KEY',
      error_message: 'GOOGLE_MAPS_API_KEY is missing. Address could not be mapped.',
    });
    return null;
  }
  if (!address?.trim()) return null;

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address.trim());
    url.searchParams.set('key', key);

    const res  = await fetch(url.toString());
    const body = await res.json();

    if (body.status === 'OK' && body.results?.[0]) {
      const loc               = body.results[0].geometry.location;
      const formatted_address = body.results[0].formatted_address;
      console.log('[Geocode] result', { found: true, lat: loc.lat, lng: loc.lng, formatted_address });
      return { lat: loc.lat, lng: loc.lng, formatted_address };
    }

    console.error('[Geocode] failed', {
      status: body.status,
      error_message: body.error_message || null,
    });
    return null;
  } catch (err) {
    console.error('[Geocode] failed', { status: 'FETCH_ERROR', error_message: err.message });
    return null;
  }
}

module.exports = { geocodeAddress };
