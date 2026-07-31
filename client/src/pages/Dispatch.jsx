import { useEffect, useRef, useState, useCallback } from 'react';
import api from '../api';
import DispatchBaseMap from '../maps/DispatchBaseMap';
import DispatchMapControls from '../maps/DispatchMapControls';
import DispatchKPIStrip from '../maps/DispatchKPIStrip';
import DispatchTeamPanel from '../maps/DispatchTeamPanel';
import DispatchDrawer from '../maps/DispatchDrawer';
import LocationPermissionBanner from '../maps/LocationPermissionBanner';
import LocationInstructionsModal from '../maps/LocationInstructionsModal';
import { resolveDispatchViewport } from '../maps/dispatchViewport';
import { useDispatchLocation } from '../hooks/useDispatchLocation';
import { isValidCoord, classifyTechGPS } from '../maps/dispatchCoords';

// ── Viewport persistence ──────────────────────────────────────────────────────
const VP_KEY     = 'fc_dispatch_vp';
const VP_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function loadPersistedViewport() {
  try {
    const raw = localStorage.getItem(VP_KEY);
    if (!raw) return null;
    const { lat, lng, zoom, savedAt } = JSON.parse(raw);
    if (Date.now() - savedAt > VP_MAX_AGE) { localStorage.removeItem(VP_KEY); return null; }
    if (typeof lat !== 'number' || typeof lng !== 'number' || typeof zoom !== 'number') return null;
    return { lat, lng, zoom };
  } catch { return null; }
}

function savePersistedViewport(lat, lng, zoom) {
  try {
    localStorage.setItem(VP_KEY, JSON.stringify({ lat, lng, zoom, savedAt: Date.now() }));
  } catch {}
}

const AVATAR_COLORS = ['#2E7D32', '#1565C0', '#E65100', '#6A1B9A', '#AD1457'];

const JOB_MARKER_COLORS = {
  scheduled:           '#8A90A2',
  in_progress:         '#1565C0',
  complete:            '#2E7D32',
  en_route:            '#2E7D32',
  paused:              '#D97706',
  cancelled:           '#C62828',
  no_show:             '#C62828',
  awaiting_client:     '#D97706',
  partially_completed: '#1565C0',
};

const FIT_PADDING  = { top: 60, right: 60, bottom: 60, left: 60 };
const MAX_AUTO_ZOOM = 15;

