const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(`SELECT u.id, u.email, u.role, u.account_id, a.name AS account_name, a.plan
            FROM users u JOIN accounts a ON a.id = u.account_id
            ORDER BY u.created_at`)
  .then(r => { console.log(JSON.stringify(r.rows, null, 2)); })
  .catch(e => console.error(e.message))
  .finally(() => pool.end());
