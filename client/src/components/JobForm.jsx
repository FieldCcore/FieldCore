import React, { useState, useEffect } from 'react';
import { format, addMinutes } from 'date-fns';
import api from '../api';
import AddressAutocomplete from './AddressAutocomplete';

export default function JobForm({ job, defaultStart, onSave, onCancel }) {
  const [clients, setClients]       = useState([]);
  const [techs, setTechs]           = useState([]);
  const [templates, setTemplates]   = useState([]);
  const [form, setForm] = useState({
    client_id:       job?.client_id    || '',
    tech_id:         job?.tech_id      || '',
    service_type:    job?.service_type || '',
    scheduled_at:    job?.scheduled_at
      ? format(new Date(job.scheduled_at), "yyyy-MM-dd'T'HH:mm")
      : defaultStart
        ? format(new Date(defaultStart), "yyyy-MM-dd'T'HH:mm")
        : '',
    amount:          job?.amount     || '',
    travel_fee:      job?.travel_fee != null ? String(job.travel_fee) : '',
    notes:           job?.notes      || '',
    recurring:       job?.recurring  || 'none',
    service_address: job?.service_address || '',
    service_city:    job?.service_city    || '',
    service_state:   job?.service_state   || '',
    service_zip:     job?.service_zip     || '',
    service_lat:     job?.service_lat     || '',
    service_lng:     job?.service_lng     || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    api.get('/clients').then(r => setClients(r.data));
    api.get('/users').then(r => setTechs(r.data.filter(u => u.role === 'tech' || u.role === 'owner')));
    api.get('/business-settings').then(r => {
      if (r.data?.services) setTemplates(r.data.services.filter(s => s.is_active !== false));
    }).catch(() => {});
    // Pre-populate travel_fee from account settings if creating a new job
    if (!job) {
      api.get('/booking-settings').then(r => {
        const tf = parseFloat(r.data?.travel_fee || 0);
        if (tf > 0) setForm(prev => ({ ...prev, travel_fee: String(tf) }));
      }).catch(() => {});
    }
  }, []);

  const set = field => e => setForm(prev => ({ ...prev, [field]: e.target.value }));

  function applyTemplate(templateId) {
    if (!templateId) return;
    const tpl = templates.find(t => String(t.id) === String(templateId));
    if (!tpl) return;
    setForm(prev => {
      const updates = { service_type: tpl.name };
      if (tpl.price != null) updates.amount = String(tpl.price);
      // Auto-set end time if scheduled_at is set (stored as duration hint)
      if (prev.scheduled_at && tpl.duration_minutes) {
        const start = new Date(prev.scheduled_at);
        if (!isNaN(start.getTime())) {
          const end = addMinutes(start, tpl.duration_minutes);
          updates._duration_minutes = tpl.duration_minutes;
          updates._end_at = format(end, "yyyy-MM-dd'T'HH:mm");
        }
      }
      return { ...prev, ...updates };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.client_id)    return setError('Client is required.');
    if (!form.service_type) return setError('Service type is required.');
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        amount:      form.amount      || null,
        tech_id:     form.tech_id     || null,
        service_lat: form.service_lat || null,
        service_lng: form.service_lng || null,
      };
      delete payload._duration_minutes;
      delete payload._end_at;
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

      {templates.length > 0 && (
        <div className="form-group">
          <label>Service Template</label>
          <select onChange={e => applyTemplate(e.target.value)} defaultValue="">
            <option value="">— pick a template to auto-fill —</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}{t.duration_minutes ? ` (${t.duration_minutes} min)` : ''}{t.price != null ? ` · $${parseFloat(t.price).toFixed(2)}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

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

      <div className="form-group">
        <label>Travel Fee ($) <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 12 }}>— added as line item on invoice</span></label>
        <input type="number" step="0.01" min="0" value={form.travel_fee} onChange={set('travel_fee')} placeholder="0.00" />
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

      {form._end_at && (
        <p style={{ fontSize: 12, color: '#8A90A2', marginTop: -8, marginBottom: 12 }}>
          Estimated end: {form._end_at.replace('T', ' at ').replace(/:\d\d$/, '')}
        </p>
      )}

      <div className="form-group">
        <label>Service Location <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 12 }}>— where the work happens (optional)</span></label>
        <AddressAutocomplete
          value={form.service_address}
          onChange={v => setForm(prev => ({ ...prev, service_address: v, service_lat: '', service_lng: '' }))}
          onPlace={({ street, city, state, zip, lat, lng }) =>
            setForm(prev => ({
              ...prev,
              service_address: street,
              service_city:    city,
              service_state:   state,
              service_zip:     zip,
              service_lat:     lat  || '',
              service_lng:     lng  || '',
            }))
          }
          placeholder="Street address"
        />
        {(form.service_city || form.service_state) && (
          <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 4 }}>
            {[form.service_city, form.service_state, form.service_zip].filter(Boolean).join(', ')}
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 4 }}>
          Enter the full service address. FieldCore will map it after saving.
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
