import React, { useState, useEffect } from 'react';
import { Monitor, Smartphone, Globe, Trash2, Shield, Lock, Clock, Bell, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import BusinessSettings from './BusinessSettings';

const TABS = ['My Account', 'Business', 'Notifications', 'Billing'];

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
    if (!info) return <Globe size={15} />;
    if (info === 'iPhone' || info === 'Android' || info === 'iPad') return <Smartphone size={15} />;
    return <Monitor size={15} />;
  }

  function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  return (
    <div>
      {/* Subtitle only — topbar already renders "Settings" as page title */}
      <p style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 16 }}>
        Manage account, business, notifications, and billing preferences.
      </p>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--lightgray)', marginBottom: 22, overflowX: 'auto', gap: 0 }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: activeTab === tab ? 700 : 500,
              color: activeTab === tab ? 'var(--navy)' : 'var(--steel)',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--navy)' : '2px solid transparent',
              cursor: 'pointer',
              outline: 'none',
              whiteSpace: 'nowrap',
              transition: 'color .15s',
              marginBottom: -1,
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ maxWidth: 720 }}>

        {/* ── Business ── */}
        {activeTab === 'Business' && <BusinessSettings />}

        {/* ── Notifications ── */}
        {activeTab === 'Notifications' && (
          <div>
            <div className="card" style={{ marginBottom: 14 }}>
              <h3>Email Notifications</h3>
              <p style={{ display: 'block', fontSize: 13, color: 'var(--steel)', marginBottom: 4, padding: '8px 0 12px', borderBottom: '1px solid var(--off)' }}>
                Choose which events trigger an email to {user?.email || 'your account address'}.
              </p>
              {[
                { key: 'new_booking',  label: 'New booking received',            desc: 'When a client completes a booking through your booking widget.' },
                { key: 'job_complete', label: 'Job marked complete',             desc: 'When a technician marks a job as complete in the mobile app.' },
                { key: 'no_show',      label: 'No-show declared',                desc: 'When a client is marked as a no-show and the deposit is retained.' },
                { key: 'payment',      label: 'Payment collected or deposited',  desc: 'When an invoice is paid or a deposit is collected.' },
                { key: 'review',       label: 'New client review submitted',     desc: 'When a client submits a star rating after a completed job.' },
              ].map(n => (
                <div key={n.key} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '13px 0',
                  borderBottom: '1px solid var(--off)',
                  gap: 16,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 2 }}>{n.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--steel)' }}>{n.desc}</div>
                  </div>
                  <button
                    onClick={() => setNotifPrefs(p => ({ ...p, [n.key]: !p[n.key] }))}
                    style={{
                      position: 'relative',
                      display: 'inline-flex',
                      height: 22,
                      width: 40,
                      alignItems: 'center',
                      borderRadius: 99,
                      border: 'none',
                      cursor: 'pointer',
                      outline: 'none',
                      flexShrink: 0,
                      background: notifPrefs[n.key] ? 'var(--sand)' : 'var(--lightgray)',
                      transition: 'background .2s',
                    }}
                  >
                    <span style={{
                      display: 'inline-block',
                      height: 16,
                      width: 16,
                      borderRadius: '50%',
                      background: 'var(--white)',
                      boxShadow: '0 1px 3px rgba(0,0,0,.18)',
                      transform: notifPrefs[n.key] ? 'translateX(20px)' : 'translateX(3px)',
                      transition: 'transform .2s',
                    }} />
                  </button>
                </div>
              ))}
              <div style={{ paddingTop: 12, fontSize: 12, color: 'var(--steel)' }}>
                Notification preferences apply to the signed-in account only.
              </div>
            </div>
          </div>
        )}

        {/* ── Billing ── */}
        {activeTab === 'Billing' && (
          <div>
            <div className="card">
              <h3>Plan &amp; Billing</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid var(--off)' }}>
                <span style={{ fontSize: 12, color: 'var(--steel)', minWidth: 80 }}>Current plan</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', textTransform: 'capitalize' }}>
                  {user?.plan || 'Starter'}
                </span>
              </div>
              <p style={{ display: 'block', fontSize: 13, color: 'var(--steel)', padding: '12px 0 14px', borderBottom: 'none' }}>
                Manage your FieldCore subscription, upgrade your plan, view invoices, and update your payment method.
              </p>
              <Link
                to="/billing"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '9px 18px',
                  background: 'var(--navy)',
                  color: 'var(--sand)',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Manage Billing <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        )}

        {/* ── My Account ── */}
        {activeTab === 'My Account' && (
          <div>
            {/* Profile */}
            <div className="card" style={{ marginBottom: 14 }}>
              <h3>Profile</h3>
              <p><label>Name</label>{user?.name || '—'}</p>
              <p><label>Email</label>{user?.email || '—'}</p>
              <p><label>Role</label>{user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : '—'}</p>
            </div>

            {/* Change Password */}
            <div className="card" style={{ marginBottom: 14 }}>
              <h3><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Lock size={11} color="var(--sand)" />Change Password</span></h3>
              <p style={{ display: 'block', fontSize: 13, color: 'var(--steel)', padding: '8px 0 12px', borderBottom: '1px solid var(--off)' }}>
                Must be 8+ characters with uppercase, lowercase, number, and special character. Changing your password signs out all other devices.
              </p>
              <form onSubmit={handleSubmit} style={{ paddingTop: 12 }}>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label>Current Password</label>
                  <input type="password" value={form.current} onChange={set('current')} required autoComplete="current-password" />
                </div>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label>New Password</label>
                  <input type="password" value={form.next} onChange={set('next')} required placeholder="Min. 8 chars, mixed case + special char" autoComplete="new-password" />
                </div>
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label>Confirm New Password</label>
                  <input type="password" value={form.confirm} onChange={set('confirm')} required autoComplete="new-password" />
                </div>
                {msg && (
                  <div style={{ fontSize: 13, color: msg.ok ? 'var(--green)' : 'var(--red)', marginBottom: 14, fontWeight: 600 }}>
                    {msg.ok ? '✓ ' : ''}{msg.text}
                  </div>
                )}
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Update Password'}
                </button>
              </form>
            </div>

            {/* Active Sessions */}
            <div className="card" style={{ marginBottom: 14 }}>
              <h3>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Shield size={11} color="var(--sand)" />Active Sessions
                  </span>
                  {sessions.length > 1 && (
                    <button
                      onClick={revokeAll}
                      style={{ fontSize: 11, fontWeight: 600, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', outline: 'none', padding: 0 }}
                    >
                      Sign out all
                    </button>
                  )}
                </span>
              </h3>

              {sessions.length === 0 ? (
                <p style={{ display: 'block', fontSize: 13, color: 'var(--steel)', padding: '10px 0' }}>No active sessions found.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
                  {sessions.map((s, i) => (
                    <div key={s.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '11px 13px',
                      borderRadius: 10,
                      background: i === 0 ? 'var(--sand-lt)' : 'var(--off)',
                      border: `1px solid ${i === 0 ? '#D6B58A44' : 'var(--lightgray)'}`,
                    }}>
                      <div style={{ color: 'var(--slate)', flexShrink: 0 }}>{deviceIcon(s.device_info)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 7 }}>
                          {s.device_info || 'Unknown device'}
                          {i === 0 && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '.06em', background: 'var(--sand)', padding: '2px 7px', borderRadius: 99 }}>
                              Current
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 2 }}>
                          {s.ip_address} · Last active {formatDate(s.last_active_at)}
                        </div>
                      </div>
                      {i !== 0 && (
                        <button
                          onClick={() => revokeSession(s.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--steel)', padding: 4, outline: 'none' }}
                          title="Revoke session"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Security Audit Log — owner/manager only */}
            {(user?.role === 'owner' || user?.role === 'manager') && (
              <div className="card">
                <h3>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={11} color="var(--sand)" />Security Audit Log
                  </span>
                </h3>
                <p style={{ display: 'block', fontSize: 13, color: 'var(--steel)', padding: '8px 0 12px', borderBottom: '1px solid var(--off)' }}>
                  View logins, password changes, session revocations, and admin actions.
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
    login:               'Signed in',
    logout_all_sessions: 'Signed out all devices',
    account_locked:      'Account locked (failed logins)',
    password_changed:    'Password changed',
    password_reset:      'Password reset',
    revoke_session:      'Session revoked',
  };

  if (!loaded) {
    return (
      <div style={{ paddingTop: 8 }}>
        <button className="btn-ghost" onClick={load} disabled={loading} style={{ outline: 'none' }}>
          {loading ? 'Loading…' : 'View Audit Log'}
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 8 }}>
      {logs.length === 0 ? (
        <p style={{ display: 'block', color: 'var(--steel)', fontSize: 13, padding: '8px 0' }}>No audit events found.</p>
      ) : (
        logs.map(log => (
          <div key={log.id} style={{
            padding: '10px 12px',
            background: 'var(--off)',
            borderRadius: 8,
            border: '1px solid var(--lightgray)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
                {ACTION_LABELS[log.action] || log.action}
              </span>
              <span style={{ fontSize: 11, color: 'var(--steel)', flexShrink: 0 }}>
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
  );
}
