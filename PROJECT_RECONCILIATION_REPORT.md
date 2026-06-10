# FieldCore — Project Reconciliation Report

**Last reconciled:** 2026-06-09  
**Method:** Prior documentation (memory file dated 2026-05-16) compared against direct codebase scan (2026-06-09)  
**Rule:** Codebase is the source of truth. Documentation describes what was believed to be true at a point in time. Conflicts are documented without removing code.

---

## What Prior Documentation Said

The memory file from 2026-05-16 described:

- **6 MVP modules:** Client Database, Job Scheduling, Stripe Payments, Tech Mobile App, Automated SMS, Online Booking Widget
- **Status:** "ALL 6 MVP MODULES COMPLETE"
- **Auth:** "Placeholder — needs JWT implementation" (using `x-account-id` header)
- **Database tables (8):** accounts, users, clients, jobs, invoices, deposits, messages, fleet_vehicles
- **Key extras added during build:** recurring, confirmation/reminder sent flags on jobs; stripe IDs on clients; `job_photos` table
- **Running services:** API port 3000, Web port 5173, Mobile Expo
- **Pending credentials:** Stripe keys, Twilio keys, mobile BASE_URL

---

## What the Codebase Actually Contains

The codebase contains significantly more than documented. Key findings:

### 1. Auth — MAJOR CONFLICT

**Docs said:** Placeholder `x-account-id` header, JWT not implemented  
**Code has:** Full JWT implementation — `src/middleware/auth.js` with `requireAuth` and `requireRole`. Database tables `user_sessions` (JWT pairs, one per device), `login_attempts` (brute-force tracking), `password_reset_tokens` (1-hour expiry), `audit_logs` (security trail). Auth routes: signup, login, token refresh, logout, forgot-password, reset-password.  
**Verdict:** Auth is fully implemented. Documentation was outdated at the time of the scan.

---

### 2. Database Tables — MAJOR CONFLICT

**Docs said:** 8 tables (accounts, users, clients, jobs, invoices, deposits, messages, fleet_vehicles) + job_photos added  
**Code has:** 30+ tables  
**Tables in code not in docs:**
- `password_reset_tokens`
- `user_sessions`
- `login_attempts`
- `audit_logs`
- `booking_settings`
- `service_templates`
- `business_profiles`
- `business_hours`
- `holiday_closures`
- `no_show_settings`
- `no_show_records`
- `billing_events`
- `beta_signups`
- `client_portal_tokens`
- `account_memberships`
- `partner_applications`
- `cancel_reasons`
- `phone_numbers`
- `call_logs`
- `voicemails`
- `estimates`
- `reviews`
- `notifications`
- `push_tokens` (referenced in routes)
- `entities` (referenced in routes)

**Verdict:** Database is 3-4x larger than documented. All extra tables appear intentional and are referenced by route files.

---

### 3. Features Beyond 6-Module MVP — SIGNIFICANT EXPANSION

**Docs said:** 6 MVP modules only  
**Code has:** 27 backend route files covering ~20+ distinct feature areas

**Features in code not in docs:**
| Feature | Route File | Database |
|---------|-----------|----------|
| Deposits & Payment Protection | `deposits.js` | `deposits` (also in docs, but not as a separate feature) |
| Estimates with E-Signature | `estimates.js` | `estimates` |
| No-Show Tracking & Clock | `noshow.js` | `no_show_settings`, `no_show_records` |
| Business Phone System (Voice) | `phone.js` | `phone_numbers`, `call_logs`, `voicemails` |
| Client Portal (Magic Link) | `portal.js` | `client_portal_tokens` |
| AI Chat Widget (Anthropic) | `chat.js` | N/A |
| Multi-Entity Management | `entities.js` | `account_memberships` |
| Post-Job Reviews | `reviews.js` | `reviews` |
| Push Notifications | `push-tokens.js`, `notifications.js` | `notifications` |
| Analytics & Revenue | `analytics.js` | Queries existing tables |
| Billing & Subscriptions | `billing.js` | `billing_events` |
| Stripe Connect | `connect.js` | `accounts` (connect fields) |
| Onboarding Flow | `onboarding.js` | `business_profiles` |
| Beta Signup System | `beta.js` | `beta_signups` |
| Business Settings (full) | `business-settings.js` | `business_profiles`, `business_hours`, `holiday_closures` |
| Audit Logging | (service) | `audit_logs` |

**Verdict:** The project expanded well beyond the original 6-module MVP during development. All these features appear to be implemented code, not stubs.

---

### 4. Plan Tier System — NOT DOCUMENTED

**Docs said:** Nothing about a tiered subscription model  
**Code has:** Three-tier plan system (Starter/Growth/Scale) enforced in `src/middleware/planLimits.js` with:
- Starter: 2 users, 50 jobs/month, no SMS
- Growth: 10 users, unlimited jobs, SMS enabled
- Scale: unlimited users, unlimited jobs, SMS enabled, multi-entity

**Verdict:** A complete subscription tier enforcement system exists that was not documented.

---

### 5. Marketing / Landing Site — NOT DOCUMENTED

