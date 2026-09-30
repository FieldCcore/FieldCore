import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import {
  AuBadge, AuLoading, AuError, AuEmpty,
  instrumentTypeLabel, fmtEventLabel,
} from './AuthorityShared';
import { formatDateOnly, formatTimestamp, truncateMiddle } from '../utils/formatters';

const PARTICIPANT_ROLES = [
  'principal', 'agent', 'co_agent', 'successor_agent',
  'guardian', 'trustee', 'co_trustee', 'authorized_representative',
];

const RESTRICTION_TYPE_OPTS = [
  'monetary_limit', 'date_window', 'account_scope', 'transaction_type',
  'institution_scope', 'approval_required', 'co_agent_required',
  'prohibited_action', 'triggering_condition',
];

const CASE_STAGES = [
  'DRAFT',
  'AWAITING_DOCUMENTS',
  'PENDING_EXTRACTION',
  'EXTRACTION_COMPLETE',
  'PENDING_HUMAN_REVIEW',
  'HUMAN_REVIEW_IN_PROGRESS',
  'COMPLETED',
];

const TABS = [
  { id: 'overview',    label: 'Overview' },
  { id: 'parties',     label: 'Parties' },
  { id: 'instrument',  label: 'Instrument' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'restrictions',label: 'Restrictions' },
  { id: 'extraction',  label: 'Extraction' },
];

// ── Confirm dialog ────────────────────────────────────────────────────────────

