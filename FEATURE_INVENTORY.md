# FieldCore — Feature Inventory

**Last reconciled:** 2026-07-01 (Fleet UI redesign: stat cards, polished empty states, two-column layout, Live Locations card, Fleet Tracking Integration card, cameras card)  
**Source of truth:** Actual codebase scan + Sprint audit

**Multi-tenant isolation status:** AUDITED 2026-06-09 — All 27 route files verified. Security fixes applied to `users.js` (membership endpoints), `clients.js`, `jobs.js`, `deposits.js`, `payments.js`. 22 files confirmed clean.

Each feature is rated on: Backend / Frontend / Mobile / Database / Integration / Production Readiness

---

## Feature 1: Authentication & User Sessions

**Description:** JWT-based login/signup with refresh tokens, role-based access, brute-force protection, password reset.

**File Locations:**
- Backend: `src/routes/auth.js`, `src/middleware/auth.js`
- Frontend: `client/src/pages/Login.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`, `client/src/context/AuthContext.jsx`, `client/src/components/ProtectedRoute.jsx`
- Mobile: `mobile/screens/LoginScreen.js`
- DB: `users`, `user_sessions`, `login_attempts`, `password_reset_tokens`, `audit_logs`

| Layer | Status |
|-------|--------|
| Backend | Complete — JWT, refresh, brute-force lockout, rate limiting |
| Frontend | Complete — login, forgot/reset password pages |
| Mobile | Complete — login screen with biometric auth (`expo-local-authentication`) |
| Database | Complete |
| Integration | N/A |

**Production Readiness:** High — needs `JWT_SECRET` set to strong value in prod  
**Missing Work:** No 2FA (TOTP/email OTP); biometric fallback not audited  
**UX Updates (2026-06-24):** Login logo now `<a href="/">` linking to homepage. "← Back to homepage" added to Login + ForgotPassword. Sidebar logo → `<Link to="/dashboard">`.  
**Recommended Next Action:** Set strong `JWT_SECRET` in prod `.env`; optionally add email OTP for owner accounts

---

## Feature 2: Client Database (M1)

**Description:** Full CRUD for customer records. Includes contact info, client tier, job history, SMS history, Stripe customer linking.

**File Locations:**
- Backend: `src/routes/clients.js`
- Frontend: `client/src/pages/Clients.jsx`, `ClientProfile.jsx`, `client/src/components/ClientForm.jsx`
- Mobile: Integrated into job screens (client info displayed on jobs)
- DB: `clients` (with `stripe_customer_id`, `stripe_payment_method_id`, LTV fields)

| Layer | Status |
|-------|--------|
| Backend | Complete — `GET /clients` now includes `last_invoice_at`, `last_invoice_status`, `outstanding_balance` via subqueries |
| Frontend | Complete — list shows LTV, outstanding balance, last invoice date/status, client since; add modal respects viewport height |
| Mobile | Partial — read-only client info on jobs; no standalone client management |
| Database | Complete |
| Integration | Stripe customer linking implemented |

**Production Readiness:** High  
**Missing Work:** Mobile standalone client management screen  
**UX Update (2026-06-24):** Client list rebuilt with 7-column grid; real invoice and balance data; styled badges; create modal overflow fixed.  
**Recommended Next Action:** Test client→job→invoice flow end-to-end in staging

---

## Feature 3: Job Scheduling & Dispatch (M2)

**Description:** Create and manage service appointments. Calendar views (day/week/month). Job status tracking. Recurring jobs. Technician assignment. GPS check-in.

**File Locations:**
- Backend: `src/routes/jobs.js`
- Frontend: `client/src/pages/Dashboard.jsx`, `Dispatch.jsx`, `Calendar.jsx`, `client/src/components/JobForm.jsx`, `JobDetail.jsx`
- Mobile: `mobile/screens/HomeScreen.js`, `ScheduleScreen.js`, `JobDetail.js`, `JobQueue.js`
- DB: `jobs` (with `recurring`, `confirmation_sent`, `reminder_sent`, `checkin_lat`, `checkin_lng`, `checkin_at`), `job_photos`

