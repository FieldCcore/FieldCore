import { useState, useMemo, useCallback, useRef, useEffect } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────

export const TEAM_ROLE_OPTIONS = [
  { value: 'lead_technician', label: 'Lead Technician' },
  { value: 'technician',      label: 'Technician' },
  { value: 'helper',          label: 'Helper' },
  { value: 'apprentice',      label: 'Apprentice' },
  { value: 'specialist',      label: 'Specialist' },
  { value: 'driver',          label: 'Driver' },
  { value: 'observer',        label: 'Observer' },
  { value: 'crew_lead',       label: 'Crew Lead' },
];

// ── Icons ─────────────────────────────────────────────────────────────────────

function StarIcon({ filled }) {
  return (
    <svg viewBox="0 0 16 16" fill={filled ? 'currentColor' : 'none'}
      style={{ width: 13, height: 13, flexShrink: 0 }} aria-hidden="true">
      <path d="M8 1.5l1.65 3.35L13.5 5.5l-2.75 2.68.65 3.82L8 10.35l-3.4 1.65.65-3.82L2.5 5.5l3.85-.65z"
        stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 11, height: 11 }} aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 13, height: 13 }} aria-hidden="true">
      <path d={open ? 'M3 10l5-5 5 5' : 'M3 6l5 5 5-5'} stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 13, height: 13, flexShrink: 0 }} aria-hidden="true">
      <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M1 13c0-2.8 2.2-5 5-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <circle cx="12" cy="5" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M12 10c1.7.3 3 1.8 3 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

// ── Availability badge ────────────────────────────────────────────────────────

function StatusDot({ tech }) {
  if (tech.field_work_eligible === false) {
    return <span style={{ fontSize: 9, color: 'var(--red)', fontWeight: 700 }}>Office only</span>;
  }
  if (!tech.is_available || tech.operational_status === 'off_duty') {
    return <span style={{ fontSize: 9, color: 'var(--amber)', fontWeight: 600 }}>Unavailable</span>;
  }
  return <span style={{ fontSize: 9, color: '#2E7D32', fontWeight: 600 }}>Available</span>;
}

// ── Summary text ──────────────────────────────────────────────────────────────

