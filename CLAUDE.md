# CLAUDE.md — FIELDCORE INC.
# Last updated: 2026-08-20

## REAL STACK
Backend:  Express.js in src/ — routes, middleware, services, PostgreSQL pool
Database: PostgreSQL via DATABASE_URL (Railway in production, local port 5433 in dev)
Auth:     JWT Bearer tokens — stored in localStorage as fc_token (NOT a cookie)
Frontend: React + Vite in client/src/ — calls Express API via axios instance (src/api.js)
Mobile:   TechApp.jsx — full-screen React PWA served from same Vite build
Hosting:  Railway (Express backend) + Vercel (React/Vite frontend)

DO NOT USE: Supabase, Supabase auth, Supabase client, @supabase/ssr, @supabase/supabase-js
DO NOT USE: Magic links, Supabase sessions, createClient from Supabase
DO NOT USE: Cookie-based auth — token is localStorage, passed as Bearer in Authorization header

## AUTH FLOW
Login:   POST /api/auth/login → { token, refreshToken, user }
Storage: localStorage.setItem('fc_token', token)
Requests: Authorization: Bearer <token>  (via axios interceptor in client/src/api.js)
Refresh: POST /api/auth/refresh { refreshToken } → { token, user }
Logout:  POST /api/auth/logout → clears localStorage + revokes server session

## KEY EXPRESS ROUTES
POST /api/auth/login         — { email, password } → { token, refreshToken, user }
GET  /api/auth/me            — Bearer token → { user: { id, name, email, role, accountId, accountName, plan } }
POST /api/auth/refresh       — { refreshToken } → { token, user }
POST /api/auth/logout        — revoke session
GET  /api/auth/accounts      — list accounts user can access
POST /api/auth/switch        — switch active account → new token
JWT payload: { userId, accountId, role }

## MULTI-DAY JOBS (added 2026-07-22)
Multi-day jobs use is_multi_day = true on the jobs table.
Child sessions in job_sessions table (one row per workday).
Technicians per session in job_session_techs (many-to-many).
Assets/service items in job_assets.
Key endpoints:
  GET  /api/jobs/sessions              — all sessions for calendar (BEFORE /:id to avoid routing conflict)
  POST /api/jobs/:id/complete          — complete parent job + generate invoice (owner/manager only)
  POST /api/jobs/:id/sessions/:sid/complete — daily closeout (any auth)
  GET  /api/mobile/sessions/today      — tech's sessions for today
  POST /api/mobile/sessions/:sid/checkin
  POST /api/mobile/sessions/:sid/complete

## DOMAIN
getfieldcore.com — production
NEVER use: fieldcore.io or usefieldcore.com

## BRAND COLORS
Navy       #1C2333  — sidebar, headers
Sand       #D6B58A  — CTAs, active states (NOT orange — never substitute)
Slate      #5F667A  — secondary text
Steel      #8A90A2  — placeholders
Off White  #EDEBE7  — page backgrounds
White      #FFFFFF  — text on dark
Light Gray #E6E6E6 — borders

## TYPOGRAPHY
Inter (400/500/700) — all UI text
Syne 800 / Arial Black — FIELDCORE wordmark only (ALL CAPS)
Use ™ always. Never ®.

## FROZEN MODULES — DO NOT MODIFY WITHOUT EXPLICIT UNFREEZE

### Banking V1 — FROZEN 2026-08-20
Files under freeze:
  src/routes/banking.js
  src/services/bankingSyncService.js
  src/services/plaidBankingAdapter.js
  src/services/plaidConfig.js
  src/services/financialCoverageService.js  (banking section only)
  src/tests/banking.test.js
  src/db/migrate.js                         (banking tables: bank_connections, bank_accounts,
                                             bank_transactions, bank_balance_snapshots,
                                             bank_sync_cursors, financial_reconciliation_matches)
  client/src/components/revenue/BankingCard.jsx
  client/src/components/revenue/BankBalancesPanel.jsx
  client/src/components/revenue/BankTransactionsPanel.jsx
  client/src/components/revenue/ExternalDepositsPanel.jsx
  client/src/components/revenue/ReconciliationPanel.jsx

