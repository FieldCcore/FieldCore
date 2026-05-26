import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import '../landing.css';

const BACKEND = import.meta.env.VITE_API_URL || '';

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '', type: 'General' });
  const [sending, setSending]   = useState(false);
  const [done,    setDone]      = useState(false);
  const [error,   setError]     = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) { setError('Name, email, and message are required.'); return; }
    setSending(true);
    setError('');
    try {
      await axios.post(`${BACKEND}/api/contact`, form);
      setDone(true);
    } catch {
      setError('Failed to send. Please email us directly at info@getfieldcore.com.');
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
        <div className="mkt-eyebrow">Contact</div>
        <h1 className="mkt-h1">We'd love to <em>hear from you.</em></h1>
        <p className="mkt-sub">Questions, feedback, partnership inquiries, press requests — we read everything.</p>
      </div>

      <div className="mkt-body" style={{ maxWidth: 900 }}>
        <div className="mkt-grid-2" style={{ gap: 48, alignItems: 'flex-start' }}>
          {/* Form */}
          <div>
            {done ? (
              <div style={{ background: '#F0FDF4', border: '1px solid rgba(21,128,61,.2)', borderRadius: 12, padding: '32px 28px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>✓</div>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 22, color: '#1C2333', marginBottom: 8 }}>Message sent!</div>
                <div style={{ fontSize: 14, color: '#5F667A' }}>We'll get back to you within one business day.</div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div className="mkt-grid-2" style={{ gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Name</label>
                    <input style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Marcus Johnson" />
                  </div>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input style={inputStyle} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="marcus@kmc.com" />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Company (optional)</label>
                  <input style={inputStyle} value={form.company} onChange={e => set('company', e.target.value)} placeholder="KMC Auto Spa" />
                </div>
                <div>
                  <label style={labelStyle}>Topic</label>
                  <select style={inputStyle} value={form.type} onChange={e => set('type', e.target.value)}>
                    {['General', 'Sales', 'Support', 'Partnership', 'Press', 'Careers'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Message</label>
                  <textarea style={{ ...inputStyle, height: 140, resize: 'vertical' }} value={form.message} onChange={e => set('message', e.target.value)} placeholder="Tell us what's on your mind..." />
                </div>
                {error && <div style={{ fontSize: 13, color: '#C62828' }}>{error}</div>}
                <button type="submit" disabled={sending} style={{ padding: '13px 0', background: '#1C2333', color: '#D6B58A', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: sending ? 'wait' : 'pointer', opacity: sending ? 0.6 : 1 }}>
                  {sending ? 'Sending…' : 'Send message →'}
                </button>
              </form>
            )}
          </div>

          {/* Info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {[
              { label: 'General Inquiries', value: 'info@getfieldcore.com' },
              { label: 'Support', value: 'support@getfieldcore.com' },
              { label: 'Press & Media', value: 'press@getfieldcore.com' },
              { label: 'Partnerships', value: 'partners@getfieldcore.com' },
            ].map(c => (
              <div key={c.label} className="mkt-card">
                <div className="mkt-card-label">{c.label}</div>
                <a href={`mailto:${c.value}`} style={{ fontSize: 15, fontWeight: 600, color: '#1C2333', textDecoration: 'none' }}>{c.value}</a>
              </div>
            ))}
            <div className="mkt-card" style={{ background: '#1C2333' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,.3)', marginBottom: 8 }}>Response time</div>
              <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 20, color: 'white', marginBottom: 4 }}>Within one business day.</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.4)' }}>We're a small team and we read every message personally.</div>
            </div>
          </div>
        </div>
      </div>

      <footer className="mkt-footer">
        <span className="mkt-footer-copy">© 2026 FieldCore Inc. · All rights reserved.</span>
        <div className="mkt-footer-links">
          <Link to="/terms">Terms</Link><Link to="/privacy">Privacy</Link>
        </div>
      </footer>
    </div>
  );
}
