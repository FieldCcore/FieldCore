const pool = require('./pool');

const MIGRATIONS = [
  // No-show clock columns on jobs
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS no_show_clock_started_at TIMESTAMPTZ`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deposit_retained NUMERIC(10,2) DEFAULT 0`,

  // Drop+re-add status constraint to include no_show
  `ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check`,
  `ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
     CHECK (status IN ('scheduled','in_progress','complete','cancelled','no_show'))`,

  // No-show settings per account
  `CREATE TABLE IF NOT EXISTS no_show_settings (
     account_id            UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
     grace_period_minutes  INT NOT NULL DEFAULT 15,
     require_arrival_photo BOOLEAN NOT NULL DEFAULT FALSE,
     auto_declare          BOOLEAN NOT NULL DEFAULT TRUE,
     client_sms_template   TEXT,
     tech_sms_template     TEXT,
     updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  // No-show records (permanent audit trail)
  `CREATE TABLE IF NOT EXISTS no_show_records (
     id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id            UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     job_id                UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
     client_id             UUID REFERENCES clients(id),
     tech_id               UUID REFERENCES users(id),
     client_name           TEXT,
     tech_name             TEXT,
     service_type          TEXT,
     scheduled_at          TIMESTAMPTZ,
     clock_started_at      TIMESTAMPTZ,
     declared_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     grace_period_minutes  INT NOT NULL DEFAULT 15,
     deposit_retained      NUMERIC(10,2) DEFAULT 0,
     tech_gps_lat          NUMERIC(10,6),
     tech_gps_lng          NUMERIC(10,6),
     client_notified_at    TIMESTAMPTZ,
     tech_released_at      TIMESTAMPTZ,
     pdf_path              TEXT,
     notes                 TEXT,
     created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_noshow_account  ON no_show_records(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_noshow_job      ON no_show_records(job_id)`,
  `CREATE INDEX IF NOT EXISTS idx_noshow_client   ON no_show_records(client_id)`,
  `CREATE INDEX IF NOT EXISTS idx_noshow_declared ON no_show_records(declared_at)`,

  // Billing events table
  `CREATE TABLE IF NOT EXISTS billing_events (
     id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id             UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     stripe_invoice_id      TEXT,
     stripe_charge_id       TEXT,
     amount                 NUMERIC(10,2) NOT NULL,
     status                 TEXT NOT NULL DEFAULT 'paid',
     description            TEXT,
     payment_method_last4   TEXT,
     payment_method_brand   TEXT,
     invoice_pdf_url        TEXT,
     period_start           TIMESTAMPTZ,
     period_end             TIMESTAMPTZ,
     created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_billing_events_account ON billing_events(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_billing_events_invoice ON billing_events(stripe_invoice_id)`,

  // Cancellation reasons
  `CREATE TABLE IF NOT EXISTS cancel_reasons (
     id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id          UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     reason              TEXT,
     additional_feedback TEXT,
     cancelled_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  // Tax columns
  `ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS tax_rate   NUMERIC(5,4) DEFAULT 0`,
  `ALTER TABLE invoices         ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(10,2) DEFAULT 0`,

  // Account billing/cancellation metadata
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS cancel_reason   TEXT`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS cancelled_at    TIMESTAMPTZ`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS trial_ends_at   TIMESTAMPTZ`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS renewal_7d_sent BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS renewal_3d_sent BOOLEAN DEFAULT FALSE`,
];

async function runMigrations() {
  const client = await pool.connect();
  try {
    for (const sql of MIGRATIONS) {
      await client.query(sql);
    }
    console.log('[DB] Migrations applied successfully');
  } catch (err) {
    console.error('[DB] Migration error:', err.message);
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };
