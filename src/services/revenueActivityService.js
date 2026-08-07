'use strict';

// Structured event logger for the Revenue module.
// NEVER log amounts, tokens, credentials, or full payloads.

const VALID_EVENT_TYPES = new Set([
  'revenue.policy_updated',
  'revenue.export_requested',
  'revenue.export_completed',
  'revenue.saved_view_created',
  'revenue.saved_view_updated',
  'revenue.saved_view_deleted',
  'revenue.forecast_recalculated',
  'revenue.ledger_entry_created',
  'revenue.ledger_entry_reversed',
  'revenue.accounting_sync_started',
  'revenue.accounting_sync_completed',
  'revenue.accounting_sync_failed',
  'revenue.permission_denied',
  'revenue.invalid_period',
  'revenue.slow_query',
  'revenue.stale_cache',
]);

// Allowlist of data fields that are safe to log (no amounts, keys, or tokens)
const SAFE_DATA_FIELDS = new Set(['workspace', 'reportType', 'format', 'source', 'code']);

/**
 * Log a structured revenue activity event.
 * Only logs if eventType is in the valid set.
 * Never throws — all errors are caught and swallowed.
 */
function logActivity({ eventType, tenantId, entityId, userId, data = {} }) {
  try {
    if (!VALID_EVENT_TYPES.has(eventType)) return;

    const safe = {
      ts: new Date().toISOString(),
      event: eventType,
      tenant: tenantId ? String(tenantId).slice(0, 8) : undefined,
      entity: entityId ? String(entityId).slice(0, 8) : undefined,
      user: userId ? String(userId).slice(0, 8) : undefined,
    };

    // Only include safe data fields — never amounts, keys, or tokens
    for (const field of SAFE_DATA_FIELDS) {
      if (data[field] !== undefined && data[field] !== null) {
        safe[field] = data[field];
      }
    }

    console.log('[revenue.activity]', JSON.stringify(safe));
  } catch (_) {
    // Swallow all errors — logging must never break request handling
  }
}

module.exports = { logActivity };
