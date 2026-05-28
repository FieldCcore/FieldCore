import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../landing.css';

const sections = [
  {
    heading: 'Getting Started',
    items: [
      {
        q: 'What exactly is FieldCore?',
        a: 'FieldCore is an operating system for field service businesses. It replaces the combination of Square, Google Calendar, your personal phone, and spreadsheets with a single platform purpose-built for mobile and location-based service operators — detailers, HVAC techs, plumbers, landscapers, pest control, and more.',
      },
      {
        q: 'How long does it take to get set up?',
        a: 'Most operators are fully onboarded in under 20 minutes. You connect your Stripe account, import or add your clients, and set up your first service. We walk you through every step. No training calls required.',
      },
      {
        q: 'Do I need to cancel my existing tools before switching?',
        a: 'No — run FieldCore alongside your existing setup until you\'re comfortable. Most operators switch fully within the first two weeks. We\'ll help you migrate your client list for free.',
      },
      {
        q: 'Does FieldCore work for my type of business?',
        a: 'If you run a mobile or location-based service business — auto detailing, HVAC, plumbing, cleaning, landscaping, electrical, pest control, pressure washing, pool service, or similar — yes. FieldCore supports 15 verticals out of the box with more added regularly.',
      },
    ],
  },
  {
    heading: 'Pricing & Plans',
    items: [
      {
        q: 'How much does FieldCore cost?',
        a: 'Plans start at $49/month for the Solo plan (solo operators), $99/month for the Pro plan (teams up to 10), and $199/month for the Scale plan (multi-entity, API access, white-label). All plans include unlimited clients and no per-user fees.',
      },
      {
        q: 'Are there per-user or per-transaction fees?',
        a: 'No per-user fees, ever. FieldCore takes a 1% platform fee on payments processed through the platform. Stripe\'s standard payment processing fees (2.9% + 30¢) also apply — those go to Stripe, not us.',
      },
      {
        q: 'Can I change plans at any time?',
        a: 'Yes. Upgrade or downgrade at any time. Upgrades take effect immediately. Downgrades take effect at the end of your current billing period.',
      },
      {
        q: 'Is there a free trial?',
        a: 'We offer a 14-day free trial on all plans with no credit card required. During the trial you have full access to every feature on the plan you selected.',
      },
      {
        q: 'Do you offer annual billing?',
        a: 'Yes — annual billing saves you two months (equivalent to ~17% off). Contact us if you\'d like to switch.',
      },
    ],
  },
  {
    heading: 'Payments & Banking',
    items: [
      {
        q: 'How do I get paid?',
        a: 'FieldCore uses Stripe Connect to route payments directly to your bank account. When a client pays an invoice or booking deposit, the money goes to your Stripe account (minus Stripe fees and our 1% platform fee), and from there to your bank on your normal payout schedule — typically 2 business days.',
      },
      {
        q: 'What payment methods can my clients use?',
        a: 'Credit cards, debit cards, Apple Pay, Google Pay, and ACH bank transfers. All processed through Stripe.',
      },
      {
        q: 'What happens if a client disputes a charge?',
        a: 'The pre-charge advance notice feature exists specifically to eliminate most disputes before they happen — clients are notified before every recurring charge with a clear description. For disputes that do occur, FieldCore gives you the documentation (job records, signed estimates, timestamps) you need to win.',
      },
      {
        q: 'Can I charge deposits or retainers?',
        a: 'Yes. Booking deposits are configurable per service — set a flat amount or percentage, and clients pay at booking. You can also charge retainers for fleet accounts on a recurring schedule.',
      },
    ],
  },
  {
    heading: 'No-Show Protection',
    items: [
      {
        q: 'What is the no-show arrival clock?',
        a: 'When a technician arrives at a job site and the client isn\'t present, they start the no-show clock from the app. If the client doesn\'t respond or arrive within your configured window (default: 15 minutes), FieldCore automatically charges the no-show fee you set — with a full audit trail. No confrontation, no lost revenue.',
      },
      {
        q: 'How do I set the no-show fee?',
        a: 'In your business settings, configure the no-show fee amount (flat or percentage of the job) and the wait window. These can be different per service type.',
      },
      {
        q: 'Will clients see the no-show policy before booking?',
        a: 'Yes. The no-show policy is displayed on the booking page and included in the confirmation email. Clients acknowledge it at booking. This is your documentation if they later dispute the charge.',
      },
    ],
  },
  {
    heading: 'Client Portal & Communication',
    items: [
      {
        q: 'What is the client portal?',
        a: 'The client portal is a private page your clients can access to view invoices, pay balances, see upcoming appointments, download receipts, and update their contact information. No account creation required — clients log in via a magic link sent to their email.',
      },
      {
        q: 'What is Smart Caller ID?',
        a: 'When any phone number in your client list calls your business number, FieldCore pushes a notification to your phone with the client\'s full profile — name, lifetime value, outstanding balance, last job, and next appointment — before you answer. It surfaces in under 650ms.',
      },
      {
        q: 'Can I send appointment reminders automatically?',
        a: 'Yes. FieldCore sends SMS and email reminders at configurable intervals before each appointment. You control the timing (e.g., 48 hours and 2 hours before), and the message content.',
      },
    ],
  },
  {
    heading: 'Fleet & Commercial Accounts',
    items: [
      {
        q: 'What is fleet billing?',
        a: 'Fleet billing lets you set up recurring invoices for commercial fleet accounts — a car dealership getting monthly detailing, a utility company with a regular service contract, etc. Set it once: the invoice generates automatically, the client receives it, and payment is collected on schedule.',
      },
      {
        q: 'Can I manage multiple vehicles per fleet account?',
        a: 'Yes. Each fleet account tracks individual vehicles, service history per vehicle, and billing tied to the account rather than individual jobs.',
      },
      {
        q: 'Do fleet accounts get access to the client portal?',
        a: 'Yes. Fleet account managers can log into the client portal to view the full service history, download invoices, and pay balances.',
      },
    ],
  },
  {
    heading: 'Technical & Security',
    items: [
      {
        q: 'Is my data secure?',
        a: 'Yes. All data is encrypted in transit (TLS) and at rest. Payment processing is handled entirely by Stripe — we never store raw card numbers. Databases are hosted on enterprise infrastructure with daily backups.',
      },
      {
        q: 'Does FieldCore have a mobile app?',
        a: 'Yes. The FieldCore mobile app is available for iOS and Android. Technicians use it in the field to view jobs, start/complete jobs, trigger the no-show clock, and capture photos.',
      },
      {
        q: 'Can I export my data if I leave?',
        a: 'Yes. You can export your full client list, job history, and invoice records at any time in CSV format. We don\'t hold your data hostage.',
      },
      {
        q: 'Is there an API?',
        a: 'API access is available on the Scale plan. Contact us for API documentation and integration support.',
      },
    ],
  },
];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid #E6E6E6' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '18px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, cursor: 'pointer' }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: '#1C2333', lineHeight: 1.4 }}>{q}</span>
        <span style={{ fontSize: 18, color: '#8A90A2', flexShrink: 0, marginTop: 1 }}>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div style={{ fontSize: 14, color: '#5F667A', lineHeight: 1.75, paddingBottom: 18 }}>{a}</div>
      )}
    </div>
  );
}