| Layer | Status |
|-------|--------|
| Backend | Complete — CRUD, status updates, recurring, confirmation SMS, no-show marking |
| Frontend | Complete — dashboard, dispatch board, calendar (react-big-calendar) |
| Mobile | Complete — job queue, schedule view, GPS check-in, mark complete |
| Database | Complete |
| Integration | SMS confirmation calls `src/services/sms.js` |

**Production Readiness:** High (SMS confirmation depends on Twilio credentials)  
**Missing Work:** Recurring job edge cases may need real-world testing  
**Recommended Next Action:** End-to-end test with real Twilio credentials

---

## Feature 4: Stripe Payments / Invoicing (M3)

**Description:** Auto-generate invoices on job completion. Charge card on file. Send payment links. Client card setup. PDF invoice export.

**File Locations:**
- Backend: `src/routes/invoices.js`, `src/routes/payments.js`, `src/routes/pay.js`
- Frontend: `client/src/pages/Invoices.jsx`, `client/src/components/InvoiceDetail.jsx`, `CardSetupForm.jsx`
- Mobile: `mobile/screens/InvoiceScreen.js`
- DB: `invoices`, `deposits`
- Integration: Stripe SDK, `src/routes/webhooks.js` (Stripe events)

| Layer | Status |
|-------|--------|
| Backend | Complete — invoice CRUD, PDF export, payment intent, charge on file, payment links |
| Frontend | Complete — invoices list, invoice viewer, card setup form |
| Mobile | Complete — invoice viewer |
| Database | Complete |
| Integration | Stripe wired — needs real `STRIPE_SECRET_KEY` to function |

**Production Readiness:** Medium — all code present; needs real Stripe keys  
**Missing Work:** Real Stripe keys; `STRIPE_WEBHOOK_SECRET` for webhook verification  
**Recommended Next Action:** Set up Stripe account, add keys, test payment flow in Stripe test mode

---

## Feature 5: Technician Mobile App (M4)

**Description:** React Native app for field technicians. Today's jobs, GPS check-in, photo upload, mark complete, e-signatures, ETA SMS, push notifications.

**File Locations:**
- Mobile: `mobile/` (entire directory)
  - Screens: `HomeScreen.js`, `ScheduleScreen.js`, `SearchScreen.js`, `DispatchScreen.js`, `MessagesScreen.js`, `AccountScreen.js`, `JobDetail.js`, `PhotoScreen.js`, `SignatureScreen.js`, `InvoiceScreen.js`, `LoginScreen.js`, `MoreScreen.js`, `TimesheetScreen.js`, `JobQueue.js`
  - Services: `notifications.js`, `storage.js`, `theme.js`
  - API: `mobile/api.js` (BASE_URL must be updated for device)
- Backend: `src/routes/mobile.js`
- DB: `job_photos`, push tokens in `users`

| Layer | Status |
|-------|--------|
| Backend | Complete — mobile endpoints, photo uploads, GPS data storage |
| Frontend | N/A |
| Mobile | Complete — all 14 screens implemented |
| Database | Complete |
| Integration | Expo push notifications, Stripe React Native, expo-location |

**Production Readiness:** Medium — needs `BASE_URL` updated to real API URL; needs Expo EAS build for distribution  
**Missing Work:** `BASE_URL` in `mobile/api.js` must be set; EAS build profile setup; App Store / Play Store accounts  
**Recommended Next Action:** Update `BASE_URL`, run `npx expo start` on physical device, test GPS check-in

---

## Feature 6: Automated SMS (M5)

**Description:** Automated job confirmation and 24h reminder SMS. Manual SMS from messages page. Twilio + optional Sendblue (iMessage/RCS).

**File Locations:**
- Backend: `src/routes/sms.js`, `src/services/sms.js`, `src/services/sendblue.js`, `src/services/scheduler.js`
- Frontend: `client/src/pages/Messages.jsx`
- Mobile: `mobile/screens/MessagesScreen.js`
- DB: `messages`
- Integration: Twilio SDK, Sendblue REST API

| Layer | Status |
|-------|--------|
| Backend | Complete — send, receive, scheduler for reminders |
| Frontend | Complete — messages page with history |
| Mobile | Complete — messages screen |
| Database | Complete |
| Integration | Twilio wired — gated by `SMS_ENABLED=false` until A2P approval |

