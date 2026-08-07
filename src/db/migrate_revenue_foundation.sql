-- Revenue Foundation Migration
-- Run once. All statements are idempotent (IF NOT EXISTS).

-- ── revenue_policy_settings ──────────────────────────────────────────────────
-- One row per tenant. NULL values = policy not yet configured.
-- NEVER insert default policy values.
CREATE TABLE IF NOT EXISTS revenue_policy_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  entity_id UUID NULL,
  revenue_recognition_policy TEXT CHECK (revenue_recognition_policy IN (
    'completed_job', 'invoice_issued', 'payment_collected', 'configurable_hybrid'
  )),
  technician_attribution_policy TEXT CHECK (technician_attribution_policy IN (
    'primary_only', 'equal_split', 'role_weighted', 'manual', 'none'
  )),
  cost_inclusion_policy TEXT CHECK (cost_inclusion_policy IN (
    'direct_costs_only', 'full_absorption', 'custom'
  )),
  forecasting_policy TEXT CHECK (forecasting_policy IN (
    'rules_based', 'rules_plus_narrative', 'predictive_when_ready'
  )),
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID NULL
);
-- Partial unique indexes: one tenant-level row (entity_id IS NULL), one per entity
CREATE UNIQUE INDEX IF NOT EXISTS revenue_policy_tenant_only
  ON revenue_policy_settings (tenant_id) WHERE entity_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS revenue_policy_tenant_entity
  ON revenue_policy_settings (tenant_id, entity_id) WHERE entity_id IS NOT NULL;

-- ── revenue_ledger_entries ───────────────────────────────────────────────────
-- Immutable financial audit ledger.
-- NEVER UPDATE or DELETE rows. Reversals are new rows referencing reversal_of_entry_id.
CREATE TABLE IF NOT EXISTS revenue_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  entity_id UUID NULL,
  client_id UUID NULL REFERENCES clients(id) ON DELETE SET NULL,
  job_id UUID NULL REFERENCES jobs(id) ON DELETE SET NULL,
  invoice_id UUID NULL REFERENCES invoices(id) ON DELETE SET NULL,
  payment_id UUID NULL,
  deposit_id UUID NULL REFERENCES deposits(id) ON DELETE SET NULL,
  service_type_id UUID NULL,
  team_assignment_id UUID NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'job_value_created', 'invoice_issued', 'payment_collected', 'deposit_collected',
    'refund_issued', 'credit_applied', 'discount_applied', 'tip_collected',
    'tax_collected', 'merchant_fee_recorded', 'writeoff_recorded', 'direct_cost_recorded',
    'revenue_recognized', 'revenue_reversed', 'adjustment_recorded'
  )),
  amount NUMERIC(12,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  occurred_at_utc TIMESTAMPTZ NOT NULL,
  accounting_date DATE NOT NULL,
  source TEXT NOT NULL,
  source_record_id UUID NULL,
  idempotency_key TEXT NOT NULL,
  metadata JSONB NULL,
  reversal_of_entry_id UUID NULL REFERENCES revenue_ledger_entries(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NULL,
  CONSTRAINT revenue_ledger_idempotency UNIQUE (idempotency_key, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_ledger_tenant_period ON revenue_ledger_entries(tenant_id, occurred_at_utc);
CREATE INDEX IF NOT EXISTS idx_ledger_tenant_type ON revenue_ledger_entries(tenant_id, transaction_type);
CREATE INDEX IF NOT EXISTS idx_ledger_job ON revenue_ledger_entries(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_invoice ON revenue_ledger_entries(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_client ON revenue_ledger_entries(client_id) WHERE client_id IS NOT NULL;

-- ── revenue_saved_views ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS revenue_saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  entity_id UUID NULL,
  owner_user_id UUID NOT NULL,
  workspace TEXT NOT NULL CHECK (workspace IN ('overview','financials','operations','customers','forecasting','reports')),
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}',
  columns JSONB NULL,
  sort JSONB NULL,
  grouping JSONB NULL,
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_saved_views_tenant ON revenue_saved_views(tenant_id, workspace);

-- ── revenue_export_jobs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS revenue_export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  entity_id UUID NULL,
  requested_by UUID NOT NULL,
  report_type TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}',
  format TEXT NOT NULL CHECK (format IN ('csv', 'pdf')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  storage_location TEXT NULL,
  expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL,
  failure_code TEXT NULL
);
CREATE INDEX IF NOT EXISTS idx_export_jobs_tenant ON revenue_export_jobs(tenant_id, status);
