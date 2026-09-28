'use strict';

/**
 * Authority Extraction Service
 *
 * Manages the lifecycle of AI-assisted document extraction runs:
 *   enqueueExtractionRuns  — transactional enqueue (called inside PENDING_EXTRACTION transition)
 *   claimNextRun           — atomic worker claim with SELECT FOR UPDATE SKIP LOCKED
 *   processExtractionRun   — full processing step (fetch PDF → provider → persist candidates)
 *   transitionToExtractionComplete — system-only case transition after all runs finish
 *   acceptCandidate        — apply a proposed field value to the instrument
 *   rejectCandidate        — mark a candidate as rejected
 *   createExplicitRetry    — queue a new run for a specific document
 *   listRunsForCase        — read run state for the workspace
 *   listCandidatesForCase  — read candidates + evidence for the workspace
 *
 * Fencing: every candidate/evidence write verifies the current lease_token matches the
 * token held by the worker, so a crashed-and-reclaimed worker cannot corrupt data.
 */

const crypto   = require('crypto');
const pool     = require('../db/pool');
const storage  = require('./authorityStorage');
const crypto2  = require('./authorityCrypto');
const audit    = require('./audit');
const {
  ProviderTimeoutError,
  ProviderRateLimitError,
  ProviderError,
  MalformedOutputError,
} = require('./authorityFakeProvider');

// ── Constants ─────────────────────────────────────────────────────────────────

const LEASE_DURATION_MS   = 5 * 60 * 1000;   // 5 minutes
const VALID_FIELD_KEYS    = new Set([
  'instrument_type', 'effective_date', 'expiration_date', 'jurisdiction',
  'principal_name', 'agent_name', 'trustee_name', 'guardian_name',
  'grantor_name', 'beneficiary_name',
]);

// ── Institution account guard ─────────────────────────────────────────────────

async function _assertInstitutionAccount(accountId) {
  const { rows } = await pool.query(
    `SELECT id FROM accounts WHERE id = $1 AND account_type = 'institution'`,
    [accountId],
  );
  if (rows.length === 0) {
    throw Object.assign(new Error('Not an institution account'), { status: 403 });
  }
}

// ── Provider selection ────────────────────────────────────────────────────────

function _getProvider() {
  const name = (process.env.AUTHORITY_EXTRACTION_PROVIDER || 'fake').toLowerCase();
  if (name === 'anthropic') {
    // Throws at load time unless AUTHORITY_EXTRACTION_REAL_PROVIDER_ENABLED=true
    return require('./authorityAnthropicProvider');
  }
  return require('./authorityFakeProvider');
}

// ── Output validation ─────────────────────────────────────────────────────────

function _validateProviderOutput(output) {
  if (!output || typeof output !== 'object') {
    throw Object.assign(new Error('Provider output is not an object'), { code: 'validation_error' });
  }
  if (!Array.isArray(output.candidates)) {
    throw Object.assign(new Error('Provider output missing candidates array'), { code: 'validation_error' });
  }
  for (const c of output.candidates) {
    if (typeof c.fieldKey !== 'string' || c.fieldKey.length === 0) {
      throw Object.assign(new Error('Candidate missing fieldKey'), { code: 'validation_error' });
    }
    if (c.proposedValue !== null && typeof c.proposedValue !== 'string') {
      throw Object.assign(new Error(`Candidate ${c.fieldKey}: proposedValue must be string or null`), { code: 'validation_error' });
    }
    if (typeof c.confidence !== 'number' || c.confidence < 0 || c.confidence > 1) {
      throw Object.assign(new Error(`Candidate ${c.fieldKey}: confidence must be 0–1`), { code: 'validation_error' });
    }
    if (!Array.isArray(c.evidence)) {
      throw Object.assign(new Error(`Candidate ${c.fieldKey}: evidence must be an array`), { code: 'validation_error' });
    }
  }
}

// ── Error → category mapping ──────────────────────────────────────────────────

