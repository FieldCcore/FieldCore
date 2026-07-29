# FieldCore Calendar — Manual QA Checklist

Use this checklist before marking Calendar v1 Improved as released. Complete each scenario in order.

---

## Setup

1. Open the app and log in at `/login`.
2. Navigate to the Calendar via the sidebar (Jobs / Calendar icon).
3. For scenarios requiring specific data, use the account states described.

---

## Scenario A — Status Colors (Populated Account)

*Account with jobs in all four statuses: scheduled, in_progress (or partially_completed), complete, cancelled.*

### Legend
- [ ] Legend shows exactly 4 entries: Scheduled, In Progress, Completed, Canceled
- [ ] No "Partially Completed" entry appears in the legend
- [ ] Scheduled dot is steel/gray (`#8A90A2`)
- [ ] In Progress dot is yellow (`#D4A000`) — not green, not orange
- [ ] Completed dot is green (`#2E7D32`)
- [ ] Canceled dot is red (`#C62828`)
- [ ] "Dashed border = multi-day session" hint appears on the right side of the legend

### Calendar event colors (Day or Week view)
- [ ] Scheduled events render with steel/gray background
- [ ] In Progress events render with yellow background (distinct from Completed green)
- [ ] Completed events render with green background
- [ ] Canceled events render with red background
- [ ] If any `partially_completed` jobs exist, they render as yellow (same as In Progress)
- [ ] No blue event backgrounds appear
- [ ] No orange/amber event backgrounds appear

### Multi-day sessions
- [ ] Session events have a dashed border (white, semi-transparent)
- [ ] Session events show a "Day N of M" label inside the card (e.g., "Day 2 of 5")
- [ ] Session event color matches the status of that session (not the parent job)

---

## Scenario B — Filter Bar

*Account with jobs in multiple statuses.*

- [ ] Filter chips are visible below the legend
- [ ] "All", "Scheduled", "In Progress", "Completed", "Canceled" chips are present
- [ ] "All" is the default active chip
- [ ] Active chip text is white; inactive chips show slate text
- [ ] Clicking "In Progress" hides Scheduled, Completed, and Canceled events
- [ ] "In Progress" filter also shows `partially_completed` events (if any exist)
- [ ] The event count badge appears when a filter is active (e.g., "3 events")
- [ ] Clicking "All" restores all events
- [ ] Selecting "Scheduled" shows only scheduled events
- [ ] Selecting "Canceled" shows only canceled events
- [ ] Filter chip uses the status color as background when active:
  - [ ] Scheduled → steel background
  - [ ] In Progress → yellow background
  - [ ] Completed → green background
  - [ ] Canceled → red background

### URL persistence
- [ ] After selecting a filter, the URL includes `?filter=in_progress` (or the selected value)
- [ ] Refreshing the page with `?filter=in_progress` in the URL restores the In Progress filter
- [ ] After switching to Day view, the URL includes `?view=day`
- [ ] Refreshing with `?view=day` restores Day view
- [ ] The default state (All filter, Week view) produces a clean URL with no params
- [ ] `?new=1` still opens the New Job modal and then clears from URL

---

## Scenario C — Today's Summary Strip

*Account with jobs scheduled for today in mixed statuses.*

- [ ] A summary strip appears between the filter bar and the calendar in Day or Week view
- [ ] Strip shows counts for each status present today (e.g., "2 scheduled · 1 in progress · 3 completed")
- [ ] Each count has a colored dot matching the status color
- [ ] Strip does NOT appear in Month or Agenda view
- [ ] Strip does NOT appear when there are no events today
- [ ] Strip does NOT appear when the filter hides all today's events (it uses the unfiltered count)

---

## Scenario D — Now Control

*Any account. Must be testing in Day or Week view.*

