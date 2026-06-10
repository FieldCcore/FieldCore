# FieldCore — File Location Index

**Created:** 2026-06-09  
**Purpose:** Single source of truth for where every important file lives, what it does, and whether it is required for MVP.  
**Rule:** Before creating a new documentation file, check this index to avoid duplicates. After creating, renaming, moving, or significantly updating any file listed here, update the relevant row immediately.

**MVP Required key:** `YES` = blocks first paying customer | `SPRINT` = required to pass pre-launch sprint | `PARTIAL` = some features MVP-required | `NO` = post-launch or optional

---

## How to Use

1. **Finding a file:** Use Ctrl+F on the file name or keyword.
2. **Creating a new doc:** Check Section 1 first. If a doc covering the same topic exists, update it instead.
3. **After any file change:** Update `Date Last Updated` and `Related Files` in the row below.
4. **New files:** Add a row in the appropriate section before the session ends.

---

## Section 1 — Documentation Files (Root Level)

| File | Exact Path | Purpose | Created | Last Updated | Related Files | MVP Required |
|------|-----------|---------|---------|-------------|--------------|-------------|
| `CLAUDE.md` | `/CLAUDE.md` | Primary onboarding for every Claude Code session. Tech stack, repo structure, auth pattern, plan tiers, sprint status. **Read first in every session.** | pre-sprint | 2026-06-09 | All docs | YES |
| `CLAUDE_CODE_ONBOARDING.md` | `/CLAUDE_CODE_ONBOARDING.md` | Developer setup guide and quick-start. Detailed env setup, database init, how to start each app. | pre-sprint | pre-sprint | `CLAUDE.md` | NO |
| `CURRENT_DEVELOPMENT_STATUS.md` | `/CURRENT_DEVELOPMENT_STATUS.md` | High-level snapshot: what fully works, what is partially working, what is not started. Updated after every task. | 2026-06-09 | 2026-06-09 | `FEATURE_INVENTORY.md`, `LAUNCH_BLOCKERS.md` | NO |
| `DEVELOPER_SOURCE_OF_TRUTH.md` | `/DEVELOPER_SOURCE_OF_TRUTH.md` | Authoritative reference for schema, API patterns, route map, all 27 backend routes, database table list. | 2026-06-09 | 2026-06-09 | `src/db/schema.sql` | NO |
| `DEVELOPMENT_GUARDRAILS.md` | `/DEVELOPMENT_GUARDRAILS.md` | Checkpoint template, completion records, sprint log, file/DB/package registries. **Must be updated before and after every task.** | 2026-06-09 | 2026-06-09 | All docs | SPRINT |
| `FEATURE_INVENTORY.md` | `/FEATURE_INVENTORY.md` | Status of every feature (backend/frontend/mobile/DB/integration/production readiness). | 2026-06-09 | 2026-06-09 | `CURRENT_DEVELOPMENT_STATUS.md` | NO |
| `FIELDCORE_DECISIONS_LOG.md` | `/FIELDCORE_DECISIONS_LOG.md` | Log of every significant architectural, business, and scope decision. Prevents relitigating settled questions. | 2026-06-09 | 2026-06-09 | `CLAUDE.md` | NO |
| `FIELDCORE_EXECUTIVE_SUMMARY.md` | `/FIELDCORE_EXECUTIVE_SUMMARY.md` | Business context for non-technical decisions: ICP, revenue model, competitive positioning. | pre-sprint | pre-sprint | `FIELDCORE_MVP_DEFINITION.md` | NO |
| `FIELDCORE_LAUNCH_AUDIT_REPORT.json` | `/FIELDCORE_LAUNCH_AUDIT_REPORT.json` | Pre-existing launch checklist in JSON format. One-time reference artifact. | pre-sprint | pre-sprint | `LAUNCH_BLOCKERS.md` | NO |
| `FIELDCORE_MVP_DEFINITION.md` | `/FIELDCORE_MVP_DEFINITION.md` | Exact scope of what must exist before the first paying customer. Launch Now vs V2 boundary. | 2026-06-09 | 2026-06-09 | `MVP_SCOPE.md`, `LAUNCH_BLOCKERS.md` | YES |
| `FILE_LOCATION_INDEX.md` | `/FILE_LOCATION_INDEX.md` | **This file.** Index of every important file: path, purpose, dates, related files, MVP status. | 2026-06-09 | 2026-06-09 | All files | NO |
| `LAUNCH_BLOCKERS.md` | `/LAUNCH_BLOCKERS.md` | Categorized list of everything blocking launch (CRITICAL / HIGH / MEDIUM). Updated as blockers resolve. | 2026-06-09 | 2026-06-09 | `RELEASE_READINESS_REPORT.md`, `LAUNCH_SPRINT_PLAN.md` | YES |
| `LAUNCH_SPRINT_PLAN.md` | `/LAUNCH_SPRINT_PLAN.md` | 10-task pre-launch sprint with detailed specs, dependency order, effort estimates, risk levels. | 2026-06-09 | 2026-06-09 | `TASK_ACCEPTANCE_CRITERIA.md`, `DEVELOPMENT_GUARDRAILS.md` | SPRINT |
| `MVP_SCOPE.md` | `/MVP_SCOPE.md` | Launch Now vs V2 scope decisions. What is explicitly deferred. | pre-sprint | pre-sprint | `FIELDCORE_MVP_DEFINITION.md` | NO |
| `NEXT_DEVELOPMENT_TASKS.md` | `/NEXT_DEVELOPMENT_TASKS.md` | Post-sprint backlog and pre-launch environment tasks (Stripe setup, Twilio registration, etc.). | 2026-06-09 | 2026-06-09 | `LAUNCH_BLOCKERS.md` | NO |
| `PROJECT_RECONCILIATION_REPORT.md` | `/PROJECT_RECONCILIATION_REPORT.md` | One-time gap analysis comparing codebase reality vs documentation. Historical reference. | 2026-06-09 | 2026-06-09 | `DEVELOPER_SOURCE_OF_TRUTH.md` | NO |
| `RELEASE_READINESS_REPORT.md` | `/RELEASE_READINESS_REPORT.md` | Launch readiness checklist: what's ready, what's blocked by credentials, what could break, what needs testing. | 2026-06-09 | 2026-06-09 | `LAUNCH_BLOCKERS.md`, `FIELDCORE_MVP_DEFINITION.md` | YES |
| `TASK_ACCEPTANCE_CRITERIA.md` | `/TASK_ACCEPTANCE_CRITERIA.md` | Pass/fail acceptance criteria and exact testing steps for all 10 sprint tasks. | 2026-06-09 | 2026-06-09 | `LAUNCH_SPRINT_PLAN.md` | SPRINT |
| `TECHNICAL_DEBT_REPORT.md` | `/TECHNICAL_DEBT_REPORT.md` | Known technical debt by severity (CRITICAL/HIGH/MEDIUM/LOW). Updated as debt is added or resolved. | 2026-06-09 | 2026-06-09 | `LAUNCH_BLOCKERS.md` | NO |

