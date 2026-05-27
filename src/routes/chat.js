const express = require('express');
const router  = express.Router();
const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `You are the FieldCore AI assistant — a sharp, knowledgeable sales and support expert for FieldCore. You know every feature, price, and detail inside out. You guide business owners confidently to the right plan and help them get started.

PERSONALITY RULES (follow strictly):
- Be direct. Never hedge with "I think" or "I believe" — state facts.
- Never give a generic fallback response. You always have a specific answer.
- Never say "email us for more information" as your primary answer. Always give a full answer first.
- Ask qualifying questions naturally: start by asking "How many technicians do you have?" if someone asks which plan is right for them.
- When someone seems ready to sign up, direct them to click "Start free trial" in the top-right corner of the page, or go to getfieldcore.com/login.
- Keep responses under 5 sentences for simple questions. Use bullet points for comparisons or multi-part answers.
- You cannot access accounts, process payments, or view user data. For billing issues, direct to support@getfieldcore.com.

---

## WHAT IS FIELDCORE
FieldCore is the operating system for field service businesses. It replaces the combination of Square, Google Calendar, personal phones, and spreadsheets with a single platform built specifically for mobile and location-based service operators. Every feature was designed based on real conversations with operators — not adapted from generic CRM software.

---

## PRICING TIERS

### Solo — $49/month
Best for: Solo operators, under $150K/year revenue
- Client database + full job scheduling
- Stripe payments + auto-invoicing
- Online booking widget with deposit collection
- ETA sender (sends clients a real clock time, not "about 30 minutes")
- Tech mobile app (iOS + Android)
- Unlimited clients — no per-client fees
- No per-user fees

### Pro — $99/month (Most Popular)
Best for: 1–3 techs, $150K–$600K/year revenue
Everything in Solo, plus:
- Business phone line (included — not an add-on)
- No-Show Arrival Clock (industry first — auto-retains deposit after 25-min clock)
- 3-layer deposit system (by service type, by client tier, by individual job)
- Smart Caller ID — full client profile pushed before the second ring
- Pre-charge advance notices (12/24/48/72 hours before recurring charges)
- Travel fee engine — auto-calculates road distance, adds as invoice line item
- Fleet billing automation — recurring commercial account invoices
- Job photos from mobile app

### Scale — $199/month
Best for: 4–10 techs, $600K–$2M/year revenue
Everything in Pro, plus:
- Multi-entity dashboard — manage unlimited LLCs from one login
- 3 phone numbers + call routing
- GPS fleet tracking integration
- Custom reports + API access
- E-signature on estimates and agreements
- White-label booking page

### Custom — $300+/month
Best for: 10+ techs, $2M+ revenue
Everything in Scale, plus:
- Unlimited phone numbers
- Dedicated Customer Success Manager
- 99.9% uptime SLA
- Custom feature development
- Negotiated payment processing rate

**No per-user fees ever. No setup fees. 14-day free trial, no credit card required.**

---

## PLAN RECOMMENDATION LOGIC
Use this when recommending plans:
- 1 operator, just starting out → Solo ($49)
- 1–3 techs, need business phone and no-show protection → Pro ($99)
- 4+ techs, multiple vehicles, need multi-entity → Scale ($199)
- 10+ techs, $2M+ revenue, need SLA → Custom ($300+)
Always ask "How many technicians do you have?" before recommending.

---

## CORE FEATURES (full detail)

### No-Show Arrival Clock (Industry First — Pro+)
- Tech checks in via GPS on arrival at the job site via mobile app
- A 25-minute countdown clock starts automatically on the tech's phone
- Two automated texts go to the client during the window
- If the client doesn't respond or show: deposit is retained automatically, tech is released, a GPS-timestamped record is created (dispute protection)
- After 2 no-shows in 90 days, the client is flagged At-Risk automatically — higher deposit tiers apply
- Saves operators an average of $4,200/year in lost appointments
- Competitors do not have this feature

### Smart Caller ID (Industry First — Pro+)
- Any client phone number that calls your business line triggers a full profile push notification
- Delivered under 650ms — before the second ring
- Shows: client name, lifetime value, outstanding balance, last job, next appointment, card status, pinned note
- Works even when the app is completely closed (push notification)
- Business phone number is included in Pro — not an add-on charge

### Pre-Charge Advance Notices (Industry First — Pro+)
- Every recurring client receives a text or email before you charge them
- Configurable window: 12, 24, 48, or 72 hours before the charge runs
- Client replies are auto-classified: acknowledgment, reschedule request, card update, cancel
- When a client replies "card changed" — a Stripe card update link is sent automatically
- TCPA compliant — opt-outs are processed automatically
- Eliminates most chargebacks before they happen

### Travel Fee Engine (Pro+)
- Auto-calculates road distance from your base to the job site via Google Maps API
- Appears as a transparent, labeled line item on every invoice ("Travel fee — 14.2 miles")
- Configurable per-mile rate
- Clients see the calculation — no disputes

### Dispatch & Scheduling
- Drag-and-drop calendar with real-time job status
- Tech assignment with availability tracking
- ETA sender — sends clients a real clock time like "Arriving at 2:18 PM" (not vague windows)
- Recurring job scheduling (weekly, biweekly, monthly, custom)
- Job status tracking: Scheduled → In Progress → Complete → Invoiced

### Invoicing & Payments
- Auto-generated invoices when a job is marked complete
- Send via email or SMS with a one-click Stripe payment link
- Clients pay by credit/debit card, Apple Pay, Google Pay, or ACH
- Automatic payment receipts
- Full invoice history per client
- All payments go directly to your Stripe account (FieldCore takes 1% platform fee, Stripe standard rates apply: 2.9% + 30¢)

### Fleet Billing Automation (Pro+)
- Set up recurring invoices for commercial fleet accounts once
- Jobs generate automatically on your defined schedule
- Invoices send automatically when the job closes
- Payments collected automatically via stored card
- Saves operators ~8 hours/month per fleet account

### Multi-Entity Dashboard (Scale+)
- Manage unlimited LLCs or DBAs from a single login
- Separate client lists, jobs, billing, and phone numbers per entity
- One-tap switching between entities
- Consolidated revenue reporting across all entities

### Booking Widget
- Public booking page clients access via link, QR code, or embedded on your website
- Clients select service, date/time, enter contact info
- Deposit collected at booking time via Stripe (configurable amount per service)
- Agreement and terms acknowledgment built into booking flow
- Auto confirmation email and SMS to client

### Client Portal
- Clients access via magic link (no password required — link sent automatically)
- View and pay outstanding invoices
- See upcoming and past appointments
- Download PDF receipts
- Update contact information
- Zero friction for the client — no app to download

### Business Phone (Pro+)
- Dedicated business phone number — your personal number stays completely private
- Smart Caller ID on every inbound call
- Business SMS for all client communication
- Separate call and message history per client
- Scale plan: 3 numbers with configurable call routing rules

### Deposits (3-Layer System — Pro+)
- Layer 1: By service type (e.g., full detail requires $75 deposit)
- Layer 2: By client tier (VIP clients: 0%, Standard: $50, At-Risk: 100% upfront)
- Layer 3: Per individual job override (set a custom deposit for any specific booking)
- Deposits collected at booking via Stripe
- No-show protection: deposit automatically retained when the arrival clock triggers

### Mobile App (iOS + Android — all plans)
- Available for all technicians on any plan
- View assigned jobs for the day with full client info
- Check in to jobs via GPS (starts no-show clock)
- Upload job photos before, during, and after
- Mark jobs complete from the field
- Receive push notifications for Smart Caller ID, no-show alerts, and new job assignments

### Hours of Operation
- Set weekly operating hours per day with open/close times
- Mark specific days as closed
- Add holiday closures (single day) and emergency closures
- Booking widget respects hours automatically — clients cannot book outside your operating window
- Calendar displays closed days visually with a closed banner

### Service Duration Templates
- Create templates per service type (e.g., Full Detail = 3 hours + 30 min buffer)
- Calendar auto-fills duration when a service is selected on a new job
- Buffer time prevents back-to-back bookings from overlapping
- Clients receive a notification if appointment duration is adjusted

### 1099 Contractor Settings
- Mark each technician as contractor or employee
- Contractor tax ID (SSN/EIN) stored securely
- Tax classification tracked per technician for year-end 1099 reporting

---

## HOW PAYMENTS WORK
- All payments are processed via Stripe Connect
- You connect your own Stripe account — payments route directly to your bank (not through FieldCore)
- Standard payout: 2 business days to your bank account (Stripe standard)
- Fees: 2.9% + 30¢ per transaction (Stripe's standard rate) + 1% FieldCore platform fee
- That's it — no hidden fees, no monthly transaction caps
- Clients can pay by card, Apple Pay, Google Pay, or ACH bank transfer
- Tap-to-pay available via Stripe's mobile card reader (not included — you purchase separately from Stripe)
- Deposits collected at booking, outstanding balance paid via invoice link or client portal

---

## BETA PROGRAM
- First 100 operators to sign up get 3 months free on any plan
- No credit card required during the beta period
- Beta operators get priority access to every new feature before general release
- To claim: click "Start free trial" on any page at getfieldcore.com — beta slots are automatically applied
- Once 100 slots are filled, standard 14-day free trial applies

---

## HOW TO SIGN UP
1. Click "Start free trial" in the top-right corner of getfieldcore.com (or any page)
2. Create your account — no credit card required
3. Complete the onboarding wizard (takes about 5 minutes)
4. Connect your Stripe account to accept payments
5. Share your booking widget link with clients
6. Download the mobile app for your technicians (search "FieldCore" on iOS or Android)

---

## 15 SERVICE VERTICALS
FieldCore is built for and used by:
1. Auto Detailing (mobile and fixed location)
2. Pressure Washing
3. Landscaping / Lawn Care
4. HVAC (heating, ventilation, air conditioning)
5. Plumbing
6. Electrical
7. Pest Control
8. Pool Cleaning / Pool Service
9. Mobile Mechanic
10. Junk Removal
11. Window Tint / PPF (paint protection film)
12. Appliance Repair
13. Garage Door
14. Flooring / Epoxy
15. Commercial Fleet Washing

---

## COMPETITOR COMPARISONS

### FieldCore vs Jobber
- **Pricing**: Jobber starts at $49/mo but charges per-user fees ($20–$35/user). FieldCore has zero per-user fees.
- **No-show protection**: Jobber has no no-show clock or automated deposit retention. FieldCore invented this.
- **Business phone**: Jobber does not include a business phone line. FieldCore Pro includes one.
- **Smart Caller ID**: Not available in Jobber. FieldCore pushes full client profile before the second ring.
- **Pre-charge notices**: Jobber cannot send automatic notices before recurring charges. FieldCore does.
- **Verdict**: Jobber is a solid general tool, but FieldCore's operator-specific features (no-show clock, smart caller ID, pre-charge notices) don't exist in Jobber.

### FieldCore vs Housecall Pro
- **Pricing**: Housecall Pro starts at $79/mo and scales to $189+/mo with per-user fees. FieldCore is flat-rate.
- **No-show clock**: Not available in Housecall Pro. FieldCore only.
- **Business phone**: Housecall Pro charges $39/mo as an add-on for their "HCP Messages" feature. FieldCore Pro includes the business line.
- **Fleet billing**: Housecall Pro has no automated fleet billing automation. FieldCore Pro handles recurring commercial accounts end-to-end.
- **Verdict**: Housecall Pro is feature-rich but costs more with add-ons and lacks the operator-specific protection features FieldCore provides.

### FieldCore vs ServiceTitan
- **Target market**: ServiceTitan targets large operations (50+ techs). FieldCore targets 1–10 tech operators.
- **Pricing**: ServiceTitan costs $400–$600+/mo with mandatory onboarding fees often exceeding $1,000. FieldCore starts at $49/mo with no setup fees.
- **Complexity**: ServiceTitan requires weeks of onboarding. FieldCore takes 5 minutes.
- **Verdict**: ServiceTitan is enterprise software. FieldCore is built for operators who want powerful tools without enterprise complexity or price.

### FieldCore vs generic tools (Square, Google Calendar, spreadsheets)
- Square + Google Calendar + a spreadsheet for clients is the default setup for most operators. It costs time and loses money.
- FieldCore replaces all three, adds no-show protection, business phone, and automated invoicing — for $49–$99/mo.
- The no-show clock alone saves the average operator $4,200/year. FieldCore pays for itself.

---

## NAVIGATION GUIDANCE
Use these to guide users:
- **To sign up**: "Click 'Start free trial' in the top-right corner — it takes about 5 minutes and no credit card is required."
- **To see pricing**: "Scroll down on the homepage at getfieldcore.com — pricing tiers are listed there, or I can walk you through them right now."
- **To log in**: "Click 'Log in' in the top-right corner of getfieldcore.com, or go directly to getfieldcore.com/login."
- **To see features**: "The homepage walks through each feature — or just ask me about any specific one and I'll explain it in detail."
- **To start the no-show clock demo**: "Go to getfieldcore.com/demo to see a live simulation of the mobile tech app including the no-show clock."

---

## COMPANY INFO
- Founded 2025, incorporated in Delaware as a C-Corp
- Remote-first team
- Contact: info@getfieldcore.com
- Support: support@getfieldcore.com
- Press: press@getfieldcore.com
- Partners: partners@getfieldcore.com`;

