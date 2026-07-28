# FieldCore Dashboard v1 — Manual QA Checklist

Use this checklist before marking Dashboard v1 as released. Check each item in the specified role and account state.

---

## Setup

1. Open the app and log in at `/login`.
2. Use the entity switcher in the sidebar to change between accounts where multi-entity steps are required.
3. For each scenario below, complete every checkbox before moving on.

---

## Scenario A — Owner, Populated Account

*Log in as an owner in an account that has jobs, invoices, deposits, clients, and team members.*

### Greeting
- [ ] Date shows today's correct date in local timezone
- [ ] Greeting says "Good morning," "Good afternoon," or "Good evening" based on current local time
- [ ] User's first name appears (not "there" or a hardcoded name)
- [ ] Entity bar shows the correct account name
- [ ] No duplicate date in the global header

### KPI Cards — Layout
- [ ] All 6 cards have equal height
- [ ] Titles align across all 6 cards
- [ ] Values align across all 6 cards
- [ ] Supporting text lines align across all 6 cards
- [ ] Action links align at the bottom of all 6 cards
- [ ] No card overflows its container

### KPI — Today Revenue
- [ ] Value reflects actual revenue from completed jobs scheduled today
- [ ] Subtitle shows correct job count for today
- [ ] "View today →" action opens Revenue Analytics (`/revenue`)
- [ ] Revenue Analytics link is active in the sidebar

### KPI — Upcoming Jobs Today
- [ ] Count shows only jobs scheduled LATER today (not past, not complete, not cancelled)
- [ ] "View today's schedule →" opens Calendar in Day view for today
- [ ] Calendar is active in the sidebar after clicking
- [ ] Refreshing the Calendar page preserves Day view
- [ ] When count = 0: badge shows "Clear" in green

### KPI — Active Jobs
- [ ] Count reflects jobs currently in progress (`in_progress` status)
- [ ] When jobs are active: "Live" badge appears in green
- [ ] When no active jobs: "Clear" badge appears in green
- [ ] "View active jobs →" opens Calendar Day view (not weekly calendar)
- [ ] Calendar is active in the sidebar

### KPI — Pending Invoices
- [ ] Value shows total outstanding invoice amount
- [ ] Count shows number of outstanding invoices
- [ ] When invoices outstanding: badge shows "Outstanding" or "Action Needed" in red
- [ ] When all paid: badge shows "All Paid" in green
- [ ] "Collect →" opens Invoices page

### KPI — Pending Deposits
- [ ] Count shows number of pending/unpaid deposits
- [ ] When deposits pending: badge shows "Awaiting Payment" or "Action Needed" in red
- [ ] When overdue deposits exist: badge shows "Action Needed" in red
- [ ] When all paid: badge shows "All Paid" in green
- [ ] When no deposits ever: badge shows "No Deposits" in gray
- [ ] "Review deposits →" opens Deposits page

### KPI — Avg Rating (Google connected)
- [ ] Rating shows Google average (e.g., "4.7 ★")
- [ ] Subtitle shows review count and source "· Google"
- [ ] "Connected" badge appears in green
- [ ] "View reviews →" opens Business Settings → Integrations
- [ ] Business Settings is active in sidebar after clicking
- [ ] Google Business Profile card is visible on that page

### Status Colors
- [ ] No blue status badges appear anywhere on the Dashboard
- [ ] No orange/amber badges appear anywhere
- [ ] Outstanding amounts are shown in red
- [ ] "All Paid" states are shown in green
- [ ] "Clear" states are shown in green
- [ ] Warnings (e.g., "Syncing") appear in true yellow (not orange)

### Today's Priorities Panel
- [ ] Panel shows unresolved items requiring action
- [ ] Failed payments appear with red tone (critical)
- [ ] Pending deposits appear with red tone (critical)
- [ ] Unassigned jobs today appear with yellow tone (warning)
- [ ] Unread messages appear with yellow tone (warning)
- [ ] Estimates awaiting approval appear with yellow tone (warning)
- [ ] Each row routes to the correct module when clicked
- [ ] Panel has NO hardcoded "Deposits →" action in the header

