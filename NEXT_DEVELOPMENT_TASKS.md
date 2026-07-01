# FieldCore — Next Development Tasks

**Last reconciled:** 2026-07-01  
**Status:** Fleet camera foundation complete. Awaiting first provider integration.

---

## FLEET CAMERA TASKS — 2026-07-01

### ~~FLEET-CAM-1: Fleet Camera UI and Backend Foundation~~ — COMPLETE 2026-07-01
Added Live Vehicle Cameras section to /fleet. CameraTile component (all states), vehicle selector, provider-not-connected notice, permission gate (owner/manager). Backend: `GET /api/fleet/cameras/:vehicleId` with graceful fallback when table doesn't exist. CSS: `.fleet-cam-grid`, `.fleet-cam-tile`, all badge variants. Currently shows setup-required state (no provider connected).

### FLEET-CAM-2: fleet_vehicle_cameras DB Migration (PENDING)
**Blocked by:** First camera provider being selected  
**Task:** Run the migration SQL from fleet.js header comment to create `fleet_vehicle_cameras`. Add `integration_id` FK once integrations table exists.  
**Effort:** 30 min

### FLEET-CAM-3: First Provider Integration (PENDING)
**Blocked by:** Provider account + API credentials  
**Task:** Pick one provider (Samsara recommended for first integration), implement OAuth or API key flow, map provider camera data to `fleet_vehicle_cameras` columns, implement stream token refresh (short-lived URL regeneration).  
**Effort:** 1–3 days per provider depending on API quality

### FLEET-CAM-4: Admin Role for Camera Access (PENDING)
**Blocked by:** Admin role being formally added to the auth system  
**Task:** Currently `canViewCameras` checks owner/manager/admin but the admin role does not exist yet. When the admin role is added to JWT payloads and `requireRole()`, update the backend endpoint to include `requireRole('owner', 'manager', 'admin')`.  
**Effort:** 1 hour (once admin role exists)

---

## UX TASKS COMPLETED 2026-06-24

### ~~UX-1: Mobile and Tablet Access~~ — COMPLETE 2026-06-24
Removed `isPhone` gate from `client/src/App.jsx`. Dashboard accessible on phones, tablets, and desktops. Added CSS: scrollable filter tabs, bottom-sheet modals on mobile, stacked form actions, caller popup width fix at 480px. Build verified passing.

### ~~UX-2: Entity Switcher — Full Fix~~ — COMPLETE 2026-06-24
Root cause: `/api/auth/me` in `src/routes/auth.js` joined on `u.account_id` (always the home account), returning the wrong business name/plan/role after switching. Fixed to join on `payload.accountId` with correct role resolution.
Frontend: topbar now shows active business name below page title (`.tb-entity-label`). Dashboard shows "Viewing | Business Name" banner (`.dash-entity-bar`).
AuthContext: `switchAccount` wrapped in try/catch; `switching`/`switchError` state; entity panel shows loading/error/hint.

### ~~UX-3: Login Page Back to Home~~ — COMPLETE 2026-06-24
Login.jsx logo is now `<a href="/">` linking to homepage. "← Back to homepage" link added below form footer. Same applied to ForgotPassword.jsx.

### ~~UX-4: Dashboard Logo Routes to /dashboard~~ — COMPLETE 2026-06-24
Sidebar FIELDCORE™ logo in App.jsx wrapped in `<Link to="/dashboard">`. Works from any authenticated page, preserves session, no full page reload. `Link` import added to App.jsx.

---

## UI POLISH TASKS COMPLETED 2026-06-24

### ~~UI-1: Calendar Page Cleanup~~ — COMPLETE 2026-06-24
Title renamed to "Calendar". React-big-calendar overrides in `style.css`: DM Mono headers, Inter toolbar, sand active state, navy active background, `#FDFAF5` today highlight, sand current-time indicator, event card box-shadow. Height: `max(560px, calc(100vh - 260px))`. Styled loading card. `client/src/pages/Jobs.jsx`, `client/src/style.css`.

### ~~UI-2: Create Client Modal Overflow Fix~~ — COMPLETE 2026-06-24
`.modal` in `client/src/style.css` now has `max-height: 90vh; overflow-y: auto` on desktop. Create Client form no longer overflows the viewport on small/standard screens.

### ~~UI-3: Client List Rebuild with Real Invoice Data~~ — COMPLETE 2026-06-24
Client list rebuilt with 7-column grid: Name, Tier, Contact, LTV, Outstanding Balance, Last Invoice (date + status badge), Client Since. Backend `GET /api/clients` enhanced with subqueries for `last_invoice_at`, `last_invoice_status`, `outstanding_balance`. No fake data. `src/routes/clients.js`, `client/src/pages/ClientList.jsx`.

### ~~UI-4: Communications `read_at` Error Fix + UI Cleanup~~ — COMPLETE 2026-06-24
Backend: `GET /api/phone/conversations` wrapped in try/catch; on `column m.read_at does not exist` error, falls back to base query returning `unread_messages: 0`. `src/routes/phone.js`.
UI: Loading states use styled cards. `var(--off-white)` → `var(--offwhite)`. Thread call bubble uses `var(--offwhite)`. Inbound message bubble uses `var(--offwhite)`. Section separator uses `var(--lightgray)`. SMS section header/spacing standardized. `client/src/pages/Communications.jsx`.

### ~~UI-5: Settings Page CSS Variable Fix~~ — COMPLETE 2026-06-24
Active Sessions and Audit Log cards used undefined CSS variables (`--navy-3`, `--border`, `--text-muted`), rendering dark broken UI. Fixed to use defined variables: current session `var(--sand-lt)` / `#D6B58A55` border; other sessions `var(--off)` / `var(--lightgray)`. Text: `var(--navy)` / `var(--steel)`. `client/src/pages/Account.jsx`.

### ~~UI-6: Entities Page Revenue Typography~~ — COMPLETE 2026-06-24
Revenue figures in summary stat cards now use Cormorant Garamond serif at `fontSize: 28`. Per-entity breakdown revenue uses `fontSize: 16`. Stat cards use `.stat-card` / `.stat-label` / `.stat-value` CSS classes. Hardcoded hex colors replaced with CSS variables. `client/src/pages/Entities.jsx`.

### ~~UI-7: Billing Downgrade → Support Contact Flow~~ — COMPLETE 2026-06-24
`DowngradeModal` no longer calls Stripe or executes automatic plan changes. Shows features at risk (amber warning), email link (`mailto:support@getfieldcore.com` with pre-filled subject), and phone link (`tel:+18884302777` showing `(888) 430-2777`). Decision: Do not automate downgrades; route to human support. `client/src/pages/Billing.jsx`.

---

## UI POLISH TASKS COMPLETED — SPRINT II (2026-06-24)

### ~~UI-8: StatusBadge Design System~~ — COMPLETE 2026-06-24
Created shared `StatusBadge` component (`client/src/components/StatusBadge.jsx`). Replaces per-page badge logic across 15+ files. Auto-maps status strings (active, pending, paid, overdue, cancelled, draft, etc.) to 5 color variants: blue (active/pending), green (paid/complete/connected), red (error/cancelled/overdue), yellow (warning/needs review), gray (draft/inactive). Title Case auto-formatting. Pill design: no border, 2px 8px padding, borderRadius 99. Files updated: Invoices, Deposits, Dashboard, ClientList, ClientProfile, Communications, Entities, Billing, Team, Estimates, JobDetail, InvoiceDetail, StatusBadge.jsx (new).

### ~~UI-9: Communications Tabs Rebuild~~ — COMPLETE 2026-06-24
Phone Numbers, Call Log, and Voicemail tabs rebuilt with shared `CommCard` and `CommEmptyState` components. All three tabs now match Messages tab quality: full-width cards, proper column headers, status badges, grid layout, icons, empty states with CTAs. Header padding fixed for non-messages tabs (20px 24px 0). `client/src/pages/Communications.jsx`.

### ~~UI-10: Billing — Visible Downgrade Option~~ — COMPLETE 2026-06-24
"Request Downgrade" button added to two locations: (1) Current Plan banner alongside "Manage Billing →", (2) Plans tab footer alongside "Cancel my subscription". Button opens `DowngradeModal` with proper wording: "To downgrade your FieldCore plan, please contact support so we can help adjust your account without interrupting your service, active entities, phone numbers, billing, or payment routing." `client/src/pages/Billing.jsx`.

### ~~UI-11: Entities — Stripe Connect Real Flow~~ — COMPLETE 2026-06-24
"Connect Stripe" button now calls real `/api/connect/onboard` endpoint (creates Stripe Express account, saves `stripe_account_id`, generates account link, redirects). Shows loading state per-entity. Inline error display (`connectErrors[entityId]`) replaces dead `alert()`. "Current" sand badge renamed from "Active" to "Current" — semantically distinct from StatusBadge. StatusBadge now only shown for inactive entities (not for active ones, eliminating duplicate Active labels). `client/src/pages/Entities.jsx`.

### ~~UI-12: Billing — Stripe Connect Clarity~~ — COMPLETE 2026-06-24
Stripe Connect tab in Billing now clearly explains the platform payout routing model. Button calls real backend endpoint. No dead-end behavior. `client/src/pages/Billing.jsx`.

### ~~UI-13: Payout Schedule Selector~~ — COMPLETE 2026-06-24
Daily/Weekly/Monthly/Manual dropdown added to Billing Stripe Connect tab. Visible when connect.status === 'active'. GET/POST `/api/billing/connect/payout-schedule` endpoints added to `src/routes/billing.js`. Saves to Stripe account; persists after page refresh. When Connect not yet active, shows preference note: "Saved preference. Stripe payout automation requires Stripe Connect setup." `client/src/pages/Billing.jsx`, `src/routes/billing.js`.

### ~~UI-14: Typography Utility Classes~~ — COMPLETE 2026-06-24
Added 10 CSS utility classes to `client/src/style.css`: `.fc-page-title` (DM Serif Display 24px), `.fc-section-title` (DM Serif Display 18px), `.fc-card-title` (Inter 700 13px navy), `.fc-label` (DM Mono 9px uppercase steel), `.fc-body` (Inter 13px navy), `.fc-muted` (Inter 12px steel), `.fc-stat-number` (Cormorant Garamond 28px navy), `.fc-currency` (DM Mono 600 13px navy), `.fc-th` (DM Mono 9px uppercase steel), `.fc-td` (Inter 13px navy).

### ~~UI-15: Invoice and Deposit Status Colors~~ — COMPLETE 2026-06-24
All invoice and deposit status badges now routed through shared StatusBadge. Invoice: Pending=blue, Paid=green, Outstanding/Unpaid/Late/Overdue=red, Draft=gray. Deposit: Action Needed=yellow, Collect=yellow, Collected=green, Pending=blue, Refunded=gray. `client/src/pages/Invoices.jsx`, `client/src/pages/Deposits.jsx`, `client/src/components/InvoiceDetail.jsx`.

---

## CRITICAL — Must Complete Before Any Real Users

These are not optional. The app will not function correctly in production without these.

### C1: Configure Real Environment Variables
**Priority:** P0 — Everything else depends on this  
**Work:** Add real credentials to `.env` on the production server
- `JWT_SECRET` — strong random string (min 64 chars for prod)
- `DATABASE_URL` — production PostgreSQL connection string
- `APP_URL` — production domain
- `STRIPE_SECRET_KEY` + `STRIPE_PUBLISHABLE_KEY` + `STRIPE_WEBHOOK_SECRET`
- `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_PHONE_NUMBER`
- `SMTP_HOST` + `SMTP_PORT` + `SMTP_USER` + `SMTP_PASS` + `FROM_EMAIL`
- `VITE_GOOGLE_MAPS_API_KEY`
- `ANTHROPIC_API_KEY` (if AI widget included in launch)

**Estimate:** 2-4 hours (account setup) + 30 min (env file)

---

### C2: Stripe Account Setup
**Priority:** P0  
**Work:**
1. Create Stripe account at stripe.com
2. Complete business verification (bank account, EIN/SSN)
3. Create two products: "FieldCore Growth" and "FieldCore Scale"
4. Create monthly price for each; copy price IDs to `STRIPE_PRICE_GROWTH` / `STRIPE_PRICE_SCALE` in env
5. Enable Stripe Connect for contractor payout features
6. Set up Stripe webhook endpoint → `https://your-domain.com/api/webhooks/stripe`
7. Copy webhook signing secret to `STRIPE_WEBHOOK_SECRET`
8. Test in Stripe test mode before switching to live keys

**Estimate:** 2-3 days (bank verification) + 2 hours (configuration)

---

### C3: Twilio A2P 10DLC Setup
**Priority:** P0 for SMS features  
**Work:**
1. Create Twilio account at twilio.com
2. Purchase a phone number
3. Register brand (business info + EIN)
4. Register campaign (message use case: appointment reminders)
5. Wait for A2P approval (3-7 business days)
6. Set `SMS_ENABLED=true` in env
7. Copy credentials to env
8. Set up Twilio webhook → `https://your-domain.com/api/webhooks/twilio`

**Estimate:** 3-7 business days waiting + 2 hours work

---

### C4: Email (SMTP) Setup
**Priority:** P0 — affects password reset, confirmations, portal magic-links, review requests  
**Work:**
1. Set up sending email (options in order of ease):
   - Gmail: enable App Password, use `smtp.gmail.com:587`
   - SendGrid: create account, get API key, use SMTP relay
   - Postmark: create account, verify domain
