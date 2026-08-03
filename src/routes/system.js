const router = require('express').Router();

// GET /api/system/maps-status
// Development-only — returns Maps key configuration status without exposing key values.
// Returns 404 in production so the endpoint is invisible to external scanners.
router.get('/maps-status', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).end();
  }

  const serverKey  = (process.env.GOOGLE_MAPS_SERVER_KEY || '').trim();
  const browserKey = (process.env.GOOGLE_MAPS_API_KEY    || '').trim();

  res.json({
    browserKeyPresent: !!browserKey,
    serverKeyPresent:  !!serverKey,
    geocodingEnabled:  !!serverKey,
    mapsJsConfigured:  !!browserKey,
  });
});

module.exports = router;
