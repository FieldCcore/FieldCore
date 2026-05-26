import React from 'react';
import { Link } from 'react-router-dom';
import '../landing.css';

const roles = [
  { title: 'Full-Stack Engineer', type: 'Full-time · Remote', dept: 'Engineering', desc: 'Help build the core FieldCore platform — payments, scheduling, mobile, and dispatch. Node.js + React + PostgreSQL + Stripe.' },
  { title: 'Product Designer', type: 'Full-time · Remote', dept: 'Design', desc: 'Own the visual and interaction design across web and mobile. You\'ll work directly with operators to test and iterate on every feature.' },
  { title: 'Customer Success Manager', type: 'Full-time · Remote', dept: 'Customer Success', desc: 'Be the first touchpoint for onboarding operators. You understand service businesses and know how to help them get the most out of the platform.' },
  { title: 'Growth / Marketing Lead', type: 'Full-time · Remote', dept: 'Marketing', desc: 'Own top-of-funnel growth across SEO, content, paid, and partnerships. Deep understanding of SMB buyer journeys preferred.' },
];

const values = [
  { title: 'Operators first', desc: 'Every product decision starts with a real operator conversation. We don\'t build features for the roadmap — we build them because someone is losing money without them.' },
  { title: 'Own the outcome', desc: 'We don\'t track hours. We track results. If a problem exists in your domain, you\'re responsible for solving it — with full support from the team.' },
  { title: 'Move fast, stay precise', desc: 'Shipping matters. So does accuracy. We ship daily and iterate based on real usage — not quarterly planning cycles.' },
  { title: 'Remote-first', desc: 'The team is distributed. Async communication is the default. We hire for output, not presence.' },
];

export default function Careers() {
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
        <div className="mkt-eyebrow">Careers at FieldCore</div>
        <h1 className="mkt-h1">We're building something big. <em>Join us.</em></h1>
        <p className="mkt-sub">
          FieldCore is in its early days. That means the problems are hard, the ownership is real, and the impact on operators is immediate. If that sounds like where you want to be, read on.
        </p>
      </div>

      <div className="mkt-body">
        <div className="mkt-section">
          <div className="mkt-eyebrow" style={{ color: '#D6B58A' }}>Our Values</div>
          <h2 className="mkt-section-title">How we work.</h2>
          <div className="mkt-grid-2" style={{ marginTop: 24 }}>
            {values.map(v => (
              <div key={v.title} className="mkt-card">
                <div style={{ fontWeight: 700, fontSize: 15, color: '#1C2333', marginBottom: 8 }}>{v.title}</div>
                <div className="mkt-card-sub">{v.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mkt-section">
          <div className="mkt-eyebrow" style={{ color: '#D6B58A' }}>Open Roles</div>
          <h2 className="mkt-section-title">Current openings.</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 24 }}>
            {roles.map(r => (
              <div key={r.title} style={{ background: '#F8F7F5', border: '1px solid #E6E6E6', borderRadius: 12, padding: '24px 24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: '#8A90A2' }}>{r.dept}</span>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: '#D6B58A', background: 'rgba(214,181,138,.12)', padding: '2px 8px', borderRadius: 99 }}>{r.type}</span>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#1C2333', marginBottom: 8 }}>{r.title}</div>
                  <div style={{ fontSize: 13, color: '#5F667A', lineHeight: 1.65 }}>{r.desc}</div>
                </div>
                <a href="mailto:careers@getfieldcore.com" style={{ flexShrink: 0, padding: '10px 20px', background: '#1C2333', color: '#D6B58A', borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>Apply →</a>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: '#1C2333', borderRadius: 14, padding: '40px 36px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 24, color: 'white', marginBottom: 8 }}>Don't see your role?</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,.4)' }}>Send us a note. We're always looking for exceptional people.</div>
          </div>
          <a href="mailto:careers@getfieldcore.com" style={{ padding: '12px 24px', background: '#D6B58A', color: '#1C2333', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Email us →</a>
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