---

## Section 2 — Backend: Core Files

| File | Exact Path | Purpose | Created | Last Updated | Related Files | MVP Required |
|------|-----------|---------|---------|-------------|--------------|-------------|
| `server.js` | `/server.js` | Backend entry point. Runs migrations, starts Express, starts cron scheduler. | pre-sprint | pre-sprint | `src/app.js`, `src/db/migrate.js`, `src/services/scheduler.js` | YES |
| `app.js` | `/src/app.js` | Express app: helmet, CORS (env-driven), rate limiters, body parsers, route mounting, health endpoint, error handler. | pre-sprint | 2026-06-09 | `server.js`, all route files | YES |
| `package.json` | `/package.json` | Backend Node.js dependencies and scripts. | pre-sprint | pre-sprint | `package-lock.json` | YES |
| `.env.example` | `/.env.example` | Template for all required environment variables. **Never commit `.env`.** | pre-sprint | 2026-06-09 | `.env` (gitignored) | YES |
| `nixpacks.toml` | `/nixpacks.toml` | Railway build configuration (Node version, build/start commands). | pre-sprint | pre-sprint | `railway.json` | YES |
| `railway.json` | `/railway.json` | Railway project metadata and deploy config. | pre-sprint | pre-sprint | `nixpacks.toml` | YES |
| `reset_plan.js` | `/reset_plan.js` | Utility script: resets an account's plan to starter. Run manually, not on start. | pre-sprint | pre-sprint | `src/db/pool.js` | NO |

