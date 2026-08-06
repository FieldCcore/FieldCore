import { useMemo, useState, useEffect } from 'react';
import { getJobStatusPresentation } from '../domain/jobStatusPresentation';
import { getTechStatus, ACTIVE_STATUSES, GPS_LIVE_MS, GPS_STALE_MS } from '../domain/technicianStatusPresentation';
import { formatTZ } from '../utils/calendarTimezone';

// #2E7D32 (Job Completed green) is intentionally excluded — must not conflict with job status colors
const AVATAR_COLORS = ['#0369A1', '#1565C0', '#E65100', '#6A1B9A', '#AD1457'];

const NON_ASSIGNABLE_STATUSES = new Set(['complete', 'cancelled', 'no_show', 'draft']);

// Workload state → visual config
const WL_STATE_STYLE = {
  open:          { color: '#2E7D32', bg: '#E8F5E9', label: 'Available Load' },
  balanced:      { color: '#2E7D32', bg: '#E8F5E9', label: 'Available Load' },
  near_capacity: { color: '#B45309', bg: '#FEF3C7', label: 'Nearly Full'    },
  over_capacity: { color: '#DC2626', bg: '#FEE2E2', label: 'Overloaded'     },
  unavailable:   { color: '#5F667A', bg: '#F3F4F6', label: 'N/A'            },
};

