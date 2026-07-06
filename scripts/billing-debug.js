/**
 * billing-debug.js
 * Read-only: finds every account accessible to kevincaines925@gmail.com
 * and shows each account's plan. No data is modified.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const email = 'kevincaines925@gmail.com';

  // 1. Find the user row
  const { rows: userRows } = await pool.query(
    `SELECT id, name, email, account_id, role FROM users WHERE lower(email) = lower($1)`,
    [email]
  );
  if (!userRows.length) { console.log('No user found.'); return; }
  const user = userRows[0];

  console.log('\n══════════════════════════════════════════');
  console.log('  USER');
  console.log('══════════════════════════════════════════');
  console.log(`  user_id:            ${user.id}`);
  console.log(`  email:              ${user.email}`);
  console.log(`  name:               ${user.name}`);
  console.log(`  primary account_id: ${user.account_id}`);
  console.log(`  primary role:       ${user.role}`);

  // 2. Primary account plan
  const { rows: primaryAcct } = await pool.query(
    `SELECT id, name, plan, plan_status, stripe_subscription_id FROM accounts WHERE id = $1`,
    [user.account_id]
  );

  console.log('\n══════════════════════════════════════════');
  console.log('  PRIMARY ACCOUNT (from users.account_id)');
  console.log('══════════════════════════════════════════');
  if (primaryAcct[0]) {
    const a = primaryAcct[0];
    console.log(`  account_id:             ${a.id}`);
    console.log(`  account_name:           ${a.name}`);
    console.log(`  plan:                   ${a.plan}`);
    console.log(`  plan_status:            ${a.plan_status}`);
    console.log(`  stripe_subscription_id: ${a.stripe_subscription_id ?? 'NULL'}`);
  }

  // 3. All accounts via account_memberships
  const { rows: memberships } = await pool.query(
    `SELECT am.account_id, am.role, a.name, a.plan, a.plan_status, a.stripe_subscription_id
     FROM account_memberships am
     JOIN accounts a ON a.id = am.account_id
     WHERE am.user_id = $1`,
    [user.id]
  );

  console.log('\n══════════════════════════════════════════');
  console.log('  ADDITIONAL ACCOUNTS (account_memberships)');
  console.log('══════════════════════════════════════════');
  if (!memberships.length) {
    console.log('  None — no account_memberships rows for this user.');
  } else {
    memberships.forEach(m => {
      console.log(`\n  account_id:             ${m.account_id}`);
      console.log(`  account_name:           ${m.name}`);
      console.log(`  role (in this account): ${m.role}`);
      console.log(`  plan:                   ${m.plan}`);
      console.log(`  plan_status:            ${m.plan_status}`);
      console.log(`  stripe_subscription_id: ${m.stripe_subscription_id ?? 'NULL'}`);
    });
  }

  // 4. All accounts via auth/switch query (mirrors auth.js:504-510 exactly)
  const { rows: switchable } = await pool.query(
    `SELECT a.id, a.name, a.plan, a.plan_status,
            CASE WHEN u.account_id = a.id THEN u.role ELSE am.role END AS role
     FROM accounts a
     JOIN users u ON u.id = $1
     LEFT JOIN account_memberships am ON am.account_id = a.id AND am.user_id = $1
     WHERE u.account_id = a.id OR am.user_id = $1`,
    [user.id]
  );

  console.log('\n══════════════════════════════════════════');
  console.log('  ALL SWITCHABLE ACCOUNTS (/auth/switch view)');
  console.log('══════════════════════════════════════════');
  switchable.forEach(a => {
    const isCurrent = a.id === user.account_id;
    console.log(`\n  account_id:   ${a.id}${isCurrent ? ' ← PRIMARY' : ''}`);
    console.log(`  account_name: ${a.name}`);
    console.log(`  plan:         ${a.plan}`);
    console.log(`  plan_status:  ${a.plan_status}`);
    console.log(`  role:         ${a.role}`);
  });

  // 5. Which account would show downgrade buttons (plan != starter)?
  const paidAccounts = switchable.filter(a => a.plan !== 'starter');
  console.log('\n══════════════════════════════════════════');
  console.log('  DIAGNOSIS');
  console.log('══════════════════════════════════════════');
  if (paidAccounts.length === 0) {
    console.log('\n  All accessible accounts are on starter.');
    console.log('  If UI shows downgrade-only, the issue is NOT the database.');
    console.log('  Likely cause: stale JWT token in browser, or frontend auth context caching.');
    console.log('\n  Fix: log out and log back in to get a fresh JWT.');
  } else {
    console.log(`\n  ⚠  Found ${paidAccounts.length} non-starter account(s):`);
    paidAccounts.forEach(a => {
      console.log(`\n  account_id:   ${a.id}`);
      console.log(`  account_name: ${a.name}`);
      console.log(`  plan:         ${a.plan}`);
      console.log(`  plan_status:  ${a.plan_status}`);
      console.log('\n  This is why the Billing page shows downgrade-only buttons.');
      console.log('  The entity switcher has set the active JWT to this account.');
    });
  }
}

main().catch(err => {
  console.error('\nError:', err.message, '\n');
  process.exit(1);
}).finally(() => pool.end());