**Production Readiness:** Low — gated by `SMS_ENABLED` and Twilio A2P 10DLC campaign  
**Missing Work:** Twilio credentials; A2P 10DLC campaign registration (business verification); phone number provisioning  
**Recommended Next Action:** Register Twilio A2P 10DLC campaign; set credentials; test in development

---

## Feature 7: Online Booking Widget (M6)

**Description:** Public-facing 3-step booking form (service picker → date/time → contact + deposit). Embeddable via iframe. Deposit collection via Stripe Checkout. Agreement checkbox.

**File Locations:**
- Backend: `src/routes/booking.js`
- Frontend: `client/src/pages/BookingWidget.jsx`, `Book.jsx` (public, unauthenticated), `BookConfirm.jsx`
- DB: `booking_settings`, `service_templates`
- Integration: Stripe Checkout

| Layer | Status |
|-------|--------|
| Backend | Complete — settings, service templates, availability, booking submission |
| Frontend | Complete — admin widget settings page + public booking form |
| Mobile | N/A |
| Database | Complete — `booking_settings`, `service_templates` tables |
| Integration | Stripe Checkout for deposits — needs real Stripe keys |

**Production Readiness:** Medium — all code present; needs real Stripe keys and `APP_URL`  
**Missing Work:** Real Stripe keys; `APP_URL` must point to production domain  
**Recommended Next Action:** After Stripe setup, test booking flow including deposit capture

---

## Feature 8: Deposits & Payment Protection

**Description:** Pre-job deposit collection, tracking, refunds, expiry alerts. Automated cron expiry reminders.

**File Locations:**
- Backend: `src/routes/deposits.js`, `src/services/scheduler.js`
- Frontend: `client/src/pages/Deposits.jsx`
- DB: `deposits`

| Layer | Status |
|-------|--------|
| Backend | Complete |
| Frontend | Complete |
| Mobile | Not implemented |
| Database | Complete |
| Integration | Stripe (collect/refund) |

**Production Readiness:** Medium — depends on Stripe keys  
**Missing Work:** Mobile deposit visibility; Stripe keys  
**Recommended Next Action:** Test deposit→refund flow with Stripe test mode

---

## Feature 9: Estimates with E-Signature

**Description:** Create service quotes. Client receives link, reviews, and signs digitally. Signature captured on mobile or web.

**File Locations:**
- Backend: `src/routes/estimates.js`
- Frontend: `client/src/pages/Estimates.jsx`, `EstimatesSigning.jsx`
- Mobile: `mobile/screens/SignatureScreen.js`
- DB: `estimates`

| Layer | Status |
|-------|--------|
| Backend | Complete |
| Frontend | Complete — estimates list + signing page |
| Mobile | Complete — signature capture screen |
| Database | Complete |
| Integration | N/A |

**Production Readiness:** Medium — functional but needs end-to-end testing  
**Missing Work:** Email delivery of estimate links (depends on SMTP)  
**Recommended Next Action:** Configure SMTP, test estimate→sign flow

---

## Feature 10: No-Show Tracking & Clock

**Description:** Configurable grace period timer. Auto-declare no-show after threshold. SMS notification to client and tech. Deposit retention. GPS evidence. Permanent audit trail.

**File Locations:**
- Backend: `src/routes/noshow.js`
- Frontend: `client/src/components/NoShowClock.jsx`, `NoShowStrip.jsx`
- DB: `no_show_settings`, `no_show_records`

| Layer | Status |
|-------|--------|
| Backend | Complete — settings, clock, auto-declare, deposit retention |
| Frontend | Complete — clock component, alert strip |
| Mobile | Integrated (job status updates) |
| Database | Complete |
| Integration | SMS (Twilio) for notifications |

**Production Readiness:** Medium — SMS notifications depend on Twilio  
**Missing Work:** Twilio credentials  
**Recommended Next Action:** Test grace period timer flow manually

---

## Feature 11: Team Management

**Description:** Add/remove team members. Assign roles (owner/manager/tech/staff). Per-plan user limits enforced.

**File Locations:**
- Backend: `src/routes/users.js`, `src/middleware/planLimits.js`
- Frontend: `client/src/pages/Team.jsx`
- Mobile: `mobile/screens/AccountScreen.js`
- DB: `users`

