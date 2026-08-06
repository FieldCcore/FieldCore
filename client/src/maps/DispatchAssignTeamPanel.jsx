'use strict';
import { useState, useMemo, useCallback } from 'react';
import api from '../api';

// ── Icons ─────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 14, height: 14 }} aria-hidden="true">
      <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StarIcon({ filled }) {
  return (
    <svg viewBox="0 0 16 16" fill={filled ? 'currentColor' : 'none'}
      style={{ width: 12, height: 12 }} aria-hidden="true">
      <path d="M8 1.5l1.65 3.35L13.5 5.5l-2.75 2.68.65 3.82L8 10.35l-3.4 1.65.65-3.82L2.5 5.5l3.85-.65z"
        stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 12, height: 12, flexShrink: 0 }} aria-hidden="true">
      <path d="M8 2L14.5 13H1.5L8 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M8 6.5v3M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function BlockIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 12, height: 12, flexShrink: 0 }} aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M4.5 8h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 12, height: 12 }} aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 11, height: 11 }} aria-hidden="true">
      <path d="M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_OPTIONS = [
  { value: 'lead_technician', label: 'Lead Tech' },
  { value: 'technician',      label: 'Technician' },
  { value: 'helper',          label: 'Helper' },
  { value: 'apprentice',      label: 'Apprentice' },
  { value: 'specialist',      label: 'Specialist' },
  { value: 'crew_lead',       label: 'Crew Lead' },
];

const NON_ASSIGNABLE = new Set(['complete', 'cancelled', 'no_show', 'draft']);

// ── Sub-components ────────────────────────────────────────────────────────────

function SkeletonBlock({ height = 40, mb = 8 }) {
  return (
    <div style={{
      height, borderRadius: 6, background: 'var(--lightgray)',
      marginBottom: mb, animation: 'pulse 1.5s ease-in-out infinite',
    }} />
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: 'var(--slate)', marginBottom: 6,
      textTransform: 'uppercase', letterSpacing: '.5px',
    }}>
      {children}
    </div>
  );
}

function WorkloadBar({ pct }) {
  const capped   = Math.min(pct, 100);
  const barColor = pct >= 100 ? 'var(--red)' : pct >= 85 ? 'var(--amber)' : '#2E7D32';
  return (
    <div style={{ height: 3, borderRadius: 2, background: 'var(--lightgray)', overflow: 'hidden', marginTop: 3 }}>
      <div style={{ height: '100%', width: `${capped}%`, background: barColor, borderRadius: 2 }} />
    </div>
  );
}

// ── Member row (in proposed team) ─────────────────────────────────────────────

function MemberRow({ member, isOnly, onRemove, onToggleLead, onRoleChange }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '7px 8px', background: '#fff',
      border: '1px solid var(--lightgray)', borderRadius: 6, marginBottom: 4,
    }}>
      {/* Lead star */}
      <button
        type="button"
        onClick={() => onToggleLead(member.userId)}
        title={member.isPrimary ? 'Lead technician' : 'Make lead technician'}
        style={{
          background: 'none', border: 'none', cursor: isOnly ? 'default' : 'pointer',
          color: member.isPrimary ? 'var(--sand)' : 'var(--steel)', padding: 2, flexShrink: 0,
          display: 'flex', alignItems: 'center',
        }}
        aria-label={member.isPrimary ? 'Lead technician' : 'Make lead'}
      >
        <StarIcon filled={member.isPrimary} />
      </button>

      {/* Name */}
      <span style={{
        fontSize: 12, fontWeight: member.isPrimary ? 700 : 500,
        color: 'var(--navy)', flex: 1, minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {member.memberName}
        {member.isPrimary && (
          <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--slate)', marginLeft: 4 }}>LEAD</span>
        )}
      </span>

      {/* Role selector */}
      <select
        value={member.assignmentRole}
        onChange={e => onRoleChange(member.userId, e.target.value)}
        style={{
          fontSize: 10, border: '1px solid var(--lightgray)', borderRadius: 4,
          padding: '2px 4px', background: '#fff', color: 'var(--navy)', cursor: 'pointer',
        }}
        aria-label={`Role for ${member.memberName}`}
      >
        {ROLE_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Remove */}
      {!isOnly && (
        <button
          type="button"
          onClick={() => onRemove(member.userId)}
          title={`Remove ${member.memberName}`}
          style={{
            background: 'none', border: '1px solid var(--lightgray)', borderRadius: 4,
            cursor: 'pointer', color: 'var(--slate)', padding: '3px 5px',
            display: 'flex', alignItems: 'center', flexShrink: 0,
          }}
          aria-label={`Remove ${member.memberName}`}
        >
          <RemoveIcon />
        </button>
      )}
    </div>
  );
}