---

## Section 3 — Backend: Routes (27 files)

All route files live in `/src/routes/`. All authenticated routes use `requireAuth` from `src/middleware/auth.js`. All business-data queries scope to `req.accountId`.

| File | Mount Path | Purpose | MVP Required |
|------|-----------|---------|-------------|
| `auth.js` | `/api/auth` | Signup, login, token refresh, logout, forgot/reset password, brute-force protection | YES |
| `jobs.js` | `/api/jobs` | Job CRUD, status updates, confirmation SMS, no-show marking, recurring jobs, GPS, signatures | YES |
| `clients.js` | `/api/clients` | Client CRUD, search, job/SMS history, Stripe customer linking | YES |
| `invoices.js` | `/api/invoices` | Invoice generation, list, PDF export, payment links, email delivery | YES |
| `deposits.js` | `/api/deposits` | Deposit tracking, collection, refunds, expiry | YES |
| `payments.js` | `/api/payments` | Charge card on file, save card, payment intents | YES |
| `billing.js` | `/api/billing` | Subscription management, plan upgrade/downgrade, Stripe billing portal | YES |
| `webhooks.js` | `/api/webhooks` | Stripe event handler (raw body), Twilio SMS/voice/recording callbacks, Sendblue callbacks | YES |
| `booking.js` | `/api/booking` + `/api/booking-settings` | Public booking widget (services, availability, submit) + admin settings | YES |
| `business-settings.js` | `/api/business-settings` | Business profile, operating hours, holiday closures, logo upload | YES |
| `mobile.js` | `/api/mobile` | Mobile-specific: GPS check-in, job photo upload, push token | YES |
| `sms.js` | `/api/sms` | Send SMS, message history | PARTIAL |
| `notifications.js` | `/api/notifications` | In-app notification list, mark read, clear all | YES |
| `onboarding.js` | `/api/onboarding` | Account setup wizard steps | YES |
| `pay.js` | `/api/pay` | Public payment page (unauthenticated, invoice-token scoped) | YES |
| `users.js` | `/api/users` | Team member CRUD, role assignment, memberships | YES |
| `analytics.js` | `/api/analytics` | Revenue metrics, job counts, trends dashboard | YES |
| `chat.js` | `/api/chat` | AI assistant (Anthropic SDK) | PARTIAL |
| `portal.js` | `/api/portal` | Client portal (magic-link auth, job status view) | PARTIAL |
| `noshow.js` | `/api/no-show` | No-show settings, grace period, deposit retention | YES |
| `estimates.js` | `/api/estimates` | Service estimates, e-signature workflow | PARTIAL |
| `reviews.js` | `/api/reviews` | Post-job review submission and retrieval | NO |
| `entities.js` | `/api/entities` | Multi-entity management (Scale+ only) | NO |
| `connect.js` | `/api/connect` | Stripe Connect contractor payouts (deferred to V2) | NO |
| `phone.js` | `/api/phone` | Voice call logs, voicemail, number provisioning | NO |
| `push-tokens.js` | `/api/push-tokens` | Expo push notification token registration | YES |
| `fleet.js` | `/api/fleet` | Fleet vehicle CRUD | NO |
| `contact.js` | `/api/contact` | Public contact form submissions | NO |
| `beta.js` | `/api/beta` | Beta signup (100-slot cap + waitlist) | NO |

