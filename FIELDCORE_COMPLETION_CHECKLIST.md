# FIELDCORE — Completion Checklist

**Purpose:** Before any task is marked Complete in `FIELDCORE_TASK_QUEUE.md`, all applicable items in the Universal Gate (Section 1) and the task-specific checklist (Section 2) must be checked. A task with unchecked gate items cannot be marked Complete.

**Last Updated:** 2026-07-01

---

## Section 1 — Universal Completion Gate

These items apply to every task without exception.

### Code
- [ ] The fix directly addresses the specific audit finding (no scope creep)
- [ ] No new security vulnerabilities introduced (no SQL injection, no unvalidated input, no hardcoded secrets)
- [ ] No regression to adjacent features (manually verified in the app, not assumed)
- [ ] If new env vars added: documented in `.env.example` with description

### Verification
- [ ] The app was run (not just inspected or typechecked)
- [ ] The specific changed feature was exercised at the surface (UI click, API call, webhook trigger)
- [ ] A PASS or FAIL verdict was recorded with evidence (not "looks right")
- [ ] At least one edge case or failure mode was probed

### Deployment
- [ ] Backend changes deployed to Railway
- [ ] Frontend changes deployed to Vercel
- [ ] Deployment confirmed successful (no build error, no 500 on production)

### Documentation
- [ ] Status updated in `FIELDCORE_TASK_QUEUE.md` (task → Complete)
- [ ] Status updated in `FIELDCORE_CURRENT_SPRINT.md` (task → Complete, sprint table updated)
- [ ] If a non-trivial implementation decision was made: logged in `FIELDCORE_DECISIONS_LOG.md`

---

## Section 2 — Task-Specific Checklists

---

### P0-001 — Fix "Book New Job" dead button

