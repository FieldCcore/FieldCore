import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '';

function Stars({ value, onChange }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '24px 0 8px' }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 4,
            fontSize: 44, lineHeight: 1,
            color: n <= (hovered || value) ? '#D6B58A' : '#e2e8f0',
            transition: 'color .12s',
          }}
          aria-label={`${n} star${n !== 1 ? 's' : ''}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

const LABELS = { 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Great', 5: 'Excellent!' };

export default function ReviewPage() {
  const { token } = useParams();
  const [job,       setJob]       = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [rating,    setRating]    = useState(0);
  const [body,      setBody]      = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]  = useState(false);

  useEffect(() => {
    axios.get(`${API}/api/reviews/public/${token}`)
      .then(r => {
        setJob(r.data);
        if (r.data.already_submitted) setSubmitted(true);
      })
      .catch(() => setError('This review link is invalid or has expired.'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!rating) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/reviews/submit/${token}`, { rating, body });
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const shell = (children) => (
    <div style={{ minHeight: '100vh', background: '#f4f4f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 480, background: 'white', borderRadius: 16, border: '1px solid #e5e0d8', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}>
        <div style={{ background: '#1C2333', padding: '20px 28px' }}>
          <div style={{ color: '#D6B58A', fontWeight: 800, fontSize: 15, letterSpacing: '.08em' }}>FIELDCORE™</div>
        </div>
        <div style={{ padding: '32px 28px' }}>{children}</div>
      </div>
    </div>
  );

  if (loading) return shell(<p style={{ color: '#6b7280', textAlign: 'center' }}>Loading…</p>);
  if (error && !job) return shell(<p style={{ color: '#e53e3e', textAlign: 'center' }}>{error}</p>);

  if (submitted) return shell(
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 52, marginBottom: 12 }}>⭐</div>
      <h2 style={{ margin: '0 0 8px', color: '#1C2333', fontSize: 22, fontWeight: 700 }}>Thank you!</h2>
      <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.7 }}>
        Your feedback helps {job?.business_name || 'us'} keep improving.<br />We appreciate your business.
      </p>
    </div>
  );

  return shell(
    <form onSubmit={handleSubmit}>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 13, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
          {job.business_name}
        </div>
        <h2 style={{ margin: '0 0 4px', color: '#1C2333', fontSize: 22, fontWeight: 700 }}>
          How did your {job.service_type} go?
        </h2>
        <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>Hi {job.client_name} — tap a star to rate your experience</p>
      </div>

      <Stars value={rating} onChange={setRating} />

      {rating > 0 && (
        <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#D6B58A', marginBottom: 20, letterSpacing: '.04em' }}>
          {LABELS[rating]}
        </div>
      )}

      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Tell us more (optional)…"
        rows={4}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '10px 14px',
          border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14,
          fontFamily: 'inherit', resize: 'vertical', outline: 'none',
          lineHeight: 1.6, color: '#1C2333',
        }}
      />

      {error && <p style={{ color: '#e53e3e', fontSize: 13, margin: '8px 0 0' }}>{error}</p>}

      <button
        type="submit"
        disabled={!rating || submitting}
        style={{
          marginTop: 20, width: '100%', padding: '14px 0',
          background: rating ? '#1C2333' : '#e2e8f0',
          color: rating ? '#D6B58A' : '#94a3b8',
          border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15,
          cursor: rating ? 'pointer' : 'not-allowed', transition: 'background .15s',
          letterSpacing: '.02em',
        }}
      >
        {submitting ? 'Submitting…' : 'Submit Review'}
      </button>
    </form>
  );
}