// ── Available tech row ────────────────────────────────────────────────────────

function AvailableTechRow({ tech, workload, onAdd }) {
  const cap  = workload?.capacityPercent ?? 0;
  const jobs = workload?.jobCount ?? 0;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 8px', background: '#fff',
      border: '1px solid var(--lightgray)', borderRadius: 6, marginBottom: 3,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--navy)', marginBottom: 2 }}>
          {tech.name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--slate)' }}>
          {jobs} job{jobs !== 1 ? 's' : ''} today · {cap}% capacity
        </div>
        <WorkloadBar pct={cap} />
      </div>
      <button
        type="button"
        onClick={() => onAdd(tech)}
        style={{
          display: 'flex', alignItems: 'center', gap: 3,
          padding: '4px 8px', borderRadius: 4, border: '1px solid var(--navy)',
          background: '#fff', color: 'var(--navy)', fontSize: 11, fontWeight: 600,
          cursor: 'pointer', flexShrink: 0,
        }}
        aria-label={`Add ${tech.name} to team`}
      >
        <PlusIcon /> Add
      </button>
    </div>
  );
}

// ── Validation result row ─────────────────────────────────────────────────────

function MemberValidationRow({ result }) {
  const hasBlocking = result.blockingIssues?.length > 0;
  const hasWarnings = result.warnings?.length > 0;

  return (
    <div style={{
      padding: '7px 10px', borderRadius: 6, marginBottom: 4,
      background: hasBlocking ? '#FEE2E2' : hasWarnings ? '#FEF3C7' : '#E8F5E9',
      border: `1px solid ${hasBlocking ? '#FECACA' : hasWarnings ? '#FDE68A' : '#A5D6A7'}`,
    }}>
      <div style={{
        fontSize: 12, fontWeight: 600,
        color: hasBlocking ? 'var(--red)' : hasWarnings ? '#92400E' : '#2E7D32',
        marginBottom: hasBlocking || hasWarnings ? 4 : 0,
      }}>
        {result.memberName}
        {result.isPrimary && <span style={{ fontSize: 9, marginLeft: 6 }}>LEAD</span>}
        {!hasBlocking && !hasWarnings && <span style={{ fontSize: 10, marginLeft: 6 }}>✓</span>}
      </div>
      {result.blockingIssues?.map((b, i) => (
        <div key={i} style={{ display: 'flex', gap: 5, alignItems: 'flex-start', fontSize: 11, color: 'var(--red)' }}>
          <span style={{ marginTop: 1 }}><BlockIcon /></span>
          <span>{b.message}</span>
        </div>
      ))}
      {result.warnings?.map((w, i) => (
        <div key={i} style={{ display: 'flex', gap: 5, alignItems: 'flex-start', fontSize: 11, color: '#92400E' }}>
          <span style={{ marginTop: 1 }}><WarnIcon /></span>
          <span>{w.message}</span>
        </div>
      ))}
      {result.workloadImpact && !hasBlocking && (
        <div style={{ fontSize: 10, color: 'var(--slate)', marginTop: 3 }}>
          After: {result.workloadImpact.newJobCount} job{result.workloadImpact.newJobCount !== 1 ? 's' : ''} · {result.workloadImpact.newServiceHours}h · {result.workloadImpact.capacityPercent}% capacity
        </div>
      )}
    </div>
  );
}

