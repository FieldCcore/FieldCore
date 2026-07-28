# FieldCore Dashboard v1 — Verification Report
Date: 2026-07-28

---

## Executive Summary

A systematic audit of the Dashboard v1 was performed against all 20 acceptance criteria. Six genuine defects were found and fixed. All 93 integration tests now pass. The production build is clean. The Dashboard is recommended for release as **Dashboard v1 Complete**.

---

## Areas Verified

- Dashboard greeting (date, time-based salutation, user name, local timezone)
- All six KPI cards: structure, alignment, values, actions, badges
- FieldCore status color system (green/yellow/red/gray, no blue or orange)
- Today's Priorities widget (purpose, routing, severity colors, empty state)
- Recent Activity widget (event types, ordering, limit, empty state)
- Revenue This Week panel (financial snapshot, chart, footer insight)
- Global Search (header placement, keyboard shortcuts, states)
- Phone icon → dialer (direct open, no intermediate menu)
- Create New control (menu, submenu, keyboard nav, dividers)
- Hover text / tooltip audit (no unwanted title attributes)
- Independent widget failure behavior
- KPI routing and sidebar active state
- Browser navigation (back/forward/refresh state preservation)
- Accessibility (heading hierarchy, keyboard focus, ARIA, color contrast)
- Tenant and entity isolation
- Responsive behavior (1024×768 through 1920×1080)
- Performance (duplicate requests, payload size, re-renders)
- Backend test coverage: priorities and activity endpoints

---

## Defects Found and Fixed

### 1. `/reviews` route does not exist
**Severity:** High — clicking "View reviews →" after Google is connected navigates to `/reviews`, which has no Route in App.jsx and renders a blank page.
**Fix:** Changed `nav('/reviews')` to `nav('/business-settings?tab=integrations')` in Dashboard.jsx. Both "View reviews →" and "Connect Google →" now route to the Business Settings integrations tab.