function _errorCategory(err) {
  if (err instanceof ProviderTimeoutError)   return 'timeout';
  if (err instanceof ProviderRateLimitError) return 'rate_limited';
  if (err instanceof ProviderError)          return 'provider_error';
  if (err instanceof MalformedOutputError)   return 'malformed_output';
  if (err.code === 'validation_error')       return 'validation_error';
  if (err.code === 'no_documents')           return 'no_documents';
  if (err.code === 'storage_error')          return 'storage_error';
  return 'unknown';
}

// ── Stream to buffer helper ───────────────────────────────────────────────────

function _streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', c => chunks.push(c));
    stream.on('end',  () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// ── Qualify documents ─────────────────────────────────────────────────────────

/**
 * Returns active documents for a case, ordered by upload time.
 * Must be called with a transaction client so it participates in the same
 * snapshot as the enqueue operation.
 */
async function getQualifyingDocuments(txClient, accountId, caseId) {
  const { rows } = await txClient.query(
    `SELECT id, storage_key, original_filename
       FROM authority_documents
      WHERE account_id = $1
        AND case_id    = $2
        AND status     = 'active'
      ORDER BY created_at`,
    [accountId, caseId],
  );
  return rows;
}

// ── Enqueue ───────────────────────────────────────────────────────────────────

/**
 * Inserts one pending run per qualifying document.
 * Called inside the same transaction as the PENDING_EXTRACTION case transition.
 * Returns the number of runs created.
 */
async function enqueueExtractionRuns(txClient, accountId, caseId) {
  const docs = await getQualifyingDocuments(txClient, accountId, caseId);
  if (docs.length === 0) return 0;

  const provider = (process.env.AUTHORITY_EXTRACTION_PROVIDER || 'fake').toLowerCase();

  let created = 0;
  for (const doc of docs) {
    await txClient.query(
      `INSERT INTO authority_extraction_runs
         (account_id, case_id, document_id, run_kind, status, provider)
       VALUES ($1, $2, $3, 'auto', 'pending', $4)`,
      [accountId, caseId, doc.id, provider],
    );
    created++;
  }
  return created;
}

// ── Worker claim ──────────────────────────────────────────────────────────────

/**
 * Atomically claims the next pending run.
 * Returns { id, accountId, caseId, documentId, storageKey, leaseToken } or null.
 */
async function claimNextRun() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT r.id, r.account_id, r.case_id, r.document_id, d.storage_key
         FROM authority_extraction_runs r
         JOIN authority_documents d
           ON d.account_id = r.account_id AND d.id = r.document_id
        WHERE r.status = 'pending'
        ORDER BY r.created_at
        LIMIT 1
        FOR UPDATE OF r SKIP LOCKED`,
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const run        = rows[0];
    const leaseToken = crypto.randomUUID();
    const leaseExp   = new Date(Date.now() + LEASE_DURATION_MS).toISOString();

    await client.query(
      `UPDATE authority_extraction_runs
          SET status = 'running', lease_token = $1, lease_expires_at = $2, claimed_at = NOW(), updated_at = NOW()
        WHERE id = $3`,
      [leaseToken, leaseExp, run.id],
    );

    await client.query('COMMIT');

    return {
      id:          run.id,
      accountId:   run.account_id,
      caseId:      run.case_id,
      documentId:  run.document_id,
      storageKey:  run.storage_key,
      leaseToken,
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

// ── Process run ───────────────────────────────────────────────────────────────

/**
 * Full processing step for a claimed run.
 * leaseToken is the fencing token issued at claim time.
 */
async function processExtractionRun(runId, leaseToken) {
  // 1. Fetch run details outside a transaction (read-only snapshot)
  const { rows: runRows } = await pool.query(
    `SELECT r.id, r.account_id, r.case_id, r.document_id, r.status, r.lease_token,
            r.provider, d.storage_key
       FROM authority_extraction_runs r
       JOIN authority_documents d
         ON d.account_id = r.account_id AND d.id = r.document_id
      WHERE r.id = $1`,
    [runId],
  );

  if (runRows.length === 0) {
    console.warn(`[authorityExtraction] run ${runId} not found — skipping`);
    return;
  }

  const run = runRows[0];

  if (run.status !== 'running' || run.lease_token !== leaseToken) {
    console.warn(`[authorityExtraction] run ${runId} lease mismatch or wrong status — skipping`);
    return;
  }

  // 2. Fetch instrument for this document's case
  const { rows: instrRows } = await pool.query(
    `SELECT ci.instrument_id
       FROM authority_case_instruments ci
      WHERE ci.account_id = $1 AND ci.case_id = $2
      LIMIT 1`,
    [run.account_id, run.case_id],
  );
  const instrumentId = instrRows.length > 0 ? instrRows[0].instrument_id : null;

  // 3. Fetch document bytes from object storage
  let documentBuffer;
  try {
    const stream = await storage.getStream(run.storage_key);
    documentBuffer = await _streamToBuffer(stream);
  } catch (storageErr) {
    await _failRun(runId, leaseToken, 'storage_error',
      `Storage read failed: ${storageErr.message}`);
    return;
  }

  // 4. Call extraction provider
  let providerOutput;
  try {
    const provider = _getProvider();
    providerOutput = await provider.extract(documentBuffer, run.document_id);
    _validateProviderOutput(providerOutput);
  } catch (providerErr) {
    const category = _errorCategory(providerErr);
    await _failRun(runId, leaseToken, category, providerErr.message);
    return;
  }

  // 5. Persist candidates and evidence in a fenced transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Re-verify lease inside the transaction (fencing check)
    const { rows: lockRows } = await client.query(
      `SELECT id FROM authority_extraction_runs
        WHERE id = $1 AND lease_token = $2 AND status = 'running'
        FOR UPDATE`,
      [runId, leaseToken],
    );

    if (lockRows.length === 0) {
      await client.query('ROLLBACK');
      console.warn(`[authorityExtraction] run ${runId} fencing check failed — another worker may have reclaimed`);
      return;
    }

    const keyVersion = crypto2.getKeyVersion();

    // Insert candidates and evidence
    for (const candidate of providerOutput.candidates) {
      const encValue = candidate.proposedValue !== null
        ? crypto2.encrypt(candidate.proposedValue)
        : null;

      const { rows: [cRow] } = await client.query(
        `INSERT INTO authority_extraction_candidates
           (account_id, run_id, instrument_id, field_key, proposed_value, proposed_value_key_version,
            confidence, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
         RETURNING id`,
        [
          run.account_id,
          runId,
          instrumentId,
          candidate.fieldKey,
          encValue,
          encValue ? keyVersion : null,
          candidate.confidence,
        ],
      );

      for (const ev of candidate.evidence) {
        const encExcerpt = ev.excerpt ? crypto2.encrypt(ev.excerpt) : null;

        await client.query(
          `INSERT INTO authority_extraction_evidence
             (account_id, candidate_id, document_id, page_numbers, excerpt, excerpt_key_version)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            run.account_id,
            cRow.id,
            ev.documentId,
            ev.pageNumbers,
            encExcerpt,
            encExcerpt ? keyVersion : null,
          ],
        );
      }
    }

    // Mark run completed
    await client.query(
      `UPDATE authority_extraction_runs
          SET status = 'completed', completed_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND lease_token = $2`,
      [runId, leaseToken],
    );

    await client.query('COMMIT');
  } catch (persistErr) {
    try { await client.query('ROLLBACK'); } catch {}
    await _failRun(runId, leaseToken, 'unknown', `Persist failed: ${persistErr.message}`);
    return;
  } finally {
    client.release();
  }

  // 6. Check if all runs for this case have reached terminal status
  await _maybeCompleteCase(run.account_id, run.case_id);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function _failRun(runId, leaseToken, errorCategory, errorMessage) {
  try {
    await pool.query(
      `UPDATE authority_extraction_runs
          SET status = 'failed', error_category = $1, error_message = $2,
              completed_at = NOW(), updated_at = NOW()
        WHERE id = $3 AND lease_token = $4`,
      [errorCategory, errorMessage.slice(0, 1000), runId, leaseToken],
    );
    // After a failure, check if all runs for the case are now terminal
    const { rows } = await pool.query(
      `SELECT account_id, case_id FROM authority_extraction_runs WHERE id = $1`,
      [runId],
    );
    if (rows.length > 0) {
      await _maybeCompleteCase(rows[0].account_id, rows[0].case_id);
    }
  } catch (err) {
    console.error(`[authorityExtraction] _failRun error for run ${runId}:`, err.message);
  }
}

