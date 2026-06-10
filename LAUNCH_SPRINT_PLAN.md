# FieldCore — Launch Sprint Plan

**Created:** 2026-06-09  
**Source:** Top 10 tasks derived from full codebase reconciliation  
**Status:** Approved for planning. No code written yet.  
**Rule:** Complete tasks in dependency order. Do not skip. Do not start the next task until the current one is verified.

---

## Dependency Order (Execute in This Sequence)

```
Task 1 (Multi-Tenant Audit)         ← Do first. Security foundation.
Task 2 (CORS Config)                ← Do before any deploy attempt.
Task 5 (Health Endpoint)            ← Do before deploy. Railway requires it.
Task 6 (Stripe Webhook Raw Body)    ← Do before Stripe testing. Silent failure risk.
Task 4 (Hardcoded URL Sweep)        ← Do before EAS mobile build. Irreversible after build.
Task 3 (File Upload Storage)        ← Do before any real user uploads files.
Task 7 (TimesheetScreen Resolve)    ← Do before EAS mobile build.
Task 8 (Rate Limit Tuning)          ← Do before going public.
Task 9 (AI Chat Rate Limiting)      ← Do before enabling Anthropic API key.
Task 10 (Expired Token Cleanup)     ← Do before launch. Low risk, low effort, do it now.
```

---

## Task 1 — Multi-Tenant Isolation Audit

### Goal
Verify that every database query in every route file is scoped to the correct `account_id`. A single missing clause exposes one customer's data to another. This is the highest-consequence bug that could exist in a multi-tenant SaaS and must be confirmed clean before any real user data enters the system.

### Files That Need to Be Edited
- All 27 files in `src/routes/` — audit every one
- Likely fixes in any route file where a query is missing `AND account_id = $n`
- `src/middleware/auth.js` — verify `req.accountId` is reliably set for all authenticated routes

### Backend Work Required
- Read every `SELECT`, `UPDATE`, `DELETE`, and `INSERT` statement across all 27 route files
- For each query touching business data (clients, jobs, invoices, deposits, messages, estimates, reviews, fleet, etc.), confirm it includes a WHERE or AND clause scoped to `account_id`
- Exceptions that are intentionally unscoped:
  - `/api/auth` routes — operate on `users` table before account context exists (login/signup)
  - `/api/pay/:token` — public, token-scoped, not account-scoped
  - `/api/portal/:token` — public, token-scoped
  - `/api/book/:accountId` — public, account ID comes from URL param, not JWT
  - `/api/webhooks` — Stripe/Twilio callbacks, not user-scoped
  - `/api/beta` — public signup
  - `/api/contact` — public form
- All other routes must scope to `req.accountId` from the JWT
- Fix every query found without proper scoping

### Frontend Work Required
- None — this is purely a backend data-layer concern

### Mobile App Work Required
- None — the mobile app calls the same backend API; fixes here protect mobile too

### Database Work Required
- No schema changes
- Verify all 38 strategic indexes include `account_id` where appropriate (already documented in schema.sql — confirm the indexes exist)

### Testing Steps
1. Create two test accounts (Account A and Account B) via the signup flow
2. Add clients, jobs, and invoices to Account A
3. Authenticate as Account B
4. Attempt to GET `/api/clients`, `/api/jobs`, `/api/invoices` — all must return empty or Account B's own data only
5. Attempt to GET `/api/clients/:id` using an ID belonging to Account A — must return 404 or 403, never Account A's data
6. Repeat for: deposits, estimates, messages, fleet, reviews, notifications, analytics
7. Attempt to PUT/PATCH/DELETE on Account A's resources while authenticated as Account B — must fail
8. Verify no endpoint returns data from a different account under any circumstance

### Risk Level
**CRITICAL** — Data breach risk. GDPR/CCPA liability. This cannot ship unverified.

### Estimated Effort
3–5 hours (audit) + variable fix time depending on what's found

---

## Task 2 — CORS: Environment-Driven Configuration

### Goal
Replace the current hardcoded CORS origin in `src/app.js` with a configuration that reads from `APP_URL` in production and allows `localhost` only in development. Without this, the deployed frontend either cannot reach the API (CORS blocked) or the API accepts requests from any origin (security hole).

### Files That Need to Be Edited
- `src/app.js` — the only file where CORS is configured

