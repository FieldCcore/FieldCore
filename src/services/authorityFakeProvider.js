'use strict';

/**
 * Authority Extraction — Deterministic Fake Provider
 *
 * Returns fixture extraction results keyed by the SHA-256 of the document buffer.
 * The last two hex chars of the hash select the fixture scenario:
 *
 *   ff → ProviderTimeoutError  (simulates 60-second timeout)
 *   fe → ProviderRateLimitError (simulates HTTP 429)
 *   fd → ProviderError 503     (simulates HTTP 5xx)
 *   fc → MalformedOutputError  (provider returns non-JSON garbage)
 *   fb → returns candidates with NO evidence items (tests missing-evidence path)
 *   all others → normal happy-path fixture
 *
 * SAFETY: this module refuses to run when NODE_ENV=production AND
 * AUTHORITY_EXTRACTION_REAL_PROVIDER_ENABLED=true, since that combination
 * means the real provider is live and fake data must not be injected.
 */

const crypto = require('crypto');

if (
  process.env.NODE_ENV === 'production' &&
  process.env.AUTHORITY_EXTRACTION_REAL_PROVIDER_ENABLED === 'true'
) {
  throw new Error(
    '[authorityFakeProvider] REFUSED: cannot use fake provider when real provider is enabled in production.',
  );
}

// ── Error types ──────────────────────────────────────────────────────────────

class ProviderTimeoutError extends Error {
  constructor() { super('Provider timed out after 60 s'); this.code = 'timeout'; }
}
class ProviderRateLimitError extends Error {
  constructor() { super('Provider returned HTTP 429 (rate limited)'); this.code = 'rate_limited'; }
}
class ProviderError extends Error {
  constructor(status) {
    super(`Provider returned HTTP ${status}`);
    this.code    = 'provider_error';
    this.status  = status;
  }
}
class MalformedOutputError extends Error {
  constructor() { super('Provider returned non-JSON output'); this.code = 'malformed_output'; }
}

module.exports.ProviderTimeoutError   = ProviderTimeoutError;
module.exports.ProviderRateLimitError = ProviderRateLimitError;
module.exports.ProviderError          = ProviderError;
module.exports.MalformedOutputError   = MalformedOutputError;

// ── Happy-path fixture ───────────────────────────────────────────────────────

function buildHappyFixture(documentId) {
  return {
    candidates: [
      {
        fieldKey:      'instrument_type',
        proposedValue: 'durable_power_of_attorney',
        confidence:    0.97,
        evidence: [
          {
            documentId,
            pageNumbers: [1],
            excerpt:
              'I, Carol Principal, hereby grant durable power of attorney to Dave Agent ' +
              'pursuant to Delaware law.',
          },
        ],
      },
      {
        fieldKey:      'effective_date',
        proposedValue: '2026-01-01',
        confidence:    0.92,
        evidence: [
          {
            documentId,
            pageNumbers: [1],
            excerpt: 'This instrument shall take effect on January 1, 2026.',
          },
        ],
      },
      {
        fieldKey:      'expiration_date',
        proposedValue: '2030-12-31',
        confidence:    0.88,
        evidence: [
          {
            documentId,
            pageNumbers: [2],
            excerpt: 'Unless sooner revoked, this power shall expire December 31, 2030.',
          },
        ],
      },
      {
        fieldKey:      'jurisdiction',
        proposedValue: 'Delaware, USA',
        confidence:    0.95,
        evidence: [
          {
            documentId,
            pageNumbers: [1],
            excerpt:
              'Executed in accordance with the laws of the State of Delaware, United States.',
          },
        ],
      },
      {
        fieldKey:      'principal_name',
        proposedValue: 'Carol Principal',
        confidence:    0.99,
        evidence: [
          {
            documentId,
            pageNumbers: [1],
            excerpt: 'I, Carol Principal, being of sound mind…',
          },
        ],
      },
      {
        fieldKey:      'agent_name',
        proposedValue: 'Dave Agent',
        confidence:    0.99,
        evidence: [
          {
            documentId,
            pageNumbers: [1],
            excerpt: '…hereby appoint Dave Agent as my attorney-in-fact.',
          },
        ],
      },
      {
        fieldKey:      'granted_action.BANKING.WIRE_TRANSFER',
        proposedValue: 'granted',
        confidence:    0.91,
        evidence: [
          {
            documentId,
            pageNumbers: [3],
            excerpt:
              'Agent is authorized to initiate wire transfers on behalf of Principal.',
          },
        ],
      },
      {
        fieldKey:      'restriction.monetary_limit',
        proposedValue: JSON.stringify({ amount: 50000000, currency: 'USD' }),
        confidence:    0.85,
        evidence: [
          {
            documentId,
            pageNumbers: [3],
            excerpt:
              'No single transaction may exceed five hundred thousand dollars ($500,000.00 USD).',
          },
        ],
      },
    ],
  };
}

// Fixture with no evidence — tests the missing-evidence toleration path
function buildNoEvidenceFixture() {
  return {
    candidates: [
      {
        fieldKey:      'instrument_type',
        proposedValue: 'letter_of_authorization',
        confidence:    0.60,
        evidence:      [],
      },
      {
        fieldKey:      'jurisdiction',
        proposedValue: 'California, USA',
        confidence:    0.55,
        evidence:      [],
      },
    ],
  };
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * extract(documentBuffer, documentId)
 *
 * @param {Buffer} documentBuffer  — raw PDF bytes
 * @param {string} documentId      — UUID of the authority_documents row
 * @returns {Promise<{candidates: Array}>}
 *
 * candidates[]:
 *   fieldKey:      string  — dot-path field identifier
 *   proposedValue: string | null  — null means "field not found"
 *   confidence:    number (0–1)
 *   evidence:      Array<{ documentId, pageNumbers: number[], excerpt: string }>
 */
async function extract(documentBuffer, documentId) {
  if (!Buffer.isBuffer(documentBuffer)) {
    throw new TypeError('[authorityFakeProvider] documentBuffer must be a Buffer');
  }

  const hash   = crypto.createHash('sha256').update(documentBuffer).digest('hex');
  const suffix = hash.slice(-2).toLowerCase();

  switch (suffix) {
    case 'ff': throw new ProviderTimeoutError();
    case 'fe': throw new ProviderRateLimitError();
    case 'fd': throw new ProviderError(503);
    case 'fc': throw new MalformedOutputError();
    case 'fb': return buildNoEvidenceFixture();
    default:   return buildHappyFixture(documentId);
  }
}

module.exports.extract = extract;
