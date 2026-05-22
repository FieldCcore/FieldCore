import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { format, addDays, setHours, setMinutes } from 'date-fns';
import axios from 'axios';

// Standalone public page — no auth, no sidebar
const publicApi = axios.create({ baseURL: '/api' });

const TIMES = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];

export default function BookingWidget() {
  const { accountId } = useParams();
  const [settings, setSettings] = useState(null);
  const [step, setStep]         = useState(1); // 1=details, 2=datetime, 3=confirm
  const [form, setForm]         = useState({ name:'', email:'', phone:'', service:'', date:'', time:'', agreed: false });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]         = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    publicApi.get(`/booking/${accountId}`)
      .then(r => { setSettings(r.data); setForm(f => ({ ...f, service: r.data.services?.[0] || '' })); })
      .catch(() => setError('Booking page not found.'))
      .finally(() => setLoading(false));
  }, [accountId]);

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  // Build next 14 selectable dates (skip Sunday=0)
  const availableDates = Array.from({ length: 21 }, (_, i) => addDays(new Date(), i + 1))
    .filter(d => d.getDay() !== 0)
    .slice(0, 14);

  async function handleSubmit() {
    setError('');
    if (!form.agreed) return setError('Please agree to the terms to continue.');
    const scheduled_at = `${form.date}T${form.time}:00`;
    setSubmitting(true);
    try {
      const res = await publicApi.post(`/booking/${accountId}/submit`, {
        name: form.name, email: form.email, phone: form.phone,
        service: form.service, scheduled_at, agreed: form.agreed,
      });
      if (res.data.checkout_url) {
        setCheckoutUrl(res.data.checkout_url);
      } else {
        setDone(true);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="booking-wrap"><div className="booking-card"><p className="muted">Loading...</p></div></div>;
  if (error && !settings) return <div className="booking-wrap"><div className="booking-card"><p className="form-error">{error}</p></div></div>;

  const biz = settings?.business_name || 'FieldCore';

  if (checkoutUrl) {
    return (
      <div className="booking-wrap">
        <div className="booking-card">
          <div className="booking-logo">{biz || 'FIELDCORE'}<span>™</span></div>
          <h2 style={{ marginBottom: 12 }}>One last step</h2>
          <p style={{ color: '#64748b', marginBottom: 24 }}>
            A deposit of <strong>${parseFloat(settings.deposit_amount).toFixed(2)}</strong> is required to confirm your booking.
          </p>
          <a href={checkoutUrl} className="btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            Pay Deposit to Confirm
          </a>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="booking-wrap">
        <div className="booking-card booking-success">
          <div className="success-icon">✓</div>
          <h2>You're booked!</h2>
          <p>{form.name}, your <strong>{form.service}</strong> appointment is confirmed for <strong>{format(new Date(`${form.date}T${form.time}`), 'EEEE, MMMM d')} at {format(new Date(`${form.date}T${form.time}`), 'h:mm a')}</strong>.</p>
          {form.phone && <p style={{ color: '#64748b', marginTop: 8, fontSize: 13 }}>A confirmation text was sent to {form.phone}.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="booking-wrap">
      <div className="booking-card">
        <div className="booking-logo">{biz || 'FIELDCORE'}<span>™</span></div>
        <div className="booking-steps">
          {[1,2,3].map(s => (
            <div key={s} className={`booking-step ${step === s ? 'active' : ''} ${step > s ? 'done' : ''}`}>{s > step ? s : step > s ? '✓' : s}</div>
          ))}
        </div>

        {/* Step 1 — Contact + Service */}
        {step === 1 && (
          <div>
            <h2 className="booking-title">Your Information</h2>
            <div className="booking-form">
              <div className="form-group">
                <label>Full Name *</label>
                <input value={form.name} onChange={set('name')} placeholder="Jane Smith" />
              </div>
              <div className="form-group">
                <label>Phone Number</label>
                <input value={form.phone} onChange={set('phone')} placeholder="+1 (555) 000-0000" type="tel" />
              </div>
              <div className="form-group">
                <label>Email Address</label>
                <input value={form.email} onChange={set('email')} placeholder="jane@example.com" type="email" />
              </div>
              <div className="form-group">
                <label>Service *</label>
                <select value={form.service} onChange={set('service')}>
                  {settings.services.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {error && <p className="form-error">{error}</p>}
              <button
                className="btn-primary booking-btn"
                onClick={() => {
                  if (!form.name.trim()) return setError('Please enter your name.');
                  if (!form.service) return setError('Please select a service.');
                  setError('');
                  setStep(2);
                }}
              >
                Next: Pick a Time →
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Date + Time */}
        {step === 2 && (
          <div>
            <h2 className="booking-title">Choose a Time</h2>
            <p className="booking-subtitle">{form.service}</p>
            <div className="date-grid">
              {availableDates.map(d => {
                const ds = format(d, 'yyyy-MM-dd');
                return (
                  <button
                    key={ds}
                    className={`date-btn ${form.date === ds ? 'selected' : ''}`}
                    onClick={() => setForm(f => ({ ...f, date: ds, time: '' }))}
                  >
                    <span className="date-day">{format(d, 'EEE')}</span>
                    <span className="date-num">{format(d, 'MMM d')}</span>
                  </button>
                );
              })}
            </div>
            {form.date && (
              <div className="time-grid">
                {TIMES.map(t => (
                  <button
                    key={t}
                    className={`time-btn ${form.time === t ? 'selected' : ''}`}
                    onClick={() => setForm(f => ({ ...f, time: t }))}
                  >
                    {format(new Date(`2000-01-01T${t}`), 'h:mm a')}
                  </button>
                ))}
              </div>
            )}
            {error && <p className="form-error">{error}</p>}
            <div className="booking-nav">
              <button className="btn-secondary" onClick={() => setStep(1)}>← Back</button>
              <button
                className="btn-primary"
                onClick={() => {
                  if (!form.date || !form.time) return setError('Please select a date and time.');
                  setError('');
                  setStep(3);
                }}
              >
                Next: Confirm →
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Review + Agree */}
        {step === 3 && (
          <div>
            <h2 className="booking-title">Confirm Booking</h2>
            <div className="booking-summary">
              <div className="summary-row"><label>Service</label><span>{form.service}</span></div>
              <div className="summary-row"><label>Date</label><span>{format(new Date(`${form.date}T12:00`), 'EEEE, MMMM d, yyyy')}</span></div>
              <div className="summary-row"><label>Time</label><span>{format(new Date(`2000-01-01T${form.time}`), 'h:mm a')}</span></div>
              <div className="summary-row"><label>Name</label><span>{form.name}</span></div>
              {form.phone && <div className="summary-row"><label>Phone</label><span>{form.phone}</span></div>}
              {form.email && <div className="summary-row"><label>Email</label><span>{form.email}</span></div>}
              {parseFloat(settings.deposit_amount) > 0 && (
                <div className="summary-row deposit-row">
                  <label>Deposit</label>
                  <span>${parseFloat(settings.deposit_amount).toFixed(2)}</span>
                </div>
              )}
            </div>
            <label className="agreement-check">
              <input type="checkbox" checked={form.agreed} onChange={set('agreed')} />
              <span>{settings.agreement_text}</span>
            </label>
            {error && <p className="form-error">{error}</p>}
            <div className="booking-nav">
              <button className="btn-secondary" onClick={() => setStep(2)}>← Back</button>
              <button className="btn-primary booking-btn" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Booking...' : parseFloat(settings.deposit_amount) > 0 ? 'Pay Deposit & Book' : 'Confirm Booking'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