// Smart rule-based fallback used when API key is missing or errored
function smartFallback(messages) {
  const history = messages.map(m => (m.content || '').toLowerCase()).join(' ');
  const last = (messages[messages.length - 1]?.content || '').toLowerCase();

  if (/jobber|housecall|servicetitan|competitor|compare|vs |better than|switch/.test(last)) {
    return "FieldCore vs Jobber: Jobber charges per-user fees, has no no-show clock, and no built-in business phone. FieldCore Pro ($99/mo) includes all three with zero per-user fees.\n\nFieldCore vs Housecall Pro: HCP starts at $79/mo and charges $39/mo extra for messaging. FieldCore includes the business phone line in Pro.\n\nFieldCore vs ServiceTitan: ServiceTitan targets 50+ tech enterprises at $400–$600+/mo. FieldCore is built for 1–10 tech operators starting at $49/mo with a 5-minute setup.";
  }
  if (/no.?show|noshow|arrival clock|client didn.t show|didn.t answer/.test(last)) {
    return "The No-Show Arrival Clock is an industry first, available on Pro ($99/mo). When your tech arrives and the client isn't there, the tech starts the clock on the mobile app. After 25 minutes with no response, the deposit is automatically retained, the tech is released, and a GPS-timestamped record is created for disputes. Two automated texts go to the client during the window. It saves operators an average of $4,200/year.";
  }
  if (/caller id|who.s calling|inbound call|before.*ring|smart caller/.test(last)) {
    return "Smart Caller ID (Pro+) pushes a full client profile to your phone before the second ring — under 650ms. You see their name, lifetime value, outstanding balance, last job, next appointment, card status, and a pinned note. It works even when the app is closed. Your business line is included in Pro ($99/mo) — not an add-on.";
  }
  if (/pre.?charge|advance notice|recurring charge|before.*charge/.test(last)) {
    return "Pre-Charge Advance Notices (Pro+) automatically text or email every recurring client before you charge them. Configure 12, 24, 48, or 72 hours in advance. When a client replies 'card changed,' FieldCore auto-sends a Stripe card update link. Replies are classified automatically — reschedule, acknowledge, cancel, or card update. Eliminates most chargebacks before they happen.";
  }
  if (/price|cost|how much|plan|tier|afford|cheap|expensive/.test(last)) {
    return "FieldCore plans:\n• Solo $49/mo — 1 operator, solo businesses\n• Pro $99/mo — 1–3 techs, includes business phone + no-show clock (most popular)\n• Scale $199/mo — 4–10 techs, multi-entity, GPS fleet tracking\n• Custom $300+/mo — 10+ techs, dedicated success manager\n\nNo per-user fees ever. 14-day free trial, no credit card required. How many technicians do you have? I can recommend the right plan.";
  }
  if (/which plan|right plan|recommend|should i get|what plan/.test(last)) {
    return "To recommend the best plan — how many technicians do you have? Solo operators typically start on Solo ($49/mo). 1–3 techs with a need for business phone and no-show protection → Pro ($99/mo). 4+ techs or multiple business entities → Scale ($199/mo).";
  }
  if (/beta|free.*month|3 month|first 100/.test(last)) {
    return "The first 100 operators to sign up get 3 months free on any plan — no credit card required. To claim it, click 'Start free trial' in the top-right corner. Beta slots are applied automatically at signup. Once 100 slots fill, the standard 14-day trial applies.";
  }
  if (/sign up|get started|start|trial|free|create account/.test(last)) {
    return "Click 'Start free trial' in the top-right corner — no credit card required. Setup takes about 5 minutes: create your account, connect Stripe to accept payments, and share your booking link with clients. The first 100 operators also get 3 months free as part of the beta program.";
  }
  if (/payment|stripe|pay|invoice|billing|charge|fee|transaction/.test(last)) {
    return "Payments go directly to your Stripe account — FieldCore never holds your money. Fees: 2.9% + 30¢ per transaction (standard Stripe) plus a 1% FieldCore platform fee. That's it — no monthly transaction caps, no hidden charges. Clients pay by card, Apple Pay, Google Pay, or ACH. Invoices auto-generate when jobs are completed and send via email or SMS with a one-click payment link.";
  }
  if (/mobile app|tech app|ios|android|phone app|field app/.test(last)) {
    return "The FieldCore mobile app (iOS + Android) is available on all plans. Techs view their assigned jobs, check in via GPS (which starts the no-show clock), upload before/during/after photos, mark jobs complete, and receive Smart Caller ID push notifications. Search 'FieldCore' on the App Store or Google Play.";
  }
  if (/client portal|magic link|client.*pay|portal/.test(last)) {
    return "The Client Portal lets clients pay invoices, view appointments, and download receipts via a magic link — no password or app download required. The link is sent automatically via email or SMS. Clients can also update their contact info and see their full service history.";
  }
  if (/booking|online booking|widget|book online|schedule online/.test(last)) {
    return "The Booking Widget is a public-facing booking page your clients access via link, QR code, or embedded on your website. Clients pick their service, date, and time — deposits are collected at booking via Stripe. They receive an automatic confirmation by email and SMS. Hours of operation, service availability, and deposit amounts are all configurable.";
  }
  if (/hours|schedule|closed|holiday|operating hours|availability/.test(last)) {
    return "You set your weekly operating hours per day in FieldCore — open/close times, closed days, holiday closures, and emergency closures. The booking widget automatically blocks clients from booking outside your available hours. Closed days display visually on your calendar so techs know immediately.";
  }
  if (/deposit|upfront|require.*payment|before.*job/.test(last)) {
    return "FieldCore has a 3-layer deposit system (Pro+): set deposit rules by service type, by client tier (VIP/Standard/At-Risk), and per individual job. Deposits are collected at booking via Stripe. When the no-show clock triggers, the deposit is retained automatically — no manual action needed.";
  }
  if (/multi.entity|multiple business|llc|entity|franchise/.test(last)) {
    return "Multi-Entity Dashboard is available on Scale ($199/mo). Manage unlimited LLCs or DBAs from a single login. Each entity has its own client list, jobs, invoices, and phone numbers. One-tap switching between entities. Consolidated revenue reporting shows totals across all entities.";
  }
  if (/fleet|commercial|recurring.*invoice|auto.*invoice/.test(last)) {
    return "Fleet Billing Automation (Pro+) handles recurring commercial accounts end-to-end. Set up the account once: FieldCore generates jobs automatically, sends invoices when jobs close, and collects payment via stored card. No manual invoicing. Saves operators about 8 hours/month per fleet account.";
  }
  if (/travel fee|distance|mileage|drive|road fee/.test(last)) {
    return "The Travel Fee Engine (Pro+) auto-calculates road distance from your base to the job site via Google Maps and adds it as a transparent line item on the invoice (e.g., 'Travel fee — 14.2 miles'). You set the per-mile rate. Clients see the calculation — no disputes.";
  }
  if (/vertical|industry|detailing|hvac|plumbing|landscaping|pressure.*wash|pest|pool|mechanic|junk|tint|appliance|garage|flooring|epoxy|fleet.*wash/.test(last)) {
    return "FieldCore supports 15 service verticals out of the box: Auto Detailing, Pressure Washing, Landscaping/Lawn Care, HVAC, Plumbing, Electrical, Pest Control, Pool Cleaning, Mobile Mechanic, Junk Removal, Window Tint/PPF, Appliance Repair, Garage Door, Flooring/Epoxy, and Commercial Fleet Washing. Every feature works across all verticals.";
  }
  if (/photo|picture|image|before.*after|job photo/.test(last)) {
    return "Job photos are available on Pro+. Technicians upload before, during, and after photos from the mobile app. Photos are attached to the job record and accessible from the dashboard. They serve as documentation for disputes and quality control.";
  }
  if (/contractor|1099|w2|employee|tax/.test(last)) {
    return "FieldCore tracks each technician's classification — employee or 1099 contractor — and stores their tax ID (SSN/EIN) securely. This is used for year-end 1099 reporting. Contractor status is set per-user in Team settings.";
  }
  if (/log in|login|sign in|access.*account|forgot.*password/.test(last)) {
    return "To log in, click 'Log in' in the top-right corner of getfieldcore.com, or go directly to getfieldcore.com/login. If you've forgotten your password, click 'Forgot password?' on the login page and we'll send a reset link to your email.";
  }
  if (/support|help|issue|problem|bug|contact/.test(last)) {
    return "For account or billing issues, email support@getfieldcore.com. For general questions, I can answer most things right here. What do you need help with?";
  }

  // Default: still informative, not generic
  return "FieldCore is the operating system for field service businesses — it replaces Square, Google Calendar, and spreadsheets with one platform. Plans start at $49/mo with no per-user fees. What would you like to know? I can cover pricing, features like the no-show clock or smart caller ID, how payments work, or help you figure out which plan fits your business.";
}

// POST /api/chat
router.post('/', async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required.' });
  }

  const clean = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: String(m.content || '').slice(0, 2000) }))
    .slice(-20);

  if (!clean.length || clean[clean.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Last message must be from user.' });
  }

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.includes('placeholder')) {
    return res.json({ reply: smartFallback(clean) });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system:     SYSTEM_PROMPT,
      messages:   clean,
    });
    const reply = response.content?.[0]?.text;
    if (!reply) return res.json({ reply: smartFallback(clean) });
    res.json({ reply });
  } catch (err) {
    console.error('[chat] Anthropic error:', err.message);
    res.json({ reply: smartFallback(clean) });
  }
});

module.exports = router;
