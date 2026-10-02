'use client';
import { useState } from 'react';

const TOPICS = [
  'Sales inquiry',
  'Product support',
  'Partnerships',
  'Press & media',
  'General question',
];

export default function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', company: '', phone: '', topic: '', message: '' });
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [errorMsg, setErrorMsg] = useState('');

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.topic || !form.message) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }
    setErrorMsg('');
    setStatus('submitting');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Something went wrong. Please try again.');
        setStatus('error');
      } else {
        setStatus('success');
      }
    } catch {
      setErrorMsg('Network error. Please check your connection and try again.');
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="contact-form-card">
        <div className="form-success">
          <div className="form-success-icon">✅</div>
          <div className="form-success-title">Message received.</div>
          <div className="form-success-sub">
            Thanks for reaching out. We'll get back to you at {form.email} within one business day.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="contact-form-card">
      <form onSubmit={handleSubmit} noValidate>
        {(errorMsg || status === 'error') && (
          <div className="form-error-msg">{errorMsg || 'Something went wrong. Please try again.'}</div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="cf-name">Name *</label>
            <input
              id="cf-name"
              className="form-input"
              type="text"
              placeholder="Your name"
              value={form.name}
              onChange={set('name')}
              required
              autoComplete="name"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="cf-email">Work Email *</label>
            <input
              id="cf-email"
              className="form-input"
              type="email"
              placeholder="you@business.com"
              value={form.email}
              onChange={set('email')}
              required
              autoComplete="email"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="cf-company">Company</label>
            <input
              id="cf-company"
              className="form-input"
              type="text"
              placeholder="Business name"
              value={form.company}
              onChange={set('company')}
              autoComplete="organization"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="cf-phone">Phone</label>
            <input
              id="cf-phone"
              className="form-input"
              type="tel"
              placeholder="(555) 000-0000"
              value={form.phone}
              onChange={set('phone')}
              autoComplete="tel"
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="cf-topic">Topic *</label>
          <select
            id="cf-topic"
            className="form-input form-select"
            value={form.topic}
            onChange={set('topic')}
            required
          >
            <option value="">Select a topic</option>
            {TOPICS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="cf-message">Message *</label>
          <textarea
            id="cf-message"
            className="form-input form-textarea"
            placeholder="Tell us what you're working on or what you need help with."
            value={form.message}
            onChange={set('message')}
            required
          />
        </div>

        <button className="form-submit" type="submit" disabled={status === 'submitting'}>
          {status === 'submitting' ? 'Sending…' : 'Send message'}
        </button>
      </form>
    </div>
  );
}
