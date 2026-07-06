/**
 * debug-test-login.js
 * Read-only: verifies the Railway production state for the test login user.
 * Checks user existence, lockout state, account plan, and password comparison.
 *
 * Run via Railway CLI:
 *   TEST_USER_PASSWORD='...' railway run node scripts/debug-test-login.js
 *
 * Or with an explicit connection string:
 *   DATABASE_URL="postgresql://..." TEST_USER_PASSWORD='...' node scripts/debug-test-login.js
 */
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');

const dbUrl   = process.env.DATABASE_URL;
const rawPass = process.env.TEST_USER_PASSWORD;

if (!dbUrl) {
  console.error('\n  ERROR: DATABASE_URL is not set.');
  console.error('  Run via Railway CLI:  TEST_USER_PASSWORD=\'...\' railway run node scripts/debug-test-login.js\n');
  process.exit(1);
}
if (!rawPass) {
  console.error('\n  ERROR: TEST_USER_PASSWORD is not set.');
  console.error('  Example:  TEST_USER_PASSWORD=\'YourPass\' railway run node scripts/debug-test-login.js\n');
  process.exit(1);
}

const TARGET_EMAIL = 'kevincaines925@gmail.com';
const pool = new Pool({ connectionString: dbUrl });

async function main() {
  // ── 1. Find all user rows for this email ─────────────────────────────────
  const { rows: users } = await pool.query(
    `SELECT u.id, u.email, u.name, u.role, u.account_id,
            u.password_hash, u.failed_attempts, u.locked_until,
            a.name AS account_name, a.plan, a.plan_status, a.is_active AS account_active
     FROM users u
     JOIN accounts a ON a.id = u.account_id
     WHERE lower(u.email) = lower($1)`,
    [TARGET_EMAIL]
  );

  console.log('\n══════════════════════════════════════════');
  console.log('  USER ROWS  (' + users.length + ' found for ' + TARGET_EMAIL + ')');
  console.log('══════════════════════════════════════════');

  if (!users.length) {
    console.log('\n  FAIL — No user row found in this database.');
    console.log('  The script likely ran against a different database than Railway production.');
    console.log('  Run with:  TEST_USER_PASSWORD=\'...\' railway run node scripts/debug-test-login.js\n');
    return;
  }

  const now = new Date();
  let anyPassOk = false;

  for (const u of users) {
    const isLocked   = u.locked_until && new Date(u.locked_until) > now;
    const hasHash    = !!u.password_hash;
    const hashPrefix = hasHash ? u.password_hash.slice(0, 7) + '…' : 'NULL';

    let passOk = false;
    if (hasHash) {
      passOk = await bcrypt.compare(rawPass, u.password_hash);
      if (passOk) anyPassOk = true;
    }

    console.log(`\n  ── User row ─────────────────────────────`);
    console.log(`  user_id:               ${u.id}`);
    console.log(`  email (stored):        ${u.email}`);
    console.log(`  name:                  ${u.name}`);
    console.log(`  role:                  ${u.role}`);
    console.log(`  account_id:            ${u.account_id}`);
    console.log(`  account_name:          ${u.account_name}`);
    console.log(`  account_plan:          ${u.plan}`);
    console.log(`  account_plan_status:   ${u.plan_status}`);
    console.log(`  account_active:        ${u.account_active}`);
    console.log(`  password_hash exists:  ${hasHash ? 'YES (' + hashPrefix + ')' : 'NO'}`);
    console.log(`  password comparison:   ${passOk ? 'PASS ✓' : 'FAIL ✗'}`);
    console.log(`  failed_attempts:       ${u.failed_attempts}`);
    console.log(`  locked_until:          ${u.locked_until ?? 'NULL'}`);
    console.log(`  account locked:        ${isLocked ? 'YES — LOGIN BLOCKED until ' + u.locked_until : 'NO'}`);
  }

  // ── 2. Account memberships ────────────────────────────────────────────────
  const primaryUser = users[0];
  const { rows: memberships } = await pool.query(
    `SELECT am.account_id, am.role, a.name AS account_name, a.plan
     FROM account_memberships am
     JOIN accounts a ON a.id = am.account_id
     WHERE am.user_id = $1`,
    [primaryUser.id]
  );

  console.log('\n══════════════════════════════════════════');
  console.log('  ACCOUNT MEMBERSHIPS  (' + memberships.length + ' found)');
  console.log('══════════════════════════════════════════');
  if (!memberships.length) {
    console.log('\n  None — user can only access their primary account.');
  } else {
    memberships.forEach(m => {
      console.log(`\n  account_id:   ${m.account_id}`);
      console.log(`  account_name: ${m.account_name}`);
      console.log(`  plan:         ${m.plan}`);
      console.log(`  role:         ${m.role}`);
    });
  }

  // ── 3. What login would do (mirrors auth.js LIMIT 1 behavior) ────────────
  const { rows: loginRow } = await pool.query(
    `SELECT u.id, u.email, u.role, u.account_id, u.password_hash,
            u.locked_until, u.failed_attempts,
            a.name AS account_name, a.plan, a.plan_status
     FROM users u
     JOIN accounts a ON a.id = u.account_id
     WHERE lower(u.email) = lower($1)
     LIMIT 1`,
    [TARGET_EMAIL]
  );
  const loginUser = loginRow[0];

  console.log('\n══════════════════════════════════════════');
  console.log('  LOGIN SIMULATION  (mirrors auth.js LIMIT 1 query)');
  console.log('══════════════════════════════════════════');

  if (!loginUser) {
    console.log('\n  FAIL — login query returned no row.');
  } else {
    const isLocked = loginUser.locked_until && new Date(loginUser.locked_until) > now;
    const passOk   = loginUser.password_hash
      ? await bcrypt.compare(rawPass, loginUser.password_hash)
      : false;

    console.log(`\n  Login query would select:`);
    console.log(`    user_id:      ${loginUser.id}`);
    console.log(`    account_id:   ${loginUser.account_id}`);
    console.log(`    account_name: ${loginUser.account_name}`);
    console.log(`    plan:         ${loginUser.plan}`);
    console.log(`    locked:       ${isLocked ? 'YES ← BLOCKED' : 'NO'}`);
    console.log(`    password:     ${passOk ? 'PASS ✓' : 'FAIL ✗'}`);

    if (isLocked) {
      console.log('\n  ROOT CAUSE: Account is locked due to too many failed attempts.');
      console.log('  FIX: Run scripts/fix-test-login-password.js to clear lockout.');
    } else if (!passOk) {
      console.log('\n  ROOT CAUSE: Password hash does not match TEST_USER_PASSWORD.');
      console.log('  FIX: Run scripts/fix-test-login-password.js to rehash.');
    } else if (users.length > 1) {
      console.log('\n  WARNING: Multiple user rows exist for this email.');
      console.log('  The login query uses LIMIT 1 with no ORDER BY — result is non-deterministic.');
      console.log('  FIX: Run scripts/fix-test-login-password.js to ensure only one valid row.');
    } else {
      console.log('\n  Login should succeed. If it still fails at www.getfieldcore.com:');
      console.log('    1. Clear browser localStorage and try again.');
      console.log('    2. Verify Railway is using this same database.');
      console.log('    3. Confirm VITE_API_URL in Vercel points to the Railway backend.');
    }
  }

  console.log('');
}

main().catch(err => {
  console.error('\n  Error:', err.message, '\n');
  process.exit(1);
}).finally(() => pool.end());
