-- FieldCore Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- One row per operator business (tenant)
CREATE TABLE IF NOT EXISTS accounts (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name               TEXT NOT NULL,
  plan               TEXT NOT NULL DEFAULT 'starter',
  stripe_customer_id TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- All team members: owner, manager, tech
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'tech')),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT,
  password_hash TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, email)
);

-- Client database
CREATE TABLE IF NOT EXISTS clients (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  address      TEXT,
  tier                     TEXT DEFAULT 'standard',
  ltv                      NUMERIC(10,2) DEFAULT 0,
  card_on_file             BOOLEAN DEFAULT FALSE,
  stripe_customer_id       TEXT,
  stripe_payment_method_id TEXT,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- All jobs
CREATE TABLE IF NOT EXISTS jobs (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id         UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  client_id          UUID NOT NULL REFERENCES clients(id),
  tech_id            UUID REFERENCES users(id),
  service_type       TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'scheduled'
                       CHECK (status IN ('scheduled','in_progress','complete','cancelled')),
  scheduled_at       TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  amount             NUMERIC(10,2),
  notes              TEXT,
  recurring          TEXT NOT NULL DEFAULT 'none'
                       CHECK (recurring IN ('none','weekly','biweekly','monthly')),
  confirmation_sent  BOOLEAN DEFAULT FALSE,
  reminder_sent      BOOLEAN DEFAULT FALSE,
  checkin_at         TIMESTAMPTZ,
  checkin_lat        NUMERIC(9,6),
  checkin_lng        NUMERIC(9,6),
  noshow_declared_at TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Invoices linked to jobs
CREATE TABLE IF NOT EXISTS invoices (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id               UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  job_id                   UUID NOT NULL REFERENCES jobs(id),
  client_id                UUID NOT NULL REFERENCES clients(id),
  amount                   NUMERIC(10,2) NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','paid','void')),
  stripe_payment_intent_id TEXT,
  payment_link             TEXT,
  sent_at                  TIMESTAMPTZ,
  paid_at                  TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id)
);

-- Deposit tracking
CREATE TABLE IF NOT EXISTS deposits (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id               UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  job_id                   UUID NOT NULL REFERENCES jobs(id),
  client_id                UUID NOT NULL REFERENCES clients(id),
  amount                   NUMERIC(10,2) NOT NULL,
  type                     TEXT NOT NULL DEFAULT 'deposit',
  status                   TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','collected','refunded')),
  stripe_payment_intent_id TEXT,
  stripe_charge_id         TEXT,
  collected_at             TIMESTAMPTZ,
  refunded_at              TIMESTAMPTZ,
  expires_at               TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SMS message history
CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  client_id   UUID REFERENCES clients(id),
  direction   TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  body        TEXT NOT NULL,
  twilio_sid  TEXT,
  status      TEXT DEFAULT 'sent',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fleet vehicles
CREATE TABLE IF NOT EXISTS fleet_vehicles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tech_id     UUID REFERENCES users(id),
  make        TEXT,
  model       TEXT,
  year        INTEGER,
  plate       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Booking widget settings per account
CREATE TABLE IF NOT EXISTS booking_settings (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE UNIQUE,
  services       JSONB NOT NULL DEFAULT '["General Service","Inspection","Maintenance","Repair","Installation"]',
  deposit_amount NUMERIC(10,2) DEFAULT 0,
  agreement_text TEXT DEFAULT 'By booking this appointment, you agree to our service terms and cancellation policy.',
  business_name  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Job photos uploaded via mobile app
CREATE TABLE IF NOT EXISTS job_photos (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id     UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Password reset tokens (expire after 1 hour, deleted on use)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_clients_account   ON clients(account_id);
CREATE INDEX IF NOT EXISTS idx_jobs_account      ON jobs(account_id);
CREATE INDEX IF NOT EXISTS idx_jobs_client       ON jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_tech         ON jobs(tech_id);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled    ON jobs(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_jobs_status       ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_invoices_account  ON invoices(account_id);
CREATE INDEX IF NOT EXISTS idx_invoices_job      ON invoices(job_id);
CREATE INDEX IF NOT EXISTS idx_deposits_account  ON deposits(account_id);
CREATE INDEX IF NOT EXISTS idx_deposits_job      ON deposits(job_id);
CREATE INDEX IF NOT EXISTS idx_messages_account  ON messages(account_id);
CREATE INDEX IF NOT EXISTS idx_messages_client   ON messages(client_id);
CREATE INDEX IF NOT EXISTS idx_job_photos_job    ON job_photos(job_id);
CREATE INDEX IF NOT EXISTS idx_job_photos_acct   ON job_photos(account_id);

-- Multi-entity account membership (Scale+ feature)
CREATE TABLE IF NOT EXISTS account_memberships (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'manager' CHECK (role IN ('owner', 'manager', 'tech')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user    ON account_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_account ON account_memberships(account_id);

-- Migrations: safe to run on existing databases
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  read       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_account ON notifications(account_id);

ALTER TABLE accounts        ADD COLUMN IF NOT EXISTS onboarded BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE accounts        ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE accounts        ADD COLUMN IF NOT EXISTS plan_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE accounts        ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;
ALTER TABLE accounts        ADD COLUMN IF NOT EXISTS stripe_connect_status TEXT NOT NULL DEFAULT 'not_connected';
ALTER TABLE fleet_vehicles  ADD COLUMN IF NOT EXISTS year INTEGER;
ALTER TABLE clients         ADD COLUMN IF NOT EXISTS stripe_customer_id       TEXT;
ALTER TABLE clients         ADD COLUMN IF NOT EXISTS stripe_payment_method_id TEXT;
ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS deposit_rules JSONB NOT NULL DEFAULT '[]';
ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,4) DEFAULT 0;
ALTER TABLE invoices         ADD COLUMN IF NOT EXISTS tax_amount    NUMERIC(10,2) DEFAULT 0;
ALTER TABLE invoices         ADD COLUMN IF NOT EXISTS payment_link  TEXT;
ALTER TABLE invoices         ADD COLUMN IF NOT EXISTS sent_at       TIMESTAMPTZ;
ALTER TABLE job_photos       ADD COLUMN IF NOT EXISTS filename TEXT;

-- Beta signup tracking (100-slot cap, then waitlist)
CREATE TABLE IF NOT EXISTS beta_signups (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  company     TEXT,
  spot_number INTEGER,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','waitlist')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_beta_email ON beta_signups(email);

-- Business profile (one row per account)
CREATE TABLE IF NOT EXISTS business_profiles (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE UNIQUE,
  business_name TEXT,
  phone        TEXT,
  address      TEXT,
  city         TEXT,
  state        TEXT,
  zip          TEXT,
  website      TEXT,
  description  TEXT,
  timezone     TEXT NOT NULL DEFAULT 'America/New_York',
  vertical     TEXT,
  logo_url     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Weekly hours (one row per day per account, day 0=Sun … 6=Sat)
CREATE TABLE IF NOT EXISTS business_hours (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time   TIME,
  close_time  TIME,
  is_closed   BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (account_id, day_of_week)
);

-- Holiday / emergency closures
CREATE TABLE IF NOT EXISTS holiday_closures (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  closure_date DATE NOT NULL,
  name         TEXT NOT NULL,
  is_emergency BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_closures_account ON holiday_closures(account_id);

-- Service duration/price templates
CREATE TABLE IF NOT EXISTS service_templates (
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
);
CREATE INDEX IF NOT EXISTS idx_svc_templates_account ON service_templates(account_id);

-- Client portal magic-link tokens
CREATE TABLE IF NOT EXISTS client_portal_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portal_tokens_hash ON client_portal_tokens(token_hash);

-- Partner applications
CREATE TABLE IF NOT EXISTS partner_applications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  company     TEXT,
  website     TEXT,
  type        TEXT NOT NULL DEFAULT 'Referral Partner',
  notes       TEXT,
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','approved','rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_partner_apps_email ON partner_applications(email);

-- 1099 / contractor settings on users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_contractor       BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tax_classification  TEXT DEFAULT 'employee';
ALTER TABLE users ADD COLUMN IF NOT EXISTS contractor_tax_id   TEXT;

-- EIN on business profiles
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS ein TEXT;