| Layer | Status |
|-------|--------|
| Backend | Complete |
| Frontend | Complete |
| Mobile | Partial — profile/security only, no team management |
| Database | Complete |
| Integration | N/A |

**Production Readiness:** High  
**Missing Work:** None critical  
**Recommended Next Action:** Test plan limit enforcement (try adding 3rd user on Starter plan)

---

## Feature 12: Business Phone System (Voice + Voicemail)

**Description:** Provisioned Twilio phone number per account. Call routing. Call logs. Voicemail with transcription. Inbound call popup (CallerID).

**File Locations:**
- Backend: `src/routes/phone.js`
- Frontend: `client/src/pages/Phone.jsx`, `CallLogs.jsx`, `client/src/components/CallerID.jsx`
- DB: `phone_numbers`, `call_logs`, `voicemails`
- Integration: Twilio Voice

| Layer | Status |
|-------|--------|
| Backend | Complete |
| Frontend | Complete — phone page, call logs, live caller ID popup |
| Mobile | Not fully implemented |
| Database | Complete |
| Integration | Twilio Voice — needs credentials + number provisioning |

**Production Readiness:** Low — not in original MVP scope; requires Twilio Voice setup  
**Missing Work:** Twilio credentials; number provisioning; A2P registration; Growth/Scale plan gating unclear  
**UX Updates (2026-06-24):** Phone Numbers, Call Log, and Voicemail tabs rebuilt with shared `CommCard` + `CommEmptyState`. All three tabs now match Messages tab quality (full-width cards, column headers, status badges, icons, empty states). Header padding and typography standardized.  
**Recommended Next Action:** Confirm this is in scope for launch; if yes, set up Twilio Voice; if no, gate behind plan flag

---

## Feature 13: Business Settings & Profile

**Description:** Business name, address, EIN, logo, timezone, service vertical, operating hours, holiday closures.

**File Locations:**
- Backend: `src/routes/business-settings.js`
- Frontend: `client/src/pages/BusinessSettings.jsx`
- DB: `business_profiles`, `business_hours`, `holiday_closures`

| Layer | Status |
|-------|--------|
| Backend | Complete |
| Frontend | Complete |
| Mobile | Not implemented |
| Database | Complete |
| Integration | Logo upload (storage not confirmed — likely local or S3) |

**Production Readiness:** Medium — logo upload storage solution needs confirmation  
**Missing Work:** Logo storage destination (local disk vs. S3/Cloudflare R2) unclear  
**Recommended Next Action:** Confirm where uploaded files are stored; ensure production persistence

---

## Feature 14: Billing & Subscription Management

**Description:** Subscribe to Growth or Scale plan via Stripe. Manage plan. Billing portal. Stripe Connect for contractor payouts.

**File Locations:**
- Backend: `src/routes/billing.js`, `src/routes/connect.js`
- Frontend: `client/src/pages/Billing.jsx`
- DB: `accounts` (plan, stripe_customer_id, stripe_subscription_id), `billing_events`
- Integration: Stripe Subscriptions, Stripe Connect, Stripe Webhooks

| Layer | Status |
|-------|--------|
| Backend | Complete |
| Frontend | Complete |
| Mobile | Not implemented |
| Database | Complete |
| Integration | Stripe — needs real keys + Stripe Connect enabled on account |

**Production Readiness:** Low — needs real Stripe account with Connect enabled; price IDs (`STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_SCALE`) must be created  
**Missing Work:** Create Stripe products/prices; enable Stripe Connect; set all Stripe env vars  
**UX Updates (2026-06-24):** "Request Downgrade" button added in Current Plan banner and Plans tab footer; opens modal with support contact info. Stripe Connect tab clarified — explains routing model; button calls real backend. Payout schedule selector (Daily/Weekly/Monthly/Manual) added; backend GET/POST `/billing/connect/payout-schedule` endpoints added.  
**Recommended Next Action:** Create Stripe products and price IDs; test subscription creation

---

## Feature 15: Analytics & Revenue Dashboard

**Description:** Revenue metrics, job counts, trends. Per-account reporting.