**Docs said:** Nothing about a separate marketing site  
**Code has:** `landing/` — a complete Next.js 16 marketing site with public pages (About, Blog, Careers, Contact, FAQ, Partners, Press, Terms, Privacy, SMS Terms, Updates)

**Verdict:** A full marketing website exists as a separate app, entirely undocumented.

---

### 6. Deployment Config — NOT DOCUMENTED (but present in code)

**Docs said:** Nothing about deployment targets  
**Code has:** `nixpacks.toml` + `railway.json` (Railway backend), `client/.vercel/` + `client/vercel.json` (Vercel frontend), `mobile/eas.json` (Expo Application Services)

**Verdict:** Deployment infrastructure is already configured for Railway + Vercel + EAS.

---

### 7. Sendblue (iMessage/RCS) — NOT DOCUMENTED

**Docs said:** Twilio only  
**Code has:** `src/services/sendblue.js` — a complete Sendblue iMessage/RCS integration as an alternative messaging provider, switchable via `MESSAGING_PROVIDER` env var

**Verdict:** A second messaging provider integration exists.

---

### 8. Mobile Screens — PARTIALLY CORRECT

**Docs said:** Login, job queue, GPS check-in, mark complete, photos, ETA SMS  
**Code has:** 14 screens — the documented ones plus: `ScheduleScreen.js`, `SearchScreen.js`, `DispatchScreen.js`, `MessagesScreen.js`, `AccountScreen.js`, `SignatureScreen.js`, `InvoiceScreen.js`, `MoreScreen.js`, `TimesheetScreen.js`

**Verdict:** Mobile is more complete than documented. `TimesheetScreen.js` is a notable addition — timesheet tracking is not in any route file (potential orphan screen).

---

### 9. Service Templates — NOT DOCUMENTED

**Docs said:** Nothing  
**Code has:** `service_templates` table and referenced in `booking.js` routes — pre-defined service types with duration, buffer time, and price for the booking widget

**Verdict:** Service template system exists.

---

## What Is Missing From The Codebase

These items were discussed or implied but not found:

| Item | Expected Location | Status |
|------|------------------|--------|
| Real Stripe credentials | `.env` | Missing — placeholder |
| Real Twilio credentials | `.env` | Missing — placeholder |
| SMTP credentials | `.env` | Missing — placeholder |
| Google Maps API key | `.env` | Missing — placeholder |
| Anthropic API key | `.env` | Missing — placeholder |
| Production domain | `APP_URL` in `.env` | Missing |
| Unit tests | `test/` | Only `smoke.js` exists |
| Integration tests | `test/` | None |
| Admin dashboard | `client/src/pages/` | No admin panel found |
| Timesheet backend | `src/routes/` | Screen exists, route unclear |
| Real blog content | `landing/` | Likely placeholder content |
| Real Terms of Service | `landing/` | Likely placeholder |

---

## What Is Outdated

| Item | Old State (from docs) | Current State (from code) |
|------|----------------------|--------------------------|
| Auth system | Placeholder `x-account-id` header | Full JWT with sessions and brute-force protection |
| Database table count | 8 tables | 30+ tables |
| MVP scope | 6 modules | ~20+ feature areas implemented |
| Feature status | "All 6 modules complete" | Substantially true, plus much more; most are blocked by unconfigured credentials |

---

## What Is Duplicated

1. **AGENTS.md and CLAUDE.md** — Both `mobile/AGENTS.md` + `mobile/CLAUDE.md` and `landing/AGENTS.md` + `landing/CLAUDE.md` exist. `CLAUDE.md` in each case just points to `AGENTS.md`. Harmless but redundant.

2. **`.env` files** — Multiple `.env.example` files (root, client). The client's env file only contains frontend-specific keys. This is intentional but should be documented explicitly.

---

## What Contradicts Itself

1. **"All 6 MVP modules complete" vs. blocked credentials** — The memory file says all 6 modules are complete, but M3 (Stripe Payments), M5 (Automated SMS), and M6 (Online Booking Widget) all require third-party credentials that are not configured. They are code-complete but not functionally complete.

2. **Timesheet screen vs. no timesheet route** — `mobile/screens/TimesheetScreen.js` implies timesheet tracking, but no `/api/timesheet` route or `timesheets` table appears in the scan. Either the screen is a stub, or the backend is in an unexpected location.

3. **Beta cap logic** — `BETA_CAP=100` is in the env template, but it's unclear whether a hard 100-slot cap is the intended business logic or just the initial setting. The `beta.js` route implements the cap, but the business decision to hard-cap at 100 is not documented.

---

## Reconciliation Conclusion

**The codebase is 3-4x more developed than the last written documentation suggested.** The 6-module MVP was completed and then significantly extended with enterprise features (multi-entity, voice system, estimates, reviews, client portal, AI chat, etc.) and infrastructure (auth, billing, audit logging, onboarding, beta program, marketing site).

**Nothing has been deleted or modified during this reconciliation.** All findings are documented only. The next step is for the team to review `NEXT_DEVELOPMENT_TASKS.md` and approve what to work on next.
