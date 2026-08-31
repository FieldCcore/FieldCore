import React, { useState, useEffect } from 'react';
import { Camera, Timer, MessageSquare, CheckCircle, CalendarDays } from 'lucide-react';
import { format, addMinutes } from 'date-fns';
import { formatDuration } from '../utils/normalizeJob';
import { formatTZ, resolveCalendarTimeZone, isValidTimezone } from '../utils/calendarTimezone';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from './StatusBadge';
import MultiDaySessionsPanel from './MultiDaySessionsPanel';

const SINGLE_DAY_STATUSES = ['scheduled', 'in_progress', 'complete', 'cancelled'];
const MULTI_DAY_STATUSES  = [
  'draft','unscheduled','scheduled','in_progress','paused',
  'awaiting_client','awaiting_parts','partially_completed',
  'ready_for_inspection','complete','cancelled',
];
const STATUS_COLORS = {
  scheduled:           '#8A90A2',
  in_progress:         '#2E7D32',
  partially_completed: '#2E7D32',
  paused:              '#D4A000',
  awaiting_client:     '#D4A000',
  awaiting_parts:      '#D4A000',
  ready_for_inspection:'#2E7D32',
  complete:            '#2E7D32',
  cancelled:           '#C62828',
  draft:               '#8A90A2',
  unscheduled:         '#8A90A2',
};

const PRIORITY_COLOR = { normal: '#5F667A', high: '#D4A000', urgent: '#DC2626' };
const PHOTO_CATS     = ['before', 'after', 'general'];