function ConfirmDialog({ title, body, note, textarea, textareaPlaceholder, confirmLabel, confirmVariant, onConfirm, onCancel }) {
  const [value, setValue] = useState('');

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onCancel(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fc-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="fc-confirm-title" onClick={onCancel}>
      <div className="fc-confirm-dialog" onClick={e => e.stopPropagation()}>
        <div id="fc-confirm-title" className="fc-confirm-title">{title}</div>
        {body  && <div className="fc-confirm-body">{body}</div>}
        {note  && <div className="fc-confirm-note">{note}</div>}
        {textarea && (
          <textarea
            className="fc-confirm-textarea"
            placeholder={textareaPlaceholder || ''}
            value={value}
            onChange={e => setValue(e.target.value)}
            autoFocus
          />
        )}
        <div className="fc-confirm-actions">
          <button className="fc-db-btn fc-db-btn--outline" onClick={onCancel}>Cancel</button>
          <button
            className={`fc-db-btn fc-db-btn--${confirmVariant || 'primary'}`}
            onClick={() => onConfirm(value)}
          >
            {confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Activity drawer ───────────────────────────────────────────────────────────

function ActivityDrawer({ open, onClose, events }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {open && <div className="fc-drawer-backdrop" onClick={onClose} />}
      <div className={`fc-drawer${open ? ' fc-drawer--open' : ''}`} aria-hidden={!open}>
        <div className="fc-drawer-header">
          <span className="fc-drawer-title">Activity</span>
          <button className="fc-drawer-close" onClick={onClose} aria-label="Close activity drawer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="fc-drawer-body">
          {events.length === 0
            ? <AuEmpty text="No activity recorded." />
            : events.map(e => (
              <div key={e.id} className="fc-timeline-item">
                <div className="fc-timeline-dot" />
                <div>
                  <div className="fc-timeline-action">{fmtEventLabel(e.action)}</div>
                  <div className="fc-timeline-meta">
                    {e.actor_name || 'System'} · {formatTimestamp(e.created_at)}
                  </div>
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </>
  );
}

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

  if (err) return <div className="au-error" style={{ margin: 12 }}>{err}</div>;
  if (!url) return <div className="au-loading">Loading document…</div>;
  return <iframe title="Document" src={url} style={{ width: '100%', height: '100%', border: 'none' }} />;
}

// ── Document pane ─────────────────────────────────────────────────────────────

function DocumentPane({ documents, viewDocId, onViewDoc }) {
  return (
    <div className="fc-pane-doc" data-testid="document-pane">
      {documents.length > 0 && (
        <div className="fc-doc-list">
          {documents.map(d => (
            <button
              key={d.id}
              className={`fc-doc-item${viewDocId === d.id ? ' fc-doc-item--active' : ''}`}
              onClick={() => onViewDoc(viewDocId === d.id ? null : d.id)}
            >
              <div className="fc-doc-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <path d="M14 2v6h6"/>
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div className="fc-doc-name">{d.content_type}</div>
                <div className="fc-doc-meta">
                  {Math.round(d.byte_size / 1024)} KB · {formatDateOnly(d.created_at)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      <div className="fc-doc-viewer">
        {viewDocId
          ? <PdfViewer documentId={viewDocId} />
          : (
            <div className="fc-doc-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
              </svg>
              <span>{documents.length === 0 ? 'No documents uploaded.' : 'Select a document to view.'}</span>
            </div>
          )
        }
      </div>
    </div>
  );
}

// ── Lifecycle strip ───────────────────────────────────────────────────────────

function LifecycleStrip({ status }) {
  const terminalSet = new Set(['CANCELLED', 'COMPLETED']);
  const activeIdx = CASE_STAGES.indexOf(status);
  const stages = status === 'CANCELLED'
    ? [...CASE_STAGES, 'CANCELLED']
    : CASE_STAGES;

  return (
    <div className="fc-lifecycle" aria-label="Case lifecycle" data-testid="lifecycle-strip">
      {stages.map((stage, i) => {
        const stageIdx = CASE_STAGES.indexOf(stage);
        const isActive = stage === status;
        const isDone   = activeIdx > -1 && stageIdx < activeIdx && !terminalSet.has(stage);
        const label    = stage.replace(/_/g, ' ');

        return (
          <div key={stage} className="fc-lc-stage">
            {i > 0 && <span className="fc-lc-arrow">›</span>}
            <div className={`fc-lc-dot${isActive ? ' fc-lc-dot--active' : isDone ? ' fc-lc-dot--done' : ''}`} />
            <span className={`fc-lc-label${isActive ? ' fc-lc-label--active' : isDone ? ' fc-lc-label--done' : ''}`}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

function TabBar({ tabs, active, onChange }) {
  return (
    <div className="fc-tab-bar" role="tablist" data-testid="tab-bar">
      {tabs.map(t => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          className={`fc-tab${active === t.id ? ' fc-tab--active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.count != null && (
            <span className="fc-tab-count">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ kase, instruments, assignments, notes, caseId, isActiveAssignee, canAdd, onAdded }) {
  const [body,   setBody]   = useState('');
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  async function handleNote(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    try {
      await api.post(`/authority/cases/${caseId}/notes`, { body });
      setBody(''); setErr('');
      onAdded();
    } catch (ex) {
      setErr(ex.response?.data?.error || 'Failed to add note.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="fc-entity-card">
        <div className="fc-entity-card-title">Case Details</div>
        <div className="fc-field-row">
          <span className="fc-field-label">Reference</span>
          <span className="fc-field-value fc-field-value--mono">
            {kase.external_case_reference || truncateMiddle(kase.id, 16)}
          </span>
        </div>
        <div className="fc-field-row">
          <span className="fc-field-label">Status</span>
          <span className="fc-field-value"><AuBadge status={kase.status} /></span>
        </div>
        <div className="fc-field-row">
          <span className="fc-field-label">Created</span>
          <span className="fc-field-value">{formatDateOnly(kase.created_at)}</span>
        </div>
        {kase.external_case_reference && (
          <div className="fc-field-row">
            <span className="fc-field-label">Case ID</span>
            <span className="fc-field-value fc-field-value--mono">{truncateMiddle(kase.id, 20)}</span>
          </div>
        )}
      </div>

      <div className="fc-entity-card">
        <div className="fc-entity-card-title">Instruments ({instruments.length})</div>
        {instruments.length === 0
          ? <AuEmpty text="No instruments linked." />
          : instruments.map(instr => (
            <div key={instr.id} className="fc-instr-summary">
              <span className="fc-instr-summary-type">{instrumentTypeLabel(instr.instrument_type)}</span>
              <AuBadge status={instr.status} />
            </div>
          ))
        }
      </div>

      <div className="fc-entity-card">
        <div className="fc-entity-card-title">Assignments</div>
        {assignments.length === 0
          ? <AuEmpty text="Not claimed." />
          : assignments.map(a => (
            <div key={a.id} className="fc-field-row">
              <span className="fc-field-label">{a.reviewer_name || truncateMiddle(a.assigned_to, 12)}</span>
              <span className="fc-field-value">Claimed {formatDateOnly(a.claimed_at)}</span>
            </div>
          ))
        }
      </div>

      <div className="fc-entity-card">
        <div className="fc-entity-card-title">Review Notes</div>
        {canAdd && (
          <form onSubmit={handleNote} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            <textarea
              className="au-note-textarea"
              placeholder="Add a review note…"
              value={body}
              onChange={e => setBody(e.target.value)}
            />
            {err && <div className="au-error" style={{ margin: 0 }}>{err}</div>}
            <div>
              <button className="au-btn au-btn--primary" style={{ fontSize: 12, padding: '5px 12px' }}
                disabled={saving || !body.trim()} type="submit">
                {saving ? 'Saving…' : 'Add Note'}
              </button>
            </div>
          </form>
        )}
        {notes.length === 0
          ? <AuEmpty text="No notes yet." />
          : notes.map(n => (
            <div key={n.id} className="au-note">
              <div className="au-note-author">{n.author_name || 'Reviewer'}</div>
              <div className="au-note-body">{n.body}</div>
              <div className="au-note-time">{formatTimestamp(n.created_at)}</div>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ── Parties tab ───────────────────────────────────────────────────────────────

function PartiesTab({ instruments, canMutate, onMutated }) {
  return (
    <div>
      {instruments.length === 0 && <AuEmpty text="No instruments linked." />}
      {instruments.map(instr => (
        <div key={instr.id} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fc-text-dim)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            {instrumentTypeLabel(instr.instrument_type)} <AuBadge status={instr.status} />
          </div>
          <PartiesPanel
            participants={instr.participants || []}
            instrumentId={instr.id}
            canMutate={canMutate(instr)}
            onMutated={onMutated}
          />
        </div>
      ))}
    </div>
  );
}

function PartiesPanel({ participants, instrumentId, canMutate, onMutated }) {
  const [removing, setRemoving] = useState(null);
  const [adding,   setAdding]   = useState(false);
  const [parties,  setParties]  = useState([]);
  const [pLoad,    setPLoad]    = useState(false);
  const [pErr,     setPErr]     = useState('');
  const [filter,   setFilter]   = useState('');
  const [form,     setForm]     = useState({ partyId: '', role: PARTICIPANT_ROLES[0], sequence: '' });
  const [addErr,   setAddErr]   = useState('');

  async function handleRemove(pId) {
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

  async function openAdd() {
    setAdding(true); setPLoad(true); setPErr(''); setFilter('');
    setForm({ partyId: '', role: PARTICIPANT_ROLES[0], sequence: '' }); setAddErr('');
    try {
      const res = await api.get('/authority/parties', { params: { limit: 200 } });
      setParties(res.data || []);
    } catch { setPErr('Could not load parties.'); }
    finally { setPLoad(false); }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.partyId) { setAddErr('Select a party.'); return; }
    setAddErr('');
    try {
      await api.post(`/authority/instruments/${instrumentId}/parties`, {
        partyId: form.partyId, role: form.role,
        sequence: form.sequence !== '' ? Number(form.sequence) : undefined,
      });
      setAdding(false); onMutated();
    } catch (e) { setAddErr(e.response?.data?.error || 'Could not add participant.'); }
  }

  const visible = parties.filter(p => !filter || (p.display_name || '').toLowerCase().includes(filter.toLowerCase()));

  if (!participants.length && !canMutate) return <AuEmpty text="No participants." />;

  return (
    <div>
      {participants.map(p => (
        <div key={p.id} className="au-participant">
          <div style={{ flex: 1 }}>
            <div className="au-participant-name">{p.display_name || '—'}</div>
            <div className="au-participant-role">{p.role.replace(/_/g, ' ')}</div>
          </div>
          <AuBadge status={p.status} />
          {canMutate && (
            <button className="au-btn au-btn--outline" style={{ padding: '3px 8px', fontSize: 11 }}
              disabled={removing === p.id} onClick={() => handleRemove(p.id)}>
              Remove
            </button>
          )}
        </div>
      ))}
      {participants.length === 0 && <AuEmpty text="No participants added." />}
      {canMutate && !adding && (
        <button className="au-btn au-btn--outline" style={{ marginTop: 8, fontSize: 12 }} onClick={openAdd}>
          + Add Participant
        </button>
      )}
      {adding && (
        <form onSubmit={handleAdd} style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--fc-canvas)', padding: 12, borderRadius: 6 }}>
          {pLoad && <div style={{ fontSize: 12, color: 'var(--fc-text-dim)' }}>Loading parties…</div>}
          {pErr && <div className="au-error" style={{ margin: 0 }}>{pErr}</div>}
          {!pLoad && !pErr && (
            <>
              <div>
                <label className="au-label">Search parties</label>
                <input className="au-input" placeholder="Filter…" value={filter} onChange={e => setFilter(e.target.value)} />
              </div>
              <div>
                <label className="au-label">Party</label>
                <select className="au-select" value={form.partyId} onChange={e => setForm(f => ({ ...f, partyId: e.target.value }))}>
                  <option value="">— select a party —</option>
                  {visible.map(p => (
                    <option key={p.id} value={p.id}>{p.display_name || truncateMiddle(p.id, 12)} ({p.party_type})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="au-label">Role</label>
                <select className="au-select" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  {PARTICIPANT_ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="au-label">Sequence (optional)</label>
                <input className="au-input" type="number" min="1" placeholder="e.g. 1"
                  value={form.sequence} onChange={e => setForm(f => ({ ...f, sequence: e.target.value }))} />
              </div>
            </>
          )}
          {addErr && <div className="au-error" style={{ margin: 0 }}>{addErr}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="au-btn au-btn--primary" type="submit" style={{ fontSize: 12 }} disabled={pLoad || !!pErr}>Add</button>
            <button className="au-btn au-btn--outline" type="button" style={{ fontSize: 12 }} onClick={() => { setAdding(false); setAddErr(''); }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Instrument tab ────────────────────────────────────────────────────────────

function InstrumentTab({ instruments, caseStatus, isActiveAssignee, onTransition }) {
  if (!instruments.length) return <AuEmpty text="No instruments linked." />;

  return (
    <div>
      {instruments.map(instr => {
        const locked = ['VERIFIED', 'REJECTED', 'REVOKED', 'EXPIRED', 'SUPERSEDED'].includes(instr.status);

        return (
          <div key={instr.id} className="fc-entity-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ font: '600 13px Inter, sans-serif', color: 'var(--fc-text)', flex: 1 }}>
                {instrumentTypeLabel(instr.instrument_type)}
              </span>
              <AuBadge status={instr.status} />
              {locked && (
                <span style={{ fontSize: 10, color: 'var(--amber)', background: 'var(--amber-lt)', padding: '1px 7px', borderRadius: 99, fontWeight: 700 }}>
                  Locked
                </span>
              )}
            </div>
            {instr.effective_date && (
              <div className="fc-field-row">
                <span className="fc-field-label">Effective Date</span>
                <span className="fc-field-value">{formatDateOnly(instr.effective_date)}</span>
              </div>
            )}
            {instr.expiration_date && (
              <div className="fc-field-row">
                <span className="fc-field-label">Expiration Date</span>
                <span className="fc-field-value">{formatDateOnly(instr.expiration_date)}</span>
              </div>
            )}
            <div className="fc-field-row">
              <span className="fc-field-label">ID</span>
              <span className="fc-field-value fc-field-value--mono">{truncateMiddle(instr.id, 20)}</span>
            </div>
            {instr.status === 'UNVERIFIED' && (
              <div style={{ marginTop: 10 }}>
                <button className="fc-db-btn fc-db-btn--outline"
                  onClick={() => onTransition(instr.id, 'PENDING_REVIEW')}>
                  Submit for Review
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Permissions tab ───────────────────────────────────────────────────────────

function PermissionsTab({ instruments, canMutate, onMutated }) {
  if (!instruments.length) return <AuEmpty text="No instruments linked." />;

  return (
    <div>
      {instruments.map(instr => {
        const perms = instr.permissions || [];
        const mutable = canMutate(instr);

        return (
          <div key={instr.id} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fc-text-dim)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
              {instrumentTypeLabel(instr.instrument_type)}
            </div>
            {perms.length === 0
              ? <AuEmpty text="No permissions defined." />
              : perms.map(p => (
                <div key={p.id} className="fc-perm-row">
                  <span className="fc-action-key">{p.action_key}</span>
                  <span className={`au-badge au-badge--${p.grant_type === 'granted' ? 'verified' : 'rejected'}`}>
                    {p.grant_type}
                  </span>
                  <span style={{ flex: 1 }} />
                  {mutable && (
                    <button className="au-btn au-btn--outline" style={{ padding: '3px 8px', fontSize: 11 }}
                      onClick={async () => {
                        try {
                          await api.delete(`/authority/instruments/${instr.id}/permissions/${p.id}`);
                          onMutated();
                        } catch (e) { alert(e.response?.data?.error || 'Could not remove permission.'); }
                      }}>
                      Remove
                    </button>
                  )}
                </div>
              ))
            }
          </div>
        );
      })}
    </div>
  );
}

// ── Restrictions tab ──────────────────────────────────────────────────────────

function RestrictionsTab({ instruments, canMutate, onMutated }) {
  if (!instruments.length) return <AuEmpty text="No instruments linked." />;

  return (
    <div>
      {instruments.map(instr => {
        const restrictions = instr.restrictions || [];
        const mutable = canMutate(instr);

        return (
          <div key={instr.id} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fc-text-dim)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
              {instrumentTypeLabel(instr.instrument_type)}
            </div>
            {mutable && (
              <AddRestrictionForm instrumentId={instr.id} onMutated={onMutated} />
            )}
            {restrictions.length === 0
              ? <AuEmpty text="No restrictions defined." />
              : restrictions.map(r => (
                <div key={r.id} className="fc-restrict-row">
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--fc-text)' }}>
                    {r.restriction_type.replace(/_/g, ' ')}
                  </span>
                  {r.effective_from && (
                    <span style={{ fontSize: 11, color: 'var(--fc-text-dim)' }}>
                      from {formatDateOnly(r.effective_from)}
                    </span>
                  )}
                  {mutable && (
                    <button className="au-btn au-btn--outline" style={{ padding: '3px 8px', fontSize: 11 }}
                      onClick={async () => {
                        try {
                          await api.delete(`/authority/instruments/${instr.id}/restrictions/${r.id}`);
                          onMutated();
                        } catch (e) { alert(e.response?.data?.error || 'Could not remove restriction.'); }
                      }}>
                      Remove
                    </button>
                  )}
                </div>
              ))
            }
          </div>
        );
      })}
    </div>
  );
}

function AddRestrictionForm({ instrumentId, onMutated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ restrictionType: RESTRICTION_TYPE_OPTS[0], parameters: '' });
  const [err,  setErr]  = useState('');

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
        restrictionType: form.restrictionType, parameters,
      });
      setOpen(false);
      setForm({ restrictionType: RESTRICTION_TYPE_OPTS[0], parameters: '' });
      setErr('');
      onMutated();
    } catch (e) { setErr(e.response?.data?.error || 'Could not add restriction.'); }
  }

  if (!open) {
    return (
      <button className="au-btn au-btn--outline" style={{ fontSize: 12, marginBottom: 8 }} onClick={() => setOpen(true)}>
        + Add Restriction
      </button>
    );
  }

  return (
    <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--fc-canvas)', padding: 12, borderRadius: 6, marginBottom: 8 }}>
      <div>
        <label className="au-label">Type</label>
        <select className="au-select" value={form.restrictionType} onChange={e => setForm(f => ({ ...f, restrictionType: e.target.value }))}>
          {RESTRICTION_TYPE_OPTS.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
      </div>
      <div>
        <label className="au-label">Parameters (JSON, optional)</label>
        <input className="au-input" placeholder='e.g. {"amount":50000}'
          value={form.parameters} onChange={e => setForm(f => ({ ...f, parameters: e.target.value }))} />
      </div>
      {err && <div className="au-error" style={{ margin: 0 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="au-btn au-btn--primary" type="submit" style={{ fontSize: 12 }}>Save</button>
        <button className="au-btn au-btn--outline" type="button" style={{ fontSize: 12 }} onClick={() => { setOpen(false); setErr(''); }}>Cancel</button>
      </div>
    </form>
  );
}

// ── Extraction tab ────────────────────────────────────────────────────────────

const FIELD_KEY_LABEL = {
  instrument_type: 'Instrument Type', effective_date: 'Effective Date',
  expiration_date: 'Expiration Date', jurisdiction: 'Jurisdiction',
  principal_name: 'Principal Name', agent_name: 'Agent Name',
  trustee_name: 'Trustee Name', guardian_name: 'Guardian Name',
  grantor_name: 'Grantor Name', beneficiary_name: 'Beneficiary Name',
};
function fieldLabel(key) {
  if (FIELD_KEY_LABEL[key]) return FIELD_KEY_LABEL[key];
  if (key.startsWith('granted_action.')) return `Grant: ${key.slice('granted_action.'.length)}`;
  if (key.startsWith('restriction.')) return `Restriction: ${key.slice('restriction.'.length)}`;
  return key;
}

function CandidateCard({ candidate, caps, caseId, onMutated }) {
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
      setEditing(false); onMutated();
    } catch (e) { setErr(e.response?.data?.error || 'Accept failed.'); }
    finally { setAccepting(false); }
  }

  async function handleReject(reason) {
    setRejecting(true); setErr('');
    try {
      await api.post(`/authority/candidates/${candidate.id}/reject`, {
        rejectionReason: reason || null,
      });
      onMutated();
    } catch (e) { setErr(e.response?.data?.error || 'Reject failed.'); }
    finally { setRejecting(false); }
  }

  const pct = candidate.confidence != null ? Math.round(Number(candidate.confidence) * 100) : null;
  const statusColor = {
    pending: 'var(--fc-text-dim)', accepted: '#15803d', rejected: '#b91c1c', superseded: '#6b7280',
  }[candidate.status] || 'var(--fc-text-dim)';

  return (
    <div className={`fc-candidate${candidate.status !== 'pending' ? ` fc-candidate--${candidate.status}` : ''}`}
      data-testid="candidate-card">
      <div className="fc-candidate-body">
        <div className="fc-candidate-main">
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="fc-candidate-field">{fieldLabel(candidate.fieldKey)}</span>
            {pct != null && <span className="fc-candidate-confidence">{pct}% confidence</span>}
            <span className="fc-candidate-status" style={{ marginLeft: 8, color: statusColor }}>{candidate.status}</span>
          </div>
          <div className="fc-candidate-value">
            {/* Untrusted AI content rendered as plain text — never dangerouslySetInnerHTML */}
            {candidate.proposedValue !== null
              ? String(candidate.proposedValue)
              : <em style={{ color: 'var(--fc-text-dim)' }}>not found</em>}
          </div>
          {candidate.evidence && candidate.evidence.length > 0 && (
            <button className="fc-evidence-toggle" onClick={() => setExpanded(v => !v)}>
              {expanded ? '▲ Hide evidence' : `▼ ${candidate.evidence.length} evidence item(s)`}
            </button>
          )}
          {expanded && candidate.evidence.map((ev, i) => (
            <EvidenceBlock key={i} evidence={ev} />
          ))}
        </div>
        {isPending && (
          <div className="fc-candidate-actions">
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
            {canReject && <RejectCandidateButton rejecting={rejecting} onReject={handleReject} />}
          </div>
        )}
      </div>
      {editing && (
        <div style={{ padding: '0 14px 12px' }}>
          <textarea className="au-note-textarea" value={editValue} onChange={e => setEditValue(e.target.value)}
            rows={2} style={{ fontSize: 12, fontFamily: 'monospace' }} />
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

function RejectCandidateButton({ rejecting, onReject }) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <ConfirmDialog
        title="Reject Candidate"
        body="Provide a reason for rejection (optional)."
        textarea
        textareaPlaceholder="Rejection reason…"
        confirmLabel="Reject"
        confirmVariant="danger"
        onConfirm={reason => { setOpen(false); onReject(reason); }}
        onCancel={() => setOpen(false)}
      />
    );
  }

  return (
    <button className="au-btn au-btn--danger" style={{ fontSize: 11, padding: '4px 10px' }}
      disabled={rejecting} onClick={() => setOpen(true)}>
      {rejecting ? '…' : 'Reject'}
    </button>
  );
}

function EvidenceBlock({ evidence: ev }) {
  return (
    <div className="fc-evidence" data-testid="evidence-block">
      {ev.pageNumbers && ev.pageNumbers.length > 0 && (
        <div className="fc-evidence-pages">
          Page{ev.pageNumbers.length > 1 ? 's' : ''} {ev.pageNumbers.join(', ')}
        </div>
      )}
      {/* Untrusted excerpt rendered as plain text — never dangerouslySetInnerHTML */}
      <div className="fc-evidence-excerpt">{ev.excerpt ? String(ev.excerpt) : ''}</div>
    </div>
  );
}

function ExtractionTab({ caseId, runs, candidates, caps, kaseStatus, onMutated }) {
  const [retrying, setRetrying] = useState(null);
  const [retryErr, setRetryErr] = useState('');
  const canManage = caps.includes('AUTHORITY_EXTRACTION_MANAGE');

  const showExtraction = ['PENDING_EXTRACTION','EXTRACTION_COMPLETE',
    'PENDING_HUMAN_REVIEW','HUMAN_REVIEW_IN_PROGRESS','COMPLETED'].includes(kaseStatus);

  if (!showExtraction && runs.length === 0) {
    return <AuEmpty text="No extraction data for this case status." />;
  }

  const pending  = candidates.filter(c => c.status === 'pending');
  const reviewed = candidates.filter(c => c.status !== 'pending');

  return (
    <div>
      {runs.length > 0 && (
        <div className="fc-entity-card">
          <div className="fc-entity-card-title">Extraction Runs ({runs.length})</div>
          {runs.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--fc-border)' }}>
              <span style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                fontSize: 11, fontWeight: 600,
                background: { pending:'#f3f4f6', running:'#dbeafe', completed:'#dcfce7', failed:'#fee2e2', cancelled:'#f3f4f6' }[r.status] || '#f3f4f6',
                color:      { pending:'#374151', running:'#1d4ed8', completed:'#15803d', failed:'#b91c1c', cancelled:'#6b7280' }[r.status] || '#374151',
              }}>{r.status.toUpperCase()}</span>
              <div style={{ flex: 1, fontSize: 12, color: 'var(--fc-text-muted)' }}>
                {/* Original filename not displayed — show document id only */}
                {truncateMiddle(r.document_id, 16)}
                {r.run_kind === 'retry' && <span style={{ marginLeft: 6, color: '#7c3aed', fontSize: 10 }}>RETRY</span>}
                {r.status === 'failed' && r.error_category && (
                  <span style={{ marginLeft: 6, color: '#b91c1c', fontSize: 10 }}>{r.error_category}</span>
                )}
              </div>
              {r.status === 'failed' && canManage && (
                <button className="au-btn au-btn--outline" style={{ fontSize: 10, padding: '2px 8px' }}
                  disabled={retrying === r.document_id}
                  onClick={async () => {
                    setRetrying(r.document_id); setRetryErr('');
                    try { await api.post(`/authority/cases/${caseId}/extraction/retry`, { documentId: r.document_id }); onMutated(); }
                    catch (e) { setRetryErr(e.response?.data?.error || 'Retry failed.'); }
                    finally { setRetrying(null); }
                  }}>
                  {retrying === r.document_id ? '…' : 'Retry'}
                </button>
              )}
            </div>
          ))}
          {retryErr && <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 6 }}>{retryErr}</div>}
        </div>
      )}

      {pending.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', marginBottom: 8 }}>
            AI Proposed — Pending Review ({pending.length})
          </div>
          {pending.map(c => <CandidateCard key={c.id} candidate={c} caps={caps} caseId={caseId} onMutated={onMutated} />)}
        </div>
      )}

      {reviewed.length > 0 && (
        <details style={{ marginTop: 4 }}>
          <summary style={{ fontSize: 12, color: 'var(--fc-text-muted)', cursor: 'pointer', userSelect: 'none' }}>
            {reviewed.length} reviewed candidate{reviewed.length > 1 ? 's' : ''}
          </summary>
          <div style={{ marginTop: 8 }}>
            {reviewed.map(c => <CandidateCard key={c.id} candidate={c} caps={caps} caseId={caseId} onMutated={onMutated} />)}
          </div>
        </details>
      )}

      {runs.length > 0 && candidates.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--fc-text-dim)' }}>
          {runs.some(r => r.status === 'pending' || r.status === 'running')
            ? 'Extraction in progress…'
            : 'No candidates were extracted from this document.'}
        </div>
      )}

      {runs.length === 0 && (
        <div className="fc-entity-card">
          <div style={{ fontSize: 12, color: 'var(--fc-text-dim)' }}>No extraction runs yet.</div>
        </div>
      )}

      <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--fc-canvas)', border: '1px solid var(--fc-border)', borderRadius: 'var(--r-sm)', fontSize: 11, color: 'var(--fc-text-dim)', lineHeight: 1.5 }}>
        AI extraction is not a legal determination and does not execute any action.
        All candidates require human review before any instrument record is updated.
      </div>
    </div>
  );
}

// ── Decision bar ──────────────────────────────────────────────────────────────

function DecisionBar({ kase, caps, isActiveAssignee, claiming, onClaim, onTransition, onInstrumentTransition, instruments }) {
  const [confirm, setConfirm] = useState(null);

  const allowed = {
    DRAFT: ['AWAITING_DOCUMENTS', 'CANCELLED'],
    AWAITING_DOCUMENTS: ['PENDING_EXTRACTION', 'CANCELLED'],
    EXTRACTION_COMPLETE: ['PENDING_HUMAN_REVIEW', 'CANCELLED'],
    HUMAN_REVIEW_IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  };
  const canGo = (to) => (allowed[kase.status] || []).includes(to);
  const hasReviewCap = caps.includes('AUTHORITY_INSTRUMENT_VERIFY') || caps.includes('AUTHORITY_INSTRUMENT_REJECT');

  const pendingReview = instruments.filter(i => i.status === 'PENDING_REVIEW');

  const hasAnyAction = (
    (hasReviewCap && !isActiveAssignee && ['PENDING_HUMAN_REVIEW','HUMAN_REVIEW_IN_PROGRESS'].includes(kase.status)) ||
    canGo('AWAITING_DOCUMENTS') || canGo('PENDING_HUMAN_REVIEW') || canGo('COMPLETED') || canGo('CANCELLED') ||
    (pendingReview.length > 0 && (caps.includes('AUTHORITY_INSTRUMENT_VERIFY') || caps.includes('AUTHORITY_INSTRUMENT_REJECT')))
  );

  if (!hasAnyAction) return null;

  function ask(cfg) { setConfirm(cfg); }
  function dismiss() { setConfirm(null); }

  return (
    <>
      <div className="fc-decision-bar" data-testid="decision-bar">
        {hasReviewCap && !isActiveAssignee &&
          ['PENDING_HUMAN_REVIEW','HUMAN_REVIEW_IN_PROGRESS'].includes(kase.status) && (
          <button className="fc-db-btn fc-db-btn--sand" disabled={claiming} onClick={onClaim}>
            {claiming ? 'Claiming…' : 'Claim Case'}
          </button>
        )}

        {canGo('AWAITING_DOCUMENTS') && (
          <button className="fc-db-btn fc-db-btn--primary"
            onClick={() => ask({
              title: 'Request Documents',
              body: 'Move this case to Awaiting Documents. This notifies the submitting party.',
              confirmLabel: 'Request Documents', confirmVariant: 'primary',
              onConfirm: () => { dismiss(); onTransition('AWAITING_DOCUMENTS'); },
            })}>
            Request Documents
          </button>
        )}

        {canGo('PENDING_HUMAN_REVIEW') && (
          <button className="fc-db-btn fc-db-btn--primary"
            onClick={() => onTransition('PENDING_HUMAN_REVIEW')}>
            Send to Review
          </button>
        )}

        {pendingReview.map(instr => (
          <React.Fragment key={instr.id}>
            {caps.includes('AUTHORITY_INSTRUMENT_VERIFY') && (
              <button className="fc-db-btn fc-db-btn--success"
                onClick={() => ask({
                  title: 'Verify Instrument',
                  body: `Verify this ${instrumentTypeLabel(instr.instrument_type)}? This confirms the document is valid and authoritative.`,
                  note: 'This action is permanent and cannot be undone.',
                  confirmLabel: 'Verify Instrument', confirmVariant: 'success',
                  onConfirm: () => { dismiss(); onInstrumentTransition(instr.id, 'VERIFIED'); },
                })}>
                Verify Instrument
              </button>
            )}
            {caps.includes('AUTHORITY_INSTRUMENT_REJECT') && (
              <button className="fc-db-btn fc-db-btn--danger"
                onClick={() => ask({
                  title: 'Reject Instrument',
                  body: 'Provide a reason for rejection. This will be recorded in the case audit log.',
                  textarea: true,
                  textareaPlaceholder: 'Rejection reason…',
                  confirmLabel: 'Confirm Rejection', confirmVariant: 'danger',
                  onConfirm: reason => { dismiss(); onInstrumentTransition(instr.id, 'REJECTED', { rejectionReason: reason || null }); },
                })}>
                Reject
              </button>
            )}
          </React.Fragment>
        ))}

        {canGo('COMPLETED') && (
          <button className="fc-db-btn fc-db-btn--success"
            onClick={() => ask({
              title: 'Mark Case Complete',
              body: 'This will mark the case as completed. All instruments must have been reviewed.',
              note: 'Completed cases cannot be re-opened.',
              confirmLabel: 'Mark Complete', confirmVariant: 'success',
              onConfirm: () => { dismiss(); onTransition('COMPLETED'); },
            })}>
            Mark Complete
          </button>
        )}

        {canGo('CANCELLED') && (
          <button className="fc-db-btn fc-db-btn--outline"
            onClick={() => ask({
              title: 'Cancel Case',
              body: 'Cancel this case? This cannot be undone.',
              note: 'Cancelled cases are archived and cannot be re-activated.',
              confirmLabel: 'Cancel Case', confirmVariant: 'danger',
              onConfirm: () => { dismiss(); onTransition('CANCELLED'); },
            })}>
            Cancel Case
          </button>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          note={confirm.note}
          textarea={confirm.textarea}
          textareaPlaceholder={confirm.textareaPlaceholder}
          confirmLabel={confirm.confirmLabel}
          confirmVariant={confirm.confirmVariant}
          onConfirm={confirm.onConfirm}
          onCancel={dismiss}
        />
      )}
    </>
  );
}

// ── Main workspace ────────────────────────────────────────────────────────────

export default function AuthorityWorkspace() {
  const { caseId } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();

  const [workspace,  setWorkspace]  = useState(null);
  const [activity,   setActivity]   = useState([]);
  const [caps,       setCaps]       = useState([]);
  const [runs,       setRuns]       = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [claiming,   setClaiming]   = useState(false);
  const [viewDocId,  setViewDocId]  = useState(null);
  const [activeTab,  setActiveTab]  = useState('overview');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = useCallback(() => {
    return Promise.all([
      api.get(`/authority/cases/${caseId}/workspace`),
      api.get(`/authority/cases/${caseId}/activity`),
      api.get('/authority/capabilities'),
      api.get(`/authority/cases/${caseId}/extraction/runs`).catch(() => ({ data: [] })),
      api.get(`/authority/cases/${caseId}/candidates`).catch(() => ({ data: [] })),
    ]).then(([ws, act, capRes, runsRes, candsRes]) => {
      setWorkspace(ws.data);
      setActivity(act.data);
      setCaps(capRes.data.capabilities || []);
      setRuns(runsRes.data || []);
      setCandidates(candsRes.data || []);
      setError('');
    }).catch(e => setError(e.response?.data?.error || 'Failed to load workspace.'));
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

  if (loading) {
    return (
      <div className="fc-workspace" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <AuLoading />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="fc-workspace" style={{ padding: 24 }}>
        <AuError msg={error || 'Workspace not available.'} />
      </div>
    );
  }

  const { case: kase, instruments, documents, assignments, notes } = workspace;
  const isActiveAssignee = assignments.some(a => a.assigned_to === user?.id);

  function canMutate(instr) {
    const locked = ['VERIFIED','REJECTED','REVOKED','EXPIRED','SUPERSEDED'].includes(instr.status);
    return !locked && (kase.status !== 'HUMAN_REVIEW_IN_PROGRESS' || isActiveAssignee);
  }

  const tabsWithCounts = TABS.map(t => {
    let count = null;
    if (t.id === 'parties')       count = instruments.reduce((n, i) => n + (i.participants || []).length, 0) || null;
    if (t.id === 'permissions')   count = instruments.reduce((n, i) => n + (i.permissions  || []).length, 0) || null;
    if (t.id === 'restrictions')  count = instruments.reduce((n, i) => n + (i.restrictions || []).length, 0) || null;
    if (t.id === 'extraction')    count = candidates.filter(c => c.status === 'pending').length || null;
    return { ...t, count };
  });

  const caseRef = kase.external_case_reference || `Case ${kase.id.slice(0, 8)}…`;

  return (
    <div className="fc-workspace" data-testid="authority-workspace">
      {/* Header */}
      <div className="fc-ws-header">
        <Link to="/authority/cases" className="fc-ws-back" aria-label="Back to cases">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Cases
        </Link>
        <div className="fc-ws-divider" />
        <span className="fc-ws-ref">{caseRef}</span>
        <div className="fc-ws-header-right">
          <AuBadge status={kase.status} />
          <button className="fc-ws-icon-btn" onClick={() => setDrawerOpen(true)} aria-label="Open activity drawer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Lifecycle strip */}
      <LifecycleStrip status={kase.status} />

      {/* Error banner */}
      {error && (
        <div style={{ padding: '8px 20px', flexShrink: 0 }}>
          <AuError msg={error} />
        </div>
      )}

      {/* Split pane */}
      <div className="fc-ws-body">
        <DocumentPane documents={documents} viewDocId={viewDocId} onViewDoc={setViewDocId} />

        <div className="fc-pane-review">
          <TabBar tabs={tabsWithCounts} active={activeTab} onChange={setActiveTab} />

          <div className="fc-tab-content">
            {activeTab === 'overview' && (
              <OverviewTab
                kase={kase}
                instruments={instruments}
                assignments={assignments}
                notes={notes}
                caseId={caseId}
                isActiveAssignee={isActiveAssignee}
                canAdd={kase.status !== 'HUMAN_REVIEW_IN_PROGRESS' || isActiveAssignee}
                onAdded={load}
              />
            )}
            {activeTab === 'parties' && (
              <PartiesTab instruments={instruments} canMutate={canMutate} onMutated={load} />
            )}
            {activeTab === 'instrument' && (
              <InstrumentTab
                instruments={instruments}
                caseStatus={kase.status}
                isActiveAssignee={isActiveAssignee}
                onTransition={handleInstrumentTransition}
              />
            )}
            {activeTab === 'permissions' && (
              <PermissionsTab instruments={instruments} canMutate={canMutate} onMutated={load} />
            )}
            {activeTab === 'restrictions' && (
              <RestrictionsTab instruments={instruments} canMutate={canMutate} onMutated={load} />
            )}
            {activeTab === 'extraction' && (
              <ExtractionTab
                caseId={caseId}
                runs={runs}
                candidates={candidates}
                caps={caps}
                kaseStatus={kase.status}
                onMutated={load}
              />
            )}
          </div>
        </div>
      </div>

      {/* Decision bar */}
      <DecisionBar
        kase={kase}
        caps={caps}
        isActiveAssignee={isActiveAssignee}
        claiming={claiming}
        onClaim={handleClaim}
        onTransition={handleTransition}
        onInstrumentTransition={handleInstrumentTransition}
        instruments={instruments}
      />

      {/* Activity drawer */}
      <ActivityDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} events={activity} />
    </div>
  );
}
