'use strict';

/**
 * Authority Extraction — Anthropic Provider Adapter
 *
 * Calls the Anthropic Messages API with PDF document beta support to extract
 * structured data from authority instrument documents.
 *
 * SAFETY GATES:
 *   1. Refuses to run unless AUTHORITY_EXTRACTION_REAL_PROVIDER_ENABLED=true
 *   2. Requires ANTHROPIC_API_KEY to be set
 *   3. This module is NEVER imported by automated tests — the fake provider
 *      is used unconditionally during the test suite.
 *
 * Implementation notes (SDK version 0.30.1):
 *   - PDF documents passed as inline base64 using the GA document content block
 *     (type: "document", source.media_type: "application/pdf"); no beta header required
 *   - Structured output via tool_choice: { type: "tool" } — the model is forced
 *     to call the named tool, giving us a validated JSON response body
 *   - Timeout set to 60 s via AbortSignal; the worker enforces its own timeout
 *     on top of this at the job level
 */

const {
  ProviderTimeoutError,
  ProviderRateLimitError,
  ProviderError,
  MalformedOutputError,
} = require('./authorityFakeProvider');

if (process.env.AUTHORITY_EXTRACTION_REAL_PROVIDER_ENABLED !== 'true') {
  throw new Error(
    '[authorityAnthropicProvider] REFUSED: set AUTHORITY_EXTRACTION_REAL_PROVIDER_ENABLED=true to use this provider.',
  );
}

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error(
    '[authorityAnthropicProvider] ANTHROPIC_API_KEY is required when using the Anthropic provider.',
  );
}

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic.default({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── Tool schema ──────────────────────────────────────────────────────────────
// Forced via tool_choice: { type: "tool", name: "extract_authority_document" }
// so the model always calls this tool — giving us a validated JSON body.

const EXTRACTION_TOOL = {
  name: 'extract_authority_document',
  description:
    'Extract structured fields from a legal authority instrument document. ' +
    'For each field you can identify, return a candidate with the proposed value, ' +
    'your confidence (0.0–1.0), and the specific text passage(s) that support your conclusion. ' +
    'If a field is not present in the document, omit it — do not guess.',
  input_schema: {
    type: 'object',
    properties: {
      candidates: {
        type: 'array',
        description: 'One entry per identified field.',
        items: {
          type: 'object',
          properties: {
            field_key: {
              type: 'string',
              description:
                'Dot-path field identifier. Standard keys: instrument_type, effective_date, ' +
                'expiration_date, jurisdiction, principal_name, agent_name, trustee_name, ' +
                'guardian_name, beneficiary_name, grantor_name. ' +
                'Permission keys: granted_action.<ACTION_KEY>. ' +
                'Restriction keys: restriction.<RESTRICTION_TYPE>.',
            },
            proposed_value: {
              type: ['string', 'null'],
              description:
                'Extracted value as a string. Use ISO-8601 for dates. ' +
                'Null if the field is explicitly absent (not just unclear).',
            },
            confidence: {
              type: 'number',
              description: 'Confidence in the extraction, from 0.0 (uncertain) to 1.0 (certain).',
            },
            evidence: {
              type: 'array',
              description: 'Source passages from the document that support this candidate.',
              items: {
                type: 'object',
                properties: {
                  page_numbers: {
                    type: 'array',
                    items: { type: 'integer' },
                    description: 'Page number(s) where the passage appears (1-indexed).',
                  },
                  excerpt: {
                    type: 'string',
                    description:
                      'Verbatim or near-verbatim excerpt from the document. Max 500 characters.',
                  },
                },
                required: ['page_numbers', 'excerpt'],
              },
            },
          },
          required: ['field_key', 'proposed_value', 'confidence', 'evidence'],
        },
      },
    },
    required: ['candidates'],
  },
};

const SYSTEM_PROMPT =
  'You are a legal document extraction specialist. ' +
  'Your task is to identify key fields in authority instrument documents such as ' +
  'powers of attorney, letters of authorization, trusts, and guardianship orders. ' +
  'Extract only information that is clearly stated in the document. ' +
  'Do not infer or hallucinate values. ' +
  'For each field, cite the exact passage that supports your extraction. ' +
  'Use ISO-8601 format (YYYY-MM-DD) for all dates.';

const USER_PROMPT =
  'Please extract all authority instrument fields from the attached document. ' +
  'For each field you identify, include the supporting text passage(s) and your confidence level.';

const PROVIDER_TIMEOUT_MS = 60_000;

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * extract(documentBuffer, documentId)
 *
 * @param {Buffer} documentBuffer  — raw PDF bytes
 * @param {string} documentId      — UUID of the authority_documents row (attached to evidence)
 * @returns {Promise<{candidates: Array}>}
 */
async function extract(documentBuffer, documentId) {
  if (!Buffer.isBuffer(documentBuffer)) {
    throw new TypeError('[authorityAnthropicProvider] documentBuffer must be a Buffer');
  }

  const base64Pdf = documentBuffer.toString('base64');
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  let response;
  try {
    response = await client.messages.create(
      {
        model: 'claude-opus-4-5',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: 'tool', name: 'extract_authority_document' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64Pdf,
                },
              },
              {
                type: 'text',
                text: USER_PROMPT,
              },
            ],
          },
        ],
      },
      { signal: controller.signal },
    );
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new ProviderTimeoutError();
    if (err.status === 429)        throw new ProviderRateLimitError();
    if (err.status >= 500)         throw new ProviderError(err.status);
    // Connection errors (no status)
    const msg = err.message || '';
    if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) throw new ProviderTimeoutError();
    throw new ProviderError(err.status || 0);
  } finally {
    clearTimeout(timeout);
  }

  // Find the tool_use block
  const toolUseBlock = response.content.find(b => b.type === 'tool_use');
  if (!toolUseBlock || toolUseBlock.name !== 'extract_authority_document') {
    throw new MalformedOutputError();
  }

  const input = toolUseBlock.input;
  if (!input || !Array.isArray(input.candidates)) {
    throw new MalformedOutputError();
  }

  // Normalize provider response to our internal shape (attach documentId to evidence)
  const candidates = input.candidates.map(c => ({
    fieldKey:      c.field_key,
    proposedValue: c.proposed_value ?? null,
    confidence:    typeof c.confidence === 'number' ? c.confidence : 0,
    evidence: (c.evidence || []).map(e => ({
      documentId,
      pageNumbers: Array.isArray(e.page_numbers) ? e.page_numbers : [],
      excerpt:     typeof e.excerpt === 'string' ? e.excerpt.slice(0, 500) : '',
    })),
  }));

  return { candidates };
}

module.exports.extract = extract;
