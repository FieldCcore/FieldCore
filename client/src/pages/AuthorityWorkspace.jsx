import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import {
  AuLoading, AuError, AuBadge, AuEmpty, AuInfo,
  instrumentTypeLabel, fmtDate, fmtDateTime,
} from './AuthorityShared';

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

function ParticipantsPanel({ participants, instrumentId, locked, onMutated }) {
  const [removing, setRemoving] = useState(null);

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

  if (!participants.length) return <AuEmpty text="No participants added." />;
  return (
    <div>
      {participants.map(p => (
        <div key={p.id} className="au-participant">
          <div style={{ flex: 1 }}>
            <div className="au-participant-name">{p.display_name || '—'}</div>
            <div className="au-participant-role">{p.role.replace(/_/g, ' ')}</div>
            {p.party_type && <div style={{ fontSize: 11, color: 'var(--steel)' }}>{p.party_type}</div>}
          </div>
          <AuBadge status={p.status} />
          {!locked && (
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
    </div>
  );
}

// ── Permissions panel ─────────────────────────────────────────────────────────

function PermissionsPanel({ permissions, instrumentId, locked, onMutated }) {
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
          {!locked && (
            <button className="au-btn au-btn--outline" style={{ padding: '3px 8px', fontSize: 11 }}
              onClick={() => handleRemove(p.id)}>Remove</button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Notes panel ───────────────────────────────────────────────────────────────

function NotesPanel({ notes, caseId, onAdded }) {
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
            <div className="au-activity-action">{e.action}</div>
            <div className="au-activity-meta">
              {e.actor_name || 'System'} · {fmtDateTime(e.created_at)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Instrument section ────────────────────────────────────────────────────────

function InstrumentSection({ instr, onMutated }) {
  const [expanded, setExpanded] = useState(true);
  const [tab, setTab] = useState('participants');
  const locked = ['VERIFIED', 'REJECTED', 'REVOKED', 'EXPIRED', 'SUPERSEDED'].includes(instr.status);

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
                locked={locked}
                onMutated={onMutated}
              />
            )}
            {tab === 'permissions' && (
              <PermissionsPanel
                permissions={instr.permissions || []}
                instrumentId={instr.id}
                locked={locked}
                onMutated={onMutated}
              />
            )}
            {tab === 'restrictions' && (
              <div>
                {(instr.restrictions || []).length === 0
                  ? <AuEmpty text="No restrictions defined." />
                  : (instr.restrictions || []).map(r => (
                    <div key={r.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--lightgray)', fontSize: 13 }}>
                      <span style={{ fontWeight: 600, color: 'var(--navy)' }}>{r.restriction_type}</span>
                      {r.effective_from && <span style={{ color: 'var(--steel)', fontSize: 12, marginLeft: 8 }}>
                        from {fmtDate(r.effective_from)}
                      </span>}
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main workspace page ───────────────────────────────────────────────────────

export default function AuthorityWorkspace() {
  const { caseId } = useParams();
  const nav = useNavigate();
  const [workspace, setWorkspace] = useState(null);
  const [activity,  setActivity]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [claiming,  setClaiming]  = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [viewDocId, setViewDocId] = useState(null);

  const load = useCallback(() => {
    return Promise.all([
      api.get(`/authority/cases/${caseId}/workspace`),
      api.get(`/authority/cases/${caseId}/activity`),
    ])
      .then(([ws, act]) => {
        setWorkspace(ws.data);
        setActivity(act.data);
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

  async function handleRelease() {
    setReleasing(true);
    try {
      await api.post(`/authority/cases/${caseId}/release`);
      await load();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to release case.');
    } finally {
      setReleasing(false);
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
      await api.post(`/authority/instruments/${instrId}/transition`, { status, actorType: 'human', ...extra });
      await load();
    } catch (e) {
      setError(e.response?.data?.error || `Failed to transition instrument to ${status}.`);
    }
  }

  if (loading) return <div className="au-page"><AuLoading /></div>;

  if (!workspace) return (
    <div className="au-page">
      <AuError msg={error || 'Workspace not available.'} />
    </div>
  );

  const { case: kase, instruments, documents, assignments, notes } = workspace;
  const isAssigned = assignments.length > 0;

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
          {!isAssigned && (kase.status === 'PENDING_HUMAN_REVIEW' || kase.status === 'HUMAN_REVIEW_IN_PROGRESS') && (
            <button className="au-btn au-btn--sand" disabled={claiming} onClick={handleClaim}>
              {claiming ? 'Claiming…' : 'Claim Case'}
            </button>
          )}
          {isAssigned && (
            <button className="au-btn au-btn--outline" disabled={releasing} onClick={handleRelease}>
              {releasing ? 'Releasing…' : 'Release'}
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
                const reason = window.prompt('Cancellation reason (optional):') || null;
                handleTransition('CANCELLED');
              }}>
              Cancel
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

          {/* Instruments */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 10 }}>
              Instruments ({instruments.length})
            </div>
            {!instruments.length ? (
              <div className="au-card"><div className="au-card-body"><AuEmpty text="No instruments linked." /></div></div>
            ) : instruments.map(instr => (
              <div key={instr.id}>
                <InstrumentSection instr={instr} onMutated={load} />
                {instr.status === 'PENDING_REVIEW' && (
                  <div className="au-action-bar" style={{ marginBottom: 12, paddingLeft: 2 }}>
                    <button className="au-btn au-btn--success" style={{ fontSize: 12 }}
                      onClick={() => handleInstrumentTransition(instr.id, 'VERIFIED')}>
                      Verify Instrument
                    </button>
                    <button className="au-btn au-btn--danger" style={{ fontSize: 12 }}
                      onClick={() => {
                        const reason = window.prompt('Rejection reason:') || null;
                        handleInstrumentTransition(instr.id, 'REJECTED', { rejectionReason: reason });
                      }}>
                      Reject
                    </button>
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
              <NotesPanel notes={notes} caseId={caseId} onAdded={load} />
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
    </div>
  );
}
