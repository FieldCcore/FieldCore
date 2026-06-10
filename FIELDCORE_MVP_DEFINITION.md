# FieldCore — MVP Definition

**Last updated:** 2026-06-09  
**Source:** Actual codebase scan + founder intent  
**Purpose:** Define exactly what must exist before the first paying customer. Nothing outside Part 2 should be built in any pre-launch session.

---

## Part 1 — MVP Philosophy

The MVP goal is: **one paying operator can sign up, onboard their business, schedule jobs, send invoices, collect a payment, and dispatch technicians — all without FieldCore touching the transaction.**

The MVP is NOT a demo. It is the minimum that a real service business would pay for and not immediately cancel. That bar is:
- It saves them time versus their current tool stack
- It doesn't lose their data
- It doesn't break in front of a customer
- It handles money correctly

---

## Part 2 — What IS In the MVP (Must Be Complete Before First Paying Customer)

### Core Workflow (Non-Negotiable)

**Authentication & Accounts**
- [x] Email-based login (magic link or password) — built: password + JWT
- [x] Multi-tenant isolation (one account cannot see another's data)
- [x] User roles: owner, manager, tech, staff
- [x] Session management (JWT + refresh tokens)
- [x] Password reset via email

**Client Database**
- [x] Create, read, update, delete clients
- [x] Client profile with contact info, tier, notes
- [x] LTV tracking
- [x] Client job history

**Job Scheduling**
- [x] Create, edit, cancel jobs
- [x] Assign technician to job
- [x] Job status: pending → scheduled → in-progress → complete → cancelled
- [x] Calendar view
- [x] Recurring job support

**Invoicing & Payments**
- [x] Auto-generate invoice on job completion
- [x] Send invoice to client (email)
- [x] Client pays via Stripe Checkout (public payment page)
- [x] Card-on-file payment (charge saved card)
- [x] Deposit collection via booking widget
- [x] Invoice PDF export
- [ ] ⚠️ Requires real Stripe keys (currently placeholder)

**Technician Mobile App**
- [x] Job queue (today's assigned jobs)
- [x] Job detail with client info
- [x] GPS check-in
- [x] Photo capture + upload
- [x] Mark job complete
- [x] View messages
- [x] Signature capture
- [ ] ⚠️ Requires EAS build + API URL fix before distribution

**Online Booking Widget**
- [x] Public booking page per account (no auth required for client)
- [x] 3-step booking form: service, date/time, client info
- [x] Deposit collection via Stripe Checkout
- [x] Booking confirmation (email + SMS when enabled)
- [x] Admin booking settings (services, hours, deposit rules)

**SMS Automation**
- [x] Job confirmation SMS
- [x] 24-hour reminder SMS
- [x] No-show SMS
- [x] ETA SMS (from mobile app)
- [x] Manual SMS to client
- [ ] ⚠️ SMS disabled until Twilio A2P 10DLC approved (3–7 business days)

**Business Settings**
- [x] Business profile (name, logo, address, phone)
- [x] Operating hours
- [x] Holiday closures
- [x] Service types / verticals
- [x] Timezone

**Team Management**
- [x] Invite technicians
- [x] Role assignment
- [x] Per-plan user limits enforced
- [x] Availability toggle (tech is available/unavailable)

**Analytics**
- [x] Revenue dashboard (MTD, YTD, trends)
- [x] Job count and completion rate
- [x] Top clients by LTV

**Subscription Billing**
- [x] Stripe Subscriptions integration (code complete)
- [x] Plan upgrade/downgrade
- [x] Billing history
- [x] Plan limit enforcement (user cap, job cap, SMS gate)
- [ ] ⚠️ Requires real Stripe account + price IDs configured

**Deployment**
- [ ] Backend deployed to Railway with real DATABASE_URL
- [ ] Frontend deployed to Vercel
- [ ] Mobile app in App Store + Google Play (EAS production build)
- [ ] Domain pointed to production (getfieldcore.com)
- [ ] All env vars set with real credentials

---

## Part 3 — What Is Explicitly NOT In the MVP

Do not build any of the following before launch. If a future session asks you to build something on this list, confirm with Kevin before writing code.

### Deferred to V2

**Business Phone System (Twilio Voice)**
- The code exists in `src/routes/phone.js` but was built beyond MVP scope
- Requires separate Twilio Voice configuration, TwiML apps, phone number provisioning
- Decision required: gate behind a "Coming soon" plan flag, or configure for launch
- Do not add voice features or improve `phone.js` until this decision is made

**Multi-Entity Management**
- `src/routes/entities.js` exists — allows one user to manage multiple business accounts
- Complex feature, not needed for a single-location operator
- Defer UI improvements and documentation until V2

**Stripe Connect (Contractor Payouts)**
- Code exists in `src/routes/connect.js`
- Requires Stripe approval for platform Connect accounts
- Not needed for MVP — operators will use direct Stripe for their own payouts

**ACH Payments**
- Not implemented. Not needed for MVP (cards only).

**AI Chat Widget**
- `src/routes/chat.js` exists and has a rule-based fallback that works without API key
- Decision needed: include in launch, or gate until cost model is defined
- Do NOT enable `ANTHROPIC_API_KEY` without adding per-account rate limiting first (Task 9)

**Partner Program**
- `client/src/pages/Partners.jsx` exists — marketing page
- No formal partner program defined, no commission tracking
- Leave static; do not build partner management backend

**Sendblue (iMessage/RCS)**
- Code exists. Works as alternate SMS provider.
- Not needed for launch — Twilio covers the requirement
- Defer until there is operator demand for iMessage delivery

### Remove Before Launch (Not Build)

**TimesheetScreen**
- `mobile/screens/TimesheetScreen.js` — has hardcoded placeholder data, no backend
- Must be removed from mobile navigation before EAS build OR a minimal backend built
- Decision required before Task 7

### Post-Launch Backlog

- Two-factor authentication (2FA / TOTP)
- Admin audit log viewer UI (logs written, no UI to read them)
- Mobile client management screen
- Mobile deposit visibility
- API documentation
- Unit and integration test suite
- Structured logging (replace console.log with Winston/Pino)
- CI/CD pipeline (currently manual deploys)
- Error monitoring (Sentry or equivalent)

---

## Part 4 — MVP Acceptance Criteria

The MVP is complete when all of the following are true:

**Functional**
- [ ] An operator can sign up and log in
- [ ] An operator can add a client and schedule a job
- [ ] A technician can see their job on the mobile app, check in with GPS, upload a photo, and mark it complete
- [ ] An operator can generate an invoice and send it to the client
- [ ] A client can pay the invoice via the payment link without creating an account
- [ ] A client can book an appointment via the public booking widget
- [ ] An operator can set up a subscription (Starter, Growth, or Scale) and be billed monthly

**Technical**
- [ ] Zero cross-tenant data leakage (verified by isolation test with two test accounts)
- [ ] Server starts cleanly and passes `node test/smoke.js`
- [ ] All 27 routes return appropriate responses (no 500 errors on happy path)
- [ ] Stripe webhook signature verification working (verified with Stripe CLI)
- [ ] File uploads persist across server restarts (cloud storage, not local disk)
- [ ] Mobile app connects to production API URL (not localhost)

**Operational**
- [ ] Error monitoring configured (Sentry or equivalent)
- [ ] Database backups enabled
- [ ] Railway health check endpoint responds
- [ ] Legal documents published (Terms of Service, Privacy Policy, SMS Terms)

---

## Part 5 — MVP Scope Decision Log

| Feature | Decision | Date | Reason |
|---------|----------|------|--------|
| Business Phone System | Include (gated) or defer | TBD | Built beyond scope; configuration unclear |
| TimesheetScreen | Remove OR implement | TBD | Placeholder data; blocks EAS build |
| AI Chat | Include if cost model defined | TBD | Financial risk without per-account limits |
| Partner Program | Static page only at launch | 2026-06-09 | No backend needed for launch |
| Sendblue | Twilio only at launch | 2026-06-09 | Reduces configuration complexity |
| Stripe Connect | Defer to V2 | 2026-06-09 | Requires Stripe approval; not needed for MVP |
| ACH | Defer to V2 | 2026-06-09 | Cards sufficient for MVP |
| 2FA | Defer to V2 | 2026-06-09 | Not required for initial customers |

---

*For the list of things actively blocking launch, see `LAUNCH_BLOCKERS.md`.*  
*For the pre-launch task sprint, see `LAUNCH_SPRINT_PLAN.md`.*  
*For business context, see `FIELDCORE_EXECUTIVE_SUMMARY.md`.*
