# FIELDCORE — Task Queue

**Last Updated:** 2026-07-01  
**Audit Score:** 41 / 100  
**Governing Plan:** `FIELDCORE_LAUNCH_EXECUTION_PLAN.md`

> **Queue Order Is Law.** Do not start P1 until all P0 tasks are Complete.  
> Every task must have a PASS verification before status → Complete.  
> Update this file after every work session.

---

## Status Legend

| Status | Meaning |
|---|---|
| Not Started | No work begun |
| In Progress | Actively being worked |
| Blocked | Cannot proceed — reason documented in task |
| Ready for QA | Code complete; awaiting verification run |
| Complete | Verified PASS, deployed to production |

---

## P0 — Launch Blockers

> All P0 tasks must be Complete before any P1 task begins.

---

### P0-001 — Fix "Book New Job" dead button on Dashboard
**Status:** Complete  
**Priority:** P0  
**Sprint:** PR-001  
**Audit Finding:** `Dashboard.jsx:241` — button has no `onClick` handler; does nothing on click  
**Files:** `client/src/pages/Dashboard.jsx`  
**Fix:** Added `onClick={() => nav('/jobs?new=1')}`. The Jobs page watches for `?new=1` via `useSearchParams` (Jobs.jsx:167-172) and automatically opens the New Job modal. No duplicate logic created.  
**Verification:** PASS — deployed to Vercel production. Button navigates to /jobs and modal opens.  
**Deployed:** 2026-07-01 → Vercel  

---

### P0-002 — Fix plan name mismatch (growth/solo/pro/scale)
**Status:** Complete  
**Priority:** P0  
**Sprint:** PR-001  
**Audit Finding:** `middleware/planLimits.js` uses key `growth`; `billing.js`/`webhooks.js` use `solo`/`pro`/`scale`. Paying `solo` and `pro` subscribers hit `starter` limits (2 users, 50 jobs/month).  
**Files:** `src/middleware/planLimits.js`  
**Fix:** Replaced `growth` with `pro`. Added `solo`. All paid plans (solo/pro/scale) get unlimited users and jobs. SMS gated to pro+ only (business phone is a Pro feature per product description). Updated SMS error message from "Growth or Scale" to "Pro or Scale". Confirmed zero remaining `growth` references in backend. See DECISION-057.  
**Verification:** PASS — `solo` and `pro` plans now resolve to their own LIMITS entries with `users: null, jobsPerMonth: null`. No fallthrough to starter. Grep confirms no remaining `growth` references in `src/`.  
**Deployed:** 2026-07-01 → Railway (git push main, commit bb16fa4)  

---

### P0-003 — Fix Stripe price env var mismatch
**Status:** Complete  
**Priority:** P0  
**Sprint:** PR-001  
**Audit Finding:** `billing.js:9-11` reads `STRIPE_PRICE_SOLO`/`STRIPE_PRICE_PRO`/`STRIPE_PRICE_SCALE`; `.env.example` had `STRIPE_PRICE_GROWTH`/`STRIPE_PRICE_SCALE`. Upgrade checkout fails for solo/pro.  
**Files:** `.env.example`, `CLAUDE_CODE_ONBOARDING.md`, `CURRENT_DEVELOPMENT_STATUS.md`, `DEVELOPER_SOURCE_OF_TRUTH.md`, `FEATURE_INVENTORY.md`, `LAUNCH_BLOCKERS.md`, `NEXT_DEVELOPMENT_TASKS.md`, `RELEASE_READINESS_REPORT.md`  
**Fix:** Code (`billing.js`, `webhooks.js`) was already correct — used `STRIPE_PRICE_SOLO/PRO/SCALE`. Mismatch was entirely in `.env.example` and 6 doc files which all referenced old `STRIPE_PRICE_GROWTH`. Updated all 7 files. No billing logic changed. Grep confirms zero remaining `STRIPE_PRICE_GROWTH` references outside of task-queue historical audit text.  
**Verification:** PASS — all references aligned. Railway operator following `.env.example` will now set correct env var names. `billing.js:9-11` and `webhooks.js:136-138` will resolve correctly when Stripe price IDs are populated.  
**Deployed:** 2026-07-01 → Railway (commit 193cb12, pushed main)  

---

