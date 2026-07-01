# FieldCore — Launch Blockers

**Created:** 2026-06-09  
**Last updated:** 2026-07-01 (Fleet UI redesign complete — NOT a launch blocker; fleet camera provider integration remains post-launch)  
**Source:** Full codebase reconciliation + documentation audit  
**Definition of Critical:** Anything that prevents a paying customer from successfully signing up, logging in, scheduling a job, taking a payment, receiving a communication, or accessing their data.

Blockers are ranked within each tier by consequence severity.

---

## CRITICAL
*A paying customer cannot successfully use FieldCore while these exist.*

---

### C-01 — No Stripe Account or Keys Configured
**Impact:** Zero revenue can be collected. No invoice can be paid. No deposit can be charged. No subscription can be activated. No booking deposit can be taken. The platform's entire business model is non-functional.  
**Affected features:** Invoicing, deposits, online booking (deposit step), subscription billing, card on file, public payment page, billing portal, Stripe Connect payouts  
**Root cause:** `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_SCALE` are all placeholders in `.env`  
**What must happen:** Create Stripe account → complete business verification → create Growth and Scale products/prices → register webhook endpoint → copy all keys to production `.env`  
**Estimated resolution:** 2–3 days (bank verification wait) + 2 hours setup  
**Blocking tasks in sprint:** Task 6 cannot be tested; I1 (Stripe end-to-end) cannot run

---

### C-02 — No SMTP Configured (Password Reset Is Broken)
**Impact:** Any user who forgets their password is permanently locked out. There is no recovery path. This alone makes the product unsuitable for real customers.  
**Secondary impact:** No job confirmation emails, no invoice emails, no client portal magic-links, no estimate delivery, no review request links, no beta signup confirmations  
**Root cause:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL` are all placeholders  
**What must happen:** Configure any SMTP provider (Gmail App Password is fastest) and set env vars  
**Estimated resolution:** 30 minutes (Gmail) to 2 hours (SendGrid with domain verification)  
**Blocking tasks in sprint:** None in the top 10, but blocks real user onboarding entirely

---

### ~~C-03 — Multi-Tenant Isolation Not Audited~~ — RESOLVED 2026-06-09
**Resolution:** All 27 route files audited. 5 files had missing account_id clauses — all fixed. 3 bugs in `users.js` membership endpoints were true cross-account security vulnerabilities (fixed). 4 other fixes in `clients.js`, `jobs.js`, `deposits.js`, `payments.js` were defense-in-depth where the initial SELECT was correctly scoped but follow-up writes were not. Smoke tests: 44/44 pass.

---

### C-04 — No Production Domain or Deployment
**Impact:** Customers cannot reach the application. There is no URL to give to an operator. The backend, frontend, and landing site all run locally only.  
**Root cause:** `APP_URL` is a placeholder. Railway and Vercel are configured in code (`nixpacks.toml`, `railway.json`, `client/.vercel/`) but no production deploy has been made. No domain has been registered or pointed.  
**What must happen:** Register domain → deploy backend to Railway → deploy frontend to Vercel → set `APP_URL` → configure DNS  
**Estimated resolution:** 1–2 hours for deploy; domain propagation up to 24 hours  
**Blocking:** All testing against real credentials

---

### ~~C-05 — CORS Not Environment-Driven~~ — RESOLVED 2026-06-09
**Resolution:** `src/app.js` `ALLOWED_ORIGINS` array replaced with `buildAllowedOrigins()` function. In production, derives allowed origins from `APP_URL` (apex + `www.` variant auto-generated). In development, also allows `http://localhost:5173` and `http://localhost:3000`. Logs a warning if `APP_URL` is missing in production. Hardcoded Railway URL removed from source code. `.env.example` updated with CORS note. 44/44 smoke tests pass.

---

### ~~C-06 — Mobile App `BASE_URL` Hardcoded~~ — RESOLVED 2026-06-10
**Resolution:** Sprint Task 4 complete. `mobile/api.js` hardcoded Railway URL fallback removed — `BASE_URL` now reads exclusively from `Constants.expoConfig?.extra?.apiUrl`. `mobile/app.config.js` updated to use `EXPO_PUBLIC_API_URL` env var (was incorrectly using `API_URL`). `.env.example` updated with EAS build warning. `EXPO_PUBLIC_API_URL` must be set before running `eas build`.

