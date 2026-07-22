import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import api from '../api';

export default function AddSessionModal({ jobId, session, onSave, onCancel }) {
  const [techs, setTechs] = useState([]);
  const [form, setForm] = useState({
    scheduled_date: session?.scheduled_date
      ? format(new Date(session.scheduled_date), 'yyyy-MM-dd')
      : format(new Date(), 'yyyy-MM-dd'),
    start_time:   session?.start_time   || '',
    end_time:     session?.end_time     || '',
    title:        session?.title        || '',
    description:  session?.description  || '',
    lead_tech_id: session?.lead_tech_id || '',
    tech_ids:     session?.techs?.map(t => t.tech_id) || [],
    estimated_hours: session?.estimated_hours || '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  useEffect(() => {
    api.get('/users').then(r =>
      setTechs(r.data.filter(u => u.role === 'tech' || u.role === 'owner' || u.role === 'manager'))
    ).catch(() => {});
  }, []);

  const set = field => e => setForm(prev => ({ ...prev, [field]: e.target.value }));

  function toggleTech(techId) {
    setForm(prev => ({
      ...prev,
      tech_ids: prev.tech_ids.includes(techId)
        ? prev.tech_ids.filter(id => id !== techId)
        : [...prev.tech_ids, techId],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.scheduled_date) return setError('Date is required.');
    setSaving(true);
    setError('');
    try {
      const payload = {
        scheduled_date:  form.scheduled_date,
        start_time:      form.start_time   || null,
        end_time:        form.end_time     || null,
        title:           form.title        || null,
        description:     form.description  || null,
        lead_tech_id:    form.lead_tech_id || null,
        tech_ids:        form.tech_ids,
        estimated_hours: form.estimated_hours ? parseFloat(form.estimated_hours) : null,
      };
      const res = session
        ? await api.patch(`/jobs/${jobId}/sessions/${session.id}`, payload)
        : await api.post(`/jobs/${jobId}/sessions`, payload);
      onSave(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save session.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>{session ? 'Edit Work Session' : 'Add Work Session'}</h2>
          <button className="btn-close" onClick={onCancel}>×</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            {error && <p className="form-error">{error}</p>}

            <div className="form-row">
              <div className="form-group">
                <label>Session Date *</label>
                <input type="date" value={form.scheduled_date} onChange={set('scheduled_date')} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Start Time</label>
                <input type="time" value={form.start_time} onChange={set('start_time')} />
              </div>
              <div className="form-group">
                <label>End Time</label>
                <input type="time" value={form.end_time} onChange={set('end_time')} />
              </div>
            </div>

            <div className="form-group">
              <label>Session Title</label>
              <input value={form.title} onChange={set('title')} placeholder="e.g. Interior Cleaning — Day 1" />
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea value={form.description} onChange={set('description')} rows={2}
                placeholder="What will be accomplished this session?" />
            </div>

            <div className="form-group">
              <label>Session Lead</label>
              <select value={form.lead_tech_id} onChange={set('lead_tech_id')}>
                <option value="">No lead assigned</option>
                {techs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            {techs.length > 0 && (
              <div className="form-group">
                <label>Assigned Technicians</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {techs.map(t => (
                    <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
                      padding: '5px 10px', borderRadius: 20, cursor: 'pointer',
                      background: form.tech_ids.includes(t.id) ? 'var(--navy)' : 'var(--offwhite)',
                      color: form.tech_ids.includes(t.id) ? '#fff' : 'var(--navy)',
                      border: '1px solid var(--lightgray)',
                    }}>
                      <input type="checkbox" style={{ display: 'none' }}
                        checked={form.tech_ids.includes(t.id)}
                        onChange={() => toggleTech(t.id)} />
                      {t.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Estimated Hours</label>
              <input type="number" step="0.5" min="0" value={form.estimated_hours}
                onChange={set('estimated_hours')} placeholder="e.g. 8" />
            </div>

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : session ? 'Save Changes' : 'Add Session'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
