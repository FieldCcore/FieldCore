// Compact persistent banner for denied or unavailable location permission.
// Replaces the inline red error inside DispatchMapControls — that dropdown
// space is too small and the error should not repeat on every click.
//
// Shows in two variants:
//   first_visit — explain + Enable Location + Not Now (permission = prompt, first dispatch visit)
//   denied      — guidance + Try Again + Open Instructions + optional Dismiss
//
// pointerEvents: 'auto' is required because the parent overlay has pointer-events:none.

import { useState } from 'react';

const WRAP = {
  pointerEvents: 'auto',
  position:      'absolute',
  bottom:        16,
  left:          '50%',
  transform:     'translateX(-50%)',
  zIndex:        6,
  maxWidth:      560,
  width:         'calc(100% - 48px)',
};

const CARD = (color) => ({
  background:   '#fff',
  border:       `1px solid ${color}`,
  borderRadius: 8,
  padding:      '10px 14px',
  boxShadow:    '0 2px 10px rgba(0,0,0,.10)',
  display:      'flex',
  flexDirection:'column',
  gap:          8,
});

const ROW = {
  display:    'flex',
  alignItems: 'center',
  gap:        10,
};

const BTN_SM = (primary = false) => ({
  padding:      '5px 12px',
  borderRadius: 6,
  border:       primary ? 'none' : '1px solid #E6E6E6',
  background:   primary ? '#1C2333' : 'none',
  color:        primary ? '#fff' : '#1C2333',
  fontSize:     11,
  fontWeight:   600,
  fontFamily:   'inherit',
  cursor:       'pointer',
  whiteSpace:   'nowrap',
});

function DotIcon({ color }) {
  return (
    <svg viewBox="0 0 14 14" fill="none" style={{ width: 14, height: 14, flexShrink: 0 }}>
      <circle cx="7" cy="7" r="6" stroke={color} strokeWidth="1.4" />
      <circle cx="7" cy="7" r="2.5" fill={color} />
    </svg>
  );
}

/**
 * Props:
 *  variant       'first_visit' | 'denied' | 'unavailable'
 *  onEnable      () => void   — called when user clicks Enable Location (first_visit)
 *  onSkip        () => void   — called when user clicks Not Now (first_visit)
 *  onTryAgain    () => void   — called when user clicks Try Again (denied)
 *  onOpenHelp    () => void   — opens LocationInstructionsModal
 *  onDismiss     () => void   — hides this banner for the session (office users)
 *  isEnabling    bool         — true while location request is in progress
 *  dismissable   bool         — show Dismiss button (office users, denied variant)
 */
export default function LocationPermissionBanner({
  variant      = 'denied',
  onEnable,
  onSkip,
  onTryAgain,
  onOpenHelp,
  onDismiss,
  isEnabling   = false,
  dismissable  = true,
}) {
  const [localDismissed, setLocalDismissed] = useState(false);
  if (localDismissed) return null;

  function handleDismiss() {
    setLocalDismissed(true);
    onDismiss?.();
  }

  if (variant === 'first_visit') {
    return (
      <div style={WRAP} role="status" aria-live="polite">
        <div style={CARD('#D6B58A')}>
          <div style={{ ...ROW, gap: 8 }}>
            <DotIcon color="#D97706" />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#1C2333', flex: 1 }}>
              Enable location for a better Dispatch experience
            </span>
          </div>
          <p style={{ fontSize: 11, color: '#5F667A', margin: 0, lineHeight: 1.5 }}>
            FieldCore uses your location to center the map, track active field technicians,
            and display nearby jobs. You can change this at any time in browser settings.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onEnable}
              disabled={isEnabling}
              style={{ ...BTN_SM(true), opacity: isEnabling ? 0.6 : 1 }}
            >
              {isEnabling ? 'Requesting…' : 'Enable Location'}
            </button>
            <button type="button" onClick={onSkip} style={BTN_SM(false)}>
              Not Now
            </button>
          </div>
        </div>
      </div>
    );
  }

  // denied / unavailable
  const isDenied = variant === 'denied';
  const color    = isDenied ? '#C62828' : '#D97706';
  const msg      = isDenied
    ? 'Location access is off. Enable location in your browser settings to use Center on Me and live GPS features.'
    : 'Your current location could not be determined. GPS may be unavailable on this device.';

  return (
    <div style={WRAP} role="alert" aria-live="assertive">
      <div style={CARD(color)}>
        <div style={{ ...ROW }}>
          <DotIcon color={color} />
          <span style={{ fontSize: 11, color: '#1C2333', flex: 1, lineHeight: 1.4 }}>{msg}</span>
          {dismissable && (
            <button type="button" onClick={handleDismiss} aria-label="Dismiss location warning"
              style={{ background: 'none', border: 'none', color: '#8A90A2', fontSize: 16,
                       lineHeight: 1, cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}>
              ×
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isDenied && (
            <button type="button" onClick={onOpenHelp} style={BTN_SM(true)}>
              Open Browser Instructions
            </button>
          )}
          {onTryAgain && (
            <button type="button" onClick={onTryAgain} style={BTN_SM(false)}>
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
