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

  const { rows: existing } = await pool.query('SELECT id FROM accounts LIMIT 1');
  if (existing.length > 0) {
    console.log('Account already exists — skipping seed.');
    await pool.end();
    return;
  }

  console.log('Seeding default account...');
  const { rows: [account] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, $2) RETURNING id`,
    ['FieldCore', 'pro']
  );

  const hash = await bcrypt.hash(process.env.SEED_PASSWORD || 'fieldcore2024', 10);
  await pool.query(
    `INSERT INTO users (account_id, role, name, email, password_hash)
     VALUES ($1, 'owner', 'Admin', $2, $3)`,
    [account.id, process.env.SEED_EMAIL || 'admin@getfieldcore.com', hash]
  );

  await pool.query(
    `INSERT INTO booking_settings (account_id, business_name) VALUES ($1, $2)`,
    [account.id, 'FieldCore']
  );

  console.log(`Account created: ${account.id}`);
  console.log(`Login: ${process.env.SEED_EMAIL || 'admin@getfieldcore.com'} / ${process.env.SEED_PASSWORD || 'fieldcore2024'}`);

  await pool.end();
  console.log('Done.');
}

init().catch(err => {
  console.error('Init failed:', err.message);
  process.exit(1);
});
