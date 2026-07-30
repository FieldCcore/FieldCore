# FieldCore Dispatch — Google Maps Repair Report

**Date:** 2026-07-30  
**Engineer:** Claude Code (claude-sonnet-4-6)

---

## Confirmed Production Symptom

`https://www.getfieldcore.com/dispatch` showed the FieldCore "Map unavailable" fallback.  
DevTools Network had **zero requests** to `maps.googleapis.com`, `maps.gstatic.com`, or anything related to the Google Maps JavaScript API.

---

## Root Cause — Exact Early-Exit Condition

**`VITE_GOOGLE_MAPS_API_KEY` evaluated to an empty string in the production bundle.**

Both `MapProvider.jsx` and `GoogleMap.jsx` read this variable at module-load time via:

```js
const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
```

When it is empty:

1. **`MapProvider`** hits `if (!API_KEY)` → returns `<>{children}</>` **without `<APIProvider>`**.  
   The Google Maps JavaScript loader is never invoked. No script tag is injected. No network request is made.

2. **`GoogleMap`** hits the same `if (!API_KEY)` check independently → renders the "Map unavailable" div immediately, before React even mounts the map subtree.

There is **no runtime fallback, no retry, no deferred check** — both gates are build-time constants baked by Vite at `npm run build` time. A missing variable at build time produces a hard-coded empty string in the JS bundle.

---

## Framework

| Property | Value |
|---|---|
| **Framework** | Vite + React 18 |
| **Env-var convention** | `VITE_` prefix (Vite-specific) |
| **Previous variable name** | `GOOGLE_MAPS_API_KEY` (no `VITE_` prefix — NOT exposed to browser by Vite) |
| **Correct variable name** | `VITE_GOOGLE_MAPS_API_KEY` |
| **Build-time vs runtime** | **Build-time only** — Vite replaces `import.meta.env.VITE_*` with literal values at `npm run build` |
| **Rebuild required after env change** | **Yes** — changing the Vercel env var without triggering a new deploy has no effect on the live bundle |

**Why the `VITE_` prefix is mandatory:**  
Vite only exposes variables prefixed with `VITE_` to the browser bundle. Variables named without this prefix (e.g. `GOOGLE_MAPS_API_KEY`) are intentionally kept server-side and replaced with `undefined` in the browser build. This is the most common source of "key missing" in Vite production deployments.

---

## Hosting Platform

| Property | Value |
|---|---|
| **Frontend host** | Vercel (`field-core1/field-core-seem`) |
| **Backend host** | Railway (`fieldcore-production-ee0d.up.railway.app`) |
| **Frontend project root** | `client/` directory (Vercel uses `client/vercel.json`) |
| **Build command** | `npm run build` → `tsc && vite build` |
| **Output directory** | `client/dist/` |

---

## Production Variable Status

The variable `VITE_GOOGLE_MAPS_API_KEY` was either:
- Not set in the Vercel project's Production environment, or
- Set under a different name (e.g. `GOOGLE_MAPS_API_KEY` without the `VITE_` prefix), or
- Set after the last build was triggered (Vite bakes at build time — the variable must exist when `npm run build` runs)

The GCP API key exists and billing is active. The failure is entirely in the deployment configuration, not in GCP.

---

## Loader Invocation Behavior

| Condition | APIProvider rendered | Maps script injected | Network request |
|---|---|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` empty | No | No | **None** |
| `VITE_GOOGLE_MAPS_API_KEY` present | Yes | Yes | `maps.googleapis.com` |
| Key present but rejected by GCP | Yes | Yes | Yes — then `gm_authFailure` fires |

---

## Files Changed

### `client/src/maps/mapsConfig.js` (NEW — single config source)

- `getGoogleMapsClientConfig()` — reads and sanitizes `VITE_GOOGLE_MAPS_API_KEY`:
  - Trims whitespace
  - Strips wrapping literal quotes (copy-paste artifact: `"AIzaSy..."` → `AIzaSy...`)
  - Returns `{ apiKey, mapId, libraries, configured, failureReason }`
  - `failureReason` codes: `MAP_CONFIG_MISSING_API_KEY` | `MAP_CONFIG_EMPTY_API_KEY`
  - Logs a warning with exact fix instructions when key is absent
- `maskedKey(apiKey)` — safe display form (first 6 + `…` + last 4 chars, never full key)

### `client/src/maps/MapProvider.jsx` (UPDATED)

- Now uses `getGoogleMapsClientConfig()` instead of reading `import.meta.env` directly
- Dev-only `DevDiagnostics` component: emits `[FieldCore Maps Diagnostics]` console group on every status change — includes config present, masked key, loader state, script present, google global, hostname, skipped reason
- Production `ProdDiagnostics`: logs status/isLoaded/hostname on change (no console.table overhead)
- `gm_authFailure` handler: structured diagnostic with maskedKey, ordered probable causes, CSS injection to suppress Google's native overlay, `fieldcore:maps:auth-failure` CustomEvent dispatch
- Window error/rejection listeners: now filter to maps-related errors only

### `client/src/maps/GoogleMap.jsx` (UPDATED)

- Now uses `getGoogleMapsClientConfig()` instead of reading `import.meta.env` directly
- Uses `useApiLoadingStatus()` from `@vis.gl/react-google-maps`
- Correct 4-state machine:
  1. `!_cfg.configured` → `<MapConfigMissing>` (key absent — not a failure, a build config issue)
  2. `status === 'NOT_LOADED' | 'LOADING'` → `<MapLoading>` (blank `#f5f3ef` placeholder)
  3. `authError` set → `<MapAuthError>` (key rejected or script failed; dev shows diagnostic, prod shows user-safe message; Retry = page reload)
  4. `status === 'LOADED'` → `<Map>` (live map renders)
