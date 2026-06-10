# FieldCore — MVP Scope Analysis

**Created:** 2026-06-09  
**Source:** Full codebase read across all 29 route files, all mobile screens, all frontend pages, and all documentation  
**Purpose:** Determine what ships at launch versus what waits for Version 2

---

## CRITICAL BUG FOUND DURING THIS REVIEW

**Plan name mismatch: `planLimits.js` and `billing.js` use different plan names.**

- `billing.js` and the AI chat system prompt use: **`solo` / `pro` / `scale`**
- `planLimits.js` enforces limits using: **`starter` / `growth` / `scale`**

When a customer pays for the `pro` plan, Stripe creates a `pro` subscription. `planLimits.js` does not have a `pro` entry — it falls back to `LIMITS.starter` (2 users, 50 jobs/month, no SMS). A paying Pro customer gets Starter limits. This is a billing bug that silently throttles paid users and will generate immediate support tickets.

**Fix required before any Stripe keys are configured:** Resolve the plan names to a single canonical set across `planLimits.js`, `billing.js`, `PRICE_IDS`, `chat.js` system prompt, and all frontend references.

---

## PART 1: Features to Remove Before Launch

These features either have no backend, silently lose data, or are unverified. Shipping them would generate user complaints, App Store rejections, or silent data loss.

---

### REMOVE: TimesheetScreen (mobile)

**File:** `mobile/screens/TimesheetScreen.js`  
**Why it must go:** The screen looks polished but makes zero API calls. Clock in/out is local component state — it resets to zero when the app closes or the screen unmounts. Line 65 hardcodes `if (i === 2) return 3.5` as a placeholder weekly hour entry.

A technician who clocks in for 3 hours and marks themselves out will see their hours disappear the next time they open the app. There is no database record. There is no backend route. There is nothing to roll back to. This is the worst kind of bug: silent, invisible data loss on a feature users will trust implicitly.

**Action:** Remove from the mobile navigation in `mobile/App.js` before the EAS build. Keep the file in the repo — it is a good UI template for implementing real timesheets in V2.

---

### REMOVE: Partner Program page

**File:** `client/src/pages/Partners.jsx`  
**Why:** The `partner_applications` table exists in the DB but no backend route was confirmed during the codebase scan. Form submissions likely succeed on the frontend and silently fail on the backend. Partner applications are being lost.

**Action:** Replace the form with a mailto link (`partners@getfieldcore.com`) until a backend route is verified and a partner program is actually defined. This is honest — you currently have no partner onboarding process regardless.

---

### REMOVE: Sendblue as an option

**File:** `src/services/sendblue.js`  
**Why:** Sendblue is a backend service with no frontend UI. Operators cannot select it. It can only be toggled via env var. There is no documented decision to use it. Shipping code that can be accidentally enabled via a wrong env var is a hidden liability.

**Action:** Leave the service file in the repo (no deletion needed) but do not document it in user-facing materials. Launch Twilio-only. Add Sendblue toggle in Business Settings for V2 if there is operator demand.

---

## PART 2: Features to Postpone to Version 2

These features are fully implemented and work correctly but are not needed for the first 100 paying customers. They add setup complexity, require additional Stripe approvals, or serve use cases that early adopters will not have.

---

### DEFER: Business Phone System

**Files:** `src/routes/phone.js` (353 lines), `client/src/pages/Phone.jsx`, `client/src/pages/CallLogs.jsx`  
**Why it was built:** Competitive differentiation — Housecall Pro charges $39/mo add-on for this. FieldCore was building it as included in Pro.  
**Why to defer:** The phone system requires Twilio Voice configuration, TwiML application setup, webhook URL registration, and number provisioning — separate from the SMS A2P setup already required. First 100 customers are overwhelmingly solo or 2-person operations who use their personal phones. None of them signed up for a business phone line. This adds 2-4 hours of configuration work before the simpler features even work.

**The real risk:** `phone.js` line 65 and line 218 both have a hardcoded fallback URL:
```javascript
const appUrl = process.env.APP_URL || 'https://fieldcore-production-ee0d.up.railway.app';
```
This hardcodes the specific Railway instance URL as a fallback inside Twilio call bridges. If APP_URL is not set, all click-to-call webhooks go to a hardcoded Railway URL. Any redeployment to a different URL silently breaks every outbound call.