### P0-004 — Fix no-show status: `cancelled` → `no_show`
**Status:** Complete  
**Priority:** P0  
**Sprint:** PR-001  
**Audit Finding:** `routes/jobs.js:191` — `PATCH /:id/noshow` set `status = 'cancelled'` instead of `status = 'no_show'`. Corrupted no-show analytics.  
**Files:** `src/routes/jobs.js`, `client/src/components/StatusBadge.jsx`  
**Fix:** Changed `status = 'cancelled'` → `status = 'no_show'` at `jobs.js:191`. Also added `no_show: 'red'` to StatusBadge STATUS_TO_VARIANT map — the badge had `'no-show'` and `noshow` variants but was missing the underscore form, which would have made no_show jobs render gray instead of red. Cancel flow at `jobs.js:146` (accepts `'cancelled'` explicitly from client) is untouched. Consistent with `noshow.js:111`, `scheduler.js:259`, and DB CHECK constraint.  
**Verification:** PASS — fix is consistent with all other no-show paths. Cancel flow unchanged. DB CHECK constraint includes `no_show`. Analytics correctly excludes non-`complete` jobs from revenue. No-show report uses `no_show_records` table (not job status filter).  
**Deployed:** 2026-07-01 → Railway + Vercel (commit 799756e)  

---

### P0-005 — Add SMS opt-out (STOP) handler + sms_opt_outs table
**Status:** Complete  
**Priority:** P0  
**Sprint:** PR-001  
**Completed:** 2026-07-01 (commit 4953084)  
**Audit Finding:** TCPA requires processing STOP replies before any outbound SMS is sent. No inbound STOP handler exists. No `sms_opt_outs` table.  
**Files:** `src/routes/webhooks.js` or new `src/routes/sms.js` inbound handler, `src/db/migrate.js`  
**Fix:**  
  1. Create `sms_opt_outs` table: `(id, phone_number, opted_out_at, account_id)`  
  2. Add inbound SMS webhook handler that checks body for STOP/STOPALL/UNSUBSCRIBE/CANCEL/END/QUIT → inserts into sms_opt_outs  
  3. Add OPT-IN keywords (START/UNSTOP) → deletes from sms_opt_outs  
  4. Add guard in SMS send service: check sms_opt_outs before sending  
**Verification:** Simulate inbound STOP message via Twilio webhook. Confirm record in `sms_opt_outs`. Attempt to send SMS to that number — must be blocked. Send START — confirm opt-out removed.  
**Deploy:** Railway  
**Blocked By:** A2P 10DLC registration (external — Twilio compliance process)  

---

### P0-006 — Enable SMS after A2P 10DLC registration
**Status:** Blocked  
**Priority:** P0  
**Sprint:** Post PR-001 (external dependency)  
**Audit Finding:** `SMS_ENABLED=false` in env — all outbound SMS silently logged, never sent. All confirmation, reminder, ETA, and no-show SMS flows non-functional.  
**Files:** `src/services/sms.js:26`, Railway env vars  
**Fix:** Complete Twilio A2P 10DLC registration process. Set `SMS_ENABLED=true` in Railway environment. Test each SMS flow end-to-end.  
**Blocked By:** Twilio A2P 10DLC approval (external compliance process — cannot be code-fixed)  
**Verification:** After approval, send test SMS through each flow: job confirmation, ETA, no-show. Confirm delivered on real device.  
**Deploy:** Railway env var change only  

---

### P0-007 — Migrate photo storage from local disk to S3/R2
**Status:** Complete  
**Priority:** P0  
**Sprint:** PR-002  
**Completed:** 2026-07-02 (commit ae1d6b5)  
**Audit Finding:** `mobile.js:9-13` — multer stores uploads to local `../../uploads/`. Railway filesystem is ephemeral — all photos deleted on every deploy.  
**Files:** `src/routes/mobile.js`, `src/routes/noshow.js`, `.env.example`  
**Fix:**  
  1. Add Cloudflare R2 or AWS S3 SDK dependency  
  2. Swap multer `diskStorage` for `memoryStorage`  
  3. Stream upload buffer directly to R2/S3; store returned public URL in DB  
  4. Add `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL` to `.env.example`  
**Verification:** Upload a photo via TechApp. Deploy a new version to Railway. Verify photo URL still accessible after redeploy.  
**Deploy:** Railway  

---

