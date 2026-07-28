/**
 * FieldCore Status System — single source of truth.
 *
 * FOUR semantic tones only. Blue is a brand color, not a status color.
 *
 *  success  — healthy: paid, complete, connected, live, active, available
 *  warning  — needs attention soon: syncing, paused, expiring, due soon
 *  critical — business impact now: outstanding, awaiting payment, deposit
 *             pending, failed, overdue, needs reconnect, error
 *  neutral  — no active status: draft, archived, sent, scheduled, unknown
 *
 * Design rule: "FieldCore status colors communicate business impact,
 * not generic UI state. Blue is reserved for brand identity and must
 * never be used as a semantic status color."
 */

/** Tone → CSS-variable badge palette */
export const TONE_CSS = {
  success:  { bg: 'var(--green-lt)',  color: 'var(--green)'  },
  warning:  { bg: 'var(--yellow-lt)', color: 'var(--yellow)' },
  critical: { bg: 'var(--red-lt)',    color: 'var(--red)'    },
  neutral:  { bg: 'var(--off)',       color: 'var(--steel)'  },
};

/** Tone → hex badge palette (for inline styles that can't use CSS vars) */
export const TONE_HEX = {
  success:  { bg: '#E8F5E9', color: '#2E7D32' },
  warning:  { bg: '#FFF9DB', color: '#8A6D00' },
  critical: { bg: '#FFEBEE', color: '#C62828' },
  neutral:  { bg: '#EDEBE7', color: '#5F667A' },
};

/** Tone → solid hex for map markers, SVG dots, calendar event bars */
export const TONE_DOT = {
  success:  '#2E7D32',
  warning:  '#D4A000',
  critical: '#C62828',
  neutral:  '#8A90A2',
};

/**
 * Job status → semantic tone.
 *
 * Active progress = success (business is running).
 * Stuck / paused = warning (needs attention, not yet failed).
 * Cancelled / no-show = critical (business impact, lost revenue).
 * Not yet started = neutral (on the books, no action needed).
 */
export function jobStatusTone(status) {
  switch (status) {
    case 'in_progress':
    case 'partially_completed':
    case 'ready_for_inspection':
    case 'complete':              return 'success';
    case 'awaiting_client':
    case 'awaiting_parts':
    case 'paused':                return 'warning';
    case 'cancelled':
    case 'no_show':               return 'critical';
    default:                      return 'neutral'; // draft, unscheduled, scheduled
  }
}

/**
 * Session status → semantic tone.
 *
 * Moving toward completion = success.
 * Stopped / rescheduled = warning.
 * Missed / cancelled = critical.
 */
export function sessionStatusTone(status) {
  switch (status) {
    case 'en_route':
    case 'checked_in':
    case 'in_progress':
    case 'completed_for_day':  return 'success';
    case 'paused':
    case 'rescheduled':        return 'warning';
    case 'cancelled':
    case 'missed':             return 'critical';
    default:                   return 'neutral'; // scheduled
  }
}

/** Priority → semantic tone */
export function priorityTone(priority) {
  switch (priority) {
    case 'high':   return 'warning';
    case 'urgent': return 'critical';
    default:       return 'neutral';
  }
}

/** Resolve a tone to its hex badge style */
export function toneBadge(tone) {
  return TONE_HEX[tone] ?? TONE_HEX.neutral;
}

/** Resolve a tone to its solid dot / marker color */
export function toneDot(tone) {
  return TONE_DOT[tone] ?? TONE_DOT.neutral;
}
