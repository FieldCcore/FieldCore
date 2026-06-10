# FieldCore — Claude Code Onboarding Guide

**Last reconciled:** 2026-06-09 (updated post Sprint Task 1)  
**Source of truth:** Actual codebase (not prior documentation)

---

## What Is FieldCore?

FieldCore is a multi-tenant SaaS platform for service businesses (HVAC, plumbing, electrical, cleaning, etc.). It lets operators manage clients, schedule jobs, collect payments, dispatch technicians, and automate customer communications.

**Business model:** Monthly subscription (Starter/Growth/Scale plans) + 1% platform fee on payments processed through the app.

---

## Quick Start — Running the App

### Prerequisites
- Node.js 20+
- PostgreSQL 17 on port 5433, password: `fieldcore123`
- `.env` file at `C:\Users\Kevin\fieldcore\.env` (copy from `.env.example`)

### Start All Services

```bash
# Backend API (port 3000)
cd C:\Users\Kevin\fieldcore
node server.js

# Web Frontend (port 5173)
cd C:\Users\Kevin\fieldcore\client
npm run dev

# Mobile App (Expo)
cd C:\Users\Kevin\fieldcore\mobile
npx expo start

# Marketing Site (Next.js, port 3001+)
cd C:\Users\Kevin\fieldcore\landing
npm run dev
```

### Database
```bash
# Initialize DB with seed data
node scripts/init-db.js

# Migrations run automatically on server start (src/db/migrate.js)
```

---

## Project Layout

```
fieldcore/
├── src/                    Backend (Node.js + Express)
│   ├── app.js              Express app configuration
│   ├── routes/             27 API route files
│   ├── middleware/         auth.js, planLimits.js
│   ├── services/           email, sms, sendblue, scheduler, notify, audit
│   └── db/                 pool.js, migrate.js, schema.sql
├── client/                 Web frontend (React 19 + Vite + TypeScript)
│   └── src/
│       ├── pages/          42 page components
│       ├── components/     13 reusable components
│       └── context/        AuthContext.jsx
├── mobile/                 React Native app (Expo 54)
│   └── screens/            14 screens
├── landing/                Marketing site (Next.js 16)
├── scripts/                DB init, migrations, data tools
├── server.js               Entry point
├── .env.example            Required environment variables
├── nixpacks.toml           Railway deployment config
└── railway.json            Railway project metadata
```

---

## Architecture Overview

### Multi-Tenancy
Every database record is scoped to `account_id`. All API routes extract `accountId` from the JWT and apply it to every query. There is no cross-tenant data leakage by design.

**Isolation audit status:** COMPLETE (2026-06-09, Sprint Task 1). All 27 route files verified. Security fixes applied to `users.js`, `clients.js`, `jobs.js`, `deposits.js`, `payments.js`.

### Authentication
- **JWT-based:** 15-minute access tokens + 7-day refresh tokens
- Tokens stored in `user_sessions` table (one per device)
- Failed login attempts tracked in `login_attempts` (IP-based rate limiting)
- Brute-force lockout after threshold; alerts sent to `ADMIN_ALERT_EMAIL`
- `requireAuth` middleware: validates Bearer token, injects `req.userId`, `req.accountId`, `req.userRole`
- `requireRole(...roles)` middleware: enforces owner/manager/tech/staff access levels

### Plan Tiers (`src/middleware/planLimits.js`)
| Plan | Users | Jobs/Month | SMS | Price |
|------|-------|-----------|-----|-------|
| Starter | 2 | 50 | No | Free/low |
| Growth | 10 | Unlimited | Yes | Mid |
| Scale | Unlimited | Unlimited | Yes | High |

### Key Third-Party Services
| Service | Purpose | Env Keys |
|---------|---------|----------|
| Stripe | Subscriptions + payment processing | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Stripe Connect | Contractor payouts | `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_SCALE` |
| Twilio | SMS + voice/phone system | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` |
| Sendblue | iMessage/RCS (Phase 2) | `SENDBLUE_API_KEY_ID`, `SENDBLUE_API_SECRET_KEY` |
| Anthropic | AI chat widget | `ANTHROPIC_API_KEY` |
| Google Maps | Address autocomplete | `VITE_GOOGLE_MAPS_API_KEY` |
| SMTP | Email (confirmations, reminders, invoices) | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` |

---

## Database Tables (30+)

Core: `accounts`, `users`, `clients`, `jobs`, `invoices`, `deposits`, `messages`, `fleet_vehicles`

Auth/Security: `user_sessions`, `login_attempts`, `password_reset_tokens`, `audit_logs`

Features: `booking_settings`, `business_profiles`, `business_hours`, `holiday_closures`, `service_templates`, `job_photos`, `no_show_settings`, `no_show_records`, `estimates`, `reviews`, `notifications`, `call_logs`, `phone_numbers`, `voicemails`

Platform: `billing_events`, `beta_signups`, `client_portal_tokens`, `account_memberships`, `partner_applications`, `cancel_reasons`

---

## API Patterns

- All routes: `GET/POST/PUT/DELETE /api/[resource]`
- Auth header: `Authorization: Bearer <jwt>`
- Account isolation: automatic via `requireAuth` middleware
- Error shape: `{ error: "message" }`
- Success shape: varies by endpoint (usually the resource or `{ success: true }`)
- Webhooks: `/api/webhooks/stripe`, `/api/webhooks/twilio` (raw body parsing required)

---

## Deployment

- **Backend + DB:** Railway (`nixpacks.toml`, `railway.json`)
- **Frontend:** Vercel (`client/.vercel/`, `client/vercel.json`)
- **Landing:** Vercel (separate Vercel project)
- **Mobile:** Expo Application Services (`mobile/eas.json`)

---

## What Still Needs Real Credentials

1. `STRIPE_SECRET_KEY` — currently placeholder
2. `TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER` — currently placeholder
3. `SMTP_*` — currently placeholder (email logs to console in dev)
4. `ANTHROPIC_API_KEY` — needed for AI chat widget
5. `VITE_GOOGLE_MAPS_API_KEY` — needed for address autocomplete
6. `SMS_ENABLED=true` — gated until Twilio A2P 10DLC approval
7. `APP_URL` — must be set to real domain after deploy
8. `BASE_URL` in `mobile/api.js` — must be updated to real API URL for device testing

---

## Known Architectural Constraints

- `MESSAGING_PROVIDER` env var switches between `twilio` and `sendblue` — only one active at a time
- Stripe Connect is implemented but requires a live Stripe account with Connect enabled
- Beta signup is capped at 100 active slots (`BETA_CAP=100`); waitlist logic beyond that
- SMS is globally disabled (`SMS_ENABLED=false`) until A2P 10DLC campaign approval
- Google Maps address autocomplete is frontend-only; backend does not geocode

---

## Running Tests

```bash
# Smoke tests
node test/smoke.js

# Data validation
node scripts/check-data.js
```

No unit test suite exists yet (see TECHNICAL_DEBT_REPORT.md).
