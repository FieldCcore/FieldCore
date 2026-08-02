import { useMemo } from 'react';
import { getJobStatusPresentation } from '../domain/jobStatusPresentation';
import { getTechStatus, GPS_LIVE_MS, GPS_STALE_MS, ACTIVE_STATUSES } from '../domain/technicianStatusPresentation';

// #2E7D32 (Job Completed green) is intentionally excluded — must not conflict with job status colors
const AVATAR_COLORS = ['#0369A1', '#1565C0', '#E65100', '#6A1B9A', '#AD1457'];

function initials(name) {
  return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function fmtAge(ts) {
  if (!ts) return 'No GPS';
  const ms = Date.now() - new Date(ts).getTime();
  const m  = Math.floor(ms / 60000);
  if (m >= 60) return `${Math.floor(m / 60)}h ago`;
  return m > 0 ? `${m}m ago` : 'just now';
}

/**
 * Contextual drawer that slides in from the right of the map when a tech or
 * job is selected. Must live inside .dispatch-map-overlays (pointer-events:none)
 * and sets pointer-events:auto on itself via CSS (.dispatch-drawer).
 *
 * Props:
 *   item         — { type: 'tech'|'job', id: string } | null
 *   techs        — array from GET /api/users
 *   techLocs     — array from GET /api/mobile/locations
 *   jobs         — array from GET /api/jobs
 *   onClose      — () => void
 *   onCenterTech — (techId: string) => void
 *   onCenterJob  — (job: object) => void
 */
export default function DispatchDrawer({
  item,
  techs    = [],
  techLocs = [],
  jobs     = [],
  onClose,
  onCenterTech,
  onCenterJob,
}) {
  const isOpen = item != null;

  const tech = useMemo(() => {
    if (item?.type !== 'tech') return null;
    return techs.find(t => t.id === item.id) ?? null;
  }, [item, techs]);

  const job = useMemo(() => {
    if (item?.type !== 'job') return null;
    return jobs.find(j => j.id === item.id) ?? null;
  }, [item, jobs]);

  const techLoc = useMemo(() => {
    if (!tech) return null;
    return techLocs.find(l => l.user_id === tech.id) ?? null;
  }, [tech, techLocs]);

  const techActiveJob = useMemo(() => {
    if (!tech) return null;
    // Use canonical ACTIVE_STATUSES — same set as getTechStatus and the backend
    const active = jobs
      .filter(j => j.tech_id === tech.id && ACTIVE_STATUSES.has(j.status))
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
    return active[0] ?? null;
  }, [tech, jobs]);

  const techNextJob = useMemo(() => {
    if (!tech) return null;
    // Earliest assigned job that is not currently active and not terminal
    const upcoming = jobs
      .filter(j =>
        j.tech_id === tech.id &&
        !ACTIVE_STATUSES.has(j.status) &&
        !['complete', 'cancelled', 'no_show'].includes(j.status)
      )
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
    return upcoming[0] ?? null;
  }, [tech, jobs]);

  const jobTech = useMemo(() => {
    if (!job?.tech_id) return null;
    return techs.find(t => t.id === job.tech_id) ?? null;
  }, [job, techs]);

  const avatarColor = useMemo(() => {
    if (!tech) return AVATAR_COLORS[0];
    const idx = techs.findIndex(t => t.id === tech.id);
    return AVATAR_COLORS[Math.max(0, idx) % AVATAR_COLORS.length];
  }, [tech, techs]);

  return (
    <div
      className={`dispatch-drawer${isOpen ? ' open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={item?.type === 'tech' ? 'Technician details' : 'Job details'}
      aria-hidden={!isOpen}
    >
      <div className="dispatch-drawer-hdr">
        <span className="dispatch-drawer-title">
          {item?.type === 'tech' ? 'Technician' : 'Job Details'}
        </span>
        <button
          type="button"
          className="dispatch-drawer-close"
          onClick={onClose}
          aria-label="Close details panel"
        >
          ✕
        </button>
      </div>

      <div className="dispatch-drawer-body">
        {item?.type === 'tech' && tech && (
          <TechView
            tech={tech}
            loc={techLoc}
            activeJob={techActiveJob}
            nextJob={techNextJob}
            avatarColor={avatarColor}
            onCenter={() => onCenterTech?.(tech.id)}
            jobs={jobs}
          />
        )}

        {item?.type === 'job' && job && (
          <JobView
            job={job}
            jobTech={jobTech}
            onCenter={() => onCenterJob?.(job)}
          />
        )}
      </div>
    </div>
  );
}

// ── Tech detail view ──────────────────────────────────────────────────────────

function TechView({ tech, loc, activeJob, nextJob, avatarColor, onCenter, jobs = [] }) {
  const st     = getTechStatus(tech, loc ? [{ ...loc, user_id: tech.id }] : [], jobs);
  const hasLoc = !!loc && st.key !== 'off' && st.key !== 'offline';

  return (
    <>
      <div className="dispatch-drawer-avatar-row">
        <div
          className="dispatch-drawer-avatar"
          style={{ background: avatarColor }}
          aria-hidden="true"
        >
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
          <span className="dispatch-drawer-stat-label" style={{ color: '#B45309' }}>
            Location stale
          </span>
          <span style={{ fontSize: 12, color: '#B45309' }}>
            GPS not updated recently
          </span>
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
            {nextJob.service_type} · {fmtTime(nextJob.scheduled_at)}
          </div>
        </div>
      )}

      <div className="dispatch-drawer-actions">
        {hasLoc && (
          <button type="button" className="dispatch-drawer-btn primary" onClick={onCenter}>
            Center Map
          </button>
        )}
        {tech.phone && (
          <a href={`tel:${tech.phone}`} className="dispatch-drawer-btn" aria-label={`Call ${tech.name}`}>
            Call
          </a>
        )}
        <a href="/team" className="dispatch-drawer-btn">
          Profile
        </a>
      </div>
    </>
  );
}

// ── Job detail view ───────────────────────────────────────────────────────────

function JobView({ job, jobTech, onCenter }) {
  const p        = getJobStatusPresentation(job.status);
  const sStyle   = { background: p.badgeBg, color: p.badgeColor };
  const sLabel   = p.label;
  const hasCoords = job.service_lat && job.service_lng;

  return (
    <>
      <div className="dispatch-drawer-job-header">
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

      <div className="dispatch-drawer-name" style={{ marginTop: 10 }}>
        {job.client_name}
      </div>
      <div className="dispatch-drawer-role">{job.service_type}</div>

      <div className="dispatch-drawer-divider" />

      <div className="dispatch-drawer-stat-row">
        <span className="dispatch-drawer-stat-label">Scheduled</span>
        <span style={{ fontSize: 12 }}>
          {fmtDate(job.scheduled_at)} {fmtTime(job.scheduled_at)}
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
          <span style={{ fontSize: 12 }}>
            ${(job.amount / 100).toFixed(2)}
          </span>
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

      <div className="dispatch-drawer-actions">
        {hasCoords && (
          <button type="button" className="dispatch-drawer-btn primary" onClick={onCenter}>
            Center Map
          </button>
        )}
        <a href="/jobs" className="dispatch-drawer-btn">
          Open Job
        </a>
      </div>
    </>
  );
}
