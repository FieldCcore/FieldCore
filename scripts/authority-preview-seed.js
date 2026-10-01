/**
 * FieldCore Authority — Lightweight Preview Seed
 *
 * Creates a minimal institution scenario for local visual review — no R2, no
 * real documents, no AI extraction.  Uses direct SQL only where the service
 * layer would require a document (AWAITING_DOCUMENTS → PENDING_EXTRACTION
 * guard); all other writes go through the service layer so audit logs, locks,
 * and invariants are exercised exactly as in production.
 *
 * SAFETY INVARIANTS (never relaxed):
 *  - Refuses to run in production (NODE_ENV === 'production').
 *  - Requires AUTHORITY_PREVIEW_SEED_ENABLED=true.
 *  - Does NOT create fake document rows pointing to non-existent R2 content.
 *  - Does NOT create fake extraction evidence.
 *  - Does NOT write status = 'VERIFIED' via direct SQL. Verification is
 *    performed exclusively through authorityService.transitionInstrument()
 *    with actorType: 'human', exactly as the production application does.
 *
 * Idempotency:
 *  - If the preview data is already complete (a VERIFIED Mode B instrument
 *    exists), the seed exits without changes, preserving any evaluation
 *    records created during the walkthrough.
 *  - Pass --force to reset and recreate all preview data (deletes evaluations).
 *
 * Preview cases created:
 *  - PREVIEW-CASE-001 (Mode A): HUMAN_REVIEW_IN_PROGRESS; instrument PENDING_REVIEW.
 *    Reviewer can verify this through the normal Case Workspace UI.
 *  - PREVIEW-CASE-002: PENDING_HUMAN_REVIEW; unassigned.
 *  - PREVIEW-CASE-VERIFY (Mode B): instrument pre-VERIFIED through the real
 *    service path by the synthetic reviewer.  Available immediately in Evaluate.
 *
 * Usage:
 *   node scripts/authority-preview-seed.js          # skip if already complete
 *   node scripts/authority-preview-seed.js --force  # reset + recreate
 *
 * Login credentials created:
 *   Institution owner:    institution@getfieldcore.com / institution2024
 *   Institution reviewer: reviewer@getfieldcore.com  / institution2024
 */

'use strict';

// ── Production guard — MUST be first ─────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  console.error('[authority-preview-seed] REFUSED: will not run in production.');
  process.exit(1);
}

// Load env before importing services that read process.env at module load time
require('dotenv').config();

if (process.env.AUTHORITY_PREVIEW_SEED_ENABLED !== 'true') {
  console.error('[authority-preview-seed] REFUSED: set AUTHORITY_PREVIEW_SEED_ENABLED=true to run.');
  process.exit(1);
}

const bcrypt           = require('bcryptjs');
const pool             = require('../src/db/pool');
const authorityService = require('../src/services/authorityService');

const FORCE_RESET    = process.argv.includes('--force');

// Internal tag for review notes — never shown in UI display fields
const SEED_TAG       = '__PREVIEW__';
const OWNER_EMAIL    = 'institution@getfieldcore.com';
const REVIEWER_EMAIL = 'reviewer@getfieldcore.com';
const SEED_PASSWORD  = 'institution2024';
const CASE_REF       = 'PREVIEW-CASE-001';
const CASE_REF_2     = 'PREVIEW-CASE-002';
const CASE_REF_VERIFY = 'PREVIEW-CASE-VERIFY';

// ── Display names (no __PREVIEW__ prefix — clean for UI walkthrough) ──────────
const INST_NAME            = 'Harborview Trust & Advisory (Demo)';
const OWNER_NAME           = 'Morgan Chen';
const REVIEWER_NAME        = 'Alex Rivera';
const PARTY_PRINCIPAL_NAME = 'Eleanor Whitfield';
const PARTY_AGENT_NAME     = 'James Thatcher';
const PARTY_COAGENT_NAME   = 'Meridian Trust Services LLC';

// ── Idempotency helpers ───────────────────────────────────────────────────────

/**
 * Returns true if the preview data is already complete: the preview account
 * exists AND at least one instrument for that account is VERIFIED.
 *
 * When this returns true and --force was not passed, the seed exits early,
 * preserving any evaluation records from a walkthrough.
 */
