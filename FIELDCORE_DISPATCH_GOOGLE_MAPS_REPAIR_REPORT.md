# FieldCore Dispatch — Google Maps Repair Report

**Date:** 2026-07-29  
**Engineer:** Claude Code (claude-sonnet-4-6)  
**Scope:** Diagnose and harden the Google Maps integration on the Dispatch page. No redesign.

---

## Problem Statement

The production Dispatch page (`https://www.getfieldcore.com/dispatch`) displayed Google's native gray error overlay:

> "Oops! Something went wrong. This page didn't load Google Maps correctly. See the JavaScript console for technical details."

The prior `gm_authFailure` handler only called `console.error` — it never suppressed Google's overlay or notified any React component. Users saw Google's error instead of a FieldCore-branded fallback.

---

## Root Cause

The `VITE_GOOGLE_MAPS_API_KEY` env var **is** set in Vercel (Production environment, added ~61 days ago) and is baked into the JS bundle at build time. The key is present in the browser — the failure is Google-side rejection (`gm_authFailure`), not a missing key.

**Most likely cause:** The GCP API key's HTTP Referrer restriction does not include `https://www.getfieldcore.com/*`. The key was likely restricted to `https://getfieldcore.com/*` (without `www.`), and the production domain resolves to `www.getfieldcore.com`.

**Other possible causes (ordered by likelihood):**
1. HTTP Referrer restriction missing `https://www.getfieldcore.com/*`
2. Maps JavaScript API not enabled in GCP Console → APIs & Services → Library
3. Billing not active on the GCP project
4. API key was rotated or deleted without redeploying Vercel
5. `VITE_GOOGLE_MAPS_API_KEY` set for Preview/Development only, not Production

---

## Files Changed

### `client/src/maps/MapProvider.jsx`

**Before:** `gm_authFailure` called `console.error` only. Window error/rejection listeners logged all errors indiscriminately.

**After:**
- `gm_authFailure` now:
  1. Logs a structured diagnostic with masked key prefix (first 8 chars), hostname, timestamp, and an ordered list of probable causes
  2. Injects a CSS rule (`#fieldcore-maps-error-suppress`) that hides `.gm-err-container` — suppressing Google's native gray overlay immediately
  3. Dispatches `fieldcore:maps:auth-failure` CustomEvent so any map component can react
- `MapsDiagnostics` component now also dispatches `fieldcore:maps:auth-failure` when `useApiLoadingStatus()` returns `'FAILED'` (script load failure — distinct from auth failure)
- Window `error` listener now only fires for `maps.googleapis.com` script errors
- Window `unhandledrejection` listener now only fires for maps-related rejections
- All diagnostic data uses masked key (`API_KEY.slice(0, 8) + '…'`) — never logs the raw key

### `client/src/maps/GoogleMap.jsx`

**Before:** No awareness of auth failures. Google's overlay was the only user-visible feedback.

**After:**
- Added `authError` state (initially `null`)
- `useEffect` subscribes to `fieldcore:maps:auth-failure` on mount; sets `authError` when fired
- New `MapAuthError` component:
  - Renders a FieldCore-styled fallback (pin icon, "Map unavailable" message)
  - In dev mode: shows GCP diagnostic steps (enable Maps JS API, check referrer restrictions, verify billing)
  - In production: shows user-safe "Unable to load map. Check your connection and try again."
  - "Retry" button calls `window.location.reload()` to attempt fresh load
  - Inherits `className` and `style` from the parent so the layout is unchanged
- When `authError` is set, `MapAuthError` renders instead of `<Map>` — Google's overlay cannot appear because the map never mounted

### `client/src/maps/Marker.jsx`

**Before:** No coordinate validation — `new google.maps.Marker({ position: null, … })` would throw.

**After:**
- Creation `useEffect` guards: `if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng)) return;`
- Position-update `useEffect` has the same guard — silently skips invalid coordinates rather than calling `setPosition(null)`

### `src/tests/mapsRepair.test.js` (new)

14 tests covering:
- All three routes return 401 without a valid JWT
- Geocode + route return 503 when `GOOGLE_MAPS_API_KEY` is unset
- Autocomplete returns `{ predictions: [] }` (not an error) when key is unset
- Geocode returns 400 for missing/empty address
- Route returns 400 for missing origin or destination
- Autocomplete returns empty array for input < 3 chars or absent input
- API error responses never contain the raw API key string

---

## What Was NOT Changed

- Dispatch page layout (`client/src/pages/Dispatch.jsx`) — unchanged
- Coordinate validation in `Dispatch.jsx` (`toCoord`, `jobPos`, `techPos`, `MapAutoCenter`) — already correct
- Backend maps routes (`src/routes/maps.js`) — already had graceful fallbacks
- `src/services/geocode.js` — already safe

---

## GCP Console Action Required

The code changes harden the client — but the map will only render when Google accepts the API key. The root cause is a GCP configuration issue that must be fixed in the GCP Console:

1. Go to **GCP Console → APIs & Services → Credentials**
2. Select the Maps API key used by FieldCore
3. Under **Application restrictions → HTTP referrers**, ensure both of the following are present:
   ```
   https://getfieldcore.com/*
   https://www.getfieldcore.com/*
   ```
4. Under **API restrictions**, ensure **Maps JavaScript API** is in the allowed list
5. Confirm billing is active on the project (**Billing → Overview**)
6. After changing restrictions, wait ~5 minutes for changes to propagate, then reload Dispatch

---

## Security Constraints Preserved

- Raw API key is never logged (masked: first 8 chars + `…`)
- `GOOGLE_MAPS_API_KEY` (server-side) is never exposed through any public env var or API response
- `VITE_GOOGLE_MAPS_API_KEY` (frontend) appears only in the Maps script URL injected by Google's own library — this is the intended behavior
- No key is written to browser storage beyond what Google Maps itself requires

---

## Test Results

```
Tests: 208 passed, 208 total (14 new in mapsRepair.test.js)
```

Frontend build: clean (6.96s, no errors)
