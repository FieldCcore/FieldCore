import { useState, useRef, useEffect } from 'react';
import api from '../api';

// Compact map control overlay for the Dispatch page.
// Must set pointerEvents: 'auto' — parent .dispatch-map-overlays uses
// pointer-events: none so the Google map remains pannable everywhere
// outside this card. Without auto here, buttons are unclickable.


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

const BASE_LAYER_ITEMS = [
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


function LayersDropdown({ layers, onToggle, serviceAreasEnabled, hasServiceAreas, onSetupServiceAreas }) {
  const items = serviceAreasEnabled
    ? [...BASE_LAYER_ITEMS, { key: 'service_areas', label: 'Service Areas' }]
    : BASE_LAYER_ITEMS;

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
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          aria-pressed={layers[item.key]}
          onClick={() => onToggle(item.key)}
          style={{ ...BTN, gap: 8 }}
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
      {serviceAreasEnabled && !hasServiceAreas && (
        <div style={{ padding: '6px 11px', borderTop: '1px solid var(--lightgray)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--steel)', flex: 1 }}>No service areas defined</span>
          <a
            href="/settings/service-areas"
            style={{ fontSize: 10, fontWeight: 600, color: 'var(--navy)', textDecoration: 'none' }}
          >
            Set Up
          </a>
        </div>
      )}
    </div>
  );
}

const READINESS_BADGE = {
  insufficient_data:              { label: 'Insufficient Data', bg: '#FEE2E2', color: '#C62828' },
  collecting:                     { label: 'Collecting',        bg: '#E0F2FE', color: '#0369A1' },
  needs_data_cleanup:             { label: 'Needs Attention',   bg: '#FEF3C7', color: '#B45309' },
  ready_for_baseline_analytics:   { label: 'Ready (Baseline)',  bg: '#E8F5E9', color: '#2E7D32' },
  ready_for_limited_predictions:  { label: 'Ready (Limited)',   bg: '#E8F5E9', color: '#2E7D32' },
  ready_for_advanced_predictions: { label: 'Ready',             bg: '#E8F5E9', color: '#2E7D32' },
};

