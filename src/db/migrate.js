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

  // Fleet vehicles
  `CREATE TABLE IF NOT EXISTS fleet_vehicles (
     id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     tech_id    UUID REFERENCES users(id),
     make       TEXT,
     model      TEXT,
     year       INTEGER,
     plate      TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

  // Business entity detail columns
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS legal_name            TEXT`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS dba                   TEXT`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS business_type         TEXT`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ein                   TEXT`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS address               TEXT`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS city                  TEXT`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS state                 TEXT`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS zip                   TEXT`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone                 TEXT`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS entity_email          TEXT`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_active             BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS stripe_connect_status TEXT NOT NULL DEFAULT 'not_connected'`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS plan_status           TEXT NOT NULL DEFAULT 'active'`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS updated_at            TIMESTAMPTZ`,

  // Staff role support in users and memberships
  `ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`,
  `ALTER TABLE users ADD CONSTRAINT users_role_check
     CHECK (role IN ('owner', 'manager', 'tech', 'staff'))`,
  `ALTER TABLE account_memberships DROP CONSTRAINT IF EXISTS account_memberships_role_check`,
  `ALTER TABLE account_memberships ADD CONSTRAINT account_memberships_role_check
     CHECK (role IN ('owner', 'manager', 'tech', 'staff'))`,

  // Address lat/lng + city/state/zip on clients
  `ALTER TABLE clients ADD COLUMN IF NOT EXISTS city  TEXT`,
  `ALTER TABLE clients ADD COLUMN IF NOT EXISTS state TEXT`,
  `ALTER TABLE clients ADD COLUMN IF NOT EXISTS zip   TEXT`,
  `ALTER TABLE clients ADD COLUMN IF NOT EXISTS lat   NUMERIC(10,6)`,
  `ALTER TABLE clients ADD COLUMN IF NOT EXISTS lng   NUMERIC(10,6)`,

  // Lat/lng on accounts (for BusinessSettings)
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS lat NUMERIC(10,6)`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS lng NUMERIC(10,6)`,

  // Phone numbers table
  `CREATE TABLE IF NOT EXISTS phone_numbers (
     id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id           UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     telnyx_number_id     TEXT,
     number               TEXT NOT NULL,
     label                TEXT,
     forward_to           TEXT,
     is_active            BOOLEAN NOT NULL DEFAULT TRUE,
     business_hours_only  BOOLEAN NOT NULL DEFAULT FALSE,
     after_hours_message  TEXT,
     created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_phone_numbers_account ON phone_numbers(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_phone_numbers_number  ON phone_numbers(number)`,

  // Call logs table
  `CREATE TABLE IF NOT EXISTS call_logs (
     id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     phone_number_id  UUID REFERENCES phone_numbers(id),
     telnyx_call_id   TEXT,
     direction        TEXT NOT NULL DEFAULT 'inbound',
     from_number      TEXT,
     to_number        TEXT,
     client_id        UUID REFERENCES clients(id),
     client_name      TEXT,
     status           TEXT NOT NULL DEFAULT 'completed',
     duration_seconds INT  DEFAULT 0,
     started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     ended_at         TIMESTAMPTZ,
     created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_call_logs_account ON call_logs(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_call_logs_started ON call_logs(started_at DESC)`,

  // Voicemails table
  `CREATE TABLE IF NOT EXISTS voicemails (
     id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id           UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     call_log_id          UUID REFERENCES call_logs(id),
     phone_number_id      UUID REFERENCES phone_numbers(id),
     telnyx_recording_id  TEXT,
     recording_url        TEXT,
     transcription        TEXT,
     duration_seconds     INT DEFAULT 0,
     from_number          TEXT,
     client_id            UUID REFERENCES clients(id),
     client_name          TEXT,
     is_read              BOOLEAN NOT NULL DEFAULT FALSE,
     created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_voicemails_account ON voicemails(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_voicemails_read    ON voicemails(account_id, is_read)`,

  // Auth security: brute-force tracking columns on users
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until    TIMESTAMPTZ`,

  // Auth security: login attempt log
  `CREATE TABLE IF NOT EXISTS login_attempts (
     id         BIGSERIAL PRIMARY KEY,
     email      TEXT NOT NULL,
     ip_address TEXT NOT NULL,
     success    BOOLEAN NOT NULL DEFAULT FALSE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_login_attempts_ip      ON login_attempts(ip_address, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_login_attempts_email   ON login_attempts(email, created_at)`,

  // Auth security: refresh token sessions
  `CREATE TABLE IF NOT EXISTS user_sessions (
     id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     account_id         UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     refresh_token_hash TEXT NOT NULL UNIQUE,
     device_info        TEXT,
     ip_address         TEXT,
     user_agent         TEXT,
     last_active_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     expires_at         TIMESTAMPTZ NOT NULL,
     revoked_at         TIMESTAMPTZ,
     created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_user_sessions_user    ON user_sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_sessions_hash    ON user_sessions(refresh_token_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at)`,

  // Audit log
  `CREATE TABLE IF NOT EXISTS audit_logs (
     id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
     user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
     action     TEXT NOT NULL,
     entity     TEXT,
     entity_id  UUID,
     details    JSONB,
     ip_address TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_account ON audit_logs(account_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_user    ON audit_logs(user_id, created_at DESC)`,

  // Reviews: post-job review system
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS review_token        TEXT UNIQUE`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS review_request_sent BOOLEAN NOT NULL DEFAULT FALSE`,
  `CREATE TABLE IF NOT EXISTS reviews (
     id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     job_id     UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
     client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
     rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
     body       TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_account ON reviews(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_client  ON reviews(client_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_job ON reviews(job_id)`,

  // Job service address columns
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS service_address TEXT`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS service_city    TEXT`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS service_state   TEXT`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS service_zip     TEXT`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS service_lat     NUMERIC(9,6)`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS service_lng     NUMERIC(9,6)`,

  // Mobile app columns
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token    TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_available  BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE jobs  ADD COLUMN IF NOT EXISTS tip_amount    NUMERIC(10,2)`,
  `ALTER TABLE jobs  ADD COLUMN IF NOT EXISTS signature_svg TEXT`,
  `ALTER TABLE jobs  ADD COLUMN IF NOT EXISTS signature_at  TIMESTAMPTZ`,

  // Sendblue messaging provider columns on messages
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS provider     TEXT DEFAULT 'twilio'`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS provider_id  TEXT`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at      TIMESTAMPTZ`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS phone_number TEXT`,

  // Notifications table
  `CREATE TABLE IF NOT EXISTS notifications (
     id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     type       TEXT NOT NULL,
     title      TEXT NOT NULL,
     body       TEXT,
     link       TEXT,
     read       BOOLEAN NOT NULL DEFAULT FALSE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_account ON notifications(account_id)`,

  // Account columns
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS onboarded              BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT`,

  // Invoice columns
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS line_items   JSONB NOT NULL DEFAULT '[]'`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_link TEXT`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at      TIMESTAMPTZ`,

  // Job photos
  `ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS filename TEXT`,

  // Business profile table + EIN column
  `CREATE TABLE IF NOT EXISTS business_profiles (
     id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE UNIQUE,
     business_name TEXT,
     phone         TEXT,
     address       TEXT,
     city          TEXT,
     state         TEXT,
     zip           TEXT,
     website       TEXT,
     description   TEXT,
     timezone      TEXT NOT NULL DEFAULT 'America/New_York',
     vertical      TEXT,
     logo_url      TEXT,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS ein TEXT`,

  // Business hours
  `CREATE TABLE IF NOT EXISTS business_hours (
     id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
     open_time   TIME,
     close_time  TIME,
     is_closed   BOOLEAN NOT NULL DEFAULT FALSE,
     UNIQUE (account_id, day_of_week)
   )`,

  // Holiday closures
  `CREATE TABLE IF NOT EXISTS holiday_closures (
     id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     closure_date DATE NOT NULL,
     name         TEXT NOT NULL,
     is_emergency BOOLEAN NOT NULL DEFAULT FALSE,
     created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_closures_account ON holiday_closures(account_id)`,

  // Service duration/price templates
  `CREATE TABLE IF NOT EXISTS service_templates (
     id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     name             TEXT NOT NULL,
     duration_minutes INTEGER NOT NULL DEFAULT 60,
     buffer_minutes   INTEGER NOT NULL DEFAULT 15,
     price            NUMERIC(10,2),
     description      TEXT,
     is_active        BOOLEAN NOT NULL DEFAULT TRUE,
     sort_order       INTEGER NOT NULL DEFAULT 0,
     created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_svc_templates_account ON service_templates(account_id)`,

  // Client portal magic-link tokens
  `CREATE TABLE IF NOT EXISTS client_portal_tokens (
     id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
     account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     token_hash  TEXT NOT NULL UNIQUE,
     expires_at  TIMESTAMPTZ NOT NULL,
     used_at     TIMESTAMPTZ,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_portal_tokens_hash ON client_portal_tokens(token_hash)`,

  // Partner applications
  `CREATE TABLE IF NOT EXISTS partner_applications (
     id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     name       TEXT NOT NULL,
     email      TEXT NOT NULL,
     company    TEXT,
     website    TEXT,
     type       TEXT NOT NULL DEFAULT 'Referral Partner',
     notes      TEXT,
     status     TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','approved','rejected')),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_partner_apps_email ON partner_applications(email)`,

  // Users — contractor / 1099 fields
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_contractor      BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS tax_classification TEXT DEFAULT 'employee'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS contractor_tax_id  TEXT`,

  // Travel fee engine
  `ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS travel_fee           NUMERIC(10,2) DEFAULT 0`,
  `ALTER TABLE jobs             ADD COLUMN IF NOT EXISTS travel_fee           NUMERIC(10,2) DEFAULT 0`,
  `ALTER TABLE jobs             ADD COLUMN IF NOT EXISTS pre_charge_notice_sent BOOLEAN NOT NULL DEFAULT FALSE`,

  // Estimates table (Scale feature)
  `CREATE TABLE IF NOT EXISTS estimates (
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
   )`,
  `CREATE INDEX IF NOT EXISTS idx_estimates_account ON estimates(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_estimates_client  ON estimates(client_id)`,
  `CREATE INDEX IF NOT EXISTS idx_estimates_token   ON estimates(signing_token)`,

  // Booking settings deposit rules
  `ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS deposit_rules JSONB NOT NULL DEFAULT '[]'`,

  // Invoice status constraint — add 'failed' for payment_intent.payment_failed webhook
  `ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check`,
  `ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
     CHECK (status IN ('pending','paid','void','failed'))`,

  // Password reset tokens (missing from original migrate.js — in schema.sql only)
  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
     id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     token_hash TEXT NOT NULL UNIQUE,
     expires_at TIMESTAMPTZ NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_reset_tokens_user    ON password_reset_tokens(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reset_tokens_expires ON password_reset_tokens(expires_at)`,

  // Expired token cleanup — indexes for cron DELETE performance
  `CREATE INDEX IF NOT EXISTS idx_portal_tokens_expires ON client_portal_tokens(expires_at)`,

  // Estimate → job conversion tracking
  `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS converted_job_id UUID REFERENCES jobs(id)`,

  // Tech live GPS locations — upserted by TechApp every ~20 seconds while available
  `CREATE TABLE IF NOT EXISTS tech_locations (
     id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     user_id        UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
     lat            NUMERIC(9,6) NOT NULL,
     lng            NUMERIC(9,6) NOT NULL,
     accuracy       NUMERIC(8,2),
     heading        NUMERIC(5,1),
     speed          NUMERIC(8,2),
     battery_level  INTEGER,
     updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (account_id, user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_tech_locations_account ON tech_locations(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tech_locations_user    ON tech_locations(user_id)`,

  // SMS opt-outs (TCPA/CTIA STOP compliance)
  `CREATE TABLE IF NOT EXISTS sms_opt_outs (
     id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id            UUID REFERENCES accounts(id) ON DELETE CASCADE,
     phone_number          TEXT NOT NULL,
     normalized_phone      TEXT NOT NULL,
     opt_out_keyword       TEXT NOT NULL DEFAULT 'STOP',
     source                TEXT NOT NULL DEFAULT 'inbound_sms',
     opted_out_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (normalized_phone)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_sms_opt_outs_phone ON sms_opt_outs(normalized_phone)`,
];

async function runMigrations() {
  const client = await pool.connect();
  let failed = 0;
  try {
    await client.query('BEGIN');
    for (const sql of MIGRATIONS) {
      try {
        await client.query('SAVEPOINT m');
        await client.query(sql);
        await client.query('RELEASE SAVEPOINT m');
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT m');
        console.error('[DB] Migration step skipped:', err.message.split('\n')[0]);
        failed++;
      }
    }
    await client.query('COMMIT');
    console.log(`[DB] Migrations complete — ${failed} step(s) skipped`);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[DB] Migration fatal error:', err.message);
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };
