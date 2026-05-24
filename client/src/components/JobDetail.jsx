import React, { useState, useEffect } from 'react';
import { Camera } from 'lucide-react';
import { format } from 'date-fns';
import api from '../api';

const STATUSES = ['scheduled', 'in_progress', 'complete', 'cancelled'];
const STATUS_COLORS = {
  scheduled:   '#5F667A',
  in_progress: '#D6B58A',
  complete:    '#1E6B3C',
  cancelled:   '#B52A2A',
};

export default function JobDetail({ job, onClose, onStatusChange, onEdit }) {
  const [updating, setUpdating] = useState(false);
  const [photos,   setPhotos]   = useState([]);
  const [showPhotos, setShowPhotos] = useState(false);
  const [loadingPhotos, setLoadingPhotos] = useState(false);

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
        {job.notes && (
          <div className="detail-row"><label>Notes</label><span>{job.notes}</span></div>
        )}
      </div>

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