- [ ] A clock icon button appears in the toolbar navigation (between "Today" and "←")
- [ ] Clock icon button is NOT visible in Month or Agenda view
- [ ] Clock icon button has a red/accent color distinct from the nav buttons
- [ ] Clicking the clock icon navigates to today (if on another date)
- [ ] Clicking the clock icon scrolls the time grid to show the current time in the viewport
- [ ] The current time is roughly centered vertically after clicking
- [ ] Clicking "Today" (text button) also navigates to today but does not scroll to current time

### Auto-scroll on load
- [ ] When the Calendar first loads in Day or Week view, the time grid auto-scrolls to the current hour
- [ ] Business hours at 8am–5pm should have 8am visible near the top after auto-scroll

---

## Scenario E — Current Time Indicator

*Any account, Day or Week view, during business hours.*

- [ ] A red horizontal line appears at the current time in the time grid
- [ ] A red circle (dot) appears at the left edge of the line
- [ ] The line is clearly visible against both colored events and the white background
- [ ] The line is NOT sand/gold colored
- [ ] The line updates position as time passes (react-big-calendar manages this automatically)
- [ ] The indicator is NOT clickable (does not trigger event selection)

---

## Scenario F — Event Detail Drawer

*Account with jobs. Click any event.*

- [ ] Clicking a calendar event opens a right-side drawer (NOT a centered modal)
- [ ] The drawer slides in from the right with a brief animation
- [ ] The drawer is approximately 400px wide on desktop
- [ ] The calendar remains visible behind the semi-transparent overlay
- [ ] The drawer shows full job details (client, tech, date, amount, status badge, etc.)
- [ ] The status badge in the drawer uses the StatusBadge component (4-tone system)
- [ ] The "Edit Job" button inside the drawer opens the edit modal (centered)
- [ ] After saving an edit, the drawer reflects the updated job data
- [ ] Pressing Escape closes the drawer (calendar remains in place)
- [ ] Clicking outside the drawer (on the overlay) closes it
- [ ] Clicking the × button inside the drawer closes it
- [ ] No navigation away from `/jobs` occurs when opening/closing the drawer
- [ ] Sidebar NavLink for Calendar remains active while the drawer is open

### Session click (multi-day job)
- [ ] Clicking a session event (dashed border) opens the parent job in the drawer (not the session)
- [ ] The drawer shows the full multi-day job detail with session list

---

## Scenario G — Custom Event Cards

*Account with jobs in Day/Week view.*

- [ ] Each event block shows the service type in bold
- [ ] Client name appears below the service type (if present)
- [ ] Text is truncated with ellipsis if the event block is narrow
- [ ] Multi-day sessions show "Day N of M" label at the top of the card
- [ ] No raw event title text (e.g., "[Day 2 of 5] HVAC Repair — Smith") spills outside the block
- [ ] Event blocks are clickable (cursor: pointer is visible on hover)

---

## Scenario H — Empty Account

*Log in as an owner with no jobs.*

- [ ] Calendar renders without error in all four views
- [ ] No events appear on the calendar
- [ ] Summary strip does NOT appear (no jobs today)
- [ ] Filter bar appears but shows "0 events" when a non-All filter is selected
- [ ] Clicking a time slot opens the New Job modal
- [ ] Creating a job from the modal adds it to the calendar

---

## Scenario I — Toolbar Navigation

*Any account.*

- [ ] "Today" button navigates to the current date
- [ ] "←" (Prev) navigates to the previous period (week, month, or day)
- [ ] "→" (Next) navigates to the next period
- [ ] Month / Week / Day / Agenda buttons switch views
- [ ] Active view button has navy background and white text
- [ ] Date label updates to match the current view and date
- [ ] Month label format: "July 2026"
- [ ] Week label format: "Jul 21 – 27, 2026"
- [ ] Day label format: "Monday, July 28, 2026"
- [ ] Agenda label: "Upcoming Events"

---

## Scenario J — Agenda View

*Account with jobs scheduled in the next 30 days.*

