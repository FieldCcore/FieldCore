import React, { useState } from 'react';
import { format } from 'date-fns';
import api from '../api';

export default function SessionCloseoutModal({ session, jobId, onComplete, onCancel }) {
  const [form, setForm] = useState({
    work_completed:  session.work_completed  || '',
    work_remaining:  session.work_remaining  || '',
    completion_pct:  session.completion_pct  ?? 0,
    blockers:        session.blockers        || '',
    internal_notes:  session.internal_notes  || '',
    client_notes:    session.client_notes    || '',
    actual_hours:    session.actual_hours    || '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = field => e => setForm(prev => ({ ...prev, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await api.post(`/jobs/${jobId}/sessions/${session.id}/complete`, {
        ...form,
        completion_pct: parseInt(form.completion_pct),
        actual_hours:   form.actual_hours ? parseFloat(form.actual_hours) : null,
      });
      onComplete(res.data.session);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not complete session.');
    } finally {
      setSaving(false);
    }
  }

  const dateLabel = session.scheduled_date
    ? format(new Date(session.scheduled_date + 'T12:00:00'), 'EEEE, MMMM d, yyyy')
    : 'Today';

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Complete for the Day</h2>
            <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 3 }}>{dateLabel}</div>
          </div>
          <button className="btn-close" onClick={onCancel}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
            padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400e' }}>
            Completing this session will <strong>not</strong> close the overall job.
            The parent job stays open until you explicitly mark it complete.
          </div>

          <form onSubmit={handleSubmit}>
            {error && <p className="form-error">{error}</p>}

            <div className="form-group">
              <label>Work Completed Today</label>
              <textarea value={form.work_completed} onChange={set('work_completed')} rows={3}
                placeholder="Describe what was accomplished during this session…" />
            </div>

            <div className="form-group">
              <label>Work Remaining</label>
              <textarea value={form.work_remaining} onChange={set('work_remaining')} rows={2}
                placeholder="What still needs to be done in future sessions?" />
            </div>

            <div className="form-group">
              <label>Overall Completion: <strong>{form.completion_pct}%</strong></label>
              <input type="range" min="0" max="100" step="5" value={form.completion_pct}
                onChange={set('completion_pct')}
                style={{ width: '100%', accentColor: 'var(--sand)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--steel)' }}>
                <span>0%</span><span>50%</span><span>100%</span>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Hours Worked</label>
                <input type="number" step="0.25" min="0" value={form.actual_hours}
                  onChange={set('actual_hours')} placeholder="e.g. 7.5" />
              </div>
            </div>

            <div className="form-group">
              <label>Blockers / Delays</label>
              <textarea value={form.blockers} onChange={set('blockers')} rows={2}
                placeholder="Any issues, missing materials, or waiting on approvals?" />
            </div>

            <div className="form-group">
              <label>Internal Notes</label>
              <textarea value={form.internal_notes} onChange={set('internal_notes')} rows={2}
                placeholder="Notes for the team (not shown to client)" />
            </div>

            <div className="form-group">
              <label>Client-Facing Update</label>
              <textarea value={form.client_notes} onChange={set('client_notes')} rows={2}
                placeholder="Progress note to share with the client" />
            </div>

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Complete for the Day'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
