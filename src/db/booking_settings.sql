CREATE TABLE IF NOT EXISTS booking_settings (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE UNIQUE,
  services       JSONB NOT NULL DEFAULT '["General Service","Inspection","Maintenance","Repair","Installation"]',
  deposit_amount NUMERIC(10,2) DEFAULT 0,
  agreement_text TEXT DEFAULT 'By booking this appointment, you agree to our service terms and cancellation policy.',
  business_name  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO booking_settings (account_id, business_name)
  VALUES ('00000000-0000-0000-0000-000000000001', 'Demo Company')
  ON CONFLICT DO NOTHING;
