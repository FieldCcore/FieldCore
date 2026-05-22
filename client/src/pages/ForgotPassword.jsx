import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

export default function ForgotPassword() {
  const [email,     setEmail]     = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return setError('Email is required.');
    setLoading(true);
    setError('');
    try {
      await axios.post('/api/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-logo">
          FIELD<span>CORE</span><sup className="login-tm">™</sup>
        </div>

        <h1 className="login-title">Reset password</h1>

        {submitted ? (
          <>
            <p className="login-sub" style={{ color: 'rgba(255,255,255,.6)', marginBottom: 0 }}>
              If that email address is registered, you'll receive a reset link within a few minutes.
              Check your spam folder if it doesn't arrive.
            </p>
            <p className="login-footer" style={{ marginTop: 28 }}>
              <Link to="/login" className="login-link">← Back to sign in</Link>
            </p>
          </>
        ) : (
          <>
            <p className="login-sub">Enter your email and we'll send you a reset link.</p>

            {error && <div className="login-error">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="login-field">
                <label className="login-label">Email</label>
                <input
                  type="email"
                  className="login-input"
                  placeholder="you@business.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>

            <p className="login-footer">
              <Link to="/login" className="login-link">← Back to sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
