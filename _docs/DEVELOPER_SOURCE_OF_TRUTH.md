# DEVELOPER_SOURCE_OF_TRUTH.md
# FIELDCORE INC. — PRIMARY DEVELOPER REFERENCE
# Version: 3.0 — June 10, 2026
# This is the single source of truth for all Claude Code sessions.

## STACK
Next.js 14 App Router | TypeScript strict | Tailwind CSS | shadcn/ui
Supabase (PostgreSQL + RLS + Auth) | Stripe Checkout | Resend + React Email
Twilio (planned) | Vercel | PostHog | Sentry | npm

## BRAND COLORS
--navy:      #1C2333   sidebar, headers
--sand:      #D6B58A   CTAs, active states, TM mark (NOT orange, never substitute)
--slate:     #5F667A   body text
--steel:     #8A90A2   placeholders
--offwhite:  #EDEBE7   backgrounds
--white:     #FFFFFF   text on dark
--lightgray: #E6E6E6   borders

## TYPOGRAPHY
Inter 400/500/700 — all UI (only font)
Syne 800 — wordmark FIELDCORE only
Never use: Epilogue, DM Sans, DM Mono, Geist

## ENTITY SWITCHER — DECISION-051 — NON-NEGOTIABLE
PERMANENTLY VISIBLE in sidebar. Never collapsed. No toggle. No useState open/closed.
Renders below FIELDCORE wordmark, above nav. Always shown even with 1 org.
Active entity: bg-sand/10, text-sand name, sand-tint badge.
Inactive: colored dot, text-white/60, bg-white/[0.06] badge.
Divider h-px bg-white/[0.06] below entity block, above nav.

## DATABASE MIGRATIONS (create all in supabase/migrations/)

### 001_auth_schema.sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  plan_tier TEXT NOT NULL DEFAULT 'starter' CHECK (plan_tier IN ('starter','pro','scale','scale_plus')),
  vertical TEXT,
  team_size TEXT CHECK (team_size IN ('1','2-5','6-15','15+')),
  stripe_customer_id TEXT UNIQUE,
  color TEXT DEFAULT '#D6B58A',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  organization_id UUID REFERENCES organizations(id),
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member','technician')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_self_access" ON organizations USING (id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "profile_org_access" ON profiles USING (id = auth.uid() OR organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

### 002_subscriptions.sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  plan_tier TEXT NOT NULL CHECK (plan_tier IN ('starter','pro','scale','scale_plus')),
  status TEXT NOT NULL CHECK (status IN ('active','past_due','canceled','trialing','incomplete')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sub_org_read" ON subscriptions USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

### 003_invites.sql
CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member','technician')),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '48 hours'),
  invited_by_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invite_org_read" ON invites USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

### 004_core_data.sql
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL, email TEXT, phone TEXT, address TEXT,
  city TEXT, state TEXT, zip TEXT, notes TEXT,
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
  title TEXT NOT NULL, description TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('draft','scheduled','en_route','in_progress','complete','canceled','no_show')),
  job_type TEXT NOT NULL DEFAULT 'one_time' CHECK (job_type IN ('one_time','recurring')),
  scheduled_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
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
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','overdue','void')),
  subtotal INTEGER NOT NULL DEFAULT 0,
  deposit_deducted BOOLEAN NOT NULL DEFAULT false,
  deposit_deducted_amount INTEGER NOT NULL DEFAULT 0,
  total_due INTEGER NOT NULL DEFAULT 0,
  stripe_invoice_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT UNIQUE,
  due_date DATE, sent_at TIMESTAMPTZ, paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients_org" ON clients USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "jobs_org" ON jobs USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "invoices_org" ON invoices USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE INDEX idx_clients_org ON clients(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_jobs_org ON jobs(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_jobs_status ON jobs(organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_org ON invoices(organization_id, status);
CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_jobs_updated_at BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

## CODING RULES
- Money: integer cents always. 4999 = $49.99. Never float.
- API routes: requireAuth() first, Zod validate second, business logic third
- Return shape: { data: T } | { error: string }
- Server Components by default. 'use client' only for useState/useEffect/events
- Schema changes: migration files only. Never Supabase Dashboard UI.
- RLS on ALL tables. Never disable.
- Tailwind className in Next.js. Inline styles in Claude artifacts only.

## PLANS
starter $49 | pro $99 | scale $149 | scale_plus $199
Zero per-user fees at any tier.

## USER ROLES
owner | admin | member | technician
Technician: mobile app only, no web dashboard.