- Belt-and-suspenders: also sets `authError` directly when `status === 'FAILED'`

### `client/src/maps/index.js` (UPDATED)

- Exports `getGoogleMapsClientConfig` and `maskedKey` from the barrel

### `src/utils/parseMapsApiKey.js` (NEW — CommonJS pure parser)

- Same parsing algorithm as `mapsConfig.js`, expressed in CommonJS for Jest compatibility
- `parseMapsConfig(rawKey, rawMapId)` — pure function, no `import.meta.env`
- `maskedKey(apiKey)` — same masking logic

### `src/tests/mapsConfig.test.js` (NEW — 27 tests)

- Key present / missing / null / empty / whitespace / quoted-whitespace / single-quoted / double-quoted
- Map ID handling (absent, empty, present, trimmed, quoted, doesn't block base-map)
- `maskedKey` — never contains full key, always shorter, shows last 4 chars
- `configured:false` for all invalid-key variants → loader must be skipped

### `src/tests/mapsRepair.test.js` (existing — 14 tests)

- Backend routes: auth guards, missing-key degradation, param validation, key-never-in-response

---

## Fallback State Correction

**Before:** Both `MapProvider` and `GoogleMap` each read `import.meta.env.VITE_GOOGLE_MAPS_API_KEY` independently. A missing variable meant two independent early exits with no diagnostic context.

**After:** Single `getGoogleMapsClientConfig()` call at module load time. Fallback states are named and explicit:
- `MAP_CONFIG_MISSING_API_KEY` → variable undefined at build time
- `MAP_CONFIG_EMPTY_API_KEY` → variable present but blank (or whitespace/quotes only)
- `auth-failure` → key rejected by GCP after script loaded
- `load-failed` → script fetch failed (network error)

The "Map unavailable" UI never appears unless one of these confirmed conditions is true.

---

## Redeployment Steps (Operator)

These steps must be performed in the Vercel Dashboard — they cannot be done from code:

### Step 1 — Add the environment variable

1. Open [vercel.com](https://vercel.com) → Select project **field-core-seem** (field-core1)
2. Go to **Settings → Environment Variables**
3. Click **Add New**
4. Fill in:
   - **Name:** `VITE_GOOGLE_MAPS_API_KEY`  ← exact name, `VITE_` prefix required
   - **Value:** paste your GCP Maps API key (no quotes, no extra spaces)
   - **Environment:** check **Production** (also check Preview/Development if desired)
5. Click **Save**

> **Common mistakes:**
> - Using `GOOGLE_MAPS_API_KEY` (no `VITE_` prefix) — Vite ignores it in browser bundles
> - Pasting the key with surrounding quotes: `"AIzaSy..."` — the config helper now strips these, but best to avoid
> - Checking only "Development" scope, not "Production"

### Step 2 — Trigger a Production redeploy

After saving the env var, the existing deployed bundle is unchanged. A new build is required:

```sh
# From the fieldcore project root
npx vercel --prod
```

Or in the Vercel Dashboard: **Deployments → most recent → ⋯ → Redeploy** (use "Redeploy without cache" to be safe).

### Step 3 — Hard refresh and verify

1. Open `https://www.getfieldcore.com/dispatch` in a new incognito window
2. Open DevTools → Network tab → filter by `maps`
3. Reload the page
4. Confirm a request appears to `maps.googleapis.com/maps/api/js`
5. Confirm the map renders

### Step 4 — GCP Referrer restrictions (if map still fails after step 3)

If the script loads but `gm_authFailure` fires (console shows `[MapProvider] gm_authFailure`):

1. Open GCP Console → APIs & Services → **Credentials** → select the key
2. Under **Application restrictions → HTTP referrers**, add:
   ```
   https://getfieldcore.com/*
   https://www.getfieldcore.com/*
   ```
3. Under **API restrictions**, ensure **Maps JavaScript API** is allowed
4. Save and wait ~5 minutes for propagation

---

## Test Results

```
Test Suites: 8 passed, 8 total
Tests:       235 passed, 235 total  (27 new in mapsConfig.test.js)
```

Frontend build: clean (`tsc && vite build`, 7.47s, no errors)

---

## Security Constraints Preserved

- Raw API key is never logged (masked: first 6 chars + `…` + last 4 chars)
- `GOOGLE_MAPS_API_KEY` (Railway/backend) is never exposed through any public variable or API response
- `VITE_GOOGLE_MAPS_API_KEY` appears only in the Maps JS script URL injected by the `@vis.gl/react-google-maps` library — this is the expected and required behavior for client-side Maps
- No key is written to browser storage by FieldCore code
