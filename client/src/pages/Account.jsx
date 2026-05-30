import React, { useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

export default function Account() {
  const { user } = useAuth();
  const [form, setForm]   = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]     = useState(null);

  function set(f) { return e => setForm(s => ({ ...s, [f]: e.target.value })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.next !== form.confirm) return setMsg({ ok: false, text: 'Passwords do not match.' });
    setSaving(true);
    setMsg(null);
    try {
      await api.patch('/auth/me/password', { current_password: form.current, new_password: form.next });
      setForm({ current: '', next: '', confirm: '' });
      setMsg({ ok: true, text: 'Password updated successfully.' });
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.error || 'Failed to update password.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>My Account</h1>
      </div>

      <div style={{ maxWidth: 480 }}>
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 14 }}>Profile</h3>
          <p><label>Name</label> {user?.name || '—'}</p>
          <p><label>Email</label> {user?.email || '—'}</p>
          <p><label>Role</label> {user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : '—'}</p>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Change Password</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Current Password</label>
              <input type="password" value={form.current} onChange={set('current')} required autoComplete="current-password" />
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>New Password</label>
              <input type="password" value={form.next} onChange={set('next')} minLength={8} required placeholder="Min. 8 characters" autoComplete="new-password" />
            </div>
            <div className="form-group" style={{ marginBottom: 18 }}>
              <label>Confirm New Password</label>
              <input type="password" value={form.confirm} onChange={set('confirm')} required autoComplete="new-password" />
            </div>
            {msg && (
              <p style={{ fontSize: 13, color: msg.ok ? 'var(--green)' : 'var(--red)', marginBottom: 12, fontWeight: 600 }}>
                {msg.ok ? '✓ ' : ''}{msg.text}
              </p>
            )}
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
