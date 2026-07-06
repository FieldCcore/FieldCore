/**
 * reset-plan-railway.js
 * Resets a single FieldCore account to plan='starter' for Stripe checkout testing.
 * Reads DATABASE_URL from the environment only — no .env file loaded.
 * Run via Railway CLI:  railway run node scripts/reset-plan-railway.js
 * Or inline:           DATABASE_URL="..." node scripts/reset-plan-railway.js
 */
const { Pool } = require('pg');

const ACCOUNT_ID = '662d6a2e-8afd-4d0a-be97-abfca831ca99';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('\n  ERROR: DATABASE_URL is not set.\n');
  console.error('  Run via Railway CLI:  railway run node scripts/reset-plan-railway.js');
  console.error('  Or inline:            DATABASE_URL="postgresql://..." node scripts/reset-plan-railway.js\n');
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

async function main() {
  // Before
  const { rows: before } = await pool.query(
    `SELECT plan, plan_status, stripe_subscription_id FROM accounts WHERE id = $1`,
    [ACCOUNT_ID]
  );

  if (!before.length) {
    console.error(`\n  ERROR: No account found with id = ${ACCOUNT_ID}\n`);
    process.exit(1);
  }

  const b = before[0];
  console.log('\n══════════════════════════════════════════');
  console.log('  BEFORE');
  console.log('══════════════════════════════════════════');
  console.log(`  account_id:             ${ACCOUNT_ID}`);
  console.log(`  plan:                   ${b.plan}`);
  console.log(`  plan_status:            ${b.plan_status}`);
  console.log(`  stripe_subscription_id: ${b.stripe_subscription_id ?? 'NULL'}`);

  // Reset
  await pool.query(
    `UPDATE accounts
     SET plan                   = 'starter',
         plan_status            = 'active',
         stripe_subscription_id = NULL
     WHERE id = $1`,
    [ACCOUNT_ID]
  );

  // After
  const { rows: after } = await pool.query(
    `SELECT plan, plan_status, stripe_subscription_id FROM accounts WHERE id = $1`,
    [ACCOUNT_ID]
  );
  const a = after[0];

  console.log('\n══════════════════════════════════════════');
  console.log('  AFTER');
  console.log('══════════════════════════════════════════');
  console.log(`  account_id:             ${ACCOUNT_ID}`);
  console.log(`  plan:                   ${a.plan}`);
  console.log(`  plan_status:            ${a.plan_status}`);
  console.log(`  stripe_subscription_id: ${a.stripe_subscription_id ?? 'NULL'}`);
  console.log('\n  Done. Log out and back in to get a fresh JWT.\n');
}

main().catch(err => {
  console.error('\n  Error:', err.message, '\n');
  process.exit(1);
}).finally(() => pool.end());
