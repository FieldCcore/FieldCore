import React, { useEffect, useState } from 'react';
import { Building2, Users, ArrowRightLeft, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const ROLES = ['owner', 'manager', 'tech'];

export default function Entities() {
  const { user, switchAccount } = useAuth();
  const isScale = user?.plan === 'scale';

  const [entities,    setEntities]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [expanded,    setExpanded]    = useState({});
  const [members,     setMembers]     = useState({});
  const [membLoading, setMembLoading] = useState({});
  const [createOpen,  setCreateOpen]  = useState(false);
  const [newName,     setNewName]     = useState('');
  const [creating,    setCreating]    = useState(false);
  const [createErr,   setCreateErr]   = useState('');
  const [inviteModal, setInviteModal] = useState(null); // { entityId, entityName }
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole,  setInviteRole]  = useState('manager');
  const [inviting,    setInviting]    = useState(false);
  const [inviteErr,   setInviteErr]   = useState('');
  const [switching,   setSwitching]   = useState(null);

  useEffect(() => {
    api.get('/entities')
      .then(r => setEntities(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function loadMembers(entityId) {
    if (members[entityId]) return;
    setMembLoading(p => ({ ...p, [entityId]: true }));
    try {
      const r = await api.get(`/entities/${entityId}/members`);
      setMembers(p => ({ ...p, [entityId]: r.data }));
    } catch {
      setMembers(p => ({ ...p, [entityId]: [] }));
    } finally {
      setMembLoading(p => ({ ...p, [entityId]: false }));
    }
  }

  function toggleExpand(entityId) {
    const next = !expanded[entityId];
    setExpanded(p => ({ ...p, [entityId]: next }));
    if (next) loadMembers(entityId);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateErr('');
    try {
      const r = await api.post('/entities', { name: newName.trim() });
      setEntities(prev => [...prev, { ...r.data, is_home: false, member_count: 0 }]);
      setCreateOpen(false);
      setNewName('');
    } catch (err) {
      setCreateErr(err.response?.data?.error || 'Failed to create entity.');
    } finally {
      setCreating(false);
    }
  }

  async function handleInvite(e) {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteModal) return;
    setInviting(true);
    setInviteErr('');
    try {
      const r = await api.post(`/entities/${inviteModal.entityId}/members`, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setMembers(prev => ({
        ...prev,
        [inviteModal.entityId]: [...(prev[inviteModal.entityId] || []), { ...r.data, membership_type: 'cross' }],
      }));
      setInviteModal(null);
      setInviteEmail('');
      setInviteRole('manager');
    } catch (err) {
      setInviteErr(err.response?.data?.error || 'Invite failed.');
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(entityId, userId) {
    if (!window.confirm('Remove this user's access to this entity?')) return;
    try {
      await api.delete(`/entities/${entityId}/members/${userId}`);
      setMembers(prev => ({
        ...prev,
        [entityId]: prev[entityId].filter(m => m.id !== userId),
      }));
    } catch (err) {
      alert(err.response?.data?.error || 'Remove failed.');
    }
  }

  async function handleSwitch(entityId) {
    setSwitching(entityId);
    try {
      await switchAccount(entityId);
    } catch {
      setSwitching(null);
    }
  }

  const roleBadgeStyle = (role) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '.06em',
    background: role === 'owner' ? '#D6B58A22' : role === 'manager' ? '#3B82F622' : '#6B728022',
    color: role === 'owner' ? '#D6B58A' : role === 'manager' ? '#3B82F6' : '#9CA3AF',
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Entities</h1>
          <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
            Manage multiple business entities under one login.
          </p>
        </div>
        {isScale && (
          <button className="btn-primary" onClick={() => { setCreateOpen(true); setCreateErr(''); setNewName(''); }}>
            <Plus size={14} style={{ marginRight: 6 }} />New Entity
          </button>
        )}
      </div>

      {!isScale && (
        <div style={{ background: '#1C233322', border: '1px solid #D6B58A44', borderRadius: 10, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#D6B58A', marginBottom: 4 }}>Scale Plan Required</div>
            <div style={{ fontSize: 13, color: 'var(--steel)' }}>
              Multi-entity management lets you run multiple business locations or brands under one account.
            </div>
          </div>
          <a href="/billing" className="btn-secondary" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>Upgrade</a>
        </div>
      )}

      {loading ? (
        <p className="muted">Loading entities…</p>
      ) : entities.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--steel)', fontSize: 14 }}>
          {isScale ? 'No additional entities yet. Click "+ New Entity" to create one.' : 'No entities found.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {entities.map(entity => {
            const isCurrent = entity.id === user?.accountId;
            const isOpen = expanded[entity.id];
            const entityMembers = members[entity.id] || [];
            const loadingMembs = membLoading[entity.id];

            return (
              <div key={entity.id} style={{ background: '#fff', border: `1px solid ${isCurrent ? '#D6B58A66' : '#e5e0d8'}`, borderRadius: 12, overflow: 'hidden', boxShadow: isCurrent ? '0 0 0 2px #D6B58A22' : 'none' }}>
                <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: isCurrent ? '#D6B58A22' : '#f4f4f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Building2 size={18} style={{ color: isCurrent ? '#D6B58A' : '#9ca3af' }} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: '#1C2333' }}>{entity.name}</span>
                      {isCurrent && (
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', background: '#D6B58A', color: '#1C2333', padding: '2px 7px', borderRadius: 4 }}>
                          Active
                        </span>
                      )}
                      {entity.is_home && (
                        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--steel)', opacity: 0.7 }}>
                          Home
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: 12, color: 'var(--steel)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Users size={11} />{entity.member_count} member{entity.member_count !== 1 ? 's' : ''}
                      </span>
                      <span style={{ textTransform: 'capitalize' }}>{entity.plan} plan</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {!isCurrent && (
                      <button
                        className="btn-secondary"
                        style={{ padding: '6px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                        onClick={() => handleSwitch(entity.id)}
                        disabled={switching === entity.id}
                      >
                        <ArrowRightLeft size={12} />
                        {switching === entity.id ? 'Switching…' : 'Switch'}
                      </button>
                    )}
                    <button
                      style={{ background: 'none', border: '1px solid #e5e0d8', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: 'var(--steel)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                      onClick={() => toggleExpand(entity.id)}
                    >
                      Members {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div style={{ borderTop: '1px solid #f4f4f0', padding: '14px 20px', background: '#fafaf8' }}>
                    {loadingMembs ? (
                      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Loading members…</p>
                    ) : (
                      <>
                        {entityMembers.length === 0 ? (
                          <p style={{ margin: 0, fontSize: 13, color: 'var(--steel)' }}>No members yet.</p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                            {entityMembers.map(m => (
                              <div key={`${m.id}-${m.membership_type}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: '#fff', borderRadius: 8, border: '1px solid #e5e0d8' }}>
                                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#f4f4f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#9ca3af', flexShrink: 0 }}>
                                  {m.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1C2333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                                  <div style={{ fontSize: 11, color: 'var(--steel)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</div>
                                </div>
                                <span style={roleBadgeStyle(m.role)}>{m.role}</span>
                                {m.membership_type === 'cross' && (
                                  <button
                                    onClick={() => handleRemoveMember(entity.id, m.id)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e53e3e', fontSize: 16, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                                    title="Remove access"
                                  >×</button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        <button
                          className="btn-secondary"
                          style={{ fontSize: 12, padding: '6px 14px' }}
                          onClick={() => { setInviteModal({ entityId: entity.id, entityName: entity.name }); setInviteEmail(''); setInviteRole('manager'); setInviteErr(''); }}
                        >
                          + Invite Member
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Entity Modal */}
      {createOpen && (
        <div className="modal-overlay" onClick={() => setCreateOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New Entity</h2>
              <button className="btn-close" onClick={() => setCreateOpen(false)}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              {createErr && <p className="form-error" style={{ marginBottom: 12 }}>{createErr}</p>}
              <div className="form-group">
                <label>Entity Name</label>
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Downtown Location, Brand B"
                />
              </div>
              <p style={{ fontSize: 12, color: 'var(--steel)', margin: '8px 0 16px' }}>
                A new, separate business entity will be created. You can switch between entities from the sidebar.
              </p>
              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={creating || !newName.trim()}>
                  {creating ? 'Creating…' : 'Create Entity'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      {inviteModal && (
        <div className="modal-overlay" onClick={() => setInviteModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Invite to {inviteModal.entityName}</h2>
              <button className="btn-close" onClick={() => setInviteModal(null)}>×</button>
            </div>
            <form onSubmit={handleInvite}>
              {inviteErr && <p className="form-error" style={{ marginBottom: 12 }}>{inviteErr}</p>}
              <div className="form-group">
                <label>Email Address</label>
                <input
                  autoFocus
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                />
              </div>
              <div className="form-group" style={{ marginTop: 12 }}>
                <label>Role</label>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                  {ROLES.map(r => (
                    <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
              </div>
              <p style={{ fontSize: 12, color: 'var(--steel)', margin: '8px 0 16px' }}>
                The user must already have a FieldCore account. They'll see this entity in their sidebar switcher.
              </p>
              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={inviting || !inviteEmail.trim()}>
                  {inviting ? 'Inviting…' : 'Add Member'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setInviteModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
