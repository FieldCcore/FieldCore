import React, { useState, useEffect } from 'react';
import { Camera, Timer } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import api from '../api';

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

      {/* No-show clock */}
      {job.status === 'scheduled' && (
        <div style={{ margin: '12px 0', padding: '12px 14px', borderRadius: 8, border: `1px solid ${clockStarted ? '#fde68a' : '#e5e0d8'}`, background: clockStarted ? '#fffbeb' : '#fafaf8' }}>
          {clockStarted ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Timer size={14} style={{ color: '#d97706', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>No-show clock running</div>
                <div style={{ fontSize: 11, color: '#b45309', marginTop: 1 }}>
                  Started {clockTime ? formatDistanceToNow(new Date(clockTime), { addSuffix: true }) : ''}
                  {' '}— auto-declares after grace period
                </div>
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