---

### C-07 — File Upload Storage Destination Unknown
**Impact:** Every job photo a technician uploads and every business logo an operator sets will be silently lost on the next Railway deploy. Railway uses an ephemeral filesystem. A technician uploads a photo as job evidence, the operator deploys a bug fix, and the photo is gone — with no error, no warning, no recovery.  
**Root cause:** `src/routes/mobile.js` and `src/routes/business-settings.js` write files somewhere — the storage destination has not been audited or confirmed as persistent. See Task 3 in sprint plan.  
**What must happen:** Task 3 — read both route files, confirm storage mechanism, migrate to S3/R2/Railway Volume if local disk  
**Estimated resolution:** 30 minutes (investigation) + up to 4 hours (if migration needed)  
**Blocking:** Any production use of photo uploads or logo uploads

---

### ~~C-07b — Dashboard inaccessible on mobile phones~~ — RESOLVED 2026-06-24
**Resolution:** The `isPhone` gate in `client/src/App.jsx` (which blocked all screens narrower than 640px) has been removed. The full authenticated dashboard is now accessible on phones. The existing responsive CSS (768px and 390px breakpoints, sidebar overlay, bottom nav, stacked grids) provides a functional mobile layout. Build verified passing.

---

### ~~C-08 — Stripe Webhook Raw Body Not Verified~~ — RESOLVED 2026-06-10
**Resolution:** Sprint Task 6 complete. Root cause confirmed: `express.json()` was registered in `src/app.js` BEFORE the webhook router, silently consuming the request stream. Fixed by moving `app.use('/api/webhooks', webhooksRouter)` to before all body-parser middleware. Also added `payment_intent.payment_failed` handler and widened `invoices` status constraint to include `'failed'`. Full E2E test with Stripe CLI pending until `STRIPE_WEBHOOK_SECRET` is configured.

---

### C-09 — No Production Database
**Impact:** Without a production PostgreSQL instance, there is no persistent data store. All customer data (accounts, jobs, clients, payments) would be lost on every server restart.  
**Root cause:** `DATABASE_URL` is a placeholder. The development database runs locally on port 5433.  
**What must happen:** Provision a PostgreSQL database on Railway (or equivalent) → set `DATABASE_URL` in production env → confirm migrations run successfully on first deploy  
**Estimated resolution:** 30 minutes to provision; first-deploy migration test required  
**Blocking:** All production data persistence

---

### C-10 — No Twilio A2P Registration (All SMS Disabled)
**Impact:** `SMS_ENABLED=false` means every SMS automation is silently disabled: no job confirmation SMS, no 24-hour reminder SMS, no no-show SMS, no ETA SMS from mobile. These are core features operators are paying for. The value proposition of automated communications does not exist until this is resolved.  
**Root cause:** Twilio A2P 10DLC campaign registration is a US carrier requirement for business SMS. Sending without it risks Twilio account suspension. The `SMS_ENABLED` gate exists to prevent this.  
**What must happen:** Create Twilio account → purchase phone number → register A2P brand → register campaign → wait for approval (3–7 business days) → set credentials and `SMS_ENABLED=true`  
**Estimated resolution:** 3–7 business days (approval wait) + 2 hours setup  
**Blocking:** All SMS features; no-show flow completion; reminder automation

---

### C-11 — JWT_SECRET Not Set for Production
**Impact:** If `JWT_SECRET` is a weak, default, or shared value in production, every user session token can be forged. An attacker who knows the secret can authenticate as any user on any account on the platform.  
**Root cause:** `JWT_SECRET` is a placeholder in `.env`. The development value may be simple or well-known.  
**What must happen:** Generate a cryptographically random 64-character string → set as `JWT_SECRET` in production only → never commit to git → never reuse the development value  
**Estimated resolution:** 5 minutes  
**Blocking:** The entire authentication system's security

---

### ~~C-11b — `messages.read_at` column missing on Railway DB~~ — RESOLVED 2026-06-24
**Resolution:** `ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;` run directly on Railway production DB via psql. Fallback block removed from `src/routes/phone.js`. Unread message counts now work correctly.

