# FieldCore — Developer Source of Truth

**Last reconciled:** 2026-06-09  
**Methodology:** Codebase scanned directly. Where documentation and code conflict, the code wins. Conflicts are noted explicitly.  
**Post-reconciliation:** Sprint Task 1 (multi-tenant isolation audit) completed 2026-06-09. All 27 route files verified. See `DEVELOPMENT_GUARDRAILS.md` for completion record.

---

## Canonical Tech Stack

| Layer | Technology | Version | Location |
|-------|-----------|---------|----------|
| Backend runtime | Node.js | 20+ | `package.json` engines |
| Backend framework | Express | 5.2.1 | `package.json` |
| Database | PostgreSQL | 17 | Port 5433 |
| DB driver | pg | 8.20.0 | `package.json` |
| Auth | jsonwebtoken + bcryptjs | — | `src/middleware/auth.js` |
| Payments | Stripe SDK | 22.1.1 | `package.json` |
| SMS | Twilio SDK | 6.0.2 | `package.json` |
| iMessage/RCS | Sendblue | REST API | `src/services/sendblue.js` |
| Email | Nodemailer | 8.0.7 | `src/services/email.js` |
| AI | Anthropic SDK | 0.98.0 | `package.json` |
| Scheduler | node-cron | 4.2.1 | `src/services/scheduler.js` |
| Rate limiting | express-rate-limit | 8.5.2 | `src/app.js` |
| Frontend framework | React | 19.2.6 | `client/package.json` |
| Frontend bundler | Vite | 8.0.12 | `client/package.json` |
| Frontend router | React Router | 7.15.1 | `client/package.json` |
| Frontend language | TypeScript | 6.0.2 | `client/tsconfig.json` |
| Frontend HTTP | Axios | — | `client/package.json` |
| Calendar | react-big-calendar | 1.19.4 | `client/package.json` |
| Maps (frontend) | Leaflet | 1.9.4 | `client/package.json` |
| Stripe (frontend) | @stripe/react-stripe-js | 6.3.0 | `client/package.json` |
| Mobile framework | React Native (Expo) | 0.81.5 / 54.0.35 | `mobile/package.json` |
| Mobile navigation | React Navigation | — | `mobile/package.json` |
| Mobile payments | @stripe/stripe-react-native | 0.50.3 | `mobile/package.json` |
| Mobile location | expo-location | 19.0.8 | `mobile/package.json` |
| Mobile auth | expo-local-authentication | 17.0.8 | `mobile/package.json` |
| Mobile push | expo-notifications | 0.32.17 | `mobile/package.json` |
| Mobile maps | react-native-maps | 1.20.1 | `mobile/package.json` |
| Mobile signature | react-native-signature-canvas | 4.7.2 | `mobile/package.json` |
| Marketing site | Next.js | 16.2.6 | `landing/package.json` |
| Deployment (backend) | Railway | — | `nixpacks.toml`, `railway.json` |
| Deployment (frontend) | Vercel | — | `client/.vercel/` |
| Deployment (mobile) | Expo Application Services | — | `mobile/eas.json` |

---

## Directory Map (Canonical)

```
C:\Users\Kevin\fieldcore\
│
├── server.js                        Entry point — runs migrations, starts Express, starts cron scheduler
├── .env.example                     All required environment variables (template)
├── .env                             Actual secrets (not committed)
├── package.json                     Backend dependencies
├── nixpacks.toml                    Railway build config
├── railway.json                     Railway project metadata
├── reset_plan.js                    Utility: reset account plan to starter
├── generate_icons.py                Icon generation script
├── FIELDCORE_LAUNCH_AUDIT_REPORT.json  Pre-existing launch checklist
├── .deploy-trigger                  CI/CD trigger file
│
├── src/
│   ├── app.js                       Express app: CORS, rate limiting, helmet, route mounting
│   ├── db/
│   │   ├── pool.js                  pg connection pool
│   │   ├── migrate.js               Migration runner (241 idempotent SQL statements)
│   │   ├── schema.sql               Full schema — 577 lines, 30+ tables, 38 indexes
│   │   └── booking_settings.sql     Booking widget defaults migration
│   ├── middleware/
│   │   ├── auth.js                  requireAuth, requireRole (JWT validation, role injection)
│   │   └── planLimits.js            checkUserLimit, checkJobLimit, checkSmsAccess
│   ├── routes/                      27 files — see Route Map below
│   └── services/
│       ├── email.js                 Nodemailer SMTP, HTML templates
│       ├── sms.js                   Twilio SMS service
│       ├── sendblue.js              Sendblue iMessage/RCS
│       ├── scheduler.js             node-cron: 24h job reminders, deposit expiry alerts
│       ├── notify.js                In-app notification dispatch
│       └── audit.js                 Audit log writer
│
├── scripts/
│   ├── init-db.js                   Seeds initial account + admin user
│   ├── check-data.js                Data validation
│   └── migrate-account.js           Account migration tool
│
├── test/
│   └── smoke.js                     Basic smoke test suite
│
├── client/                          React 19 + Vite frontend
│   ├── src/
│   │   ├── pages/                   38 page components
│   │   ├── components/              13 reusable components
│   │   └── context/AuthContext.jsx  Global auth state
│   ├── vite.config.js
│   ├── tsconfig.json
│   └── vercel.json
│
├── mobile/                          Expo 54 React Native app
│   ├── screens/                     14 screens
│   ├── services/                    notifications.js, storage.js, theme.js
│   ├── api.js                       API client (BASE_URL must be updated for device)
│   ├── App.js                       Navigation root
│   ├── app.json / app.config.js     Expo manifest
│   └── eas.json                     EAS build config
│
└── landing/                         Next.js 16 marketing site
    ├── app/ or pages/               Next.js routes
    ├── next.config.mjs
    └── README.md
```

---

## Route Map (All 27 Backend Route Files)

| File | Mount Path | Key Operations |
|------|-----------|----------------|
| `auth.js` | `/api/auth` | signup, login, refresh, logout, forgot-password, reset-password |
| `jobs.js` | `/api/jobs` | CRUD, status updates, confirmation SMS, no-show marking, recurring jobs |
| `clients.js` | `/api/clients` | CRUD, search, job history, SMS history, Stripe customer linking |
| `invoices.js` | `/api/invoices` | generate, list, PDF export, payment links, email delivery |
| `deposits.js` | `/api/deposits` | track, collect, refund, expiry |
| `payments.js` | `/api/payments` | charge card on file, payment intents |
| `billing.js` | `/api/billing` | subscription management, plan upgrades/downgrades, Stripe billing portal |
| `booking.js` | `/api/booking` | public widget settings, service templates, availability, public booking submission |
| `business-settings.js` | `/api/business-settings` | profile, hours, holidays, logo |
| `fleet.js` | `/api/fleet` | vehicle CRUD |
| `sms.js` | `/api/sms` | send SMS, message history |
| `notifications.js` | `/api/notifications` | list, mark read, clear |
| `onboarding.js` | `/api/onboarding` | account setup steps |
| `pay.js` | `/api/pay` | public payment page (unauthenticated) |
| `contact.js` | `/api/contact` | contact form submissions |
| `beta.js` | `/api/beta` | beta signup (100-slot cap + waitlist) |
| `mobile.js` | `/api/mobile` | mobile-specific endpoints (GPS check-in, photos) |
| `chat.js` | `/api/chat` | AI chat (Anthropic SDK) |
| `portal.js` | `/api/portal` | client portal (magic-link auth, job status) |
| `noshow.js` | `/api/noshow` | no-show settings, grace period, deposit retention |
| `entities.js` | `/api/entities` | multi-entity management (Scale+ only) |
| `connect.js` | `/api/connect` | Stripe Connect (contractor payouts) |
| `phone.js` | `/api/phone` | Twilio voice, call logs, voicemail, number provisioning |
| `estimates.js` | `/api/estimates` | create estimate, e-signature workflow |
| `reviews.js` | `/api/reviews` | post-job reviews (1-5 stars) |
| `push-tokens.js` | `/api/push-tokens` | register Expo push tokens |
| `analytics.js` | `/api/analytics` | revenue metrics, job counts, trends |
| `users.js` | `/api/users` | team member CRUD, role assignment |
| `webhooks.js` | `/api/webhooks` | Stripe event handler, Twilio status callbacks |

