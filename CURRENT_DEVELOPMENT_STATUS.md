# FieldCore — Current Development Status

**Last reconciled:** 2026-07-01 (Settings page UI redesign: page-header structure, clean tab nav, polished My Account/Business/Notifications/Billing tabs)  
**Source of truth:** Actual codebase scan + Sprint Task 1 audit

---

## FULLY WORKING
*(Code complete, logic sound, no external blockers)*

- **Authentication** — JWT login/signup/refresh/logout, password reset, brute-force protection, role-based access
- **Client Database (M1)** — Full CRUD, search, profile, job/SMS history, Stripe customer ID linking
- **Job Scheduling & Dispatch (M2)** — Create/edit/delete jobs, calendar views (Month/Week/Day/Agenda all styled to FieldCore design system; Agenda table borders fully cleaned up as of 2026-06-25), technician assignment, recurring jobs, GPS check-in, status tracking
- **Technician Mobile App (M4)** — All 14 screens implemented: job queue, schedule, GPS check-in, photo capture, mark complete, messages, invoice view, signature
- **Team Management** — Owner/manager/tech/staff roles, per-plan user limits enforced
- **Business Settings** — Profile, operating hours, holiday closures, timezone, service vertical
- **Fleet Management** — Vehicle registry CRUD, live locations, Live Vehicle Cameras section (setup-required state; provider integration foundation in place). Full UI redesign 2026-07-01: stat cards, two-column desktop layout, polished empty states, Fleet Tracking Integration card with provider grid and mailto CTA.
- **No-Show Tracking** — Grace period clock, auto-declare, deposit retention, SMS notifications, audit trail
- **Estimates with E-Signature** — Create, send, sign digitally (web + mobile)
- **Post-Job Reviews** — Submit and store 1-5 star ratings
- **Multi-Entity Management** — Scale+ feature, account memberships, entity switching (with loading state + error handling as of 2026-06-24)
- **Onboarding Flow** — Account setup wizard
- **Analytics / Revenue Dashboard** — Revenue metrics, job counts, trends
- **Audit Logging** — Security audit trail on all sensitive actions
- **Plan Limit Enforcement** — Starter/Growth/Scale gates enforced in middleware
- **Push Notifications** — Expo token registration, in-app notification bell, notification dispatch
- **Manager Tablet View** — Optimized layout for tablet form factor
- **Booking Widget Settings** — Admin side of service templates and widget config

---

## PARTIALLY WORKING
*(Code exists and is functional but missing pieces, credentials, or end-to-end testing)*

- **Stripe Payments / Invoicing (M3)**
  - All code wired; auto-invoice on completion, charge on file, payment links, PDF export
  - Blocked by: real `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` not configured
  - Missing: webhook secret for Stripe event verification

- **Online Booking Widget (M6)**
  - All code wired; 3-step form, deposit via Stripe Checkout, agreement checkbox
  - Blocked by: real Stripe keys; `APP_URL` must be production domain

- **Automated SMS (M5)**
  - All code wired; confirmations, reminders, manual SMS
  - Blocked by: `SMS_ENABLED=false` (Twilio A2P 10DLC campaign not yet registered)

- **Client Portal**
  - Code complete; magic-link generation works
  - Blocked by: SMTP for sending magic-link emails

- **AI Chat Widget**
  - Code complete (Anthropic SDK integrated)
  - Blocked by: `ANTHROPIC_API_KEY` not configured
  - Missing: per-account rate limiting; cost model not defined

- **Deposits & Payment Protection**
  - Code complete; collect, track, refund, expiry alerts
  - Blocked by: Stripe keys

- **Post-Job Reviews**
  - Code and DB complete
  - Blocked by: SMTP for sending review request links

