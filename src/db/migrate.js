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
