const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TEST_ACCOUNT_ID = '04d93d26-a3c2-44e6-bd9e-281b3653a806';
const MAIN_ACCOUNT_ID = '64ca9b20-2458-4764-8691-a91142614ef7';

async function main() {
  const { rows: users } = await pool.query(
    `SELECT id, email FROM users WHERE account_id = $1`,
    [MAIN_ACCOUNT_ID]
  );
  console.log(`Adding test account to ${users.length} user(s):`);
  for (const u of users) {
    await pool.query(
      `INSERT INTO account_memberships (user_id, account_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (user_id, account_id) DO UPDATE SET role = 'owner'`,
      [u.id, TEST_ACCOUNT_ID]
    );
    console.log(`  ${u.email}`);
  }
  console.log(`\nDone. Switch to "FieldCore Stripe Test" via the entity switcher in the sidebar.`);
}

main().catch(e => { console.error(e.message); process.exit(1); }).finally(() => pool.end());
