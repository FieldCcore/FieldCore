import { useEffect, useRef, useState, useCallback } from 'react';
import api from '../api';
import DispatchBaseMap from '../maps/DispatchBaseMap';
import DispatchMapControls from '../maps/DispatchMapControls';
import LocationPermissionBanner from '../maps/LocationPermissionBanner';
import LocationInstructionsModal from '../maps/LocationInstructionsModal';
import { resolveDispatchViewport } from '../maps/dispatchViewport';
import { useLocationPermission, getLocPrefs, saveLocPrefs } from '../hooks/useLocationPermission';

const AVATAR_COLORS = ['#2E7D32', '#1565C0', '#E65100', '#6A1B9A', '#AD1457'];

const JOB_COLORS = {
  scheduled:   '#8A90A2',
  in_progress: '#2E7D32',
  complete:    '#2E7D32',
  cancelled:   '#C62828',
  no_show:     '#C62828',
};

const JOB_STATUS_STYLE = {
  scheduled:   { background: 'var(--off)',      color: 'var(--steel)'  },
  in_progress: { background: 'var(--green-lt)', color: 'var(--green)'  },
  complete:    { background: 'var(--green-lt)', color: 'var(--green)'  },
  cancelled:   { background: 'var(--red-lt)',   color: 'var(--red)'    },
  no_show:     { background: 'var(--red-lt)',   color: 'var(--red)'    },
};

const JOB_STATUS_LABEL = {
  scheduled: 'Scheduled', in_progress: 'Active', complete: 'Done',
  cancelled: 'Cancelled', no_show: 'No-show',
};

const GPS_STALE_MS   = 2  * 60 * 1000;
const GPS_OFFLINE_MS = 15 * 60 * 1000;

// Padding applied to fitBounds (pixels). Keeps markers away from panel + controls.
const FIT_PADDING = { top: 60, right: 60, bottom: 60, left: 60 };
// Never zoom closer than this after fitBounds (prevents over-zoom on one tight cluster).
const MAX_AUTO_ZOOM = 15;

const SESSION_COLORS = {
  scheduled:         '#8A90A2',
  en_route:          '#2E7D32',
  checked_in:        '#2E7D32',
  in_progress:       '#2E7D32',
  completed_for_day: '#2E7D32',
  paused:            '#D4A000',
  cancelled:         '#C62828',
};