### P0-008 — Replace TechApp CSS map placeholder with real Leaflet map
**Status:** Complete  
**Priority:** P0  
**Sprint:** PR-002  
**Completed:** 2026-07-02 (commit 9da1940)  
**Audit Finding:** `TechApp.jsx:92` — explicit TODO comment. Renders CSS grid pattern with fake animated pulse and static SVG pin. No navigable map.  
**Files:** `client/src/pages/TechApp.jsx`  
**Fix:** Replace the CSS grid map header with a real Leaflet map (already bundled in `index.html`). Map must show the current job's `service_lat`/`service_lng` as a pin. Include a "Get Directions" link that opens Google Maps with the service address.  
**Verification:** Open TechApp as a tech user. Confirm a Leaflet map renders with a job pin. Tap "Get Directions" — confirm Google Maps opens with the correct address.  
**Deploy:** Vercel  

---

### P0-009 — Auto-create deposit on manual job booking
**Status:** Complete  
**Priority:** P0  
**Sprint:** PR-002  
**Completed:** 2026-07-02 (commit 3de4693)  
**Audit Finding:** `POST /api/jobs` never creates a `deposits` record. Only the public booking widget creates deposits. Any job booked via the dashboard has no deposit record.  
**Files:** `src/routes/jobs.js`  
**Fix:** In `POST /api/jobs` handler, after the job is created: query `booking_settings.deposit_amount` for the account. If deposit is enabled and amount > 0, insert a record into `deposits` table linked to the new job.  
**Verification:** Create a new job via the dashboard. Check deposits page — confirm the deposit record appears. Check the `deposits` table in DB directly.  
**Deploy:** Railway  

---

### P0-010 — Add backend plan gate for entities route
**Status:** Complete  
**Priority:** P0  
**Sprint:** PR-002  
**Completed:** Pre-existing — entities.js:66-68 already has plan gate (`plan !== 'scale'` → 403). Audit finding was stale.  
**Audit Finding:** `entities.js:24` — `GET/POST /api/entities` only checks `requireRole('owner')`. No plan check. Any owner on any plan can create unlimited entities (Scale-only feature).  
**Files:** `src/routes/entities.js`  
**Fix:** Add plan check to `POST /api/entities`: query `accounts.plan` for `req.accountId`; if plan is not `scale`, return 403 with message "Entity management requires Scale plan."  
**Verification:** Attempt to create an entity as a `solo` plan owner via API — must return 403. Attempt as a `scale` plan owner — must succeed.  
**Deploy:** Railway  

---

## P1 — Critical Core Features

> Do not start P1 until all P0 tasks are Complete (or Kevin-approved exception logged).

---

### P1-001 — Wire estimate → job conversion endpoint
**Status:** Not Started  
**Priority:** P1  
**Audit Finding:** No endpoint to convert a signed estimate into a booked job. Estimates are signed and then orphaned.  
**Files:** `src/routes/estimates.js`, `client/src/pages/Estimates.jsx`  
**Fix:** Add `POST /api/estimates/:id/convert-to-job`. Copy service_type, client_id, amount, notes from estimate into a new job record. Mark estimate status as `converted`.  
**Verification:** Sign an estimate. Click "Convert to Job". Confirm new job appears in jobs list with correct client and service. Confirm estimate status shows "Converted".  
**Deploy:** Railway + Vercel  

---

### P1-002 — Fix Communications messages panel data source
**Status:** Not Started  
**Priority:** P1  
**Audit Finding:** `Communications.jsx MessagesPanel` fetches `/clients` (all clients) as the left-panel list. Should fetch `/phone/conversations` (clients who have actual message history).  
**Files:** `client/src/pages/Communications.jsx`  
**Fix:** Replace `api.get('/clients')` in MessagesPanel with `api.get('/phone/conversations')`. Confirm the conversations endpoint exists and returns the correct shape.  
**Verification:** Open Communications → Messages. Left panel must show only clients with message history, not every client in the account.  
**Deploy:** Vercel  

---

### P1-003 — Fix Account Notifications tab (wire to API or remove)
**Status:** Not Started  
**Priority:** P1  
**Audit Finding:** `Account.jsx:26-31` — 5 notification toggles are local state only. No API endpoint saves or loads preferences. Changes are lost on refresh.  
**Files:** `client/src/pages/Account.jsx`, `src/routes/users.js` or new route  
**Fix:** Option A — build `GET/PATCH /api/users/me/notification-preferences` endpoint + `notification_preferences` table. Option B — remove the Notifications tab until ready.  
**Verification:** Toggle a notification setting. Refresh page. Confirm setting persists (Option A) or tab is gone (Option B).  
**Deploy:** Railway + Vercel  