- **Fleet Vehicle Cameras**
  - UI complete: Live Vehicle Cameras section on /fleet, all tile states (live/snapshot/offline/error/no_camera/setup_required), vehicle selector, responsive grid
  - Backend complete: `GET /api/fleet/cameras/:vehicleId` gracefully returns `provider_connected: false` when table doesn't exist
  - DB schema defined in fleet.js header comment; `fleet_vehicle_cameras` table not yet created (no provider connected)
  - Blocked by: no third-party camera provider (Samsara / Motive / Geotab / Verizon Connect / Azuga / Fleetio) configured
  - Missing: `fleet_vehicle_cameras` DB migration; provider OAuth/API key storage; stream token refresh logic

- **Beta Signup System**
  - 100-slot cap logic and DB complete
  - Missing: email confirmation (SMTP); admin view of signups

- **Public Payment Page**
  - Code complete
  - Blocked by: Stripe keys

- **Billing & Subscription Management**
  - Code complete; Stripe Subscriptions + Connect wired
  - Blocked by: real Stripe account, `STRIPE_PRICE_SOLO`/`STRIPE_PRICE_PRO`/`STRIPE_PRICE_SCALE` IDs not created in Stripe dashboard, Stripe Connect not enabled

---

## UI / UX IMPROVEMENTS — COMPLETED 2026-06-24

