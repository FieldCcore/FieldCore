# FieldCore Dispatch — Production Engine Audit
**Date:** 2026-08-03  
**Scope:** Every visible Dispatch feature audited against: real data engine, real permissions, real state transitions, real persistence, real error handling.

---

## Feature Inventory

| Feature | Backend Route | Real Data? | Permissions? | Notes |
|---|---|---|---|---|
| KPI Strip — Live Techs | `GET /api/dispatch/summary` | ✅ | ✅ owner/manager/tech | SQL: tech_locations JOIN users, field_work_eligible + dispatch_visible filter |
| KPI Strip — Active Jobs | `GET /api/dispatch/summary` | ✅ | ✅ | SQL: jobs WHERE status=ANY(ACTIVE_STATUSES), date-scoped in tenant TZ |
| KPI Strip — Today's Jobs | `GET /api/dispatch/summary` | ✅ | ✅ | SQL: jobs WHERE date in tenant TZ |
| KPI Strip — Completed Today | `GET /api/dispatch/summary` | ✅ | ✅ | SQL: jobs WHERE status=complete AND completed_at date |
| KPI Strip — Avg Response | `GET /api/dispatch/summary` | ✅ | ✅ | Gated: kpi_response_tracking_enabled in dispatch_settings |
| KPI visibility toggles | `GET /api/dispatch/summary` | ✅ | ✅ | kpi_show_* columns from dispatch_settings; defaults true |
| Date selector | `GET /api/dispatch/schedule?date=` | ✅ | ✅ | Server validates YYYY-MM-DD; defaults to today in tenant TZ |
| Job list (schedule panel) | `GET /api/dispatch/schedule` | ✅ | ✅ | Joins clients + users; timezone-aware date filter |
| Multi-day session list | `GET /api/dispatch/schedule` | ✅ | ✅ | job_sessions JOIN jobs JOIN clients |
| Team panel — tech list | `GET /api/users` | ✅ | ✅ | field_work_eligible filter applied in Dispatch.jsx |
| Tech GPS locations | `GET /api/mobile/locations` | ✅ | ✅ | tech_locations table; polled every 15s |
| Tech GPS freshness | client-side `classifyTechGPS()` | ✅ | n/a | Thresholds: LIVE_MIN=5, STALE_MIN=30, synced with backend dispatch.js |
| Job markers on map | job.service_lat/service_lng | ✅ | ✅ | `isValidCoord()` gates marker creation; geocode_status tracked |
| Tech markers on map | tech_locations lat/lng | ✅ | ✅ | Stale ring rendered via `techMarkerSvg` for GPS-stale techs |
| Layer toggles (techs/jobs/traffic) | client-side only | ✅ | n/a | State persisted in React; no backend call needed |
| Traffic layer | Google Maps TrafficLayer API | ✅ | n/a | Toggled via layers.traffic state |
| Viewport persistence | localStorage `fc_dispatch_vp` | ✅ | n/a | 7-day TTL; saved on map idle event |
| Legend collapse | localStorage `fieldcore:dispatch:legend-collapsed` | ✅ | n/a | Restored on mount |
| Full Map mode | client-side sidebar mode | ✅ | n/a | Collapses legend on enter; restores on exit |
| Job Details panel | sidebar inline view | ✅ | ✅ | Data from jobs state (from /dispatch/schedule) |
| Tech Details panel | sidebar inline view | ✅ | ✅ | Data from users + techLocs state |
| Geocode retry button | `POST /api/jobs/:id/geocode` | ✅ | ✅ | owner/manager only; returns updated lat/lng; marker propagated via onJobGeocoded |
| Geocode status badge | `job.geocode_status` field | ✅ | ✅ | Values: not_attempted / resolved / failed |
| Center on job | `map.panTo(job.service_lat/lng)` | ✅ | n/a | Gated by `isValidCoord()` |
| Center on tech | `map.panTo(tech_loc.lat/lng)` | ✅ | n/a | From techLocsRef |
| Center on me | browser Geolocation API | ✅ | n/a | Permission state tracked; instructions modal on denied |
| Fit All / Recenter | `resolveDispatchViewport()` | ✅ | n/a | Priority: techs+jobs → jobs → techs → service area → persisted → fallback |
| Dispatch Settings | `GET /api/dispatch-settings` | ✅ | ✅ | Loads center point, KPI config |
| Location permission banner | browser Geolocation API | ✅ | n/a | Tracks: unsupported / insecure_context / prompt / granted / denied / unavailable |
| Data stale overlay | `isDataStale` state | ✅ | n/a | Set true on polling failure; cleared on next success |
| Data error overlay | `overlayError` state | ✅ | n/a | Set on initial load failure; shows Retry button |
| KPI card click → filter | client-side `panelFocus` | ✅ | n/a | Maps KPI key to tab + filter; expands sidebar if compact |

---

## Real Issues Found and Fixed

### 1. `stale={false}` hardcoded — FIXED
**File:** `client/src/pages/Dispatch.jsx`  
**Was:** `<DispatchOverlayStatus stale={false} .../>` — polling failures never surfaced to the user.  
**Fix:** Added `isDataStale` state. Location poll and schedule poll catch handlers both call `setIsDataStale(true)`. On next successful poll, `setIsDataStale(false)`. `DispatchOverlayStatus` now receives real stale state.

### 2. `resolveJobCoordinates` missing — FIXED
**File:** `client/src/maps/dispatchCoords.js`  
**Was:** No function to resolve best available coordinates for a job (service coords → client coords → null priority).  
**Fix:** Added `resolveJobCoordinates(job)` exported function with full priority chain and `isValidCoord` guarding.

### 3. Diagnostics object wrong name and shape — FIXED
**File:** `client/src/pages/Dispatch.jsx`  
**Was:** `window.__FIELDCORE_DISPATCH_DATA_DIAGNOSTICS__` — incomplete shape, wrong name.  
**Fix:** Renamed to `window.__FIELDCORE_DISPATCH_DIAGNOSTICS__` with full shape: `{ source, generatedAt, selectedDate, timezone, summary, markerCounts, layerState, stale, lastErrorCode }`.

### 4. Backend observability: unstructured error-only logs — FIXED
**File:** `src/routes/dispatch.js`  
**Was:** `console.error('[dispatch/summary]', err.message)` — no timing, no accountId, no structured format.  
**Fix:** Both `/summary` and `/schedule` now emit structured JSON logs on success and error: `{ event, accountId, durationMs, ... }`. Matches Railway log format used by the rest of the app.

---

## Dead Code

### `DispatchKPIStrip.jsx`
**File:** `client/src/maps/DispatchKPIStrip.jsx`  
**Status:** ORPHANED — not imported by any production component.  
**Evidence:** `DispatchSidebar.jsx` imports `useDispatchKpiMetrics` directly (line 2) and passes `metrics` as a prop to `DispatchCompactRail`. `DispatchKPIStrip` has its own independent polling hook and is not wired in anywhere.  
**Action:** Safe to delete in a future cleanup PR. Kept for now to avoid scope creep.

---

## No Changes Made To (by audit constraint)

- Sidebar modes (expanded / compact / full_map)
- Legend placement (DispatchMapLegend bottom-right overlay)
- Map control layout
- Job marker colors (`getJobMarkerColor`)
- Tech marker colors (`getTechStatus.markerColor`)
- Job Details or Tech Details view layout
- KPI card click → filter mapping
- Viewport resolution logic (`resolveDispatchViewport`)
