# FieldCore Environment Variables

**Generated:** 2026-07-03  
**Source:** grep on `src/**/*.js` + `client/src/**` + `.env.example` audit

---

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | Documented in `.env.example` |
| ⚠️ | Referenced in code but NOT documented in `.env.example` |
| 📋 | In `.env.example` only — not referenced by backend server code (client-side or ops) |
| 🔴 | Must be set in Railway before launch |
| 🟡 | Should be set; feature degrades gracefully without it |
| ⬜ | Optional / dev-only |

---

## Core Infrastructure

| Variable | Status | Runtime | Notes |
|---|---|---|---|
| `DATABASE_URL` | ✅ 🔴 | Railway | PostgreSQL connection string. Required at startup. |
| `NODE_ENV` | ✅ | Railway | `production` in prod. Affects error verbosity, cookie flags. |
| `PORT` | ✅ | Railway | Default 3000. Railway sets this automatically. |
| `APP_URL` | ✅ 🔴 | Railway | Public-facing URL. Controls CORS allowed-origins list — www variant derived automatically. Also used in estimate signing links. |
| `JWT_SECRET` | ✅ 🔴 | Railway | Must be ≥32 chars. Changing this invalidates all active sessions. |

---

## Admin & Security

| Variable | Status | Runtime | Notes |
|---|---|---|---|
| `ADMIN_EMAILS` | ✅ 🔴 | Railway | Comma-separated. First address receives cancellation emails. All addresses can access `/api/billing/admin-metrics`. Set both `admin@getfieldcore.com` and personal email. |
| `ADMIN_ALERT_EMAIL` | ✅ 🟡 | Railway | Single address for security alerts (brute force, errors) via `audit.js`. Separate from `ADMIN_EMAILS` — both should be set. |

---

## Stripe

| Variable | Status | Runtime | Notes |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | ✅ 🔴 | Railway | `sk_live_...` for production. Currently test key. Swap when Stripe account verified. |
| `STRIPE_PUBLISHABLE_KEY` | 📋 🔴 | Vercel | `pk_live_...`. Used client-side in Stripe.js (not backend). Must match `STRIPE_SECRET_KEY` mode. |
| `STRIPE_WEBHOOK_SECRET` | ✅ 🔴 | Railway | `whsec_...` from Stripe dashboard. Required for webhook signature verification. |
| `STRIPE_PRICE_SOLO` | ✅ 🔴 | Railway | `price_...` for Solo monthly plan. Must be live price ID in production. |
| `STRIPE_PRICE_PRO` | ✅ 🔴 | Railway | `price_...` for Pro monthly plan. |
| `STRIPE_PRICE_SCALE` | ✅ 🔴 | Railway | `price_...` for Scale monthly plan. |
| `PLATFORM_FEE_PERCENT` | ✅ 🟡 | Railway | Platform fee on Stripe Connect transactions. Default `1` (1%). Set even if Connect not active yet. |

---

## Messaging

| Variable | Status | Runtime | Notes |
|---|---|---|---|
| `MESSAGING_PROVIDER` | ✅ 🟡 | Railway | `twilio` (default) or `sendblue`. Controls outbound client message routing. |
| `SMS_ENABLED` | ✅ 🟡 | Railway | `false` by default. Flip to `true` after A2P 10DLC approval. |
| `TWILIO_ACCOUNT_SID` | ✅ 🔴 | Railway | `AC...` from console.twilio.com. Required for voice regardless of SMS status. |
| `TWILIO_AUTH_TOKEN` | ✅ 🔴 | Railway | From console.twilio.com. |
| `TWILIO_PHONE_NUMBER` | ✅ 🔴 | Railway | `+1...` format. The purchased Twilio number for inbound/outbound. |
| `SENDBLUE_API_KEY_ID` | ✅ ⬜ | Railway | Only needed if `MESSAGING_PROVIDER=sendblue`. Phase 2. |
| `SENDBLUE_API_SECRET_KEY` | ✅ ⬜ | Railway | Only needed if `MESSAGING_PROVIDER=sendblue`. Phase 2. |

---

## Email (SMTP)

| Variable | Status | Runtime | Notes |
|---|---|---|---|
| `SMTP_HOST` | ✅ 🔴 | Railway | SMTP server hostname. E.g. `smtp.resend.com`, `smtp.sendgrid.net`. If unset, emails log to console only — no sends. |
| `SMTP_PORT` | ✅ 🔴 | Railway | Typically `587` (STARTTLS) or `465` (SSL). |
| `SMTP_USER` | ✅ 🔴 | Railway | SMTP username or API key depending on provider. |
| `SMTP_PASS` | ✅ 🔴 | Railway | SMTP password or API secret. |
| `FROM_EMAIL` | ✅ 🔴 | Railway | Sender address in all outbound emails. Must be verified with SMTP provider. |

