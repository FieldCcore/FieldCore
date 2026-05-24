require('dotenv').config();
const fs      = require('fs');
const path    = require('path');
const bcrypt  = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function init() {
  console.log('Initializing FieldCore database...');

  const schema = fs.readFileSync(path.join(__dirname, '../src/db/schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Schema applied.');

  const seedEmail    = process.env.SEED_EMAIL    || 'admin@getfieldcore.com';
  const seedPassword = process.env.SEED_PASSWORD || 'fieldcore2024';

  // Get or create account
  let { rows: [account] } = await pool.query('SELECT id FROM accounts LIMIT 1');
  if (!account) {
    const r = await pool.query(
      `INSERT INTO accounts (name, plan) VALUES ($1, $2) RETURNING id`,
      ['FieldCore', 'pro']
    );
    account = r.rows[0];
    await pool.query(
      `INSERT INTO booking_settings (account_id, business_name) VALUES ($1, $2)`,
      [account.id, 'FieldCore']
    );
    console.log(`Account created: ${account.id}`);
  } else {
    console.log(`Using existing account: ${account.id}`);
  }

  // Upsert admin user — always ensures the admin exists with correct password
  const hash = await bcrypt.hash(seedPassword, 10);
  await pool.query(
    `INSERT INTO users (account_id, role, name, email, password_hash)
     VALUES ($1, 'owner', 'Admin', $2, $3)
     ON CONFLICT (account_id, email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [account.id, seedEmail, hash]
  );

  console.log(`Admin ready — login: ${seedEmail} / ${seedPassword}`);

  await pool.end();
  console.log('Done.');
}

init().catch(err => {
  console.error('Init failed:', err.message);
  process.exit(1);
});
