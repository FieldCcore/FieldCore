import React from 'react';
import { Link } from 'react-router-dom';
import '../landing.css';

export default function Privacy() {
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
        <h1 className="mkt-h1">Privacy <em>Policy.</em></h1>
        <p className="mkt-sub">Effective date: June 1, 2026</p>
      </div>

      <div className="mkt-body" style={{ maxWidth: 760 }}>
        <div style={{ background: '#FFF8ED', border: '1.5px solid rgba(214,181,138,.4)', borderRadius: 12, padding: '24px 28px', display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 40 }}>
          <div style={{ fontSize: 20, flexShrink: 0 }}>⏳</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1C2333', marginBottom: 6 }}>This page is being finalized.</div>
            <div style={{ fontSize: 14, color: '#5F667A', lineHeight: 1.65 }}>
              Our Privacy Policy is currently being reviewed by legal counsel and will be published before our public launch. If you have questions in the meantime, please contact us at{' '}
              <a href="mailto:legal@getfieldcore.com" style={{ color: '#1C2333', fontWeight: 600 }}>legal@getfieldcore.com</a>.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {[
            { title: '1. Information We Collect', body: 'We collect information you provide directly (account details, client data, payment information) and information collected automatically (usage data, device information). We do not collect more than necessary to operate the platform. [Full policy being finalized.]' },
            { title: '2. How We Use Your Information', body: 'We use your information to operate the FieldCore platform, process payments, send notifications you\'ve configured, and improve the service. We do not sell your data or your clients\' data to third parties. [Full policy being finalized.]' },
            { title: '3. Data Sharing', body: 'We share data with Stripe for payment processing, Twilio for SMS notifications, and infrastructure providers (hosting, email delivery). All third-party providers are contractually required to protect your data. [Full policy being finalized.]' },
            { title: '4. Data Retention', body: 'You can export or delete your data at any time. Upon account termination, your data is retained for 90 days for dispute resolution purposes, then deleted. [Full policy being finalized.]' },
            { title: '5. Your Rights', body: 'Depending on your jurisdiction, you may have rights to access, correct, delete, or port your data. Contact us to exercise these rights. [Full policy being finalized.]' },
            { title: '6. Security', body: 'All data is encrypted in transit (TLS 1.2+) and at rest. Payment card data is handled exclusively by Stripe — we never store raw card numbers. We conduct regular security reviews. [Full policy being finalized.]' },
            { title: '7. Contact', body: 'Privacy questions: legal@getfieldcore.com. We respond to all privacy requests within 5 business days.' },
          ].map(s => (
            <div key={s.title}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1C2333', marginBottom: 8 }}>{s.title}</div>
              <div style={{ fontSize: 14, color: '#5F667A', lineHeight: 1.75 }}>{s.body}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 48, padding: '24px 28px', background: '#F8F7F5', borderRadius: 12, border: '1px solid #E6E6E6' }}>
          <div style={{ fontSize: 14, color: '#5F667A' }}>Privacy questions? Contact us at <a href="mailto:legal@getfieldcore.com" style={{ color: '#1C2333', fontWeight: 600 }}>legal@getfieldcore.com</a> or visit our <Link to="/contact" style={{ color: '#1C2333', fontWeight: 600 }}>contact page</Link>.</div>
        </div>
      </div>

      <footer className="mkt-footer">
        <span className="mkt-footer-copy">© 2026 FieldCore Inc. · All rights reserved.</span>
        <div className="mkt-footer-links">
          <Link to="/terms">Terms</Link><Link to="/sms-terms">SMS Terms</Link><Link to="/contact">Contact</Link>
        </div>
      </footer>
    </div>
  );
}
