# FieldCore — Decisions Log

**Purpose:** Record every significant decision made during development — architectural, business, scope, or operational. This prevents decisions from being relitigated, gives future contributors context, and creates an audit trail.

**Format:** Newest entries at top. One entry per decision. Use the template below.

---

## Template

```
### [DECISION-NNN] Short decision title
**Date:** YYYY-MM-DD
**Decided by:** [Kevin / Claude / Kevin + Claude]
**Status:** ACTIVE | SUPERSEDED by DECISION-NNN | REVERSED

**Context:** Why was this decision needed? What problem was being solved?

**Decision:** What was decided?

**Alternatives considered:** What else was evaluated?

**Reasoning:** Why was this option chosen over alternatives?

**Consequences:** What does this decision enable or foreclose?
```

---

## Decisions

---

### [DECISION-013] migrate.js backfilled with all schema.sql entries missing from the migration runner
**Date:** 2026-06-09  
**Decided by:** Claude (Sprint Task 5)  
**Status:** ACTIVE

**Context:** `src/db/migrate.js` (runs on every server start) was missing 40+ schema statements that existed in `src/db/schema.sql` but had never been added to the migration runner. These had been applied historically via `init-db.js` (which applies the full schema.sql in one shot), so the development DB had all columns. After a server restart that ran migrate.js from scratch, three smoke test failures appeared: `users.is_available` missing (breaking `/api/auth/me`), `jobs.service_address` missing (breaking `POST /api/jobs`), `reviews` table missing (breaking analytics), and `invoices.line_items` missing (breaking invoice creation).

**Decision:** Backfill all missing schema elements into migrate.js in one comprehensive update rather than adding only the three immediately failing entries.

**Alternatives considered:** Add only the three blocking entries. Rejected — the incremental approach would leave the remaining gaps for future failures with no clear signal of when they'd surface.

**Reasoning:** A migration runner that diverges from schema.sql is a latent failure waiting for a fresh DB (new engineer, new environment, production provisioning). Making migrate.js the complete, authoritative schema driver removes that risk entirely.

**Consequences:** `src/db/migrate.js` is now the canonical schema runner. `init-db.js` remains as a convenience script for one-shot DB initialization but is no longer the only correct path. Future schema additions must go into migrate.js (not just schema.sql).

---

### [DECISION-012] Task 1 isolation audit fixed users.js membership endpoints as critical security bugs
**Date:** 2026-06-09  
**Decided by:** Claude (Sprint Task 1)  
**Status:** ACTIVE

**Context:** During the multi-tenant isolation audit (Task 1), three endpoints in `src/routes/users.js` were found with cross-account security vulnerabilities:
- `GET /:id/memberships` — any owner could read membership data for any user on the platform
- `POST /:id/memberships` — caller could grant access to any account by supplying a foreign `account_id` in the request body
- `DELETE /:id/memberships/:accountId` — caller could revoke memberships in accounts they don't own

**Decision:** Fix all three as security bugs. Classify defense-in-depth gaps in `clients.js`, `jobs.js`, `deposits.js`, `payments.js` as secondary fixes.

**Alternatives considered:** Mark as low severity (protected by initial ownership check). Rejected because membership endpoints had no initial ownership check — they were true exploitable cross-account reads.

**Reasoning:** Multi-tenant isolation is a non-negotiable security requirement. Any cross-account data exposure is a security bug regardless of exploitability in practice.

**Consequences:** `POST /:id/memberships` no longer accepts `account_id` in the request body — it always uses `req.accountId`. Any caller that passed a different account_id had that silently ignored. No legitimate caller would do this.

---

### [DECISION-011] Partner Program: static landing page only at launch
**Date:** 2026-06-09  
**Decided by:** Claude (MVP scope analysis)  
**Status:** ACTIVE

**Context:** `client/src/pages/Partners.jsx` exists as a marketing page for a referral partner program. No formal program terms, commission tracking, or management backend exists.

**Decision:** Keep the static page. Do not build partner management backend before launch. Accept partner applications via the contact form.

**Reasoning:** A static landing page creates no technical debt and costs nothing to ship. A full partner management system is a significant build that should wait until the core product is stable and there is actual partner demand.

**Consequences:** Partner applications are not systematically tracked. This is acceptable for launch.

