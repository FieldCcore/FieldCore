import React from 'react';
import { Link } from 'react-router-dom';
import '../landing.css';

const updates = [
  {
    date: 'May 20, 2026',
    version: 'v1.4',
    tag: 'Feature',
    title: 'No-Show Arrival Clock — GA',
    items: [
      'Technicians can start the no-show clock from the mobile app when a client isn\'t present at the job site.',
      'Configurable wait window (default 15 minutes) before the no-show fee is charged automatically.',
      'Full audit trail with timestamps, GPS coordinates, and photo evidence support.',
      'Client receives SMS notification when clock starts and when the fee is charged.',
    ],
  },
  {
    date: 'May 14, 2026',
    version: 'v1.3',
    tag: 'Feature',
    title: 'Pre-Charge Advance Notices',
    items: [
      'Recurring payments now trigger a notice email/SMS to clients 72 hours before the charge.',
      'Notice includes service description, amount, and a link to update their payment method.',
      'Configurable notice window: 24, 48, or 72 hours before charge.',
      'Dramatically reduces chargebacks and payment surprises on recurring accounts.',
    ],
  },
  {
    date: 'May 8, 2026',
    version: 'v1.3',
    tag: 'Improvement',
    title: 'Fleet Billing Automation',
    items: [
      'Fleet accounts can now have fully automated monthly invoice generation.',
      'Set billing date, amount, line items, and payment terms once — invoices generate and send automatically.',
      'Fleet managers receive invoices via email with one-click payment via the client portal.',
      'Invoice history and vehicle service history now live side-by-side in the account view.',
    ],
  },
  {
    date: 'April 30, 2026',
    version: 'v1.2',
    tag: 'Feature',
    title: 'Smart Caller ID',
    items: [
      'Any number in your client list triggers a push notification when they call your business line.',
      'Notification includes: client name, LTV, outstanding balance, last job date, and next appointment.',
      'Surfaces in under 650ms — before the second ring.',
      'Works with any phone number — mobile app not required for the caller.',
    ],
  },
  {
    date: 'April 22, 2026',
    version: 'v1.2',
    tag: 'Feature',
    title: 'Multi-Entity Dashboard (Scale plan)',
    items: [
      'Scale plan operators can now manage multiple LLCs from a single login.',
      'Switch between entities in the nav — separate client lists, billing, and reporting per entity.',
      'Consolidated revenue reporting across all entities in one view.',
      'Separate Stripe Connect accounts per entity with unified platform-level reporting.',
    ],
  },
  {
    date: 'April 15, 2026',
    version: 'v1.1',
    tag: 'Feature',
    title: 'Stripe Connect — Direct Payouts',
    items: [
      'Operators now connect their own Stripe account for direct payment routing.',
      'Invoice and deposit payments route directly to the operator\'s bank account (minus Stripe fees + 1% platform fee).',
      'No more waiting for platform payouts — money moves on Stripe\'s standard schedule (typically 2 business days).',
      'Stripe Express dashboard accessible from Billing settings.',
    ],
  },
  {
    date: 'April 8, 2026',
    version: 'v1.1',
    tag: 'Improvement',
    title: 'Client Portal — Magic Link Auth',
    items: [
      'Clients can now access their invoices, appointments, and receipts without creating an account.',
      'Magic link sent to client\'s email on demand — no passwords, no friction.',
      'Clients can pay outstanding balances, download PDF receipts, and update contact info from the portal.',
      'Session expires after 24 hours for security.',
    ],
  },
  {
    date: 'April 1, 2026',
    version: 'v1.0',
    tag: 'Launch',
    title: 'FieldCore — Initial Launch',
    items: [
      'Scheduling and dispatch: drag-and-drop calendar, job status tracking, technician assignment.',
      'Client CRM: full client profiles, job history, notes, and contact management.',
      'Invoicing: create, send, and collect payment on invoices in one flow.',
      'Booking pages: public-facing booking links with deposit collection and confirmation emails.',
      'SMS notifications: appointment reminders, job updates, and payment receipts via Twilio.',
      'Role-based access: owner, manager, and tech roles with granular permissions.',
      'Mobile app: iOS and Android apps for technicians in the field.',
    ],
  },
];

const tagColors = {
  Feature:     { bg: '#EEF2FF', color: '#3730A3' },
  Improvement: { bg: '#F0FDF4', color: '#15803D' },
  Fix:         { bg: '#FFF7ED', color: '#C2410C' },
  Launch:      { bg: 'rgba(214,181,138,.15)', color: '#92671E' },
};

export default function Updates() {
  return (
    <div className="mkt-page">
      <nav className="mkt-nav">
        <Link to="/" className="mkt-nav-logo">FIELDCORE<sup>™</sup></Link>
        <div className="mkt-nav-links">
          <Link to="/#features">Features</Link>
          <Link to="/#pricing">Pricing</Link>
          <Link to="/blog">Blog</Link>
          <Link to="/contact">Contact</Link>
        </div>
        <div className="mkt-nav-ctas">
          <Link to="/login" className="mkt-btn-ghost" style={{ padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 700 }}>Log in</Link>
          <Link to="/login" className="mkt-btn-sand" style={{ padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 700 }}>Get started</Link>
        </div>
      </nav>

      <div className="mkt-hero">
        <div className="mkt-eyebrow">Product Updates</div>
        <h1 className="mkt-h1">What's new in <em>FieldCore.</em></h1>
        <p className="mkt-sub">Every improvement, feature, and fix — shipped for operators.</p>
      </div>

      <div className="mkt-body" style={{ maxWidth: 780 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {updates.map((u, i) => {
            const tc = tagColors[u.tag] || tagColors.Fix;
            return (
              <div key={u.version + u.title} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '0 32px', paddingBottom: 40 }}>
                {/* Left: date + version */}
                <div style={{ paddingTop: 2 }}>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#8A90A2', letterSpacing: '.08em', marginBottom: 4 }}>{u.date}</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: 700, color: '#1C2333' }}>{u.version}</div>
                  {i < updates.length - 1 && (
                    <div style={{ marginTop: 12, width: 1, height: 'calc(100% - 32px)', background: '#E6E6E6', marginLeft: 'auto', marginRight: 'auto' }} />
                  )}
                </div>

                {/* Right: content */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: tc.bg, color: tc.color }}>{u.tag}</span>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#1C2333', marginBottom: 12 }}>{u.title}</div>
                  <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {u.items.map((item, j) => (
                      <li key={j} style={{ fontSize: 14, color: '#5F667A', lineHeight: 1.65 }}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ background: '#F8F7F5', border: '1px solid #E6E6E6', borderRadius: 12, padding: '28px 28px', textAlign: 'center', marginTop: 8 }}>
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 22, color: '#1C2333', marginBottom: 8 }}>Updates ship weekly.</div>
          <p style={{ fontSize: 14, color: '#5F667A', marginBottom: 20 }}>Follow the blog for deep dives on every major feature.</p>
          <Link to="/blog" style={{ padding: '11px 22px', background: '#1C2333', color: '#D6B58A', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Read the blog →</Link>
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
