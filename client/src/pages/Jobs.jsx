import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addMinutes, addDays } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import { useSearchParams } from 'react-router-dom';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import api from '../api';
import JobForm from '../components/JobForm';
import JobDetail from '../components/JobDetail';

function CalendarToolbar({ date, view, onNavigate, onView }) {
  const label = useMemo(() => {
    if (view === 'month') return format(date, 'MMMM yyyy');
    if (view === 'week') {
      const s = startOfWeek(date, { weekStartsOn: 0 });
      const e = addDays(s, 6);
      const sameMonth = format(s, 'MMM') === format(e, 'MMM');
      return `${format(s, 'MMM d')} – ${format(e, sameMonth ? 'd' : 'MMM d')}, ${format(e, 'yyyy')}`;
    }
    if (view === 'day') return format(date, 'EEEE, MMMM d, yyyy');
    if (view === 'agenda') return 'Upcoming Events';
    return '';
  }, [date, view]);

  return (
    <div className="cal-toolbar">
      <div className="cal-toolbar-nav">
        <button className="cal-nav-btn" onClick={() => onNavigate('TODAY')}>Today</button>
        <button className="cal-nav-btn cal-nav-arrow" onClick={() => onNavigate('PREV')}><ChevronLeft size={16} /></button>
        <button className="cal-nav-btn cal-nav-arrow" onClick={() => onNavigate('NEXT')}><ChevronRight size={16} /></button>
      </div>
      <span className="cal-toolbar-label">{label}</span>
      <div className="cal-view-seg">
        {['month', 'week', 'day', 'agenda'].map(v => (
          <button
            key={v}
            className={`cal-view-btn${view === v ? ' active' : ''}`}
            onClick={() => onView(v)}
          >
            {v === 'agenda' ? 'Agenda' : v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales: { 'en-US': enUS },
});

const STATUS_COLORS = {
  scheduled:          '#5F667A',
  in_progress:        '#D6B58A',
  partially_completed:'#D97706',
  complete:           '#1E6B3C',
  cancelled:          '#B52A2A',
};

// Session status mapped to a calendar color (distinct from parent job)
const SESSION_STATUS_COLORS = {
  scheduled:         '#3B82F6',
  in_progress:       '#F59E0B',
  completed_for_day: '#16A34A',
  cancelled:         '#9CA3AF',
};

function FieldCoreAgendaView({ date, events, length = 30, onSelectEvent }) {
  const rangeStart = useMemo(() => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [date]);

  const rangeEnd = useMemo(() => addDays(rangeStart, length), [rangeStart, length]);

  const rows = useMemo(() => {
    const filtered = [...events]
      .filter(ev => {
        const s = new Date(ev.start);
        return s >= rangeStart && s < rangeEnd;
      })
      .sort((a, b) => new Date(a.start) - new Date(b.start));
    let lastDay = null;
    return filtered.map(ev => {
      const dayKey = format(new Date(ev.start), 'yyyy-MM-dd');
      const isFirstOfDay = dayKey !== lastDay;
      lastDay = dayKey;
      return { event: ev, isFirstOfDay };
    });
  }, [events, rangeStart, rangeEnd]);

  return (
    <div className="fc-agenda">
      <div className="fc-agenda-header">
        <div className="fc-agenda-hcell">Date</div>
        <div className="fc-agenda-hcell">Time</div>
        <div className="fc-agenda-hcell" style={{ borderRight: 'none' }}>Event</div>
      </div>
      {rows.length === 0 ? (
        <div className="fc-agenda-empty">No upcoming events in this range.</div>
      ) : rows.map(({ event, isFirstOfDay }, idx) => {
        const start  = new Date(event.start);
        const end    = new Date(event.end);
        const status = event.resource?.status || 'scheduled';
        const color  = STATUS_COLORS[status] || '#5F667A';
        const [service, client] = (event.title || '').split(' — ');
        return (
          <div
            key={event.id ?? idx}
            className={`fc-agenda-row${idx === rows.length - 1 ? ' fc-agenda-row-last' : ''}`}
            onClick={e => onSelectEvent?.(event, e)}
          >
            <div className="fc-agenda-cell fc-agenda-date">
              {isFirstOfDay ? format(start, 'EEE MMM dd') : ''}
            </div>
            <div className="fc-agenda-cell fc-agenda-time">
              {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
            </div>
            <div className="fc-agenda-cell fc-agenda-event">
              <span className="fc-agenda-dot" style={{ background: color }} />
              <span className="fc-agenda-svc">{service}</span>
              {client && <span className="fc-agenda-cli">— {client}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

FieldCoreAgendaView.title = () => 'Upcoming Events';
FieldCoreAgendaView.navigate = (date, action, { length = 30 } = {}) => {
  if (action === 'PREV') return addDays(date, -length);
  if (action === 'NEXT') return addDays(date, length);
  return date;
};

function parseTime(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

export default function Jobs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobs,         setJobs]         = useState([]);
  const [sessions,     setSessions]     = useState([]);
  const [businessHours, setBusinessHours] = useState([]);
  const [view,         setView]         = useState('week');
  const [date,         setDate]         = useState(new Date());
  const [modal,        setModal]        = useState(null);
  const [selectedJob,  setSelectedJob]  = useState(null);
  const [defaultStart, setDefaultStart] = useState(null);
  const [loading,      setLoading]      = useState(true);

  const loadJobs = useCallback(() => {
    Promise.all([
      api.get('/jobs'),
      api.get('/jobs/sessions'),
    ]).then(([jobsRes, sessionsRes]) => {
      setJobs(jobsRes.data);
      setSessions(sessionsRes.data);
    }).catch(() => {
      api.get('/jobs').then(r => setJobs(r.data));
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  useEffect(() => {
    api.get('/business-settings').then(r => {
      if (r.data?.hours) setBusinessHours(r.data.hours);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setDefaultStart(new Date());
      setModal('create');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Derive calendar min/max from business hours (Mon–Fri open times as a guide)
  const { calMin, calMax } = useMemo(() => {
    const openHours = businessHours.filter(h => !h.is_closed && h.open_time && h.close_time);
    if (!openHours.length) {
      const min = new Date(); min.setHours(7, 0, 0, 0);
      const max = new Date(); max.setHours(20, 0, 0, 0);
      return { calMin: min, calMax: max };
    }
    const opens  = openHours.map(h => parseInt(h.open_time.split(':')[0]));
    const closes = openHours.map(h => parseInt(h.close_time.split(':')[0]));
    const minHour = Math.max(0, Math.min(...opens) - 1);
    const maxHour = Math.min(23, Math.max(...closes) + 1);
    const min = new Date(); min.setHours(minHour, 0, 0, 0);
    const max = new Date(); max.setHours(maxHour, 0, 0, 0);
    return { calMin: min, calMax: max };
  }, [businessHours]);

  // Map jobs and sessions to calendar events
  const events = useMemo(() => {
    // Single-day jobs (is_multi_day = false or null, with scheduled_at)
    const jobEvents = jobs
      .filter(j => j.scheduled_at && !j.is_multi_day)
      .map(j => ({
        id:    j.id,
        title: `${j.service_type}${j.client_name ? ' — ' + j.client_name : ''}`,
        start: new Date(j.scheduled_at),
        end:   addMinutes(new Date(j.scheduled_at), j.duration_minutes || 60),
        resource: { ...j, _type: 'job' },
      }));

    // Multi-day job sessions — each appears as its own calendar event
    const sessionEvents = sessions
      .filter(s => s.scheduled_date)
      .map(s => {
        const base = new Date(s.scheduled_date + 'T' + (s.start_time || '08:00') + ':00');
        const end  = s.end_time
          ? new Date(s.scheduled_date + 'T' + s.end_time + ':00')
          : addMinutes(base, 60);
        const dayLabel = s.total_sessions > 1
          ? `Day ${s.day_number} of ${s.total_sessions}`
          : 'Multi-Day';
        return {
          id:    `session-${s.id}`,
          title: `[${dayLabel}] ${s.service_type || s.title || ''}${s.client_name ? ' — ' + s.client_name : ''}`,
          start: base,
          end,
          resource: { ...s, _type: 'session', _jobId: s.job_id },
        };
      });

    return [...jobEvents, ...sessionEvents];
  }, [jobs, sessions]);

  // Grey out slots outside business hours
  function slotPropGetter(slotDate) {
    const day = slotDate.getDay(); // 0=Sun, 6=Sat
    const dayConfig = businessHours.find(h => h.day_of_week === day);
    if (!dayConfig || dayConfig.is_closed) {
      return { style: { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } };
    }
    const openTime  = parseTime(dayConfig.open_time);
    const closeTime = parseTime(dayConfig.close_time);
    if (openTime && (slotDate < openTime || slotDate >= closeTime)) {
      return { style: { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } };
    }
    return {};
  }

  function handleSelectSlot({ start }) {
    setDefaultStart(start);
    setModal('create');
  }

  function handleSelectEvent(event) {
    const resource = event.resource;
    if (resource._type === 'session') {
      // Clicking a session event opens the parent job
      const parentJob = jobs.find(j => j.id === resource._jobId);
      if (parentJob) {
        setSelectedJob(parentJob);
        setModal('detail');
      }
    } else {
      setSelectedJob(resource);
      setModal('detail');
    }
  }

  function handleJobCreated(job) {
    setJobs(prev => [job, ...prev]);
    if (job.sessions?.length) {
      setSessions(prev => [...prev, ...job.sessions.map(s => ({ ...s, job_id: job.id, service_type: job.service_type, client_name: job.client_name }))]);
    }
    setModal(null);
  }

  function handleJobEdited(updated) {
    setJobs(prev => prev.map(j => j.id === updated.id ? { ...j, ...updated } : j));
    setModal(null);
    setSelectedJob(null);
  }

  function handleStatusChange(updated) {
    setJobs(prev => prev.map(j => j.id === updated.id ? { ...j, ...updated } : j));
    setSelectedJob(prev => ({ ...prev, ...updated }));
  }

  function eventStyleGetter(event) {
    const resource = event.resource || {};
    const isSession = resource._type === 'session';
    const status = isSession
      ? (resource.status || 'scheduled')
      : (resource.status || 'scheduled');

    if (view === 'agenda') {
      return { style: { background: 'none', backgroundColor: 'transparent', boxShadow: 'none', border: 'none', borderRadius: 0, padding: 0, color: 'var(--navy)' } };
    }

    const bgColor = isSession
      ? (SESSION_STATUS_COLORS[status] || '#3B82F6')
      : (STATUS_COLORS[status] || '#5F667A');

    return {
      style: {
        backgroundColor: bgColor,
        borderRadius: '6px',
        border: isSession ? '2px dashed rgba(255,255,255,0.4)' : 'none',
        color: '#fff',
        fontSize: '12px',
        padding: '2px 6px',
      },
    };
  }

  return (
    <div>
      <div className="calendar-legend">
        {Object.entries(STATUS_COLORS).map(([s, color]) => (
          <span key={s} className="legend-item">
            <span className="legend-dot" style={{ background: color }} />
            {s.replace('_', ' ')}
          </span>
        ))}
      </div>

      {loading ? (
        <div style={{ background: 'var(--white)', borderRadius: 12, padding: '48px 24px', textAlign: 'center', border: '1px solid var(--lightgray)', color: 'var(--steel)', fontSize: 14 }}>
          Loading schedule…
        </div>
      ) : (
        <div className="calendar-wrap">
          <Calendar
            localizer={localizer}
            events={events}
            view={view}
            date={date}
            onView={setView}
            onNavigate={setDate}
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            eventPropGetter={eventStyleGetter}
            slotPropGetter={businessHours.length > 0 ? slotPropGetter : undefined}
            min={calMin}
            max={calMax}
            selectable
            views={{ month: true, week: true, day: true, agenda: FieldCoreAgendaView }}
            components={{ toolbar: CalendarToolbar }}
            style={{ height: 'max(560px, calc(100vh - 240px))' }}
          />
        </div>
      )}

      {modal === 'create' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New Job</h2>
              <button className="btn-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <JobForm
                defaultStart={defaultStart}
                onSave={handleJobCreated}
                onCancel={() => setModal(null)}
              />
            </div>
          </div>
        </div>
      )}

      {modal === 'detail' && selectedJob && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <JobDetail
              job={selectedJob}
              onClose={() => setModal(null)}
              onStatusChange={handleStatusChange}
              onEdit={() => setModal('edit')}
            />
          </div>
        </div>
      )}

      {modal === 'edit' && selectedJob && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Job</h2>
              <button className="btn-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <JobForm
                job={selectedJob}
                onSave={handleJobEdited}
                onCancel={() => setModal('detail')}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
