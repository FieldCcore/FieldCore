const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');

// GET /api/maps/autocomplete?input=...
// Server-side Places Autocomplete proxy using Places API (New).
// Returns { predictions: [{description, place_id, structured_formatting}] }
router.get('/autocomplete', requireAuth, async (req, res) => {
  const { input } = req.query;
  if (!input?.trim() || input.trim().length < 3) return res.json({ predictions: [] });

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    console.warn('[maps/autocomplete] GOOGLE_MAPS_API_KEY not set — returning empty predictions');
    return res.json({ predictions: [] });
  }

  try {
    const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type':     'application/json',
        'X-Goog-Api-Key':   key,
        'X-Goog-FieldMask': 'suggestions.placePrediction.text,suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat',
      },
      body: JSON.stringify({
        input:                input.trim(),
        includedPrimaryTypes: ['address'],
        includedRegionCodes:  ['US'],
      }),
    });

    const body = await r.json();

    if (body.error) {
      console.error('[maps/autocomplete] error:', body.error.status, body.error.message || '');
      return res.json({ predictions: [] });
    }

    // Map Places API (New) shape → legacy shape expected by the frontend
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
// Server-side geocoding proxy — keeps the API key off the client.
router.get('/geocode', requireAuth, async (req, res) => {
  const { address } = req.query;
  if (!address?.trim()) return res.status(400).json({ error: 'address is required' });

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.status(503).json({ error: 'Maps not configured' });

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address);
    url.searchParams.set('key', key);

    const r    = await fetch(url.toString());
    const body = await r.json();

    if (body.status !== 'OK') {
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
// Response: { distance: { meters, miles }, duration: { seconds, minutes, text }, polyline }
router.post('/route', requireAuth, async (req, res) => {
  const { origin, destination, mode = 'DRIVE' } = req.body;

  if (!origin || !destination) {
    return res.status(400).json({ error: 'origin and destination are required' });
  }

  const key = process.env.GOOGLE_MAPS_API_KEY;
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

function formatDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.ceil((sec % 3600) / 60);
  return h > 0 ? `${h} hr ${m} min` : `${m} min`;
}

module.exports = router;
