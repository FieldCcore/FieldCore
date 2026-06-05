import React from 'react';
import { Link } from 'react-router-dom';
import '../landing.css';

const posts = [
  { slug: 'no-show-protection', date: 'May 20, 2026', tag: 'Product', title: 'How the No-Show Arrival Clock works — and why no other platform has built it', excerpt: 'We designed the no-show clock from scratch after talking to dozens of detailers and HVAC techs who were losing $300–$800 per missed appointment with zero documentation. Here\'s exactly how it works.' },
  { slug: 'pre-charge-notices', date: 'May 14, 2026', tag: 'Education', title: 'The $0 chargeback strategy: pre-charge notices before every recurring payment', excerpt: 'Chargebacks cost more than just the disputed amount — they carry fees, damage your processor relationship, and take hours to fight. One feature eliminates most of them entirely.' },
  { slug: 'fleet-billing-automation', date: 'May 8, 2026', tag: 'Education', title: 'Fleet billing automation: set it once, get paid every month', excerpt: 'Commercial fleet accounts are high-value and low-margin — not because the contracts are small, but because billing them manually costs hours every single month. Here\'s how to fix that.' },
  { slug: 'smart-caller-id', date: 'April 30, 2026', tag: 'Product', title: 'Smart Caller ID: seeing a full 9-zone client profile before you answer', excerpt: 'When an unknown number calls your business phone, you answer blind. FieldCore delivers a complete client profile — LTV, balance, last job, next appointment — in under 650ms.' },
  { slug: 'multi-entity-guide', date: 'April 22, 2026', tag: 'Guide', title: 'Running multiple LLCs? Here\'s how operators manage them from one dashboard', excerpt: 'Many service business owners run more than one entity — an auto detailing LLC and a pressure washing LLC, for example. Until now, that meant two of everything. Not anymore.' },
  { slug: 'stripe-connect-operators', date: 'April 15, 2026', tag: 'Product', title: 'How FieldCore routes payments directly to your bank account', excerpt: 'Every dollar your clients pay goes to your Stripe account — minus a 1% platform fee. Here\'s how Stripe Connect works and why it matters for cash flow.' },
];

const tagColors = { Product: { bg: '#EEF2FF', color: '#3730A3' }, Education: { bg: '#F0FDF4', color: '#15803D' }, Guide: { bg: '#FFF7ED', color: '#C2410C' } };

export default function Blog() {
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
        <div className="mkt-eyebrow">The FieldCore Blog</div>
        <h1 className="mkt-h1">Field notes for <em>service operators.</em></h1>
        <p className="mkt-sub">Guides, product updates, and operator stories from the field.</p>
      </div>

      <div className="mkt-body">
        {/* Featured */}
        <div className="mkt-section">
          <div style={{ background: '#F8F7F5', border: '1px solid #E6E6E6', borderRadius: 14, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <div style={{ background: '#1C2333', padding: 40, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: 280 }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', color: '#D6B58A', marginBottom: 12 }}>Featured</div>
              <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 28, color: 'white', lineHeight: 1.15, fontWeight: 400 }}>
                {posts[0].title}
              </div>
            </div>
            <div style={{ padding: 40 }}>
              <div style={{ fontSize: 12, color: '#8A90A2', marginBottom: 12 }}>{posts[0].date} · {posts[0].tag}</div>
              <p style={{ fontSize: 15, color: '#5F667A', lineHeight: 1.75, marginBottom: 24 }}>{posts[0].excerpt}</p>
              <span style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: '#9ca3af', letterSpacing: '.06em' }}>COMING SOON</span>
            </div>
          </div>
        </div>

        {/* Post grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {posts.slice(1).map(p => {
            const tc = tagColors[p.tag] || tagColors.Guide;
            return (
              <div key={p.slug} className="mkt-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: '#8A90A2', fontFamily: 'DM Mono, monospace' }}>{p.date}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: tc.bg, color: tc.color }}>{p.tag}</span>
                </div>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 20, color: '#1C2333', lineHeight: 1.2, fontWeight: 400 }}>{p.title}</div>
                <p style={{ fontSize: 13, color: '#5F667A', lineHeight: 1.65, flex: 1 }}>{p.excerpt}</p>
                <span style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: '#9ca3af', letterSpacing: '.06em' }}>COMING SOON</span>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 48, textAlign: 'center', padding: '32px', background: '#F8F7F5', borderRadius: 12, border: '1px solid #E6E6E6' }}>
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 22, color: '#1C2333', marginBottom: 8 }}>More posts coming soon.</div>
          <p style={{ fontSize: 14, color: '#5F667A' }}>We publish weekly guides, product updates, and operator case studies.</p>
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
