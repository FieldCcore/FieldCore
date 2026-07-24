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
