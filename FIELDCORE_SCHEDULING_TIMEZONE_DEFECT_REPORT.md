# FieldCore Scheduling Timezone Defect Report

## Defect Summary

**Symptom:** A job saved at 7:30 AM displayed as 4:30 AM on the Calendar. The job also did not appear in Dispatch after being saved.

**Severity:** Critical — all multi-timezone businesses affected; all stored times were wrong for any user whose browser timezone differed from UTC.

---

## Root Cause Analysis

The defect had two independent causes:

### Cause 1: No UTC conversion on save

`JobForm` used `<input type="datetime-local">`, which produces a naive local string such as `"2026-08-02T07:30"` (no timezone suffix). This string was submitted directly to the backend as `scheduled_at`. The PostgreSQL TIMESTAMPTZ column received a string without timezone context. Because the Railway database session defaults to UTC, it stored the value as `2026-08-02T07:30:00Z` — treating 7:30 AM local time as 7:30 AM UTC.

### Cause 2: No timezone-aware display

The Calendar and edit form both used `new Date(utcString)` and `format(new Date(utcString), ...)` from `date-fns`, which formats using the **browser's local timezone**, not the business timezone. A user whose browser is set to UTC-3 would see `2026-08-02T07:30:00Z` parsed as `04:30` local time. Result: 3-hour shift (exactly `|UTC-3 - UTC|`).

The Dispatch sidebar used `toLocaleTimeString()` without a `timeZone` option, which similarly displayed browser-local time.

### Cause 3: No IANA timezone validation

The backend accepted any string as `scheduling_timezone` without validating that it was a real IANA identifier. Fixed-offset aliases like `"UTC-5"` would have been accepted silently.

---

## Timeline of Errors

```
User enters "7:30 AM" in JobForm datetime-local input
  → submitted as "2026-08-02T07:30" (no TZ suffix)
  → PostgreSQL TIMESTAMPTZ interprets as UTC → stores 07:30Z

API returns "2026-08-02T07:30:00.000Z"

Calendar: new Date("2026-08-02T07:30:00.000Z")
  → browser UTC-3 interprets as 4:30 AM local
  → react-big-calendar places event at 4:30 AM row

Edit form: format(new Date("2026-08-02T07:30:00.000Z"), "yyyy-MM-dd'T'HH:mm")
  → produces "2026-08-02T04:30" in browser UTC-3
  → user sees 4:30 in form
```

---

## What Was Fixed

### 1. `client/src/components/JobForm.jsx`

- Added `schedulingTimezone` prop (passed from parent page).
- Resolves effective timezone via `resolveCalendarTimeZone({ businessTimezone: schedulingTimezone })`.
- **Form initialization (edit):** `formatInTimeZone(utcDate, resolvedTZ, "yyyy-MM-dd'T'HH:mm")` — shows correct local time in the business timezone, not browser timezone.
- **Form submission:** `fromZonedTime(localInput, resolvedTZ).toISOString()` — converts the naive local string to a true UTC instant.
- Sends `scheduling_timezone` and `original_local_start` in the request body.

### 2. `client/src/pages/Jobs.jsx`

- Fetches `calendarTZ` from `business_profiles.timezone` via `/api/business-settings`.
- Passes `schedulingTimezone={calendarTZ}` to both JobForm modal instances.
- Calendar event dates use `toZonedTime(utcStart, calendarTZ)` to create fake-local Dates for react-big-calendar's grid placement.

### 3. `client/src/maps/DispatchDrawer.jsx` and `DispatchTeamPanel.jsx`

- Both now accept a `timezone` prop.
- `fmtTime(iso, tz)` and `fmtDate(iso, tz)` use `formatTZ(new Date(iso), fmt, tz)` from `calendarTimezone.js`, displaying business-timezone wall-clock times instead of browser-local.

### 4. `client/src/maps/DispatchSidebar.jsx` and `client/src/pages/Dispatch.jsx`

- `Dispatch.jsx` derives `dispatchTZ` from `account.timezone` in the dispatch-settings response, using `resolveCalendarTimeZone()`.
- `dispatchTZ` is passed to `DispatchSidebar` → `DispatchTeamPanel` and directly to `DispatchDrawer`.

### 5. `src/services/scheduleTimeService.js` (new file)

- Single authoritative server-side timezone service.
- `validateIanaTimezone()`: rejects fixed-offset aliases (`UTC+5`, `GMT-7`); accepts real IANA identifiers.
- `assertIanaTimezone()`: throws HTTP 400 for invalid identifiers.
- `localScheduleToUtc()`: two-iteration DST-correct local→UTC conversion.
- `utcScheduleToLocal()`: UTC→local with DST handling.
- `getLocalDayRangeUtc()`: computes `[start, end)` UTC range for a local calendar date.

### 6. `src/routes/jobs.js`

- POST route validates `scheduling_timezone` with `validateIanaTimezone()`.
- Stores `scheduling_timezone` and `original_local_start` in the new columns.

### 7. `src/db/add_scheduling_timezone.sql` (new migration)

- `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS scheduling_timezone TEXT`
- `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS original_local_start TEXT`
- Safe: `IF NOT EXISTS` guards; legacy rows get NULL (not bulk-shifted).

### 8. `client/src/pages/BusinessSettings.jsx`

- Expanded timezone dropdown from 7 US-only zones to 110+ global IANA identifiers.
- Added note: "Changing this affects future scheduling only — existing jobs are stored in UTC and are not shifted."

---

## Explicitly Out of Scope

- **Historical data migration:** Existing rows in `jobs` with NULL `scheduling_timezone` are valid UTC instants. No bulk-shift was performed. Any migration would require a separate review because the pre-fix data was stored as local-time-as-UTC (not true UTC), meaning a correct migration requires knowing the original business timezone at the time of each job creation.
- **Google Maps changes:** None made.
- **Calendar or Dispatch redesign:** None made. Only time-display logic was corrected.
- **react-big-calendar slot click timezone alignment:** When browser TZ ≠ business TZ, RBC's `onSelectSlot` returns a Date in browser local time. Pre-filling the form from a slot click will be off by the difference between the two timezones. This is a known RBC architectural limitation documented in `calendarTimezone.js`.

---

## Verification Checklist

- [ ] Save a job at 7:30 AM; reload the Calendar → event appears at 7:30 AM (not shifted)
- [ ] Edit the saved job → edit form shows 7:30 AM (not shifted)
- [ ] View Dispatch on the same date → job appears in the team panel with correct time
- [ ] DispatchDrawer (click a job pin) → time shows correctly in business timezone
- [ ] Change business timezone in Settings → new jobs use new timezone; old jobs unaffected
- [ ] All 722 client Vitest tests pass
- [ ] All 285 backend Jest tests pass
- [ ] Frontend build produces no errors
