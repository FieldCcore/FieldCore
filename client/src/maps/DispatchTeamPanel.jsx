import { useMemo, useState, useEffect } from 'react';
import { getJobStatusPresentation } from '../domain/jobStatusPresentation';
import { getTechStatus, ACTIVE_STATUSES, GPS_LIVE_MS, GPS_STALE_MS } from '../domain/technicianStatusPresentation';

// #2E7D32 (Job Completed green) is intentionally excluded — must not conflict with job status colors
const AVATAR_COLORS = ['#0369A1', '#1565C0', '#E65100', '#6A1B9A', '#AD1457'];

function initials(name) {
  return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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

const TEAM_FILTERS = [
  { key: 'all',       label: 'All'       },
  { key: 'live',      label: 'Live GPS'  },
  { key: 'busy',      label: 'On Job'    },
  { key: 'available', label: 'Available' },
  { key: 'stale',     label: 'Location Stale' },
  { key: 'off',       label: 'Off Duty'  },
];

const JOB_FILTERS = [
  { key: 'all',        label: 'All'        },
  { key: 'active',     label: 'Active'     },
  { key: 'assigned',   label: 'Assigned'   },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'completed',  label: 'Done'       },
];

export default function DispatchTeamPanel({
  techs      = [],
  techLocs   = [],
  jobs       = [],
  sessions   = [],
  loading    = false,
  selectedItem,
  onSelectTech,
  onSelectJob,
  panelFocus,   // { tab, teamFilter?, jobFilter?, _nonce } — drives KPI-click navigation
}) {
  const [tab,         setTab]         = useState('team');
  const [search,      setSearch]      = useState('');
  const [teamFilter,  setTeamFilter]  = useState('all');
  const [jobFilter,   setJobFilter]   = useState('all');

  // Respond to external panel-focus requests (from KPI card clicks)
  useEffect(() => {
    if (!panelFocus) return;
    if (panelFocus.tab)        setTab(panelFocus.tab);
    if (panelFocus.teamFilter) setTeamFilter(panelFocus.teamFilter);
    if (panelFocus.jobFilter)  setJobFilter(panelFocus.jobFilter);
    setSearch('');
  }, [panelFocus]);

  const filteredTechs = useMemo(() => {
    let list = techs;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t => t.name?.toLowerCase().includes(q));
    }
    if (teamFilter !== 'all') {
      list = list.filter(t => techStatus(t, techLocs, jobs).key === teamFilter);
    }
    return list;
  }, [techs, techLocs, jobs, search, teamFilter]);

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
      j.tech_id &&
      !ACTIVE_STATUSES.has(j.status) &&
      !['complete', 'cancelled', 'no_show'].includes(j.status)
    );
    if (jobFilter === 'unassigned') list = list.filter(j => !j.tech_id);
    if (jobFilter === 'completed')  list = list.filter(j => j.status === 'complete');
    return list;
  }, [jobs, search, jobFilter]);

  function switchTab(t) { setTab(t); setSearch(''); }

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

      {/* Search */}
      <div className="dispatch-team-search-wrap">
        <input
          type="search"
          className="dispatch-team-search"
          placeholder={tab === 'team' ? 'Search techs…' : 'Search jobs…'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label={tab === 'team' ? 'Search technicians' : 'Search jobs'}
        />
      </div>

      {/* Filters */}
      {tab === 'team' && techs.length > 0 && (
        <div className="dispatch-team-filters" role="group" aria-label="Tech status filter">
          {TEAM_FILTERS.map(f => (
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
                <div className="dispatch-empty-title">No technicians yet</div>
                <p className="dispatch-empty-body">
                  Add your first technician to enable assignments, live dispatching, and GPS tracking.
                </p>
                <a href="/team" className="btn btn-sm btn-primary dispatch-empty-cta">
                  Add Technician
                </a>
              </div>
            ) : (
              <div className="dispatch-panel-empty">No techs match this filter.</div>
            )
          ) : filteredTechs.map((t, i) => {
            const st        = techStatus(t, techLocs, jobs);
            const loc       = techLocs.find(l => l.user_id === t.id);
            const activeJob = jobs.find(j => j.tech_id === t.id && ACTIVE_STATUSES.has(j.status));
            const techJobs  = jobs.filter(j => j.tech_id === t.id);
            const color     = AVATAR_COLORS[i % AVATAR_COLORS.length];
            const isSel     = selectedItem?.type === 'tech' && selectedItem?.id === t.id;

            return (
              <div
                key={t.id}
                className={`dispatch-tech-row${isSel ? ' sel' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={isSel}
                aria-label={`${t.name} — ${st.label}`}
                onClick={() => onSelectTech?.(t.id)}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelectTech?.(t.id)}
              >
                <div className="dispatch-tech-avatar" style={{ background: color }} aria-hidden="true">
                  {initials(t.name)}
                </div>
                <div className="dispatch-tech-info">
                  <div className="dispatch-tech-name">{t.name}</div>
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
                <p className="dispatch-empty-body">Schedule a job or open the calendar to plan your day.</p>
                <div className="dispatch-empty-actions">
                  <a href="/calendar" className="dispatch-empty-link">Open Calendar</a>
                  <a href="/jobs/new" className="dispatch-empty-link dispatch-empty-link--primary">Create Job</a>
                </div>
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
            const p      = getJobStatusPresentation(j.status);
            const sStyle = { background: p.badgeBg, color: p.badgeColor };
            const sLabel = p.label;
            const isSel  = selectedItem?.type === 'job' && selectedItem?.id === j.id;

            return (
              <div
                key={j.id || idx}
                className={`dispatch-job-row${isSel ? ' sel' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={isSel}
                aria-label={`${j.client_name} — ${j.service_type}: ${sLabel}`}
                onClick={() => onSelectJob?.(j.id)}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelectJob?.(j.id)}
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
                    } · {fmtTime(j.scheduled_at)}
                  </div>
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
