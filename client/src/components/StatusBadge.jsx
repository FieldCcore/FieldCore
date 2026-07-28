import React from 'react';

/**
 * StatusBadge — canonical FieldCore status badge.
 *
 * Exposes four semantic variants. Blue is NOT a status color.
 *
 *   success  — green: paid, complete, connected, live, active
 *   warning  — yellow: syncing, paused, due soon, expiring soon
 *   critical — red:  outstanding, awaiting payment, failed, overdue
 *   neutral  — gray: draft, archived, scheduled, unknown
 *
 * Pass `status` (string key) to use the canonical mapping,
 * or override with `variant` for one-off cases.
 */

const VARIANTS = {
  success:  { bg: 'var(--green-lt)',  color: 'var(--green)'  },
  warning:  { bg: 'var(--yellow-lt)', color: 'var(--yellow)' },
  critical: { bg: 'var(--red-lt)',    color: 'var(--red)'    },
  neutral:  { bg: 'var(--off)',       color: 'var(--steel)'  },
  // legacy aliases kept for smooth migration
  green:    { bg: 'var(--green-lt)',  color: 'var(--green)'  },
  red:      { bg: '#B52A2A',          color: '#fff'           },
  yellow:   { bg: 'var(--yellow-lt)', color: 'var(--yellow)' },
  gray:     { bg: 'var(--off)',       color: 'var(--steel)'  },
};

/**
 * Canonical status-string → variant.
 *
 * Semantic rules:
 *   success  = healthy, done, connected, active, working
 *   warning  = needs attention soon, not yet failed
 *   critical = business impact NOW (money outstanding, failed, blocked)
 *   neutral  = not started, archived, sent, scheduled, unknown
 */
const STATUS_TO_VARIANT = {
  // ── success — healthy, complete, active ──────────────────────
  paid:                    'success',
  complete:                'success',
  completed:               'success',
  connected:               'success',
  success:                 'success',
  verified:                'success',
  excellent:               'success',
  signed:                  'success',
  accepted:                'success',
  approved:                'success',
  collected:               'success',
  'payouts connected':     'success',
  'payouts active':        'success',
  'stripe connected':      'success',
  default:                 'success',
  live:                    'success',
  active:                  'success',
  in_progress:             'success',
  'in progress':           'success',
  available:               'success',
  'all paid':              'success',
  clear:                   'success',
  healthy:                 'success',
  synced:                  'success',

  // ── warning — needs attention, not yet failed ────────────────
  warning:                 'warning',
  'needs review':          'warning',
  'setup required':        'warning',
  'verification pending':  'warning',
  'pending setup':         'warning',
  'stripe pending':        'warning',
  'most popular':          'warning',
  syncing:                 'warning',
  connecting:              'warning',
  paused:                  'warning',
  rescheduled:             'warning',
  'awaiting_client':       'warning',
  'awaiting_parts':        'warning',
  'awaiting client':       'warning',
  'awaiting parts':        'warning',
  'due soon':              'warning',
  'expiring soon':         'warning',
  'awaiting approval':     'warning',
  'reminder sent':         'warning',

  // ── critical — business impact NOW ──────────────────────────
  outstanding:             'critical', // money owed = critical
  unpaid:                  'critical',
  'balance due':           'critical',
  pending:                 'critical', // generic pending = money outstanding in FieldCore
  'awaiting payment':      'critical', // money waiting to be collected
  'deposit due':           'critical',
  collect:                 'critical',
  'deposit pending':       'critical',
  late:                    'critical',
  overdue:                 'critical',
  failed:                  'critical',
  cancelled:               'critical',
  canceled:                'critical',
  declined:                'critical',
  expired:                 'critical',
  error:                   'critical',
  'no-show':               'critical',
  noshow:                  'critical',
  no_show:                 'critical',
  past_due:                'critical',
  'past due':              'critical',
  'action needed':         'critical',
  'payment failed':        'critical',
  'needs reconnect':       'critical',
  blocked:                 'critical',

  // ── neutral — no active status ───────────────────────────────
  draft:                   'neutral',
  disabled:                'neutral',
  'not connected':         'neutral',
  inactive:                'neutral',
  unknown:                 'neutral',
  void:                    'neutral',
  refunded:                'neutral',
  sent:                    'neutral', // sent, awaiting — no action needed from us
  scheduled:               'neutral', // on the calendar, not yet started
  'no deposits':           'neutral',
  'no reviews':            'neutral',
  archived:                'neutral',
  'onboarding started':    'neutral',
};

function toTitleCase(str) {
  return String(str).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function StatusBadge({ status, variant, children, style = {} }) {
  const key = (status || '').toLowerCase().replace(/_/g, ' ').trim();
  const v = variant || STATUS_TO_VARIANT[key] || 'neutral';
  const colors = VARIANTS[v] || VARIANTS.neutral;
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
