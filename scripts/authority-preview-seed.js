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
 *  - Idempotent: if the preview owner email already exists, scoped reset runs
 *    first so the seed can re-create with clean data.
 *
 * Usage:
 *   node scripts/authority-preview-seed.js
 *
 * Login credentials created:
 *   Institution owner:   institution@getfieldcore.com / institution2024
 *   Institution reviewer: reviewer@getfieldcore.com  / institution2024
 */

'use strict';

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

// Internal tag for review notes — never shown in UI display fields
const SEED_TAG       = '__PREVIEW__';
const OWNER_EMAIL    = 'institution@getfieldcore.com';
const REVIEWER_EMAIL = 'reviewer@getfieldcore.com';
const SEED_PASSWORD  = 'institution2024';
const CASE_REF       = 'PREVIEW-CASE-001';
const CASE_REF_2     = 'PREVIEW-CASE-002';

// ── Display names (no __PREVIEW__ prefix — clean for UI walkthrough) ──────────
const INST_NAME      = 'Harborview Trust & Advisory (Demo)';
const OWNER_NAME     = 'Morgan Chen';
const REVIEWER_NAME  = 'Alex Rivera';
const PARTY_PRINCIPAL_NAME = 'Eleanor Whitfield';
const PARTY_AGENT_NAME     = 'James Thatcher';
const PARTY_COAGENT_NAME   = 'Meridian Trust Services LLC';

