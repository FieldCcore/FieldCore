import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const FEATURES = [
  {
    icon: '📋',
    title: 'Smart Dispatch',
    desc: 'Assign jobs, track technicians on a live map, and get real-time status updates from the field.',
  },
  {
    icon: '💳',
    title: 'Deposit Protection',
    desc: 'Require deposits before booking to eliminate no-shows. Automatic Stripe checkout, zero chasing.',
  },
  {
    icon: '📊',
    title: 'Revenue Analytics',
    desc: 'Daily, weekly, and monthly revenue breakdowns by technician and service type. Know your numbers.',
  },
  {
    icon: '📱',
    title: 'Business Phone',
    desc: 'Two-way SMS with clients. Send booking confirmations and reminders with one click.',
  },
  {
    icon: '📅',
    title: 'Online Booking',
    desc: 'Shareable booking page lets clients self-schedule. Deposits collected automatically at booking.',
  },
  {
    icon: '👥',
    title: 'Team Management',
    desc: 'Role-based access for owners, managers, and techs. Track performance and commissions per technician.',
  },
];

export default function Landing() {
  const { user, loading } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (!loading && user) nav('/dashboard', { replace: true });
  }, [user, loading, nav]);

  if (loading) return null;

  return (
    <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", background: '#F4F3F0', minHeight: '100vh', color: '#1C2333' }}>

      {/* Header */}
      <header style={{ background: '#1C2333', padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '.1em', color: '#fff' }}>
            FIELD<span style={{ color: '#D6B58A' }}>CORE</span>
          </span>
          <sup style={{ fontSize: 8, color: '#D6B58A', fontWeight: 700, marginLeft: 1 }}>™</sup>
        </div>
        <Link
          to="/login"
          style={{ fontSize: 13, fontWeight: 600, color: '#D6B58A', textDecoration: 'none', padding: '6px 16px', border: '1px solid #D6B58A', borderRadius: 6 }}
        >
          Sign In
        </Link>
      </header>

      {/* Hero */}
      <section style={{ background: '#1C2333', padding: '80px 40px 100px', textAlign: 'center' }}>
        <div style={{ maxWidth: 660, margin: '0 auto' }}>
          <div style={{ display: 'inline-block', background: 'rgba(214,181,138,.12)', color: '#D6B58A', fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', padding: '4px 12px', borderRadius: 20, marginBottom: 24 }}>
            Field Service Management
          </div>
          <h1 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 800, color: '#fff', lineHeight: 1.15, marginBottom: 20 }}>
            Run your field service business<br />
            <span style={{ color: '#D6B58A' }}>from one dashboard.</span>
          </h1>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,.6)', lineHeight: 1.65, marginBottom: 40, maxWidth: 520, margin: '0 auto 40px' }}>
            Dispatch, invoicing, deposits, SMS, and team management — built for operators who do the work.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              to="/login"
              style={{ background: '#D6B58A', color: '#1C2333', fontWeight: 700, fontSize: 15, padding: '13px 32px', borderRadius: 8, textDecoration: 'none' }}
            >
              Get Started Free
            </Link>
            <Link
              to="/login"
              style={{ background: 'transparent', color: '#fff', fontWeight: 600, fontSize: 15, padding: '13px 32px', borderRadius: 8, textDecoration: 'none', border: '1px solid rgba(255,255,255,.2)' }}
            >
              Sign In →
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ padding: '72px 40px', maxWidth: 1000, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: 28, fontWeight: 700, color: '#1C2333', marginBottom: 8 }}>
          Everything your crew needs
        </h2>
        <p style={{ textAlign: 'center', color: '#5F667A', marginBottom: 48, fontSize: 15 }}>
          One platform, zero spreadsheets.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ background: '#fff', borderRadius: 10, padding: '24px 20px', border: '1px solid #E6E6E6' }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#1C2333', marginBottom: 6 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: '#5F667A', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section id="cta" style={{ background: '#1C2333', padding: '72px 40px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 12 }}>
          Ready to take control?
        </h2>
        <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 15, marginBottom: 32 }}>
          Get your team on FieldCore today.
        </p>
        <Link
          to="/login"
          style={{ background: '#D6B58A', color: '#1C2333', fontWeight: 700, fontSize: 15, padding: '13px 36px', borderRadius: 8, textDecoration: 'none' }}
        >
          Start Free Trial →
        </Link>
      </section>

      {/* Footer */}
      <footer style={{ background: '#1C2333', borderTop: '1px solid rgba(255,255,255,.06)', padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', fontWeight: 700, letterSpacing: '.08em' }}>
          FIELDCORE™
        </span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,.25)' }}>
          © {new Date().getFullYear()} FieldCore. All rights reserved.
        </span>
      </footer>
    </div>
  );
}