**File Locations:**
- Backend: `src/routes/analytics.js`
- Frontend: `client/src/pages/Revenue.jsx`
- DB: Queries across `jobs`, `invoices`, `deposits`

| Layer | Status |
|-------|--------|
| Backend | Complete |
| Frontend | Complete |
| Mobile | Not implemented |
| Database | Complete (queries existing tables) |
| Integration | N/A |

**Production Readiness:** Medium — functional; no real data to validate accuracy  
**Missing Work:** Needs real transaction data to validate metrics  
**Recommended Next Action:** Seed realistic test data; verify revenue totals match

---

## Feature 16: Client Portal

**Description:** Magic-link access for end customers to view job status, pay invoices, and review booking history.

**File Locations:**
- Backend: `src/routes/portal.js`
- Frontend: `client/src/pages/ClientPortal.jsx`
- DB: `client_portal_tokens`

| Layer | Status |
|-------|--------|
| Backend | Complete |
| Frontend | Complete |
| Mobile | N/A |
| Database | Complete |
| Integration | Email magic-link delivery (depends on SMTP) |

**Production Readiness:** Low — magic-link email delivery requires SMTP  
**Missing Work:** SMTP credentials; test end-to-end magic-link flow  
**Recommended Next Action:** Configure SMTP; test portal access as a client

---

## Feature 17: AI Chat Widget

**Description:** In-app AI assistant powered by Anthropic API. Embedded chat widget for operators.

**File Locations:**
- Backend: `src/routes/chat.js`
- Frontend: `client/src/components/ChatWidget.jsx`
- Integration: `@anthropic-ai/sdk` 0.98.0

| Layer | Status |
|-------|--------|
| Backend | Complete |
| Frontend | Complete |
| Mobile | Not implemented |
| Database | N/A (stateless or messages stored in `messages` table — TBD) |
| Integration | Anthropic API — needs `ANTHROPIC_API_KEY` |

**Production Readiness:** Low — needs API key; cost implications not addressed  
**Missing Work:** `ANTHROPIC_API_KEY`; cost model (per-message billing to operator?); rate limiting  
**Recommended Next Action:** Decide whether to include in launch or gate; if yes, set API key and add per-account rate limits

---

## Feature 18: Fleet Management

**Description:** Company vehicle registry per account. Year, make, model, license plate. Includes live location display (GPS check-ins) and live vehicle camera section (third-party provider integration foundation).

**File Locations:**
- Backend: `src/routes/fleet.js`
- Frontend: `client/src/pages/Fleet.jsx`
- DB: `fleet_vehicles`, `fleet_vehicle_cameras` (migration pending — see fleet.js header comment)

| Layer | Status |
|-------|--------|
| Backend | Complete — CRUD + tech-locations + camera endpoint (GET /fleet/cameras/:vehicleId) |
| Frontend | Complete — vehicle list, live locations, Live Vehicle Cameras section (all tile states) |
| Mobile | Referenced but not a dedicated screen |
| Database | fleet_vehicles complete; fleet_vehicle_cameras schema defined in code, table not yet created |
| Integration | Foundation ready; no live provider connected yet |

**Camera Sub-feature (added 2026-07-01):**
- Permission: `fleet.camera.view` — owner/manager only (admin when role is formalized)
- Provider support prepared: Samsara, Motive, Geotab, Verizon Connect, Azuga, Fleetio, Generic
- Camera positions: front, cab, rear
- Tile states: live, snapshot, offline, error, no_camera, setup_required, loading
- IMPORTANT: stream_url values are short-lived; when a provider is connected, fetch fresh signed URLs via provider API rather than storing raw stream URLs long-term
- `external_camera_id` + `external_vehicle_id` fields are the stable references to use for token refresh

**UI Redesign (2026-07-01):**
- 4-column stat cards: Total Vehicles, On Job Today (real GPS check-in count), GPS Tracking (—), Cameras (—)
- Polished empty state for vehicle list (truck icon, CTA button)
- `.fleet-2col` responsive two-column layout on desktop (stacks at 900px): Live Locations | Fleet Tracking Integration
- Live Locations card: shows real tech check-in data (coords, service type, time ago); empty state with MapPin icon
- Fleet Tracking Integration card: Setup Required badge, provider grid (Samsara/Motive/Geotab/Verizon Connect/Azuga/Fleetio), mailto CTA
- Live Vehicle Cameras: full-width dash-card, vehicle selector, camera tile grid, setup-required notice
- No fake data — all stat cards show real values or "—" + "No provider connected"

