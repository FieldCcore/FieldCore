import React, { useState, useEffect, useMemo } from 'react';
import { format, addMinutes } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { Plus, Trash2, Lock } from 'lucide-react';
import api from '../api';
import AddressAutocomplete from './AddressAutocomplete';
import ClientLocationField from './ClientLocationField';
import JobTeamSelector from './JobTeamSelector';
import { useEntitlements } from '../hooks/useEntitlements';
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

// Detected once per page load — never changes.
const BROWSER_TZ = (() => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimezone(tz) ? tz : 'UTC';
  } catch { return 'UTC'; }
})();

// Format a UTC ISO string into a datetime-local value in the given timezone.
function toLocalInTZ(utcIso, tz) {
  if (!utcIso) return '';
  try {
    return formatInTimeZone(new Date(utcIso), tz, "yyyy-MM-dd'T'HH:mm");
  } catch { return ''; }
}

// Format a Date (from a calendar slot click) into a datetime-local value
// in the given timezone. Falls back to ISO string if conversion fails.
function dateToLocalInTZ(ds, tz) {
  if (!ds) return '';
  if (typeof ds === 'string') return ds;
  try {
    return formatInTimeZone(ds, tz, "yyyy-MM-dd'T'HH:mm");
  } catch { return ''; }
}

// For display in the conversion preview: convert a local string from one TZ to another.
// Display-only — this is fine on the frontend.
function convertLocalToTZ(localStr, fromTZ, toTZ) {
  if (!localStr || !localStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)) return null;
  try {
    const utc = fromZonedTime(localStr, fromTZ);
    return formatInTimeZone(utc, toTZ, 'MMM d, h:mm a zzz');
  } catch { return null; }
}

/**
 * schedulingTimezone — the IANA timezone the calendar is currently displaying
 * (comes from business_profiles.timezone via the parent page). Used to
 * pre-fill times from calendar slot clicks in the expected display timezone.
 */
