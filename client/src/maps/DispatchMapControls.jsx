import { useState, useRef, useEffect } from 'react';

// Compact map control overlay for the Dispatch page.
// Must set pointerEvents: 'auto' — parent .dispatch-map-overlays uses
// pointer-events: none so the Google map remains pannable everywhere
// outside this card. Without auto here, buttons are unclickable.

const CARD_STYLE = {
  position:      'absolute',
  top:           16,
  right:         16,
  zIndex:        5,
  background:    'rgba(255,255,255,0.97)',
  border:        '1px solid var(--lightgray, #e6e6e6)',
  borderRadius:  8,
  boxShadow:     '0 2px 8px rgba(0,0,0,.10)',
  minWidth:      180,
  overflow:      'visible',
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
  layers:   'M8 1L1 5l7 4 7-4-7-4zM1 9l7 4 7-4M1 12l7 4 7-4',
};

const PERM_DOT = {
  granted:    { color: '#2E7D32', title: 'Location on'         },
  prompt:     { color: '#D97706', title: 'Location not enabled' },
  denied:     { color: '#C62828', title: 'Location blocked'     },
  unavailable:{ color: '#8A90A2', title: 'Location unavailable' },
  unsupported:{ color: '#8A90A2', title: 'Location unsupported' },
};

const LAYER_ITEMS = [
  { key: 'techs',   label: 'Technicians' },
  { key: 'jobs',    label: 'Jobs'        },
  { key: 'traffic', label: 'Traffic'     },
];

function CtrlBtn({ label, iconPath, onClick, disabled, title, active }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      title={title || label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={!!disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...BTN,
        background: active  ? 'var(--off, #f4f3f0)' : hover && !disabled ? 'var(--off, #f4f3f0)' : 'none',
        opacity:  disabled ? 0.45 : 1,
        cursor:   disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <Icon d={iconPath} />
      {label}
    </button>
  );
}


function LayersDropdown({ layers, onToggle }) {
  return (
    <div style={{
      position:     'absolute',
      top:          '100%',
      right:        0,
      marginTop:    4,
      background:   'rgba(255,255,255,0.97)',
      border:       '1px solid var(--lightgray, #e6e6e6)',
      borderRadius: 8,
      boxShadow:    '0 4px 16px rgba(0,0,0,.12)',
      padding:      '4px 0',
      minWidth:     180,
      zIndex:       20,
      overflow:     'hidden',
    }}>
      {LAYER_ITEMS.map(item => (
        <button
          key={item.key}
          type="button"
          aria-pressed={layers[item.key]}
          onClick={() => onToggle(item.key)}
          style={{
            ...BTN,
            gap: 8,
          }}
        >
          <span style={{
            width: 14, height: 14, borderRadius: 3, flexShrink: 0,
            border: '1.5px solid var(--steel, #8A90A2)',
            background:  layers[item.key] ? 'var(--navy, #1C2333)' : 'transparent',
            transition:  'background .1s',
            display:     'inline-flex',
            alignItems:  'center',
            justifyContent: 'center',
          }}>
            {layers[item.key] && (
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          {item.label}
        </button>
      ))}
    </div>
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
 *  mapReady          — bool: map instance is live
 *  permState         — permission state string
 *  layers            — { techs: bool, jobs: bool, traffic: bool }
 *  onLayerToggle     — (key: string) => void
 *  showLegend        — bool: legend card visibility (controlled by parent)
 *  onLegendToggle    — () => void: toggle legend visibility
 */
export default function DispatchMapControls({
  onFitAll,
  onCenterOnMe,
  onRecenter,
  locating,
  hasInteracted,
  mapReady      = true,
  permState     = 'unknown',
  layers        = { techs: true, jobs: true, traffic: false },
  onLayerToggle,
  showLegend    = false,
  onLegendToggle,
}) {
  const [showLayers, setShowLayers] = useState(false);
  const layersWrapRef = useRef(null);

  // Close layers dropdown on outside click
  useEffect(() => {
    if (!showLayers) return;
    function onDown(e) {
      if (layersWrapRef.current && !layersWrapRef.current.contains(e.target)) {
        setShowLayers(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showLayers]);

  const centerLabel   = locating ? 'Locating…' : 'Center on Me';
  const dot           = PERM_DOT[permState];
  const anyLayerOff   = !layers.techs || !layers.jobs || layers.traffic;

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

        <div style={{ height: 1, background: 'var(--lightgray, #e6e6e6)', margin: '2px 0' }} />

        {/* Layers toggle */}
        <div ref={layersWrapRef} style={{ position: 'relative' }}>
          <CtrlBtn
            label="Layers"
            iconPath={ICONS.layers}
            onClick={() => { setShowLayers(v => !v); }}
            disabled={!mapReady}
            active={showLayers || anyLayerOff}
            title="Toggle map layers"
          />
          {showLayers && (
            <LayersDropdown
              layers={layers}
              onToggle={(key) => { onLayerToggle?.(key); }}
            />
          )}
        </div>

        {/* Legend toggle */}
        <CtrlBtn
          label="Legend"
          iconPath="M3 5h10M3 8h7M3 11h4M13 8l2 2 3-3"
          onClick={() => { onLegendToggle?.(); setShowLayers(false); }}
          disabled={!mapReady}
          active={showLegend}
          title="Toggle map legend"
        />
      </div>

      {/* Compact permission status row — prompt/unsupported only */}
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
