import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addMinutes, addDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { enUS } from 'date-fns/locale/en-US';
import { useSearchParams } from 'react-router-dom';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import api from '../api';
import JobForm from '../components/JobForm';
import JobDetail from '../components/JobDetail';
import CalendarErrorBoundary from '../components/CalendarErrorBoundary';
import { resolveCalendarTimeZone } from '../utils/calendarTimezone';
import { InlineAgreementForm } from '../components/InvoiceBuilder';
import CreationShell from '../components/CreationShell';

// ─── Calendar status color system ────────────────────────────────────────────
// Imported from the shared module — Calendar is the source of truth.
// Do not redefine these values here.

import {
  CAL_STATUS_COLOR,
  SESSION_CAL_COLOR,
} from '../domain/jobStatusPresentation';

const LEGEND = [
  { key: 'scheduled',   label: 'Scheduled',  color: CAL_STATUS_COLOR.scheduled   },
  { key: 'in_progress', label: 'In Progress', color: CAL_STATUS_COLOR.in_progress },
  { key: 'complete',    label: 'Completed',   color: CAL_STATUS_COLOR.complete    },
  { key: 'cancelled',   label: 'Cancelled',   color: CAL_STATUS_COLOR.cancelled   },
];

const VALID_VIEWS        = ['month', 'week', 'day', 'agenda'];
const VALID_FILTERS      = ['all', 'scheduled', 'in_progress', 'complete', 'cancelled'];
const VALID_CREATE_MODES = new Set(['single-day', 'multi-day', 'recurring']);

// ─── RBC localizer factory — week start is configurable (0=Sun, 1=Mon) ────────
function makeLocalizer(weekStartsOn) {
  return dateFnsLocalizer({
    format,
    parse,
    startOfWeek: (date) => startOfWeek(date, { weekStartsOn }),
    getDay,
    locales: { 'en-US': enUS },
  });
}

// ─── Scroll current-time indicator into view ─────────────────────────────────
function scrollToNow() {
  requestAnimationFrame(() => {
    const indicator = document.querySelector('.rbc-current-time-indicator');
    const content   = document.querySelector('.rbc-time-content');
    if (indicator && content) {
      content.scrollTop = Math.max(0, indicator.offsetTop - content.clientHeight / 3);
    } else if (content) {
      const now   = new Date();
      const ratio = (now.getHours() + now.getMinutes() / 60) / 24;
      content.scrollTop = ratio * content.scrollHeight - content.clientHeight / 3;
    }
  });
}

// ─── Custom event card — adaptive content based on duration ──────────────────
// Larger blocks show richer detail; short blocks show just the essential label.
function CalEventCard({ event }) {
  const resource   = event.resource || {};
  const isSession  = resource._type === 'session';
  const clientName = resource.client_name || '';
  const techName   = resource.tech_name   || '';
  const svcName    = resource.service_type || resource.title || '';
  const svcCount   = parseInt(resource.service_count || 0, 10);
  const svcLabel   = svcCount > 1 ? `${svcName} +${svcCount - 1}` : svcName;
  const dayLabel   = isSession
    ? (resource.total_sessions > 1
        ? `Day ${resource.day_number}/${resource.total_sessions}`
        : 'Multi-Day')
    : null;

  const durationMin = event.end && event.start
    ? Math.round((new Date(event.end) - new Date(event.start)) / 60000)
    : 60;

  // Time range string for medium/large cards
  const timeStr = durationMin >= 45
    ? `${format(new Date(event.start), 'h:mm')}–${format(new Date(event.end), 'h:mm a')}`
    : null;

  if (durationMin < 25) {
    // XS: service label only
    return (
      <div className="cal-event-card cal-event-card--xs">
        {dayLabel && <span className="cal-event-day">{dayLabel}</span>}
        <span className="cal-event-svc">{svcLabel || clientName}</span>
      </div>
    );
  }

  if (durationMin < 55) {
    // SM: service + client
    return (
      <div className="cal-event-card cal-event-card--sm">
        {dayLabel && <span className="cal-event-day">{dayLabel}</span>}
        <span className="cal-event-svc">{svcLabel}</span>
        {clientName && <span className="cal-event-cli">{clientName}</span>}
      </div>
    );
  }

  if (durationMin < 100) {
    // MD: time + service + client
    return (
      <div className="cal-event-card cal-event-card--md">
        {dayLabel && <span className="cal-event-day">{dayLabel}</span>}
        {timeStr   && <span className="cal-event-time">{timeStr}</span>}
        <span className="cal-event-svc">{svcLabel}</span>
        {clientName && <span className="cal-event-cli">{clientName}</span>}
      </div>
    );
  }

  // LG: full detail — time + service + client + tech
  return (
    <div className="cal-event-card cal-event-card--lg">
      {dayLabel && <span className="cal-event-day">{dayLabel}</span>}
      {timeStr   && <span className="cal-event-time">{timeStr}</span>}
      <span className="cal-event-svc">{svcLabel}</span>
      {clientName && <span className="cal-event-cli">{clientName}</span>}
      {techName   && <span className="cal-event-tech">{techName}</span>}
    </div>
  );
}

