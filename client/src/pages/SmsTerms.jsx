import React from 'react';
import { Link } from 'react-router-dom';
import '../landing.css';

export default function SmsTerms() {
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
        <div className="mkt-eyebrow">Legal</div>
        <h1 className="mkt-h1">SMS Terms <em>& Conditions.</em></h1>
        <p className="mkt-sub">Effective date: June 1, 2026</p>
      </div>

      <div className="mkt-body" style={{ maxWidth: 760 }}>
        <div style={{ background: '#FFF8ED', border: '1.5px solid rgba(214,181,138,.4)', borderRadius: 12, padding: '24px 28px', display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 40 }}>
          <div style={{ flexShrink: 0 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#D6B58A" strokeWidth="1.8" style={{ width: 22, height: 22 }}>
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1C2333', marginBottom: 6 }}>This page is being finalized.</div>
            <div style={{ fontSize: 14, color: '#5F667A', lineHeight: 1.65 }}>
              Our SMS Terms are currently being finalized and will be published before our public launch. If you have questions in the meantime, please contact us at{' '}
              <a href="mailto:legal@getfieldcore.com" style={{ color: '#1C2333', fontWeight: 600 }}>legal@getfieldcore.com</a>.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {[
            { title: 'Program Description', body: 'FieldCore sends SMS messages to service business clients on behalf of FieldCore operators. Messages include appointment reminders, booking confirmations, no-show notices, payment receipts, and other transactional communications. [Full terms being finalized.]' },
            { title: 'Message Frequency', body: 'Message frequency varies based on appointment and payment activity. You may receive up to several messages per week when actively using services from a FieldCore operator. [Full terms being finalized.]' },
            { title: 'Opt-Out', body: 'Reply STOP to any message to opt out of future SMS from a specific FieldCore operator. Reply HELP for assistance. After opting out, you will receive one final confirmation message. [Full terms being finalized.]' },
            { title: 'Message & Data Rates', body: 'Message and data rates may apply. FieldCore does not charge for SMS messages, but your mobile carrier\'s standard rates apply. [Full terms being finalized.]' },
            { title: 'Consent', body: 'By providing your phone number to a FieldCore operator (via booking page, intake form, or verbal collection), you consent to receive transactional SMS messages related to your service appointments and payments. [Full terms being finalized.]' },
            { title: 'Support', body: 'For SMS support, reply HELP or contact support@getfieldcore.com. For carrier information, contact your mobile provider.' },
          ].map(s => (
            <div key={s.title}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1C2333', marginBottom: 8 }}>{s.title}</div>
              <div style={{ fontSize: 14, color: '#5F667A', lineHeight: 1.75 }}>{s.body}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 48, padding: '24px 28px', background: '#F8F7F5', borderRadius: 12, border: '1px solid #E6E6E6' }}>
          <div style={{ fontSize: 14, color: '#5F667A' }}>Questions about SMS? Contact us at <a href="mailto:support@getfieldcore.com" style={{ color: '#1C2333', fontWeight: 600 }}>support@getfieldcore.com</a>.</div>
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
