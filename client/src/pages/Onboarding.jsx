import React, { useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const CATEGORIES = {
  'Auto Detailing':  ['Interior Detail', 'Exterior Wash', 'Full Detail', 'Paint Correction', 'Ceramic Coating', 'Headlight Restoration'],
  'HVAC':            ['AC Repair', 'Heating Repair', 'Installation', 'Maintenance', 'Inspection', 'Duct Cleaning'],
  'Plumbing':        ['Leak Repair', 'Drain Cleaning', 'Water Heater', 'Fixture Install', 'Inspection', 'Sewer Service'],
  'Lawn Care':       ['Lawn Mowing', 'Landscaping', 'Fertilization', 'Aeration', 'Hedge Trimming', 'Seasonal Cleanup'],
  'Cleaning':        ['Standard Clean', 'Deep Clean', 'Move-out Clean', 'Window Cleaning', 'Carpet Clean', 'Commercial Clean'],
  'Electrical':      ['Wiring', 'Panel Upgrade', 'Outlet Install', 'Lighting', 'Generator Install', 'Inspection'],
  'Pest Control':    ['General Pest', 'Termite Treatment', 'Rodent Control', 'Mosquito Control', 'Inspection', 'Preventive Treatment'],
  'Other':           ['General Service', 'Inspection', 'Maintenance', 'Repair', 'Installation', 'Consultation'],
};

const CAT_KEYS = Object.keys(CATEGORIES);

function Step({ n, current }) {
  const done   = n < current;
  const active = n === current;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 26, height: 26, borderRadius: '50%',
        background: done ? '#D6B58A' : active ? '#1C2333' : 'transparent',
        border: done ? 'none' : active ? 'none' : '2px solid rgba(255,255,255,.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700,
        color: done ? '#1C2333' : active ? '#D6B58A' : 'rgba(255,255,255,.35)',
        transition: 'all .2s',
      }}>
        {done ? '✓' : n}
      </div>
      <span style={{ fontSize: 11, color: active ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.3)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '.06em' }}>
        {n === 1 ? 'Business' : n === 2 ? 'Services' : 'Done'}
      </span>
    </div>
  );
}

function Divider() {
  return <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.1)', margin: '0 8px' }} />;
}