// ─── Month view event card — compact, single row ─────────────────────────────
// Month cells are ~22px per event slot. Never render multi-line duration cards here.
function MonthEventCard({ event }) {
  const resource   = event.resource || {};
  const isSession  = resource._type === 'session';
  const clientName = resource.client_name || '';
  const svcName    = resource.service_type || resource.title || '';
  const svcCount   = parseInt(resource.service_count || 0, 10);
  const svcLabel   = svcCount > 1 ? `${svcName} +${svcCount - 1}` : svcName;
  const dayBadge   = isSession
    ? (resource.total_sessions > 1 ? `Day ${resource.day_number}/${resource.total_sessions}` : 'Multi')
    : null;
  const timeStr    = format(new Date(event.start), 'h:mm a');

  return (
    <div className="cal-month-card">
      {dayBadge && <span className="cal-month-badge">{dayBadge}</span>}
      <span className="cal-month-time">{timeStr}</span>
      <span className="cal-month-svc">{svcLabel}</span>
      {clientName && <span className="cal-month-cli"> — {clientName}</span>}
    </div>
  );
}

// ─── Month day-of-week column header — DOW label only ─────────────────────────
// Month view: "SUN  MON  TUE…" — no date number (that lives in each cell).
function MonthDayHeader({ label }) {
  return <div className="fc-month-dh">{(label || '').toUpperCase()}</div>;
}

// ─── Week/Day column header — DOW above date number, today highlighted ────────
function WeekDayHeader({ date }) {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const isToday  = format(date, 'yyyy-MM-dd') === todayStr;
  return (
    <div className={`fc-week-dh${isToday ? ' fc-week-dh--today' : ''}`}>
      <span className="fc-week-dh-dow">{format(date, 'EEE').toUpperCase()}</span>
      <span className="fc-week-dh-num">{format(date, 'd')}</span>
    </div>
  );
}