// ── No-show timing helpers ─────────────────────────────────────────────────────
function fmtRemaining(min) {
  const secs = Math.max(0, Math.round(min * 60));
  return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
}
function fmtOverdue(min) {
  const totalMin = Math.floor(min);
  if (totalMin < 60) return `${totalMin} min overdue`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m overdue` : `${h}h overdue`;
}
function fmtHistorical(min) {
  const days = Math.floor(min / 60 / 24);
  if (days < 1) return 'several hours ago';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export default function JobDetail({ job: initialJob, onClose, onStatusChange, onEdit, onDeleted, calendarTZ }) {
  // Display timezone: prefer the timezone the appointment was explicitly entered in,
  // then fall back to the calendar display timezone (business profile timezone).
  const inputTZValid = initialJob?.input_timezone && isValidTimezone(initialJob.input_timezone);
  const tz = inputTZValid
    ? initialJob.input_timezone
    : resolveCalendarTimeZone({ businessTimezone: calendarTZ }).timezone;
  const [job,           setJob]           = useState(initialJob);
  const [sessions,      setSessions]      = useState(initialJob.sessions || []);
  const [sessionsLoaded,setSessLoaded]    = useState(!!initialJob.sessions);

  // Sync enriched data when parent fetches full detail after calendar click.
  // Preserves local status/clock changes made via actions.
  useEffect(() => {
    setJob(prev => ({
      ...initialJob,
      // Keep locally-mutated fields so in-flight action updates aren't clobbered.
      status: prev.status,
      no_show_clock_started_at: prev.no_show_clock_started_at,
    }));
    if (initialJob.sessions?.length) {
      setSessions(initialJob.sessions);
      setSessLoaded(true);
    }
  }, [initialJob]); // eslint-disable-line react-hooks/exhaustive-deps
  const [updating,      setUpdating]      = useState(false);
  const [photos,        setPhotos]        = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [uploading,     setUploading]     = useState({ before: false, after: false, general: false });
  const [uploadError,   setUploadError]   = useState(null);
  const [clockStarted,  setClockStarted]  = useState(!!job.no_show_clock_started_at);
  const [clockTime,     setClockTime]     = useState(job.no_show_clock_started_at || null);
  const [startingClock, setStartingClock] = useState(false);
  const [smsSending,    setSmsSending]    = useState(null);
  const [smsResult,     setSmsResult]     = useState(null);
  const [tick,          setTick]          = useState(0);
  const [declaring,     setDeclaring]     = useState(false);
  const [arrived,       setArrived]       = useState(false);
  const [completing,    setCompleting]    = useState(false);
  // Delete modal state machine
  const [deleteStep,    setDeleteStep]    = useState(null);   // null | 'confirm-single' | 'confirm-multi' | 'scope' | 'preview'
  const [deleteScope,   setDeleteScope]   = useState(null);   // 'visit_only' | 'future' | 'entire' | `svc:${scheduleId}`
  const [deleteImpact,  setDeleteImpact]  = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [deleteError,   setDeleteError]   = useState(null);

  const { user, token } = useAuth();
  const isAdmin = user?.role === 'owner' || user?.role === 'manager';

  // ── Load sessions for multi-day jobs ────────────────────────────────────────
  useEffect(() => {
    if (!job.is_multi_day || sessionsLoaded) return;
    api.get(`/jobs/${job.id}/sessions`).then(r => {
      setSessions(r.data);
      setSessLoaded(true);
    }).catch(() => {});
  }, [job.id, job.is_multi_day, sessionsLoaded]);

  // ── Auto-load photos on open ────────────────────────────────────────────────
  useEffect(() => {
    setLoadingPhotos(true);
    api.get(`/mobile/jobs/${job.id}/photos`)
      .then(r => setPhotos(r.data))
      .catch(() => {})
      .finally(() => setLoadingPhotos(false));
  }, [job.id]);

  // ── No-show clock timing ────────────────────────────────────────────────────
  const graceMin    = parseFloat(job.grace_period_minutes) || 15;
  const clockMs     = clockTime ? new Date(clockTime).getTime() : NaN;
  const clockValid  = !isNaN(clockMs);
  const elapsedMin  = (clockStarted && clockValid) ? (Date.now() - clockMs) / 60000 : 0;
  const overdueMin  = elapsedMin - graceMin;
  const remainingMin = Math.max(-overdueMin, 0);
  const isOverdue   = clockStarted && clockValid && overdueMin > 0;
  const isHistorical = isOverdue && overdueMin > 24 * 60;
  const clockColor  = isOverdue ? '#dc2626' : '#D4A000';

  useEffect(() => {
    if (!clockStarted || !clockValid || isHistorical) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [clockStarted, clockTime, isHistorical]);

  // ── Status update ────────────────────────────────────────────────────────────
  async function updateStatus(status) {
    setUpdating(true);
    try {
      const res = await api.patch(`/jobs/${job.id}/status`, { status });
      setJob(prev => ({ ...prev, ...res.data }));
      onStatusChange(res.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not update status.');
    } finally {
      setUpdating(false);
    }
  }

  async function completeOverallJob() {
    if (!window.confirm('Mark this entire multi-day job as COMPLETE? This will generate the invoice.')) return;
    setCompleting(true);
    try {
      const res = await api.post(`/jobs/${job.id}/complete`);
      setJob(prev => ({ ...prev, ...res.data }));
      onStatusChange(res.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not complete job.');
    } finally {
      setCompleting(false);
    }
  }

  // ── Delete modal helpers ──────────────────────────────────────────────────────
  function openDeleteModal() {
    setDeleteError(null);
    setDeleteScope(null);
    setDeleteImpact(null);
    if (job.agreement_id) setDeleteStep('scope');
    else if (job.is_multi_day) setDeleteStep('confirm-multi');
    else setDeleteStep('confirm-single');
  }

  function closeDeleteModal() {
    setDeleteStep(null);
    setDeleteScope(null);
    setDeleteImpact(null);
    setDeleteError(null);
  }

  async function fetchDeleteImpact() {
    if (!deleteScope) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const r = await api.get(`/jobs/${job.id}/delete-impact?scope=${deleteScope}`);
      setDeleteImpact(r.data);
      setDeleteStep('preview');
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Could not load impact. Try again.');
    } finally {
      setDeleteLoading(false);
    }
  }

  async function confirmDeleteJob() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/jobs/${job.id}`);
      onDeleted?.(job.id);
      onClose();
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Could not delete job.');
      setDeleting(false);
    }
  }

  async function confirmRecurringDelete() {
    setDeleting(true);
    setDeleteError(null);
    const scope = deleteImpact?.scope || deleteScope;
    try {
      if (scope === 'visit_only') {
        await api.delete(`/jobs/${job.id}`);
      } else if (scope === 'future' || scope === 'entire') {
        await api.post(`/jobs/${job.id}/delete-recurring`, { scope });
      } else if (scope?.startsWith('svc:')) {
        await api.delete(`/jobs/${job.id}/occurrences/${scope.slice(4)}`);
      }
      onDeleted?.(job.id);
      onClose();
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Could not complete deletion.');
      setDeleting(false);
    }
  }

  // ── No-show actions ───────────────────────────────────────────────────────────
  async function startNoshowClock() {
    setStartingClock(true);
    try {
      navigator.geolocation?.getCurrentPosition(
        async pos => {
          const r = await api.post(`/no-show/jobs/${job.id}/start`, {
            lat: pos.coords.latitude, lng: pos.coords.longitude,
          });
          setClockStarted(true);
          setClockTime(r.data.clock_started_at);
          setStartingClock(false);
        },
        async () => {
          const r = await api.post(`/no-show/jobs/${job.id}/start`, {});
          setClockStarted(true);
          setClockTime(r.data.clock_started_at);
          setStartingClock(false);
        }
      );
    } catch (err) {
      alert(err.response?.data?.error || 'Could not start clock.');
      setStartingClock(false);
    }
  }

  async function declareNoShow() {
    if (!job?.id) return;
    setDeclaring(true);
    try {
      const res = await fetch(`/api/no-show/jobs/${job.id}/declare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ jobId: job.id }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Failed to declare no-show.'); setDeclaring(false); return; }
      onStatusChange({ ...job, status: 'no_show' });
      onClose();
    } catch {
      alert('Network error — could not declare no-show.');
      setDeclaring(false);
    }
  }

  async function clientArrived() {
    setArrived(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status: 'in_progress' }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Could not update status.'); setArrived(false); return; }
      onStatusChange(data);
      onClose();
    } catch {
      alert('Network error.');
      setArrived(false);
    }
  }

  // ── Photo actions ─────────────────────────────────────────────────────────────
  async function handlePhotoUpload(e, category) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(prev => ({ ...prev, [category]: true }));
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      fd.append('category', category);
      const r = await api.post(`/mobile/jobs/${job.id}/photos`, fd);
      setPhotos(prev => [...prev, r.data]);
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Upload failed. Try again.');
    } finally {
      setUploading(prev => ({ ...prev, [category]: false }));
    }
  }

  async function deletePhoto(photoId) {
    if (!window.confirm('Remove this photo?')) return;
    try {
      await api.delete(`/mobile/jobs/${job.id}/photos/${photoId}`);
      setPhotos(prev => prev.filter(p => p.id !== photoId));
    } catch (err) {
      alert(err.response?.data?.error || 'Could not remove photo.');
    }
  }

  // ── SMS ───────────────────────────────────────────────────────────────────────
  async function sendTemplate(template) {
    if (!job.client_id) return;
    setSmsSending(template);
    setSmsResult(null);
    try {
      await api.post('/sms/send-template', { client_id: job.client_id, template, job_id: job.id });
      setSmsResult({ ok: true, message: template === 'confirmation' ? 'Confirmation sent!' : 'Reminder sent!' });
    } catch (err) {
      setSmsResult({ ok: false, message: err.response?.data?.error || 'SMS failed.' });
    } finally {
      setSmsSending(null);
      setTimeout(() => setSmsResult(null), 4000);
    }
  }

  const statusList = job.is_multi_day ? MULTI_DAY_STATUSES : SINGLE_DAY_STATUSES;
  const completedSessions = sessions.filter(s => s.status === 'completed_for_day').length;
  const nextSession = sessions.find(s => !['completed_for_day','cancelled'].includes(s.status));

  // ── Address formatting ────────────────────────────────────────────────────────
  const addressLine1 = job.service_address || '';
  const addressLine2 = [job.service_city, job.service_state].filter(Boolean).join(', ')
    + (job.service_zip ? ` ${job.service_zip}` : '');
  const mapsQuery = encodeURIComponent(
    [job.service_address, job.service_city, job.service_state].filter(Boolean).join(', ')
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* ── Header: client name → service name ── */}
      <div className="modal-header" style={{ alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          <h2 style={{ margin: 0, lineHeight: 1.2 }}>
            {job.client_name || job.title || job.service_type}
          </h2>
          {job.client_name && (job.service_type || job.title) && (
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--slate)', marginBottom: 2 }}>
              {job.service_type || job.title}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            {job.is_multi_day && (
              <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--off)', color: 'var(--slate)',
                padding: '2px 8px', borderRadius: 99, letterSpacing: '.04em', border: '1px solid var(--lightgray)' }}>
                MULTI-DAY
              </span>
            )}
            {job.priority && job.priority !== 'normal' && (
              <span style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLOR[job.priority],
                background: job.priority === 'urgent' ? '#fef2f2' : 'var(--yellow-lt)',
                padding: '2px 8px', borderRadius: 99 }}>
                {job.priority.toUpperCase()}
              </span>
            )}
          </div>
          <StatusBadge status={job.status} />
        </div>
        <button className="btn-close" onClick={onClose}>×</button>
      </div>

      <div className="modal-body">

        {/* ── SERVICE LOCATION ─────────────────────────────────────────────────── */}
        <div className="jd-section">
          <div className="jd-section-label">Service Location</div>
          {addressLine1 ? (
            <div style={{ marginTop: 6 }}>
              {job.location_label && (
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginBottom: 2 }}>
                  {job.location_label}
                </div>
              )}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
                target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--sand)', textDecoration: 'none', fontSize: 13 }}
              >
                <span style={{ display: 'block' }}>{addressLine1}</span>
                {addressLine2 && <span style={{ display: 'block' }}>{addressLine2}</span>}
              </a>
              {job.location_access_instructions && (
                <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 4, fontStyle: 'italic' }}>
                  {job.location_access_instructions}
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>No service address on file</div>
          )}
        </div>

        {/* ── SCHEDULE ────────────────────────────────────────────────────────── */}
        <div className="jd-section">
          <div className="jd-section-label">Schedule</div>
          <div className="job-detail-body" style={{ marginTop: 6 }}>
            {job.is_multi_day ? (
              <>
                {(job.estimated_start_date || job.estimated_end_date) && (
                  <div className="detail-row">
                    <label>Date Range</label>
                    <span>
                      {job.estimated_start_date ? format(new Date(job.estimated_start_date + 'T12:00:00'), 'MMM d') : '?'}
                      {' – '}
                      {job.end_date_unknown ? 'TBD' : job.estimated_end_date ? format(new Date(job.estimated_end_date + 'T12:00:00'), 'MMM d, yyyy') : 'TBD'}
                    </span>
                  </div>
                )}
                {nextSession && (
                  <div className="detail-row">
                    <label>Next Session</label>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <CalendarDays size={12} />
                      {format(new Date(nextSession.scheduled_date + 'T12:00:00'), 'MMM d, yyyy')}
                      {nextSession.start_time && ` at ${nextSession.start_time.slice(0,5)}`}
                    </span>
                  </div>
                )}
                <div className="detail-row">
                  <label>Sessions</label>
                  <span>{completedSessions} of {sessions.length} completed</span>
                </div>
                <div className="detail-row">
                  <label>Progress</label>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 6, background: 'var(--lightgray)', borderRadius: 99, overflow: 'hidden', minWidth: 80 }}>
                      <div style={{ height: '100%', width: `${job.overall_completion_pct || 0}%`, background: 'var(--sand)', borderRadius: 99 }} />
                    </div>
                    <span style={{ fontWeight: 700 }}>{job.overall_completion_pct || 0}%</span>
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="detail-row">
                  <label>Start</label>
                  <span>
                    {job.scheduled_at ? formatTZ(new Date(job.scheduled_at), 'MMM d, yyyy h:mm a', tz) : '—'}
                    {job.scheduled_at && (
                      <span style={{ fontSize: 11, color: 'var(--steel)', marginLeft: 6 }}>
                        {tz.split('/').pop().replace(/_/g, ' ')}
                      </span>
                    )}
                  </span>
                </div>
                {job.scheduled_at && job.duration_minutes ? (
                  <div className="detail-row">
                    <label>End</label>
                    <span>{formatTZ(addMinutes(new Date(job.scheduled_at), job.duration_minutes), 'h:mm a', tz)}</span>
                  </div>
                ) : null}
                {job.duration_minutes ? (
                  <div className="detail-row">
                    <label>Duration</label>
                    <span>{formatDuration(job.duration_minutes)}</span>
                  </div>
                ) : null}
                {job.recurring && job.recurring !== 'none' && (
                  <div className="detail-row">
                    <label>Recurrence</label>
                    <span style={{ textTransform: 'capitalize' }}>{job.recurring}</span>
                  </div>
                )}
              </>
            )}
            {job.checkin_at && (
              <div className="detail-row">
                <label>Check-in</label>
                <span>
                  {formatTZ(new Date(job.checkin_at), 'h:mm a', tz)}
                  {job.checkin_lat ? ` · ${parseFloat(job.checkin_lat).toFixed(4)}, ${parseFloat(job.checkin_lng).toFixed(4)}` : ''}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── ASSIGNED TEAM ────────────────────────────────────────────────────── */}
        <div className="jd-section">
          <div className="jd-section-label">Assigned Team</div>
          {job.team?.length > 0 ? (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {job.team.map(m => (
                <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ fontWeight: m.is_primary ? 700 : 400, color: 'var(--navy)' }}>{m.member_name}</span>
                  {m.is_primary && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--slate)', background: 'var(--off)', border: '1px solid var(--lightgray)', borderRadius: 99, padding: '1px 7px', letterSpacing: '.04em' }}>LEAD</span>
                  )}
                  {m.assignment_role && m.assignment_role !== 'lead_technician' && (
                    <span style={{ fontSize: 11, color: 'var(--steel)', textTransform: 'capitalize' }}>{m.assignment_role.replace(/_/g, ' ')}</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
              Unassigned
            </div>
          )}
        </div>

        {/* ── SERVICES ─────────────────────────────────────────────────────────── */}
        <div className="jd-section">
          <div className="jd-section-label">Services</div>
          {job.services?.length > 0 ? (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {job.services.map((svc, idx) => (
                <div key={svc.id || idx} style={{
                  padding: '10px 12px', borderRadius: 8,
                  border: '1px solid var(--lightgray)', background: 'var(--off)',
                }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>{svc.service_name}</div>
                  {svc.asset_label && (
                    <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 2 }}>
                      {svc.asset_label}
                    </div>
                  )}
                  {svc.description && (
                    <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 3, whiteSpace: 'pre-wrap' }}>{svc.description}</div>
                  )}
                  <div style={{ display: 'flex', gap: 12, marginTop: svc.description || svc.asset_label ? 5 : 3, flexWrap: 'wrap' }}>
                    {svc.schedule_preferred_start_time && (
                      <span style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 600 }}>
                        {svc.schedule_preferred_start_time}
                        {svc.duration_minutes ? ` · ${formatDuration(svc.duration_minutes)}` : ''}
                      </span>
                    )}
                    {!svc.schedule_preferred_start_time && svc.duration_minutes && (
                      <span style={{ fontSize: 11, color: 'var(--steel)' }}>{formatDuration(svc.duration_minutes)}</span>
                    )}
                    {svc.schedule_cadence && (
                      <span style={{ fontSize: 11, color: 'var(--steel)', textTransform: 'capitalize' }}>
                        {svc.schedule_cadence.replace(/_/g, ' ')}
                      </span>
                    )}
                    {isAdmin && svc.price_cents != null && (
                      <span style={{ fontSize: 11, color: 'var(--steel)' }}>${(svc.price_cents / 100).toFixed(2)}</span>
                    )}
                    {svc.is_complete && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a' }}>✓ Done</span>
                    )}
                  </div>
                  {svc.service_notes && (
                    <div style={{ fontSize: 12, color: 'var(--navy)', marginTop: 5, padding: '5px 8px', background: '#fffbeb', borderRadius: 5, border: '1px solid #fde68a' }}>
                      {svc.service_notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            // Fallback: show service_type as single service when no job_services records
            <div style={{ marginTop: 6, fontSize: 13, color: job.service_type ? 'var(--navy)' : 'var(--steel)' }}>
              {job.service_type || 'No services listed'}
              {job.is_multi_day && job.title && job.service_type !== job.title && (
                <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 2 }}>{job.service_type}</div>
              )}
            </div>
          )}
        </div>

        {/* ── ASSETS / SERVICE FOR ─────────────────────────────────────────────── */}
        {job.assets?.length > 0 && (
          <div className="jd-section">
            <div className="jd-section-label">Assets / Service For</div>
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {job.assets.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600, color: 'var(--navy)' }}>{a.name}</span>
                    {a.description && <span style={{ fontSize: 12, color: 'var(--slate)', marginLeft: 6 }}>{a.description}</span>}
                    {a.identifier && <span style={{ fontSize: 11, color: 'var(--steel)', display: 'block' }}>{a.identifier}</span>}
                    {a.notes && <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 2 }}>{a.notes}</div>}
                  </div>
                  {a.status && a.status !== 'pending' && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: a.status === 'completed' ? '#dcfce7' : 'var(--off)', color: a.status === 'completed' ? '#15803d' : 'var(--slate)' }}>
                      {a.status}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── INSTRUCTIONS ─────────────────────────────────────────────────────── */}
        {(job.instructions || job.notes) && (
          <div className="jd-section">
            <div className="jd-section-label">Instructions</div>
            {job.instructions && (
              <div style={{ fontSize: 13, color: 'var(--navy)', marginTop: 6, whiteSpace: 'pre-wrap' }}>
                {job.instructions}
              </div>
            )}
            {job.notes && job.notes !== job.instructions && (
              <div style={{ fontSize: 13, color: 'var(--slate)', marginTop: job.instructions ? 8 : 6, whiteSpace: 'pre-wrap' }}>
                {isAdmin ? (
                  <><span style={{ fontSize: 10, fontWeight: 700, color: 'var(--steel)', letterSpacing: '.05em', display: 'block', marginBottom: 2 }}>INTERNAL NOTES</span>{job.notes}</>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* ── SCOPE OF WORK (multi-day) / DESCRIPTION ─────────────────────────── */}
        {(job.scope_of_work || job.description) && (
          <div className="jd-section">
            {job.scope_of_work && (
              <div className="detail-row"><label>Approved Scope</label><span style={{ whiteSpace: 'pre-wrap' }}>{job.scope_of_work}</span></div>
            )}
            {job.description && (
              <div className="detail-row"><label>Description</label><span style={{ whiteSpace: 'pre-wrap' }}>{job.description}</span></div>
            )}
          </div>
        )}

        {/* ── BILLING (admin/manager only) ─────────────────────────────────────── */}
        {isAdmin && (job.amount || job.billing_method) && (
          <div className="jd-section">
            <div className="jd-section-label">Billing</div>
            <div className="job-detail-body" style={{ marginTop: 6 }}>
              {job.amount && (
                <div className="detail-row">
                  <label>Amount</label>
                  <span>${parseFloat(job.amount).toFixed(2)}</span>
                </div>
              )}
              {job.billing_method && job.billing_method !== 'fixed' && (
                <div className="detail-row">
                  <label>Method</label>
                  <span style={{ textTransform: 'capitalize' }}>{job.billing_method.replace('_', ' ')}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Multi-day sessions panel ── */}
        {job.is_multi_day && (
          <MultiDaySessionsPanel
            job={job}
            sessions={sessions}
            onSessionsChange={setSessions}
            isAdmin={isAdmin}
          />
        )}

        {/* ── Photos — Before / After / General ── */}
        <div className="jd-section">
          <div className="jd-section-label"><Camera size={10} />Photos</div>

          {/* Category rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {PHOTO_CATS.map(cat => {
              const catPhotos = photos.filter(p => (p.photo_category || 'general') === cat);
              const catLabel  = cat.charAt(0).toUpperCase() + cat.slice(1);
              return (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, minWidth: 48 }}>{catLabel}</span>
                  <span style={{ fontSize: 12, color: 'var(--steel)', flex: 1 }}>
                    {loadingPhotos ? '…' : `${catPhotos.length} ${catPhotos.length === 1 ? 'photo' : 'photos'}`}
                  </span>
                  <label style={{ cursor: uploading[cat] ? 'wait' : 'pointer', display: 'inline-flex' }}>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={e => handlePhotoUpload(e, cat)}
                      disabled={!!uploading[cat]}
                      aria-label={`Upload ${catLabel} photo`}
                    />
                    <span
                      className="btn-secondary"
                      style={{ fontSize: 11, padding: '3px 10px', pointerEvents: 'none',
                        opacity: uploading[cat] ? 0.6 : 1 }}
                    >
                      {uploading[cat] ? 'Uploading…' : '+ Upload'}
                    </span>
                  </label>
                </div>
              );
            })}
          </div>

          {uploadError && (
            <div role="alert" style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{uploadError}</div>
          )}

          {/* Photo grids grouped by category */}
          {!loadingPhotos && photos.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {PHOTO_CATS.map(cat => {
                const catPhotos = photos.filter(p => (p.photo_category || 'general') === cat);
                if (!catPhotos.length) return null;
                return (
                  <div key={cat} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--steel)',
                      textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>
                      {cat}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: 5 }}>
                      {catPhotos.map(p => (
                        <div key={p.id} style={{ position: 'relative' }}>
                          <a href={p.url} target="_blank" rel="noreferrer">
                            <img
                              src={p.url}
                              alt={`${cat} photo`}
                              style={{ width: '100%', aspectRatio: '1', objectFit: 'cover',
                                borderRadius: 5, border: '1px solid var(--lightgray)', display: 'block' }}
                            />
                          </a>
                          {isAdmin && (
                            <button
                              onClick={() => deletePhoto(p.id)}
                              aria-label="Remove photo"
                              style={{ position: 'absolute', top: 2, right: 2,
                                background: 'rgba(0,0,0,0.55)', color: '#fff',
                                border: 'none', borderRadius: 3, width: 18, height: 18,
                                fontSize: 11, lineHeight: 1, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                            >×</button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loadingPhotos && photos.length === 0 && (
            <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>No photos uploaded yet.</p>
          )}
        </div>

        {/* ── No-show grace period clock (single-day only) ── */}
        {!job.is_multi_day && job.status === 'scheduled' && (
          <div className="jd-section" style={{
            borderColor: clockStarted && clockValid ? (isOverdue ? '#fca5a5' : '#fde68a') : 'var(--lightgray)',
            background:  clockStarted && clockValid ? (isOverdue ? '#fef2f2' : 'var(--yellow-lt)') : 'var(--off)',
          }}>
            {!clockStarted ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--steel)' }}>Client not present? Start the grace period clock.</div>
                <button className="btn-secondary"
                  style={{ fontSize: 11, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', flexShrink: 0 }}
                  onClick={startNoshowClock} disabled={startingClock}>
                  <Timer size={11} />{startingClock ? 'Starting…' : 'Start Clock'}
                </button>
              </div>
            ) : !clockValid ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Timer size={14} style={{ color: 'var(--steel)', flexShrink: 0 }} />
                <div style={{ fontSize: 12, color: 'var(--steel)' }}>No-show timing unavailable.</div>
              </div>
            ) : isHistorical ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <Timer size={14} style={{ color: '#dc2626', flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#7f1d1d' }}>No-show unresolved</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#dc2626', marginTop: 3 }}>
                    Expired {fmtHistorical(overdueMin)}
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button onClick={declareNoShow} disabled={declaring || arrived}
                        style={{ fontSize: 11, padding: '5px 12px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, cursor: declaring ? 'wait' : 'pointer', fontWeight: 700, opacity: (declaring || arrived) ? 0.6 : 1 }}>
                        {declaring ? 'Declaring…' : 'Declare No-Show'}
                      </button>
                      <button onClick={clientArrived} disabled={declaring || arrived} className="btn-secondary"
                        style={{ fontSize: 11, padding: '5px 12px' }}>
                        {arrived ? 'Updating…' : 'Client Arrived'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <Timer size={14} style={{ color: clockColor, flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: isOverdue ? '#7f1d1d' : 'var(--yellow)' }}>
                    No-show clock {isOverdue ? 'expired' : 'running'}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: clockColor, fontFamily: 'DM Mono, monospace', marginTop: 3, letterSpacing: '.04em' }}>
                    {isOverdue ? fmtOverdue(overdueMin) : `${fmtRemaining(remainingMin)} remaining`}
                  </div>
                  {isAdmin && job.checkin_lat && (
                    <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 5 }}>
                      Tech GPS: {parseFloat(job.checkin_lat).toFixed(4)}°, {parseFloat(job.checkin_lng || 0).toFixed(4)}°
                      {job.checkin_at ? ` · Arrived ${formatTZ(new Date(job.checkin_at), 'h:mm a', tz)}` : ''}
                    </div>
                  )}
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button onClick={declareNoShow} disabled={declaring || arrived || !isOverdue}
                        style={{ fontSize: 11, padding: '5px 12px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, cursor: (declaring || !isOverdue) ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: (declaring || arrived || !isOverdue) ? 0.6 : 1 }}>
                        {declaring ? 'Declaring…' : 'Declare No-Show'}
                      </button>
                      <button onClick={clientArrived} disabled={declaring || arrived} className="btn-secondary"
                        style={{ fontSize: 11, padding: '5px 12px' }}>
                        {arrived ? 'Updating…' : 'Client Arrived'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SMS templates ── */}
        {(job.status === 'scheduled' || job.status === 'in_progress') && job.client_id && (
          <div className="jd-section">
            <div className="jd-section-label"><MessageSquare size={10} />SMS</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-secondary"
                style={{ fontSize: 11, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
                onClick={() => sendTemplate('confirmation')} disabled={!!smsSending}>
                <MessageSquare size={11} />{smsSending === 'confirmation' ? 'Sending…' : 'Send Confirmation'}
              </button>
              <button className="btn-secondary"
                style={{ fontSize: 11, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
                onClick={() => sendTemplate('reminder')} disabled={!!smsSending}>
                <MessageSquare size={11} />{smsSending === 'reminder' ? 'Sending…' : 'Send Reminder'}
              </button>
            </div>
            {smsResult && (
              <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: smsResult.ok ? '#16a34a' : '#dc2626' }}>
                {smsResult.message}
              </div>
            )}
          </div>
        )}

        {/* ── Status update ── */}
        {isAdmin && (
          <div className="job-status-section">
            <p className="status-label">Update Status</p>
            <div className="status-buttons">
              {statusList.map(s => (
                <button key={s} disabled={job.status === s || updating || (s === 'complete' && job.is_multi_day)}
                  className="status-btn"
                  style={{
                    background: job.status === s ? STATUS_COLORS[s] || '#1C2333' : '#f1f5f9',
                    color:      job.status === s ? '#fff' : '#475569',
                    opacity:    (updating || (s === 'complete' && job.is_multi_day)) ? 0.4 : 1,
                    cursor:     (s === 'complete' && job.is_multi_day) ? 'not-allowed' : 'pointer',
                  }}
                  onClick={() => updateStatus(s)}
                >
                  {s.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Multi-day: complete overall job ── */}
        {job.is_multi_day && isAdmin && job.status !== 'complete' && job.status !== 'cancelled' && (
          <div className="jd-section" style={{ background: '#f0fdf4', borderColor: '#86efac' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#166534', marginBottom: 8 }}>
              Ready to close out this project?
            </div>
            <div style={{ fontSize: 12, color: '#166534', marginBottom: 12 }}>
              This will mark the overall job complete and generate the invoice.
              Sessions already completed will remain in their current state.
            </div>
            <button
              onClick={completeOverallJob}
              disabled={completing}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#16a34a',
                color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px',
                fontSize: 13, fontWeight: 700, cursor: completing ? 'wait' : 'pointer',
                opacity: completing ? 0.7 : 1 }}>
              <CheckCircle size={15} />
              {completing ? 'Completing…' : 'Complete Overall Job'}
            </button>
          </div>
        )}

        {/* ── ACTION ROW: Edit · Open · Delete (one horizontal bar) ─────────── */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={onEdit}>Edit Job</button>
          <button
            className="btn-secondary"
            onClick={() => window.open(`/jobs?job=${job.id}`, '_blank', 'noopener')}
            title="Open this job with a shareable URL"
          >
            Open Job ↗
          </button>
          {isAdmin && job.status !== 'complete' && (
            <button
              className="btn-void"
              style={{ marginLeft: 'auto' }}
              onClick={openDeleteModal}
            >
              {job.agreement_id
                ? 'Delete This Visit'
                : job.is_multi_day
                  ? 'Delete Multi-Day Job'
                  : 'Delete Job'
              }
            </button>
          )}
        </div>
      </div>

      {/* ── DELETE MODAL ──────────────────────────────────────────────────────── */}
      {deleteStep && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={closeDeleteModal}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 460, width: '100%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.18)', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >

            {/* ── Single-day confirmation ── */}
            {deleteStep === 'confirm-single' && (
              <>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 16 }}>Delete job?</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                  <div style={{ fontSize: 13, color: 'var(--slate)' }}><span style={{ fontWeight: 600 }}>Client: </span>{job.client_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--slate)' }}><span style={{ fontWeight: 600 }}>Date: </span>{job.scheduled_at ? format(new Date(job.scheduled_at), 'MMMM d, yyyy') : '—'}</div>
                  <div style={{ fontSize: 13, color: 'var(--slate)' }}><span style={{ fontWeight: 600 }}>Service: </span>{job.service_type || '—'}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 20 }}>
                  This job will be removed from the Calendar.
                </div>
                {deleteError && <div style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600, marginBottom: 12 }}>{deleteError}</div>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn-secondary" onClick={closeDeleteModal} disabled={deleting}>Cancel</button>
                  <button className="btn-void" onClick={confirmDeleteJob} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete Job'}</button>
                </div>
              </>
            )}

            {/* ── Multi-day confirmation ── */}
            {deleteStep === 'confirm-multi' && (
              <>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 16 }}>Delete multi-day job?</div>
                <div style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 20, lineHeight: 1.6 }}>
                  {sessions.length > 0
                    ? <>This job contains <strong>{sessions.length} work session{sessions.length !== 1 ? 's' : ''}</strong>. Deleting will remove all <strong>{sessions.filter(s => !['completed_for_day', 'cancelled'].includes(s.status)).length} eligible session{sessions.filter(s => !['completed_for_day', 'cancelled'].includes(s.status)).length !== 1 ? 's' : ''}</strong> from the Calendar.</>
                    : 'This multi-day job will be removed from the Calendar.'
                  }
                </div>
                {deleteError && <div style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600, marginBottom: 12 }}>{deleteError}</div>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn-secondary" onClick={closeDeleteModal} disabled={deleting}>Cancel</button>
                  <button className="btn-void" onClick={confirmDeleteJob} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete Multi-Day Job'}</button>
                </div>
              </>
            )}

            {/* ── Recurring scope selector ── */}
            {deleteStep === 'scope' && (
              <>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>Delete recurring service</div>
                <div style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 20 }}>Choose what you want to delete.</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                  {[
                    {
                      key: 'visit_only',
                      title: 'This visit only',
                      desc: `${job.scheduled_at ? format(new Date(job.scheduled_at), 'MMMM d') : 'This date'} only. Future visits continue normally.`,
                    },
                    {
                      key: 'future',
                      title: 'This and future visits',
                      desc: `${job.scheduled_at ? format(new Date(job.scheduled_at), 'MMMM d') : 'This date'} and all upcoming scheduled visits. Past history remains.`,
                    },
                    {
                      key: 'entire',
                      title: 'Entire recurring service',
                      desc: 'End this recurring service and remove all eligible upcoming visits. Completed work and financial history remain.',
                    },
                    ...(job.services?.filter(s => s.agreement_schedule_id).length > 1
                      ? job.services.filter(s => s.agreement_schedule_id).map(svc => ({
                          key: `svc:${svc.agreement_schedule_id}`,
                          title: `Remove ${svc.service_name} from this visit`,
                          desc: `${svc.service_name}${svc.asset_label ? ` (${svc.asset_label})` : ''} removed from this date only. Other services and future occurrences are not affected.`,
                        }))
                      : []),
                  ].map(opt => (
                    <label key={opt.key} style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px',
                      borderRadius: 8, border: `1.5px solid ${deleteScope === opt.key ? 'var(--navy)' : 'var(--lightgray)'}`,
                      background: deleteScope === opt.key ? 'var(--off)' : '#fff',
                      cursor: 'pointer', transition: 'border-color .15s, background .15s',
                    }}>
                      <input type="radio" name="del-scope" value={opt.key}
                        checked={deleteScope === opt.key}
                        onChange={() => setDeleteScope(opt.key)}
                        style={{ marginTop: 3, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 3 }}>{opt.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--slate)' }}>{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
                {deleteError && <div style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600, marginBottom: 12 }}>{deleteError}</div>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn-secondary" onClick={closeDeleteModal}>Cancel</button>
                  <button className="btn-primary" disabled={!deleteScope || deleteLoading} onClick={fetchDeleteImpact}>
                    {deleteLoading ? 'Loading…' : 'Continue'}
                  </button>
                </div>
              </>
            )}

            {/* ── Impact preview + final confirm ── */}
            {deleteStep === 'preview' && deleteImpact && (
              <>
                {deleteImpact.scope === 'visit_only' && (
                  <>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 16 }}>Delete this visit?</div>
                    {deleteImpact.service_details?.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--steel)', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 6 }}>
                          This appointment contains
                        </div>
                        {deleteImpact.service_details.map((svc, i) => (
                          <div key={i} style={{ fontSize: 13, color: 'var(--navy)', padding: '5px 0', borderBottom: '1px solid var(--lightgray)' }}>
                            {svc.service_name}{svc.asset_label ? ` — ${svc.asset_label}` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 20, lineHeight: 1.6 }}>
                      <strong>{deleteImpact.services} scheduled service{deleteImpact.services !== 1 ? 's' : ''}</strong>{' '}
                      will be removed for{' '}
                      {deleteImpact.from_date ? format(new Date(deleteImpact.from_date + 'T12:00:00'), 'MMMM d') : 'this date'}.
                      Future recurring visits will continue.
                    </div>
                  </>
                )}

                {deleteImpact.scope === 'future' && (
                  <>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 16 }}>Delete this and future visits?</div>
                    <div style={{ padding: '12px 14px', background: 'var(--off)', borderRadius: 8, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 13, color: 'var(--navy)' }}><strong>{deleteImpact.appointments}</strong> upcoming appointment{deleteImpact.appointments !== 1 ? 's' : ''}</div>
                      <div style={{ fontSize: 13, color: 'var(--navy)' }}><strong>{deleteImpact.services}</strong> scheduled service occurrence{deleteImpact.services !== 1 ? 's' : ''}</div>
                      <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 2 }}>
                        Beginning {deleteImpact.from_date ? format(new Date(deleteImpact.from_date + 'T12:00:00'), 'MMMM d, yyyy') : ''}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 20 }}>Completed appointments and protected financial history will remain.</div>
                  </>
                )}

                {deleteImpact.scope === 'entire' && (
                  <>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 16 }}>End recurring service?</div>
                    {deleteImpact.agreement_name && (
                      <div style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 12 }}>
                        <span style={{ fontWeight: 600 }}>Recurring Service: </span>{deleteImpact.agreement_name}
                      </div>
                    )}
                    <div style={{ padding: '12px 14px', background: 'var(--off)', borderRadius: 8, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 13, color: 'var(--navy)' }}>End the recurring agreement</div>
                      <div style={{ fontSize: 13, color: 'var(--navy)' }}>Remove <strong>{deleteImpact.appointments}</strong> eligible upcoming appointment{deleteImpact.appointments !== 1 ? 's' : ''}</div>
                      <div style={{ fontSize: 13, color: 'var(--navy)' }}>Remove <strong>{deleteImpact.services}</strong> scheduled service occurrence{deleteImpact.services !== 1 ? 's' : ''}</div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 20 }}>Historical completed work, invoices, and payments will remain.</div>
                  </>
                )}

                {deleteImpact.scope?.startsWith('svc:') && (() => {
                  const svc = job.services?.find(s => s.agreement_schedule_id === deleteImpact.scope.slice(4));
                  return (
                    <>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 16 }}>
                        Remove {svc?.service_name || 'service'} from this visit?
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 20, lineHeight: 1.6 }}>
                        {svc?.service_name}{svc?.asset_label ? ` (${svc.asset_label})` : ''} will be removed from{' '}
                        {job.scheduled_at ? format(new Date(job.scheduled_at), 'MMMM d') : 'this date'} only.
                        The remaining services in this visit and all future recurring occurrences are not affected.
                      </div>
                    </>
                  );
                })()}

                {deleteError && <div style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600, marginBottom: 12 }}>{deleteError}</div>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn-secondary" onClick={() => { setDeleteStep('scope'); setDeleteError(null); }} disabled={deleting}>Back</button>
                  <button className="btn-void" onClick={confirmRecurringDelete} disabled={deleting}>
                    {deleting ? 'Removing…' : (
                      deleteImpact.scope === 'visit_only' ? 'Delete Visit' :
                      deleteImpact.scope === 'future'     ? 'Delete Future Visits' :
                      deleteImpact.scope === 'entire'     ? 'End Recurring Service' :
                                                            'Remove Service'
                    )}
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
