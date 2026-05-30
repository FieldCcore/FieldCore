const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("UPDATE accounts SET plan = 'starter', plan_status = 'active', stripe_subscription_id = NULL WHERE id = (SELECT account_id FROM users WHERE lower(email) = 'info@getfieldcore.com' LIMIT 1) RETURNING id, plan, plan_status")
  .then(r => { console.log('Reset:', JSON.stringify(r.rows[0])); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); });
