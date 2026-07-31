import React from 'react';

// Compact map control overlay for the Dispatch page.
// Must set pointerEvents: 'auto' — parent .dispatch-map-overlays uses
// pointer-events: none so the Google map remains pannable everywhere
// outside this card. Without auto here, buttons are unclickable.
//
// Location errors (denied/unavailable) are shown in LocationPermissionBanner,
// not here. This card stays clean regardless of permission state.

const CARD_STYLE = {
  position:      'absolute',
  top:           16,
  right:         16,
  zIndex:        5,
  background:    'rgba(255,255,255,0.97)',
  border:        '1px solid var(--lightgray, #e6e6e6)',
  borderRadius:  8,
  boxShadow:     '0 2px 8px rgba(0,0,0,.10)',
  minWidth:      148,
  overflow:      'hidden',
  pointerEvents: 'auto',
};

const BTN = {
  display:      'flex',
  alignItems:   'center',
  gap:          6,
  width:        '100%',
  padding:      '7px 11px',
  background:   'none',
  border:       'none',
  borderRadius: 6,
  fontSize:     12,
  fontWeight:   600,
  fontFamily:   'inherit',
  color:        'var(--navy)',
  cursor:       'pointer',
  textAlign:    'left',
  whiteSpace:   'nowrap',
  transition:   'background .1s',
};

const BTN_HOVER = { background: 'var(--off-white, #f8f8f7)' };

function Icon({ d, size = 14 }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: size, height: size, flexShrink: 0 }}>
      <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICONS = {
  fitAll:   'M2 5.5V2h3.5M2 10.5V14h3.5M14 5.5V2h-3.5M14 10.5V14h-3.5M6 8h4M8 6v4',
  centerMe: 'M8 3v1M8 12v1M3 8h1M12 8h1M8 8m-3 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0',
  recenter: 'M8 1v2M8 13v2M1 8h2M13 8h2M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
};

// Small dot indicating location permission status
const PERM_DOT = {
  granted:    { color: '#2E7D32', title: 'Location on'        },
  prompt:     { color: '#D97706', title: 'Location not enabled' },
  denied:     { color: '#C62828', title: 'Location blocked'    },
  unavailable:{ color: '#8A90A2', title: 'Location unavailable' },
  unsupported:{ color: '#8A90A2', title: 'Location unsupported' },
};

function CtrlBtn({ label, iconPath, onClick, disabled, title }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button"
      title={title || label}
      aria-label={label}
      onClick={onClick}
      disabled={!!disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...BTN,
        ...(hover && !disabled ? BTN_HOVER : {}),
        opacity: disabled ? 0.45 : 1,
        cursor:  disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <Icon d={iconPath} />
      {label}
    </button>
  );
}

/**
 * Dispatch map controls overlay.
 *
 * Props:
 *  onFitAll()        — recompute + apply viewport from all current data
 *  onCenterOnMe()    — smart handler: requests location or opens help panel
 *  onRecenter()      — restore automatic tenant-aware viewport
 *  locating          — bool: geolocation request in progress
 *  hasInteracted     — bool: user has manually panned/zoomed (shows Recenter)
 *  mapReady          — bool: map instance is live (disables buttons while loading)
 *  permState         — 'unknown'|'prompt'|'granted'|'denied'|'unavailable'|'unsupported'
 */
export default function DispatchMapControls({
  onFitAll,
  onCenterOnMe,
  onRecenter,
  locating,
  hasInteracted,
  mapReady  = true,
  permState = 'unknown',
}) {
  const centerLabel = locating ? 'Locating…' : 'Center on Me';
  const dot         = PERM_DOT[permState];

  return (
    <div style={CARD_STYLE} role="group" aria-label="Map controls">
      <div style={{ padding: '4px 0' }}>
        <CtrlBtn
          label="Fit All"
          iconPath={ICONS.fitAll}
          onClick={onFitAll}
          disabled={!mapReady}
          title="Fit map to all technicians and jobs"
        />

        {hasInteracted && (
          <CtrlBtn
            label="Recenter"
            iconPath={ICONS.recenter}
            onClick={onRecenter}
            disabled={!mapReady}
            title="Restore automatic tenant viewport"
          />
        )}

        <div style={{ height: 1, background: 'var(--lightgray, #e6e6e6)', margin: '2px 0' }} />

        <CtrlBtn
          label={centerLabel}
          iconPath={ICONS.centerMe}
          onClick={onCenterOnMe}
          disabled={locating || !mapReady}
          title={
            permState === 'denied'      ? 'Location blocked — click for help' :
            permState === 'unsupported' ? 'Geolocation not supported in this browser' :
            'Center map on your current location'
          }
        />
      </div>

      {/* Compact permission status row — shown for prompt/unsupported only.
          denied/unavailable have a dedicated full banner; skip the dot to avoid duplicate. */}
      {dot && permState !== 'granted' && permState !== 'unknown'
          && permState !== 'denied' && permState !== 'unavailable' && (
        <div style={{
          padding:    '5px 11px 6px',
          fontSize:   10,
          color:      dot.color,
          borderTop:  '1px solid var(--lightgray, #e6e6e6)',
          display:    'flex',
          alignItems: 'center',
          gap:        5,
        }}>
          <svg viewBox="0 0 8 8" style={{ width: 7, height: 7, flexShrink: 0 }}>
            <circle cx="4" cy="4" r="3.5" fill={dot.color} />
          </svg>
          {dot.title}
        </div>
      )}
    </div>
  );
}
