function BackIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 14, height: 14 }} aria-hidden="true">
      <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const EVENT_META = {
  'job.created':              { label: 'Job Created',          color: '#2E7D32', bg: '#E8F5E9' },
  'job.updated':              { label: 'Job Updated',          color: '#1C2333', bg: '#F3F4F6' },
  'job.rescheduled':          { label: 'Rescheduled',          color: '#B45309', bg: '#FEF3C7' },
  'job.assigned':             { label: 'Assigned',             color: '#0369A1', bg: '#E0F2FE' },
  'job.reassigned':           { label: 'Reassigned',           color: '#B45309', bg: '#FEF3C7' },
  'job.unassigned':           { label: 'Unassigned',           color: '#5F667A', bg: '#F3F4F6' },
  'job.started':              { label: 'Started',              color: '#0369A1', bg: '#E0F2FE' },
  'job.completed':            { label: 'Completed',            color: '#2E7D32', bg: '#E8F5E9' },
  'job.cancelled':            { label: 'Cancelled',            color: '#C62828', bg: '#FEE2E2' },
  'job.reopened':             { label: 'Reopened',             color: '#2E7D32', bg: '#E8F5E9' },
  'job.address_selected':     { label: 'Address Added',        color: '#0369A1', bg: '#E0F2FE' },
  'job.address_updated':      { label: 'Address Updated',      color: '#0369A1', bg: '#E0F2FE' },
  'job.geocode_requested':    { label: 'Location Lookup',      color: '#5F667A', bg: '#F3F4F6' },
  'job.geocode_resolved':     { label: 'Address Located',      color: '#0369A1', bg: '#E0F2FE' },
  'job.geocode_failed':       { label: 'Location Failed',      color: '#C62828', bg: '#FEE2E2' },
  'job.map_location_set':     { label: 'Map Location Set',     color: '#0369A1', bg: '#E0F2FE' },
  'job.emergency_activated':  { label: 'Emergency Declared',   color: '#DC2626', bg: '#FEE2E2' },
  'job.emergency_updated':    { label: 'Emergency Updated',    color: '#DC2626', bg: '#FFF3CD' },
  'job.emergency_acknowledged':{ label: 'Emergency Acknowledged', color: '#B45309', bg: '#FEF3C7' },
  'job.emergency_resolved':   { label: 'Emergency Resolved',   color: '#2E7D32', bg: '#E8F5E9' },
  'job.emergency_deactivated':{ label: 'Emergency Deactivated',color: '#5F667A', bg: '#F3F4F6' },
  'job.emergency_priority_changed': { label: 'Priority Changed', color: '#DC2626', bg: '#FEE2E2' },
  'job.communication_sent':   { label: 'Update Sent',          color: '#6A1B9A', bg: '#F3E8FF' },
  'job.communication_failed': { label: 'Message Failed',       color: '#C62828', bg: '#FEE2E2' },
  'job.communication_delivered':{ label: 'Message Delivered',  color: '#2E7D32', bg: '#E8F5E9' },
  'job.route_updated':        { label: 'Route Saved',          color: '#0369A1', bg: '#E0F2FE' },
  // Legacy event types from dispatch_activity_log (pre-normalized)
  'job.geocoded':             { label: 'Address Located',      color: '#0369A1', bg: '#E0F2FE' },
  'job.geocode_failed_legacy':{ label: 'Location Failed',      color: '#C62828', bg: '#FEE2E2' },
  'route.saved':              { label: 'Route Saved',          color: '#0369A1', bg: '#E0F2FE' },
  'communication.sent':       { label: 'Update Sent',          color: '#6A1B9A', bg: '#F3E8FF' },
};

const CATEGORY_FILTERS = [
  { key: null,             label: 'All' },
  { key: 'emergency',      label: 'Emergency' },
  { key: 'job',            label: 'Job' },
  { key: 'communication',  label: 'Messages' },
  { key: 'location',       label: 'Location' },
  { key: 'dispatch',       label: 'Dispatch' },
];

function fmtEventTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const ms  = now - d;
  const m   = Math.floor(ms / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  // Show date for older events
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function eventLabel(ev) {
  const meta = EVENT_META[ev.event_type];
  if (meta) return meta.label;
  return ev.event_type.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function eventDotStyle(eventType) {
  const meta = EVENT_META[eventType] || { color: '#5F667A', bg: '#F3F4F6' };
  return { width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 4, background: meta.color };
}

function sourceBadge(source) {
  if (source === 'historical_backfill') {
    return (
      <span style={{
        fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
        background: '#F3F4F6', color: '#8A90A2', marginLeft: 4, verticalAlign: 'middle',
      }} title="Reconstructed from saved data">
        HISTORICAL
      </span>
    );
  }
  return null;
}

function describeEvent(ev) {
  // Use persisted summary when available
  if (ev.summary) return ev.summary;

  const actor = ev.actor_name || 'System';
  const d     = typeof ev.metadata === 'string'
    ? JSON.parse(ev.metadata || '{}')
    : (ev.metadata || ev.details || {});

  switch (ev.event_type) {
    case 'job.created':      return `Job created by ${actor}`;
    case 'job.assigned':     return `Assigned by ${actor}`;
    case 'job.reassigned':   return `Reassigned by ${actor}`;
    case 'job.cancelled':    return d.reason ? `Cancelled by ${actor} — ${d.reason}` : `Cancelled by ${actor}`;
    case 'job.reopened':     return `Reopened by ${actor}`;
    case 'job.geocode_resolved': case 'job.geocoded':
      return 'Address located on map';
    case 'job.geocode_failed': case 'job.geocode_failed_legacy':
      return 'Address could not be located';
    case 'job.emergency_activated': {
      const p = (d.priority || '').toUpperCase();
      return `Emergency declared${p ? ` (${p})` : ''} by ${actor}`;
    }
    case 'job.emergency_updated':    return `Emergency updated by ${actor}`;
    case 'job.emergency_resolved':   return d.notes ? `Emergency resolved by ${actor} — ${d.notes}` : `Emergency resolved by ${actor}`;
    case 'job.emergency_deactivated':return d.reason ? `Emergency deactivated by ${actor} — ${d.reason}` : `Emergency deactivated by ${actor}`;
    case 'route.saved': case 'job.route_updated':
      return `Route saved by ${actor}${d.jobCount ? ` (${d.jobCount} jobs)` : ''}`;
    case 'communication.sent': case 'job.communication_sent': {
      const parts = [];
      if (d.clientNotified) parts.push('client');
      if (d.techNotified)   parts.push('tech');
      const who = parts.length ? parts.join(' & ') : 'recipient';
      return `Update sent to ${who} by ${actor}`;
    }
    default:
      return `${ev.event_type.replace(/[._]/g, ' ')} — ${actor}`;
  }
}

/**
 * DispatchActivityTimeline
 *
 * Shows dispatch events for a job or tech, newest first.
 *
 * Props:
 *   subject          — { type: 'job'|'tech', id } | null
 *   events           — array of activity items from useDispatchActivity
 *   loading          — boolean
 *   error            — string | null (distinct from empty)
 *   hasData          — boolean (true once a successful fetch has run)
 *   onBack           — () => void
 *   title            — string
 *   onRetry          — () => void
 *   activeCategory   — string | null (current filter)
 *   onCategoryFilter — (cat: string|null) => void
 */
export default function DispatchActivityTimeline({
  subject, events, loading, error, hasData,
  onBack, title, onRetry, activeCategory, onCategoryFilter,
}) {
  const showFilters = !loading && !error && (hasData || events.length > 0);

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
        <span style={{
          fontSize: 12, fontWeight: 700, color: 'var(--navy)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title || 'Activity'}
        </span>
      </div>

      {/* Category filter chips */}
      {showFilters && onCategoryFilter && (
        <div style={{
          display: 'flex', gap: 4, padding: '8px 14px 0',
          overflowX: 'auto', flexShrink: 0,
        }}>
          {CATEGORY_FILTERS.map(f => (
            <button
              key={String(f.key)}
              type="button"
              onClick={() => onCategoryFilter(f.key)}
              style={{
                flexShrink: 0, fontSize: 10, fontWeight: 600,
                padding: '3px 8px', borderRadius: 99,
                border: '1px solid',
                borderColor: activeCategory === f.key ? 'var(--navy)' : 'var(--lightgray)',
                background:  activeCategory === f.key ? 'var(--navy)' : 'transparent',
                color:       activeCategory === f.key ? '#fff'       : 'var(--slate)',
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', minHeight: 0 }}>

        {/* Loading skeleton */}
        {loading && (
          <div style={{ color: 'var(--slate)', fontSize: 11, textAlign: 'center', marginTop: 24 }}>
            Loading activity…
          </div>
        )}

        {/* Error state — distinct from empty */}
        {!loading && error && (
          <div style={{ marginTop: 16 }}>
            <div style={{
              background: '#FEE2E2', color: '#C62828', borderRadius: 6,
              padding: '10px 12px', fontSize: 11, marginBottom: 10, lineHeight: 1.5,
            }}>
              {error}
            </div>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                style={{
                  width: '100%', padding: '7px', borderRadius: 6,
                  border: '1px solid var(--lightgray)', background: 'none',
                  fontSize: 11, fontWeight: 600, color: 'var(--navy)', cursor: 'pointer',
                }}
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* Honest empty state — only when request succeeded but no events exist */}
        {!loading && !error && events.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: 32, color: 'var(--slate)', fontSize: 11, lineHeight: 1.7 }}>
            <div style={{ fontSize: 18, marginBottom: 8 }}>📋</div>
            {activeCategory ? (
              <>No {activeCategory} events recorded for this job.</>
            ) : (
              <>No activity has been recorded for this job yet.</>
            )}
          </div>
        )}

        {/* Events list */}
        {!loading && !error && events.map((ev, idx) => (
          <div
            key={ev.id || idx}
            style={{
              display: 'flex', gap: 10, paddingBottom: 12,
              borderLeft: idx < events.length - 1 ? '1px solid var(--lightgray)' : 'none',
              marginLeft: 4, paddingLeft: 12,
            }}
          >
            <div style={{ ...eventDotStyle(ev.event_type), marginLeft: -16, marginTop: 3 }} aria-hidden="true" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', marginBottom: 1 }}>
                {eventLabel(ev)}
                {sourceBadge(ev.source)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--slate)', marginBottom: 2, lineHeight: 1.4 }}>
                {describeEvent(ev)}
              </div>
              <div style={{ fontSize: 9, color: 'var(--steel)' }}>
                {fmtEventTime(ev.occurred_at || ev.created_at)}
                {ev.actor_name && ev.actor_type !== 'system' && (
                  <span style={{ marginLeft: 4 }}>· {ev.actor_name}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