---

### ~~C-11c — Stripe Connect "Connect Stripe" button dead-ended on Entities page~~ — RESOLVED 2026-06-24
**Resolution:** Button now calls real `/api/connect/onboard` backend endpoint. Creates Stripe Express account, saves `stripe_account_id` to `accounts` table, generates Stripe account link, redirects operator to Stripe onboarding. Shows per-entity loading state. Inline `connectErrors[entityId]` replaces dead `alert()`. `client/src/pages/Entities.jsx`.

---

### ~~C-11d — Downgrade path hidden in Billing page~~ — RESOLVED 2026-06-24
**Resolution:** "Request Downgrade" button added in two locations: (1) Current Plan banner alongside "Manage Billing →", (2) Plans tab footer alongside "Cancel my subscription". Opens `DowngradeModal` with wording per DECISION-022. No Stripe API called. Routes to support email + phone.

---

### C-12 — TimesheetScreen Orphaned in Mobile App
**Impact:** `mobile/screens/TimesheetScreen.js` exists in the navigation but has no confirmed backend route. If the screen makes API calls to a non-existent endpoint, it returns 404 errors that could crash the screen, confuse technicians, or cause App Store reviewers to reject the submission.  
**Root cause:** The screen was added during development beyond the original MVP scope but the backend was not confirmed. See Task 7 in sprint plan.  
**What must happen:** Task 7 — read the screen, determine what API it calls, then either implement the backend or remove the screen from navigation before EAS build  
**Estimated resolution:** 30 minutes (remove) or 4–6 hours (implement)  
**Blocking:** App Store / Play Store submission; mobile app stability

---

## HIGH
*These do not prevent all usage but cause significant failure, financial risk, or serious degradation for paying customers.*

---

### H-01 — Rate Limits Not Set for Production
**Impact:** Auth endpoints are open to credential stuffing attacks. A bot can attempt thousands of password combinations against operator accounts. The SMS endpoint can be abused to generate Twilio costs on FieldCore's account. The general API can be scraped.  
**Root cause:** `express-rate-limit` is configured but values have not been reviewed or tuned for production. See Task 8 in sprint plan.  
**What must happen:** Task 8 — review and set production-appropriate limits on auth, SMS, booking, and general API routes  
**Estimated resolution:** 1–2 hours

---

### H-02 — AI Chat Has No Cost Controls
**Impact:** Any single account (or a script targeting the endpoint) can send unlimited messages to the Anthropic API. Each message is billed to FieldCore. There is no per-account daily limit, no monthly cap, no rate limit on this endpoint specifically.  
**Root cause:** `src/routes/chat.js` calls the Anthropic SDK with no usage tracking. See Task 9 in sprint plan.  
**What must happen:** Task 9 — implement per-account daily message limit before `ANTHROPIC_API_KEY` is configured  
**Estimated resolution:** 2–3 hours  
**Note:** This becomes Critical the moment `ANTHROPIC_API_KEY` is set in production

---

### ~~H-03 — No Health Check Endpoint~~ — RESOLVED 2026-06-09
**Resolution:** `GET /health` at `src/app.js` upgraded from a static one-liner to an async handler with a real DB check. Uses `Promise.race` with a 2-second timeout. Returns `{ status: 'ok', db: 'ok', uptime, timestamp }` (200) on success or `{ status: 'degraded', db: 'error', error }` (503) on failure. Railway health checks now validate actual DB connectivity. 44/44 smoke tests pass.

---

### H-04 — No Error Monitoring
**Impact:** Production errors are only visible in Railway logs. There is no alerting when the server throws an unhandled exception, when a Stripe webhook fails, when the scheduler stops running, or when the database pool becomes exhausted. Operators experience silent failures with no FieldCore team awareness.  
**Root cause:** No Sentry, Rollbar, or equivalent error tracking service has been integrated.  
**What must happen:** Add Sentry to backend (`@sentry/node`) and frontend (`@sentry/react`); configure error alerts; capture unhandled promise rejections and uncaught exceptions  
**Estimated resolution:** 2–3 hours

---