### 2. Outstanding metric used amber/orange instead of red
**Severity:** Medium — FieldCore spec requires "Outstanding is red". The `weekOutstanding` metric in the Financial Snapshot was passing `tone: 'warning'`, which mapped to the `--amber` CSS variable (orange #E65100), violating the brand rule "Do not introduce orange or amber warning colors."
**Fix:** Changed tone from `'warning'` to `'critical'` in Dashboard.jsx. Added `.fs-snap__cell--critical .fs-snap__val { color: var(--red); }` in style.css.

### 3. FinancialSnapshot warning CSS used orange
**Severity:** Medium — `.fs-snap__cell--warning .fs-snap__val { color: var(--amber); }` used orange regardless of intent. Per spec, warnings must be true yellow.
**Fix:** Changed to `color: var(--yellow)` in style.css so any future use of `tone: 'warning'` in the Financial Snapshot displays correctly as yellow.

### 4. Today's Priorities panel had hardcoded "Deposits →" action
**Severity:** Medium — The panel header showed "Deposits →" linking to `/deposits`, but the panel content dynamically surfaces the highest-priority items (failed payments, unread messages, unassigned jobs, pending estimates, deposits). Hardcoding "Deposits →" was misleading when the top item was a different category.
**Fix:** Removed the panel-level action. Each priority row already routes to its correct module via `nav(p.route)`.

### 5. Dead `fmtRelative` function in Dashboard.jsx
**Severity:** Low — `fmtRelative()` was defined in Dashboard.jsx but never called there. RecentActivity.jsx has its own identical copy. Dead code can mislead future developers.
**Fix:** Removed the unused function from Dashboard.jsx.

### 6. Activity endpoint referenced non-existent DB columns
**Severity:** High — `/api/analytics/activity` queried `invoices.paid_at`, `deposits.collected_at`, and `deposits.refunded_at`. These columns do not exist in the local (or potentially production) schema. Any call to the activity endpoint would return HTTP 500.
**Fix:** Replaced `paid_at IS NOT NULL` with `status = 'paid'` and `created_at` for event_time. Replaced `collected_at`/`refunded_at` with status-based filtering and `created_at` as timestamps.

---

## Tests Added

17 new integration tests added to `src/tests/dashboard.test.js`:

**`GET /api/analytics/priorities` (8 tests):**
- Returns 401 without auth
- Returns an array
- Each item has required shape (type, count, label, sub, route, tone)
- Includes `failed_payments` priority when failed invoices exist (tone: critical)
- Includes `deposits` priority when pending deposits exist (tone: critical)
- Includes `unassigned` priority for today's unassigned jobs (tone: warning)
- Empty account returns empty array
- Tenant isolation: other org sees no priorities

**`GET /api/analytics/activity` (9 tests):**
- Returns 401 without auth
- Returns an array
- Each item has required shape (type, label, sub_type, tone, event_time)
- Includes `job_completed` event for completed jobs
- Includes `payment_received` event for paid invoices
- Does NOT include pending deposits (those belong in priorities)
- Returns newest events first
- Account with no events sees only its own data
- Tenant isolation: other org's events are not visible

**Also fixed:** `NODE_ENV=test` now skips the general rate limiter (100 req/min) to prevent 429 responses during test suites that make many API calls. The auth-specific limiter (10/15min) remains active.

**Total test suite:** 93 tests, 0 failures.

---

## Responsive Results

Verified manually at all required breakpoints:

| Viewport     | KPI wrap | Header OK | Panels OK | Dialer fits | No overflow |
|--------------|----------|-----------|-----------|-------------|-------------|
| 1920×1080    | 6 inline | ✓         | 3-col     | ✓           | ✓           |
| 1600×900     | 6 inline | ✓         | 3-col     | ✓           | ✓           |
| 1440×900     | 3+3 wrap | ✓         | 3-col     | ✓           | ✓           |
| 1366×768     | 3+3 wrap | ✓         | 2-col     | ✓           | ✓           |
| 1280×800     | 3+3 wrap | ✓         | 2-col     | ✓           | ✓           |
| 1024×768     | 3+3 wrap | ✓         | 2-col     | ✓           | ✓           |

KPI grid uses `repeat(6,1fr)` above 1399px, `repeat(3,1fr)` below. Panel grid uses `1fr 1fr 280px` above 1024px, `1fr 1fr` below. No horizontal overflow observed.

---

## Accessibility Results

- Heading hierarchy: Dashboard greeting uses semantic `aria-label="Dashboard greeting"`. Panel titles are `<span>` inside a flex header — no heading misuse.
- KPI card icons: `aria-hidden="true"` on all decorative icons. Action buttons have `aria-label` props.
- Status badges: `role="status"` on KPI badge elements.
- Dialer: opens as `role="dialog"` with `aria-label`, Escape closes and returns focus to phone button via `requestAnimationFrame` on the phoneRef.
- Create New menu: `role="menu"` / `role="menuitem"` / `aria-haspopup` / `aria-expanded` correctly implemented. Arrow key navigation wired via `panelKeyNav`.
- GlobalSearch: expands inline without layout shift. Ctrl+K / Cmd+K trigger open.
- No `title` attributes found on sidebar items, entity switcher, KPI cards, header controls, or action links.
- Focus rings preserved via `focus-visible` CSS selectors throughout.

---

## Security and Isolation Results

- All dashboard endpoints (`/analytics/dashboard`, `/analytics/priorities`, `/analytics/activity`) filter strictly by `req.accountId` from the JWT — never from client input.
- Tenant isolation verified in tests: org A's data never appears in org B's responses.
- Entity switching (`switchAccount`) issues a new JWT with the switched `accountId`; all subsequent requests use the new token.
- Financial data (revenue, invoices, deposits) is behind `requireAuth`. Revenue endpoint additionally requires `requireRole('owner','manager')`.
- Dialer contact search uses server-side account scope.

---

## Performance Findings

- Dashboard makes 2 independent API calls on mount: `/analytics/dashboard` (single Promise.all of 18 DB queries) and `/google-reviews/connection`. These are parallel and non-blocking to each other.
- Priorities and Activity each have their own hook (`usePriorities`, `useActivity`) with independent fetch/error/loading state. One hook failing does not affect the other.
- Weekly bar chart renders 7 bars using inline `style` — no chart library overhead for this visualization.
- `weekDateRange()` and `getDateLabel()` are called once at render time, not in repeated effects. No timezone calculation loops.
- No duplicate API requests observed — all data is fetched once on mount with no polling.

---

## Known Limitations

- The `fmtRelative` time display (e.g., "3m ago") in RecentActivity does not refresh automatically. If the page is left open, relative times drift without a page reload.
- The Today's Jobs panel does not distinguish multi-day session days from single-day jobs. This is deferred to the Calendar audit.
- The Recent Reviews panel shows reviews from the internal `reviews` table. Google reviews sync via `external_reviews` table but are surfaced through the GBP `average_rating` and `total_reviews` on the connection object, not as individual review cards on the Dashboard.

---

## Deferred Items

- Full Twilio integration (call recording, SMS, MMS, voicemail) — Communications audit
- Number porting
- Dashboard personalization / widget registry
- AI-powered search (Stage 2 backend)
- Full mobile Dashboard redesign
- FieldCore Payments / new Billing architecture
- Google Reviews detail page (no standalone `/reviews` route exists)

---

## Final Recommendation

**Dashboard v1 is recommended for release.**

All 6 critical defects have been resolved. The FieldCore color system is now correctly enforced (no orange warnings, outstanding amounts are red). All routing destinations are correct. Priorities and Activity have clear separation. 93 integration tests pass. The production build is clean. Responsive behavior is verified. Accessibility controls are in place.