/**
 * Delete all data owned by the preview account (identified by OWNER_EMAIL).
 * Uses direct SQL to bypass service-layer guards (e.g. party identity lock).
 * Safe: only runs after the production guard above, never in NODE_ENV=production.
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

  // ── Idempotency guard (by owner email, not name) ─────────────────────────────
  const client = await pool.connect();
  try {
    const wasReset = await scopedReset(client);
    if (wasReset) {
      console.log('[authority-preview-seed] Previous preview data removed — re-creating with clean names.');
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

  // ── 6. Create instrument ─────────────────────────────────────────────────────
  const instr = await authorityService.createInstrument(acct.id, owner.id, {
    instrumentType: 'durable_power_of_attorney',
    effectiveDate:  '2024-03-15',
    expirationDate: '2027-03-15',
    jurisdiction:   'CA',
  });
  console.log(`[authority-preview-seed] Instrument created: ${instr.id}`);

  // ── 7. Create case and link instrument ───────────────────────────────────────
  const kase = await authorityService.createCase(acct.id, owner.id, {
    externalCaseReference: CASE_REF,
  });
  await authorityService.linkInstrumentToCase(acct.id, owner.id, kase.id, instr.id);
  console.log(`[authority-preview-seed] Case created: ${kase.id}  ref=${CASE_REF}`);

  // ── 8. Advance case to AWAITING_DOCUMENTS (safe: no guard) ──────────────────
  await authorityService.transitionCase(acct.id, owner.id, kase.id, 'AWAITING_DOCUMENTS');

  // ── 9. Add participants while case is AWAITING_DOCUMENTS ────────────────────
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
  console.log('[authority-preview-seed] Participants added');

  // ── 10. Add permissions ───────────────────────────────────────────────────────
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
  console.log('[authority-preview-seed] Permissions added');

  // ── 11. Add restrictions ──────────────────────────────────────────────────────
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
  console.log('[authority-preview-seed] Restrictions added');

  // ── 12. Transition instrument → PENDING_REVIEW ───────────────────────────────
  await authorityService.transitionInstrument(acct.id, owner.id, instr.id, 'PENDING_REVIEW', {
    actorType: 'human',
  });
  console.log('[authority-preview-seed] Instrument → PENDING_REVIEW');

  // ── 13. Bypass document guard via direct SQL → PENDING_HUMAN_REVIEW ──────────
  //        ⚠  DEVELOPMENT PREVIEW ONLY — never replicate this pattern in production.
  //        The AWAITING_DOCUMENTS → PENDING_EXTRACTION → EXTRACTION_COMPLETE →
  //        PENDING_HUMAN_REVIEW lifecycle requires a real uploaded document for
  //        PENDING_EXTRACTION (guarded by the service layer).  No R2 bucket is
  //        configured locally, so we advance directly via SQL.  This respects the
  //        DB CHECK constraint on status but bypasses the document-existence guard.
  await pool.query(
    `UPDATE authority_cases
     SET status = 'PENDING_HUMAN_REVIEW', status_changed_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [kase.id]
  );
  console.log('[authority-preview-seed] Case → PENDING_HUMAN_REVIEW (direct SQL, no document)');

  // ── 14. Reviewer claims case → HUMAN_REVIEW_IN_PROGRESS ─────────────────────
  await authorityService.claimCase(acct.id, reviewer.id, kase.id);
  console.log('[authority-preview-seed] Case claimed → HUMAN_REVIEW_IN_PROGRESS');

  // ── 15. Add a seed review note (reviewer is now active assignee) ─────────────
  await authorityService.addReviewNote(
    acct.id, reviewer.id, kase.id,
    `${SEED_TAG} Initial review note. Document chain advanced directly to PENDING_HUMAN_REVIEW ` +
    `for local preview — no real document or extraction evidence exists. ` +
    `Instrument PENDING_REVIEW with 3 participants, 3 permissions, 2 restrictions.`,
    instr.id,
  );
  console.log('[authority-preview-seed] Review note added');

  // ── 16. Create second instrument (unlinked pending) ───────────────────────────
  const instr2 = await authorityService.createInstrument(acct.id, owner.id, {
    instrumentType: 'trust',
    effectiveDate:  '2024-06-01',
    expirationDate: '2029-06-01',
    jurisdiction:   'NY',
  });
  console.log(`[authority-preview-seed] Second instrument created: ${instr2.id}`);

  // ── 17. Create second case and link second instrument ─────────────────────────
  const kase2 = await authorityService.createCase(acct.id, owner.id, {
    externalCaseReference: CASE_REF_2,
  });
  await authorityService.linkInstrumentToCase(acct.id, owner.id, kase2.id, instr2.id);
  await authorityService.transitionCase(acct.id, owner.id, kase2.id, 'AWAITING_DOCUMENTS');

  // ── 18. Add participants to second instrument ─────────────────────────────────
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
  console.log('[authority-preview-seed] Second instrument participants added');

  // ── 19. Add permission to second instrument ───────────────────────────────────
  await authorityService.addPermission(acct.id, owner.id, instr2.id, {
    actionKey:     'REAL_ESTATE.SIGN_DEED',
    grantType:     'granted',
    participantId: null,
  });
  console.log('[authority-preview-seed] Second instrument permission added');

  // ── 20. Advance second instrument to PENDING_REVIEW ──────────────────────────
  await authorityService.transitionInstrument(acct.id, owner.id, instr2.id, 'PENDING_REVIEW', {
    actorType: 'human',
  });

  // ── 21. Advance second case to PENDING_HUMAN_REVIEW via direct SQL ────────────
  //        ⚠  DEVELOPMENT PREVIEW ONLY — same bypass as case 1 above.
  await pool.query(
    `UPDATE authority_cases
     SET status = 'PENDING_HUMAN_REVIEW', status_changed_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [kase2.id]
  );
  console.log('[authority-preview-seed] Second case → PENDING_HUMAN_REVIEW (direct SQL, unassigned)');

  await pool.end();

  console.log('');
  console.log('[authority-preview-seed] ✓ Complete.');
  console.log('');
  console.log('  Institution account:', acct.id);
  console.log('  Case 1 (in review): ', kase.id,  `(ref: ${CASE_REF})  — HUMAN_REVIEW_IN_PROGRESS`);
  console.log('  Case 2 (queued):    ', kase2.id, `(ref: ${CASE_REF_2}) — PENDING_HUMAN_REVIEW`);
  console.log('  Instrument 1 ID:    ', instr.id,  '(durable_power_of_attorney)');
  console.log('  Instrument 2 ID:    ', instr2.id, '(trust)');
  console.log('');
  console.log('  Login credentials:');
  console.log(`    Owner:    ${OWNER_EMAIL} / ${SEED_PASSWORD}`);
  console.log(`    Reviewer: ${REVIEWER_EMAIL} / ${SEED_PASSWORD}`);
  console.log('');
  console.log('  Access path: login → /authority');
}

run().catch(err => {
  console.error('[authority-preview-seed] FAILED:', err.message);
  if (err.detail) console.error('  Detail:', err.detail);
  process.exit(1);
});