### Recent Activity Panel
- [ ] Shows completed events: payments, job completions, estimate approvals, new clients
- [ ] Does NOT show "Deposit pending" or other unresolved items
- [ ] Events sorted newest first
- [ ] At most 5 events shown on Dashboard
- [ ] "View All →" link is present and clickable

### Revenue This Week Panel
- [ ] Total revenue is the primary number (large, prominent)
- [ ] Date range label shows current Mon–Sun week
- [ ] Financial Snapshot shows Collected, Outstanding, Invoices Paid values
- [ ] **Outstanding value shows in RED** (not yellow or orange)
- [ ] Weekly chart shows 7 bars (Mon–Sun)
- [ ] Today's bar is highlighted differently (navy)
- [ ] Future days are lighter (light gray)
- [ ] Hovering a bar shows the revenue tooltip
- [ ] Footer insight shows week-over-week comparison or best day
- [ ] No internal scroll in the panel

### Quick Actions Panel
- [ ] All 6 actions are visible: Dispatch Map, Review Deposits, Business Phone, Revenue Analytics, Team Report, Book New Job
- [ ] Each action navigates to the correct page
- [ ] "Book New Job" opens the job creation modal

### Today's Jobs Panel
- [ ] Shows jobs scheduled for today with client name and service type
- [ ] Status dot color: green for in-progress, steel for scheduled, red for cancelled
- [ ] Time displays correctly in local timezone
- [ ] Empty state: "No jobs today" with calendar icon

### Team Panel
- [ ] Shows each team member with active/available status
- [ ] Green dot for techs with active jobs, steel dot for available
- [ ] Job count for the week is accurate

### Recent Reviews Panel
- [ ] Shows recent reviews with client name, star rating, service type, and body
- [ ] When Google connected: "Google" badge appears in green on panel title

---

## Scenario B — Admin (Manager Role)

*Log in as a manager in the same populated account.*

- [ ] Dashboard loads without errors
- [ ] KPI cards visible with real data
- [ ] Revenue, deposits, and invoices visible (manager has finance access)
- [ ] No owner-only features are exposed (e.g., billing)
- [ ] Create New menu is visible in the header
- [ ] Phone icon in header opens dialer directly (no intermediate menu)

---

## Scenario C — Technician (Restricted User)

*Log in as a tech user.*

- [ ] Tech is redirected to `/tech` (the mobile app), not `/dashboard`
- [ ] No access to Dashboard or financial data is possible by editing the URL

---

## Scenario D — Empty Account

*Log in as an owner with a brand new account (no jobs, no invoices, no deposits, no reviews).*

- [ ] Greeting appears correctly with user name
- [ ] Today Revenue: $0, subtitle "0 jobs today"
- [ ] Upcoming Jobs Today: 0, "Clear" badge in green
- [ ] Active Jobs: 0, "Clear" badge in green
- [ ] Pending Invoices: $0, "All Paid" badge in green
- [ ] Pending Deposits: 0, "No Deposits" badge in gray
- [ ] Avg Rating: "—", "No reviews yet", "Connect Google →" action
- [ ] Today's Jobs: "No jobs today" empty state
- [ ] Revenue This Week: "No completed payments" message, all bars at zero
- [ ] Team: "No team members" empty state
- [ ] Recent Reviews: "No reviews yet" empty state
- [ ] Today's Priorities: "All caught up" empty state with CheckCircle icon
- [ ] Recent Activity: "No recent activity" empty state with Inbox icon

---

## Scenario E — Multiple Entities

*Log in as an owner with access to two or more accounts.*

- [ ] Entity switcher is visible in the sidebar
- [ ] Switching to Entity B loads Entity B's Dashboard data
- [ ] Entity B data does not include any of Entity A's jobs, revenue, or activity
- [ ] Header shows the current entity name in the subtitle
- [ ] Switching back to Entity A restores Entity A's data
- [ ] URL does not expose account IDs in the path

---

## Scenario F — Google Connected

- [ ] Avg Rating KPI shows Google rating (e.g., "4.7 ★")
- [ ] Badge shows "Connected" in green
- [ ] Subtitle shows "N reviews · Google"
- [ ] "View reviews →" opens Business Settings → Integrations
- [ ] Recent Reviews panel shows "Google" badge in green