### H-05 — No EAS Build Created (Mobile App Not Distributable)
**Impact:** The mobile app exists only as an Expo development build. It cannot be installed on a technician's phone without a development machine running Expo. A paying operator cannot give the app to their team.  
**Root cause:** `mobile/eas.json` build profiles exist but no EAS build has been submitted to Apple or Google.  
**What must happen:** Apple Developer account ($99/yr) + Google Play Console ($25 one-time) → configure EAS profiles → run first production build → submit to stores  
**Estimated resolution:** 1–3 days (Apple account verification) + 2–4 hours build time

---

### H-06 — Google Maps API Key Not Configured
**Impact:** `AddressAutocomplete.jsx` is non-functional. Operators manually typing addresses will encounter errors or broken input on client creation, job creation, and business settings. Address accuracy degrades.  
**Root cause:** `VITE_GOOGLE_MAPS_API_KEY` is a placeholder in `client/.env`.  
**What must happen:** Create Google Cloud project → enable Maps JavaScript API → restrict key to production domain → set in `client/.env` for production build  
**Estimated resolution:** 30 minutes

---

### H-07 — No Database Backup Strategy
**Impact:** A production database failure, accidental deletion, or corrupted migration has no recovery path. All customer data — clients, jobs, payment history, operator profiles — is permanently lost.  
**Root cause:** No backup policy documented or configured on the production database.  
**What must happen:** Enable Railway automatic database backups (built-in feature) → set retention period → document recovery procedure → test restore from backup  
**Estimated resolution:** 30 minutes to enable; 1 hour to test a restore

---

### H-08 — Hardcoded Development URLs in Codebase
**Impact:** Beyond `mobile/api.js` (a Critical blocker), additional `localhost` references in email templates, frontend config, or route files would cause silent failures in production — links in emails going nowhere, API calls to wrong hosts.  
**Root cause:** Confirmed in `mobile/api.js`; other files not yet audited. See Task 4 in sprint plan.  
**What must happen:** Task 4 — full grep sweep across all files  
**Estimated resolution:** 1–2 hours

---

### H-09 — Subscription Billing Cannot Activate
**Impact:** Even after Stripe keys are configured (C-01), subscriptions will not activate unless Stripe price IDs are created and set in `STRIPE_PRICE_GROWTH` and `STRIPE_PRICE_SCALE`. The billing page will show plans but the upgrade flow will fail because it references non-existent Stripe price objects.  
**Root cause:** Stripe products and prices have not been created in the Stripe dashboard. Price IDs are placeholders in `.env`.  
**What must happen:** Log into Stripe → create two products (Growth, Scale) → create monthly prices for each → copy price IDs to env  
**Estimated resolution:** 1 hour (after Stripe account is live)

---

### H-10 — Starter Plan Pricing Not Decided
**Impact:** `planLimits.js` enforces Starter/Growth/Scale tiers but the env template only has price IDs for Growth and Scale. If Starter is meant to be a free trial, that needs no Stripe price. If Starter is paid, it needs a Stripe price ID and a billing flow. The current state is ambiguous and could result in operators not being charged.  
**Root cause:** Business decision not made. No `STRIPE_PRICE_STARTER` in `.env.example`.  
**What must happen:** Decide Starter pricing model → if paid, create Stripe price and add to env → if free trial, document the trial-to-paid upgrade path  
**Estimated resolution:** Business decision: immediate; implementation: 1–2 hours

---

## MEDIUM
*These cause feature gaps or operational friction but do not prevent a determined customer from using the core product.*

---

### M-01 — No CI/CD Pipeline
**Impact:** Every code change is manually deployed. There is no automated test run before deployment. A breaking change can ship to production with no warning.  
**Root cause:** `.deploy-trigger` file exists suggesting manual process; no GitHub Actions or Railway auto-deploy configured.  
**What must happen:** Connect Railway to the GitHub repository → auto-deploy on push to `main` → add smoke test as a deploy check  
**Estimated resolution:** 2–4 hours

---