---

## Database Schema (Canonical Table List)

See `src/db/schema.sql` (577 lines) for full definitions.

### Core Business Tables
- `accounts` — tenant root (plan, Stripe customer/subscription, account status)
- `users` — team members (role, auth fields, biometric flag)
- `clients` — customer database (contact, tier, Stripe IDs, LTV)
- `jobs` — service appointments (status, scheduling, GPS, recurring, confirmation/reminder flags)
- `invoices` — billing records (linked to jobs, payment status, Stripe payment intent)
- `deposits` — pre-job payment protection (amount, status, expiry, Stripe charge)
- `messages` — SMS/iMessage history (provider, direction, status)
- `fleet_vehicles` — company vehicles

### Auth & Security Tables
- `user_sessions` — JWT token pairs per device (access + refresh)
- `login_attempts` — failed auth attempts (IP, timestamp)
- `password_reset_tokens` — 1-hour expiry reset tokens
- `audit_logs` — security audit trail

### Feature Tables
- `booking_settings` — widget config (services, deposit rules, tax rate, travel fee)
- `service_templates` — reusable service types
- `job_photos` — mobile photo uploads
- `business_profiles` — legal name, EIN, address, logo, timezone, vertical
- `business_hours` — weekly schedule (0=Sun through 6=Sat)
- `holiday_closures` — temporary closures
- `no_show_settings` — grace period, SMS templates, auto-declare config
- `no_show_records` — permanent audit trail
- `estimates` — service quotes with e-signature fields
- `reviews` — post-job ratings
- `notifications` — in-app alerts
- `call_logs` — inbound/outbound call history
- `phone_numbers` — provisioned Twilio numbers per account
- `voicemails` — recordings + transcriptions
- `client_portal_tokens` — magic-link auth tokens

### Platform Tables
- `billing_events` — platform billing history
- `beta_signups` — early access program
- `account_memberships` — multi-entity user↔account links
- `partner_applications` — partner program
- `cancel_reasons` — churn analysis

---

## Environment Variables (Complete List)

Sourced from `.env.example`. All must be set for full functionality.

```
# App
DATABASE_URL
JWT_SECRET                  # min 32 chars
NODE_ENV                    # development | production
PORT                        # default 3000
APP_URL                     # https://your-domain.com

# Admin
ADMIN_ALERT_EMAIL           # brute-force alert recipient
SEED_EMAIL                  # initial admin email
SEED_PASSWORD               # initial admin password

# Stripe
STRIPE_SECRET_KEY
STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_GROWTH         # Stripe price ID for Growth plan
STRIPE_PRICE_SCALE          # Stripe price ID for Scale plan
PLATFORM_FEE_PERCENT        # default 1

# SMS / Messaging
MESSAGING_PROVIDER          # twilio | sendblue
SMS_ENABLED                 # false | true (gate for A2P approval)
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
SENDBLUE_API_KEY_ID
SENDBLUE_API_SECRET_KEY

# Email
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
FROM_EMAIL
CONTACT_EMAIL

# Third-party
VITE_GOOGLE_MAPS_API_KEY    # frontend only
ANTHROPIC_API_KEY

# Beta
BETA_CAP                    # default 100
```

---

## Conflicts / Discrepancies Found During Reconciliation

See `PROJECT_RECONCILIATION_REPORT.md` for the full conflict analysis.

**Summary of key conflicts:**
1. Prior memory said "6 MVP modules complete" — actual codebase has 27 route files covering ~18 distinct feature areas, significantly beyond the original 6-module MVP scope.
2. Prior memory said auth was a "placeholder x-account-id header" — actual code has full JWT implementation in `src/middleware/auth.js` with sessions, refresh tokens, and brute-force protection.
3. Prior memory listed 8 core database tables — actual schema has 30+ tables.
4. Prior memory did not mention: estimates, reviews, phone system (voice/voicemail), AI chat widget, multi-entity (Scale+), client portal, analytics, onboarding flow, audit logging, Stripe Connect, Sendblue, landing site (Next.js), or beta signup system.