---

## Section 4 — Backend: Middleware

| File | Exact Path | Purpose | Created | Last Updated | Related Files | MVP Required |
|------|-----------|---------|---------|-------------|--------------|-------------|
| `auth.js` | `/src/middleware/auth.js` | `requireAuth()` — JWT verification, injects `req.userId`, `req.accountId`, `req.userRole`. `requireRole()` — role enforcement. | pre-sprint | pre-sprint | `src/routes/*.js` (all authenticated routes) | YES |
| `planLimits.js` | `/src/middleware/planLimits.js` | `checkUserLimit()`, `checkJobLimit()`, `checkSmsAccess()`. Enforces per-plan feature gates. **Note: uses `starter/growth/scale` names — billing.js uses `solo/pro/scale`. Must reconcile before billing goes live.** | pre-sprint | pre-sprint | `src/routes/users.js`, `src/routes/jobs.js`, `src/routes/sms.js` | YES |

---

## Section 5 — Backend: Services

| File | Exact Path | Purpose | Created | Last Updated | Related Files | MVP Required |
|------|-----------|---------|---------|-------------|--------------|-------------|
| `email.js` | `/src/services/email.js` | Nodemailer SMTP wrapper. Sends all transactional email: job confirmation, invoice, password reset, billing receipt, review request, portal magic-link. | pre-sprint | pre-sprint | `.env` (`SMTP_*`, `FROM_EMAIL`, `APP_URL`) | YES |
| `sms.js` | `/src/services/sms.js` | Twilio SMS service. Sends job confirmations, reminders, no-show notifications. Gated by `SMS_ENABLED` env var. | pre-sprint | pre-sprint | `.env` (`TWILIO_*`, `SMS_ENABLED`, `MESSAGING_PROVIDER`) | PARTIAL |
| `sendblue.js` | `/src/services/sendblue.js` | Sendblue iMessage/RCS alternative provider. Activated via `MESSAGING_PROVIDER=sendblue`. | pre-sprint | pre-sprint | `.env` (`SENDBLUE_*`), `sms.js` | NO |
| `scheduler.js` | `/src/services/scheduler.js` | node-cron jobs: 24h job reminder SMS, deposit expiry alerts. Runs on server start via `server.js`. | pre-sprint | pre-sprint | `sms.js`, `email.js`, `src/db/pool.js` | YES |
| `notify.js` | `/src/services/notify.js` | In-app notification dispatch. Creates rows in `notifications` table. | pre-sprint | pre-sprint | `src/routes/notifications.js`, `src/db/pool.js` | YES |
| `audit.js` | `/src/services/audit.js` | Security audit log writer. Records sensitive actions to `audit_logs` table. | pre-sprint | pre-sprint | `src/db/pool.js` | YES |

---

## Section 6 — Database Files

