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

### [DECISION-028] Calendar Agenda view uses custom AgendaEvent component + full CSS override
**Date:** 2026-06-25
**Decided by:** Kevin + Claude
**Status:** ACTIVE

**Context:** The react-big-calendar Agenda view rendered with default dark gray/blue row blocks and unstyled headers. The `eventPropGetter` (which correctly adds colored background chips to month/week/day events) was applying the same status background colors to the full-width agenda rows, making them unreadable.

**Decision:** Two-part fix: (1) CSS — override all `.rbc-agenda-*` selectors with FieldCore design tokens (navy header bar, white rows, DM Mono columns, subtle borders, styled empty state). (2) JavaScript — added `AgendaEvent` component rendered as `components.agenda.event` that shows a 7px status-color dot + bold service name + muted client name. `eventStyleGetter` now checks `view === 'agenda'` and returns transparent/no-background styles so the colored block doesn't show behind the component.

**Alternatives considered:** Pure CSS override only (no component). Rejected — inline styles from `eventPropGetter` override CSS specificity and the background could bleed through. Custom component + transparent eventStyleGetter is the correct pattern.

**Reasoning:** The `components.agenda.event` render prop is the intended extension point for customising agenda rows. Using it alongside CSS overrides gives full control without fighting specificity battles.

**Consequences:** Agenda view now matches the rest of the FieldCore UI. Month/Week/Day views are unaffected. Status colors are preserved as small dots in the agenda row.

---

### [DECISION-027] Typography utility classes use fc- prefix to avoid collision
**Date:** 2026-06-24
**Decided by:** Kevin + Claude
**Status:** ACTIVE

**Context:** Adding typography utility classes to `style.css` — needed a naming convention that wouldn't conflict with existing classes (`.stat-card`, `.dash-sc-l`, etc.) or common framework names.

**Decision:** All typography utility classes use the `fc-` prefix: `.fc-page-title`, `.fc-section-title`, `.fc-card-title`, `.fc-label`, `.fc-body`, `.fc-muted`, `.fc-stat-number`, `.fc-currency`, `.fc-th`, `.fc-td`.

**Alternatives considered:** No prefix (conflicts with existing classes). `t-` prefix (too terse). BEM block syntax (verbose for single-purpose utilities).

**Reasoning:** `fc-` is short, project-unique, and makes grep-for-all-typography trivial.

**Consequences:** All new typography in new components should use these classes. Existing components may use inline styles — migration is optional, not required.

---

### [DECISION-026] StatusBadge auto-formats Title Case — no explicit label required
**Date:** 2026-06-24
**Decided by:** Kevin + Claude
**Status:** ACTIVE

**Context:** Early StatusBadge implementation showed labels in lowercase (e.g., "active" instead of "Active") because the raw status string was used directly.

**Decision:** Added `toTitleCase()` function to StatusBadge. `label = children != null ? children : toTitleCase(status || '')`. All underscore-separated values (e.g., `in_progress`) are converted to space-separated Title Case ("In Progress").

**Alternatives considered:** Require callers to always pass `children` with explicit label. Rejected — too much boilerplate.

**Reasoning:** A shared component should handle formatting; callers pass status strings, not display strings. Custom labels are still possible via `children`.

**Consequences:** All StatusBadge renders are Title Case by default. Callers can override with `children` for edge cases.

---

### [DECISION-025] Entities "Current" badge (sand) is semantically distinct from "Active" StatusBadge
**Date:** 2026-06-24
**Decided by:** Kevin + Claude
**Status:** ACTIVE

**Context:** Entities page was showing two badges for the current active entity: a sand-colored "Active" badge (for `isCurrent`) AND a blue "Active" StatusBadge (for `entity.is_active === true`). This was visually confusing and semantically redundant.

**Decision:** Sand badge renamed to "Current" (indicates this is the selected entity context). StatusBadge (`status="inactive"`) only shown for inactive entities — not for active ones. Result: active+current entity shows only "Current" (sand). Active+non-current shows nothing. Inactive entity shows "Inactive" (gray StatusBadge).

**Alternatives considered:** Remove sand badge entirely, rely on StatusBadge only. Rejected — "Current" has distinct meaning (selected entity, not just active status).

**Reasoning:** Two badges for the same condition is never correct. Semantic distinction: "Current" = which entity you're operating as; "Active/Inactive" = whether the entity record is enabled.

**Consequences:** No more duplicate badge problem. Clear visual hierarchy: sand = context, StatusBadge = state.

---

### [DECISION-024] Payout schedule preference saved to Stripe even when Connect is not yet active
**Date:** 2026-06-24
**Decided by:** Kevin + Claude
**Status:** ACTIVE

**Context:** The payout schedule dropdown should be available before Stripe Connect is fully active so operators can set their preference during setup.

**Decision:** Show payout schedule dropdown when connect.status === 'active'. When Connect is not yet active, show note: "Saved preference. Stripe payout automation requires Stripe Connect setup." POST endpoint validates interval (daily/weekly/monthly/manual) and saves to Stripe account settings.

**Alternatives considered:** Only show dropdown when Connect is active. Rejected — operators lose their preference if they set it up later.

