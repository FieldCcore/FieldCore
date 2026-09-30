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

// ── Lock-order documentation ──────────────────────────────────────────────────
//
// To prevent deadlocks, all code that needs multiple row locks must acquire them
// in this order:
//   1. authority_cases row        (case_id ascending when multiple)
//   2. authority_instruments row  (instrument_id ascending when multiple)
//   3. authority_parties rows     (party_id ascending — always sorted before locking)
//
// Audit logging, storage operations, and capability checks are non-locking and
// may happen outside transaction scope.

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

// ── Active-assignment helpers ─────────────────────────────────────────────────

/**
 * When a case is HUMAN_REVIEW_IN_PROGRESS, the acting user must hold an active
 * assignment for that case.  All review mutations (notes, instrument edits, etc.)
 * call this before proceeding.
 *
 * Does nothing if the case is not in HUMAN_REVIEW_IN_PROGRESS.
 */
async function _assertIsActiveCaseAssignee(accountId, userId, caseId) {
  const kase = await getCase(accountId, caseId);
  if (kase.status !== 'HUMAN_REVIEW_IN_PROGRESS') return;
  const { rows } = await pool.query(
    `SELECT id FROM authority_review_assignments
     WHERE account_id = $1 AND case_id = $2 AND assigned_to = $3 AND status = 'active'`,
    [accountId, caseId, userId]
  );
  if (!rows.length) {
    throw _forbidden('An active case assignment is required for this operation.');
  }
}

/**
 * If the instrument is linked to any HUMAN_REVIEW_IN_PROGRESS case, the actor
 * must be the active assignee of at least one of those cases.
 *
 * Does nothing if the instrument is not under active review.
 */
async function _assertIsActiveAssigneeForInstrument(accountId, userId, instrumentId) {
  const { rows: cases } = await pool.query(
    `SELECT aci.case_id
     FROM authority_case_instruments aci
     JOIN authority_cases ac ON ac.account_id = aci.account_id AND ac.id = aci.case_id
     WHERE aci.account_id = $1 AND aci.instrument_id = $2
       AND ac.status = 'HUMAN_REVIEW_IN_PROGRESS'`,
    [accountId, instrumentId]
  );
  if (!cases.length) return;
  const caseIds = cases.map(r => r.case_id);
  const { rows: assignments } = await pool.query(
    `SELECT id FROM authority_review_assignments
     WHERE account_id = $1 AND case_id = ANY($2::uuid[]) AND assigned_to = $3 AND status = 'active'`,
    [accountId, caseIds, userId]
  );
  if (!assignments.length) {
    throw _forbidden('An active case assignment is required to edit instruments under review.');
  }
}

/**
 * Inside a transaction: if the party is a participant in any instrument linked
 * to a HUMAN_REVIEW_IN_PROGRESS case, the actor must be the active assignee of
 * at least one of those cases.
 */