function summaryText(members, crewId, crews) {
  if (crewId && crews?.length) {
    const crew = crews.find(c => c.id === crewId);
    if (crew) {
      const lead = members.find(m => m.isPrimary);
      return `${crew.name} · ${members.length} member${members.length !== 1 ? 's' : ''}${lead ? ` · ${lead.memberName} lead` : ''}`;
    }
  }
  if (members.length === 0) return null; // show placeholder
  const lead = members.find(m => m.isPrimary) || members[0];
  if (members.length === 1) return lead.memberName;
  return `${lead.memberName} + ${members.length - 1} more`;
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * JobTeamSelector — controlled multi-tech team selector for job forms.
 *
 * Works in creation mode (no jobId) and edit mode (with existing assignments
 * pre-populated by the parent).
 *
 * Props:
 *   value     — { members: [{userId, memberName, assignmentRole, isPrimary}], crewId }
 *   onChange  — (value) => void
 *   techs     — all users available to assign (filtered for field eligibility internally)
 *   crews     — saved crews with their members
 *   disabled  — boolean
 *   label     — override label text (default "Assign Team")
 */
export default function JobTeamSelector({
  value,
  onChange,
  techs = [],
  crews = [],
  disabled = false,
  label = 'Assign Team',
}) {
  const [open,    setOpen]    = useState(false);
  const [tab,     setTab]     = useState('members'); // 'members' | 'crews'
  const panelRef              = useRef(null);

  const members = value?.members ?? [];
  const crewId  = value?.crewId  ?? null;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Field-eligible techs available to add (not already in team)
  const selectedIds = useMemo(() => new Set(members.map(m => m.userId)), [members]);
  const availableTechs = useMemo(() =>
    techs.filter(t => !selectedIds.has(t.id)),
  [techs, selectedIds]);

  const eligibleTechs     = availableTechs.filter(t => t.field_work_eligible !== false);
  const ineligibleTechs   = availableTechs.filter(t => t.field_work_eligible === false);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const emit = useCallback((nextMembers, nextCrewId) => {
    onChange({ members: nextMembers, crewId: nextCrewId ?? crewId });
  }, [onChange, crewId]);

  const handleAdd = useCallback((tech) => {
    const isFirst = members.length === 0;
    const next = [...members, {
      userId:         tech.id,
      memberName:     tech.name,
      assignmentRole: isFirst ? 'lead_technician' : 'technician',
      isPrimary:      isFirst,
    }];
    emit(next, crewId);
  }, [members, crewId, emit]);

  const handleRemove = useCallback((userId) => {
    let next = members.filter(m => m.userId !== userId);
    // Re-promote first if lead was removed
    if (next.length > 0 && !next.some(m => m.isPrimary)) {
      next = next.map((m, i) => ({
        ...m,
        isPrimary:      i === 0,
        assignmentRole: i === 0 ? 'lead_technician' : m.assignmentRole,
      }));
    }
    emit(next, crewId);
  }, [members, crewId, emit]);

  const handleToggleLead = useCallback((userId) => {
    const next = members.map(m => ({
      ...m,
      isPrimary:      m.userId === userId,
      assignmentRole: m.userId === userId ? 'lead_technician'
        : (m.assignmentRole === 'lead_technician' ? 'technician' : m.assignmentRole),
    }));
    emit(next, crewId);
  }, [members, crewId, emit]);

  const handleRoleChange = useCallback((userId, role) => {
    const next = members.map(m => m.userId === userId ? { ...m, assignmentRole: role } : m);
    emit(next, crewId);
  }, [members, crewId, emit]);

  const handleUseCrew = useCallback((crew) => {
    const leadMember = crew.members?.find(m => m.is_lead) || crew.members?.[0];
    const next = (crew.members || []).map(m => ({
      userId:         m.user_id,
      memberName:     m.member_name,
      assignmentRole: m.default_role || (m === leadMember ? 'lead_technician' : 'technician'),
      isPrimary:      m.user_id === leadMember?.user_id,
    }));
    onChange({ members: next, crewId: crew.id });
    setTab('members');
  }, [onChange]);

  const handleClearCrew = useCallback(() => {
    onChange({ members, crewId: null });
  }, [onChange, members]);

  // Validation: multi-member with no primary
  const needsLead = members.length > 1 && !members.some(m => m.isPrimary);
  const summary   = summaryText(members, crewId, crews);

  // ── Collapsed ──────────────────────────────────────────────────────────────

  if (!open) {
    return (
      <div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen(true)}
          aria-haspopup="true"
          aria-expanded={false}
          style={{
            width: '100%', textAlign: 'left', cursor: disabled ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 10px',
            background: disabled ? 'var(--off, #EDEBE7)' : '#fff',
            border: `1px solid ${needsLead ? 'var(--red)' : 'var(--lightgray, #E6E6E6)'}`,
            borderRadius: 6, fontSize: 13, color: summary ? 'var(--navy)' : 'var(--steel)',
            fontFamily: 'inherit',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {members.length > 0 && <UsersIcon />}
            {summary || 'Unassigned'}
          </span>
          <ChevronIcon open={false} />
        </button>
        {needsLead && (
          <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>
            Select a lead technician for this team.
          </p>
        )}
      </div>
    );
  }

  // ── Expanded panel ─────────────────────────────────────────────────────────

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-expanded={true}
        style={{
          width: '100%', textAlign: 'left', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 10px',
          background: '#fff', border: '1px solid var(--navy)', borderRadius: 6,
          fontSize: 13, color: 'var(--navy)', fontFamily: 'inherit', fontWeight: 600,
        }}
      >
        <span>{label}</span>
        <ChevronIcon open={true} />
      </button>

      {/* Panel */}
      <div style={{
        position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
        background: '#fff', border: '1px solid var(--lightgray)', borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,.12)', overflow: 'hidden',
        maxHeight: 460, display: 'flex', flexDirection: 'column',
      }}>

        {/* Tabs */}
        {crews.length > 0 && (
          <div style={{ display: 'flex', borderBottom: '1px solid var(--lightgray)' }}>
            {['members', 'crews'].map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: '8px 0', fontSize: 12, fontWeight: tab === t ? 700 : 500,
                  border: 'none', cursor: 'pointer',
                  background: 'none',
                  color: tab === t ? 'var(--navy)' : 'var(--slate)',
                  borderBottom: tab === t ? '2px solid var(--navy)' : '2px solid transparent',
                  marginBottom: -1,
                }}
              >
                {t === 'members' ? 'Team Members' : 'Saved Crews'}
              </button>
            ))}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>

          {/* ── Members tab ── */}
          {tab === 'members' && (
            <>
              {/* Crew badge if crew was used */}
              {crewId && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '5px 8px', background: '#EFF6FF', borderRadius: 6,
                  border: '1px solid #BFDBFE', marginBottom: 8,
                }}>
                  <span style={{ fontSize: 11, color: '#1E40AF' }}>
                    From saved crew · {(crews.find(c => c.id === crewId))?.name || 'Crew'}
                  </span>
                  <button type="button" onClick={handleClearCrew}
                    style={{ fontSize: 10, color: '#1E40AF', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Clear
                  </button>
                </div>
              )}

              {/* Validation error */}
              {needsLead && (
                <div style={{
                  padding: '5px 8px', background: '#FEE2E2', borderRadius: 6,
                  fontSize: 11, color: 'var(--red)', marginBottom: 8,
                }}>
                  Select one lead technician — tap the ★ to designate.
                </div>
              )}

              {/* Selected members */}
              {members.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <SectionLabel>Team ({members.length})</SectionLabel>
                  {members.map(m => (
                    <div key={m.userId} style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 7px', background: 'var(--off, #EDEBE7)',
                      border: '1px solid var(--lightgray)', borderRadius: 6, marginBottom: 3,
                    }}>
                      {/* Lead star */}
                      <button
                        type="button"
                        title={m.isPrimary ? 'Lead' : 'Make lead'}
                        onClick={() => handleToggleLead(m.userId)}
                        style={{
                          background: 'none', border: 'none', cursor: members.length === 1 ? 'default' : 'pointer',
                          color: m.isPrimary ? 'var(--sand, #D6B58A)' : 'var(--steel)',
                          display: 'flex', padding: 2, flexShrink: 0,
                        }}
                        aria-label={m.isPrimary ? 'Lead' : 'Make lead'}
                      >
                        <StarIcon filled={m.isPrimary} />
                      </button>

                      {/* Name */}
                      <span style={{
                        fontSize: 12, fontWeight: m.isPrimary ? 700 : 500,
                        color: 'var(--navy)', flex: 1, minWidth: 0,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {m.memberName}
                        {m.isPrimary && <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--slate)', marginLeft: 4 }}>LEAD</span>}
                      </span>

                      {/* Role */}
                      <select
                        value={m.assignmentRole}
                        onChange={e => handleRoleChange(m.userId, e.target.value)}
                        style={{
                          fontSize: 10, border: '1px solid var(--lightgray)', borderRadius: 4,
                          padding: '2px 3px', background: '#fff', color: 'var(--navy)',
                          cursor: 'pointer',
                        }}
                        aria-label={`Role for ${m.memberName}`}
                      >
                        {TEAM_ROLE_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>

                      {/* Remove */}
                      {members.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemove(m.userId)}
                          title={`Remove ${m.memberName}`}
                          style={{
                            background: 'none', border: '1px solid var(--lightgray)',
                            borderRadius: 3, cursor: 'pointer', color: 'var(--slate)',
                            fontSize: 11, lineHeight: 1, padding: '2px 5px', flexShrink: 0,
                          }}
                          aria-label={`Remove ${m.memberName}`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Available field-eligible techs */}
              {eligibleTechs.length > 0 && (
                <>
                  <div style={{ height: 1, background: 'var(--lightgray)', marginBottom: 8 }} />
                  <SectionLabel>Available Technicians</SectionLabel>
                  {eligibleTechs.map(t => (
                    <div key={t.id} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '5px 7px', background: '#fff',
                      border: '1px solid var(--lightgray)', borderRadius: 6, marginBottom: 3,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--navy)' }}>{t.name}</div>
                        <StatusDot tech={t} />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAdd(t)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 3,
                          padding: '3px 7px', border: '1px solid var(--navy)',
                          borderRadius: 4, background: '#fff', color: 'var(--navy)',
                          fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                        }}
                        aria-label={`Add ${t.name}`}
                      >
                        <PlusIcon /> Add
                      </button>
                    </div>
                  ))}
                </>
              )}

              {/* Ineligible (greyed out) */}
              {ineligibleTechs.length > 0 && (
                <>
                  <div style={{ height: 1, background: 'var(--lightgray)', marginTop: 4, marginBottom: 8 }} />
                  <SectionLabel>Not Field-Eligible</SectionLabel>
                  {ineligibleTechs.map(t => (
                    <div key={t.id} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '5px 7px', opacity: 0.5,
                      border: '1px solid var(--lightgray)', borderRadius: 6, marginBottom: 3,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--navy)' }}>{t.name}</div>
                        <StatusDot tech={t} />
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Empty state */}
              {techs.length === 0 && (
                <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--slate)', fontSize: 12 }}>
                  No field-eligible team members are available.{' '}
                  <a href="/team?action=add-member" style={{ color: 'var(--navy)', fontWeight: 600 }}>
                    Add Team Member
                  </a>
                </div>
              )}
            </>
          )}

          {/* ── Crews tab ── */}
          {tab === 'crews' && (
            <>
              {crews.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--slate)', fontSize: 12 }}>
                  No saved crews yet.{' '}
                  <a href="/team?action=create-crew" style={{ color: 'var(--navy)', fontWeight: 600 }}>
                    Create Crew
                  </a>
                </div>
              ) : (
                crews.map(crew => {
                  const crewLead = crew.members?.find(m => m.is_lead) || crew.members?.[0];
                  const isActive = crewId === crew.id;
                  return (
                    <div key={crew.id} style={{
                      padding: '9px 10px',
                      border: `1px solid ${isActive ? 'var(--navy)' : 'var(--lightgray)'}`,
                      background: isActive ? '#EFF6FF' : '#fff',
                      borderRadius: 6, marginBottom: 5,
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>
                          {crew.name}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--slate)' }}>
                          {crew.memberCount || crew.members?.length || 0} member{(crew.memberCount || crew.members?.length || 0) !== 1 ? 's' : ''}
                          {crewLead && ` · ${crewLead.member_name} lead`}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => isActive ? null : handleUseCrew(crew)}
                        disabled={isActive}
                        style={{
                          padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          border: `1px solid ${isActive ? 'var(--navy)' : 'var(--navy)'}`,
                          background: isActive ? 'var(--navy)' : '#fff',
                          color: isActive ? '#fff' : 'var(--navy)',
                          cursor: isActive ? 'default' : 'pointer', flexShrink: 0,
                        }}
                      >
                        {isActive ? 'Active' : 'Use Crew'}
                      </button>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>

        {/* Footer — summary + done */}
        <div style={{
          borderTop: '1px solid var(--lightgray)', padding: '8px 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 11, color: 'var(--slate)' }}>
            {members.length === 0
              ? 'No team members selected'
              : `${members.length} member${members.length !== 1 ? 's' : ''} selected`}
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              padding: '5px 14px', borderRadius: 5, border: 'none',
              background: 'var(--navy)', color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, color: 'var(--slate)', marginBottom: 5,
      textTransform: 'uppercase', letterSpacing: '.5px',
    }}>
      {children}
    </div>
  );
}
