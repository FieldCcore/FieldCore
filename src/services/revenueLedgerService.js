'use strict';
const pool = require('../db/pool');

// IMMUTABLE LEDGER — NEVER UPDATE OR DELETE ROWS.
// All reversals are new rows with reversal_of_entry_id pointing to the original.

/**
 * Record a new ledger entry.
 * Idempotent: ON CONFLICT (idempotency_key, tenant_id) DO NOTHING.
 *
 * Returns { inserted: true, id } on success.
 * Returns { inserted: false, id } if the idempotency key already exists.
 */
async function recordEntry({
  tenantId,
  entityId = null,
  clientId = null,
  jobId = null,
  invoiceId = null,
  depositId = null,
  transactionType,
  amount,
  currency = 'USD',
  occurredAt,
  accountingDate,
  source,
  sourceRecordId = null,
  idempotencyKey,
  metadata = null,
  createdBy = null,
}) {
  // Safe log — never log amounts, credentials, or full financial payloads
  console.log('[ledger]', { type: transactionType, tenant: tenantId.slice(0, 8), source });

  const result = await pool.query(
    `INSERT INTO revenue_ledger_entries (
       tenant_id, entity_id, client_id, job_id, invoice_id, deposit_id,
       transaction_type, amount, currency,
       occurred_at_utc, accounting_date,
       source, source_record_id, idempotency_key, metadata, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT ON CONSTRAINT revenue_ledger_idempotency DO NOTHING
     RETURNING id`,
    [
      tenantId, entityId, clientId, jobId, invoiceId, depositId,
      transactionType, amount, currency,
      occurredAt, accountingDate,
      source, sourceRecordId, idempotencyKey,
      metadata ? JSON.stringify(metadata) : null,
      createdBy,
    ]
  );

  if (result.rows.length > 0) {
    return { inserted: true, id: result.rows[0].id };
  }

  // Conflict: idempotency key already exists — fetch the existing id
  const existing = await pool.query(
    `SELECT id FROM revenue_ledger_entries WHERE idempotency_key = $1 AND tenant_id = $2`,
    [idempotencyKey, tenantId]
  );
  return { inserted: false, id: existing.rows[0]?.id || null };
}

/**
 * Reverse an existing ledger entry by creating a new negated row.
 * New idempotency_key = 'reversal_' + originalEntryId.
 * Returns { inserted: boolean, id }.
 */
async function reverseEntry({ originalEntryId, tenantId, reason = '', performedBy = null }) {
  const origResult = await pool.query(
    `SELECT * FROM revenue_ledger_entries WHERE id = $1 AND tenant_id = $2`,
    [originalEntryId, tenantId]
  );

  if (origResult.rows.length === 0) {
    const err = new Error('Original ledger entry not found or does not belong to this tenant.');
    err.status = 404;
    throw err;
  }

  const orig = origResult.rows[0];
  const reversalIdempotencyKey = `reversal_${originalEntryId}`;

  console.log('[ledger]', { type: 'revenue_reversed', tenant: tenantId.slice(0, 8), source: orig.source });

  const result = await pool.query(
    `INSERT INTO revenue_ledger_entries (
       tenant_id, entity_id, client_id, job_id, invoice_id, deposit_id,
       transaction_type, amount, currency,
       occurred_at_utc, accounting_date,
       source, source_record_id, idempotency_key, metadata,
       reversal_of_entry_id, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT ON CONSTRAINT revenue_ledger_idempotency DO NOTHING
     RETURNING id`,
    [
      tenantId,
      orig.entity_id,
      orig.client_id,
      orig.job_id,
      orig.invoice_id,
      orig.deposit_id,
      'revenue_reversed',
      -(orig.amount),                // negated amount
      orig.currency,
      orig.accounting_date,          // same accounting date as original
      orig.source,
      orig.source_record_id,
      reversalIdempotencyKey,
      reason ? JSON.stringify({ reason }) : null,
      originalEntryId,
      performedBy,
    ]
  );

  if (result.rows.length > 0) {
    return { inserted: true, id: result.rows[0].id };
  }

  // Already reversed
  const existing = await pool.query(
    `SELECT id FROM revenue_ledger_entries WHERE idempotency_key = $1 AND tenant_id = $2`,
    [reversalIdempotencyKey, tenantId]
  );
  return { inserted: false, id: existing.rows[0]?.id || null };
}

/**
 * Query ledger entries for a tenant with optional filters.
 * Always enforces tenantId.
 * Returns { rows, total }.
 */
async function getEntries({ tenantId, entityId, start, end, transactionTypes, limit = 100, offset = 0 }) {
  const params = [tenantId];
  const conditions = ['tenant_id = $1'];

  if (entityId) {
    params.push(entityId);
    conditions.push(`entity_id = $${params.length}`);
  }
  if (start) {
    params.push(start);
    conditions.push(`occurred_at_utc >= $${params.length}::timestamptz`);
  }
  if (end) {
    params.push(end);
    conditions.push(`occurred_at_utc <= $${params.length}::timestamptz`);
  }
  if (Array.isArray(transactionTypes) && transactionTypes.length > 0) {
    params.push(transactionTypes);
    conditions.push(`transaction_type = ANY($${params.length})`);
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM revenue_ledger_entries WHERE ${whereClause}`,
    params
  );

  params.push(limit, offset);
  const dataResult = await pool.query(
    `SELECT id, tenant_id, entity_id, client_id, job_id, invoice_id, deposit_id,
            transaction_type, currency, occurred_at_utc, accounting_date,
            source, source_record_id, idempotency_key, reversal_of_entry_id,
            created_at, created_by
     FROM revenue_ledger_entries
     WHERE ${whereClause}
     ORDER BY occurred_at_utc DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    rows: dataResult.rows,
    total: countResult.rows[0]?.total || 0,
  };
}

/**
 * Check whether an idempotency key already exists for a tenant.
 * Returns the existing row or null.
 */
async function checkDuplicate(idempotencyKey, tenantId) {
  const result = await pool.query(
    `SELECT * FROM revenue_ledger_entries WHERE idempotency_key = $1 AND tenant_id = $2`,
    [idempotencyKey, tenantId]
  );
  return result.rows[0] || null;
}

module.exports = { recordEntry, reverseEntry, getEntries, checkDuplicate };
