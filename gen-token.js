require('dotenv').config();
const jwt  = require('jsonwebtoken');
const pool = require('./src/db/pool');
pool.query("SELECT u.id, u.account_id, u.role FROM users u WHERE u.role = 'owner' LIMIT 1")
  .then(r => {
    const u = r.rows[0];
    if (!u) { console.log('NO_USER'); pool.end(); return; }
    const tok = jwt.sign(
      { userId: u.id, accountId: u.account_id, role: u.role },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );
    console.log(tok);
    pool.end();
  }).catch(e => { console.error(e.message); pool.end(); });
