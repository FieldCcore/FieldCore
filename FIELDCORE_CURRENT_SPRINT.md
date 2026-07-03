# FIELDCORE — Current Sprint

**Sprint:** PR-001 — Critical Blockers Fix  
**Opened:** 2026-07-01  
**Status:** Not Started  
**Priority Level:** P0  
**Task Count:** 5  

> Update this file after every work session.  
> All 5 tasks must be Complete before PR-001 is closed.  
> After PR-001, open PR-002 for the next sprint from `FIELDCORE_TASK_QUEUE.md`.

---

## Sprint Goal

Fix the 5 critical broken-state issues that block basic operator functionality. These are fast fixes (under 30 min each), and unblock all downstream P0 and P1 work.

---

## Sprint Tasks

### TASK 1 — P0-001: Fix "Book New Job" dead button
**Status:** Complete  
**File:** `client/src/pages/Dashboard.jsx:241`  
**Change:** Added `onClick={() => nav('/jobs?new=1')}`. Jobs.jsx:167-172 watches for `?new=1` via `useSearchParams` and opens the New Job modal automatically. No duplicate logic created.  
**Deployed:** 2026-07-01 → Vercel

**Sub-tasks:**
- [x] Open `Dashboard.jsx`
- [x] Locate "+ Book New Job" button at line 241
- [x] Add `onClick` handler (`nav('/jobs?new=1')`)
- [x] Deploy to Vercel
- [x] Verify: click button on production → navigates to `/jobs` and opens New Job modal
- [x] Mark P0-001 Complete in `FIELDCORE_TASK_QUEUE.md`

**Verification:**
```
PASS — nav('/jobs?new=1') triggers existing useSearchParams handler in Jobs.jsx:167-172.
New Job modal opens automatically. No duplicate modal logic introduced.
```

---

### TASK 2 — P0-002: Fix plan name mismatch
**Status:** Complete  
**File:** `src/middleware/planLimits.js`  
**Change:** Replaced `growth` with `pro`; added `solo`. All paid plans get unlimited users/jobs. SMS gated to pro+. Updated SMS error message. Zero remaining `growth` refs in backend.  
**Deployed:** 2026-07-01 → Railway (commit bb16fa4)

**Sub-tasks:**
- [x] Read `src/middleware/planLimits.js` in full
- [x] Read `src/routes/billing.js` and `chat.js` to confirm plan features and canonical names
- [x] Determine correct limits (solo: no SMS; pro/scale: SMS enabled; all paid: unlimited users/jobs)
- [x] Rename `growth` → `pro` in LIMITS object
- [x] Add `solo` entry with correct limits
- [x] Update `checkSmsAccess` error message from "Growth or Scale" → "Pro or Scale"
- [x] Grep confirmed zero remaining `growth` references in `src/`
- [x] Deploy to Railway
- [x] Mark P0-002 Complete in `FIELDCORE_TASK_QUEUE.md`

**Verification:**
```
PASS — solo and pro plans now resolve to their own LIMITS entries (users: null, jobsPerMonth: null).
       No plan falls through to starter limits.
       SMS correctly denied for solo (no business phone), allowed for pro/scale.
       grep for 'growth' in src/ returns 0 matches.
```

---

### TASK 3 — P0-003: Fix Stripe price env var mismatch
**Status:** Complete  
**Files Modified:** `.env.example` + 6 documentation files  
**Change:** Code was already correct. `.env.example` had `STRIPE_PRICE_GROWTH` (not used by code); replaced with `STRIPE_PRICE_SOLO`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_SCALE`. Updated 6 doc files that referenced the old name in setup instructions.  
**Deployed:** 2026-07-01 → Railway (commit 193cb12)

**Sub-tasks:**
- [x] Read `billing.js:1-30` — confirmed correct names already in use
- [x] Read `webhooks.js` — confirmed correct names already in use
- [x] Read `.env.example` — identified `STRIPE_PRICE_GROWTH` mismatch
- [x] Grep project for all `STRIPE_PRICE_GROWTH` references (found 8 locations, all docs/config)
- [x] Updated `.env.example` with `STRIPE_PRICE_SOLO`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_SCALE`
- [x] Updated 6 documentation files
- [x] Final grep confirms zero `STRIPE_PRICE_GROWTH` refs outside task-queue historical text
- [x] Deployed to Railway
- [x] Mark P0-003 Complete in `FIELDCORE_TASK_QUEUE.md`

**Verification:**
```
PASS — All STRIPE_PRICE_GROWTH references eliminated from .env.example and docs.
       billing.js:9-11 and webhooks.js:136-138 already read STRIPE_PRICE_SOLO/PRO/SCALE.
       When Railway env vars are populated with real Stripe price IDs using the correct
       names, checkout will resolve without undefined price ID errors.
```

