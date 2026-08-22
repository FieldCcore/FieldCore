# CLAUDE.md — FIELDCORE INC.
# Last updated: 2026-08-22

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

### Operations V1 — FROZEN 2026-08-21
Files under freeze:
  src/services/operationsAnalyticsService.js
  src/services/teamPerformanceService.js
  src/services/jobCompletionAnalyticsService.js
  src/services/commissionCalculationService.js
  src/services/upsellAttributionService.js
  src/services/operationsDataQualityService.js
  src/routes/revenue.js                    (GET /api/revenue/operations and all /operations/* sub-routes)
  client/src/components/revenue/OperationsWorkspace.jsx
  client/src/style.css                     (ops-* classes, ops-kpi-*, ops-drawer-*, ops-empty-state,
                                            ops-ws-body, density overrides, hover behavior)

Freeze basis: Production QA passed 2026-08-21. 960/960 frontend tests passing. Live on Railway + Vercel.
  - 6 KPI cards all clickable with correct drill-down drawers
  - Commission Owed KPI and drawer both use pending+approved+payable (parity verified)
  - Completion Rate: completed / (completed+cancelled+no_show) — future jobs excluded
  - Production Value: SUM(jobs.amount WHERE status=complete) — no team-size double-count
  - Team Performance: DISTINCT ON (user_id, job_id) dedup; is_primary=true for revenue attribution
  - Revenue per Labor Hour: scheduled basis, limitation disclosed in UI
  - Upsell Revenue: per-member commissionOwed column in SalesUpsellsSection
  - Revenue by Service: delegates to FROZEN revenueAnalyticsService.getServices()
  - Job Completion: Revenue Impact from cancelled+no_show amounts; cancellation reasons from job_status_history
  - All KPI drawers: OpsJobsDrawer, OpsCommissionDrawer, OpsUpsellKpiDrawer, OpsLaborDrawer,
    OpsCompletionRateDrawer, UpsellMemberDrawer
  - CommissionSection removed from page (drawer-only access via KPI click)
  - CompensationRulesModal removed (link to Settings only)
  - Density: compact empty states, tight KPI grid (12px gap, 12px/14px padding)
  - No gold hover ring on any interactive element; :focus-visible sand ring preserved for keyboard nav

Approved architectural decisions:
  - Progressive disclosure: KPI card click → drawer → data fetched on demand (not pre-loaded)
  - Commission Owed definition: pending + approved + payable (NOT paid)
  - Labor hours basis: scheduled duration (jobs.duration_minutes) — actual time tracking not connected
  - ops-section-group: transparent flex column, each child section on page background
  - ops-table-card: white card (background:#fff; border:1px solid var(--lightgray); border-radius:10px)
  - All ops routes: requireRole('owner','manager') — techs have no access
  - All SQL queries filter by account_id = req.accountId from JWT middleware (never client-supplied)

DO NOT:
  - Add new visible sections to the Operations page without explicit V2 approval
  - Change commission owed definition without unfreezing
  - Modify KPI formulas (completion rate, production value, rev/labor hour) without unfreezing
  - Re-add CommissionSection or CompensationRulesModal to the page
  - Add gold/sand hover borders back to any interactive element
  - Modify ops-* CSS classes without unfreezing

Modifications to frozen Operations code are permitted only for:
  - Confirmed bugs
  - Security issues
  - Required dependency or platform changes
  - Explicitly approved Operations V2 work

### Customers V1 — FROZEN 2026-08-21
Files under freeze:
  src/services/customerAnalyticsService.js
  src/routes/revenue.js                    (GET /api/revenue/customers/overview, customers export)
  src/routes/clients.js                    (GET/POST /api/clients/segments, DELETE /api/clients/segments/:id,
                                            POST/DELETE /api/clients/:id/segments)
  src/routes/business-settings.js          (customer_inactivity_days in PUT /profile)
  src/db/migrate.js                        (customer_inactivity_days, client_segments,
                                            client_segment_assignments tables + indexes)
  src/tests/customers.test.js
  client/src/components/revenue/RevenueWorkspaceShells.jsx  (CustomersWorkspace component)
  client/src/pages/BusinessSettings.jsx    (Customer Policy section)
  client/src/pages/__tests__/Revenue.test.jsx

Freeze basis: Production QA + post-incident smoke test passed 2026-08-21.
681 backend tests, 969 frontend tests, all passing. Live on Railway + Vercel.
Production commit: 72b083c. Post-incident smoke test commit: 96d7743.

Frozen features:
  - Top Clients: period-scoped, earned revenue from complete jobs only, sorted DESC, UUID grouping
  - Customer Lifetime Value (LTV): all-time historical, 6-month eligibility gate
    (span between MIN/MAX of scheduled_at for complete jobs), avg/median revenue per customer,
    avg jobs/customer, avg ticket, top 5 clients by all-time revenue
  - LTV auto-activation: frontend renders live data when eligible:true; LockedSection when not —
    no code deploy needed for activation
  - Customer inactivity policy: customer_inactivity_days on business_profiles (1–3650, validated),
    configurable via BusinessSettings Customer Policy dropdown
  - At-Risk / Churn Detection: snapshot-based (not period-scoped), reads customer_inactivity_days,
    ACTIVE (future scheduled OR last complete ≤threshold days) / AT_RISK (>threshold, ≤2×threshold) /
    INACTIVE (>2×threshold); excludes clients with 0 completed jobs
  - Churn auto-activation: renders live data when configured:true; LockedSection when not
  - Client Segments: CRUD on /api/clients/segments (GET/POST/DELETE); 409 on duplicate name
  - Segment assignments: POST/DELETE /api/clients/:id/segments; idempotent on re-assignment;
    validates segment belongs to same account
  - Segment Analytics: period-scoped revenue/job counts, all-time clientCount;
    non-exclusive multi-tag attribution — revenue counted in each segment independently,
    shares may sum >100%; denominator uses DISTINCT client IN subquery (avoids double-counting
    multi-tag clients)
  - Segment auto-activation: renders table when configured:true and data present;
    "no clients tagged" state when configured but data:null; LockedSection when not configured
  - Customers CSV export: /api/revenue/export?type=customers — top clients + LTV summary if eligible
  - Date-range behavior: top clients and segment revenue are period-scoped;
    LTV and churn are always all-time/snapshot regardless of date filter
  - Tenant / entity isolation: all SQL filters by account_id = req.accountId (never client-supplied);
    all routes requireAuth + requireRole('owner','manager')
  - Approved UI/layout: ops-section-group transparent flex column, ops-table-card white cards,
    LockedSection placeholder, no gold/sand hover borders

PRODUCTION INCIDENT (2026-08-21 — recorded in freeze):
  Root cause: dateFilter string references j.scheduled_at (with j. prefix). The active client count
  query used `FROM jobs WHERE account_id = $1` with no j alias. PostgreSQL threw
  "missing FROM-clause entry for table j" on every request that included start/end params.
  Production always sends date params from the Revenue page URL; tests called the endpoint
  with no params — the bug was invisible to the entire test suite until live production use.
  Fix (commit 72b083c): `FROM jobs j WHERE j.account_id = $1 AND j.status = 'complete'` — one alias.
  Regression test: customers.test.js "returns 200 with start+end date params" now mandates
  date params on every run. Future SQL queries that share a dateFilter must use a table alias
  on every FROM clause in the same Promise.all.

Approved architectural decisions:
  - LTV all-time (not period-scoped) — Revenue page date filter does NOT apply to LTV
  - Churn snapshot (not period-scoped) — always current as-of-today; inactivityDays from DB
  - Segment revenue period-scoped; segment clientCount always all-time membership
  - Segment revenue share denominator: SUM of each DISTINCT tagged client's revenue once
    via IN subquery — never JOIN (JOIN would double-count clients in multiple segments)
  - LTV eligibility gate: 6 months (REQUIRED_HISTORY_MONTHS constant); span is MIN-to-MAX
    of scheduled_at for complete jobs, not account creation date
  - Churn classification: EXTRACT(EPOCH FROM ...) / 86400 integer day comparison
  - LockedSection renders static placeholder when section is not yet activatable (no API data needed)
  - ops-section-group layout (transparent flex column, gap 10px) — same as Operations V1

DO NOT:
  - Change LTV to be period-scoped
  - Change churn to be period-scoped
  - Change segment denominator from IN subquery back to JOIN
  - Add new Customers analytics sections without explicit Customers V2 approval
  - Change the LTV eligibility gate from 6 months
  - Add gold/sand hover borders to any Customers section card
  - Remove conditional rendering (revert to static placeholder copy)
  - Refactor Customers files while working on another Revenue subsection
  - Change the approved date-range behavior (LTV/churn always all-time, segments period-scoped)
  - Modify the Customers API contract (response keys, eligibility flags, error shape)
  - Write new SQL in customers routes that shares a dateFilter without a table alias on FROM

Modifications to frozen Customers code are permitted only for:
  - Confirmed production defects
  - Security or data-integrity issues
  - Required dependency or platform changes
  - Explicitly approved Customers V2 work

## CODING RULES
- Money: integer cents. 4999 = $49.99. Never float.
- All data from Express API — inline styles in React components, className for CSS modules
- API responses: { error: string } on failure, data object on success
- Tenant isolation: every query filters by account_id from req.accountId (never from client)
- requireAuth middleware sets req.userId, req.accountId, req.userRole on every protected route
- requireRole('owner','manager') for write operations; techs get read-only or session-specific writes
