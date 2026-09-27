/**
 * FieldCore Authority — Domain Service Layer
 *
 * All business rules live here: tenant isolation, lifecycle guards, the human-
 * verification rule, encryption, format validation, and audit logging.
 * Route handlers are thin wrappers — they call these functions and format responses.
 *
 * Security invariants enforced here:
 *  - Only institution accounts may own Authority objects (asserted on every create).
 *  - Cross-tenant reads/links return the same "not found" error as non-existent IDs.
 *  - PENDING_REVIEW → VERIFIED requires: human actor, authenticated JWT user,
 *    explicit AUTHORITY_INSTRUMENT_VERIFY capability, institution_reviewer context.
 *  - No automated, AI, or background-job actor may set VERIFIED.
 *
 * TEMPORARY RESTRICTION (this stage only): the verifier must be a user belonging
 * to the owning institution (req.accountId === instrument.account_id). This is
 * enforced only in canVerifyInstrument(). No DB constraint enforces it. A future
 * stage will add explicitly authorized FieldCore internal and professional reviewer
 * contexts without schema changes.
 */

const pool             = require('../db/pool');
const auditService     = require('./audit');
const authorityCrypto  = require('./authorityCrypto');
const authorityStorage = require('./authorityStorage');
const { validateFormat, AUTHORITY_MAX_UPLOAD_BYTES } = require('./authorityFormatRegistry');

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_INSTRUMENT_TYPES = new Set([
  'power_of_attorney', 'durable_power_of_attorney', 'guardianship_order',
  'trust', 'corporate_resolution', 'letter_of_authorization',
  'healthcare_proxy', 'court_order',
]);

const VALID_PARTICIPANT_ROLES = new Set([
  'principal', 'agent', 'co_agent', 'successor_agent',
  'guardian', 'trustee', 'co_trustee', 'authorized_representative',
]);

const VALID_RESTRICTION_TYPES = new Set([
  'monetary_limit', 'date_window', 'account_scope', 'transaction_type',
  'institution_scope', 'approval_required', 'co_agent_required',
  'prohibited_action', 'triggering_condition',
]);

// ACTION_KEY format: UPPERCASE_SEGMENT.UPPERCASE_SEGMENT (e.g. BANKING.WIRE_TRANSFER)
const ACTION_KEY_RE = /^[A-Z][A-Z0-9_]{0,29}\.[A-Z][A-Z0-9_]{0,29}$/;

// ── Case lifecycle ────────────────────────────────────────────────────────────

const CASE_TRANSITIONS = {
  DRAFT:                    ['AWAITING_DOCUMENTS', 'CANCELLED'],
  AWAITING_DOCUMENTS:       ['PENDING_EXTRACTION', 'CANCELLED'],
  PENDING_EXTRACTION:       ['EXTRACTION_COMPLETE', 'CANCELLED'],
  EXTRACTION_COMPLETE:      ['PENDING_HUMAN_REVIEW', 'CANCELLED'],
  PENDING_HUMAN_REVIEW:     ['HUMAN_REVIEW_IN_PROGRESS', 'CANCELLED'],
  HUMAN_REVIEW_IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED:                [],
  CANCELLED:                [],
};

// ── Instrument lifecycle ──────────────────────────────────────────────────────