function FeatureStatusPanel({ flags, techs, jobs, serviceAreas, onClose }) {
  const [predictiveReadiness, setPredictiveReadiness] = useState(null);

  useEffect(() => {
    api.get('/dispatch/predictive-operations/readiness')
      .then(res => setPredictiveReadiness(res.data))
      .catch(() => {});
  }, []);

  const fieldTechs = (techs || []).filter(t =>
    t.field_work_eligible === true || (t.field_work_eligible == null && t.role === 'tech')
  );
  const unassignedJobs = (jobs || []).filter(j => !j.tech_id && !j.tech_name && !['complete','cancelled','no_show','draft'].includes(j.status));
  const assignedJobs   = (jobs || []).filter(j => j.tech_id || j.tech_name);

  const predBadge = predictiveReadiness
    ? (READINESS_BADGE[predictiveReadiness.readinessState] ?? { label: predictiveReadiness.readinessState, bg: '#F3F4F6', color: '#5F667A' })
    : { label: 'Loading…', bg: '#F3F4F6', color: '#5F667A' };

  const rows = [
    {
      name:    'Drag Assignment',
      flag:    'dispatch_drag_assignment',
      enabled: flags?.dispatch_drag_assignment,
      front:   true,
      back:    true,
      block:   fieldTechs.length === 0 ? 'No field technicians' : unassignedJobs.length === 0 ? 'No unassigned jobs' : null,
    },
    {
      name:    'Conflict Engine',
      flag:    'dispatch_conflict_engine',
      enabled: flags?.dispatch_conflict_engine,
      front:   true,
      back:    true,
      block:   null,
    },
    {
      name:    'Workload Balancing',
      flag:    'dispatch_workload_balancing',
      enabled: flags?.dispatch_workload_balancing,
      front:   true,
      back:    true,
      block:   fieldTechs.length === 0 ? 'No field technicians' : null,
    },
    {
      name:    'Route Sequencing',
      flag:    'dispatch_route_sequencing',
      enabled: flags?.dispatch_route_sequencing,
      front:   true,
      back:    true,
      block:   assignedJobs.length < 2 ? 'Need ≥2 assigned jobs per tech' : null,
    },
    {
      name:    'Service Areas',
      flag:    'dispatch_service_areas',
      enabled: flags?.dispatch_service_areas,
      front:   true,
      back:    true,
      block:   (serviceAreas || []).length === 0 ? 'No service areas defined — Set Up in Settings' : null,
    },
    {
      name:    'Emergency Mode',
      flag:    'dispatch_emergency_mode',
      enabled: flags?.dispatch_emergency_mode,
      front:   true,
      back:    true,
      block:   null,
    },
    {
      name:    'Delay Prediction',
      flag:    'dispatch_delay_prediction',
      enabled: flags?.dispatch_delay_prediction,
      front:   true,
      back:    true,
      block:   fieldTechs.length === 0 ? 'No field technicians with GPS' : null,
    },
    {
      name:     'Quick Communications',
      flag:     'dispatch_quick_communications',
      enabled:  flags?.dispatch_quick_communications,
      front:    true,
      back:     true,
      block:    null,
      provider: flags?.smsProviderConfigured === false
        ? 'SMS provider not configured — external delivery unavailable'
        : flags?.smsProviderConfigured === true
          ? 'SMS provider: Twilio'
          : null,
    },
    {
      name:    'Activity Timeline',
      flag:    'dispatch_activity_timeline',
      enabled: flags?.dispatch_activity_timeline,
      front:   true,
      back:    true,
      block:   null,
    },
    {
      name:      'Predictive Ops Foundation',
      flag:      'dispatch_predictive_operations_foundation',
      enabled:   flags?.dispatch_predictive_operations_foundation,
      front:     true,
      back:      true,
      block:     null,
      predBadge,
      predScore: predictiveReadiness?.readinessScore ?? null,
    },
  ];

  return (
    <div style={{
      position: 'absolute', top: 0, right: 196, zIndex: 30,
      background: 'rgba(255,255,255,0.98)',
      border: '1px solid var(--lightgray)',
      borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,.15)',
      width: 340, maxHeight: '80vh', overflow: 'auto',
      pointerEvents: 'auto',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px', borderBottom: '1px solid var(--lightgray)',
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>Feature Status</div>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--slate)' }}
          aria-label="Close feature status"
        >
          ✕
        </button>
      </div>
      <div style={{ padding: '6px 0' }}>
        {rows.map(r => (
          <div key={r.flag} style={{
            padding: '7px 12px',
            borderBottom: '1px solid var(--lightgray, #e6e6e6)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: r.enabled ? '#2E7D32' : '#DC2626',
              }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', flex: 1 }}>{r.name}</span>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99,
                background: r.enabled ? '#E8F5E9' : '#FEE2E2',
                color: r.enabled ? '#2E7D32' : '#DC2626',
              }}>
                {r.enabled ? 'ON' : 'OFF'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginLeft: 13 }}>
              <span style={{ fontSize: 10, color: r.front ? '#2E7D32' : '#DC2626' }}>
                {r.front ? '✓' : '✗'} Frontend
              </span>
              <span style={{ fontSize: 10, color: r.back ? '#2E7D32' : '#DC2626' }}>
                {r.back ? '✓' : '✗'} Backend
              </span>
            </div>
            {r.provider && (
              <div style={{ marginLeft: 13, marginTop: 2, fontSize: 10, color: r.provider.includes('not configured') ? '#B45309' : '#2E7D32' }}>
                {r.provider.includes('not configured') ? '⚠' : '✓'} {r.provider}
              </div>
            )}
            {r.block && (
              <div style={{ marginLeft: 13, marginTop: 2, fontSize: 10, color: '#B45309' }}>
                ⚠ {r.block}
              </div>
            )}
            {r.predBadge && (
              <div style={{ marginLeft: 13, marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99,
                  background: r.predBadge.bg, color: r.predBadge.color,
                }}>
                  {r.predBadge.label}
                </span>
                {r.predScore !== null && (
                  <span style={{ fontSize: 9, color: 'var(--slate)' }}>
                    {r.predScore}/100
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
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
  mapReady            = true,
  permState           = 'unknown',
  layers              = { techs: true, jobs: true, traffic: false, service_areas: true },
  onLayerToggle,
  showLegend          = false,
  onLegendToggle,
  // Service areas
  serviceAreasEnabled = false,
  hasServiceAreas     = false,
  // Feature Status diagnostic (owner/dev only)
  flags               = null,
  techs               = [],
  jobs                = [],
  serviceAreas        = [],
  userRole            = 'tech',
}) {
  const [showLayers,        setShowLayers]        = useState(false);
  const [showFeatureStatus, setShowFeatureStatus] = useState(false);
  const layersWrapRef       = useRef(null);
  const featureStatusRef    = useRef(null);

  const showFeaturesBtn = userRole === 'owner' || userRole === 'manager' || import.meta.env.DEV;

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

  // Close feature status panel on outside click
  useEffect(() => {
    if (!showFeatureStatus) return;
    function onDown(e) {
      if (featureStatusRef.current && !featureStatusRef.current.contains(e.target)) {
        setShowFeatureStatus(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showFeatureStatus]);

  const centerLabel = locating ? 'Locating…' : 'Center on Me';
  const dot         = PERM_DOT[permState];
  const anyLayerOff = !layers.techs || !layers.jobs || layers.traffic
    || (serviceAreasEnabled && !layers.service_areas);

  return (
    <div ref={featureStatusRef} style={{ position: 'absolute', top: 16, right: 16, zIndex: 5, pointerEvents: 'auto' }}>
      {/* Feature Status panel — floats to the left of the controls card */}
      {showFeatureStatus && (
        <FeatureStatusPanel
          flags={flags}
          techs={techs}
          jobs={jobs}
          serviceAreas={serviceAreas}
          onClose={() => setShowFeatureStatus(false)}
        />
      )}

      <div style={{
        background:    'rgba(255,255,255,0.97)',
        border:        '1px solid var(--lightgray, #e6e6e6)',
        borderRadius:  8,
        boxShadow:     '0 2px 8px rgba(0,0,0,.10)',
        minWidth:      180,
        overflow:      'visible',
      }} role="group" aria-label="Map controls">
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
              onClick={() => { setShowLayers(v => !v); setShowFeatureStatus(false); }}
              disabled={!mapReady}
              active={showLayers || anyLayerOff}
              title="Toggle map layers"
            />
            {showLayers && (
              <LayersDropdown
                layers={layers}
                onToggle={key => { onLayerToggle?.(key); }}
                serviceAreasEnabled={serviceAreasEnabled}
                hasServiceAreas={hasServiceAreas}
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

          {/* Feature Status — owner/manager or dev only */}
          {showFeaturesBtn && (
            <>
              <div style={{ height: 1, background: 'var(--lightgray, #e6e6e6)', margin: '2px 0' }} />
              <CtrlBtn
                label="Feature Status"
                iconPath="M8 1v6l3 3M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12"
                onClick={() => { setShowFeatureStatus(v => !v); setShowLayers(false); }}
                active={showFeatureStatus}
                title="View dispatch feature status (admin only)"
              />
            </>
          )}
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
    </div>
  );
}
