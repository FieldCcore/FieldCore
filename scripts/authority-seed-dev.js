/**
 * FieldCore Authority — Development / Demo Seed Script
 *
 * Creates a complete synthetic institution scenario:
 *  - One institution account with an owner user
 *  - One reviewer user with AUTHORITY_INSTRUMENT_VERIFY + AUTHORITY_INSTRUMENT_REJECT capabilities
 *  - Two synthetic parties (principal and agent)
 *  - One case advanced through the full lifecycle to HUMAN_REVIEW_IN_PROGRESS
 *  - One instrument with participants, permissions, restrictions, and a VERIFIED path
 *
 * SAFETY: refuses to run in production (NODE_ENV=production).
 * All data is clearly synthetic — names contain "__SEED_DEV__" prefix.
 *
 * Usage: node scripts/authority-seed-dev.js
 */

'use strict';

if (process.env.NODE_ENV === 'production') {
  console.error('[authority-seed-dev] REFUSED: will not run in production.');
  process.exit(1);
}

if (process.env.AUTHORITY_DEV_SEED_ENABLED !== 'true') {
  console.error('[authority-seed-dev] REFUSED: set AUTHORITY_DEV_SEED_ENABLED=true to run this script.');
  process.exit(1);
}

require('dotenv').config();

const crypto   = require('crypto');
const bcrypt   = require('bcryptjs');
const pool     = require('../src/db/pool');
const { runMigrations } = require('../src/db/migrate');
const authorityService   = require('../src/services/authorityService');
const authorityCrypto    = require('../src/services/authorityCrypto');
const extractionService  = require('../src/services/authorityExtractionService');
const extractionWorker   = require('../src/workers/authorityExtractionWorker');

// Minimal synthetic PDF — valid magic bytes, no real content
const SYNTHETIC_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n' +
  '2 0 obj\n<</Type /Pages /Kids [] /Count 0>>\nendobj\n' +
  'xref\n0 3\n0000000000 65535 f \ntrailer\n<</Size 3/Root 1 0 R>>\nstartxref\n9\n%%EOF'
);

// Poll until a case leaves PENDING_EXTRACTION.
async function waitForExtractionComplete(accountId, caseId, maxWaitMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const kase = await authorityService.getCase(accountId, caseId);
    if (kase.status !== 'PENDING_EXTRACTION') return kase;
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error(
    `[authority-seed-dev] Extraction did not complete within ${maxWaitMs}ms. ` +
    'Ensure R2 storage is configured (R2_AUTHORITY_* env vars) and the extraction worker can reach it.',
  );
}

