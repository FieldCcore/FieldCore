import React, { useState, useEffect, useMemo } from 'react';
import { format, addMinutes } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { Plus, Trash2 } from 'lucide-react';
import api from '../api';
import ClientLocationField from './ClientLocationField';
import JobTeamSelector from './JobTeamSelector';
import CreationShell from './CreationShell';
import CreationSection from './CreationSection';
import CreationCard from './CreationCard';
import { resolveCalendarTimeZone, isValidTimezone } from '../utils/calendarTimezone';
import { TIMEZONES } from '../utils/timezones';

function blankSession(date = '') {
  return { scheduled_date: date, start_time: '', duration_minutes: '', title: '', description: '', tech_ids: [], lead_tech_id: '' };
}

function computeSessionEndTime(startTime, durationMinutes) {
  if (!startTime || !durationMinutes) return null;
  const [h, m] = startTime.split(':').map(Number);
  const total = h * 60 + m + parseInt(durationMinutes, 10);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const BROWSER_TZ = (() => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimezone(tz) ? tz : 'UTC';
  } catch { return 'UTC'; }
})();

function toLocalInTZ(utcIso, tz) {
  if (!utcIso) return '';
  try { return formatInTimeZone(new Date(utcIso), tz, "yyyy-MM-dd'T'HH:mm"); }
  catch { return ''; }
}

function dateToLocalInTZ(ds, tz) {
  if (!ds) return '';
  if (typeof ds === 'string') return ds;
  try { return formatInTimeZone(ds, tz, "yyyy-MM-dd'T'HH:mm"); }
  catch { return ''; }
}

function convertLocalToTZ(localStr, fromTZ, toTZ) {
  if (!localStr || !localStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)) return null;
  try {
    const utc = fromZonedTime(localStr, fromTZ);
    return formatInTimeZone(utc, toTZ, 'MMM d, h:mm a zzz');
  } catch { return null; }
}

/**
 * schedulingTimezone — the IANA timezone the calendar is currently displaying.
 * defaultMultiDay — true when opened from the "New Multi-Day Job" menu item.
 */