### Backend Work Required
- Read the current CORS configuration in `src/app.js`
- Replace hardcoded origin(s) with logic:
  - In `NODE_ENV === 'production'`: allow only `APP_URL`
  - In `NODE_ENV === 'development'`: allow `http://localhost:5173` and `http://localhost:3000`
- Ensure the CORS config also allows the Vercel preview deployment URLs if needed (optional but useful)
- Confirm CORS is applied before all routes, not after
- Confirm the webhook routes are not accidentally blocked by CORS (webhooks are server-to-server, CORS doesn't apply, but some configs break them)

### Frontend Work Required
- None — this is a backend configuration change
- After the backend is deployed, confirm the frontend can successfully reach the API from the production domain (manual test)

### Mobile App Work Required
- None — React Native does not use browser CORS; mobile API calls are unaffected

### Database Work Required
- None

### Testing Steps
1. Start backend with `NODE_ENV=production` and `APP_URL=http://localhost:3000` (local simulation)
2. From the frontend (port 5173), make an authenticated API call — should succeed
3. From a different origin (e.g., curl with `Origin: https://evil.com`), attempt an API call — should be rejected with CORS error
4. Verify OPTIONS preflight requests return correct `Access-Control-Allow-Origin` headers
5. Verify Stripe webhook delivery is not affected (webhooks don't send an Origin header, so they should pass through regardless)

### Risk Level
**HIGH** — Without this fix, the production deploy either silently fails for all frontend users or is insecure. One-file change, 30-minute fix.

### Estimated Effort
30 minutes

---

## Task 3 — File Upload Storage: Investigate and Fix

### Goal
Determine where job photos (uploaded via mobile) and business logos (uploaded via business settings) are written in the current code. If they are being written to local disk, migrate to persistent cloud storage (Cloudflare R2 or AWS S3) before any real user uploads. Railway uses an ephemeral filesystem — local file writes are wiped on every deploy.

### Files That Need to Be Edited
- `src/routes/mobile.js` — job photo uploads
- `src/routes/business-settings.js` — logo uploads
- Possibly a new `src/services/storage.js` — if cloud storage needs to be abstracted
- `package.json` — if an S3/R2 SDK needs to be added

### Backend Work Required
- Read `src/routes/mobile.js` and find the file write logic; trace where the file path goes
- Read `src/routes/business-settings.js` and find the logo write logic
- **If using local disk (`fs.writeFile`, `multer` with `diskStorage`):**
  - Replace with `multer` using `memoryStorage` (stores in RAM, not disk)
  - Add upload function that streams the buffer to Cloudflare R2 or AWS S3
  - Store the returned public URL in the database instead of a local file path
  - Add R2/S3 credentials to `.env.example`
- **If already using cloud storage:** document it and close this risk
- Ensure uploaded file URLs stored in the DB are absolute public URLs, not relative paths

### Frontend Work Required
- Verify that image display components (job photos, business logo) read URLs from the API response and render them as `<img src={url}>` — they should already work if URLs are absolute
- If images are currently loaded via a relative path like `/uploads/photo.jpg`, update to use the full URL from the API

### Mobile App Work Required
- Verify `PhotoScreen.js` sends the photo as a multipart form upload to the correct endpoint
- If the endpoint response changes (returns a cloud URL instead of a local path), update any state that stores the returned URL
- Confirm photos display correctly in `JobDetail.js` after upload

### Database Work Required
- No schema changes needed — `job_photos` table already has a column for the file path/URL
- Verify the column is wide enough for a full S3/R2 URL (should be `TEXT`, not `VARCHAR(255)`)

### Testing Steps
1. Upload a job photo from the mobile app
2. Restart the server (simulating a Railway deploy)
3. Reload the job — photo must still be visible
4. Upload a business logo from the web dashboard
5. Restart the server
6. Reload the settings page — logo must still be visible
7. Verify the stored URL in the database is an absolute URL, not a relative path

### Risk Level
**CRITICAL** — Data loss risk. Every photo and logo a real user uploads is silently deleted on every redeploy if this is not fixed. Discovering this after onboarding real customers is a trust-destroying event.

### Estimated Effort
2–4 hours (if migration needed) — investigation first, 30 minutes; migration work, 2–3 hours

---

## Task 4 — Hardcoded URL Sweep

### Goal
Find and replace every hardcoded development URL in the codebase with environment variable references. The most critical instance is `BASE_URL` in `mobile/api.js` — this must be correct before the EAS build because a distributed mobile app binary cannot be patched without a new App Store/Play Store submission.

### Files That Need to Be Edited
- `mobile/api.js` — `BASE_URL` hardcoded (confirmed)
- Any file in `client/src/` with `localhost:3000` (search required)
- Any file in `src/` with hardcoded frontend URL (search required)
- `mobile/app.config.js` or `mobile/app.json` — may need `extra` config for env vars in Expo
- `.env.example` — add `EXPO_PUBLIC_API_URL` or equivalent if not present

### Backend Work Required
- Search `src/` for `localhost`, `127.0.0.1`, `:3000`, `:5173`
- Replace any found with `process.env.APP_URL` or `process.env.FRONTEND_URL` as appropriate
- Ensure no email templates in `src/services/email.js` contain hardcoded URLs for links (password reset, portal, invoice links — all must use `APP_URL`)

### Frontend Work Required
- Search `client/src/` for `localhost:3000` or any hardcoded API base URL
- Verify `client/vite.config.js` properly proxies or `VITE_API_URL` is used as the API base
- Confirm the axios or fetch base URL reads from `import.meta.env.VITE_API_URL`

### Mobile App Work Required
- Update `mobile/api.js` — change `BASE_URL` from a hardcoded string to read from Expo config (`Constants.expoConfig.extra.apiUrl` or `process.env.EXPO_PUBLIC_API_URL`)
- Update `mobile/app.config.js` to expose the env var to the app bundle
- Add `EXPO_PUBLIC_API_URL` to `.env.example` documentation
- **Critical timing note:** This change must be made before the first EAS production build. After the binary is published, changing the URL requires a full new submission.

### Database Work Required
- None

### Testing Steps
1. Set `EXPO_PUBLIC_API_URL=http://localhost:3000` and run Expo dev build — app must connect to local server
2. Set `EXPO_PUBLIC_API_URL=https://staging.yourdomain.com` and verify the app calls the staging server
3. On web frontend: build with `VITE_API_URL=https://api.yourdomain.com` and confirm all API calls go to the right host
4. Search the built JS bundle for the string `localhost` — it must not appear
5. In email templates: trigger a password reset and verify the reset link in the email uses `APP_URL`, not `localhost`

### Risk Level
**HIGH** — Mobile is irreversible once distributed. Web is recoverable with a redeploy but causes downtime. Email links with `localhost` in them would be immediately visible to users and destroy trust.

### Estimated Effort
1–2 hours

---

## Task 5 — Add `/health` Endpoint

### Goal
Add a `GET /health` endpoint that returns the application status and database connectivity. Railway uses this endpoint to determine if a deploy succeeded, whether to route traffic to an instance, and when to alert on failure. Without it, a broken deploy looks successful and a database outage is invisible.

### Files That Need to Be Edited
- `src/app.js` — add the route
- `src/db/pool.js` — may need to export the pool for use in the health check

### Backend Work Required
- Add `app.get('/health', async (req, res) => {...})` before all other routes and middleware
- Inside the handler: attempt `pool.query('SELECT 1')` with a short timeout (2 seconds)
- On success: return `200` with `{ status: 'ok', db: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() }`
- On DB failure: return `503` with `{ status: 'degraded', db: 'error', error: err.message }`
- The endpoint must be unauthenticated — no `requireAuth` middleware
- The endpoint must respond in under 2 seconds — use a query timeout

### Frontend Work Required
- None — health checks are infrastructure, not user-facing

### Mobile App Work Required
- None

### Database Work Required
- None — `SELECT 1` doesn't touch the schema

### Testing Steps
1. Start the server with a valid `DATABASE_URL` — `GET /health` must return `200 { status: 'ok' }`
2. Stop the PostgreSQL server — `GET /health` must return `503 { status: 'degraded' }`
3. Restart PostgreSQL — `GET /health` must return `200` again without server restart
4. Confirm the endpoint responds in under 500ms under normal conditions
5. Configure Railway health check to hit `/health` — verify Railway shows the service as healthy

### Risk Level
**MEDIUM** — Not a user-facing bug, but without this Railway cannot confirm deploys succeed. A broken deploy to production with no health check will route traffic to a broken instance.

### Estimated Effort
30 minutes

---

## Task 6 — Stripe Webhook: Verify Raw Body Parsing

### Goal
Confirm that `src/routes/webhooks.js` correctly receives the raw (unparsed) request body for Stripe signature verification. This is one of the most common silent failures in Stripe integrations: if `express.json()` runs first, the raw bytes are gone, `stripe.webhooks.constructEvent()` always throws a signature error, and every Stripe event is silently dropped. Subscriptions won't activate. Payments won't confirm. Refunds won't process. None of this produces a visible error to the user.

### Files That Need to Be Edited
- `src/app.js` — verify middleware order and raw body config
- `src/routes/webhooks.js` — verify `constructEvent` is called correctly

### Backend Work Required
- Read `src/app.js` and locate where `express.json()` is applied globally
- Read `src/routes/webhooks.js` and locate the Stripe webhook handler
- Confirm the webhook route uses `express.raw({ type: 'application/json' })` as its own body parser middleware, applied before the route handler
- Confirm the route is structured so the raw body middleware runs before `express.json()` for this path — either by mounting it before the global middleware or by explicitly excluding the webhook path from global JSON parsing
- Confirm `stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)` is present
- Confirm the response to Stripe is `res.json({ received: true })` with a 200 — Stripe retries if it doesn't get a 200
- Verify the Twilio webhook handler in the same file also receives the correct content type (`application/x-www-form-urlencoded`) for Twilio's format

### Frontend Work Required
- None

### Mobile App Work Required
- None

### Database Work Required
- None — webhook handler updates existing records (invoices, accounts); no schema changes

### Testing Steps
1. With real Stripe test keys configured, use the Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
2. Trigger a test event: `stripe trigger payment_intent.succeeded`
3. Confirm the server logs show the event was received and processed (not rejected)
4. Confirm no `WebhookSignatureVerificationError` appears in logs
5. Trigger `customer.subscription.created` and verify the account's plan updates in the database
6. Trigger `payment_intent.payment_failed` and verify the invoice status updates correctly
7. Verify a wrong `STRIPE_WEBHOOK_SECRET` produces a 400 response (signature mismatch)

### Risk Level
**CRITICAL (when Stripe is active)** — Cannot collect subscription revenue or confirm payments without this working. The code may look correct but silently fail. Must be verified with the Stripe CLI before going live.

### Estimated Effort
1–2 hours (read + verify + fix if needed + test)

---

## Task 7 — TimesheetScreen: Resolve the Orphan

### Goal
`mobile/screens/TimesheetScreen.js` exists and is part of the shipped mobile app but has no corresponding backend route or database table. Determine what it does, decide whether to implement it or remove it, and resolve it before the EAS build. Shipping an orphaned screen that calls a non-existent endpoint damages user trust and app store review chances.

### Files That Need to Be Edited
**Option A — Remove the screen:**
- `mobile/screens/TimesheetScreen.js` — delete or stub with a "coming soon" message
- `mobile/App.js` — remove the screen from the navigator

**Option B — Implement minimal backend:**
- `src/routes/timesheets.js` — new route file
- `src/db/schema.sql` or migration — new `timesheets` table
- `src/app.js` — mount the new route
- `mobile/screens/TimesheetScreen.js` — wire up real API calls

### Backend Work Required
- Read `TimesheetScreen.js` to understand what API calls it attempts to make
- Search `src/routes/` for any existing timesheet logic
- **Decision required before coding begins:** Is timesheet tracking in scope for launch?
  - If **no**: remove the screen from navigation, optionally keep the file with a stub UI
  - If **yes**: implement a minimal `timesheets` table (user_id, account_id, job_id, clock_in, clock_out, notes) and CRUD routes

### Frontend Work Required
- None — this is mobile-only

### Mobile App Work Required
- Read `TimesheetScreen.js` fully
- If removing: delete the tab/stack entry in `App.js` navigation config
- If implementing: wire the screen to real endpoints

### Database Work Required
- If removing: none
- If implementing: add `timesheets` table to schema and create a migration

### Testing Steps
1. Open the mobile app and navigate to the Timesheet screen
2. If removed: confirm the tab/screen no longer appears in navigation
3. If implemented: clock in, clock out, verify record appears in DB
4. Verify no console errors or network 404s on any screen in the app

### Risk Level
**MEDIUM** — App Store reviewers may reject an app with broken screens. Users who find it lose trust. Must be resolved before EAS build.

### Estimated Effort
- Remove path: 30 minutes
- Implement path: 4–6 hours (requires business decision first)

---

## Task 8 — Rate Limit Tuning for Production

### Goal
Review and set appropriate production rate limits across all API routes. The current configuration was set during development and may be too loose (enabling API abuse or scraping) or too tight (blocking legitimate burst usage). Auth routes in particular need strict limits to prevent credential stuffing attacks.

### Files That Need to Be Edited
- `src/app.js` — global rate limiter configuration
- `src/routes/auth.js` — per-route auth limiter (login, signup, password-reset)

### Backend Work Required
- Read `src/app.js` and document the current global rate limit settings (window, max)
- Read `src/routes/auth.js` and document the current auth-specific limits
- Set production-appropriate values:
  - **Global API:** 300 requests / 15 minutes per IP (adjust based on expected usage)
  - **Login:** 10 attempts / 15 minutes per IP (brute-force protection)
  - **Signup:** 5 accounts / hour per IP (prevent mass account creation)
  - **Password reset request:** 5 requests / hour per IP
  - **SMS send:** check `src/routes/sms.js` — limit to prevent SMS spam abuse
  - **Public booking:** limit to 20 bookings / hour per IP
- Add `standardHeaders: true` and `legacyHeaders: false` to rate limiter options so clients can see `RateLimit-*` headers
- Add a custom handler that returns a consistent `{ error: 'Too many requests. Try again in X minutes.' }` response

### Frontend Work Required
- Confirm the frontend handles 429 responses gracefully — should show a user-friendly message, not a blank screen or crash
- Check login page: if a user hits the rate limit, show "Too many attempts. Please wait 15 minutes."

### Mobile App Work Required
- Confirm the mobile app handles 429 responses — check API error handling in `mobile/api.js`
- Should show a toast or alert, not crash silently

### Database Work Required
- None — rate limiting is in-memory (express-rate-limit default) or Redis-backed

### Testing Steps
1. Hit the login endpoint more than 10 times in 15 minutes — should receive a 429 with a clear message
2. Verify the 429 response includes `Retry-After` header indicating when to try again
3. Wait for the window to expire — login should work again
4. Hit the general API 300+ times in 15 minutes from the same IP — should 429
5. Verify authenticated users are not blocked by the IP limit if they're on a shared IP (consider user-scoped limits for authenticated routes)

### Risk Level
**HIGH** — Without production rate limits, the auth endpoints are open to credential stuffing. The SMS endpoint can be abused to send messages at cost to FieldCore. The general API can be scraped.

### Estimated Effort
1–2 hours

---

## Task 9 — AI Chat: Per-Account Rate Limiting

### Goal
Add a daily message limit per account to `src/routes/chat.js` before the `ANTHROPIC_API_KEY` is configured. Currently, any single account can send unlimited messages to the Anthropic API, each one billed to FieldCore. One automated script or curious user could generate hundreds of dollars in API costs overnight.

### Files That Need to Be Edited
- `src/routes/chat.js` — add usage tracking and enforcement
- `src/db/schema.sql` — may need a `chat_usage` table, or reuse an existing counter pattern
- `src/db/migrate.js` — add migration for new table if needed

### Backend Work Required
- Read `src/routes/chat.js` fully to understand the current implementation
- Choose a storage mechanism for per-account daily usage:
  - **Option A (simple):** Add a `chat_messages_today` column to the `accounts` table with a `last_reset_at` timestamp; reset when `last_reset_at` is before today
  - **Option B (clean):** Create a `chat_usage` table with `(account_id, date, message_count)` and a unique constraint on `(account_id, date)`; increment on each message; reset daily automatically
- Add middleware or inline logic to check usage before calling the Anthropic API:
  - If `message_count >= DAILY_LIMIT`: return `429 { error: 'Daily AI chat limit reached. Resets at midnight.' }`
  - Define `DAILY_LIMIT` as a constant (suggest 50 messages/day/account for launch)
  - Consider making the limit plan-dependent (Starter: 20/day, Growth: 100/day, Scale: unlimited)
- Increment the counter after a successful Anthropic API response (not before, to avoid counting failed calls)

### Frontend Work Required
- In `client/src/components/ChatWidget.jsx`: handle the 429 response from the chat endpoint gracefully
- Show a message: "You've reached your daily AI assistant limit. It resets at midnight."
- Optionally show remaining messages for the day if the API returns that info

### Mobile App Work Required
- None — AI chat widget is not implemented in mobile

### Database Work Required
- If using Option A: `ALTER TABLE accounts ADD COLUMN chat_messages_today INT DEFAULT 0, ADD COLUMN chat_reset_at TIMESTAMPTZ`
- If using Option B: create `chat_usage` table with `(id, account_id, date, message_count, created_at)`
- Either option requires a migration entry in `src/db/migrate.js`

### Testing Steps
1. Set `DAILY_LIMIT = 3` temporarily in the code
2. Send 3 chat messages — all should succeed
3. Send a 4th — should receive a 429 with the limit message
4. Verify the chat widget displays the limit message correctly
5. Change the system clock or reset the counter manually — verify the limit resets
6. Restore `DAILY_LIMIT` to the real value (50 or plan-based)

### Risk Level
**MEDIUM (financial)** — No user data is at risk, but an unbounded Anthropic API cost is a real financial exposure. Low effort fix with high protection value.

### Estimated Effort
2–3 hours

---

## Task 10 — Expired Token Cleanup Cron

### Goal
Add scheduled cleanup of expired rows in `password_reset_tokens` and `client_portal_tokens` to prevent unbounded table growth and ensure stale auth tokens are purged. This is a hygiene task but one that is easy to do now and hard to retrofit later when the tables have millions of rows.

### Files That Need to Be Edited
- `src/services/scheduler.js` — add two new cron jobs following the existing pattern

### Backend Work Required
- Read `src/services/scheduler.js` to understand the existing cron job pattern (syntax, error handling, logging)
- Add a daily cleanup job (suggest 3:00 AM to avoid peak hours):
  ```
  DELETE FROM password_reset_tokens WHERE expires_at < NOW()
  DELETE FROM client_portal_tokens WHERE expires_at < NOW()
  ```
- Both queries should be wrapped in try/catch with error logging
- Log the number of rows deleted each run (useful for monitoring DB growth)
- Confirm the cron expression matches the server's timezone (check if the scheduler uses UTC or local time)

### Frontend Work Required
- None

### Mobile App Work Required
- None

### Database Work Required
- No schema changes — both tables already have `expires_at` columns
- Confirm `expires_at` columns are indexed (check `src/db/schema.sql`) — without an index, the DELETE on a large table is a full table scan
- If no index exists: add `CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at)` and same for `client_portal_tokens`

### Testing Steps
1. Insert a test row into `password_reset_tokens` with `expires_at = NOW() - interval '1 hour'` (already expired)
2. Manually trigger the cleanup function (call it directly in a test script)
3. Verify the expired row is deleted and valid (non-expired) rows are untouched
4. Confirm server logs show the cleanup ran and report the count of deleted rows
5. Verify the cron job fires at the scheduled time (check logs the next morning after deploy)

### Risk Level
**LOW** — No user-facing impact. Not a blocker. But adding it now takes 30 minutes; adding it after launch when tables are large requires a careful migration.

### Estimated Effort
30–45 minutes

---

## Sprint Summary

| # | Task | Effort | Risk | Dependency |
|---|------|--------|------|------------|
| 1 | Multi-tenant isolation audit | 3–5 hrs | CRITICAL | First |
| 2 | CORS env-driven config | 30 min | HIGH | Before deploy |
| 5 | Health check endpoint | 30 min | MEDIUM | Before deploy |
| 6 | Stripe webhook raw body | 1–2 hrs | CRITICAL (when live) | Before Stripe test |
| 4 | Hardcoded URL sweep | 1–2 hrs | HIGH | Before EAS build |
| 3 | File upload storage fix | 2–4 hrs | CRITICAL | Before real users |
| 7 | TimesheetScreen resolve | 30 min–6 hrs | MEDIUM | Before EAS build |
| 8 | Rate limit tuning | 1–2 hrs | HIGH | Before public |
| 9 | AI chat rate limiting | 2–3 hrs | MEDIUM (financial) | Before API key set |
| 10 | Expired token cleanup cron | 30–45 min | LOW | Before launch |

**Total estimated effort:** 12–26 hours depending on what is found in Tasks 1, 3, and 7.

**Critical path:** Task 1 → Task 6 → Task 4 → Task 7 → EAS Build  
**Deploy path:** Task 2 → Task 5 → Task 4 → Production Deploy  
**Revenue path:** Task 6 → Stripe credentials → Task 8 → Go live

---

## Pre-Sprint Checklist (Business Decisions Needed Before Coding Starts)

Before work begins on Task 7, the following must be decided:
- [ ] **TimesheetScreen:** Include in launch (implement backend) or remove for now?
- [ ] **AI Chat:** Include in launch? If yes, what is the per-account daily limit?
- [ ] **AI Chat cost model:** Does FieldCore absorb the Anthropic API cost, or is it a paid feature?

These decisions block Task 7 and Task 9. All other tasks can start immediately without waiting.