2. Update `SMTP_*` and `FROM_EMAIL` env vars
3. Test password reset email
4. Test job confirmation email
5. Test invoice email

**Estimate:** 30 min (Gmail) to 2 hours (SendGrid with domain verification)

---

### C5: Update Mobile `BASE_URL`
**Priority:** P0 for mobile  
**Work:** Update `mobile/api.js` → `BASE_URL` to point to production API URL  
**Estimate:** 5 minutes

---

### C6: Deploy to Production
**Priority:** P0  
**Work:**
1. Push to Railway (backend) — `nixpacks.toml` and `railway.json` already configured
2. Push to Vercel (frontend) — `client/.vercel/` already configured
3. Deploy landing site to Vercel (separate project)
4. Set all environment variables in Railway and Vercel dashboards
5. Run `node scripts/init-db.js` to seed first admin account
6. Point domain to Railway backend + Vercel frontend
7. Update `APP_URL` env var

**Estimate:** 2-4 hours first deploy

---

## BACKEND TASKS

### B1: Security Audit of Auth Middleware
**Priority:** P1  
**Work:** Review `src/middleware/auth.js` — verify token validation, expiry handling, revocation on logout  
**Estimate:** 2 hours

### ~~B2: Verify All Routes Are Properly Gated~~ — COMPLETE 2026-06-09
Covered during Sprint Task 1 isolation audit. All 27 route files reviewed. Public routes confirmed intentional.

### ~~B3: Verify Multi-Tenant Isolation~~ — COMPLETE 2026-06-09
Sprint Task 1 complete. All 27 route files audited. Security fixes applied to `users.js` (3 critical membership endpoint bugs). Defense-in-depth fixes to `clients.js`, `jobs.js`, `deposits.js`, `payments.js`. Smoke tests 44/44 pass.

### B4: Stripe Webhook Handler Testing
**Priority:** P1  
**Work:** Test all Stripe event types in `src/routes/webhooks.js` — subscription.created, payment_intent.succeeded, payment_intent.payment_failed, invoice.paid  
**Estimate:** 2-3 hours with Stripe CLI

### B5: Partner Program Backend Verification
**Priority:** P2  
**Work:** Verify route exists and is wired to save partner applications from frontend form  
**Estimate:** 1 hour

### B6: File Upload Storage Confirmation
**Priority:** P1  
**Work:** Determine where logo uploads and job photos are stored in production (local disk vs. S3/R2); ensure persistence across deploys  
**Estimate:** 1 hour investigation + 2-4 hours if migration needed

### B7: Smoke Tests Pass on Production
**Priority:** P1  
**Work:** Run `node test/smoke.js` against production environment; fix any failures  
**Estimate:** 1 hour

---

## FRONTEND TASKS

### F1: Environment-Specific API URL
**Priority:** P1  
**Work:** Verify `VITE_API_URL` is correctly set for production builds; no hardcoded `localhost:3000` references  
**Estimate:** 30 min

### F2: Error State Handling Audit
**Priority:** P2  
**Work:** Review key flows (login, payment, booking) for empty/error states when API is unavailable  
**Estimate:** 4-6 hours

### F3: Landing Site Content Review
**Priority:** P2  
**Work:** Replace all placeholder content (team bios, blog posts, press items, FAQ answers) with real content  
**Estimate:** 2-4 hours (content creation is separate)

### F4: Tech Mobile Demo — Gate or Publish
**Priority:** P2  
**Work:** Decide if `TechMobileDemo.jsx` is public or internal; add auth guard if internal  
**Estimate:** 30 min

### F5: Booking Widget Iframe Embed Code
**Priority:** P2  
**Work:** Verify iframe embed code in BookingSettings generates correct URL pointing to production domain  
**Estimate:** 30 min

---

## MOBILE APP TASKS

### M1: EAS Build Setup
**Priority:** P1  
**Work:** Configure `mobile/eas.json` profiles; run first production build for iOS and Android  
**Estimate:** 2-4 hours

### M2: Apple Developer + Google Play Accounts
**Priority:** P1 (if distributing apps)  
**Work:** Register Apple Developer Program ($99/yr); Google Play Console ($25 one-time)  
**Estimate:** 1-3 days (Apple review/verification)

### M3: Physical Device Testing
**Priority:** P1  
**Work:** Test full tech flow on real iPhone and Android: login → today's jobs → GPS check-in → photo upload → complete → ETA SMS  
**Estimate:** 2-4 hours

