import { useEffect, useRef, useState, useCallback } from 'react';
import api from '../api';
import DispatchBaseMap from '../maps/DispatchBaseMap';
import DispatchMapControls from '../maps/DispatchMapControls';
import DispatchMapLegend from '../maps/DispatchMapLegend';
import DispatchSidebar from '../maps/DispatchSidebar';
import DispatchFullMapControl from '../maps/DispatchFullMapControl';
import DispatchOverlayStatus from '../maps/DispatchOverlayStatus';
import DispatchDrawer from '../maps/DispatchDrawer';
import { useDispatchSidebarMode } from '../hooks/useDispatchSidebarMode';
import LocationPermissionBanner from '../maps/LocationPermissionBanner';
import LocationInstructionsModal from '../maps/LocationInstructionsModal';
import { resolveDispatchViewport } from '../maps/dispatchViewport';
import { useDispatchLocation } from '../hooks/useDispatchLocation';
import { isValidCoord, classifyTechGPS } from '../maps/dispatchCoords';
import { getJobMarkerColor } from '../domain/jobStatusPresentation';
import { getTechStatus } from '../domain/technicianStatusPresentation';

// Job statuses that should appear as map markers.
// Cancelled and no_show are excluded — they are terminal states not relevant
// to active field operations and would clutter the map with old pins.
const MAP_MARKER_STATUSES = new Set([
  'scheduled', 'en_route', 'arrived', 'in_progress', 'paused',
  'awaiting_client', 'awaiting_parts', 'partially_completed',
  'ready_for_inspection', 'complete',
]);

// ── Viewport persistence ──────────────────────────────────────────────────────
const VP_KEY     = 'fc_dispatch_vp';
const VP_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

// ── Legend visibility persistence ─────────────────────────────────────────────
const LEGEND_KEY = 'fc_dispatch_legend';
function getInitialLegend() {
  try { return localStorage.getItem(LEGEND_KEY) !== 'false'; }
  catch { return true; }
}

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


const FIT_PADDING  = { top: 60, right: 60, bottom: 60, left: 60 };
const MAX_AUTO_ZOOM = 15;

