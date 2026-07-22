import React, { useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronRight, Plus, Edit2, CalendarDays, Clock, Users, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../api';
import AddSessionModal from './AddSessionModal';
import SessionCloseoutModal from './SessionCloseoutModal';

const SESSION_STATUS_COLOR = {
  scheduled:         { bg: '#EFF6FF', color: '#1d4ed8', label: 'Scheduled' },
  en_route:          { bg: '#FFF7ED', color: '#c2410c', label: 'En Route' },
  checked_in:        { bg: '#ECFDF5', color: '#065f46', label: 'Checked In' },
  in_progress:       { bg: '#FFFBEB', color: '#92400e', label: 'In Progress' },
  paused:            { bg: '#F5F3FF', color: '#5b21b6', label: 'Paused' },
  completed_for_day: { bg: '#F0FDF4', color: '#166534', label: 'Completed for Day' },
  rescheduled:       { bg: '#FFF7ED', color: '#92400e', label: 'Rescheduled' },
  cancelled:         { bg: '#FEF2F2', color: '#991b1b', label: 'Cancelled' },
  missed:            { bg: '#FEF2F2', color: '#7f1d1d', label: 'Missed' },
};

function SessionStatusBadge({ status }) {
  const s = SESSION_STATUS_COLOR[status] || { bg: '#f1f5f9', color: '#475569', label: status };
  return (
    <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: 99,
      fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

function SessionCard({ session, jobId, sessionIndex, totalSessions, isAdmin, onUpdated }) {
  const [open,      setOpen]      = useState(false);
  const [editing,   setEditing]   = useState(false);
  const [closing,   setClosing]   = useState(false);
  const [updating,  setUpdating]  = useState(false);

  const dateLabel = session.scheduled_date
    ? format(new Date(session.scheduled_date + 'T12:00:00'), 'EEE, MMM d, yyyy')
    : '—';

  const timeLabel = session.start_time
    ? `${session.start_time.slice(0,5)}${session.end_time ? ' – ' + session.end_time.slice(0,5) : ''}`
    : 'Time TBD';

  async function updateStatus(status) {
    setUpdating(true);
    try {
      const res = await api.patch(`/jobs/${jobId}/sessions/${session.id}/status`, { status });
      onUpdated(res.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not update status.');
    } finally {
      setUpdating(false);
    }
  }

  const isCompleted = session.status === 'completed_for_day';
  const isCancelled = session.status === 'cancelled';

  return (
    <div style={{
      border: '1px solid var(--lightgray)', borderRadius: 10, overflow: 'hidden',
      opacity: isCancelled ? 0.6 : 1,
      background: isCompleted ? '#f0fdf4' : 'var(--white)',
    }}>
      {/* Session header */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer',
          borderBottom: open ? '1px solid var(--lightgray)' : 'none' }}
        onClick={() => setOpen(v => !v)}
      >
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>
              Session {sessionIndex + 1}
              {totalSessions > 0 && <span style={{ fontWeight: 400, color: 'var(--steel)' }}> of {totalSessions}</span>}
            </span>
            {session.title && (
              <span style={{ fontSize: 12, color: 'var(--slate)' }}>— {session.title}</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--steel)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <CalendarDays size={11} /> {dateLabel}
            </span>
            <span style={{ fontSize: 12, color: 'var(--steel)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Clock size={11} /> {timeLabel}
            </span>
            {session.techs?.length > 0 && (
              <span style={{ fontSize: 12, color: 'var(--steel)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Users size={11} /> {session.techs.map(t => t.tech_name).join(', ')}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {session.completion_pct > 0 && (
            <span style={{ fontSize: 11, color: 'var(--steel)' }}>{session.completion_pct}%</span>
          )}
          <SessionStatusBadge status={session.status} />
        </div>
      </div>

      {/* Expanded body */}
      {open && (
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {session.description && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)' }}>{session.description}</p>
          )}

          {session.work_completed && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>
                Work Completed
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--navy)' }}>{session.work_completed}</p>
            </div>
          )}

          {session.work_remaining && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>
                Remaining Work
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--navy)' }}>{session.work_remaining}</p>
            </div>
          )}

          {session.blockers && (
            <div style={{ background: '#fff7ed', borderRadius: 6, padding: '8px 12px',
              display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AlertCircle size={14} style={{ color: '#c2410c', marginTop: 1, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 2 }}>Blockers</div>
                <p style={{ margin: 0, fontSize: 13, color: '#78350f' }}>{session.blockers}</p>
              </div>
            </div>
          )}

          {session.internal_notes && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>
                Internal Notes
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--navy)' }}>{session.internal_notes}</p>
            </div>
          )}

          {(session.estimated_hours || session.actual_hours) && (
            <div style={{ display: 'flex', gap: 20 }}>
              {session.estimated_hours && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--steel)' }}>Est. Hours</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{parseFloat(session.estimated_hours).toFixed(1)}</div>
                </div>
              )}
              {session.actual_hours && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--steel)' }}>Actual Hours</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{parseFloat(session.actual_hours).toFixed(1)}</div>
                </div>
              )}
            </div>
          )}

          {/* Session actions */}
          {!isCancelled && isAdmin && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--lightgray)', paddingTop: 12 }}>
              {!isCompleted && (
                <>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
                    onClick={() => setClosing(true)}
                    disabled={updating}
                  >
                    <CheckCircle2 size={13} /> Complete for the Day
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
                    onClick={() => setEditing(true)}
                  >
                    <Edit2 size={13} /> Edit Session
                  </button>
                  {session.status !== 'in_progress' && (
                    <button
                      className="btn-secondary"
                      style={{ fontSize: 12, padding: '5px 12px' }}
                      onClick={() => updateStatus('in_progress')}
                      disabled={updating}
                    >
                      Mark In Progress
                    </button>
                  )}
                </>
              )}
              {isCompleted && (
                <button
                  className="btn-secondary"
                  style={{ fontSize: 12, padding: '5px 12px' }}
                  onClick={() => setClosing(true)}
                >
                  <Edit2 size={13} style={{ display: 'inline' }} /> Edit Closeout
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {editing && (
        <AddSessionModal
          jobId={jobId}
          session={session}
          onSave={updated => { setEditing(false); onUpdated(updated); }}
          onCancel={() => setEditing(false)}
        />
      )}

      {closing && (
        <SessionCloseoutModal
          session={session}
          jobId={jobId}
          onComplete={updated => { setClosing(false); onUpdated(updated); }}
          onCancel={() => setClosing(false)}
        />
      )}
    </div>
  );
}

export default function MultiDaySessionsPanel({ job, sessions, onSessionsChange, isAdmin }) {
  const [addingSession, setAddingSession] = useState(false);

  function handleSessionUpdated(updated) {
    onSessionsChange(prev =>
      prev.map(s => s.id === updated.id ? updated : s)
    );
  }

  const completed = sessions.filter(s => s.status === 'completed_for_day').length;
  const remaining = sessions.filter(s => !['completed_for_day','cancelled'].includes(s.status)).length;
  const totalHours = sessions.reduce((sum, s) => sum + parseFloat(s.actual_hours || 0), 0);
  const estHours   = sessions.reduce((sum, s) => sum + parseFloat(s.estimated_hours || 0), 0);

  return (
    <div className="jd-section">
      {/* Panel header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>Work Sessions</div>
          <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>
            {completed} completed · {remaining} remaining
            {totalHours > 0 && ` · ${totalHours.toFixed(1)}h logged`}
            {estHours > 0 && ` / ${estHours.toFixed(1)}h est`}
          </div>
        </div>
        {isAdmin && (
          <button
            className="btn-secondary"
            style={{ fontSize: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
            onClick={() => setAddingSession(true)}
          >
            <Plus size={13} /> Add Workday
          </button>
        )}
      </div>

      {/* Progress bar */}
      {sessions.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ height: 6, background: 'var(--lightgray)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, (completed / sessions.length) * 100)}%`,
              background: 'var(--sand)',
              borderRadius: 99,
              transition: 'width .3s',
            }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 4 }}>
            {sessions.length === 0 ? 'No sessions yet' : `${Math.round((completed / sessions.length) * 100)}% of sessions completed`}
          </div>
        </div>
      )}

      {/* Session cards */}
      {sessions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--steel)', fontSize: 13 }}>
          No work sessions scheduled yet.
          {isAdmin && (
            <div style={{ marginTop: 8 }}>
              <button className="btn-secondary" onClick={() => setAddingSession(true)}>
                <Plus size={13} style={{ display: 'inline', marginRight: 4 }} />Add First Session
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sessions.map((session, idx) => (
            <SessionCard
              key={session.id}
              session={session}
              jobId={job.id}
              sessionIndex={idx}
              totalSessions={sessions.length}
              isAdmin={isAdmin}
              onUpdated={handleSessionUpdated}
            />
          ))}
        </div>
      )}

      {addingSession && (
        <AddSessionModal
          jobId={job.id}
          onSave={newSession => {
            setAddingSession(false);
            onSessionsChange(prev => [...prev, newSession]);
          }}
          onCancel={() => setAddingSession(false)}
        />
      )}
    </div>
  );
}
