# FieldCore — Task Acceptance Criteria

**Created:** 2026-06-09  
**Source:** LAUNCH_SPRINT_PLAN.md (10 pre-launch tasks)  
**Rule:** A task is not complete until every acceptance criterion in its section is checked. Partial completion does not count. "It works on my machine" does not count.

Tasks are listed in execution order per the sprint plan dependency chain.

---

## How to Use This Document

For each task:
1. Read the **Definition of Done** — this is the single sentence that describes the finished state
2. Work through **Acceptance Criteria** — each item must be checkable with a specific, observable test
3. Complete every **Testing Requirement** — these are the literal steps to verify the criteria
4. Confirm every **Success Metric** — these are measurable outcomes, not opinions

If any criterion cannot be checked, it is either not done or the test environment is not set up correctly. Resolve the environment before claiming completion.

---

## Task 1 — Multi-Tenant Isolation Audit

### Definition of Done
Every database query in every backend route file has been read, and every query that accesses business data is confirmed to be scoped to the authenticated account's `account_id`. Any query found without correct scoping has been fixed and re-verified.

### Acceptance Criteria
- [ ] All 27 files in `src/routes/` have been read in full, not skimmed
- [ ] Every `SELECT` statement touching business data includes a `WHERE account_id = $n` or equivalent binding
- [ ] Every `UPDATE` statement touching business data includes a `WHERE account_id = $n` clause or joins through a table that is already account-scoped
- [ ] Every `DELETE` statement touching business data includes a `WHERE account_id = $n` clause
- [ ] Every `INSERT` statement sets `account_id` to `req.accountId` from the verified JWT — never from a user-supplied request body parameter
- [ ] The following routes are confirmed intentionally public (no account scoping required) and documented as such:
  - `/api/auth/*` — pre-login, operates on users table with no account context
  - `/api/pay/:token` — token-scoped, public payment page
  - `/api/portal/:token` — token-scoped, client portal
  - `/api/book/:accountId` — public booking, account ID from URL param (not JWT)
  - `/api/webhooks/*` — server-to-server callbacks, not user-scoped
  - `/api/beta` — public signup
  - `/api/contact` — public form
- [ ] No route accepts `account_id` as a user-supplied query parameter or request body field that bypasses `req.accountId`
- [ ] The findings are documented in `DEVELOPMENT_GUARDRAILS.md` under the Task 1 completion record, listing every file audited and any fixes made
- [ ] If fixes were made: the fixed queries have been re-read and confirmed correct
- [ ] Smoke tests pass after all fixes are applied

### Testing Requirements

**Setup:**
1. Run `node scripts/init-db.js` to create a clean database
2. Create Account A via `POST /api/auth/signup` with email `testa@test.com`
3. Create Account B via `POST /api/auth/signup` with email `testb@test.com`
4. Authenticate as Account A, save the JWT as `TOKEN_A`
5. Authenticate as Account B, save the JWT as `TOKEN_B`
6. Add at least one record of each type to Account A: client, job, invoice, deposit, estimate, message, fleet vehicle, notification