export default function JobForm({ job, defaultStart, defaultMultiDay = false, onSave, onCancel, schedulingTimezone }) {
  const [clients,   setClients]   = useState([]);
  const [techs,     setTechs]     = useState([]);
  const [templates, setTemplates] = useState([]);
  const [crews,     setCrews]     = useState([]);
  const [assignment, setAssignment] = useState({ members: [], crewId: null });
  const [assignmentLoaded, setAssignmentLoaded] = useState(!job);

  const initialInputTZ = useMemo(() => {
    if (job?.input_timezone && isValidTimezone(job.input_timezone)) return job.input_timezone;
    if (defaultStart && schedulingTimezone && isValidTimezone(schedulingTimezone)) return schedulingTimezone;
    return BROWSER_TZ;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [inputTimezone, setInputTimezone] = useState(initialInputTZ);
  const [inputTZSource, setInputTZSource] = useState(() => {
    if (job?.input_timezone && isValidTimezone(job.input_timezone)) return 'stored';
    if (defaultStart && schedulingTimezone && isValidTimezone(schedulingTimezone)) return 'business';
    return 'browser';
  });

  const resolvedTZ = resolveCalendarTimeZone({
    businessTimezone: schedulingTimezone || job?.scheduling_timezone,
  }).timezone;

  const initialScheduledAt = useMemo(() => {
    if (job?.scheduled_at) {
      return job.original_local_start || toLocalInTZ(job.scheduled_at, initialInputTZ);
    }
    return dateToLocalInTZ(defaultStart, resolvedTZ);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [form, setForm] = useState({
    client_id:       job?.client_id    || '',
    service_type:    job?.service_type || '',
    scheduled_at:    initialScheduledAt,
    duration_minutes: job?.duration_minutes || 60,
    amount:          job?.amount     || '',
    travel_fee:      job?.travel_fee != null ? String(job.travel_fee) : '',
    notes:           job?.notes      || '',
    instructions:    job?.instructions || '',
    recurring:       job?.recurring  || 'none',
    location_id:     job?.location_id    || null,
    service_address: job?.service_address || '',
    service_city:    job?.service_city    || '',
    service_state:   job?.service_state   || '',
    service_zip:     job?.service_zip     || '',
    service_lat:     job?.service_lat     || '',
    service_lng:     job?.service_lng     || '',
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

  const [serviceLines, setServiceLines] = useState(
    job?.services?.length > 0
      ? job.services.map(s => ({ ...s }))
      : []
  );
  const [sessions, setSessions] = useState([blankSession(
    defaultStart ? format(new Date(defaultStart), 'yyyy-MM-dd') : ''
  )]);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  useEffect(() => {
    api.get('/clients').then(r => setClients(r.data));
    api.get('/users').then(r =>
      setTechs(r.data.filter(u => u.role === 'tech' || u.role === 'owner' || u.role === 'manager'))
    );
    api.get('/business-settings').then(r => {
      if (r.data?.services) setTemplates(r.data.services.filter(s => s.is_active !== false));
    }).catch(() => {});
    api.get('/dispatch/crews').then(r => setCrews(r.data || [])).catch(() => {});
    if (!job) {
      api.get('/booking-settings').then(r => {
        const tf = parseFloat(r.data?.travel_fee || 0);
        if (tf > 0) setForm(prev => ({ ...prev, travel_fee: String(tf) }));
      }).catch(() => {});
    } else {
      api.get(`/jobs/${job.id}/assignments`)
        .then(r => {
          const rows = r.data?.assignments || [];
          if (rows.length > 0) {
            setAssignment({
              members: rows.map(a => ({
                userId:         a.user_id,
                memberName:     a.member_name,
                assignmentRole: a.assignment_role,
                isPrimary:      a.is_primary,
              })),
              crewId: rows.find(a => a.crew_id)?.crew_id || null,
            });
          }
          setAssignmentLoaded(true);
        })
        .catch(() => { setAssignmentLoaded(true); });
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
      if (tpl.duration_minutes) updates.duration_minutes = tpl.duration_minutes;
      if (prev.scheduled_at && tpl.duration_minutes) {
        const start = new Date(prev.scheduled_at);
        if (!isNaN(start.getTime())) {
          updates._duration_minutes = tpl.duration_minutes;
          updates._end_at = format(addMinutes(start, tpl.duration_minutes), "yyyy-MM-dd'T'HH:mm");
        }
      }
      return { ...prev, ...updates };
    });
    setServiceLines(prev => {
      if (prev.length === 0) {
        return [{
          service_name:    tpl.name,
          asset_label:     '',
          description:     tpl.description || '',
          duration_minutes: tpl.duration_minutes || '',
          service_notes:   '',
          price_cents:     tpl.price != null ? Math.round(parseFloat(tpl.price) * 100) : null,
        }];
      }
      return prev;
    });
  }

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

  function addSession() { setSessions(prev => [...prev, blankSession()]); }
  function removeSession(idx) { setSessions(prev => prev.filter((_, i) => i !== idx)); }

  function copyFirstSessionTimes() {
    if (sessions.length < 2) return;
    const first = sessions[0];
    setSessions(prev => prev.map((s, i) => i === 0 ? s : {
      ...s,
      start_time:      first.start_time,
      duration_minutes: first.duration_minutes,
      tech_ids:        [...first.tech_ids],
      lead_tech_id:    first.lead_tech_id,
    }));
  }

  const conversionPreview = useMemo(() => {
    if (!form.scheduled_at || !schedulingTimezone || inputTimezone === schedulingTimezone) return null;
    if (!isValidTimezone(schedulingTimezone)) return null;
    const inCalTZ = convertLocalToTZ(form.scheduled_at, inputTimezone, schedulingTimezone);
    if (!inCalTZ) return null;
    const calLabel = schedulingTimezone.split('/').pop().replace(/_/g, ' ');
    return `In company timezone (${calLabel}): ${inCalTZ}`;
  }, [form.scheduled_at, inputTimezone, schedulingTimezone]);

  const tzOptions = useMemo(() => {
    const pinned = new Set();
    const result = [];
    if (BROWSER_TZ) { pinned.add(BROWSER_TZ); result.push({ value: BROWSER_TZ, label: `My timezone — ${BROWSER_TZ}` }); }
    if (schedulingTimezone && isValidTimezone(schedulingTimezone) && !pinned.has(schedulingTimezone)) {
      pinned.add(schedulingTimezone);
      const bl = schedulingTimezone.split('/').pop().replace(/_/g, ' ');
      result.push({ value: schedulingTimezone, label: `Business timezone — ${bl} (${schedulingTimezone})` });
    }
    if (inputTimezone && !pinned.has(inputTimezone)) {
      pinned.add(inputTimezone);
      result.push({ value: inputTimezone, label: inputTimezone });
    }
    result.push({ value: '__sep__', label: '──────────────────', disabled: true });
    for (const tz of TIMEZONES) {
      if (!pinned.has(tz)) result.push({ value: tz, label: tz });
    }
    return result;
  }, [schedulingTimezone, inputTimezone]);

  async function handleSave() {
    if (!form.client_id)    return setError('Client is required.');
    if (!form.service_type) return setError('Service type is required.');
    if (form.is_multi_day) {
      const missing = sessions.filter(s => !s.scheduled_date);
      if (missing.length) return setError('Every session must have a date.');
    }
    setSaving(true);
    setError('');
    try {
      const localInput = form.scheduled_at || null;
      const payload = {
        ...form,
        scheduled_at:        undefined,
        scheduled_at_local:  localInput,
        input_timezone:      inputTimezone,
        input_timezone_source: inputTZSource === 'stored' ? 'user_confirmed' : inputTZSource,
        creator_timezone:    BROWSER_TZ,
        original_local_start: localInput,
        scheduling_timezone: inputTimezone,
        amount:       form.amount      || null,
        service_lat:  form.service_lat || null,
        service_lng:  form.service_lng || null,
        location_id:  form.location_id || null,
        job_manager_id: form.job_manager_id || null,
        estimated_labor_hours: form.estimated_labor_hours ? parseFloat(form.estimated_labor_hours) : null,
        duration_minutes: parseInt(form.duration_minutes, 10) || 60,
        instructions: form.instructions || null,
        services: serviceLines
          .filter(s => s.service_name?.trim())
          .map((s, i) => ({ ...s, sort_order: i })),
      };
      delete payload.scheduled_at;
      delete payload._duration_minutes;
      delete payload._end_at;

      if (!job && !form.is_multi_day && assignment.members.length > 0) {
        payload.assignment = {
          members: assignment.members.map(m => ({
            userId:         m.userId,
            assignmentRole: m.assignmentRole,
            isPrimary:      m.isPrimary,
          })),
          crewId: assignment.crewId || null,
        };
      }

      if (form.is_multi_day) {
        payload.sessions = sessions.map(s => ({
          ...s,
          start_time:      s.start_time || null,
          end_time:        computeSessionEndTime(s.start_time, s.duration_minutes),
          duration_minutes: parseInt(s.duration_minutes, 10) || null,
          lead_tech_id:    s.lead_tech_id || null,
        }));
        if (!payload.scheduled_at_local && sessions[0]?.scheduled_date) {
          const d = sessions[0].scheduled_date;
          const t = sessions[0].start_time || '08:00';
          payload.scheduled_at_local = `${d}T${t}`;
          payload.original_local_start = payload.scheduled_at_local;
        }
        payload.estimated_start_date = sessions[0]?.scheduled_date || payload.estimated_start_date || null;
      }

      const res = job
        ? await api.patch(`/jobs/${job.id}`, payload)
        : await api.post('/jobs', payload);

      if (job && !form.is_multi_day && assignmentLoaded) {
        try {
          await api.put(`/jobs/${job.id}/assignments`, {
            members: assignment.members.map(m => ({
              userId:         m.userId,
              assignmentRole: m.assignmentRole,
              isPrimary:      m.isPrimary,
            })),
            crewId:           assignment.crewId || null,
            overrideWarnings: true,
          });
        } catch (assignErr) {
          const data = assignErr.response?.data;
          const teamMsg = data?.blockingIssues?.map(b => b.message).join('; ')
            || data?.error
            || 'Team assignment could not be updated.';
          setError(`Job saved. Team assignment failed: ${teamMsg}`);
          setSaving(false);
          return;
        }
      }

      if (job) {
        const svcPayload = serviceLines
          .filter(s => s.service_name?.trim())
          .map((s, i) => ({ ...s, sort_order: i }));
        await api.put(`/jobs/${job.id}/services`, { services: svcPayload }).catch(() => {});
      }

      onSave(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  const isMultiDay = form.is_multi_day;

  return (
    <CreationShell
      title={job ? 'Edit Job' : isMultiDay ? 'New Multi-Day Job' : 'New Job'}
      onClose={onCancel}
      footer={
        <div className="ib-footer">
          {error && <p className="ib-save-error">{error}</p>}
          <div className="ib-footer-actions">
            <button className="btn btn-secondary" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : job ? 'Save Changes' : isMultiDay ? 'Create Multi-Day Job' : 'Create Job'}
            </button>
          </div>
        </div>
      }
    >

      {/* CLIENT */}
      <CreationSection label="Client">
        <div className="ib-inline-agr-row">
          <div className="ib-field ib-field--grow">
            <label className="ib-label">Client *</label>
            <select className="ib-select" value={form.client_id} onChange={set('client_id')}>
              <option value="">Select client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </CreationSection>

      {/* JOB DETAILS */}
      <CreationSection label="Job Details">
        {isMultiDay && (
          <div className="ib-inline-agr-row">
            <div className="ib-field ib-field--grow">
              <label className="ib-label">Project Title</label>
              <input
                className="ib-input"
                value={form.title}
                onChange={set('title')}
                placeholder="e.g. Fleet Interior Restoration — Unit 1018–1205"
              />
            </div>
          </div>
        )}
        {templates.length > 0 && (
          <div className="ib-inline-agr-row">
            <div className="ib-field ib-field--grow">
              <label className="ib-label">Service Template</label>
              <select className="ib-select" onChange={e => applyTemplate(e.target.value)} defaultValue="">
                <option value="">— pick a template to auto-fill —</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.duration_minutes ? ` (${t.duration_minutes} min)` : ''}{t.price != null ? ` · $${parseFloat(t.price).toFixed(2)}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <div className="ib-inline-agr-row">
          <div className="ib-field ib-field--grow">
            <label className="ib-label">Service Type *</label>
            <input
              className="ib-input"
              value={form.service_type}
              onChange={set('service_type')}
              placeholder="e.g. Fleet Decontamination"
            />
          </div>
          <div className="ib-field ib-field--sm">
            <label className="ib-label">Amount ($)</label>
            <input
              className="ib-input"
              type="number"
              step="0.01"
              value={form.amount}
              onChange={set('amount')}
              placeholder="0.00"
            />
          </div>
        </div>
        <div className="ib-inline-agr-row">
          <div className="ib-field ib-field--sm">
            <label className="ib-label">Travel Fee ($)</label>
            <input
              className="ib-input"
              type="number"
              step="0.01"
              min="0"
              value={form.travel_fee}
              onChange={set('travel_fee')}
              placeholder="0.00"
            />
          </div>
        </div>
        {isMultiDay && (
          <div className="ib-inline-agr-row">
            <div className="ib-field">
              <label className="ib-label">Priority</label>
              <select className="ib-select" value={form.priority} onChange={set('priority')}>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="ib-field ib-field--grow">
              <label className="ib-label">Billing Method</label>
              <select className="ib-select" value={form.billing_method} onChange={set('billing_method')}>
                <option value="fixed">Fixed Price</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily Rate</option>
                <option value="per_item">Per Service Item</option>
                <option value="milestone">Milestone</option>
              </select>
            </div>
          </div>
        )}
      </CreationSection>

      {/* SERVICES */}
      <CreationSection
        label="Services"
        headerAction={
          <button
            type="button"
            className="ib-add-schedule"
            style={{ width: 'auto', padding: '4px 10px', fontSize: '0.75rem' }}
            onClick={() => setServiceLines(prev => [...prev, { service_name: '', asset_label: '', description: '', duration_minutes: '', service_notes: '' }])}
          >
            <Plus size={12} /> Add Service
          </button>
        }
      >
        {serviceLines.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--steel)', margin: 0 }}>
            No service lines — uses Service Type above. Click "Add Service" to specify individual services with assets.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {serviceLines.map((svc, idx) => (
              <CreationCard
                key={idx}
                label={`Service ${idx + 1}`}
                showRemove
                onRemove={() => setServiceLines(prev => prev.filter((_, i) => i !== idx))}
              >
                <div className="ib-inline-agr-row">
                  <div className="ib-field ib-field--grow">
                    <label className="ib-label">Service Name *</label>
                    <input
                      className="ib-input"
                      value={svc.service_name}
                      onChange={e => setServiceLines(prev => prev.map((s, i) => i === idx ? { ...s, service_name: e.target.value } : s))}
                      placeholder="e.g. Full Detail, Maintenance Wash"
                    />
                  </div>
                  <div className="ib-field">
                    <label className="ib-label">Asset / For</label>
                    <input
                      className="ib-input"
                      value={svc.asset_label}
                      onChange={e => setServiceLines(prev => prev.map((s, i) => i === idx ? { ...s, asset_label: e.target.value } : s))}
                      placeholder="e.g. 2025 Ford F-150"
                    />
                  </div>
                </div>
                <div className="ib-inline-agr-row">
                  <div className="ib-field ib-field--sm">
                    <label className="ib-label">Duration (min)</label>
                    <input
                      className="ib-input"
                      type="number"
                      min="1"
                      value={svc.duration_minutes}
                      onChange={e => setServiceLines(prev => prev.map((s, i) => i === idx ? { ...s, duration_minutes: e.target.value } : s))}
                      placeholder="60"
                    />
                  </div>
                  <div className="ib-field ib-field--grow">
                    <label className="ib-label">Service Notes</label>
                    <input
                      className="ib-input"
                      value={svc.service_notes}
                      onChange={e => setServiceLines(prev => prev.map((s, i) => i === idx ? { ...s, service_notes: e.target.value } : s))}
                      placeholder="Notes for this service…"
                    />
                  </div>
                </div>
              </CreationCard>
            ))}
          </div>
        )}
      </CreationSection>

      {/* SERVICE LOCATION */}
      <CreationSection label="Service Location">
        <ClientLocationField
          clientId={form.client_id || null}
          locationId={form.location_id || null}
          address={form.service_address}
          onSelect={loc => setForm(prev => ({
            ...prev,
            location_id:     loc.location_id || null,
            service_address: loc.address     || '',
            service_city:    loc.city        || '',
            service_state:   loc.state       || '',
            service_zip:     loc.zip         || '',
            service_lat:     loc.lat         != null ? String(loc.lat) : '',
            service_lng:     loc.lng         != null ? String(loc.lng) : '',
          }))}
          onAddressChange={v => setForm(prev => ({
            ...prev,
            location_id:     null,
            service_address: v,
            service_lat:     '',
            service_lng:     '',
          }))}
        />
      </CreationSection>

      {/* SCHEDULE (single-day only) */}
      {!isMultiDay && (
        <CreationSection label="Schedule">
          <div className="ib-inline-agr-row">
            <div className="ib-field ib-field--grow">
              <label className="ib-label">Date &amp; Time</label>
              <input
                className="ib-input"
                type="datetime-local"
                value={form.scheduled_at}
                onChange={set('scheduled_at')}
              />
            </div>
            <div className="ib-field ib-field--sm">
              <label className="ib-label">Duration (min)</label>
              <input
                className="ib-input"
                type="number"
                min="15"
                max="1440"
                step="15"
                value={form.duration_minutes}
                onChange={set('duration_minutes')}
                placeholder="60"
              />
            </div>
          </div>
          <div className="ib-inline-agr-row">
            <div className="ib-field ib-field--grow">
              <label className="ib-label" style={{ fontSize: 11, color: 'var(--steel)' }}>Times entered in</label>
              <select
                className="ib-select"
                value={inputTimezone}
                onChange={e => { setInputTimezone(e.target.value); setInputTZSource('user_selected'); }}
              >
                {tzOptions.map(opt => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          {conversionPreview && (
            <p style={{ fontSize: 12, color: 'var(--slate)', background: 'var(--offwhite)', border: '1px solid var(--lightgray)', borderRadius: 6, padding: '6px 10px', marginTop: 6 }}>
              {conversionPreview}
            </p>
          )}
        </CreationSection>
      )}

      {/* WORK SESSIONS (multi-day, new only) */}
      {isMultiDay && !job && (
        <CreationSection
          label={`Work Sessions (${sessions.length})`}
          headerAction={
            sessions.length > 1 ? (
              <button
                type="button"
                className="ib-add-schedule"
                style={{ width: 'auto', padding: '4px 10px', fontSize: '0.75rem' }}
                onClick={copyFirstSessionTimes}
              >
                Copy Day 1 times to all
              </button>
            ) : null
          }
        >
          {sessions.map((sess, idx) => (
            <CreationCard
              key={idx}
              label={`Day ${idx + 1}`}
              showRemove={sessions.length > 1}
              onRemove={() => removeSession(idx)}
            >
              <div className="ib-inline-agr-row">
                <div className="ib-field ib-field--grow">
                  <label className="ib-label">Date *</label>
                  <input className="ib-input" type="date" value={sess.scheduled_date} onChange={setSession(idx, 'scheduled_date')} />
                </div>
                <div className="ib-field ib-field--sm">
                  <label className="ib-label">Start</label>
                  <input className="ib-input" type="time" value={sess.start_time} onChange={setSession(idx, 'start_time')} />
                </div>
                <div className="ib-field ib-field--sm">
                  <label className="ib-label">Duration (min)</label>
                  <input
                    className="ib-input"
                    type="number"
                    min="15"
                    max="1440"
                    step="15"
                    value={sess.duration_minutes}
                    onChange={setSession(idx, 'duration_minutes')}
                    placeholder="60"
                  />
                </div>
              </div>
              {techs.length > 0 && (
                <div className="ib-inline-agr-row">
                  <div className="ib-field ib-field--grow">
                    <label className="ib-label" style={{ fontSize: 12 }}>Technicians for Day {idx + 1}</label>
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
                </div>
              )}
            </CreationCard>
          ))}
          <button
            type="button"
            className="ib-add-schedule"
            onClick={addSession}
          >
            <Plus size={13} /> Add Another Day
          </button>
          <div style={{ padding: '12px 14px', background: 'var(--offwhite)', borderRadius: 8, border: '1px solid var(--lightgray)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <input type="checkbox" id="end_date_unknown" checked={form.end_date_unknown} onChange={set('end_date_unknown')} />
              <label htmlFor="end_date_unknown" className="ib-label" style={{ marginBottom: 0, cursor: 'pointer' }}>
                Completion date is not yet known
              </label>
            </div>
            {!form.end_date_unknown && (
              <div className="ib-inline-agr-row">
                <div className="ib-field">
                  <label className="ib-label">Est. Start</label>
                  <input className="ib-input" type="date" value={form.estimated_start_date} onChange={set('estimated_start_date')} />
                </div>
                <div className="ib-field">
                  <label className="ib-label">Est. Completion</label>
                  <input className="ib-input" type="date" value={form.estimated_end_date} onChange={set('estimated_end_date')} />
                </div>
              </div>
            )}
          </div>
        </CreationSection>
      )}

      {/* Edit multi-day: sessions managed from detail view */}
      {isMultiDay && job && (
        <CreationSection>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#1e40af' }}>
            Work sessions are managed from the Job Detail panel. Use "Add Workday" there to add or edit sessions.
          </div>
        </CreationSection>
      )}

      {/* ASSIGNED TEAM */}
      <CreationSection label={isMultiDay ? 'Job Manager' : 'Assigned Team'}>
        {isMultiDay ? (
          <div className="ib-inline-agr-row">
            <div className="ib-field ib-field--grow">
              <label className="ib-label">Job Manager</label>
              <select className="ib-select" value={form.job_manager_id} onChange={set('job_manager_id')}>
                <option value="">No manager assigned</option>
                {techs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
        ) : (
          <JobTeamSelector value={assignment} onChange={setAssignment} techs={techs} crews={crews} />
        )}
      </CreationSection>

      {/* SCOPE OF WORK (multi-day) */}
      {isMultiDay && (
        <CreationSection label="Scope of Work">
          <textarea
            className="ib-textarea"
            value={form.scope_of_work}
            onChange={set('scope_of_work')}
            rows={3}
            placeholder="Overall scope and objectives for this project…"
          />
        </CreationSection>
      )}

      {/* INSTRUCTIONS */}
      <CreationSection label="Instructions">
        <textarea
          className="ib-textarea"
          value={form.instructions}
          onChange={set('instructions')}
          rows={2}
          placeholder="Gate code, parking notes, access details — visible to technician…"
        />
      </CreationSection>

      {/* INTERNAL NOTES */}
      <CreationSection label="Internal Notes">
        <textarea
          className="ib-textarea"
          value={form.notes}
          onChange={set('notes')}
          rows={2}
          placeholder="Internal admin notes…"
        />
      </CreationSection>

    </CreationShell>
  );
}
