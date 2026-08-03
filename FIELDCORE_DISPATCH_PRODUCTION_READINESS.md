# FieldCore Dispatch — Production Readiness
**Date:** 2026-08-03

---

## Status: PRODUCTION-READY (all features backed by real data)

---

## Data Engines

| Source | What it powers | Poll interval | Error behavior |
|---|---|---|---|
| `GET /api/dispatch/schedule` | Job list, session list, job markers | 30s (paused when tab hidden) | Sets `isDataStale=true`; shows "Showing last known data" overlay |
| `GET /api/users` | Tech list, tech detail panel | Initial load only | Caught by `overlayError`; shows Retry |
| `GET /api/mobile/locations` | Tech GPS markers, tech freshness ring | 15s | Sets `isDataStale=true` |
| `GET /api/dispatch/summary` | KPI strip (all 5 metrics) | 30s (via `useDispatchKpiMetrics`) | On error: metrics marked 'stale'; FALLBACK_METRICS shown if no prior data |
| `GET /api/dispatch-settings` | Viewport center, service area radius | Initial load only | Caught by `.catch(() => null)`; Dispatch still renders |
| `POST /api/jobs/:id/geocode` | Geocode retry button result | On demand | Shows user-friendly error message from geocode_provider_status |

---

## Permission Enforcement

All Dispatch API routes require `requireAuth` middleware (JWT validation, accountId injection). No Dispatch data can be fetched without a valid token. Tenant isolation is enforced at the SQL layer: every query filters by `account_id = $1` from `req.accountId` (set by middleware, never from client payload).

Geocode retry endpoint (`POST /api/jobs/:id/geocode`) is additionally gated by `requireRole('owner', 'manager')`.

---

## State Transition Coverage

| User action | State change | Persistence |
|---|---|---|
| Polling success | `isDataStale = false` | In-memory |
| Polling failure | `isDataStale = true` | In-memory |
| Initial load failure | `overlayError = true` | In-memory |
| Retry button click | Triggers `retryKey` increment → re-runs initial load effect | In-memory |
| Map pan/zoom | Saved to `localStorage` on idle (600ms debounce, 7-day TTL) | localStorage |
| Legend collapse toggle | Saved to `localStorage` immediately | localStorage |
| Geocode retry success | `onJobGeocoded` merges updated coords into `jobs` state | In-memory; reflected on next schedule poll |
| Job/tech selection | `selectedItem` state; drives sidebar view | In-memory |
| Date change | `dispatchDate` state → new schedule fetch | In-memory |

---

## Error Handling

| Scenario | What the user sees |
|---|---|
| Initial load failure | Red error overlay: "Dispatch data temporarily unavailable" + Retry button |
| Poll failure (schedule or locations) | Amber stale overlay: "Showing last known data" — clears on next successful poll |
| Geocode retry failure | Inline error message in Job Details card; geocode_provider_status mapped to human text |
| Location permission denied | LocationPermissionBanner with instructions modal |
| Map API unavailable | DispatchBaseMap handles via MapProvider error boundary |

---

## Observability

**Backend (Railway logs):**
- `dispatch.summary` — `{ event, accountId, durationMs, dateParam, metricCount }` on every successful response
- `dispatch.summary.error` — `{ event, accountId, durationMs, errorCode, error }` on failure
- `dispatch.schedule` — `{ event, accountId, durationMs, dateLocal, jobCount, sessionCount }` on success
- `dispatch.schedule.error` — structured error on failure

**Frontend (dev only):**
- `window.__FIELDCORE_DISPATCH_DIAGNOSTICS__` — shape: `{ source, generatedAt, selectedDate, timezone, summary, markerCounts, layerState, stale, lastErrorCode }`
- Updated on every successful initial load

---

## Test Coverage

| Test file | Count | What it covers |
|---|---|---|
| `src/tests/dispatch.test.js` | 15 backend tests | Auth enforcement, metric shape, valid status enum, legacy fields, date param validation, tenant isolation |
| `client/src/maps/__tests__/dispatchCoords.test.js` | 41 tests (incl. 8 new) | `resolveJobCoordinates` priority chain, null/undefined/invalid coord handling |

---

## Known Limitations (not fixed — out of audit scope)

1. **`DispatchKPIStrip.jsx` is orphaned** — safe to delete but kept to avoid scope creep.
2. **Geocode retry persists across redeploy** — job coordinates are in the DB; no data loss on Railway redeploy.
3. **File uploads on local disk** — not a Dispatch concern; tracked separately.
4. **Average Response KPI requires dispatch_settings row** — defaults safely to `disabled` status when row absent.
