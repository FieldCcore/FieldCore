'use strict';

/**
 * Authority Engine — Canonical Rules Fingerprint.
 *
 * Produces a deterministic SHA-256 hash over the immutable canonical inputs
 * that define the authorization rules for an instrument. The fingerprint is
 * written to authority_evaluations so that changes to permissions/restrictions
 * can be detected between evaluations.
 *
 * IMPORTANT: The fingerprint EXCLUDES mutable lifecycle fields (status,
 * verified_at, revoked_at, etc.) — those belong in evaluation_state_snapshot.
 * The fingerprint covers only the rules that would change authorization
 * semantics if different at the time of a new evaluation.
 *
 * Inputs hashed:
 *   - instrument_type
 *   - effective_date
 *   - expiration_date
 *   - jurisdiction
 *   - participants (sorted by id): { id, role, status }
 *   - permissions (sorted by id): { id, action_key, grant_type }
 *   - restrictions (sorted by id): { id, restriction_type, parameters, effective_from, effective_to }
 *
 * Design constraint: NO I/O, NO DB. Pure function over pre-loaded data.
 */

const crypto = require('crypto');

/**
 * Compute the canonical rules fingerprint for an instrument.
 *
 * @param {object} instrument   - instrument row (type, effective_date, expiration_date, jurisdiction)
 * @param {Array}  participants - authority_instrument_parties rows
 * @param {Array}  permissions  - authority_permissions rows
 * @param {Array}  restrictions - authority_restrictions rows
 * @returns {string}  hex SHA-256 digest (64 chars)
 */
function computeFingerprint(instrument, participants, permissions, restrictions) {
  const canonical = {
    instrument_type:   instrument.instrument_type,
    effective_date:    instrument.effective_date   || null,
    expiration_date:   instrument.expiration_date  || null,
    jurisdiction:      instrument.jurisdiction     || null,
    participants: [...participants]
      .sort((a, b) => a.id < b.id ? -1 : 1)
      .map(p => ({ id: p.id, role: p.role, status: p.status })),
    permissions: [...permissions]
      .sort((a, b) => a.id < b.id ? -1 : 1)
      .map(p => ({ id: p.id, action_key: p.action_key, grant_type: p.grant_type })),
    restrictions: [...restrictions]
      .sort((a, b) => a.id < b.id ? -1 : 1)
      .map(r => ({
        id:               r.id,
        restriction_type: r.restriction_type,
        parameters:       r.parameters || null,
        effective_from:   r.effective_from  || null,
        effective_to:     r.effective_to    || null,
      })),
  };
  const json = JSON.stringify(canonical);
  return crypto.createHash('sha256').update(json, 'utf8').digest('hex');
}

/**
 * Capture the mutable evaluation-state snapshot (excluded from fingerprint).
 * This is stored alongside the fingerprint to reconstruct what the instrument
 * state was at the moment of evaluation.
 *
 * @param {object} instrument
 * @returns {object}  plain object (to be JSON-serialized before storage)
 */
function captureEvaluationState(instrument) {
  return {
    status:           instrument.status,
    verified_at:      instrument.verified_at      || null,
    revoked_at:       instrument.revoked_at        || null,
    expired_at:       instrument.expired_at        || null,
    rejected_at:      instrument.rejected_at       || null,
    superseded_by:    instrument.superseded_by_instrument_id || null,
  };
}

module.exports = { computeFingerprint, captureEvaluationState };