**Action:** Gate the Phone page behind a "Coming soon — launching Q3" state. The backend route can remain mounted but the frontend Phone nav link should show a disabled/coming-soon state. Do not provision Twilio Voice until after first customers are using the core scheduling/payment features.

---

### DEFER: Multi-Entity Management

**Files:** `src/routes/entities.js`, `client/src/pages/Entities.jsx`  
**Why it was built:** Scale plan differentiator for operators with multiple LLCs.  
**Why to defer:** The first 100 paying customers are almost certainly single-entity operations. Multi-entity requires Stripe Connect, which requires Stripe to approve FieldCore as a platform — a separate application process from standard Stripe. Deferring multi-entity removes this dependency entirely.

**Action:** Keep the backend mounted (it is correctly account-isolated and safe). The Entities page can show a "Scale plan feature" gate. Do not configure Stripe Connect until at least 10 customers are on the Scale plan and requesting it.

---

### DEFER: Stripe Connect (per-entity payouts)

**Files:** `src/routes/connect.js`, billing.js connect endpoints  
**Why:** Stripe Connect is the mechanism for operators to receive payments into their own Stripe accounts across multiple entities. For single-entity operators (the first 100 customers), direct Stripe payments via Stripe Checkout already work without Connect. Connect requires Stripe platform approval, a more complex onboarding flow, and ongoing platform fee management.

**Action:** For V1: direct Stripe Checkout and payment links only. Stripe Connect onboarding can be introduced as the Scale plan grows.

---

### DEFER: ACH / Bank Account billing setup

**File:** `src/routes/billing.js` — `POST /api/billing/payment-methods/bank`  
**Why:** The bank account setup uses the old Stripe bank token API (`stripe.tokens.create` + `stripe.customers.createSource`) which requires micro-deposit verification (2-3 business days). This is a complexity sink for early operators who will all use credit cards.

**Action:** Hide the bank account option in the Billing UI for V1. The endpoint can remain (it works) but simplify the UI to credit card only until there is operator demand for ACH.

---

## PART 3: Features That Are Over-Engineered

These features work correctly but are more complex than the first 100 customers need. They add surface area for bugs and support questions without adding proportional value at launch scale.

---

### OVER-ENGINEERED: 3-Layer Deposit System

**Description:** Layer 1 (by service type), Layer 2 (by client tier — VIP/Standard/At-Risk), Layer 3 (per-job override).  
**The reality for first 100 customers:** Most operators want one thing: "charge a deposit for this job." They will not configure tier-based deposit rules in their first week. The layer system is genuinely useful — but it is confusing as a first-time setup experience.

**Recommendation:** Do not remove or simplify the backend. Instead, simplify the onboarding path — default to Layer 3 (per-job manual deposit) as the entry behavior. Let operators discover layer configuration in settings. This requires no code change, just UI/copy guidance.

---

### OVER-ENGINEERED: CallerID Real-Time Polling

**File:** `src/routes/phone.js` — `GET /api/phone/calls/latest-inbound`  
**Description:** This endpoint is designed to be polled every 30 seconds by the frontend to detect active inbound calls for the CallerID popup. It runs a complex multi-join query across `call_logs`, `clients`, `jobs`, and `invoices` every 30 seconds for every logged-in owner/manager.  
**The problem:** This endpoint is part of the Business Phone System (deferred above). If the phone system is deferred, this polling endpoint is irrelevant. If it were active, polling every active account every 30 seconds with a 7-table join is a significant DB load pattern that needs Redis or WebSockets for a real production implementation.

**Action:** Moot if the phone system is deferred. Document this polling design as needing replacement with WebSocket push before the phone system launches.

---

### OVER-ENGINEERED: Unified Conversation Inbox

**File:** `src/routes/phone.js` — `GET /api/phone/conversations`, `GET /api/phone/thread/:clientId`  
**Description:** These endpoints merge SMS message history and Twilio call logs into a unified chronological thread per client. The conversation endpoint uses a complex multi-lateral-join query to compute last contact, call counts, unread message counts across both data sources.  
**Why it's over-engineered for V1:** The phone system is deferred. The SMS system alone (no calls) doesn't need a unified inbox — the existing Messages page covers it.

**Action:** Defer with the phone system. The Messages page already handles SMS history adequately for V1.

---

## PART 4: Features Likely to Cause Bugs

Ranked by probability and impact.

---

