const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("UPDATE accounts SET onboarded = true WHERE id = '04d93d26-a3c2-44e6-bd9e-281b3653a806'")
  .then(r => { console.log('Done. Rows updated:', r.rowCount); })
  .catch(e => console.error(e.message))
  .finally(() => pool.end());
