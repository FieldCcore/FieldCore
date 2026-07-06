/**
 * create-stripe-test-account.js
 * Creates a separate Solo test account for Stripe checkout testing.
 *
 * - Account: "FieldCore Stripe Test"  (plan = solo)
 * - User:    kevincaines925+test@gmail.com  (owner)
 * - Your main account (kevincaines925@gmail.com) is NOT touched.
 * - Gmail delivers +test addresses to your normal inbox.
 *
 * Run via Railway CLI:
 *   TEST_USER_PASSWORD='YourPass1!' railway run node scripts/create-stripe-test-account.js
 *
 * Or with an explicit connection string:
 *   DATABASE_URL="postgresql://..." TEST_USER_PASSWORD='YourPass1!' node scripts/create-stripe-test-account.js
 */
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');

const dbUrl   = process.env.DATABASE_URL;
const rawPass = process.env.TEST_USER_PASSWORD;

if (!dbUrl) {
  console.error('\n  ERROR: DATABASE_URL is not set.');
  console.error('  Run via Railway CLI:  TEST_USER_PASSWORD=\'...\' railway run node scripts/create-stripe-test-account.js\n');
  process.exit(1);
}
if (!rawPass) {
  console.error('\n  ERROR: TEST_USER_PASSWORD is not set.');
  console.error('  Example:  TEST_USER_PASSWORD=\'YourPass1!\' railway run node scripts/create-stripe-test-account.js\n');
  process.exit(1);
}

const TEST_ACCOUNT_NAME = 'FieldCore Stripe Test';
const TEST_USER_EMAIL   = 'kevincaines925+test@gmail.com';
const TEST_USER_NAME    = 'Kevin (Test)';
const TARGET_PLAN       = 'solo';
const TARGET_STATUS     = 'active';

const pool = new Pool({ connectionString: dbUrl });

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Find or create the test account
    let testAccountId;
    const { rows: existingAcct } = await client.query(
      `SELECT id FROM accounts WHERE lower(name) = lower($1)`,
      [TEST_ACCOUNT_NAME]
    );

    if (existingAcct.length) {
      testAccountId = existingAcct[0].id;
      console.log(`\n  Test account exists: ${testAccountId}`);
    } else {
      const { rows: newAcct } = await client.query(
        `INSERT INTO accounts (name, plan, plan_status, stripe_subscription_id, stripe_customer_id)
         VALUES ($1, $2, $3, NULL, NULL)
         RETURNING id`,
        [TEST_ACCOUNT_NAME, TARGET_PLAN, TARGET_STATUS]
      );
      testAccountId = newAcct[0].id;
      console.log(`\n  Test account created: ${testAccountId}`);
    }

    // Ensure plan values are correct (idempotent)
    await client.query(
      `UPDATE accounts
       SET plan = $1, plan_status = $2, stripe_subscription_id = NULL, stripe_customer_id = NULL
       WHERE id = $3`,
      [TARGET_PLAN, TARGET_STATUS, testAccountId]
    );

    // 2. Hash the password
    const passwordHash = await bcrypt.hash(rawPass, 12);

    // 3. Find or create the test user (does NOT touch kevincaines925@gmail.com)
    const { rows: existingUser } = await client.query(
      `SELECT id FROM users WHERE lower(email) = lower($1)`,
      [TEST_USER_EMAIL]
    );

    let userId;
    if (existingUser.length) {
      userId = existingUser[0].id;
      await client.query(
        `UPDATE users
         SET account_id      = $1,
             name            = $2,
             password_hash   = $3,
             role            = 'owner',
             failed_attempts = 0,
             locked_until    = NULL
         WHERE id = $4`,
        [testAccountId, TEST_USER_NAME, passwordHash, userId]
      );
      console.log(`  Test user updated:   ${userId}`);
    } else {
      const { rows: newUser } = await client.query(
        `INSERT INTO users (account_id, role, name, email, password_hash)
         VALUES ($1, 'owner', $2, $3, $4)
         RETURNING id`,
        [testAccountId, TEST_USER_NAME, TEST_USER_EMAIL, passwordHash]
      );
      userId = newUser[0].id;
      console.log(`  Test user created:   ${userId}`);
    }

    await client.query('COMMIT');

    // 4. Print result
    const { rows: after } = await client.query(
      `SELECT u.id, u.email, u.role, a.name AS account_name, a.plan, a.plan_status
       FROM users u JOIN accounts a ON a.id = u.account_id
       WHERE u.id = $1`,
      [userId]
    );
    const r = after[0];

    console.log('\n══════════════════════════════════════════');
    console.log('  TEST ACCOUNT READY');
    console.log('══════════════════════════════════════════');
    console.log(`\n  Login email:  ${r.email}`);
    console.log(`  Password:     ${rawPass}`);
    console.log(`  Account:      ${r.account_name}`);
    console.log(`  Plan:         ${r.plan}  (${r.plan_status})`);
    console.log(`  Role:         ${r.role}`);
    console.log('\n  Your main kevincaines925@gmail.com account was NOT changed.');
    console.log('  Log in at getfieldcore.com with the test email above.\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n  Error — transaction rolled back:', err.message, '\n');
    process.exit(1);
  } finally {
    client.release();
  }
}

main().catch(err => {
  console.error('\n  Fatal:', err.message, '\n');
  process.exit(1);
}).finally(() => pool.end());
