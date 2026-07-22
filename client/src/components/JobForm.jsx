import React, { useState, useEffect } from 'react';
import { format, addMinutes } from 'date-fns';
import { Plus, Trash2, Lock } from 'lucide-react';
import api from '../api';
import AddressAutocomplete from './AddressAutocomplete';
import { useEntitlements } from '../hooks/useEntitlements';

function blankSession(date = '') {
  return { scheduled_date: date, start_time: '', end_time: '', title: '', description: '', tech_ids: [], lead_tech_id: '' };
}

export default function JobForm({ job, defaultStart, defaultMultiDay = false, onSave, onCancel }) {
  const [clients,   setClients]   = useState([]);
  const [techs,     setTechs]     = useState([]);
  const [templates, setTemplates] = useState([]);
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
    // Multi-day fields
    is_multi_day:         job?.is_multi_day       || defaultMultiDay || false,
    title:                job?.title              || '',
    scope_of_work:        job?.scope_of_work      || '',
    estimated_start_date: job?.estimated_start_date
      ? format(new Date(job.estimated_start_date), 'yyyy-MM-dd') : '',
    estimated_end_date:   job?.estimated_end_date
      ? format(new Date(job.estimated_end_date), 'yyyy-MM-dd') : '',
    end_date_unknown:     job?.end_date_unknown    || false,
    job_manager_id:       job?.job_manager_id      || '',
    estimated_labor_hours: job?.estimated_labor_hours || '',
    billing_method:       job?.billing_method      || 'fixed',
    priority:             job?.priority            || 'normal',
  });
  const [sessions, setSessions] = useState([blankSession(
    defaultStart ? format(new Date(defaultStart), 'yyyy-MM-dd') : ''
  )]);
  const [saving, setSaving]             = useState(false);
  const [error,  setError]              = useState('');
  const [showUpgradeHint, setShowUpgradeHint] = useState(false);
  const { entitlements } = useEntitlements();
  const canMultiDay = entitlements?.capabilities?.can_create_multi_day_jobs !== false;

  useEffect(() => {
    api.get('/clients').then(r => setClients(r.data));
    api.get('/users').then(r =>
      setTechs(r.data.filter(u => u.role === 'tech' || u.role === 'owner' || u.role === 'manager'))
    );
    api.get('/business-settings').then(r => {
      if (r.data?.services) setTemplates(r.data.services.filter(s => s.is_active !== false));
    }).catch(() => {});
    if (!job) {
      api.get('/booking-settings').then(r => {
        const tf = parseFloat(r.data?.travel_fee || 0);
        if (tf > 0) setForm(prev => ({ ...prev, travel_fee: String(tf) }));
      }).catch(() => {});
    }
  }, []);

  const set = field => e => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(prev => ({ ...prev, [field]: val }));
  };

  function applyTemplate(templateId) {
    if (!templateId) return;
    const tpl = templates.find(t => String(t.id) === String(templateId));
    if (!tpl) return;
    setForm(prev => {
      const updates = { service_type: tpl.name };
      if (tpl.price != null) updates.amount = String(tpl.price);
      if (prev.scheduled_at && tpl.duration_minutes) {
        const start = new Date(prev.scheduled_at);
        if (!isNaN(start.getTime())) {
          updates._duration_minutes = tpl.duration_minutes;
          updates._end_at = format(addMinutes(start, tpl.duration_minutes), "yyyy-MM-dd'T'HH:mm");
        }
      }
      return { ...prev, ...updates };
    });
  }

  // ── Session helpers ───────────────────────────────────────────
  const setSession = (idx, field) => e => {
    const val = e.target.value;
    setSessions(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s));
  };

  function toggleSessionTech(idx, techId) {
    setSessions(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const ids = s.tech_ids.includes(techId)
        ? s.tech_ids.filter(id => id !== techId)
        : [...s.tech_ids, techId];
      return { ...s, tech_ids: ids };
    }));
  }

  function addSession() {
    setSessions(prev => [...prev, blankSession()]);
  }

  function removeSession(idx) {
    setSessions(prev => prev.filter((_, i) => i !== idx));
  }

  function copyFirstSessionTimes() {
    if (sessions.length < 2) return;
    const first = sessions[0];
    setSessions(prev => prev.map((s, i) => i === 0 ? s : {
      ...s,
      start_time:   first.start_time,
      end_time:     first.end_time,
      tech_ids:     [...first.tech_ids],
      lead_tech_id: first.lead_tech_id,
    }));
  }

  // ── Submit ────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.client_id)    return setError('Client is required.');
    if (!form.service_type) return setError('Service type is required.');
    if (form.is_multi_day) {
      const missing = sessions.filter(s => !s.scheduled_date);
      if (missing.length) return setError('Every session must have a date.');
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        amount:      form.amount      || null,
        tech_id:     form.tech_id     || null,
        service_lat: form.service_lat || null,
        service_lng: form.service_lng || null,
        job_manager_id: form.job_manager_id || null,
        estimated_labor_hours: form.estimated_labor_hours ? parseFloat(form.estimated_labor_hours) : null,
      };
      delete payload._duration_minutes;
      delete payload._end_at;

      if (form.is_multi_day) {
        payload.sessions = sessions.map(s => ({
          ...s,
          start_time:  s.start_time   || null,
          end_time:    s.end_time     || null,
          lead_tech_id: s.lead_tech_id || null,
        }));
        // Use first session date as scheduled_at if not set
        if (!payload.scheduled_at && sessions[0]?.scheduled_date) {
          const d = sessions[0].scheduled_date;
          const t = sessions[0].start_time || '08:00';
          payload.scheduled_at = `${d}T${t}`;
        }
        payload.estimated_start_date = sessions[0]?.scheduled_date || payload.estimated_start_date || null;
      }

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

  const isMultiDay = form.is_multi_day;

  return (
    <form className="client-form" onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}

      {/* ── Job Duration Toggle ── */}
      <div className="form-group">
        <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 8 }}>Job Duration</label>
        <div style={{ display: 'flex', gap: 0, border: '1px solid var(--lightgray)', borderRadius: 8, overflow: 'hidden', width: 'fit-content' }}>
          <button
            type="button"
            onClick={() => { setForm(prev => ({ ...prev, is_multi_day: false })); setShowUpgradeHint(false); }}
            style={{
              padding: '7px 16px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: !form.is_multi_day ? 'var(--navy)' : 'var(--white)',
              color:      !form.is_multi_day ? '#fff' : 'var(--slate)',
            }}
          >
            Single Day
          </button>
          <button
            type="button"
            onClick={() => {
              if (!canMultiDay) { setShowUpgradeHint(true); return; }
              setShowUpgradeHint(false);
              setForm(prev => ({ ...prev, is_multi_day: true }));
            }}
            style={{
              padding: '7px 16px', fontSize: 13, fontWeight: 600, border: 'none',
              cursor: canMultiDay ? 'pointer' : 'default',
              background: form.is_multi_day ? 'var(--navy)' : 'var(--white)',
              color:      form.is_multi_day ? '#fff' : (canMultiDay ? 'var(--slate)' : 'var(--steel)'),
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            Multiple Days
            {!canMultiDay && <Lock size={11} style={{ opacity: 0.6 }} />}
          </button>
        </div>
        {showUpgradeHint && !canMultiDay && (
          <div style={{ marginTop: 8, padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe',
            borderRadius: 6, fontSize: 12, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Lock size={12} />
            Multi-Day Jobs require the <strong>Solo plan</strong> or higher.{' '}
            <a href="/billing" style={{ color: '#1d4ed8', fontWeight: 700, textDecoration: 'none' }}>Upgrade →</a>
          </div>
        )}
      </div>

      {/* ── Multi-day project title ── */}
      {isMultiDay && (
        <div className="form-group">
          <label>Project Title</label>
          <input value={form.title} onChange={set('title')} placeholder="e.g. Fleet Interior Restoration — Unit 1018–1205" />
        </div>
      )}

      <div className="form-row">
        <div className="form-group">
          <label>Client *</label>
          <select value={form.client_id} onChange={set('client_id')}>
            <option value="">Select client...</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>{isMultiDay ? 'Job Manager' : 'Assign Tech'}</label>
          <select value={isMultiDay ? form.job_manager_id : form.tech_id}
            onChange={isMultiDay ? set('job_manager_id') : set('tech_id')}>
            <option value="">{isMultiDay ? 'No manager assigned' : 'Unassigned'}</option>
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
          <input value={form.service_type} onChange={set('service_type')} placeholder="e.g. Fleet Decontamination" />
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

      {/* ── Single-day scheduling ── */}
      {!isMultiDay && (
        <>
          <div className="form-row">
            <div className="form-group">
              <label>Scheduled Date &amp; Time</label>
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
        </>
      )}

      {/* ── Multi-day session builder (new jobs only — sessions managed from job detail when editing) ── */}
      {isMultiDay && !job && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>
              Work Sessions ({sessions.length})
            </label>
            {sessions.length > 1 && (
              <button type="button" className="btn-secondary"
                style={{ fontSize: 11, padding: '4px 10px' }} onClick={copyFirstSessionTimes}>
                Copy Day 1 times to all
              </button>
            )}
          </div>

          {sessions.map((sess, idx) => (
            <div key={idx} style={{ border: '1px solid var(--lightgray)', borderRadius: 8,
              padding: 14, marginBottom: 10, background: 'var(--offwhite)', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>
                  Day {idx + 1}
                </span>
                {sessions.length > 1 && (
                  <button type="button" onClick={() => removeSession(idx)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--steel)', display: 'flex', alignItems: 'center' }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="form-row" style={{ gap: 8 }}>
                <div className="form-group" style={{ flex: '1 1 140px' }}>
                  <label>Date *</label>
                  <input type="date" value={sess.scheduled_date} onChange={setSession(idx, 'scheduled_date')} />
                </div>
                <div className="form-group" style={{ flex: '1 1 100px' }}>
                  <label>Start</label>
                  <input type="time" value={sess.start_time} onChange={setSession(idx, 'start_time')} />
                </div>
                <div className="form-group" style={{ flex: '1 1 100px' }}>
                  <label>End</label>
                  <input type="time" value={sess.end_time} onChange={setSession(idx, 'end_time')} />
                </div>
              </div>
              {techs.length > 0 && (
                <div className="form-group" style={{ marginTop: 6 }}>
                  <label style={{ fontSize: 12 }}>Technicians for Day {idx + 1}</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {techs.map(t => (
                      <label key={t.id} style={{
                        display: 'flex', alignItems: 'center', gap: 5, fontSize: 12,
                        padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                        background: sess.tech_ids.includes(t.id) ? 'var(--navy)' : 'var(--white)',
                        color: sess.tech_ids.includes(t.id) ? '#fff' : 'var(--navy)',
                        border: '1px solid var(--lightgray)',
                      }}>
                        <input type="checkbox" style={{ display: 'none' }}
                          checked={sess.tech_ids.includes(t.id)}
                          onChange={() => toggleSessionTech(idx, t.id)} />
                        {t.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          <button type="button" className="btn-secondary"
            style={{ width: '100%', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            onClick={addSession}>
            <Plus size={14} /> Add Another Day
          </button>

          {/* Estimated completion */}
          <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--offwhite)', borderRadius: 8, border: '1px solid var(--lightgray)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <input type="checkbox" id="end_date_unknown" checked={form.end_date_unknown} onChange={set('end_date_unknown')} />
              <label htmlFor="end_date_unknown" style={{ fontSize: 13, cursor: 'pointer', margin: 0 }}>
                Completion date is not yet known
              </label>
            </div>
            {!form.end_date_unknown && (
              <div className="form-row" style={{ gap: 8, margin: 0 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Est. Start</label>
                  <input type="date" value={form.estimated_start_date} onChange={set('estimated_start_date')} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Est. Completion</label>
                  <input type="date" value={form.estimated_end_date} onChange={set('estimated_end_date')} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Editing multi-day: note that sessions are managed from the detail view */}
      {isMultiDay && job && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
          padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#1e40af' }}>
          Work sessions are managed from the Job Detail panel. Use "Add Workday" there to add or edit sessions.
        </div>
      )}

      {/* ── Scope & priority (multi-day) ── */}
      {isMultiDay && (
        <div className="form-row">
          <div className="form-group">
            <label>Priority</label>
            <select value={form.priority} onChange={set('priority')}>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="form-group">
            <label>Billing Method</label>
            <select value={form.billing_method} onChange={set('billing_method')}>
              <option value="fixed">Fixed Price</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily Rate</option>
              <option value="per_item">Per Service Item</option>
              <option value="milestone">Milestone</option>
            </select>
          </div>
        </div>
      )}

      <div className="form-group">
        <label>Service Location <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 12 }}>— where the work happens (optional)</span></label>
        <AddressAutocomplete
          value={form.service_address}
          onChange={v => setForm(prev => ({ ...prev, service_address: v, service_lat: '', service_lng: '' }))}
          onPlace={({ street, city, state, zip, lat, lng }) =>
            setForm(prev => ({
              ...prev,
              service_address: street, service_city: city, service_state: state,
              service_zip: zip, service_lat: lat || '', service_lng: lng || '',
            }))
          }
          placeholder="Street address"
        />
        {(form.service_city || form.service_state) && (
          <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 4 }}>
            {[form.service_city, form.service_state, form.service_zip].filter(Boolean).join(', ')}
          </div>
        )}
      </div>

      {isMultiDay && (
        <div className="form-group">
          <label>Scope of Work</label>
          <textarea value={form.scope_of_work} onChange={set('scope_of_work')} rows={3}
            placeholder="Overall scope and objectives for this project…" />
        </div>
      )}

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