| File | Exact Path | Purpose | Created | Last Updated | Related Files | MVP Required |
|------|-----------|---------|---------|-------------|--------------|-------------|
| `pool.js` | `/src/db/pool.js` | pg connection pool singleton. Imported by all route files and services that query the DB. | pre-sprint | pre-sprint | `.env` (`DATABASE_URL`) | YES |
| `migrate.js` | `/src/db/migrate.js` | Migration runner. Runs on every server start (idempotent). All `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. **This is the authoritative schema driver — all schema changes go here.** | pre-sprint | 2026-06-09 | `schema.sql`, `server.js` | YES |
| `schema.sql` | `/src/db/schema.sql` | Full schema reference (577 lines, 30+ tables, 38 indexes). Used by `init-db.js` for one-shot DB initialization. **Not auto-applied on server start** — `migrate.js` is. | pre-sprint | pre-sprint | `migrate.js` | YES |
| `booking_settings.sql` | `/src/db/booking_settings.sql` | Booking widget defaults migration SQL. Applied as part of initial setup. | pre-sprint | pre-sprint | `schema.sql` | YES |
| `migrate_noshow_billing.sql` | `/src/db/migrate_noshow_billing.sql` | One-time migration for no-show and billing event tables. Historical reference. | pre-sprint | pre-sprint | `schema.sql` | NO |

---

## Section 7 — Scripts

| File | Exact Path | Purpose | Created | Last Updated | Related Files | MVP Required |
|------|-----------|---------|---------|-------------|--------------|-------------|
| `init-db.js` | `/scripts/init-db.js` | One-shot DB initialization: applies full `schema.sql` and seeds an initial owner account. Run manually on first setup. Does NOT replace `migrate.js`. | pre-sprint | pre-sprint | `src/db/schema.sql`, `src/db/pool.js` | YES |
| `check-data.js` | `/scripts/check-data.js` | Data validation script. Checks for orphaned records, data integrity issues. Run manually. | pre-sprint | pre-sprint | `src/db/pool.js` | NO |
| `migrate-account.js` | `/scripts/migrate-account.js` | Account migration utility. For moving data between accounts. Run manually. | pre-sprint | pre-sprint | `src/db/pool.js` | NO |

---

## Section 8 — Tests

| File | Exact Path | Purpose | Created | Last Updated | Related Files | MVP Required |
|------|-----------|---------|---------|-------------|--------------|-------------|
| `smoke.js` | `/test/smoke.js` | 20-step end-to-end smoke test. 44 total assertions. Covers auth, CRUD, booking, invoicing, payments, analytics, plan limits. **Run after every task. Must pass 44/44.** | pre-sprint | pre-sprint | `server.js` (must be running on port 3000) | SPRINT |

---

## Section 9 — Web Dashboard: Config

| File | Exact Path | Purpose | Created | Last Updated | Related Files | MVP Required |
|------|-----------|---------|---------|-------------|--------------|-------------|
| `vite.config.js` | `/client/vite.config.js` | Vite build config. Proxy settings, env var exposure (`VITE_*`). | pre-sprint | pre-sprint | `client/package.json` | YES |
| `tsconfig.json` | `/client/tsconfig.json` | TypeScript config for the web dashboard. | pre-sprint | pre-sprint | `client/package.json` | YES |
| `vercel.json` | `/client/vercel.json` | Vercel deployment config for the web frontend. SPA routing rules. | pre-sprint | pre-sprint | `client/package.json` | YES |
| `package.json` | `/client/package.json` | Frontend dependencies: React 19, Vite, TypeScript, Stripe.js, react-big-calendar, Leaflet, Axios. | pre-sprint | pre-sprint | `client/package-lock.json` | YES |

---

## Section 10 — Web Dashboard: Pages (44 files)

All pages live in `/client/src/pages/`. All authenticated pages use `ProtectedRoute`. API base URL must come from `VITE_API_URL` (Task 4).

| File | Purpose | MVP Required |
|------|---------|-------------|
| `Login.jsx` | Email/password login form | YES |
| `ForgotPassword.jsx` | Password reset request | YES |
| `ResetPassword.jsx` | Password reset form (token-linked) | YES |
| `Onboarding.jsx` | Account setup wizard | YES |
| `Dashboard.jsx` | Main dashboard / home | YES |
| `Jobs.jsx` | Job list and calendar | YES |
| `ClientList.jsx` | Client database list | YES |
| `ClientProfile.jsx` | Client profile with job/SMS history | YES |
| `Invoices.jsx` | Invoice list | YES |
| `PayInvoice.jsx` | Public payment page (unauthenticated) | YES |
| `Billing.jsx` | Subscription management | YES |
| `BookingSettings.jsx` | Admin booking widget config | YES |
| `BookingWidget.jsx` | Public-facing booking form | YES |
| `BookConfirm.jsx` | Booking confirmation page | YES |
| `BusinessSettings.jsx` | Business profile, hours, logo | YES |
| `Team.jsx` | Team member management | YES |
| `Deposits.jsx` | Deposit list and management | YES |
| `Messages.jsx` | SMS/iMessage history | PARTIAL |
| `Notifications.jsx` (via bell) | In-app notification center | YES |
| `Revenue.jsx` | Analytics/revenue dashboard | YES |
| `Dispatch.jsx` | Dispatcher view | YES |
| `Phone.jsx` | Voice call logs, voicemail | NO |
| `Fleet.jsx` | Fleet vehicle management | NO |
| `Estimates.jsx` | Service estimate management | PARTIAL |
| `SignEstimate.jsx` | Client e-signature page | PARTIAL |
| `ReviewPage.jsx` | Post-job review page | NO |
| `ClientPortal.jsx` | Client portal (magic-link) | PARTIAL |
| `ManagerTablet.jsx` | Tablet-optimized manager view | NO |
| `Entities.jsx` | Multi-entity management (Scale+) | NO |
| `Account.jsx` | Account/user profile settings | YES |
| `MobileDemo.jsx` | Mobile app marketing demo | NO |
| `TechApp.jsx` | Tech app info page | NO |
| `Landing.jsx` | Web app landing/marketing page | NO |
| `About.jsx` | About page | NO |
| `Blog.jsx` | Blog index | NO |
| `Careers.jsx` | Careers page | NO |
| `Contact.jsx` | Contact page | NO |
| `Faq.jsx` | FAQ page | NO |
| `Partners.jsx` | Partner program page | NO |
| `Press.jsx` | Press page | NO |
| `Privacy.jsx` | Privacy policy | YES |
| `Terms.jsx` | Terms of service | YES |
| `SmsTerms.jsx` | SMS terms | YES |
| `Updates.jsx` | Product updates/changelog | NO |

---

## Section 11 — Web Dashboard: Components

All components live in `/client/src/components/`.

| File | Purpose | MVP Required |
|------|---------|-------------|
| `ProtectedRoute.jsx` | Auth gate: redirects unauthenticated users to `/login` | YES |
| `AuthContext.jsx` (in `/context/`) | Global auth state: token, user, login/logout, refresh | YES |
| `JobForm.jsx` | Create/edit job modal form | YES |
| `JobDetail.jsx` | Job detail view component | YES |
| `ClientForm.jsx` | Create/edit client form | YES |
| `InvoiceDetail.jsx` | Invoice detail/PDF view | YES |
| `CardSetupForm.jsx` | Stripe card-on-file setup form | YES |
| `ChatWidget.jsx` | AI assistant floating chat widget | PARTIAL |
| `NotificationBell.jsx` | In-app notification bell + dropdown | YES |
| `PlanGate.jsx` | Plan-tier feature gate UI component | YES |
| `NoShowClock.jsx` | No-show grace period countdown | YES |
| `NoShowStrip.jsx` | No-show status strip on job cards | YES |
| `AddressAutocomplete.jsx` | Google Maps address autocomplete | PARTIAL |
| `CallerID.jsx` | Caller ID display for inbound calls | NO |
| `FieldCoreLogo.jsx` | SVG logo component | YES |

---

## Section 12 — Mobile App: Core

| File | Exact Path | Purpose | Created | Last Updated | Related Files | MVP Required |
|------|-----------|---------|---------|-------------|--------------|-------------|
| `App.js` | `/mobile/App.js` | Navigation root. React Navigation stack/tab configuration. **TimesheetScreen is currently in nav (Task 7: remove or implement).** | pre-sprint | pre-sprint | All screens | YES |
| `api.js` | `/mobile/api.js` | API client (Axios). **`BASE_URL` is hardcoded — must be replaced with `EXPO_PUBLIC_API_URL` before EAS build (Task 4). This is irreversible after distribution.** | pre-sprint | pre-sprint | `.env` (`EXPO_PUBLIC_API_URL`) | YES |
| `app.config.js` | `/mobile/app.config.js` | Expo config. Must expose `EXPO_PUBLIC_API_URL` via `extra` field for EAS builds. | pre-sprint | pre-sprint | `app.json`, `eas.json` | YES |
| `app.json` | `/mobile/app.json` | Expo manifest. App name, version, icons, permissions. | pre-sprint | pre-sprint | `app.config.js` | YES |
| `eas.json` | `/mobile/eas.json` | EAS build profiles (development, preview, production). | pre-sprint | pre-sprint | `app.config.js` | YES |
| `index.js` | `/mobile/index.js` | Expo app entry point. Registers root component. | pre-sprint | pre-sprint | `App.js` | YES |
| `metro.config.js` | `/mobile/metro.config.js` | Metro bundler config. | pre-sprint | pre-sprint | — | YES |
| `theme.js` | `/mobile/theme.js` | Shared color/typography constants for the mobile app. | pre-sprint | pre-sprint | All screens | YES |
| `package.json` | `/mobile/package.json` | Mobile dependencies: Expo SDK 54, React Native 0.81, @stripe/stripe-react-native, expo-location, expo-notifications, etc. | pre-sprint | pre-sprint | `mobile/package-lock.json` | YES |

---

## Section 13 — Mobile App: Screens

All screens live in `/mobile/screens/`.

| File | Purpose | MVP Required |
|------|---------|-------------|
| `LoginScreen.js` | Login form with biometric auth fallback | YES |
| `HomeScreen.js` | Home/dashboard with today's job summary | YES |
| `JobQueue.js` | Today's assigned jobs list | YES |
| `JobDetail.js` | Job detail: client info, address, notes, actions | YES |
| `ScheduleScreen.js` | Calendar/schedule view | YES |
| `PhotoScreen.js` | Camera + photo upload for job documentation | YES |
| `SignatureScreen.js` | Client e-signature capture | YES |
| `MessagesScreen.js` | SMS/iMessage history with clients | PARTIAL |
| `InvoiceScreen.js` | Invoice view and payment status | YES |
| `SearchScreen.js` | Client/job search | YES |
| `DispatchScreen.js` | Dispatcher view (for managers) | YES |
| `AccountScreen.js` | Technician account/profile settings | YES |
| `MoreScreen.js` | More menu (additional options) | YES |
| `TimesheetScreen.js` | **⚠️ ORPHAN — no backend route. Must be removed from nav or implemented before EAS build (Task 7).** | NO |

---

## Section 14 — Mobile App: Services

All services live in `/mobile/services/`.

| File | Purpose | MVP Required |
|------|---------|-------------|
| `notifications.js` | Expo push notification registration and handling | YES |
| `storage.js` | AsyncStorage wrapper for local persistence (tokens, preferences) | YES |

---

## Section 15 — Marketing Site

| File | Exact Path | Purpose | Created | Last Updated | Related Files | MVP Required |
|------|-----------|---------|---------|-------------|--------------|-------------|
| `layout.js` | `/landing/src/app/layout.js` | Next.js 16 App Router root layout. Head, fonts, global styles. | pre-sprint | pre-sprint | `globals.css` | NO |
| `page.js` | `/landing/src/app/page.js` | Homepage (`/`) | pre-sprint | pre-sprint | — | NO |
| `features/` (dir) | `/landing/src/app/features/` | Features page | pre-sprint | pre-sprint | — | NO |
| `pricing/` (dir) | `/landing/src/app/pricing/` | Pricing page | pre-sprint | pre-sprint | — | NO |
| `login/` (dir) | `/landing/src/app/login/` | Marketing site login redirect | pre-sprint | pre-sprint | — | NO |
| `globals.css` | `/landing/src/app/globals.css` | Global stylesheet for marketing site | pre-sprint | pre-sprint | `layout.js` | NO |

---

## Section 16 — Deployment & Environment Config

| File | Exact Path | Purpose | Created | Last Updated | Related Files | MVP Required |
|------|-----------|---------|---------|-------------|--------------|-------------|
| `.env.example` | `/.env.example` | Template for all required env vars. **This file is committed. Never commit `.env`.** Contains all required keys with placeholder values and comments. | pre-sprint | 2026-06-09 | `.env` (gitignored) | YES |
| `.env` | `/.env` | Actual secrets. **Never committed.** Contains real DATABASE_URL, JWT_SECRET, STRIPE_*, TWILIO_*, SMTP_*, etc. | pre-sprint | (local only) | `.env.example` | YES |
| `nixpacks.toml` | `/nixpacks.toml` | Railway build config: Node 20, `npm ci`, start command. | pre-sprint | pre-sprint | `railway.json` | YES |
| `railway.json` | `/railway.json` | Railway project metadata, healthcheck path (`/health`), restart policy. | pre-sprint | pre-sprint | `nixpacks.toml` | YES |
| `client/vercel.json` | `/client/vercel.json` | Vercel routing rules. SPA fallback: all routes → `index.html`. | pre-sprint | pre-sprint | `client/vite.config.js` | YES |
| `mobile/eas.json` | `/mobile/eas.json` | EAS build profiles. `production` profile must have `EXPO_PUBLIC_API_URL` set before first build. | pre-sprint | pre-sprint | `mobile/app.config.js` | YES |

---

## Quick Reference: Files Touched in the Pre-Launch Sprint

| Sprint Task | Files Modified | Date |
|------------|---------------|------|
| Task 1 — Multi-tenant isolation audit | `src/routes/users.js`, `src/routes/clients.js`, `src/routes/jobs.js`, `src/routes/deposits.js`, `src/routes/payments.js` | 2026-06-09 |
| Task 2 — CORS env-driven config | `src/app.js`, `.env.example` | 2026-06-09 |
| Task 5 — Health check endpoint + migrate.js backfill | `src/app.js`, `src/db/migrate.js` | 2026-06-09 |
| Task 6 — Stripe webhook raw body | `src/app.js`, `src/routes/webhooks.js`, `src/db/migrate.js` | PENDING |
| Task 4 — Hardcoded URL sweep | `mobile/api.js`, `mobile/app.config.js`, `src/services/email.js`, `.env.example` | PENDING |
| Task 3 — File upload storage fix | `src/routes/mobile.js`, `src/routes/business-settings.js` | PENDING |
| Task 7 — TimesheetScreen resolve | `mobile/screens/TimesheetScreen.js`, `mobile/App.js` | PENDING |
| Task 8 — Rate limit tuning | `src/app.js` | PENDING |
| Task 9 — AI chat rate limiting | `src/routes/chat.js`, `src/db/migrate.js` | PENDING |
| Task 10 — Expired token cleanup cron | `src/services/scheduler.js`, `src/db/migrate.js` | PENDING |

---

## Files With Active Known Issues

| File | Issue | Severity | Sprint Task |
|------|-------|---------|------------|
| `src/app.js` | Webhook router mounted AFTER `express.json()` — Stripe raw body verification broken | CRITICAL | Task 6 |
| `mobile/api.js` | `BASE_URL` hardcoded — app cannot connect to API on real devices | CRITICAL | Task 4 |
| `mobile/screens/TimesheetScreen.js` | No backend route — orphaned screen in navigation | HIGH | Task 7 |
| `src/middleware/planLimits.js` | Uses `starter/growth/scale` plan names — billing uses `solo/pro/scale` | HIGH | Pre-billing |
| `src/routes/billing.js` | Admin alert email hardcoded to `kevincaines925@gmail.com` at line 497 | MEDIUM | Pre-launch |
| `src/routes/mobile.js` | File uploads go to `./uploads/` — lost on every Railway deploy | CRITICAL | Task 3 |
| `src/routes/business-settings.js` | Logo uploads go to local disk — same Railway ephemeral storage issue | CRITICAL | Task 3 |

---

*Last updated: 2026-06-09*  
*Update this file in the same session as any file change. Stale entries are worse than missing entries.*
