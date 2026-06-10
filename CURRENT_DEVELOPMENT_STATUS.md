# FieldCore — Current Development Status

**Last reconciled:** 2026-06-09 (updated after Sprint Tasks 1, 2, 5 completion)  
**Source of truth:** Actual codebase scan + Sprint Task 1 audit

---

## FULLY WORKING
*(Code complete, logic sound, no external blockers)*

- **Authentication** — JWT login/signup/refresh/logout, password reset, brute-force protection, role-based access
- **Client Database (M1)** — Full CRUD, search, profile, job/SMS history, Stripe customer ID linking
- **Job Scheduling & Dispatch (M2)** — Create/edit/delete jobs, calendar views, technician assignment, recurring jobs, GPS check-in, status tracking
- **Technician Mobile App (M4)** — All 14 screens implemented: job queue, schedule, GPS check-in, photo capture, mark complete, messages, invoice view, signature
- **Team Management** — Owner/manager/tech/staff roles, per-plan user limits enforced
- **Business Settings** — Profile, operating hours, holiday closures, timezone, service vertical
- **Fleet Management** — Vehicle registry CRUD
- **No-Show Tracking** — Grace period clock, auto-declare, deposit retention, SMS notifications, audit trail
- **Estimates with E-Signature** — Create, send, sign digitally (web + mobile)
- **Post-Job Reviews** — Submit and store 1-5 star ratings
- **Multi-Entity Management** — Scale+ feature, account memberships, entity switching
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

- **Beta Signup System**
  - 100-slot cap logic and DB complete
  - Missing: email confirmation (SMTP); admin view of signups

- **Public Payment Page**
  - Code complete
  - Blocked by: Stripe keys

- **Billing & Subscription Management**
  - Code complete; Stripe Subscriptions + Connect wired
  - Blocked by: real Stripe account, `STRIPE_PRICE_GROWTH`/`STRIPE_PRICE_SCALE` IDs not created, Stripe Connect not enabled

---

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