**Production Readiness:** High for vehicle registry; Low for cameras (no provider connected)  
**Missing Work:** Mobile view; `fleet_vehicle_cameras` DB migration; actual provider API integration  
**Recommended Next Action:** Run DB migration when first camera provider is configured; see fleet.js header comment for full schema

---

## Feature 19: Multi-Entity Management (Scale+)

**Description:** One user account managing multiple business entities. Cross-entity reporting.

**File Locations:**
- Backend: `src/routes/entities.js`
- Frontend: `client/src/pages/Entities.jsx`
- DB: `accounts`, `account_memberships`

| Layer | Status |
|-------|--------|
| Backend | Complete |
| Frontend | Complete |
| Mobile | Not implemented |
| Database | Complete |
| Integration | N/A |

**Production Readiness:** Medium — Scale plan feature; needs plan gating tested  
**Missing Work:** Mobile multi-entity switching; test plan gating  
**UX Updates (2026-06-24 — full fix):** Root cause resolved: `/api/auth/me` now uses `payload.accountId` for account lookup, so `accountName`, `plan`, and `role` are correct after switching. Topbar shows active business name below page title. Dashboard shows "Viewing | Business Name" banner. Entity switcher has loading/error states, disabled state, single-entity hint.  
**Recommended Next Action:** Verify `requireRole` + plan limit gates work correctly for entities endpoint

---

## Feature 20: Onboarding Flow

**Description:** First-time account setup wizard (business info, services, payment setup, first job).

**File Locations:**
- Backend: `src/routes/onboarding.js`
- Frontend: `client/src/pages/Onboarding.jsx`
- DB: `business_profiles`, `booking_settings`

| Layer | Status |
|-------|--------|
| Backend | Complete |
| Frontend | Complete |
| Mobile | Not implemented |
| Database | Complete |
| Integration | Stripe card setup as part of onboarding |

**Production Readiness:** Medium  
**Missing Work:** Test the full onboarding funnel; Stripe card setup in onboarding flow needs real keys  
**Recommended Next Action:** Run through onboarding flow manually from sign-up to first job

---

## Feature 21: Post-Job Reviews

**Description:** After job completion, client receives link to leave a 1-5 star rating.

**File Locations:**
- Backend: `src/routes/reviews.js`
- Frontend: `client/src/pages/Review.jsx`
- DB: `reviews`

| Layer | Status |
|-------|--------|
| Backend | Complete |
| Frontend | Complete |
| Mobile | Not implemented |
| Database | Complete |
| Integration | Email delivery of review links (SMTP) |

**Production Readiness:** Low — review link delivery requires SMTP  
**Missing Work:** SMTP; test review flow  
**Recommended Next Action:** Configure SMTP; test review link delivery

---

## Feature 22: Push Notifications

**Description:** Expo push notifications for mobile app (new job assigned, status updates).

**File Locations:**
- Backend: `src/routes/push-tokens.js`, `src/routes/notifications.js`
- Frontend: `client/src/components/NotificationBell.jsx`
- Mobile: `mobile/services/notifications.js`
- DB: `notifications`

| Layer | Status |
|-------|--------|
| Backend | Complete |
| Frontend | Complete — notification bell |
| Mobile | Complete — token registration, notification handlers |
| Database | Complete |
| Integration | Expo push notification service |

**Production Readiness:** Medium — needs EAS build and physical device test  
**Missing Work:** EAS build; test on physical device  
**Recommended Next Action:** Build with EAS, test push notification delivery

---

## Feature 23: Beta Signup System

**Description:** Public beta signup with 100-slot active cap. Waitlist beyond cap.

**File Locations:**
- Backend: `src/routes/beta.js`
- Frontend: Landing page integration
- DB: `beta_signups`

| Layer | Status |
|-------|--------|
| Backend | Complete |
| Frontend | Landing page (separate Next.js app) |
| Mobile | N/A |
| Database | Complete |
| Integration | Email notification (SMTP) |

