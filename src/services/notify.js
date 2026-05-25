const pool = require('../db/pool');

async function create(accountId, type, title, body = null, link = null) {
  try {
    await pool.query(
      `INSERT INTO notifications (account_id, type, title, body, link)
       VALUES ($1, $2, $3, $4, $5)`,
      [accountId, type, title, body, link]
    );
  } catch (err) {
    console.error('[notify] Failed to create notification:', err.message);
  }
}

module.exports = { create };