### M4: Push Notification Testing on Device
**Priority:** P1  
**Work:** Verify push token registration and notification delivery on physical devices  
**Estimate:** 1-2 hours

### M5: Biometric Auth Testing
**Priority:** P2  
**Work:** Test `expo-local-authentication` on devices with Face ID, Touch ID, and fingerprint  
**Estimate:** 1-2 hours

---

## WEBSITE / LANDING TASKS

### W1: Real Business Content
**Priority:** P2  
**Work:** Write/source: About page, FAQ answers, Terms of Service (real legal), Privacy Policy (real legal), SMS Terms (real legal)  
**Estimate:** 2-5 hours (requires legal input for ToS/Privacy)

### W2: Contact Form SMTP
**Priority:** P2  
**Work:** Test that contact form submissions from landing site reach the operator's inbox via SMTP  
**Estimate:** 30 min after SMTP configured

### W3: Domain + DNS
**Priority:** P1  
**Work:** Register domain, point to Railway (backend) and Vercel (frontend), set up SSL (auto-managed by Railway/Vercel)  
**Estimate:** 1-2 hours

---

## INTEGRATION TASKS

### I1: Stripe Test Mode End-to-End
**Priority:** P1  
**Work:** Full Stripe test run: create account → subscribe → book job → deposit → invoice → pay  
**Estimate:** 2-3 hours

### I2: Twilio SMS End-to-End
**Priority:** P1 (after A2P approval)  
**Work:** Test: create job → confirmation SMS sent → 24h reminder SMS sent → manual SMS from messages page  
**Estimate:** 1-2 hours after credentials active

### I3: Google Maps Address Autocomplete
**Priority:** P2  
**Work:** Add `VITE_GOOGLE_MAPS_API_KEY` to env; verify `AddressAutocomplete.jsx` works; confirm billing enabled on Google Cloud  
**Estimate:** 30 min

### I4: Anthropic AI Chat
**Priority:** P3 (business decision first)  
**Work:** Add `ANTHROPIC_API_KEY`; add per-account rate limiting; test widget  
**Estimate:** 1-2 hours after business decision

---

## TESTING TASKS

### T1: Auth Security Testing
**Priority:** P1  
**Work:** Test brute-force lockout, JWT expiry/refresh, logout invalidation, password reset token expiry  
**Estimate:** 3-4 hours

### T2: Multi-Tenant Data Isolation Test
**Priority:** P1  
**Work:** Create two test accounts; verify neither can access the other's data via any API endpoint  
**Estimate:** 2-3 hours

### T3: Plan Limit Enforcement Test
**Priority:** P1  
**Work:** Test Starter: add 3rd user (should fail), create 51st job (should fail), send SMS (should fail)  
**Estimate:** 1-2 hours

### T4: Payment Flow End-to-End
**Priority:** P1  
**Work:** Stripe test mode: subscription, deposit, invoice, charge on file, payment link, refund  
**Estimate:** 2-3 hours

### T5: Booking Widget Public Flow
**Priority:** P1  
**Work:** Test booking as an anonymous customer: pick service → select time → enter details → pay deposit → receive confirmation  
**Estimate:** 1-2 hours

### T6: Mobile Field Flow
**Priority:** P1  
**Work:** Simulate full technician day: receive push notification → check in via GPS → upload photo → mark complete → client gets SMS  
**Estimate:** 2-3 hours on physical device

---

## CLEANUP TASKS

### CL1: Remove Hardcoded Development Values
**Priority:** P1  
**Work:** Search codebase for `localhost`, `127.0.0.1`, hardcoded port numbers, test phone numbers, test email addresses — replace with env vars  
**Estimate:** 1-2 hours

### CL2: Audit Console.log Statements
**Priority:** P2  
**Work:** Remove or gate `console.log` statements that may expose sensitive data in production logs  
**Estimate:** 1-2 hours

### CL3: Verify `.gitignore` Completeness
**Priority:** P1  
**Work:** Ensure `.env`, `node_modules`, build artifacts, and uploaded files are not committed  
**Estimate:** 30 min

---

## DEFERRED (Post-Launch)

- 2FA / TOTP for owner accounts
- Admin audit log viewer UI
- Mobile client management screen
- Mobile deposit visibility
- Mobile multi-entity switching
- Sendblue iMessage/RCS activation
- Advanced analytics (cohorts, churn, LTV trends)
- Unit test suite
- Integration test suite
- CI/CD pipeline
