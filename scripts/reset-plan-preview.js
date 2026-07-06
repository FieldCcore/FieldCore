/**
 * reset-plan-preview.js
 * Read-only: shows current plan state for kevincaines925@gmail.com
 * and prints the exact SQL that would be run on confirmation.
 * Does NOT modify any data.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const email = 'kevincaines925@gmail.com';

  const { rows } = await pool.query(
    `SELECT a.id AS account_id, a.name AS account_name,
            a.plan, a.plan_status, a.stripe_subscription_id,
            u.email, u.name AS user_name, u.role
     FROM users u
     JOIN accounts a ON a.id = u.account_id
     WHERE u.email = $1
     ORDER BY u.role = 'owner' DESC
     LIMIT 5`,
    [email]
  );

  if (!rows.length) {
    console.log(`\nNo user found for ${email}\n`);
    process.exit(0);
  }

  console.log('\n══════════════════════════════════════════');
  console.log('  CURRENT STATE');
  console.log('══════════════════════════════════════════');
  rows.forEach(r => {
    console.log(`\n  User:                 ${r.user_name} (${r.email})`);
    console.log(`  Role:                 ${r.role}`);
    console.log(`  Account ID:           ${r.account_id}`);
    console.log(`  Account Name:         ${r.account_name}`);
    console.log(`  plan:                 ${r.plan}`);
    console.log(`  plan_status:          ${r.plan_status}`);
    console.log(`  stripe_subscription_id: ${r.stripe_subscription_id ?? 'NULL'}`);
  });

  const target = rows.find(r => r.role === 'owner') || rows[0];

  console.log('\n══════════════════════════════════════════');
  console.log('  SQL THAT WILL RUN ON CONFIRMATION');
  console.log('══════════════════════════════════════════');
  console.log(`
  UPDATE accounts
  SET plan                  = 'starter',
      plan_status           = 'active',
      stripe_subscription_id = NULL
  WHERE id = '${target.account_id}';
`);
  console.log('  Affects:  1 row (account_id above)');
  console.log('  Scope:    Your account only — no other accounts touched');
  console.log('  Stripe:   No Stripe API calls — DB only');
  console.log('  Reversal: Re-run Stripe Checkout → webhook restores plan');
  console.log('\n  Run reset-plan-apply.js to execute.\n');
}

main().catch(err => {
  console.error('\nConnection error:', err.message, '\n');
  process.exit(1);
}).finally(() => pool.end());