// ─── Custom toolbar ───────────────────────────────────────────────────────────
// scrollToNow is module-level so CalendarToolbar can call it without props injection.
// Today merges navigation + scroll-to-current-time for day and week views.
function CalendarToolbar({ date, view, onNavigate, onView }) {
  const label = useMemo(() => {
    if (view === 'month') return format(date, 'MMMM yyyy');
    if (view === 'week') {
      const s = startOfWeek(date, { weekStartsOn: 0 });
      const e = addDays(s, 6);
      const sameMonth = format(s, 'MMM') === format(e, 'MMM');
      return `${format(s, 'MMM d')} – ${format(e, sameMonth ? 'd' : 'MMM d')}, ${format(e, 'yyyy')}`;
    }
    if (view === 'day')    return format(date, 'EEEE, MMMM d, yyyy');
    if (view === 'agenda') return 'Upcoming Events';
    return '';
  }, [date, view]);

  return (
    <div className="cal-toolbar">
      <div className="cal-toolbar-nav">
        <button className="cal-nav-btn cal-nav-arrow" onClick={() => onNavigate('PREV')} aria-label="Previous">
          <ChevronLeft size={16} />
        </button>
        <button className="cal-nav-btn cal-nav-arrow" onClick={() => onNavigate('NEXT')} aria-label="Next">
          <ChevronRight size={16} />
        </button>
      </div>
      <span className="cal-toolbar-label">{label}</span>
      <div className="cal-view-seg">
        {VALID_VIEWS.map(v => (
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

// ─── Custom agenda view ───────────────────────────────────────────────────────
function FieldCoreAgendaView({ date, events, length = 30, onSelectEvent }) {
  const rangeStart = useMemo(() => {
    const d = new Date(date); d.setHours(0, 0, 0, 0); return d;
  }, [date]);
  const rangeEnd = useMemo(() => addDays(rangeStart, length), [rangeStart, length]);

  const rows = useMemo(() => {
    const filtered = [...events]
      .filter(ev => { const s = new Date(ev.start); return s >= rangeStart && s < rangeEnd; })
      .sort((a, b) => new Date(a.start) - new Date(b.start));
    let lastDay = null;
    return filtered.map(ev => {
      const dayKey      = format(new Date(ev.start), 'yyyy-MM-dd');
      const isFirstOfDay = dayKey !== lastDay;
      lastDay = dayKey;
      return { event: ev, isFirstOfDay };
    });
  }, [events, rangeStart, rangeEnd]);

  return (
    <div className="fc-agenda" role="table" aria-label="Agenda view">
      <div className="fc-agenda-header" role="row">
        <div className="fc-agenda-hcell" role="columnheader">Date</div>
        <div className="fc-agenda-hcell" role="columnheader">Time</div>
        <div className="fc-agenda-hcell" role="columnheader" style={{ borderRight: 'none' }}>Event</div>
      </div>
      {rows.length === 0 ? (
        <div className="fc-agenda-empty">No upcoming events in this range.</div>
      ) : rows.map(({ event, isFirstOfDay }, idx) => {
        const start  = new Date(event.start);
        const end    = new Date(event.end);
        const status = event.resource?.status || 'scheduled';
        const color  = CAL_STATUS_COLOR[status] || '#5F667A';
        return (
          <div
            key={event.id ?? idx}
            className={`fc-agenda-row${idx === rows.length - 1 ? ' fc-agenda-row-last' : ''}`}
            role="row"
            tabIndex={0}
            onClick={e => onSelectEvent?.(event, e)}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelectEvent?.(event, e)}
          >
            <div className="fc-agenda-cell fc-agenda-date" role="cell">
              {isFirstOfDay ? format(start, 'EEE MMM dd') : ''}
            </div>
            <div className="fc-agenda-cell fc-agenda-time" role="cell">
              {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
            </div>
            <div className="fc-agenda-cell fc-agenda-event" role="cell">
              <span className="fc-agenda-dot" style={{ background: color }} aria-hidden="true" />
              {(event.resource?.client_name) && (
                <span className="fc-agenda-cli">{event.resource.client_name} —</span>
              )}
              <span className="fc-agenda-svc">{event.resource?.service_type || event.resource?.title || ''}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

FieldCoreAgendaView.title    = () => 'Upcoming Events';
FieldCoreAgendaView.navigate = (date, action, { length = 30 } = {}) => {
  if (action === 'PREV') return addDays(date, -length);
  if (action === 'NEXT') return addDays(date, length);
  return date;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseTime(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0); return d;
}

// Stable component object — defined once outside render to avoid RBC remounts.
// Per-view components: Month gets compact single-row cards; Week/Day get
// duration-adaptive multi-line cards. Headers differ: Month shows DOW only,
// Week/Day shows DOW + date number with today highlight.
const CAL_COMPONENTS = {
  toolbar: CalendarToolbar,
  month: {
    event:  MonthEventCard,
    header: MonthDayHeader,
  },
  week: {
    event:  CalEventCard,
    header: WeekDayHeader,
  },
  day: {
    event:  CalEventCard,
    header: WeekDayHeader,
  },
};

// ─── Main component ───────────────────────────────────────────────────────────
export default function Jobs() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initView   = searchParams.get('view');
  const initFilter = searchParams.get('filter');

  const [jobs,            setJobs]            = useState([]);
  const [sessions,        setSessions]        = useState([]);
  const [businessHours,   setBusinessHours]   = useState([]);
  const [techs,           setTechs]           = useState([]);
  const [calendarTZ,      setCalendarTZ]      = useState(() => resolveCalendarTimeZone({}).timezone);
  const [weekStartDay,    setWeekStartDay]    = useState(0); // 0=Sunday, 1=Monday
  const [view,            setView]            = useState(() => VALID_VIEWS.includes(initView)   ? initView   : 'month');
  const [date,            setDate]            = useState(new Date());
  const [modal,        setModal]        = useState(null);    // 'edit' only — create/recurring driven by URL
  const [drawerJob,    setDrawerJob]    = useState(null);    // event detail drawer
  const [defaultStart, setDefaultStart] = useState(null);

  // ── URL-driven create mode ──────────────────────────────────────────────────
  // ?create=single-day | multi-day | recurring keeps the modal open across
  // hard refreshes, new tabs, and same-page navigations.
  const _rawCreate    = searchParams.get('create');
  const validCreateMode = VALID_CREATE_MODES.has(_rawCreate) ? _rawCreate : null;
  const [loading,         setLoading]         = useState(true);
  const [statusFilter,    setStatusFilter]    = useState(() => VALID_FILTERS.includes(initFilter) ? initFilter : 'all');
  const [techFilter,      setTechFilter]      = useState(null);

  const viewScrolled = useRef(false);

  const closeCreate = useCallback(() => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.delete('create');
      return p;
    }, { replace: true });
  }, [setSearchParams]);

  // ── Dynamic localizer — rebuilds when week start changes ───────────────────
  const localizer = useMemo(() => makeLocalizer(weekStartDay), [weekStartDay]);

  // ── Current-time CSS variable — keeps "5:26 PM" label on the indicator ─────
  useEffect(() => {
    function syncTimeLabel() {
      const now = new Date();
      const h = now.getHours() % 12 || 12;
      const m = String(now.getMinutes()).padStart(2, '0');
      const ampm = now.getHours() < 12 ? 'AM' : 'PM';
      document.documentElement.style.setProperty('--rbc-now-label', `"${h}:${m} ${ampm}"`);
    }
    syncTimeLabel();
    const id = setInterval(syncTimeLabel, 30000);
    return () => clearInterval(id);
  }, []);

  // ── Data ────────────────────────────────────────────────────────────────────
  const loadJobs = useCallback(() => {
    Promise.all([api.get('/jobs'), api.get('/jobs/sessions')])
      .then(([jobsRes, sessRes]) => {
        setJobs(jobsRes.data);
        setSessions(sessRes.data);
      })
      .catch(() => api.get('/jobs').then(r => setJobs(r.data)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  useEffect(() => {
    api.get('/business-settings').then(r => {
      if (r.data?.hours) setBusinessHours(r.data.hours);
      const { timezone } = resolveCalendarTimeZone({ businessTimezone: r.data?.profile?.timezone });
      setCalendarTZ(timezone);
      const wsd = parseInt(r.data?.profile?.week_start_day ?? 0, 10);
      setWeekStartDay(wsd === 1 ? 1 : 0);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api.get('/users').then(r => {
      const techUsers = (r.data || []).filter(u => u.role === 'tech' || u.role === 'manager' || u.role === 'owner');
      setTechs(techUsers);
    }).catch(() => {});
  }, []);

  // ── Persist view + filter to URL (merges — never clobbers ?job= or ?create=) ─
  useEffect(() => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      if (view !== 'month')        p.set('view', view);   else p.delete('view');
      if (statusFilter !== 'all')  p.set('filter', statusFilter); else p.delete('filter');
      return p;
    }, { replace: true });
  }, [view, statusFilter, setSearchParams]);

  // ── Scroll to current time when entering day/week view ──────────────────────
  useEffect(() => {
    if (!viewScrolled.current) {
      viewScrolled.current = true;
      if (view === 'day' || view === 'week') setTimeout(scrollToNow, 400);
      return;
    }
    if (view === 'day' || view === 'week') setTimeout(scrollToNow, 300);
  }, [view]);

  // ── Drawer URL sync — close removes ?job=, open sets it ─────────────────────
  const closeDrawer = useCallback(() => {
    setDrawerJob(null);
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.delete('job');
      return p;
    }, { replace: true });
  }, [setSearchParams]);

  // ── Auto-open drawer from ?job= URL param (runs once after initial load) ────
  const autoOpenDone = useRef(false);
  useEffect(() => {
    if (loading || autoOpenDone.current) return;
    const jobId = searchParams.get('job');
    autoOpenDone.current = true;
    if (!jobId) return;
    // Always fetch full detail so team/services/assets are present from URL-open.
    const found = jobs.find(j => j.id === jobId);
    if (found) setDrawerJob(found); // show immediately, then enrich
    api.get(`/jobs/${jobId}`).then(r => setDrawerJob(r.data)).catch(() => {});
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Close drawer on Escape ──────────────────────────────────────────────────
  useEffect(() => {
    if (!drawerJob) return;
    const handleKey = (e) => { if (e.key === 'Escape') closeDrawer(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [drawerJob, closeDrawer]);

  // ── Business hours → calendar time range ───────────────────────────────────
  const { calMin, calMax } = useMemo(() => {
    const open = businessHours.filter(h => !h.is_closed && h.open_time && h.close_time);
    if (!open.length) {
      const min = new Date(); min.setHours(7, 0, 0, 0);
      const max = new Date(); max.setHours(20, 0, 0, 0);
      return { calMin: min, calMax: max };
    }
    const opens  = open.map(h => parseInt(h.open_time.split(':')[0]));
    const closes = open.map(h => parseInt(h.close_time.split(':')[0]));
    const min = new Date(); min.setHours(Math.max(0, Math.min(...opens) - 1), 0, 0, 0);
    const max = new Date(); max.setHours(Math.min(23, Math.max(...closes) + 1), 0, 0, 0);
    return { calMin: min, calMax: max };
  }, [businessHours]);

  // ── Map jobs + sessions → calendar events ──────────────────────────────────
  const allEvents = useMemo(() => {
    const jobEvents = jobs
      .filter(j => j.scheduled_at && !j.is_multi_day)
      .map(j => {
        // toZonedTime creates "fake local" dates so react-big-calendar places events
        // at the correct wall-clock position in the business timezone regardless of
        // the browser's local timezone.
        const utcStart = new Date(j.scheduled_at);
        const utcEnd   = addMinutes(utcStart, j.duration_minutes || 60);
        const startZ   = toZonedTime(utcStart, calendarTZ);
        const endZ     = toZonedTime(utcEnd,   calendarTZ);

        // Clamp end to 23:59:59 on the same calendar day as start.
        // A single-day job that runs late (e.g. 10 PM–1 AM) would otherwise produce
        // start=Aug4 end=Aug5, making RBC Month treat it as a multi-day spanning event
        // that bleeds into the neighboring cell.
        const startDay = format(startZ, 'yyyy-MM-dd');
        const endDay   = format(endZ,   'yyyy-MM-dd');
        const clampedEnd = startDay === endDay
          ? endZ
          : new Date(startZ.getFullYear(), startZ.getMonth(), startZ.getDate(), 23, 59, 59, 0);

        const svcCount = j.service_count > 1 ? ` (${j.service_count} services)` : '';
        const svcLabel = j.service_type || 'Service';
        return {
          id:       j.id,
          title:    `${svcLabel}${svcCount}${j.client_name ? ' — ' + j.client_name : ''}`,
          start:    startZ,
          end:      clampedEnd,
          resource: { ...j, _type: 'job' },
        };
      });

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
          id:       `session-${s.id}`,
          title:    `[${dayLabel}] ${s.service_type || s.title || ''}${s.client_name ? ' — ' + s.client_name : ''}`,
          start:    base,
          end,
          resource: { ...s, _type: 'session', _jobId: s.job_id },
        };
      });

    return [...jobEvents, ...sessionEvents];
  }, [jobs, sessions, calendarTZ]);

  // ── Filter events by status and/or tech ───────────────────────────────────
  const events = useMemo(() => {
    let filtered = allEvents;

    if (statusFilter !== 'all') {
      const match = statusFilter === 'in_progress'
        ? ['in_progress', 'partially_completed']
        : [statusFilter];
      filtered = filtered.filter(ev => match.includes(ev.resource?.status || 'scheduled'));
    }

    if (techFilter) {
      filtered = filtered.filter(ev => {
        const r = ev.resource || {};
        if (r._type === 'session') {
          return r.lead_tech_id === techFilter || (r.techs || []).some(t => t.tech_id === techFilter);
        }
        return r.tech_id === techFilter;
      });
    }

    return filtered;
  }, [allEvents, statusFilter, techFilter]);

  // ── Today's operational summary ────────────────────────────────────────────
  const todaySummary = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const todayEvs = allEvents.filter(ev => format(new Date(ev.start), 'yyyy-MM-dd') === todayStr);
    const count    = (...statuses) => todayEvs.filter(ev => statuses.includes(ev.resource?.status || 'scheduled')).length;
    return {
      total:      todayEvs.length,
      scheduled:  count('scheduled'),
      inProgress: count('in_progress', 'partially_completed'),
      completed:  count('complete'),
      cancelled:  count('cancelled'),
    };
  }, [allEvents]);

  // ── Business hours slot styling ────────────────────────────────────────────
  function slotPropGetter(slotDate) {
    const dayConfig = businessHours.find(h => h.day_of_week === slotDate.getDay());
    if (!dayConfig || dayConfig.is_closed) return { style: { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } };
    const openTime  = parseTime(dayConfig.open_time);
    const closeTime = parseTime(dayConfig.close_time);
    if (openTime && (slotDate < openTime || slotDate >= closeTime)) return { style: { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } };
    return {};
  }

  // ── Event interactions ─────────────────────────────────────────────────────
  function handleSelectSlot({ start }) {
    setDefaultStart(start);
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.set('create', 'single-day');
      return p;
    });
  }

  function handleSelectEvent(event) {
    const resource = event.resource;
    const jobToOpen = resource._type === 'session'
      ? jobs.find(j => j.id === resource._jobId)
      : resource;
    if (!jobToOpen) return;
    // Show list-data immediately so the drawer opens without delay,
    // then replace with full detail (team, services, assets, location label).
    setDrawerJob(jobToOpen);
    api.get(`/jobs/${jobToOpen.id}`).then(r => setDrawerJob(r.data)).catch(() => {});
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.set('job', jobToOpen.id);
      return p;
    }, { replace: true });
  }

  function handleJobCreated(job) {
    setJobs(prev => [job, ...prev]);
    if (job.sessions?.length) {
      setSessions(prev => [
        ...prev,
        ...job.sessions.map(s => ({ ...s, job_id: job.id, service_type: job.service_type, client_name: job.client_name })),
      ]);
    }
    localStorage.setItem('fc_jobs_mutated', Date.now().toString());
    closeCreate();
  }

  function handleJobEdited(updated) {
    setJobs(prev => prev.map(j => j.id === updated.id ? { ...j, ...updated } : j));
    setModal(null);
    setDrawerJob(prev => prev ? { ...prev, ...updated } : null);
    localStorage.setItem('fc_jobs_mutated', Date.now().toString());
  }

  function handleStatusChange(updated) {
    setJobs(prev => prev.map(j => j.id === updated.id ? { ...j, ...updated } : j));
    setDrawerJob(prev => prev ? { ...prev, ...updated } : null);
    localStorage.setItem('fc_jobs_mutated', Date.now().toString());
  }

  function handleJobDeleted(jobId) {
    setJobs(prev => prev.filter(j => j.id !== jobId));
    setSessions(prev => prev.filter(s => s.job_id !== jobId));
    setDrawerJob(null);
    localStorage.setItem('fc_jobs_mutated', Date.now().toString());
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.delete('job');
      return p;
    }, { replace: true });
  }

  // ── Event styles ───────────────────────────────────────────────────────────
  function eventStyleGetter(event) {
    if (view === 'agenda') {
      return { style: { background: 'none', backgroundColor: 'transparent', boxShadow: 'none', border: 'none', borderRadius: 0, padding: 0, color: 'var(--navy)' } };
    }
    const resource  = event.resource || {};
    const isSession = resource._type === 'session';
    const status    = resource.status || 'scheduled';
    const bgColor   = isSession
      ? (SESSION_CAL_COLOR[status] || '#8A90A2')
      : (CAL_STATUS_COLOR[status]  || '#8A90A2');
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

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Legend — 4 canonical statuses only + timezone indicator */}
      <div className="calendar-legend" role="list" aria-label="Job status legend" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {LEGEND.map(({ key, label, color }) => (
            <span key={key} className="legend-item" role="listitem">
              <span className="legend-dot" style={{ background: color }} aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>
        <span
          title="Calendar display timezone"
          style={{ fontSize: 11, color: 'var(--steel)', letterSpacing: '.02em',
            fontFamily: 'DM Mono, monospace', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          {calendarTZ}
        </span>
      </div>

      {/* Filter bar — status chips + technician filter; filters stack */}
      <div className="cal-filter-bar" role="group" aria-label="Filter calendar events">
        <span className="cal-filter-label">Filter:</span>
        {LEGEND.map(opt => (
          <button
            key={opt.key}
            className={`cal-filter-chip${statusFilter === opt.key ? ' active' : ''}`}
            style={statusFilter === opt.key ? { background: opt.color, borderColor: opt.color } : {}}
            onClick={() => setStatusFilter(prev => prev === opt.key ? 'all' : opt.key)}
            aria-pressed={statusFilter === opt.key}
          >
            {opt.label}
          </button>
        ))}
        {techs.length > 0 && (
          <select
            value={techFilter || ''}
            onChange={e => setTechFilter(e.target.value || null)}
            aria-label="Filter by technician"
            style={{
              marginLeft: 8,
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid var(--lightgray)',
              fontSize: 13,
              color: techFilter ? 'var(--navy)' : 'var(--steel)',
              background: techFilter ? 'var(--off)' : 'transparent',
              cursor: 'pointer',
            }}
          >
            <option value="">All technicians</option>
            {techs.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
        {(statusFilter !== 'all' || techFilter) && (
          <span className="cal-filter-count" aria-live="polite">
            {events.length} event{events.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Today's operational summary strip (day/week only) */}
      {todaySummary.total > 0 && (view === 'day' || view === 'week') && (
        <div className="cal-summary-strip" aria-label="Today's job summary">
          <span className="cal-summary-label">Today</span>
          {todaySummary.scheduled > 0 && (
            <span className="cal-summary-item">
              <span className="cal-summary-dot" style={{ background: '#8A90A2' }} aria-hidden="true" />
              {todaySummary.scheduled} scheduled
            </span>
          )}
          {todaySummary.inProgress > 0 && (
            <span className="cal-summary-item">
              <span className="cal-summary-dot" style={{ background: '#D4A000' }} aria-hidden="true" />
              {todaySummary.inProgress} in progress
            </span>
          )}
          {todaySummary.completed > 0 && (
            <span className="cal-summary-item">
              <span className="cal-summary-dot" style={{ background: '#2E7D32' }} aria-hidden="true" />
              {todaySummary.completed} completed
            </span>
          )}
          {todaySummary.cancelled > 0 && (
            <span className="cal-summary-item">
              <span className="cal-summary-dot" style={{ background: '#C62828' }} aria-hidden="true" />
              {todaySummary.cancelled} canceled
            </span>
          )}
        </div>
      )}

      {/* Calendar */}
      {loading ? (
        <div style={{ background: 'var(--white)', borderRadius: 12, padding: '48px 24px', textAlign: 'center', border: '1px solid var(--lightgray)', color: 'var(--steel)', fontSize: 14 }}>
          Loading schedule…
        </div>
      ) : (
        <CalendarErrorBoundary>
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
              step={15}
              timeslots={4}
              selectable
              views={{ month: true, week: true, day: true, agenda: FieldCoreAgendaView }}
              components={CAL_COMPONENTS}
              formats={{
                timeGutterFormat: (d, culture, loc) => loc.format(d, 'h a', culture),
                dayHeaderFormat:  (d, culture, loc) => loc.format(d, 'EEEE, MMMM d, yyyy', culture),
              }}
              style={{ height: 'max(600px, calc(100vh - 300px))' }}
            />
          </div>
        </CalendarErrorBoundary>
      )}

      {/* Create modal — driven by ?create=single-day or ?create=multi-day in URL */}
      {/* JobForm is self-contained (ab-overlay + ab-sheet) — no wrapper needed */}
      {(validCreateMode === 'single-day' || validCreateMode === 'multi-day') && (
        <JobForm
          defaultStart={defaultStart ?? new Date()}
          defaultMultiDay={validCreateMode === 'multi-day'}
          schedulingTimezone={calendarTZ}
          onSave={handleJobCreated}
          onCancel={closeCreate}
        />
      )}

      {/* Edit modal (opens from drawer) — self-contained */}
      {modal === 'edit' && drawerJob && (
        <JobForm
          job={drawerJob}
          schedulingTimezone={calendarTZ}
          onSave={handleJobEdited}
          onCancel={() => setModal(null)}
        />
      )}

      {/* Recurring Service modal — driven by ?create=recurring in URL */}
      {validCreateMode === 'recurring' && (
        <CreationShell title="New Recurring Service" onClose={closeCreate}>
          <InlineAgreementForm
            onSaved={() => {
              closeCreate();
              loadJobs();
            }}
            onCancel={closeCreate}
          />
        </CreationShell>
      )}

      {/* Event detail drawer — right-side panel, non-navigating */}
      {drawerJob && modal !== 'edit' && (
        <div
          className="cal-drawer-overlay"
          onClick={closeDrawer}
          role="presentation"
        >
          <aside
            className="cal-drawer"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Job details"
          >
            <JobDetail
              job={drawerJob}
              onClose={closeDrawer}
              onStatusChange={handleStatusChange}
              onEdit={() => setModal('edit')}
              onDeleted={handleJobDeleted}
              calendarTZ={calendarTZ}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
