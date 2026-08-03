import { useState, useEffect } from 'react';
import { getJobStatusPresentation } from '../domain/jobStatusPresentation';
import { formatTZ } from '../utils/calendarTimezone';

function BackIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 14, height: 14 }} aria-hidden="true">
      <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DragHandleIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 14, height: 14, flexShrink: 0 }} aria-hidden="true">
      <circle cx="5" cy="5"  r="1.25" fill="currentColor" />
      <circle cx="11" cy="5" r="1.25" fill="currentColor" />
      <circle cx="5" cy="11"  r="1.25" fill="currentColor" />
      <circle cx="11" cy="11" r="1.25" fill="currentColor" />
      <circle cx="5" cy="8"  r="1.25" fill="currentColor" />
      <circle cx="11" cy="8" r="1.25" fill="currentColor" />
    </svg>
  );
}

function fmtTime(iso, tz) {
  if (!iso) return '—';
  return tz
    ? formatTZ(new Date(iso), 'h:mm a', tz)
    : new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * DispatchRoutePanel
 *
 * Displays a technician's jobs for the day in route_order sequence.
 * Supports drag-to-reorder with a Save button.
 *
 * Props:
 *   tech        — technician object
 *   route       — result from GET /dispatch/technicians/:techId/route
 *   loading     — boolean
 *   saving      — boolean
 *   error       — string | null
 *   onSaveRoute — (techId, jobIds) => void
 *   onBack      — () => void
 *   timezone    — string
 */
export default function DispatchRoutePanel({ tech, route, loading, saving, error, onSaveRoute, onBack, timezone }) {
  const [orderedJobs, setOrderedJobs]   = useState([]);
  const [isDirty,     setIsDirty]       = useState(false);
  const [dragIdx,     setDragIdx]       = useState(null);
  const [dragOverIdx, setDragOverIdx]   = useState(null);

  // Sync when route loads or changes from outside
  useEffect(() => {
    if (route?.jobs) {
      setOrderedJobs(route.jobs);
      setIsDirty(false);
    }
  }, [route]);

  function handleDragStart(e, idx) {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e, idx) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(idx);
  }

  function handleDrop(e, dropIdx) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === dropIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const next = [...orderedJobs];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(dropIdx, 0, moved);
    setOrderedJobs(next);
    setIsDirty(true);
    setDragIdx(null);
    setDragOverIdx(null);
  }

  function handleDragEnd() {
    setDragIdx(null);
    setDragOverIdx(null);
  }

  function handleSave() {
    if (!tech?.id || !isDirty) return;
    onSaveRoute?.(tech.id, orderedJobs.map(j => j.id));
    setIsDirty(false);
  }

  function handleReset() {
    if (route?.jobs) {
      setOrderedJobs(route.jobs);
      setIsDirty(false);
    }
  }

  const hasCoords = orderedJobs.some(j => j.service_lat);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderBottom: '1px solid var(--lightgray)', flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to team"
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 6px', marginLeft: -6,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--slate)', fontSize: 11, fontWeight: 600, borderRadius: 4,
          }}
        >
          <BackIcon />
          Back
        </button>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>
          {tech?.name} — Route
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', minHeight: 0 }}>

        {loading && (
          <div style={{ color: 'var(--slate)', fontSize: 11, textAlign: 'center', marginTop: 24 }}>
            Loading route…
          </div>
        )}

        {error && (
          <div style={{
            background: '#FEE2E2', color: 'var(--red)', borderRadius: 4,
            padding: '7px 10px', fontSize: 11, marginBottom: 10,
          }}>
            {error}
          </div>
        )}

        {!loading && !error && orderedJobs.length === 0 && (
          <div style={{ color: 'var(--slate)', fontSize: 11, textAlign: 'center', marginTop: 24 }}>
            No jobs scheduled today.
          </div>
        )}

        {/* Summary row */}
        {!loading && orderedJobs.length > 0 && (
          <div style={{
            display: 'flex', gap: 12, marginBottom: 12,
            background: 'var(--off)', borderRadius: 6, padding: '7px 10px',
          }}>
            <div style={{ fontSize: 10, color: 'var(--slate)' }}>
              <span style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 12 }}>
                {orderedJobs.length}
              </span>{' '}jobs
            </div>
            {route?.totalDistanceKm > 0 && (
              <div style={{ fontSize: 10, color: 'var(--slate)' }}>
                <span style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 12 }}>
                  {(route.totalDistanceKm * 0.621371).toFixed(1)}
                </span>{' '}mi (straight-line)
              </div>
            )}
            {isDirty && (
              <div style={{ fontSize: 10, color: 'var(--amber)', fontWeight: 600, marginLeft: 'auto' }}>
                Unsaved changes
              </div>
            )}
          </div>
        )}

        {/* Drag-to-reorder list */}
        {!loading && orderedJobs.map((job, idx) => {
          const p       = getJobStatusPresentation(job.status);
          const isOver  = dragOverIdx === idx;
          const isDragging = dragIdx === idx;

          return (
            <div
              key={job.id}
              draggable
              onDragStart={e => handleDragStart(e, idx)}
              onDragOver={e  => handleDragOver(e, idx)}
              onDrop={e      => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '8px 0', borderBottom: '1px solid var(--lightgray)',
                opacity: isDragging ? 0.4 : 1,
                borderTop: isOver ? '2px solid var(--sand)' : '2px solid transparent',
                cursor: 'grab',
              }}
            >
              {/* Sequence number */}
              <div style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                background: 'var(--navy)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 800, marginTop: 1,
              }}>
                {idx + 1}
              </div>

              {/* Job info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', lineHeight: 1.3 }}>
                  {job.client_name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--slate)' }}>
                  {job.service_type} · {fmtTime(job.scheduled_at, timezone)}
                </div>
                {job.service_address && (
                  <div style={{ fontSize: 10, color: 'var(--steel)', marginTop: 1 }}>
                    {job.service_address}
                  </div>
                )}
                {job.distanceFromPrevKm != null && (
                  <div style={{ fontSize: 9, color: 'var(--steel)', marginTop: 1 }}>
                    {(job.distanceFromPrevKm * 0.621371).toFixed(1)} mi from prev
                  </div>
                )}
              </div>

              {/* Status badge + drag handle */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99,
                  background: p.badgeBg, color: p.badgeColor,
                }}>
                  {p.label}
                </span>
                <span style={{ color: 'var(--steel)' }}>
                  <DragHandleIcon />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer actions */}
      {!loading && orderedJobs.length > 0 && (
        <div style={{
          padding: '10px 14px', borderTop: '1px solid var(--lightgray)',
          display: 'flex', gap: 8, flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saving}
            aria-busy={saving}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 6, border: 'none',
              background: isDirty ? 'var(--sand)' : 'var(--lightgray)',
              color: isDirty ? '#fff' : 'var(--steel)',
              fontWeight: 700, fontSize: 12,
              cursor: isDirty && !saving ? 'pointer' : 'not-allowed',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save Route Order'}
          </button>
          {isDirty && (
            <button
              type="button"
              onClick={handleReset}
              style={{
                padding: '8px 12px', borderRadius: 6,
                border: '1px solid var(--lightgray)', background: '#fff',
                color: 'var(--navy)', fontWeight: 600, fontSize: 12, cursor: 'pointer',
              }}
            >
              Reset
            </button>
          )}
        </div>
      )}
    </div>
  );
}