---

### [DECISION-010] Sendblue: defer to post-launch; Twilio only at launch
**Date:** 2026-06-09  
**Decided by:** Claude (MVP scope analysis)  
**Status:** ACTIVE

**Context:** Both Twilio and Sendblue SMS providers are implemented. Sendblue supports iMessage/RCS delivery. The switch is via `MESSAGING_PROVIDER` env var.

**Decision:** Launch with Twilio only. Sendblue remains implemented but unconfigured.

**Reasoning:** Reducing the number of external service credentials required for launch. Twilio covers the SMS requirement fully. Sendblue can be activated per-operator if there is demand.

**Consequences:** No iMessage/RCS delivery at launch. Operators with iPhone clients will receive regular SMS.

---

### [DECISION-009] Stripe Connect: defer to V2
**Date:** 2026-06-09  
**Decided by:** Claude (MVP scope analysis)  
**Status:** ACTIVE

**Context:** `src/routes/connect.js` implements Stripe Connect for contractor payout routing. Stripe Connect requires a separate application process and Stripe approval for platform accounts.

**Decision:** Defer Stripe Connect configuration to post-launch V2.

**Reasoning:** Not needed for MVP — operators collect payments directly via their own Stripe accounts (via Stripe Checkout). The 1% platform fee via Stripe Connect can be added later.

**Consequences:** Platform fee cannot be collected at launch. Revenue stream 2 (1% platform fee) is deferred.

---

### [DECISION-008] Plan name reconciliation required before billing goes live
**Date:** 2026-06-09  
**Decided by:** Claude (codebase audit)  
**Status:** ACTIVE — unresolved, blocks billing

**Context:** Critical naming mismatch discovered during MVP scope review:
- `src/middleware/planLimits.js`: uses `starter / growth / scale`
- `src/routes/billing.js`: uses `solo / pro / scale`
- `src/routes/webhooks.js`: uses `solo / pro / scale`
- `src/routes/chat.js` system prompt: references Solo/Pro/Scale ($49/$99/$199)

A paying Pro customer gets Starter-tier limits because the middleware doesn't recognize `pro` as a valid plan name.

**Decision:** This must be resolved before billing is enabled. The canonical plan names need to be standardized across all files.

**Alternatives considered:** Standardize on `starter/growth/scale` (matches planLimits.js). Standardize on `solo/pro/scale` (matches Stripe price ID env var names). Create a mapping function.

**Reasoning:** Decision pending Kevin's input on final plan name choice. The env var names `STRIPE_PRICE_SOLO`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_SCALE` suggest `solo/pro/scale` may be the intended canonical names.

**Consequences:** Until resolved, billing cannot go live safely. A paying `pro` customer would get `starter` limits.

---

### [DECISION-007] File uploads: local disk confirmed, migration to cloud storage required
**Date:** 2026-06-09  
**Decided by:** Claude (codebase audit)  
**Status:** ACTIVE — unresolved, blocks real user uploads

**Context:** `src/routes/mobile.js` uses `multer.diskStorage({ destination: path.join(__dirname, '../../uploads') })`. Railway uses an ephemeral filesystem. Every deploy wipes the `uploads/` directory.

**Decision:** File uploads must be migrated to persistent cloud storage (Cloudflare R2 or AWS S3) before real users upload photos. This is Sprint Task 3.

**Reasoning:** Data loss is non-negotiable. A technician uploads job evidence photos; the operator deploys a hotfix; the photos are gone with no error or warning. This destroys trust.

**Consequences:** Task 3 requires adding an S3/R2 SDK, new env vars, and rewriting the upload handlers. Estimated 2–4 hours.

---

### [DECISION-006] TimesheetScreen: business decision required before Task 7
**Date:** 2026-06-09  
**Decided by:** Claude (codebase audit)  
**Status:** ACTIVE — awaiting Kevin's decision

**Context:** `mobile/screens/TimesheetScreen.js` is in the mobile navigation but has hardcoded placeholder data (line 65: `if (i === 2) return 3.5` as fake timesheet data). No backend route or database table exists. Screen makes no API calls.

**Decision:** Kevin must decide before Task 7: (A) remove the screen from navigation, or (B) implement a minimal timesheets backend. Both options block the EAS build.

