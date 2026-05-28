const SYSTEM_PROMPT = `You are the FieldCore AI assistant — a sharp, knowledgeable sales and support expert for FieldCore. You know every feature, price, and detail inside out. You guide business owners confidently to the right plan and help them get started.

PERSONALITY RULES (follow strictly):
- Be direct. Never hedge with "I think" or "I believe" — state facts.
- Never give a generic fallback response. You always have a specific answer.
- Never say "email us for more information" as your primary answer. Always give a full answer first.
- Ask qualifying questions naturally: start by asking "How many technicians do you have?" if someone asks which plan is right for them.
- When someone seems ready to sign up, direct them to click "Start free trial" in the top-right corner of the page, or go to getfieldcore.com/login.
- Keep responses under 5 sentences for simple questions. Use bullet points for comparisons or multi-part answers.
- You cannot access accounts, process payments, or view user data. For billing issues, direct to support@getfieldcore.com.

## WHAT IS FIELDCORE
FieldCore is the operating system for field service businesses. It replaces the combination of Square, Google Calendar, personal phones, and spreadsheets with a single platform built specifically for mobile and location-based service operators.

## PRICING TIERS
Solo $49/mo — 1 operator, under $150K/year: scheduling, invoicing, booking widget, mobile app, unlimited clients
Pro $99/mo — 1-3 techs, $150K-$600K/year: everything in Solo + business phone, no-show clock, smart caller ID, pre-charge notices, 3-layer deposits, fleet billing, job photos, travel fee engine
Scale $199/mo — 4-10 techs, $600K-$2M/year: everything in Pro + multi-entity dashboard, 3 phone numbers + routing, GPS fleet tracking, e-signature, white-label booking
Custom $300+/mo — 10+ techs, $2M+: everything in Scale + dedicated CSM, 99.9% SLA, unlimited numbers, custom dev
No per-user fees ever. No setup fees. 14-day free trial, no credit card required.

## KEY FEATURES
No-Show Arrival Clock (Pro+, industry first): Tech GPS check-in starts 25-min countdown. Two auto-texts to client. If no response: deposit retained automatically, GPS record created for disputes. Saves operators $4,200/year on average.
Smart Caller ID (Pro+, industry first): Full client profile pushed under 650ms before second ring — name, LTV, balance, last job, next appointment, card status, pinned note. Works when app is closed.
Pre-Charge Advance Notices (Pro+, industry first): Auto texts/emails before recurring charges. 12/24/48/72hr windows. Client reply "card changed" → Stripe update link sent automatically. Eliminates most chargebacks.
Travel Fee Engine (Pro+): Auto road-distance calc via Google Maps, transparent line item on invoice.
Fleet Billing (Pro+): Recurring commercial invoices fully automated — generate, send, collect payment. ~8hrs/mo saved per account.
Multi-Entity (Scale+): Unlimited LLCs from one login, separate everything, consolidated reporting.
Deposits: 3-layer system — by service type, by client tier (VIP/Standard/At-Risk), per job override. Auto-retained on no-show.
Booking Widget: Public page, deposit collected at booking, auto confirmation SMS/email, hours-of-operation aware.
Client Portal: Magic link (no password), pay invoices, view history, download receipts.
Business Phone (Pro+): Dedicated number included, smart caller ID, business SMS, call routing (Scale: 3 numbers).
Mobile App (iOS+Android, all plans): View jobs, GPS check-in, photos, mark complete, push notifications.
Hours of Operation: Weekly hours + holiday/emergency closures. Booking widget auto-blocks outside hours.
Service Duration Templates: Service type → auto-fill duration + buffer. Prevents booking overlap.

## PAYMENTS
Stripe Connect — payments route directly to your bank. FieldCore 1% platform fee + Stripe 2.9% + 30¢. No monthly caps. Card, Apple Pay, Google Pay, ACH.

## BETA PROGRAM
First 100 operators get 3 months free on any plan. No credit card. Click "Start free trial" to claim — applied automatically.

## 15 VERTICALS
Auto Detailing, Pressure Washing, Landscaping/Lawn Care, HVAC, Plumbing, Electrical, Pest Control, Pool Cleaning, Mobile Mechanic, Junk Removal, Window Tint/PPF, Appliance Repair, Garage Door, Flooring/Epoxy, Commercial Fleet Washing.

## COMPETITOR COMPARISONS
vs Jobber: Jobber charges per-user fees ($20-35/user), no no-show clock, no built-in phone line. FieldCore Pro $99 flat includes all three.
vs Housecall Pro: HCP $79-189/mo + $39/mo add-on for messaging. FieldCore includes phone. Neither has no-show clock or smart caller ID.
vs ServiceTitan: Enterprise software for 50+ techs at $400-600/mo + mandatory onboarding fees. FieldCore is 5-min setup at $49-199/mo for 1-10 tech operators.
vs Square+Google Calendar+Spreadsheets: The no-show clock alone saves $4,200/year — FieldCore pays for itself.

## NAVIGATION
To sign up: "Click 'Start free trial' top-right corner — no credit card, 5 minutes, first 100 get 3 months free."
To log in: "Click 'Log in' top-right or go to getfieldcore.com/login."
To see pricing: "Scroll down the homepage or ask me — I'll walk you through the right plan."
To see the mobile app demo: "Go to getfieldcore.com/demo."`;

