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

-- Migrations: safe to run on existing databases
ALTER TABLE clients ADD COLUMN IF NOT EXISTS stripe_customer_id       TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS stripe_payment_method_id TEXT;