**Option A cost:** 30 minutes (delete navigation entry, optionally keep file as stub).  
**Option B cost:** 4–6 hours (new route, new DB table, wire up screen).

**Consequences:** EAS build cannot proceed until this is resolved. A distributed mobile app binary cannot be patched without a new App Store / Play Store submission.

---

### [DECISION-005] CORS: already has production domains hardcoded; Task 2 is still needed
**Date:** 2026-06-09  
**Decided by:** Claude (codebase audit)  
**Status:** ACTIVE

**Context:** `src/app.js` has `ALLOWED_ORIGINS` array hardcoded with both production URLs (`https://getfieldcore.com`, `https://www.getfieldcore.com`, `https://fieldcore-production-ee0d.up.railway.app`) plus localhost. Task 2 in the sprint plan assumed CORS was not configured.

**Decision:** Task 2 is still valuable — should make CORS configuration env-driven rather than hardcoded, so changing the production URL does not require a code change.

**Reasoning:** Hardcoded URLs create a maintenance problem. Every domain change requires a code push. An env-driven approach is more robust and standard.

**Consequences:** Task 2 scope is clarified: not "add CORS" (already done) but "make CORS env-driven."

---

### [DECISION-004] Stripe webhook raw body: already correctly implemented
**Date:** 2026-06-09  
**Decided by:** Claude (codebase audit)  
**Status:** ACTIVE

**Context:** Sprint Task 6 assumed the Stripe webhook raw body parsing might be broken (a common Express/Stripe mistake). Audit found it is already correctly implemented: the webhook route is mounted at line 136 of `src/app.js` before `express.json()`, and uses `express.raw({ type: 'application/json' })` inline.

**Decision:** Task 6 scope is clarified: not "fix" but "verify with Stripe CLI." The implementation looks correct; it needs a live test with real Stripe test keys to confirm.

**Consequences:** Task 6 is lower effort than planned. Still must be done before going live.

---

### [DECISION-003] Health endpoint: already exists, needs database check added
**Date:** 2026-06-09  
**Decided by:** Claude (codebase audit)  
**Status:** ACTIVE

**Context:** Sprint Task 5 assumed no health check endpoint exists. Audit found `app.get('/health', (req, res) => res.json({ status: 'ok' }))` at line 171 of `src/app.js`. However, it returns `{ status: 'ok' }` unconditionally — no database connectivity check.

**Decision:** Task 5 scope is clarified: add database connectivity check (SELECT 1 with timeout) to existing `/health` endpoint, not create a new one.

**Consequences:** Task 5 is a 15-minute modification, not a 30-minute creation.

---

### [DECISION-002] Admin alert email hardcoded in billing.js
**Date:** 2026-06-09  
**Decided by:** Claude (codebase audit)  
**Status:** ACTIVE — should be moved to env var before launch

**Context:** `src/routes/billing.js` line 497 has `['admin@getfieldcore.com', 'kevincaines925@gmail.com']` hardcoded as admin alert recipients. This should be an env var so it can be changed without a code deploy.

**Decision:** Move to `ADMIN_ALERT_EMAIL` env var in `.env.example` as part of Task 4 (hardcoded URL sweep) or as a standalone small fix.

**Consequences:** Until fixed, changing the admin alert email requires a code change and redeploy.

---

### [DECISION-001] Architecture: Express.js backend, not Next.js
**Date:** 2026-06-09  
**Decided by:** Claude (codebase reconciliation)  
**Status:** ACTIVE

**Context:** Session prompts and project documentation occasionally reference a Next.js 14 App Router architecture. The actual codebase uses Express.js (backend), React/Vite (web dashboard), Next.js 16 (marketing site only), and Expo (mobile).

**Decision:** All documentation reflects the actual codebase. The Next.js 14 architecture described in some prompts was a planned future state that has not been implemented. Documentation, CLAUDE.md, and all guides reference the real stack.

**Reasoning:** Building documentation for a planned architecture creates confusion and causes future sessions to build code inconsistent with what exists.

**Consequences:** If a Next.js migration is planned, a new decision entry should be added when that work begins.

---

*Add new entries at the top, not the bottom.*  
*Use DECISION-NNN numbering, incrementing by 1.*  
*Next entry should be DECISION-013.*