function initials(name) {
  return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ── Marker SVG helpers ────────────────────────────────────────────────────────

// Amber ring around the marker body indicates stale GPS location data.
// Visually distinct from In Progress gold (#D4A000) — uses amber #F59E0B.
const STALE_RING_COLOR = '#F59E0B';

function techMarkerSvg(inits, color, isSelected, isStale) {
  const size = isSelected ? 34 : 28;
  const r    = size / 2;
  const fs   = Math.round(size * 0.32);

  if (isStale) {
    // Blue body + amber warning ring (ring is outer circle, body is inner circle)
    const outerR = r - 0.5;
    const innerR = r - 3;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${r}" cy="${r}" r="${outerR}" fill="${STALE_RING_COLOR}"/><circle cx="${r}" cy="${r}" r="${innerR}" fill="${color}"/><text x="${r}" y="${r}" dy=".35em" text-anchor="middle" font-family="Inter,sans-serif" font-size="${fs}px" font-weight="800" fill="white">${inits}</text></svg>`;
  }

  const sw     = isSelected ? 2 : 0;
  const stroke = isSelected ? 'white' : 'none';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${r}" cy="${r}" r="${r - 1}" fill="${color}" stroke="${stroke}" stroke-width="${sw}"/><text x="${r}" y="${r}" dy=".35em" text-anchor="middle" font-family="Inter,sans-serif" font-size="${fs}px" font-weight="800" fill="white">${inits}</text></svg>`;
}

function techMarkerIcon(inits, color, isSelected, isStale) {
  const size = isSelected ? 34 : 28;
  return {
    url: `data:image/svg+xml,${encodeURIComponent(techMarkerSvg(inits, color, isSelected, isStale))}`,
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
  const [showLegend,       setShowLegend]       = useState(getInitialLegend);
  const [panelFocus,       setPanelFocus]       = useState(null);
  const [activeKpiKey,     setActiveKpiKey]     = useState(null);
  const [lastPanelTab,     setLastPanelTab]     = useState('team');
  const sidebarMode = useDispatchSidebarMode();
  const [loading,          setLoading]          = useState(true);
  const [overlayError,     setOverlayError]     = useState(false);
  const [retryKey,         setRetryKey]         = useState(0);
  // null = today (server resolves tenant TZ); 'YYYY-MM-DD' = specific date
  const [dispatchDate,     setDispatchDate]     = useState(null);
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

  // ── Initial data load (and date-change refresh) ───────────────────────────
  // Uses /dispatch/schedule so the "today" boundary is resolved server-side in
  // the tenant's timezone. Passes ?date= when user has selected a specific date.
  // Users, locations, and settings are loaded once; only the schedule re-fetches
  // on date change since techs and settings are date-agnostic.
  useEffect(() => {
    setLoading(true);
    const scheduleParams = dispatchDate ? { date: dispatchDate } : {};
    Promise.all([
      api.get('/dispatch/schedule', { params: scheduleParams }),
      api.get('/users'),
      api.get('/mobile/locations').catch(() => null),
      api.get('/dispatch-settings').catch(() => null),
    ]).then(([scheduleRes, usersRes, locsRes, dsRes]) => {
      const { jobs: fetchedJobs = [], sessions: fetchedSessions = [] } = scheduleRes.data || {};
      const fetchedLocs = locsRes?.data || [];
      const fetchedDS   = dsRes?.data?.settings || null;
      const fetchedAcct = dsRes?.data?.account  || null;

      setJobs(fetchedJobs);
      setSessions(fetchedSessions);
      setOverlayError(false);
      // field_work_eligible check with backward-compat for pre-migration API responses
      setTechs(usersRes.data.filter(u =>
        u.field_work_eligible === true ||
        (u.field_work_eligible == null && u.role === 'tech')
      ));
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

      if (import.meta.env.DEV) {
        window.__FIELDCORE_DISPATCH_DATA_DIAGNOSTICS__ = {
          ts: new Date().toISOString(), source: 'initial',
          dispatchDate: dispatchDate || 'today',
          jobCount: fetchedJobs.length, sessionCount: fetchedSessions.length,
          techCount: usersRes.data.filter(u => u.role === 'tech').length,
          locCount: fetchedLocs.length,
          jobStatuses: fetchedJobs.reduce((acc, job) => { acc[job.status] = (acc[job.status] || 0) + 1; return acc; }, {}),
        };
      }

      if (mapRef.current && !initialFitDoneRef.current) {
        computeAndApplyViewport();
      }
    }).catch(() => {
      setOverlayError(true);
    }).finally(() => setLoading(false));
  }, [dispatchDate, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live-poll tech locations every 15 s ───────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      api.get('/mobile/locations')
        .then(r => { setTechLocs(r.data); techLocsRef.current = r.data; })
        .catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, []);

  // ── Live-poll jobs and sessions every 30 s ────────────────────────────────
  // Ensures status changes (e.g. tech starts a job) propagate to the sidebar
  // and map markers without requiring a page reload.
  // Re-creates the interval when dispatchDate changes so it always polls the
  // correct date rather than always re-fetching today.
  useEffect(() => {
    const scheduleParams = dispatchDate ? { date: dispatchDate } : {};
    const id = setInterval(() => {
      if (document.hidden) return;
      api.get('/dispatch/schedule', { params: scheduleParams }).then(r => {
        const { jobs: j = [], sessions: s = [] } = r.data || {};
        setJobs(j);
        setSessions(s);
        jobsRef.current = j;
        if (import.meta.env.DEV) {
          window.__FIELDCORE_DISPATCH_DATA_DIAGNOSTICS__ = {
            ts: new Date().toISOString(), source: 'poll',
            dispatchDate: dispatchDate || 'today',
            jobCount: j.length, sessionCount: s.length,
            jobStatuses: j.reduce((acc, job) => { acc[job.status] = (acc[job.status] || 0) + 1; return acc; }, {}),
          };
        }
      }).catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  }, [dispatchDate]);

  // ── Tech markers ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !window.google?.maps) return;
    const map = mapRef.current;
    if (!map) return;

    const activeIds = new Set();

    techs.forEach((tech, idx) => {
      const loc = techLocs.find(l => l.user_id === tech.id);
      if (!loc || !isValidCoord(loc.lat, loc.lng)) return;
      if (classifyTechGPS(loc.updated_at) === 'offline') return;

      activeIds.add(tech.id);
      const status = getTechStatus(tech, techLocs, jobs);
      const color  = status.markerColor;
      const isSel  = selectedItem?.type === 'tech' && selectedItem?.id === tech.id;
      const icon   = techMarkerIcon(initials(tech.name), color, isSel, status.isStale);

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
  }, [techs, techLocs, jobs, selectedItem, mapReady, layers.techs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Job markers ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !window.google?.maps) return;
    const map = mapRef.current;
    if (!map) return;

    const activeIds = new Set();

    jobs.forEach(job => {
      if (!isValidCoord(job.service_lat, job.service_lng)) return;
      if (!MAP_MARKER_STATUSES.has(job.status)) return; // skip cancelled, no_show

      activeIds.add(job.id);
      const color = getJobMarkerColor(job.status);
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

  // ── Map resize after sidebar transition ──────────────────────────────────
  const handleSidebarTransitionEnd = useCallback(() => {
    const map = mapRef.current;
    if (map && window.google?.maps) {
      window.google.maps.event.trigger(map, 'resize');
    }
  }, []);

  // ── KPI card click → expand sidebar, navigate panel, highlight card ────
  const handleKpiCardClick = useCallback((key) => {
    const focus = {
      liveTechnicians: { tab: 'team', teamFilter: 'live'      },
      activeJobs:      { tab: 'jobs', jobFilter:  'active'    },
      todaysJobs:      { tab: 'jobs', jobFilter:  'all'       },
      completedToday:  { tab: 'jobs', jobFilter:  'completed' },
      averageResponse: { tab: 'jobs', jobFilter:  'all'       },
    };
    setActiveKpiKey(prev => (prev === key ? null : key));
    if (focus[key]) {
      setLastPanelTab(focus[key].tab);
      setPanelFocus({ ...focus[key], _nonce: Date.now() });
    }
    if (sidebarMode.mode !== 'expanded') {
      if (focus[key]?.tab === 'team') sidebarMode.openTeam();
      else sidebarMode.openJobs();
    }
  }, [sidebarMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Date change ───────────────────────────────────────────────────────────
  const handleDateChange = useCallback((date) => {
    setDispatchDate(date);
    // Clear any selected record since it may belong to a different date's scope
    setSelectedItem(null);
    setActiveKpiKey(null);
  }, []);

  // ── Compact rail / sidebar expand actions ─────────────────────────────
  const handleExpandToTeam = useCallback(() => {
    sidebarMode.openTeam();
    setLastPanelTab('team');
    setPanelFocus({ tab: 'team', _nonce: Date.now() });
  }, [sidebarMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExpandToJobs = useCallback(() => {
    sidebarMode.openJobs();
    setLastPanelTab('jobs');
    setPanelFocus({ tab: 'jobs', _nonce: Date.now() });
  }, [sidebarMode]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleLegendToggle = useCallback(() => {
    setShowLegend(v => {
      const next = !v;
      try { localStorage.setItem(LEGEND_KEY, String(next)); } catch {}
      return next;
    });
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

  const { mode, isMobile, toggleExpandedCompact, enterFullMap, exitFullMap } = sidebarMode;
  const sidebarWidth = isMobile ? undefined : { expanded: '280px', compact: '76px', full_map: '0px' }[mode];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="dispatch-root">

        <div
          className="dispatch-workspace"
          style={sidebarWidth ? { '--dispatch-sidebar-width': sidebarWidth } : undefined}
        >

          <DispatchSidebar
            mode={mode}
            isMobile={isMobile}
            onToggle={toggleExpandedCompact}
            onEnterFullMap={enterFullMap}
            onTransitionEnd={handleSidebarTransitionEnd}
            activeKpiKey={activeKpiKey}
            onKpiClick={handleKpiCardClick}
            onExpandToTeam={handleExpandToTeam}
            onExpandToJobs={handleExpandToJobs}
            activeTab={lastPanelTab}
            panelFocus={panelFocus}
            techs={techs}
            techLocs={techLocs}
            jobs={jobs}
            sessions={sessions}
            loading={loading}
            selectedItem={selectedItem}
            onSelectTech={handleSelectTech}
            onSelectJob={handleSelectJob}
            dispatchDate={dispatchDate}
            onDateChange={handleDateChange}
          />

          <div className="dispatch-map-stage">
            <DispatchBaseMap onMapReady={handleMapReady} />

            <div className="dispatch-map-overlays">
              {mode === 'full_map' && (
                <DispatchFullMapControl onOpen={exitFullMap} />
              )}

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
                showLegend={showLegend}
                onLegendToggle={handleLegendToggle}
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

              <DispatchOverlayStatus
                loading={loading}
                error={overlayError}
                stale={false}
                onRetry={() => setRetryKey(k => k + 1)}
              />

              <DispatchMapLegend visible={showLegend} techs={techs} techLocs={techLocs} jobs={jobs} layers={layers} />

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
