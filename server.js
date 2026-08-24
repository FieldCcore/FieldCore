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
  const plaidClientId = process.env.PLAID_CLIENT_ID;
  const plaidSecret   = process.env.PLAID_SECRET;
  const plaidEnv      = process.env.PLAID_ENV;

  console.log('[PLAID ENV RUNTIME]', {
    clientIdExists: typeof plaidClientId === 'string' && plaidClientId.trim().length > 0,
    clientIdLength: plaidClientId?.length ?? 0,
    secretExists:   typeof plaidSecret === 'string' && plaidSecret.trim().length > 0,
    secretLength:   plaidSecret?.length ?? 0,
    envExists:      typeof plaidEnv === 'string' && plaidEnv.trim().length > 0,
    envValue:       plaidEnv || null,
  });
}

async function probePlaidRuntime() {
  const { getPlaidConfig } = require('./src/services/plaidConfig');
  const cfg = getPlaidConfig();

  if (!cfg.configured) {
    console.warn('[PLAID RUNTIME TEST] NOT RUN — runtime config reports configured=false');
    return;
  }

  try {
    const { plaidBankingAdapter } = require('./src/services/plaidBankingAdapter');
    await plaidBankingAdapter.createLinkToken({
      userId:    'fieldcore-runtime-diagnostic',
      accountId: 'fieldcore-runtime-diagnostic',
      webhookUrl: undefined,
    });
    console.log('[PLAID RUNTIME TEST] SUCCESS — link token created with runtime credentials');
  } catch (err) {
    const body = err?.response?.data || {};
    console.error('[PLAID RUNTIME TEST] FAILED', {
      error_type:    body.error_type    || null,
      error_code:    body.error_code    || null,
      error_message: body.error_message || err.message || null,
    });
  }
}

// Run migrations before accepting any requests — eliminates schema-not-ready race condition.
// Railway health check has a generous timeout; migrations complete in < 10 seconds.
runMigrations()
  .catch(err => console.error('[DB] runMigrations error:', err.message))
  .finally(() => {
    const server = app.listen(PORT, () => {
      console.log(`FieldCore API running on port ${PORT}`);
      validateQuickBooksConfig();
      validateMapsConfig();
      validatePlaidConfig();
      scheduler.startReminderJob();
      // Non-blocking post-startup tasks
      require('./src/services/bankingSyncService').recoverStaleSyncingConnections()
        .catch(err => console.error('[DB] recoverStaleSyncingConnections error:', err.message));
      probeGeocoding();
      probePlaidRuntime().catch(err => console.error('[PLAID RUNTIME TEST] probe threw:', err.message));
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
  });

