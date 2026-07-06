# FieldCore — Release Readiness Report

**Last reconciled:** 2026-07-06 (PR-005 closed; PR-006 opened — Embedded Stripe Payments sprint planned; DECISION-059 recorded)  
**Verdict: NOT READY FOR PRODUCTION** — Code is substantially complete but all third-party integrations are unconfigured.

---

## Executive Summary

The FieldCore codebase is feature-complete beyond its original 6-module MVP scope. However, the application cannot process payments, send any SMS or email, or be accessed by users on a real domain. Every major user-facing flow is blocked by missing credentials. The code is ready; the infrastructure and accounts are not.

**Estimated time to production-ready:** 1-2 weeks (mostly waiting on Stripe verification and Twilio A2P registration)

---

## READY FOR LAUNCH (Code Is Complete)

| Feature | Code Status | Notes |
|---------|------------|-------|
| User authentication (login/signup/roles) | Complete | Needs strong `JWT_SECRET` in prod |
| Client database (CRUD, search, profile) | Complete | — |
| Job scheduling + calendar | Complete | — |
| Technician mobile app — full field flow | Complete | Signature pad → Tip → Complete; no-show declare with countdown; availability toggle; multi-day view (Today/Tomorrow/Week); role-enforced routing (tech → /tech, operator → /dashboard); Needs EAS build for device distribution |
| Team management + role enforcement | Complete | — |
| Business settings + hours | Complete | Logo storage destination TBD |
| Fleet management | Complete | UI redesigned 2026-07-01: stat cards, two-column layout, provider grid, camera tiles. Shows setup-required until provider connected. |
| No-show tracking + clock | Complete | SMS delivery blocked by Twilio |
| Estimates + e-signature | Complete | Email delivery blocked by SMTP |
| Post-job reviews | Complete | Email delivery blocked by SMTP |
| Multi-entity management (Scale+) | Complete | — |
| Onboarding flow | Complete | Stripe card setup blocked |
| Analytics dashboard | Complete | Needs real data to validate accuracy |
| Audit logging | Complete | No admin viewer UI |
| Plan limit enforcement | Complete | — |
| Push notifications (backend + mobile) | Complete | Needs EAS build for device testing |
| Booking widget (admin settings + public form) | Complete | Stripe + APP_URL required |
| Public landing / marketing site | Complete | Needs real content + domain |
| Beta signup (100-slot cap) | Complete | Email confirmation blocked by SMTP |
| Manager tablet view | Complete | Tablet + phone viewport now fully supported (gate removed 2026-06-24) |
| Mobile phone access to dashboard | Complete | Phone gate removed 2026-06-24; bottom nav + sidebar overlay handle all screen widths |
| Login page navigation (back to home) | Complete | Logo links to homepage; "← Back to homepage" added 2026-06-24 |
| Dashboard logo home navigation | Complete | Sidebar logo is now Link to /dashboard from any page (2026-06-24) |
| Calendar page UI | Complete | Styled toolbar, event cards, today highlight, current-time indicator, responsive height (2026-06-24); Agenda view fully restyled with FieldCore tokens, custom AgendaEvent component, navy header, white rows (2026-06-25) |
| Client list with real invoice data | Complete | LTV, outstanding balance, last invoice date/status from DB (2026-06-24) |
| Create Client modal overflow | Complete | `max-height: 90vh` + scroll on `.modal` (2026-06-24) |
| Communications `read_at` error | Complete | Fallback query when column missing on Railway DB (2026-06-24) |
| Settings page styling | Complete | Full UI redesign 2026-07-01: page-header, clean tab nav (navy underline, no harsh outlines), polished My Account/Business/Notifications/Billing tabs, 720px left-aligned layout |
| Entities revenue typography | Complete | Cormorant Garamond serif for revenue figures (2026-06-24) |
| Billing downgrade flow | Complete | Routes to support contact instead of automatic change (2026-06-24) |
| StatusBadge design system | Complete | Shared badge component across 15+ pages; auto color-mapped (2026-06-24) |
| Communications tabs (Phone Numbers, Call Log, Voicemail) | Complete | CommCard + CommEmptyState; matches Messages tab quality (2026-06-24) |
| Billing downgrade — visible button | Complete | Request Downgrade in Current Plan banner + Plans tab footer (2026-06-24) |
| Entities Stripe Connect flow | Complete | Real `/api/connect/onboard` call; loading state; inline errors; redirect to Stripe (2026-06-24) |
| Payout schedule selector | Complete | Daily/Weekly/Monthly/Manual; GET/POST backend endpoints; persists after refresh (2026-06-24) |
| Typography utility classes | Complete | `.fc-page-title`, `.fc-card-title`, `.fc-currency`, `.fc-stat-number`, etc. added to style.css (2026-06-24) |
| Invoice/deposit status colors | Complete | All status badges via StatusBadge; correct colors per status (2026-06-24) |

