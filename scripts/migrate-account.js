require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const OLD_ID = '00000000-0000-0000-0000-000000000001';
const NEW_ID = '662d6a2e-8afd-4d0a-be97-abfca831ca99';

const TABLES = ['clients', 'jobs', 'invoices', 'messages', 'users'];

async function run() {
  // Check counts first
  for (const t of TABLES) {
    try {
      const r = await pool.query(`SELECT count(*) FROM ${t} WHERE account_id = $1`, [OLD_ID]);
      console.log(`${t}: ${r.rows[0].count} rows under old ID`);
    } catch (e) {
      console.log(`${t}: skip (${e.message.split('\n')[0]})`);
    }
  }

  // Check if old account row exists
  const { rows: accts } = await pool.query(`SELECT id FROM accounts WHERE id = $1`, [OLD_ID]);
  if (!accts.length) {
    console.log('\nNo old account row — nothing to migrate.');
    await pool.end();
    return;
  }

  console.log('\nMigrating...');
  for (const t of TABLES) {
    try {
      const r = await pool.query(
        `UPDATE ${t} SET account_id = $1 WHERE account_id = $2`,
        [NEW_ID, OLD_ID]
      );
      console.log(`${t}: updated ${r.rowCount} rows`);
    } catch (e) {
      console.log(`${t}: error — ${e.message.split('\n')[0]}`);
    }
  }

  // Remove old account
  await pool.query(`DELETE FROM accounts WHERE id = $1`, [OLD_ID]);
  console.log('Old account removed.');
  await pool.end();
}

run().catch(e => { console.error(e); pool.end(); });
