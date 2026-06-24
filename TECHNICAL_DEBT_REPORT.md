# FieldCore — Technical Debt Report

**Last reconciled:** 2026-06-24  
**Source of truth:** Actual codebase scan

Severity levels: **CRITICAL** (blocks launch or security risk) | **HIGH** (significant operational risk) | **MEDIUM** (quality or maintainability issue) | **LOW** (nice to have)

---

## CRITICAL DEBT

### TD-C1: File Upload Storage Not Confirmed
**Severity:** Critical  
**Description:** The codebase includes job photo uploads (mobile) and business logo uploads. The storage destination in production is unknown. If files are written to local disk, they will be lost on every Railway deploy (ephemeral filesystem).  
**Risk:** Data loss of all uploaded photos and logos after every deployment  
**Files:** `src/routes/mobile.js`, `src/routes/business-settings.js`  
**Fix:** Confirm storage mechanism; if local disk, migrate to S3/Cloudflare R2/Railway volumes before first production use  
**Effort:** 2-4 hours investigation + migration

---

### ~~TD-C2: Multi-Tenant Isolation Not Audited~~ — RESOLVED 2026-06-09
**Resolution:** Sprint Task 1 complete. All 27 route files audited. Fixed: `users.js` (3 critical membership endpoint bugs), `clients.js`, `jobs.js`, `deposits.js`, `payments.js` (defense-in-depth). 22 files confirmed clean. Smoke tests 44/44 pass.

---

### TD-C3: No Unit or Integration Tests
**Severity:** Critical  
**Description:** Only a `test/smoke.js` file exists. There are no unit tests for business logic and no integration tests for API endpoints.  
**Risk:** Regressions undetected; cannot safely refactor; bugs found by customers instead of CI  
**Fix:** At minimum, write integration tests for auth, payments, jobs, and clients before launch  
**Effort:** 10-20 hours for meaningful coverage

---

### TD-C4: No CI/CD Pipeline
**Severity:** Critical  
**Description:** There is a `.deploy-trigger` file suggesting manual deploys. No automated test-on-commit or deploy pipeline.  
**Risk:** Breaking changes ship to production; no automated regression detection  
**Fix:** Set up GitHub Actions (or Railway auto-deploy from main branch) with at least: lint + smoke test before deploy  
**Effort:** 2-4 hours

---

## HIGH DEBT

### TD-H1: `console.log` Statements in Production Code
**Severity:** High  
**Description:** Development logging may expose sensitive data (user emails, account IDs, error details) in production logs.  
**Risk:** Information disclosure in logs  
**Files:** Unknown distribution — needs audit  
**Fix:** Audit and remove or replace with structured logging (e.g., `winston` or `pino`)  
**Effort:** 2-4 hours

---

### ~~TD-H2: Hardcoded Values — Development URLs~~ — RESOLVED 2026-06-10
**Resolution:** Sprint Task 4 complete. Full grep of src/, mobile/, client/src/ for hardcoded domains, deprecated domains (fieldcore.app, api.fieldcore.app, fieldcore-production-ee0d.up.railway.app), and missing env var usage. Fixed: mobile/api.js, mobile/app.config.js, src/services/email.js, src/routes/webhooks.js, src/routes/phone.js, src/services/scheduler.js. .env.example updated with EXPO_PUBLIC_API_URL and VITE_API_URL entries. Intentionally kept: localhost:5173 fallbacks in backend route files (safe dev defaults). 44/44 smoke tests pass.

---

### ~~TD-H2a: /api/auth/me returned wrong accountName after entity switch~~ — RESOLVED 2026-06-24
**Resolution:** `/me` joined on `u.account_id` (home account), ignoring the JWT's `accountId`. Fixed to join on `payload.accountId`. Role resolution fixed via `CASE WHEN u.account_id = $2 THEN u.role ELSE am.role`. Response now uses `accountId: payload.accountId`. Topbar and dashboard both display the correct business name after switch.

---

### ~~TD-H2b: Phone-width gate blocked mobile dashboard access~~ — RESOLVED 2026-06-24
**Resolution:** `isPhone` state and gate removed from `client/src/App.jsx`. Dashboard now accessible on all screen widths. Existing responsive CSS (768px, 390px breakpoints, bottom nav, sidebar overlay) handles mobile layout correctly. Build passes.