**Production Readiness:** Medium  
**Missing Work:** Email confirmation on signup (SMTP); admin view of signups  
**Recommended Next Action:** Set `BETA_CAP` in prod env; configure SMTP for confirmation emails

---

## Feature 24: Marketing & Landing Site

**Description:** Public-facing Next.js site. Pages include: Home, About, Blog, Careers, Contact, Press, FAQ, Updates, Partners, Terms, Privacy, SMS Terms.

**File Locations:**
- All: `landing/` (separate Next.js 16 app)
- Individual pages noted in `AGENTS.md` and `README.md`

| Layer | Status |
|-------|--------|
| Backend | N/A (static/SSG) |
| Frontend | Complete |
| Mobile | N/A |
| Database | N/A |
| Integration | Contact form hits `/api/contact` |

**Production Readiness:** Medium — needs domain + content review  
**Missing Work:** Real business content (About, Blog posts, Press); real domain; contact form SMTP  
**Recommended Next Action:** Review all static pages for placeholder content; set up domain

---

## Feature 25: Partner Program

**Description:** Partner application form for referral/reseller partners.

**File Locations:**
- Backend: (partner applications stored in `partner_applications` table)
- Frontend: `client/src/pages/Partners.jsx`
- DB: `partner_applications`

| Layer | Status |
|-------|--------|
| Backend | Partial — table exists, route unclear |
| Frontend | Complete |
| Mobile | N/A |
| Database | Complete |
| Integration | N/A |

**Production Readiness:** Low — backend route for saving applications needs verification  
**Missing Work:** Verify backend route exists and is wired; admin view of applications  
**Recommended Next Action:** Verify `/api/contact` or dedicated route handles partner form submission

---

## Feature 26: Manager Tablet View

**Description:** Optimized dashboard view for managers on tablet devices.

**File Locations:**
- Frontend: `client/src/pages/ManagerTablet.jsx`
- Backend: Uses existing job/client endpoints

| Layer | Status |
|-------|--------|
| Backend | N/A (uses existing endpoints) |
| Frontend | Complete |
| Mobile | N/A |
| Database | N/A |
| Integration | N/A |

**Production Readiness:** Unknown — needs testing on actual tablet viewport  
**Missing Work:** Tablet testing  
**Recommended Next Action:** Test on iPad/Android tablet or responsive breakpoint

---

## Feature 27: Tech Mobile Demo Mode

**Description:** Demo/preview mode for showing the mobile experience on web.

**File Locations:**
- Frontend: `client/src/pages/TechMobileDemo.jsx`

| Layer | Status |
|-------|--------|
| Backend | N/A |
| Frontend | Complete |
| Mobile | N/A |
| Database | N/A |
| Integration | N/A |

**Production Readiness:** Unknown — likely a sales/demo tool  
**Missing Work:** Unclear if this is meant for public or internal use  
**Recommended Next Action:** Confirm intended audience; gate appropriately

---

## Feature 28: Audit Logging

**Description:** Security audit trail for all sensitive actions (login, data changes, deletions).

**File Locations:**
- Backend: `src/services/audit.js`
- DB: `audit_logs`

| Layer | Status |
|-------|--------|
| Backend | Complete |
| Frontend | Not implemented (no admin audit log viewer) |
| Mobile | N/A |
| Database | Complete |
| Integration | N/A |

**Production Readiness:** Medium — logging works; no UI to review logs  
**Missing Work:** Admin UI for audit log review  
**Recommended Next Action:** Not blocking for launch; add admin view post-launch

---

## Feature 29: Public Payment Page

**Description:** Unauthenticated page for clients to pay invoices via link.

**File Locations:**
- Backend: `src/routes/pay.js`
- Frontend: `client/src/pages/Pay.jsx`
- Integration: Stripe

| Layer | Status |
|-------|--------|
| Backend | Complete |
| Frontend | Complete |
| Mobile | N/A |
| Database | N/A (updates `invoices` table) |
| Integration | Stripe — needs real keys |

**Production Readiness:** Medium — needs Stripe keys  
**Missing Work:** Stripe keys  
**Recommended Next Action:** Test with Stripe test mode payment link
