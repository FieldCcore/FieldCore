# FieldCore — Canonical Job Information Manual QA Checklist

**Date:** 2026-07-29
**Test on:** Production (getfieldcore.com) after deploy

---

## Setup

1. Log in as an owner account with at least one scheduled single-day job
2. Navigate to **Jobs** (Calendar view)

---

## CalEventCard

- [ ] Calendar event cards show **client name** on the first line (bold)
- [ ] Service type appears on the second line
- [ ] No "undefined" or parsing artifacts visible on any card
- [ ] Multi-day session cards show "Day X of Y" tag above client name
- [ ] Agenda view shows client name then service type (no " — " string artifacts)

---

## Drawer — Single-Day Job

Click any single-day scheduled job to open the drawer.

- [ ] Header shows client name as `<h2>`, service type as subtitle
- [ ] **Start** row shows date and time (e.g. "Jul 29, 2026 9:00 AM")
- [ ] **End** row shows end time (e.g. "10:30 AM") — only when duration_minutes > 0
- [ ] **Duration** row shows human-readable (e.g. "1h 30m", "45m") — only when duration_minutes > 0
- [ ] "Scheduled" label is gone (replaced by Start/End/Duration)
- [ ] **Assigned Team** label replaces "Tech" label
- [ ] "Unassigned" shows when no tech is assigned; tech name shows when one is

---

## Drawer — Multi-Day Job

- [ ] **Assigned Team** label replaces "Job Manager" label
- [ ] Manager name shows (or "Unassigned")
- [ ] Start/End/Duration rows do NOT appear (multi-day uses Date Range / Sessions instead)

---

## Open Job Button

- [ ] Footer shows two buttons: **Edit Job** and **Open Job ↗**
- [ ] Clicking "Open Job ↗" opens a new browser tab
- [ ] New tab URL contains `?job=<uuid>`
- [ ] New tab loads the Calendar page and auto-opens the correct job drawer
- [ ] Closing the drawer in the new tab removes `?job=` from the URL (no navigation)
- [ ] Sharing the URL with `?job=<id>` to another browser session works (if authenticated)

---

## URL Sync

- [ ] Opening a drawer adds `?job=<id>` to the address bar (replace, no back-nav clutter)
- [ ] Closing drawer via × removes `?job=` from URL
- [ ] Closing drawer via Escape removes `?job=` from URL
- [ ] Clicking the overlay background removes `?job=` from URL
- [ ] Changing view (Month/Week/Day) while drawer is open preserves `?job=` in URL
- [ ] Changing status filter while drawer is open preserves `?job=` in URL
- [ ] Reloading a URL with `?job=<id>` auto-opens the correct drawer

---

## Regression Checks

- [ ] Status filter chips still work (Scheduled / In Progress / Completed / Canceled)
- [ ] Creating a new job from calendar slot still works
- [ ] Edit Job from drawer still opens the edit modal
- [ ] Photo upload / delete still works in drawer
- [ ] No-show clock section still shows for scheduled single-day jobs
- [ ] SMS buttons still appear for scheduled/in-progress jobs with a client
- [ ] Status update buttons still work
- [ ] Multi-day sessions panel still renders

---

## Tests

```bash
# From fieldcore root
npm test -- --testPathPattern="canonical|photos"
```

Expected: all canonical tests pass, all photo tests continue to pass.