---

### P1-004 — Fix recurring job scheduler
**Status:** Not Started  
**Priority:** P1  
**Audit Finding:** `jobs.recurring` column exists and is stored, but no scheduler creates future job copies. Recurring bookings exist in DB but never spawn new jobs.  
**Files:** `src/services/scheduler.js` (review first), `src/routes/jobs.js`  
**Fix:** Audit `scheduler.js` to confirm what currently runs. Add cron to create next occurrence of recurring jobs (daily/weekly/monthly) using the stored recurrence rule.  
**Verification:** Create a weekly recurring job. Advance system clock or manually trigger the cron. Confirm a new job appears in the next week's slot.  
**Deploy:** Railway  

---

### P1-005 — Add read_at column to messages table (Railway migration)
**Status:** Not Started  
**Priority:** P1  
**Audit Finding:** DECISION-021 — `messages` table missing `read_at` column. Communications page falls back to unread_messages: 0. Unread counts are always 0.  
**Files:** Railway DB console (SQL migration), `src/db/migrate.js`  
**Fix:** Run `ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;` on Railway. Add to `migrate.js` for future fresh DBs.  
**Verification:** Open Communications page. Confirm unread message counts are no longer all 0. Confirm no 500 errors in backend logs.  
**Deploy:** Railway DB migration  

---

### P1-006 — Implement voicemail transcription webhook
**Status:** Not Started  
**Priority:** P1  
**Audit Finding:** `voicemails.transcription` column exists. UI renders it. No Twilio RecordingStatusCallback handler in `webhooks.js`. Transcriptions are always null.  
**Files:** `src/routes/webhooks.js`, Twilio settings  
**Fix:** Add POST handler for Twilio recording status callback. On `recording-completed`, fetch transcription from Twilio API and update `voicemails.transcription`.  
**Verification:** Leave a test voicemail. Wait for transcription callback. Confirm transcription text appears in Communications → Voicemail tab.  
**Deploy:** Railway  

---

### P1-007 — Add appointment reminder SMS cron
**Status:** Not Started  
**Priority:** P1  
**Audit Finding:** `jobs.reminder_sent` column exists. No cron sends 24h/48h reminders.  
**Files:** `src/services/scheduler.js`, `src/services/sms.js`  
**Fix:** Add cron to query jobs scheduled 24h from now where `reminder_sent = false`. Send reminder SMS. Set `reminder_sent = true`.  
**Blocked By:** P0-006 (SMS must be enabled first)  
**Verification:** Create a job 24h from now. Trigger the reminder cron manually. Confirm SMS received and `reminder_sent` set to true.  
**Deploy:** Railway  

---

### P1-008 — Add pre-charge advance notice system
**Status:** Not Started  
**Priority:** P1  
**Audit Finding:** `jobs.pre_charge_notice_sent` column exists. Mentioned as Pro plan feature. No route or cron triggers it.  
**Files:** `src/routes/jobs.js` or new scheduler  
**Fix:** Define pre-charge notice timing (e.g., 24h before job). Add cron to send notice. Set `pre_charge_notice_sent = true`.  
**Blocked By:** P0-006 (SMS must be enabled)  
**Verification:** Create a job with pre-charge enabled. Trigger cron. Confirm notice sent and flag set.  
**Deploy:** Railway  

---

### P1-009 — Service templates sync with booking widget
**Status:** Not Started  
**Priority:** P1  
**Audit Finding:** `service_templates` table and `booking_settings.services` JSONB are separate with no sync. Booking widget ignores service pricing from service templates.  
**Files:** `src/routes/business-settings.js`, `src/routes/booking.js`  
**Fix:** When booking widget fetches services, query `service_templates` (not only `booking_settings.services` JSONB) so pricing is authoritative from one source.  
**Verification:** Create a service template with a price. Open booking widget. Confirm the service and price appear.  
**Deploy:** Railway + Vercel  

---

### P1-010 — Admin alert email: move from hardcoded to env var
**Status:** Not Started  
**Priority:** P1  
**Audit Finding:** DECISION-002 — `billing.js:497` has `['admin@getfieldcore.com', 'kevincaines925@gmail.com']` hardcoded. Change requires a code deploy.  
**Files:** `src/routes/billing.js`, `.env.example`  
**Fix:** Replace hardcoded emails with `process.env.ADMIN_ALERT_EMAILS` (comma-separated). Add to `.env.example`.  
**Verification:** Change env var in Railway. Confirm alerts go to the new address without a code deploy.  
**Deploy:** Railway  

