# FieldCore — Canonical Job Information Implementation Report

**Date:** 2026-07-29
**Scope:** Calendar drawer, CalEventCard, URL shareability, shared job normalizer

---

## What Was Built

### 1. `client/src/utils/normalizeJob.js`
Shared utility that maps any raw job API response to a canonical shape. All surfaces (Calendar, Dispatch, TechApp) can run jobs through `normalizeJob()` to get consistent field presence and types — no more scattered `|| ''` guards per component.

Key exports:
- `normalizeJob(rawJob)` — canonical mapper, spreads raw then normalizes
- `formatDuration(minutes)` — human-readable duration ("1h 30m", "45m", "2h")

### 2. JobDetail.jsx — Start / End / Duration (replaces "Scheduled")
Single-day jobs now show three rows:
- **Start** — `MMM d, yyyy h:mm a` (e.g. Jul 29, 2026 9:00 AM)
- **End** — computed from `scheduled_at + duration_minutes`, shows time only
- **Duration** — formatted via `formatDuration()` (e.g. "1h 30m")

Multi-day jobs continue to show Date Range / Next Session / Sessions count — unchanged.

### 3. JobDetail.jsx — Assigned Team (replaces "Tech" / "Job Manager")
Unified label: **Assigned Team** for both single-day (tech_name) and multi-day (job_manager_name). Fallback to "Unassigned" when no assignment exists.

### 4. JobDetail.jsx — "Open Job" button
Footer now has two buttons: **Edit Job** + **Open Job ↗**. Open Job calls `window.open('/jobs?job={id}', '_blank', 'noopener')` to produce a shareable URL that auto-opens the drawer in a new tab.

### 5. Jobs.jsx — URL sync (?job=id)
- **Opening drawer** sets `?job=<id>` in search params (preserves view + filter params)
- **Closing drawer** (×, Escape, overlay click) removes `?job` param
- **On mount** — after initial data load, if `?job=<id>` is in the URL, the drawer auto-opens to that job
- The persist-to-URL effect was updated to use `URLSearchParams` merge instead of object-replace, preventing the job param from being cleared when view/filter changes

### 6. Jobs.jsx — CalEventCard
No longer parses the title string. Reads directly from `event.resource`:
- `resource.client_name` — shown first (bold, larger)
- `resource.service_type` — shown second
- Session day label: computed from `resource.day_number` / `resource.total_sessions`

Same update applied to `FieldCoreAgendaView`.

### 7. `src/tests/canonical.test.js`
10 tests verifying the `/api/jobs` and `/api/jobs/:id` endpoints return canonical fields:
- Identity (id, service_type, status, is_multi_day)
- Client JOIN (client_name, client_id)
- Assignment fields present (tech_name, job_manager_name)
- Scheduling (scheduled_at, duration_minutes)
- All four address fields (service_address, service_city, service_state, service_zip)
- Content fields (notes, scope_of_work, amount)
- Auth enforcement (401 without token)
- Tenant isolation (other account cannot see this account's jobs)

---

## Known Limitations (Backend Constraints)

These fields were requested in the spec but cannot be surfaced without DB migrations:

| Requested Field | Status | Reason |
|---|---|---|
| `job_instructions` | Not implemented | Column does not exist; only `notes` and `scope_of_work` |
| `dispatcher_notes` | Not implemented | Column does not exist |
| `technician_notes` | Not implemented | Column does not exist |
| `service_address_2` | Not implemented | Column does not exist |
| Line Items / Services | Not implemented | No `job_line_items` table; invoices use JSONB after completion only |
| Photo requirements/checklist | Not implemented | No checklist model in DB |

To add these fields, a future migration would need to:
1. `ALTER TABLE jobs ADD COLUMN job_instructions TEXT`
2. `ALTER TABLE jobs ADD COLUMN dispatcher_notes TEXT`
3. `ALTER TABLE jobs ADD COLUMN technician_notes TEXT`
4. Create `job_line_items` table (id, job_id, account_id, name, qty, unit_price, sort_order)

---

## Data Flow

```
API (Express)
  GET /api/jobs           → jobs array with client JOIN
  GET /api/jobs/:id       → single job + sessions + assets
  GET /api/jobs/sessions  → all sessions (calendar)

Frontend (React)
  Jobs.jsx loadJobs()
    → raw jobs array
    → allEvents (mapped to RBC event format)
    → CalEventCard reads event.resource directly

  handleSelectEvent(event)
    → setDrawerJob(job)
    → setSearchParams adds ?job=id

  JobDetail.jsx
    → normalizeJob() — not called yet (direct prop pass), ready for adoption
    → Start/End/Duration rows
    → Assigned Team row
    → Open Job → /jobs?job=id in new tab
```