async function isPreviewComplete(client) {
  const { rows } = await client.query(
    `SELECT u.account_id
     FROM users u
     WHERE u.email = $1 LIMIT 1`,
    [OWNER_EMAIL]
  );
  if (!rows.length) return false;
  const { rows: verified } = await client.query(
    `SELECT id FROM authority_instruments
     WHERE account_id = $1 AND status = 'VERIFIED' LIMIT 1`,
    [rows[0].account_id]
  );
  return verified.length > 0;
}

/**
 * Delete all data owned by the preview account (identified by OWNER_EMAIL).
 * Uses direct SQL to bypass service-layer guards (e.g. party identity lock).
 * Safe: only runs after the production guard above, never in NODE_ENV=production.
 *
 * ⚠  LOCAL VISUAL PREVIEW ONLY — never replicate this teardown in production code.
 */
async function scopedReset(client) {
  const { rows } = await client.query(
    `SELECT id, account_id FROM users WHERE email = $1 LIMIT 1`,
    [OWNER_EMAIL]
  );
  if (!rows.length) return false;

  const accountId = rows[0].account_id;
  console.log(`[authority-preview-seed] Resetting preview data for account ${accountId}…`);

  // Delete in dependency order — deepest children first
  await client.query(`DELETE FROM authority_review_notes WHERE account_id = $1`,      [accountId]);
  await client.query(`DELETE FROM authority_review_assignments WHERE account_id = $1`, [accountId]);
  await client.query(`DELETE FROM authority_documents WHERE account_id = $1`,          [accountId]);
  await client.query(`DELETE FROM authority_evaluations WHERE account_id = $1`,        [accountId]);
  await client.query(`DELETE FROM authority_permissions WHERE account_id = $1`,        [accountId]);
  await client.query(`DELETE FROM authority_restrictions WHERE account_id = $1`,       [accountId]);
  await client.query(`DELETE FROM authority_instrument_parties WHERE account_id = $1`, [accountId]);
  await client.query(`DELETE FROM authority_case_instruments WHERE account_id = $1`,   [accountId]);
  await client.query(`DELETE FROM authority_cases WHERE account_id = $1`,              [accountId]);
  await client.query(`DELETE FROM authority_instruments WHERE account_id = $1`,        [accountId]);
  await client.query(`DELETE FROM authority_parties WHERE account_id = $1`,            [accountId]);
  await client.query(
    `DELETE FROM authority_api_credentials WHERE account_id = $1`,
    [accountId]
  );
  await client.query(
    `DELETE FROM platform_user_capabilities WHERE user_id IN (SELECT id FROM users WHERE account_id = $1)`,
    [accountId]
  );
  await client.query(`DELETE FROM users WHERE account_id = $1`,    [accountId]);
  await client.query(`DELETE FROM accounts WHERE id = $1`,         [accountId]);

  console.log('[authority-preview-seed] Scoped reset complete.');
  return true;
}

