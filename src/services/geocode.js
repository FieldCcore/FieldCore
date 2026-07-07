// Server-side geocoding via Google Geocoding API.
// Returns { lat, lng, formatted_address } on success, null on failure.
// Never throws — all errors are caught and logged.
async function geocodeAddress(address) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    console.error('[geocode] GOOGLE_MAPS_API_KEY is not set — cannot geocode:', address);
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
      const loc = body.results[0].geometry.location;
      console.log('[geocode] OK:', address, '→', loc.lat, loc.lng);
      return { lat: loc.lat, lng: loc.lng, formatted_address: body.results[0].formatted_address };
    }

    console.warn('[geocode] status:', body.status, 'for:', address);
    return null;
  } catch (err) {
    console.error('[geocode] fetch error:', err.message, 'for:', address);
    return null;
  }
}

module.exports = { geocodeAddress };
