/**
 * fix-test-login-password.js
 * Resets the password hash and clears any brute-force lockout for
 * kevincaines925@gmail.com. Touches only that one user row.
 * Prints before/after password comparison verification.
 *
 * Run via Railway CLI:
 *   TEST_USER_PASSWORD='...' railway run node scripts/fix-test-login-password.js
 *
 * Or with an explicit connection string:
 *   DATABASE_URL="postgresql://..." TEST_USER_PASSWORD='...' node scripts/fix-test-login-password.js
 */
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');

const dbUrl   = process.env.DATABASE_URL;
const rawPass = process.env.TEST_USER_PASSWORD;

if (!dbUrl) {
  console.error('\n  ERROR: DATABASE_URL is not set.');
  console.error('  Run via Railway CLI:  TEST_USER_PASSWORD=\'...\' railway run node scripts/fix-test-login-password.js\n');
  process.exit(1);
}
if (!rawPass) {
  console.error('\n  ERROR: TEST_USER_PASSWORD is not set.');
  console.error('  Example:  TEST_USER_PASSWORD=\'YourPass\' railway run node scripts/fix-test-login-password.js\n');
  process.exit(1);
}

const TARGET_EMAIL = 'kevincaines925@gmail.com';
const pool = new Pool({ connectionString: dbUrl });

async function main() {
  // ── 1. Find the user row login would pick (same LIMIT 1 query as auth.js) ─
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.account_id, u.password_hash,
            u.failed_attempts, u.locked_until,
            a.name AS account_name, a.plan
     FROM users u
     JOIN accounts a ON a.id = u.account_id
     WHERE lower(u.email) = lower($1)
     LIMIT 1`,
    [TARGET_EMAIL]
  );

  if (!rows.length) {
    console.error(`\n  ERROR: No user found for ${TARGET_EMAIL} in this database.`);
    console.error('  Confirm this is running against Railway production (railway run ...).\n');
    process.exit(1);
  }

  const u = rows[0];
  const now = new Date();

  // ── 2. Before state ───────────────────────────────────────────────────────
  const beforePassOk = u.password_hash
    ? await bcrypt.compare(rawPass, u.password_hash)
    : false;
  const isLocked = u.locked_until && new Date(u.locked_until) > now;

  console.log('\n══════════════════════════════════════════');
  console.log('  BEFORE');
  console.log('══════════════════════════════════════════');
  console.log(`\n  user_id:             ${u.id}`);
  console.log(`  email:               ${u.email}`);
  console.log(`  account_id:          ${u.account_id}`);
  console.log(`  account_name:        ${u.account_name}`);
  console.log(`  plan:                ${u.plan}`);
  console.log(`  password_hash:       ${u.password_hash ? 'EXISTS' : 'NULL'}`);
  console.log(`  password comparison: ${beforePassOk ? 'PASS ✓' : 'FAIL ✗'}`);
  console.log(`  failed_attempts:     ${u.failed_attempts}`);
  console.log(`  locked_until:        ${u.locked_until ?? 'NULL'}`);
  console.log(`  locked:              ${isLocked ? 'YES ← BLOCKED' : 'NO'}`);

  // ── 3. Hash using same method as auth.js (bcryptjs, 12 rounds) ──────────
  const newHash = await bcrypt.hash(rawPass, 12);

  // ── 4. Update only this user — reset password + clear lockout ────────────
  await pool.query(
    `UPDATE users
     SET password_hash   = $1,
         failed_attempts = 0,
         locked_until    = NULL
     WHERE id = $2`,
    [newHash, u.id]
  );

  // ── 5. After state — verify the hash we just wrote reads back correctly ──
  const { rows: after } = await pool.query(
    `SELECT id, email, password_hash, failed_attempts, locked_until
     FROM users WHERE id = $1`,
    [u.id]
  );
  const a = after[0];
  const afterPassOk = await bcrypt.compare(rawPass, a.password_hash);

  console.log('\n══════════════════════════════════════════');
  console.log('  AFTER');
  console.log('══════════════════════════════════════════');
  console.log(`\n  user_id:             ${a.id}`);
  console.log(`  password_hash:       EXISTS`);
  console.log(`  password comparison: ${afterPassOk ? 'PASS ✓' : 'FAIL ✗'}`);
  console.log(`  failed_attempts:     ${a.failed_attempts}`);
  console.log(`  locked_until:        ${a.locked_until ?? 'NULL'}`);

  console.log('\n══════════════════════════════════════════');
  console.log('  RESULT');
  console.log('══════════════════════════════════════════');
  if (afterPassOk) {
    console.log('\n  Password fix applied successfully.');
    console.log('  Lockout cleared.');
    console.log('  You can now log in at www.getfieldcore.com.\n');
  } else {
    console.log('\n  ERROR: Password comparison still fails after update.');
    console.log('  This should not happen — investigate bcryptjs installation.\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n  Error:', err.message, '\n');
  process.exit(1);
}).finally(() => pool.end());