function initials(name) {
  return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtAgeShort(ts) {
  const ms = Date.now() - new Date(ts).getTime();
  const m  = Math.floor(ms / 60000);
  const s  = Math.floor((ms % 60000) / 1000);
  if (m >= 60) return `${Math.floor(m / 60)}h ago`;
  return m > 0 ? `${m}m ago` : `${s}s ago`;
}

function getTechStatus(tech, jobs, techLocs) {
  if (!tech.is_available) return { label: 'Off Duty',  color: '#8A90A2', bg: '#f1f5f9' };
  const loc    = techLocs.find(l => l.user_id === tech.id);
  const isBusy = jobs.some(j => j.tech_id === tech.id && j.status === 'in_progress');
  if (isBusy) return { label: 'Busy',      color: '#2E7D32', bg: 'rgba(46,125,50,.10)' };
  if (!loc)   return { label: 'Available', color: '#2E7D32', bg: 'rgba(46,125,50,.10)' };
  const age = Date.now() - new Date(loc.updated_at).getTime();
  if (age > GPS_OFFLINE_MS) return { label: 'No GPS',    color: '#8A90A2', bg: '#f1f5f9' };
  if (age > GPS_STALE_MS)   return { label: 'Available', color: '#D97706', bg: 'rgba(217,119,6,.10)' };
  return { label: 'Available', color: '#2E7D32', bg: 'rgba(46,125,50,.10)' };
}

export default function Dispatch() {
  const [jobs,             setJobs]             = useState([]);
  const [sessions,         setSessions]         = useState([]);
  const [techs,            setTechs]            = useState([]);
  const [techLocs,         setTechLocs]         = useState([]);
  const [selected,         setSelected]         = useState(null);
  const [loading,          setLoading]          = useState(true);
  const [dispatchSettings, setDispatchSettings] = useState(null);
  const [accountLocation,  setAccountLocation]  = useState(null);
  const [hasInteracted,       setHasInteracted]       = useState(false);
  const [mapReady,            setMapReady]            = useState(false);
  const [locating,            setLocating]            = useState(false);
  const [showInstructions,    setShowInstructions]    = useState(false);
  // Banner dismissed for this session (office users only)
  const [bannerDismissed,     setBannerDismissed]     = useState(false);
  // First-visit prompt: shown when permState==='prompt' and not yet completed
  const [firstVisitDone,      setFirstVisitDone]      = useState(
    () => !!getLocPrefs().locationOnboardingCompleted
  );

  const { permState, requestLocation, recheck } = useLocationPermission();

  // Google Maps instance received from DispatchBaseMap via onMapReady callback.
  const mapRef              = useRef(null);
  // True once the map instance is live and ready to receive viewport commands.
  const mapReadyRef         = useRef(false);
  // True once the initial data fetch (jobs + locs + settings) has resolved.
  const dataLoadedRef       = useRef(false);
  // True while we are programmatically moving the map (suppress interaction detection).
  const programmaticRef     = useRef(false);
  // True once the initial auto-fit has been applied for this page load.
  const initialFitDoneRef   = useRef(false);
  // Stable refs so viewport callbacks always see latest state.
  const jobsRef             = useRef([]);
  const techLocsRef         = useRef([]);
  const dispatchSettingsRef = useRef(null);
  const accountLocationRef  = useRef(null);

  jobsRef.current             = jobs;
  techLocsRef.current         = techLocs;
  dispatchSettingsRef.current = dispatchSettings;
  accountLocationRef.current  = accountLocation;

  // ── Viewport application ──────────────────────────────────────────────────
  const applyViewport = useCallback((viewport, { force = false } = {}) => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;
    if (!force && initialFitDoneRef.current) return; // only auto-fit once

    programmaticRef.current = true;

    if (viewport.mode === 'fit_bounds' && viewport.bounds?.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      viewport.bounds.forEach(pt => bounds.extend(pt));
      map.fitBounds(bounds, FIT_PADDING);
      // Cap zoom after the map settles so tightly-clustered points don't zoom to street level.
      window.google.maps.event.addListenerOnce(map, 'idle', () => {
        if ((map.getZoom() ?? 0) > MAX_AUTO_ZOOM) map.setZoom(MAX_AUTO_ZOOM);
        programmaticRef.current = false;
      });
    } else if (viewport.mode === 'center_zoom' && viewport.center) {
      map.setCenter(viewport.center);
      map.setZoom(viewport.zoom ?? 11);
      programmaticRef.current = false;
    } else {
      programmaticRef.current = false;
    }
  }, []);

  const computeAndApplyViewport = useCallback(({ force = false } = {}) => {
    const viewport = resolveDispatchViewport({
      technicians:      techLocsRef.current,
      jobs:             jobsRef.current,
      dispatchSettings: dispatchSettingsRef.current,
      accountLocation:  accountLocationRef.current,
    });
    applyViewport(viewport, { force });
    initialFitDoneRef.current = true;
  }, [applyViewport]);

  // ── Map ready callback ────────────────────────────────────────────────────
  const handleMapReady = useCallback((mapInstance) => {
    mapRef.current      = mapInstance;
    mapReadyRef.current = true;
    setMapReady(true);

    // Detect user pan/zoom — suppress during programmatic moves.
    mapInstance.addListener('dragstart', () => {
      if (!programmaticRef.current) setHasInteracted(true);
    });
    mapInstance.addListener('zoom_changed', () => {
      if (!programmaticRef.current) setHasInteracted(true);
    });

    // Only apply viewport if data has already loaded. If data is still in-flight,
    // the data loader will call computeAndApplyViewport once it resolves and sees
    // mapRef.current is set. Applying here with empty refs would resolve to the
    // continental-US fallback and lock initialFitDoneRef before real data arrives.
    if (dataLoadedRef.current && !initialFitDoneRef.current) {
      computeAndApplyViewport();
    }
  }, [computeAndApplyViewport]);

  // ── Initial data load ─────────────────────────────────────────────────────
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    Promise.all([
      api.get(`/jobs?date=${today}`),
      api.get('/users'),
      api.get(`/jobs/sessions?date_from=${today}&date_to=${today}`).catch(() => ({ data: [] })),
      api.get('/mobile/locations').catch(() => null),
      api.get('/dispatch-settings').catch(() => null),
    ]).then(([jobsRes, usersRes, sessionsRes, locsRes, dsRes]) => {
      const fetchedJobs  = jobsRes.data || [];
      const fetchedLocs  = locsRes?.data || [];
      const fetchedDS    = dsRes?.data?.settings || null;
      const fetchedAcct  = dsRes?.data?.account  || null;

      setJobs(fetchedJobs);
      setSessions(sessionsRes.data || []);
      setTechs(usersRes.data.filter(u => u.role === 'tech'));
      setTechLocs(fetchedLocs);
      setDispatchSettings(fetchedDS);

      // Use accounts.lat/lng if present; otherwise no account location available.
      if (fetchedAcct?.lat != null && fetchedAcct?.lng != null) {
        setAccountLocation({ lat: parseFloat(fetchedAcct.lat), lng: parseFloat(fetchedAcct.lng) });
      }

      // Update refs synchronously so computeAndApplyViewport sees latest data.
      jobsRef.current             = fetchedJobs;
      techLocsRef.current         = fetchedLocs;
      dispatchSettingsRef.current = fetchedDS;
      accountLocationRef.current  = (fetchedAcct?.lat != null && fetchedAcct?.lng != null)
        ? { lat: parseFloat(fetchedAcct.lat), lng: parseFloat(fetchedAcct.lng) }
        : null;

      // Mark data as ready BEFORE testing mapRef, so handleMapReady (if it fires
      // after this) finds dataLoadedRef = true and applies the correct viewport.
      dataLoadedRef.current = true;

      // If map is already ready, apply the tenant-aware viewport now.
      if (mapRef.current && !initialFitDoneRef.current) {
        computeAndApplyViewport();
      }
    }).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live-poll tech locations every 15 s ──────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      api.get('/mobile/locations')
        .then(r => { setTechLocs(r.data); techLocsRef.current = r.data; })
        .catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, []);

  // ── Map control handlers ──────────────────────────────────────────────────
  // Declared before any callback that references it in a dependency array.
  const applyPositionToMap = useCallback((pos) => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;
    programmaticRef.current = true;
    map.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    map.setZoom(14);
    setHasInteracted(true);
    programmaticRef.current = false;
  }, []);

  const handleFitAll = useCallback(() => {
    initialFitDoneRef.current = false;
    setHasInteracted(false);
    computeAndApplyViewport({ force: true });
  }, [computeAndApplyViewport]);

  const handleRecenter = handleFitAll;

  const handleCenterOnMe = useCallback(() => {
    // If already denied: open help panel instead of calling getCurrentPosition again.
    if (permState === 'denied') { setShowInstructions(true); return; }
    if (permState === 'unsupported') return;

    setLocating(true);
    requestLocation()
      .then(pos => { setLocating(false); applyPositionToMap(pos); })
      .catch(() => { setLocating(false); });
  }, [permState, requestLocation, applyPositionToMap]);

  // ── First-visit permission prompt handlers ────────────────────────────────
  const handleEnableLocation = useCallback(() => {
    setLocating(true);
    setFirstVisitDone(true);
    saveLocPrefs({ locationOnboardingCompleted: true });
    requestLocation()
      .then(pos => { setLocating(false); applyPositionToMap(pos); })
      .catch(() => { setLocating(false); });
  }, [requestLocation, applyPositionToMap]);

  const handleSkipLocation = useCallback(() => {
    setFirstVisitDone(true);
    saveLocPrefs({ locationOnboardingCompleted: true });
  }, []);

  // Auto-use location when permission is already granted on page load.
  const autoLocationAppliedRef = useRef(false);
  useEffect(() => {
    if (permState !== 'granted') return;
    if (autoLocationAppliedRef.current) return;
    if (!mapRef.current || !dataLoadedRef.current) return;
    if (initialFitDoneRef.current) return;
    autoLocationAppliedRef.current = true;
    requestLocation()
      .then(pos => applyPositionToMap(pos))
      .catch(() => {});
  }, [permState, requestLocation, applyPositionToMap]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
    <div className="dispatch-layout">

      {/* ── Left panel ── */}
      <div className="dispatch-panel">
        <div className="dispatch-panel-hdr">
          <div className="dispatch-panel-title">Live Dispatch</div>
          <div className="dispatch-panel-sub">
            {loading
              ? 'Loading…'
              : `${techs.length} tech${techs.length !== 1 ? 's' : ''} · ${jobs.length} job${jobs.length !== 1 ? 's' : ''}${sessions.length > 0 ? ` · ${sessions.length} session${sessions.length !== 1 ? 's' : ''}` : ''} today`
            }
          </div>
        </div>

        {/* ── Field Techs ── */}
        <div className="dispatch-section-lbl">Field Techs</div>

        {!loading && techs.length === 0 ? (
          <div style={{ padding: '16px', fontSize: 12, color: 'var(--steel)', lineHeight: 1.5 }}>
            No techs on team yet.
            <br />Add team members in <a href="/team" style={{ color: 'var(--blue)' }}>Team settings</a>.
          </div>
        ) : techs.map((t, i) => {
          const status   = getTechStatus(t, jobs, techLocs);
          const loc      = techLocs.find(l => l.user_id === t.id);
          const locAge   = loc ? Date.now() - new Date(loc.updated_at).getTime() : null;
          const isStale  = locAge !== null && locAge > GPS_STALE_MS && locAge <= GPS_OFFLINE_MS;
          const techJobs = jobs.filter(j => j.tech_id === t.id);
          const activeJob = techJobs.find(j => j.status === 'in_progress');
          const color    = AVATAR_COLORS[i % AVATAR_COLORS.length];

          return (
            <div
              key={t.id}
              className={`dispatch-tech-row${selected === t.id ? ' sel' : ''}`}
              onClick={() => setSelected(selected === t.id ? null : t.id)}
            >
              <div className="dispatch-tech-avatar" style={{ background: color }}>{initials(t.name)}</div>
              <div className="dispatch-tech-info">
                <div className="dispatch-tech-name">{t.name}</div>
                <div className="dispatch-tech-job">
                  {activeJob
                    ? `${activeJob.service_type} · ${activeJob.client_name}`
                    : techJobs.length > 0
                      ? `${techJobs.length} job${techJobs.length > 1 ? 's' : ''} today`
                      : 'No jobs today'}
                  {isStale && loc && (
                    <span style={{ color: '#D97706', marginLeft: 5, fontSize: 10 }}>
                      · GPS {fmtAgeShort(loc.updated_at)}
                    </span>
                  )}
                </div>
              </div>
              <span
                className="dispatch-tech-badge"
                style={{ background: status.bg, color: status.color }}
              >
                {status.label}
              </span>
            </div>
          );
        })}

        {/* ── Job Queue ── */}
        <div className="dispatch-section-lbl" style={{ marginTop: 8 }}>Job Queue</div>

        {!loading && jobs.length === 0 && sessions.length === 0 ? (
          <div style={{ padding: '16px', fontSize: 12, color: 'var(--steel)', lineHeight: 1.5 }}>
            No jobs scheduled for today.
            <br />Create one from the <a href="/jobs" style={{ color: 'var(--blue)' }}>Calendar</a>.
          </div>
        ) : null}

        {jobs.map((j, idx) => {
          const statusStyle = JOB_STATUS_STYLE[j.status] || JOB_STATUS_STYLE.scheduled;
          const statusLabel = JOB_STATUS_LABEL[j.status] || j.status;
          return (
            <div key={j.id || idx} className="dispatch-job-row">
              <div
                className="dispatch-job-dot"
                style={{ background: JOB_COLORS[j.status] || '#8A90A2' }}
              />
              <div className="dispatch-job-info">
                <div className="dispatch-job-name">{j.client_name} — {j.service_type}</div>
                <div className="dispatch-job-meta">
                  {j.tech_name || 'Unassigned'} · {fmtTime(j.scheduled_at)}
                </div>
              </div>
              <span className="dispatch-job-badge" style={statusStyle}>
                {statusLabel}
              </span>
            </div>
          );
        })}

        {/* ── Today's Multi-Day Sessions ── */}
        {sessions.length > 0 && (
          <>
            <div className="dispatch-section-lbl" style={{ marginTop: 8 }}>Multi-Day Sessions Today</div>
            {sessions.map((s, idx) => {
              const color   = SESSION_COLORS[s.status] || '#3B82F6';
              const timeStr = s.start_time ? s.start_time.slice(0, 5) : '—';
              return (
                <div key={s.id || idx} className="dispatch-job-row" style={{ borderLeft: `3px solid ${color}` }}>
                  <div className="dispatch-job-dot" style={{ background: color }} />
                  <div className="dispatch-job-info">
                    <div className="dispatch-job-name">
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#1d4ed8',
                        background: '#eff6ff', borderRadius: 3, padding: '1px 5px', marginRight: 5 }}>
                        Day {s.day_number}/{s.total_sessions}
                      </span>
                      {s.client_name} — {s.service_type}
                    </div>
                    <div className="dispatch-job-meta">
                      {s.lead_tech_name || 'Unassigned'} · {timeStr}
                    </div>
                  </div>
                  <span className="dispatch-job-badge"
                    style={{ background: '#eff6ff', color: '#1d4ed8' }}>
                    {(s.status || 'scheduled').replace(/_/g, ' ')}
                  </span>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* ── Map ── */}
      <div className="dispatch-map-wrap">
        {/* DispatchBaseMap mounts once for the lifetime of the Dispatch page.
            Data polling never remounts it. Viewport is applied externally via
            the map instance returned through onMapReady. */}
        <DispatchBaseMap onMapReady={handleMapReady} />

        <div className="dispatch-map-overlays">
          {/* Map controls — top-right, above Google UI chrome */}
          <DispatchMapControls
            onFitAll={handleFitAll}
            onCenterOnMe={handleCenterOnMe}
            onRecenter={handleRecenter}
            locating={locating}
            hasInteracted={hasInteracted}
            mapReady={mapReady}
            permState={permState}
          />

          {/* First-visit location prompt (permission=prompt, not yet asked) */}
          {!firstVisitDone && permState === 'prompt' && (
            <LocationPermissionBanner
              variant="first_visit"
              onEnable={handleEnableLocation}
              onSkip={handleSkipLocation}
              isEnabling={locating}
            />
          )}

          {/* Persistent denied/unavailable banner (replaces inline dropdown error) */}
          {!bannerDismissed && (permState === 'denied' || permState === 'unavailable') && (
            <LocationPermissionBanner
              variant={permState}
              onTryAgain={recheck}
              onOpenHelp={() => setShowInstructions(true)}
              onDismiss={() => setBannerDismissed(true)}
              dismissable
            />
          )}

          {/* Legend — bottom positioning handled by existing CSS */}
          <div className="dispatch-legend">
            {[
              { color: '#2E7D32', label: 'Tech — live GPS'  },
              { color: '#D97706', label: 'Tech — GPS stale' },
              { color: '#1565C0', label: 'Job — active'     },
              { color: '#2E7D32', label: 'Job — complete'   },
              { color: '#C62828', label: 'Job — cancelled'  },
              { color: '#8A90A2', label: 'Job — scheduled'  },
            ].map((l, i) => (
              <div key={i} className="dispatch-legend-item">
                <div className="dispatch-legend-dot" style={{ background: l.color }} />
                <span>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>

      {/* Browser instructions modal — rendered outside layout so it sits above everything */}
      {showInstructions && (
        <LocationInstructionsModal onClose={() => setShowInstructions(false)} />
      )}
    </>
  );
}