async function _maybeCompleteCase(accountId, caseId) {
  // All runs for the case must be in a terminal status
  const { rows } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE status NOT IN ('completed','failed','cancelled')) AS pending_count,
            COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
            COUNT(*) AS total_count
       FROM authority_extraction_runs
      WHERE account_id = $1 AND case_id = $2`,
    [accountId, caseId],
  );

  const { pending_count, completed_count, total_count } = rows[0];

  if (parseInt(total_count) === 0) return;        // no runs enqueued (edge case)
  if (parseInt(pending_count) > 0) return;        // still work to do

  // All runs terminal — transition the case
  await transitionToExtractionComplete(accountId, caseId);
}

// ── Case transition ───────────────────────────────────────────────────────────

/**
 * System-only: transition case from PENDING_EXTRACTION → EXTRACTION_COMPLETE.
 * Idempotent — if the case is already past PENDING_EXTRACTION, does nothing.
 */
async function transitionToExtractionComplete(accountId, caseId) {
  try {
    // Lazy-require to avoid circular dependency (authorityService ← this ← authorityService)
    const svc = require('./authorityService');
    await svc.transitionCase(accountId, null, caseId, 'EXTRACTION_COMPLETE', { systemActor: true });
  } catch (err) {
    // 409 Conflict means the case is already in a later state — treat as success
    if (err.status === 409 || err.statusCode === 409) return;
    // 400 with the specific "Cannot transition case from" message means the case has
    // already advanced past PENDING_EXTRACTION — treat as success (idempotent).
    // Other 400s (validation errors, missing instruments, etc.) should propagate.
    if (
      (err.status === 400 || err.statusCode === 400) &&
      err.message && err.message.includes('Cannot transition case from')
    ) return;
    console.error(`[authorityExtraction] transitionToExtractionComplete failed for case ${caseId}:`, err.message);
  }
}

// ── Candidate review ──────────────────────────────────────────────────────────

/**
 * Accept a candidate — applies the proposed value to the instrument.
 * opts.rowVersion: expected row_version for optimistic locking.
 */
async function acceptCandidate(accountId, userId, candidateId, opts = {}) {
  const { rowVersion, partyAction, partyId } = opts;

  // Fetch candidate
  const { rows: cRows } = await pool.query(
    `SELECT c.*, r.case_id, r.document_id
       FROM authority_extraction_candidates c
       JOIN authority_extraction_runs r ON r.id = c.run_id
      WHERE c.id = $1 AND c.account_id = $2`,
    [candidateId, accountId],
  );
  if (cRows.length === 0) {
    const e = new Error('Candidate not found'); e.status = 404; throw e;
  }
  const candidate = cRows[0];

  if (candidate.status !== 'pending') {
    const e = new Error(`Candidate is already ${candidate.status}`); e.status = 409; throw e;
  }
  if (rowVersion !== undefined && candidate.row_version !== rowVersion) {
    const e = new Error('Candidate was modified by another actor (version conflict)');
    e.status = 409; throw e;
  }
  if (!candidate.instrument_id) {
    const e = new Error('Candidate has no associated instrument'); e.status = 422; throw e;
  }

  // Candidate acceptance is only valid during active human review — the case must be claimed
  // and the caller must be the active assignee.
  const { rows: caseRows } = await pool.query(
    `SELECT status FROM authority_cases WHERE account_id = $1 AND id = $2`,
    [accountId, candidate.case_id],
  );
  if (caseRows.length === 0) {
    const e = new Error('Case not found'); e.status = 404; throw e;
  }
  if (caseRows[0].status !== 'HUMAN_REVIEW_IN_PROGRESS') {
    const e = new Error('Candidates can only be accepted when the case is in HUMAN_REVIEW_IN_PROGRESS');
    e.status = 409; throw e;
  }
  const { rows: assignRows } = await pool.query(
    `SELECT id FROM authority_review_assignments
      WHERE account_id = $1 AND case_id = $2 AND assigned_to = $3 AND status = 'active'`,
    [accountId, candidate.case_id, userId],
  );
  if (!assignRows.length) {
    const e = new Error('An active case assignment is required to accept candidates during human review');
    e.status = 403; throw e;
  }

  // Require at least one evidence item — accepting an AI extraction with zero citations
  // would apply field values to a legal instrument with no auditable provenance.
  const { rows: [evRow] } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM authority_extraction_evidence WHERE candidate_id = $1`,
    [candidateId],
  );
  if (evRow.cnt === 0) {
    const e = new Error('Candidate has no supporting evidence and cannot be accepted');
    e.status = 422; throw e;
  }

  // Decrypt proposed value
  let plainValue = null;
  if (candidate.proposed_value !== null && candidate.proposed_value_key_version) {
    plainValue = crypto2.decrypt(candidate.proposed_value);
  } else if (candidate.proposed_value !== null) {
    plainValue = candidate.proposed_value;
  }

  const client = await pool.connect();
  let canonicalPartyId = null;
  try {
    await client.query('BEGIN');

    // Lock instrument row
    const { rows: instrRows } = await client.query(
      `SELECT id, status, instrument_type, effective_date, expiration_date, jurisdiction
         FROM authority_instruments
        WHERE account_id = $1 AND id = $2
        FOR UPDATE`,
      [accountId, candidate.instrument_id],
    );
    if (instrRows.length === 0) {
      throw Object.assign(new Error('Instrument not found'), { status: 404 });
    }

    const instr = instrRows[0];
    const LOCKED = new Set(['VERIFIED','REJECTED','REVOKED','EXPIRED','SUPERSEDED']);
    if (LOCKED.has(instr.status)) {
      throw Object.assign(
        new Error(`Instrument is ${instr.status} and cannot be modified`),
        { status: 409 },
      );
    }

    // Apply the field update; returns canonicalPartyId for party-identity fields
    canonicalPartyId = await _applyField(client, accountId, instr, candidate.field_key, plainValue, {
      partyAction,
      partyId,
      createdBy: userId,
    });

    // Mark candidate accepted (optimistic lock: WHERE row_version = current)
    const { rowCount } = await client.query(
      `UPDATE authority_extraction_candidates
          SET status             = 'accepted',
              reviewed_by        = $1,
              reviewed_at        = NOW(),
              canonical_party_id = $5,
              row_version        = row_version + 1,
              updated_at         = NOW()
        WHERE id = $2 AND account_id = $3 AND row_version = $4`,
      [userId, candidateId, accountId, candidate.row_version, canonicalPartyId],
    );
    if (rowCount === 0) {
      throw Object.assign(
        new Error('Candidate was modified concurrently — please refresh and retry'),
        { status: 409 },
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }

  audit.log(accountId, userId, 'EXTRACTION_CANDIDATE_ACCEPTED', 'extraction_candidate', candidateId, {
    fieldKey:         candidate.field_key,
    plainValue,
    canonicalPartyId,
  });

  return { id: candidateId, status: 'accepted' };
}

/**
 * Apply a single extracted field to the instrument row.
 * txClient must already hold a FOR UPDATE lock on the instrument.
 *
 * opts.partyAction: 'create_new' | 'map_existing' — required for party-identity fields.
 * opts.partyId:    UUID — required when partyAction === 'map_existing'.
 * opts.createdBy:  UUID — set as created_by for create_new parties.
 *
 * Returns: canonicalPartyId (UUID) for party-identity fields, null for all others.
 */
async function _applyField(txClient, accountId, instr, fieldKey, plainValue, opts = {}) {
  const { partyAction, partyId, createdBy } = opts;

  // Instrument metadata fields
  if (['instrument_type','effective_date','expiration_date','jurisdiction'].includes(fieldKey)) {
    const col = {
      instrument_type: 'instrument_type',
      effective_date:  'effective_date',
      expiration_date: 'expiration_date',
      jurisdiction:    'jurisdiction',
    }[fieldKey];

    await txClient.query(
      `UPDATE authority_instruments SET ${col} = $1, updated_at = NOW()
        WHERE account_id = $2 AND id = $3`,
      [plainValue, accountId, instr.id],
    );
    return null;
  }

  // Participant name (party-identity) fields.
  // AI extraction must never silently rename an existing party. The reviewer must
  // explicitly choose: create a new party from the extracted name (create_new) or
  // map to an existing same-tenant party (map_existing).
  const roleMap = {
    principal_name:   'principal',
    agent_name:       'agent',
    trustee_name:     'trustee',
    guardian_name:    'guardian',
    grantor_name:     'grantor',
    beneficiary_name: 'beneficiary',
  };
  if (roleMap[fieldKey]) {
    if (partyAction === 'create_new') {
      const { rows: [newParty] } = await txClient.query(
        `INSERT INTO authority_parties (account_id, party_type, display_name, created_by)
         VALUES ($1, 'person', $2, $3)
         RETURNING id`,
        [accountId, plainValue || 'Unknown', createdBy || null],
      );
      return newParty.id;
    }
    if (partyAction === 'map_existing') {
      if (!partyId) {
        throw Object.assign(new Error("partyId is required when partyAction is 'map_existing'"), { status: 422 });
      }
      const { rows } = await txClient.query(
        `SELECT id FROM authority_parties WHERE account_id = $1 AND id = $2`,
        [accountId, partyId],
      );
      if (rows.length === 0) {
        throw Object.assign(new Error('Party not found or not in this account'), { status: 404 });
      }
      return partyId;
    }
    throw Object.assign(
      new Error("Party candidate requires partyAction: 'create_new' or 'map_existing'"),
      { status: 422 },
    );
  }

  // Granted action — granted_action.<ACTION_KEY>
  if (fieldKey.startsWith('granted_action.')) {
    const actionKey = fieldKey.slice('granted_action.'.length);
    if (!actionKey) return null;
    // Upsert: ignore if permission already exists for this action
    await txClient.query(
      `INSERT INTO authority_instrument_permissions
         (account_id, instrument_id, action_key, grant_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (account_id, instrument_id, action_key) DO NOTHING`,
      [accountId, instr.id, actionKey, plainValue || 'granted'],
    );
    return null;
  }

  // Restriction — restriction.<RESTRICTION_TYPE>
  if (fieldKey.startsWith('restriction.')) {
    const restrictionType = fieldKey.slice('restriction.'.length);
    if (!restrictionType) return null;
    let params = {};
    if (plainValue) {
      try { params = JSON.parse(plainValue); } catch { params = { raw: plainValue }; }
    }
    // Insert only if no existing restriction of this type
    const { rows: existingRows } = await txClient.query(
      `SELECT id FROM authority_instrument_restrictions
        WHERE account_id = $1 AND instrument_id = $2 AND restriction_type = $3`,
      [accountId, instr.id, restrictionType],
    );
    if (existingRows.length === 0) {
      await txClient.query(
        `INSERT INTO authority_instrument_restrictions
           (account_id, instrument_id, restriction_type, parameters)
         VALUES ($1, $2, $3, $4)`,
        [accountId, instr.id, restrictionType, JSON.stringify(params)],
      );
    }
    return null;
  }

  // Unknown field_key — accepted but no structural change applied
  // (human reviewed and acknowledged it)
  return null;
}

/**
 * Reject a candidate.
 */
async function rejectCandidate(accountId, userId, candidateId, rejectionReason) {
  const { rows: cRows } = await pool.query(
    `SELECT c.id, c.status, c.field_key, c.row_version, r.case_id
       FROM authority_extraction_candidates c
       JOIN authority_extraction_runs r ON r.id = c.run_id
      WHERE c.id = $1 AND c.account_id = $2`,
    [candidateId, accountId],
  );
  if (cRows.length === 0) {
    const e = new Error('Candidate not found'); e.status = 404; throw e;
  }
  const candidate = cRows[0];
  if (candidate.status !== 'pending') {
    const e = new Error(`Candidate is already ${candidate.status}`); e.status = 409; throw e;
  }

  // Candidate rejection is only valid during active human review.
  const { rows: caseRows } = await pool.query(
    `SELECT status FROM authority_cases WHERE account_id = $1 AND id = $2`,
    [accountId, candidate.case_id],
  );
  if (caseRows.length === 0) {
    const e = new Error('Case not found'); e.status = 404; throw e;
  }
  if (caseRows[0].status !== 'HUMAN_REVIEW_IN_PROGRESS') {
    const e = new Error('Candidates can only be rejected when the case is in HUMAN_REVIEW_IN_PROGRESS');
    e.status = 409; throw e;
  }
  const { rows: assignRows } = await pool.query(
    `SELECT id FROM authority_review_assignments
      WHERE account_id = $1 AND case_id = $2 AND assigned_to = $3 AND status = 'active'`,
    [accountId, candidate.case_id, userId],
  );
  if (!assignRows.length) {
    const e = new Error('An active case assignment is required to reject candidates during human review');
    e.status = 403; throw e;
  }

  const { rowCount } = await pool.query(
    `UPDATE authority_extraction_candidates
        SET status           = 'rejected',
            reviewed_by      = $1,
            reviewed_at      = NOW(),
            rejection_reason = $2,
            row_version      = row_version + 1,
            updated_at       = NOW()
      WHERE id = $3 AND account_id = $4 AND status = 'pending'`,
    [userId, rejectionReason || null, candidateId, accountId],
  );
  if (rowCount === 0) {
    const e = new Error('Candidate could not be rejected (possibly already reviewed)');
    e.status = 409; throw e;
  }

  audit.log(accountId, userId, 'EXTRACTION_CANDIDATE_REJECTED', 'extraction_candidate', candidateId, {
    fieldKey: candidate.field_key,
    reason:   rejectionReason,
  });

  return { id: candidateId, status: 'rejected' };
}

// ── Explicit retry ────────────────────────────────────────────────────────────

/**
 * Queue a new extraction run for a specific document.
 * Requires AUTHORITY_EXTRACTION_MANAGE capability (checked in the route).
 */
async function createExplicitRetry(accountId, userId, caseId, documentId) {
  // Verify document belongs to this account and case
  const { rows: docRows } = await pool.query(
    `SELECT id FROM authority_documents
      WHERE account_id = $1 AND case_id = $2 AND id = $3 AND status = 'active'`,
    [accountId, caseId, documentId],
  );
  if (docRows.length === 0) {
    const e = new Error('Document not found or not eligible for retry'); e.status = 404; throw e;
  }

  const provider = (process.env.AUTHORITY_EXTRACTION_PROVIDER || 'fake').toLowerCase();

  const { rows: [run] } = await pool.query(
    `INSERT INTO authority_extraction_runs
       (account_id, case_id, document_id, run_kind, status, provider, created_by)
     VALUES ($1, $2, $3, 'retry', 'pending', $4, $5)
     RETURNING id`,
    [accountId, caseId, documentId, provider, userId],
  );

  audit.log(accountId, userId, 'EXTRACTION_RETRY_QUEUED', 'extraction_run', run.id, {
    caseId,
    documentId,
  });

  return { id: run.id };
}

// ── Read models ───────────────────────────────────────────────────────────────

async function listRunsForCase(accountId, caseId) {
  await _assertInstitutionAccount(accountId);
  const { rows } = await pool.query(
    `SELECT r.id, r.document_id, r.run_kind, r.status, r.provider,
            r.error_category, r.error_message, r.claimed_at, r.completed_at, r.created_at,
            d.original_filename
       FROM authority_extraction_runs r
       JOIN authority_documents d ON d.account_id = r.account_id AND d.id = r.document_id
      WHERE r.account_id = $1 AND r.case_id = $2
      ORDER BY r.created_at`,
    [accountId, caseId],
  );
  return rows;
}

async function listCandidatesForCase(accountId, caseId) {
  await _assertInstitutionAccount(accountId);
  const { rows } = await pool.query(
    `SELECT c.id, c.run_id, c.instrument_id, c.field_key,
            c.proposed_value, c.proposed_value_key_version,
            c.confidence, c.status, c.reviewed_by, c.reviewed_at,
            c.rejection_reason, c.canonical_party_id, c.row_version, c.created_at,
            COALESCE(
              json_agg(
                json_build_object(
                  'id',          e.id,
                  'document_id', e.document_id,
                  'page_numbers',e.page_numbers,
                  'excerpt',     e.excerpt,
                  'excerpt_key_version', e.excerpt_key_version
                ) ORDER BY e.created_at
              ) FILTER (WHERE e.id IS NOT NULL),
              '[]'
            ) AS evidence
       FROM authority_extraction_candidates c
       JOIN authority_extraction_runs r ON r.id = c.run_id
  LEFT JOIN authority_extraction_evidence e ON e.candidate_id = c.id
      WHERE c.account_id = $1 AND r.case_id = $2
      GROUP BY c.id
      ORDER BY c.created_at`,
    [accountId, caseId],
  );

  // Decrypt proposed values and evidence excerpts
  const decrypted = rows.map(row => {
    let proposedValuePlain = null;
    if (row.proposed_value !== null) {
      try {
        proposedValuePlain = row.proposed_value_key_version
          ? crypto2.decrypt(row.proposed_value)
          : row.proposed_value;
      } catch {
        proposedValuePlain = '[decryption error]';
      }
    }

    const evidence = (row.evidence || []).map(ev => {
      let excerptPlain = null;
      if (ev.excerpt) {
        try {
          excerptPlain = ev.excerpt_key_version
            ? crypto2.decrypt(ev.excerpt)
            : ev.excerpt;
        } catch {
          excerptPlain = '[decryption error]';
        }
      }
      return {
        id:           ev.id,
        documentId:   ev.document_id,
        pageNumbers:  ev.page_numbers,
        excerpt:      excerptPlain,
      };
    });

    return {
      id:               row.id,
      runId:            row.run_id,
      instrumentId:     row.instrument_id,
      fieldKey:         row.field_key,
      proposedValue:    proposedValuePlain,
      confidence:       row.confidence,
      status:           row.status,
      reviewedBy:       row.reviewed_by,
      reviewedAt:       row.reviewed_at,
      rejectionReason:  row.rejection_reason,
      canonicalPartyId: row.canonical_party_id,
      rowVersion:       row.row_version,
      createdAt:        row.created_at,
      evidence,
    };
  });

  return decrypted;
}

module.exports = {
  getQualifyingDocuments,
  enqueueExtractionRuns,
  claimNextRun,
  processExtractionRun,
  transitionToExtractionComplete,
  acceptCandidate,
  rejectCandidate,
  createExplicitRetry,
  listRunsForCase,
  listCandidatesForCase,
};
