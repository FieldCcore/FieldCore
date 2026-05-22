require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const acct = '662d6a2e-8afd-4d0a-be97-abfca831ca99';

  const jobs = await pool.query(
    `SELECT id, service_type, status, amount, scheduled_at FROM jobs
     WHERE account_id = $1 ORDER BY scheduled_at DESC LIMIT 5`,
    [acct]
  );
  console.log('Jobs:', JSON.stringify(jobs.rows, null, 2));

  const users = await pool.query(
    `SELECT id, name, role FROM users WHERE account_id = $1`,
    [acct]
  );
  console.log('Users:', JSON.stringify(users.rows, null, 2));

  const deps = await pool.query(
    `SELECT count(*) FROM deposits WHERE account_id = $1`,
    [acct]
  );
  console.log('Deposits count:', deps.rows[0].count);

  const inv = await pool.query(
    `SELECT count(*), sum(amount) FROM invoices WHERE account_id = $1`,
    [acct]
  );
  console.log('Invoices:', JSON.stringify(inv.rows[0], null, 2));

  await pool.end();
}

run().catch(e => { console.error(e.message); pool.end(); });