---

## IN PROGRESS — Embedded Stripe Payments Sprint

**Decision:** DECISION-059 (2026-07-06) — Stripe stays as processor; redirect-based flows replaced with embedded UI.

| Sprint | Task | Scope | Status |
|--------|------|-------|--------|
| PR-006 | P1-012 | Embedded SaaS subscription checkout (`ui_mode: 'embedded'` on `/billing`) | Not Started |
| PR-007 | P1-013 | Public invoice Payment Element (`/pay/:invoiceId` stays on FieldCore domain) | Not Started |
| PR-008 | P1-014 | Client portal invoice Payment Element (inline in portal) | Not Started |
| PR-009 | P1-015 | Booking deposit Payment Element (inline in booking widget) | Not Started |
| PR-010 | P1-016 | Save card modernization: `CardElement` → `PaymentElement` (setup mode) | Not Started |

These sprints are unblocked by Stripe credentials being configured. P1-012 can run immediately once Stripe price IDs are set in Railway.

---

## NOT READY FOR LAUNCH

### Blocked by Missing Credentials

| Feature | Blocked By | User Impact |
|---------|-----------|-------------|
| Invoice payment + card charge | Stripe keys + embedded UI (PR-007, P1-013) | Core revenue — redirect-based; embedded sprint planned |
| Booking deposit collection | Stripe keys + APP_URL + embedded UI (PR-009, P1-015) | Public booking unusable; embedded sprint planned |
| Subscription billing | Stripe price IDs + embedded checkout (PR-006, P1-012) | Redirect-based today; embedded sprint in progress |
| Stripe Connect payouts | Stripe Connect approval | Contractor payouts unavailable |
| Job confirmation SMS | Twilio + A2P approval | No automated confirmations |
| 24h reminder SMS | Twilio + A2P approval | No automated reminders |
| No-show SMS notifications | Twilio + A2P approval | No-show flow incomplete |
| ETA SMS from mobile | Twilio + A2P approval | Mobile flow incomplete |
| Password reset email | SMTP credentials | Users locked out permanently |
| Job confirmation email | SMTP credentials | No backup to SMS |
| Invoice email delivery | SMTP credentials | Customers can't receive invoices |
| Client portal magic-link | SMTP credentials | Portal inaccessible |
| Review request email | SMTP credentials | Review flow broken |
| Beta confirmation email | SMTP credentials | Beta signups unconfirmed |
| Address autocomplete | Google Maps API key | Address input degraded |
| AI chat widget | Anthropic API key | Chat unavailable |
| Mobile on real device | BASE_URL not set | App can't connect to API |

---

## WHAT COULD BREAK

### High Risk

1. **File uploads in production** — Storage destination unknown. If Railway uses ephemeral disk, all job photos and logos are wiped on every deploy.

2. **Stripe webhook verification** — `STRIPE_WEBHOOK_SECRET` must match exactly. Mismatch = all Stripe events rejected silently.

3. **Database migrations on first deploy** — All schema statements now in `migrate.js` (backfilled 2026-06-09, Task 5). First production deploy needs `DATABASE_URL` set before the process starts. No manual `init-db.js` run required.

4. ~~**CORS configuration**~~ — **RESOLVED 2026-06-09** — Now reads from `APP_URL` env var; apex + www derived automatically.

5. **SMS before A2P approval** — Setting `SMS_ENABLED=true` before Twilio A2P campaign is approved risks Twilio account suspension.

### Medium Risk

6. **Recurring job timezone edge cases** — Near DST transitions, recurring jobs may double-create or skip.

7. ~~**Multi-tenant query isolation**~~ — **RESOLVED 2026-06-09** — Sprint Task 1 complete. All 27 route files audited and verified. Security fixes applied to `users.js`, `clients.js`, `jobs.js`, `deposits.js`, `payments.js`.

8. **Mobile `BASE_URL`** — Must be updated before EAS build. Cannot be changed after the app is distributed without a new build.

---

## WHAT NEEDS TESTING

### Before First Real User

- [ ] Signup → onboarding → create first client → create first job → complete → invoice generated
- [ ] Invoice → payment link → pay as anonymous customer (Stripe test mode)
- [ ] Booking widget: anonymous book → deposit charged → job appears in dashboard
- [ ] Job confirmation SMS sent within 1 minute of job creation
- [ ] 24h reminder SMS sent by scheduler
- [ ] Password reset: email received → link works → new password accepted
- [ ] Mobile: login → jobs visible (Today/Tomorrow/Week) → GPS check-in → photo upload → get signature → select tip → mark complete
- [ ] Plan limit: try to exceed Starter (3rd user should fail, 51st job should fail)
- [x] Multi-tenant isolation: code verified 2026-06-09. Full two-account test still recommended before first real user.