async function run() {
  console.log('[authority-preview-seed] Starting…');

  const client = await pool.connect();
  try {
    // ── Idempotency: skip if preview is already complete ──────────────────────
    if (!FORCE_RESET) {
      const complete = await isPreviewComplete(client);
      if (complete) {
        console.log('[authority-preview-seed] Preview data is already complete (VERIFIED instrument exists).');
        console.log('[authority-preview-seed] Skipping — run with --force to reset and recreate.');
        console.log('');
        console.log(`  Login: ${OWNER_EMAIL} / ${SEED_PASSWORD}`);
        console.log(`  Reviewer: ${REVIEWER_EMAIL} / ${SEED_PASSWORD}`);
        console.log('');
        await pool.end();
        return;
      }
    }

    const wasReset = await scopedReset(client);
    if (wasReset) {
      console.log('[authority-preview-seed] Previous preview data removed — re-creating with clean data.');
    }
  } finally {
    client.release();
  }

  // ── 1. Create institution account ────────────────────────────────────────────
  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan, account_type, onboarded)
     VALUES ($1, 'institution', 'institution', true)
     RETURNING id`,
    [INST_NAME]
  );
  console.log(`[authority-preview-seed] Institution account: ${acct.id}`);

  // ── 2. Create owner user ─────────────────────────────────────────────────────
  const ownerHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const { rows: [owner] } = await pool.query(
    `INSERT INTO users (account_id, role, name, email, password_hash)
     VALUES ($1, 'owner', $2, $3, $4)
     RETURNING id`,
    [acct.id, OWNER_NAME, OWNER_EMAIL, ownerHash]
  );
  console.log(`[authority-preview-seed] Owner user: ${owner.id}  (${OWNER_EMAIL})`);

  // ── 3. Create reviewer user ──────────────────────────────────────────────────
  const reviewerHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const { rows: [reviewer] } = await pool.query(
    `INSERT INTO users (account_id, role, name, email, password_hash)
     VALUES ($1, 'owner', $2, $3, $4)
     RETURNING id`,
    [acct.id, REVIEWER_NAME, REVIEWER_EMAIL, reviewerHash]
  );
  console.log(`[authority-preview-seed] Reviewer user: ${reviewer.id}  (${REVIEWER_EMAIL})`);

  // ── 4. Grant capabilities ─────────────────────────────────────────────────────
  const ownerCaps = [
    'AUTHORITY_INSTRUMENT_VERIFY',
    'AUTHORITY_INSTRUMENT_REJECT',
    'AUTHORITY_EVALUATE',
    'AUTHORITY_API_CREDENTIAL_READ',
    'AUTHORITY_API_CREDENTIAL_MANAGE',
    'AUTHORITY_EXTRACTION_MANAGE',
  ];
  for (const cap of ownerCaps) {
    await authorityService.grantCapability(null, owner.id, cap);
  }
  // Reviewer: only verification/rejection capabilities — no AUTHORITY_EVALUATE
  await authorityService.grantCapability(null, reviewer.id, 'AUTHORITY_INSTRUMENT_VERIFY');
  await authorityService.grantCapability(null, reviewer.id, 'AUTHORITY_INSTRUMENT_REJECT');
  console.log('[authority-preview-seed] Capabilities granted to owner and reviewer');

  // ── 5. Create three synthetic parties ────────────────────────────────────────
  const principal = await authorityService.createParty(acct.id, owner.id, {
    partyType: 'person',
    displayName: PARTY_PRINCIPAL_NAME,
    externalReference: 'PARTY-PRINCIPAL-001',
  });

  const agent = await authorityService.createParty(acct.id, owner.id, {
    partyType: 'person',
    displayName: PARTY_AGENT_NAME,
    externalReference: 'PARTY-AGENT-001',
  });

  const coAgent = await authorityService.createParty(acct.id, owner.id, {
    partyType: 'organization',
    displayName: PARTY_COAGENT_NAME,
    externalReference: 'PARTY-COAGENT-001',
  });
  console.log(`[authority-preview-seed] Parties created: principal=${principal.id}, agent=${agent.id}, co_agent=${coAgent.id}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // MODE A — PREVIEW-CASE-001 (UI-verifiable)
  // Instrument stays PENDING_REVIEW so the walkthrough can verify through the UI.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── 6. Create instrument 1 ───────────────────────────────────────────────────
  const instr = await authorityService.createInstrument(acct.id, owner.id, {
    instrumentType: 'durable_power_of_attorney',
    effectiveDate:  '2024-03-15',
    expirationDate: '2027-03-15',
    jurisdiction:   'CA',
  });
  console.log(`[authority-preview-seed] Instrument 1 (Mode A): ${instr.id}`);

  // ── 7. Create case 1 and link instrument ─────────────────────────────────────
  const kase = await authorityService.createCase(acct.id, owner.id, {
    externalCaseReference: CASE_REF,
  });
  await authorityService.linkInstrumentToCase(acct.id, owner.id, kase.id, instr.id);
  await authorityService.transitionCase(acct.id, owner.id, kase.id, 'AWAITING_DOCUMENTS');

  // ── 8. Add participants to instrument 1 (case at AWAITING_DOCUMENTS → no assignment guard)
  const p1 = await authorityService.addParticipant(acct.id, owner.id, instr.id, {
    partyId:  principal.id,
    role:     'principal',
    sequence: 1,
  });
  const p2 = await authorityService.addParticipant(acct.id, owner.id, instr.id, {
    partyId:  agent.id,
    role:     'agent',
    sequence: 1,
  });
  const p3 = await authorityService.addParticipant(acct.id, owner.id, instr.id, {
    partyId:  coAgent.id,
    role:     'co_agent',
    sequence: 2,
  });
  console.log('[authority-preview-seed] Instrument 1 participants added');

  // ── 9. Add permissions to instrument 1 ───────────────────────────────────────
  await authorityService.addPermission(acct.id, owner.id, instr.id, {
    actionKey:     'BANKING.WIRE_TRANSFER',
    grantType:     'granted',
    participantId: p2.id,
  });
  await authorityService.addPermission(acct.id, owner.id, instr.id, {
    actionKey:     'BANKING.ACH_TRANSFER',
    grantType:     'granted',
    participantId: p2.id,
  });
  await authorityService.addPermission(acct.id, owner.id, instr.id, {
    actionKey:     'BANKING.CASH_WITHDRAWAL',
    grantType:     'prohibited',
    participantId: p2.id,
  });
  console.log('[authority-preview-seed] Instrument 1 permissions added');

  // ── 10. Add restrictions to instrument 1 ──────────────────────────────────────
  await authorityService.addRestriction(acct.id, owner.id, instr.id, {
    restrictionType: 'monetary_limit',
    parameters:      { amount: 50000000, currency: 'USD' },  // $500,000 in cents
    participantId:   p2.id,
  });
  await authorityService.addRestriction(acct.id, owner.id, instr.id, {
    restrictionType: 'date_window',
    effectiveFrom:   '2024-03-15',
    effectiveTo:     '2027-03-15',
  });
  console.log('[authority-preview-seed] Instrument 1 restrictions added');

  // ── 11. Transition instrument 1 → PENDING_REVIEW ─────────────────────────────
  await authorityService.transitionInstrument(acct.id, owner.id, instr.id, 'PENDING_REVIEW', {
    actorType: 'human',
  });
  console.log('[authority-preview-seed] Instrument 1 → PENDING_REVIEW');

  // ── 12. ⚠ LOCAL VISUAL PREVIEW ONLY ──────────────────────────────────────────
  //  Bypass document guard via direct SQL → PENDING_HUMAN_REVIEW.
  //  The AWAITING_DOCUMENTS → PENDING_EXTRACTION → EXTRACTION_COMPLETE →
  //  PENDING_HUMAN_REVIEW lifecycle requires a real uploaded document for
  //  PENDING_EXTRACTION (guarded by the service layer).  No R2 bucket is
  //  configured locally, so we advance directly via SQL.  This respects the
  //  DB CHECK constraint on status but bypasses the document-existence guard.
  //  Documents = 0 in the UI is correct and expected for this preview case.
  await pool.query(
    `UPDATE authority_cases
     SET status = 'PENDING_HUMAN_REVIEW', status_changed_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [kase.id]
  );
  console.log('[authority-preview-seed] Case 1 → PENDING_HUMAN_REVIEW (direct SQL, no document — LOCAL VISUAL PREVIEW ONLY)');

  // ── 13. Reviewer claims case 1 → HUMAN_REVIEW_IN_PROGRESS ───────────────────
  await authorityService.claimCase(acct.id, reviewer.id, kase.id);
  console.log('[authority-preview-seed] Case 1 claimed by reviewer → HUMAN_REVIEW_IN_PROGRESS');

  // ── 14. Add seed review note ──────────────────────────────────────────────────
  await authorityService.addReviewNote(
    acct.id, reviewer.id, kase.id,
    `${SEED_TAG} Initial review note. Document chain advanced directly to PENDING_HUMAN_REVIEW ` +
    `for local preview — no real document or extraction evidence exists. ` +
    `Instrument PENDING_REVIEW with 3 participants, 3 permissions, 2 restrictions. ` +
    `Verify this instrument through the Case Workspace to demonstrate Mode A.`,
    instr.id,
  );
  console.log('[authority-preview-seed] Review note added to Case 1');

  // ═══════════════════════════════════════════════════════════════════════════
  // PREVIEW-CASE-002 — unassigned queue entry
  // ═══════════════════════════════════════════════════════════════════════════

  // ── 15. Create instrument 2 (trust, unlinked pending) ─────────────────────────
  const instr2 = await authorityService.createInstrument(acct.id, owner.id, {
    instrumentType: 'trust',
    effectiveDate:  '2024-06-01',
    expirationDate: '2029-06-01',
    jurisdiction:   'NY',
  });
  console.log(`[authority-preview-seed] Instrument 2: ${instr2.id}`);

  const kase2 = await authorityService.createCase(acct.id, owner.id, {
    externalCaseReference: CASE_REF_2,
  });
  await authorityService.linkInstrumentToCase(acct.id, owner.id, kase2.id, instr2.id);
  await authorityService.transitionCase(acct.id, owner.id, kase2.id, 'AWAITING_DOCUMENTS');

  await authorityService.addParticipant(acct.id, owner.id, instr2.id, {
    partyId:  principal.id,
    role:     'principal',
    sequence: 1,
  });
  await authorityService.addParticipant(acct.id, owner.id, instr2.id, {
    partyId:  agent.id,
    role:     'trustee',
    sequence: 1,
  });

  await authorityService.addPermission(acct.id, owner.id, instr2.id, {
    actionKey:     'REAL_ESTATE.SIGN_DEED',
    grantType:     'granted',
    participantId: null,
  });

  await authorityService.transitionInstrument(acct.id, owner.id, instr2.id, 'PENDING_REVIEW', {
    actorType: 'human',
  });

  // ⚠ LOCAL VISUAL PREVIEW ONLY — same direct SQL bypass as Case 1
  await pool.query(
    `UPDATE authority_cases
     SET status = 'PENDING_HUMAN_REVIEW', status_changed_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [kase2.id]
  );
  console.log('[authority-preview-seed] Case 2 → PENDING_HUMAN_REVIEW (direct SQL, unassigned — LOCAL VISUAL PREVIEW ONLY)');

  // ═══════════════════════════════════════════════════════════════════════════
  // MODE B — PREVIEW-CASE-VERIFY (pre-verified instrument)
  //
  // This case exists so that /authority/evaluate shows a VERIFIED instrument
  // immediately after running the seed, without requiring a UI walkthrough first.
  //
  // Verification is performed EXCLUSIVELY through authorityService.transitionInstrument()
  // with actorType: 'human' — the same code path production uses.  No direct SQL
  // write to status = 'VERIFIED' is used anywhere in this script.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── 16. Create instrument 3 (Mode B — will be VERIFIED) ───────────────────────
  const instrVerify = await authorityService.createInstrument(acct.id, owner.id, {
    instrumentType: 'durable_power_of_attorney',
    effectiveDate:  '2024-03-15',
    expirationDate: '2027-03-15',
    jurisdiction:   'CA',
  });
  console.log(`[authority-preview-seed] Instrument 3 (Mode B): ${instrVerify.id}`);

  const kaseVerify = await authorityService.createCase(acct.id, owner.id, {
    externalCaseReference: CASE_REF_VERIFY,
  });
  await authorityService.linkInstrumentToCase(acct.id, owner.id, kaseVerify.id, instrVerify.id);
  await authorityService.transitionCase(acct.id, owner.id, kaseVerify.id, 'AWAITING_DOCUMENTS');

  // ── 17. Add participants to instrument 3 (case at AWAITING_DOCUMENTS → no assignment guard)
  const pv1 = await authorityService.addParticipant(acct.id, owner.id, instrVerify.id, {
    partyId:  principal.id,
    role:     'principal',
    sequence: 1,
  });
  const pv2 = await authorityService.addParticipant(acct.id, owner.id, instrVerify.id, {
    partyId:  agent.id,
    role:     'agent',
    sequence: 1,
  });
  console.log('[authority-preview-seed] Instrument 3 participants added');

  // ── 18. Add permissions to instrument 3 ──────────────────────────────────────
  await authorityService.addPermission(acct.id, owner.id, instrVerify.id, {
    actionKey:     'BANKING.WIRE_TRANSFER',
    grantType:     'granted',
    participantId: pv2.id,
  });
  await authorityService.addPermission(acct.id, owner.id, instrVerify.id, {
    actionKey:     'BANKING.ACH_TRANSFER',
    grantType:     'granted',
    participantId: pv2.id,
  });
  console.log('[authority-preview-seed] Instrument 3 permissions added');

  // ── 19. Add restriction to instrument 3 ──────────────────────────────────────
  await authorityService.addRestriction(acct.id, owner.id, instrVerify.id, {
    restrictionType: 'monetary_limit',
    parameters:      { amount: 50000000, currency: 'USD' },  // $500,000 in cents
    participantId:   pv2.id,
  });
  console.log('[authority-preview-seed] Instrument 3 restriction added');

  // ── 20. Transition instrument 3 → PENDING_REVIEW ─────────────────────────────
  await authorityService.transitionInstrument(acct.id, owner.id, instrVerify.id, 'PENDING_REVIEW', {
    actorType: 'human',
  });
  console.log('[authority-preview-seed] Instrument 3 → PENDING_REVIEW');

  // ── 21. ⚠ LOCAL VISUAL PREVIEW ONLY — same direct SQL bypass ─────────────────
  await pool.query(
    `UPDATE authority_cases
     SET status = 'PENDING_HUMAN_REVIEW', status_changed_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [kaseVerify.id]
  );
  console.log('[authority-preview-seed] Case VERIFY → PENDING_HUMAN_REVIEW (direct SQL — LOCAL VISUAL PREVIEW ONLY)');

  // ── 22. Reviewer claims case VERIFY → HUMAN_REVIEW_IN_PROGRESS ───────────────
  await authorityService.claimCase(acct.id, reviewer.id, kaseVerify.id);
  console.log('[authority-preview-seed] Case VERIFY claimed by reviewer → HUMAN_REVIEW_IN_PROGRESS');

  // ── 23. Reviewer verifies instrument 3 — REAL SERVICE PATH ONLY ───────────────
  //
  //  This call goes through authorityService.transitionInstrument() which:
  //    1. Enforces actorType === 'human'
  //    2. Checks AUTHORITY_INSTRUMENT_VERIFY capability
  //    3. Checks same-institution membership
  //    4. Checks active case assignment (reviewer is active assignee of kaseVerify)
  //    5. Locks instrument + parties in ID order inside a transaction
  //    6. Writes verified_by_user_id, verified_at, verification_actor_type,
  //       verification_authorization_context to the instrument row
  //    7. Emits authority.instrument.verified audit event
  //
  //  No direct SQL write to status = 'VERIFIED' is used.
  const verifiedInstr = await authorityService.transitionInstrument(
    acct.id, reviewer.id, instrVerify.id, 'VERIFIED', { actorType: 'human' }
  );
  console.log(`[authority-preview-seed] Instrument 3 → VERIFIED (through real service, reviewer=${reviewer.id})`);

  // ── 24. Complete case VERIFY ──────────────────────────────────────────────────
  //  Allowed because instrument 3 is now VERIFIED (no UNVERIFIED/PENDING_REVIEW instruments).
  //  Atomically ends the active assignment.
  await authorityService.transitionCase(acct.id, reviewer.id, kaseVerify.id, 'COMPLETED');
  console.log('[authority-preview-seed] Case VERIFY → COMPLETED');

  await pool.end();

  console.log('');
  console.log('[authority-preview-seed] ✓ Complete.');
  console.log('');
  console.log('  Institution account:', acct.id);
  console.log('');
  console.log('  Mode A — UI-verifiable case:');
  console.log('    Case 1 (in review): ', kase.id,       `(ref: ${CASE_REF})  — HUMAN_REVIEW_IN_PROGRESS`);
  console.log('    Instrument 1:       ', instr.id,       '(durable_power_of_attorney, PENDING_REVIEW)');
  console.log('    → Log in as reviewer, open this case, and click Verify to demonstrate Mode A.');
  console.log('');
  console.log('  Mode B — pre-verified (available in /authority/evaluate immediately):');
  console.log('    Case VERIFY (completed):', kaseVerify.id, `(ref: ${CASE_REF_VERIFY}) — COMPLETED`);
  console.log('    Instrument 3 (VERIFIED):', instrVerify.id);
  console.log('    Verified by reviewer:    ', reviewer.id);
  console.log('');
  console.log('  Queue entry:');
  console.log('    Case 2 (queued): ', kase2.id, `(ref: ${CASE_REF_2}) — PENDING_HUMAN_REVIEW`);
  console.log('    Instrument 2:    ', instr2.id, '(trust, PENDING_REVIEW)');
  console.log('');
  console.log('  Document note: All three cases use the LOCAL VISUAL PREVIEW ONLY lifecycle');
  console.log('  shortcut (direct SQL bypass). Documents = 0 is correct and expected.');
  console.log('');
  console.log('  Login credentials:');
  console.log(`    Owner:    ${OWNER_EMAIL} / ${SEED_PASSWORD}`);
  console.log(`    Reviewer: ${REVIEWER_EMAIL} / ${SEED_PASSWORD}`);
  console.log('');
  console.log('  Access path: login → /authority');
  console.log('  Evaluate:    login → /authority/evaluate (Mode B instrument is immediately available)');
  if (FORCE_RESET) {
    console.log('');
    console.log('  Note: --force was used. Any evaluation records from a previous walkthrough');
    console.log('  were deleted as part of the scoped reset. Rerun without --force after the');
    console.log('  walkthrough to preserve evaluation records.');
  }
}

run().catch(err => {
  console.error('[authority-preview-seed] FAILED:', err.message);
  if (err.detail) console.error('  Detail:', err.detail);
  process.exit(1);
});
