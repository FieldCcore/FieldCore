import React from 'react';
import { Link } from 'react-router-dom';
import '../landing.css';

export default function Press() {
  return (
    <div className="mkt-page">
      <nav className="mkt-nav">
        <Link to="/" className="mkt-nav-logo">FIELDCORE<sup>™</sup></Link>
        <div className="mkt-nav-links">
          <Link to="/#features">Features</Link>
          <Link to="/about">About</Link>
          <Link to="/contact">Contact</Link>
        </div>
        <div className="mkt-nav-ctas">
          <Link to="/login" className="mkt-btn-ghost" style={{ padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 700 }}>Log in</Link>
          <Link to="/login" className="mkt-btn-sand" style={{ padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 700 }}>Get started</Link>
        </div>
      </nav>

      <div className="mkt-hero">
        <div className="mkt-eyebrow">Press & Media</div>
        <h1 className="mkt-h1">Press resources <em>& brand assets.</em></h1>
        <p className="mkt-sub">Everything you need to write about FieldCore. For press inquiries, contact press@getfieldcore.com.</p>
      </div>

      <div className="mkt-body">
        {/* Boilerplate */}
        <div className="mkt-section">
          <div className="mkt-eyebrow" style={{ color: '#D6B58A' }}>Company Description</div>
          <h2 className="mkt-section-title">Use this boilerplate <em>for all coverage.</em></h2>
          <div style={{ background: '#F8F7F5', border: '1px solid #E6E6E6', borderRadius: 12, padding: 24, marginTop: 20 }}>
            <p style={{ fontSize: 14, color: '#5F667A', lineHeight: 1.8, fontStyle: 'italic', marginBottom: 16 }}>
              "FieldCore is the operating system for field service businesses — replacing Square, Google Calendar, personal phones, and spreadsheets with a single platform purpose-built for mobile and location-based operators. Unlike generic CRM tools adapted for field service, FieldCore was designed from scratch based on real operator conversations, with industry-first features including a no-show arrival clock, smart caller ID, and pre-charge advance notices. FieldCore is incorporated in Delaware and serves service operators across 15 verticals including auto detailing, HVAC, plumbing, landscaping, pest control, and commercial fleet washing."
            </p>
            <button onClick={() => navigator.clipboard?.writeText('FieldCore is the operating system for field service businesses — replacing Square, Google Calendar, personal phones, and spreadsheets with a single platform purpose-built for mobile and location-based operators.')} style={{ padding: '8px 16px', background: '#1C2333', color: '#D6B58A', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Copy boilerplate</button>
          </div>
        </div>

        {/* Key facts */}
        <div className="mkt-section">
          <div className="mkt-eyebrow" style={{ color: '#D6B58A' }}>Key Facts</div>
          <h2 className="mkt-section-title">FieldCore at a glance.</h2>
          <div className="mkt-grid-3" style={{ marginTop: 20 }}>
            {[
              { label: 'Founded',       value: '2025' },
              { label: 'Incorporated',  value: 'Delaware C-Corp' },
              { label: 'Headquarters',  value: 'Remote-first' },
              { label: 'Service verticals', value: '15' },
              { label: 'Industry-first features', value: '8' },
              { label: 'Starting price', value: '$49/month' },
            ].map(f => (
              <div key={f.label} className="mkt-card">
                <div className="mkt-card-label">{f.label}</div>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 24, color: '#1C2333', fontWeight: 400 }}>{f.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Logo downloads */}
        <div className="mkt-section">
          <div className="mkt-eyebrow" style={{ color: '#D6B58A' }}>Brand Assets</div>
          <h2 className="mkt-section-title">Logo & brand guidelines.</h2>
          <div className="mkt-grid-2" style={{ marginTop: 20 }}>
            {[
              { bg: '#1C2333', color: 'white', label: 'Dark version (PNG)', desc: 'For use on light backgrounds', wordColor: '#EDEBE7', accentColor: '#D6B58A' },
              { bg: '#EDEBE7', color: '#1C2333', label: 'Light version (PNG)', desc: 'For use on dark backgrounds', wordColor: '#1C2333', accentColor: '#D6B58A' },
            ].map(v => (
              <div key={v.label} style={{ background: v.bg, borderRadius: 12, padding: 32, border: '1px solid #E6E6E6' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
                  {/* Logo mark preview */}
                  <div style={{ position: 'relative', width: 40, height: 40, flexShrink: 0 }}>
                    {[{t:0,l:14,c:v.wordColor},{t:-5,l:27,c:'#D6B58A'},{t:14,l:0,c:v.wordColor},{t:14,l:27,c:v.wordColor},{t:27,l:14,c:v.wordColor}].map((s,i) => (
                      <div key={i} style={{ position:'absolute', top:s.t, left:s.l, width:13, height:13, borderRadius:3, background:s.c }} />
                    ))}
                  </div>
                  <div style={{ fontFamily:'Inter,sans-serif', fontWeight:800, fontSize:20, letterSpacing:'0.04em', color:v.wordColor }}>FIELDCORE</div>
                </div>
                <div style={{ fontSize: 12, color: v.color === 'white' ? 'rgba(255,255,255,.4)' : '#8A90A2', marginBottom: 16 }}>{v.desc}</div>
                <button style={{ padding: '8px 16px', background: 'transparent', border: `1.5px solid ${v.color === 'white' ? 'rgba(255,255,255,.2)' : '#E6E6E6'}`, color: v.color, borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  Download {v.label}
                </button>
              </div>
            ))}
          </div>

          {/* Brand colors */}
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1C2333', marginBottom: 14 }}>Brand Colors</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                { name: 'Navy', hex: '#1C2333' },
                { name: 'Tan / Gold', hex: '#D6B58A' },
                { name: 'Slate', hex: '#5F667A' },
                { name: 'Steel', hex: '#8A90A2' },
                { name: 'Off-white', hex: '#EDEBE7' },
              ].map(c => (
                <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 6, background: c.hex, border: '1px solid rgba(0,0,0,.08)' }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1C2333' }}>{c.name}</div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#8A90A2' }}>{c.hex}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Press contact */}
        <div style={{ background: '#1C2333', borderRadius: 14, padding: '36px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#D6B58A', marginBottom: 10 }}>Press Contact</div>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 22, color: 'white', marginBottom: 6 }}>press@getfieldcore.com</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.35)' }}>We respond to all press inquiries within 24 hours.</div>
          </div>
          <a href="mailto:press@getfieldcore.com" style={{ padding: '12px 24px', background: '#D6B58A', color: '#1C2333', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>Contact press team →</a>
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