### Before Public Beta

- [ ] Stripe subscription creation, upgrade, downgrade, cancellation
- [ ] Stripe webhook replay: payment_failed, subscription.canceled
- [ ] Push notifications on physical iOS and Android
- [ ] Full no-show flow: clock starts → expires → deposit retained → SMS sent
- [ ] Client portal magic-link generation, delivery, and access
- [ ] Load test: 10 concurrent job creates

---

## WHAT NEEDS STRIPE

1. Stripe account + business verification (1-3 days)
2. Create Solo ($49), Pro ($99), and Scale ($199) products + monthly prices in Stripe
3. Copy price IDs → `STRIPE_PRICE_SOLO`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_SCALE` in env
4. Enable Stripe Connect (additional verification, 2-5 days)
5. Register webhook endpoint `/api/webhooks/stripe` in Stripe dashboard
6. Copy webhook signing secret → `STRIPE_WEBHOOK_SECRET`
7. Validate all flows in test mode before switching to live keys

**Stripe-gated features:** All payment processing, invoicing, deposits, booking deposits, subscriptions, billing portal, card on file, public payment page.

---

## WHAT NEEDS TWILIO

1. Twilio account creation
2. Purchase phone number
3. A2P 10DLC brand registration (business info + EIN) — 1-2 day approval
4. A2P 10DLC campaign registration (message use case) — 3-7 day approval
5. Register webhooks `/api/webhooks/twilio` for inbound SMS status
6. Set `SMS_ENABLED=true` only after approval
7. For voice system: TwiML app + voice webhooks (separate configuration)

**Twilio-gated features:** All SMS automation (confirmation, reminders, no-show, ETA), manual SMS from dashboard, business phone system.

---

## WHAT NEEDS BUSINESS INFORMATION

| Item | Where Used | Status |
|------|-----------|--------|
| Legal business name | Stripe verification, Terms | Unknown |
| EIN / Tax ID | Stripe + Twilio brand reg | Unknown |
| Business address | Stripe + Twilio brand reg | Unknown |
| Bank account | Stripe payouts | Unknown |
| Growth plan price ($) | Stripe product creation | Unknown |
| Scale plan price ($) | Stripe product creation | Unknown |
| Starter plan pricing | Stripe or free? | Undecided |
| Platform fee rate | Currently 1% in env | Confirm |
| Real Terms of Service | Landing site | Placeholder |
| Real Privacy Policy | Landing site | Placeholder |
| Real SMS Terms | Landing site | Placeholder |
| AI chat cost model | Per-message billing? | Undecided |

---

## WHAT NEEDS REAL CUSTOMER TESTING

1. **Onboarding friction** — Real service business owner, zero guidance, measure dropoff
2. **Technician mobile usability** — Real technician, real workday, no hand-holding
3. **Booking widget embed** — Real operator embeds on their site, real customer books
4. **Invoice receipt quality** — Real customer pays, reviews receipt email
5. **SMS quality** — Real customer receives confirmation and reminder, checks tone/format
6. **Client portal UX** — Real customer navigates portal via magic-link

---

## GO / NO-GO CHECKLIST

| Item | Status |
|------|--------|
| `JWT_SECRET` set (strong, 64+ chars) | ❌ Not configured |
| `DATABASE_URL` set (production DB) | ❌ Not configured |
| `APP_URL` set (production domain) | ❌ Not configured |
| Stripe account + keys configured | ❌ Not configured |
| Stripe products/prices created | ❌ Not created |
| Stripe webhook registered + secret set | ❌ Not registered |
| Twilio credentials configured | ❌ Not configured |
| Twilio A2P 10DLC registration complete | ❌ Not started |
| SMTP configured + tested | ❌ Not configured |
| `SMS_ENABLED` set correctly | ❌ Still `false` |
| Google Maps API key configured | ❌ Not configured |
| Domain registered + DNS configured | ❓ Unknown |
| SSL certificates active | Auto (Railway/Vercel) |
| Database migrations pass on prod | ❌ Not tested |
| File upload storage confirmed | ❌ Not confirmed |
| CORS configured for prod domain | ❌ Not verified |
| Multi-tenant isolation audited | ✅ COMPLETE 2026-06-09 |
| Smoke tests pass on prod | ❌ Not run |
| Mobile `BASE_URL` updated | ✅ COMPLETE 2026-06-10 — set `EXPO_PUBLIC_API_URL` before EAS build |
| EAS build created | ❌ Not built |

**Current score: 0 / 20 items ready**  
**Minimum before first real user: All 20 must be checked**
