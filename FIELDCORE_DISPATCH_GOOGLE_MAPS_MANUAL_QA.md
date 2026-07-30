# FieldCore Dispatch — Google Maps Manual QA Checklist

**Date:** 2026-07-29  
**Page:** `https://www.getfieldcore.com/dispatch`

---

## Pre-QA: GCP Console Verification

Before testing the map, confirm these are correct in GCP Console → APIs & Services → Credentials:

- [ ] HTTP Referrer restriction includes `https://www.getfieldcore.com/*`
- [ ] HTTP Referrer restriction includes `https://getfieldcore.com/*`
- [ ] Maps JavaScript API is enabled (APIs & Services → Library → search "Maps JavaScript")
- [ ] Billing is active (Billing → Overview shows no suspended state)
- [ ] The key used in Vercel (`VITE_GOOGLE_MAPS_API_KEY`) matches the key in GCP Console

---

## Section 1 — Map Loads Without Error

- [ ] Navigate to `/dispatch` as an owner or manager
- [ ] Map renders with FieldCore branded styles (muted tones, no Google default blue water)
- [ ] No gray "Oops! Something went wrong" overlay from Google
- [ ] No `[MapProvider] gm_authFailure` log in browser console
- [ ] Console shows `[MapProvider] status: LOADED | isLoaded: true`
- [ ] Console shows `[MapProvider][script] FULL URL:` with the script parameters table

---

## Section 2 — Auth Failure Fallback (simulate by using wrong key)

To test without breaking production, temporarily test on a staging/preview deployment with an invalid key:

- [ ] With an invalid/rejected API key, the FieldCore "Map unavailable" card renders instead of Google's gray overlay
- [ ] The card shows the pin icon and "Map unavailable" text
- [ ] "Retry" button calls `window.location.reload()`
- [ ] Google's `.gm-err-container` overlay is hidden (inspect DOM: `display: none` on that element)
- [ ] Console shows the structured diagnostic including masked key prefix and ordered probable causes
- [ ] `fieldcore:maps:auth-failure` custom event fires (verify in DevTools → Console → `window.addEventListener('fieldcore:maps:auth-failure', console.log)`)

---

## Section 3 — Missing Key State

- [ ] With `VITE_GOOGLE_MAPS_API_KEY` unset in Vercel (or cleared from `.env.local` for local dev):
  - [ ] `[MapProvider] VITE_GOOGLE_MAPS_API_KEY not set — map features disabled` logged in console
  - [ ] `GoogleMap` renders "Map unavailable — Set VITE_GOOGLE_MAPS_API_KEY to enable maps."
  - [ ] Rest of Dispatch page (tech list, job list) renders normally

---

## Section 4 — Map Markers

- [ ] Tech markers appear at technician GPS positions (within 15 min of last ping)
- [ ] Job markers appear at service address coordinates
- [ ] Clicking a tech marker selects the tech (panel scrolls/highlights)
- [ ] Clicking a job marker opens the job detail drawer
- [ ] Jobs with missing/invalid service coordinates do NOT cause a JS error
- [ ] Techs with stale GPS (>15 min) do NOT show a marker (no invalid coordinate pin)

---

## Section 5 — Map Auto-Center

- [ ] With active techs with GPS: map centers on live tech positions
- [ ] Without active techs but with mapped jobs: map centers on job area
- [ ] Without either: map centers on browser geolocation (if permitted) or HQ or continental US fallback
- [ ] Centering does not throw errors when the positions array is empty

---

## Section 6 — Dispatch Panel Interactions

- [ ] Assigning a tech to a job from the panel does not break the map
- [ ] Selecting a tech in the panel highlights their marker
- [ ] Filtering jobs does not throw map errors

---

## Section 7 — Backend Maps Proxy

- [ ] Unauthenticated `GET /api/maps/geocode?address=Tampa+FL` → 401
- [ ] Unauthenticated `GET /api/maps/autocomplete?input=Tampa` → 401
- [ ] Unauthenticated `POST /api/maps/route` → 401
- [ ] Authenticated `GET /api/maps/geocode?address=1+Main+St+Tampa+FL` → 200 with `{ lat, lng, formatted_address }`
- [ ] Authenticated `GET /api/maps/autocomplete?input=Tam` → 200 with `{ predictions: [] }` (input too short)
- [ ] Authenticated `GET /api/maps/autocomplete?input=Tampa` → 200 with predictions array
- [ ] API responses never contain the raw API key string

---

## Section 8 — Error Boundary

- [ ] If a JavaScript error is thrown inside the map subtree, `CalendarErrorBoundary` (if wrapping dispatch) catches it rather than crashing the page
- [ ] "Try again" button resets error state

---

## Section 9 — Cross-Browser

- [ ] Chrome (latest): map loads and all markers render
- [ ] Firefox (latest): map loads and all markers render
- [ ] Safari (latest): map loads and all markers render
- [ ] Mobile Chrome (iOS/Android): map renders, touch pan/zoom works

---

## Section 10 — Performance

- [ ] Dispatch page with 20+ jobs renders without noticeable lag
- [ ] Map pan and zoom are smooth
- [ ] No memory leaks from marker cleanup (navigate away and back, check DevTools Memory)

---

## Pass Criteria

All checkboxes in Sections 1, 3, 4, 5, 6, and 7 must pass for the repair to be considered complete.

Section 2 requires a staging/preview environment with an intentionally invalid key.

Sections 8–10 are recommended but not blocking for the initial repair release.