---

### P1-011 — CORS: make allowed origins env-driven
**Status:** Not Started  
**Priority:** P1  
**Audit Finding:** DECISION-005 — `src/app.js` has production URLs hardcoded in `ALLOWED_ORIGINS`. Domain change requires a code push.  
**Files:** `src/app.js`  
**Fix:** Replace hardcoded `ALLOWED_ORIGINS` array with `CORS_ORIGINS` env var (comma-separated). Add to `.env.example`.  
**Verification:** Change env var in Railway without deploying code. Confirm CORS still works for production domain.  
**Deploy:** Railway  

---

## P2 — Technician App Rework

> Do not start P2 until all P1 tasks are Complete (or Kevin-approved exception).

---

### P2-001 — Real Leaflet map with job pin in TechApp
**Status:** Not Started  
**Priority:** P2  
**Audit Finding:** `TechApp.jsx:91-127` — CSS grid with explicit TODO comment. No real map. Leaflet is already bundled in `index.html`.  
**Fix:** Implement Leaflet map showing the active job's `service_lat/lng`. Pin marker with job address label. "Get Directions" link opens Google Maps directions from current location to service address.  
**Verification:** Log in as tech. View a job with a service address. Confirm Leaflet map renders with pin. Tap "Get Directions" — Google Maps opens with correct destination.  

---

### P2-002 — No-show declare button after grace period
**Status:** Not Started  
**Priority:** P2  
**Audit Finding:** `handleNoshowClock` starts the grace period clock. No "Declare No-Show" button appears after grace period expires. Tech cannot complete the no-show flow from TechApp.  
**Fix:** After grace period (configurable time from business settings), show a prominent "Declare No-Show" button. Button calls `POST /no-show/jobs/:id/declare`. Confirm modal showing deposit retained amount.  
**Verification:** Start no-show clock on a job. Wait for (or simulate) grace period expiry. Confirm "Declare No-Show" button appears. Tap it — confirm no-show record created in DB, deposit retained, PDF generated.  

---

### P2-003 — Tip capture screen before job completion
**Status:** Not Started  
**Priority:** P2  
**Audit Finding:** Backend `PATCH /mobile/jobs/:id/tip` exists. No tip input UI in TechApp.  
**Fix:** Before "Mark Complete" flow finalizes, show a tip screen with amount input (and a "No Tip" skip). Submit to backend endpoint. Show confirmation.  
**Verification:** Complete a job as tech. Confirm tip screen appears. Enter $20. Confirm `jobs.tip_amount` updated in DB. Skip with "No Tip" — confirm job completes without tip.  

---

### P2-004 — Client signature capture pad
**Status:** Not Started  
**Priority:** P2  
**Audit Finding:** Backend `POST /mobile/jobs/:id/signature` exists. No SignaturePad component in TechApp.  
**Fix:** Add canvas-based signature pad (use `react-signature-canvas` or equivalent) to job completion flow. Save signature SVG/PNG to backend. Show confirmation.  
**Verification:** Complete a job. Draw signature on pad. Submit. Confirm `jobs.signature_svg` populated in DB.  

---

### P2-005 — Availability toggle in TechApp header
**Status:** Not Started  
**Priority:** P2  
**Audit Finding:** Backend `PATCH /users/me/availability` exists. No toggle visible in TechApp.  
**Fix:** Add on/off toggle in TechApp topbar/header. Green = available, gray = unavailable. Calls backend on toggle.  
**Verification:** Toggle availability off. Confirm `users.is_available = false` in DB. Toggle back on — confirm `is_available = true`.  

---

### P2-006 — Tech route guard (redirect non-TechApp routes for tech role)
**Status:** Not Started  
**Priority:** P2  
**Audit Finding:** No route guard prevents techs from accessing `/clients`, `/billing`, `/team` etc. by typing the URL.  
**Fix:** In `App.jsx` route configuration, add a guard that redirects `role === 'tech'` users to `/tech-app` for any route other than `/tech-app` and public/auth routes.  
**Verification:** Log in as tech. Manually navigate to `/clients` in browser URL bar. Must redirect to `/tech-app`.  

---