---

### TASK 4 — P0-004: Fix no-show status (cancelled → no_show)
**Status:** Complete  
**Files:** `src/routes/jobs.js:191`, `client/src/components/StatusBadge.jsx`  
**Change:** `status = 'cancelled'` → `status = 'no_show'` in the `/:id/noshow` PATCH handler. Added `no_show: 'red'` to StatusBadge (had `'no-show'` and `noshow` but not underscore form).  
**Deployed:** 2026-07-01 → Railway + Vercel (commit 799756e)

**Sub-tasks:**
- [x] Read `jobs.js` around line 190 — confirmed bug at line 191
- [x] Grep all no_show/noshow refs in src/ — all other paths already use `no_show` correctly
- [x] Changed `status = 'cancelled'` → `status = 'no_show'` at `jobs.js:191`
- [x] Confirmed DB CHECK constraint includes `no_show` (migrate.js:11)
- [x] Confirmed cancel flow at `jobs.js:146` is untouched
- [x] Added `no_show: 'red'` to StatusBadge
- [x] Deployed to Railway + Vercel
- [x] Mark P0-004 Complete in `FIELDCORE_TASK_QUEUE.md`

**Verification:**
```
PASS — status = 'no_show' consistent with noshow.js:111, scheduler.js:259, and DB CHECK.
       Cancel flow (jobs.js:146) still uses 'cancelled' — separate and untouched.
       StatusBadge renders no_show as red.
       Analytics excludes no_show from revenue (only counts 'complete').
```

---

### TASK 5 — P0-005: Add SMS opt-out (STOP) handler + sms_opt_outs table
**Status:** Complete  
**Files:** `src/db/migrate.js`, `src/routes/webhooks.js`, `src/services/sms.js`  
**Change:** Added `sms_opt_outs` table with UNIQUE(normalized_phone). CTIA STOP/START handling in Twilio inbound webhook with TwiML confirmation replies. Opt-out guard at top of sms.send() — normalizes phone, checks table, returns `{ blocked: true }` before any send path (Sendblue or Twilio).  
**Deployed:** 2026-07-01 → Railway (commit 4953084)

**Sub-tasks:**
- [x] Read `src/db/migrate.js` to find correct insertion point for new table
- [x] Add `sms_opt_outs` table migration: id UUID PK, account_id (nullable FK), phone_number, normalized_phone UNIQUE, opt_out_keyword, source, opted_out_at, created_at, updated_at
- [x] Read `src/routes/webhooks.js` to find correct inbound SMS handler location
- [x] Add handler: STOP/STOPALL/UNSUBSCRIBE/CANCEL/END/QUIT → INSERT/UPDATE sms_opt_outs; reply TwiML confirmation
- [x] Add handler: START/UNSTOP → DELETE from sms_opt_outs for that number; reply TwiML confirmation
- [x] Add guard in `src/services/sms.js` send(): normalize phone, query sms_opt_outs, return { blocked: true } + log if opted out
- [x] Deploy to Railway
- [x] Mark P0-005 Complete in `FIELDCORE_TASK_QUEUE.md`

**Verification:**
```
PASS — sms_opt_outs table added to migrate.js with UNIQUE(normalized_phone).
       Inbound STOP upserts record; inbound START deletes it.
       sms.send() guard runs before sendblue and twilio paths.
       Opted-out numbers log "[SMS blocked — opt-out]" and return { blocked: true }.
       TwiML confirmation messages returned for STOP and START.
```

---

## Sprint Completion Gate

All 5 tasks must show **Complete** before PR-001 is closed and P1 sprint begins.

| Task | ID | Status |
|---|---|---|
| Fix "+ Book New Job" dead button | P0-001 | Complete |
| Fix plan name mismatch | P0-002 | Complete |
| Fix Stripe price env var mismatch | P0-003 | Complete |
| Fix no-show status | P0-004 | Complete |
| Add SMS opt-out handler | P0-005 | Complete |

**All Complete?** YES — Sprint PR-001 is CLOSED. All 5 tasks complete. Open PR-002 from FIELDCORE_TASK_QUEUE.md.

---

## PR-002 — Active Sprint

**Opened:** 2026-07-02

| Task | ID | Status |
|---|---|---|
| Enable SMS (blocked — A2P pending) | P0-006 | Blocked |
| Migrate photo storage to S3/R2 | P0-007 | Complete |
| Replace TechApp CSS map with Leaflet | P0-008 | Complete |
| Auto-create deposit on manual job booking | P0-009 | Complete |
| Add backend plan gate for entities | P0-010 | Complete (pre-existing) |

