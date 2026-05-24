import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const AVATAR_COLORS = ['var(--green)', 'var(--blue)', 'var(--amber)', 'var(--sand-dark)', 'var(--slate)'];
const DAY_LABELS    = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function fmt$(n) {
  const v = parseFloat(n) || 0;
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function getWeekBounds() {
  const now  = new Date();
  const day  = now.getDay(); // 0=Sun
  const mon  = new Date(now); mon.setDate(now.getDate() - ((day + 6) % 7)); mon.setHours(0,0,0,0);
  const sun  = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
  return { mon, sun };
}

function toLocalDateStr(d) {
  return d.toISOString().slice(0, 10);
}

// ── Add / Edit Member Modal ─────────────────────────────────
function MemberModal({ user, onClose, onSaved }) {
  const isEdit = !!user;
  const { accounts } = useAuth();
  const [form,    setForm]    = useState({
    name:     user?.name     || '',
    email:    user?.email    || '',
    phone:    user?.phone    || '',
    role:     user?.role     || 'tech',
    password: '',
  });
  const [memberships,    setMemberships]    = useState([]);
  const [membershipBusy, setMembershipBusy] = useState(false);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    api.get(`/users/${user.id}/memberships`).then(r => setMemberships(r.data)).catch(() => {});
  }, [user?.id]);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Name is required.');
    if (!form.email.trim()) return setError('Email is required.');
    if (!isEdit && !form.password) return setError('Password is required for new members.');
    setLoading(true);
    try {
      const payload = { name: form.name, email: form.email, phone: form.phone, role: form.role };
      if (form.password) payload.password = form.password;
      if (isEdit) {
        await api.patch(`/users/${user.id}`, payload);
      } else {
        await api.post('/users', payload);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function grantAccess(accountId) {
    setMembershipBusy(true);
    try {
      await api.post(`/users/${user.id}/memberships`, { account_id: accountId, role: 'manager' });
      const r = await api.get(`/users/${user.id}/memberships`);
      setMemberships(r.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not grant access.');
    } finally {
      setMembershipBusy(false);
    }
  }

  async function revokeAccess(accountId) {
    setMembershipBusy(true);
    try {
      await api.delete(`/users/${user.id}/memberships/${accountId}`);
      setMemberships(m => m.filter(x => x.account_id !== accountId));
    } catch (err) {
      alert(err.response?.data?.error || 'Could not revoke access.');
    } finally {
      setMembershipBusy(false);
    }
  }

  const otherAccounts = accounts.filter(a => a.id !== user?.account_id);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>{isEdit ? 'Edit Team Member' : 'Add Team Member'}</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        {error && <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>}
        <form className="client-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Name</label>
              <input value={form.name}  onChange={e => set('name', e.target.value)}  placeholder="Full name" />
            </div>
            <div className="form-group">
              <label>Role</label>
              <select value={form.role} onChange={e => set('role', e.target.value)}>
                <option value="tech">Technician</option>
                <option value="manager">Manager</option>
                <option value="owner">Owner</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="tech@business.com" />
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 (555) 000-0000" />
            </div>
          </div>
          <div className="form-group">
            <label>{isEdit ? 'New Password (leave blank to keep current)' : 'Temporary Password'}</label>
            <input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min. 8 characters" autoComplete="new-password" />
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit"  className="btn-primary"   disabled={loading}>
              {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Member'}
            </button>
          </div>
        </form>

        {isEdit && otherAccounts.length > 0 && (
          <div style={{ borderTop: '1px solid var(--lightgray)', padding: '16px 24px 20px' }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--steel)', marginBottom: 10 }}>
              Cross-Account Access
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {otherAccounts.map(acct => {
                const m = memberships.find(x => x.account_id === acct.id);
                return (
                  <div key={acct.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--lightgray)' }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{acct.name}</span>
                      {m && <span style={{ marginLeft: 8, fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--steel)', textTransform: 'capitalize' }}>{m.role}</span>}
                    </div>
                    {m ? (
                      <button disabled={membershipBusy} onClick={() => revokeAccess(acct.id)}
                        style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, border: '1px solid rgba(198,40,40,.3)', background: 'none', color: 'var(--red)', cursor: 'pointer' }}>
                        Revoke
                      </button>
                    ) : (
                      <button disabled={membershipBusy} onClick={() => grantAccess(acct.id)}
                        style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, border: '1px solid var(--lightgray)', background: 'none', color: 'var(--slate)', cursor: 'pointer' }}>
                        Grant Access
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────
export default function Team() {
  const [tab,       setTab]       = useState('performance');
  const [techs,     setTechs]     = useState([]);
  const [users,     setUsers]     = useState([]);
  const [weekJobs,  setWeekJobs]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUser,  setEditUser]  = useState(null);
  const [removing,  setRemoving]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [teamRes, usersRes] = await Promise.all([
        api.get('/analytics/team'),
        api.get('/users'),
      ]);
      setTechs(teamRes.data);
      setUsers(usersRes.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Fetch week jobs when schedule tab is opened
  useEffect(() => {
    if (tab !== 'schedule') return;
    const { mon, sun } = getWeekBounds();
    api.get('/jobs', { params: { date_from: toLocalDateStr(mon), date_to: sun.toISOString() } })
      .then(r => setWeekJobs(r.data))
      .catch(() => {});
  }, [tab]);

  function openAdd()       { setEditUser(null); setShowModal(true); }
  function openEdit(u)     { setEditUser(u);    setShowModal(true); }
  function closeModal()    { setShowModal(false); setEditUser(null); }
  function onSaved()       { closeModal(); load(); }

  async function removeUser(u) {
    if (!window.confirm(`Remove ${u.name} from the team? This cannot be undone.`)) return;
    setRemoving(u.id);
    try {
      await api.delete(`/users/${u.id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not remove user.');
    } finally {
      setRemoving(null);
    }
  }

  function exportPayrollCSV() {
    const rows = [
      ['Name', 'Role', 'Jobs', 'Completed', 'Revenue', 'Commission (5%)'],
      ...techs.map(t => [
        t.name,
        t.role || '',
        t.jobs,
        t.completed,
        parseFloat(t.revenue || 0).toFixed(2),
        parseFloat(t.commission || 0).toFixed(2),
      ]),
      ['TOTAL', '', techs.reduce((s,t) => s + parseInt(t.jobs||0), 0), '',
        techs.reduce((s,t) => s + parseFloat(t.revenue||0), 0).toFixed(2),
        techs.reduce((s,t) => s + parseFloat(t.commission||0), 0).toFixed(2)],
    ];
    const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `fieldcore-payroll-${toLocalDateStr(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Build schedule grid: { techId → { 'Mon' → [job, ...] } }
  function buildScheduleGrid() {
    const { mon } = getWeekBounds();
    const grid = {};
    users.forEach(u => { grid[u.id] = {}; DAY_LABELS.forEach(d => { grid[u.id][d] = []; }); });
    weekJobs.forEach(job => {
      if (!job.tech_id || !grid[job.tech_id]) return;
      const d     = new Date(job.scheduled_at);
      const dayIdx = (d.getDay() + 6) % 7; // Mon=0
      const label  = DAY_LABELS[dayIdx];
      if (label) grid[job.tech_id][label].push(job);
    });
    return grid;
  }

  const totalRevenue    = techs.reduce((s, t) => s + parseFloat(t.revenue || 0), 0);
  const totalJobs       = techs.reduce((s, t) => s + parseInt(t.jobs || 0), 0);
  const totalCommission = techs.reduce((s, t) => s + parseFloat(t.commission || 0), 0);

  if (loading) return (
    <div style={{ padding: 40, color: 'var(--steel)', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>
      Loading team data…
    </div>
  );

  const schedGrid = tab === 'schedule' ? buildScheduleGrid() : null;

  return (
    <div>
      {(showModal) && (
        <MemberModal user={editUser} onClose={closeModal} onSaved={onSaved} />
      )}

      {/* Stats */}
      <div className="dash-stat-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="dash-sc">
          <div className="dash-sc-l">Team Size</div>
          <div className="dash-sc-v">{users.length}</div>
          <div className="dash-sc-s">{techs.filter(t => parseInt(t.active || 0) > 0).length} active on field</div>
        </div>
        <div className="dash-sc">
          <div className="dash-sc-l">Revenue / Tech</div>
          <div className="dash-sc-v">{techs.length > 0 ? fmt$(totalRevenue / techs.length) : '$0'}</div>
          <div className="dash-sc-s">Avg this week</div>
        </div>
        <div className="dash-sc">
          <div className="dash-sc-l">Jobs This Week</div>
          <div className="dash-sc-v">{totalJobs}</div>
          <div className="dash-sc-s">{techs.filter(t => parseInt(t.active || 0) > 0).length} in progress</div>
        </div>
        <div className="dash-sc">
          <div className="dash-sc-l">Est. Commission</div>
          <div className="dash-sc-v">{fmt$(totalCommission)}</div>
          <div className="dash-sc-s">5% of revenue</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="team-tabs">
        {[
          { key: 'performance', label: 'Performance' },
          { key: 'schedule',    label: 'Schedule'    },
          { key: 'payroll',     label: 'Payroll'     },
        ].map(t => (
          <button key={t.key} className={`filter-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Performance ── */}
      {tab === 'performance' && (
        <div className="team-layout">
          <div className="team-main">
            <div className="dash-card">
              <div className="dash-ch">
                <span className="dash-cht">Team Performance — This Week</span>
              </div>
              {users.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--steel)', fontSize: 13 }}>
                  No team members yet. Add someone to get started.
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Member</th><th>Role</th><th>Jobs</th><th>Completed</th>
                      <th>Revenue</th><th>Commission</th><th>Status</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u, i) => {
                      const stats = techs.find(t => t.id === u.id) || {};
                      return (
                        <tr key={u.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 28, height: 28, borderRadius: '50%', background: AVATAR_COLORS[i % AVATAR_COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'white', flexShrink: 0 }}>
                                {initials(u.name)}
                              </div>
                              <div>
                                <strong style={{ display: 'block' }}>{u.name}</strong>
                                <span style={{ fontSize: 11, color: 'var(--steel)' }}>{u.email}</span>
                              </div>
                            </div>
                          </td>
                          <td style={{ textTransform: 'capitalize' }}>{u.role}</td>
                          <td>{stats.jobs || 0}</td>
                          <td>{stats.completed || 0}</td>
                          <td><strong style={{ color: 'var(--green)' }}>{fmt$(stats.revenue || 0)}</strong></td>
                          <td>{fmt$(stats.commission || 0)}</td>
                          <td>
                            <span className={`dash-jbadge ${parseInt(stats.active || 0) > 0 ? 'js-active' : 'js-pending'}`}>
                              {parseInt(stats.active || 0) > 0 ? 'Active' : 'Available'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={() => openEdit(u)}
                                style={{ background: 'none', border: '1px solid var(--lightgray)', borderRadius: 5, padding: '3px 9px', fontSize: 11, cursor: 'pointer', color: 'var(--slate)' }}>
                                Edit
                              </button>
                              <button onClick={() => removeUser(u)} disabled={removing === u.id}
                                style={{ background: 'none', border: '1px solid rgba(198,40,40,.3)', borderRadius: 5, padding: '3px 9px', fontSize: 11, cursor: 'pointer', color: 'var(--red)' }}>
                                {removing === u.id ? '…' : 'Remove'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="team-side">
            <div className="dash-card">
              <div className="dash-ch"><span className="dash-cht">Team Actions</span></div>
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="tb-btn tb-ghost dash-act-btn" onClick={openAdd}>+ Add Team Member</button>
                <button className="tb-btn tb-ghost dash-act-btn" onClick={exportPayrollCSV}>Export Payroll CSV</button>
                <button className="tb-btn tb-ghost dash-act-btn" onClick={() => setTab('schedule')}>View Schedule</button>
              </div>
            </div>

            <div className="dash-card" style={{ marginTop: 14 }}>
              <div className="dash-ch"><span className="dash-cht">Week Totals</span></div>
              <div style={{ padding: '14px 16px' }}>
                {[
                  { label: 'Total Revenue',    val: fmt$(totalRevenue) },
                  { label: 'Total Commission', val: fmt$(totalCommission) },
                  { label: 'Total Jobs',        val: String(totalJobs) },
                ].map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 2 ? '1px solid var(--lightgray)' : 'none', fontSize: 13 }}>
                    <span style={{ color: 'var(--steel)', fontFamily: 'DM Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', alignSelf: 'center' }}>{r.label}</span>
                    <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 18, color: 'var(--navy)' }}>{r.val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Schedule ── */}
      {tab === 'schedule' && (
        <div className="dash-card">
          <div className="dash-ch">
            <span className="dash-cht">This Week's Schedule</span>
            <span className="dash-cha" onClick={openAdd} style={{ cursor: 'pointer' }}>+ Add Member</span>
          </div>
          {users.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--steel)', fontSize: 13 }}>
              No team members yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 130 }}>Tech</th>
                    {DAY_LABELS.map(d => <th key={d} style={{ minWidth: 100 }}>{d}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => {
                    const dayJobs = schedGrid?.[u.id] || {};
                    const hasAny  = DAY_LABELS.some(d => (dayJobs[d] || []).length > 0);
                    return (
                      <tr key={u.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 24, height: 24, borderRadius: '50%', background: AVATAR_COLORS[i % AVATAR_COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: 'white', flexShrink: 0 }}>
                              {initials(u.name)}
                            </div>
                            <strong style={{ fontSize: 12 }}>{u.name}</strong>
                          </div>
                        </td>
                        {DAY_LABELS.map(d => {
                          const jobs = dayJobs[d] || [];
                          return (
                            <td key={d} style={{ verticalAlign: 'top', padding: '8px 10px' }}>
                              {jobs.length === 0 ? (
                                <span style={{ color: 'var(--lightgray)', fontSize: 13 }}>—</span>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                  {jobs.map(j => (
                                    <div key={j.id} style={{ background: 'var(--sand-lt)', borderRadius: 4, padding: '2px 6px', fontSize: 10, color: 'var(--navy)', fontWeight: 600, border: '1px solid rgba(214,181,138,.4)' }}>
                                      {new Date(j.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      <div style={{ fontWeight: 400, color: 'var(--slate)', fontSize: 9, marginTop: 1 }}>{j.service_type}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Payroll ── */}
      {tab === 'payroll' && (
        <div className="dash-card">
          <div className="dash-ch">
            <span className="dash-cht">Payroll — This Week</span>
            <span className="dash-cha" onClick={exportPayrollCSV} style={{ cursor: 'pointer' }}>Export CSV →</span>
          </div>
          {users.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--steel)', fontSize: 13 }}>
              No team members yet.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Member</th><th>Role</th><th>Jobs</th><th>Revenue</th><th>Commission (5%)</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => {
                  const stats = techs.find(t => t.id === u.id) || {};
                  return (
                    <tr key={u.id} className="clickable-row">
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: AVATAR_COLORS[i % AVATAR_COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'white', flexShrink: 0 }}>
                            {initials(u.name)}
                          </div>
                          <strong>{u.name}</strong>
                        </div>
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>{u.role}</td>
                      <td>{stats.jobs || 0}</td>
                      <td><strong style={{ color: 'var(--green)' }}>{fmt$(stats.revenue || 0)}</strong></td>
                      <td><strong style={{ fontFamily: 'DM Serif Display, serif', fontSize: 16 }}>{fmt$(stats.commission || 0)}</strong></td>
                      <td><span className="dash-jbadge js-pending">Pending</span></td>
                    </tr>
                  );
                })}
                {totalRevenue > 0 && (
                  <tr style={{ background: 'var(--navy)' }}>
                    <td colSpan={3} style={{ color: 'rgba(255,255,255,.5)', fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase' }}>Total</td>
                    <td style={{ color: 'white', fontWeight: 700 }}>{fmt$(totalRevenue)}</td>
                    <td style={{ fontFamily: 'DM Serif Display, serif', fontSize: 18, color: 'var(--sand)' }}>{fmt$(totalCommission)}</td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
