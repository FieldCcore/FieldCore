# FieldCore Dispatch — Google Maps Manual QA Checklist

**Date:** 2026-07-30  
**Page:** `https://www.getfieldcore.com/dispatch`

---

## Pre-QA: Deploy the repaired build

Before testing, confirm the correct variable is set and the project has been redeployed:

### 1 — Confirm production variable exists and has the correct name

In Vercel Dashboard → Project `field-core-seem` → Settings → Environment Variables:

- [ ] Variable name is exactly `VITE_GOOGLE_MAPS_API_KEY` (must have `VITE_` prefix)
- [ ] Variable is scoped to **Production** environment
- [ ] Value contains no surrounding quotes (e.g. `AIzaSy...`, not `"AIzaSy..."`)
- [ ] Value has no leading or trailing whitespace

> **If the variable is named `GOOGLE_MAPS_API_KEY` (without `VITE_`):** Vite will not expose it in the browser bundle. Rename it or add a new variable with the correct `VITE_` prefix.

### 2 — Confirm variable name matches the Vite framework convention

The frontend is **Vite** (not Next.js, not CRA). Vite requires the `VITE_` prefix. Variables without it are treated as backend-only and produce `undefined` in the browser bundle.

- [ ] Confirmed: framework is Vite
- [ ] Confirmed: variable is `VITE_GOOGLE_MAPS_API_KEY` (not `NEXT_PUBLIC_`, not `REACT_APP_`)

### 3 — Trigger a clean production redeploy

Saving the Vercel env var does NOT update the live bundle — Vite bakes values at build time.

```sh
npx vercel --prod
```

Or: Vercel Dashboard → Deployments → most recent → ⋯ → **Redeploy** → **Without cache**.

- [ ] Redeploy triggered after variable was saved
- [ ] Deployment completed successfully (no build errors in Vercel logs)

---

## Section 1 — Confirm Google Maps request in Network tab

- [ ] Open `https://www.getfieldcore.com/dispatch` (owner or manager account)
- [ ] Open DevTools → **Network** tab → filter by `maps`
- [ ] Hard refresh (Cmd/Ctrl+Shift+R)
- [ ] **A request appears to `maps.googleapis.com/maps/api/js`** ← this is the acceptance criterion
- [ ] Request status is 200

If NO request appears → the key is still missing from the bundle. Re-check Step 1 above.

---

## Section 2 — Confirm map renders

- [ ] The map renders with FieldCore branded styles (muted tones, off-white background)
- [ ] No gray Google "Oops! Something went wrong" overlay
- [ ] No FieldCore "Map unavailable" fallback card
- [ ] Console shows `[MapProvider] status: LOADED | isLoaded: true`
- [ ] Console shows `[MapProvider][script] FULL URL: https://maps.googleapis.com/maps/api/js?...`

---

## Section 3 — Confirm retry works

- [ ] Simulate a transient failure: in DevTools → Network → set to **Offline**, reload, re-enable Online
- [ ] "Map unavailable" card appears with a **Retry** button
- [ ] Clicking Retry performs `window.location.reload()`
- [ ] After reload with network restored, map loads normally

---

## Section 4 — Confirm no complete API key appears in logs

- [ ] Open DevTools → Console
- [ ] No line shows a full `AIzaSy...` key string (39 characters)
- [ ] All key references are masked (`AIzaSy…1234` format — first 6 + last 4)
- [ ] `[MapProvider][script]` table shows only first 8 chars of key in the `key` row

---

## Section 5 — Auth failure fallback (optional — staging only)

Test with an intentionally invalid key on a staging/preview deployment:

- [ ] FieldCore `MapAuthError` component renders (pin icon, "Map unavailable", Retry button)
- [ ] Google's gray `.gm-err-container` overlay is hidden (`display: none` in DevTools Elements)
- [ ] Console shows `[MapProvider] gm_authFailure` with structured diagnostic
- [ ] Console shows ordered list of probable causes
- [ ] `fieldcore:maps:auth-failure` custom event fires (verify: `window.addEventListener('fieldcore:maps:auth-failure', e => console.log(e.detail))`)
- [ ] In dev mode: error message includes masked key and GCP diagnostic steps
- [ ] In production mode: error message shows user-safe "Unable to load map" text

---

## Section 6 — Map markers (when map is loaded)

- [ ] Tech markers appear at live GPS positions (within 15 min of last ping)
- [ ] Job markers appear at valid service address coordinates
- [ ] Jobs with missing or invalid coordinates show no marker (no console error)
- [ ] Techs with GPS older than 15 min show no marker

---

## Section 7 — Zero-data states do not break map

- [ ] With no jobs assigned: map loads, shows empty map (no markers, no error)
- [ ] With no technicians on duty: map loads normally
- [ ] Map center defaults to continental US fallback when no positions available

---

## Section 8 — Backend proxy routes

Quick API check (can be done with browser DevTools or curl with a valid token):

- [ ] `GET /api/maps/geocode?address=Tampa+FL` (authenticated) → 200 with lat/lng
- [ ] `GET /api/maps/geocode` (unauthenticated) → 401
- [ ] `GET /api/maps/autocomplete?input=Tampa` (unauthenticated) → 401
- [ ] `POST /api/maps/route` (unauthenticated) → 401

---

## Section 9 — Dev diagnostics (local dev only)

In local dev with `VITE_GOOGLE_MAPS_API_KEY` set in `client/.env.local`:

- [ ] Console shows `[FieldCore Maps Diagnostics]` group on page load
- [ ] Group shows: config present = true, loader state, script present, google global, hostname
- [ ] Key suffix is masked (last 4 chars visible, full key never shown)

With key NOT set:

- [ ] Console warns `[FieldCore Maps] Loader skipped — MAP_CONFIG_MISSING_API_KEY`
- [ ] Warning includes exact instructions: set `VITE_GOOGLE_MAPS_API_KEY` in `client/.env.local`

---

## Pass Criteria

**Blocking for release:**
- Section 1: Network tab shows request to `maps.googleapis.com`
- Section 2: Map renders without Google or FieldCore error overlay
- Section 4: No full API key in console logs

**Recommended (non-blocking):**
- Sections 3, 5, 6, 7, 8, 9
