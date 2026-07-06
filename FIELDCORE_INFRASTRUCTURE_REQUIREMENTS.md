# FieldCore Infrastructure Requirements

**Generated:** 2026-07-03  
**Scope:** All integrations referenced in `src/**/*.js`, `client/src/**`, `.env.example`

---

## Integration Status Table

| Integration | Status | Required Before Launch | Env Vars Needed | Implementation Complete | Priority |
|---|---|---|---|---|---|
| **PostgreSQL** | ✅ Live on Railway | Yes | `DATABASE_URL` | Yes | P0 — Core |
| **Stripe (Payments)** | ⚠️ Test mode / verification pending | Yes | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_SOLO`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_SCALE` | Yes — code complete | P0 — Revenue blocker |
| **SMTP / Email** | ⚠️ No credentials configured | Yes | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL` | Yes — code complete | P0 — Estimates, invoices, alerts |
| **Twilio (SMS + Voice)** | 🔴 A2P 10DLC pending | No (blocked external) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | Yes — code complete | P0 when unblocked |
| **Cloudflare R2 (Photos)** | ⚠️ Bucket not configured | Yes | `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`, `R2_REGION` | Yes — code complete (P0-007) | P1 — Job photo uploads |
| **Sendblue (SMS fallback)** | ⚠️ API keys not set | No (optional) | `SENDBLUE_API_KEY_ID`, `SENDBLUE_API_SECRET_KEY` | Yes — code complete | P1 — SMS redundancy |
| **Anthropic / AI Chat** | ⚠️ API key not set | No | `ANTHROPIC_API_KEY` | Yes — code exists | P2 — Chat assistant |
| **Google Maps** | ⚠️ API key not set | No | `VITE_GOOGLE_MAPS_API_KEY` | Yes — used in operator dashboard map | P2 — Operator map view |
| **Stripe Connect** | ⚠️ Partial | No | `PLATFORM_FEE_PERCENT` | Partial — fee logic exists, full Connect onboarding not built | P2 — Contractor payouts |
| **Sentry** | ❌ Not implemented | No | None found | No | P3 — Error monitoring |
| **Analytics** | ❌ Not implemented | No | None found | No | P3 — Usage tracking |

---

## Launch Blockers (Must Resolve Before First Paying Customer)

### 1. Stripe Verification
- **Current state:** Test mode. Checkout and webhooks are fully implemented.
- **Action required:** Complete Stripe account verification → switch to live keys → set `STRIPE_PRICE_SOLO`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_SCALE` to live price IDs in Railway.
- **Risk if skipped:** No revenue can be collected.

### 2. SMTP Email
- **Current state:** `email.send()` wrapper is complete. No sending credentials configured.
- **Action required:** Provision SMTP credentials (e.g., Resend, SendGrid, AWS SES, or Postmark) → set all five `SMTP_*` vars in Railway.
- **Risk if skipped:** Estimate emails, invoice emails, admin cancellation alerts, and welcome emails all fail silently.

### 3. Cloudflare R2 (if photo uploads needed at launch)
- **Current state:** Storage service is implemented and wired to job photo upload endpoint (P0-007).
- **Action required:** Create R2 bucket → set all six `R2_*` vars in Railway.
- **Risk if skipped:** Job photo uploads return 500. All other features unaffected.

---

## External Blockers (No Code Action Available)

| Integration | Blocker | Affects |
|---|---|---|
| Twilio SMS | A2P 10DLC campaign approval pending | P0-006, P1-007 (voicemail), P1-008 (phone numbers) |
| Twilio Voice | Depends on A2P approval | Phone number routing, call log, voicemail transcription |
| Stripe Connect | Full onboarding flow not built | Contractor payout splitting |

---

## Optional / Post-Launch Integrations

| Integration | What it enables | Effort |
|---|---|---|
| Sendblue | SMS redundancy when Twilio is unavailable | Already wired — just set API keys |
| Sentry | Runtime error monitoring, stack traces in production | ~2 hours — add `@sentry/node` + `@sentry/react`, wrap app |
| Google Analytics / PostHog | Usage metrics, funnel analysis | ~1 hour — add tracking script to `index.html` |
| Stripe Connect (full) | Automated contractor payouts with platform fee split | ~1 sprint — Connect onboarding flow, payout schedule UI |

---

## Mobile App

The React Native / Expo mobile app references `EXPO_PUBLIC_API_URL`. The mobile app is a separate build — no Railway/Vercel deploy; distributed via TestFlight / Play Store or `expo start`. It requires the backend to be live at a stable URL before it can connect.

---

## Status Summary

| Category | Count |
|---|---|
| Live and working | 1 (PostgreSQL) |
| Code complete, needs env vars / credentials | 5 (Stripe, Email, R2, Sendblue, Anthropic) |
| Blocked by external approval | 2 (Twilio SMS, Twilio Voice) |
| Partially implemented | 1 (Stripe Connect) |
| Not yet implemented | 2 (Sentry, Analytics) |
