import React from 'react';
import { Link } from 'react-router-dom';
import '../landing.css';

export default function About() {
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
        <div className="mkt-eyebrow">About FieldCore</div>
        <h1 className="mkt-h1">The operating system<br />for <em>service businesses.</em></h1>
        <p className="mkt-sub">
          We're building the platform that field service operators have always deserved — purpose-built, not retrofitted from generic software.
        </p>
      </div>

      <div className="mkt-body">
        <div className="mkt-section">
          <div className="mkt-grid-2" style={{ alignItems: 'center', gap: 48 }}>
            <div>
              <div className="mkt-eyebrow" style={{ color: '#D6B58A' }}>Our Mission</div>
              <h2 className="mkt-section-title">Built from real operator conversations, <em>not market research.</em></h2>
              <p className="mkt-p">
                FieldCore started with a simple observation: service business owners — detailers, HVAC techs, plumbers, landscapers — were running sophisticated operations from a combination of Square, Google Calendar, their personal phone, and spreadsheets. They were the integration layer. All day, every day.
              </p>
              <p className="mkt-p">
                Every tool we've built came directly from operators describing problems they lose money on. The no-show arrival clock, the pre-charge advance notice, the smart caller ID — all real requests from real operators who had no other option.
              </p>
              <p className="mkt-p">
                We're not a generic CRM adapted for field service. We're not salon software with the logo changed. We are built specifically for operators who run mobile or location-based service businesses — and nothing else.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                { n: '$4,200', l: 'Average annual loss to no-shows without protection' },
                { n: '8 hrs',  l: 'Monthly labor saved per fleet account with automation' },
                { n: '15',     l: 'Service verticals supported out of the box' },
                { n: '$0',     l: 'Per-user fees at any plan tier. Ever.' },
              ].map(s => (
                <div key={s.n} className="mkt-card" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 32, color: '#1C2333', fontWeight: 400, lineHeight: 1, flexShrink: 0 }}>{s.n}</div>
                  <div style={{ fontSize: 13, color: '#5F667A', lineHeight: 1.5 }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mkt-section">
          <div className="mkt-eyebrow" style={{ color: '#D6B58A' }}>The Problem We Solve</div>
          <h2 className="mkt-section-title">Four tools. Zero integration. <em>Your problem to solve.</em></h2>
          <p className="mkt-p" style={{ maxWidth: 700 }}>
            The average field service operator runs Square for payments, Google Calendar for scheduling, their personal phone for client communication, and spreadsheets for everything else. When something goes wrong — a no-show, a surprise dispute, a client who forgets the charge — there's no system. There's just you.
          </p>
          <div className="mkt-grid-3" style={{ marginTop: 32 }}>
            {[
              { title: 'Service Businesses', desc: '1–10 technicians running mobile or location-based services. Detailing, HVAC, plumbing, cleaning, pest control, electrical, lawn care.' },
              { title: 'Solo Operators', desc: 'One person wearing every hat — owner, tech, dispatcher, bookkeeper. FieldCore becomes your ops team without the headcount.' },
              { title: 'Growing Companies', desc: 'Multiple entities, multiple accounts, fleet contracts. Scale plan operators run their entire operation from a single dashboard login.' },
            ].map(c => (
              <div key={c.title} className="mkt-card">
                <div className="mkt-card-label">Built for</div>
                <div className="mkt-card-value">{c.title}</div>
                <div className="mkt-card-sub">{c.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mkt-section">
          <div className="mkt-eyebrow" style={{ color: '#D6B58A' }}>Delaware C-Corp · Founded 2025</div>
          <h2 className="mkt-section-title">Built to last.</h2>
          <p className="mkt-p" style={{ maxWidth: 680 }}>
            FieldCore is incorporated in Delaware, built on enterprise infrastructure, and designed to grow with your business. We're not a side project. We're not pivoting to something else. Service operators are all we think about.
          </p>
          <div style={{ marginTop: 32, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link to="/contact" style={{ padding: '12px 24px', background: '#1C2333', color: '#D6B58A', borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>Contact us →</Link>
            <Link to="/careers" style={{ padding: '12px 24px', background: 'transparent', border: '1.5px solid #E6E6E6', color: '#1C2333', borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>Join the team →</Link>
          </div>
        </div>
      </div>

      <footer className="mkt-footer">
        <span className="mkt-footer-copy">© 2026 FieldCore Inc. · All rights reserved.</span>
        <div className="mkt-footer-links">
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/contact">Contact</Link>
        </div>
      </footer>
    </div>
  );
}
