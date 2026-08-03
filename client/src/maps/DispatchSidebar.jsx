import { useMemo, useState } from 'react';
import { useDispatchKpiMetrics } from '../hooks/useDispatchKpiMetrics';
import DispatchSidebarKpiGrid from './DispatchSidebarKpiGrid';
import DispatchCompactRail from './DispatchCompactRail';
import DispatchTeamPanel from './DispatchTeamPanel';
import DispatchAssignmentPanel from './DispatchAssignmentPanel';
import DispatchDateControl from './DispatchDateControl';
import { getJobStatusPresentation } from '../domain/jobStatusPresentation';
import { getTechStatus, ACTIVE_STATUSES } from '../domain/technicianStatusPresentation';
import { formatTZ } from '../utils/calendarTimezone';
import { isValidCoord } from './dispatchCoords';
import api from '../api';

// ── Icons ─────────────────────────────────────────────────────────────────────

function CollapseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 16, height: 16 }} aria-hidden="true">
      <path d="M1 3v10M6 4L2 8l4 4M11 4L7 8l4 4" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 16, height: 16 }} aria-hidden="true">
      <path d="M15 3v10M5 4l4 4-4 4M10 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 14, height: 14 }} aria-hidden="true">
      <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#0369A1', '#1565C0', '#E65100', '#6A1B9A', '#AD1457'];

