'use strict';

// Canonical QuickBooks server-side configuration.
// ALL other modules must read QB config from here — never directly from process.env.
// Returns booleans and a validated environment string only.
// Internal clientId/clientSecret/redirectUri fields are for server-side use only;
// they must NEVER be included in any API response sent to the frontend.

function getQBConfig() {
  const clientId     = (process.env.QUICKBOOKS_CLIENT_ID     || '').trim();
  const clientSecret = (process.env.QUICKBOOKS_CLIENT_SECRET || '').trim();
  const redirectUri  = (process.env.QUICKBOOKS_REDIRECT_URI  || '').trim();
  const rawEnv       = (process.env.QUICKBOOKS_ENVIRONMENT   || '').trim();
  const environment  = ['sandbox', 'production'].includes(rawEnv) ? rawEnv : null;

  const hasClientId     = !!clientId;
  const hasClientSecret = !!clientSecret;
  const hasRedirectUri  = !!redirectUri;
  const configured      = hasClientId && hasClientSecret && hasRedirectUri && !!environment;

  return {
    // Safe — expose in API responses
    configured,
    hasClientId,
    hasClientSecret,
    hasRedirectUri,
    environment,
    // Internal — server-side only, never send to frontend
    clientId,
    clientSecret,
    redirectUri,
  };
}

module.exports = { getQBConfig };