**Isolation tests (all must return empty or 404/403, never Account A's data):**
7. `GET /api/clients` with `TOKEN_B` → must return `[]`, not Account A's clients
8. `GET /api/clients/:id` where `:id` is Account A's client ID, with `TOKEN_B` → must return 404 or 403
9. `GET /api/jobs` with `TOKEN_B` → must return `[]`
10. `GET /api/jobs/:id` where `:id` is Account A's job ID, with `TOKEN_B` → must return 404 or 403
11. `GET /api/invoices` with `TOKEN_B` → must return `[]`
12. `GET /api/deposits` with `TOKEN_B` → must return `[]`
13. `GET /api/estimates` with `TOKEN_B` → must return `[]`
14. `GET /api/messages` with `TOKEN_B` → must return `[]`
15. `GET /api/fleet` with `TOKEN_B` → must return `[]`
16. `GET /api/analytics` with `TOKEN_B` → must return zeroed metrics, not Account A's revenue
17. `PUT /api/clients/:id` where `:id` is Account A's client, with `TOKEN_B` → must return 404 or 403, must NOT update Account A's record
18. `DELETE /api/jobs/:id` where `:id` is Account A's job, with `TOKEN_B` → must return 404 or 403, must NOT delete Account A's job
19. `GET /api/notifications` with `TOKEN_B` → must return `[]`
20. After all tests: verify Account A's data is unchanged in the database

### Success Metrics
- 0 queries found without `account_id` scoping (after fixes, if any were needed)
- 0 of the isolation tests above return Account A's data when called with `TOKEN_B`
- 0 smoke test failures after fixes applied
- All fixes documented in `DEVELOPMENT_GUARDRAILS.md` with the exact file, line, and change made

---

## Task 2 — CORS: Environment-Driven Configuration

### Definition of Done
`src/app.js` reads the allowed CORS origin from `APP_URL` in production and `localhost:5173` in development. No hardcoded origin strings remain. The production frontend can reach the API. An arbitrary third-party origin cannot.

### Acceptance Criteria
- [ ] `src/app.js` does not contain a hardcoded `http://localhost` or `https://` origin string in the CORS config
- [ ] In `NODE_ENV=production`, CORS allows exactly the value of `APP_URL` — no more, no less
- [ ] In `NODE_ENV=development`, CORS allows `http://localhost:5173` and `http://localhost:3000`
- [ ] CORS is configured before all route mounting in `app.js` — the middleware order is correct
- [ ] OPTIONS preflight requests return the correct `Access-Control-Allow-Origin` header
- [ ] The Stripe and Twilio webhook endpoints are not broken by the CORS config (webhooks are server-to-server and do not send an `Origin` header; they should pass through regardless)
- [ ] `.env.example` already contains `APP_URL` — confirm it is present and documented
- [ ] The change is documented in `DEVELOPMENT_GUARDRAILS.md`

### Testing Requirements
1. Start the backend with `NODE_ENV=production` and `APP_URL=http://localhost:3000`
2. From a browser or tool that sends CORS headers, make a request from `http://localhost:3000` to the API — must succeed with `Access-Control-Allow-Origin: http://localhost:3000`
3. Make the same request with `Origin: https://evil.com` — must be rejected or have no `Access-Control-Allow-Origin` in the response
4. Start the backend with `NODE_ENV=development` — make a request from `http://localhost:5173` — must succeed
5. Send a simulated Stripe webhook: `curl -X POST http://localhost:3000/api/webhooks/stripe -H "Content-Type: application/json" -d '{}'` — must not receive a CORS rejection (will fail signature check, but not CORS)
6. Verify OPTIONS preflight: `curl -X OPTIONS http://localhost:3000/api/clients -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: GET" -v` — response must include `Access-Control-Allow-Origin` and `Access-Control-Allow-Methods`

### Success Metrics
- Legitimate origin: HTTP 200 with correct `Access-Control-Allow-Origin` header
- Blocked origin: no `Access-Control-Allow-Origin` header in response (browser blocks the request)
- Webhook endpoints: unaffected by CORS config change
- Zero hardcoded origin strings in `src/app.js`

---

## Task 5 — Health Check Endpoint

### Definition of Done
`GET /health` returns a 200 response with database connectivity status when the server and database are both running, and returns a 503 when the database is unreachable. Railway can use this endpoint to confirm deploy health.

### Acceptance Criteria
- [ ] `GET /health` is a real endpoint in `src/app.js` or a mounted route
- [ ] The endpoint is unauthenticated — no JWT required, no `requireAuth` middleware
- [ ] The response includes at minimum: `status`, `db`, `timestamp`
- [ ] When the database is reachable, response is `200` with `{ status: "ok", db: "ok" }`
- [ ] When the database is unreachable, response is `503` with `{ status: "degraded", db: "error" }`
- [ ] The endpoint responds in under 2 seconds under normal load
- [ ] The endpoint does not expose sensitive information (no connection strings, no internal IP addresses, no stack traces in the response body)
- [ ] The endpoint is mounted before all authenticated routes so it cannot be accidentally blocked by middleware
- [ ] The change is documented in `DEVELOPMENT_GUARDRAILS.md`

### Testing Requirements
1. Start the server with a valid database connection: `GET /health` must return `200 { status: "ok", db: "ok" }`
2. Verify the response includes `timestamp` and `uptime` fields
3. Stop PostgreSQL (or point `DATABASE_URL` to an invalid host): `GET /health` must return `503 { status: "degraded", db: "error" }`
4. The error response must not include the full database connection string or password
5. Restart PostgreSQL: `GET /health` must return `200` again without restarting the Node server
6. Measure response time: `time curl http://localhost:3000/health` — must be under 2 seconds
7. Attempt `GET /health` with no Authorization header — must succeed (not return 401)
8. Attempt `GET /health` with a garbage Authorization header — must still succeed (health check ignores auth)

### Success Metrics
- `200` response with valid database: confirmed
- `503` response with invalid database: confirmed
- Response time under 2 seconds: confirmed
- No sensitive data in response body: confirmed
- Endpoint accessible without authentication: confirmed

---

## Task 6 — Stripe Webhook: Raw Body Verification

### Definition of Done
`src/routes/webhooks.js` correctly receives the raw unparsed request body for Stripe events, `stripe.webhooks.constructEvent()` succeeds with a valid signature, and at least three Stripe event types have been tested end-to-end with the Stripe CLI and confirmed to update the correct database records.

### Acceptance Criteria
- [ ] The Stripe webhook route uses `express.raw({ type: 'application/json' })` as its body parser — not `express.json()`
- [ ] `stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)` is present and called before any business logic
- [ ] A request with a missing or invalid `stripe-signature` header returns `400` — never `200`
- [ ] A request with a valid signature and recognized event type returns `200 { received: true }`
- [ ] The route is mounted so the raw body middleware runs before any global `express.json()` middleware for this path
- [ ] The following event types are handled and update the correct database records:
  - `customer.subscription.created` → updates `accounts.plan`
  - `payment_intent.succeeded` → updates `invoices.status` to paid
  - `payment_intent.payment_failed` → updates `invoices.status` to failed
  - `invoice.paid` → updates `billing_events` table
- [ ] Unrecognized event types return `200` (Stripe expects acknowledgment even for unhandled events)
- [ ] The Twilio webhook handler in the same file correctly parses `application/x-www-form-urlencoded` (Twilio's format)
- [ ] The change is documented in `DEVELOPMENT_GUARDRAILS.md` — specifically whether the code was already correct or required a fix

### Testing Requirements

**Requires Stripe test keys in `.env` and Stripe CLI installed.**

1. Start the server
2. Run: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
3. Trigger: `stripe trigger payment_intent.succeeded` — server logs must show the event was received and processed, no `WebhookSignatureVerificationError`
4. Trigger: `stripe trigger customer.subscription.created` — verify `accounts` table updates the plan field for the test account
5. Trigger: `stripe trigger payment_intent.payment_failed` — verify `invoices` table updates status for the test invoice
6. Manually send a request with a wrong signature: `curl -X POST http://localhost:3000/api/webhooks/stripe -H "stripe-signature: wrong" -d '{}'` — must return `400`
7. Manually send a request with no signature: `curl -X POST http://localhost:3000/api/webhooks/stripe -d '{}'` — must return `400`
8. Verify a recognized event with a valid signature returns `200 { received: true }`
9. Verify an unknown event type (e.g., `charge.updated`) with a valid signature returns `200`, not `400` or `500`

### Success Metrics
- `stripe trigger payment_intent.succeeded` → event processed, no signature error: confirmed
- `stripe trigger customer.subscription.created` → `accounts.plan` updated in DB: confirmed
- Invalid signature → `400` response: confirmed
- No `WebhookSignatureVerificationError` in server logs during valid webhook delivery: confirmed
- Twilio webhook handler unaffected: confirmed

---

## Task 4 — Hardcoded URL Sweep

### Definition of Done
No file in the codebase contains a hardcoded `localhost` URL, port reference, or IP address that will be evaluated at runtime in production. `mobile/api.js` reads its API base URL from an environment-aware configuration. The web frontend reads its API base URL from `VITE_API_URL`. All email templates use `APP_URL`.

### Acceptance Criteria
- [ ] `grep -r "localhost" src/ client/src/ mobile/ landing/` returns zero results for runtime-evaluated strings (comments and test files are acceptable exceptions if explicitly noted)
- [ ] `grep -r "127.0.0.1" src/ client/src/ mobile/` returns zero runtime results
- [ ] `grep -r ":3000" src/ client/src/ mobile/` returns zero runtime results (except `SMTP_PORT` defaults or similar non-URL contexts)
- [ ] `grep -r ":5173" src/ client/src/ mobile/` returns zero runtime results
- [ ] `mobile/api.js` reads `BASE_URL` from `process.env.EXPO_PUBLIC_API_URL` or `Constants.expoConfig.extra.apiUrl` — not a hardcoded string
- [ ] `mobile/app.config.js` or `mobile/app.json` exposes the API URL to the Expo bundle via the `extra` config field
- [ ] `EXPO_PUBLIC_API_URL` is added to `.env.example` with a comment explaining it must be the production API URL before EAS build
- [ ] `client/src/` API calls use `import.meta.env.VITE_API_URL` as the base URL (or equivalent Vite env pattern) — not a hardcoded string
- [ ] `src/services/email.js` uses `process.env.APP_URL` for all links in email templates (password reset link, invoice link, portal magic-link, review link)
- [ ] No email template contains a hardcoded domain
- [ ] All additions to `.env.example` are documented
- [ ] The change is documented in `DEVELOPMENT_GUARDRAILS.md` listing every file modified

### Testing Requirements
1. Run the grep commands listed in Acceptance Criteria — all must return zero runtime hits
2. Build the Expo app with `EXPO_PUBLIC_API_URL=https://staging.example.com` — open the app, attempt login — the network request must go to `staging.example.com`, not `localhost`
3. Build the web frontend with `VITE_API_URL=https://api.example.com` — inspect network requests in DevTools — all API calls must go to `api.example.com`
4. Trigger a password reset email — the link in the email must use `APP_URL`, not `localhost`
5. Search the compiled Expo JS bundle for the string `localhost` — must not appear
6. Search the compiled Vite build output for `localhost` in API-call contexts — must not appear

### Success Metrics
- Zero `localhost` hits in runtime-evaluated code: confirmed
- Mobile app network requests go to configured `EXPO_PUBLIC_API_URL`: confirmed
- Web frontend network requests go to configured `VITE_API_URL`: confirmed
- Password reset email link uses `APP_URL`: confirmed
- `.env.example` updated with new variables: confirmed

---

## Task 3 — File Upload Storage Fix

### Definition of Done
Job photos uploaded from the mobile app and business logos uploaded from the web dashboard are stored in a location that persists across server restarts and Railway deploys. The storage destination is documented. Files uploaded before a server restart are still retrievable after the restart.

### Acceptance Criteria
- [ ] `src/routes/mobile.js` has been read and the file storage mechanism identified and documented
- [ ] `src/routes/business-settings.js` has been read and the logo storage mechanism identified and documented
- [ ] **If files were being written to local disk:** the storage has been migrated to a persistent solution (Cloudflare R2, AWS S3, or a Railway persistent volume)
- [ ] **If files were already using cloud storage:** this is confirmed and documented — the task is verification, not migration
- [ ] After a server restart (simulating a Railway deploy), all previously uploaded files are still accessible via their stored URLs
- [ ] File URLs stored in the database are absolute URLs (e.g., `https://r2.example.com/photos/abc.jpg`), not relative paths (e.g., `/uploads/abc.jpg`)
- [ ] Uploaded files are accessible publicly via their stored URL without authentication (job photos are shown to clients; they must load in a browser without a JWT)
- [ ] If a cloud storage provider was added: credentials are added to `.env.example`, not hardcoded
- [ ] If a new package was installed (e.g., `@aws-sdk/client-s3`): it is logged in `DEVELOPMENT_GUARDRAILS.md`
- [ ] Maximum file size limits are enforced to prevent abuse (suggest: 10MB per photo, 5MB per logo)
- [ ] The change is documented in `DEVELOPMENT_GUARDRAILS.md`

### Testing Requirements
1. Upload a job photo from the mobile app — note the returned URL
2. Restart the Node server: `Ctrl+C`, then `node server.js`
3. Fetch the photo URL in a browser — must load correctly
4. Upload a business logo from the web dashboard — note the returned URL
5. Restart the Node server again
6. Open the business settings page — logo must still display
7. Verify the URL stored in the database for both the photo and logo is an absolute URL starting with `https://`
8. Attempt to upload a file larger than the size limit — must receive a `413` or similar rejection, not a silent failure or server crash
9. Attempt to upload a file with a dangerous extension (e.g., `.exe`, `.php`) — must be rejected or stored safely (never executed)

### Success Metrics
- Job photo accessible after server restart: confirmed
- Business logo accessible after server restart: confirmed
- File URLs in database are absolute HTTPS URLs: confirmed
- Oversized file upload rejected with appropriate error: confirmed
- Storage provider documented in `DEVELOPMENT_GUARDRAILS.md`: confirmed

---

## Task 7 — TimesheetScreen: Resolve the Orphan

### Definition of Done
`mobile/screens/TimesheetScreen.js` is in one of two states: (A) connected to a working backend route with a corresponding database table and full CRUD functionality, or (B) removed from the app navigator so it cannot be reached by any user. There is no third state. The screen does not exist in a broken, reachable-but-non-functional state.

### Acceptance Criteria — Option A (Implement)
- [ ] A business decision to include timesheet tracking at launch has been confirmed and recorded in `DEVELOPMENT_GUARDRAILS.md`
- [ ] A `timesheets` table exists in the database with at minimum: `id`, `account_id`, `user_id`, `job_id` (nullable), `clock_in`, `clock_out` (nullable), `notes` (nullable), `created_at`
- [ ] A backend route handles at minimum: `POST /api/timesheets` (clock in), `PUT /api/timesheets/:id` (clock out / update), `GET /api/timesheets` (list for account)
- [ ] All route queries are scoped to `account_id` (consistent with Task 1)
- [ ] `TimesheetScreen.js` successfully calls the backend and displays real data
- [ ] Clock in and clock out functions work on a physical or simulator device
- [ ] The migration is logged in `DEVELOPMENT_GUARDRAILS.md`

### Acceptance Criteria — Option B (Remove)
- [ ] A business decision to defer timesheet tracking has been confirmed and recorded in `DEVELOPMENT_GUARDRAILS.md`
- [ ] `TimesheetScreen.js` is either deleted or contains only a stub UI (e.g., "Coming soon" message) that makes no API calls
- [ ] The screen is removed from the navigation configuration in `mobile/App.js` — it cannot be reached by tapping, swiping, or deep-linking
- [ ] No 404 API calls appear in the console when navigating through the app
- [ ] The tab bar or drawer menu does not show a Timesheet entry

### Testing Requirements (Both Options)
1. Open the mobile app in Expo Go or a simulator
2. Navigate through every tab and screen in the app
3. Confirm the Timesheet screen either: (A) works fully with real backend data, or (B) does not appear anywhere in the navigation
4. Open the browser network inspector (or React Native Debugger) and confirm zero 404 errors occur during normal app navigation
5. Check server logs — no requests to a non-existent `/api/timesheets` route during app usage

### Success Metrics
- Option A: Clock-in creates a database record, clock-out updates it, list view shows real data
- Option B: Timesheet screen unreachable, zero 404 errors during navigation
- Zero unhandled errors related to the timesheet screen in either option

---

## Task 8 — Rate Limit Tuning for Production

### Definition of Done
All API rate limits are set to intentional, documented production values. Auth endpoints enforce strict per-IP limits that prevent credential stuffing. The general API enforces limits that prevent scraping while allowing legitimate burst usage. All limits are documented and their values are justified.

### Acceptance Criteria
- [ ] `src/app.js` has been read and the current global rate limit values documented
- [ ] `src/routes/auth.js` has been read and the current auth-specific limits documented
- [ ] Login endpoint: maximum 10 requests per 15 minutes per IP
- [ ] Signup endpoint: maximum 5 requests per hour per IP
- [ ] Password reset request: maximum 5 requests per hour per IP
- [ ] General API (authenticated routes): maximum 300 requests per 15 minutes per IP
- [ ] SMS send endpoint (`src/routes/sms.js`): maximum 20 sends per hour per account (not per IP — account-scoped to prevent SMS spam)
- [ ] Public booking endpoint (`src/routes/booking.js`): maximum 20 booking submissions per hour per IP
- [ ] All rate limiters use `standardHeaders: true` so clients receive `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` headers
- [ ] All rate limiters use `legacyHeaders: false` to suppress the deprecated `X-RateLimit-*` headers
- [ ] All 429 responses return `{ error: "Too many requests. Try again in X minutes." }` — not the default express-rate-limit message
- [ ] Rate limit values are defined as named constants or environment variables, not magic numbers inline
- [ ] Frontend handles 429 responses without crashing — shows a user-readable message
- [ ] Mobile app handles 429 responses without crashing — shows a toast or alert
- [ ] The limits and their justifications are documented in `DEVELOPMENT_GUARDRAILS.md`

### Testing Requirements
1. Hit the login endpoint 11 times in under 15 minutes from the same IP — the 11th must return `429`
2. The 429 response must include a `Retry-After` header indicating seconds until the limit resets
3. The 429 response body must be `{ "error": "Too many requests. Try again in X minutes." }` (not HTML or the default message)
4. Wait for the rate limit window to expire — the 12th login attempt must succeed (assuming valid credentials)
5. Hit the general API endpoint 301 times in 15 minutes — the 301st must return `429`
6. Verify a valid JWT holder is not permanently banned — the rate limit must reset after the window
7. Check the response headers on a normal API call — must include `RateLimit-Limit` and `RateLimit-Remaining`
8. Open the web frontend login page and trigger the rate limit — must show a human-readable error, not a blank screen or generic "Something went wrong"

### Success Metrics
- Login rate limit enforced at 10/15min: confirmed
- General API rate limit enforced at 300/15min: confirmed
- 429 response body matches expected format: confirmed
- `Retry-After` header present on 429 responses: confirmed
- Frontend renders a human-readable error on 429: confirmed
- Mobile app does not crash on 429: confirmed

---

## Task 9 — AI Chat: Per-Account Rate Limiting

### Definition of Done
`src/routes/chat.js` enforces a daily message limit per account. Accounts that have reached the daily limit receive a 429 response with a clear message. The limit resets daily. Unbounded Anthropic API spend from a single account is not possible.

### Acceptance Criteria
- [ ] A business decision on whether to include AI chat at launch has been confirmed and recorded in `DEVELOPMENT_GUARDRAILS.md`
- [ ] A daily message limit has been defined (e.g., 50/day for all plans, or plan-tiered)
- [ ] The limit is enforced in `src/routes/chat.js` before calling the Anthropic API — the API is never called for an over-limit account
- [ ] When the limit is reached, the response is `429 { error: "Daily AI assistant limit reached. Resets at midnight UTC." }`
- [ ] The limit counter increments only after a successful Anthropic API response — failed API calls do not count against the limit
- [ ] The counter resets daily at midnight UTC — not on a rolling 24-hour window
- [ ] The storage mechanism for the counter (table, column, or cache) is documented
- [ ] A migration exists if a new table or column was added, and it is logged in `DEVELOPMENT_GUARDRAILS.md`
- [ ] `client/src/components/ChatWidget.jsx` handles the 429 response and displays the limit message to the user — it does not crash or show a blank state
- [ ] The daily limit value is defined as a constant or environment variable, not a magic number
- [ ] `ANTHROPIC_API_KEY` is confirmed to be in `.env.example` — not hardcoded anywhere

### Testing Requirements
1. Set the daily limit to `3` temporarily
2. Send 3 chat messages from the same account — all must receive valid AI responses
3. Send a 4th chat message — must receive `429 { error: "Daily AI assistant limit reached..." }`
4. Verify the 4th message did NOT result in an Anthropic API call (check server logs or use a spy)
5. Verify the chat widget shows the limit message correctly — not a generic error, not a blank state
6. Verify the counter is stored correctly in the database or cache for the account
7. Simulate midnight UTC by manually resetting the counter — send a message — it must succeed
8. Send a message from a different account — it must succeed (limits are per-account, not global)
9. Restore the daily limit to its real production value
10. If `ANTHROPIC_API_KEY` is not configured: verify the endpoint returns a clear `503 { error: "AI chat is not available." }` rather than crashing

### Success Metrics
- 4th message blocked after daily limit reached: confirmed
- No Anthropic API call made for over-limit request: confirmed
- 429 response body matches expected format: confirmed
- Chat widget renders limit message correctly: confirmed
- Separate accounts have independent counters: confirmed
- Counter resets daily: confirmed

---

## Task 10 — Expired Token Cleanup Cron

### Definition of Done
`src/services/scheduler.js` includes a daily cron job that deletes expired rows from `password_reset_tokens` and `client_portal_tokens`. The job runs at 3:00 AM UTC, logs the number of rows deleted, and handles errors without crashing the scheduler.

### Acceptance Criteria
- [ ] `src/services/scheduler.js` has been read and the existing cron job pattern understood before adding new jobs
- [ ] A new cron job runs daily at `0 3 * * *` (3:00 AM UTC)
- [ ] The job executes: `DELETE FROM password_reset_tokens WHERE expires_at < NOW()`
- [ ] The job executes: `DELETE FROM client_portal_tokens WHERE expires_at < NOW()`
- [ ] Both deletes are wrapped in a try/catch — an error in one does not prevent the other from running
- [ ] The job logs the number of rows deleted for each table (e.g., `[scheduler] Cleaned 3 expired password reset tokens`)
- [ ] If both tables have 0 rows to clean, the job still runs and logs `0 rows cleaned` (confirms it is running)
- [ ] The job does NOT delete unexpired tokens (tokens where `expires_at > NOW()` must be untouched)
- [ ] `password_reset_tokens` has an index on `expires_at` — if not, the index is added as part of this task
- [ ] `client_portal_tokens` has an index on `expires_at` — if not, the index is added as part of this task
- [ ] If indexes were added: they are logged as database changes in `DEVELOPMENT_GUARDRAILS.md`
- [ ] The server starts cleanly after the change — no cron syntax errors
- [ ] Existing scheduled jobs (reminder emails, deposit expiry alerts) are unaffected

### Testing Requirements
1. Insert an expired password reset token: `INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES ('test-expired', 1, NOW() - interval '2 hours')`
2. Insert a valid (non-expired) password reset token: `INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES ('test-valid', 1, NOW() + interval '1 hour')`
3. Insert an expired client portal token similarly
4. Manually invoke the cleanup function (call it directly in a test script, or temporarily change the cron schedule to run immediately)
5. Verify the expired rows are deleted from both tables
6. Verify the valid (non-expired) row is NOT deleted
7. Check server logs — the cleanup job must log the count of deleted rows
8. Start the server fresh and verify no cron syntax errors appear in the startup logs
9. Verify the existing scheduler jobs still fire at their expected times (check logs over the next scheduled run)
10. Run `node test/smoke.js` — all smoke tests must pass

### Success Metrics
- Expired tokens deleted by cron job: confirmed
- Non-expired tokens untouched: confirmed
- Row count logged after each cleanup run: confirmed
- Server starts without cron errors: confirmed
- Existing scheduler jobs unaffected: confirmed
- `expires_at` index exists on both tables: confirmed

---

## Master Acceptance Checklist

Use this summary to track overall sprint completion. A task appears here only when every individual criterion above is checked.

| # | Task | All Criteria Met | Tested | Documented in Guardrails | Final Sign-Off |
|---|------|-----------------|--------|--------------------------|---------------|
| 1 | Multi-tenant isolation audit | ☐ | ☐ | ☐ | ☐ |
| 2 | CORS env-driven config | ☐ | ☐ | ☐ | ☐ |
| 5 | Health check endpoint | ☐ | ☐ | ☐ | ☐ |
| 6 | Stripe webhook raw body | ☐ | ☐ | ☐ | ☐ |
| 4 | Hardcoded URL sweep | ☐ | ☐ | ☐ | ☐ |
| 3 | File upload storage fix | ☐ | ☐ | ☐ | ☐ |
| 7 | TimesheetScreen resolve | ☐ | ☐ | ☐ | ☐ |
| 8 | Rate limit tuning | ☐ | ☐ | ☐ | ☐ |
| 9 | AI chat rate limiting | ☐ | ☐ | ☐ | ☐ |
| 10 | Expired token cleanup cron | ☐ | ☐ | ☐ | ☐ |

**Sprint is complete when all 40 checkboxes above are filled.**

---

## Definitions

**Definition of Done** — The single sentence that is unambiguously true when the task is complete. If you cannot check this sentence against observable reality, the task is not done.

**Acceptance Criterion** — A specific, binary, observable condition. Either it is true or it is not. "Works well" is not an acceptance criterion. "Returns HTTP 200 with `{ status: 'ok' }` when the database is reachable" is an acceptance criterion.

**Testing Requirement** — The exact steps to verify acceptance criteria. Steps are numbered and sequential. Anyone following the steps should reach the same conclusion.

**Success Metric** — A measurable, confirmable outcome. Not a goal or intention — a result that either happened or did not.
