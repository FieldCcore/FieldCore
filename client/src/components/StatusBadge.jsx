import React from 'react';

const VARIANTS = {
  blue:   { bg: 'var(--blue-lt)',  color: 'var(--blue)'  },
  green:  { bg: 'var(--green-lt)', color: 'var(--green)' },
  red:    { bg: '#B52A2A',         color: '#fff'          },
  yellow: { bg: '#fef3c7',         color: '#92400e'      },
  gray:   { bg: 'var(--offwhite)', color: 'var(--slate)' },
};

const STATUS_TO_VARIANT = {
  // blue — active/pending/in-progress
  active:                  'blue',
  pending:                 'blue',
  in_progress:             'blue',
  'in progress':           'blue',
  scheduled:               'blue',
  info:                    'blue',
  trialing:                'blue',
  trial:                   'blue',
  connecting:              'blue',
  live:                    'blue',
  'onboarding started':    'blue',
  // green — paid/complete/connected/success
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
  // red — negative/action-required/failed
  outstanding:             'red',
  unpaid:                  'red',
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
  collect:                 'red',
  'action needed':         'red',
  'payment failed':        'red',
  'deposit due':           'red',
  'balance due':           'red',
  // yellow — warnings / neutral attention
  warning:                 'yellow',
  'needs review':          'yellow',
  'setup required':        'yellow',
  'verification pending':  'yellow',
  'pending setup':         'yellow',
  'stripe pending':        'yellow',
  'most popular':          'yellow',
  sent:                    'yellow',
  // gray — inactive/disabled/unknown
  draft:                   'gray',
  disabled:                'gray',
  'not connected':         'gray',
  inactive:                'gray',
  unknown:                 'gray',
  void:                    'gray',
  refunded:                'gray',
  available:               'gray',
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