// ── Diff badge ────────────────────────────────────────────────────────────────

function DiffBadge({ label, color, bg }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '2px 6px',
      borderRadius: 99, background: bg, color, marginLeft: 4,
    }}>
      {label}
    </span>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

/**
 * DispatchAssignTeamPanel
 *
 * Multi-member team assignment for a single job.
 * Phases: edit → review → saving
 *
 * Props:
 *   job              — the job being assigned
 *   currentTeam      — result from GET /jobs/:id/assignments (null while loading)
 *   loadingTeam      — boolean
 *   techs            — all field techs in account
 *   workloadsByTechId — Map<techId, WorkloadEntry>
 *   onTeamAssigned   — (updatedJob?) => void called after successful save
 *   onClose          — () => void
 */
export default function DispatchAssignTeamPanel({
  job,
  currentTeam,
  loadingTeam,
  techs,
  workloadsByTechId,
  onTeamAssigned,
  onClose,
}) {
  const [phase,          setPhase]         = useState('edit');    // 'edit' | 'review' | 'saving'
  const [proposedTeam,   setProposedTeam]  = useState(null);      // null = not yet initialized
  const [validation,     setValidation]    = useState(null);
  const [saveError,      setSaveError]     = useState(null);
  const [validating,     setValidating]    = useState(false);

  // Initialize proposedTeam from currentTeam once loaded
  const initializeIfNeeded = useCallback((team) => {
    if (proposedTeam !== null) return;
    const initial = (team?.assignments || []).map(a => ({
      userId:         a.user_id,
      memberName:     a.member_name,
      assignmentRole: a.assignment_role,
      isPrimary:      a.is_primary,
    }));
    setProposedTeam(initial);
  }, [proposedTeam]);

  if (!loadingTeam && currentTeam && proposedTeam === null) {
    initializeIfNeeded(currentTeam);
  }

  const effectiveTeam = proposedTeam ?? [];

  const isAssignable = !NON_ASSIGNABLE.has(job?.status);

  // Field techs available to add (not already in proposed team)
  const proposedIds = useMemo(() => new Set(effectiveTeam.map(m => m.userId)), [effectiveTeam]);
  const availableTechs = useMemo(() =>
    (techs || []).filter(t =>
      t.field_work_eligible !== false &&
      t.dispatch_visible !== false &&
      !proposedIds.has(t.id)
    ),
  [techs, proposedIds]);

  // ── Edit handlers ─────────────────────────────────────────────────────────

  const handleAdd = useCallback((tech) => {
    setProposedTeam(prev => {
      const next = prev ?? [];
      if (next.some(m => m.userId === tech.id)) return next;
      const isFirst = next.length === 0;
      return [...next, {
        userId:         tech.id,
        memberName:     tech.name,
        assignmentRole: isFirst ? 'lead_technician' : 'technician',
        isPrimary:      isFirst,
      }];
    });
  }, []);

  const handleRemove = useCallback((userId) => {
    setProposedTeam(prev => {
      const next = (prev ?? []).filter(m => m.userId !== userId);
      // If we removed the lead and others remain, promote first
      if (next.length > 0 && !next.some(m => m.isPrimary)) {
        return next.map((m, i) => ({ ...m, isPrimary: i === 0, assignmentRole: i === 0 ? 'lead_technician' : m.assignmentRole }));
      }
      return next;
    });
  }, []);

  const handleToggleLead = useCallback((userId) => {
    setProposedTeam(prev => (prev ?? []).map(m => ({
      ...m,
      isPrimary:      m.userId === userId,
      assignmentRole: m.userId === userId ? 'lead_technician'
        : (m.assignmentRole === 'lead_technician' ? 'technician' : m.assignmentRole),
    })));
  }, []);

  const handleRoleChange = useCallback((userId, role) => {
    setProposedTeam(prev => (prev ?? []).map(m =>
      m.userId === userId ? { ...m, assignmentRole: role } : m
    ));
  }, []);

  // ── Review ────────────────────────────────────────────────────────────────

  async function handleReview() {
    if (effectiveTeam.length === 0) return;
    setValidating(true);
    setSaveError(null);
    try {
      const { data } = await api.post(`/jobs/${job.id}/assignments/validate`, {
        members: effectiveTeam.map(m => ({
          userId:         m.userId,
          assignmentRole: m.assignmentRole,
          isPrimary:      m.isPrimary,
        })),
      });
      setValidation(data);
      setPhase('review');
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Validation failed. Please try again.');
    } finally {
      setValidating(false);
    }
  }

  // ── Confirm ───────────────────────────────────────────────────────────────

  async function handleConfirm() {
    if (!validation?.allowed && validation?.teamState !== 'NO_CHANGES') return;
    const hasWarnings = (validation.warnings?.length ?? 0) > 0 ||
      (validation.memberResults?.some(r => r.warnings?.length > 0) ?? false);

    setPhase('saving');
    setSaveError(null);
    try {
      const { data } = await api.put(`/jobs/${job.id}/assignments`, {
        members: effectiveTeam.map(m => ({
          userId:         m.userId,
          assignmentRole: m.assignmentRole,
          isPrimary:      m.isPrimary,
        })),
        overrideWarnings: hasWarnings,
      });
      onTeamAssigned?.(data?.primaryAssignment ? {
        id:        job.id,
        tech_id:   data.primaryAssignment?.user_id ?? null,
        tech_name: data.primaryAssignment?.member_name ?? null,
      } : { id: job.id });
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Save failed. Please try again.');
      setPhase('review');
    }
  }

  // ── Diff computations ─────────────────────────────────────────────────────

  const currentIds   = useMemo(() =>
    new Set((currentTeam?.assignments || []).map(a => a.user_id)),
  [currentTeam]);

  const addedMembers   = effectiveTeam.filter(m => !currentIds.has(m.userId));
  const removedMembers = (currentTeam?.assignments || []).filter(a => !proposedIds.has(a.user_id));
  const hasChanges     = addedMembers.length > 0 || removedMembers.length > 0 ||
    effectiveTeam.some(m => {
      const cur = (currentTeam?.assignments || []).find(a => a.user_id === m.userId);
      return cur && (cur.assignment_role !== m.assignmentRole || cur.is_primary !== m.isPrimary);
    });

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (loadingTeam || proposedTeam === null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <PanelHeader title="Team Assignment" onClose={onClose} />
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, minHeight: 0 }}>
          <SkeletonBlock height={18} mb={12} />
          {[1, 2, 3].map(i => <SkeletonBlock key={i} height={52} mb={6} />)}
        </div>
      </div>
    );
  }

  // ── Not assignable ────────────────────────────────────────────────────────

  if (!isAssignable) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <PanelHeader title="Team Assignment" onClose={onClose} />
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, minHeight: 0 }}>
          <div style={{
            background: '#FEE2E2', borderLeft: '3px solid var(--red)',
            borderRadius: 6, padding: '10px 12px',
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)', marginBottom: 2 }}>
              Cannot Assign
            </div>
            <div style={{ fontSize: 11, color: 'var(--red)' }}>
              Job status is "{job.status.replace(/_/g, ' ')}" — team assignment is not permitted.
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ ...closeBtnStyle, marginTop: 16 }}>
            Close
          </button>
        </div>
      </div>
    );
  }

  // ── Saving phase ──────────────────────────────────────────────────────────

  if (phase === 'saving') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <PanelHeader title="Saving Team…" onClose={null} />
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, minHeight: 0 }}>
          {[1, 2, 3].map(i => <SkeletonBlock key={i} height={52} mb={6} />)}
        </div>
      </div>
    );
  }

  // ── Review phase ──────────────────────────────────────────────────────────

  if (phase === 'review' && validation) {
    const allAllowed    = validation.allowed;
    const teamWarnings  = validation.warnings || [];
    const memberWarnings = (validation.memberResults || []).flatMap(r => r.warnings || []);
    const totalWarnings  = teamWarnings.length + memberWarnings.length;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <PanelHeader
          title="Review Team Changes"
          onClose={() => setPhase('edit')}
          backLabel="Edit"
        />

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', minHeight: 0 }}>

          {/* Job summary */}
          <div style={{
            background: 'var(--off)', borderRadius: 6,
            padding: '8px 10px', marginBottom: 12,
          }}>
            <div style={{ fontSize: 10, color: 'var(--slate)' }}>Assigning team to</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>
              {job.service_type} — {job.client_name}
            </div>
          </div>

          {/* Diff summary */}
          {hasChanges && (
            <div style={{ marginBottom: 12 }}>
              <SectionLabel>Changes</SectionLabel>
              {addedMembers.map(m => (
                <div key={m.userId} style={{ fontSize: 11, color: '#2E7D32', marginBottom: 3 }}>
                  + {m.memberName}
                  <DiffBadge label="ADDED" color="#fff" bg="#2E7D32" />
                </div>
              ))}
              {removedMembers.map(a => (
                <div key={a.user_id} style={{ fontSize: 11, color: 'var(--red)', marginBottom: 3 }}>
                  − {a.member_name}
                  <DiffBadge label="REMOVED" color="#fff" bg="var(--red)" />
                </div>
              ))}
              {validation.teamState === 'NO_CHANGES' && (
                <div style={{ fontSize: 11, color: 'var(--slate)' }}>No changes to apply.</div>
              )}
            </div>
          )}

          {/* Team-level blocking issues */}
          {validation.blockingIssues?.length > 0 && (
            <div style={{
              background: '#FEE2E2', borderLeft: '3px solid var(--red)',
              borderRadius: 6, padding: '8px 10px', marginBottom: 10,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', marginBottom: 4 }}>
                Cannot save — resolve these issues first
              </div>
              {validation.blockingIssues.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 5, fontSize: 11, color: 'var(--red)' }}>
                  <BlockIcon /><span>{b.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Team-level warnings */}
          {teamWarnings.length > 0 && (
            <div style={{
              background: '#FEF3C7', borderLeft: '3px solid var(--amber)',
              borderRadius: 6, padding: '8px 10px', marginBottom: 10,
            }}>
              {teamWarnings.map((w, i) => (
                <div key={i} style={{ display: 'flex', gap: 5, fontSize: 11, color: '#92400E' }}>
                  <WarnIcon /><span>{w.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Per-member results */}
          <SectionLabel>Per-Member Validation</SectionLabel>
          {(validation.memberResults || []).map(r => (
            <MemberValidationRow key={r.userId} result={r} />
          ))}

          {/* Warning note */}
          {totalWarnings > 0 && allAllowed && (
            <div style={{
              fontSize: 11, color: '#92400E', background: '#FEF3C7',
              borderRadius: 6, padding: '7px 10px', marginBottom: 10, marginTop: 6,
            }}>
              <strong>Proceeding with {totalWarnings} warning{totalWarnings > 1 ? 's' : ''}.</strong>{' '}
              Confirm to save anyway.
            </div>
          )}

          {saveError && (
            <div style={{
              background: '#FEE2E2', color: 'var(--red)', borderRadius: 4,
              padding: '7px 10px', fontSize: 11, marginBottom: 10,
            }} role="alert">
              {saveError}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {(allAllowed || validation.teamState === 'NO_CHANGES') && (
              <button
                type="button"
                onClick={handleConfirm}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 6, border: 'none',
                  background: 'var(--navy)', color: '#fff',
                  fontWeight: 700, fontSize: 12, cursor: 'pointer',
                }}
              >
                {validation.teamState === 'NO_CHANGES' ? 'Close' : 'Confirm Team'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setPhase('edit')}
              style={closeBtnStyle}
            >
              {allAllowed ? 'Edit' : 'Go Back'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Edit phase ────────────────────────────────────────────────────────────

  const titleText = currentTeam?.teamSize > 0
    ? `Manage Team · ${effectiveTeam.length}`
    : 'Assign Team';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PanelHeader title={titleText} onClose={onClose} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', minHeight: 0 }}>

        {/* Job summary */}
        <div style={{
          background: 'var(--off)', borderRadius: 6,
          padding: '8px 10px', marginBottom: 14,
        }}>
          <div style={{ fontSize: 10, color: 'var(--slate)' }}>
            {currentTeam?.teamSize > 0 ? 'Managing team for' : 'Assigning team to'}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>
            {job.service_type} — {job.client_name}
          </div>
        </div>

        {/* Current team */}
        <SectionLabel>
          Team ({effectiveTeam.length})
          {effectiveTeam.length > 0 && (
            <span style={{ fontSize: 9, fontWeight: 400, marginLeft: 6, color: 'var(--slate)' }}>
              ★ = lead technician
            </span>
          )}
        </SectionLabel>

        {effectiveTeam.length === 0 ? (
          <div style={{
            padding: '14px', textAlign: 'center',
            color: 'var(--slate)', fontSize: 11, lineHeight: 1.5,
            border: '1px dashed var(--lightgray)', borderRadius: 6, marginBottom: 10,
          }}>
            No team members yet. Add technicians below.
          </div>
        ) : (
          effectiveTeam.map(m => (
            <MemberRow
              key={m.userId}
              member={m}
              isOnly={effectiveTeam.length === 1}
              onRemove={handleRemove}
              onToggleLead={handleToggleLead}
              onRoleChange={handleRoleChange}
            />
          ))
        )}

        {/* Available technicians */}
        {availableTechs.length > 0 && (
          <>
            <div style={{ height: 1, background: 'var(--lightgray)', margin: '10px 0' }} />
            <SectionLabel>Available Technicians</SectionLabel>
            {availableTechs.map(t => (
              <AvailableTechRow
                key={t.id}
                tech={t}
                workload={workloadsByTechId?.get(t.id) ?? null}
                onAdd={handleAdd}
              />
            ))}
          </>
        )}

        {saveError && (
          <div style={{
            background: '#FEE2E2', color: 'var(--red)', borderRadius: 4,
            padding: '7px 10px', fontSize: 11, marginTop: 8, marginBottom: 4,
          }} role="alert">
            {saveError}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {effectiveTeam.length > 0 && (
            <button
              type="button"
              onClick={handleReview}
              disabled={validating}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 6, border: 'none',
                background: hasChanges ? 'var(--navy)' : 'var(--steel)',
                color: '#fff', fontWeight: 700, fontSize: 12,
                cursor: validating ? 'not-allowed' : 'pointer',
                opacity: validating ? 0.7 : 1,
              }}
            >
              {validating ? 'Checking…' : hasChanges ? 'Review Changes' : 'Review Team'}
            </button>
          )}
          <button type="button" onClick={onClose} style={closeBtnStyle}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Panel header ──────────────────────────────────────────────────────────────

function PanelHeader({ title, onClose, backLabel = 'Cancel' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 14px', borderBottom: '1px solid var(--lightgray)', flexShrink: 0,
    }}>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={backLabel}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 6px', marginLeft: -6,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--slate)', fontSize: 11, fontWeight: 600, borderRadius: 4,
          }}
        >
          <BackIcon />
          {backLabel}
        </button>
      )}
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>
        {title}
      </span>
    </div>
  );
}

const closeBtnStyle = {
  padding: '9px 14px', borderRadius: 6,
  border: '1px solid var(--lightgray)', background: '#fff',
  color: 'var(--navy)', fontWeight: 600, fontSize: 12, cursor: 'pointer',
};
