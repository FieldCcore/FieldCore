'use strict';
const pool = require('../db/pool');

const ALLOWED_POLICIES = {
  revenue_recognition_policy: ['completed_job', 'invoice_issued', 'payment_collected', 'configurable_hybrid'],
  technician_attribution_policy: ['primary_only', 'equal_split', 'role_weighted', 'manual', 'none'],
  cost_inclusion_policy: ['direct_costs_only', 'full_absorption', 'custom'],
  forecasting_policy: ['rules_based', 'rules_plus_narrative', 'predictive_when_ready'],
};

const POLICY_KEYS = Object.keys(ALLOWED_POLICIES);

/**
 * Build the null-baseline object with setupRequired flag and missingPolicies list.
 * null means unconfigured — never substitute a default.
 */
function buildNullPolicies() {
  const obj = {};
  for (const key of POLICY_KEYS) obj[key] = null;
  return {
    ...obj,
    setupRequired: true,
    missingPolicies: [...POLICY_KEYS],
  };
}

/**
 * Compute missingPolicies from a row that exists but may have null fields.
 */
function computeMissing(row) {
  return POLICY_KEYS.filter(k => row[k] === null || row[k] === undefined);
}

/**
 * Read the tenant-level policy row (entity_id IS NULL).
 * Returns all-null object with setupRequired: true if no row exists.
 * If row exists, returns the row plus missingPolicies for any null fields.
 */
async function getPolicies(tenantId) {
  const result = await pool.query(
    `SELECT id, tenant_id, entity_id,
            revenue_recognition_policy,
            technician_attribution_policy,
            cost_inclusion_policy,
            forecasting_policy,
            version, created_at, updated_at, updated_by
     FROM revenue_policy_settings
     WHERE tenant_id = $1 AND entity_id IS NULL`,
    [tenantId]
  );

  if (result.rows.length === 0) {
    return buildNullPolicies();
  }

  const row = result.rows[0];
  const missingPolicies = computeMissing(row);
  return {
    ...row,
    setupRequired: missingPolicies.length > 0,
    missingPolicies,
  };
}

/**
 * Validate and UPSERT tenant-level policies.
 * Throws a 400-status error if any key or value is invalid.
 * Returns the updated getPolicies result.
 */
async function updatePolicies(tenantId, updates, updatedBy) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    const err = new Error('Request body must be a JSON object.');
    err.status = 400;
    throw err;
  }

  const keys = Object.keys(updates);
  if (keys.length === 0) {
    const err = new Error('No policy fields provided.');
    err.status = 400;
    throw err;
  }

  // Validate all keys and values before touching the database
  for (const key of keys) {
    if (!ALLOWED_POLICIES[key]) {
      const err = new Error(`Unknown policy key: "${key}". Allowed keys: ${POLICY_KEYS.join(', ')}.`);
      err.status = 400;
      throw err;
    }
    const val = updates[key];
    if (val !== null && !ALLOWED_POLICIES[key].includes(val)) {
      const err = new Error(
        `Invalid value "${val}" for "${key}". Allowed values: ${ALLOWED_POLICIES[key].join(', ')}.`
      );
      err.status = 400;
      throw err;
    }
  }

  // Build SET clause dynamically from validated keys
  // Always bump version and updated_at on conflict
  const setClauses = keys.map((key, i) => `${key} = $${i + 3}`);
  const values = [tenantId, updatedBy, ...keys.map(k => updates[k])];

  await pool.query(
    `INSERT INTO revenue_policy_settings (tenant_id, entity_id, updated_by, ${keys.join(', ')})
     VALUES ($1, NULL, $2, ${keys.map((_, i) => `$${i + 3}`).join(', ')})
     ON CONFLICT ON CONSTRAINT revenue_policy_tenant_only
     DO UPDATE SET
       ${setClauses.join(',\n       ')},
       updated_by = $2,
       version = revenue_policy_settings.version + 1,
       updated_at = NOW()`,
    values
  );

  return getPolicies(tenantId);
}

module.exports = { getPolicies, updatePolicies, ALLOWED_POLICIES };