---

## File Storage (Cloudflare R2 / AWS S3)

| Variable | Status | Runtime | Notes |
|---|---|---|---|
| `R2_ENDPOINT` | ✅ 🟡 | Railway | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. Omit for AWS S3. |
| `R2_ACCESS_KEY_ID` | ✅ 🟡 | Railway | R2 API token access key. |
| `R2_SECRET_ACCESS_KEY` | ✅ 🟡 | Railway | R2 API token secret. |
| `R2_BUCKET` | ✅ 🟡 | Railway | Bucket name. Default in example: `fieldcore-uploads`. |
| `R2_PUBLIC_URL` | ✅ 🟡 | Railway | Public base URL for uploaded files. Required for signed photo URLs to resolve. |
| `R2_REGION` | ✅ 🟡 | Railway | `auto` for R2. AWS region (e.g. `us-east-1`) for S3. |

---

## AI / Chat

| Variable | Status | Runtime | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ 🟡 | Railway | `sk-ant-...` from console.anthropic.com. Required for the AI chat widget. App loads without it but chat fails. |

---

## Client / Frontend

| Variable | Status | Runtime | Notes |
|---|---|---|---|
| `VITE_API_URL` | ✅ 🔴 | Vercel | Backend origin for web dashboard. Set in `client/.env` for local dev. Set in Vercel env for production. |
| `VITE_GOOGLE_MAPS_API_KEY` | ✅ 🟡 | Vercel | `AIzaSy...` for operator dashboard map view. App loads without it; map component will not render. |

---

## Mobile App

| Variable | Status | Runtime | Notes |
|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | ✅ 🔴 | EAS Build | Baked into Expo binary at build time. Must be set before `eas build`. Cannot change post-distribution. |

---

## Beta / Marketing

| Variable | Status | Runtime | Notes |
|---|---|---|---|
| `BETA_CAP` | ✅ ⬜ | Railway | Max beta signups. Default `100`. Increase as needed. |
| `CONTACT_EMAIL` | ✅ ⬜ | Railway | Used in marketing/contact page email references. |

---

## Database Seeding

| Variable | Status | Runtime | Notes |
|---|---|---|---|
| `SEED_EMAIL` | 📋 ⬜ | Local only | Admin account email for `npm run db:init`. |
| `SEED_PASSWORD` | 📋 ⬜ | Local only | Admin account password for `npm run db:init`. |
| `SEED_SECRET` | ✅ ⬜ | Local only | Referenced in `auth.js` to protect the seed endpoint. Dev-only; do not set in Railway. |

---

## Undocumented Variables

None. All variables referenced in code are documented in `.env.example`.

---

## Railway Environment Variables Checklist

Variables that must be set in Railway before launch (copy this list):

```
DATABASE_URL
NODE_ENV=production
APP_URL=https://www.getfieldcore.com
JWT_SECRET=<32+ char random string>
ADMIN_EMAILS=admin@getfieldcore.com,kevincaines925@gmail.com
ADMIN_ALERT_EMAIL=admin@getfieldcore.com
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_SOLO=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_SCALE=price_...
PLATFORM_FEE_PERCENT=1
MESSAGING_PROVIDER=twilio
SMS_ENABLED=false
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
FROM_EMAIL=noreply@getfieldcore.com
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=fieldcore-uploads
R2_PUBLIC_URL=https://...
R2_REGION=auto
ANTHROPIC_API_KEY=sk-ant-...
BETA_CAP=100
CONTACT_EMAIL=info@getfieldcore.com
```

## Vercel Environment Variables Checklist

```
VITE_API_URL=https://your-railway-backend.up.railway.app
VITE_GOOGLE_MAPS_API_KEY=AIzaSy...
STRIPE_PUBLISHABLE_KEY=pk_live_...
```

---

## Variable Count Summary

| Category | Count |
|---|---|
| Core infrastructure | 5 |
| Admin / security | 2 |
| Stripe | 7 |
| Messaging (Twilio + Sendblue) | 7 |
| Email (SMTP) | 5 |
| File storage (R2) | 6 |
| AI / chat | 1 |
| Frontend (Vite) | 2 |
| Mobile (Expo) | 1 |
| Beta / marketing | 2 |
| Seeding (local only) | 3 |
| **Total** | **41** |
| Undocumented (action needed) | 0 |