const INSTRUMENT_TRANSITIONS = {
  UNVERIFIED:     ['PENDING_REVIEW'],
  PENDING_REVIEW: ['VERIFIED', 'REJECTED'],
  VERIFIED:       ['REVOKED', 'EXPIRED', 'SUPERSEDED'],
  REJECTED:       [],
  REVOKED:        [],
  EXPIRED:        [],
  SUPERSEDED:     [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function _notFound() {
  const e = new Error('Not found.');
  e.statusCode = 404;
  return e;
}

function _forbidden(msg) {
  const e = new Error(msg || 'Forbidden.');
  e.statusCode = 403;
  return e;
}

function _badRequest(msg) {
  const e = new Error(msg);
  e.statusCode = 400;
  return e;
}

function _conflict(msg) {
  const e = new Error(msg);
  e.statusCode = 409;
  return e;
}

/**
 * Assert the account exists and is of type 'institution'.
 * Throws 403 with a generic message if not (avoid leaking account existence).
 */
async function _assertInstitutionAccount(accountId) {
  const { rows } = await pool.query(
    `SELECT account_type FROM accounts WHERE id = $1`, [accountId]
  );
  if (!rows.length || rows[0].account_type !== 'institution') {
    throw _forbidden('Authority operations require an institution account.');
  }
}

/**
 * Assert the acting user holds a specific platform capability.
 */
async function _assertCapability(userId, capability) {
  const { rows } = await pool.query(
    `SELECT id FROM platform_user_capabilities WHERE user_id = $1 AND capability = $2`,
    [userId, capability]
  );
  if (!rows.length) throw _forbidden(`Capability ${capability} is required.`);
}

async function _hasCapability(userId, capability) {
  const { rows } = await pool.query(
    `SELECT id FROM platform_user_capabilities WHERE user_id = $1 AND capability = $2`,
    [userId, capability]
  );
  return rows.length > 0;
}

// ── Institution Provisioning ──────────────────────────────────────────────────

/**
 * Provision a new institution account. Requires the actor to:
 *  - belong to an fc_internal account
 *  - explicitly hold the INSTITUTION_PROVISION capability
 *
 * @param {string} actorUserId
 * @param {string} actorAccountId  — must be an fc_internal account
 * @param {{ name: string }}  opts
 * @returns {{ accountId: string }}
 */
async function provisionInstitution(actorUserId, actorAccountId, { name }) {
  // 1. Verify actor's account is fc_internal
  const { rows: [actorAcct] } = await pool.query(
    `SELECT account_type FROM accounts WHERE id = $1`, [actorAccountId]
  );
  if (!actorAcct || actorAcct.account_type !== 'fc_internal') {
    await auditService.log(
      actorAccountId, actorUserId, 'authority.institution.provision.denied',
      'institution', null,
      { reason: 'actor_account_not_fc_internal', actor_account_id: actorAccountId },
      null
    );
    throw _forbidden('Institution provisioning requires an fc_internal account.');
  }

  // 2. Verify actor holds the explicit INSTITUTION_PROVISION capability
  const hasCap = await _hasCapability(actorUserId, 'INSTITUTION_PROVISION');
  if (!hasCap) {
    await auditService.log(
      actorAccountId, actorUserId, 'authority.institution.provision.denied',
      'institution', null,
      { reason: 'missing_capability', required_capability: 'INSTITUTION_PROVISION' },
      null
    );
    throw _forbidden('INSTITUTION_PROVISION capability is required.');
  }

  // 3. Validate input
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw _badRequest('Institution name is required.');
  }
  const trimmedName = name.trim();

  // 4. Create the institution account
  const { rows: [newAcct] } = await pool.query(
    `INSERT INTO accounts (name, plan, account_type)
     VALUES ($1, $2, 'institution')
     RETURNING id`,
    [trimmedName, 'institution']
  );

  await auditService.log(
    actorAccountId, actorUserId, 'authority.institution.provision.success',
    'account', newAcct.id,
    { institution_name: trimmedName, created_account_id: newAcct.id },
    null
  );

  return { accountId: newAcct.id };
}

// ── Platform Capability Grants ────────────────────────────────────────────────

/**
 * Grant a platform capability to a user.
 * Must be called through a protected internal path (e.g. guarded seed or CLI script),
 * never through a tenant-level UI.
 *
 * @param {string|null} grantingUserId  — null for bootstrap grants (seed script / migration)
 * @param {string} targetUserId
 * @param {string} capability
 */
async function grantCapability(grantingUserId, targetUserId, capability) {
  await pool.query(
    `INSERT INTO platform_user_capabilities (user_id, capability, granted_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, capability) DO NOTHING`,
    [targetUserId, capability, grantingUserId || null]
  );
  if (grantingUserId) {
    await auditService.log(
      null, grantingUserId, 'authority.capability.granted',
      'user', targetUserId,
      { capability, target_user_id: targetUserId },
      null
    );
  }
}

// ── Authority Parties ─────────────────────────────────────────────────────────

/**
 * Create an authority party. Encrypted display_name is stored in the DB.
 * ai_agent party_type is rejected by the service in this stage.
 */
async function createParty(accountId, userId, { partyType, displayName, externalReference }) {
  await _assertInstitutionAccount(accountId);

  if (!VALID_PARTICIPANT_ROLES || !partyType) throw _badRequest('partyType is required.');
  if (!['person', 'organization', 'ai_agent'].includes(partyType)) {
    throw _badRequest(`Invalid partyType "${partyType}".`);
  }
  if (partyType === 'ai_agent') {
    throw _badRequest('ai_agent party type is not supported in this stage.');
  }
  if (!displayName || !String(displayName).trim()) {
    throw _badRequest('displayName is required.');
  }

  const encryptedName = authorityCrypto.encrypt(String(displayName).trim());

  const { rows: [party] } = await pool.query(
    `INSERT INTO authority_parties
       (account_id, party_type, display_name, external_reference, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, account_id, party_type, external_reference, status, created_at, updated_at`,
    [accountId, partyType, encryptedName, externalReference || null, userId]
  );

  await auditService.log(
    accountId, userId, 'authority.party.created',
    'authority_party', party.id,
    { party_type: partyType },
    null
  );

  return party;
}

async function getParty(accountId, partyId) {
  const { rows: [party] } = await pool.query(
    `SELECT id, account_id, party_type, display_name, external_reference, status,
            created_by, created_at, updated_at
     FROM authority_parties
     WHERE account_id = $1 AND id = $2`,
    [accountId, partyId]
  );
  if (!party) throw _notFound();

  return {
    ...party,
    display_name: authorityCrypto.decrypt(party.display_name),
  };
}

async function updatePartyStatus(accountId, userId, partyId, status) {
  if (!['active', 'inactive'].includes(status)) {
    throw _badRequest(`Invalid status "${status}".`);
  }
  const { rows: [party] } = await pool.query(
    `UPDATE authority_parties
     SET status = $1, updated_at = NOW()
     WHERE account_id = $2 AND id = $3
     RETURNING id, status`,
    [status, accountId, partyId]
  );
  if (!party) throw _notFound();

  await auditService.log(
    accountId, userId, 'authority.party.status_changed',
    'authority_party', partyId,
    { new_status: status },
    null
  );

  return party;
}

// ── Authority Cases ───────────────────────────────────────────────────────────

async function createCase(accountId, userId, { externalCaseReference } = {}) {
  await _assertInstitutionAccount(accountId);

  const { rows: [kase] } = await pool.query(
    `INSERT INTO authority_cases (account_id, external_case_reference, created_by)
     VALUES ($1, $2, $3)
     RETURNING id, account_id, external_case_reference, status, created_at, updated_at,
               status_changed_at, completed_at, cancelled_at, cancellation_reason`,
    [accountId, externalCaseReference || null, userId]
  );

  await auditService.log(
    accountId, userId, 'authority.case.created',
    'authority_case', kase.id,
    { external_case_reference: externalCaseReference || null },
    null
  );

  return kase;
}

async function getCase(accountId, caseId) {
  const { rows: [kase] } = await pool.query(
    `SELECT id, account_id, external_case_reference, status, created_by,
            created_at, updated_at, status_changed_at, completed_at, cancelled_at, cancellation_reason
     FROM authority_cases
     WHERE account_id = $1 AND id = $2`,
    [accountId, caseId]
  );
  if (!kase) throw _notFound();
  return kase;
}

/**
 * Transition a case to a new status.
 * The PENDING_EXTRACTION → EXTRACTION_COMPLETE edge is gated behind an internal
 * system-only path (used in tests); it is NOT exposed via the public API.
 *
 * @param {string} accountId
 * @param {string} userId
 * @param {string} caseId
 * @param {string} newStatus
 * @param {{ cancellationReason?: string, systemActor?: boolean }} opts
 */
async function transitionCase(accountId, userId, caseId, newStatus, opts = {}) {
  const kase = await getCase(accountId, caseId);

  const allowed = CASE_TRANSITIONS[kase.status] || [];
  if (!allowed.includes(newStatus)) {
    throw _badRequest(
      `Cannot transition case from ${kase.status} to ${newStatus}.`
    );
  }

  // Guard: PENDING_EXTRACTION → EXTRACTION_COMPLETE is a system-only transition.
  // It is NOT reachable by end users via the HTTP API.
  // Tests drive it by passing opts.systemActor = true directly to the service.
  if (newStatus === 'EXTRACTION_COMPLETE' && !opts.systemActor) {
    throw _forbidden(
      'PENDING_EXTRACTION → EXTRACTION_COMPLETE is a system-only transition and cannot be ' +
      'triggered by end users. Pass systemActor: true from an internal service path.'
    );
  }

  // Guard: cannot complete while any linked instrument is UNVERIFIED or PENDING_REVIEW
  if (newStatus === 'COMPLETED') {
    const { rows: unready } = await pool.query(
      `SELECT ai.id FROM authority_case_instruments aci
       JOIN authority_instruments ai
         ON ai.account_id = aci.account_id AND ai.id = aci.instrument_id
       WHERE aci.account_id = $1 AND aci.case_id = $2
         AND ai.status IN ('UNVERIFIED', 'PENDING_REVIEW')`,
      [accountId, caseId]
    );
    if (unready.length > 0) {
      throw _badRequest(
        'Case cannot be completed while linked instruments are UNVERIFIED or PENDING_REVIEW.'
      );
    }
  }

  const now = new Date().toISOString();
  const updates = {
    status: newStatus,
    status_changed_at: now,
    completed_at: newStatus === 'COMPLETED' ? now : kase.completed_at,
    cancelled_at: newStatus === 'CANCELLED' ? now : kase.cancelled_at,
    cancellation_reason:
      newStatus === 'CANCELLED' ? (opts.cancellationReason || null) : kase.cancellation_reason,
  };

  const { rows: [updated] } = await pool.query(
    `UPDATE authority_cases
     SET status = $1, status_changed_at = $2, completed_at = $3,
         cancelled_at = $4, cancellation_reason = $5, updated_at = NOW()
     WHERE account_id = $6 AND id = $7 AND status = $8
     RETURNING id, status`,
    [
      updates.status, updates.status_changed_at, updates.completed_at,
      updates.cancelled_at, updates.cancellation_reason,
      accountId, caseId, kase.status,
    ]
  );

  // Conditional update on expected current status prevents races
  if (!updated) {
    throw _conflict('Case status was changed concurrently. Please retry.');
  }

  await auditService.log(
    accountId, userId, 'authority.case.transitioned',
    'authority_case', caseId,
    { from: kase.status, to: newStatus },
    null
  );

  return updated;
}

// ── Authority Instruments ─────────────────────────────────────────────────────

async function createInstrument(accountId, userId, {
  instrumentType, effectiveDate, expirationDate, jurisdiction,
}) {
  await _assertInstitutionAccount(accountId);

  if (!instrumentType || !VALID_INSTRUMENT_TYPES.has(instrumentType)) {
    throw _badRequest(
      `Invalid instrument_type "${instrumentType}". ` +
      `Valid types: ${[...VALID_INSTRUMENT_TYPES].join(', ')}.`
    );
  }

  const { rows: [instr] } = await pool.query(
    `INSERT INTO authority_instruments
       (account_id, instrument_type, effective_date, expiration_date, jurisdiction, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, account_id, instrument_type, status, effective_date, expiration_date,
               jurisdiction, created_at, updated_at`,
    [accountId, instrumentType, effectiveDate || null, expirationDate || null,
     jurisdiction || null, userId]
  );

  await auditService.log(
    accountId, userId, 'authority.instrument.created',
    'authority_instrument', instr.id,
    { instrument_type: instrumentType },
    null
  );

  return instr;
}

async function getInstrument(accountId, instrumentId) {
  const { rows: [instr] } = await pool.query(
    `SELECT id, account_id, instrument_type, status, effective_date, expiration_date,
            jurisdiction, superseded_by_instrument_id,
            revoked_at, revocation_reason, expired_at, rejected_at, rejection_reason,
            verified_by_user_id, verified_at, verification_actor_type,
            verification_authorization_context, verification_actor_account_id,
            created_by, created_at, updated_at
     FROM authority_instruments
     WHERE account_id = $1 AND id = $2`,
    [accountId, instrumentId]
  );
  if (!instr) throw _notFound();
  return instr;
}

/**
 * Evaluate whether an actor may verify an instrument.
 *
 * TEMPORARY RESTRICTION (this stage only):
 * The only authorization context implemented is 'institution_reviewer'.
 * The verifier must be an authenticated user of the owning institution
 * (actorAccountId === instrument.account_id).
 *
 * This restriction is ONLY in this function — no DB constraint enforces it.
 * A future stage adds explicitly authorized FieldCore internal or professional
 * reviewer contexts by extending this function without schema changes.
 *
 * @param {{ actorUserId: string, actorAccountId: string, actorType: string }} actor
 * @param {{ account_id: string }} instrument
 * @returns {Promise<{ authorized: boolean, reason?: string, context: string }>}
 */
async function canVerifyInstrument(actor, instrument) {
  // Structural: actor MUST be human
  if (actor.actorType !== 'human') {
    return { authorized: false, reason: 'actor_not_human', context: null };
  }

  // The actor must hold the explicit verification capability
  const hasCap = await _hasCapability(actor.actorUserId, 'AUTHORITY_INSTRUMENT_VERIFY');
  if (!hasCap) {
    return { authorized: false, reason: 'missing_capability', context: null };
  }

  // TEMPORARY: verifier must belong to the owning institution (service-layer restriction only)
  if (actor.actorAccountId !== instrument.account_id) {
    return { authorized: false, reason: 'wrong_institution_temporary_restriction', context: null };
  }

  return { authorized: true, context: 'institution_reviewer' };
}

/**
 * Transition an instrument to a new status.
 * PENDING_REVIEW → VERIFIED enforces the human-verification rule via canVerifyInstrument().
 *
 * @param {string} accountId
 * @param {string} userId
 * @param {string} instrumentId
 * @param {string} newStatus
 * @param {{ actorType: string, revocationReason?: string, rejectionReason?: string,
 *           supersededByInstrumentId?: string }} opts
 */
async function transitionInstrument(accountId, userId, instrumentId, newStatus, opts = {}) {
  const instr = await getInstrument(accountId, instrumentId);

  const allowed = INSTRUMENT_TRANSITIONS[instr.status] || [];
  if (!allowed.includes(newStatus)) {
    throw _badRequest(`Cannot transition instrument from ${instr.status} to ${newStatus}.`);
  }

  const actor = {
    actorUserId:    userId,
    actorAccountId: accountId,
    actorType:      opts.actorType || 'human',
  };

  // ── PENDING_REVIEW → VERIFIED: mandatory human-verification rule ──────────
  if (newStatus === 'VERIFIED') {
    const check = await canVerifyInstrument(actor, instr);
    if (!check.authorized) {
      await auditService.log(
        accountId, userId, 'authority.instrument.verify.denied',
        'authority_instrument', instrumentId,
        { reason: check.reason, from_status: instr.status },
        null
      );
      throw _forbidden(
        check.reason === 'actor_not_human'
          ? 'Instrument verification requires a human actor.'
          : check.reason === 'missing_capability'
            ? 'AUTHORITY_INSTRUMENT_VERIFY capability is required.'
            : 'Not authorized to verify this instrument.'
      );
    }

    const now = new Date().toISOString();
    const { rows: [updated] } = await pool.query(
      `UPDATE authority_instruments
       SET status = 'VERIFIED',
           verified_by_user_id = $1,
           verified_at = $2,
           verification_actor_type = 'human',
           verification_authorization_context = $3,
           verification_actor_account_id = $4,
           updated_at = NOW()
       WHERE account_id = $4 AND id = $5 AND status = 'PENDING_REVIEW'
       RETURNING id, status`,
      [userId, now, check.context, accountId, instrumentId]
    );

    if (!updated) throw _conflict('Instrument status changed concurrently. Please retry.');

    await auditService.log(
      accountId, userId, 'authority.instrument.verified',
      'authority_instrument', instrumentId,
      {
        verified_by_user_id: userId,
        verification_actor_type: 'human',
        verification_authorization_context: check.context,
        verification_actor_account_id: accountId,
      },
      null
    );
    return updated;
  }

  // ── PENDING_REVIEW → REJECTED ─────────────────────────────────────────────
  if (newStatus === 'REJECTED') {
    const hasCap = await _hasCapability(userId, 'AUTHORITY_INSTRUMENT_REJECT');
    if (!hasCap) {
      await auditService.log(
        accountId, userId, 'authority.instrument.reject.denied',
        'authority_instrument', instrumentId,
        { reason: 'missing_capability', required: 'AUTHORITY_INSTRUMENT_REJECT' },
        null
      );
      throw _forbidden('AUTHORITY_INSTRUMENT_REJECT capability is required.');
    }
    const { rows: [updated] } = await pool.query(
      `UPDATE authority_instruments
       SET status = 'REJECTED', rejected_at = NOW(),
           rejection_reason = $1, updated_at = NOW()
       WHERE account_id = $2 AND id = $3 AND status = 'PENDING_REVIEW'
       RETURNING id, status`,
      [opts.rejectionReason || null, accountId, instrumentId]
    );
    if (!updated) throw _conflict('Instrument status changed concurrently. Please retry.');

    await auditService.log(
      accountId, userId, 'authority.instrument.rejected',
      'authority_instrument', instrumentId,
      { rejection_reason: opts.rejectionReason || null },
      null
    );
    return updated;
  }

  // ── VERIFIED → SUPERSEDED ─────────────────────────────────────────────────
  if (newStatus === 'SUPERSEDED') {
    const supId = opts.supersededByInstrumentId;
    if (!supId) throw _badRequest('supersededByInstrumentId is required for SUPERSEDED transition.');
    if (supId === instrumentId) throw _badRequest('An instrument cannot supersede itself.');

    // Verify the superseding instrument exists in the same tenant
    const { rows: [supInstr] } = await pool.query(
      `SELECT id FROM authority_instruments WHERE account_id = $1 AND id = $2`,
      [accountId, supId]
    );
    if (!supInstr) throw _notFound();

    const { rows: [updated] } = await pool.query(
      `UPDATE authority_instruments
       SET status = 'SUPERSEDED',
           superseded_by_instrument_id = $1, updated_at = NOW()
       WHERE account_id = $2 AND id = $3 AND status = 'VERIFIED'
       RETURNING id, status`,
      [supId, accountId, instrumentId]
    );
    if (!updated) throw _conflict('Instrument status changed concurrently. Please retry.');

    await auditService.log(
      accountId, userId, 'authority.instrument.superseded',
      'authority_instrument', instrumentId,
      { superseded_by_instrument_id: supId },
      null
    );
    return updated;
  }

  // ── VERIFIED → REVOKED ────────────────────────────────────────────────────
  if (newStatus === 'REVOKED') {
    const { rows: [updated] } = await pool.query(
      `UPDATE authority_instruments
       SET status = 'REVOKED', revoked_at = NOW(),
           revocation_reason = $1, updated_at = NOW()
       WHERE account_id = $2 AND id = $3 AND status = 'VERIFIED'
       RETURNING id, status`,
      [opts.revocationReason || null, accountId, instrumentId]
    );
    if (!updated) throw _conflict('Instrument status changed concurrently. Please retry.');

    await auditService.log(
      accountId, userId, 'authority.instrument.revoked',
      'authority_instrument', instrumentId,
      { revocation_reason: opts.revocationReason || null, revoked_by: userId },
      null
    );
    return updated;
  }

  // ── VERIFIED → EXPIRED ────────────────────────────────────────────────────
  if (newStatus === 'EXPIRED') {
    const { rows: [updated] } = await pool.query(
      `UPDATE authority_instruments
       SET status = 'EXPIRED', expired_at = NOW(), updated_at = NOW()
       WHERE account_id = $1 AND id = $2 AND status = 'VERIFIED'
       RETURNING id, status`,
      [accountId, instrumentId]
    );
    if (!updated) throw _conflict('Instrument status changed concurrently. Please retry.');

    await auditService.log(
      accountId, userId, 'authority.instrument.expired',
      'authority_instrument', instrumentId,
      { expired_by: userId },
      null
    );
    return updated;
  }

  // ── UNVERIFIED → PENDING_REVIEW ───────────────────────────────────────────
  const { rows: [updated] } = await pool.query(
    `UPDATE authority_instruments
     SET status = $1, updated_at = NOW()
     WHERE account_id = $2 AND id = $3 AND status = $4
     RETURNING id, status`,
    [newStatus, accountId, instrumentId, instr.status]
  );
  if (!updated) throw _conflict('Instrument status changed concurrently. Please retry.');

  await auditService.log(
    accountId, userId, 'authority.instrument.transitioned',
    'authority_instrument', instrumentId,
    { from: instr.status, to: newStatus },
    null
  );
  return updated;
}

// ── Case ↔ Instrument relationships ──────────────────────────────────────────

async function linkInstrumentToCase(accountId, userId, caseId, instrumentId) {
  // Verify both objects exist in the same tenant (cross-tenant returns 404)
  await getCase(accountId, caseId);
  await getInstrument(accountId, instrumentId);

  try {
    await pool.query(
      `INSERT INTO authority_case_instruments (account_id, case_id, instrument_id)
       VALUES ($1, $2, $3)`,
      [accountId, caseId, instrumentId]
    );
  } catch (err) {
    if (err.code === '23505') throw _conflict('Instrument is already linked to this case.');
    throw err;
  }

  await auditService.log(
    accountId, userId, 'authority.case_instrument.linked',
    'authority_case', caseId,
    { instrument_id: instrumentId },
    null
  );
}

async function unlinkInstrumentFromCase(accountId, userId, caseId, instrumentId) {
  const { rows } = await pool.query(
    `DELETE FROM authority_case_instruments
     WHERE account_id = $1 AND case_id = $2 AND instrument_id = $3
     RETURNING id`,
    [accountId, caseId, instrumentId]
  );
  if (!rows.length) throw _notFound();

  await auditService.log(
    accountId, userId, 'authority.case_instrument.unlinked',
    'authority_case', caseId,
    { instrument_id: instrumentId },
    null
  );
}

// ── Instrument Participants ───────────────────────────────────────────────────

async function addParticipant(accountId, userId, instrumentId, {
  partyId, role, sequence, conditions,
}) {
  await getInstrument(accountId, instrumentId);

  if (!VALID_PARTICIPANT_ROLES.has(role)) {
    throw _badRequest(
      `Invalid role "${role}". Valid roles: ${[...VALID_PARTICIPANT_ROLES].join(', ')}.`
    );
  }

  // Party must belong to same tenant
  const { rows: [party] } = await pool.query(
    `SELECT id FROM authority_parties WHERE account_id = $1 AND id = $2`,
    [accountId, partyId]
  );
  if (!party) throw _notFound();

  try {
    const { rows: [participant] } = await pool.query(
      `INSERT INTO authority_instrument_parties
         (account_id, instrument_id, party_id, role, sequence, conditions)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, account_id, instrument_id, party_id, role, sequence, status, conditions,
                 created_at, updated_at`,
      [accountId, instrumentId, partyId, role,
       sequence !== undefined ? sequence : null,
       conditions ? JSON.stringify(conditions) : null]
    );

    await auditService.log(
      accountId, userId, 'authority.participant.added',
      'authority_instrument_parties', participant.id,
      { instrument_id: instrumentId, party_id: partyId, role },
      null
    );
    return participant;
  } catch (err) {
    if (err.code === '23505') {
      throw _conflict(`Party already holds role "${role}" on this instrument.`);
    }
    throw err;
  }
}

// ── Permissions ───────────────────────────────────────────────────────────────

async function addPermission(accountId, userId, instrumentId, {
  actionKey, grantType = 'granted', participantId,
}) {
  await getInstrument(accountId, instrumentId);

  if (!ACTION_KEY_RE.test(actionKey)) {
    throw _badRequest(
      'action_key must be in the format DOMAIN.ACTION (uppercase, e.g. BANKING.WIRE_TRANSFER).'
    );
  }
  if (!['granted', 'prohibited'].includes(grantType)) {
    throw _badRequest('grant_type must be "granted" or "prohibited".');
  }

  const { rows: [perm] } = await pool.query(
    `INSERT INTO authority_permissions (account_id, instrument_id, action_key, grant_type, participant_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, account_id, instrument_id, action_key, grant_type, participant_id, created_at`,
    [accountId, instrumentId, actionKey, grantType, participantId || null]
  );

  await auditService.log(
    accountId, userId, 'authority.permission.added',
    'authority_permissions', perm.id,
    { instrument_id: instrumentId, action_key: actionKey, grant_type: grantType },
    null
  );
  return perm;
}

async function removePermission(accountId, userId, permissionId) {
  const { rows } = await pool.query(
    `DELETE FROM authority_permissions WHERE account_id = $1 AND id = $2 RETURNING id`,
    [accountId, permissionId]
  );
  if (!rows.length) throw _notFound();

  await auditService.log(
    accountId, userId, 'authority.permission.removed',
    'authority_permissions', permissionId,
    {},
    null
  );
}

// ── Restrictions ──────────────────────────────────────────────────────────────

async function addRestriction(accountId, userId, instrumentId, {
  permissionId, participantId, restrictionType, parameters,
  effectiveFrom, effectiveTo,
}) {
  await getInstrument(accountId, instrumentId);

  if (!VALID_RESTRICTION_TYPES.has(restrictionType)) {
    throw _badRequest(
      `Invalid restriction_type "${restrictionType}". ` +
      `Valid types: ${[...VALID_RESTRICTION_TYPES].join(', ')}.`
    );
  }

  // Validate monetary_limit parameters shape
  if (restrictionType === 'monetary_limit' && parameters) {
    if (typeof parameters.amount !== 'number' || !Number.isInteger(parameters.amount)) {
      throw _badRequest('monetary_limit.amount must be an integer (minor units, e.g. cents).');
    }
    if (!parameters.currency || !/^[A-Z]{3}$/.test(parameters.currency)) {
      throw _badRequest('monetary_limit.currency must be a 3-character ISO currency code.');
    }
  }

  const { rows: [restr] } = await pool.query(
    `INSERT INTO authority_restrictions
       (account_id, instrument_id, permission_id, participant_id,
        restriction_type, parameters, effective_from, effective_to)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, account_id, instrument_id, restriction_type, created_at`,
    [
      accountId, instrumentId,
      permissionId || null, participantId || null,
      restrictionType,
      parameters ? JSON.stringify(parameters) : null,
      effectiveFrom || null, effectiveTo || null,
    ]
  );

  await auditService.log(
    accountId, userId, 'authority.restriction.added',
    'authority_restrictions', restr.id,
    { instrument_id: instrumentId, restriction_type: restrictionType },
    null
  );
  return restr;
}

// ── Authority Documents ───────────────────────────────────────────────────────

/**
 * Upload a document to the private Authority bucket.
 * Validates format via magic bytes. Encrypts original_filename.
 *
 * @param {string}  accountId
 * @param {string}  userId
 * @param {Buffer}  buffer
 * @param {{ caseId?, instrumentId?, originalFilename: string }} opts
 * @returns {object} document metadata row
 */
async function uploadDocument(accountId, userId, buffer, {
  caseId, instrumentId, originalFilename,
}) {
  await _assertInstitutionAccount(accountId);

  // Format validation (magic bytes, size)
  const fmt = validateFormat(buffer);
  if (!fmt.valid) {
    await auditService.log(
      accountId, userId, 'authority.document.upload.rejected',
      'authority_document', null,
      { reason: fmt.reason, content_type: fmt.contentType || 'unknown' },
      null
    );
    if (fmt.reason === 'oversized') {
      throw _badRequest(
        `File exceeds maximum allowed size of ${fmt.maxBytes / (1024 * 1024)} MB.`
      );
    }
    throw _badRequest(
      'Unsupported file format. Only PDF documents are accepted in this stage. ' +
      'File content must begin with the PDF signature (%PDF-).'
    );
  }

  // Verify case/instrument belong to this tenant if supplied
  if (caseId) {
    const { rows } = await pool.query(
      `SELECT id FROM authority_cases WHERE account_id = $1 AND id = $2`, [accountId, caseId]
    );
    if (!rows.length) throw _notFound();
  }
  if (instrumentId) {
    const { rows } = await pool.query(
      `SELECT id FROM authority_instruments WHERE account_id = $1 AND id = $2`,
      [accountId, instrumentId]
    );
    if (!rows.length) throw _notFound();
  }

  // Upload to private Authority bucket
  const { storageKey, contentSha256, byteSize } = await authorityStorage.upload(buffer, { accountId });

  // Encrypt the original filename
  const encryptedFilename = authorityCrypto.encrypt(originalFilename || 'document.pdf');
  const keyVersion        = authorityCrypto.getKeyVersion();

  const { rows: [doc] } = await pool.query(
    `INSERT INTO authority_documents
       (account_id, case_id, instrument_id, storage_key, original_filename,
        content_type, byte_size, content_sha256, filename_encryption_key_version, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, account_id, case_id, instrument_id, storage_key,
               content_type, byte_size, content_sha256, filename_encryption_key_version,
               status, uploaded_by, created_at`,
    [
      accountId, caseId || null, instrumentId || null,
      storageKey, encryptedFilename,
      fmt.contentType, byteSize, contentSha256, keyVersion, userId,
    ]
  );

  await auditService.log(
    accountId, userId, 'authority.document.uploaded',
    'authority_document', doc.id,
    { content_type: fmt.contentType, byte_size: byteSize },
    null
  );

  return doc;
}

async function getDocumentMetadata(accountId, documentId) {
  const { rows: [doc] } = await pool.query(
    `SELECT id, account_id, case_id, instrument_id, storage_key,
            content_type, byte_size, content_sha256, filename_encryption_key_version,
            status, uploaded_by, created_at
     FROM authority_documents
     WHERE account_id = $1 AND id = $2 AND status = 'active'`,
    [accountId, documentId]
  );
  if (!doc) throw _notFound();
  return doc;
}

/**
 * Stream an Authority document. Returns the raw storage stream.
 * The caller must pipe it to the HTTP response with correct headers.
 */
async function streamDocument(accountId, userId, documentId) {
  const doc = await getDocumentMetadata(accountId, documentId);

  const stream = await authorityStorage.getStream(doc.storage_key);

  await auditService.log(
    accountId, userId, 'authority.document.accessed',
    'authority_document', documentId,
    { content_type: doc.content_type },
    null
  );

  return { stream, doc };
}

/**
 * Delete an Authority document: removes the stored object, marks metadata deleted.
 * Does NOT implement automatic retention scheduling.
 */
async function deleteDocument(accountId, userId, documentId) {
  const doc = await getDocumentMetadata(accountId, documentId);

  // Delete from storage
  await authorityStorage.deleteObject(doc.storage_key);

  // Mark metadata as deleted
  await pool.query(
    `UPDATE authority_documents
     SET status = 'deleted', deleted_at = NOW()
     WHERE account_id = $1 AND id = $2`,
    [accountId, documentId]
  );

  await auditService.log(
    accountId, userId, 'authority.document.deleted',
    'authority_document', documentId,
    { storage_key: doc.storage_key },
    null
  );
}

module.exports = {
  // Provisioning
  provisionInstitution,
  grantCapability,
  // Parties
  createParty,
  getParty,
  updatePartyStatus,
  // Cases
  createCase,
  getCase,
  transitionCase,
  // Instruments
  createInstrument,
  getInstrument,
  transitionInstrument,
  canVerifyInstrument,
  // Case-Instrument
  linkInstrumentToCase,
  unlinkInstrumentFromCase,
  // Participants
  addParticipant,
  // Permissions
  addPermission,
  removePermission,
  // Restrictions
  addRestriction,
  // Documents
  uploadDocument,
  getDocumentMetadata,
  streamDocument,
  deleteDocument,
};
