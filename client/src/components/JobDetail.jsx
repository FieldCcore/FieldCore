import React, { useState, useEffect } from 'react';
import { Camera, Timer, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const STATUSES = ['scheduled', 'in_progress', 'complete', 'cancelled'];
const STATUS_COLORS = {
  scheduled:   '#5F667A',
  in_progress: '#D6B58A',
  complete:    '#1E6B3C',
  cancelled:   '#B52A2A',
};

export default function JobDetail({ job, onClose, onStatusChange, onEdit }) {
  const [updating,      setUpdating]      = useState(false);
  const [photos,        setPhotos]        = useState([]);
  const [showPhotos,    setShowPhotos]    = useState(false);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [clockStarted,  setClockStarted]  = useState(!!job.no_show_clock_started_at);
  const [clockTime,     setClockTime]     = useState(job.no_show_clock_started_at || null);
  const [startingClock, setStartingClock] = useState(false);
  const [smsSending,    setSmsSending]    = useState(null);
  const [smsResult,     setSmsResult]     = useState(null);
  const [tick,          setTick]          = useState(0);
  const [declaring,     setDeclaring]     = useState(false);
  const [arrived,       setArrived]       = useState(false);

  useEffect(() => {
    if (!showPhotos) return;
    setLoadingPhotos(true);
    api.get(`/mobile/jobs/${job.id}/photos`)
      .then(r => setPhotos(r.data))
      .catch(() => {})
      .finally(() => setLoadingPhotos(false));
  }, [showPhotos, job.id]);

  async function updateStatus(status) {
    setUpdating(true);
    try {
      const res = await api.patch(`/jobs/${job.id}/status`, { status });
      onStatusChange(res.data);
    } finally {
      setUpdating(false);
    }
  }

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

  useEffect(() => {
    if (!clockStarted) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [clockStarted]);

  const { user, token } = useAuth();
  const isAdminViewer = user?.role === 'owner' || user?.role === 'manager';
  const graceMin = parseFloat(job.grace_period_minutes) || 15;
  const elapsedMin = clockStarted && clockTime
    ? (Date.now() - new Date(clockTime).getTime()) / 60000
    : 0;
  const remainingMin = Math.max(graceMin - elapsedMin, 0);
  const remSecs = Math.round(remainingMin * 60);
  const isOverdue = clockStarted && elapsedMin >= graceMin;
  const clockColor = isOverdue ? '#dc2626' : '#d97706';

  async function declareNoShow() {
    if (!job?.id) return;
    setDeclaring(true);
    try {
      const res = await fetch(`/api/no-show/jobs/${job.id}/declare`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ jobId: job.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('Declare no-show failed:', data);
        alert(data.error || data.message || 'Failed to declare no-show. Check console for details.');
        setDeclaring(false);
        return;
      }
      if (onStatusChange) onStatusChange({ ...job, status: 'no_show' });
      onClose();
    } catch (err) {
      console.error('Declare no-show error:', err);
      alert('Network error — could not declare no-show. Please try again.');
      setDeclaring(false);
    }
  }

  async function clientArrived() {
    if (!job?.id) return;
    setArrived(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'in_progress' }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('Client arrived failed:', data);
        alert(data.error || data.message || 'Could not update status. Check console for details.');
        setArrived(false);
        return;
      }
      if (onStatusChange) onStatusChange(data);
      onClose();
    } catch (err) {
      console.error('Client arrived error:', err);
      alert('Network error — could not update status. Please try again.');
      setArrived(false);
    }
  }

  async function sendTemplate(template) {
    if (!job.client_id) return;
    setSmsSending(template);
    setSmsResult(null);
    try {
      await api.post('/sms/send-template', { client_id: job.client_id, template, job_id: job.id });
      setSmsResult({ ok: true, message: template === 'confirmation' ? 'Confirmation sent!' : 'Reminder sent!' });
    } catch (err) {
      setSmsResult({ ok: false, message: err.response?.data?.error || 'SMS failed to send.' });
    } finally {
      setSmsSending(null);
      setTimeout(() => setSmsResult(null), 4000);
    }
  }

  return (
    <div>
      <div className="job-detail-header">
        <div>
          <h2>{job.service_type}</h2>
          <span className="status-badge" style={{ background: STATUS_COLORS[job.status] }}>
            {job.status.replace('_', ' ')}
          </span>
        </div>
        <button className="btn-close" onClick={onClose}>×</button>
      </div>

      <div className="job-detail-body">
        <div className="detail-row"><label>Client</label><span>{job.client_name || '—'}</span></div>
        <div className="detail-row"><label>Tech</label><span>{job.tech_name || 'Unassigned'}</span></div>
        <div className="detail-row">
          <label>Scheduled</label>
          <span>{job.scheduled_at ? format(new Date(job.scheduled_at), 'MMM d, yyyy h:mm a') : '—'}</span>
        </div>
        <div className="detail-row">
          <label>Amount</label>
          <span>{job.amount ? `$${parseFloat(job.amount).toFixed(2)}` : '—'}</span>
        </div>
        {job.recurring !== 'none' && (
          <div className="detail-row"><label>Recurring</label><span style={{ textTransform: 'capitalize' }}>{job.recurring}</span></div>
        )}
        {job.checkin_at && (
          <div className="detail-row">
            <label>Check-in</label>
            <span>{format(new Date(job.checkin_at), 'h:mm a')} {job.checkin_lat ? `· ${parseFloat(job.checkin_lat).toFixed(4)}, ${parseFloat(job.checkin_lng).toFixed(4)}` : ''}</span>
          </div>
        )}
        {job.service_address && (
          <div className="detail-row">
            <label>Location</label>
            <span>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([job.service_address, job.service_city, job.service_state].filter(Boolean).join(', '))}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--sand)', textDecoration: 'none' }}
              >
                {[job.service_address, job.service_city, job.service_state, job.service_zip].filter(Boolean).join(', ')}
              </a>
            </span>
          </div>
        )}
        {job.notes && (
          <div className="detail-row"><label>Notes</label><span>{job.notes}</span></div>
        )}
      </div>

      {/* No-show clock — only when job is scheduled */}
      {job.status === 'scheduled' && (
        <div style={{ margin: '12px 0', padding: '12px 14px', borderRadius: 8, border: `1px solid ${clockStarted ? (isOverdue ? '#fca5a5' : '#fde68a') : '#e5e0d8'}`, background: clockStarted ? (isOverdue ? '#fef2f2' : '#fffbeb') : '#fafaf8' }}>
          {clockStarted ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Timer size={14} style={{ color: clockColor, flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: isOverdue ? '#7f1d1d' : '#92400e' }}>
                  No-show clock {isOverdue ? 'expired' : 'running'}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: clockColor, fontFamily: 'DM Mono, monospace', marginTop: 3, letterSpacing: '.04em' }}>
                  {isOverdue
                    ? `+${String(Math.floor(elapsedMin - graceMin)).padStart(2,'0')}:${String(Math.round((elapsedMin - graceMin) * 60) % 60).padStart(2,'0')} over`
                    : `${String(Math.floor(remSecs / 60)).padStart(2,'0')}:${String(remSecs % 60).padStart(2,'0')} remaining`}
                </div>
                {isAdminViewer && job.checkin_lat && (
                  <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 5 }}>
                    Tech GPS: {parseFloat(job.checkin_lat).toFixed(4)}°, {parseFloat(job.checkin_lng || 0).toFixed(4)}°
                    {job.checkin_at ? ` · Arrived ${format(new Date(job.checkin_at), 'h:mm a')}` : ''}
                  </div>
                )}
                {isAdminViewer && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button
                      onClick={declareNoShow}
                      disabled={declaring || arrived}
                      style={{ fontSize: 11, padding: '5px 12px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, cursor: declaring ? 'wait' : 'pointer', fontWeight: 700, opacity: (declaring || arrived) ? 0.6 : 1 }}
                    >
                      {declaring ? 'Declaring…' : 'Declare No-Show'}
                    </button>
                    <button
                      onClick={clientArrived}
                      disabled={declaring || arrived}
                      className="btn-secondary"
                      style={{ fontSize: 11, padding: '5px 12px' }}
                    >
                      {arrived ? 'Updating…' : 'Client Arrived'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--steel)' }}>Client not present? Start the grace period clock.</div>
              <button
                className="btn-secondary"
                style={{ fontSize: 11, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', flexShrink: 0 }}
                onClick={startNoshowClock}
                disabled={startingClock}
              >
                <Timer size={11} />{startingClock ? 'Starting…' : 'Start Clock'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* SMS Templates — available for scheduled and in_progress jobs with a client */}
      {(job.status === 'scheduled' || job.status === 'in_progress') && job.client_id && (
        <div style={{ margin: '12px 0', padding: '12px 14px', borderRadius: 8, border: '1px solid #e5e0d8', background: '#fafaf8' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#9ca3af', marginBottom: 8 }}>
            <MessageSquare size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />SMS
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn-secondary"
              style={{ fontSize: 11, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
              onClick={() => sendTemplate('confirmation')}
              disabled={!!smsSending}
            >
              <MessageSquare size={11} />{smsSending === 'confirmation' ? 'Sending…' : 'Send Confirmation'}
            </button>
            <button
              className="btn-secondary"
              style={{ fontSize: 11, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
              onClick={() => sendTemplate('reminder')}
              disabled={!!smsSending}
            >
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

      {/* Photos section */}
      <div style={{ margin: '12px 0' }}>
        <button
          className="btn-secondary"
          style={{ fontSize: 13, padding: '6px 14px' }}
          onClick={() => setShowPhotos(v => !v)}
        >
          {showPhotos ? 'Hide Photos' : <><Camera size={14} style={{ marginRight: 5, verticalAlign: 'middle' }} />Job Photos</>}
        </button>
        {showPhotos && (
          <div style={{ marginTop: 12 }}>
            {loadingPhotos && <p className="muted">Loading photos…</p>}
            {!loadingPhotos && photos.length === 0 && (
              <p className="muted" style={{ fontSize: 13 }}>No photos uploaded for this job.</p>
            )}
            {photos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8 }}>
                {photos.map(p => (
                  <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                    <img
                      src={p.url}
                      alt="Job photo"
                      style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0' }}
                    />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="job-status-section">
        <p className="status-label">Update Status</p>
        <div className="status-buttons">
          {STATUSES.map(s => (
            <button
              key={s}
              disabled={job.status === s || updating}
              className="status-btn"
              style={{
                background: job.status === s ? STATUS_COLORS[s] : '#f1f5f9',
                color: job.status === s ? '#fff' : '#475569',
                opacity: updating ? 0.6 : 1,
              }}
              onClick={() => updateStatus(s)}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="form-actions" style={{ marginTop: 16 }}>
        <button className="btn-secondary" onClick={onEdit}>Edit Job</button>
      </div>
    </div>
  );
}
