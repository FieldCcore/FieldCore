import React, { useEffect, useState, useCallback } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addHours } from 'date-fns';
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

// FieldCore brand-aligned status colors
const STATUS_COLORS = {
  scheduled:   '#5F667A', // slate — planned, not started
  in_progress: '#D6B58A', // sand  — active, brand accent
  complete:    '#1E6B3C', // green — done
  cancelled:   '#B52A2A', // red   — cancelled
};

export default function Jobs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobs, setJobs]             = useState([]);
  const [view, setView]             = useState('week');
  const [date, setDate]             = useState(new Date());
  const [modal, setModal]           = useState(null); // null | 'create' | 'detail' | 'edit'
  const [selectedJob, setSelectedJob] = useState(null);
  const [defaultStart, setDefaultStart] = useState(null);
  const [loading, setLoading]       = useState(true);

  const loadJobs = useCallback(() => {
    api.get('/jobs').then(r => setJobs(r.data)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  // Open create modal when navigated here with ?new=1 (e.g. topbar button)
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setDefaultStart(new Date());
      setModal('create');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Map jobs → calendar events
  const events = jobs
    .filter(j => j.scheduled_at)
    .map(j => ({
      id:    j.id,
      title: `${j.service_type}${j.client_name ? ' — ' + j.client_name : ''}`,
      start: new Date(j.scheduled_at),
      end:   addHours(new Date(j.scheduled_at), 1),
      resource: j,
    }));

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
            selectable
            style={{ height: 620 }}
          />
        </div>
      )}

      {/* Create Job Modal */}
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

      {/* Job Detail Modal */}
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

      {/* Edit Job Modal */}
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
