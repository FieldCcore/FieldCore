# FieldCore — Executive Summary

**Last updated:** 2026-06-09  
**Audience:** Kevin Caines (Founder), advisors, potential investors, future team members  
**Purpose:** Business context for non-technical decisions. Not a technical spec.

---

## What FieldCore Is

FieldCore is a vertical SaaS platform for independent service businesses — HVAC contractors, plumbers, electricians, cleaning services, landscapers, and 11 other trades. It replaces the four-tool stack most operators run:

| What they use today | What FieldCore replaces it with |
|--------------------|--------------------------------|
| Jobber / ServiceTitan / scheduling app | Job scheduling, dispatch, calendar |
| Square / Stripe links / invoicing app | Invoicing, card-on-file, deposits |
| Personal cell phone | SMS automation, client comms, business phone |
| Spreadsheet / QuickBooks | Client database, analytics, revenue tracking |

**One platform. No per-user fees. $49–$199/month flat.**

---

## The Business Model

**Revenue streams:**
1. **Subscription** — Flat monthly fee, no per-user charges (operators hate per-seat pricing)
2. **Platform fee** — 1% on payments processed through FieldCore (currently set in `PLATFORM_FEE_PERCENT`)

**Pricing tiers (current configuration):**

| Tier | Price | Limits |
|------|-------|--------|
| Starter | Free / low | 2 users, 50 jobs/month, no SMS |
| Growth (Pro) | Mid | 10 users, unlimited jobs, SMS enabled |
| Scale | High | Unlimited users, unlimited jobs, SMS, all features |

> **⚠️ Known issue:** The plan names are inconsistent between the billing code (`solo/pro/scale`) and the limit enforcement code (`starter/growth/scale`). This must be resolved before billing goes live.

---

## Target Customer

**ICP (Ideal Customer Profile):**
- Service operator doing $200K–$2M/year in annual revenue
- 1–15 employees (owner/operator + technicians)
- Currently duct-taping 3–5 separate tools together
- Pain points: missed follow-ups, manual invoicing, deposit disputes, technician dispatch overhead

**15 trade verticals supported:**
Mobile Auto Detailing, Pressure Washing, Lawn Care/Landscaping, Pool Service, HVAC, Plumbing, Electrical, Pest Control, Residential Cleaning, Commercial Cleaning, Roofing, Painting, Handyman Services, Appliance Repair, Window Cleaning

---

## Current Build Status (as of 2026-06-09)

The codebase is feature-complete for an MVP. All four applications exist:

| Application | Status |
|------------|--------|
| Backend API (Express.js) | Built. 27 routes. Multi-tenant isolation verified. |
| Web Dashboard (React/Vite) | Built. 42 pages. Needs real credentials to test. |
| Mobile App (Expo) | Built. 14 screens. Needs EAS build + store accounts. |
| Marketing Site (Next.js) | Built. Landing, features, pricing, login pages. |

**What works without credentials:**
- User registration, login, JWT auth
- Client database (CRUD)
- Job scheduling and dispatch
- Team management (roles and permissions)
- Analytics dashboard
- Onboarding flow
- Plan limit enforcement
- Public booking widget
- Estimate creation with e-signature
- No-show tracking and deposit retention
- In-app notifications
- Push notification registration

**What needs real credentials before it works:**
- All payment processing (Stripe keys needed)
- All SMS (Twilio A2P 10DLC approval needed — 3–7 business days)
- All email (SMTP credentials needed)
- AI chat widget (Anthropic API key needed)
- Address autocomplete (Google Maps API key needed)
- Mobile on real devices (EAS build + API URL update needed)

---

## What Needs to Happen Before First Paying Customer

In dependency order:

1. ✅ **Multi-tenant isolation audit** — Complete (2026-06-09)
2. **CORS configuration** — 30-minute fix; required before any production deploy
3. **Health check endpoint** — 30-minute fix; required for Railway monitoring
4. **Stripe integration** — Real keys, webhook verification, price IDs created in Stripe dashboard
5. **Mobile URL fix** — Update `mobile/api.js` before EAS build (cannot patch after distribution)
6. **File upload storage** — Migrate from local disk to cloud storage before real user uploads
7. **TimesheetScreen** — Decide: implement or remove before EAS build
8. **SMTP configuration** — Required for password reset, confirmation emails, magic links
9. **Rate limiting** — Review before going public
10. **Production environment** — Deploy to Railway (backend) + Vercel (frontend) + set `APP_URL`

**Critical external dependencies (not code — require setup/approval):**
- Stripe account creation and verification (1–3 business days)
- Twilio A2P 10DLC campaign registration (3–7 business days)
- Apple Developer account ($99/yr) + Google Play Console ($25 one-time) for app distribution
- Domain registration and DNS propagation

---

## Competitive Context

FieldCore competes with:
- **Jobber** ($49–$249/month per user) — per-user pricing, no mobile-first approach
- **ServiceTitan** ($300–$500+/month) — enterprise-focused, complex onboarding
- **HouseCall Pro** ($65–$265/month) — similar ICP but weaker on comms automation
- **Square** — payment only, no scheduling or dispatch

**FieldCore's positioning:** Flat pricing, all-in-one, built specifically for the $200K–$2M operator who wants to run their business from their phone.

---

## Entity and Legal

- **Entity:** FieldCore Inc. — Delaware C-Corp
- **Founder:** Kevin Caines
- **Domain:** getfieldcore.com (authoritative)
- **Deprecated domains:** fieldcore.io, usefieldcore.com — do not use
- **Legal status:** Pre-revenue. No formal Terms of Service or Privacy Policy yet (placeholder text only).

---

## Open Business Decisions

These decisions block specific development tasks. They require a human decision — code cannot proceed without them.

| Decision | Blocks | Notes |
|----------|--------|-------|
| TimesheetScreen: implement or remove? | Task 7, EAS build | Screen exists but has no backend. 30 min to remove vs 4–6 hrs to build. |
| AI Chat: include at launch? | Task 9 | Cost model unclear (FieldCore absorbs Anthropic cost?) |
| AI Chat daily limit per plan | Task 9 | Suggested: Starter 20/day, Growth 100/day, Scale unlimited |
| Platform fee percentage | Billing go-live | Currently hardcoded at 1%. Is this confirmed? |
| Starter plan: free tier or paid? | Billing go-live | `STRIPE_PRICE_STARTER` is absent — is Starter free? |
| Business Phone System: launch or defer? | V2 decision | Twilio Voice fully implemented but not in original MVP scope |
| Sendblue: include at launch? | Provider decision | Implemented but requires separate Sendblue account |

---

*For technical architecture, see `DEVELOPER_SOURCE_OF_TRUTH.md`.*  
*For launch task list, see `LAUNCH_SPRINT_PLAN.md`.*  
*For what is and is not in MVP scope, see `FIELDCORE_MVP_DEFINITION.md`.*
