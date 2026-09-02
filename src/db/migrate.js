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

  // ── MULTI-DAY JOBS ──────────────────────────────────────────────────────────
  // Expand jobs status constraint to include multi-day and project statuses
  `ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check`,
  `ALTER TABLE jobs ADD CONSTRAINT jobs_status_check CHECK (status IN (
     'draft','unscheduled','scheduled','in_progress','paused',
     'awaiting_client','awaiting_parts','partially_completed',
     'ready_for_inspection','complete','cancelled','no_show'
  ))`,

  // New columns on jobs for multi-day project tracking
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_multi_day        BOOLEAN      NOT NULL DEFAULT FALSE`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS title               TEXT`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS scope_of_work       TEXT`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS estimated_start_date DATE`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS estimated_end_date   DATE`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS end_date_unknown     BOOLEAN      NOT NULL DEFAULT FALSE`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS actual_start_date    DATE`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS actual_completion_date DATE`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_manager_id       UUID REFERENCES users(id) ON DELETE SET NULL`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS estimated_labor_hours NUMERIC(6,2)`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS overall_completion_pct INT NOT NULL DEFAULT 0`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS billing_method       TEXT NOT NULL DEFAULT 'fixed'`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS priority             TEXT NOT NULL DEFAULT 'normal'`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ`,

  // Daily work sessions — each row is one scheduled workday on a parent job
  `CREATE TABLE IF NOT EXISTS job_sessions (
     id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     job_id           UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
     account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     session_number   INT  NOT NULL DEFAULT 1,
     title            TEXT,
     description      TEXT,
     scheduled_date   DATE NOT NULL,
     start_time       TIME,
     end_time         TIME,
     status           TEXT NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled','en_route','checked_in','in_progress','paused',
                                          'completed_for_day','rescheduled','cancelled','missed')),
     lead_tech_id     UUID REFERENCES users(id) ON DELETE SET NULL,
     estimated_hours  NUMERIC(6,2),
     actual_hours     NUMERIC(6,2),
     checkin_at       TIMESTAMPTZ,
     checkout_at      TIMESTAMPTZ,
     checkin_lat      NUMERIC(9,6),
     checkin_lng      NUMERIC(9,6),
     completion_pct   INT  NOT NULL DEFAULT 0 CHECK (completion_pct >= 0 AND completion_pct <= 100),
     work_completed   TEXT,
     work_remaining   TEXT,
     blockers         TEXT,
     internal_notes   TEXT,
     client_notes     TEXT,
     created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
     updated_by       UUID REFERENCES users(id) ON DELETE SET NULL,
     created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // Technician assignments per session (many-to-many)
  `CREATE TABLE IF NOT EXISTS job_session_techs (
     id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     session_id  UUID NOT NULL REFERENCES job_sessions(id) ON DELETE CASCADE,
     job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
     account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     tech_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     is_lead     BOOLEAN NOT NULL DEFAULT FALSE,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (session_id, tech_id)
  )`,

  // Assets / service items per job (vehicles, units, rooms, equipment, etc.)
  `CREATE TABLE IF NOT EXISTS job_assets (
     id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     job_id               UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
     account_id           UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     name                 TEXT NOT NULL,
     description          TEXT,
     asset_type           TEXT,
     identifier           TEXT,
     status               TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','in_progress','completed','not_applicable')),
     assigned_session_id  UUID REFERENCES job_sessions(id) ON DELETE SET NULL,
     assigned_tech_id     UUID REFERENCES users(id) ON DELETE SET NULL,
     completion_pct       INT  NOT NULL DEFAULT 0,
     notes                TEXT,
     completed_at         TIMESTAMPTZ,
     created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // Optional session context on job photos (NULL for existing/single-day photos)
  `ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES job_sessions(id) ON DELETE SET NULL`,

  // Indexes for performance
  `CREATE INDEX IF NOT EXISTS idx_job_sessions_job      ON job_sessions(job_id)`,
  `CREATE INDEX IF NOT EXISTS idx_job_sessions_account  ON job_sessions(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_job_sessions_date     ON job_sessions(account_id, scheduled_date)`,
  `CREATE INDEX IF NOT EXISTS idx_job_sessions_status   ON job_sessions(job_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_job_sess_techs_sess   ON job_session_techs(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_job_sess_techs_tech   ON job_session_techs(account_id, tech_id)`,
  `CREATE INDEX IF NOT EXISTS idx_job_assets_job        ON job_assets(job_id)`,
  `CREATE INDEX IF NOT EXISTS idx_job_assets_account    ON job_assets(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_multi_day        ON jobs(account_id) WHERE is_multi_day = TRUE`,

  // ── ENTITLEMENT SYSTEM ──────────────────────────────────────────────────────
  // trial_plan: if set + trial_ends_at > NOW(), account gets capabilities of this plan
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS trial_plan TEXT`,
  // feature_overrides: per-tenant capability overrides (grandfathering, beta, enterprise)
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS feature_overrides JSONB NOT NULL DEFAULT '{}'`,

  // ── REQUESTS / LEADS ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS requests (
     id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     client_id        UUID REFERENCES clients(id) ON DELETE SET NULL,
     client_name      TEXT,
     client_email     TEXT,
     client_phone     TEXT,
     service_type     TEXT,
     requested_date   DATE,
     requested_date_end DATE,
     preferred_time   TEXT,
     location         TEXT,
     notes            TEXT,
     internal_notes   TEXT,
     status           TEXT NOT NULL DEFAULT 'new'
                        CHECK (status IN ('new','contacted','awaiting_review','confirmed','converted','declined','closed')),
     source           TEXT DEFAULT 'direct',
     assigned_to      UUID REFERENCES users(id) ON DELETE SET NULL,
     reviewed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
     follow_up_date   DATE,
     converted_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
     created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
     created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_requests_account    ON requests(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_requests_client     ON requests(client_id)`,
  `CREATE INDEX IF NOT EXISTS idx_requests_status     ON requests(account_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_requests_created    ON requests(account_id, created_at DESC)`,

  // ── DYNAMIC DASHBOARD BANNERS ────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS dashboard_banners (
     id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id            UUID REFERENCES accounts(id) ON DELETE CASCADE,
     banner_type           TEXT NOT NULL DEFAULT 'announcement',
     title                 TEXT NOT NULL,
     message               TEXT NOT NULL,
     severity              TEXT NOT NULL DEFAULT 'info'
                             CHECK (severity IN ('info','success','warning','critical')),
     icon                  TEXT,
     primary_action_label  TEXT,
     primary_action_url    TEXT,
     secondary_action_label TEXT,
     secondary_action_url  TEXT,
     dismissible           BOOLEAN NOT NULL DEFAULT TRUE,
     starts_at             TIMESTAMPTZ,
     ends_at               TIMESTAMPTZ,
     priority              INT NOT NULL DEFAULT 0,
     audience_roles        TEXT[],
     required_plan         TEXT,
     is_active             BOOLEAN NOT NULL DEFAULT TRUE,
     created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_banners_account  ON dashboard_banners(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_banners_active   ON dashboard_banners(is_active, starts_at, ends_at)`,
  `CREATE INDEX IF NOT EXISTS idx_banners_priority ON dashboard_banners(priority DESC)`,

  `CREATE TABLE IF NOT EXISTS dashboard_banner_dismissals (
     id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     banner_id    UUID NOT NULL REFERENCES dashboard_banners(id) ON DELETE CASCADE,
     user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (banner_id, user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_banner_dismissals_user ON dashboard_banner_dismissals(user_id)`,

  // ── GOOGLE BUSINESS PROFILE CONNECTIONS ──────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS google_business_connections (
     id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE UNIQUE,
     google_account_id TEXT,
     location_id       TEXT,
     location_name     TEXT,
     access_token_enc  TEXT,
     refresh_token_enc TEXT,
     token_expires_at  TIMESTAMPTZ,
     last_sync_at      TIMESTAMPTZ,
     last_sync_error   TEXT,
     average_rating    NUMERIC(3,1),
     total_reviews     INT DEFAULT 0,
     status            TEXT NOT NULL DEFAULT 'disconnected'
                         CHECK (status IN ('disconnected','connected','error','expired')),
     created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_gbp_connections_account ON google_business_connections(account_id)`,

  // ── EXTERNAL REVIEWS (synced from Google) ────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS external_reviews (
     id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id         UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     provider           TEXT NOT NULL DEFAULT 'google',
     external_review_id TEXT NOT NULL,
     location_id        TEXT,
     reviewer_name      TEXT,
     rating             INTEGER CHECK (rating BETWEEN 1 AND 5),
     body               TEXT,
     owner_response     TEXT,
     review_at          TIMESTAMPTZ,
     synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     notified_at        TIMESTAMPTZ,
     UNIQUE (account_id, provider, external_review_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_ext_reviews_account  ON external_reviews(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ext_reviews_provider ON external_reviews(account_id, provider)`,
  `CREATE INDEX IF NOT EXISTS idx_ext_reviews_at       ON external_reviews(account_id, review_at DESC)`,

  // ── REVIEW REQUEST SETTINGS ───────────────────────────────────────────────────
  // delay_seconds: 0 = immediate; stored as integer seconds for flexibility
  `CREATE TABLE IF NOT EXISTS review_request_settings (
     account_id              UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
     enabled                 BOOLEAN NOT NULL DEFAULT TRUE,
     delay_seconds           INT NOT NULL DEFAULT 3600,
     require_invoice_paid    BOOLEAN NOT NULL DEFAULT FALSE,
     require_signature       BOOLEAN NOT NULL DEFAULT FALSE,
     exclude_cancelled       BOOLEAN NOT NULL DEFAULT TRUE,
     notify_on_new_review    BOOLEAN NOT NULL DEFAULT TRUE,
     notify_roles            TEXT[] NOT NULL DEFAULT ARRAY['owner','manager'],
     updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  // ── INVOICE PAYMENT TERMS ────────────────────────────────────────────────────
  // payment_terms: 'due_on_receipt' | 'net_15' | 'net_30' | 'net_45' | 'net_60' | 'net_90' | 'custom'
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_terms TEXT DEFAULT 'due_on_receipt'`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date      TIMESTAMPTZ`,

  // ── CLIENT CREDIT TERMS ───────────────────────────────────────────────────────
  `ALTER TABLE clients ADD COLUMN IF NOT EXISTS credit_terms_eligible  BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE clients ADD COLUMN IF NOT EXISTS default_payment_term   TEXT DEFAULT 'due_on_receipt'`,
  `ALTER TABLE clients ADD COLUMN IF NOT EXISTS max_payment_term       TEXT DEFAULT 'net_30'`,

  // ── PROJECTS ─────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS projects (
     id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     name        TEXT NOT NULL,
     description TEXT,
     client_id   UUID REFERENCES clients(id) ON DELETE SET NULL,
     status      TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('draft','active','on_hold','completed','cancelled')),
     start_date  DATE,
     end_date    DATE,
     location    TEXT,
     created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_projects_account ON projects(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_projects_status  ON projects(account_id, status)`,

  // ── PROVIDER-READY REVIEW ARCHITECTURE ───────────────────────────────────────
  // Phase 1: provider registry — one row per supported provider (Google, Yelp, etc.)
  // Only enabled providers are surfaced to tenants. Currently Google only.
  `CREATE TABLE IF NOT EXISTS review_providers (
     id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     provider_key TEXT NOT NULL UNIQUE,
     display_name TEXT NOT NULL,
     is_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
     created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  // Seed Google Business Profile as the only enabled public provider
  `INSERT INTO review_providers (provider_key, display_name, is_enabled)
   VALUES ('google', 'Google Business Profile', TRUE)
   ON CONFLICT (provider_key) DO NOTHING`,

  // Phase 2: OAuth connections — one row per tenant × provider
  // Supersedes google_business_connections (kept for rollback safety, no longer written to)
  `CREATE TABLE IF NOT EXISTS connected_review_accounts (
     id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id            UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     entity_id             UUID REFERENCES accounts(id) ON DELETE CASCADE,
     provider_id           UUID NOT NULL REFERENCES review_providers(id),
     external_account_id   TEXT,
     external_account_name TEXT,
     connection_status     TEXT NOT NULL DEFAULT 'disconnected'
                             CHECK (connection_status IN ('disconnected','connected','expired','error')),
     access_token_enc      TEXT,
     refresh_token_enc     TEXT,
     token_expires_at      TIMESTAMPTZ,
     granted_scopes        TEXT[],
     connected_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
     connected_at          TIMESTAMPTZ,
     last_sync_at          TIMESTAMPTZ,
     last_sync_attempt_at  TIMESTAMPTZ,
     last_sync_status      TEXT,
     last_sync_error       TEXT,
     created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (account_id, provider_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_cra_account  ON connected_review_accounts(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cra_provider ON connected_review_accounts(provider_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cra_status   ON connected_review_accounts(connection_status)`,

  // Phase 3: review locations — multi-location support (GBP can have many locations)
  `CREATE TABLE IF NOT EXISTS review_locations (
     id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     connected_account_id UUID NOT NULL REFERENCES connected_review_accounts(id) ON DELETE CASCADE,
     account_id           UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     entity_id            UUID REFERENCES accounts(id) ON DELETE CASCADE,
     external_location_id TEXT NOT NULL,
     location_name        TEXT,
     display_address      TEXT,
     is_primary           BOOLEAN NOT NULL DEFAULT FALSE,
     is_active            BOOLEAN NOT NULL DEFAULT TRUE,
     last_sync_at         TIMESTAMPTZ,
     created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (connected_account_id, external_location_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_rl_cra      ON review_locations(connected_account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rl_account  ON review_locations(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rl_active   ON review_locations(account_id, is_active)`,

  // Phase 4: enhance external_reviews with FK columns + new fields
  `ALTER TABLE external_reviews ADD COLUMN IF NOT EXISTS connected_account_id UUID REFERENCES connected_review_accounts(id) ON DELETE SET NULL`,
  `ALTER TABLE external_reviews ADD COLUMN IF NOT EXISTS location_row_id      UUID REFERENCES review_locations(id) ON DELETE SET NULL`,
  `ALTER TABLE external_reviews ADD COLUMN IF NOT EXISTS reviewer_photo_url   TEXT`,
  `ALTER TABLE external_reviews ADD COLUMN IF NOT EXISTS owner_response_at    TIMESTAMPTZ`,
  `ALTER TABLE external_reviews ADD COLUMN IF NOT EXISTS review_url           TEXT`,
  `ALTER TABLE external_reviews ADD COLUMN IF NOT EXISTS raw_metadata         JSONB`,
  `ALTER TABLE external_reviews ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()`,

  // Phase 5: sync job history — one row per sync run
  `CREATE TABLE IF NOT EXISTS review_sync_jobs (
     id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     connected_account_id UUID NOT NULL REFERENCES connected_review_accounts(id) ON DELETE CASCADE,
     location_row_id      UUID REFERENCES review_locations(id) ON DELETE SET NULL,
     account_id           UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     trigger              TEXT NOT NULL DEFAULT 'scheduled'
                            CHECK (trigger IN ('scheduled','manual','webhook')),
     status               TEXT NOT NULL DEFAULT 'running'
                            CHECK (status IN ('running','completed','failed')),
     reviews_fetched      INT NOT NULL DEFAULT 0,
     reviews_new          INT NOT NULL DEFAULT 0,
     reviews_updated      INT NOT NULL DEFAULT 0,
     error_message        TEXT,
     started_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     completed_at         TIMESTAMPTZ,
     created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_rsj_cra     ON review_sync_jobs(connected_account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rsj_account ON review_sync_jobs(account_id, started_at DESC)`,

  // Phase 6: review request events — per-job send audit trail (replaces boolean flag only)
  `CREATE TABLE IF NOT EXISTS review_request_events (
     id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     job_id       UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
     client_id    UUID REFERENCES clients(id) ON DELETE SET NULL,
     review_token TEXT NOT NULL,
     channels     TEXT[] NOT NULL DEFAULT ARRAY['email'],
     email_sent   BOOLEAN NOT NULL DEFAULT FALSE,
     sms_sent     BOOLEAN NOT NULL DEFAULT FALSE,
     sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_rre_account ON review_request_events(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rre_job     ON review_request_events(job_id)`,

  // Phase 7: data migration — copy existing google_business_connections → connected_review_accounts
  // ON CONFLICT DO NOTHING so this is safe to re-run; disconnected-only rows are skipped
  `INSERT INTO connected_review_accounts (
     account_id, provider_id, external_account_id, external_account_name,
     connection_status, access_token_enc, refresh_token_enc, token_expires_at,
     granted_scopes, connected_at, last_sync_at, last_sync_error,
     created_at, updated_at
   )
   SELECT
     gc.account_id,
     rp.id                                              AS provider_id,
     gc.google_account_id                               AS external_account_id,
     gc.google_account_id                               AS external_account_name,
     gc.status                                          AS connection_status,
     gc.access_token_enc,
     gc.refresh_token_enc,
     gc.token_expires_at,
     ARRAY['https://www.googleapis.com/auth/business.manage'] AS granted_scopes,
     gc.created_at                                      AS connected_at,
     gc.last_sync_at,
     gc.last_sync_error,
     gc.created_at,
     gc.updated_at
   FROM google_business_connections gc
   JOIN review_providers rp ON rp.provider_key = 'google'
   WHERE gc.status = 'connected' OR gc.last_sync_at IS NOT NULL
   ON CONFLICT (account_id, provider_id) DO NOTHING`,

  // Phase 8: data migration — copy location rows
  `INSERT INTO review_locations (
     connected_account_id, account_id, external_location_id, location_name,
     is_primary, is_active, last_sync_at, created_at, updated_at
   )
   SELECT
     cra.id                   AS connected_account_id,
     gc.account_id,
     gc.location_id           AS external_location_id,
     gc.location_name,
     TRUE                     AS is_primary,
     TRUE                     AS is_active,
     gc.last_sync_at,
     gc.created_at,
     gc.updated_at
   FROM google_business_connections gc
   JOIN connected_review_accounts cra
     ON  cra.account_id = gc.account_id
   JOIN review_providers rp ON rp.id = cra.provider_id AND rp.provider_key = 'google'
   WHERE gc.location_id IS NOT NULL
   ON CONFLICT (connected_account_id, external_location_id) DO NOTHING`,

  // Phase 9: backfill external_reviews.connected_account_id
  `UPDATE external_reviews er
   SET connected_account_id = cra.id
   FROM connected_review_accounts cra
   JOIN review_providers rp ON rp.id = cra.provider_id
   WHERE cra.account_id = er.account_id
     AND rp.provider_key = er.provider
     AND er.connected_account_id IS NULL`,

  // Phase 10: backfill external_reviews.location_row_id
  `UPDATE external_reviews er
   SET location_row_id = rl.id
   FROM review_locations rl
   WHERE rl.connected_account_id = er.connected_account_id
     AND rl.external_location_id = er.location_id
     AND er.location_row_id IS NULL`,

  // ── PHOTO CATEGORIES ──────────────────────────────────────────────────────────
  // url was in original schema.sql but missing from early test/prod DBs that predate it.
  `ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS url TEXT`,
  // 'general' default covers all photos uploaded before this migration.
  `ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS photo_category TEXT NOT NULL DEFAULT 'general'`,
  `CREATE INDEX IF NOT EXISTS idx_job_photos_category ON job_photos(job_id, photo_category)`,

  // ── CANONICAL JOB FIELDS ───────────────────────────────────────────────────
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS duration_minutes INT NOT NULL DEFAULT 60`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS description TEXT`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS grace_period_minutes INT`,

  // ── SCHEDULING ENGINE ───────────────────────────────────────────────────────
  // noshow_declared_at: timestamp when admin officially declares a no-show
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS noshow_declared_at TIMESTAMPTZ`,

  // Performance indexes for calendar date-range queries (thousands of jobs)
  `CREATE INDEX IF NOT EXISTS idx_jobs_account_scheduled ON jobs(account_id, scheduled_at)`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_account_status    ON jobs(account_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_account_tech      ON jobs(account_id, tech_id)`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_account_client    ON jobs(account_id, client_id)`,

  // Expand recurring options: daily and quarterly added to the existing set
  `ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_recurring_check`,
  `ALTER TABLE jobs ADD CONSTRAINT jobs_recurring_check
     CHECK (recurring IN ('none','daily','weekly','biweekly','monthly','quarterly'))`,

  // Tech availability blocks — vacation, personal time, breaks, training, blocked slots
  `CREATE TABLE IF NOT EXISTS tech_availability_blocks (
     id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     user_id        UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
     block_type     TEXT NOT NULL DEFAULT 'blocked'
                      CHECK (block_type IN ('vacation','blocked','break','training','personal')),
     title          TEXT,
     starts_at      TIMESTAMPTZ NOT NULL,
     ends_at        TIMESTAMPTZ NOT NULL,
     is_all_day     BOOLEAN NOT NULL DEFAULT FALSE,
     notes          TEXT,
     created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
     created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT tech_blocks_dates_check CHECK (ends_at > starts_at)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tech_blocks_account ON tech_availability_blocks(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tech_blocks_user    ON tech_availability_blocks(account_id, user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tech_blocks_time    ON tech_availability_blocks(account_id, starts_at, ends_at)`,

  // ── DISPATCH VIEWPORT ENGINE ─────────────────────────────────────────────────
  // Per-tenant Dispatch map viewport and service-area configuration.
  // Safe defaults: business_address type + auto-fit live techs and today's jobs.
  `CREATE TABLE IF NOT EXISTS dispatch_settings (
     account_id                      UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
     dispatch_center_lat             NUMERIC(10,6),
     dispatch_center_lng             NUMERIC(10,6),
     dispatch_default_zoom           INTEGER DEFAULT 11
                                       CHECK (dispatch_default_zoom BETWEEN 1 AND 22),
     dispatch_service_area_type      TEXT NOT NULL DEFAULT 'business_address'
                                       CHECK (dispatch_service_area_type IN (
                                         'business_address','radius','postal_codes','custom_center'
                                       )),
     dispatch_service_radius_miles   NUMERIC(8,2)
                                       CHECK (dispatch_service_radius_miles > 0),
     dispatch_preferred_postal_codes TEXT[],
     dispatch_auto_fit_live_techs    BOOLEAN NOT NULL DEFAULT TRUE,
     dispatch_auto_fit_today_jobs    BOOLEAN NOT NULL DEFAULT TRUE,
     dispatch_include_scheduled      BOOLEAN NOT NULL DEFAULT TRUE,
     dispatch_include_completed      BOOLEAN NOT NULL DEFAULT FALSE,
     dispatch_include_cancelled      BOOLEAN NOT NULL DEFAULT FALSE,
     updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ── DISPATCH KPI SETTINGS ─────────────────────────────────────────────────────
  // Per-tenant KPI card visibility and Average Response configuration.
  // All columns added with IF NOT EXISTS so this is safe to re-run on existing DBs.
  `ALTER TABLE dispatch_settings ADD COLUMN IF NOT EXISTS kpi_show_live_techs           BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE dispatch_settings ADD COLUMN IF NOT EXISTS kpi_show_active_jobs          BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE dispatch_settings ADD COLUMN IF NOT EXISTS kpi_show_todays_jobs          BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE dispatch_settings ADD COLUMN IF NOT EXISTS kpi_show_completed_today      BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE dispatch_settings ADD COLUMN IF NOT EXISTS kpi_show_avg_response         BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE dispatch_settings ADD COLUMN IF NOT EXISTS kpi_response_tracking_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE dispatch_settings ADD COLUMN IF NOT EXISTS kpi_response_start_event      TEXT NOT NULL DEFAULT 'scheduled_at'`,
  `ALTER TABLE dispatch_settings ADD COLUMN IF NOT EXISTS kpi_response_end_event        TEXT NOT NULL DEFAULT 'checkin_at'`,
  `ALTER TABLE dispatch_settings ADD COLUMN IF NOT EXISTS kpi_response_outlier_minutes  INTEGER NOT NULL DEFAULT 1440`,
  `ALTER TABLE dispatch_settings ADD COLUMN IF NOT EXISTS kpi_response_min_sample_size  INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE dispatch_settings ADD COLUMN IF NOT EXISTS kpi_adaptive_kpis_enabled     BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE dispatch_settings ADD COLUMN IF NOT EXISTS kpi_fixed_layout              BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE dispatch_settings ADD COLUMN IF NOT EXISTS kpi_fifth_preference          TEXT NOT NULL DEFAULT 'average_response'`,

  // Performance indexes for dispatch summary queries
  `CREATE INDEX IF NOT EXISTS idx_tech_locs_account_updated ON tech_locations(account_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_account_completed     ON jobs(account_id, completed_at) WHERE completed_at IS NOT NULL`,

  // Average Response is opt-in; change default to FALSE for new tenants
  `ALTER TABLE dispatch_settings ALTER COLUMN kpi_show_avg_response SET DEFAULT FALSE`,
  `UPDATE dispatch_settings SET kpi_show_avg_response = FALSE WHERE kpi_show_avg_response = TRUE AND kpi_response_tracking_enabled = FALSE`,

  // ── WORKFORCE READINESS ───────────────────────────────────────────────────────
  // Clock-in/out tracking and operational status for field technicians.
  // operational_status separates dispatch availability from GPS location freshness.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS clocked_in_at             TIMESTAMPTZ`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS clocked_out_at            TIMESTAMPTZ`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS operational_status        TEXT NOT NULL DEFAULT 'off_duty'
     CHECK (operational_status IN ('available','en_route','on_job','break','off_duty'))`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_presence_at          TIMESTAMPTZ`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS location_tracking_enabled BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS tracking_required         BOOLEAN NOT NULL DEFAULT FALSE`,
  `CREATE INDEX IF NOT EXISTS idx_users_operational_status ON users(account_id, operational_status)
     WHERE operational_status != 'off_duty'`,

  // ── WORKFORCE ROLES ────────────────────────────────────────────────────────────
  // System role catalog + per-tenant custom roles.
  // account_id = NULL → system role (available to all tenants).
  // account_id set    → tenant-scoped custom role.
  `CREATE TABLE IF NOT EXISTS workforce_roles (
     id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id                UUID REFERENCES accounts(id) ON DELETE CASCADE,
     name                      TEXT NOT NULL,
     description               TEXT,
     category                  TEXT NOT NULL DEFAULT 'custom'
       CHECK (category IN ('owner','admin','operations','office','field','sales','contractor','custom')),
     is_system_role            BOOLEAN NOT NULL DEFAULT FALSE,
     field_work_eligible       BOOLEAN NOT NULL DEFAULT FALSE,
     dispatch_visible_default  BOOLEAN NOT NULL DEFAULT FALSE,
     location_tracking_default TEXT NOT NULL DEFAULT 'disabled'
       CHECK (location_tracking_default IN (
         'disabled','optional',
         'required_while_clocked_in',
         'required_during_assigned_jobs',
         'always_during_shift'
       )),
     clock_in_allowed          BOOLEAN NOT NULL DEFAULT FALSE,
     sort_order                INTEGER NOT NULL DEFAULT 0,
     created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  // Unique name among system roles (partial index) — keeps INSERT ON CONFLICT DO NOTHING safe
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_wfr_system_name
     ON workforce_roles(name)
     WHERE is_system_role = TRUE AND account_id IS NULL`,

  // Seed system roles — idempotent via ON CONFLICT DO NOTHING against the partial index above
  `INSERT INTO workforce_roles
     (name, description, category, is_system_role, field_work_eligible,
      dispatch_visible_default, location_tracking_default, clock_in_allowed, sort_order)
   VALUES
     ('Owner',                 'Business owner — full platform access',              'owner',       TRUE, FALSE, FALSE, 'disabled',                   FALSE, 0),
     ('Administrator',         'Account administrator',                              'admin',       TRUE, FALSE, FALSE, 'disabled',                   FALSE, 10),
     ('Dispatcher',            'Manages dispatch and job assignments',               'operations',  TRUE, FALSE, FALSE, 'disabled',                   FALSE, 20),
     ('Logistics Coordinator', 'Coordinates logistics and field operations',         'operations',  TRUE, FALSE, FALSE, 'disabled',                   FALSE, 30),
     ('Office Manager',        'Manages office operations',                          'office',      TRUE, FALSE, FALSE, 'disabled',                   FALSE, 40),
     ('Technician',            'Field technician — assignable to jobs',              'field',       TRUE, TRUE,  TRUE,  'required_while_clocked_in',  TRUE,  50),
     ('Crew Lead',             'Senior field technician who leads crews',            'field',       TRUE, TRUE,  TRUE,  'required_while_clocked_in',  TRUE,  60),
     ('Sales Representative',  'Sales — configurable field access',                  'sales',       TRUE, FALSE, FALSE, 'optional',                   FALSE, 70),
     ('Estimator',             'Estimates work — configurable field access',         'sales',       TRUE, FALSE, FALSE, 'optional',                   FALSE, 80),
     ('Contractor',            'Independent contractor — configurable access',       'contractor',  TRUE, FALSE, FALSE, 'optional',                   FALSE, 90)
   ON CONFLICT DO NOTHING`,

  // Per-user workforce policy fields
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS workforce_role_id        UUID REFERENCES workforce_roles(id) ON DELETE SET NULL`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS field_work_eligible      BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS dispatch_visible         BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS clock_in_allowed         BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS location_tracking_policy TEXT NOT NULL DEFAULT 'disabled'
     CHECK (location_tracking_policy IN (
       'disabled','optional',
       'required_while_clocked_in',
       'required_during_assigned_jobs',
       'always_during_shift'
     ))`,

  // Backfill: existing technicians become field-eligible + dispatch-visible
  `UPDATE users
   SET field_work_eligible      = TRUE,
       dispatch_visible         = TRUE,
       clock_in_allowed         = TRUE,
       location_tracking_policy = 'required_while_clocked_in'
   WHERE role = 'tech'
     AND field_work_eligible = FALSE`,

  // Assign the Technician system role to existing tech-role users (backfill)
  `UPDATE users u
   SET workforce_role_id = wr.id
   FROM workforce_roles wr
   WHERE wr.name = 'Technician'
     AND wr.is_system_role = TRUE
     AND wr.account_id IS NULL
     AND u.role = 'tech'
     AND u.workforce_role_id IS NULL`,

  `CREATE INDEX IF NOT EXISTS idx_users_field_dispatch ON users(account_id) WHERE field_work_eligible = TRUE AND dispatch_visible = TRUE`,

  // ── GEOCODE STATUS TRACKING ───────────────────────────────────────────────────
  // Tracks whether a job's service address has been successfully geocoded.
  // Values: 'not_attempted' | 'resolved' | 'failed'
  // 'not_attempted' = no address or geocode not yet run (default for existing rows)
  // 'resolved'      = lat/lng on file, marker will appear on Dispatch map
  // 'failed'        = address present but Google could not resolve it (API error or missing key)
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS geocode_status TEXT NOT NULL DEFAULT 'not_attempted'`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_geocode_status ON jobs(account_id, geocode_status) WHERE geocode_status = 'failed'`,

  // Scheduling timezone audit columns (added 2026-08-02 — must be idempotent)
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS scheduling_timezone  TEXT`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS original_local_start TEXT`,

  // Explicit per-appointment timezone audit columns (scheduling engine rebuild)
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS input_timezone TEXT`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS input_timezone_source TEXT`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS creator_timezone_at_creation TEXT`,

  // Geocoding error capture — stores the actual provider status and human-readable reason
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS geocode_provider_status TEXT`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS geocode_error TEXT`,

  // ── DISPATCH ADVANCED OPERATIONS — PHASE 1 ────────────────────────────────
  // Per-tenant feature flags for phased dispatch feature rollout.
  // Keys match the dispatch_* flag names. Empty JSONB = all flags use defaults.
  `ALTER TABLE dispatch_settings ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{}'`,

  // Route order for sequence engine (Phase 2 — add column now, populated in Phase 2)
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS route_order INT`,

  // Dispatch activity log — authoritative event timeline for jobs and dispatchers.
  // Sourced from real domain events only. Phase 3 adds the full UI; this table
  // is populated from Phase 1 onward so historical data exists when the UI ships.
  `CREATE TABLE IF NOT EXISTS dispatch_activity_log (
     id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     job_id      UUID REFERENCES jobs(id) ON DELETE SET NULL,
     tech_id     UUID REFERENCES users(id) ON DELETE SET NULL,
     event_type  TEXT NOT NULL,
     actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
     actor_name  TEXT,
     details     JSONB,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dispatch_activity_account ON dispatch_activity_log(account_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_dispatch_activity_job     ON dispatch_activity_log(job_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_dispatch_activity_tech    ON dispatch_activity_log(account_id, tech_id, created_at DESC)`,

  // ── Phase 2: service areas ────────────────────────────────────────────────
  // Radius-based service area boundaries per technician.
  // type = 'radius' only for now; polygon reserved for a future release.
  `CREATE TABLE IF NOT EXISTS service_areas (
     id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     tech_id     UUID REFERENCES users(id) ON DELETE SET NULL,
     name        TEXT,
     type        TEXT NOT NULL DEFAULT 'radius',
     center_lat  NUMERIC(10,6),
     center_lng  NUMERIC(10,6),
     radius_km   NUMERIC(8,3),
     is_active   BOOLEAN NOT NULL DEFAULT TRUE,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_service_areas_account ON service_areas(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_service_areas_tech    ON service_areas(account_id, tech_id)`,

  // Emergency dispatch mode columns on dispatch_settings
  `ALTER TABLE dispatch_settings ADD COLUMN IF NOT EXISTS emergency_dispatch_active BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE dispatch_settings ADD COLUMN IF NOT EXISTS emergency_activated_at    TIMESTAMPTZ`,
  `ALTER TABLE dispatch_settings ADD COLUMN IF NOT EXISTS emergency_activated_by    UUID REFERENCES users(id) ON DELETE SET NULL`,

  // ── Phase 3: quick-comm audit trail ──────────────────────────────────────
  // Full message body + delivery status. dispatch_activity_log gets a summary event alongside this.
  `CREATE TABLE IF NOT EXISTS dispatch_communications (
     id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     job_id       UUID REFERENCES jobs(id)  ON DELETE SET NULL,
     tech_id      UUID REFERENCES users(id) ON DELETE SET NULL,
     actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
     recipient    TEXT NOT NULL,
     template     TEXT,
     message      TEXT NOT NULL,
     client_phone TEXT,
     tech_phone   TEXT,
     status       TEXT NOT NULL DEFAULT 'sent',
     error        TEXT,
     created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dispatch_comms_account ON dispatch_communications(account_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_dispatch_comms_job     ON dispatch_communications(job_id, created_at DESC)`,

  // ── Job-scoped emergency dispatch columns ─────────────────────────────────
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_emergency                          BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS emergency_priority                    TEXT`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS emergency_reason_code                 TEXT`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS emergency_reason_text                 TEXT`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS emergency_declared_at                 TIMESTAMPTZ`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS emergency_declared_by                 UUID REFERENCES users(id) ON DELETE SET NULL`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS emergency_response_target_minutes     INT`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS emergency_customer_notification_policy TEXT NOT NULL DEFAULT 'none'`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS emergency_premium_pay_policy          TEXT NOT NULL DEFAULT 'none'`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS emergency_status                      TEXT`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS emergency_deactivated_at              TIMESTAMPTZ`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS emergency_deactivated_by              UUID REFERENCES users(id) ON DELETE SET NULL`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS emergency_deactivation_reason         TEXT`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS emergency_version                     INT NOT NULL DEFAULT 0`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_emergency ON jobs(account_id, is_emergency) WHERE is_emergency = TRUE`,

  // ── dispatch_activity_log schema extensions ───────────────────────────────
  // Added after initial creation — all IF NOT EXISTS so safe to re-run.
  `ALTER TABLE dispatch_activity_log ADD COLUMN IF NOT EXISTS category      TEXT`,
  `ALTER TABLE dispatch_activity_log ADD COLUMN IF NOT EXISTS actor_type    TEXT NOT NULL DEFAULT 'user'`,
  `ALTER TABLE dispatch_activity_log ADD COLUMN IF NOT EXISTS summary       TEXT`,
  `ALTER TABLE dispatch_activity_log ADD COLUMN IF NOT EXISTS source        TEXT NOT NULL DEFAULT 'domain'`,
  `ALTER TABLE dispatch_activity_log ADD COLUMN IF NOT EXISTS occurred_at   TIMESTAMPTZ`,
  `ALTER TABLE dispatch_activity_log ADD COLUMN IF NOT EXISTS idempotency_key TEXT`,
  `DROP INDEX IF EXISTS idx_dispatch_activity_idem`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatch_activity_idem ON dispatch_activity_log(idempotency_key)`,
  `CREATE INDEX IF NOT EXISTS idx_dispatch_activity_category ON dispatch_activity_log(job_id, category) WHERE category IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_dispatch_activity_occurred ON dispatch_activity_log(job_id, occurred_at DESC) WHERE occurred_at IS NOT NULL`,

  // ── Predictive Operations Foundation ─────────────────────────────────────
  // Normalized operational event store — foundation for future analytics.
  // Populated from real domain events only. No synthetic or invented data.
  `CREATE TABLE IF NOT EXISTS predictive_operational_events (
     id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     event_type       TEXT NOT NULL,
     job_id           UUID REFERENCES jobs(id)  ON DELETE SET NULL,
     technician_id    UUID REFERENCES users(id) ON DELETE SET NULL,
     occurred_at_utc  TIMESTAMPTZ NOT NULL,
     operational_date DATE,
     numeric_metrics  JSONB NOT NULL DEFAULT '{}',
     categorical_metrics JSONB NOT NULL DEFAULT '{}',
     data_source      TEXT NOT NULL DEFAULT 'live',
     source_record_id TEXT,
     source_version   INT NOT NULL DEFAULT 0,
     quality_state    TEXT NOT NULL DEFAULT 'valid',
     idempotency_key  TEXT UNIQUE,
     created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pred_events_account   ON predictive_operational_events(account_id, occurred_at_utc DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_pred_events_job       ON predictive_operational_events(job_id) WHERE job_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_pred_events_tech      ON predictive_operational_events(technician_id) WHERE technician_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_pred_events_type      ON predictive_operational_events(account_id, event_type)`,
  `CREATE INDEX IF NOT EXISTS idx_pred_events_idem      ON predictive_operational_events(idempotency_key) WHERE idempotency_key IS NOT NULL`,

  // Cached readiness summary — avoid recalculating on every page load.
  `CREATE TABLE IF NOT EXISTS predictive_readiness_cache (
     account_id       UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
     readiness_state  TEXT NOT NULL DEFAULT 'insufficient_data',
     readiness_score  INT NOT NULL DEFAULT 0,
     collection_active BOOLEAN NOT NULL DEFAULT TRUE,
     usable_job_count INT NOT NULL DEFAULT 0,
     data_completeness JSONB NOT NULL DEFAULT '{}',
     quality_issues   JSONB NOT NULL DEFAULT '[]',
     capability_readiness JSONB NOT NULL DEFAULT '{}',
     explanation      JSONB NOT NULL DEFAULT '[]',
     calculated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ── MULTI-TECH JOB ASSIGNMENT ENGINE — Phase A ────────────────────────────
  // Many-to-many assignment model. Phase A: create tables + backfill legacy
  // jobs.tech_id. Phase B: all reads move to job_assignments. Phase C: drop legacy.

  // Saved crew templates
  `CREATE TABLE IF NOT EXISTS crews (
     id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     name       TEXT NOT NULL,
     active     BOOLEAN NOT NULL DEFAULT TRUE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_crews_account ON crews(account_id)`,

  // Per-crew member defaults (role, lead flag)
  `CREATE TABLE IF NOT EXISTS crew_members (
     id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     crew_id      UUID NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
     account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     default_role TEXT NOT NULL DEFAULT 'technician',
     is_lead      BOOLEAN NOT NULL DEFAULT FALSE,
     active       BOOLEAN NOT NULL DEFAULT TRUE,
     created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (crew_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_crew_members_crew    ON crew_members(crew_id)`,
  `CREATE INDEX IF NOT EXISTS idx_crew_members_account ON crew_members(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_crew_members_user    ON crew_members(account_id, user_id)`,

  // Job assignments — one row per active team member per job
  `CREATE TABLE IF NOT EXISTS job_assignments (
     id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
     user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     crew_id         UUID REFERENCES crews(id) ON DELETE SET NULL,
     assignment_role TEXT NOT NULL DEFAULT 'technician',
     is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
     status          TEXT NOT NULL DEFAULT 'assigned'
                       CHECK (status IN (
                         'assigned','accepted','en_route','arrived',
                         'working','finished','declined','removed'
                       )),
     assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     assigned_by     UUID REFERENCES users(id) ON DELETE SET NULL,
     accepted_at     TIMESTAMPTZ,
     removed_at      TIMESTAMPTZ,
     removed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
     removal_reason  TEXT,
     created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_job_assignments_account ON job_assignments(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_job_assignments_job     ON job_assignments(job_id)`,
  `CREATE INDEX IF NOT EXISTS idx_job_assignments_user    ON job_assignments(account_id, user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_job_assignments_crew    ON job_assignments(crew_id) WHERE crew_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_job_assignments_status  ON job_assignments(job_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_job_assignments_active  ON job_assignments(job_id) WHERE removed_at IS NULL`,

  // Exactly one active primary per job (prevents duplicate leads)
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_job_assignments_one_primary
     ON job_assignments(job_id)
     WHERE is_primary = TRUE AND removed_at IS NULL`,

  // One active assignment per job/member pair (prevents duplicates)
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_job_assignments_active_member
     ON job_assignments(job_id, user_id)
     WHERE removed_at IS NULL`,

  // Phase A backfill: copy existing jobs.tech_id → job_assignments.
  // NOT EXISTS guard makes this idempotent on redeploy.
  `INSERT INTO job_assignments
     (account_id, job_id, user_id, assignment_role, is_primary, status, assigned_at)
   SELECT j.account_id, j.id, j.tech_id, 'lead_technician', TRUE, 'assigned',
          COALESCE(j.updated_at, j.created_at)
   FROM jobs j
   WHERE j.tech_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM job_assignments ja
       WHERE ja.job_id = j.id AND ja.user_id = j.tech_id AND ja.removed_at IS NULL
     )`,

  // ── REVENUE ANALYTICS — timestamp columns ─────────────────────────────────
  // paid_at on invoices and collected_at on deposits are referenced in
  // webhooks.js UPDATE statements since initial build but were missing from
  // the database schema.
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`,
  `ALTER TABLE deposits ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ`,
  `ALTER TABLE deposits ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT`,
  `ALTER TABLE deposits ADD COLUMN IF NOT EXISTS stripe_charge_id TEXT`,
  // Back-fill: any invoice already marked paid gets paid_at = created_at
  `UPDATE invoices SET paid_at = created_at WHERE status = 'paid' AND paid_at IS NULL`,
  // Back-fill: any deposit already marked collected gets collected_at = created_at
  `UPDATE deposits SET collected_at = created_at WHERE status = 'collected' AND collected_at IS NULL`,

  // ── Accounting integration tables ──────────────────────────────────────────

  `CREATE TABLE IF NOT EXISTS accounting_connections (
     id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id                UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     provider                  TEXT NOT NULL DEFAULT 'quickbooks_online',
     realm_id                  TEXT,
     company_name              TEXT,
     status                    TEXT NOT NULL DEFAULT 'not_connected'
                                 CHECK (status IN ('not_connected','connecting','connected','syncing','sync_error','reauth_required','disconnected')),
     access_token_enc          TEXT,
     refresh_token_enc         TEXT,
     token_expires_at          TIMESTAMPTZ,
     refresh_token_expires_at  TIMESTAMPTZ,
     scopes                    TEXT,
     last_sync_at              TIMESTAMPTZ,
     last_successful_sync_at   TIMESTAMPTZ,
     last_sync_attempt_at      TIMESTAMPTZ,
     last_error_code           TEXT,
     last_error_message_safe   TEXT,
     connected_by_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
     connected_at              TIMESTAMPTZ,
     disconnected_at           TIMESTAMPTZ,
     created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (account_id, provider)
   )`,

  `CREATE TABLE IF NOT EXISTS accounting_account_mappings (
     id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id               UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     provider                 TEXT NOT NULL DEFAULT 'quickbooks_online',
     provider_account_id      TEXT NOT NULL,
     provider_account_name    TEXT,
     provider_account_type    TEXT,
     provider_account_subtype TEXT,
     fieldcore_category       TEXT,
     fieldcore_subcategory    TEXT,
     is_direct_cost           BOOLEAN NOT NULL DEFAULT FALSE,
     is_operating_expense     BOOLEAN NOT NULL DEFAULT FALSE,
     is_tax                   BOOLEAN NOT NULL DEFAULT FALSE,
     is_cash_account          BOOLEAN NOT NULL DEFAULT FALSE,
     is_ignored               BOOLEAN NOT NULL DEFAULT FALSE,
     is_active                BOOLEAN NOT NULL DEFAULT TRUE,
     created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (account_id, provider, provider_account_id)
   )`,

  `CREATE TABLE IF NOT EXISTS accounting_synced_records (
     id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id          UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     provider            TEXT NOT NULL DEFAULT 'quickbooks_online',
     record_type         TEXT NOT NULL,
     provider_record_id  TEXT NOT NULL,
     provider_updated_at TIMESTAMPTZ,
     amount_cents        BIGINT,
     currency            TEXT DEFAULT 'USD',
     accounting_date     DATE,
     vendor_name         TEXT,
     memo                TEXT,
     fieldcore_category  TEXT,
     provider_account_id TEXT,
     raw_summary_safe    JSONB,
     sync_version        INT NOT NULL DEFAULT 1,
     synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (account_id, provider, record_type, provider_record_id)
   )`,

  `CREATE INDEX IF NOT EXISTS idx_accounting_synced_records_account_date
     ON accounting_synced_records (account_id, provider, accounting_date)`,

  // ── Smart classification columns ──────────────────────────────────────────────
  `ALTER TABLE accounting_account_mappings
    ADD COLUMN IF NOT EXISTS mapping_confidence TEXT NOT NULL DEFAULT 'review_required',
    ADD COLUMN IF NOT EXISTS is_revenue       BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_balance_sheet BOOLEAN NOT NULL DEFAULT FALSE`,

  // Migrate cash_accounts → balance_sheet (bank accounts are balance sheet)
  `UPDATE accounting_account_mappings
    SET fieldcore_category    = 'balance_sheet',
        fieldcore_subcategory = COALESCE(fieldcore_subcategory, 'cash_bank'),
        is_cash_account       = FALSE,
        is_balance_sheet      = TRUE,
        mapping_confidence    = 'deterministic'
    WHERE fieldcore_category = 'cash_accounts'`,

  // Deterministic: Income/Other Income → revenue
  `UPDATE accounting_account_mappings
    SET fieldcore_category    = 'revenue',
        fieldcore_subcategory = CASE WHEN provider_account_type = 'Other Income' THEN 'other_revenue' ELSE 'service_revenue' END,
        is_revenue            = TRUE,
        mapping_confidence    = 'deterministic'
    WHERE provider_account_type IN ('Income','Other Income')
      AND (fieldcore_category IS NULL OR fieldcore_category NOT IN ('balance_sheet','revenue','cogs','operating_expenses','taxes'))`,

  // Deterministic: Accounts Receivable → balance_sheet
  `UPDATE accounting_account_mappings
    SET fieldcore_category    = 'balance_sheet',
        fieldcore_subcategory = 'accounts_receivable',
        is_balance_sheet      = TRUE,
        mapping_confidence    = 'deterministic'
    WHERE provider_account_type = 'Accounts Receivable'
      AND (fieldcore_category IS NULL OR fieldcore_category NOT IN ('balance_sheet'))`,

  // Deterministic: Accounts Payable → balance_sheet
  `UPDATE accounting_account_mappings
    SET fieldcore_category    = 'balance_sheet',
        fieldcore_subcategory = 'accounts_payable',
        is_balance_sheet      = TRUE,
        mapping_confidence    = 'deterministic'
    WHERE provider_account_type = 'Accounts Payable'
      AND (fieldcore_category IS NULL OR fieldcore_category NOT IN ('balance_sheet'))`,

  // Deterministic: Equity → balance_sheet
  `UPDATE accounting_account_mappings
    SET fieldcore_category    = 'balance_sheet',
        fieldcore_subcategory = 'equity',
        is_balance_sheet      = TRUE,
        mapping_confidence    = 'deterministic'
    WHERE provider_account_type IN ('Equity')
      AND (fieldcore_category IS NULL OR fieldcore_category NOT IN ('balance_sheet'))`,

  // Deterministic: Fixed/Other assets → balance_sheet
  `UPDATE accounting_account_mappings
    SET fieldcore_category    = 'balance_sheet',
        fieldcore_subcategory = 'other_asset',
        is_balance_sheet      = TRUE,
        mapping_confidence    = 'deterministic'
    WHERE provider_account_type IN ('Fixed Asset','Other Current Asset','Other Asset')
      AND (fieldcore_category IS NULL OR fieldcore_category NOT IN ('balance_sheet'))`,

  // Deterministic: Liabilities + Credit Card → balance_sheet
  `UPDATE accounting_account_mappings
    SET fieldcore_category    = 'balance_sheet',
        fieldcore_subcategory = CASE WHEN provider_account_type = 'Credit Card' THEN 'credit_card' ELSE 'other_liability' END,
        is_balance_sheet      = TRUE,
        mapping_confidence    = 'deterministic'
    WHERE provider_account_type IN ('Long Term Liability','Other Current Liability','Credit Card')
      AND (fieldcore_category IS NULL OR fieldcore_category NOT IN ('balance_sheet'))`,

  // Deterministic: Cost of Goods Sold type → cogs
  `UPDATE accounting_account_mappings
    SET fieldcore_category    = 'cogs',
        fieldcore_subcategory = COALESCE(fieldcore_subcategory, 'other_direct_cost'),
        is_direct_cost        = TRUE,
        mapping_confidence    = 'deterministic'
    WHERE provider_account_type = 'Cost of Goods Sold'
      AND (fieldcore_category IS NULL OR fieldcore_category NOT IN ('balance_sheet','revenue'))`,

  // High-confidence: specific Expense subtypes with subcategory
  `UPDATE accounting_account_mappings
    SET fieldcore_subcategory = CASE
          WHEN provider_account_subtype = 'Insurance'                   THEN 'insurance'
          WHEN provider_account_subtype = 'Rent'                        THEN 'rent'
          WHEN provider_account_subtype = 'Utilities'                   THEN 'utilities'
          WHEN provider_account_subtype = 'Advertising'                 THEN 'marketing'
          WHEN provider_account_subtype = 'Vehicle'                     THEN 'vehicle_overhead'
          WHEN provider_account_subtype = 'LegalAndProfessionalFees'    THEN 'professional_services'
          WHEN provider_account_subtype = 'OfficeGeneralAdminExpenses'  THEN 'office_expense'
          WHEN provider_account_subtype = 'TravelExpenses'              THEN 'travel'
          ELSE 'other_operating'
        END,
        mapping_confidence = CASE
          WHEN provider_account_subtype IN ('Insurance','Rent','Utilities','Advertising','Vehicle',
               'LegalAndProfessionalFees','OfficeGeneralAdminExpenses','TravelExpenses') THEN 'high_confidence'
          ELSE 'review_required'
        END
    WHERE fieldcore_category = 'operating_expenses'
      AND fieldcore_subcategory IS NULL`,

  // High-confidence: taxes with subcategory
  `UPDATE accounting_account_mappings
    SET fieldcore_subcategory = 'tax',
        mapping_confidence    = 'high_confidence'
    WHERE fieldcore_category = 'taxes'
      AND fieldcore_subcategory IS NULL`,

  // High-confidence: cogs without subcategory
  `UPDATE accounting_account_mappings
    SET fieldcore_subcategory = 'other_direct_cost',
        mapping_confidence    = 'high_confidence'
    WHERE fieldcore_category = 'cogs'
      AND fieldcore_subcategory IS NULL`,

  // ── BANKING V1 — Plaid Sandbox ────────────────────────────────────────────

  `CREATE TABLE IF NOT EXISTS bank_connections (
     id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id              UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     provider                TEXT NOT NULL DEFAULT 'plaid',
     provider_item_id        TEXT NOT NULL,
     institution_id          TEXT,
     institution_name        TEXT,
     status                  TEXT NOT NULL DEFAULT 'CONNECTED'
                               CHECK (status IN (
                                 'CONNECTED','SYNCING','DEGRADED',
                                 'REAUTH_REQUIRED','SYNC_ERROR','DISCONNECTED'
                               )),
     access_token_encrypted  TEXT,
     consent_expiration_time TIMESTAMPTZ,
     last_sync_at            TIMESTAMPTZ,
     last_successful_sync_at TIMESTAMPTZ,
     last_error_code         TEXT,
     last_error_message_safe TEXT,
     disconnected_at         TIMESTAMPTZ,
     created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_bank_connections_account ON bank_connections(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_bank_connections_item    ON bank_connections(provider_item_id)`,
  `CREATE INDEX IF NOT EXISTS idx_bank_connections_status  ON bank_connections(account_id, status)`,

  `CREATE TABLE IF NOT EXISTS bank_accounts (
     id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     bank_connection_id       UUID NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
     account_id               UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     provider_account_id      TEXT NOT NULL,
     name                     TEXT NOT NULL,
     official_name            TEXT,
     mask                     TEXT,
     type                     TEXT,
     subtype                  TEXT,
     currency                 TEXT NOT NULL DEFAULT 'USD',
     current_balance          NUMERIC(14,2),
     available_balance        NUMERIC(14,2),
     limit_balance            NUMERIC(14,2),
     include_in_cash_position BOOLEAN NOT NULL DEFAULT TRUE,
     is_active                BOOLEAN NOT NULL DEFAULT TRUE,
     created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (bank_connection_id, provider_account_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_bank_accounts_connection ON bank_accounts(bank_connection_id)`,
  `CREATE INDEX IF NOT EXISTS idx_bank_accounts_account   ON bank_accounts(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_bank_accounts_cash      ON bank_accounts(account_id, include_in_cash_position, is_active)`,

  `CREATE TABLE IF NOT EXISTS bank_transactions (
     id                                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id                          UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     bank_connection_id                  UUID NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
     bank_account_id                     UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
     provider_transaction_id             TEXT NOT NULL,
     provider_pending_transaction_id     TEXT,
     authorized_date                     DATE,
     posted_date                         DATE NOT NULL,
     description                         TEXT NOT NULL,
     merchant_name                       TEXT,
     amount                              NUMERIC(14,2) NOT NULL,
     direction                           TEXT NOT NULL CHECK (direction IN ('CASH_IN','CASH_OUT')),
     currency                            TEXT NOT NULL DEFAULT 'USD',
     pending                             BOOLEAN NOT NULL DEFAULT FALSE,
     personal_finance_category_primary   TEXT,
     personal_finance_category_detailed  TEXT,
     payment_channel                     TEXT,
     iso_currency_code                   TEXT,
     unofficial_currency_code            TEXT,
     reconciliation_status               TEXT NOT NULL DEFAULT 'UNMATCHED'
                                           CHECK (reconciliation_status IN (
                                             'MATCHED','SUGGESTED','UNMATCHED',
                                             'TRANSFER','EXCLUDED','NEEDS_REVIEW'
                                           )),
     excluded_from_analytics             BOOLEAN NOT NULL DEFAULT FALSE,
     raw_metadata_safe                   JSONB NOT NULL DEFAULT '{}',
     created_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (account_id, provider_transaction_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_bank_txn_account     ON bank_transactions(account_id, posted_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_bank_txn_connection  ON bank_transactions(bank_connection_id)`,
  `CREATE INDEX IF NOT EXISTS idx_bank_txn_acct        ON bank_transactions(bank_account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_bank_txn_direction   ON bank_transactions(account_id, direction, pending)`,
  `CREATE INDEX IF NOT EXISTS idx_bank_txn_status      ON bank_transactions(account_id, reconciliation_status)`,
  `CREATE INDEX IF NOT EXISTS idx_bank_txn_pending     ON bank_transactions(account_id, pending) WHERE pending = TRUE`,

  `CREATE TABLE IF NOT EXISTS bank_balance_snapshots (
     id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     bank_account_id   UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
     current_balance   NUMERIC(14,2),
     available_balance NUMERIC(14,2),
     captured_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_bank_snapshots_account ON bank_balance_snapshots(account_id, captured_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_bank_snapshots_acct    ON bank_balance_snapshots(bank_account_id, captured_at DESC)`,

  `CREATE TABLE IF NOT EXISTS financial_reconciliation_matches (
     id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id             UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     bank_transaction_id    UUID REFERENCES bank_transactions(id) ON DELETE SET NULL,
     fieldcore_payment_id   UUID REFERENCES deposits(id) ON DELETE SET NULL,
     fieldcore_payout_id    UUID,
     quickbooks_record_id   TEXT,
     match_type             TEXT NOT NULL,
     confidence             TEXT NOT NULL DEFAULT 'medium',
     status                 TEXT NOT NULL DEFAULT 'UNMATCHED'
                              CHECK (status IN (
                                'MATCHED','SUGGESTED','UNMATCHED',
                                'TRANSFER','EXCLUDED','NEEDS_REVIEW'
                              )),
     matched_at             TIMESTAMPTZ,
     matched_by             UUID REFERENCES users(id) ON DELETE SET NULL,
     created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_frm_account ON financial_reconciliation_matches(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_frm_bank_tx ON financial_reconciliation_matches(bank_transaction_id)`,
  `CREATE INDEX IF NOT EXISTS idx_frm_status  ON financial_reconciliation_matches(account_id, status)`,

  `CREATE TABLE IF NOT EXISTS bank_sync_cursors (
     connection_id  UUID PRIMARY KEY REFERENCES bank_connections(id) ON DELETE CASCADE,
     account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     cursor         TEXT NOT NULL,
     updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_bank_cursors_account ON bank_sync_cursors(account_id)`,

  // revenue_saved_views table (used by revenue.js /saved-views routes)
  `CREATE TABLE IF NOT EXISTS revenue_saved_views (
     id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     tenant_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     owner_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     workspace      TEXT NOT NULL,
     name           TEXT NOT NULL,
     filters        JSONB NOT NULL DEFAULT '{}',
     columns        JSONB,
     sort           JSONB,
     grouping       JSONB,
     is_shared      BOOLEAN NOT NULL DEFAULT FALSE,
     created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_revenue_saved_views_tenant ON revenue_saved_views(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_revenue_saved_views_owner  ON revenue_saved_views(owner_user_id)`,

  // ── OPERATIONS V1 — Commission & Job Status History ───────────────────────

  `CREATE TABLE IF NOT EXISTS commission_rules (
     id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id            UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     name                  TEXT NOT NULL,
     commission_type       TEXT NOT NULL CHECK (commission_type IN ('percentage','flat_amount')),
     rate_percent          NUMERIC(8,6),
     flat_amount           NUMERIC(10,2),
     basis                 TEXT NOT NULL DEFAULT 'completed_revenue'
                             CHECK (basis IN (
                               'booked_revenue','completed_revenue','invoiced_revenue',
                               'collected_revenue','upsell_revenue','flat_per_job'
                             )),
     trigger               TEXT NOT NULL DEFAULT 'job_completed'
                             CHECK (trigger IN (
                               'job_booked','job_completed','invoice_issued',
                               'payment_collected','upsell_completed','manual_approval'
                             )),
     applies_to_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
     applies_to_role       TEXT,
     applies_to_service    TEXT,
     active                BOOLEAN NOT NULL DEFAULT TRUE,
     created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
     created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_commission_rules_account ON commission_rules(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_commission_rules_user    ON commission_rules(applies_to_user_id) WHERE applies_to_user_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_commission_rules_active  ON commission_rules(account_id, active)`,

  `CREATE TABLE IF NOT EXISTS commission_entries (
     id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     rule_id           UUID REFERENCES commission_rules(id) ON DELETE SET NULL,
     user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     job_id            UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
     source_amount     NUMERIC(10,2) NOT NULL,
     commission_amount NUMERIC(10,2) NOT NULL,
     status            TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','approved','payable','paid','voided')),
     earned_at         TIMESTAMPTZ,
     approved_at       TIMESTAMPTZ,
     approved_by       UUID REFERENCES users(id) ON DELETE SET NULL,
     payable_at        TIMESTAMPTZ,
     paid_at           TIMESTAMPTZ,
     voided_at         TIMESTAMPTZ,
     voided_reason     TEXT,
     created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (rule_id, job_id, user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_commission_entries_account ON commission_entries(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_commission_entries_user    ON commission_entries(account_id, user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_commission_entries_job     ON commission_entries(job_id)`,
  `CREATE INDEX IF NOT EXISTS idx_commission_entries_status  ON commission_entries(account_id, status)`,

  `CREATE TABLE IF NOT EXISTS job_status_history (
     id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
     from_status TEXT,
     to_status   TEXT NOT NULL,
     reason_code TEXT,
     reason_text TEXT,
     changed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
     changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_job_status_history_account ON job_status_history(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_job_status_history_job     ON job_status_history(job_id)`,
  `CREATE INDEX IF NOT EXISTS idx_job_status_history_status  ON job_status_history(account_id, to_status, changed_at DESC)`,

  // ── UPSELL ATTRIBUTION — V1 ──────────────────────────────────────────────────
  // job_original_scope: immutable snapshot of what was originally booked/accepted.
  // Captured at booking time; no retroactive attribution for historical jobs.
  `CREATE TABLE IF NOT EXISTS job_original_scope (
     id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id         UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     job_id             UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE UNIQUE,
     sold_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
     original_amount    NUMERIC(10,2) NOT NULL,
     booked_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     source_estimate_id UUID,
     created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_job_orig_scope_account ON job_original_scope(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_job_orig_scope_job     ON job_original_scope(job_id)`,
  `CREATE INDEX IF NOT EXISTS idx_job_orig_scope_seller  ON job_original_scope(account_id, sold_by_user_id)`,

  // job_upsell_attributions: explicit line-item upsell records added after original booking.
  // attribution_type='UPSELL' is the only type counted in Upsell Revenue KPI for V1.
  `CREATE TABLE IF NOT EXISTS job_upsell_attributions (
     id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id            UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     job_id                UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
     sold_by_user_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
     performed_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
     attribution_type      TEXT NOT NULL DEFAULT 'UPSELL'
                             CHECK (attribution_type IN ('ORIGINAL','UPSELL','CHANGE_ORDER','ADJUSTMENT')),
     service_description   TEXT,
     upsell_amount         NUMERIC(10,2) NOT NULL CHECK (upsell_amount >= 0),
     sold_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
     created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     notes                 TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_job_upsell_account ON job_upsell_attributions(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_job_upsell_job     ON job_upsell_attributions(job_id)`,
  `CREATE INDEX IF NOT EXISTS idx_job_upsell_seller  ON job_upsell_attributions(account_id, sold_by_user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_job_upsell_type    ON job_upsell_attributions(account_id, attribution_type, sold_at DESC)`,

  // ── INVOICE BUILDER V1 — extended invoice model ──────────────────────────────
  // Make job_id optional — standalone (blank/manual) invoices don't require a job
  `ALTER TABLE invoices ALTER COLUMN job_id DROP NOT NULL`,
  // Replace table-level UNIQUE (job_id) with a partial index (NULL job_ids are allowed)
  `ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_job_id_key`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_job_unique
     ON invoices(job_id) WHERE job_id IS NOT NULL`,
  // Add 'draft' status — new invoices start as drafts; 'pending' means sent
  `ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check`,
  `ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
     CHECK (status IN ('draft','pending','paid','void','failed'))`,
  // Audit / source tracking
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source_type    TEXT NOT NULL DEFAULT 'JOB'`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_by     UUID REFERENCES users(id) ON DELETE SET NULL`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_by     UUID REFERENCES users(id) ON DELETE SET NULL`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ`,
  // Sequential human-readable invoice number (assigned at creation, per account)
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number INT`,
  // Header fields
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subject        TEXT`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS issued_date    DATE`,
  // Discount
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_type   TEXT`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_value  NUMERIC(10,2)`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2)`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal        NUMERIC(10,2)`,
  // Client-visible and internal text
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_message TEXT`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS internal_notes TEXT`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS terms          TEXT`,
  // Per-account sequential number tracker
  `CREATE TABLE IF NOT EXISTS invoice_number_sequences (
     account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
     next_val   INT NOT NULL DEFAULT 1001
   )`,
  `CREATE INDEX IF NOT EXISTS idx_inv_seq_account ON invoice_number_sequences(account_id)`,

  // ── ESTIMATE → INVOICE CONVERSION V1 ─────────────────────────────────────
  // Traceability: invoice records which estimate it was created from
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source_estimate_id UUID REFERENCES estimates(id) ON DELETE SET NULL`,
  // Traceability: estimate records which invoice was created from it (prevents re-conversion)
  `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS converted_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL`,

  // ── RECURRING AGREEMENTS V1 ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS recurring_agreements (
     id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     client_id        UUID NOT NULL REFERENCES clients(id),
     name             TEXT NOT NULL,
     service_type     TEXT,
     service_address  TEXT,
     cadence          TEXT NOT NULL DEFAULT 'monthly'
                        CHECK (cadence IN ('weekly','biweekly','monthly','quarterly','annual')),
     billing_cadence  TEXT NOT NULL DEFAULT 'monthly'
                        CHECK (billing_cadence IN ('weekly','biweekly','monthly','quarterly','annual')),
     plan_price       NUMERIC(10,2) NOT NULL DEFAULT 0,
     status           TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','paused','cancelled','expired')),
     payment_status   TEXT NOT NULL DEFAULT 'pending'
                        CHECK (payment_status IN ('paid_in_advance','pending','failed','overdue')),
     notes            TEXT,
     line_items       JSONB NOT NULL DEFAULT '[]',
     started_at       DATE NOT NULL DEFAULT CURRENT_DATE,
     next_billing_date DATE,
     created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
     created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_agreements_account ON recurring_agreements(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agreements_client  ON recurring_agreements(account_id, client_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agreements_status  ON recurring_agreements(account_id, status)`,

  // Period-level invoice tracking — prevents duplicate invoices per billing period
  `CREATE TABLE IF NOT EXISTS agreement_invoice_periods (
     id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     agreement_id  UUID NOT NULL REFERENCES recurring_agreements(id) ON DELETE CASCADE,
     invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
     period_start  DATE NOT NULL,
     period_end    DATE NOT NULL,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (agreement_id, period_start, period_end)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_agr_inv_periods_agreement ON agreement_invoice_periods(agreement_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agr_inv_periods_invoice   ON agreement_invoice_periods(invoice_id)`,

  // Invoice traceability for agreement source
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source_agreement_id UUID REFERENCES recurring_agreements(id) ON DELETE SET NULL`,

  // ── CUSTOMERS V1 ANALYTICS ────────────────────────────────────────────────
  // Customer inactivity policy on business_profiles — drives At-Risk/Churn engine.
  // NULL = not configured (status card shown). INT = days before a repeat customer
  // is considered at-risk.
  `ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS customer_inactivity_days INT DEFAULT NULL`,

  // Account-scoped client segments (tags). name is unique per tenant.
  `CREATE TABLE IF NOT EXISTS client_segments (
     id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     name       TEXT NOT NULL,
     color      TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (account_id, name)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_client_segments_account ON client_segments(account_id)`,

  // Client-to-segment many-to-many. One client can belong to multiple segments.
  // UNIQUE(client_id, segment_id) prevents duplicate assignments.
  `CREATE TABLE IF NOT EXISTS client_segment_assignments (
     id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     client_id  UUID NOT NULL REFERENCES clients(id)  ON DELETE CASCADE,
     segment_id UUID NOT NULL REFERENCES client_segments(id) ON DELETE CASCADE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (client_id, segment_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_csa_account_client  ON client_segment_assignments(account_id, client_id)`,
  `CREATE INDEX IF NOT EXISTS idx_csa_segment         ON client_segment_assignments(segment_id)`,

  // ── INVOICE V2 ────────────────────────────────────────────────────────────────

  // Service catalog: category + SKU for richer autocomplete
  `ALTER TABLE service_templates ADD COLUMN IF NOT EXISTS category TEXT`,
  `ALTER TABLE service_templates ADD COLUMN IF NOT EXISTS sku      TEXT`,

  // Business-level payment capability flags (all inherit to invoices)
  `ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS accept_card             BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS accept_ach              BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS allow_partial_payments  BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS default_terms           TEXT`,
  `ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS accept_cash             BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS accept_check            BOOLEAN NOT NULL DEFAULT TRUE`,

  // Invoice-level: named discount + per-invoice payment option overrides
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_label  TEXT`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_options JSONB NOT NULL DEFAULT '{}'`,

  // Expand invoice status to include partially_paid
  `ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check`,
  `ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
     CHECK (status IN ('draft','pending','paid','partially_paid','void','failed'))`,

  // ── INVOICE DATA-TRUTH PASS ───────────────────────────────────────────────────

  // Configurable invoice starting number per account (stored alongside the live sequence)
  `ALTER TABLE invoice_number_sequences ADD COLUMN IF NOT EXISTS starting_number INT NOT NULL DEFAULT 1001`,

  // Configurable starting number exposed through business settings
  `ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS invoice_starting_number INT NOT NULL DEFAULT 1001`,

  // ── RECURRING AGREEMENT — BILLING MODEL EXPANSION ────────────────────────────

  // Expand service cadence to support fine-grained intervals
  `ALTER TABLE recurring_agreements DROP CONSTRAINT IF EXISTS recurring_agreements_cadence_check`,
  `ALTER TABLE recurring_agreements ADD CONSTRAINT recurring_agreements_cadence_check
     CHECK (cadence IN ('weekly','every_2_weeks','every_3_weeks','every_4_weeks',
                        'monthly','quarterly','annual','custom'))`,

  // Expand billing cadence — every_service means bill on each occurrence
  `ALTER TABLE recurring_agreements DROP CONSTRAINT IF EXISTS recurring_agreements_billing_cadence_check`,
  `ALTER TABLE recurring_agreements ADD CONSTRAINT recurring_agreements_billing_cadence_check
     CHECK (billing_cadence IN ('every_service','weekly','every_2_weeks',
                                'monthly','quarterly','annual','custom'))`,

  // When within a billing period does the invoice trigger
  `ALTER TABLE recurring_agreements ADD COLUMN IF NOT EXISTS billing_trigger TEXT NOT NULL DEFAULT 'first_day'`,
  `ALTER TABLE recurring_agreements DROP CONSTRAINT IF EXISTS recurring_agreements_billing_trigger_check`,
  `ALTER TABLE recurring_agreements ADD CONSTRAINT recurring_agreements_billing_trigger_check
     CHECK (billing_trigger IN ('every_service','first_scheduled','first_completed','first_day','specific_day'))`,

  // Day of month for specific_day trigger (1–28 to handle all months safely)
  `ALTER TABLE recurring_agreements ADD COLUMN IF NOT EXISTS billing_day INT`,
  `ALTER TABLE recurring_agreements DROP CONSTRAINT IF EXISTS recurring_agreements_billing_day_check`,
  `ALTER TABLE recurring_agreements ADD CONSTRAINT recurring_agreements_billing_day_check
     CHECK (billing_day IS NULL OR (billing_day BETWEEN 1 AND 28))`,

  // Number of service visits included per billing period
  `ALTER TABLE recurring_agreements ADD COLUMN IF NOT EXISTS included_services_per_period INT NOT NULL DEFAULT 1`,

  // What to do when actual visits exceed included_services_per_period
  `ALTER TABLE recurring_agreements ADD COLUMN IF NOT EXISTS extra_occurrence_policy TEXT NOT NULL DEFAULT 'all_included'`,
  `ALTER TABLE recurring_agreements DROP CONSTRAINT IF EXISTS recurring_agreements_extra_occurrence_policy_check`,
  `ALTER TABLE recurring_agreements ADD CONSTRAINT recurring_agreements_extra_occurrence_policy_check
     CHECK (extra_occurrence_policy IN ('all_included','max_n','rollover','manual_review'))`,

  // Interval in days for custom cadence values
  `ALTER TABLE recurring_agreements ADD COLUMN IF NOT EXISTS service_interval_days INT`,

  // What to do when a scheduled service is missed — does not automatically change billing
  `ALTER TABLE recurring_agreements ADD COLUMN IF NOT EXISTS missed_service_policy TEXT NOT NULL DEFAULT 'no_adjustment'`,
  `ALTER TABLE recurring_agreements DROP CONSTRAINT IF EXISTS recurring_agreements_missed_service_policy_check`,
  `ALTER TABLE recurring_agreements ADD CONSTRAINT recurring_agreements_missed_service_policy_check
     CHECK (missed_service_policy IN ('no_adjustment','credit','rollover','manual_review'))`,

  // Optional end date — agreement stops generating periods/occurrences on or after this date
  `ALTER TABLE recurring_agreements ADD COLUMN IF NOT EXISTS end_date DATE`,

  // Expand status to include draft (agreements can be configured before activation)
  `ALTER TABLE recurring_agreements DROP CONSTRAINT IF EXISTS recurring_agreements_status_check`,
  `ALTER TABLE recurring_agreements ADD CONSTRAINT recurring_agreements_status_check
     CHECK (status IN ('draft','active','paused','cancelled','expired'))`,

  // Expand agreement_invoice_periods to track occurrence-level coverage
  `ALTER TABLE agreement_invoice_periods ADD COLUMN IF NOT EXISTS included_occurrence_count INT`,
  `ALTER TABLE agreement_invoice_periods ADD COLUMN IF NOT EXISTS used_occurrence_count INT NOT NULL DEFAULT 0`,
  `ALTER TABLE agreement_invoice_periods ADD COLUMN IF NOT EXISTS plan_amount NUMERIC(10,2)`,
  `ALTER TABLE agreement_invoice_periods DROP CONSTRAINT IF EXISTS agreement_invoice_periods_coverage_status_check`,
  `ALTER TABLE agreement_invoice_periods ADD COLUMN IF NOT EXISTS coverage_status TEXT NOT NULL DEFAULT 'open'`,
  `ALTER TABLE agreement_invoice_periods ADD CONSTRAINT agreement_invoice_periods_coverage_status_check
     CHECK (coverage_status IN ('open','covered','paid_in_advance','overage'))`,

  // ── INVOICE NUMBERING V2 — semantic fix ───────────────────────────────────────
  // next_val now stores the NEXT available number (not the last used).
  // Migration flag makes this update idempotent across server restarts.
  `ALTER TABLE invoice_number_sequences ADD COLUMN IF NOT EXISTS seq_v2_migrated BOOLEAN NOT NULL DEFAULT FALSE`,
  `UPDATE invoice_number_sequences SET next_val = next_val + 1, seq_v2_migrated = TRUE WHERE NOT seq_v2_migrated`,

  // ── INVOICE NUMBERING V3 — canonical seed + uniqueness ───────────────────────
  // For accounts that have numbered invoices but no sequence row yet,
  // seed next_val from MAX(invoice_number)+1 so no number is ever reused.
  `INSERT INTO invoice_number_sequences (account_id, next_val, starting_number, seq_v2_migrated)
   SELECT
     i.account_id,
     MAX(i.invoice_number) + 1,
     COALESCE(
       (SELECT bs.invoice_starting_number
          FROM booking_settings bs
         WHERE bs.account_id = i.account_id),
       1001
     ),
     TRUE
   FROM invoices i
   WHERE i.invoice_number IS NOT NULL
   GROUP BY i.account_id
   ON CONFLICT (account_id) DO NOTHING`,

  // Prevent duplicate customer-facing numbers per account.
  `CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoice_number_per_account
     ON invoices (account_id, invoice_number)
     WHERE invoice_number IS NOT NULL`,

  // ── INVOICE STARTING NUMBER — default 0 ──────────────────────────────────────
  // New entities should start at #0, not #1001 (an arbitrary hardcoded assumption).
  `ALTER TABLE booking_settings ALTER COLUMN invoice_starting_number SET DEFAULT 0`,
  `ALTER TABLE invoice_number_sequences ALTER COLUMN starting_number SET DEFAULT 0`,

  // Reset entities that have the old default (1001) and have never used the sequence.
  // Entities with real invoice sequences are left untouched (ON CONFLICT protects them
  // indirectly; they have sequence rows or numbered invoices, excluded below).
  `UPDATE booking_settings
   SET invoice_starting_number = 0
   WHERE invoice_starting_number = 1001
     AND account_id NOT IN (SELECT account_id FROM invoice_number_sequences)
     AND account_id NOT IN (
       SELECT DISTINCT account_id FROM invoices WHERE invoice_number IS NOT NULL
     )`,

  // ── RECURRING AGREEMENT V2 — COMPLETION PASS ─────────────────────────────────

  // Preferred weekday for weekly/biweekly recurrence (0=Sun … 6=Sat)
  `ALTER TABLE recurring_agreements ADD COLUMN IF NOT EXISTS preferred_weekday INT`,
  `ALTER TABLE recurring_agreements DROP CONSTRAINT IF EXISTS recurring_agreements_preferred_weekday_check`,
  `ALTER TABLE recurring_agreements ADD CONSTRAINT recurring_agreements_preferred_weekday_check
     CHECK (preferred_weekday IS NULL OR preferred_weekday BETWEEN 0 AND 6)`,

  // Day of month for monthly recurrence (1–31; short months use last day)
  `ALTER TABLE recurring_agreements ADD COLUMN IF NOT EXISTS service_day_of_month INT`,
  `ALTER TABLE recurring_agreements DROP CONSTRAINT IF EXISTS recurring_agreements_service_dom_check`,
  `ALTER TABLE recurring_agreements ADD CONSTRAINT recurring_agreements_service_dom_check
     CHECK (service_day_of_month IS NULL OR service_day_of_month BETWEEN 1 AND 31)`,

  // End conditions beyond simple end_date
  `ALTER TABLE recurring_agreements ADD COLUMN IF NOT EXISTS end_after_occurrences INT`,
  `ALTER TABLE recurring_agreements ADD COLUMN IF NOT EXISTS end_after_periods INT`,

  // How billing is collected
  `ALTER TABLE recurring_agreements ADD COLUMN IF NOT EXISTS payment_behavior TEXT NOT NULL DEFAULT 'send_invoice'`,
  `ALTER TABLE recurring_agreements DROP CONSTRAINT IF EXISTS recurring_agreements_payment_behavior_check`,
  `ALTER TABLE recurring_agreements ADD CONSTRAINT recurring_agreements_payment_behavior_check
     CHECK (payment_behavior IN ('send_invoice','create_only','auto_charge_card','auto_charge_ach'))`,

  // Price per extra visit beyond included_services_per_period
  `ALTER TABLE recurring_agreements ADD COLUMN IF NOT EXISTS additional_service_price NUMERIC(10,2)`,

  // Agreement-level discount
  `ALTER TABLE recurring_agreements ADD COLUMN IF NOT EXISTS discount_type TEXT NOT NULL DEFAULT 'none'`,
  `ALTER TABLE recurring_agreements DROP CONSTRAINT IF EXISTS recurring_agreements_discount_type_check`,
  `ALTER TABLE recurring_agreements ADD CONSTRAINT recurring_agreements_discount_type_check
     CHECK (discount_type IN ('none','percent','fixed'))`,
  `ALTER TABLE recurring_agreements ADD COLUMN IF NOT EXISTS discount_value NUMERIC(10,2)`,
  `ALTER TABLE recurring_agreements ADD COLUMN IF NOT EXISTS discount_name TEXT`,

  // Taxability (inherits account tax rate from booking_settings)
  `ALTER TABLE recurring_agreements ADD COLUMN IF NOT EXISTS taxable BOOLEAN NOT NULL DEFAULT FALSE`,

  // Days-before-first-service billing trigger
  `ALTER TABLE recurring_agreements ADD COLUMN IF NOT EXISTS days_before_service INT`,

  // Service catalog link (nullable — custom services have no service_id)
  `ALTER TABLE recurring_agreements ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES service_templates(id) ON DELETE SET NULL`,

  // Custom billing cadence interval in months
  `ALTER TABLE recurring_agreements ADD COLUMN IF NOT EXISTS billing_interval_months INT`,

  // Expand billing_trigger to include days_before_first_service
  `ALTER TABLE recurring_agreements DROP CONSTRAINT IF EXISTS recurring_agreements_billing_trigger_check`,
  `ALTER TABLE recurring_agreements ADD CONSTRAINT recurring_agreements_billing_trigger_check
     CHECK (billing_trigger IN ('every_service','first_scheduled','first_completed',
                                'first_day','specific_day','days_before_first_service'))`,

  // Expand billing_day range to 1–31 (short months use last day of month)
  `ALTER TABLE recurring_agreements DROP CONSTRAINT IF EXISTS recurring_agreements_billing_day_check`,
  `ALTER TABLE recurring_agreements ADD CONSTRAINT recurring_agreements_billing_day_check
     CHECK (billing_day IS NULL OR billing_day BETWEEN 1 AND 31)`,

  // Expand extra_occurrence_policy with new values (max_n kept as legacy alias)
  `ALTER TABLE recurring_agreements DROP CONSTRAINT IF EXISTS recurring_agreements_extra_occurrence_policy_check`,
  `ALTER TABLE recurring_agreements ADD CONSTRAINT recurring_agreements_extra_occurrence_policy_check
     CHECK (extra_occurrence_policy IN
       ('all_included','charge_per_additional','approval_required','no_additional','rollover','manual_review','max_n'))`,

  // Expand missed_service_policy with new values (rollover kept as legacy alias)
  `ALTER TABLE recurring_agreements DROP CONSTRAINT IF EXISTS recurring_agreements_missed_service_policy_check`,
  `ALTER TABLE recurring_agreements ADD CONSTRAINT recurring_agreements_missed_service_policy_check
     CHECK (missed_service_policy IN
       ('no_adjustment','reschedule','carry_forward','credit','forfeited','manual_review','rollover'))`,

  // Decouple period creation from invoice generation: make invoice_id nullable
  `ALTER TABLE agreement_invoice_periods ALTER COLUMN invoice_id DROP NOT NULL`,

  // Enhanced period tracking columns
  `ALTER TABLE agreement_invoice_periods ADD COLUMN IF NOT EXISTS billing_amount_snapshot NUMERIC(10,2)`,
  `ALTER TABLE agreement_invoice_periods ADD COLUMN IF NOT EXISTS discount_amount_snapshot NUMERIC(10,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE agreement_invoice_periods ADD COLUMN IF NOT EXISTS tax_amount_snapshot NUMERIC(10,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE agreement_invoice_periods ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending'`,
  `ALTER TABLE agreement_invoice_periods DROP CONSTRAINT IF EXISTS agreement_invoice_periods_payment_status_check`,
  `ALTER TABLE agreement_invoice_periods ADD CONSTRAINT agreement_invoice_periods_payment_status_check
     CHECK (payment_status IN ('pending','invoiced','paid','failed','waived'))`,
  `ALTER TABLE agreement_invoice_periods ADD COLUMN IF NOT EXISTS extra_service_count INT NOT NULL DEFAULT 0`,

  // Job-level agreement traceability
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS agreement_id UUID REFERENCES recurring_agreements(id) ON DELETE SET NULL`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS agreement_period_id UUID REFERENCES agreement_invoice_periods(id) ON DELETE SET NULL`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS agreement_coverage_status TEXT`,
  `ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_agreement_coverage_status_check`,
  `ALTER TABLE jobs ADD CONSTRAINT jobs_agreement_coverage_status_check
     CHECK (agreement_coverage_status IS NULL OR
            agreement_coverage_status IN ('covered','extra','pending_coverage'))`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_agreement ON jobs(agreement_id) WHERE agreement_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_agreement_period ON jobs(agreement_period_id) WHERE agreement_period_id IS NOT NULL`,

  // Invoice traceability: link invoices to agreement billing periods
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS agreement_period_id UUID REFERENCES agreement_invoice_periods(id) ON DELETE SET NULL`,

  // Manual payment recording on invoices
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_method   TEXT`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_note  TEXT`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at       TIMESTAMPTZ`,

  // Client saved payment method display fields (brand/last4 for UI — token stored separately)
  `ALTER TABLE clients ADD COLUMN IF NOT EXISTS payment_method_brand TEXT`,
  `ALTER TABLE clients ADD COLUMN IF NOT EXISTS payment_method_last4 TEXT`,

  // ── RECURRING AGREEMENT V3 — END CONDITIONS ───────────────────────────────────

  // Explicit end-condition type (never inferred — always set on create/patch)
  `ALTER TABLE recurring_agreements ADD COLUMN IF NOT EXISTS end_condition_type TEXT NOT NULL DEFAULT 'none'`,
  `ALTER TABLE recurring_agreements DROP CONSTRAINT IF EXISTS recurring_agreements_end_condition_type_check`,
  `ALTER TABLE recurring_agreements ADD CONSTRAINT recurring_agreements_end_condition_type_check
     CHECK (end_condition_type IN ('none','date','service_count','billing_period_count'))`,

  // Expand status to include 'completed' (distinct from 'expired' which is legacy)
  `ALTER TABLE recurring_agreements DROP CONSTRAINT IF EXISTS recurring_agreements_status_check`,
  `ALTER TABLE recurring_agreements ADD CONSTRAINT recurring_agreements_status_check
     CHECK (status IN ('draft','active','paused','cancelled','expired','completed'))`,

  `CREATE INDEX IF NOT EXISTS idx_recurring_agreements_end_condition
     ON recurring_agreements(end_condition_type) WHERE status = 'active'`,

  // ── PAYMENT WORKSPACE — stored balance + payment allocation tables ─────────
  // Add stored balance column to invoices (NULL = use amount for backward compat)
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS balance NUMERIC(10,2)`,
  // Back-fill: pending invoices get balance = amount, paid invoices get balance = 0
  `UPDATE invoices SET balance = amount WHERE status IN ('pending','failed') AND balance IS NULL`,
  `UPDATE invoices SET balance = 0     WHERE status = 'paid'               AND balance IS NULL`,

  // Canonical payment records (one row per payment event, regardless of method)
  `CREATE TABLE IF NOT EXISTS payments (
     id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id              UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     client_id               UUID NOT NULL REFERENCES clients(id),
     amount                  NUMERIC(10,2) NOT NULL,
     method                  TEXT NOT NULL
                               CHECK (method IN ('CARD','ACH','CASH','CHECK',
                                                 'CASHAPP','PAYPAL','VENMO','ZELLE',
                                                 'EXTERNAL_CARD','EXTERNAL_ACH','OTHER')),
     payment_date            DATE NOT NULL,
     reference               TEXT,
     note                    TEXT,
     provider_transaction_id TEXT,
     created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
     created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_payments_account   ON payments(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_client    ON payments(account_id, client_id)`,

  // Allocation: how a payment is distributed across invoices
  `CREATE TABLE IF NOT EXISTS payment_allocations (
     id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     payment_id  UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
     invoice_id  UUID NOT NULL REFERENCES invoices(id),
     account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     amount      NUMERIC(10,2) NOT NULL,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_payment_alloc_payment ON payment_allocations(payment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payment_alloc_invoice ON payment_allocations(invoice_id)`,
  // Fix missing CASCADE on payment_allocations.account_id (added 2026-08-27)
  `DO $$ BEGIN
     IF EXISTS (
       SELECT 1 FROM information_schema.table_constraints
       WHERE constraint_name = 'payment_allocations_account_id_fkey'
         AND table_name = 'payment_allocations'
     ) THEN
       ALTER TABLE payment_allocations DROP CONSTRAINT payment_allocations_account_id_fkey;
       ALTER TABLE payment_allocations ADD CONSTRAINT payment_allocations_account_id_fkey
         FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
     END IF;
   END $$`,

  // ── RECURRING AGREEMENT V4 — MULTI-SCHEDULE ────────────────────────────────

  // Child table: one row per independent service schedule under an agreement.
  // Multiple schedules under one agreement share one billing relationship.
  `CREATE TABLE IF NOT EXISTS recurring_agreement_schedules (
     id                       UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id               UUID    NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     agreement_id             UUID    NOT NULL REFERENCES recurring_agreements(id) ON DELETE CASCADE,
     service_type             TEXT,
     service_id               UUID    REFERENCES service_templates(id) ON DELETE SET NULL,
     asset_label              TEXT,
     service_address          TEXT,
     cadence                  TEXT    NOT NULL DEFAULT 'monthly'
                                CHECK (cadence IN ('weekly','every_2_weeks','every_3_weeks',
                                                   'every_4_weeks','monthly','quarterly',
                                                   'annual','custom')),
     preferred_weekday        INT     CHECK (preferred_weekday IS NULL OR preferred_weekday BETWEEN 0 AND 6),
     service_day_of_month     INT     CHECK (service_day_of_month IS NULL OR service_day_of_month BETWEEN 1 AND 31),
     service_interval_days    INT,
     started_at               DATE    NOT NULL DEFAULT CURRENT_DATE,
     preferred_start_time     TEXT    DEFAULT '09:00',
     end_condition_type       TEXT    NOT NULL DEFAULT 'none'
                                CHECK (end_condition_type IN ('none','date','service_count')),
     end_date                 DATE,
     end_after_occurrences    INT,
     included_services_per_period INT NOT NULL DEFAULT 1,
     status                   TEXT    NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','paused','completed','cancelled')),
     sort_order               INT     NOT NULL DEFAULT 0,
     created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_agr_schedules_agreement ON recurring_agreement_schedules(agreement_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agr_schedules_account   ON recurring_agreement_schedules(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agr_schedules_status    ON recurring_agreement_schedules(agreement_id, status)`,

  // Add columns that may be missing from earlier versions of this table
  `ALTER TABLE recurring_agreement_schedules ADD COLUMN IF NOT EXISTS asset_label TEXT`,
  `ALTER TABLE recurring_agreement_schedules ADD COLUMN IF NOT EXISTS preferred_start_time TEXT DEFAULT '09:00'`,
  `ALTER TABLE recurring_agreement_schedules ADD COLUMN IF NOT EXISTS included_services_per_period INT NOT NULL DEFAULT 1`,
  `ALTER TABLE recurring_agreement_schedules ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0`,
  `ALTER TABLE recurring_agreement_schedules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,

  // Occurrence tracking: idempotently links a schedule occurrence to a calendar job.
  // UNIQUE (schedule_id, occurrence_date) prevents duplicate job generation.
  // Multiple schedule occurrences on the same date share one job_id (grouped appointment).
  `CREATE TABLE IF NOT EXISTS agreement_schedule_occurrences (
     id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     agreement_id   UUID NOT NULL REFERENCES recurring_agreements(id) ON DELETE CASCADE,
     schedule_id    UUID NOT NULL REFERENCES recurring_agreement_schedules(id) ON DELETE CASCADE,
     job_id         UUID REFERENCES jobs(id) ON DELETE SET NULL,
     occurrence_date DATE NOT NULL,
     status         TEXT NOT NULL DEFAULT 'scheduled'
                      CHECK (status IN ('scheduled','complete','cancelled','skipped')),
     created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (schedule_id, occurrence_date)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_agr_occ_job      ON agreement_schedule_occurrences(job_id) WHERE job_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_agr_occ_agreement ON agreement_schedule_occurrences(agreement_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agr_occ_schedule  ON agreement_schedule_occurrences(schedule_id)`,

  // Link jobs back to the specific schedule that generated them.
  // NULL for grouped jobs (multiple schedules map to one job — use agreement_schedule_occurrences).
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS agreement_schedule_id UUID REFERENCES recurring_agreement_schedules(id) ON DELETE SET NULL`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_agr_schedule ON jobs(agreement_schedule_id) WHERE agreement_schedule_id IS NOT NULL`,

  // Backfill: create one schedule record per existing agreement (idempotent).
  // Existing agreements transparently become "agreement with one service schedule".
  `INSERT INTO recurring_agreement_schedules
     (account_id, agreement_id, service_type, service_id, service_address,
      cadence, preferred_weekday, service_day_of_month, service_interval_days,
      started_at, included_services_per_period, status)
   SELECT
     ra.account_id, ra.id,
     ra.service_type, ra.service_id, ra.service_address,
     ra.cadence, ra.preferred_weekday, ra.service_day_of_month, ra.service_interval_days,
     COALESCE(ra.started_at, CURRENT_DATE),
     COALESCE(ra.included_services_per_period, 1),
     CASE WHEN ra.status IN ('paused','cancelled','expired','completed') THEN 'paused' ELSE 'active' END
   FROM recurring_agreements ra
   WHERE NOT EXISTS (
     SELECT 1 FROM recurring_agreement_schedules s WHERE s.agreement_id = ra.id
   )`,

  // ── CLIENT LOCATIONS V1 ───────────────────────────────────────────────────────
  // Multi-location support: each client can have named service locations.
  // Jobs reference a canonical location_id for same-day grouping and dedup.
  `CREATE TABLE IF NOT EXISTS client_locations (
     id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id          UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     client_id           UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
     label               TEXT        NOT NULL DEFAULT 'Service Location',
     address             TEXT,
     city                TEXT,
     state               TEXT,
     zip                 TEXT,
     country             TEXT,
     lat                 NUMERIC(10,6),
     lng                 NUMERIC(10,6),
     place_id            TEXT,
     formatted_address   TEXT,
     access_instructions TEXT,
     is_primary          BOOLEAN     NOT NULL DEFAULT false,
     created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_client_locations_client  ON client_locations(client_id)`,
  `CREATE INDEX IF NOT EXISTS idx_client_locations_account ON client_locations(account_id, client_id)`,

  // Backfill: seed primary location from each client's existing address (idempotent)
  `INSERT INTO client_locations
     (account_id, client_id, label, address, city, state, zip, lat, lng, is_primary)
   SELECT c.account_id, c.id, 'Primary', c.address, c.city, c.state, c.zip, c.lat, c.lng, true
   FROM clients c
   WHERE c.address IS NOT NULL AND c.address != ''
     AND NOT EXISTS (SELECT 1 FROM client_locations cl WHERE cl.client_id = c.id)`,

  // Link jobs to canonical service location (nullable — existing jobs unchanged)
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES client_locations(id) ON DELETE SET NULL`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_location ON jobs(location_id) WHERE location_id IS NOT NULL`,

  // ── JOB SERVICES V1 ──────────────────────────────────────────────────────────
  // Multi-service line items per job. Each line can specify the service performed,
  // the asset/target being serviced, duration, and operational notes for the technician.
  `CREATE TABLE IF NOT EXISTS job_services (
     id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
     job_id           UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
     account_id       UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     service_name     TEXT        NOT NULL,
     description      TEXT,
     asset_label      TEXT,
     quantity         NUMERIC     NOT NULL DEFAULT 1,
     duration_minutes INTEGER,
     price_cents      INTEGER,
     service_notes    TEXT,
     sort_order       INTEGER     NOT NULL DEFAULT 0,
     is_complete      BOOLEAN     NOT NULL DEFAULT false,
     completed_at     TIMESTAMPTZ,
     created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_job_services_job_id     ON job_services(job_id)`,
  `CREATE INDEX IF NOT EXISTS idx_job_services_account_id ON job_services(account_id)`,

  // Operational instructions field: tech-visible notes for performing the job.
  // Separate from admin-only internal notes (jobs.notes).
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS instructions TEXT`,

  // Duration columns — canonical scheduled duration in minutes for sessions and recurring schedules.
  `ALTER TABLE job_sessions ADD COLUMN IF NOT EXISTS duration_minutes INTEGER`,
  `ALTER TABLE recurring_agreement_schedules ADD COLUMN IF NOT EXISTS duration_minutes INTEGER`,

  // ── JOB SERVICES — Agreement schedule traceability ────────────────────────────
  // Links each service line item to the recurring agreement schedule that generated it.
  // Enables idempotent job_services inserts in agreementScheduler (ON CONFLICT DO NOTHING).
  `ALTER TABLE job_services ADD COLUMN IF NOT EXISTS agreement_schedule_id UUID REFERENCES recurring_agreement_schedules(id) ON DELETE SET NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_job_services_schedule_job
     ON job_services(job_id, agreement_schedule_id)
     WHERE agreement_schedule_id IS NOT NULL`,

  // ── VISIT GROUPING V1 ────────────────────────────────────────────────────────
  // Canonical location reference on recurring schedules.
  // Preferred over fragile address-string comparison for same-day visit grouping.
  // When set, the scheduler uses loc:{location_id} as the grouping key instead of
  // normalizing the service_address string. Schedules sharing the same location_id
  // on the same date (and with compatible times) share one Calendar appointment.
  `ALTER TABLE recurring_agreement_schedules ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES client_locations(id) ON DELETE SET NULL`,
  `CREATE INDEX IF NOT EXISTS idx_agr_schedules_location ON recurring_agreement_schedules(location_id) WHERE location_id IS NOT NULL`,

  // ── DELETE JOB / VISIT SUPPRESSION V1 ────────────────────────────────────────
  // Soft-delete: deleted jobs are hidden from all active views without destroying
  // referential integrity (invoices, job_services, occurrences all remain intact
  // for audit purposes).
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL`,
  // Occurrence suppression: when a recurring visit is deleted, its occurrence rows
  // are marked with deleted_at so the scheduler does not recreate that appointment
  // on its next run.
  `ALTER TABLE agreement_schedule_occurrences ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL`,

  // Calendar week start preference per business (0=Sunday, 1=Monday)
  `ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS week_start_day SMALLINT DEFAULT 0`,

  // ── PROJECTS V2 — Enhanced schema ────────────────────────────────────────
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_number INT`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES users(id) ON DELETE SET NULL`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_value INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS billing_model TEXT DEFAULT 'fixed'
     CHECK (billing_model IN ('fixed','time_materials','cost_plus'))`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS service_address TEXT`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS service_city TEXT`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS service_state TEXT`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS service_zip TEXT`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES client_locations(id) ON DELETE SET NULL`,

  // Atomic PRJ-XXXX number generator (one row per account)
  `CREATE TABLE IF NOT EXISTS project_number_sequences (
     account_id  UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
     last_number INT NOT NULL DEFAULT 0
   )`,

  // Work Orders = Jobs with project_id (Calendar/Dispatch integration is automatic)
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_project_id ON jobs(project_id) WHERE project_id IS NOT NULL`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS work_order_number INT`,

  // Per-project WO-NNN number generator (one row per project)
  `CREATE TABLE IF NOT EXISTS work_order_number_sequences (
     project_id  UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
     last_number INT NOT NULL DEFAULT 0
   )`,

  // Work order task checklists
  `CREATE TABLE IF NOT EXISTS work_order_tasks (
     id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id   UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     job_id       UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
     title        TEXT        NOT NULL,
     is_complete  BOOLEAN     NOT NULL DEFAULT false,
     completed_at TIMESTAMPTZ,
     completed_by UUID        REFERENCES users(id) ON DELETE SET NULL,
     sort_order   INT         NOT NULL DEFAULT 0,
     created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_work_order_tasks_job     ON work_order_tasks(job_id)`,
  `CREATE INDEX IF NOT EXISTS idx_work_order_tasks_account ON work_order_tasks(account_id)`,

  // Materials and expenses per project (optionally linked to a specific work order)
  `CREATE TABLE IF NOT EXISTS work_order_materials (
     id          UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id  UUID           NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     project_id  UUID           NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     job_id      UUID           REFERENCES jobs(id) ON DELETE SET NULL,
     name        TEXT           NOT NULL,
     quantity    NUMERIC(10,3)  NOT NULL DEFAULT 1,
     unit        TEXT           DEFAULT 'each',
     cost_cents  INT            NOT NULL DEFAULT 0,
     price_cents INT            NOT NULL DEFAULT 0,
     created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
     updated_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_wom_project ON work_order_materials(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_wom_account ON work_order_materials(account_id)`,

  // Project activity feed (auto-logged events + manual notes)
  `CREATE TABLE IF NOT EXISTS project_activity (
     id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
     account_id UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     user_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
     type       TEXT        NOT NULL DEFAULT 'note',
     body       TEXT        NOT NULL,
     metadata   JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_project_activity_project ON project_activity(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_project_activity_account ON project_activity(account_id)`,

  // Link invoices to projects
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_project_id ON invoices(project_id) WHERE project_id IS NOT NULL`,

  // Work Orders (jobs with project_id) need created_by for audit attribution
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL`,

  // service_type is a standalone-job concept (dispatch category). Work Orders don't have a
  // meaningful service_type — their context comes from the parent project and title.
  // Drop the NOT NULL so WOs can be created without supplying a fake value.
  `ALTER TABLE jobs ALTER COLUMN service_type DROP NOT NULL`,

  // Expand work_order_materials with full lifecycle fields required by the Materials & Expenses spec
  `ALTER TABLE work_order_materials ADD COLUMN IF NOT EXISTS type          TEXT NOT NULL DEFAULT 'material'`,
  `ALTER TABLE work_order_materials ADD COLUMN IF NOT EXISTS description   TEXT`,
  `ALTER TABLE work_order_materials ADD COLUMN IF NOT EXISTS billable      BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE work_order_materials ADD COLUMN IF NOT EXISTS vendor        TEXT`,
  `ALTER TABLE work_order_materials ADD COLUMN IF NOT EXISTS purchase_date DATE`,
  `ALTER TABLE work_order_materials ADD COLUMN IF NOT EXISTS created_by    UUID REFERENCES users(id) ON DELETE SET NULL`,
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
