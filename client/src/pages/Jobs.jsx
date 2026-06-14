import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addMinutes } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import { useSearchParams } from 'react-router-dom';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import api from '../api';
import JobForm from '../components/JobForm';
import JobDetail from '../components/JobDetail';

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales: { 'en-US': enUS },
});

const STATUS_COLORS = {
  scheduled:   '#5F667A',
  in_progress: '#D6B58A',
  complete:    '#1E6B3C',
  cancelled:   '#B52A2A',
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
  const [jobs, setJobs]               = useState([]);
  const [businessHours, setBusinessHours] = useState([]);
  const [view, setView]               = useState('week');
  const [date, setDate]               = useState(new Date());
  const [modal, setModal]             = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [defaultStart, setDefaultStart] = useState(null);
  const [loading, setLoading]         = useState(true);

  const loadJobs = useCallback(() => {
    api.get('/jobs').then(r => setJobs(r.data)).finally(() => setLoading(false));
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

  // Map jobs to calendar events using service duration if available
  const events = useMemo(() => jobs
    .filter(j => j.scheduled_at)
    .map(j => ({
      id:    j.id,
      title: `${j.service_type}${j.client_name ? ' — ' + j.client_name : ''}`,
      start: new Date(j.scheduled_at),
      end:   addMinutes(new Date(j.scheduled_at), j.duration_minutes || 60),
      resource: j,
    })), [jobs]);

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
    setSelectedJob(event.resource);
    setModal('detail');
  }

  function handleJobCreated(job) {
    setJobs(prev => [job, ...prev]);
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
    const status = event.resource?.status || 'scheduled';
    return {
      style: {
        backgroundColor: STATUS_COLORS[status],
        borderRadius: '6px',
        border: 'none',
        color: '#fff',
        fontSize: '12px',
        padding: '2px 6px',
      },
    };
  }

  return (
    <div>
      <div className="page-header">
        <h1>Schedule</h1>
        <button className="btn-primary" onClick={() => { setDefaultStart(new Date()); setModal('create'); }}>
          + New Job
        </button>
      </div>

      <div className="calendar-legend">
        {Object.entries(STATUS_COLORS).map(([s, color]) => (
          <span key={s} className="legend-item">
            <span className="legend-dot" style={{ background: color }} />
            {s.replace('_', ' ')}
          </span>
        ))}
      </div>

      {loading ? (
        <p className="muted">Loading...</p>
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
            style={{ height: 620 }}
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
            <JobForm
              defaultStart={defaultStart}
              onSave={handleJobCreated}
              onCancel={() => setModal(null)}
            />
          </div>
        </div>
      )}

      {modal === 'detail' && selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
            <JobForm
              job={selectedJob}
              onSave={handleJobEdited}
              onCancel={() => setModal('detail')}
            />
          </div>
        </div>
      )}
    </div>
  );
}
