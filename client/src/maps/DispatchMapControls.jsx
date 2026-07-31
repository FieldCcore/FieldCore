import React from 'react';

// Compact map control overlay for the Dispatch page.
// Must set pointerEvents: 'auto' — parent .dispatch-map-overlays uses
// pointer-events: none so the Google map remains pannable everywhere
// outside this card. Without auto here, buttons are unclickable.

const CARD_STYLE = {
  position:      'absolute',
  top:           12,
  right:         12,
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
 *  onCenterOnMe()    — request browser geolocation and center map
 *  onRecenter()      — restore automatic tenant-aware viewport
 *  locating          — bool: geolocation request in progress
 *  locationError     — string | null: error message from geolocation
 *  hasInteracted     — bool: user has manually panned/zoomed (shows Recenter)
 *  mapReady          — bool: map instance is live (disables buttons while loading)
 */
export default function DispatchMapControls({
  onFitAll,
  onCenterOnMe,
  onRecenter,
  locating,
  locationError,
  hasInteracted,
  mapReady = true,
}) {
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
          label={locating ? 'Locating…' : 'Center on Me'}
          iconPath={ICONS.centerMe}
          onClick={onCenterOnMe}
          disabled={locating || !mapReady}
          title="Center map on your current location"
        />
      </div>

      {locationError && (
        <div style={{
          padding:   '6px 11px 7px',
          fontSize:  11,
          color:     'var(--red, #C62828)',
          borderTop: '1px solid var(--lightgray, #e6e6e6)',
          lineHeight: 1.4,
          maxWidth:  220,
        }}>
          {locationError}
        </div>
      )}
    </div>
  );
}