---

### ~~TD-H2c: Entity switcher had no loading/error state~~ — RESOLVED 2026-06-24
**Resolution:** `switching` and `switchError` state added to `AuthContext`. `switchAccount` wrapped in try/catch. Entity panel shows "Switching…" label, disabled buttons, and inline error. Single-entity users see hint pointing to /entities. Also fixed: `setSwitching(false)` was never called on success, leaving the switcher permanently frozen after a successful switch.

---

### TD-H2d: `messages.read_at` column missing on Railway DB
**Severity:** High  
**Description:** The `migrate.js` script defines a `read_at` column on the `messages` table, but the Railway PostgreSQL database does not have it. `GET /api/phone/conversations` was failing with `column m.read_at does not exist`.  
**Risk:** Communications page broken for all users; no unread message tracking  
**Files:** `src/routes/phone.js`, `src/migrate.js`  
**Current state:** Worked around with try/catch fallback in the route (2026-06-24). Primary query uses `read_at`; on error, falls back to base query with `unread_messages: 0`.  
**Fix needed:** Run `ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;` on Railway DB, then remove the fallback in `phone.js`.  
**Effort:** 5 minutes (SQL migration on Railway console)

---

### TD-H3: No Error Monitoring / Alerting
**Severity:** High  
**Description:** No error tracking service (Sentry, Rollbar, etc.) is integrated. Production errors will only appear in Railway logs.  
**Risk:** Silent failures; no alerting when the app is broken  
**Fix:** Add Sentry (or similar) to backend and frontend; set up error alerts  
**Effort:** 2-3 hours

---

### TD-H4: Audit Log Has No Admin Viewer
**Severity:** High  
**Description:** `audit_logs` table is being written to but there is no UI to view it. Operators and the platform admin cannot review suspicious activity.  
**Risk:** Security incidents go unnoticed  
**Fix:** Build a basic audit log viewer in the admin/settings area  
**Effort:** 3-5 hours

---

### ~~TD-H5: CORS Configuration Not Verified for Production~~ — RESOLVED 2026-06-09
**Resolution:** Sprint Task 2 complete. `src/app.js` CORS now reads from `APP_URL` env var via `buildAllowedOrigins()`. Apex domain + `www.` variant auto-derived. Localhost only in dev. Production warning if `APP_URL` missing. 44/44 smoke tests pass.

---

### TD-H6: Rate Limiting Not Tuned for Production
**Severity:** High  
**Description:** `express-rate-limit` is configured but default limits may not be appropriate. Auth routes likely have stricter limits but API routes may be too permissive.  
**Risk:** Abuse, scraping, or DoS on insufficiently limited endpoints  
**Files:** `src/app.js`, `src/routes/auth.js`  
**Fix:** Review all rate limit configurations; document the intended limits  
**Effort:** 1-2 hours

---

## MEDIUM DEBT

### TD-M1: No Structured Logging
**Severity:** Medium  
**Description:** Logging appears to be `console.log/error`. Production logs will be unstructured and hard to query.  
**Fix:** Replace with `winston` or `pino` with JSON output; add request ID correlation  
**Effort:** 3-5 hours

---

### ~~TD-M2: No Health Check Endpoint~~ — RESOLVED 2026-06-09
**Resolution:** Sprint Task 5 complete. `GET /health` returns `{ status, db, uptime, timestamp }` with a real `SELECT 1` DB check and 2-second timeout. 44/44 smoke tests pass.

---

### TD-M3: Sendblue Provider Switching Is Env-Var Only
**Severity:** Medium  
**Description:** Switching between Twilio and Sendblue requires a server restart (env var change). There is no runtime toggle.  
**Risk:** Operational inflexibility  
**Fix:** Either commit to one provider, or add a per-account DB setting for messaging provider  
**Effort:** 2-3 hours

---

### TD-M4: Scheduler Not Monitored
**Severity:** Medium  
**Description:** `src/services/scheduler.js` runs reminder and deposit expiry cron jobs. There is no monitoring to detect if the scheduler fails silently.  
**Risk:** Reminders stop sending with no alert  
**Fix:** Add heartbeat logging; add error alerting if job throws  
**Effort:** 1-2 hours

