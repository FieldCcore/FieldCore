'use strict';

// Canonical Plaid server-side configuration.
// ALL other modules must read Plaid config from here — never directly from process.env.
// clientId and secret are for server-side use only — never send to frontend.

const ALLOWED_ENVS = ['sandbox', 'development', 'production'];

function getPlaidConfig() {
  const clientId = (process.env.PLAID_CLIENT_ID || '').trim();
  const secret   = (process.env.PLAID_SECRET    || '').trim();
  const rawEnv   = (process.env.PLAID_ENV        || '').trim().toLowerCase();
  const environment = ALLOWED_ENVS.includes(rawEnv) ? rawEnv : null;

  const configured = !!(clientId && secret && environment);

  return {
    // Safe — can be included in API status responses
    configured,
    environment,
    // Internal — server-side only, NEVER send to frontend
    clientId,
    secret,
  };
}

// Returns only safe fields for API responses
function getPlaidStatusSafe() {
  const cfg = getPlaidConfig();
  return {
    provider:     'plaid',
    configured:   cfg.configured,
    environment:  cfg.environment,
  };
}

module.exports = { getPlaidConfig, getPlaidStatusSafe };
