import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import {
  AuLoading, AuError, AuBadge, AuEmpty, AuInfo,
  instrumentTypeLabel, fmtDate, fmtDateTime, fmtEventLabel,
} from './AuthorityShared';

const PARTICIPANT_ROLES = [
  'principal', 'agent', 'co_agent', 'successor_agent',
  'guardian', 'trustee', 'co_trustee', 'authorized_representative',
];

// ── PDF Viewer ────────────────────────────────────────────────────────────────

function PdfViewer({ documentId }) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let objectUrl;
    api.get(`/authority/documents/${documentId}`, { responseType: 'blob' })
      .then(r => {
        objectUrl = URL.createObjectURL(r.data);
        setUrl(objectUrl);
      })
      .catch(() => setErr('Could not load document.'));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [documentId]);

  if (err) return <div className="au-error">{err}</div>;
  if (!url) return <div className="au-loading">Loading document…</div>;
  return <iframe title="Document" src={url} className="au-pdf-frame" />;
}

// ── Participants panel ────────────────────────────────────────────────────────

function ParticipantsPanel({ participants, instrumentId, canMutate, onMutated }) {
  const [removing,  setRemoving]  = useState(null);
  const [adding,    setAdding]    = useState(false);
  const [parties,   setParties]   = useState([]);
  const [partyLoad, setPartyLoad] = useState(false);
  const [partyErr,  setPartyErr]  = useState('');
  const [filter,    setFilter]    = useState('');
  const [form,      setForm]      = useState({ partyId: '', role: PARTICIPANT_ROLES[0], sequence: '' });
  const [addErr,    setAddErr]    = useState('');

  async function handleRemove(pId) {
    if (!window.confirm('Remove this participant?')) return;
    setRemoving(pId);
    try {
      await api.delete(`/authority/instruments/${instrumentId}/parties/${pId}`);
      onMutated();
    } catch (e) {
      alert(e.response?.data?.error || 'Could not remove participant.');
    } finally {
      setRemoving(null);
    }
  }

  async function openAddForm() {
    setAdding(true);
    setPartyLoad(true);
    setPartyErr('');
    setFilter('');
    setForm({ partyId: '', role: PARTICIPANT_ROLES[0], sequence: '' });
    setAddErr('');
    try {
      const res = await api.get('/authority/parties', { params: { limit: 200 } });
      setParties(res.data || []);
    } catch {
      setPartyErr('Could not load parties.');
    } finally {
      setPartyLoad(false);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.partyId) { setAddErr('Select a party.'); return; }
    setAddErr('');
    try {
      await api.post(`/authority/instruments/${instrumentId}/parties`, {
        partyId:  form.partyId,
        role:     form.role,
        sequence: form.sequence !== '' ? Number(form.sequence) : undefined,
      });
      setAdding(false);
      onMutated();
    } catch (e) {
      setAddErr(e.response?.data?.error || 'Could not add participant.');
    }
  }

  const visibleParties = parties.filter(p =>
    !filter || (p.display_name || '').toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div>
      {!participants.length && !adding && <AuEmpty text="No participants added." />}
      {participants.map(p => (
        <div key={p.id} className="au-participant">
          <div style={{ flex: 1 }}>
            <div className="au-participant-name">{p.display_name || '—'}</div>
            <div className="au-participant-role">{p.role.replace(/_/g, ' ')}</div>
            {p.party_type && <div style={{ fontSize: 11, color: 'var(--steel)' }}>{p.party_type}</div>}
          </div>
          <AuBadge status={p.status} />
          {canMutate && (
            <button
              className="au-btn au-btn--outline"
              style={{ padding: '3px 8px', fontSize: 11 }}
              disabled={removing === p.id}
              onClick={() => handleRemove(p.id)}
            >
              Remove
            </button>
          )}
        </div>
      ))}

      {canMutate && !adding && (
        <button className="au-btn au-btn--outline" style={{ marginTop: 8, fontSize: 12 }}
          onClick={openAddForm}>
          + Add Participant
        </button>
      )}

      {adding && (
        <form onSubmit={handleAdd} style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--off-white)', padding: 12, borderRadius: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>Add Participant</div>
          {partyLoad && <div style={{ fontSize: 12, color: 'var(--steel)' }}>Loading parties…</div>}
          {partyErr && <div className="au-error" style={{ margin: 0 }}>{partyErr}</div>}
          {!partyLoad && !partyErr && (
            <>
              <div>
                <label className="au-label">Search parties</label>
                <input className="au-input" placeholder="Filter by name…"
                  value={filter} onChange={e => setFilter(e.target.value)} />
              </div>
              <div>
                <label className="au-label">Party</label>
                <select className="au-select" value={form.partyId}
                  onChange={e => setForm(f => ({ ...f, partyId: e.target.value }))}>
                  <option value="">— select a party —</option>
                  {visibleParties.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.display_name || p.id.slice(0, 8)} ({p.party_type})
                    </option>
                  ))}
                </select>
                {parties.length > 0 && visibleParties.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 2 }}>No parties match filter.</div>
                )}
                {parties.length === 0 && !partyLoad && (
                  <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 2 }}>No parties found. Create one on the Parties page.</div>
                )}
              </div>
              <div>
                <label className="au-label">Role</label>
                <select className="au-select" value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  {PARTICIPANT_ROLES.map(r => (
                    <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="au-label">Sequence (optional)</label>
                <input className="au-input" type="number" min="1" placeholder="e.g. 1"
                  value={form.sequence}
                  onChange={e => setForm(f => ({ ...f, sequence: e.target.value }))} />
              </div>
            </>
          )}
          {addErr && <div className="au-error" style={{ margin: 0 }}>{addErr}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="au-btn au-btn--primary" type="submit" style={{ fontSize: 12 }}
              disabled={partyLoad || !!partyErr}>Add</button>
            <button className="au-btn au-btn--outline" type="button" style={{ fontSize: 12 }}
              onClick={() => { setAdding(false); setAddErr(''); }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Permissions panel ─────────────────────────────────────────────────────────

function PermissionsPanel({ permissions, instrumentId, canMutate, onMutated }) {
  async function handleRemove(pId) {
    if (!window.confirm('Remove this permission?')) return;
    try {
      await api.delete(`/authority/instruments/${instrumentId}/permissions/${pId}`);
      onMutated();
    } catch (e) {
      alert(e.response?.data?.error || 'Could not remove permission.');
    }
  }

  if (!permissions.length) return <AuEmpty text="No permissions defined." />;
  return (
    <div>
      {permissions.map(p => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--lightgray)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: 'var(--navy)' }}>{p.action_key}</div>
          </div>
          <span className={`au-badge au-badge--${p.grant_type === 'granted' ? 'verified' : 'rejected'}`}>
            {p.grant_type}
          </span>
          {canMutate && (
            <button className="au-btn au-btn--outline" style={{ padding: '3px 8px', fontSize: 11 }}
              onClick={() => handleRemove(p.id)}>Remove</button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Notes panel ───────────────────────────────────────────────────────────────

function NotesPanel({ notes, caseId, canAdd, onAdded }) {
  const [body,    setBody]    = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    try {
      await api.post(`/authority/cases/${caseId}/notes`, { body });
      setBody('');
      setError('');
      onAdded();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add note.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {canAdd && (
        <form onSubmit={handleSubmit} className="au-note-compose" style={{ marginBottom: 16 }}>
          <textarea
            className="au-note-textarea"
            placeholder="Add a review note…"
            value={body}
            onChange={e => setBody(e.target.value)}
          />
          {error && <div className="au-error" style={{ margin: 0 }}>{error}</div>}
          <div>
            <button className="au-btn au-btn--primary" style={{ padding: '6px 14px', fontSize: 12 }}
              disabled={saving || !body.trim()} type="submit">
              {saving ? 'Saving…' : 'Add Note'}
            </button>
          </div>
        </form>
      )}
      {notes.length === 0 && <AuEmpty text="No notes yet." />}
      {notes.map(n => (
        <div key={n.id} className="au-note">
          <div className="au-note-author">{n.author_name || 'Reviewer'}</div>
          <div className="au-note-body">{n.body}</div>
          <div className="au-note-time">{fmtDateTime(n.created_at)}</div>
        </div>
      ))}
    </div>
  );
}

// ── Activity panel ────────────────────────────────────────────────────────────

function ActivityPanel({ events }) {
  if (!events.length) return <AuEmpty text="No activity recorded." />;
  return (
    <div>
      {events.map(e => (
        <div key={e.id} className="au-activity-item">
          <div className="au-activity-dot" />
          <div>
            <div className="au-activity-action">{fmtEventLabel(e.action)}</div>
            <div className="au-activity-meta">
              {e.actor_name || 'System'} · {fmtDateTime(e.created_at)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Restrictions panel ────────────────────────────────────────────────────────

const RESTRICTION_TYPE_OPTS = [
  'monetary_limit', 'date_window', 'account_scope', 'transaction_type',
  'institution_scope', 'approval_required', 'co_agent_required',
  'prohibited_action', 'triggering_condition',
];

function RestrictionsPanel({ restrictions, instrumentId, canMutate, onMutated }) {
  const [adding,   setAdding]   = useState(false);
  const [removing, setRemoving] = useState(null);
  const [form,     setForm]     = useState({ restrictionType: RESTRICTION_TYPE_OPTS[0], parameters: '' });
  const [err,      setErr]      = useState('');

  async function handleAdd(e) {
    e.preventDefault();
    let parameters;
    try {
      parameters = form.parameters.trim() ? JSON.parse(form.parameters) : {};
    } catch {
      setErr('Parameters must be valid JSON (or leave blank for {}).');
      return;
    }
    try {
      await api.post(`/authority/instruments/${instrumentId}/restrictions`, {
        restrictionType: form.restrictionType,
        parameters,
      });
      setAdding(false);
      setForm({ restrictionType: RESTRICTION_TYPE_OPTS[0], parameters: '' });
      setErr('');
      onMutated();
    } catch (e) {
      setErr(e.response?.data?.error || 'Could not add restriction.');
    }
  }

  async function handleRemove(rId) {
    if (!window.confirm('Remove this restriction?')) return;
    setRemoving(rId);
    try {
      await api.delete(`/authority/instruments/${instrumentId}/restrictions/${rId}`);
      onMutated();
    } catch (e) {
      setErr(e.response?.data?.error || 'Could not remove restriction.');
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div>
      {restrictions.length === 0 && !adding && <AuEmpty text="No restrictions defined." />}
      {restrictions.map(r => (
        <div key={r.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--lightgray)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, fontSize: 13 }}>
            <span style={{ fontWeight: 600, color: 'var(--navy)' }}>{r.restriction_type.replace(/_/g, ' ')}</span>
            {r.effective_from && (
              <span style={{ color: 'var(--steel)', fontSize: 12, marginLeft: 8 }}>
                from {fmtDate(r.effective_from)}
              </span>
            )}
          </div>
          {canMutate && (
            <button
              className="au-btn au-btn--outline"
              style={{ padding: '3px 8px', fontSize: 11 }}
              disabled={removing === r.id}
              onClick={() => handleRemove(r.id)}
            >
              Remove
            </button>
          )}
        </div>
      ))}
      {err && <div className="au-error" style={{ marginTop: 8 }}>{err}</div>}
      {canMutate && !adding && (
        <button className="au-btn au-btn--outline" style={{ marginTop: 8, fontSize: 12 }}
          onClick={() => setAdding(true)}>
          + Add Restriction
        </button>
      )}
      {adding && (
        <form onSubmit={handleAdd} style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <label className="au-label">Type</label>
            <select className="au-select" value={form.restrictionType}
              onChange={e => setForm(f => ({ ...f, restrictionType: e.target.value }))}>
              {RESTRICTION_TYPE_OPTS.map(t => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="au-label">Parameters (JSON, optional)</label>
            <input className="au-input" placeholder='e.g. {"amount":50000,"currency":"USD"}'
              value={form.parameters}
              onChange={e => setForm(f => ({ ...f, parameters: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="au-btn au-btn--primary" type="submit" style={{ fontSize: 12 }}>Save</button>
            <button className="au-btn au-btn--outline" type="button" style={{ fontSize: 12 }}
              onClick={() => { setAdding(false); setErr(''); }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Instrument section ────────────────────────────────────────────────────────

function InstrumentSection({ instr, caseStatus, isActiveAssignee, onMutated }) {
  const [expanded, setExpanded] = useState(true);
  const [tab, setTab] = useState('participants');
  const locked = ['VERIFIED', 'REJECTED', 'REVOKED', 'EXPIRED', 'SUPERSEDED'].includes(instr.status);
  const canMutate = !locked && (caseStatus !== 'HUMAN_REVIEW_IN_PROGRESS' || isActiveAssignee);

  return (
    <div className="au-card" style={{ marginBottom: 12 }}>
      <div className="au-card-header" onClick={() => setExpanded(e => !e)} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="au-card-title">{instrumentTypeLabel(instr.instrument_type)}</span>
          <AuBadge status={instr.status} />
          {locked && <span className="au-lock-badge">🔒 Locked</span>}
        </div>
        <span style={{ fontSize: 12, color: 'var(--steel)' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="au-card-body" style={{ paddingTop: 0 }}>
          <div style={{ display: 'flex', gap: 6, paddingBottom: 12, paddingTop: 12, borderBottom: '1px solid var(--lightgray)' }}>
            {['participants', 'permissions', 'restrictions'].map(t => (
              <button key={t} className={`au-btn ${tab === t ? 'au-btn--primary' : 'au-btn--outline'}`}
                style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </div>
          <div style={{ paddingTop: 12 }}>
            {tab === 'participants' && (
              <ParticipantsPanel
                participants={instr.participants || []}
                instrumentId={instr.id}
                canMutate={canMutate}
                onMutated={onMutated}
              />
            )}
            {tab === 'permissions' && (
              <PermissionsPanel
                permissions={instr.permissions || []}
                instrumentId={instr.id}
                canMutate={canMutate}
                onMutated={onMutated}
              />
            )}
            {tab === 'restrictions' && (
              <RestrictionsPanel
                restrictions={instr.restrictions || []}
                instrumentId={instr.id}
                canMutate={canMutate}
                onMutated={onMutated}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Extraction panel ──────────────────────────────────────────────────────────

const FIELD_KEY_LABEL = {
  instrument_type:   'Instrument Type',
  effective_date:    'Effective Date',
  expiration_date:   'Expiration Date',
  jurisdiction:      'Jurisdiction',
  principal_name:    'Principal Name',
  agent_name:        'Agent Name',
  trustee_name:      'Trustee Name',
  guardian_name:     'Guardian Name',
  grantor_name:      'Grantor Name',
  beneficiary_name:  'Beneficiary Name',
};

function fieldLabel(key) {
  if (FIELD_KEY_LABEL[key]) return FIELD_KEY_LABEL[key];
  if (key.startsWith('granted_action.')) return `Grant: ${key.slice('granted_action.'.length)}`;
  if (key.startsWith('restriction.'))   return `Restriction: ${key.slice('restriction.'.length)}`;
  return key;
}

function RunStatusBadge({ status }) {
  const colors = {
    pending:   { bg: '#f3f4f6', color: '#374151' },
    running:   { bg: '#dbeafe', color: '#1d4ed8' },
    completed: { bg: '#dcfce7', color: '#15803d' },
    failed:    { bg: '#fee2e2', color: '#b91c1c' },
    cancelled: { bg: '#f3f4f6', color: '#6b7280' },
  };
  const s = colors[status] || colors.cancelled;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 600, background: s.bg, color: s.color,
    }}>{status.toUpperCase()}</span>
  );
}

function CandidateRow({ candidate, caps, caseId, onMutated }) {
  const [expanded,  setExpanded]  = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [editing,   setEditing]   = useState(false);
  const [editValue, setEditValue] = useState('');
  const [err,       setErr]       = useState('');

  const canAccept = caps.includes('AUTHORITY_INSTRUMENT_VERIFY');
  const canReject = caps.includes('AUTHORITY_INSTRUMENT_VERIFY') || caps.includes('AUTHORITY_INSTRUMENT_REJECT');
  const isPending = candidate.status === 'pending';

  async function handleAccept(overrideValue) {
    setAccepting(true); setErr('');
    try {
      await api.post(`/authority/candidates/${candidate.id}/accept`, {
        rowVersion: candidate.rowVersion,
        ...(overrideValue !== undefined ? { proposedValue: overrideValue } : {}),
      });
      setEditing(false);
      onMutated();
    } catch (e) {
      setErr(e.response?.data?.error || 'Accept failed.');
    } finally {
      setAccepting(false);
    }
  }

  async function handleReject() {
    const reason = window.prompt('Reason for rejection (optional):') ?? null;
    if (reason === null) return;
    setRejecting(true); setErr('');
    try {
      await api.post(`/authority/candidates/${candidate.id}/reject`, {
        rejectionReason: reason || null,
      });
      onMutated();
    } catch (e) {
      setErr(e.response?.data?.error || 'Reject failed.');
    } finally {
      setRejecting(false);
    }
  }

  const pct = candidate.confidence != null
    ? Math.round(Number(candidate.confidence) * 100)
    : null;

  const statusColor = {
    pending:    'var(--slate)',
    accepted:   '#15803d',
    rejected:   '#b91c1c',
    superseded: '#6b7280',
  }[candidate.status] || 'var(--slate)';

  return (
    <div style={{
      border: '1px solid #e2e8f0',
      borderRadius: 6,
      marginBottom: 8,
      background: candidate.status === 'accepted' ? '#f0fdf4'
                : candidate.status === 'rejected'  ? '#fff1f2'
                : '#fff',
    }}>
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {fieldLabel(candidate.fieldKey)}
            </span>
            {pct != null && (
              <span style={{ fontSize: 10, color: 'var(--steel)' }}>{pct}% confidence</span>
            )}
            <span style={{ fontSize: 11, fontWeight: 600, color: statusColor }}>{candidate.status}</span>
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--navy)', fontFamily: 'monospace', wordBreak: 'break-word' }}>
            {/* Untrusted AI content rendered as text node only — never dangerouslySetInnerHTML */}
            {candidate.proposedValue !== null ? String(candidate.proposedValue) : <em style={{ color: 'var(--steel)' }}>not found</em>}
          </div>
          {candidate.evidence && candidate.evidence.length > 0 && (
            <button
              style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0 0 0' }}
              onClick={() => setExpanded(v => !v)}>
              {expanded ? '▲ Hide evidence' : `▼ ${candidate.evidence.length} evidence item(s)`}
            </button>
          )}
          {expanded && (
            <div style={{ marginTop: 8 }}>
              {candidate.evidence.map((ev, i) => (
                <div key={i} style={{
                  background: '#f8fafc', border: '1px solid #e2e8f0',
                  borderRadius: 4, padding: '8px 10px', marginBottom: 6,
                }}>
                  {ev.pageNumbers && ev.pageNumbers.length > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--steel)', marginBottom: 4 }}>
                      Page{ev.pageNumbers.length > 1 ? 's' : ''} {ev.pageNumbers.join(', ')}
                    </div>
                  )}
                  {/* Untrusted excerpt rendered as plain text */}
                  <div style={{ fontSize: 12, color: 'var(--navy)', fontStyle: 'italic', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {ev.excerpt ? String(ev.excerpt) : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {isPending && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
            {canAccept && (
              <button className="au-btn au-btn--success" style={{ fontSize: 11, padding: '4px 10px' }}
                disabled={accepting} onClick={() => handleAccept()}>
                {accepting ? '…' : 'Accept'}
              </button>
            )}
            {canAccept && (
              <button className="au-btn au-btn--outline" style={{ fontSize: 11, padding: '4px 10px' }}
                onClick={() => { setEditValue(candidate.proposedValue || ''); setEditing(true); }}>
                Edit & Accept
              </button>
            )}
            {canReject && (
              <button className="au-btn au-btn--danger" style={{ fontSize: 11, padding: '4px 10px' }}
                disabled={rejecting} onClick={handleReject}>
                {rejecting ? '…' : 'Reject'}
              </button>
            )}
          </div>
        )}
      </div>

      {editing && (
        <div style={{ padding: '0 14px 12px' }}>
          <textarea
            className="au-note-textarea"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            rows={2}
            style={{ fontSize: 12, fontFamily: 'monospace' }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button className="au-btn au-btn--success" style={{ fontSize: 11, padding: '4px 10px' }}
              disabled={accepting} onClick={() => handleAccept(editValue)}>
              {accepting ? '…' : 'Confirm & Accept'}
            </button>
            <button className="au-btn au-btn--outline" style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {err && <div style={{ padding: '0 14px 8px', fontSize: 11, color: '#b91c1c' }}>{err}</div>}
    </div>
  );
}

function ExtractionPanel({ caseId, runs, candidates, caps, kaseStatus, onMutated }) {
  const [retrying,      setRetrying]      = useState(null);
  const [retryErr,      setRetryErr]      = useState('');
  const canManage = caps.includes('AUTHORITY_EXTRACTION_MANAGE');

  async function handleRetry(documentId) {
    setRetrying(documentId); setRetryErr('');
    try {
      await api.post(`/authority/cases/${caseId}/extraction/retry`, { documentId });
      onMutated();
    } catch (e) {
      setRetryErr(e.response?.data?.error || 'Retry failed.');
    } finally {
      setRetrying(null);
    }
  }

  const showExtraction = ['PENDING_EXTRACTION','EXTRACTION_COMPLETE',
    'PENDING_HUMAN_REVIEW','HUMAN_REVIEW_IN_PROGRESS','COMPLETED'].includes(kaseStatus);

  if (!showExtraction && runs.length === 0) return null;

  const pendingCandidates  = candidates.filter(c => c.status === 'pending');
  const reviewedCandidates = candidates.filter(c => c.status !== 'pending');

  return (
    <div className="au-card" style={{ borderLeft: '3px solid #7c3aed' }}>
      <div className="au-card-header" style={{ background: '#faf5ff' }}>
        <span className="au-card-title" style={{ color: '#7c3aed' }}>
          AI Extraction {runs.length > 0 ? `(${runs.length} run${runs.length > 1 ? 's' : ''})` : ''}
        </span>
      </div>
      <div className="au-card-body">

        {/* Runs summary */}
        {runs.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            {runs.map(r => (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 0', borderBottom: '1px solid #f1f5f9',
              }}>
                <RunStatusBadge status={r.status} />
                <div style={{ flex: 1, fontSize: 12, color: 'var(--slate)' }}>
                  {/* Untrusted filename rendered as plain text */}
                  {String(r.original_filename || r.document_id)}
                  {r.run_kind === 'retry' && <span style={{ marginLeft: 6, color: '#7c3aed', fontSize: 10 }}>RETRY</span>}
                </div>
                {r.error_category && (
                  <span style={{ fontSize: 10, color: '#b91c1c' }}>{r.error_category}</span>
                )}
                {r.status === 'failed' && canManage && (
                  <button className="au-btn au-btn--outline" style={{ fontSize: 10, padding: '2px 8px' }}
                    disabled={retrying === r.document_id}
                    onClick={() => handleRetry(r.document_id)}>
                    {retrying === r.document_id ? '…' : 'Retry'}
                  </button>
                )}
              </div>
            ))}
            {retryErr && <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 6 }}>{retryErr}</div>}
          </div>
        )}

        {/* Pending candidates */}
        {pendingCandidates.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#7c3aed' }} />
              AI Proposed — Pending Review ({pendingCandidates.length})
            </div>
            {pendingCandidates.map(c => (
              <CandidateRow key={c.id} candidate={c} caps={caps} caseId={caseId} onMutated={onMutated} />
            ))}
          </div>
        )}

        {/* Reviewed candidates (collapsed by default) */}
        {reviewedCandidates.length > 0 && (
          <details style={{ marginTop: 4 }}>
            <summary style={{ fontSize: 12, color: 'var(--slate)', cursor: 'pointer', userSelect: 'none' }}>
              {reviewedCandidates.length} reviewed candidate{reviewedCandidates.length > 1 ? 's' : ''}
            </summary>
            <div style={{ marginTop: 8 }}>
              {reviewedCandidates.map(c => (
                <CandidateRow key={c.id} candidate={c} caps={caps} caseId={caseId} onMutated={onMutated} />
              ))}
            </div>
          </details>
        )}

        {runs.length > 0 && candidates.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 4 }}>
            {runs.some(r => r.status === 'pending' || r.status === 'running')
              ? 'Extraction in progress…'
              : 'No candidates were extracted from this document.'}
          </div>
        )}

        {runs.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--steel)' }}>
            No extraction runs yet.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main workspace page ───────────────────────────────────────────────────────

export default function AuthorityWorkspace() {
  const { caseId } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [workspace,   setWorkspace]   = useState(null);
  const [activity,    setActivity]    = useState([]);
  const [caps,        setCaps]        = useState([]);
  const [runs,        setRuns]        = useState([]);
  const [candidates,  setCandidates]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [claiming,    setClaiming]    = useState(false);
  const [viewDocId,   setViewDocId]   = useState(null);
  const [rejectModal, setRejectModal] = useState({ instrId: null, reason: '' });

  const load = useCallback(() => {
    return Promise.all([
      api.get(`/authority/cases/${caseId}/workspace`),
      api.get(`/authority/cases/${caseId}/activity`),
      api.get('/authority/capabilities'),
      api.get(`/authority/cases/${caseId}/extraction/runs`).catch(() => ({ data: [] })),
      api.get(`/authority/cases/${caseId}/candidates`).catch(() => ({ data: [] })),
    ])
      .then(([ws, act, capRes, runsRes, candsRes]) => {
        setWorkspace(ws.data);
        setActivity(act.data);
        setCaps(capRes.data.capabilities || []);
        setRuns(runsRes.data || []);
        setCandidates(candsRes.data || []);
        setError('');
      })
      .catch(e => setError(e.response?.data?.error || 'Failed to load workspace.'));
  }, [caseId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleClaim() {
    setClaiming(true);
    try {
      await api.post(`/authority/cases/${caseId}/claim`);
      await load();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to claim case.');
    } finally {
      setClaiming(false);
    }
  }

  async function handleTransition(status) {
    try {
      await api.post(`/authority/cases/${caseId}/transition`, { status });
      await load();
    } catch (e) {
      setError(e.response?.data?.error || `Failed to transition to ${status}.`);
    }
  }

  async function handleInstrumentTransition(instrId, status, extra = {}) {
    try {
      // Do NOT send actorType — backend hardcodes 'human' to prevent spoofing
      await api.post(`/authority/instruments/${instrId}/transition`, { status, ...extra });
      await load();
    } catch (e) {
      setError(e.response?.data?.error || `Failed to transition instrument to ${status}.`);
    }
  }

  async function handleRejectConfirm() {
    const { instrId, reason } = rejectModal;
    setRejectModal({ instrId: null, reason: '' });
    await handleInstrumentTransition(instrId, 'REJECTED', { rejectionReason: reason || null });
  }

  if (loading) return <div className="au-page"><AuLoading /></div>;

  if (!workspace) return (
    <div className="au-page">
      <AuError msg={error || 'Workspace not available.'} />
    </div>
  );

  const { case: kase, instruments, documents, assignments, notes } = workspace;
  const isActiveAssignee = assignments.some(a => a.assigned_to === user?.id);
  const hasReviewCapability = caps.includes('AUTHORITY_INSTRUMENT_VERIFY') || caps.includes('AUTHORITY_INSTRUMENT_REJECT');

  const canTransitionCase = (to) => {
    const allowed = {
      DRAFT: ['AWAITING_DOCUMENTS', 'CANCELLED'],
      AWAITING_DOCUMENTS: ['PENDING_EXTRACTION', 'CANCELLED'],
      EXTRACTION_COMPLETE: ['PENDING_HUMAN_REVIEW', 'CANCELLED'],
      HUMAN_REVIEW_IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
    };
    return (allowed[kase.status] || []).includes(to);
  };

  return (
    <div className="au-page">
      <div className="au-page-header">
        <div>
          <div className="au-page-title">
            {kase.external_case_reference || `Case ${kase.id.slice(0, 8)}…`}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <AuBadge status={kase.status} />
            <span style={{ fontSize: 12, color: 'var(--steel)' }}>Created {fmtDate(kase.created_at)}</span>
          </div>
        </div>
        <div className="au-action-bar">
          {hasReviewCapability && !isActiveAssignee && (kase.status === 'PENDING_HUMAN_REVIEW' || kase.status === 'HUMAN_REVIEW_IN_PROGRESS') && (
            <button className="au-btn au-btn--sand" disabled={claiming} onClick={handleClaim}>
              {claiming ? 'Claiming…' : 'Claim Case'}
            </button>
          )}
          {canTransitionCase('AWAITING_DOCUMENTS') && (
            <button className="au-btn au-btn--primary" onClick={() => handleTransition('AWAITING_DOCUMENTS')}>
              Request Documents
            </button>
          )}
          {canTransitionCase('PENDING_HUMAN_REVIEW') && (
            <button className="au-btn au-btn--primary" onClick={() => handleTransition('PENDING_HUMAN_REVIEW')}>
              Send to Review
            </button>
          )}
          {canTransitionCase('COMPLETED') && (
            <button className="au-btn au-btn--success" onClick={() => handleTransition('COMPLETED')}>
              Mark Complete
            </button>
          )}
          {canTransitionCase('CANCELLED') && (
            <button className="au-btn au-btn--outline"
              onClick={() => {
                if (window.confirm('Cancel this case? This cannot be undone.')) {
                  handleTransition('CANCELLED');
                }
              }}>
              Cancel Case
            </button>
          )}
        </div>
      </div>

      <AuError msg={error} />

      <div className="au-workspace">
        <div className="au-workspace-main">

          {/* Documents */}
          <div className="au-card">
            <div className="au-card-header">
              <span className="au-card-title">Documents ({documents.length})</span>
            </div>
            <div className="au-card-body">
              {!documents.length ? <AuEmpty text="No documents uploaded." /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {documents.map(d => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
                          {d.content_type}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--steel)' }}>
                          {Math.round(d.byte_size / 1024)} KB · {fmtDate(d.created_at)}
                        </div>
                      </div>
                      <button className="au-btn au-btn--outline"
                        style={{ padding: '5px 12px', fontSize: 12 }}
                        onClick={() => setViewDocId(viewDocId === d.id ? null : d.id)}>
                        {viewDocId === d.id ? 'Hide' : 'View'}
                      </button>
                    </div>
                  ))}
                  {viewDocId && <PdfViewer documentId={viewDocId} />}
                </div>
              )}
            </div>
          </div>

          {/* AI Extraction */}
          <ExtractionPanel
            caseId={caseId}
            runs={runs}
            candidates={candidates}
            caps={caps}
            kaseStatus={kase.status}
            onMutated={load}
          />

          {/* Instruments */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 10 }}>
              Instruments ({instruments.length})
            </div>
            {!instruments.length ? (
              <div className="au-card"><div className="au-card-body"><AuEmpty text="No instruments linked." /></div></div>
            ) : instruments.map(instr => (
              <div key={instr.id}>
                <InstrumentSection instr={instr} caseStatus={kase.status} isActiveAssignee={isActiveAssignee} onMutated={load} />
                {instr.status === 'PENDING_REVIEW' && (
                  <div className="au-action-bar" style={{ marginBottom: 12, paddingLeft: 2 }}>
                    {caps.includes('AUTHORITY_INSTRUMENT_VERIFY') && (
                      <button className="au-btn au-btn--success" style={{ fontSize: 12 }}
                        onClick={() => {
                          if (window.confirm('Verify this instrument? This confirms the document is valid and authoritative.')) {
                            handleInstrumentTransition(instr.id, 'VERIFIED');
                          }
                        }}>
                        Verify Instrument
                      </button>
                    )}
                    {caps.includes('AUTHORITY_INSTRUMENT_REJECT') && (
                      <button className="au-btn au-btn--danger" style={{ fontSize: 12 }}
                        onClick={() => setRejectModal({ instrId: instr.id, reason: '' })}>
                        Reject
                      </button>
                    )}
                    {!caps.includes('AUTHORITY_INSTRUMENT_VERIFY') && !caps.includes('AUTHORITY_INSTRUMENT_REJECT') && (
                      <span style={{ fontSize: 12, color: 'var(--steel)' }}>
                        You do not have verify or reject permissions for this instrument.
                      </span>
                    )}
                  </div>
                )}
                {instr.status === 'UNVERIFIED' && (
                  <div style={{ marginBottom: 12, paddingLeft: 2 }}>
                    <button className="au-btn au-btn--outline" style={{ fontSize: 12 }}
                      onClick={() => handleInstrumentTransition(instr.id, 'PENDING_REVIEW')}>
                      Submit for Review
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="au-workspace-aside">
          {/* Assignments */}
          <div className="au-card">
            <div className="au-card-header"><span className="au-card-title">Assignments</span></div>
            <div className="au-card-body">
              {!assignments.length
                ? <AuEmpty text="Not claimed." />
                : assignments.map(a => (
                  <div key={a.id} style={{ fontSize: 13, marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, color: 'var(--navy)' }}>{a.reviewer_name || a.assigned_to.slice(0, 8)}</div>
                    <div style={{ fontSize: 11, color: 'var(--steel)' }}>Claimed {fmtDate(a.claimed_at)}</div>
                  </div>
                ))
              }
            </div>
          </div>

          {/* Notes */}
          <div className="au-card">
            <div className="au-card-header"><span className="au-card-title">Review Notes</span></div>
            <div className="au-card-body">
              <NotesPanel notes={notes} caseId={caseId} canAdd={kase.status !== 'HUMAN_REVIEW_IN_PROGRESS' || isActiveAssignee} onAdded={load} />
            </div>
          </div>

          {/* Activity */}
          <div className="au-card">
            <div className="au-card-header"><span className="au-card-title">Activity</span></div>
            <div className="au-card-body" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <ActivityPanel events={activity} />
            </div>
          </div>
        </div>
      </div>

      {/* Reject instrument modal */}
      {rejectModal.instrId && (
        <div className="au-modal-overlay" onClick={() => setRejectModal({ instrId: null, reason: '' })}>
          <div className="au-modal" onClick={e => e.stopPropagation()}>
            <div className="au-modal-title">Reject Instrument</div>
            <p style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 12 }}>
              Provide a reason for rejection. This will be recorded and visible in the case audit log.
            </p>
            <textarea
              className="au-note-textarea"
              placeholder="Rejection reason…"
              value={rejectModal.reason}
              onChange={e => setRejectModal(m => ({ ...m, reason: e.target.value }))}
              rows={3}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="au-btn au-btn--outline"
                onClick={() => setRejectModal({ instrId: null, reason: '' })}>
                Cancel
              </button>
              <button className="au-btn au-btn--danger" onClick={handleRejectConfirm}>
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