### M-02 — `console.log` Statements May Expose Sensitive Data
**Impact:** Production logs may contain user emails, account IDs, error details, and other information that should not be in accessible log output. Railway logs are visible to anyone with Railway access.  
**Root cause:** Development logging not audited or cleaned before production.  
**What must happen:** Grep for `console.log` across `src/`; remove or replace with structured logging calls; at minimum remove any log that prints user PII or payment data  
**Estimated resolution:** 2–4 hours

---

### M-03 — Input Validation Not Fully Audited
**Impact:** Missing input validation on API endpoints can lead to malformed data in the database, unexpected server errors returned to users, or in worst cases injection vulnerabilities.  
**Root cause:** 27 route files have not been audited for consistent input validation. Express 5 handles some errors automatically but custom validation may be missing on many routes.  
**What must happen:** Audit each route for missing type checks, length limits, and required field validation; add `express-validator` or `zod` for the most critical paths (auth, payments, booking)  
**Estimated resolution:** 5–10 hours

---

### M-04 — Scheduler Failures Are Silent
**Impact:** The cron scheduler in `src/services/scheduler.js` sends job reminders and deposit expiry alerts. If it throws an unhandled error and stops running, reminder SMS stops sending and no one is alerted. Customers notice before the team does.  
**Root cause:** No heartbeat logging, no error alerting on cron job failures.  
**What must happen:** Add try/catch with error logging to every scheduled job; add a heartbeat log on each successful run; integrate with error monitoring (H-04) for scheduler failures  
**Estimated resolution:** 1–2 hours

---

### M-05 — Business Phone System Scope Not Decided
**Impact:** `src/routes/phone.js` is a fully implemented Twilio Voice integration with call logs, voicemail, and transcription. This was not in the original MVP scope. It requires separate Twilio Voice configuration, TwiML apps, and additional number provisioning. If not decided, it ships unconfigured and operators may find and attempt to use a non-functional feature.  
**Root cause:** Feature was built beyond MVP scope; no launch decision made.  
**What must happen:** Decide — include in launch (configure Twilio Voice) or gate behind a plan flag with a "Coming soon" state. Doing nothing ships a partially reachable broken feature.  
**Estimated resolution:** Decision: immediate; configuration if included: 2–4 hours

---

### M-06 — Real Legal Documents Not Written
**Impact:** The landing site has placeholder Terms of Service, Privacy Policy, and SMS Terms. Collecting payments and processing customer data without real legal documents exposes FieldCore to regulatory risk. Stripe may also require a ToS link during business verification.  
**Root cause:** Content not yet written. Legal pages are placeholders.  
**What must happen:** Draft or obtain real ToS, Privacy Policy, and SMS Terms before accepting paying customers  
**Estimated resolution:** External dependency (legal); technical implementation is 1–2 hours once content exists

---

### M-07 — Partner Program Backend Not Verified
**Impact:** The Partners page at `client/src/pages/Partners.jsx` collects applications but it is unclear if a backend route exists to save submissions. Partner applications may be silently dropped.  
**Root cause:** `partner_applications` table exists but the route wiring was not confirmed during the codebase scan.  
**What must happen:** Read the Partners page, trace the form submission, verify the backend route handles it; fix if not working  
**Estimated resolution:** 1 hour

---

### M-08 — AI Chat Cost Model Not Defined
**Impact:** If AI chat is included at launch, there is no documented decision about who pays the Anthropic API cost per message. If FieldCore absorbs it, the cost is unbudgeted. If it is a plan feature, it needs to be gated. If it is billed to operators, a billing mechanism is needed.  
**Root cause:** Business decision not made.  
**What must happen:** Decide cost model before enabling `ANTHROPIC_API_KEY` → implement per-account rate limiting (Task 9) → document in terms of service  
**Estimated resolution:** Business decision: immediate; implementation: 2–3 hours

---

### M-09 — No Expired Token Cleanup
**Impact:** `password_reset_tokens` and `client_portal_tokens` accumulate indefinitely. Minor security hygiene issue now; performance issue at scale.  
**Root cause:** No cron cleanup job for these tables. See Task 10 in sprint plan.  
**What must happen:** Task 10 — add daily cleanup cron to `src/services/scheduler.js`  
**Estimated resolution:** 30–45 minutes

---