function smartFallback(messages) {
  const last = (messages[messages.length - 1]?.content || '').toLowerCase();

  if (/jobber|housecall|servicetitan|competitor|compare|vs |better than|switch/.test(last))
    return "FieldCore vs Jobber: Jobber charges per-user fees, no no-show clock, no built-in phone. FieldCore Pro ($99/mo flat) includes all three.\n\nFieldCore vs Housecall Pro: HCP charges $39/mo extra for messaging — FieldCore includes the phone line. Neither competitor has the no-show clock or smart caller ID.\n\nFieldCore vs ServiceTitan: Enterprise software for 50+ techs at $400-600/mo. FieldCore is built for 1-10 tech operators at $49-199/mo with 5-minute setup.";
  if (/no.?show|arrival clock|client didn.t show/.test(last))
    return "The No-Show Arrival Clock (Pro, $99/mo) is an industry first. Tech GPS check-in starts a 25-min countdown. Two auto-texts go to the client. If no response: deposit retained automatically, tech released, GPS record created for disputes. Saves operators $4,200/year on average.";
  if (/caller id|smart caller|who.s calling|before.*ring/.test(last))
    return "Smart Caller ID (Pro+) pushes a full client profile before the second ring — under 650ms. You see name, lifetime value, balance, last job, next appointment, card status, and a pinned note. Works even with the app closed. Business phone is included in Pro ($99/mo), not an add-on.";
  if (/pre.?charge|advance notice|recurring charge|before.*charge/.test(last))
    return "Pre-Charge Advance Notices (Pro+) auto-text or email every recurring client before you charge them. Set 12, 24, 48, or 72 hours in advance. Client replies 'card changed' → Stripe update link sent automatically. Eliminates most chargebacks before they happen.";
  if (/price|cost|how much|plan|tier/.test(last))
    return "FieldCore plans:\n• Solo $49/mo — 1 operator\n• Pro $99/mo — 1-3 techs, includes business phone + no-show clock (most popular)\n• Scale $199/mo — 4-10 techs, multi-entity\n• Custom $300+/mo — 10+ techs\n\nNo per-user fees ever. 14-day free trial, no credit card. How many technicians do you have? I'll recommend the right plan.";
  if (/which plan|right plan|recommend|what plan/.test(last))
    return "How many technicians do you have? That's the key question. Solo operator → $49/mo. 1-3 techs who need phone and no-show protection → Pro $99/mo. 4+ techs or multiple entities → Scale $199/mo.";
  if (/beta|free.*month|3 month|first 100/.test(last))
    return "The first 100 operators get 3 months free on any plan — no credit card required. Click 'Start free trial' in the top-right corner. Beta slots apply automatically at signup.";
  if (/sign up|get started|start|trial|free|create account/.test(last))
    return "Click 'Start free trial' in the top-right corner — no credit card, setup takes 5 minutes. The first 100 operators also get 3 months free as part of the beta.";
  if (/payment|stripe|pay|invoice|fee|transaction/.test(last))
    return "Payments go directly to your Stripe account — FieldCore never holds your money. Fees: 2.9% + 30¢ (Stripe standard) + 1% FieldCore platform fee. Clients pay by card, Apple Pay, Google Pay, or ACH. Invoices auto-generate when jobs complete.";
  if (/mobile app|tech app|ios|android/.test(last))
    return "The FieldCore mobile app (iOS + Android) is included on all plans. Techs view jobs, GPS check-in (triggers no-show clock), upload before/during/after photos, mark jobs complete, and receive Smart Caller ID push notifications. Search 'FieldCore' on App Store or Google Play.";
  if (/client portal|magic link/.test(last))
    return "The Client Portal sends clients a magic link — no password, no app download. They view and pay invoices, see appointments, download receipts, and update contact info.";
  if (/booking|online booking|widget/.test(last))
    return "The Booking Widget is a public page clients access via link or QR code. They pick service, date, time — deposit collected at booking via Stripe. Auto confirmation by email and SMS. The widget respects your hours of operation automatically.";
  if (/deposit/.test(last))
    return "FieldCore has a 3-layer deposit system (Pro+): by service type, by client tier (VIP/Standard/At-Risk), and per individual job. Deposits are collected at booking via Stripe and automatically retained when the no-show clock triggers.";
  if (/multi.entity|multiple.*llc|entity|franchise/.test(last))
    return "Multi-Entity Dashboard (Scale, $199/mo) lets you manage unlimited LLCs from one login. Each entity has its own clients, jobs, invoices, and phone numbers. One-tap switching. Consolidated revenue reporting across all entities.";
  if (/fleet|commercial|recurring.*invoice/.test(last))
    return "Fleet Billing Automation (Pro+) handles recurring commercial accounts end-to-end: jobs generate automatically, invoices send on close, payment collected via stored card. About 8 hours/month saved per fleet account.";
  if (/hours|operating hours|holiday|closed/.test(last))
    return "Set weekly operating hours, holiday closures, and emergency closures in FieldCore. The booking widget automatically blocks clients from booking outside your available hours.";
  if (/vertical|industry|detailing|hvac|plumbing|landscaping|pressure|pest|pool|mechanic|junk|tint|appliance|garage|flooring|epoxy/.test(last))
    return "FieldCore supports 15 verticals: Auto Detailing, Pressure Washing, Landscaping, HVAC, Plumbing, Electrical, Pest Control, Pool Cleaning, Mobile Mechanic, Junk Removal, Window Tint/PPF, Appliance Repair, Garage Door, Flooring/Epoxy, and Commercial Fleet Washing.";

  return "FieldCore is the operating system for field service businesses — replacing Square, Google Calendar, and spreadsheets with one platform. Plans from $49/mo, no per-user fees. What would you like to know about features, pricing, or how it compares to Jobber or Housecall Pro?";
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || !messages.length)
    return res.status(400).json({ error: 'messages array required' });

  const clean = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: String(m.content || '').slice(0, 2000) }))
    .slice(-20);

  if (!clean.length || clean[clean.length - 1].role !== 'user')
    return res.status(400).json({ error: 'Last message must be from user' });

  const key = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!key || key.includes('placeholder')) {
    return res.json({ reply: smartFallback(clean) });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: clean,
      }),
    });

    if (!response.ok) {
      console.error('[chat] Anthropic error:', response.status, await response.text());
      return res.json({ reply: smartFallback(clean) });
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text;
    return res.json({ reply: reply || smartFallback(clean) });
  } catch (err) {
    console.error('[chat] fetch error:', err.message);
    return res.json({ reply: smartFallback(clean) });
  }
}