---

## Scenario G — Google Disconnected

- [ ] Avg Rating KPI shows "—" or internal fallback rating
- [ ] No "Connected" badge visible
- [ ] "Connect Google →" action is present
- [ ] Clicking "Connect Google →" opens Business Settings → Integrations

---

## Scenario H — Telephony Unconfigured

*No Twilio phone number configured.*

- [ ] Phone icon in header is visible
- [ ] Clicking phone icon opens the dialer directly (no intermediate menu)
- [ ] Dialer shows a setup notice explaining telephony is not configured
- [ ] "Set up calling →" link inside dialer opens the correct settings area
- [ ] Call button is disabled (cannot initiate calls without config)
- [ ] Dialer fits in the viewport without internal scrolling at 1024×768

---

## Scenario I — No Priorities

*Account with no failed payments, no pending deposits, no unassigned jobs, no unread messages, no unapproved estimates.*

- [ ] Today's Priorities panel shows the "All caught up" empty state
- [ ] CheckCircle icon appears (green)
- [ ] "You're in great shape today." subtitle appears
- [ ] "View Revenue Analytics →" link appears and works

---

## Scenario J — Multiple Priorities

*Account with failed invoices, pending deposits, unassigned jobs, and unread messages.*

- [ ] All active priority types appear in correct order (failed payments first, deposits second, unassigned third, messages fourth, estimates fifth)
- [ ] Failed payments: red tone
- [ ] Deposits: red tone
- [ ] Unassigned jobs: yellow tone
- [ ] Messages: yellow tone
- [ ] Each row routes to the correct module

---

## Scenario K — No Recent Activity

*Account with no completed jobs, no paid invoices, no new clients in the last 30 days.*

- [ ] Recent Activity panel shows the "No recent activity" empty state
- [ ] Inbox icon appears
- [ ] Subtitle explains what would appear here

---

## Scenario L — Populated Recent Activity

*Account with recent completed jobs, paid invoices, new clients.*

- [ ] Job completed event appears (type: `job_completed`, tone: success)
- [ ] Payment received event appears (type: `payment_received`, tone: success)
- [ ] Client added event appears (type: `client_created`, tone: neutral)
- [ ] Events are sorted newest first
- [ ] At most 5 events shown
- [ ] No "Deposit pending" events appear
- [ ] "View All →" link is present

---

## Global Controls (check across all scenarios)

### Global Search
- [ ] Search icon visible in header, right of entity label
- [ ] Ctrl+K (Windows/Linux) or Cmd+K (Mac) opens search
- [ ] Typing in search field shows results or empty state
- [ ] Escape closes search and returns focus
- [ ] Search does not overlap other header controls
- [ ] No tooltip on the search icon

### Phone Dialer
- [ ] Phone icon has NO tooltip (no title attribute)
- [ ] One click opens the dialer (no intermediate menu)
- [ ] Physical keyboard entry works for digit keys
- [ ] Backspace deletes last digit
- [ ] On-screen keypad works
- [ ] Paste from clipboard works
- [ ] Clear button resets input
- [ ] Escape closes the dialer
- [ ] Focus returns to the phone icon after close

### Create New
- [ ] "+" icon in header opens Create New menu
- [ ] Menu shows: Client, Request, Quote, Job (with submenu), Invoice
- [ ] Job submenu shows: Single-Day Job, Multi-Day Job, Project
- [ ] Dividers appear between non-adjacent groups only (no trailing divider after last item)
- [ ] Escape closes the menu
- [ ] Clicking outside closes the menu

### Browser Navigation
- [ ] Browser back/forward works correctly
- [ ] Refreshing the Dashboard reloads fresh data
- [ ] The URL does not contain sensitive data
- [ ] Sidebar NavLink active states update correctly when navigating

---

## Deferred (Do Not Test in This QA)

- Twilio call flow (initiation, recording, status)
- SMS / MMS messaging
- Voicemail
- AI search
- Mobile Dashboard redesign
- FieldCore Payments / new Billing
- Google Reviews standalone page