### BUG RISK — CRITICAL: Plan name mismatch (described above)

Affects every paying customer. Fix before any Stripe keys are set.

---

### BUG RISK — HIGH: File uploads written to local disk

**File:** `src/app.js` line 169: `app.use('/uploads', express.static(path.join(__dirname, '../uploads')));`  
**Confirmation:** The `/uploads` directory exists in the project root. Files written here are served via static middleware. Railway's filesystem is ephemeral — every deploy wipes it.

When a technician uploads a job photo, it goes to `./uploads/`. When Railway redeploys (which happens on every code push, every restart, every crash recovery), that photo is gone. There is no error. No warning. The job record still references the URL. The image returns 404.

This will happen to every real user who uploads a photo before it is fixed.

**Action:** Sprint Task 3 — investigate both `src/routes/mobile.js` (job photos) and `src/routes/business-settings.js` (logos). Migrate to S3/R2 before any real user uploads.

---

### BUG RISK — HIGH: TimesheetScreen data loss (addressed in Part 1)

---

### BUG RISK — MEDIUM: Stripe webhook correctly set up but untested

**Status:** The webhook handler is correctly mounted before `express.json()` in `app.js` (line 136). The handler uses `express.raw()`. This is structurally correct. But it has never been tested with real Stripe events — the `STRIPE_WEBHOOK_SECRET` is a placeholder. Structural correctness does not mean functional correctness.

**Action:** Sprint Task 6 — use Stripe CLI to test all three event types before going live.

---

### BUG RISK — MEDIUM: Hardcoded Railway URL in phone.js

**File:** `src/routes/phone.js` lines 65, 218, 332  
**Code:** `process.env.APP_URL || 'https://fieldcore-production-ee0d.up.railway.app'`  
**Problem:** If `APP_URL` is not set, all Twilio call bridges and TwiML webhooks go to this hardcoded Railway URL. Any redeployment to a new Railway service, a custom domain, or a different provider silently breaks all phone call bridging.

**Action:** As part of Sprint Task 4 (hardcoded URL sweep), replace these fallbacks with a hard error (`if (!process.env.APP_URL) throw new Error('APP_URL must be set')`).

---

### BUG RISK — MEDIUM: Admin email hardcoded in billing.js

**File:** `src/routes/billing.js` lines 497  
**Code:** `['admin@getfieldcore.com', 'kevincaines925@gmail.com'].includes(acct?.email)`  
**Problem:** Kevin's personal email is hardcoded as a platform admin in a production route file. If this repository becomes public or is cloned, this leaks a real email address and the fact that it grants elevated access.

**Action:** Move admin email list to an env var (`ADMIN_EMAILS=admin@getfieldcore.com,kevincaines925@gmail.com`). Parse it as a comma-separated list.

---

### BUG RISK — MEDIUM: Recurring job edge cases

**Feature:** Recurring jobs with weekly/biweekly/monthly patterns.  
**Risk:** Month-end recurrence (schedule a job on the 31st — what happens in February?), timezone handling when a server is in UTC and operators are in local time, daylight saving time transitions.  
**Action:** Test recurring job creation for: Jan 31 → next occurrence, a job crossing a DST boundary, a weekly job for a technician in a different timezone than the account.

---

### BUG RISK — LOW: No-show SMS requires Twilio (falls back silently)

**Feature:** No-show Arrival Clock sends two SMS to the client during the grace period.  
**Risk:** If `SMS_ENABLED=false` (current state), the no-show declaration still succeeds but the SMS notifications silently don't send. The deposit retention works. The audit record works. But the client receives no warning.  
**Action:** Document this as expected behavior for launch. When A2P is approved and SMS is enabled, test the full no-show flow including SMS delivery.

---

## PART 5: Features Not Required for the First 100 Paying Customers

These features either address a use case that first customers won't have, add operational complexity before it is needed, or require business decisions and third-party setups that should come after validating the core product.

