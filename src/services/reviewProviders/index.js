/**
 * Review Provider Registry
 *
 * Each provider must implement the ReviewProvider interface (see base.js).
 * Only enabled providers from the review_providers table are surfaced to tenants.
 *
 * To add a new provider (Yelp, Facebook, etc.):
 *   1. Create src/services/reviewProviders/<key>.js extending ReviewProvider
 *   2. Register it in PROVIDERS below
 *   3. INSERT a row into review_providers with provider_key = '<key>'
 */

const ReviewProvider = require('./base');
const GoogleProvider = require('./google');

const PROVIDERS = new Map([
  ['google', new GoogleProvider()],
]);

function getProvider(key) {
  const p = PROVIDERS.get(key);
  if (!p) throw new Error(`Unknown review provider: ${key}`);
  return p;
}

function listProviders() {
  return [...PROVIDERS.values()];
}

module.exports = { getProvider, listProviders, ReviewProvider };