function initials(name) {
  return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function fmtTime(iso, tz) {
  if (!iso) return '—';
  return tz
    ? formatTZ(new Date(iso), 'h:mm a', tz)
    : new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtDate(iso, tz) {
  if (!iso) return '—';
  return tz
    ? formatTZ(new Date(iso), 'MMM d', tz)
    : new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function fmtAge(ts) {
  if (!ts) return 'No GPS';
  const ms = Date.now() - new Date(ts).getTime();
  const m  = Math.floor(ms / 60000);
  if (m >= 60) return `${Math.floor(m / 60)}h ago`;
  return m > 0 ? `${m}m ago` : 'just now';
}

// ── Job Details inline view ───────────────────────────────────────────────────

function JobDetailView({ job, jobTech, onCenterJob, onJobGeocoded, onBack, timezone }) {
  const p         = getJobStatusPresentation(job.status);
  const sStyle    = { background: p.badgeBg, color: p.badgeColor };
  const sLabel    = p.label;
  const hasCoords = isValidCoord(job.service_lat, job.service_lng);

  const [geocoding,    setGeocoding]    = useState(false);
  const [geocodeError, setGeocodeError] = useState(job.geocode_error || null);

  const handleRetryGeocode = async () => {
    setGeocoding(true);
    setGeocodeError(null);
    try {
      const res = await api.post(`/jobs/${job.id}/geocode`);
      if (res.data?.service_lat && res.data?.service_lng) {
        onJobGeocoded?.({ id: job.id, ...res.data });
      } else {
        setGeocodeError('Address could not be placed on the map.');
      }
    } catch (err) {
      setGeocodeError(err.response?.data?.error || 'Geocoding failed. Try again later.');
    } finally {
      setGeocoding(false);
    }
  };

  const showGeocodeStatus = job.service_address && !hasCoords;
  const geocodeFailed     = job.geocode_status === 'failed' ||
    (showGeocodeStatus && job.geocode_status !== 'not_attempted');

  // Derive a user-friendly message from provider status
  const geocodeMessage = (() => {
    if (geocodeError) return geocodeError;
    if (!geocodeFailed) return 'Map location pending.';
    const ps = job.geocode_provider_status;
    if (ps === 'ZERO_RESULTS')  return 'We could not find this address. Check the street, city, and state.';
    if (ps === 'REQUEST_DENIED') return 'Map-location service is temporarily unavailable. Contact support.';
    if (ps === 'INVALID_REQUEST') return 'This address is incomplete.';
    if (ps === 'NO_API_KEY') return 'Geocoding is not configured. Contact support.';
    return job.geocode_error || 'Address could not be geocoded. Verify the address and retry.';
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderBottom: '1px solid var(--lightgray)',
        flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to jobs"
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 6px', marginLeft: -6,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--slate)', fontSize: 11, fontWeight: 600, borderRadius: 4,
          }}
        >
          <BackIcon />
          Back to Jobs
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px', minHeight: 0 }}>
        {/* Status + priority */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <span
            className="dispatch-job-badge"
            style={{ ...sStyle, fontSize: 10, padding: '2px 8px' }}
            aria-label={`Status: ${sLabel}`}
          >
            {sLabel}
          </span>
          {job.priority === 'high' && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: 'var(--red)',
              background: 'var(--red-lt)', borderRadius: 99, padding: '2px 8px',
            }}>
              High Priority
            </span>
          )}
        </div>

        <div className="dispatch-drawer-name">{job.client_name}</div>
        <div className="dispatch-drawer-role">{job.service_type}</div>

        <div className="dispatch-drawer-divider" />

        <div className="dispatch-drawer-stat-row">
          <span className="dispatch-drawer-stat-label">Scheduled</span>
          <span style={{ fontSize: 12 }}>
            {fmtDate(job.scheduled_at, timezone)} {fmtTime(job.scheduled_at, timezone)}
          </span>
        </div>

        {job.service_address && (
          <div className="dispatch-drawer-stat-row">
            <span className="dispatch-drawer-stat-label">Address</span>
            <span style={{ fontSize: 12, textAlign: 'right', flex: 1 }}>
              {job.service_address}
              {job.service_city  ? `, ${job.service_city}`  : ''}
              {job.service_state ? ` ${job.service_state}`  : ''}
              {job.service_zip   ? ` ${job.service_zip}`    : ''}
            </span>
          </div>
        )}

        <div className="dispatch-drawer-stat-row">
          <span className="dispatch-drawer-stat-label">Assigned</span>
          <span style={{ fontSize: 12, color: jobTech ? 'var(--navy)' : 'var(--amber)' }}>
            {jobTech?.name ?? 'Unassigned'}
          </span>
        </div>

        {job.amount != null && (
          <div className="dispatch-drawer-stat-row">
            <span className="dispatch-drawer-stat-label">Amount</span>
            <span style={{ fontSize: 12 }}>${(job.amount / 100).toFixed(2)}</span>
          </div>
        )}

        {job.notes && (
          <div style={{
            margin: '10px 0', padding: '8px 10px',
            background: 'var(--off)', borderRadius: 6,
            fontSize: 11, color: 'var(--slate)', lineHeight: 1.5,
          }}>
            {job.notes}
          </div>
        )}

        {/* Geocode failure card */}
        {showGeocodeStatus && (
          <div style={{
            margin: '10px 0', padding: '10px 12px', borderRadius: 6,
            background: geocodeFailed ? 'var(--red-lt, #FEE2E2)' : 'var(--off, #EDEBE7)',
            borderLeft: geocodeFailed
              ? '3px solid var(--red, #DC2626)'
              : '3px solid var(--steel, #8A90A2)',
          }}>
            <div style={{
              fontSize: 11, fontWeight: 600, marginBottom: 2,
              color: geocodeFailed ? 'var(--red, #DC2626)' : 'var(--slate, #5F667A)',
            }}>
              Map location unavailable
            </div>
            <div style={{ fontSize: 11, color: geocodeFailed ? 'var(--red, #DC2626)' : 'var(--slate, #5F667A)' }}>
              {geocodeMessage}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="dispatch-drawer-actions">
          {hasCoords && (
            <button type="button" className="dispatch-drawer-btn primary" onClick={() => onCenterJob?.(job)}>
              Center Map
            </button>
          )}
          {showGeocodeStatus && (
            <button
              type="button"
              className="dispatch-drawer-btn"
              onClick={handleRetryGeocode}
              disabled={geocoding}
              aria-busy={geocoding}
            >
              {geocoding ? 'Locating…' : 'Retry Geocoding'}
            </button>
          )}
          <a href={`/jobs`} className="dispatch-drawer-btn">
            Open Job
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Tech Details inline view ──────────────────────────────────────────────────

function TechDetailView({ tech, loc, activeJob, nextJob, avatarColor, onCenterTech, onBack, jobs = [], timezone }) {
  const st     = getTechStatus(tech, loc ? [{ ...loc, user_id: tech.id }] : [], jobs);
  const hasLoc = !!loc && st.key !== 'off' && st.key !== 'offline';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderBottom: '1px solid var(--lightgray)',
        flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to team"
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 6px', marginLeft: -6,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--slate)', fontSize: 11, fontWeight: 600, borderRadius: 4,
          }}
        >
          <BackIcon />
          Back
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', minHeight: 0 }}>
        <div className="dispatch-drawer-avatar-row">
          <div className="dispatch-drawer-avatar" style={{ background: avatarColor }} aria-hidden="true">
            {initials(tech.name)}
          </div>
          <div>
            <div className="dispatch-drawer-name">{tech.name}</div>
            <div className="dispatch-drawer-role">{tech.role}</div>
          </div>
        </div>

        <div className="dispatch-drawer-stat-row">
          <span className="dispatch-drawer-stat-label">Status</span>
          <span style={{ color: st.color, fontWeight: 600, fontSize: 12 }}>{st.label}</span>
        </div>

        {loc && (
          <div className="dispatch-drawer-stat-row">
            <span className="dispatch-drawer-stat-label">
              {(st.isStale || st.key === 'offline') ? 'Last known location' : 'Last seen'}
            </span>
            <span style={{ fontSize: 12 }}>{fmtAge(loc.updated_at)}</span>
          </div>
        )}

        {st.isStale && (
          <div className="dispatch-drawer-stat-row">
            <span className="dispatch-drawer-stat-label" style={{ color: '#B45309' }}>Location stale</span>
            <span style={{ fontSize: 12, color: '#B45309' }}>GPS not updated recently</span>
          </div>
        )}

        {loc?.speed != null && loc.speed > 2 && (
          <div className="dispatch-drawer-stat-row">
            <span className="dispatch-drawer-stat-label">Speed</span>
            <span style={{ fontSize: 12 }}>{Math.round(loc.speed * 2.237)} mph</span>
          </div>
        )}

        {activeJob && (
          <div className="dispatch-drawer-job-card">
            <div className="dispatch-drawer-job-lbl">Current Job</div>
            <div className="dispatch-drawer-job-name">{activeJob.client_name}</div>
            <div className="dispatch-drawer-job-meta">{activeJob.service_type}</div>
            {activeJob.service_address && (
              <div className="dispatch-drawer-job-meta">
                {activeJob.service_address}
                {activeJob.service_city ? `, ${activeJob.service_city}` : ''}
              </div>
            )}
          </div>
        )}

        {nextJob && (
          <div className="dispatch-drawer-job-card">
            <div className="dispatch-drawer-job-lbl">Next Job</div>
            <div className="dispatch-drawer-job-name">{nextJob.client_name}</div>
            <div className="dispatch-drawer-job-meta">
              {nextJob.service_type} · {fmtTime(nextJob.scheduled_at, timezone)}
            </div>
          </div>
        )}

        <div className="dispatch-drawer-actions">
          {hasLoc && (
            <button type="button" className="dispatch-drawer-btn primary" onClick={() => onCenterTech?.(tech.id)}>
              Center Map
            </button>
          )}
          {tech.phone && (
            <a href={`tel:${tech.phone}`} className="dispatch-drawer-btn" aria-label={`Call ${tech.name}`}>
              Call
            </a>
          )}
          <a href="/team" className="dispatch-drawer-btn">Profile</a>
        </div>
      </div>
    </div>
  );
}

// ── Main DispatchSidebar ──────────────────────────────────────────────────────

/**
 * DispatchSidebar
 *
 * Three layout modes: "expanded" (280px) | "compact" (76px, labeled rail) | "full_map" (0px).
 *
 * Four content views: 'list' | 'job_details' | 'tech_details'
 * View is controlled by Dispatch.jsx via sidebarView + onSidebarBack props.
 */
export default function DispatchSidebar({
  mode,
  isMobile,
  onToggle,
  onEnterFullMap,
  onTransitionEnd,
  activeKpiKey,
  onKpiClick,
  onExpandToTeam,
  onExpandToJobs,
  activeTab,
  panelFocus,
  techs,
  techLocs,
  jobs,
  sessions,
  loading,
  selectedItem,
  onSelectTech,
  onSelectJob,
  dispatchDate,
  onDateChange,
  timezone,
  // Detail views
  sidebarView,     // 'list' | 'job_details' | 'tech_details' | 'assignment_confirm'
  onSidebarBack,   // () => void — go back to list
  onCenterJob,     // (job) => void
  onCenterTech,    // (techId) => void
  onJobGeocoded,   // (updatedJob) => void
  // Phase 1 — assignment
  assignmentPending,     // { job, tech, validation } | null
  onAssignConfirmed,     // (updatedJob) => void
  onAssignCancel,        // () => void
  onAssignJob,           // (jobId, techId) => void
  flags,                 // dispatch feature flags
  workloadsByTechId,     // Map<techId, WorkloadEntry>
  userRole,              // 'owner' | 'manager' | 'tech'
}) {
  const { metrics, loading: kpiLoading } = useDispatchKpiMetrics(dispatchDate);

  const isExpanded = mode === 'expanded';
  const isCompact  = mode === 'compact';
  const isFullMap  = mode === 'full_map';
  const showToggle = !isMobile && !isFullMap;

  // Resolve selected job/tech data for detail views
  const selectedJob = useMemo(() => {
    if (sidebarView !== 'job_details' || !selectedItem?.id) return null;
    return (jobs || []).find(j => j.id === selectedItem.id) ?? null;
  }, [sidebarView, selectedItem, jobs]);

  const selectedJobTech = useMemo(() => {
    if (!selectedJob?.tech_id) return null;
    return (techs || []).find(t => t.id === selectedJob.tech_id) ?? null;
  }, [selectedJob, techs]);

  const selectedTech = useMemo(() => {
    if (sidebarView !== 'tech_details' || !selectedItem?.id) return null;
    return (techs || []).find(t => t.id === selectedItem.id) ?? null;
  }, [sidebarView, selectedItem, techs]);

  const selectedTechLoc = useMemo(() => {
    if (!selectedTech) return null;
    return (techLocs || []).find(l => l.user_id === selectedTech.id) ?? null;
  }, [selectedTech, techLocs]);

  const selectedTechAvatarColor = useMemo(() => {
    if (!selectedTech) return AVATAR_COLORS[0];
    const idx = (techs || []).findIndex(t => t.id === selectedTech.id);
    return AVATAR_COLORS[Math.max(0, idx) % AVATAR_COLORS.length];
  }, [selectedTech, techs]);

  const selectedTechActiveJob = useMemo(() => {
    if (!selectedTech) return null;
    return (jobs || [])
      .filter(j => j.tech_id === selectedTech.id && ACTIVE_STATUSES.has(j.status))
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0] ?? null;
  }, [selectedTech, jobs]);

  const selectedTechNextJob = useMemo(() => {
    if (!selectedTech) return null;
    return (jobs || [])
      .filter(j =>
        j.tech_id === selectedTech.id &&
        !ACTIVE_STATUSES.has(j.status) &&
        !['complete', 'cancelled', 'no_show'].includes(j.status)
      )
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0] ?? null;
  }, [selectedTech, jobs]);

  const showDetailView = (isExpanded || isMobile) &&
    (sidebarView === 'job_details' || sidebarView === 'tech_details' || sidebarView === 'assignment_confirm');

  return (
    <div
      id="dispatch-sidebar"
      className={`dispatch-sidebar${isFullMap ? ' dispatch-sidebar--full-map' : ''}`}
      onTransitionEnd={onTransitionEnd}
    >
      {showToggle && (
        <button
          type="button"
          className="dispatch-sidebar-toggle"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls="dispatch-sidebar"
          aria-label={isExpanded ? 'Collapse dispatch panel' : 'Expand dispatch panel'}
        >
          {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
        </button>
      )}

      {isCompact && !isMobile && (
        <DispatchCompactRail
          metrics={metrics}
          activeKpiKey={activeKpiKey}
          activeTab={activeTab}
          onExpandToTeam={onExpandToTeam}
          onExpandToJobs={onExpandToJobs}
          onKpiClick={onKpiClick}
          onEnterFullMap={onEnterFullMap}
        />
      )}

      {/* Detail view: replaces list content in expanded/mobile mode */}
      {showDetailView && sidebarView === 'job_details' && selectedJob && (
        <JobDetailView
          job={selectedJob}
          jobTech={selectedJobTech}
          onCenterJob={onCenterJob}
          onJobGeocoded={onJobGeocoded}
          onBack={onSidebarBack}
          timezone={timezone}
        />
      )}

      {showDetailView && sidebarView === 'tech_details' && selectedTech && (
        <TechDetailView
          tech={selectedTech}
          loc={selectedTechLoc}
          activeJob={selectedTechActiveJob}
          nextJob={selectedTechNextJob}
          avatarColor={selectedTechAvatarColor}
          onCenterTech={onCenterTech}
          onBack={onSidebarBack}
          jobs={jobs}
          timezone={timezone}
        />
      )}

      {showDetailView && sidebarView === 'assignment_confirm' && assignmentPending && (
        <DispatchAssignmentPanel
          job={assignmentPending.job}
          tech={assignmentPending.tech}
          validation={assignmentPending.validation}
          onConfirm={onAssignConfirmed}
          onCancel={onAssignCancel}
        />
      )}

      {/* List view: KPI grid + date control + team/jobs panel */}
      {(isExpanded || isMobile) && !showDetailView && (
        <>
          <DispatchSidebarKpiGrid
            metrics={metrics}
            loading={kpiLoading}
            activeKpiKey={activeKpiKey}
            onKpiClick={onKpiClick}
            onEnterFullMap={onEnterFullMap}
          />
          <DispatchDateControl
            date={dispatchDate}
            onDateChange={onDateChange}
          />
          <DispatchTeamPanel
            techs={techs}
            techLocs={techLocs}
            jobs={jobs}
            sessions={sessions}
            loading={loading}
            selectedItem={selectedItem}
            onSelectTech={onSelectTech}
            onSelectJob={onSelectJob}
            panelFocus={panelFocus}
            timezone={timezone}
            flags={flags}
            workloadsByTechId={workloadsByTechId}
            onAssignJob={onAssignJob}
            userRole={userRole}
          />
        </>
      )}
    </div>
  );
}