function initials(name) {
  return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ── Marker SVG helpers ────────────────────────────────────────────────────────

function techMarkerSvg(inits, color, isSelected) {
  const size = isSelected ? 34 : 28;
  const r    = size / 2;
  const fs   = Math.round(size * 0.32);
  const sw   = isSelected ? 2 : 0;
  const stroke = isSelected ? 'white' : 'none';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${r}" cy="${r}" r="${r - 1}" fill="${color}" stroke="${stroke}" stroke-width="${sw}"/><text x="${r}" y="${r}" dy=".35em" text-anchor="middle" font-family="Inter,sans-serif" font-size="${fs}px" font-weight="800" fill="white">${inits}</text></svg>`;
}

function techMarkerIcon(inits, color, isSelected) {
  const size = isSelected ? 34 : 28;
  return {
    url: `data:image/svg+xml,${encodeURIComponent(techMarkerSvg(inits, color, isSelected))}`,
    scaledSize: new window.google.maps.Size(size, size),
    anchor:     new window.google.maps.Point(size / 2, size / 2),
  };
}

function jobMarkerSvg(color, isSelected) {
  const stroke = isSelected ? 'white' : 'rgba(0,0,0,0.25)';
  const sw     = isSelected ? 2 : 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="30" viewBox="0 0 22 30"><path d="M11 1C6.58 1 3 4.58 3 9c0 5.25 8 19 8 19s8-13.75 8-19c0-4.42-3.58-8-8-8z" fill="${color}" stroke="${stroke}" stroke-width="${sw}"/><circle cx="11" cy="9" r="4" fill="rgba(255,255,255,0.35)"/></svg>`;
}

function jobMarkerIcon(color, isSelected) {
  return {
    url: `data:image/svg+xml,${encodeURIComponent(jobMarkerSvg(color, isSelected))}`,
    scaledSize: new window.google.maps.Size(22, 30),
    anchor:     new window.google.maps.Point(11, 30),
  };
}

export default function Dispatch() {
  const [jobs,             setJobs]             = useState([]);
  const [sessions,         setSessions]         = useState([]);
  const [techs,            setTechs]            = useState([]);
  const [techLocs,         setTechLocs]         = useState([]);
  const [selectedItem,     setSelectedItem]     = useState(null);
  const [layers,           setLayers]           = useState({ techs: true, jobs: true, traffic: false });
  const [loading,          setLoading]          = useState(true);
  const [dispatchSettings, setDispatchSettings] = useState(null);
  const [accountLocation,  setAccountLocation]  = useState(null);
  const [hasInteracted,    setHasInteracted]    = useState(false);
  const [mapReady,         setMapReady]         = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [bannerDismissed,  setBannerDismissed]  = useState(false);
  const [promptDismissed,  setPromptDismissed]  = useState(false);
  const [recenterMsg,      setRecenterMsg]      = useState(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const mapRef                 = useRef(null);
  const mapReadyRef            = useRef(false);
  const dataLoadedRef          = useRef(false);
  const programmaticRef        = useRef(false);
  const initialFitDoneRef      = useRef(false);
  const autoLocationAppliedRef = useRef(false);
  const jobsRef                = useRef([]);
  const techLocsRef            = useRef([]);
  const dispatchSettingsRef    = useRef(null);
  const accountLocationRef     = useRef(null);
  const lastViewportSourceRef  = useRef(null);
  const vpSaveTimerRef         = useRef(null);
  const recenterMsgTimerRef    = useRef(null);
  const techMarkersRef         = useRef({});
  const jobMarkersRef          = useRef({});
  const trafficLayerRef        = useRef(null);

  jobsRef.current             = jobs;
  techLocsRef.current         = techLocs;
  dispatchSettingsRef.current = dispatchSettings;
  accountLocationRef.current  = accountLocation;

  // ── Viewport application ──────────────────────────────────────────────────
  const applyViewport = useCallback((viewport, { force = false } = {}) => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;
    if (!force && initialFitDoneRef.current) return;

    programmaticRef.current = true;

    if (viewport.mode === 'fit_bounds' && viewport.bounds?.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      viewport.bounds.forEach(pt => bounds.extend(pt));
      map.fitBounds(bounds, FIT_PADDING);
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

  const computeAndApplyViewport = useCallback(({ force = false, showMessage = false } = {}) => {
    const viewport = resolveDispatchViewport({
      technicians:       techLocsRef.current,
      jobs:              jobsRef.current,
      dispatchSettings:  dispatchSettingsRef.current,
      accountLocation:   accountLocationRef.current,
      persistedViewport: loadPersistedViewport(),
    });
    lastViewportSourceRef.current = viewport.source;
    applyViewport(viewport, { force });
    initialFitDoneRef.current = true;

    if (showMessage) {
      const msgs = {
        techs_and_jobs:      'Centered on active jobs and techs',
        jobs:                "Centered on today's jobs",
        techs:               'Centered on field techs',
        stale_techs:         'Centered on field techs',
        service_area_radius: 'Centered on service area',
        custom_center:       'Centered on dispatch center',
        business_address:    'Centered on business address',
        user_location:       'Centered on your location',
        persisted_viewport:  'Restored last view',
        fallback:            'Showing full map',
      };
      setRecenterMsg(msgs[viewport.source] || 'Map recentered');
      clearTimeout(recenterMsgTimerRef.current);
      recenterMsgTimerRef.current = setTimeout(() => setRecenterMsg(null), 2000);
    }
  }, [applyViewport]);

  // ── Map ready callback ─────────────────────────────────────────────────────
  const handleMapReady = useCallback((mapInstance) => {
    mapRef.current      = mapInstance;
    mapReadyRef.current = true;
    setMapReady(true);

    mapInstance.addListener('dragstart', () => {
      if (!programmaticRef.current) setHasInteracted(true);
    });
    mapInstance.addListener('zoom_changed', () => {
      if (!programmaticRef.current) setHasInteracted(true);
    });

    mapInstance.addListener('idle', () => {
      if (programmaticRef.current) return;
      const c = mapInstance.getCenter();
      const z = mapInstance.getZoom();
      if (!c || z == null) return;
      clearTimeout(vpSaveTimerRef.current);
      vpSaveTimerRef.current = setTimeout(() => savePersistedViewport(c.lat(), c.lng(), z), 600);
    });

    if (dataLoadedRef.current && !initialFitDoneRef.current) {
      computeAndApplyViewport();
    }
  }, [computeAndApplyViewport]);

  // ── Initial data load ──────────────────────────────────────────────────────
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    Promise.all([
      api.get(`/jobs?date=${today}`),
      api.get('/users'),
      api.get(`/jobs/sessions?date_from=${today}&date_to=${today}`).catch(() => ({ data: [] })),
      api.get('/mobile/locations').catch(() => null),
      api.get('/dispatch-settings').catch(() => null),
    ]).then(([jobsRes, usersRes, sessionsRes, locsRes, dsRes]) => {
      const fetchedJobs = jobsRes.data || [];
      const fetchedLocs = locsRes?.data || [];
      const fetchedDS   = dsRes?.data?.settings || null;
      const fetchedAcct = dsRes?.data?.account  || null;

      setJobs(fetchedJobs);
      setSessions(sessionsRes.data || []);
      setTechs(usersRes.data.filter(u => u.role === 'tech'));
      setTechLocs(fetchedLocs);
      setDispatchSettings(fetchedDS);

      if (fetchedAcct?.lat != null && fetchedAcct?.lng != null) {
        setAccountLocation({ lat: parseFloat(fetchedAcct.lat), lng: parseFloat(fetchedAcct.lng) });
      }

      jobsRef.current             = fetchedJobs;
      techLocsRef.current         = fetchedLocs;
      dispatchSettingsRef.current = fetchedDS;
      accountLocationRef.current  = (fetchedAcct?.lat != null && fetchedAcct?.lng != null)
        ? { lat: parseFloat(fetchedAcct.lat), lng: parseFloat(fetchedAcct.lng) }
        : null;

      dataLoadedRef.current = true;

      if (mapRef.current && !initialFitDoneRef.current) {
        computeAndApplyViewport();
      }
    }).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live-poll tech locations every 15 s ───────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      api.get('/mobile/locations')
        .then(r => { setTechLocs(r.data); techLocsRef.current = r.data; })
        .catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, []);

  // ── Tech markers ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !window.google?.maps) return;
    const map = mapRef.current;
    if (!map) return;

    const activeIds = new Set();

    techs.forEach((tech, idx) => {
      const loc = techLocs.find(l => l.user_id === tech.id);
      if (!loc || !isValidCoord(loc.lat, loc.lng)) return;
      if (classifyTechGPS(loc.updated_at) === 'unavailable') return;

      activeIds.add(tech.id);
      const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
      const isSel = selectedItem?.type === 'tech' && selectedItem?.id === tech.id;
      const icon  = techMarkerIcon(initials(tech.name), color, isSel);

      if (techMarkersRef.current[tech.id]) {
        const m = techMarkersRef.current[tech.id];
        m.setPosition({ lat: parseFloat(loc.lat), lng: parseFloat(loc.lng) });
        m.setIcon(icon);
        m.setZIndex(isSel ? 100 : 10);
        m.setMap(layers.techs ? map : null);
      } else {
        const techId = tech.id;
        const m = new window.google.maps.Marker({
          position: { lat: parseFloat(loc.lat), lng: parseFloat(loc.lng) },
          map:      layers.techs ? map : null,
          icon,
          title:    tech.name,
          zIndex:   isSel ? 100 : 10,
        });
        m.addListener('click', () => setSelectedItem(prev =>
          prev?.type === 'tech' && prev?.id === techId ? null : { type: 'tech', id: techId }
        ));
        techMarkersRef.current[tech.id] = m;
      }
    });

    Object.keys(techMarkersRef.current).forEach(id => {
      if (!activeIds.has(id)) {
        techMarkersRef.current[id].setMap(null);
        delete techMarkersRef.current[id];
      }
    });
  }, [techs, techLocs, selectedItem, mapReady, layers.techs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Job markers ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !window.google?.maps) return;
    const map = mapRef.current;
    if (!map) return;

    const activeIds = new Set();

    jobs.forEach(job => {
      if (!isValidCoord(job.service_lat, job.service_lng)) return;

      activeIds.add(job.id);
      const color = JOB_MARKER_COLORS[job.status] || '#8A90A2';
      const isSel = selectedItem?.type === 'job' && selectedItem?.id === job.id;
      const icon  = jobMarkerIcon(color, isSel);

      if (jobMarkersRef.current[job.id]) {
        const m = jobMarkersRef.current[job.id];
        m.setPosition({ lat: parseFloat(job.service_lat), lng: parseFloat(job.service_lng) });
        m.setIcon(icon);
        m.setZIndex(isSel ? 100 : 5);
        m.setMap(layers.jobs ? map : null);
      } else {
        const jobId = job.id;
        const m = new window.google.maps.Marker({
          position: { lat: parseFloat(job.service_lat), lng: parseFloat(job.service_lng) },
          map:      layers.jobs ? map : null,
          icon,
          title:    `${job.client_name} — ${job.service_type}`,
          zIndex:   isSel ? 100 : 5,
        });
        m.addListener('click', () => setSelectedItem(prev =>
          prev?.type === 'job' && prev?.id === jobId ? null : { type: 'job', id: jobId }
        ));
        jobMarkersRef.current[job.id] = m;
      }
    });

    Object.keys(jobMarkersRef.current).forEach(id => {
      if (!activeIds.has(id)) {
        jobMarkersRef.current[id].setMap(null);
        delete jobMarkersRef.current[id];
      }
    });
  }, [jobs, selectedItem, mapReady, layers.jobs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Traffic layer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !window.google?.maps) return;
    const map = mapRef.current;
    if (!map) return;

    if (layers.traffic) {
      if (!trafficLayerRef.current) {
        trafficLayerRef.current = new window.google.maps.TrafficLayer();
      }
      trafficLayerRef.current.setMap(map);
    } else {
      trafficLayerRef.current?.setMap(null);
    }
  }, [mapReady, layers.traffic]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      Object.values(techMarkersRef.current).forEach(m => m.setMap(null));
      Object.values(jobMarkersRef.current).forEach(m => m.setMap(null));
      trafficLayerRef.current?.setMap(null);
      clearTimeout(vpSaveTimerRef.current);
      clearTimeout(recenterMsgTimerRef.current);
    };
  }, []);

  // ── Position-to-map ────────────────────────────────────────────────────────
  const applyPositionToMap = useCallback((pos) => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;
    programmaticRef.current = true;
    map.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    map.setZoom(13);
    programmaticRef.current = false;
    setHasInteracted(true);
  }, []);

  // ── Location hook ──────────────────────────────────────────────────────────
  const {
    permissionState,
    status:   locationStatus,
    tryAgain,
    centerOnMe,
  } = useDispatchLocation({
    onLocated: applyPositionToMap,
    onDenied:  () => setShowInstructions(true),
  });

  // ── Map control handlers ───────────────────────────────────────────────────
  const handleFitAll = useCallback(() => {
    initialFitDoneRef.current = false;
    setHasInteracted(false);
    computeAndApplyViewport({ force: true });
  }, [computeAndApplyViewport]);

  const handleRecenter = useCallback(() => {
    initialFitDoneRef.current = false;
    setHasInteracted(false);
    computeAndApplyViewport({ force: true, showMessage: true });
  }, [computeAndApplyViewport]);

  const handleCenterOnMe = useCallback(() => {
    if (permissionState === 'unsupported' || permissionState === 'insecure_context') return;
    centerOnMe();
  }, [permissionState, centerOnMe]);

  const handleEnableLocation = useCallback(() => { centerOnMe(); }, [centerOnMe]);
  const handleSkipLocation   = useCallback(() => { setPromptDismissed(true); }, []);

  // ── Selection + drawer handlers ────────────────────────────────────────────
  const handleSelectTech = useCallback((id) => {
    setSelectedItem(prev => prev?.type === 'tech' && prev?.id === id ? null : { type: 'tech', id });
  }, []);

  const handleSelectJob = useCallback((id) => {
    setSelectedItem(prev => prev?.type === 'job' && prev?.id === id ? null : { type: 'job', id });
  }, []);

  const handleCloseDrawer = useCallback(() => { setSelectedItem(null); }, []);

  const handleCenterOnTech = useCallback((techId) => {
    const loc = techLocsRef.current.find(l => l.user_id === techId);
    if (!loc || !isValidCoord(loc.lat, loc.lng)) return;
    const map = mapRef.current;
    if (!map) return;
    programmaticRef.current = true;
    map.panTo({ lat: parseFloat(loc.lat), lng: parseFloat(loc.lng) });
    map.setZoom(14);
    programmaticRef.current = false;
    setHasInteracted(true);
  }, []);

  const handleCenterOnJob = useCallback((job) => {
    if (!isValidCoord(job.service_lat, job.service_lng)) return;
    const map = mapRef.current;
    if (!map) return;
    programmaticRef.current = true;
    map.panTo({ lat: parseFloat(job.service_lat), lng: parseFloat(job.service_lng) });
    map.setZoom(14);
    programmaticRef.current = false;
    setHasInteracted(true);
  }, []);

  const handleLayerToggle = useCallback((key) => {
    setLayers(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // ── Auto-location ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (permissionState !== 'granted') return;
    if (autoLocationAppliedRef.current) return;
    if (!mapRef.current || !dataLoadedRef.current) return;
    const src = lastViewportSourceRef.current;
    if (initialFitDoneRef.current && src !== 'fallback' && src !== 'persisted_viewport') return;
    autoLocationAppliedRef.current = true;
    centerOnMe();
  }, [permissionState, centerOnMe, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (permissionState === 'granted') {
      setShowInstructions(false);
      setBannerDismissed(false);
    }
  }, [permissionState]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="dispatch-root">

        <DispatchKPIStrip onCardClick={() => {}} />

        <div className="dispatch-workspace">

          <DispatchTeamPanel
            techs={techs}
            techLocs={techLocs}
            jobs={jobs}
            sessions={sessions}
            loading={loading}
            selectedItem={selectedItem}
            onSelectTech={handleSelectTech}
            onSelectJob={handleSelectJob}
          />

          <div className="dispatch-map-stage">
            <DispatchBaseMap onMapReady={handleMapReady} />

            <div className="dispatch-map-overlays">
              <DispatchMapControls
                onFitAll={handleFitAll}
                onCenterOnMe={handleCenterOnMe}
                onRecenter={handleRecenter}
                locating={locationStatus === 'checking'}
                hasInteracted={hasInteracted}
                mapReady={mapReady}
                permState={permissionState}
                layers={layers}
                onLayerToggle={handleLayerToggle}
              />

              {!promptDismissed && permissionState === 'prompt' && (
                <LocationPermissionBanner
                  variant="first_visit"
                  onEnable={handleEnableLocation}
                  onSkip={handleSkipLocation}
                  isEnabling={locationStatus === 'checking'}
                />
              )}

              {!bannerDismissed && (permissionState === 'denied' || permissionState === 'unavailable') && (
                <LocationPermissionBanner
                  variant={permissionState}
                  onTryAgain={tryAgain}
                  onOpenHelp={() => setShowInstructions(true)}
                  onDismiss={() => setBannerDismissed(true)}
                  dismissable
                />
              )}

              {recenterMsg && (
                <div style={{
                  position: 'absolute', bottom: 56, left: '50%', transform: 'translateX(-50%)',
                  background: 'rgba(28,35,51,0.85)', color: '#fff',
                  padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                  pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 20,
                }}>
                  {recenterMsg}
                </div>
              )}

              <DispatchDrawer
                item={selectedItem}
                techs={techs}
                techLocs={techLocs}
                jobs={jobs}
                onClose={handleCloseDrawer}
                onCenterTech={handleCenterOnTech}
                onCenterJob={handleCenterOnJob}
              />

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
      </div>

      {showInstructions && (
        <LocationInstructionsModal onClose={() => setShowInstructions(false)} />
      )}
    </>
  );
}