export default function JobForm({ job, defaultStart, defaultMultiDay = false, onSave, onCancel, schedulingTimezone }) {
  const [clients,   setClients]   = useState([]);
  const [techs,     setTechs]     = useState([]);
  const [templates, setTemplates] = useState([]);
  const [crews,     setCrews]     = useState([]);
  const [assignment, setAssignment] = useState({ members: [], crewId: null });
  // Track whether the existing assignment was loaded (edit mode). Prevents
  // accidentally clearing a team if the /assignments fetch fails.
  const [assignmentLoaded, setAssignmentLoaded] = useState(!job);

  // ── Input timezone: the timezone the user is entering times in ──────────────
  // This is explicitly separate from the calendar display timezone (schedulingTimezone).
  // For edits: restore from stored job.input_timezone (round-trip invariant).
  // For new jobs from calendar slot clicks: default to calendar display timezone.
  // For new jobs from the "New Job" button (no slot): default to browser timezone.
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

  // resolvedTZ is kept only for calendar-slot pre-fill (defaultStartToInput).
  // It must NEVER be used to parse appointment input or convert the scheduled time.
  const resolvedTZ = resolveCalendarTimeZone({
    businessTimezone: schedulingTimezone || job?.scheduling_timezone,
  }).timezone;

  // Initial scheduled_at string for the datetime-local input.
  // Round-trip: for jobs with original_local_start, use that exact string.
  // Backward-compat: for old jobs without it, convert UTC → initialInputTZ.
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
  // Service lines: each { service_name, asset_label, description, duration_minutes, price_cents, service_notes }
  const [serviceLines, setServiceLines] = useState(
    job?.services?.length > 0
      ? job.services.map(s => ({ ...s }))
      : []
  );
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
    api.get('/dispatch/crews').then(r => setCrews(r.data || [])).catch(() => {});
    if (!job) {
      api.get('/booking-settings').then(r => {
        const tf = parseFloat(r.data?.travel_fee || 0);
        if (tf > 0) setForm(prev => ({ ...prev, travel_fee: String(tf) }));
      }).catch(() => {});
    } else {
      // Pre-populate team assignment from existing job_assignments
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
    // Pre-populate a service line from the template (user can edit asset_label etc.)
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
      start_time:      first.start_time,
      duration_minutes: first.duration_minutes,
      tech_ids:        [...first.tech_ids],
      lead_tech_id:    first.lead_tech_id,
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
      // The raw local string typed by the user. We do NOT convert to UTC on the frontend.
      // The backend receives scheduled_at_local + input_timezone and converts server-side.
      const localInput = form.scheduled_at || null;

      const payload = {
        ...form,
        // Send the raw local string and the explicit timezone — server does the UTC conversion.
        scheduled_at:        undefined,      // not sent (no frontend UTC conversion)
        scheduled_at_local:  localInput,
        input_timezone:      inputTimezone,
        input_timezone_source: inputTZSource === 'stored' ? 'user_confirmed' : inputTZSource,
        creator_timezone:    BROWSER_TZ,
        // Store the raw typed string for round-trip (edit form restores from this).
        original_local_start: localInput,
        // scheduling_timezone mirrors input_timezone for legacy scheduler / SMS paths.
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

      // For new single-day jobs: include team assignment in POST body (transactional).
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
        // Use first session date as the job-level scheduled_at_local if no time was set
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

      // For single-day edits: sync team assignments via PUT (only if we successfully
      // loaded the existing team — prevents accidental unassign on fetch failure).
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

      // Sync service lines on edit (PUT replaces the full list)
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

  // ── Conversion preview ────────────────────────────────────────
  // Show what the entered time maps to in the calendar display timezone when they differ.
  const conversionPreview = useMemo(() => {
    if (!form.scheduled_at || !schedulingTimezone || inputTimezone === schedulingTimezone) return null;
    if (!isValidTimezone(schedulingTimezone)) return null;
    const inCalTZ = convertLocalToTZ(form.scheduled_at, inputTimezone, schedulingTimezone);
    if (!inCalTZ) return null;
    const calLabel = schedulingTimezone.split('/').pop().replace(/_/g, ' ');
    return `In company timezone (${calLabel}): ${inCalTZ}`;
  }, [form.scheduled_at, inputTimezone, schedulingTimezone]);

  const isMultiDay = form.is_multi_day;

  // Build timezone selector options: browser TZ + business TZ + full list
  const tzOptions = useMemo(() => {
    const pinned = new Set();
    const result = [];
    if (BROWSER_TZ) { pinned.add(BROWSER_TZ); result.push({ value: BROWSER_TZ, label: `My timezone — ${BROWSER_TZ}` }); }
    if (schedulingTimezone && isValidTimezone(schedulingTimezone) && !pinned.has(schedulingTimezone)) {
      pinned.add(schedulingTimezone);
      const bl = schedulingTimezone.split('/').pop().replace(/_/g, ' ');
      result.push({ value: schedulingTimezone, label: `Business timezone — ${bl} (${schedulingTimezone})` });
    }
    // If current inputTimezone isn't in the pinned list (e.g., stored from a different device), add it
    if (inputTimezone && !pinned.has(inputTimezone)) {
      pinned.add(inputTimezone);
      result.push({ value: inputTimezone, label: inputTimezone });
    }
    // Divider then full sorted list
    result.push({ value: '__sep__', label: '──────────────────', disabled: true });
    for (const tz of TIMEZONES) {
      if (!pinned.has(tz)) result.push({ value: tz, label: tz });
    }
    return result;
  }, [schedulingTimezone, inputTimezone]);

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
          <label>{isMultiDay ? 'Job Manager' : 'Assign Team'}</label>
          {isMultiDay ? (
            <select value={form.job_manager_id} onChange={set('job_manager_id')}>
              <option value="">No manager assigned</option>
              {techs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          ) : (
            <JobTeamSelector
              value={assignment}
              onChange={setAssignment}
              techs={techs}
              crews={crews}
            />
          )}
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
          <div className="form-group">
            <label>Scheduled Date &amp; Time</label>
            <input type="datetime-local" value={form.scheduled_at} onChange={set('scheduled_at')} />
          </div>

          {/* Timezone selector — explicit: which timezone is the entered time in? */}
          <div className="form-group" style={{ marginTop: -8, marginBottom: 14 }}>
            <label style={{ fontSize: 11, color: 'var(--steel)', fontWeight: 500, marginBottom: 4, display: 'block' }}>
              Times entered in
            </label>
            <select
              value={inputTimezone}
              onChange={e => { setInputTimezone(e.target.value); setInputTZSource('user_selected'); }}
              style={{ fontSize: 13, padding: '6px 8px' }}
            >
              {tzOptions.map(opt => (
                <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Conversion preview — shown when input TZ differs from calendar display TZ */}
          {conversionPreview && (
            <div style={{ fontSize: 12, color: 'var(--slate)', background: 'var(--offwhite)',
              border: '1px solid var(--lightgray)', borderRadius: 6, padding: '6px 10px',
              marginTop: -8, marginBottom: 14 }}>
              {conversionPreview}
            </div>
          )}

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
                  <label>Duration (min)</label>
                  <input type="number" min="15" max="1440" step="15"
                    value={sess.duration_minutes}
                    onChange={setSession(idx, 'duration_minutes')}
                    placeholder="60" />
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
      </div>

      {isMultiDay && (
        <div className="form-group">
          <label>Scope of Work</label>
          <textarea value={form.scope_of_work} onChange={set('scope_of_work')} rows={3}
            placeholder="Overall scope and objectives for this project…" />
        </div>
      )}

      {/* ── Duration (single-day only) ── */}
      {!isMultiDay && (
        <div className="form-group">
          <label>Duration (minutes)</label>
          <input
            type="number" min="15" max="1440" step="15"
            value={form.duration_minutes}
            onChange={set('duration_minutes')}
            placeholder="60"
          />
        </div>
      )}

      {/* ── Service Lines ── */}
      <div className="form-group">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <label style={{ marginBottom: 0 }}>Services</label>
          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: 11, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={() => setServiceLines(prev => [...prev, { service_name: '', asset_label: '', description: '', duration_minutes: '', service_notes: '' }])}
          >
            <Plus size={11} /> Add Service
          </button>
        </div>
        {serviceLines.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--steel)', padding: '8px 0' }}>
            No service lines — uses Service Type above. Click "+ Add Service" to specify individual services with assets.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {serviceLines.map((svc, idx) => (
              <div key={idx} style={{ border: '1px solid var(--lightgray)', borderRadius: 8, padding: 12, background: 'var(--offwhite)', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>Service {idx + 1}</span>
                  <button type="button" onClick={() => setServiceLines(prev => prev.filter((_, i) => i !== idx))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--steel)', display: 'flex', alignItems: 'center' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 11 }}>Service Name *</label>
                    <input
                      value={svc.service_name}
                      onChange={e => setServiceLines(prev => prev.map((s, i) => i === idx ? { ...s, service_name: e.target.value } : s))}
                      placeholder="e.g. Full Detail, Maintenance Wash"
                      style={{ fontSize: 13 }}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 11 }}>Asset / Service For</label>
                    <input
                      value={svc.asset_label}
                      onChange={e => setServiceLines(prev => prev.map((s, i) => i === idx ? { ...s, asset_label: e.target.value } : s))}
                      placeholder="e.g. 2025 Ford F-150, Main Pool, Unit #2"
                      style={{ fontSize: 13 }}
                    />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 11 }}>Service Notes / Instructions</label>
                  <input
                    value={svc.service_notes}
                    onChange={e => setServiceLines(prev => prev.map((s, i) => i === idx ? { ...s, service_notes: e.target.value } : s))}
                    placeholder="Specific notes for this service…"
                    style={{ fontSize: 13 }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="form-group">
        <label>Instructions <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 12 }}>— operational, visible to technician</span></label>
        <textarea value={form.instructions} onChange={set('instructions')} rows={2} placeholder="Gate code, parking notes, access details…" />
      </div>

      <div className="form-group">
        <label>Notes <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 12 }}>— internal admin only</span></label>
        <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Internal notes…" />
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
