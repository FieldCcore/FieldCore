/**
 * FieldCore semantic status-color system.
 *
 * Tones:
 *   success — live, paid, complete, connected, all clear
 *   info    — pending, in-progress, scheduled, awaiting (not overdue)
 *   warning — overdue-soon, needs attention, syncing, awaiting payment
 *   danger  — failed, overdue, blocked, disconnected, action required
 *   neutral — draft, archived, unknown, disabled
 *
 * Components that need inline hex values (SVG markers, canvas, mobile) should
 * import TONE_HEX or TONE_DOT. Components that can use CSS variables should
 * reference var(--green-lt) / var(--green) directly.
 */

/** Semantic tone → CSS-variable badge style */
export const TONE_CSS = {
  success: { bg: 'var(--green-lt)', color: 'var(--green)' },
  info:    { bg: 'var(--blue-lt)',  color: 'var(--blue)'  },
  warning: { bg: 'var(--amber-lt)', color: 'var(--amber)' },
  danger:  { bg: 'var(--red-lt)',   color: 'var(--red)'   },
  neutral: { bg: 'var(--off)',      color: 'var(--steel)' },
};

/** Semantic tone → hex badge style (for inline styles that can't use CSS vars) */
export const TONE_HEX = {
  success: { bg: '#E8F5E9', color: '#2E7D32' },
  info:    { bg: '#E3F2FD', color: '#1565C0' },
  warning: { bg: '#FFFBEB', color: '#92400e' },
  danger:  { bg: '#FEF2F2', color: '#991b1b' },
  neutral: { bg: '#EDEBE7', color: '#5F667A' },
};

/** Semantic tone → single solid hex (for map dots, calendar bars, SVG fills) */
export const TONE_DOT = {
  success: '#2E7D32',
  info:    '#1565C0',
  warning: '#D97706',
  danger:  '#C62828',
  neutral: '#8A90A2',
};

/** Job status → semantic tone */
export function jobStatusTone(status) {
  switch (status) {
    case 'complete':             return 'success';
    case 'in_progress':
    case 'partially_completed':
    case 'awaiting_client':
    case 'awaiting_parts':
    case 'ready_for_inspection': return 'info';
    case 'paused':               return 'warning';
    case 'cancelled':
    case 'no_show':              return 'danger';
    default:                     return 'neutral'; // scheduled, draft, unscheduled
  }
}

/** Session status → semantic tone */
export function sessionStatusTone(status) {
  switch (status) {
    case 'checked_in':
    case 'completed_for_day':    return 'success';
    case 'en_route':
    case 'in_progress':          return 'info';
    case 'paused':
    case 'rescheduled':          return 'warning';
    case 'cancelled':
    case 'missed':               return 'danger';
    default:                     return 'neutral'; // scheduled
  }
}

/** Job priority → semantic tone */
export function priorityTone(priority) {
  switch (priority) {
    case 'high':   return 'warning';
    case 'urgent': return 'danger';
    default:       return 'neutral';
  }
}

/** Convenience: resolve a tone to its hex badge style */
export function toneBadge(tone) {
  return TONE_HEX[tone] ?? TONE_HEX.neutral;
}

/** Convenience: resolve a tone to its solid dot color */
export function toneDot(tone) {
  return TONE_DOT[tone] ?? TONE_DOT.neutral;
}
