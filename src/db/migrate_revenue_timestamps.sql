-- Add payment timestamp columns missing from initial schema.
-- These are already referenced in webhooks.js UPDATE statements.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

ALTER TABLE deposits
  ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_charge_id TEXT;

-- Back-fill: treat any invoice currently marked 'paid' as paid at creation time.
UPDATE invoices SET paid_at = created_at WHERE status = 'paid' AND paid_at IS NULL;

-- Back-fill: treat any deposit currently marked 'collected' as collected at creation time.
UPDATE deposits SET collected_at = created_at WHERE status = 'collected' AND collected_at IS NULL;
