const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { geocodeAddress } = require('../services/geocode');

// All server-side Google Maps API calls use GOOGLE_MAPS_SERVER_KEY exclusively.
// Required API restrictions on that key: Geocoding API, Places API (New), Routes API.
// GOOGLE_MAPS_API_KEY is not used by any server-side route.
// VITE_GOOGLE_MAPS_API_KEY is the browser-only key for the Maps JavaScript loader — never read here.

function getServerKey() {
  return (process.env.GOOGLE_MAPS_SERVER_KEY || '').trim();
}

// GET /api/maps/autocomplete?input=...
// Server-side Places Autocomplete proxy using Places API (New).
// Returns { predictions: [{description, place_id, structured_formatting}] }
// In development, also returns _error code when the key is missing or Google returns an error.
router.get('/autocomplete', requireAuth, async (req, res) => {
  const { input } = req.query;
  if (!input?.trim() || input.trim().length < 3)  return res.json({ predictions: [] });
  if (input.trim().length > 200)                   return res.json({ predictions: [] });

  const key = getServerKey();
  if (!key) {
    console.warn('[maps/autocomplete] GOOGLE_MAPS_SERVER_KEY not set — returning empty predictions');
    const extra = process.env.NODE_ENV !== 'production' ? { _error: 'PLACES_KEY_MISSING' } : {};
    return res.json({ predictions: [], ...extra });
  }

  try {
    const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type':     'application/json',
        'X-Goog-Api-Key':   key,
        'X-Goog-FieldMask': 'suggestions.placePrediction.text,suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat',
      },
      body: JSON.stringify({ input: input.trim() }),
    });

    const body = await r.json();

    if (body.error) {
      const status = body.error.status || 'UNKNOWN';
      console.error('[maps/autocomplete] provider error:', status, body.error.message || '');
      const errCodeMap = {
        PERMISSION_DENIED:  'PLACES_REQUEST_DENIED',
        API_NOT_ENABLED:    'PLACES_API_NOT_ENABLED',
        RESOURCE_EXHAUSTED: 'PLACES_QUOTA_EXCEEDED',
      };
      const extra = process.env.NODE_ENV !== 'production'
        ? { _error: errCodeMap[status] || 'PLACES_REQUEST_DENIED' }
        : {};
      return res.json({ predictions: [], ...extra });
    }

    const predictions = (body.suggestions || []).map(s => {
      const p = s.placePrediction;
      return {
        description:           p.text?.text || '',
        place_id:              p.placeId    || '',
        structured_formatting: {
          main_text:      p.structuredFormat?.mainText?.text      || p.text?.text || '',
          secondary_text: p.structuredFormat?.secondaryText?.text || '',
        },
      };
    });

    res.json({ predictions });
  } catch (err) {
    console.error('[maps/autocomplete]', err.message);
    res.json({ predictions: [] });
  }
});

// GET /api/maps/geocode?address=...
// Server-side geocoding proxy — keeps GOOGLE_MAPS_SERVER_KEY off the client.
router.get('/geocode', requireAuth, async (req, res) => {
  const { address } = req.query;
  if (!address?.trim()) return res.status(400).json({ error: 'address is required' });

  const key = getServerKey();
  if (!key) return res.status(503).json({ error: 'Maps not configured' });

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address);
    url.searchParams.set('key', key);

    const r    = await fetch(url.toString());
    const body = await r.json();

    if (body.status !== 'OK') {
      console.error('[maps/geocode] failed:', body.status, body.error_message || '');
      return res.status(422).json({ error: `Geocode failed: ${body.status}` });
    }

    const result = body.results[0];
    res.json({
      lat:               result.geometry.location.lat,
      lng:               result.geometry.location.lng,
      formatted_address: result.formatted_address,
    });
  } catch (err) {
    console.error('[maps/geocode]', err.message);
    res.status(500).json({ error: 'Geocoding request failed' });
  }
});

