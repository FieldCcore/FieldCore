# FieldCore Time & Region Architecture

## Overview

FieldCore stores all job schedules as UTC instants (TIMESTAMPTZ). The business's IANA timezone (from `business_profiles.timezone`) controls local↔UTC conversion at the point of creation and display. User preferences for display timezone are reserved for a future phase and must never alter stored UTC values.

---

## Timezone Hierarchy

```
entityTimezone ?? tenantTimezone ?? 'UTC'
```

| Layer | Source | Used for |
|---|---|---|
| Entity timezone | `jobs.scheduling_timezone` (stored at creation) | Audit record of which TZ was active when the job was created |
| Tenant timezone | `business_profiles.timezone` | Scheduling new jobs; displaying existing jobs on Calendar & Dispatch |
| Fallback | `'UTC'` | Only when no business timezone is configured |

**User display timezone** is a future concept (e.g., a traveling tech viewing times in their local zone). It must never overwrite stored UTC values or shift the scheduling timezone.

---

## Data Flow

### Saving a Job (POST /api/jobs)

1. `JobForm` receives `schedulingTimezone` prop from its parent page (`Jobs.jsx`), sourced from `business_profiles.timezone` loaded via `/api/business-settings`.
2. `JobForm` resolves the effective scheduling timezone using `resolveCalendarTimeZone()` (client-side), which validates the IANA identifier. Falls back to browser TZ then `'America/Chicago'`.
3. The datetime-local input value (naive local string, e.g. `"2026-08-02T07:30"`) is converted to UTC using `fromZonedTime(localInput, resolvedTZ)` from `date-fns-tz`.
4. The UTC ISO string, along with `scheduling_timezone` and `original_local_start`, is sent to the backend.
5. The backend (jobs route) validates `scheduling_timezone` with `validateIanaTimezone()` from `scheduleTimeService.js` and stores the UTC instant in `jobs.scheduled_at` (TIMESTAMPTZ).

### Displaying Jobs (Calendar, `/api/jobs`)

1. Backend returns `scheduled_at` as a UTC ISO string (e.g., `"2026-08-02T11:30:00.000Z"`).
2. `Jobs.jsx` fetches `businessTimezone` from `/api/business-settings` and sets `calendarTZ` via `resolveCalendarTimeZone()`.
3. For react-big-calendar grid placement, each job event uses `toZonedTime(utcStart, calendarTZ)` to create a "fake-local" Date whose `.getHours()` matches the business timezone wall clock. RBC uses `.getHours()` for grid row placement.
4. The edit form populates using `formatInTimeZone(utcDate, resolvedTZ, "yyyy-MM-dd'T'HH:mm")` so the input shows the correct local time in the business timezone.

### Displaying Jobs (Dispatch)

1. `Dispatch.jsx` loads `timezone` from the `account` object returned by `/api/dispatch-settings` (which joins `business_profiles.timezone`).
2. `dispatchTZ` is resolved via `resolveCalendarTimeZone({ businessTimezone: fetchedAcct?.timezone })`.
3. `dispatchTZ` is passed to `DispatchSidebar` → `DispatchTeamPanel` and to `DispatchDrawer`.
4. `fmtTime` and `fmtDate` in both components use `formatTZ(utcDate, fmt, tz)` from `calendarTimezone.js` to display times in the business timezone.

---

## Key Files

| File | Role |
|---|---|
| `src/services/scheduleTimeService.js` | Server-side IANA validation, UTC↔local conversion, day-range calculation, scheduling TZ resolver |
| `client/src/utils/calendarTimezone.js` | Client-side IANA validation, resolver, `formatTZ`, `toCalendarLocal`, `fromCalendarLocal` |
| `client/src/components/JobForm.jsx` | Form submission: `fromZonedTime` for UTC conversion; initialization: `formatInTimeZone` for correct local pre-fill |
| `client/src/pages/Jobs.jsx` | Calendar event dates: `toZonedTime(utcStart, calendarTZ)` for correct RBC grid placement |
| `client/src/maps/DispatchDrawer.jsx` | Displays job/tech times using `formatTZ` in business timezone |
| `client/src/maps/DispatchTeamPanel.jsx` | Displays job schedule times using `formatTZ` in business timezone |
| `client/src/maps/DispatchSidebar.jsx` | Passes `timezone` prop down to `DispatchTeamPanel` |
| `client/src/pages/Dispatch.jsx` | Derives `dispatchTZ` from `account.timezone` in dispatch settings response |
| `client/src/pages/BusinessSettings.jsx` | Timezone selector (global IANA list); warning that changes affect future scheduling only |
| `src/db/add_scheduling_timezone.sql` | Migration: adds `scheduling_timezone TEXT` and `original_local_start TEXT` to jobs table |

---

## Database Schema

```sql
-- On jobs table:
scheduling_timezone  TEXT    -- IANA identifier at time of creation (NULL on legacy rows)
original_local_start TEXT    -- 'YYYY-MM-DDTHH:MM' in scheduling_timezone (NULL on legacy rows)

-- Index for timezone-scoped reporting:
CREATE INDEX idx_jobs_scheduling_tz ON jobs (account_id, scheduling_timezone)
  WHERE scheduling_timezone IS NOT NULL;
```

The `scheduled_at` column remains TIMESTAMPTZ — always storing UTC. `scheduling_timezone` is an audit record only; it never alters stored UTC values.

---

## Constraints

1. **Never hardcode timezone offsets.** No `UTC-5`, `-240`, or `Eastern`. Always use IANA identifiers.
2. **Never patch display by adjusting stored values.** If a time looks wrong, fix the conversion at the source.
3. **Never bulk-shift historical job timestamps.** Legacy rows have NULL `scheduling_timezone` and remain valid UTC instants.
4. **Scheduling TZ ≠ Display TZ.** The business timezone is for scheduling. Future user display timezone preferences are separate and must not alter stored UTC.
5. **react-big-calendar slot limitation.** RBC's `onSelectSlot` provides dates in browser local time. When browser TZ ≠ business TZ, slot pre-fill hour may be offset by the difference. This is an inherent RBC constraint documented in `calendarTimezone.js`.

---

## Timezone Precedence for Scheduling

```
resolveCalendarTimeZone({
  userTimezone:     null,                          // future: per-user override
  businessTimezone: r.data?.profile?.timezone,     // from business_profiles.timezone
}) → { timezone: 'America/New_York', source: 'business' }
```

If `businessTimezone` is invalid or absent, the function cascades to browser timezone, then `'America/Chicago'` as a geographically-central US default.
