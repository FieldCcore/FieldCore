import React, { useState, useEffect } from 'react';
import { Monitor, Smartphone, Globe, Trash2, Shield, Lock, Clock } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import BusinessSettings from './BusinessSettings';

export default function Account() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('My Account');
  const [form,     setForm]     = useState({ current: '', next: '', confirm: '' });
  const [saving,   setSaving]   = useState(false);
  const [msg,      setMsg]      = useState(null);
  const [sessions, setSessions] = useState([]);
  const [notifPrefs, setNotifPrefs] = useState({
    new_booking: true,
    job_complete: true,
    no_show: true,
    payment: true,
    review: true,
  });

  function set(f) { return e => setForm(s => ({ ...s, [f]: e.target.value })); }

  useEffect(() => { loadSessions(); }, []);

  async function loadSessions() {
    try {
      const res = await api.get('/auth/sessions');
      setSessions(res.data);
    } catch {}
  }

  async function revokeSession(id) {
    if (!window.confirm('Revoke this session? That device will need to sign in again.')) return;
    try {
      await api.delete(`/auth/sessions/${id}`);
      setSessions(s => s.filter(x => x.id !== id));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to revoke session.');
    }
  }

  async function revokeAll() {
    if (!window.confirm('Sign out of all devices? You will be logged out here too.')) return;
    try {
      await api.post('/auth/logout-all');
      logout();
    } catch {}
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.next !== form.confirm) return setMsg({ ok: false, text: 'Passwords do not match.' });
    setSaving(true);
    setMsg(null);
    try {
      await api.patch('/auth/me/password', { current_password: form.current, new_password: form.next });
      setForm({ current: '', next: '', confirm: '' });
      setMsg({ ok: true, text: 'Password updated. Other devices signed out for security.' });
      loadSessions();
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.error || 'Failed to update password.' });
    } finally {
      setSaving(false);
    }
  }

  function deviceIcon(info) {
    if (!info) return <Globe size={16} />;
    if (info === 'iPhone' || info === 'Android' || info === 'iPad') return <Smartphone size={16} />;
    return <Monitor size={16} />;
  }

  function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  return (
    <div className="min-h-screen bg-offwhite">
      <div className="bg-white border-b border-lightgray px-8 py-5">
        <h1 className="text-2xl font-bold text-navy">Settings</h1>
      </div>

      <div className="bg-white border-b border-lightgray px-8 flex">
        {['My Account', 'Business', 'Notifications', 'Billing'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-sand text-navy font-semibold'
                : 'border-transparent text-slate hover:text-navy'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">

        {activeTab === 'Business' && <BusinessSettings />}

        {activeTab === 'Notifications' && (
          <div style={{ maxWidth: 540 }}>
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 style={{ marginBottom: 16 }}>Email Notifications</h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                Choose which events trigger an email to your account address.
              </p>
              {[
                { key: 'new_booking',  label: 'New booking received'           },
                { key: 'job_complete', label: 'Job marked complete'            },
                { key: 'no_show',      label: 'No-show declared'               },
                { key: 'payment',      label: 'Payment collected or deposited' },
                { key: 'review',       label: 'New client review submitted'    },
              ].map(n => (
                <div key={n.key} className="flex items-center justify-between py-4 border-b border-lightgray last:border-0">
                  <span className="text-sm font-medium text-navy">{n.label}</span>
                  <button
                    onClick={() => setNotifPrefs(p => ({ ...p, [n.key]: !p[n.key] }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      notifPrefs[n.key] ? 'bg-sand' : 'bg-lightgray'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        notifPrefs[n.key] ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Notification preferences are sent to {user?.email || 'your account email'}.
            </p>
          </div>
        )}

        {activeTab === 'Billing' && (
          <div style={{ maxWidth: 540 }}>
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 style={{ marginBottom: 16 }}>Plan & Billing</h3>
              <p style={{ fontSize: 14, color: 'var(--navy)', marginBottom: 8 }}>
                Current plan: <strong style={{ textTransform: 'capitalize' }}>{user?.plan || 'Starter'}</strong>
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                Manage your FieldCore subscription, upgrade your plan, and view payment history.
              </p>
              <a href="/billing" style={{ display: 'inline-block', padding: '9px 20px', background: '#1C2333', color: '#D6B58A', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                Manage Billing →
              </a>
            </div>
          </div>
        )}

        {activeTab === 'My Account' && (
          <div style={{ maxWidth: 540 }}>
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 style={{ marginBottom: 14 }}>Profile</h3>
              <p style={{ marginBottom: 8 }}><label style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginRight: 12 }}>Name</label> {user?.name || '—'}</p>
              <p style={{ marginBottom: 8 }}><label style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginRight: 12 }}>Email</label> {user?.email || '—'}</p>
              <p><label style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginRight: 12 }}>Role</label> {user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : '—'}</p>
            </div>

            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Lock size={16} color="var(--sand)" />
                <h3 style={{ margin: 0 }}>Change Password</h3>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                Must be 8+ characters with uppercase, lowercase, number, and special character.
                Changing password signs out all other devices.
              </p>
              <form onSubmit={handleSubmit}>
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label>Current Password</label>
                  <input type="password" value={form.current} onChange={set('current')} required autoComplete="current-password" />
                </div>
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label>New Password</label>
                  <input type="password" value={form.next} onChange={set('next')} required placeholder="Min. 8 chars, mixed case + special char" autoComplete="new-password" />
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

            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Shield size={16} color="var(--sand)" />
                  <h3 style={{ margin: 0 }}>Active Sessions</h3>
                </div>
                {sessions.length > 1 && (
                  <button className="btn-ghost" style={{ fontSize: 12, color: 'var(--red)', padding: '4px 10px' }} onClick={revokeAll}>
                    Sign out all devices
                  </button>
                )}
              </div>

              {sessions.length === 0 ? (
                <p style={{ color: 'var(--steel)', fontSize: 13 }}>No active sessions found.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sessions.map((s, i) => (
                    <div key={s.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', borderRadius: 10,
                      background: i === 0 ? 'var(--sand-lt)' : 'var(--off)',
                      border: `1px solid ${i === 0 ? '#D6B58A55' : 'var(--lightgray)'}`,
                    }}>
                      <div style={{ color: 'var(--slate)' }}>{deviceIcon(s.device_info)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 8 }}>
                          {s.device_info || 'Unknown device'}
                          {i === 0 && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '.06em', background: 'var(--sand)', padding: '2px 7px', borderRadius: 99 }}>Current</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 2 }}>
                          {s.ip_address} · Last active {formatDate(s.last_active_at)}
                        </div>
                      </div>
                      {i !== 0 && (
                        <button
                          onClick={() => revokeSession(s.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--steel)', padding: 4 }}
                          title="Revoke session"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {(user?.role === 'owner' || user?.role === 'manager') && (
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Clock size={16} color="var(--sand)" />
                  <h3 style={{ margin: 0 }}>Security Audit Log</h3>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
                  View all security events — logins, password changes, session revocations, and admin actions.
                </p>
                <AuditLogSection />
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

function AuditLogSection() {
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded,  setLoaded]  = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get('/auth/audit-log');
      setLogs(res.data);
      setLoaded(true);
    } catch {}
    setLoading(false);
  }

  const ACTION_LABELS = {
    login:              'Signed in',
    logout_all_sessions:'Signed out all devices',
    account_locked:     'Account locked (failed logins)',
    password_changed:   'Password changed',
    password_reset:     'Password reset',
    revoke_session:     'Session revoked',
  };

  if (!loaded) {
    return (
      <button className="btn-ghost" onClick={load} disabled={loading}>
        {loading ? 'Loading…' : 'View Audit Log'}
      </button>
    );
  }

  return (
    <div>
      <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {logs.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No audit events found.</p>
        ) : (
          logs.map(log => (
            <div key={log.id} style={{ padding: '10px 12px', background: 'var(--off)', borderRadius: 8, border: '1px solid var(--lightgray)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
                  {ACTION_LABELS[log.action] || log.action}
                </span>
                <span style={{ fontSize: 11, color: 'var(--steel)' }}>
                  {new Date(log.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 2 }}>
                {log.user_name || log.user_email || 'System'} · IP: {log.ip_address || '—'}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