| Feature | Why Not Needed for First 100 | When to Introduce |
|---------|------------------------------|-------------------|
| Business Phone System | Solo/small operators use personal phones | After 50 paid customers ask for it |
| Multi-Entity Management | First 100 customers are single-entity | When the first Scale customer needs it |
| Stripe Connect | Depends on Multi-Entity | Same |
| ACH Bank Account billing | Operators will use credit cards | When operators ask |
| TimesheetScreen | No backend — data is lost on app close | V2 with real backend |
| Partner Program | No partner program defined | After business development exists |
| Admin Audit Log Viewer | FieldCore team need, not operator need | After launch, 1-2 week task |
| Sendblue toggle UI | Twilio is sufficient; A2P isn't approved yet | After Twilio proves insufficient |
| Mobile deposit visibility | Web shows it; field techs don't need to see it | V2 |
| Mobile client management screen | Techs look up clients on web; rare edge case | V2 |
| 2FA (TOTP/email OTP) | Nice-to-have; brute-force protection already exists | V2 security hardening |
| TypeScript strict mode | No user-visible effect | Post-launch cleanup |
| CI/CD pipeline | Manual deploy is fine for first 3 months | After deploy frequency increases |

---

## PART 6: Launch Now vs. Version 2

### Launch Now (V1 Scope)

These features are complete, required, and should ship with the first paying customer.

**Core operations (no external dependencies needed for basic function):**
- Authentication — JWT, refresh tokens, password reset, brute-force protection
- Client Database — full CRUD, search, profile, job history
- Job Scheduling & Dispatch — create, assign, calendar, recurring, status tracking
- Team Management — roles, user limits per plan
- Business Settings — profile, hours, holiday closures
- Fleet Management — vehicle registry (simple CRUD, no external deps)
- No-Show Tracking — arrival clock, grace period, audit trail (SMS portion activates with Twilio)
- Estimates with E-Signature — create, send link, sign on web or mobile
- Analytics / Revenue Dashboard
- Audit Logging (runs silently, no UI needed at launch)
- Plan limit enforcement (after plan name bug is fixed)

**Requires Stripe keys (get these first):**
- Invoicing — auto-invoice on job completion, PDF export
- Public Payment Page — clients pay invoice links
- Card on File — charge stored card
- Deposits — collect and track deposits
- Online Booking Widget — 3-step booking with deposit
- Billing & Subscription — operators subscribe to Growth/Scale

**Requires SMTP (get this early — password reset alone requires it):**
- Password reset emails
- Client Portal magic-link delivery
- Review request emails
- Estimate delivery emails
- Booking confirmation emails

**Requires Twilio A2P approval:**
- Job confirmation SMS
- 24-hour reminder SMS
- No-show SMS notifications
- Manual SMS from Messages page

**Mobile (requires EAS build after BASE_URL is fixed):**
- All 13 active screens (after TimesheetScreen is removed from navigation)
- GPS check-in, photo upload, mark complete
- Push notifications

**Marketing & intake:**
- Landing site (after placeholder content is replaced)
- Beta signup system (100-slot cap)
- AI chat widget — ships as-is; the rule-based fallback works without Anthropic API key, and the fallback is genuinely informative

**Infrastructure:**
- Health endpoint (already exists at `/health` — upgrade it to include DB check)
- CORS configuration (hardcoded whitelist already includes production domains — env-drive it)
- Rate limiting (already configured; tune values in Sprint Task 8)
- Token cleanup cron (Sprint Task 10)

---

### Version 2 Scope

Features to build after the first 10–20 paying customers validate product-market fit.

**V2 — Tier 1 (high demand expected, build as soon as customers ask):**
- Business Phone System — properly configured with Twilio Voice, proper WebSocket CallerID, not polling
- TimesheetScreen — real backend with `timesheets` table, proper clock-in/out persistence
- Mobile client management screen — search and view clients from the mobile app
- Admin Audit Log Viewer — FieldCore team tool for security investigation

**V2 — Tier 2 (Scale plan, build when Scale customers appear):**
- Multi-Entity Management — full activation (Scale plan only)
- Stripe Connect per-entity — requires Stripe platform approval
- Mobile multi-entity switching

**V2 — Tier 3 (polish, after revenue validates):**
- 2FA / TOTP for owner accounts
- Sendblue toggle UI in Business Settings
- ACH bank account billing option
- Structured logging (pino/winston replacing console.log)
- API documentation (OpenAPI/Swagger)
- TypeScript strict enforcement on frontend
- CI/CD pipeline (GitHub Actions → Railway auto-deploy)

**V2 — Partner Program (requires business definition first):**
- Actual partner application workflow with backend route
- Partner dashboard
- Referral tracking

---

## PART 7: Pre-Launch Decisions Required

These cannot be deferred. They affect code that ships at launch.

