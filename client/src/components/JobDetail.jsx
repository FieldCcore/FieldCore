import React, { useState } from 'react';
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
        {job.notes && (
          <div className="detail-row"><label>Notes</label><span>{job.notes}</span></div>
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