- [ ] `Dashboard.jsx:241` — `onClick` handler added
- [ ] Handler navigates to `/jobs` or opens job creation modal (not a no-op)
- [ ] No console errors thrown on click
- [ ] Button still disabled when appropriate (e.g., if there's a loading state)
- [ ] Tested on mobile width (390px) — button still tappable and functional
- [ ] **VERIFICATION PASS:** Click button on production dashboard → navigates/opens correctly

---

### P0-002 — Fix plan name mismatch

- [ ] `middleware/planLimits.js` — `growth` key renamed to `pro`
- [ ] `solo` key added with appropriate limits (confirm solo plan limits are intentionally less than pro)
- [ ] `checkSmsAccess` updated to use correct plan names
- [ ] `checkJobLimit` tested with plan='solo' — returns solo limits, not starter
- [ ] `checkJobLimit` tested with plan='pro' — returns pro limits, not starter
- [ ] `checkJobLimit` tested with plan='scale' — returns scale limits (unchanged)
- [ ] No other files reference the old `growth` key in a breaking way (grep confirmed)
- [ ] **VERIFICATION PASS:** API returns correct plan limits for all three plan types

---

### P0-003 — Fix Stripe price env var mismatch

- [ ] `.env.example` updated to list `STRIPE_PRICE_SOLO`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_SCALE`
- [ ] Railway env vars confirmed to match these exact names
- [ ] Railway env vars confirmed to have actual Stripe price ID values (not empty)
- [ ] Test checkout for `solo` plan — returns valid Stripe session URL
- [ ] Test checkout for `pro` plan — returns valid Stripe session URL
- [ ] Test checkout for `scale` plan — returns valid Stripe session URL
- [ ] No Stripe error about undefined/null price ID in Railway logs
- [ ] **VERIFICATION PASS:** All three plan checkouts return valid Stripe session URLs

---

### P0-004 — Fix no-show status

- [ ] `routes/jobs.js` at the `/:id/noshow` PATCH handler — `status = 'no_show'` (not `cancelled`)
- [ ] `no_show` confirmed as a valid status in `StatusBadge.jsx` STATUS_TO_VARIANT map
- [ ] `no_show` confirmed as a valid status in DB (no CHECK constraint violation)
- [ ] After triggering: `SELECT status FROM jobs WHERE id = '<test_id>'` returns `no_show`
- [ ] No-show count on revenue or analytics pages increments correctly
- [ ] Jobs with `no_show` status do not appear in "active jobs" count
- [ ] **VERIFICATION PASS:** Job status in DB is `no_show` after no-show trigger

---

### P0-005 — Add SMS opt-out handler + sms_opt_outs table

- [ ] `sms_opt_outs` table created in `migrate.js` with: id (UUID PK), phone_number (TEXT NOT NULL), account_id (UUID), opted_out_at (TIMESTAMPTZ)
- [ ] Table confirmed to exist in Railway DB (`SELECT * FROM sms_opt_outs LIMIT 1` returns no error)
- [ ] Inbound webhook handler added for STOP keywords: STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT
- [ ] Inbound webhook handler added for START keywords: START, UNSTOP
- [ ] STOP → inserts record into sms_opt_outs
- [ ] START → deletes record from sms_opt_outs
- [ ] `sms.js` sendSms guard added — checks opt-out before calling Twilio
- [ ] Guard logs "blocked: opt-out" when number is on opt-out list
- [ ] Simulate STOP: POST to webhook endpoint with STOP body → record appears in sms_opt_outs
- [ ] Simulate SMS send to opted-out number → blocked, not sent to Twilio
- [ ] Simulate START: POST to webhook endpoint with START body → record removed from sms_opt_outs
- [ ] Simulate SMS send after START → allowed (if SMS_ENABLED were true)
- [ ] **VERIFICATION PASS:** STOP creates opt-out record; SMS send blocked; START clears opt-out

---

### P0-006 — Enable SMS (A2P 10DLC)

- [ ] Twilio A2P 10DLC registration completed and approved
- [ ] `SMS_ENABLED=true` set in Railway env vars
- [ ] Test job creation → SMS confirmation received on real device
- [ ] Test ETA send from TechApp → SMS received on real device
- [ ] Test no-show declare → SMS received by client AND tech on real devices
- [ ] Test STOP reply → no further SMS sent to that number
- [ ] **VERIFICATION PASS:** All SMS flows deliver on real devices

---

### P0-007 — Migrate photo storage to S3/R2

- [ ] SDK added (Cloudflare R2 `@aws-sdk/client-s3` or equivalent)
- [ ] Multer switched from `diskStorage` to `memoryStorage`
- [ ] Upload handler streams buffer to R2/S3 bucket
- [ ] DB record stores R2/S3 public URL, not local path
- [ ] `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL` in `.env.example`
- [ ] Railway env vars set
- [ ] Upload test: take photo via TechApp → photo URL stored in DB
- [ ] Redeploy Railway → photo URL still resolves (not 404)
- [ ] No-show PDF generation still works (uses photo URLs from R2)
- [ ] Old `uploads/` directory references removed or guarded
- [ ] **VERIFICATION PASS:** Photo URL accessible after Railway redeploy

---

### P0-008 — TechApp Leaflet map

- [ ] CSS grid placeholder removed from `TechApp.jsx:91-127`
- [ ] TODO comment removed
- [ ] Leaflet map renders using `service_lat`/`service_lng` from the active job
- [ ] Marker shows at correct coordinates for test job
- [ ] "Get Directions" link opens Google Maps with correct destination address
- [ ] Map renders correctly on 390px iPhone width
- [ ] Map does not break if job has no lat/lng (graceful fallback shown)
- [ ] Leaflet CSS conflicts with existing page styles verified (no z-index issues)
- [ ] **VERIFICATION PASS:** Map renders with job pin; "Get Directions" opens Google Maps correctly

---

### P0-009 — Auto-create deposit on manual job booking

- [ ] `POST /api/jobs` handler queries `booking_settings` for deposit config
- [ ] If deposit enabled and amount > 0: deposit record inserted into `deposits` table
- [ ] Deposit record has correct: job_id, client_id, account_id, amount, status='pending'
- [ ] Test: create job via dashboard → deposit record appears in Deposits page
- [ ] Test: create job with deposit disabled in settings → no deposit record created
- [ ] Booking widget flow still creates deposit correctly (not broken by this change)
- [ ] **VERIFICATION PASS:** Manual job create → deposit record in DB → visible in Deposits page

---

### P0-010 — Backend plan gate for entities

- [ ] `POST /api/entities` checks `account.plan === 'scale'` before proceeding
- [ ] Returns 403 with message `{ error: "Entity management requires Scale plan." }` for non-scale plans
- [ ] `GET /api/entities` still returns entity list for all roles (read is fine; write is gated)
- [ ] Test: POST /api/entities as solo plan owner → 403 response
- [ ] Test: POST /api/entities as pro plan owner → 403 response
- [ ] Test: POST /api/entities as scale plan owner → 201 success
- [ ] Frontend shows correct error message if 403 returned
- [ ] **VERIFICATION PASS:** solo and pro plan owners cannot create entities via API

---

### P1-001 — Estimate → job conversion

- [ ] `POST /api/estimates/:id/convert-to-job` endpoint exists
- [ ] Requires estimate to be in `signed` status (reject pending/void)
- [ ] Creates job with: client_id, service_type, amount, notes from estimate
- [ ] Updates estimate status to `converted`
- [ ] UI shows "Convert to Job" button on signed estimates
- [ ] Button triggers the endpoint and navigates to new job
- [ ] **VERIFICATION PASS:** Signed estimate → "Convert to Job" → new job appears in jobs list

---

### P1-002 — Fix Communications messages panel

- [ ] `api.get('/clients')` in MessagesPanel replaced with `api.get('/phone/conversations')`
- [ ] `/phone/conversations` endpoint exists and returns clients with message history
- [ ] Left panel only shows clients who have sent or received messages
- [ ] Empty state shown when no conversations exist (not a list of all clients)
- [ ] Selecting a conversation in the left panel loads the correct message thread
- [ ] **VERIFICATION PASS:** Messages panel shows only clients with message history

---

### P2-001 — TechApp Leaflet map (full)
*(See P0-008 checklist — this is the same fix, promoted from P0 to full tech experience)*

---

### P2-002 — No-show declare button

- [ ] After `handleNoshowClock` starts, grace period timer visible in TechApp
- [ ] After grace period expires (or at any point during), "Declare No-Show" button visible
- [ ] Button calls `POST /no-show/jobs/:id/declare`
- [ ] Confirmation modal shows deposit amount to be retained before final submit
- [ ] After declare: job status = `no_show`, deposit retained, no-show PDF generated
- [ ] SMS sent to client (once P0-006 is complete)
- [ ] **VERIFICATION PASS:** Full no-show flow completable from TechApp without desktop

---

### P2-003 — Tip capture screen

- [ ] Tip screen appears before "Mark Complete" confirmation
- [ ] "No Tip" option clearly available
- [ ] Amount input accepts only valid positive dollar amounts
- [ ] `PATCH /mobile/jobs/:id/tip` called with correct amount
- [ ] `jobs.tip_amount` updated in DB
- [ ] Tip amount shown on completed job summary
- [ ] **VERIFICATION PASS:** Tip entered → stored in DB; "No Tip" → job completes without tip field

---

### P2-004 — Client signature pad

- [ ] Canvas-based signature pad renders in TechApp job completion flow
- [ ] "Clear" button works correctly
- [ ] "Skip" option available for clients not present
- [ ] Signature data submitted to `POST /mobile/jobs/:id/signature`
- [ ] `jobs.signature_svg` populated in DB
- [ ] Signature appears on invoice PDF (after P3-006)
- [ ] **VERIFICATION PASS:** Signature drawn → stored in DB → visible on job record

---

### P2-005 — Availability toggle

- [ ] Toggle renders in TechApp header/topbar
- [ ] Green = available, gray = unavailable
- [ ] On toggle: `PATCH /users/me/availability` called
- [ ] `users.is_available` updated in DB
- [ ] Toggle state persists on page refresh
- [ ] **VERIFICATION PASS:** Toggle off → DB shows is_available=false; toggle on → is_available=true

---

### P2-006 — Tech route guard

- [ ] Route guard component added in App.jsx
- [ ] `role === 'tech'` users redirected to `/tech-app` from all non-public routes
- [ ] Techs can still access `/tech-app` and auth routes
- [ ] Test: log in as tech, type `/clients` in URL bar → redirects to `/tech-app`
- [ ] Test: log in as tech, type `/billing` in URL bar → redirects to `/tech-app`
- [ ] Test: log in as manager, type `/clients` → still works (guard doesn't affect other roles)
- [ ] **VERIFICATION PASS:** Tech role cannot access non-TechApp routes by URL

---

### P2-007 — Multi-day job view

- [ ] Date toggle or date picker added to TechApp
- [ ] "Today", "Tomorrow", and "This Week" views available
- [ ] Job query uses selected date range
- [ ] Default view is still "Today" on app load
- [ ] Empty state shown when no jobs on selected date
- [ ] **VERIFICATION PASS:** "Tomorrow" tab shows tomorrow's jobs; "Today" shows today's

---

### P2-008 — Push notifications

- [ ] FCM SDK added to backend
- [ ] New job assignment triggers push to tech's `push_token`
- [ ] Push notification contains job client name and service type
- [ ] Push arrives within 30 seconds of assignment on real device
- [ ] Invalid/expired push tokens handled gracefully (no crash)
- [ ] **VERIFICATION PASS:** Assign job → push notification received on tech's device

---

### P2-009 — Tech job notes

- [ ] Tech notes field added to TechApp job detail
- [ ] Notes saved to backend (separate from manager notes)
- [ ] Tech notes visible to manager on job detail page
- [ ] Manager notes visible to tech as read-only
- [ ] **VERIFICATION PASS:** Tech adds note → note visible on manager's job view

---

### P2-010 — Offline job cache

- [ ] Today's jobs cached to localStorage/IndexedDB on load
- [ ] App serves cached jobs when network unavailable (airplane mode test)
- [ ] Offline banner shown when operating from cache
- [ ] Actions queued while offline; auto-synced when network returns
- [ ] Cache cleared and refreshed on each successful online load
- [ ] **VERIFICATION PASS:** Enable airplane mode → today's jobs still visible in TechApp

---

*Add new task checklists as tasks are added to FIELDCORE_TASK_QUEUE.md*
