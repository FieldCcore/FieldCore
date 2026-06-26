require('dotenv').config();

const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'];
const missing  = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`[startup] Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const app       = require('./src/app');
const scheduler = require('./src/services/scheduler');
const pool      = require('./src/db/pool');
const { runMigrations } = require('./src/db/migrate');

const PORT = process.env.PORT || 3000;

async function ensureEstimatesTable() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS estimates (
        id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        client_id      UUID NOT NULL REFERENCES clients(id),
        job_id         UUID REFERENCES jobs(id),
        title          TEXT NOT NULL DEFAULT 'Service Estimate',
        line_items     JSONB NOT NULL DEFAULT '[]',
        amount         NUMERIC(10,2) NOT NULL DEFAULT 0,
        tax_amount     NUMERIC(10,2) DEFAULT 0,
        status         TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','sent','signed','declined','expired')),
        notes          TEXT,
        valid_until    DATE,
        signing_token  TEXT UNIQUE,
        signed_at      TIMESTAMPTZ,
        signature_data TEXT,
        sent_at        TIMESTAMPTZ,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_estimates_account ON estimates(account_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_estimates_client  ON estimates(client_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_estimates_token   ON estimates(signing_token)`);
    console.log('[DB] estimates table ready');
  } catch (err) {
    console.error('[DB] ensureEstimatesTable failed:', err.message);
  } finally {
    client.release();
  }
}

runMigrations().then(() => ensureEstimatesTable()).then(() => {
  const server = app.listen(PORT, () => {
    console.log(`FieldCore API running on port ${PORT}`);
    scheduler.startReminderJob();
  });

  function shutdown(signal) {
    console.log(`[${signal}] Graceful shutdown…`);
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('Shutdown timed out — forcing exit.');
      process.exit(1);
    }, 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
});
