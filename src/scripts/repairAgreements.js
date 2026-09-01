'use strict';
/**
 * Reprocesses all active recurring agreements to generate missing calendar jobs.
 * Run with: railway run node src/scripts/repairAgreements.js
 */
const pool = require('../db/pool');
const { processAgreement } = require('../services/agreementScheduler');

async function main() {
  const { rows } = await pool.query(
    `SELECT * FROM recurring_agreements WHERE status = 'active' ORDER BY created_at`
  );
  console.log(`Found ${rows.length} active agreement(s) to reprocess`);
  for (const ag of rows) {
    console.log(`\nProcessing: ${ag.id} (${ag.name})`);
    await processAgreement(ag);
  }
  await pool.end();
  console.log('\nRepair complete');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