- **Mobile Phone Access** — Phone gate removed; dashboard fully accessible on phones/tablets/desktops. Bottom nav and sidebar overlay work on all screen widths. Additional CSS: scrollable filter tabs, bottom-sheet modals, stacked form actions on mobile.
- **Entity Switcher — Full Fix** — Root cause found and fixed: `/api/auth/me` was joining on `u.account_id` (home account), now joins on `payload.accountId` (active entity from JWT). After switch + reload, `accountName`, `plan`, and `role` are all correct. Topbar now shows active business name below page title. Dashboard shows "Viewing | Business Name" banner. Frontend state and all API calls were already correct (token-scoped); only the `/me` response was stale.
- **Entity Switcher UX** — Loading/error state, disabled state during switch, single-entity hint linking to /entities page. Fixed: `setSwitching(false)` was never called on success, leaving switcher frozen. Added to success path.
- **Login page navigation** — Logo now links to `/` (homepage). "← Back to homepage" link added below form. Applied same to ForgotPassword page.
- **Dashboard logo navigation** — Sidebar FIELDCORE™ logo is now a `<Link to="/dashboard">` — works from any nested page, preserves session, does not trigger full reload.
- **Calendar page UI polish** — Title renamed to "Calendar". Calendar event cards styled (box-shadow, hover opacity). Current day highlighted (`#FDFAF5`). Headers use DM Mono uppercase. Toolbar uses Inter/sand/navy design tokens. Current time indicator uses sand. Height is responsive: `max(560px, calc(100vh - 260px))`. Loading state is a styled card.
- **Client list page rebuild** — Full table redesign with Name, Tier, Contact, LTV, Outstanding Balance, Last Invoice (date + status badge), Client Since columns. Outstanding balance in amber if > 0. Backend enhanced: `GET /api/clients` now returns `last_invoice_at`, `last_invoice_status`, `outstanding_balance` via DB subqueries. All real data.
- **Create Client modal** — `.modal` CSS now has `max-height: 90vh; overflow-y: auto` to prevent overflow on desktop.
- **Communications — `read_at` DB error fix** — `GET /api/phone/conversations` failed with `column m.read_at does not exist` on Railway. Fixed with try/catch fallback: falls back to a query without `read_at` and returns `unread_messages: 0`.
- **Communications UI cleanup** — Loading states use styled cards. Fixed `var(--off-white)` → `var(--offwhite)`. Thread bubble background uses `var(--offwhite)`. Hardcoded colors replaced with CSS variables. Section separator uses `var(--lightgray)`.
- **Settings page** — Full UI redesign 2026-07-01: removed awkward white header block, replaced with `.page-header` + subtitle. Tab bar rebuilt to match Communications pattern (navy underline, no harsh outlines, horizontal scroll on mobile). All 4 tabs polished: My Account (profile detail rows, password form, sessions, audit log), Business (BusinessSettings component, left-aligned), Notifications (toggle rows with descriptions), Billing (plan summary + Manage Billing link). Max-width 720px, left-aligned content.
- **Entities page revenue typography** — Revenue figures use Cormorant Garamond at `fontSize: 28` (summary) and `fontSize: 16` (breakdown). Stat cards use `.stat-card` / `.stat-label` / `.stat-value` classes.
- **Billing downgrade flow** — `DowngradeModal` now shows features at risk and routes user to support (email + phone) instead of triggering automatic plan change or Stripe checkout.
- **StatusBadge design system** — Shared `StatusBadge` component (`client/src/components/StatusBadge.jsx`) replaces per-page badge logic across 15+ files. Auto-maps status strings to 5 color variants (blue/green/red/yellow/gray). Title Case labels. Pill design: no border, 2px 8px padding, borderRadius 99. Used in: Invoices, Deposits, Dashboard, ClientList, ClientProfile, Communications, Entities, Billing, Team, Estimates, JobDetail, InvoiceDetail.
- **Communications tabs** — Phone Numbers, Call Log, and Voicemail tabs rebuilt with shared `CommCard` wrapper and `CommEmptyState` component matching Messages tab quality. Full-width cards, proper headers, matching typography, rounded corners, icons, and empty states.
- **Billing — visible downgrade option** — "Request Downgrade" button added to Current Plan banner and Plans tab footer. Opens `DowngradeModal` with support contact info. Wording: "To downgrade your FieldCore plan, please contact support so we can help adjust your account without interrupting your service, active entities, phone numbers, billing, or payment routing."
- **Entities — Stripe Connect fixed** — "Connect Stripe" button now calls real `/api/connect/onboard` backend endpoint. Shows loading state, creates Stripe Express account, saves `stripe_account_id`, redirects to Stripe onboarding URL. Inline error state (`connectErrors[entityId]`) replaces dead `alert()`. "Current" (sand badge) now semantically distinct from "Active" (StatusBadge — only shown for inactive entities).
- **Billing — Stripe Connect clarified** — Connect tab explains routing model clearly; button calls real backend; no dead-end behavior.
- **Payout schedule** — Daily/Weekly/Monthly/Manual selector in Billing Stripe Connect tab. GET/POST `/billing/connect/payout-schedule` backend endpoints added. Saves and persists after refresh. Shows confirmation note when Connect not yet active.
- **Typography utilities** — CSS utility classes added to `client/src/style.css`: `.fc-page-title`, `.fc-section-title`, `.fc-card-title`, `.fc-label`, `.fc-body`, `.fc-muted`, `.fc-stat-number`, `.fc-currency`, `.fc-th`, `.fc-td`.
- **Invoice/deposit status colors** — All status badges now route through `StatusBadge`: Pending=blue, Paid=green, Outstanding/Unpaid/Late/Overdue=red; Deposits: Action Needed=yellow, Collect=yellow, Collected=green, Pending=blue.

## UI ONLY
*(Frontend exists; backend endpoint may exist but integration or data flow not confirmed)*

- **Partner Program** — Partners page exists; backend route for saving applications needs verification
- **Tech Mobile Demo** — Web-based mobile preview; backend integration unclear

---

## BACKEND ONLY
*(Route and DB exist; no frontend or mobile UI confirmed)*

- **Sendblue iMessage/RCS** — Service file exists (`src/services/sendblue.js`); no frontend UI for selecting provider; switched by env var only

---

## NOT STARTED
*(In scope but no implementation found)*

- **Two-Factor Authentication (2FA)** — Brute-force protection exists but no TOTP or email OTP second factor
- **Admin Audit Log Viewer** — Logs written to DB but no UI to review them
- **Mobile Multi-Entity Switching** — Desktop has Entities page; mobile has no equivalent
- **Mobile Deposit Visibility** — Deposits page exists on web; not surfaced in mobile app
- **Mobile Business Settings** — No mobile equivalent for business profile management
- **App Store / Play Store Listings** — EAS build config exists; no store accounts or listings

