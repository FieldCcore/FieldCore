import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import '../landing.css';

const BACKEND = import.meta.env.VITE_API_URL || '';

const tiers = [
  {
    name: 'Referral Partner',
    desc: 'Refer service business owners to FieldCore and earn a commission for every operator who signs up and activates.',
    perks: ['20% recurring commission for 12 months', 'Unique referral link + dashboard', 'Co-branded one-pager', 'Partner badge'],
    cta: 'Best for: business coaches, accountants, insurance brokers, field service consultants',
  },
  {
    name: 'Integration Partner',
    desc: 'Build an integration with the FieldCore API and list it in our partner directory. Reach thousands of active operators.',
    perks: ['API access + sandbox environment', 'Listed in partner directory', 'Joint go-to-market support', 'Dedicated partner Slack channel'],
    cta: 'Best for: SaaS companies, tool vendors, software developers',
  },
  {
    name: 'Affiliate Partner',
    desc: 'Content creators, industry influencers, and trade association partners who promote FieldCore to their audience.',
    perks: ['25% first-year commission', 'Early access to new features', 'Co-marketing opportunities', 'Custom landing page'],
    cta: 'Best for: YouTubers, industry podcasters, trade associations, training programs',
  },
];

const logos = [
  'Auto detailing associations', 'HVAC trade groups', 'Plumbing networks',
  'Landscaping coalitions', 'Pest control franchises', 'Pressure washing communities',
];

export default function Partners() {
  const [form, setForm]   = useState({ name: '', email: '', company: '', website: '', type: 'Referral Partner', notes: '' });
  const [sending, setSending] = useState(false);
  const [done, setDone]   = useState(false);
  const [error, setError] = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name || !form.email) { setError('Name and email are required.'); return; }
    setSending(true);
    setError('');
    try {
      await axios.post(`${BACKEND}/api/contact`, {
        name: form.name,
        email: form.email,
        company: form.company,
        message: `Partner application\nType: ${form.type}\nWebsite: ${form.website}\nNotes: ${form.notes}`,
        type: 'Partnership',
      });
      setDone(true);
    } catch {
      setError('Failed to submit. Please email partners@getfieldcore.com directly.');
    } finally {
      setSending(false);
    }
  }

  const inputStyle = {
    width: '100%', padding: '12px 14px', border: '1.5px solid #E6E6E6',
    borderRadius: 8, fontSize: 14, color: '#1C2333', outline: 'none', background: 'white',
    fontFamily: 'Inter, sans-serif',
  };
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 600, color: '#8A90A2', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em', fontFamily: 'DM Mono, monospace' };

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
        <div className="mkt-eyebrow">Partners</div>
        <h1 className="mkt-h1">Grow together with <em>FieldCore.</em></h1>
        <p className="mkt-sub">Join our partner network — referral commissions, co-marketing, and API integrations for the field service industry.</p>
      </div>

      <div className="mkt-body">
        {/* Partner tiers */}
        <div className="mkt-section">
          <div className="mkt-eyebrow" style={{ color: '#D6B58A' }}>Partnership Tiers</div>
          <h2 className="mkt-section-title">Find the right <em>partnership model.</em></h2>
          <div className="mkt-grid-3" style={{ marginTop: 24 }}>
            {tiers.map(t => (
              <div key={t.name} className="mkt-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#1C2333', marginBottom: 8 }}>{t.name}</div>
                  <div style={{ fontSize: 13, color: '#5F667A', lineHeight: 1.65 }}>{t.desc}</div>
                </div>
                <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {t.perks.map(p => (
                    <li key={p} style={{ fontSize: 13, color: '#1C2333', lineHeight: 1.5 }}>{p}</li>
                  ))}
                </ul>
                <div style={{ fontSize: 11, color: '#8A90A2', fontStyle: 'italic', borderTop: '1px solid #E6E6E6', paddingTop: 12, marginTop: 'auto' }}>{t.cta}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="mkt-section">
          <div className="mkt-grid-3" style={{ marginTop: 0 }}>
            {[
              { n: '20%', l: 'Recurring commission on referrals (first 12 months)' },
              { n: '15',  l: 'Service verticals your referrals can come from' },
              { n: '24h', l: 'Partner application response time' },
            ].map(s => (
              <div key={s.n} className="mkt-card" style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 40, color: '#1C2333', fontWeight: 400, lineHeight: 1 }}>{s.n}</div>
                <div style={{ fontSize: 13, color: '#5F667A', marginTop: 8, lineHeight: 1.5 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Application form */}
        <div className="mkt-section">
          <div className="mkt-eyebrow" style={{ color: '#D6B58A' }}>Apply Now</div>
          <h2 className="mkt-section-title">Partner application.</h2>
          <div className="mkt-grid-2" style={{ gap: 48, alignItems: 'flex-start', marginTop: 24 }}>
            <div>
              {done ? (
                <div style={{ background: '#F0FDF4', border: '1px solid rgba(21,128,61,.2)', borderRadius: 12, padding: '32px 28px', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 12 }}>✓</div>
                  <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 22, color: '#1C2333', marginBottom: 8 }}>Application received!</div>
                  <div style={{ fontSize: 14, color: '#5F667A' }}>We'll review your application and follow up within 24 hours.</div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div className="mkt-grid-2" style={{ gap: 14 }}>
                    <div>
                      <label style={labelStyle}>Full Name</label>
                      <input style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Your name" />
                    </div>
                    <div>
                      <label style={labelStyle}>Email</label>
                      <input style={inputStyle} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@company.com" />
                    </div>
                  </div>
                  <div className="mkt-grid-2" style={{ gap: 14 }}>
                    <div>
                      <label style={labelStyle}>Company / Organization</label>
                      <input style={inputStyle} value={form.company} onChange={e => set('company', e.target.value)} placeholder="Company name" />
                    </div>
                    <div>
                      <label style={labelStyle}>Website</label>
                      <input style={inputStyle} value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://yoursite.com" />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Partnership type</label>
                    <select style={inputStyle} value={form.type} onChange={e => set('type', e.target.value)}>
                      {tiers.map(t => <option key={t.name}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Tell us about your audience or integration</label>
                    <textarea style={{ ...inputStyle, height: 120, resize: 'vertical' }} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Who do you serve? How would FieldCore fit?" />
                  </div>
                  {error && <div style={{ fontSize: 13, color: '#C62828' }}>{error}</div>}
                  <button type="submit" disabled={sending} style={{ padding: '13px 0', background: '#1C2333', color: '#D6B58A', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: sending ? 'wait' : 'pointer', opacity: sending ? 0.6 : 1 }}>
                    {sending ? 'Submitting…' : 'Submit application →'}
                  </button>
                </form>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="mkt-card">
                <div className="mkt-card-label">Questions?</div>
                <a href="mailto:partners@getfieldcore.com" style={{ fontSize: 15, fontWeight: 600, color: '#1C2333', textDecoration: 'none' }}>partners@getfieldcore.com</a>
              </div>
              <div className="mkt-card">
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1C2333', marginBottom: 10 }}>Who we partner with</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {logos.map(l => (
                    <div key={l} style={{ fontSize: 13, color: '#5F667A', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#D6B58A', flexShrink: 0 }} />
                      {l}
                    </div>
                  ))}
                </div>
              </div>
              <div className="mkt-card" style={{ background: '#1C2333' }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,.3)', marginBottom: 8 }}>Response SLA</div>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 20, color: 'white', marginBottom: 4 }}>Within 24 hours.</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,.4)' }}>All partner applications reviewed by a human, not a bot.</div>
              </div>
            </div>
          </div>
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