- [ ] Agenda view renders the custom FieldCore table (not react-big-calendar's default)
- [ ] Table header: Date / Time / Event (navy background)
- [ ] Each row shows: date in DM Mono, time range, colored dot + service + client
- [ ] Dot color matches the four-status color system
- [ ] Events are sorted newest first (ascending by date)
- [ ] Date column shows empty for subsequent events on the same day
- [ ] Clicking an agenda row opens the event detail drawer
- [ ] Keyboard: Tab to row, Enter/Space opens the drawer
- [ ] Empty state: "No upcoming events in this range."
- [ ] Filter chips still work in Agenda view (filter events shown)
- [ ] Summary strip does NOT appear in Agenda view

---

## Scenario K — JobDetail Badge Colors

*Open any job's detail drawer or detail modal.*

- [ ] MULTI-DAY badge: gray/neutral background, steel text, light gray border
- [ ] MULTI-DAY badge is NOT blue
- [ ] High-priority badge: yellow background (`#FFF9DB`), yellow text (`#D4A000` / `var(--yellow)`)
- [ ] Urgent-priority badge: red background, red text
- [ ] No-show grace clock (running): yellow background, yellow text
- [ ] No-show grace clock (expired): red background, red text
- [ ] Status badge on the job uses the StatusBadge component (green/yellow/red/gray only)

---

## Scenario L — Color Compliance (Global Check)

*Check across all calendar views and the job drawer.*

- [ ] No blue event backgrounds appear on the calendar
- [ ] No orange or amber event backgrounds appear
- [ ] No blue status badges appear in the drawer
- [ ] No orange or amber status badges appear in the drawer
- [ ] No orange priority badges appear (high = yellow, urgent = red)
- [ ] Filter chip active colors: steel / yellow / green / red (no blue or orange)
- [ ] Summary strip dots: steel / yellow / green / red (no blue or orange)
- [ ] Current time indicator: red line with red dot

---

## Scenario M — Accessibility (Quick Check)

- [ ] All toolbar buttons are keyboard-focusable (Tab) and activatable (Enter/Space)
- [ ] Toolbar buttons show focus ring when focused with keyboard
- [ ] Filter chips have visible focus ring and `aria-pressed` state
- [ ] Agenda rows are focusable and respond to Enter/Space
- [ ] Event detail drawer closes on Escape
- [ ] Drawer has `role="dialog"` and `aria-label="Job details"`
- [ ] No tooltip titles on toolbar buttons (no `title` attribute visible on hover)

---

## Scenario N — URL State Preservation

*Check that the URL correctly reflects and restores state.*

- [ ] `/jobs` — default state, no extra params
- [ ] `/jobs?view=day` — calendar opens in Day view
- [ ] `/jobs?view=month` — calendar opens in Month view
- [ ] `/jobs?view=agenda` — calendar opens in Agenda view
- [ ] `/jobs?filter=scheduled` — only scheduled events visible on load
- [ ] `/jobs?view=day&filter=in_progress` — Day view with In Progress filter on load
- [ ] `/jobs?new=1` — New Job modal opens, URL clears to `/jobs` after
- [ ] `/jobs?new=1&multiday=1` — New Multi-Day Job modal opens

---

## Scenario O — Business Hours Shading

*Account with custom business hours configured.*

- [ ] Slots outside business hours are shaded gray (`#f3f4f6`)
- [ ] Cursor shows `not-allowed` on gray slots
- [ ] Business-hours slots are white/interactive
- [ ] Calendar min/max time range adjusts to ±1 hour around open/close times
- [ ] Closed days (e.g., Sunday) are fully gray in Week view

---

## Deferred (Do Not Test in This QA)

- Drag-and-drop job rescheduling
- Resource (technician) view
- Travel time visualization
- Scheduling conflict detection
- Weather overlays
- AI scheduling suggestions
- Mobile Calendar redesign

---

## Sign-off

Complete all scenarios before marking Calendar v1 Improved as released. Flag any `FAIL` items as blocking defects.