### M-10 — Tech Mobile Demo Page Audience Unclear
**Impact:** `client/src/pages/TechMobileDemo.jsx` is a publicly reachable page (presumably). It is unclear if this is for public prospects or internal sales demos. If it is a sales tool it should not require a login. If it contains sensitive wireframes or internal information it should be gated.  
**Root cause:** No documentation of intent.  
**What must happen:** Decide audience → add `ProtectedRoute` wrapper if internal; add public analytics tracking if external  
**Estimated resolution:** 30 minutes

---

### M-11 — No Platform Fee Confirmation
**Impact:** `PLATFORM_FEE_PERCENT=1` is the default in `.env.example`. If this is wrong — either too high (operators complain) or too low (revenue shortfall) — it affects every payment processed through the platform.  
**Root cause:** Business decision not confirmed in writing.  
**What must happen:** Confirm the 1% platform fee is intentional → document it → ensure it is reflected in the Terms of Service  
**Estimated resolution:** Business decision: immediate; documentation: 30 minutes

---

## LOW
*Polish, maintainability, and operational improvements. Important over time but do not affect a paying customer's ability to use the product at launch.*

---

### L-01 — No Unit or Integration Tests
**Impact:** No automated regression detection. Bugs introduced during the sprint are found manually. Cannot safely refactor.  
**What must happen:** Write integration tests for at minimum: auth flow, job CRUD, invoice creation, payment, and multi-tenant isolation  
**Estimated resolution:** 10–20 hours for meaningful coverage

---

### L-02 — No Structured Logging
**Impact:** Railway logs are unstructured `console.log` output. Searching for specific errors, correlating requests, or measuring latency is difficult.  
**What must happen:** Replace `console.log/error` with `winston` or `pino` with JSON output and request ID correlation  
**Estimated resolution:** 3–5 hours

---

### L-03 — No API Documentation
**Impact:** A technical co-founder or future developer has no reference for the 27 API routes. Onboarding takes longer than necessary.  
**What must happen:** Add OpenAPI/Swagger annotations to routes; generate docs  
**Estimated resolution:** 10–20 hours for full coverage

---

### L-04 — TypeScript Not Strictly Enforced on Frontend
**Impact:** Type errors exist that are not surfaced at build time. Runtime type errors may reach users.  
**What must happen:** Run `tsc --noEmit` in `client/`; resolve all type errors; enforce strict mode  
**Estimated resolution:** 4–8 hours

---

### L-05 — Admin Audit Log Has No Viewer
**Impact:** The `audit_logs` table is being written to but neither FieldCore admins nor operators can read it through any UI. Security incidents cannot be investigated from the dashboard.  
**What must happen:** Add a basic audit log viewer page in the admin/settings area  
**Estimated resolution:** 3–5 hours

---

### L-06 — `generate_icons.py` Undocumented
**Impact:** Future developers do not know when or why to run this script.  
**What must happen:** Add a comment header to the script and a note in `CLAUDE_CODE_ONBOARDING.md`  
**Estimated resolution:** 15 minutes

---

### L-07 — `FIELDCORE_LAUNCH_AUDIT_REPORT.json` Unknown Provenance
**Impact:** A JSON file in the project root with an authoritative-sounding name but unknown origin, date, and status. Could be confused for current truth.  
**What must happen:** Read the file → if outdated, archive or delete it → if current, reconcile with this document  
**Estimated resolution:** 30 minutes

---

### L-08 — No Sendblue UI or Toggle
**Impact:** Sendblue (iMessage/RCS) is implemented as a backend service but there is no UI for operators to select it. Switching providers requires an env var change and server restart. This is an operational inflexibility, not a user-facing bug.  
**What must happen:** Either commit to Twilio-only for launch, or add a messaging provider selector in business settings  
**Estimated resolution:** 2–3 hours (UI) if decided

---

### L-09 — No Mobile Client Management Screen
**Impact:** Technicians cannot look up or add clients from the mobile app. This is not blocking for field work but limits the app's standalone usefulness.  
**What must happen:** Add a client search/view screen to the mobile navigation (post-launch is acceptable)  
**Estimated resolution:** 4–6 hours

---

