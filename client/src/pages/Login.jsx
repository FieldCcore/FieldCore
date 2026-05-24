import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [searchParams]           = useSearchParams();
  const [email,    setEmail]     = useState('');
  const [password, setPassword]  = useState('');
  const [error,    setError]     = useState('');
  const [loading,  setLoading]   = useState(false);
  const resetSuccess = searchParams.get('reset') === '1';

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password) return setError('Email and password are required.');
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      nav('/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Sign in failed. Check your credentials.');
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

        <h1 className="login-title">Sign in</h1>
        <p className="login-sub">Access your operator dashboard.</p>

        {resetSuccess && <div className="login-success">Password updated. Sign in with your new credentials.</div>}
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

          <div className="login-field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label className="login-label" style={{ marginBottom: 0 }}>Password</label>
              <Link to="/forgot-password" className="login-link" style={{ fontSize: 12 }}>Forgot password?</Link>
            </div>
            <input
              type="password"
              className="login-input"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="login-footer">
          No account?{' '}
          <a href="/#cta" className="login-link">Start free trial →</a>
        </p>
      </div>
    </div>
  );
}