**4/4 code tasks complete. P0-006 blocked on external Twilio A2P approval.**  
PR-002 is effectively complete — P0-006 unblocks when A2P is approved (no code change needed).

---

## PR-003A — Active Sprint

**Opened:** 2026-07-02  
**Status:** Complete  
**Commit:** 8b95f6d → Railway

| Task | ID | Status |
|---|---|---|
| Fix SMS blocked-response regression | P0-011 | Complete |

**Fix:** 11 `sms.send()` callers updated across 7 files. Pattern A callers return HTTP 409 on block. Pattern B callers skip DB audit writes when blocked.

---

## PR-003 — CLOSED

**Opened:** 2026-07-02  
**Closed:** 2026-07-02  
**Status:** Complete — 6/6 tasks

| Task | ID | Status |
|---|---|---|
| Technician Signature Pad UI | P2-004 | Complete |
| Tip Collection UI | P2-003 | Complete |
| No-Show Declare Button | P2-002 | Complete |
| Availability Toggle | P2-005 | Complete |
| Tech Route Guard | P2-006 | Complete |
| Multi-Day Job View | P2-007 | Complete |

**Sprint result:** TechApp is now a complete field tool. Full job completion flow (Signature → Tip → Complete), no-show declaration with live grace-period countdown, availability toggle, role-enforced routing, and multi-day scheduling view. Backend `GET /mobile/jobs` extended with `?view=today|tomorrow|week`.

---

## PR-004 — CLOSED

**Opened:** 2026-07-02  
**Closed:** 2026-07-03  
**Status:** Complete — 3/3 tasks  
**Commit:** e306066 → origin/main + Vercel

### Sprint Goal

Make the technician app reliable in poor network environments and ready for real fleet-scale usage.

| Task | ID | Status |
|---|---|---|
| Offline Job Cache | P2-008 | Complete |
| Mobile Job Pagination | P2-009 | Complete |
| ETA Validation + SMS Hardening | P2-010 | Complete |

**P2-008:** localStorage cache keyed by `fc_jobs_{view}_{userId}`. Amber offline banner with staleness label (formatDistanceToNow) and Retry button. Reads cache on network failure; updates cache on every successful fetch.

**P2-009:** Backend `GET /mobile/jobs` returns `{ jobs, has_more, limit, offset }` using N+1 fetch trick (no COUNT query). Frontend Load More button appends next page, updates cache, tracks offset. Job count chip shows `N+` when more pages exist.

**P2-010 backend:** `POST /jobs/:id/eta` now validates `minutes` as integer 1–240; returns 400 on bad input. Per-job 2-minute cooldown via `etaLastSent` Map; returns 429 with remaining seconds. Rate limit only stamps after successful SMS send.

**P2-010 frontend:** EtaScreen fixes silent-success-on-error bug (catch block no longer calls `setSent(true)`). Client-side int validation before any network call. Inline error display: 409 (opted out), 429 (rate limit text from backend), 5xx (generic retry). Input border turns red on error; clears on change.

---

## PR-005 — Active Sprint

**Opened:** 2026-07-03  
**Status:** Not Started  
**Priority Level:** P1  
**Task Count:** 5

> P0 code tasks are all complete. P0-006 (SMS) is externally blocked on Twilio A2P approval — no code change needed.

### Sprint Goal

Fix the five highest-impact P1 gaps: close the estimate→job dead-end, repair the Communications messages panel data source, resolve the misleading Notifications tab, and harden two config-driven admin concerns (alert email + CORS origins).

| Task | ID | Status |
|---|---|---|
| Wire estimate → job conversion | P1-001 | Not Started |
| Fix Communications messages panel | P1-002 | Not Started |
| Fix Account Notifications tab | P1-003 | Not Started |
| Admin alert email → env var | P1-010 | Not Started |
| CORS origins → env var | P1-011 | Not Started |

---

## Sprint History

| Sprint | Tasks | Opened | Closed | Score at Close |
|---|---|---|---|---|
| PR-001 | 5 | 2026-07-01 | 2026-07-01 | 5/5 Complete |
| PR-002 | 5 | 2026-07-02 | 2026-07-02 | 4/4 code tasks + 1 blocked |
| PR-003A | 1 | 2026-07-02 | 2026-07-02 | 1/1 Complete |
| PR-003 | 6 | 2026-07-02 | 2026-07-02 | 6/6 Complete |
| PR-004 | 3 | 2026-07-02 | 2026-07-03 | 3/3 Complete |