### L-10 — No Mobile Deposit Visibility
**Impact:** Technicians cannot see whether a deposit has been collected for a job from within the mobile app. Minor information gap.  
**What must happen:** Surface deposit status on `JobDetail.js` in the mobile app  
**Estimated resolution:** 2–3 hours

---

## Blocker Summary

| Tier | Count | Launch gate? |
|------|-------|-------------|
| Critical | 12 (2 resolved) | Yes — all must be resolved |
| High | 10 | Yes — H-01 through H-05 must be resolved; H-06 through H-10 strongly recommended |
| Medium | 11 | No — can ship with mitigations; resolve within first two weeks of beta |
| Low | 10 | No — post-launch backlog |

**Minimum viable resolution path to first paying customer:**  
C-01 through C-12 cleared + H-01 through H-05 cleared = FieldCore can take its first real customer.

**Recommended path to public beta:**  
All Critical + all High + M-01 (CI/CD) + M-06 (legal documents) cleared.

---

## Blocker Status Tracker

Update this table as blockers are resolved.

| ID | Blocker | Status | Resolved date | Notes |
|----|---------|--------|--------------|-------|
| C-01 | Stripe not configured | OPEN | — | — |
| C-02 | SMTP not configured | OPEN | — | — |
| C-03 | Multi-tenant not audited | RESOLVED | 2026-06-09 | Sprint Task 1 complete; 5 files fixed |
| C-04 | No production domain | OPEN | — | — |
| C-05 | CORS not env-driven | RESOLVED | 2026-06-09 | Sprint Task 2 complete |
| C-06 | Mobile BASE_URL hardcoded | OPEN | — | Sprint Task 4 |
| C-07 | File upload storage unknown | OPEN | — | Sprint Task 3 |
| C-08 | Stripe webhook raw body | OPEN | — | Sprint Task 6 |
| C-09 | No production database | OPEN | — | — |
| C-10 | Twilio A2P not registered | OPEN | — | — |
| C-11 | JWT_SECRET not set | OPEN | — | — |
| C-12 | TimesheetScreen orphaned | OPEN | — | Sprint Task 7 |
| H-01 | Rate limits not tuned | OPEN | — | Sprint Task 8 |
| H-02 | AI chat no cost controls | OPEN | — | Sprint Task 9 |
| H-03 | No health check endpoint | OPEN | — | Sprint Task 5 |
| H-04 | No error monitoring | OPEN | — | — |
| H-05 | EAS build not created | OPEN | — | — |
| H-06 | Google Maps key missing | OPEN | — | — |
| H-07 | No database backup | OPEN | — | — |
| H-08 | Hardcoded URLs (general) | OPEN | — | Sprint Task 4 |
| H-09 | Stripe price IDs missing | OPEN | — | Part of C-01 |
| H-10 | Starter plan pricing TBD | OPEN | — | Business decision |
| M-01 | No CI/CD | OPEN | — | — |
| M-02 | console.log cleanup | OPEN | — | — |
| M-03 | Input validation gaps | OPEN | — | — |
| M-04 | Scheduler not monitored | OPEN | — | — |
| M-05 | Phone system scope TBD | OPEN | — | Business decision |
| M-06 | No legal documents | OPEN | — | External dependency |
| M-07 | Partner backend unverified | OPEN | — | — |
| M-08 | AI chat cost model TBD | OPEN | — | Business decision |
| M-09 | No token cleanup | OPEN | — | Sprint Task 10 |
| M-10 | Mobile demo page unclear | OPEN | — | — |
| M-11 | Platform fee unconfirmed | OPEN | — | Business decision |
| L-01 | No tests | OPEN | — | Post-launch |
| L-02 | No structured logging | OPEN | — | Post-launch |
| L-03 | No API docs | OPEN | — | Post-launch |
| L-04 | TypeScript not strict | OPEN | — | Post-launch |
| L-05 | No audit log viewer | OPEN | — | Post-launch |
| L-06 | generate_icons.py undocumented | OPEN | — | Post-launch |
| L-07 | Launch audit JSON unknown | OPEN | — | Post-launch |
| L-08 | No Sendblue UI | OPEN | — | Post-launch |
| L-09 | No mobile client screen | OPEN | — | Post-launch |
| L-10 | No mobile deposit view | OPEN | — | Post-launch |
