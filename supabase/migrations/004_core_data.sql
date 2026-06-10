CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  notes TEXT,
  segment TEXT CHECK (segment IN ('residential','commercial','fleet','vip')),
  sms_consent BOOLEAN NOT NULL DEFAULT false,
  sms_consent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('draft','scheduled','en_route','in_progress','complete','canceled','no_show')),
  job_type TEXT NOT NULL DEFAULT 'one_time'
    CHECK (job_type IN ('one_time','recurring')),
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  tech_id UUID REFERENCES profiles(id),
  deposit_id UUID,
  address TEXT,
  total_amount INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  job_id UUID REFERENCES jobs(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','paid','overdue','void')),
  subtotal INTEGER NOT NULL DEFAULT 0,
  deposit_deducted BOOLEAN NOT NULL DEFAULT false,
  deposit_deducted_amount INTEGER NOT NULL DEFAULT 0,
  total_due INTEGER NOT NULL DEFAULT 0,
  stripe_invoice_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT UNIQUE,
  due_date DATE,
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_org" ON clients
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "jobs_org" ON jobs
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "invoices_org" ON invoices
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX idx_clients_org ON clients(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_jobs_org ON jobs(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_jobs_status ON jobs(organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_org ON invoices(organization_id, status);

CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_jobs_updated_at
  BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