async function _assertIsActiveAssigneeForParty(client, accountId, userId, partyId) {
  const { rows: cases } = await client.query(
    `SELECT DISTINCT aci.case_id
     FROM authority_instrument_parties aip
     JOIN authority_case_instruments aci
       ON aci.account_id = aip.account_id AND aci.instrument_id = aip.instrument_id
     JOIN authority_cases ac
       ON ac.account_id = aci.account_id AND ac.id = aci.case_id
     WHERE aip.account_id = $1 AND aip.party_id = $2
       AND ac.status = 'HUMAN_REVIEW_IN_PROGRESS'`,
    [accountId, partyId]
  );
  if (!cases.length) return;
  const caseIds = cases.map(r => r.case_id);
  const { rows: assignments } = await client.query(
    `SELECT id FROM authority_review_assignments
     WHERE account_id = $1 AND case_id = ANY($2::uuid[]) AND assigned_to = $3 AND status = 'active'`,
    [accountId, caseIds, userId]
  );
  if (!assignments.length) {
    throw _forbidden('An active case assignment is required to modify party identity under review.');
  }
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
async function createParty(accountId, userId, { partyType, displayName, externalReference }, txClient = null) {
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

  const { rows: [party] } = await (txClient || pool).query(
    `INSERT INTO authority_parties
       (account_id, party_type, display_name, external_reference, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, account_id, party_type, external_reference, status, created_at, updated_at`,
    [accountId, partyType, encryptedName, externalReference || null, userId]
  );

  // Canonical party-created audit — written transactionally when inside a tx so
  // the audit record is atomic with the party row (logInTx propagates errors,
  // causing the transaction to roll back if the audit write fails).
  if (txClient) {
    await auditService.logInTx(txClient,
      accountId, userId, 'authority.party.created',
      'authority_party', party.id,
      { party_type: partyType },
      null
    );
  } else {
    await auditService.log(
      accountId, userId, 'authority.party.created',
      'authority_party', party.id,
      { party_type: partyType },
      null
    );
  }

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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT id FROM authority_parties WHERE account_id = $1 AND id = $2 FOR UPDATE`,
      [accountId, partyId]
    );
    await _assertPartyMutable(client, accountId, partyId);

    const { rows: [party] } = await client.query(
      `UPDATE authority_parties
       SET status = $1, updated_at = NOW()
       WHERE account_id = $2 AND id = $3
       RETURNING id, status`,
      [status, accountId, partyId]
    );
    if (!party) { await client.query('ROLLBACK'); throw _notFound(); }
    await client.query('COMMIT');

    await auditService.log(
      accountId, userId, 'authority.party.status_changed',
      'authority_party', partyId,
      { new_status: status },
      null
    );
    return party;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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

  // Guard: AWAITING_DOCUMENTS → PENDING_EXTRACTION requires BOTH:
  //   (1) at least one same-tenant linked Authority Instrument
  //   (2) at least one active document associated with the case
  //
  // Race-safety: we lock the case row inside a transaction so that a concurrent
  // instrument-unlink or document-deletion cannot silently leave the case below
  // threshold while this transition commits.
  //
  // Lock order: case row (step 1 below) — instruments/documents are read inside
  // the same transaction while holding the case lock, so they cannot change.
  if (newStatus === 'PENDING_EXTRACTION') {
    const txClient = await pool.connect();
    try {
      await txClient.query('BEGIN');

      // Lock the case row first
      const { rows: [lockedCase] } = await txClient.query(
        `SELECT status FROM authority_cases WHERE account_id = $1 AND id = $2 FOR UPDATE`,
        [accountId, caseId]
      );
      if (!lockedCase) { await txClient.query('ROLLBACK'); throw _notFound(); }
      if (lockedCase.status !== kase.status) {
        await txClient.query('ROLLBACK');
        throw _conflict('Case status was changed concurrently. Please retry.');
      }

      // Check at least one linked instrument (same tenant)
      const { rows: [instrCount] } = await txClient.query(
        `SELECT COUNT(*) AS cnt FROM authority_case_instruments
         WHERE account_id = $1 AND case_id = $2`,
        [accountId, caseId]
      );
      if (parseInt(instrCount.cnt, 10) === 0) {
        await txClient.query('ROLLBACK');
        throw _badRequest(
          'Case cannot be submitted for extraction without at least one linked instrument.'
        );
      }

      // Check at least one active document
      const { rows: [docCount] } = await txClient.query(
        `SELECT COUNT(*) AS cnt FROM authority_documents
         WHERE account_id = $1 AND case_id = $2 AND status = 'active'`,
        [accountId, caseId]
      );
      if (parseInt(docCount.cnt, 10) === 0) {
        await txClient.query('ROLLBACK');
        throw _badRequest(
          'Case cannot be submitted for extraction without at least one linked document.'
        );
      }

      const now = new Date().toISOString();
      const { rows: [txUpdated] } = await txClient.query(
        `UPDATE authority_cases
         SET status = $1, status_changed_at = $2, updated_at = NOW()
         WHERE account_id = $3 AND id = $4 AND status = $5
         RETURNING id, status`,
        [newStatus, now, accountId, caseId, kase.status]
      );
      if (!txUpdated) {
        await txClient.query('ROLLBACK');
        throw _conflict('Case status was changed concurrently. Please retry.');
      }

      // Enqueue one extraction run per qualifying document — same transaction,
      // so the run rows are visible atomically with the case status change.
      // Lazy-require to avoid circular dependency with authorityExtractionService.
      const extractionSvc = require('./authorityExtractionService');
      await extractionSvc.enqueueExtractionRuns(txClient, accountId, caseId);

      await txClient.query('COMMIT');

      await auditService.log(
        accountId, userId, 'authority.case.transitioned',
        'authority_case', caseId,
        { from: kase.status, to: newStatus },
        null
      );
      return txUpdated;
    } catch (err) {
      try { await txClient.query('ROLLBACK'); } catch {}
      throw err;
    } finally {
      txClient.release();
    }
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

  // For terminal transitions (COMPLETED, CANCELLED) atomically end any active assignment.
  // No active assignment should remain on a terminal case.
  let updated;
  if (newStatus === 'COMPLETED' || newStatus === 'CANCELLED') {
    const termClient = await pool.connect();
    try {
      await termClient.query('BEGIN');

      const { rows: [termUpdated] } = await termClient.query(
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
      if (!termUpdated) {
        await termClient.query('ROLLBACK');
        throw _conflict('Case status was changed concurrently. Please retry.');
      }

      // End active assignments atomically
      await termClient.query(
        `UPDATE authority_review_assignments
         SET status = 'completed', completed_at = NOW(), updated_at = NOW()
         WHERE account_id = $1 AND case_id = $2 AND status = 'active'`,
        [accountId, caseId]
      );

      await termClient.query('COMMIT');
      updated = termUpdated;
    } catch (err) {
      try { await termClient.query('ROLLBACK'); } catch {}
      throw err;
    } finally {
      termClient.release();
    }
  } else {
    const { rows: [nonTermUpdated] } = await pool.query(
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
    if (!nonTermUpdated) {
      throw _conflict('Case status was changed concurrently. Please retry.');
    }
    updated = nonTermUpdated;
  }

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

async function getInstrumentDetail(accountId, instrumentId) {
  const instr = await getInstrument(accountId, instrumentId);

  const [{ rows: participants }, { rows: permissions }] = await Promise.all([
    pool.query(
      `SELECT aip.id, aip.party_id, aip.role, aip.sequence, aip.status, aip.conditions,
              ap.party_type, ap.display_name AS encrypted_name, ap.external_reference
       FROM authority_instrument_parties aip
       JOIN authority_parties ap ON ap.account_id = aip.account_id AND ap.id = aip.party_id
       WHERE aip.account_id = $1 AND aip.instrument_id = $2
       ORDER BY aip.sequence ASC NULLS LAST, aip.created_at ASC`,
      [accountId, instrumentId]
    ),
    pool.query(
      `SELECT id, action_key, grant_type, participant_id, created_at
       FROM authority_permissions
       WHERE account_id = $1 AND instrument_id = $2
       ORDER BY created_at ASC`,
      [accountId, instrumentId]
    ),
  ]);

  return {
    ...instr,
    participants: participants.map(p => ({
      ...p,
      display_name: (() => {
        try { return authorityCrypto.decrypt(p.encrypted_name); } catch { return null; }
      })(),
      encrypted_name: undefined,
    })),
    permissions,
  };
}

async function listInstruments(accountId, { limit = 50, offset = 0, status } = {}) {
  await _assertInstitutionAccount(accountId);
  const safeLimit  = Math.min(Math.max(parseInt(limit,  10) || 50, 1), 200);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
  const params = [accountId];
  let filter = '';
  if (status) {
    params.push(status);
    filter = `AND status = $${params.length}`;
  }
  params.push(safeLimit, safeOffset);
  const { rows } = await pool.query(
    `SELECT id, instrument_type, status, effective_date, expiration_date,
            jurisdiction, created_at, updated_at
     FROM authority_instruments
     WHERE account_id = $1 ${filter}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
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
  //
  // Race-safety (lock order: instrument → parties in ID order):
  //   We lock the instrument row first, then lock all participant party rows in
  //   ascending ID order.  This prevents a concurrent party identity update from
  //   silently changing a party after verification commits.
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

    // Require active assignment for this instrument's HUMAN_REVIEW_IN_PROGRESS case
    await _assertIsActiveAssigneeForInstrument(accountId, userId, instrumentId);

    const verifyClient = await pool.connect();
    try {
      await verifyClient.query('BEGIN');

      // Lock instrument row (step 2 in lock order — case lock not needed here)
      const { rows: [lockedInstr] } = await verifyClient.query(
        `SELECT status FROM authority_instruments WHERE account_id = $1 AND id = $2 FOR UPDATE`,
        [accountId, instrumentId]
      );
      if (!lockedInstr || lockedInstr.status !== 'PENDING_REVIEW') {
        await verifyClient.query('ROLLBACK');
        if (!lockedInstr) throw _notFound();
        throw _conflict('Instrument status changed concurrently. Please retry.');
      }

      // Lock all participant party rows in ascending ID order (step 3 in lock order)
      const { rows: partyRows } = await verifyClient.query(
        `SELECT DISTINCT aip.party_id
         FROM authority_instrument_parties aip
         WHERE aip.account_id = $1 AND aip.instrument_id = $2
         ORDER BY aip.party_id ASC`,
        [accountId, instrumentId]
      );
      if (partyRows.length > 0) {
        const partyIds = partyRows.map(r => r.party_id);
        await verifyClient.query(
          `SELECT id FROM authority_parties
           WHERE account_id = $1 AND id = ANY($2::uuid[])
           ORDER BY id ASC
           FOR UPDATE`,
          [accountId, partyIds]
        );
      }

      const now = new Date().toISOString();
      const { rows: [verifyUpdated] } = await verifyClient.query(
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
      if (!verifyUpdated) {
        await verifyClient.query('ROLLBACK');
        throw _conflict('Instrument status changed concurrently. Please retry.');
      }

      await verifyClient.query('COMMIT');

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
      return verifyUpdated;
    } catch (err) {
      try { await verifyClient.query('ROLLBACK'); } catch {}
      throw err;
    } finally {
      verifyClient.release();
    }
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

    // Require active assignment for rejection when case is under human review
    await _assertIsActiveAssigneeForInstrument(accountId, userId, instrumentId);

    // Lock order: instrument row (step 2), then party rows ascending (step 3) — same as VERIFIED.
    // This prevents a concurrent party identity update from committing after REJECTED finalizes.
    const rejectClient = await pool.connect();
    try {
      await rejectClient.query('BEGIN');

      // Lock instrument row
      const { rows: [lockedInstr] } = await rejectClient.query(
        `SELECT status FROM authority_instruments WHERE account_id = $1 AND id = $2 FOR UPDATE`,
        [accountId, instrumentId]
      );
      if (!lockedInstr) { await rejectClient.query('ROLLBACK'); throw _notFound(); }
      if (lockedInstr.status !== 'PENDING_REVIEW') {
        await rejectClient.query('ROLLBACK');
        throw _conflict('Instrument status changed concurrently. Please retry.');
      }

      // Lock linked party rows in ascending ID order
      const { rows: partyRows } = await rejectClient.query(
        `SELECT DISTINCT aip.party_id
         FROM authority_instrument_parties aip
         WHERE aip.account_id = $1 AND aip.instrument_id = $2
         ORDER BY aip.party_id ASC`,
        [accountId, instrumentId]
      );
      if (partyRows.length > 0) {
        await rejectClient.query(
          `SELECT id FROM authority_parties
           WHERE account_id = $1 AND id = ANY($2::uuid[])
           ORDER BY id ASC
           FOR UPDATE`,
          [accountId, partyRows.map(r => r.party_id)]
        );
      }

      const { rows: [updated] } = await rejectClient.query(
        `UPDATE authority_instruments
         SET status = 'REJECTED', rejected_at = NOW(),
             rejection_reason = $1, updated_at = NOW()
         WHERE account_id = $2 AND id = $3 AND status = 'PENDING_REVIEW'
         RETURNING id, status`,
        [opts.rejectionReason || null, accountId, instrumentId]
      );
      if (!updated) { await rejectClient.query('ROLLBACK'); throw _conflict('Instrument status changed concurrently. Please retry.'); }

      await rejectClient.query('COMMIT');

      await auditService.log(
        accountId, userId, 'authority.instrument.rejected',
        'authority_instrument', instrumentId,
        { rejection_reason: opts.rejectionReason || null },
        null
      );
      return updated;
    } catch (err) {
      try { await rejectClient.query('ROLLBACK'); } catch {}
      throw err;
    } finally {
      rejectClient.release();
    }
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
  // Lock the case row first (same lock order as transitionCase) so that a concurrent
  // PENDING_EXTRACTION transition cannot read a stale instrument count.
  const ulClient = await pool.connect();
  try {
    await ulClient.query('BEGIN');

    const { rows: [kase] } = await ulClient.query(
      `SELECT id FROM authority_cases WHERE account_id = $1 AND id = $2 FOR UPDATE`,
      [accountId, caseId]
    );
    if (!kase) throw _notFound();

    const { rows } = await ulClient.query(
      `DELETE FROM authority_case_instruments
       WHERE account_id = $1 AND case_id = $2 AND instrument_id = $3
       RETURNING id`,
      [accountId, caseId, instrumentId]
    );
    if (!rows.length) throw _notFound();

    await ulClient.query('COMMIT');
  } catch (err) {
    await ulClient.query('ROLLBACK');
    throw err;
  } finally {
    ulClient.release();
  }

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
  // Pre-flight: active assignee check (read-only, outside transaction)
  await _assertIsActiveAssigneeForInstrument(accountId, userId, instrumentId);

  if (!VALID_PARTICIPANT_ROLES.has(role)) {
    throw _badRequest(
      `Invalid role "${role}". Valid roles: ${[...VALID_PARTICIPANT_ROLES].join(', ')}.`
    );
  }

  // Lock instrument row (canonical step 2) before INSERT so a concurrent finalization
  // cannot commit while we are adding a participant relationship.
  const addClient = await pool.connect();
  try {
    await addClient.query('BEGIN');

    const { rows: [lockedInstr] } = await addClient.query(
      `SELECT status FROM authority_instruments WHERE account_id = $1 AND id = $2 FOR UPDATE`,
      [accountId, instrumentId]
    );
    if (!lockedInstr) { await addClient.query('ROLLBACK'); throw _notFound(); }
    if (LOCKED_INSTRUMENT_STATUSES.has(lockedInstr.status)) {
      await addClient.query('ROLLBACK');
      throw _conflict(
        `Instrument is ${lockedInstr.status} — participants, permissions, and restrictions are locked.`
      );
    }

    // Party must belong to same tenant (checked inside transaction)
    const { rows: [party] } = await addClient.query(
      `SELECT id FROM authority_parties WHERE account_id = $1 AND id = $2`,
      [accountId, partyId]
    );
    if (!party) { await addClient.query('ROLLBACK'); throw _notFound(); }

    const { rows: [participant] } = await addClient.query(
      `INSERT INTO authority_instrument_parties
         (account_id, instrument_id, party_id, role, sequence, conditions)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, account_id, instrument_id, party_id, role, sequence, status, conditions,
                 created_at, updated_at`,
      [accountId, instrumentId, partyId, role,
       sequence !== undefined ? sequence : null,
       conditions ? JSON.stringify(conditions) : null]
    );

    await addClient.query('COMMIT');

    await auditService.log(
      accountId, userId, 'authority.participant.added',
      'authority_instrument_parties', participant.id,
      { instrument_id: instrumentId, party_id: partyId, role },
      null
    );
    return participant;
  } catch (err) {
    try { await addClient.query('ROLLBACK'); } catch {}
    if (err.code === '23505') {
      throw _conflict(`Party already holds role "${role}" on this instrument.`);
    }
    throw err;
  } finally {
    addClient.release();
  }
}

// ── Permissions ───────────────────────────────────────────────────────────────

async function addPermission(accountId, userId, instrumentId, {
  actionKey, grantType = 'granted', participantId,
}) {
  await _assertInstrumentEditable(accountId, instrumentId);
  await _assertIsActiveAssigneeForInstrument(accountId, userId, instrumentId);

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
  await _assertInstrumentEditable(accountId, instrumentId);
  await _assertIsActiveAssigneeForInstrument(accountId, userId, instrumentId);

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

// ── Lifecycle lock helper ─────────────────────────────────────────────────────

const LOCKED_INSTRUMENT_STATUSES = new Set(['VERIFIED', 'REJECTED', 'REVOKED', 'EXPIRED', 'SUPERSEDED']);

async function _assertInstrumentEditable(accountId, instrumentId) {
  const instr = await getInstrument(accountId, instrumentId);
  if (LOCKED_INSTRUMENT_STATUSES.has(instr.status)) {
    throw _conflict(
      `Instrument is ${instr.status} — participants, permissions, and restrictions are locked.`
    );
  }
  return instr;
}

// ── Participant management (with lifecycle lock) ───────────────────────────────

async function removeParticipant(accountId, userId, instrumentId, participantId) {
  // Pre-flight: active assignee check (read-only, outside transaction)
  await _assertIsActiveAssigneeForInstrument(accountId, userId, instrumentId);

  // Lock instrument row (canonical step 2) before DELETE to prevent a concurrent
  // finalization from committing while the participant relationship is changing.
  const rmClient = await pool.connect();
  try {
    await rmClient.query('BEGIN');

    const { rows: [lockedInstr] } = await rmClient.query(
      `SELECT status FROM authority_instruments WHERE account_id = $1 AND id = $2 FOR UPDATE`,
      [accountId, instrumentId]
    );
    if (!lockedInstr) { await rmClient.query('ROLLBACK'); throw _notFound(); }
    if (LOCKED_INSTRUMENT_STATUSES.has(lockedInstr.status)) {
      await rmClient.query('ROLLBACK');
      throw _conflict(
        `Instrument is ${lockedInstr.status} — participants, permissions, and restrictions are locked.`
      );
    }

    const { rows } = await rmClient.query(
      `DELETE FROM authority_instrument_parties
       WHERE account_id = $1 AND instrument_id = $2 AND id = $3
       RETURNING id`,
      [accountId, instrumentId, participantId]
    );
    if (!rows.length) { await rmClient.query('ROLLBACK'); throw _notFound(); }

    await rmClient.query('COMMIT');
  } catch (err) {
    try { await rmClient.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    rmClient.release();
  }

  await auditService.log(
    accountId, userId, 'authority.participant.removed',
    'authority_instrument_parties', participantId,
    { instrument_id: instrumentId },
    null
  );
}

async function updateParticipantStatus(accountId, userId, instrumentId, participantId, status) {
  // Pre-flight: active assignee check (read-only, outside transaction)
  await _assertIsActiveAssigneeForInstrument(accountId, userId, instrumentId);

  if (!['active', 'inactive'].includes(status)) {
    throw _badRequest(`Invalid participant status "${status}".`);
  }

  // Lock instrument row (canonical step 2) before UPDATE
  const upClient = await pool.connect();
  let p;
  try {
    await upClient.query('BEGIN');

    const { rows: [lockedInstr] } = await upClient.query(
      `SELECT status FROM authority_instruments WHERE account_id = $1 AND id = $2 FOR UPDATE`,
      [accountId, instrumentId]
    );
    if (!lockedInstr) { await upClient.query('ROLLBACK'); throw _notFound(); }
    if (LOCKED_INSTRUMENT_STATUSES.has(lockedInstr.status)) {
      await upClient.query('ROLLBACK');
      throw _conflict(
        `Instrument is ${lockedInstr.status} — participants, permissions, and restrictions are locked.`
      );
    }

    const { rows: [updated] } = await upClient.query(
      `UPDATE authority_instrument_parties
       SET status = $1, updated_at = NOW()
       WHERE account_id = $2 AND instrument_id = $3 AND id = $4
       RETURNING id, status`,
      [status, accountId, instrumentId, participantId]
    );
    if (!updated) { await upClient.query('ROLLBACK'); throw _notFound(); }
    p = updated;

    await upClient.query('COMMIT');
  } catch (err) {
    try { await upClient.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    upClient.release();
  }
  if (!p) throw _notFound();

  await auditService.log(
    accountId, userId, 'authority.participant.status_changed',
    'authority_instrument_parties', participantId,
    { instrument_id: instrumentId, new_status: status },
    null
  );
  return p;
}

// ── Permission removal (with lifecycle lock) ───────────────────────────────────

async function removePermissionById(accountId, userId, instrumentId, permissionId) {
  await _assertInstrumentEditable(accountId, instrumentId);
  await _assertIsActiveAssigneeForInstrument(accountId, userId, instrumentId);

  const { rows } = await pool.query(
    `DELETE FROM authority_permissions
     WHERE account_id = $1 AND instrument_id = $2 AND id = $3
     RETURNING id`,
    [accountId, instrumentId, permissionId]
  );
  if (!rows.length) throw _notFound();

  await auditService.log(
    accountId, userId, 'authority.permission.removed',
    'authority_permissions', permissionId,
    { instrument_id: instrumentId },
    null
  );
}

// ── Restriction management (with lifecycle lock) ──────────────────────────────

async function removeRestriction(accountId, userId, instrumentId, restrictionId) {
  await _assertInstrumentEditable(accountId, instrumentId);
  await _assertIsActiveAssigneeForInstrument(accountId, userId, instrumentId);

  const { rows } = await pool.query(
    `DELETE FROM authority_restrictions
     WHERE account_id = $1 AND instrument_id = $2 AND id = $3
     RETURNING id`,
    [accountId, instrumentId, restrictionId]
  );
  if (!rows.length) throw _notFound();

  await auditService.log(
    accountId, userId, 'authority.restriction.removed',
    'authority_restrictions', restrictionId,
    { instrument_id: instrumentId },
    null
  );
}

// ── Party updates with Invariant B protection ─────────────────────────────────

/**
 * Check whether a party is protected from mutation because it is a participant
 * in one or more VERIFIED instruments. Uses SELECT FOR UPDATE inside a client
 * transaction to be race-safe.
 *
 * @param {import('pg').PoolClient} client
 * @param {string} accountId
 * @param {string} partyId
 */
// Protected instrument statuses — party identity is immutable once ANY linked instrument
// reaches one of these states.  Matches LOCKED_INSTRUMENT_STATUSES but is checked via the
// party ↔ instrument join rather than the instrument table directly.
const PROTECTED_INSTRUMENT_STATUSES_SQL =
  `'VERIFIED','REJECTED','REVOKED','EXPIRED','SUPERSEDED'`;

async function _assertPartyMutable(client, accountId, partyId) {
  const { rows } = await client.query(
    `SELECT COUNT(*) AS cnt
     FROM authority_instrument_parties aip
     JOIN authority_instruments ai
       ON ai.account_id = aip.account_id AND ai.id = aip.instrument_id
     WHERE aip.account_id = $1 AND aip.party_id = $2
       AND ai.status IN ('VERIFIED','REJECTED','REVOKED','EXPIRED','SUPERSEDED')`,
    [accountId, partyId]
  );
  if (parseInt(rows[0].cnt, 10) > 0) {
    throw _conflict(
      'Party is a participant in one or more finalized instruments (VERIFIED, REJECTED, REVOKED, ' +
      'EXPIRED, or SUPERSEDED). Historical records are immutable — this party cannot be modified.'
    );
  }
}

async function updatePartyDisplayName(accountId, userId, partyId, displayName) {
  if (!displayName || !String(displayName).trim()) {
    throw _badRequest('displayName is required.');
  }
  const trimmed = String(displayName).trim();
  const client  = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock party row first (consistent lock order: party before instrument reads)
    await client.query(
      `SELECT id FROM authority_parties WHERE account_id = $1 AND id = $2 FOR UPDATE`,
      [accountId, partyId]
    );

    await _assertPartyMutable(client, accountId, partyId);
    await _assertIsActiveAssigneeForParty(client, accountId, userId, partyId);

    const encryptedName = authorityCrypto.encrypt(trimmed);
    const { rows: [p] } = await client.query(
      `UPDATE authority_parties
       SET display_name = $1, updated_at = NOW()
       WHERE account_id = $2 AND id = $3
       RETURNING id`,
      [encryptedName, accountId, partyId]
    );
    if (!p) { await client.query('ROLLBACK'); throw _notFound(); }

    await client.query('COMMIT');
    await auditService.log(
      accountId, userId, 'authority.party.display_name_changed',
      'authority_party', partyId, {}, null
    );
    return { id: p.id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Human Review Queue & Assignment ──────────────────────────────────────────

async function _assertReviewCapability(userId) {
  const [canVerify, canReject] = await Promise.all([
    _hasCapability(userId, 'AUTHORITY_INSTRUMENT_VERIFY'),
    _hasCapability(userId, 'AUTHORITY_INSTRUMENT_REJECT'),
  ]);
  if (!canVerify && !canReject) {
    throw _forbidden(
      'AUTHORITY_INSTRUMENT_VERIFY or AUTHORITY_INSTRUMENT_REJECT capability is required.'
    );
  }
}

/**
 * Returns cases in PENDING_HUMAN_REVIEW or HUMAN_REVIEW_IN_PROGRESS,
 * enriched with document count, instrument count, and active assignment.
 */
async function getReviewQueue(accountId, userId) {
  await _assertInstitutionAccount(accountId);
  await _assertReviewCapability(userId);

  const { rows } = await pool.query(
    `SELECT
       ac.id,
       ac.external_case_reference,
       ac.status,
       ac.created_at,
       ac.status_changed_at,
       COALESCE(doc_counts.cnt, 0)  AS document_count,
       COALESCE(instr_counts.cnt, 0) AS instrument_count,
       ra.assigned_to,
       ra.claimed_at,
       u.name AS reviewer_name
     FROM authority_cases ac
     LEFT JOIN (
       SELECT case_id, account_id, COUNT(*) AS cnt
       FROM authority_documents
       WHERE status = 'active'
       GROUP BY case_id, account_id
     ) doc_counts   ON doc_counts.case_id = ac.id   AND doc_counts.account_id = ac.account_id
     LEFT JOIN (
       SELECT case_id, account_id, COUNT(*) AS cnt
       FROM authority_case_instruments
       GROUP BY case_id, account_id
     ) instr_counts ON instr_counts.case_id = ac.id AND instr_counts.account_id = ac.account_id
     LEFT JOIN LATERAL (
       SELECT assigned_to, claimed_at
       FROM authority_review_assignments
       WHERE account_id = ac.account_id AND case_id = ac.id AND status = 'active'
       ORDER BY claimed_at ASC
       LIMIT 1
     ) ra ON true
     LEFT JOIN users u ON u.id = ra.assigned_to
     WHERE ac.account_id = $1
       AND ac.status IN ('PENDING_HUMAN_REVIEW', 'HUMAN_REVIEW_IN_PROGRESS')
     ORDER BY ac.status_changed_at ASC`,
    [accountId]
  );
  return rows;
}

/**
 * Claim a case for review.
 *
 * Race-safety: the case row is locked inside a transaction before inserting
 * the assignment.  The partial unique index on (account_id, case_id) WHERE
 * status = 'active' provides the final DB-level guarantee that only one active
 * assignment can exist per case at any moment; a concurrent claim by a second
 * reviewer will fail with a unique_violation (23505) converted to a 409 here.
 */
async function claimCase(accountId, userId, caseId) {
  await _assertInstitutionAccount(accountId);
  await _assertReviewCapability(userId);

  const claimClient = await pool.connect();
  try {
    await claimClient.query('BEGIN');

    // Lock the case row first (lock order: case)
    const { rows: [kase] } = await claimClient.query(
      `SELECT id, status FROM authority_cases WHERE account_id = $1 AND id = $2 FOR UPDATE`,
      [accountId, caseId]
    );
    if (!kase) { await claimClient.query('ROLLBACK'); throw _notFound(); }

    if (kase.status !== 'PENDING_HUMAN_REVIEW' && kase.status !== 'HUMAN_REVIEW_IN_PROGRESS') {
      await claimClient.query('ROLLBACK');
      throw _badRequest(
        `Case is in status ${kase.status}. Only cases in PENDING_HUMAN_REVIEW or ` +
        `HUMAN_REVIEW_IN_PROGRESS can be claimed.`
      );
    }

    // Transition to HUMAN_REVIEW_IN_PROGRESS inside the same transaction if needed
    if (kase.status === 'PENDING_HUMAN_REVIEW') {
      await claimClient.query(
        `UPDATE authority_cases
         SET status = 'HUMAN_REVIEW_IN_PROGRESS', status_changed_at = NOW(), updated_at = NOW()
         WHERE account_id = $1 AND id = $2 AND status = 'PENDING_HUMAN_REVIEW'`,
        [accountId, caseId]
      );
    }

    // Insert assignment — the partial unique index prevents a second concurrent active assignment
    const { rows: [assignment] } = await claimClient.query(
      `INSERT INTO authority_review_assignments
         (account_id, case_id, assigned_to, assigned_by)
       VALUES ($1, $2, $3, $3)
       RETURNING id, case_id, assigned_to, status, claimed_at`,
      [accountId, caseId, userId]
    );

    await claimClient.query('COMMIT');

    await auditService.log(
      accountId, userId, 'authority.case.claimed',
      'authority_case', caseId,
      { assignment_id: assignment.id },
      null
    );
    return assignment;
  } catch (err) {
    try { await claimClient.query('ROLLBACK'); } catch {}
    // Partial unique index violation: another reviewer claimed first
    if (err.code === '23505') throw _conflict('Case is already claimed by another reviewer.');
    throw err;
  } finally {
    claimClient.release();
  }
}

// releaseCase has been removed (Issue 2).
// Standalone release leaves a HUMAN_REVIEW_IN_PROGRESS case with no active reviewer
// and there is no approved lifecycle edge back to PENDING_HUMAN_REVIEW in this stage.
// Assignment lifecycle ends automatically when the case reaches COMPLETED or CANCELLED.

/**
 * Assign a reviewer to a case (admin operation — assigns any target user).
 * Uses the same row-lock + partial-unique-index discipline as claimCase.
 */
async function assignReviewer(accountId, actorUserId, caseId, targetUserId) {
  await _assertInstitutionAccount(accountId);
  await _assertReviewCapability(actorUserId);

  // Verify target user exists in same account (outside transaction; read-only)
  const { rows: [targetUser] } = await pool.query(
    `SELECT id FROM users WHERE account_id = $1 AND id = $2`,
    [accountId, targetUserId]
  );
  if (!targetUser) throw _notFound();

  const assignClient = await pool.connect();
  try {
    await assignClient.query('BEGIN');

    const { rows: [kase] } = await assignClient.query(
      `SELECT id, status FROM authority_cases WHERE account_id = $1 AND id = $2 FOR UPDATE`,
      [accountId, caseId]
    );
    if (!kase) { await assignClient.query('ROLLBACK'); throw _notFound(); }

    if (kase.status !== 'PENDING_HUMAN_REVIEW' && kase.status !== 'HUMAN_REVIEW_IN_PROGRESS') {
      await assignClient.query('ROLLBACK');
      throw _badRequest(`Case must be in PENDING_HUMAN_REVIEW or HUMAN_REVIEW_IN_PROGRESS to assign a reviewer.`);
    }

    if (kase.status === 'PENDING_HUMAN_REVIEW') {
      await assignClient.query(
        `UPDATE authority_cases
         SET status = 'HUMAN_REVIEW_IN_PROGRESS', status_changed_at = NOW(), updated_at = NOW()
         WHERE account_id = $1 AND id = $2 AND status = 'PENDING_HUMAN_REVIEW'`,
        [accountId, caseId]
      );
    }

    const { rows: [assignment] } = await assignClient.query(
      `INSERT INTO authority_review_assignments
         (account_id, case_id, assigned_to, assigned_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, case_id, assigned_to, status, claimed_at`,
      [accountId, caseId, targetUserId, actorUserId]
    );

    await assignClient.query('COMMIT');

    await auditService.log(
      accountId, actorUserId, 'authority.case.reviewer_assigned',
      'authority_case', caseId,
      { assigned_to: targetUserId },
      null
    );
    return assignment;
  } catch (err) {
    try { await assignClient.query('ROLLBACK'); } catch {}
    if (err.code === '23505') throw _conflict('Case is already claimed by another reviewer.');
    throw err;
  } finally {
    assignClient.release();
  }
}

/**
 * Returns a full case workspace: case metadata, linked instruments (with participants,
 * permissions, restrictions), linked documents, active assignments, and recent notes.
 */
async function getReviewWorkspace(accountId, userId, caseId) {
  await _assertInstitutionAccount(accountId);

  const kase = await getCase(accountId, caseId);

  // Linked instruments
  const { rows: instruments } = await pool.query(
    `SELECT ai.id, ai.instrument_type, ai.status, ai.effective_date, ai.expiration_date,
            ai.jurisdiction, ai.verified_at, ai.verified_by_user_id,
            ai.rejected_at, ai.rejection_reason,
            ai.revoked_at, ai.revocation_reason,
            ai.created_at
     FROM authority_case_instruments aci
     JOIN authority_instruments ai ON ai.account_id = aci.account_id AND ai.id = aci.instrument_id
     WHERE aci.account_id = $1 AND aci.case_id = $2
     ORDER BY ai.created_at ASC`,
    [accountId, caseId]
  );

  // For each instrument, load parties, permissions, restrictions
  const enrichedInstruments = await Promise.all(instruments.map(async (instr) => {
    const [{ rows: participants }, { rows: permissions }, { rows: restrictions }] = await Promise.all([
      pool.query(
        `SELECT aip.id, aip.party_id, aip.role, aip.sequence, aip.status, aip.conditions,
                ap.party_type, ap.display_name AS encrypted_name, ap.external_reference
         FROM authority_instrument_parties aip
         JOIN authority_parties ap ON ap.account_id = aip.account_id AND ap.id = aip.party_id
         WHERE aip.account_id = $1 AND aip.instrument_id = $2
         ORDER BY aip.sequence ASC NULLS LAST, aip.created_at ASC`,
        [accountId, instr.id]
      ),
      pool.query(
        `SELECT id, action_key, grant_type, participant_id, created_at
         FROM authority_permissions
         WHERE account_id = $1 AND instrument_id = $2
         ORDER BY created_at ASC`,
        [accountId, instr.id]
      ),
      pool.query(
        `SELECT id, restriction_type, parameters, participant_id, permission_id,
                effective_from, effective_to, created_at
         FROM authority_restrictions
         WHERE account_id = $1 AND instrument_id = $2
         ORDER BY created_at ASC`,
        [accountId, instr.id]
      ),
    ]);

    return {
      ...instr,
      participants: participants.map(p => ({
        ...p,
        display_name: (() => {
          try { return authorityCrypto.decrypt(p.encrypted_name); } catch { return null; }
        })(),
        encrypted_name: undefined,
      })),
      permissions,
      restrictions,
    };
  }));

  // Linked documents
  const { rows: documents } = await pool.query(
    `SELECT id, content_type, byte_size, status, created_at
     FROM authority_documents
     WHERE account_id = $1 AND case_id = $2 AND status = 'active'
     ORDER BY created_at ASC`,
    [accountId, caseId]
  );

  // Active assignments
  const { rows: assignments } = await pool.query(
    `SELECT ara.id, ara.assigned_to, ara.assigned_by, ara.status, ara.claimed_at,
            u.name AS reviewer_name
     FROM authority_review_assignments ara
     LEFT JOIN users u ON u.id = ara.assigned_to
     WHERE ara.account_id = $1 AND ara.case_id = $2 AND ara.status = 'active'
     ORDER BY ara.claimed_at ASC`,
    [accountId, caseId]
  );

  // Recent notes — decrypt body before returning
  const { rows: rawNotes } = await pool.query(
    `SELECT arn.id, arn.body, arn.note_body_key_version, arn.created_at, arn.instrument_id,
            u.name AS author_name
     FROM authority_review_notes arn
     LEFT JOIN users u ON u.id = arn.created_by
     WHERE arn.account_id = $1 AND arn.case_id = $2
     ORDER BY arn.created_at DESC
     LIMIT 50`,
    [accountId, caseId]
  );
  const notes = rawNotes.map(n => ({
    ...n,
    body: n.note_body_key_version
      ? (() => { try { return authorityCrypto.decrypt(n.body); } catch { return '[encrypted]'; } })()
      : n.body,
    note_body_key_version: undefined,
  }));

  await auditService.log(
    accountId, userId, 'authority.case.workspace_accessed',
    'authority_case', caseId, {}, null
  );

  return { case: kase, instruments: enrichedInstruments, documents, assignments, notes };
}

// ── Review Notes ──────────────────────────────────────────────────────────────

async function addReviewNote(accountId, userId, caseId, body, instrumentId) {
  await _assertInstitutionAccount(accountId);

  if (!body || !String(body).trim()) {
    throw _badRequest('Note body is required.');
  }
  if (body.length > 10000) {
    throw _badRequest('Note body must not exceed 10,000 characters.');
  }

  // Require active assignment when case is in HUMAN_REVIEW_IN_PROGRESS
  await _assertIsActiveCaseAssignee(accountId, userId, caseId);

  // Verify instrument belongs to tenant if provided
  if (instrumentId) {
    await getInstrument(accountId, instrumentId);
  }

  // Encrypt the note body — notes may contain PII (party names, addresses, etc.)
  const trimmed        = String(body).trim();
  const encryptedBody  = authorityCrypto.encrypt(trimmed);
  const keyVersion     = authorityCrypto.getKeyVersion();

  const { rows: [note] } = await pool.query(
    `INSERT INTO authority_review_notes
       (account_id, case_id, instrument_id, body, note_body_key_version, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, case_id, instrument_id, body, note_body_key_version, created_at`,
    [accountId, caseId, instrumentId || null, encryptedBody, keyVersion, userId]
  );

  await auditService.log(
    accountId, userId, 'authority.review_note.added',
    'authority_review_notes', note.id,
    // Do NOT log the plaintext body in audit metadata
    { case_id: caseId, instrument_id: instrumentId || null },
    null
  );

  // Return with decrypted body for the caller
  return {
    ...note,
    body: trimmed,
  };
}

async function getReviewNotes(accountId, caseId, { instrumentId } = {}) {
  await _assertInstitutionAccount(accountId);
  await getCase(accountId, caseId);

  const params = [accountId, caseId];
  let filterClause = '';
  if (instrumentId) {
    params.push(instrumentId);
    filterClause = `AND arn.instrument_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT arn.id, arn.body, arn.note_body_key_version, arn.created_at, arn.instrument_id,
            u.name AS author_name
     FROM authority_review_notes arn
     LEFT JOIN users u ON u.id = arn.created_by
     WHERE arn.account_id = $1 AND arn.case_id = $2 ${filterClause}
     ORDER BY arn.created_at DESC`,
    params
  );
  return rows.map(n => ({
    ...n,
    body: n.note_body_key_version
      ? (() => { try { return authorityCrypto.decrypt(n.body); } catch { return '[encrypted]'; } })()
      : n.body,
    note_body_key_version: undefined,
  }));
}

// ── Audit Activity Feed ───────────────────────────────────────────────────────

async function getAuditActivity(accountId, subjectType, subjectId) {
  await _assertInstitutionAccount(accountId);

  // Map our entity types to audit_logs entity values and confirm tenant ownership
  if (subjectType === 'case') {
    await getCase(accountId, subjectId);
  } else if (subjectType === 'instrument') {
    await getInstrument(accountId, subjectId);
  } else {
    throw _badRequest('subjectType must be "case" or "instrument".');
  }

  const entityMap = { case: 'authority_case', instrument: 'authority_instrument' };
  const entity    = entityMap[subjectType];

  const { rows } = await pool.query(
    `SELECT al.id, al.action, al.details, al.created_at,
            u.name AS actor_name
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.account_id = $1
       AND al.entity = $2
       AND al.entity_id = $3
     ORDER BY al.created_at DESC
     LIMIT 200`,
    [accountId, entity, subjectId]
  );
  return rows;
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

  // Lock the associated case row (if any) before touching document count, so a concurrent
  // PENDING_EXTRACTION transition cannot read a stale active-document count.
  if (doc.case_id) {
    const delClient = await pool.connect();
    try {
      await delClient.query('BEGIN');
      await delClient.query(
        `SELECT id FROM authority_cases WHERE account_id = $1 AND id = $2 FOR UPDATE`,
        [accountId, doc.case_id]
      );
      await delClient.query(
        `UPDATE authority_documents
         SET status = 'deleted', deleted_at = NOW()
         WHERE account_id = $1 AND id = $2`,
        [accountId, documentId]
      );
      await delClient.query('COMMIT');
    } catch (err) {
      await delClient.query('ROLLBACK');
      throw err;
    } finally {
      delClient.release();
    }
  } else {
    await pool.query(
      `UPDATE authority_documents
       SET status = 'deleted', deleted_at = NOW()
       WHERE account_id = $1 AND id = $2`,
      [accountId, documentId]
    );
  }

  // Delete from storage after DB commit so the record is never orphaned
  await authorityStorage.deleteObject(doc.storage_key);

  await auditService.log(
    accountId, userId, 'authority.document.deleted',
    'authority_document', documentId,
    { storage_key: doc.storage_key },
    null
  );
}

// ── List Cases ────────────────────────────────────────────────────────────────

async function listCases(accountId, { status, limit = 50, offset = 0 } = {}) {
  await _assertInstitutionAccount(accountId);

  const params = [accountId];
  let statusClause = '';
  if (status) {
    params.push(status);
    statusClause = `AND ac.status = $${params.length}`;
  }
  params.push(Math.min(Number(limit) || 50, 200));
  params.push(Math.max(Number(offset) || 0, 0));

  const { rows } = await pool.query(
    `SELECT ac.id, ac.status, ac.external_case_reference, ac.created_at, ac.updated_at,
            COUNT(DISTINCT aci.instrument_id)::int AS instrument_count,
            COUNT(CASE WHEN ad.status = 'active' THEN 1 END)::int AS document_count,
            (SELECT ara.assigned_to
             FROM authority_review_assignments ara
             WHERE ara.account_id = ac.account_id AND ara.case_id = ac.id AND ara.status = 'active'
             LIMIT 1) AS assigned_to,
            (SELECT u.name
             FROM authority_review_assignments ara
             JOIN users u ON u.id = ara.assigned_to
             WHERE ara.account_id = ac.account_id AND ara.case_id = ac.id AND ara.status = 'active'
             LIMIT 1) AS reviewer_name
     FROM authority_cases ac
     LEFT JOIN authority_case_instruments aci
           ON aci.account_id = ac.account_id AND aci.case_id = ac.id
     LEFT JOIN authority_documents ad
           ON ad.account_id = ac.account_id AND ad.case_id = ac.id
     WHERE ac.account_id = $1 ${statusClause}
     GROUP BY ac.id
     ORDER BY ac.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

// ── List Parties ──────────────────────────────────────────────────────────────

async function listParties(accountId, { limit = 50, offset = 0 } = {}) {
  await _assertInstitutionAccount(accountId);

  const { rows } = await pool.query(
    `SELECT id, party_type, display_name AS encrypted_name, external_reference,
            status, created_at, updated_at
     FROM authority_parties
     WHERE account_id = $1 AND status != 'deleted'
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [accountId, Math.min(Number(limit) || 50, 200), Math.max(Number(offset) || 0, 0)]
  );
  return rows.map(p => ({
    ...p,
    display_name: (() => {
      try { return authorityCrypto.decrypt(p.encrypted_name); } catch { return null; }
    })(),
    encrypted_name: undefined,
  }));
}

// ── Stage 3: updateInstrumentFields ──────────────────────────────────────────
// Minimal canonical update for instrument metadata (type, dates, jurisdiction).
// Intended for the extraction service's acceptCandidate path, but also usable
// by the route layer if a direct edit-fields endpoint is added in a future stage.
async function updateInstrumentFields(accountId, userId, instrumentId, fields, txClient) {
  const ALLOWED_COLS = {
    instrument_type: 'instrument_type',
    effective_date:  'effective_date',
    expiration_date: 'expiration_date',
    jurisdiction:    'jurisdiction',
  };
  const entries = Object.entries(fields).filter(([k]) => ALLOWED_COLS[k]);
  if (entries.length === 0) return;

  const q = txClient || pool;
  await q.query(
    `SELECT id, status FROM authority_instruments
      WHERE account_id = $1 AND id = $2 FOR UPDATE`,
    [accountId, instrumentId]
  );

  const setClauses = entries.map(([k], i) => `${ALLOWED_COLS[k]} = $${i + 3}`);
  const values     = entries.map(([, v]) => v);

  await q.query(
    `UPDATE authority_instruments
        SET ${setClauses.join(', ')}, updated_at = NOW()
      WHERE account_id = $1 AND id = $2`,
    [accountId, instrumentId, ...values]
  );
}

module.exports = {
  // Provisioning
  provisionInstitution,
  grantCapability,
  // Parties
  createParty,
  getParty,
  listParties,
  updatePartyStatus,
  updatePartyDisplayName,
  // Cases
  createCase,
  getCase,
  listCases,
  transitionCase,
  // Human Review
  getReviewQueue,
  claimCase,
  assignReviewer,
  getReviewWorkspace,
  addReviewNote,
  getReviewNotes,
  // Audit Activity
  getAuditActivity,
  // Instruments
  createInstrument,
  getInstrument,
  getInstrumentDetail,
  listInstruments,
  transitionInstrument,
  canVerifyInstrument,
  // Case-Instrument
  linkInstrumentToCase,
  unlinkInstrumentFromCase,
  // Participants
  addParticipant,
  removeParticipant,
  updateParticipantStatus,
  // Permissions
  addPermission,
  removePermission,
  removePermissionById,
  // Restrictions
  addRestriction,
  removeRestriction,
  // Documents
  uploadDocument,
  getDocumentMetadata,
  streamDocument,
  deleteDocument,
  // Stage 3
  updateInstrumentFields,
};