export default function Onboarding() {
  const { user } = useAuth();
  const [step,         setStep]         = useState(1);
  const [businessName, setBusinessName] = useState('');
  const [category,     setCategory]     = useState('');
  const [services,     setServices]     = useState([]);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [copied,       setCopied]       = useState(false);

  const bookingUrl = `${window.location.origin}/book/${user?.accountId}`;

  function pickCategory(cat) {
    setCategory(cat);
    setServices([...CATEGORIES[cat]]);
  }

  function toggleService(s) {
    setServices(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }

  async function finish() {
    setSaving(true);
    setError('');
    try {
      await api.post('/onboarding/complete', {
        business_name: businessName.trim(),
        services,
      });
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  function copyUrl() {
    navigator.clipboard.writeText(bookingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#1C2333', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>

      {/* Logo */}
      <div style={{ color: '#D6B58A', fontSize: 18, fontWeight: 800, letterSpacing: '.06em', marginBottom: 32 }}>
        FIELDCORE™
      </div>

      {/* Step indicator */}
      {step < 3 && (
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', maxWidth: 480, marginBottom: 24 }}>
          <Step n={1} current={step} />
          <Divider />
          <Step n={2} current={step} />
          <Divider />
          <Step n={3} current={step} />
        </div>
      )}

      {/* Card */}
      <div style={{ width: '100%', maxWidth: 480, background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,.4)' }}>

        {/* ── Step 1: Business info ── */}
        {step === 1 && (
          <div style={{ padding: 36 }}>
            <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 26, color: '#1C2333', marginBottom: 6 }}>
              You're one step away.
            </div>
            <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 28, lineHeight: 1.5 }}>
              Tell us about your business and we'll get everything ready — your schedule, your customers, and your dedicated business phone number.
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: '#9ca3af', marginBottom: 6 }}>
                Business Name
              </label>
              <input
                autoFocus
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                placeholder="e.g. Apex Auto Detailing"
                style={{ width: '100%', padding: '11px 14px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 15, color: '#1C2333', outline: 'none', boxSizing: 'border-box' }}
                onKeyDown={e => e.key === 'Enter' && businessName.trim() && setStep(2)}
              />
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: '#9ca3af', marginBottom: 10 }}>
                Business Type
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {CAT_KEYS.map(cat => (
                  <button
                    key={cat}
                    onClick={() => pickCategory(cat)}
                    style={{
                      padding: '9px 12px', borderRadius: 7, border: '1.5px solid',
                      borderColor: category === cat ? '#1C2333' : '#e5e7eb',
                      background: category === cat ? '#1C2333' : 'white',
                      color: category === cat ? '#D6B58A' : '#374151',
                      fontSize: 12, fontWeight: category === cat ? 700 : 400,
                      cursor: 'pointer', textAlign: 'left', transition: 'all .15s',
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {error && <div style={{ marginBottom: 16, fontSize: 13, color: '#dc2626' }}>{error}</div>}

            <button
              onClick={() => setStep(2)}
              disabled={!businessName.trim() || !category}
              style={{
                width: '100%', padding: '13px 0', background: '#1C2333', color: '#D6B58A',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700,
                cursor: (!businessName.trim() || !category) ? 'not-allowed' : 'pointer',
                opacity: (!businessName.trim() || !category) ? 0.4 : 1, letterSpacing: '.02em',
              }}
            >
              Continue →
            </button>
          </div>
        )}

        {/* ── Step 2: Services ── */}
        {step === 2 && (
          <div style={{ padding: 36 }}>
            <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 26, color: '#1C2333', marginBottom: 6 }}>
              What do you offer?
            </div>
            <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 24, lineHeight: 1.5 }}>
              These show up in your online booking page so customers can book the right service. Uncheck anything you don't offer.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
              {(CATEGORIES[category] || []).map(s => {
                const on = services.includes(s);
                return (
                  <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: `1.5px solid ${on ? '#1C2333' : '#e5e7eb'}`, borderRadius: 7, cursor: 'pointer', background: on ? '#f9f7f3' : 'white', transition: 'all .15s' }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${on ? '#1C2333' : '#d1d5db'}`, background: on ? '#1C2333' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s' }}>
                      {on && <span style={{ color: '#D6B58A', fontSize: 10, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                    </div>
                    <input type="checkbox" checked={on} onChange={() => toggleService(s)} style={{ display: 'none' }} />
                    <span style={{ fontSize: 13, color: '#1C2333', fontWeight: on ? 600 : 400 }}>{s}</span>
                  </label>
                );
              })}
            </div>

            {error && <div style={{ marginBottom: 16, fontSize: 13, color: '#dc2626' }}>{error}</div>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(1)} style={{ flex: '0 0 auto', padding: '13px 20px', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#6b7280', cursor: 'pointer' }}>
                ← Back
              </button>
              <button
                onClick={finish}
                disabled={saving || services.length === 0}
                style={{
                  flex: 1, padding: '13px 0', background: '#1C2333', color: '#D6B58A',
                  border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700,
                  cursor: (saving || services.length === 0) ? 'not-allowed' : 'pointer',
                  opacity: (saving || services.length === 0) ? 0.5 : 1,
                }}
              >
                {saving ? 'Setting up…' : 'Finish Setup →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Done ── */}
        {step === 3 && (
          <div style={{ padding: 36, textAlign: 'center' }}>
            <div style={{ width: 60, height: 60, background: '#f9f7f3', border: '2px solid #D6B58A', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 26, color: '#1C2333' }}>
              ✓
            </div>
            <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 26, color: '#1C2333', marginBottom: 8 }}>
              You're live.
            </div>
            <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 28, lineHeight: 1.6 }}>
              <strong style={{ color: '#1C2333' }}>{businessName}</strong> is ready to take bookings.<br />
              Your dedicated business phone number will be set up in minutes. Share your booking link to start getting jobs.
            </div>

            <div style={{ background: '#f9f7f3', border: '1px solid #e5e0d8', borderRadius: 8, padding: '14px 16px', marginBottom: 24, textAlign: 'left' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: '#9ca3af', marginBottom: 6, fontFamily: 'DM Mono, monospace' }}>
                Your Booking Link
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input readOnly value={bookingUrl} style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 12, color: '#374151', fontFamily: 'DM Mono, monospace', outline: 'none', minWidth: 0 }} />
                <button onClick={copyUrl} style={{ flexShrink: 0, padding: '6px 14px', background: '#1C2333', color: '#D6B58A', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <button
              onClick={() => { window.location.href = '/dashboard'; }}
              style={{ width: '100%', padding: '14px 0', background: '#1C2333', color: '#D6B58A', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: '.02em' }}
            >
              Open Dashboard →
            </button>
          </div>
        )}
      </div>

      {step < 3 && (
        <button
          onClick={() => { window.location.href = '/dashboard'; }}
          style={{ marginTop: 20, fontSize: 12, color: 'rgba(255,255,255,.3)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Skip for now
        </button>
      )}
    </div>
  );
}