export default function Faq() {
  return (
    <div className="mkt-page">
      <nav className="mkt-nav">
        <Link to="/" className="mkt-nav-logo">FIELDCORE<sup>™</sup></Link>
        <div className="mkt-nav-links">
          <Link to="/#features">Features</Link>
          <Link to="/#pricing">Pricing</Link>
          <Link to="/about">About</Link>
          <Link to="/contact">Contact</Link>
        </div>
        <div className="mkt-nav-ctas">
          <Link to="/login" className="mkt-btn-ghost" style={{ padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 700 }}>Log in</Link>
          <Link to="/login" className="mkt-btn-sand" style={{ padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 700 }}>Get started</Link>
        </div>
      </nav>

      <div className="mkt-hero">
        <div className="mkt-eyebrow">FAQ</div>
        <h1 className="mkt-h1">Questions we <em>hear most often.</em></h1>
        <p className="mkt-sub">Can't find what you're looking for? <Link to="/contact" style={{ color: '#1C2333', fontWeight: 600 }}>Contact us</Link> and we'll get back to you within one business day.</p>
      </div>

      <div className="mkt-body" style={{ maxWidth: 860 }}>
        {sections.map(section => (
          <div key={section.heading} className="mkt-section">
            <div className="mkt-eyebrow" style={{ color: '#D6B58A' }}>{section.heading}</div>
            <div style={{ marginTop: 8 }}>
              {section.items.map(item => (
                <FaqItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
          </div>
        ))}

        <div style={{ background: '#1C2333', borderRadius: 14, padding: '36px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, flexWrap: 'wrap', marginTop: 16 }}>
          <div>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 22, color: 'white', marginBottom: 6 }}>Still have questions?</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.4)' }}>We read every message and respond within one business day.</div>
          </div>
          <Link to="/contact" style={{ padding: '12px 24px', background: '#D6B58A', color: '#1C2333', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>Contact us →</Link>
        </div>
      </div>

      <footer className="mkt-footer">
        <span className="mkt-footer-copy">© 2026 FieldCore Inc. · All rights reserved.</span>
        <div className="mkt-footer-links">
          <Link to="/terms">Terms</Link><Link to="/privacy">Privacy</Link><Link to="/contact">Contact</Link>
        </div>
      </footer>
    </div>
  );
}
