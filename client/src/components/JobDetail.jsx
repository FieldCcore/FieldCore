import React, { useState, useEffect } from 'react';
import { Camera, Timer, MessageSquare, CheckCircle, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
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

export default function JobDetail({ job: initialJob, onClose, onStatusChange, onEdit }) {
  const [job,           setJob]           = useState(initialJob);
  const [sessions,      setSessions]      = useState(initialJob.sessions || []);
  const [sessionsLoaded,setSessLoaded]    = useState(!!initialJob.sessions);
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
        {/* ── Core detail rows ── */}
        <div className="job-detail-body">
          <div className="detail-row">
            <label>{job.is_multi_day ? 'Job Manager' : 'Tech'}</label>
            <span>{job.job_manager_name || job.tech_name || 'Unassigned'}</span>
          </div>

          {job.is_multi_day ? (
            <>
              <div className="detail-row">
                <label>Progress</label>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 6, background: 'var(--lightgray)', borderRadius: 99, overflow: 'hidden', minWidth: 80 }}>
                    <div style={{ height: '100%', width: `${job.overall_completion_pct || 0}%`,
                      background: 'var(--sand)', borderRadius: 99 }} />
                  </div>
                  <span style={{ fontWeight: 700 }}>{job.overall_completion_pct || 0}%</span>
                </span>
              </div>
              <div className="detail-row">
                <label>Sessions</label>
                <span>{completedSessions} of {sessions.length} completed</span>
              </div>
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
              {job.billing_method && job.billing_method !== 'fixed' && (
                <div className="detail-row">
                  <label>Billing</label>
                  <span style={{ textTransform: 'capitalize' }}>{job.billing_method.replace('_', ' ')}</span>
                </div>
              )}
            </>
          ) : (
            <div className="detail-row">
              <label>Scheduled</label>
              <span>{job.scheduled_at ? format(new Date(job.scheduled_at), 'MMM d, yyyy h:mm a') : '—'}</span>
            </div>
          )}

          {/* Financial — owner / manager only */}
          {isAdmin && job.amount && (
            <div className="detail-row">
              <label>Amount</label>
              <span>${parseFloat(job.amount).toFixed(2)}</span>
            </div>
          )}

          {!job.is_multi_day && job.recurring && job.recurring !== 'none' && (
            <div className="detail-row">
              <label>Recurring</label>
              <span style={{ textTransform: 'capitalize' }}>{job.recurring}</span>
            </div>
          )}

          {job.checkin_at && (
            <div className="detail-row">
              <label>Check-in</label>
              <span>
                {format(new Date(job.checkin_at), 'h:mm a')}
                {job.checkin_lat ? ` · ${parseFloat(job.checkin_lat).toFixed(4)}, ${parseFloat(job.checkin_lng).toFixed(4)}` : ''}
              </span>
            </div>
          )}

          {/* Service address — two-line format */}
          <div className="detail-row">
            <label>Location</label>
            {addressLine1 ? (
              <span>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--sand)', textDecoration: 'none' }}
                >
                  <span style={{ display: 'block' }}>{addressLine1}</span>
                  {addressLine2 && <span style={{ display: 'block' }}>{addressLine2}</span>}
                </a>
              </span>
            ) : (
              <span style={{ color: 'var(--steel)' }}>Service address unavailable</span>
            )}
          </div>

          {/* Multi-day: show service type when title differs */}
          {job.is_multi_day && job.title && job.service_type && job.service_type !== job.title && (
            <div className="detail-row"><label>Service</label><span>{job.service_type}</span></div>
          )}

          {/* Customer-approved scope */}
          {job.scope_of_work && (
            <div className="detail-row"><label>Approved Scope</label><span style={{ whiteSpace: 'pre-wrap' }}>{job.scope_of_work}</span></div>
          )}

          {/* Service or job description */}
          {job.description && (
            <div className="detail-row"><label>Description</label><span style={{ whiteSpace: 'pre-wrap' }}>{job.description}</span></div>
          )}

          {/* Internal job notes */}
          {job.notes && (
            <div className="detail-row"><label>Job Notes</label><span style={{ whiteSpace: 'pre-wrap' }}>{job.notes}</span></div>
          )}
        </div>

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
                      {job.checkin_at ? ` · Arrived ${format(new Date(job.checkin_at), 'h:mm a')}` : ''}
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

        <div className="form-actions" style={{ marginTop: 16 }}>
          <button className="btn-secondary" onClick={onEdit}>Edit Job</button>
        </div>
      </div>
    </div>
  );
}