Freeze basis: Production QA passed 2026-08-20. 65/65 tests passing. Live on Railway + Vercel.
  - Tartan Bank (Plaid Sandbox) connected, CONNECTED status
  - $44,520.00 cash position across 4 depository accounts
  - 48 transactions synced (48 posted, 0 pending)
  - All 5 capability panels functional (Bank Balances, Cash Transactions, Cash Out,
    External Deposits, Reconciliation)
  - Sync, idempotency, webhook URL, financial coverage all verified in production

DO NOT:
  - Add new Plaid API calls without unfreezing
  - Modify banking DB schema without unfreezing
  - Change reconciliation logic without unfreezing
  - Request Plaid Production credentials (Sandbox only until explicitly unfrozen for production)
  - Add ACH, money movement, bill pay, transfers, lending, or card issuing

SECURITY CONSTRAINTS THAT REMAIN IN EFFECT PERMANENTLY:
  - Never send PLAID_SECRET to frontend
  - Never return access_token to frontend
  - Never exchange public_token in browser
  - Access tokens encrypted at rest (AES-256-GCM)
  - All banking queries filter by account_id from req.accountId (tenant isolation)

### Financials V1 — FROZEN 2026-08-20
Files under freeze:
  src/routes/revenue.js                    (GET /api/revenue/financials and related)
  src/services/financialAnalyticsService.js
  src/services/profitabilityService.js
  src/services/arAgingService.js
  src/services/cashFlowService.js
  src/services/financialCoverageService.js  (non-banking sections)
  client/src/components/revenue/FinancialsWorkspace.jsx

Freeze basis: Production QA passed 2026-08-20. 940/940 frontend tests, 167/167 backend tests
(banking 65/65, dashboard 102/102). Live on Railway + Vercel.
  - Coverage: COMPLETE (Core + Payments + QuickBooks + Banking all active)
  - Gross Revenue sourced from completed jobs (scheduled_at); QB provides P&L/COGS/OpEx
  - AR from pending invoices (point-in-time); Cash In from paid invoices + collected deposits
  - Net Profit: -$53.99 verified against production (OpEx from QB, no August revenue in test account)
  - Account Mapping Complete banner: transition-only (prevUnmappedRef), fades 4s, removed 5s
  - FieldCore Payments: Manage-only (no Sync Now, no Disconnect — native built-in source)
  - Banking V1 and QuickBooks V1 frozen architecture unchanged

Approved architectural decisions:
  - Financial Coverage: COMPLETE is data-driven (available+partial/total >= 1.0), not hardcoded
  - FieldCore Payments is a native financial source (always active, not an OAuth integration)
  - FieldCore Payments: Manage button only — no Sync Now, no Disconnect
  - Account Mapping Complete: transition-only, auto-hides after 5s (4s opacity fade, 5s DOM remove)
  - KPI source precedence: jobs table (Gross Revenue) > QB sync (P&L/OpEx/COGS) > invoices+deposits (Cash In)
  - Gross Margin and Net Margin correctly show unavailable when Gross Revenue = 0 (divide-by-zero guard)
  - All SQL queries filter by account_id = req.accountId from JWT middleware (never client-supplied)

DO NOT:
  - Modify Financials V1 calculations, source precedence, or approved behavior during unrelated work
  - Change FieldCore Payments to show Sync Now or Disconnect
  - Make Account Mapping Complete banner permanent
  - Alter KPI formulas without explicit Financials V2 approval
  - Modify frozen backend services without unfreezing

Modifications to frozen Financials code are permitted only for:
  - Confirmed bugs
  - Security issues
  - Required dependency or platform changes
  - Explicitly approved Financials V2 work

## CODING RULES
- Money: integer cents. 4999 = $49.99. Never float.
- All data from Express API — inline styles in React components, className for CSS modules
- API responses: { error: string } on failure, data object on success
- Tenant isolation: every query filters by account_id from req.accountId (never from client)
- requireAuth middleware sets req.userId, req.accountId, req.userRole on every protected route
- requireRole('owner','manager') for write operations; techs get read-only or session-specific writes
