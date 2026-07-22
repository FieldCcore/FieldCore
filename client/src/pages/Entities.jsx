import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Building2, Users, ArrowRightLeft, Plus, ChevronDown, ChevronUp, Pencil, Trash2, CheckCircle, ExternalLink, BarChart2 } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useEntitlements } from '../hooks/useEntitlements';
import AddressAutocomplete from '../components/AddressAutocomplete';
import StatusBadge from '../components/StatusBadge';

const BUSINESS_TYPES = ['LLC', 'S-Corp', 'C-Corp', 'Sole Proprietor', 'Partnership', 'Non-Profit', 'Other'];
const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

const EMPTY_FORM = {
  name: '', legal_name: '', dba: '', business_type: '',
  ein: '', address: '', city: '', state: '', zip: '',
  phone: '', entity_email: '', is_active: true,
};

function formatEIN(ein) {
  if (!ein) return '—';
  const digits = ein.replace(/\D/g, '');
  if (digits.length >= 2) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return ein;
}

function TypeBadge({ type }) {
  if (!type) return null;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em',
      background: '#1C233318', color: '#1C2333',
    }}>{type}</span>
  );
}

export default function Entities() {
  const { user, switchAccount, switchError } = useAuth();
  const { entitlements } = useEntitlements();
  const canCreateEntities         = entitlements?.capabilities?.can_create_entities === true;
  const canConsolidatedReporting  = entitlements?.capabilities?.can_use_consolidated_reporting === true;
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const connectSuccess = searchParams.get('connect') === 'success';

  const [entities,     setEntities]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [connecting,   setConnecting]   = useState(null);
  const [dashLoading,  setDashLoading]  = useState(null);
  const [showForm,     setShowForm]     = useState(false);
  const [editTarget,   setEditTarget]   = useState(null); // entity being edited
  const [form,         setForm]         = useState({ ...EMPTY_FORM });
  const [saving,       setSaving]       = useState(false);
  const [formError,    setFormError]    = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting,     setDeleting]     = useState(false);
  const [switching,    setSwitching]    = useState(null);
  const [membersOpen,  setMembersOpen]  = useState({});
  const [members,      setMembers]      = useState({});
  const [membLoading,  setMembLoading]  = useState({});
  const [inviteModal,  setInviteModal]  = useState(null);
  const [inviteEmail,  setInviteEmail]  = useState('');
  const [inviteRole,   setInviteRole]   = useState('manager');
  const [inviting,     setInviting]     = useState(false);
  const [inviteErr,    setInviteErr]    = useState('');
  const [analytics,    setAnalytics]    = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [connectErrors, setConnectErrors] = useState({});

  useEffect(() => {
    api.get('/entities')
      .then(r => setEntities(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!canConsolidatedReporting) return;
    setAnalyticsLoading(true);
    api.get('/analytics/consolidated')
      .then(r => setAnalytics(r.data))
      .catch(() => {})
      .finally(() => setAnalyticsLoading(false));
  }, [canConsolidatedReporting]);

  function openAdd() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM });
    setFormError('');
    setShowForm(true);
  }

  function openEdit(entity) {
    setEditTarget(entity);
    setForm({
      name:         entity.name         || '',
      legal_name:   entity.legal_name   || '',
      dba:          entity.dba          || '',
      business_type:entity.business_type|| '',
      ein:          entity.ein          || '',
      address:      entity.address      || '',
      city:         entity.city         || '',
      state:        entity.state        || '',
      zip:          entity.zip          || '',
      phone:        entity.phone        || '',
      entity_email: entity.entity_email || '',
      is_active:    entity.is_active    !== false,
    });
    setFormError('');
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('Business name is required.'); return; }
    setSaving(true);
    setFormError('');
    try {
      if (editTarget) {
        const r = await api.patch(`/entities/${editTarget.id}`, form);
        setEntities(prev => prev.map(en => en.id === editTarget.id ? { ...en, ...r.data } : en));
      } else {
        const r = await api.post('/entities', form);
        setEntities(prev => [...prev, r.data]);
      }
      setShowForm(false);
    } catch (err) {
      setFormError(err.response?.data?.error || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/entities/${deleteTarget.id}`);
      setEntities(prev => prev.map(en => en.id === deleteTarget.id ? { ...en, is_active: false } : en));
      setDeleteTarget(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleSwitch(entityId) {
    setSwitching(entityId);
    try {
      await switchAccount(entityId);
      navigate('/dashboard');
    } catch {
      setSwitching(null);
    }
  }

  async function handleConnect(entityId) {
    setConnecting(entityId);
    setConnectErrors(prev => ({ ...prev, [entityId]: '' }));
    try {
      const { data } = await api.post('/connect/onboard', { entity_id: entityId });
      window.location.href = data.url;
    } catch (err) {
      setConnectErrors(prev => ({ ...prev, [entityId]: err.response?.data?.error || 'Could not start Stripe Connect. Please try again.' }));
      setConnecting(null);
    }
  }

  async function handleDashboard(entityId) {
    setDashLoading(entityId);
    try {
      const { data } = await api.get(`/connect/dashboard/${entityId}`);
      window.open(data.url, '_blank', 'noopener');
    } catch (err) {
      alert(err.response?.data?.error || 'Could not open Stripe dashboard.');
    } finally {
      setDashLoading(null);
    }
  }

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

  function toggleMembers(entityId) {
    const next = !membersOpen[entityId];
    setMembersOpen(p => ({ ...p, [entityId]: next }));
    if (next) loadMembers(entityId);
  }

  async function handleInvite(e) {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteModal) return;
    setInviting(true);
    setInviteErr('');
    try {
      const r = await api.post(`/entities/${inviteModal.entityId}/members`, { email: inviteEmail.trim(), role: inviteRole });
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

  async function handleRemoveMember(entityId, memberId) {
    if (!window.confirm('Remove this user\'s access to this entity?')) return;
    try {
      await api.delete(`/entities/${entityId}/members/${memberId}`);
      setMembers(prev => ({ ...prev, [entityId]: prev[entityId].filter(m => m.id !== memberId) }));
    } catch (err) {
      alert(err.response?.data?.error || 'Remove failed.');
    }
  }

  const sf = f => e => setForm(p => ({ ...p, [f]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #e5e0d8',
    borderRadius: 8, fontSize: 13, color: '#1C2333', background: '#fff',
    boxSizing: 'border-box',
  };

  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#9ca3af', marginBottom: 5 };

  return (
    <div>
      <div className="page-header">
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Manage multiple business entities, locations, or brands under one account.
        </p>
        {canCreateEntities && (
          <button className="btn-primary" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Plus size={14} />Add Entity
          </button>
        )}
      </div>

      {/* Switch error banner */}
      {switchError && (
        <div style={{ background: 'var(--red-lt)', border: '1px solid rgba(198,40,40,.25)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: 'var(--red)' }}>
          {switchError}
        </div>
      )}

      {/* Stripe Connect success banner */}
      {connectSuccess && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircle size={18} style={{ color: '#16a34a', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#15803d' }}>Stripe Connect submitted</div>
              <div style={{ fontSize: 12, color: '#166534', marginTop: 1 }}>Stripe is reviewing your account. Payouts will activate automatically once verified — usually within minutes.</div>
            </div>
          </div>
          <button onClick={() => setSearchParams({})} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>
      )}

      {/* Scale plan gate */}
      {!canCreateEntities && (
        <div style={{ background: '#fdfaf5', border: '1px solid #D6B58A66', borderRadius: 12, padding: '20px 24px', marginBottom: 28, display: 'flex', alignItems: 'center', gap: 16 }}>
          <Building2 size={32} style={{ color: '#D6B58A', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1C2333', marginBottom: 4 }}>Scale Plan Required</div>
            <div style={{ fontSize: 13, color: 'var(--steel)', lineHeight: 1.6 }}>
              Multi-entity management lets you operate multiple business entities, locations, or brands — each with their own clients, jobs, invoices, and Stripe Connect payouts — all under one FieldCore login.
            </div>
          </div>
          <a href="/billing" className="btn-primary" style={{ whiteSpace: 'nowrap', flexShrink: 0, textDecoration: 'none' }}>Upgrade to Scale</a>
        </div>
      )}

      {/* Consolidated Analytics — Scale plan only */}
      {canConsolidatedReporting && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <BarChart2 size={16} style={{ color: '#D6B58A' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1C2333', textTransform: 'uppercase', letterSpacing: '.06em' }}>Consolidated Performance</span>
          </div>
          {analyticsLoading ? (
            <p className="muted" style={{ fontSize: 13 }}>Loading analytics…</p>
          ) : analytics ? (
            <>
              {/* MTD / YTD summary cards */}
              <div className="ent-analytics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
                {[
                  { label: 'Month-to-Date Revenue', value: `$${parseFloat(analytics.total_mtd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, isMoney: true },
                  { label: 'Year-to-Date Revenue',  value: `$${parseFloat(analytics.total_ytd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, isMoney: true },
                  { label: 'Active Entities',       value: analytics.entities?.length ?? 0, isMoney: false },
                ].map(card => (
                  <div key={card.label} className="stat-card">
                    <span className="stat-label">{card.label}</span>
                    <span className="stat-value" style={{ fontSize: card.isMoney ? 28 : 32 }}>{card.value}</span>
                  </div>
                ))}
              </div>

              {/* Per-entity breakdown table */}
              {analytics.entities?.length > 0 && (
                <div className="ent-table-scroll"><div style={{ background: '#fff', border: '1px solid #e5e0d8', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 80px', gap: 0, padding: '8px 20px', background: '#fafaf8', borderBottom: '1px solid #e5e0d8' }}>
                    {['Entity', 'MTD Revenue', 'Jobs MTD'].map(h => (
                      <div key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#9ca3af' }}>{h}</div>
                    ))}
                  </div>
                  {analytics.entities.map((ent, i) => (
                    <div key={ent.account_id} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 80px', gap: 0, padding: '12px 20px', borderBottom: i < analytics.entities.length - 1 ? '1px solid #f4f4f0' : 'none', alignItems: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{ent.account_name}</div>
                      <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 16, fontWeight: 400, color: 'var(--navy)' }}>${parseFloat(ent.mtd_revenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      <div style={{ fontSize: 13, color: 'var(--slate)' }}>{ent.mtd_jobs ?? 0}</div>
                    </div>
                  ))}
                </div></div>
              )}
            </>
          ) : null}
        </div>
      )}

      {loading ? (
        <p className="muted">Loading entities…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {entities.map(entity => {
            const isCurrent = entity.id === user?.accountId;
            const mOpen = membersOpen[entity.id];
            const entityMembers = members[entity.id] || [];
            const mLoading = membLoading[entity.id];

            return (
              <div key={entity.id} style={{
                background: '#fff',
                border: `1.5px solid ${isCurrent ? '#D6B58A' : '#e5e0d8'}`,
                borderRadius: 14,
                overflow: 'hidden',
                boxShadow: isCurrent ? '0 0 0 3px #D6B58A18' : '0 1px 3px rgba(0,0,0,.04)',
              }}>
                {/* Entity card header */}
                <div style={{ padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                    {/* Icon */}
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: isCurrent ? '#D6B58A22' : '#f4f4f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Building2 size={22} style={{ color: isCurrent ? '#D6B58A' : '#9ca3af' }} />
                    </div>

                    {/* Entity info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#1C2333' }}>
                          {entity.legal_name || entity.name}
                        </span>
                        {isCurrent && (
                          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', background: '#D6B58A', color: '#1C2333', padding: '2px 8px', borderRadius: 99 }}>
                            Current
                          </span>
                        )}
                        {!entity.is_active && <StatusBadge status="inactive" />}
                        <TypeBadge type={entity.business_type} />
                      </div>

                      {/* DBA */}
                      {entity.dba && entity.dba !== entity.name && (
                        <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 3 }}>
                          DBA: <span style={{ fontWeight: 600, color: '#4b5563' }}>{entity.dba}</span>
                        </div>
                      )}
                      {!entity.dba && entity.legal_name && entity.name !== entity.legal_name && (
                        <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 3 }}>
                          DBA: <span style={{ fontWeight: 600, color: '#4b5563' }}>{entity.name}</span>
                        </div>
                      )}

                      {/* Details row */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 10 }}>
                        {entity.ein && (
                          <div>
                            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: '#9ca3af', marginBottom: 1 }}>EIN</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1C2333', fontFamily: 'DM Mono, monospace' }}>{formatEIN(entity.ein)}</div>
                          </div>
                        )}
                        {(entity.city || entity.state) && (
                          <div>
                            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: '#9ca3af', marginBottom: 1 }}>Location</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1C2333' }}>{[entity.city, entity.state].filter(Boolean).join(', ')}</div>
                          </div>
                        )}
                        {entity.phone && (
                          <div>
                            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: '#9ca3af', marginBottom: 1 }}>Phone</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1C2333' }}>{entity.phone}</div>
                          </div>
                        )}
                        {entity.entity_email && (
                          <div>
                            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: '#9ca3af', marginBottom: 1 }}>Email</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1C2333' }}>{entity.entity_email}</div>
                          </div>
                        )}
                        <div>
                          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: '#9ca3af', marginBottom: 1 }}>Payouts</div>
                          <StatusBadge status={
                            entity.stripe_connect_status === 'active' ? 'payouts connected' :
                            entity.stripe_connect_status === 'pending' ? 'stripe pending' :
                            'not connected'
                          } />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: '#9ca3af', marginBottom: 1 }}>Members</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#1C2333', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Users size={11} />{entity.member_count || 0}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {!isCurrent && (
                        <button
                          className="btn-primary"
                          style={{ padding: '7px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                          onClick={() => handleSwitch(entity.id)}
                          disabled={switching === entity.id}
                        >
                          <ArrowRightLeft size={12} />{switching === entity.id ? 'Switching…' : 'Switch'}
                        </button>
                      )}
                      <button
                        className="btn-secondary"
                        style={{ padding: '7px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                        onClick={() => openEdit(entity)}
                      >
                        <Pencil size={12} />Edit
                      </button>
                      {!entity.is_home && (
                        <button
                          style={{ padding: '7px 10px', fontSize: 12, background: 'none', border: '1px solid rgba(198,40,40,.15)', borderRadius: 8, color: 'var(--red)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                          onClick={() => setDeleteTarget(entity)}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Stripe Connect status action */}
                  {(entity.stripe_connect_status === 'not_connected' || !entity.stripe_connect_status) && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f4f4f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: 'var(--steel)' }}>Connect a bank account to enable payouts. Bank details are entered securely on Stripe — FieldCore never sees them.</span>
                        <button
                          className="btn-secondary"
                          style={{ fontSize: 11, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, marginLeft: 12 }}
                          onClick={() => handleConnect(entity.id)}
                          disabled={connecting === entity.id}
                        >
                          {connecting === entity.id ? 'Redirecting…' : 'Connect Stripe →'}
                        </button>
                      </div>
                      {connectErrors[entity.id] && (
                        <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--red-lt)', border: '1px solid rgba(198,40,40,.25)', borderRadius: 6, fontSize: 12, color: 'var(--red)' }}>
                          {connectErrors[entity.id]}
                        </div>
                      )}
                    </div>
                  )}
                  {entity.stripe_connect_status === 'pending' && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f4f4f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: '#d97706' }}>Stripe is reviewing this account — payouts activate automatically once verified. If more info is needed, Stripe will email you.</span>
                        <button
                          className="btn-secondary"
                          style={{ fontSize: 11, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, marginLeft: 12 }}
                          onClick={() => handleConnect(entity.id)}
                          disabled={connecting === entity.id}
                        >
                          {connecting === entity.id ? 'Redirecting…' : 'Resume Setup →'}
                        </button>
                      </div>
                      {connectErrors[entity.id] && (
                        <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--red-lt)', border: '1px solid rgba(198,40,40,.25)', borderRadius: 6, fontSize: 12, color: 'var(--red)' }}>
                          {connectErrors[entity.id]}
                        </div>
                      )}
                    </div>
                  )}
                  {entity.stripe_connect_status === 'active' && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f4f4f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 500 }}>Payouts active — deposits and payments route to this entity's bank account.</span>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: 11, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
                        onClick={() => handleDashboard(entity.id)}
                        disabled={dashLoading === entity.id}
                      >
                        <ExternalLink size={11} />{dashLoading === entity.id ? 'Opening…' : 'Stripe Dashboard'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Members section */}
                <div style={{ borderTop: '1px solid #f4f4f0' }}>
                  <button
                    onClick={() => toggleMembers(entity.id)}
                    style={{ width: '100%', padding: '10px 24px', background: '#fafaf8', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--steel)', fontWeight: 500 }}
                  >
                    <Users size={12} />Team Members
                    {mOpen ? <ChevronUp size={12} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={12} style={{ marginLeft: 'auto' }} />}
                  </button>

                  {mOpen && (
                    <div style={{ padding: '12px 24px 16px', background: '#fafaf8', borderTop: '1px solid #f0ede6' }}>
                      {mLoading ? (
                        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Loading…</p>
                      ) : (
                        <>
                          {entityMembers.length === 0 ? (
                            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--steel)' }}>No members yet.</p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                              {entityMembers.map(m => (
                                <div key={`${m.id}-${m.membership_type}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#fff', borderRadius: 8, border: '1px solid #e5e0d8' }}>
                                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#1C233318', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#1C2333', flexShrink: 0 }}>
                                    {(m.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1C2333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                                    <div style={{ fontSize: 11, color: 'var(--steel)' }}>{m.email}</div>
                                  </div>
                                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', padding: '2px 7px', borderRadius: 4, background: '#f4f4f0', color: '#6b7280' }}>{m.role}</span>
                                  {m.membership_type === 'cross' && (
                                    <button onClick={() => handleRemoveMember(entity.id, m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: '2px 4px', fontSize: 16, lineHeight: 1 }} title="Remove">×</button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          <button
                            className="btn-secondary"
                            style={{ fontSize: 12, padding: '6px 14px' }}
                            onClick={() => { setInviteModal({ entityId: entity.id, entityName: entity.legal_name || entity.name }); setInviteEmail(''); setInviteRole('manager'); setInviteErr(''); }}
                          >
                            + Invite Member
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {entities.length === 0 && (
            <div style={{ textAlign: 'center', padding: '56px 0', color: 'var(--steel)', fontSize: 14 }}>
              {canCreateEntities ? 'No entities yet. Click "+ Add Entity" to create your first.' : 'Upgrade to Scale to manage multiple business entities.'}
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Entity Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 600, width: '94vw' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editTarget ? 'Edit Entity' : 'Add Business Entity'}</h2>
              <button className="btn-close" onClick={() => setShowForm(false)}>×</button>
            </div>

            <div className="modal-body">
            <form onSubmit={handleSave}>
              {formError && <p className="form-error" style={{ marginBottom: 14 }}>{formError}</p>}

              {/* Business Identity */}
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#9ca3af', marginBottom: 12 }}>Business Identity</div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label style={labelStyle}>Legal Business Name *</label>
                  <input style={inputStyle} value={form.legal_name} onChange={sf('legal_name')} placeholder="Full legal name on file" />
                </div>
                <div className="form-group">
                  <label style={labelStyle}>Display / DBA Name *</label>
                  <input style={inputStyle} value={form.name} onChange={sf('name')} placeholder="Doing Business As" required />
                </div>
              </div>
              <div className="form-group">
                <label style={labelStyle}>DBA (if different from above)</label>
                <input style={inputStyle} value={form.dba} onChange={sf('dba')} placeholder="Optional trade name" />
              </div>

              {/* Business Details */}
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#9ca3af', margin: '20px 0 12px' }}>Business Details</div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label style={labelStyle}>Business Type</label>
                  <select style={inputStyle} value={form.business_type} onChange={sf('business_type')}>
                    <option value="">Select type…</option>
                    {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label style={labelStyle}>EIN (Federal Tax ID)</label>
                  <input style={inputStyle} value={form.ein} onChange={sf('ein')} placeholder="XX-XXXXXXX" maxLength={10} />
                </div>
              </div>

              {editTarget && (
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" id="is_active" checked={form.is_active} onChange={sf('is_active')} style={{ width: 16, height: 16 }} />
                  <label htmlFor="is_active" style={{ fontSize: 13, fontWeight: 500, color: '#1C2333', margin: 0 }}>Entity is active</label>
                </div>
              )}

              {/* Contact & Location */}
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#9ca3af', margin: '20px 0 12px' }}>Contact & Location</div>
              <div className="form-group">
                <label style={labelStyle}>Street Address</label>
                <AddressAutocomplete
                  value={form.address}
                  onChange={v => setForm(p => ({ ...p, address: v }))}
                  onPlace={({ street, city, state, zip }) =>
                    setForm(p => ({ ...p, address: street, city, state, zip }))
                  }
                  placeholder="123 Main St"
                  style={inputStyle}
                />
              </div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label style={labelStyle}>City</label>
                  <input style={inputStyle} value={form.city} onChange={sf('city')} placeholder="Chicago" />
                </div>
                <div className="form-group" style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>State</label>
                    <select style={inputStyle} value={form.state} onChange={sf('state')}>
                      <option value="">—</option>
                      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div style={{ width: 90 }}>
                    <label style={labelStyle}>ZIP</label>
                    <input style={inputStyle} value={form.zip} onChange={sf('zip')} placeholder="60601" maxLength={10} />
                  </div>
                </div>
              </div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label style={labelStyle}>Business Phone</label>
                  <input style={inputStyle} type="tel" value={form.phone} onChange={sf('phone')} placeholder="(312) 555-0100" />
                </div>
                <div className="form-group">
                  <label style={labelStyle}>Business Email</label>
                  <input style={inputStyle} type="email" value={form.entity_email} onChange={sf('entity_email')} placeholder="info@yourbusiness.com" />
                </div>
              </div>

              <div className="form-actions" style={{ marginTop: 24 }}>
                <button type="submit" className="btn-primary" disabled={saving || !form.name.trim()}>
                  {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Create Entity'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Deactivate Entity</h2>
              <button className="btn-close" onClick={() => setDeleteTarget(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: '#4b5563', lineHeight: 1.7, margin: '0 0 8px' }}>
                Are you sure you want to deactivate <strong>{deleteTarget.legal_name || deleteTarget.name}</strong>?
              </p>
              <p style={{ fontSize: 13, color: 'var(--steel)', lineHeight: 1.7, margin: '0 0 24px' }}>
                The entity will be marked inactive. All data (jobs, clients, invoices) is preserved and can be reactivated by editing the entity.
              </p>
              <div className="form-actions">
                <button
                  className="btn-primary"
                  style={{ background: 'var(--red)', borderColor: 'var(--red)', color: '#fff' }}
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deactivating…' : 'Deactivate Entity'}
                </button>
                <button className="btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      {inviteModal && (
        <div className="modal-overlay" onClick={() => setInviteModal(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Invite to {inviteModal.entityName}</h2>
              <button className="btn-close" onClick={() => setInviteModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleInvite}>
                {inviteErr && <p className="form-error" style={{ marginBottom: 12 }}>{inviteErr}</p>}
                <div className="form-group">
                  <label>Email Address</label>
                  <input autoFocus type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="user@example.com" />
                </div>
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label>Role</label>
                  <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                    <option value="owner">Owner</option>
                    <option value="manager">Manager</option>
                    <option value="staff">Staff</option>
                    <option value="tech">Technician</option>
                  </select>
                </div>
                <p style={{ fontSize: 12, color: 'var(--steel)', margin: '10px 0 16px', lineHeight: 1.6 }}>
                  The user must already have a FieldCore account. They'll see this entity in their sidebar switcher.
                </p>
                <div className="form-actions">
                  <button type="submit" className="btn-primary" disabled={inviting || !inviteEmail.trim()}>
                    {inviting ? 'Adding…' : 'Add Member'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setInviteModal(null)}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
