import React from 'react';
import { Link } from 'react-router-dom';
import '../landing.css';

export default function Terms() {
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
        <h1 className="mkt-h1">Terms of <em>Service.</em></h1>
        <p className="mkt-sub">Effective date: June 1, 2026</p>
      </div>

      <div className="mkt-body" style={{ maxWidth: 760 }}>
        <div style={{ background: '#FFF8ED', border: '1.5px solid rgba(214,181,138,.4)', borderRadius: 12, padding: '24px 28px', display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 40 }}>
          <div style={{ fontSize: 20, flexShrink: 0 }}>⏳</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1C2333', marginBottom: 6 }}>This page is being finalized.</div>
            <div style={{ fontSize: 14, color: '#5F667A', lineHeight: 1.65 }}>
              Our Terms of Service are currently being reviewed by legal counsel and will be published before our public launch. If you have questions in the meantime, please contact us at{' '}
              <a href="mailto:legal@getfieldcore.com" style={{ color: '#1C2333', fontWeight: 600 }}>legal@getfieldcore.com</a>.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {[
            { title: '1. Acceptance of Terms', body: 'By accessing or using the FieldCore platform, you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the platform. [Full terms being finalized.]' },
            { title: '2. Description of Service', body: 'FieldCore provides a software-as-a-service platform for field service business management, including scheduling, invoicing, client management, and payment processing. [Full terms being finalized.]' },
            { title: '3. Payment Processing', body: 'Payment processing is provided through Stripe. By using payment features, you agree to Stripe\'s Terms of Service. FieldCore charges a 1% platform fee on transactions processed through the platform. [Full terms being finalized.]' },
            { title: '4. Data & Privacy', body: 'Your use of FieldCore is also governed by our Privacy Policy. We do not sell your data or your clients\' data. [Full terms being finalized.]' },
            { title: '5. Limitation of Liability', body: 'To the maximum extent permitted by law, FieldCore shall not be liable for indirect, incidental, special, consequential, or punitive damages. [Full terms being finalized.]' },
          ].map(s => (
            <div key={s.title}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1C2333', marginBottom: 8 }}>{s.title}</div>
              <div style={{ fontSize: 14, color: '#5F667A', lineHeight: 1.75 }}>{s.body}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 48, padding: '24px 28px', background: '#F8F7F5', borderRadius: 12, border: '1px solid #E6E6E6' }}>
          <div style={{ fontSize: 14, color: '#5F667A' }}>Questions about these terms? Contact us at <a href="mailto:legal@getfieldcore.com" style={{ color: '#1C2333', fontWeight: 600 }}>legal@getfieldcore.com</a> or visit our <Link to="/contact" style={{ color: '#1C2333', fontWeight: 600 }}>contact page</Link>.</div>
        </div>
      </div>

      <footer className="mkt-footer">
        <span className="mkt-footer-copy">© 2026 FieldCore Inc. · All rights reserved.</span>
        <div className="mkt-footer-links">
          <Link to="/privacy">Privacy</Link><Link to="/sms-terms">SMS Terms</Link><Link to="/contact">Contact</Link>
        </div>
      </footer>
    </div>
  );
}