// POST /api/maps/route
// Body: { origin, destination, mode }
//   origin / destination: { address: string } | { lat: number, lng: number }
//   mode: 'DRIVE' | 'WALK' | 'BICYCLE' | 'TRANSIT'  (default: 'DRIVE')
router.post('/route', requireAuth, async (req, res) => {
  const { origin, destination, mode = 'DRIVE' } = req.body;

  if (!origin || !destination) {
    return res.status(400).json({ error: 'origin and destination are required' });
  }

  const key = getServerKey();
  if (!key) return res.status(503).json({ error: 'Maps not configured' });

  function toWaypoint(loc) {
    if (loc.address) return { address: loc.address };
    return { location: { latLng: { latitude: Number(loc.lat), longitude: Number(loc.lng) } } };
  }

  const payload = {
    origin:      toWaypoint(origin),
    destination: toWaypoint(destination),
    travelMode:  mode,
    ...(mode === 'DRIVE' ? { routingPreference: 'TRAFFIC_AWARE' } : {}),
    computeAlternativeRoutes: false,
    languageCode: 'en-US',
    units: 'IMPERIAL',
  };

  try {
    const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'X-Goog-Api-Key':    key,
        'X-Goog-FieldMask':  'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify(payload),
    });

    const body = await r.json();

    if (!body.routes?.length) {
      return res.status(422).json({ error: 'No route found' });
    }

    const route       = body.routes[0];
    const distMeters  = route.distanceMeters || 0;
    const durationSec = parseInt((route.duration || '0s').replace('s', ''), 10);

    res.json({
      distance: {
        meters: distMeters,
        miles:  Math.round(distMeters * 0.000621371 * 10) / 10,
      },
      duration: {
        seconds: durationSec,
        minutes: Math.round(durationSec / 60),
        text:    formatDuration(durationSec),
      },
      polyline: route.polyline?.encodedPolyline || null,
    });
  } catch (err) {
    console.error('[maps/route]', err.message);
    res.status(500).json({ error: 'Routing request failed' });
  }
});

// GET /api/maps/place-details?placeId=...
// Returns full address components and coordinates for a given Place ID.
// Uses GOOGLE_MAPS_SERVER_KEY (server-side proxy — key never exposed to the browser).
router.get('/place-details', requireAuth, async (req, res) => {
  const { placeId } = req.query;
  if (!placeId?.trim()) return res.status(400).json({ error: 'placeId is required' });

  const key = getServerKey();
  if (!key) return res.status(503).json({ error: 'Maps not configured' });

  try {
    const r = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId.trim())}`,
      {
        headers: {
          'X-Goog-Api-Key':   key,
          'X-Goog-FieldMask': 'id,formattedAddress,addressComponents,location',
        },
      },
    );

    const body = await r.json();

    if (body.error) {
      console.error('[maps/place-details] error:', body.error.status, body.error.message || '');
      return res.status(422).json({ error: body.error.message || 'Place lookup failed' });
    }

    const comps = body.addressComponents || [];
    const get   = (type, short = false) => {
      const c = comps.find(c => c.types?.includes(type));
      return (short ? c?.shortText : c?.longText) || '';
    };

    const streetNumber = get('street_number', true);
    const route        = get('route', false);
    const addressLine1 = [streetNumber, route].filter(Boolean).join(' ');
    const city         = get('locality', false)
                      || get('sublocality_level_1', false)
                      || get('administrative_area_level_2', false);
    const region       = get('administrative_area_level_1', true);
    const postalCode   = get('postal_code', true);
    const country      = get('country', false);
    const countryCode  = get('country', true);

    res.json({
      placeId:          body.id || placeId.trim(),
      formattedAddress: body.formattedAddress || '',
      addressLine1,
      addressLine2:     '',
      city,
      region,
      postalCode,
      country,
      countryCode,
      latitude:         body.location?.latitude  ?? null,
      longitude:        body.location?.longitude ?? null,
    });
  } catch (err) {
    console.error('[maps/place-details]', err.message);
    res.status(500).json({ error: 'Place details request failed' });
  }
});

// POST /api/maps/geocode-diagnostic
// Owner-only diagnostic — verifies the server key and service configuration.
router.post('/geocode-diagnostic', requireAuth, requireRole('owner'), async (req, res) => {
  const sk = (process.env.GOOGLE_MAPS_SERVER_KEY || '').trim();

  const keyInfo = {
    googleMapsServerKeyPresent:   !!sk,
    googleMapsServerKeyLength:    sk.length,
    googleMapsServerKeyFirst6:    sk.slice(0, 6)  || null,
    googleMapsServerKeyLast4:     sk.slice(-4)    || null,
    placesServiceConfigured:      !!sk,
    geocodingServiceConfigured:   !!sk,
  };

  const testAddress = (req.body?.address || '305 Lincoln Court, Deerfield Beach, FL, United States').trim();
  const geo = await geocodeAddress(testAddress);

  console.log('[maps/geocode-diagnostic]', {
    serverKeyPresent:     keyInfo.googleMapsServerKeyPresent,
    providerStatus:       geo.geocode_provider_status || (geo.error ? 'ERROR' : 'OK'),
    hasCoordinates:       geo.lat != null && geo.lng != null,
    providerErrorMessage: geo.geocode_error || null,
  });

  res.json({
    keyInfo,
    normalizedAddress:     testAddress,
    providerStatus:        geo.geocode_provider_status || (geo.error ? 'ERROR' : 'OK'),
    providerErrorMessage:  geo.geocode_error || null,
    hasCoordinates:        geo.lat != null && geo.lng != null,
    firstFormattedAddress: geo.formatted_address || null,
    lat:                   geo.lat ?? null,
    lng:                   geo.lng ?? null,
  });
});

function formatDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.ceil((sec % 3600) / 60);
  return h > 0 ? `${h} hr ${m} min` : `${m} min`;
}

module.exports = router;
