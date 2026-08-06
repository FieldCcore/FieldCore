# FIELDCORE DISPATCH — OPERATIONAL ARCHITECTURE
_Last updated: 2026-08-06_

## Overview

The FieldCore Dispatch module is a real-time operations console for field service businesses. It provides map-based visibility into technician locations, job states, and assignment workflows. This document describes what is actually implemented and operational.

---

## Data Model

### Technician Assignment (Phase A — current)
- `jobs.tech_id` — legacy single-tech reference; kept in sync with the primary assignment
- `job_assignments` — many-to-many table; soft-deleted via `removed_at`
  - `is_primary` — exactly one primary per active job assignment
  - `assignment_role` — lead_technician, technician, helper, apprentice, etc.
- Revenue attribution is via primary assignments only — never multiplied by team size

### Phase roadmap
- **Phase A (active):** Write to `job_assignments` + keep `jobs.tech_id` in sync
- **Phase B (future):** All reads switch to `job_assignments`; `jobs.tech_id` becomes derived
- **Phase C (future):** Drop `jobs.tech_id`

---

## Backend Services

| Service | File | Purpose |
|---|---|---|
| Workload balancing | `src/services/workloadService.js` | Computes per-tech capacity % and state |
| Route sequencing | `src/services/routeSequencingService.js` | Straight-line distance ordering |
| Assignment validation | `src/services/assignmentValidationService.js` | Conflict + availability checks |
| Team assignment | `src/services/jobTeamAssignmentService.js` | Multi-member read/write, crew management |
| Communication | `src/services/dispatchCommunicationService.js` | Quick message send (SMS + in-app) |
| Delay prediction | `src/services/routeDelayService.js` | Baseline travel-time estimates |
| Predictive ops | `src/services/predictiveOpsReadinessService.js` | Readiness scoring |

### Communication service — lead tech resolution
`dispatchCommunicationService.js` resolves the lead technician for a job by joining `job_assignments` (primary, not removed) first, falling back to `jobs.tech_id`. This is Phase-A-aware and will remain correct through Phase B.

---

## API Routes

All routes are under `/api/dispatch` and require `requireAuth`. Write operations require `requireRole('owner', 'manager')`.

| Method | Path | Description |
|---|---|---|
| GET | `/dispatch/feature-flags` | Merged flag state + `smsProviderConfigured` |
| GET | `/dispatch/jobs` | Jobs for the dispatch date window |
| GET | `/dispatch/technicians` | All field-eligible technicians |
| GET | `/dispatch/technicians/:id/route` | Technician's ordered route |
| PUT | `/dispatch/technicians/:id/route` | Save reordered route |
| POST | `/dispatch/assignments/validate` | Validate proposed assignment (no mutation) |
| POST | `/dispatch/assignments` | Confirm assignment |
| GET | `/dispatch/crews` | Saved crew definitions |
| POST | `/dispatch/crews` | Create saved crew |
| GET | `/dispatch/jobs/:id/assignments` | Active team members for a job |
| PUT | `/dispatch/jobs/:id/assignments` | Update team assignment |
| POST | `/dispatch/jobs/:jobId/communicate` | Send quick communication |
| GET | `/dispatch/activity/:type/:id` | Activity timeline events |
| GET | `/dispatch/workload` | Workload summary by tech |
| GET | `/dispatch/predictive-operations/readiness` | Predictive ops readiness score |

---

## Feature Flags

All flags are stored in `dispatch_settings.feature_flags` (JSONB) and merged with hardcoded defaults on every `/feature-flags` response.

The endpoint also returns `smsProviderConfigured: boolean` — computed at request time from env vars (not stored in DB).

| Flag | Default | Description |
|---|---|---|
| `dispatch_drag_assignment` | true | Drag-and-drop single-tech assignment |
| `dispatch_conflict_engine` | true | Availability conflict validation |
| `dispatch_workload_balancing` | true | Per-tech capacity badges and filters |
| `dispatch_route_sequencing` | true | Ordered route panel with resequencing |
| `dispatch_service_areas` | false | Polygon service area overlays |
| `dispatch_emergency_mode` | true | Emergency job flagging and escalation |
| `dispatch_delay_prediction` | true | Baseline delay estimates |
| `dispatch_quick_communications` | true | Quick message panel (SMS + in-app) |
| `dispatch_activity_timeline` | true | Per-job/tech activity log |
| `dispatch_predictive_operations_foundation` | true | Data collection for ML readiness |

---

## Capacity / Workload Labels

| State key | UI label | Threshold |
|---|---|---|
| `open` | Available Load | < 60% |
| `balanced` | Available Load | 60%–84% |
| `near_capacity` | Nearly Full | 85%–99% |
| `over_capacity` | Overloaded | ≥ 100% |

---

## Distance and Routing

The Route Sequencing panel shows distances between stops. **All distances are straight-line (Haversine)** — no road-routing provider is currently connected. The UI labels these as "approx." to avoid implying drive-time accuracy.

No Google Maps Directions API or equivalent is called for dispatch routing. The `GOOGLE_MAPS_SERVER_KEY` is used exclusively for geocoding (server-side) and must never be exposed to the browser.

---

## SMS / Communications Provider State

The quick communications panel sends:
- **Client messages** via Twilio SMS (if `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` are set)
- **Tech notifications** via in-app push (always available regardless of Twilio config)

When Twilio is not configured, the UI shows: _"SMS provider not configured — external delivery unavailable"_ and the sent confirmation indicates "Notification queued. SMS delivery unavailable — provider not configured."

---

## Frontend Components

| Component | File | Purpose |
|---|---|---|
| DispatchSidebar | `client/src/maps/DispatchSidebar.jsx` | Shell, view router, all panel mounting |
| DispatchTeamPanel | `client/src/maps/DispatchTeamPanel.jsx` | Tech list, job list, workload badges, filters |
| DispatchDrawer | `client/src/maps/DispatchDrawer.jsx` | Job detail drawer |
| DispatchAssignTeamPanel | `client/src/maps/DispatchAssignTeamPanel.jsx` | Multi-member team assignment UI |
| DispatchRoutePanel | `client/src/maps/DispatchRoutePanel.jsx` | Drag-to-reorder route panel |
| DispatchQuickCommsPanel | `client/src/maps/DispatchQuickCommsPanel.jsx` | Quick message panel |
| DispatchMapControls | `client/src/maps/DispatchMapControls.jsx` | Map overlay controls + Feature Status panel |
| DispatchActivityTimeline | `client/src/maps/DispatchActivityTimeline.jsx` | Activity event list |
| EmergencyDispatchModal | `client/src/maps/EmergencyDispatchModal.jsx` | Emergency declaration form |
| JobTeamSelector | `client/src/components/JobTeamSelector.jsx` | Shared multi-tech selector (used in Dispatch + JobForm) |

---

## Security

- All Dispatch API endpoints require `requireAuth`
- Tenant isolation: every query filters by `req.accountId`
- `GOOGLE_MAPS_SERVER_KEY` is never sent to the browser — used only in `src/services/geocode.js`
- `GOOGLE_MAPS_API_KEY` (browser key) is HTTP-referrer restricted
- No AI-generated technician recommendations, rankings, or "best tech" features
- No live GPS simulation — location data comes from real device pings only
