require('dotenv').config();

const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'];
const missing  = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`[startup] Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

// ENCRYPTION_KEY guard — must be a 64-char hex string (32 bytes) in production.
// In dev/test a warning is emitted and the zero-key fallback is used (never for production data).
if (process.env.NODE_ENV === 'production') {
  const encKey = process.env.ENCRYPTION_KEY || '';
  if (!encKey) {
    console.error('[startup] CRITICAL: ENCRYPTION_KEY is not set. Cannot start in production without a secure encryption key. Set ENCRYPTION_KEY to a 64-character hex string in Railway.');
    process.exit(1);
  }
  if (encKey.length !== 64 || !/^[0-9a-fA-F]+$/.test(encKey)) {
    console.error('[startup] CRITICAL: ENCRYPTION_KEY must be a 64-character hexadecimal string (32 bytes). Current value has invalid format.');
    process.exit(1);
  }
  if (encKey === '0'.repeat(64)) {
    console.error('[startup] CRITICAL: ENCRYPTION_KEY is the all-zeros placeholder. Replace with a cryptographically random value before accepting real data.');
    process.exit(1);
  }
} else if (!process.env.ENCRYPTION_KEY) {
  console.warn('[startup] ⚠  ENCRYPTION_KEY is not set. Using zero-key fallback — acceptable only in dev/test. Never run production without this key.');
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

// Storage configuration check — warns if R2 is not configured.
// Photo uploads and future authority document uploads require R2.
// Local disk uploads are ephemeral on Railway and will be lost on redeploy.
function validateStorageConfig() {
  const hasKey    = !!(process.env.R2_ACCESS_KEY_ID || '').trim();
  const hasSecret = !!(process.env.R2_SECRET_ACCESS_KEY || '').trim();
  const hasBucket = !!(process.env.R2_BUCKET || '').trim();
  const hasPublic = !!(process.env.R2_PUBLIC_URL || '').trim();

  if (hasKey && hasSecret && hasBucket) {
    console.log(`[startup] ✓ R2 storage configured (bucket=${process.env.R2_BUCKET}, publicUrl=${hasPublic ? 'set' : 'NOT SET — uploaded files will not be accessible'})`);
  } else {
    const msg = '[startup] ⚠  R2 storage NOT fully configured. File uploads will be rejected at runtime. ' +
      'Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL, and R2_ENDPOINT in Railway.';
    if (process.env.NODE_ENV === 'production') {
      console.error(msg);
    } else {
      console.warn(msg);
    }
  }
}

// Listen for audit write failures — these are security-relevant events.
// In a future phase, this hook will trigger alerting/paging.
process.on('auditFailure', ({ error, failureCount }) => {
  console.error(`[ALERT] Audit write failure #${failureCount}: ${error}. Investigate immediately — audit gaps may have compliance implications.`);
});

// Authority feature flag and required configuration checks.
// When AUTHORITY_ENABLED=true in production: AUTHORITY_DATA_ENCRYPTION_KEY and
// R2_AUTHORITY_BUCKET must be valid — server refuses to start if they are not.
// In dev/test: warns and Authority operations fail closed (they never fall back to
// the general key or the legacy bucket).
function validateAuthorityConfig() {
  if (process.env.AUTHORITY_ENABLED !== 'true') {
    console.log('[startup] Authority feature: DISABLED (set AUTHORITY_ENABLED=true to enable).');
    return;
  }

  const { validateKeyConfig } = require('./src/services/authorityCrypto');
  const keyResult = validateKeyConfig();

  const hasBucket = !!(process.env.R2_AUTHORITY_BUCKET || '').trim();
  const hasKey    = !!(process.env.R2_AUTHORITY_ACCESS_KEY_ID || '').trim();
  const hasSecret = !!(process.env.R2_AUTHORITY_SECRET_ACCESS_KEY || '').trim();
  const storageOk = hasBucket && hasKey && hasSecret;

  if (process.env.NODE_ENV === 'production') {
    if (!keyResult.valid) {
      console.error(
        `[startup] CRITICAL: AUTHORITY_ENABLED=true but AUTHORITY_DATA_ENCRYPTION_KEY is invalid (${keyResult.reason}). ` +
        'Refusing to start — live institutional data cannot be processed without a valid Authority encryption key.'
      );
      process.exit(1);
    }
    if (!storageOk) {
      console.error(
        '[startup] CRITICAL: AUTHORITY_ENABLED=true but Authority storage is not configured. ' +
        'Set R2_AUTHORITY_ACCESS_KEY_ID, R2_AUTHORITY_SECRET_ACCESS_KEY, and R2_AUTHORITY_BUCKET. ' +
        'Refusing to start.'
      );
      process.exit(1);
    }
    console.log(`[startup] ✓ Authority feature ENABLED (bucket=${process.env.R2_AUTHORITY_BUCKET}).`);
  } else {
    if (!keyResult.valid) {
      console.warn(
        `[startup] ⚠  AUTHORITY_ENABLED=true but AUTHORITY_DATA_ENCRYPTION_KEY is invalid (${keyResult.reason}). ` +
        'Authority encryption operations will fail closed — never falling back to ENCRYPTION_KEY.'
      );
    }
    if (!storageOk) {
      console.warn(
        '[startup] ⚠  AUTHORITY_ENABLED=true but Authority storage is not fully configured. ' +
        'Document uploads will fail closed — never falling back to the legacy bucket.'
      );
    }
    if (keyResult.valid && storageOk) {
      console.log('[startup] ✓ Authority feature ENABLED (dev/test mode).');
    }
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
      validateStorageConfig();
      validateAuthorityConfig();
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