**Reasoning:** Pre-configuring payout schedule is low-risk and saves a step during Connect onboarding. The note clearly communicates the dependency.

**Consequences:** Operators can set payout schedule at any time; it takes effect once Connect is active.

---

### [DECISION-023] StatusBadge is the only badge system — per-page badge logic is tech debt
**Date:** 2026-06-24
**Decided by:** Kevin + Claude
**Status:** ACTIVE

**Context:** 15+ pages each had their own `STATUS_COLORS`, `STATUS_CLS`, `dash-jbadge`, or similar badge logic. This caused inconsistent colors, varying label formats, and no shared design contract.

**Decision:** All badge rendering goes through `client/src/components/StatusBadge.jsx`. Per-page badge objects are removed when a page is touched. StatusBadge handles: color variant lookup, Title Case formatting, pill design (no border, 2px 8px padding, borderRadius 99).

**Alternatives considered:** Keep per-page systems — rejected (duplicate logic, inconsistent colors). Use a library — rejected (overkill for 5 variants).

**Reasoning:** Single source of truth for badge design. New statuses added to StatusBadge benefit all pages immediately.

**Consequences:** Any new status string must be added to `STATUS_TO_VARIANT` in StatusBadge.jsx. Pages not yet updated still use their local badge systems until touched.

---

### [DECISION-022] Billing downgrade must route to human support, not automatic plan change
**Date:** 2026-06-24
**Decided by:** Kevin + Claude
**Status:** ACTIVE

**Context:** The `DowngradeModal` in `Billing.jsx` previously called Stripe Checkout or plan-change logic (or was wired to do so). User explicitly instructed: do not automate downgrades, do not fake billing changes, do not call Stripe downgrade logic unless it was intentionally designed.

**Decision:** `DowngradeModal` now shows the features that will be lost (amber warning block), an email contact link (`mailto:support@getfieldcore.com` with pre-filled subject line), and a phone contact link (`tel:+18884302777` showing `(888) 430-2777`). No Stripe API call is made.

**Alternatives considered:** Auto-cancel Stripe subscription via API. Rejected — downgrade has business consequences (data loss, feature removal) that require human review.

**Reasoning:** Prevents accidental plan changes; ensures a support agent can verify intent and handle data/seat impacts manually; avoids unintended charges or reversals.

**Consequences:** Users who want to downgrade must contact support. Support team must be staffed to handle these requests. Until then, email/phone are the only paths.

---

### [DECISION-021] `read_at` DB error handled with try/catch fallback, not emergency migration
**Date:** 2026-06-24
**Decided by:** Kevin + Claude
**Status:** ACTIVE

**Context:** The Railway PostgreSQL database is missing the `read_at` column on the `messages` table, causing `GET /api/phone/conversations` to return a 500 error and breaking the Communications page entirely.

**Decision:** Wrap the conversations query in try/catch. Primary query includes `read_at` (unread count). On the specific `column m.read_at does not exist` error, fall back to a base query that omits `read_at` and returns `unread_messages: 0`. Page loads correctly in both cases.

**Alternatives considered:** Run the migration immediately via Railway console SQL. Not done in-session — that's a production DB operation requiring user action.

**Reasoning:** The fallback is safer than either breaking the page or requiring an immediate unplanned migration during a UI sprint. The fix is documented in LAUNCH_BLOCKERS.md and TECHNICAL_DEBT_REPORT.md with the exact SQL needed.

**Consequences:** Communications page works. Unread message counts show 0 until `ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;` is run on Railway.

---

### [DECISION-020] Client list uses real invoice subqueries — no fake spending data
**Date:** 2026-06-24
**Decided by:** Kevin + Claude
**Status:** ACTIVE

**Context:** The client list needed to show LTV, outstanding balance, and last invoice info. These could be mocked/hardcoded or fetched from real DB data.

**Decision:** Enhanced `GET /api/clients` with SQL subqueries: `last_invoice_at`, `last_invoice_status`, `outstanding_balance` (sum of pending invoices) all come from the `invoices` table. If a client has no invoices, values are `null` / `0` and the UI shows `—`.

**Alternatives considered:** Mock data in frontend. Rejected — explicitly against project requirements.

**Reasoning:** Real data is always preferable; the invoices table already exists and is correctly account-scoped. Adding subqueries is low risk and gives accurate information.

**Consequences:** Client list accurately reflects actual invoicing state. Outstanding balance draws from `status = 'pending'` invoices only.

---

### [DECISION-019] Entity switcher `setSwitching(false)` must be called on success, not only on error
**Date:** 2026-06-24
**Decided by:** Kevin + Claude
**Status:** ACTIVE

**Context:** After a successful entity switch, the entity panel remained in a frozen/loading state indefinitely. Users had to refresh the page to continue.

**Decision:** Add `setSwitching(false)` to the success path of `switchAccount` in `AuthContext.jsx`, immediately after `setUser`. Previously it was only called in the `catch` block.

**Alternatives considered:** None — this was a clear missing line, not a design question.

**Reasoning:** `switching` is set to `true` at the start of the switch. It must be reset to `false` on both success and failure. The catch handled failure; success did not.