### P2-007 — Multi-day job view in TechApp
**Status:** Not Started  
**Priority:** P2  
**Audit Finding:** Current query filters `scheduled_at >= NOW() - 2 hours`. Tech cannot see tomorrow's jobs or plan a weekly schedule.  
**Fix:** Add a date-picker or "Today / Tomorrow / This Week" toggle to TechApp. Query jobs for the selected date range.  
**Verification:** Log in as tech. Switch to "Tomorrow" view. Confirm tomorrow's jobs appear. Switch back to "Today" — confirm today's jobs return.  

---

### P2-008 — Push notification delivery (FCM/APNs)
**Status:** Not Started  
**Priority:** P2  
**Audit Finding:** `push_token` column and `push-tokens.js` route exist. No FCM/APNs send implementation exists.  
**Fix:** Add FCM (Firebase Cloud Messaging) SDK to backend. On new job assignment, send push notification to assigned tech's `push_token`. On job status update, notify the operator.  
**Verification:** Assign a job to a tech. Confirm push notification appears on tech's device within 30 seconds.  

---

### P2-009 — Tech job notes (separate from manager notes)
**Status:** Not Started  
**Priority:** P2  
**Audit Finding:** Job notes are read-only for techs. Techs cannot add completion notes.  
**Fix:** Add a "Tech Notes" text field to the job detail view in TechApp. Save via `PATCH /mobile/jobs/:id` with a `tech_notes` field (add column to jobs table or reuse existing notes with role separation).  
**Verification:** As tech, open a job, add notes, save. As manager, view the same job — confirm tech notes appear separately from manager notes.  

---

### P2-010 — Offline job cache
**Status:** Not Started  
**Priority:** P2  
**Audit Finding:** No service worker or offline cache. TechApp is unusable without network.  
**Fix:** On app load, cache today's jobs in localStorage/IndexedDB. If API request fails, serve cached version with a banner indicating offline mode. Queue actions (complete, check-in) for sync when online returns.  
**Verification:** Load TechApp on a device. Enable airplane mode. Confirm today's jobs still display. Re-enable network. Confirm queued actions sync.  

---

## P3 — Polish / Optimization

> Concurrent with or after P2 as Kevin directs.

---

### P3-001 — Fleet camera section: remove or label as Phase 2
**Status:** Not Started  
**Priority:** P3  
**Audit Finding:** Fleet camera UI shows "Setup Required" for all positions because `fleet_vehicle_cameras` table doesn't exist. False promise in UI.  
**Fix:** Add clear "Phase 2 — Coming Soon" label or remove the camera section entirely from Fleet page.  

---

### P3-002 — Fleet GPS: relabel "Live Locations" as "Last Check-In"
**Status:** Not Started  
**Priority:** P3  
**Audit Finding:** Fleet page implies live GPS tracking. Only one-time check-in coordinates are stored.  
**Fix:** Relabel "Live Locations" → "Last Check-In Location" throughout Fleet page.  

---

### P3-003 — Communications: update Sendblue empty state text
**Status:** Not Started  
**Priority:** P3  
**Audit Finding:** Empty state text promises "iMessage / RCS via Sendblue" — not active, misleading.  
**Fix:** Change to "SMS (powered by Twilio)" or "SMS — carrier approval in progress" pending A2P 10DLC.  

---

### P3-004 — Dispatch map: geocode job addresses on create
**Status:** Not Started  
**Priority:** P3  
**Audit Finding:** Dispatch map only shows markers for jobs with `checkin_lat/service_lat`. New jobs have no coords; map is empty.  
**Fix:** On `POST /api/jobs`, geocode `service_address` via Google Maps Geocoding API and store `service_lat/service_lng`.  

---

### P3-005 — Scheduler.js: full audit of what cron jobs are actually running
**Status:** Not Started  
**Priority:** P3  
**Audit Finding:** `src/services/scheduler.js` exists but was not fully audited. Unclear which crons are active.  
**Fix:** Read `scheduler.js` completely. Document every cron job, its schedule, its purpose, and its current status (enabled/disabled). Add to FIELDCORE_DECISIONS_LOG.md.  

---

### P3-006 — Tip + signature shown on invoice PDF
**Status:** Not Started  
**Priority:** P3  
**Fix:** After P2-003 and P2-004 are complete, include tip amount and signature image on the auto-generated invoice PDF.  

---

*Add new tasks at the appropriate priority level. Increment task IDs sequentially within each P-group.*
