require('dotenv').config();

const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'];
const missing  = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`[startup] Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const app       = require('./src/app');
const scheduler = require('./src/services/scheduler');
const { runMigrations } = require('./src/db/migrate');
const { geocodeAddress } = require('./src/services/geocode');

const PORT = process.env.PORT || 3000;

// Validate QuickBooks env vars at startup — booleans only, never logs secret values.
function validateQuickBooksConfig() {
  const hasId     = !!(process.env.QUICKBOOKS_CLIENT_ID     || '').trim();
  const hasSecret = !!(process.env.QUICKBOOKS_CLIENT_SECRET || '').trim();
  const hasUri    = !!(process.env.QUICKBOOKS_REDIRECT_URI  || '').trim();
  const qbEnv     = (process.env.QUICKBOOKS_ENVIRONMENT || '').trim() || null;

  if (hasId && hasSecret) {
    console.log(`[startup] QuickBooks configured: clientId=yes secret=yes redirectUri=${hasUri} environment=${qbEnv || 'not set'}`);
  } else {
    console.error(
      `[startup] QuickBooks NOT fully configured: clientId=${hasId} secret=${hasSecret} redirectUri=${hasUri} environment=${qbEnv || 'not set'}. ` +
      'Accounting integration will show "Coming Soon". ' +
      'Set QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET on the Railway BACKEND service (not Postgres).'
    );
  }
}

// Validate Maps key presence at startup — logs actionable messages, never crashes.
function validateMapsConfig() {
  const sk = (process.env.GOOGLE_MAPS_SERVER_KEY || '').trim();
  const bk = (process.env.GOOGLE_MAPS_API_KEY    || '').trim();

  if (!sk) {
    console.error(
      '[startup] GOOGLE_MAPS_SERVER_KEY is not set — server-side geocoding is disabled. ' +
      'Add this variable to the Railway backend service (production environment). ' +
      'The key must have Application restrictions: None and API restrictions: Geocoding API.'
    );
  } else {
    const fp = `${sk.slice(0, 6)}…${sk.slice(-4)}`;
    console.log(`[startup] GOOGLE_MAPS_SERVER_KEY present (len=${sk.length}, fingerprint=${fp})`);
  }

  if (!bk) {
    console.error(
      '[startup] GOOGLE_MAPS_API_KEY is not set — Places autocomplete and map routing will not work. ' +
      'Add GOOGLE_MAPS_API_KEY to Railway (backend proxy) and VITE_GOOGLE_MAPS_API_KEY to Vercel (browser bundle).'
    );
  } else {
    const fp = `${bk.slice(0, 6)}…${bk.slice(-4)}`;
    console.log(`[startup] GOOGLE_MAPS_API_KEY present (len=${bk.length}, fingerprint=${fp})`);
  }
}

// Startup geocoding probe — runs after server is up, never blocks or crashes.
// Tests the server key against a known address and logs a human-readable result.
async function probeGeocoding() {
  const TEST_ADDRESS = '305 Lincoln Court, Deerfield Beach, FL';
  try {
    const result = await geocodeAddress(TEST_ADDRESS);
    if (!result.error) {
      console.log('[startup] ✓ Google Geocoding operational.');
      return;
    }
    const status = result.geocode_provider_status;
    if (status === 'REQUEST_DENIED') {
      console.error('[startup] Geocoding probe: Server key permissions are incorrect. Remove Application restrictions (HTTP referrers / Websites) from GOOGLE_MAPS_SERVER_KEY in Google Cloud Console.');
    } else if (status === 'OVER_QUERY_LIMIT') {
      console.error('[startup] Geocoding probe: Quota exceeded.');
    } else if (status === 'NO_API_KEY' || status === 'INVALID_REQUEST') {
      console.error('[startup] Geocoding probe: Server key missing.');
    } else {
      console.error(`[startup] Geocoding probe: ${status} — ${result.geocode_error || 'unknown error'}`);
    }
  } catch (err) {
    console.error('[startup] Geocoding probe threw unexpectedly:', err.message);
  }
}

function validatePlaidConfig() {
  const clientId = (process.env.PLAID_CLIENT_ID || '').trim();
  const secret   = (process.env.PLAID_SECRET    || '').trim();
  const env      = (process.env.PLAID_ENV        || '').trim();

  if (clientId && secret && env) {
    console.log(`[startup] Plaid configured: env=${env}`);
  } else {
    console.warn(
      `[startup] Plaid NOT fully configured: clientId=${!!clientId} secret=${!!secret} env=${env || 'not set'}. ` +
      'Banking integration will show Connect Bank only when configured. ' +
      'Set PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV on Railway backend.'
    );
  }
}

// Start server immediately so health checks pass during deployment
const server = app.listen(PORT, () => {
  console.log(`FieldCore API running on port ${PORT}`);
  validateQuickBooksConfig();
  validateMapsConfig();
  validatePlaidConfig();
  scheduler.startReminderJob();
  // Non-blocking post-startup tasks
  runMigrations().catch(err => console.error('[DB] runMigrations error:', err.message));
  probeGeocoding();
});

function shutdown(signal) {
  console.log(`[${signal}] Graceful shutdown…`);
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Shutdown timed out — forcing exit.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