---

## BLOCKED
*(Implementation exists but cannot proceed without external action)*

- **All SMS features** — Blocked: Twilio A2P 10DLC campaign registration required
- **All payment features** — Blocked: real Stripe account + keys required
- **Email features** (confirmation, reminders, reset, portal magic-link, review links) — Blocked: SMTP credentials not configured
- **AI Chat Widget** — Blocked: `ANTHROPIC_API_KEY` not set
- **Address Autocomplete** — Blocked: `VITE_GOOGLE_MAPS_API_KEY` not set
- **Mobile on physical device** — Blocked: `BASE_URL` in `mobile/api.js` must be updated to real API URL
- **Business Phone System** — Blocked: Twilio Voice + number provisioning not set up

---

## NEEDS BUSINESS DECISION

- **AI Chat Widget** — Include in launch? If yes, define cost model (who pays per message — FieldCore absorbs it, or pass-through to operator?)
- **Business Phone System (Voice + Voicemail)** — Include in MVP launch or defer? Not in original 6-module scope
- **Sendblue (iMessage/RCS)** — Launch with Twilio only, or offer Sendblue too? Only one active at a time
- **Platform fee (1%)** — Confirm `PLATFORM_FEE_PERCENT=1` is the correct business decision
- **BETA_CAP** — Is 100 the right number? What happens after the cap?
- **Starter plan pricing** — Schema has starter/growth/scale but Stripe only has Growth and Scale price IDs in the env template; is Starter free or paid?
- **Partner Program** — What are the actual partner terms? Static page only right now
- **Tech Mobile Demo** — Is this for public prospects or internal sales? Should it be behind auth?

---

## NEEDS THIRD-PARTY PURCHASE / SETUP

| Item | Service | Estimated Setup Time |
|------|---------|---------------------|
| Payment processing | Stripe account (standard) | 1-2 days (bank verification) |
| Subscription billing | Stripe + create products/prices | Same account, 1 hour |
| Stripe Connect | Requires Stripe approval for platform | 2-5 business days |
| SMS — basic | Twilio account + phone number | 1 hour |
| SMS — A2P 10DLC | Twilio brand/campaign registration | 3-7 business days |
| Voice/phone system | Twilio Voice (separate configuration) | 1-2 hours after Twilio account |
| iMessage/RCS (optional) | Sendblue account | 1 hour |
| Email sending | Gmail SMTP (easy) or SendGrid/Postmark | 30 min |
| Address autocomplete | Google Maps API key + billing enabled | 30 min |
| AI chat | Anthropic API key | 30 min |
| Mobile distribution | Apple Developer ($99/yr) + Google Play ($25 one-time) | 1-3 days for accounts |
| Domain | Any registrar | 30 min |
| Production hosting | Railway (backend) + Vercel (frontend) | 1-2 hours |

---

## NEEDS TESTING

- **Job creation → invoice generation → payment** — Full payment flow
- **Booking widget → deposit → job creation** — Public booking to backend flow
- **Technician mobile → GPS check-in → photo upload → complete** — Mobile field flow
- **SMS confirmation and reminder** — Requires Twilio credentials
- **Stripe webhook events** — Subscription created, payment succeeded/failed, payout
- **Plan limit enforcement** — Starter user cap, job cap, SMS gate
- ~~**Multi-tenant isolation**~~ — **COMPLETE (Sprint Task 1)** — All 27 route files audited; 5 files fixed; 44/44 smoke tests pass
- **Password reset flow** — Email delivery + token expiry
- **Client portal magic-link** — Token generation, expiry, access
- **Recurring job creation** — Edge cases (month-end, timezone changes)
- **No-show grace period timer** — Auto-declare at threshold
- **Push notifications on physical device**
- **EAS build on iOS and Android**