**Consequences:** Entity switcher is now responsive immediately after a successful switch with no extra delay.

---

### [DECISION-018] /api/auth/me must join on payload.accountId, not u.account_id
**Date:** 2026-06-24
**Decided by:** Kevin + Claude
**Status:** ACTIVE

**Context:** The `/api/auth/me` endpoint was running `JOIN accounts a ON a.id = u.account_id`. The `u.account_id` column always stores the user's *home* (original) account. After switching entities, the JWT payload contains a different `accountId`, but `/api/auth/me` ignored it and always returned the home account's name, plan, and role. This meant the topbar and all frontend state showed the wrong business after switching.

**Decision:** Change the query to `JOIN accounts a ON a.id = $2` where `$2 = payload.accountId`. Also resolve `role` correctly: `CASE WHEN u.account_id = $2 THEN u.role ELSE am.role END` — home-account owners use their `users.role`; cross-account members use their `account_memberships.role`. The response explicitly sets `accountId: payload.accountId` (not `r.account_id`) to prevent the home account ID from leaking back.

**Alternatives considered:** Parse accountId client-side from the JWT. Rejected — the frontend should not decode JWTs; the server is the authoritative source of user context.

**Reasoning:** The JWT is the source of truth for which entity is active. The `/me` route should reflect the JWT's entity, not the user's home account. This is the minimal correct fix that doesn't change any other behavior.

**Consequences:** After any entity switch + page reload, `user.accountName`, `user.plan`, `user.role`, and `user.accountId` from `useAuth()` correctly reflect the switched-to entity. All frontend displays that read from these fields now show the right business.

---

### [DECISION-017] Remove phone-width gate — dashboard now accessible on all screen sizes
**Date:** 2026-06-24
**Decided by:** Kevin + Claude
**Status:** ACTIVE

**Context:** `client/src/App.jsx` had a hard gate: any authenticated user on a device narrower than 640px was blocked from the dashboard entirely, shown a "Better on a bigger screen" interstitial. The mobile responsive CSS (sidebar overlay, hamburger, bottom nav, stacked grids) was already fully built but never reachable on phones because of this gate.

**Decision:** Remove the `isPhone` state and the gate entirely. All screen widths now reach the authenticated dashboard. The existing responsive CSS handles layout automatically.

**Alternatives considered:** Keep the gate but raise the threshold; add a mobile-optimized simplified dashboard. Both rejected — the CSS already does the right thing at 768px and 390px breakpoints; adding a separate simplified dashboard is unnecessary complexity.

**Reasoning:** The existing responsive CSS (built in commit `8132255`) handles all breakpoints correctly. The gate was a holdover from before the mobile CSS was complete. Removing it immediately unblocks phone users.

**Consequences:** Phone users can now access the dashboard. Bottom nav provides primary navigation. Sidebar slides in as an overlay. Content is scrollable and stacked appropriately.

---

### [DECISION-016] Entity switcher: add error handling and loading state; engine was already complete
**Date:** 2026-06-24
**Decided by:** Kevin + Claude
**Status:** ACTIVE

**Context:** The entity switching engine (backend `/api/auth/switch`, frontend `switchAccount` in AuthContext, entity panel in App.jsx) was already fully implemented. The reported symptom of "does nothing when clicked" was due to: (1) single-entity users clicking their active entity — the `if (!isActive)` guard correctly prevents a no-op API call; (2) no error feedback if the backend call failed; (3) no loading state during the ~1s API round-trip.

**Decision:** Add `switching`/`switchError` state to AuthContext with try/catch in `switchAccount`. Expose both in context. Entity panel buttons use these for disabled state, "Switching…" label, and error display. Single-entity users see a hint linking to `/entities`.

**Alternatives considered:** Build a new entity switching engine from scratch. Rejected — the existing engine is correct and works for multi-entity accounts.

**Reasoning:** The engine worked; the UX didn't communicate what was happening. Error handling and loading state are the right fix.

**Consequences:** Entity switcher now shows clear feedback. Single-entity users understand they need to add entities. Switch failures show an error message instead of silently failing.

---

### [DECISION-015] Login logo clickable; sidebar logo links to /dashboard
**Date:** 2026-06-24
**Decided by:** Kevin + Claude
**Status:** ACTIVE

**Context:** The FieldCore logo in the login card (`div.login-logo`) was a non-interactive div. The sidebar logo in the authenticated shell was also a non-interactive div. Neither provided navigation shortcuts.

**Decision:** Login logo → `<a href="/">` (public homepage). Sidebar logo → `<Link to="/dashboard">` (preserves React Router SPA navigation and user session).

**Alternatives considered:** Add separate buttons next to logos. Rejected — standard UX convention is that the product logo is the home/back-to-start navigation anchor.

**Reasoning:** Both changes match universal web UX conventions. Logo clicks on auth pages go to public site; logo clicks in authenticated dashboard go to the main dashboard.

**Consequences:** Logo on login card now links to getfieldcore.com homepage. Logo in sidebar navigates to `/dashboard` from any nested page without a full page reload.

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