function initials(name) {
  return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function fmtTime(iso, tz) {
  if (!iso) return '—';
  return tz
    ? formatTZ(new Date(iso), 'h:mm a', tz)
    : new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtAgeShort(ts) {
  const ms = Date.now() - new Date(ts).getTime();
  const m  = Math.floor(ms / 60000);
  if (m >= 60) return `${Math.floor(m / 60)}h ago`;
  return m > 0 ? `${m}m ago` : 'just now';
}

function techStatus(tech, techLocs, jobs) {
  return getTechStatus(tech, techLocs, jobs);
}

function WorkloadBadge({ wl }) {
  if (!wl) return null;
  const s = WL_STATE_STYLE[wl.state] || WL_STATE_STYLE.unavailable;
  return (
    <span
      aria-label={`Workload: ${s.label} (${wl.capacityPercent}%)`}
      style={{
        fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99,
        color: s.color, background: s.bg, marginLeft: 4, flexShrink: 0,
      }}
    >
      {s.label} · {wl.capacityPercent}%
    </span>
  );
}

const BASE_TEAM_FILTERS = [
  { key: 'all',       label: 'All'       },
  { key: 'live',      label: 'Live GPS'  },
  { key: 'busy',      label: 'On Job'    },
  { key: 'available', label: 'Available' },
  { key: 'stale',     label: 'Location Stale' },
  { key: 'off',       label: 'Off Duty'  },
];

const WORKLOAD_FILTERS = [
  { key: 'wl_open', label: 'Available Load' },
  { key: 'wl_near', label: 'Nearly Full'    },
  { key: 'wl_over', label: 'Overloaded'     },
];

const JOB_FILTERS = [
  { key: 'all',        label: 'All'        },
  { key: 'active',     label: 'Active'     },
  { key: 'assigned',   label: 'Assigned'   },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'completed',  label: 'Done'       },
];

export default function DispatchTeamPanel({
  techs           = [],
  techLocs        = [],
  jobs            = [],
  sessions        = [],
  loading         = false,
  selectedItem,
  onSelectTech,
  onSelectJob,
  panelFocus,   // { tab, teamFilter?, jobFilter?, _nonce } — drives KPI-click navigation
  timezone,
  // Phase 1 — assignment
  flags           = {},
  workloadsByTechId = null,  // Map<techId, WorkloadEntry>
  onAssignJob     = null,    // (jobId, techId) => void
  userRole        = 'tech',
  // Phase 2 — route sequencing
  onViewRoute       = null,  // (techId) => void
  // Phase 3 — delay predictions
  delaysByTechId    = null,  // Map<techId, DelayPrediction>
}) {
  const [tab,              setTab]              = useState('team');
  const [search,           setSearch]           = useState('');
  const [teamFilter,       setTeamFilter]       = useState('all');
  const [jobFilter,        setJobFilter]        = useState('all');
  const [showAllStaff,     setShowAllStaff]     = useState(false);
  // Drag-and-drop state
  const [dragJobId,        setDragJobId]        = useState(null);
  const [dragOverTechId,   setDragOverTechId]   = useState(null);
  // Accessible assign flow: picking a tech for a job
  const [pendingAssignJob, setPendingAssignJob]  = useState(null);

  const canAssign = flags.dispatch_drag_assignment && onAssignJob && userRole !== 'tech';

  // Respond to external panel-focus requests (from KPI card clicks)
  useEffect(() => {
    if (!panelFocus) return;
    if (panelFocus.tab)        setTab(panelFocus.tab);
    if (panelFocus.teamFilter) setTeamFilter(panelFocus.teamFilter);
    if (panelFocus.jobFilter)  setJobFilter(panelFocus.jobFilter);
    setSearch('');
  }, [panelFocus]);

  // Clear pending assign when tab changes away from team
  useEffect(() => {
    if (tab !== 'team') setPendingAssignJob(null);
  }, [tab]);

  function isFieldMember(t) {
    if (t.field_work_eligible == null) return t.role === 'tech';
    return t.field_work_eligible === true && t.dispatch_visible === true;
  }

  function isJobAssignable(job) {
    return !NON_ASSIGNABLE_STATUSES.has(job.status);
  }

  const activeTeamFilters = useMemo(() => {
    if (flags.dispatch_workload_balancing) return [...BASE_TEAM_FILTERS, ...WORKLOAD_FILTERS];
    return BASE_TEAM_FILTERS;
  }, [flags.dispatch_workload_balancing]);

  const filteredTechs = useMemo(() => {
    let list = showAllStaff ? techs : techs.filter(isFieldMember);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t => t.name?.toLowerCase().includes(q));
    }
    if (teamFilter === 'wl_open') {
      list = list.filter(t => {
        const wl = workloadsByTechId?.get(t.id);
        return wl && (wl.state === 'open' || wl.state === 'balanced');
      });
    } else if (teamFilter === 'wl_near') {
      list = list.filter(t => {
        const wl = workloadsByTechId?.get(t.id);
        return wl && wl.state === 'near_capacity';
      });
    } else if (teamFilter === 'wl_over') {
      list = list.filter(t => {
        const wl = workloadsByTechId?.get(t.id);
        return wl && wl.state === 'over_capacity';
      });
    } else if (teamFilter !== 'all') {
      list = list.filter(t => techStatus(t, techLocs, jobs).key === teamFilter);
    }
    return list;
  }, [techs, techLocs, jobs, search, teamFilter, showAllStaff, workloadsByTechId]);

  const filteredJobs = useMemo(() => {
    let list = jobs;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(j =>
        j.client_name?.toLowerCase().includes(q) ||
        j.service_type?.toLowerCase().includes(q) ||
        j.service_address?.toLowerCase().includes(q)
      );
    }
    if (jobFilter === 'active')     list = list.filter(j => ACTIVE_STATUSES.has(j.status));
    if (jobFilter === 'assigned')   list = list.filter(j =>
      (j.tech_id || j.tech_name) &&
      !ACTIVE_STATUSES.has(j.status) &&
      !['complete', 'cancelled', 'no_show'].includes(j.status)
    );
    if (jobFilter === 'unassigned') list = list.filter(j => !j.tech_id && !j.tech_name);
    if (jobFilter === 'completed')  list = list.filter(j => j.status === 'complete');
    // Emergency jobs always float to the top of whatever filter is applied
    return [...list].sort((a, b) => {
      if (a.is_emergency && !b.is_emergency) return -1;
      if (!a.is_emergency && b.is_emergency) return 1;
      return 0;
    });
  }, [jobs, search, jobFilter]);

  function switchTab(t) { setTab(t); setSearch(''); }

  function handleDragStart(e, jobId) {
    setDragJobId(jobId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', jobId);
  }

  function handleDragEnd() {
    setDragJobId(null);
    setDragOverTechId(null);
  }

  function handleTechDragOver(e, techId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTechId(techId);
  }

  function handleTechDragLeave() {
    setDragOverTechId(null);
  }

  function handleTechDrop(e, techId) {
    e.preventDefault();
    const jobId = e.dataTransfer.getData('text/plain') || dragJobId;
    setDragJobId(null);
    setDragOverTechId(null);
    if (jobId && techId) onAssignJob?.(jobId, techId);
  }

  function handleAssignButtonClick(e, job) {
    e.stopPropagation();
    setPendingAssignJob(job);
    setTab('team');
    setSearch('');
  }

  function handleTechClickInAssignMode(techId) {
    if (pendingAssignJob) {
      onAssignJob?.(pendingAssignJob.id, techId);
      setPendingAssignJob(null);
    } else {
      onSelectTech?.(techId);
    }
  }

  return (
    <div className="dispatch-team-panel">
      {/* Tabs */}
      <div className="dispatch-team-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'team'}
          className={`dispatch-team-tab${tab === 'team' ? ' active' : ''}`}
          onClick={() => switchTab('team')}
        >
          Team
          {techs.length > 0 && (
            <span className="dispatch-tab-badge" aria-label={`${techs.length} techs`}>
              {techs.length}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'jobs'}
          className={`dispatch-team-tab${tab === 'jobs' ? ' active' : ''}`}
          onClick={() => switchTab('jobs')}
        >
          Jobs
          {jobs.length > 0 && (
            <span className="dispatch-tab-badge" aria-label={`${jobs.length} jobs`}>
              {jobs.length}
            </span>
          )}
        </button>
      </div>

      {/* Pending-assign banner */}
      {pendingAssignJob && tab === 'team' && (
        <div style={{
          background: 'var(--sand)', color: '#fff',
          padding: '6px 12px', fontSize: 11, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>Assigning: {pendingAssignJob.client_name}</span>
          <button
            type="button"
            onClick={() => setPendingAssignJob(null)}
            style={{
              background: 'none', border: 'none', color: '#fff',
              cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: '0 2px',
            }}
            aria-label="Cancel tech selection"
          >
            ✕
          </button>
        </div>
      )}

      {/* Search */}
      <div className="dispatch-team-search-wrap">
        <input
          type="search"
          className="dispatch-team-search"
          placeholder={tab === 'team'
            ? (pendingAssignJob ? 'Filter techs…' : 'Search techs…')
            : 'Search jobs…'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label={tab === 'team' ? 'Search technicians' : 'Search jobs'}
        />
      </div>

      {/* Filters + show-all-staff toggle */}
      {tab === 'team' && techs.length > 0 && (
        <>
          <div className="dispatch-team-filters" role="group" aria-label="Tech status filter">
            {activeTeamFilters.map(f => (
              <button
                key={f.key}
                type="button"
                className={`dispatch-filter-chip${teamFilter === f.key ? ' active' : ''}`}
                onClick={() => setTeamFilter(f.key)}
                aria-pressed={teamFilter === f.key}
              >
                {f.label}
              </button>
            ))}
          </div>
          {techs.some(t => !isFieldMember(t)) && (
            <label className="dispatch-staff-toggle">
              <input
                type="checkbox"
                checked={showAllStaff}
                onChange={e => setShowAllStaff(e.target.checked)}
              />
              Show office staff
            </label>
          )}
        </>
      )}

      {tab === 'jobs' && (
        <div className="dispatch-team-filters" role="group" aria-label="Job status filter">
          {JOB_FILTERS.map(f => (
            <button
              key={f.key}
              type="button"
              className={`dispatch-filter-chip${jobFilter === f.key ? ' active' : ''}`}
              onClick={() => setJobFilter(f.key)}
              aria-pressed={jobFilter === f.key}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      <div className="dispatch-team-list" role="tabpanel">
        {loading ? (
          <div className="dispatch-panel-empty">Loading…</div>
        ) : tab === 'team' ? (
          filteredTechs.length === 0 ? (
            techs.length === 0 ? (
              <div className="dispatch-panel-empty dispatch-panel-empty--onboard">
                <div className="dispatch-empty-title">No team members yet</div>
                <p className="dispatch-empty-body">
                  Add your first team member and assign their role, permissions, and field-tracking policy.
                </p>
                <a href="/team?action=add-member&returnTo=/dispatch" className="dispatch-empty-cta">
                  Add Team Member
                </a>
              </div>
            ) : (
              <div className="dispatch-panel-empty">No field staff match this filter.</div>
            )
          ) : filteredTechs.map((t, i) => {
            const st          = techStatus(t, techLocs, jobs);
            const loc         = techLocs.find(l => l.user_id === t.id);
            const activeJob   = jobs.find(j => j.tech_id === t.id && ACTIVE_STATUSES.has(j.status));
            const techJobs    = jobs.filter(j => j.tech_id === t.id);
            const color       = AVATAR_COLORS[i % AVATAR_COLORS.length];
            const isSel       = selectedItem?.type === 'tech' && selectedItem?.id === t.id;
            const isDragOver  = dragOverTechId === t.id;
            const wl          = flags.dispatch_workload_balancing ? workloadsByTechId?.get(t.id) : null;
            const isPickMode  = !!pendingAssignJob;
            const showRoute   = flags.dispatch_route_sequencing && onViewRoute && techJobs.length > 0;
            const delay       = flags.dispatch_delay_prediction ? delaysByTechId?.get(t.id) : null;
            const delayStyle  = delay?.status === 'delayed' ? { color: '#DC2626', bg: '#FEE2E2' }
                              : delay?.status === 'at_risk'  ? { color: '#B45309', bg: '#FEF3C7' }
                              : null;

            return (
              <div
                key={t.id}
                className={`dispatch-tech-row${isSel ? ' sel' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={isSel}
                aria-label={`${t.name} — ${st.label}${isPickMode ? ' — click to assign' : ''}`}
                onClick={() => handleTechClickInAssignMode(t.id)}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handleTechClickInAssignMode(t.id)}
                onDragOver={canAssign ? e => handleTechDragOver(e, t.id) : undefined}
                onDragLeave={canAssign ? handleTechDragLeave : undefined}
                onDrop={canAssign ? e => handleTechDrop(e, t.id) : undefined}
                style={isDragOver ? { outline: '2px solid var(--sand)', background: 'var(--off)' } : undefined}
              >
                <div className="dispatch-tech-avatar" style={{ background: color }} aria-hidden="true">
                  {initials(t.name)}
                </div>
                <div className="dispatch-tech-info">
                  <div className="dispatch-tech-name" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                    {t.name}
                    {wl && <WorkloadBadge wl={wl} />}
                    {delayStyle && (
                      <span
                        aria-label={delay.status === 'delayed' ? `Delayed ~${delay.delayMinutes}m` : 'At risk of delay'}
                        style={{
                          fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99,
                          color: delayStyle.color, background: delayStyle.bg, flexShrink: 0,
                        }}
                      >
                        {delay.status === 'delayed' ? `~${delay.delayMinutes}m late` : 'At risk'}
                      </span>
                    )}
                  </div>
                  <div className="dispatch-tech-job">
                    {activeJob
                      ? `${activeJob.service_type} · ${activeJob.client_name}`
                      : techJobs.length > 0
                        ? `${techJobs.length} job${techJobs.length > 1 ? 's' : ''} today`
                        : 'No jobs today'}
                    {loc && st.key !== 'off' && st.key !== 'offline' && (
                      <span style={{ color: st.color, marginLeft: 5, fontSize: 10 }}>
                        · {fmtAgeShort(loc.updated_at)}
                      </span>
                    )}
                    {loc?.speed != null && loc.speed > 2 && (
                      <span style={{ color: 'var(--steel)', marginLeft: 4, fontSize: 10 }}>
                        {Math.round(loc.speed * 2.237)} mph
                      </span>
                    )}
                  </div>
                  {showRoute && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); onViewRoute(t.id); }}
                      style={{
                        marginTop: 3, padding: '2px 8px',
                        fontSize: 10, fontWeight: 700,
                        background: 'var(--off)', color: 'var(--navy)',
                        border: '1px solid var(--lightgray)', borderRadius: 4,
                        cursor: 'pointer',
                      }}
                      aria-label={`View route for ${t.name}`}
                    >
                      View Route
                    </button>
                  )}
                </div>
                <span
                  className="dispatch-tech-badge"
                  style={{ background: st.bg, color: st.color }}
                  aria-label={`Status: ${st.label}`}
                >
                  {st.label}
                </span>
              </div>
            );
          })
        ) : (
          filteredJobs.length === 0 ? (
            jobs.length === 0 ? (
              <div className="dispatch-panel-empty dispatch-panel-empty--onboard">
                <div className="dispatch-empty-title">No jobs today</div>
                <p className="dispatch-empty-body">
                  Create a job to begin scheduling and dispatching work.
                </p>
                <a href="/jobs?new=1" className="dispatch-empty-cta">
                  Create Job
                </a>
              </div>
            ) : (
              <div className="dispatch-panel-empty">
                {jobFilter === 'active'     ? 'No active jobs right now.'
                : jobFilter === 'assigned'   ? 'No assigned jobs today.'
                : jobFilter === 'unassigned' ? 'No unassigned jobs today.'
                : jobFilter === 'completed'  ? 'No completed jobs today.'
                : 'No jobs match this filter.'}
              </div>
            )
          ) : filteredJobs.map((j, idx) => {
            const p          = getJobStatusPresentation(j.status);
            const sStyle     = { background: p.badgeBg, color: p.badgeColor };
            const sLabel     = p.label;
            const isSel      = selectedItem?.type === 'job' && selectedItem?.id === j.id;
            const assignable = canAssign && isJobAssignable(j);
            const isDragging = dragJobId === j.id;

            return (
              <div
                key={j.id || idx}
                className={`dispatch-job-row${isSel ? ' sel' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={isSel}
                aria-label={`${j.client_name} — ${j.service_type}: ${sLabel}`}
                draggable={assignable}
                onClick={() => onSelectJob?.(j.id)}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelectJob?.(j.id)}
                onDragStart={assignable ? e => handleDragStart(e, j.id) : undefined}
                onDragEnd={assignable ? handleDragEnd : undefined}
                style={isDragging ? { opacity: 0.5 } : undefined}
              >
                <div
                  className="dispatch-job-dot"
                  aria-hidden="true"
                  style={{ background: ACTIVE_STATUSES.has(j.status) ? '#D4A000' : sStyle.background }}
                />
                <div className="dispatch-job-info">
                  <div className="dispatch-job-name">{j.client_name} — {j.service_type}</div>
                  {j.service_address && (
                    <div className="dispatch-job-meta" style={{ fontSize: 10 }}>
                      {j.service_address}{j.service_city ? `, ${j.service_city}` : ''}
                    </div>
                  )}
                  <div className="dispatch-job-meta">
                    {j.tech_name
                      ? j.tech_name
                      : <span style={{ color: 'var(--amber)' }}>Unassigned</span>
                    } · {fmtTime(j.scheduled_at, timezone)}
                  </div>
                  {assignable && (
                    <button
                      type="button"
                      onClick={e => handleAssignButtonClick(e, j)}
                      style={{
                        marginTop: 4, padding: '2px 8px',
                        fontSize: 10, fontWeight: 700,
                        background: 'var(--sand)', color: '#fff',
                        border: 'none', borderRadius: 4, cursor: 'pointer',
                      }}
                      aria-label={`Assign team for ${j.client_name} — ${j.service_type}`}
                    >
                      Assign Team
                    </button>
                  )}
                </div>
                <span className="dispatch-job-badge" style={sStyle}>{sLabel}</span>
              </div>
            );
          })
        )}

        {/* Multi-day sessions — Team tab only */}
        {tab === 'team' && !loading && sessions.length > 0 && (
          <>
            <div className="dispatch-section-lbl" style={{ marginTop: 8 }}>
              Sessions Today
            </div>
            {sessions.map((s, idx) => (
              <div key={s.id || idx} className="dispatch-job-row">
                <div className="dispatch-job-dot" aria-hidden="true" style={{ background: '#1565C0' }} />
                <div className="dispatch-job-info">
                  <div className="dispatch-job-name">
                    <span style={{
                      fontSize: 9, fontWeight: 800, color: '#1565C0',
                      background: 'var(--blue-lt)', borderRadius: 3,
                      padding: '1px 5px', marginRight: 5,
                    }}>
                      Day {s.day_number}/{s.total_sessions}
                    </span>
                    {s.client_name} — {s.service_type}
                  </div>
                  <div className="dispatch-job-meta">{s.lead_tech_name || 'Unassigned'}</div>
                </div>
                <span className="dispatch-job-badge" style={{ background: 'var(--blue-lt)', color: 'var(--blue)' }}>
                  {(s.status || 'scheduled').replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
