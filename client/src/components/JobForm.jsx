import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import api from '../api';

export default function JobForm({ job, defaultStart, onSave, onCancel }) {
  const [clients, setClients] = useState([]);
  const [techs, setTechs] = useState([]);
  const [form, setForm] = useState({
    client_id:    job?.client_id    || '',
    tech_id:      job?.tech_id      || '',
    service_type: job?.service_type || '',
    scheduled_at: job?.scheduled_at
      ? format(new Date(job.scheduled_at), "yyyy-MM-dd'T'HH:mm")
      : defaultStart
        ? format(new Date(defaultStart), "yyyy-MM-dd'T'HH:mm")
        : '',
    amount:    job?.amount    || '',
    notes:     job?.notes     || '',
    recurring: job?.recurring || 'none',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    api.get('/clients').then(r => setClients(r.data));
    api.get('/users').then(r => setTechs(r.data.filter(u => u.role === 'tech' || u.role === 'owner')));
  }, []);

  const set = field => e => setForm(prev => ({ ...prev, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.client_id)    return setError('Client is required.');
    if (!form.service_type) return setError('Service type is required.');
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, amount: form.amount || null, tech_id: form.tech_id || null };
      const res = job
        ? await api.patch(`/jobs/${job.id}`, payload)
        : await api.post('/jobs', payload);
      onSave(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="client-form" onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}

      <div className="form-row">
        <div className="form-group">
          <label>Client *</label>
          <select value={form.client_id} onChange={set('client_id')}>
            <option value="">Select client...</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Assign Tech</label>
          <select value={form.tech_id} onChange={set('tech_id')}>
            <option value="">Unassigned</option>
            {techs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Service Type *</label>
          <input value={form.service_type} onChange={set('service_type')} placeholder="e.g. HVAC Tune-Up" />
        </div>
        <div className="form-group">
          <label>Amount ($)</label>
          <input type="number" step="0.01" value={form.amount} onChange={set('amount')} placeholder="0.00" />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Scheduled Date & Time</label>
          <input type="datetime-local" value={form.scheduled_at} onChange={set('scheduled_at')} />
        </div>
        <div className="form-group">
          <label>Recurring</label>
          <select value={form.recurring} onChange={set('recurring')}>
            <option value="none">One-time</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Bi-weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
      </div>

      <div className="form-group">
        <label>Notes</label>
        <textarea value={form.notes} onChange={set('notes')} rows={3} placeholder="Job notes..." />
      </div>

      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving...' : job ? 'Save Changes' : 'Create Job'}
        </button>
      </div>
    </form>
  );
}