| Decision | Why It Blocks Launch | Who Decides |
|----------|---------------------|-------------|
| Canonical plan names: Solo/Pro/Scale OR Starter/Growth/Scale? | `planLimits.js` and `billing.js` currently disagree. One must match the other. | Kevin |
| Is Starter plan free (trial), paid, or removed entirely? | No Stripe price for Starter exists. If it is the default plan for new accounts, does FieldCore collect revenue from Starter users? | Kevin |
| Is the Business Phone System V1 or V2? | If V1: configure Twilio Voice now. If V2: gate the frontend page as coming-soon. | Kevin |
| Is AI chat included at launch? | It works via rule-based fallback. If the Anthropic API key is NOT set, it still responds well. Decision is whether to pay for real AI responses. | Kevin |
| What is the platform fee? | `PLATFORM_FEE_PERCENT=1` is the default. This needs to be in the Terms of Service before the first transaction. | Kevin |
| TimesheetScreen: remove from nav before EAS build? | Screen is shipped, looks working, silently loses all data. Must be resolved before the mobile binary is distributed. | Kevin |

---

## Summary Table

| Feature | Verdict | Reason |
|---------|---------|--------|
| Authentication | LAUNCH | Core; complete |
| Client Database | LAUNCH | Core; complete |
| Job Scheduling | LAUNCH | Core; complete |
| Invoicing & Payments | LAUNCH | Core; needs Stripe keys |
| Mobile App (13 screens) | LAUNCH | Core; needs EAS build |
| Automated SMS | LAUNCH | Core; needs Twilio A2P |
| Online Booking Widget | LAUNCH | Core; needs Stripe |
| Deposits | LAUNCH | Core; needs Stripe |
| Estimates / E-Signature | LAUNCH | Core; complete |
| No-Show Tracking | LAUNCH | Key differentiator |
| Team Management | LAUNCH | Core; complete |
| Business Settings | LAUNCH | Core; complete |
| Fleet Management | LAUNCH | Simple CRUD; complete |
| Analytics Dashboard | LAUNCH | Complete |
| Push Notifications | LAUNCH | Needs EAS build |
| Client Portal | LAUNCH | Needs SMTP |
| Post-Job Reviews | LAUNCH | Needs SMTP |
| Billing & Subscriptions | LAUNCH | Needs Stripe |
| Onboarding Flow | LAUNCH | Complete |
| Beta Signup | LAUNCH | Complete |
| AI Chat (rule-based fallback) | LAUNCH | Works without API key |
| Manager Tablet View | LAUNCH | Zero marginal cost; complete |
| Public Payment Page | LAUNCH | Needs Stripe |
| Audit Logging | LAUNCH | Runs in background |
| TimesheetScreen | **REMOVE** | No backend; silent data loss |
| Partner Program page | **REMOVE** | Backend unverified; no program defined |
| Business Phone System | **V2** | Twilio Voice setup; not in original scope |
| Multi-Entity Management | **V2** | Scale only; no Scale customers yet |
| Stripe Connect | **V2** | Depends on Multi-Entity |
| TimesheetScreen (full) | **V2** | Implement real backend |
| Sendblue | **V2** | No UI; no operator demand confirmed |
| ACH billing | **V2** | Credit card sufficient |
| Tech Mobile Demo | **DECIDE** | Unclear audience; gate or remove |
| Admin Audit Log Viewer | **V2** | FieldCore team tool |

---

## Files to Change Before EAS Build

These changes must happen before the mobile binary is published to any store:

1. **`mobile/App.js`** — Remove TimesheetScreen from navigator
2. **`mobile/api.js`** — Replace hardcoded `BASE_URL` with `EXPO_PUBLIC_API_URL`
3. **`mobile/screens/TimesheetScreen.js`** — Keep file, remove from navigation

---

## Files to Change Before Stripe Keys Are Set

These changes must happen before `STRIPE_SECRET_KEY` is placed in production:

1. **`src/middleware/planLimits.js`** — Fix plan names to match billing.js (solo/pro/scale)
2. **`src/routes/billing.js`** — Confirm `PRICE_IDS` object matches canonical plan names
3. **`src/routes/billing.js`** line 497 — Move admin emails to `ADMIN_EMAILS` env var
4. **`src/routes/phone.js`** lines 65, 218, 332 — Replace hardcoded Railway URL fallbacks

---

*End of MVP_SCOPE.md*
