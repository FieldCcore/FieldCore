import React from 'react';

const VARIANTS = {
  blue:   { bg: 'var(--blue-lt)',  color: 'var(--blue)'  },
  green:  { bg: 'var(--green-lt)', color: 'var(--green)' },
  red:    { bg: '#B52A2A',         color: '#fff'          },
  yellow: { bg: '#fef3c7',         color: '#92400e'       },
  gray:   { bg: 'var(--offwhite)', color: 'var(--slate)'  },
};

/**
 * STATUS_TO_VARIANT — canonical string-to-color mapping.
 *
 * Semantic rules:
 *   green  = success, complete, paid, connected, live, all-good
 *   blue   = informational, in-progress, pending, awaiting (not overdue)
 *   yellow = warning, needs attention soon, not yet failed
 *   red    = failure, overdue, blocked, disconnected, immediate action
 *   gray   = neutral, draft, archived, unknown, disabled
 */
const STATUS_TO_VARIANT = {
  // ── green — success / paid / complete / connected ───────────────
  paid:                    'green',
  complete:                'green',
  completed:               'green',
  connected:               'green',
  success:                 'green',
  verified:                'green',
  excellent:               'green',
  signed:                  'green',
  accepted:                'green',
  approved:                'green',
  collected:               'green',
  'payouts connected':     'green',
  'payouts active':        'green',
  'stripe connected':      'green',
  default:                 'green',
  live:                    'green',  // active jobs running = success
  'all paid':              'green',
  clear:                   'green',  // "Clear" on Active Jobs KPI = all good

  // ── blue — informational / pending / in-progress / awaiting ─────
  active:                  'blue',
  pending:                 'blue',
  in_progress:             'blue',
  'in progress':           'blue',
  scheduled:               'blue',
  info:                    'blue',
  trialing:                'blue',
  trial:                   'blue',
  connecting:              'blue',
  'onboarding started':    'blue',
  outstanding:             'blue',  // unpaid but not overdue — informational
  unpaid:                  'blue',  // owed but not failed
  'balance due':           'blue',  // amount owed, not a failure
  sent:                    'blue',  // sent and awaiting action — informational

  // ── yellow — warning / attention-soon / not-yet-failed ──────────
  warning:                 'yellow',
  'needs review':          'yellow',
  'setup required':        'yellow',
  'verification pending':  'yellow',
  'pending setup':         'yellow',
  'stripe pending':        'yellow',
  'most popular':          'yellow',
  'awaiting payment':      'yellow',  // payment due but not overdue
  'deposit due':           'yellow',  // upcoming deposit — not yet failed
  collect:                 'yellow',  // action needed soon — not failed
  syncing:                 'yellow',  // sync in progress — not broken

  // ── red — failure / overdue / blocked / action-required ─────────
  late:                    'red',
  overdue:                 'red',
  failed:                  'red',
  cancelled:               'red',
  canceled:                'red',
  declined:                'red',
  expired:                 'red',
  error:                   'red',
  'no-show':               'red',
  noshow:                  'red',
  no_show:                 'red',
  past_due:                'red',
  'past due':              'red',
  'action needed':         'red',
  'payment failed':        'red',
  'needs reconnect':       'red',  // GBP/integration disconnected = danger

  // ── gray — neutral / draft / archived / unknown ──────────────────
  draft:                   'gray',
  disabled:                'gray',
  'not connected':         'gray',
  inactive:                'gray',
  unknown:                 'gray',
  void:                    'gray',
  refunded:                'gray',
  available:               'gray',
  'no deposits':           'gray',
};

function toTitleCase(str) {
  return String(str).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function StatusBadge({ status, variant, children, style = {} }) {
  const key = (status || '').toLowerCase().replace(/_/g, ' ').trim();
  const v = variant || STATUS_TO_VARIANT[key] || 'gray';
  const colors = VARIANTS[v] || VARIANTS.gray;
  const label = children != null ? children : toTitleCase(status || '');

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      flexShrink: 0,
      padding: '2px 8px',
      borderRadius: 99,
      fontSize: 10.5,
      fontWeight: 600,
      fontFamily: 'Inter, sans-serif',
      letterSpacing: '.02em',
      whiteSpace: 'nowrap',
      lineHeight: 1.35,
      background: colors.bg,
      color: colors.color,
      ...style,
    }}>
      {label}
    </span>
  );
}