async function seed() {
  console.log('[authority-seed-dev] Starting…');

  await runMigrations();
  console.log('[authority-seed-dev] Migrations complete.');

  const plainPw = process.env.SEED_DEV_PASSWORD || crypto.randomBytes(16).toString('hex');
  const hash = await bcrypt.hash(plainPw, 10);

  // 1. Create institution account
  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan, account_type)
     VALUES ('__SEED_DEV__ First National Trust', 'institution', 'institution')
     RETURNING id, name`,
  );
  console.log(`[authority-seed-dev] Institution account: ${acct.id} (${acct.name})`);

  // 2. Create owner user
  const { rows: [owner] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1, '__SEED_DEV__ Alice Owner', $2, $3, 'owner')
     RETURNING id`,
    [acct.id, `seed-authority-owner-${Date.now()}@fieldcore.dev`, hash]
  );
  console.log(`[authority-seed-dev] Owner user: ${owner.id}`);

  // 3. Create reviewer user
  const { rows: [reviewer] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1, '__SEED_DEV__ Bob Reviewer', $2, $3, 'owner')
     RETURNING id`,
    [acct.id, `seed-authority-reviewer-${Date.now()}@fieldcore.dev`, hash]
  );
  console.log(`[authority-seed-dev] Reviewer user: ${reviewer.id}`);

  // 4. Grant capabilities to reviewer (uses real grantCapability path)
  await authorityService.grantCapability(null, reviewer.id, 'AUTHORITY_INSTRUMENT_VERIFY');
  await authorityService.grantCapability(null, reviewer.id, 'AUTHORITY_INSTRUMENT_REJECT');
  console.log('[authority-seed-dev] Reviewer capabilities granted.');

  // 5. Create parties
  const principal = await authorityService.createParty(acct.id, owner.id, {
    partyType:          'person',
    displayName:        '__SEED_DEV__ Carol Principal',
    externalReference:  'SEED-PRINCIPAL-001',
  });
  console.log(`[authority-seed-dev] Principal party: ${principal.id}`);

  const agent = await authorityService.createParty(acct.id, owner.id, {
    partyType:          'person',
    displayName:        '__SEED_DEV__ Dave Agent',
    externalReference:  'SEED-AGENT-001',
  });
  console.log(`[authority-seed-dev] Agent party: ${agent.id}`);

  // 6. Create instrument with participants, permissions, restrictions
  const instr = await authorityService.createInstrument(acct.id, owner.id, {
    instrumentType:  'durable_power_of_attorney',
    effectiveDate:   '2026-01-01',
    expirationDate:  '2030-12-31',
    jurisdiction:    'Delaware, USA',
  });
  console.log(`[authority-seed-dev] Instrument: ${instr.id}`);

  await authorityService.addParticipant(acct.id, owner.id, instr.id,
    { partyId: principal.id, role: 'principal', sequence: 1 });
  await authorityService.addParticipant(acct.id, owner.id, instr.id,
    { partyId: agent.id, role: 'agent', sequence: 2 });
  await authorityService.addPermission(acct.id, owner.id, instr.id,
    { actionKey: 'BANKING.WIRE_TRANSFER', grantType: 'granted' });
  await authorityService.addPermission(acct.id, owner.id, instr.id,
    { actionKey: 'BANKING.ACH_TRANSFER', grantType: 'granted' });
  await authorityService.addRestriction(acct.id, owner.id, instr.id,
    {
      restrictionType: 'monetary_limit',
      parameters:      { amount: 50000000, currency: 'USD' },
    });
  console.log('[authority-seed-dev] Participants, permissions, restrictions added.');

  // 7. Create and advance a case to HUMAN_REVIEW_IN_PROGRESS
  const kase = await authorityService.createCase(acct.id, owner.id,
    { externalCaseReference: 'SEED-CASE-001' });
  await authorityService.linkInstrumentToCase(acct.id, owner.id, kase.id, instr.id);
  await authorityService.transitionCase(acct.id, owner.id, kase.id, 'AWAITING_DOCUMENTS');

  // Upload synthetic document
  const doc = await authorityService.uploadDocument(acct.id, owner.id, SYNTHETIC_PDF, {
    caseId:           kase.id,
    instrumentId:     instr.id,
    originalFilename: 'synthetic-power-of-attorney.pdf',
  });
  console.log(`[authority-seed-dev] Document uploaded: ${doc.id}`);

  // Transition to PENDING_EXTRACTION — enqueues real extraction runs for the synthetic document.
  await authorityService.transitionCase(acct.id, owner.id, kase.id, 'PENDING_EXTRACTION');
  extractionWorker.start();
  console.log('[authority-seed-dev] Extraction worker started — waiting for EXTRACTION_COMPLETE…');
  await waitForExtractionComplete(acct.id, kase.id);
  extractionWorker.stop();
  console.log(`[authority-seed-dev] Case ${kase.id} extraction complete.`);

  await authorityService.transitionCase(acct.id, owner.id, kase.id, 'PENDING_HUMAN_REVIEW');
  console.log(`[authority-seed-dev] Case ${kase.id} advanced to PENDING_HUMAN_REVIEW.`);

  // 8. Submit instrument for review (owner)
  await authorityService.transitionInstrument(acct.id, owner.id, instr.id, 'PENDING_REVIEW',
    { actorType: 'human' });

  // 9. Reviewer claims the case — this transitions it to HUMAN_REVIEW_IN_PROGRESS
  //    Must happen BEFORE candidate review so the reviewer has an active assignment.
  const assignment = await authorityService.claimCase(acct.id, reviewer.id, kase.id);
  console.log(`[authority-seed-dev] Case claimed; assignment: ${assignment.id}`);

  // 9b. Reviewer accepts/rejects extraction candidates (active assignment required).
  //     Candidates with evidence are accepted; those without are rejected.
  //     Participant name candidates (principal_name, agent_name) are accepted for the
  //     record but make no structural change to party data — that is by design.
  {
    const candidates = await extractionService.listCandidatesForCase(acct.id, kase.id);
    let accepted = 0, rejected = 0;
    for (const c of candidates) {
      if (c.status !== 'pending') continue;
      if (c.evidence && c.evidence.length > 0) {
        await extractionService.acceptCandidate(acct.id, reviewer.id, c.id, { rowVersion: c.rowVersion });
        accepted++;
      } else {
        await extractionService.rejectCandidate(acct.id, reviewer.id, c.id, 'No supporting evidence from extraction');
        rejected++;
      }
    }
    console.log(`[authority-seed-dev] Reviewed candidates: ${accepted} accepted, ${rejected} rejected.`);
  }

  // 10. Reviewer verifies instrument (active assignee required)
  const verified = await authorityService.transitionInstrument(
    acct.id, reviewer.id, instr.id, 'VERIFIED', { actorType: 'human' }
  );
  console.log(`[authority-seed-dev] Instrument VERIFIED by reviewer: ${verified.status}`);

  // 11. Add a review note (active assignee required)
  await authorityService.addReviewNote(acct.id, reviewer.id, kase.id,
    'Seed review note: instrument verified. All parties confirmed. Ready to complete.');
  console.log('[authority-seed-dev] Review note added.');

  // 12. Complete the case
  await authorityService.transitionCase(acct.id, reviewer.id, kase.id, 'COMPLETED');
  console.log(`[authority-seed-dev] Main case COMPLETED.`);

  // ── Additional scenarios ────────────────────────────────────────────────────

  // Scenario B: Case stopped at AWAITING_DOCUMENTS
  const kaseB = await authorityService.createCase(acct.id, owner.id,
    { externalCaseReference: 'SEED-CASE-AWAITING' });
  await authorityService.transitionCase(acct.id, owner.id, kaseB.id, 'AWAITING_DOCUMENTS');
  console.log(`[authority-seed-dev] Scenario B (AWAITING_DOCUMENTS) case: ${kaseB.id}`);

  // Scenario C: Case stopped at PENDING_EXTRACTION (has document but not yet extracted)
  const instrC = await authorityService.createInstrument(acct.id, owner.id, {
    instrumentType:  'letter_of_authorization',
    effectiveDate:   '2026-06-01',
    expirationDate:  '2027-06-01',
    jurisdiction:    'California, USA',
  });
  const kaseC = await authorityService.createCase(acct.id, owner.id,
    { externalCaseReference: 'SEED-CASE-PENDING-EXTRACTION' });
  await authorityService.linkInstrumentToCase(acct.id, owner.id, kaseC.id, instrC.id);
  await authorityService.transitionCase(acct.id, owner.id, kaseC.id, 'AWAITING_DOCUMENTS');
  await authorityService.uploadDocument(acct.id, owner.id, SYNTHETIC_PDF, {
    caseId:           kaseC.id,
    instrumentId:     instrC.id,
    originalFilename: 'synthetic-letter-of-authorization.pdf',
  });
  // Transition to PENDING_EXTRACTION — runs are auto-enqueued. The worker is not started here
  // so the case remains in PENDING_EXTRACTION, demonstrating the queued-but-not-yet-processed state.
  await authorityService.transitionCase(acct.id, owner.id, kaseC.id, 'PENDING_EXTRACTION');
  console.log(`[authority-seed-dev] Scenario C (PENDING_EXTRACTION — runs enqueued, not yet processed) case: ${kaseC.id}`);

  // Scenario D: Instrument REJECTED (reviewer rejects)
  const instrD = await authorityService.createInstrument(acct.id, owner.id, {
    instrumentType:  'guardianship_order',
    effectiveDate:   '2025-01-01',
    expirationDate:  null,
    jurisdiction:    'New York, USA',
  });
  const partyD = await authorityService.createParty(acct.id, owner.id, {
    partyType:         'person',
    displayName:       '__SEED_DEV__ Eve Guardian',
    externalReference: 'SEED-GUARDIAN-001',
  });
  await authorityService.addParticipant(acct.id, owner.id, instrD.id,
    { partyId: partyD.id, role: 'guardian', sequence: 1 });
  const kaseD = await authorityService.createCase(acct.id, owner.id,
    { externalCaseReference: 'SEED-CASE-REJECTED' });
  await authorityService.linkInstrumentToCase(acct.id, owner.id, kaseD.id, instrD.id);
  await authorityService.transitionCase(acct.id, owner.id, kaseD.id, 'AWAITING_DOCUMENTS');
  await authorityService.uploadDocument(acct.id, owner.id, SYNTHETIC_PDF, {
    caseId:           kaseD.id,
    instrumentId:     instrD.id,
    originalFilename: 'synthetic-guardianship-order.pdf',
  });
  await authorityService.transitionCase(acct.id, owner.id, kaseD.id, 'PENDING_EXTRACTION');
  extractionWorker.start();
  console.log('[authority-seed-dev] Extraction worker started for Scenario D…');
  await waitForExtractionComplete(acct.id, kaseD.id);
  extractionWorker.stop();
  await authorityService.transitionCase(acct.id, owner.id, kaseD.id, 'PENDING_HUMAN_REVIEW');
  await authorityService.transitionInstrument(acct.id, owner.id, instrD.id, 'PENDING_REVIEW',
    { actorType: 'human' });
  await authorityService.claimCase(acct.id, reviewer.id, kaseD.id);
  await authorityService.transitionInstrument(acct.id, reviewer.id, instrD.id, 'REJECTED',
    { actorType: 'human', rejectionReason: 'Synthetic rejection: document does not match jurisdiction requirements.' });
  console.log(`[authority-seed-dev] Scenario D (REJECTED instrument) case: ${kaseD.id}`);

  console.log('\n[authority-seed-dev] ✓ Complete.\n');
  console.log(`  Institution account ID : ${acct.id}`);
  console.log(`  Owner user ID          : ${owner.id}`);
  console.log(`  Reviewer user ID       : ${reviewer.id}`);
  console.log(`\n  Scenario A (COMPLETED case):`);
  console.log(`    Case ID              : ${kase.id}`);
  console.log(`    Instrument ID        : ${instr.id}  (status: VERIFIED)`);
  console.log(`  Scenario B (AWAITING_DOCUMENTS): Case ${kaseB.id}`);
  console.log(`  Scenario C (PENDING_EXTRACTION): Case ${kaseC.id}`);
  console.log(`  Scenario D (REJECTED instrument): Case ${kaseD.id}`);
  console.log(`\n  Reviewer password: ${plainPw}`);
  console.log('  (also available as SEED_DEV_PASSWORD env var if you set it)\n');

  await pool.end();
}

seed().catch(err => {
  console.error('[authority-seed-dev] FAILED:', err.message);
  pool.end().finally(() => process.exit(1));
});
