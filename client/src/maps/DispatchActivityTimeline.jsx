function BackIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 14, height: 14 }} aria-hidden="true">
      <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const EVENT_META = {
  'job.assigned':       { label: 'Assigned',       color: '#1C2333', bg: '#E8F5E9' },
  'job.reassigned':     { label: 'Reassigned',     color: '#B45309', bg: '#FEF3C7' },
  'route.saved':        { label: 'Route Saved',    color: '#0369A1', bg: '#E0F2FE' },
  'communication.sent': { label: 'Message Sent',   color: '#6A1B9A', bg: '#F3E8FF' },
  'emergency.on':       { label: 'Emergency On',   color: '#DC2626', bg: '#FEE2E2' },
  'emergency.off':      { label: 'Emergency Off',  color: '#2E7D32', bg: '#E8F5E9' },
};

function fmtAge(ts) {
  if (!ts) return '';
  const ms = Date.now() - new Date(ts).getTime();
  const m  = Math.floor(ms / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function eventLabel(eventType) {
  const meta = EVENT_META[eventType];
  if (meta) return meta.label;
  return eventType.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function eventDotStyle(eventType) {
  const meta = EVENT_META[eventType] || { color: '#5F667A', bg: '#F3F4F6' };
  return {
    width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 4,
    background: meta.color,
  };
}

function describeEvent(ev) {
  const actor = ev.actor_name_live || ev.actor_name || 'System';
  const d     = ev.details || {};

  switch (ev.event_type) {
    case 'job.assigned':
      return `Assigned by ${actor}`;
    case 'job.reassigned':
      return `Reassigned by ${actor}`;
    case 'route.saved':
      return `Route saved by ${actor} (${d.jobCount || '?'} jobs)`;
    case 'communication.sent': {
      const parts = [];
      if (d.clientNotified) parts.push('client');
      if (d.techNotified)   parts.push('tech');
      const who = parts.length ? parts.join(' & ') : 'unknown';
      return `Message sent to ${who} by ${actor}`;
    }
    case 'dispatch.emergency_mode.activated':
      return `Emergency mode activated by ${actor}`;
    case 'dispatch.emergency_mode.deactivated':
      return `Emergency mode deactivated by ${actor}`;
    default:
      return `${ev.event_type.replace(/[._]/g, ' ')} — ${actor}`;
  }
}

/**
 * DispatchActivityTimeline
 *
 * Shows dispatch events for a job or tech in reverse-chronological order.
 *
 * Props:
 *   subject   — { type: 'job'|'tech', id } | null
 *   events    — array from useDispatchActivity
 *   loading   — boolean
 *   error     — string | null
 *   onBack    — () => void
 *   title     — string (e.g. "Johnson HVAC — Activity")
 */
export default function DispatchActivityTimeline({ subject, events, loading, error, onBack, title }) {
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
          aria-label="Back"
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
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title || 'Activity'}
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', minHeight: 0 }}>
        {loading && (
          <div style={{ color: 'var(--slate)', fontSize: 11, textAlign: 'center', marginTop: 24 }}>
            Loading activity…
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

        {!loading && !error && events.length === 0 && (
          <div style={{ color: 'var(--slate)', fontSize: 11, textAlign: 'center', marginTop: 24 }}>
            No activity recorded yet.
          </div>
        )}

        {!loading && events.map((ev, idx) => (
          <div key={ev.id || idx} style={{
            display: 'flex', gap: 10, paddingBottom: 12,
            borderLeft: idx < events.length - 1 ? '1px solid var(--lightgray)' : 'none',
            marginLeft: 4, paddingLeft: 12,
          }}>
            <div style={{ ...eventDotStyle(ev.event_type), marginLeft: -16, marginTop: 3 }} aria-hidden="true" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', marginBottom: 1 }}>
                {eventLabel(ev.event_type)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--slate)', marginBottom: 2, lineHeight: 1.4 }}>
                {describeEvent(ev)}
              </div>
              <div style={{ fontSize: 9, color: 'var(--steel)' }}>
                {fmtAge(ev.created_at)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