---

### TD-M5: No Database Backup Strategy
**Severity:** Medium  
**Description:** No documented backup plan for the production PostgreSQL database.  
**Risk:** Data loss on database failure  
**Fix:** Enable Railway database backups (built-in); document retention policy  
**Effort:** 30 min

---

### TD-M6: Missing Input Validation on Several Endpoints
**Severity:** Medium  
**Description:** Not all API routes have been audited for input validation (type checking, length limits, injection prevention). Express 5 handles some errors automatically but custom validation may be missing.  
**Risk:** Data integrity issues; potential injection if any raw SQL construction exists  
**Fix:** Audit all routes for proper input validation; add `express-validator` or `zod` for request parsing  
**Effort:** 5-10 hours

---

### TD-M7: AI Chat Has No Cost Controls
**Severity:** Medium  
**Description:** `src/routes/chat.js` calls the Anthropic API with no per-account rate limiting or usage caps.  
**Risk:** One abusive user could generate unbounded API costs  
**Fix:** Add per-account daily/monthly token limits; implement cost tracking  
**Effort:** 2-3 hours

---

### TD-M8: Password Reset Tokens — No Explicit Cleanup
**Severity:** Medium  
**Description:** `password_reset_tokens` has 1-hour expiry but it's unclear if expired tokens are cleaned up from the DB.  
**Risk:** Table growth over time; minor security hygiene issue  
**Fix:** Add a cron job or DB-level cleanup for expired tokens  
**Effort:** 30 min

---

### TD-M9: Mobile `TimesheetScreen.js` — Scope Unclear
**Severity:** Medium  
**Description:** A `TimesheetScreen` exists in the mobile app but timesheet tracking is not one of the 6 MVP modules and does not appear in the backend routes.  
**Risk:** Screen exists in app but may have no backend support  
**Files:** `mobile/screens/TimesheetScreen.js`  
**Fix:** Either implement backend support or remove the screen for the MVP  
**Effort:** 1 hour investigation

---

## LOW DEBT

### TD-L1: No API Documentation
**Severity:** Low  
**Description:** 27 route files with no OpenAPI/Swagger documentation.  
**Fix:** Add OpenAPI spec; consider using `swagger-jsdoc` on routes  
**Effort:** 10-20 hours for full coverage

---

### TD-L2: Frontend TypeScript Not Strictly Typed
**Severity:** Low  
**Description:** TypeScript is configured but `tsconfig.json` strict mode may not be fully enforced across all 38 pages.  
**Fix:** Run `tsc --noEmit` and resolve all type errors  
**Effort:** 4-8 hours

---

### TD-L3: No Storybook or Component Documentation
**Severity:** Low  
**Description:** 13 reusable components with no documented props or usage examples.  
**Fix:** Add JSDoc comments to component props; optionally add Storybook  
**Effort:** 2-4 hours (JSDoc only)

---

### TD-L4: `generate_icons.py` Script Undocumented
**Severity:** Low  
**Description:** A Python script for icon generation exists at the root with no explanation of when/how to use it.  
**Fix:** Add a comment header or note in `CLAUDE_CODE_ONBOARDING.md`  
**Effort:** 15 min

---

### TD-L5: `FIELDCORE_LAUNCH_AUDIT_REPORT.json` — Unknown Provenance
**Severity:** Low  
**Description:** A JSON file at the project root labeled as a launch audit report. Unclear if this is authoritative, outdated, or auto-generated.  
**Fix:** Review contents; if outdated, remove or archive  
**Effort:** 30 min

---

## DEBT SUMMARY

| Severity | Count | Must-fix Before Launch? |
|----------|-------|------------------------|
| Critical | 4 | Yes |
| High | 6 | Yes (TD-H1, TD-H2, TD-H5, TD-H6) / Soon (TD-H3, TD-H4) |
| Medium | 9 | Some (TD-M2, TD-M6) / Post-launch OK |
| Low | 5 | Post-launch |

**Minimum debt to address before first real user:**
- TD-C1 (file storage), TD-C2 (multi-tenant isolation), TD-H2 (hardcoded URLs), TD-H5 (CORS), TD-H6 (rate limits), TD-M2 (health check endpoint), TD-M6 (input validation audit)
