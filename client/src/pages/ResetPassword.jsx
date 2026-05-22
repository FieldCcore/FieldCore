import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const nav   = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  if (!token) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="login-logo">FIELD<span>CORE</span><sup className="login-tm">™</sup></div>
          <h1 className="login-title">Invalid link</h1>
          <p className="login-sub">This reset link is missing or malformed.</p>
          <p className="login-footer">
            <Link to="/forgot-password" className="login-link">Request a new link →</Link>
          </p>
        </div>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm)  return setError('Passwords do not match.');
    setLoading(true);
    setError('');
    try {
      await axios.post('/api/auth/reset-password', { token, password });
      nav('/login?reset=1', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Reset failed. The link may have expired.');
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

        <h1 className="login-title">New password</h1>
        <p className="login-sub">Choose a strong password for your account.</p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label className="login-label">New Password</label>
            <input
              type="password"
              className="login-input"
              placeholder="Min. 8 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
            />
          </div>

          <div className="login-field">
            <label className="login-label">Confirm Password</label>
            <input
              type="password"
              className="login-input"
              placeholder="••••••••"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Saving…' : 'Set new password'}
          </button>
        </form>

        <p className="login-footer">
          <Link to="/login" className="login-link">← Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
