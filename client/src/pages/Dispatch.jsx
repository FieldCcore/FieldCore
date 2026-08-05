import { useEffect, useRef, useState, useCallback } from 'react';
import api from '../api';
import DispatchBaseMap from '../maps/DispatchBaseMap';
import DispatchMapControls from '../maps/DispatchMapControls';
import DispatchMapLegend from '../maps/DispatchMapLegend';
import DispatchSidebar from '../maps/DispatchSidebar';
import DispatchFullMapControl from '../maps/DispatchFullMapControl';
import DispatchOverlayStatus from '../maps/DispatchOverlayStatus';
import { useDispatchSidebarMode } from '../hooks/useDispatchSidebarMode';
import { useDispatchFeatureFlags } from '../hooks/useDispatchFeatureFlags';
import { useDispatchWorkloads } from '../hooks/useDispatchWorkloads';
import { useDispatchRouteSequence } from '../hooks/useDispatchRouteSequence';
import { useDispatchServiceAreas } from '../hooks/useDispatchServiceAreas';
import { useDispatchDelayPredictions } from '../hooks/useDispatchDelayPredictions';
import { useDispatchActivity } from '../hooks/useDispatchActivity';
import LocationPermissionBanner from '../maps/LocationPermissionBanner';
import LocationInstructionsModal from '../maps/LocationInstructionsModal';
import { resolveDispatchViewport } from '../maps/dispatchViewport';
import { useDispatchLocation } from '../hooks/useDispatchLocation';
import { isValidCoord, classifyTechGPS } from '../maps/dispatchCoords';
import { getJobMarkerColor } from '../domain/jobStatusPresentation';
import { getTechStatus } from '../domain/technicianStatusPresentation';
import { resolveCalendarTimeZone } from '../utils/calendarTimezone';

function getUserRoleFromToken() {
  try {
    const token = localStorage.getItem('fc_token');
    if (!token) return 'tech';
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role || 'tech';
  } catch { return 'tech'; }
}

// Job statuses that should appear as map markers.
const MAP_MARKER_STATUSES = new Set([
  'scheduled', 'en_route', 'arrived', 'in_progress', 'paused',
  'awaiting_client', 'awaiting_parts', 'partially_completed',
  'ready_for_inspection', 'complete', 'cancelled',
]);

// ── Viewport persistence ──────────────────────────────────────────────────────
const VP_KEY     = 'fc_dispatch_vp';
const VP_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

// ── Legend collapse persistence ───────────────────────────────────────────────
const LEGEND_COLLAPSE_KEY = 'fieldcore:dispatch:legend-collapsed';

function getInitialLegendCollapsed() {
  try { return localStorage.getItem(LEGEND_COLLAPSE_KEY) === 'true'; }
  catch { return false; }
}

function saveLegendCollapsed(val) {
  try { localStorage.setItem(LEGEND_COLLAPSE_KEY, val ? 'true' : 'false'); } catch {}
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

const FIT_PADDING   = { top: 60, right: 60, bottom: 60, left: 60 };
const MAX_AUTO_ZOOM = 15;

function initials(name) {
  return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ── Marker SVG helpers ────────────────────────────────────────────────────────

const STALE_RING_COLOR = '#F59E0B';

function techMarkerSvg(inits, color, isSelected, isStale) {
  const size = isSelected ? 34 : 28;
  const r    = size / 2;
  const fs   = Math.round(size * 0.32);
  if (isStale) {
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

// Cancelled job marker — red pin with X
function cancelledMarkerSvg(isSelected) {
  const stroke = isSelected ? 'white' : 'rgba(0,0,0,0.25)';
  const sw     = isSelected ? 2 : 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="30" viewBox="0 0 22 30">
    <path d="M11 1C6.58 1 3 4.58 3 9c0 5.25 8 19 8 19s8-13.75 8-19c0-4.42-3.58-8-8-8z" fill="#C62828" stroke="${stroke}" stroke-width="${sw}"/>
    <line x1="7.5" y1="5.5" x2="14.5" y2="12.5" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="14.5" y1="5.5" x2="7.5" y2="12.5" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;
}

function cancelledMarkerIcon(isSelected) {
  return {
    url: `data:image/svg+xml,${encodeURIComponent(cancelledMarkerSvg(isSelected))}`,
    scaledSize: new window.google.maps.Size(22, 30),
    anchor:     new window.google.maps.Point(11, 30),
  };
}

// Emergency job marker — enlarged bright-red pin with "!" label
function emergencyMarkerSvg(isSelected) {
  const stroke = isSelected ? 'white' : 'rgba(0,0,0,0.3)';
  const sw     = isSelected ? 2.5 : 1.5;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38">
    <path d="M14 1C8.48 1 4 5.48 4 11c0 6.56 10 26 10 26s10-19.44 10-26c0-5.52-4.48-10-10-10z" fill="#DC2626" stroke="${stroke}" stroke-width="${sw}"/>
    <text x="14" y="14" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="12" font-weight="900" fill="white">!</text>
  </svg>`;
}

function emergencyMarkerIcon(isSelected) {
  return {
    url: `data:image/svg+xml,${encodeURIComponent(emergencyMarkerSvg(isSelected))}`,
    scaledSize: new window.google.maps.Size(28, 38),
    anchor:     new window.google.maps.Point(14, 38),
  };
}

export default function Dispatch() {
  const [jobs,             setJobs]             = useState([]);
  const [sessions,         setSessions]         = useState([]);
  const [techs,            setTechs]            = useState([]);
  const [techLocs,         setTechLocs]         = useState([]);
  const [selectedItem,     setSelectedItem]     = useState(null);
  const [sidebarView,      setSidebarView]      = useState('list');
  const [layers,           setLayers]           = useState({ techs: true, jobs: true, traffic: false, service_areas: true });
  const [isLegendCollapsed, setIsLegendCollapsed] = useState(getInitialLegendCollapsed);
  const [panelFocus,       setPanelFocus]       = useState(null);
  const [activeKpiKey,     setActiveKpiKey]     = useState(null);
  const [lastPanelTab,     setLastPanelTab]     = useState('team');
  const sidebarMode = useDispatchSidebarMode();
  const [loading,          setLoading]          = useState(true);
  const [overlayError,     setOverlayError]     = useState(false);
  const [isDataStale,      setIsDataStale]      = useState(false);
  const [retryKey,         setRetryKey]         = useState(0);
  const [dispatchDate,     setDispatchDate]     = useState(null);
  const flags       = useDispatchFeatureFlags();
  const { byTechId: workloadsByTechId } = useDispatchWorkloads(dispatchDate, flags.dispatch_workload_balancing);
  const routeSeq    = useDispatchRouteSequence();
  const { areas: serviceAreas } = useDispatchServiceAreas(flags.dispatch_service_areas);
  const { byTechId: delaysByTechId } = useDispatchDelayPredictions(dispatchDate, flags.dispatch_delay_prediction);
  const activityState = useDispatchActivity();
  const [dispatchSettings, setDispatchSettings] = useState(null);
  const [dispatchTZ,       setDispatchTZ]       = useState(() => resolveCalendarTimeZone({}).timezone);
  const [accountLocation,  setAccountLocation]  = useState(null);
  const [hasInteracted,    setHasInteracted]    = useState(false);
  const [mapReady,         setMapReady]         = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [bannerDismissed,  setBannerDismissed]  = useState(false);
  const [promptDismissed,  setPromptDismissed]  = useState(false);
  const [recenterMsg,      setRecenterMsg]      = useState(null);
  const [assignmentPending, setAssignmentPending] = useState(null); // { job, tech, validation }
  const userRole = getUserRoleFromToken();

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
  const serviceAreaCirclesRef  = useRef({});
  // Track legend state before entering Full Map, so we can restore it on exit
  const preLegendStateRef      = useRef(null);

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

  // ── Initial data load ─────────────────────────────────────────────────────
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
      setTechs(usersRes.data.filter(u =>
        u.field_work_eligible === true ||
        (u.field_work_eligible == null && u.role === 'tech')
      ));
      setTechLocs(fetchedLocs);
      setDispatchSettings(fetchedDS);
      setDispatchTZ(resolveCalendarTimeZone({ businessTimezone: fetchedAcct?.timezone }).timezone);
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
      setIsDataStale(false);
      if (import.meta.env.DEV) {
        window.__FIELDCORE_DISPATCH_DIAGNOSTICS__ = {
          source: 'initial',
          generatedAt: new Date().toISOString(),
          selectedDate: dispatchDate || 'today',
          timezone: resolveCalendarTimeZone({ businessTimezone: fetchedAcct?.timezone }).timezone,
          summary: {
            jobCount: fetchedJobs.length,
            sessionCount: fetchedSessions.length,
            techCount: usersRes.data.filter(u =>
              u.field_work_eligible === true ||
              (u.field_work_eligible == null && u.role === 'tech')
            ).length,
            locCount: fetchedLocs.length,
          },
          markerCounts: {
            jobs: fetchedJobs.filter(j => j.service_lat != null && j.service_lng != null).length,
            techs: fetchedLocs.length,
          },
          layerState: { techs: true, jobs: true, traffic: false },
          stale: false,
          lastErrorCode: null,
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
        .then(r => { setTechLocs(r.data); techLocsRef.current = r.data; setIsDataStale(false); })
        .catch(() => { setIsDataStale(true); });
    }, 15000);
    return () => clearInterval(id);
  }, []);

  // ── Live-poll jobs and sessions every 30 s ────────────────────────────────
  useEffect(() => {
    const scheduleParams = dispatchDate ? { date: dispatchDate } : {};
    const id = setInterval(() => {
      if (document.hidden) return;
      api.get('/dispatch/schedule', { params: scheduleParams }).then(r => {
        const { jobs: j = [], sessions: s = [] } = r.data || {};
        setJobs(j);
        setSessions(s);
        jobsRef.current = j;
        setIsDataStale(false);
      }).catch(() => { setIsDataStale(true); });
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
          icon, title: tech.name, zIndex: isSel ? 100 : 10,
        });
        m.set('fieldcoreMarker', 'tech');
        m.set('techId', techId);
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
      if (!MAP_MARKER_STATUSES.has(job.status)) return;
      activeIds.add(job.id);
      const isSel      = selectedItem?.type === 'job' && selectedItem?.id === job.id;
      const isCancelled = job.status === 'cancelled';
      const isEmergency = job.is_emergency === true;
      const icon = isEmergency
        ? emergencyMarkerIcon(isSel)
        : isCancelled
          ? cancelledMarkerIcon(isSel)
          : jobMarkerIcon(getJobMarkerColor(job.status), isSel);
      const zBase = isEmergency ? 20 : isCancelled ? 3 : 5;
      if (jobMarkersRef.current[job.id]) {
        const m = jobMarkersRef.current[job.id];
        m.setPosition({ lat: parseFloat(job.service_lat), lng: parseFloat(job.service_lng) });
        m.setIcon(icon);
        m.setZIndex(isSel ? 100 : zBase);
        m.setMap(layers.jobs ? map : null);
      } else {
        const jobId = job.id;
        const m = new window.google.maps.Marker({
          position: { lat: parseFloat(job.service_lat), lng: parseFloat(job.service_lng) },
          map:      layers.jobs ? map : null,
          icon, title: `${job.client_name} — ${job.service_type}`,
          zIndex: isSel ? 100 : zBase,
        });
        m.set('fieldcoreMarker', 'job');
        m.set('jobId', jobId);
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
      if (!trafficLayerRef.current) trafficLayerRef.current = new window.google.maps.TrafficLayer();
      trafficLayerRef.current.setMap(map);
    } else {
      trafficLayerRef.current?.setMap(null);
    }
  }, [mapReady, layers.traffic]);

  // ── Service area circles ──────────────────────────────────────────────────
  useEffect(() => {
    const shouldShow = mapReady && window.google?.maps && flags.dispatch_service_areas && layers.service_areas;
    if (!shouldShow) {
      Object.values(serviceAreaCirclesRef.current).forEach(c => c.setMap(null));
      if (!flags.dispatch_service_areas) serviceAreaCirclesRef.current = {};
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    const activeIds = new Set();
    serviceAreas.forEach(area => {
      if (area.type !== 'radius' || !area.center_lat || !area.center_lng || !area.radius_km) return;
      activeIds.add(area.id);
      if (serviceAreaCirclesRef.current[area.id]) {
        serviceAreaCirclesRef.current[area.id].setMap(map);
        return;
      }
      serviceAreaCirclesRef.current[area.id] = new window.google.maps.Circle({
        map,
        center:        { lat: parseFloat(area.center_lat), lng: parseFloat(area.center_lng) },
        radius:        parseFloat(area.radius_km) * 1000,
        strokeColor:   '#1C2333',
        strokeOpacity: 0.4,
        strokeWeight:  1.5,
        fillColor:     '#1C2333',
        fillOpacity:   0.04,
        clickable:     false,
        zIndex:        1,
      });
    });
    Object.keys(serviceAreaCirclesRef.current).forEach(id => {
      if (!activeIds.has(id)) {
        serviceAreaCirclesRef.current[id].setMap(null);
        delete serviceAreaCirclesRef.current[id];
      }
    });
  }, [mapReady, serviceAreas, flags.dispatch_service_areas, layers.service_areas]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── selectedItem → sidebarView ────────────────────────────────────────────
  // When a job or tech is selected (via map click or sidebar card), switch the
  // sidebar to the corresponding detail view and expand if compact.
  // Route view sets selectedItem itself and manages sidebarView directly — skip.
  useEffect(() => {
    if (!selectedItem) {
      setSidebarView(v => (v === 'route_view' || v === 'assignment_confirm' || v === 'activity_timeline' || v === 'quick_comms') ? v : 'list');
      return;
    }
    if (selectedItem.type === 'job') {
      setSidebarView(v => (v === 'assignment_confirm' || v === 'activity_timeline' || v === 'quick_comms') ? v : 'job_details');
      if (sidebarMode.mode === 'compact') sidebarMode.openJobs?.();
      if (sidebarMode.mode === 'full_map') sidebarMode.exitFullMap?.();
    } else if (selectedItem.type === 'tech') {
      setSidebarView(v => (v === 'route_view' || v === 'assignment_confirm' || v === 'activity_timeline') ? v : 'tech_details');
      if (sidebarMode.mode === 'compact') sidebarMode.openTeam?.();
      if (sidebarMode.mode === 'full_map') sidebarMode.exitFullMap?.();
    }
  }, [selectedItem]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      Object.values(techMarkersRef.current).forEach(m => m.setMap(null));
      Object.values(jobMarkersRef.current).forEach(m => m.setMap(null));
      Object.values(serviceAreaCirclesRef.current).forEach(c => c.setMap(null));
      trafficLayerRef.current?.setMap(null);
      clearTimeout(vpSaveTimerRef.current);
      clearTimeout(recenterMsgTimerRef.current);
    };
  }, []);

  // ── Position-to-map ───────────────────────────────────────────────────────
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

  // ── Sidebar transition resize map ─────────────────────────────────────────
  const handleSidebarTransitionEnd = useCallback(() => {
    const map = mapRef.current;
    if (map && window.google?.maps) {
      window.google.maps.event.trigger(map, 'resize');
    }
  }, []);

  // ── KPI card click ────────────────────────────────────────────────────────
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
    setSelectedItem(null);
    setActiveKpiKey(null);
  }, []);

  // ── Compact / full-map expand actions ─────────────────────────────────────
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

  // ── Legend collapse toggle ─────────────────────────────────────────────────
  const handleLegendToggle = useCallback(() => {
    setIsLegendCollapsed(v => {
      const next = !v;
      saveLegendCollapsed(next);
      return next;
    });
  }, []);

  // ── Full Map: collapse legend on enter; restore on exit ───────────────────
  const handleEnterFullMap = useCallback(() => {
    preLegendStateRef.current = isLegendCollapsed;
    setIsLegendCollapsed(true);  // collapse while map is full-screen
    sidebarMode.enterFullMap();
  }, [isLegendCollapsed, sidebarMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExitFullMap = useCallback(() => {
    sidebarMode.exitFullMap();
    // Restore the legend state the user had before entering Full Map
    if (preLegendStateRef.current !== null) {
      setIsLegendCollapsed(preLegendStateRef.current);
      preLegendStateRef.current = null;
    }
  }, [sidebarMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Selection handlers ────────────────────────────────────────────────────
  const handleSelectTech = useCallback((id) => {
    setSelectedItem(prev => prev?.type === 'tech' && prev?.id === id ? null : { type: 'tech', id });
  }, []);

  const handleSelectJob = useCallback((id) => {
    setSelectedItem(prev => prev?.type === 'job' && prev?.id === id ? null : { type: 'job', id });
  }, []);

  const handleSidebarBack = useCallback(() => {
    setSelectedItem(null);
    setSidebarView('list');
    routeSeq.clearRoute();
    activityState.clearActivity();
  }, [routeSeq, activityState]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleJobGeocoded = useCallback((updatedJob) => {
    setJobs(prev => prev.map(j => j.id === updatedJob.id ? { ...j, ...updatedJob } : j));
  }, []);

  // ── Phase 1 assignment flow ───────────────────────────────────────────────
  const handleAssignJob = useCallback(async (jobId, techId) => {
    const job     = jobsRef.current.find(j => j.id === jobId);
    const tech    = techs.find(t => t.id === techId);
    if (!job || !tech) return;
    const techLoc = techLocsRef.current.find(l => l.user_id === techId) ?? null;

    // Expand sidebar so the confirmation panel is visible
    if (sidebarMode.mode === 'compact') sidebarMode.openTeam?.();
    if (sidebarMode.mode === 'full_map') sidebarMode.exitFullMap?.();

    // Fast path — ALREADY_ASSIGNED: skip API call, show info panel immediately
    if (job.tech_id === techId) {
      setAssignmentPending({
        job, tech, techLoc,
        validation: {
          assignmentState: 'ALREADY_ASSIGNED',
          allowed: false,
          blockingIssues: [], warnings: [], informational: [],
          scheduleImpact: { isReassignment: false },
          workloadImpact: {},
          techName: tech.name, techIsAvailable: tech.is_available !== false,
        },
      });
      setSidebarView('assignment_confirm');
      return;
    }

    try {
      const res = await api.post('/dispatch/assignments/validate', {
        jobId, techId, isEmergency: job.is_emergency ?? false,
      });
      setAssignmentPending({ job, tech, techLoc, validation: res.data });
      setSidebarView('assignment_confirm');
    } catch (err) {
      const isUnavailable = err.response?.status === 422 &&
        err.response?.data?.assignmentState === 'UNAVAILABLE';
      setAssignmentPending({
        job, tech, techLoc,
        validation: {
          assignmentState: isUnavailable ? 'UNAVAILABLE' : 'UNASSIGNED',
          allowed: false,
          blockingIssues: [{ message: err.response?.data?.error || 'Validation failed. Please try again.' }],
          warnings: [], informational: [],
          scheduleImpact: {}, workloadImpact: {},
          techName: tech.name, techIsAvailable: false,
        },
      });
      setSidebarView('assignment_confirm');
    }
  }, [techs, sidebarMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAssignConfirmed = useCallback((updatedJob) => {
    if (updatedJob) {
      setJobs(prev => prev.map(j => j.id === updatedJob.id ? { ...j, ...updatedJob } : j));
    }
    setAssignmentPending(null);
    setSelectedItem(null);
    setSidebarView('list');
  }, []);

  const handleAssignCancel = useCallback(() => {
    setAssignmentPending(null);
    setSidebarView('list');
  }, []);

  // ── Phase 2 route sequencing ──────────────────────────────────────────────
  const handleViewRoute = useCallback((techId) => {
    if (sidebarMode.mode === 'compact') sidebarMode.openTeam?.();
    if (sidebarMode.mode === 'full_map') sidebarMode.exitFullMap?.();
    setSidebarView('route_view');
    setSelectedItem({ type: 'tech', id: techId });
    routeSeq.loadRoute(techId, dispatchDate);
  }, [sidebarMode, dispatchDate, routeSeq]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveRoute = useCallback(async (techId, jobIds) => {
    await routeSeq.saveRoute(techId, jobIds);
  }, [routeSeq]);

  // ── Phase 3 comms + activity ──────────────────────────────────────────────
  const handleViewActivity = useCallback((type, id) => {
    if (sidebarMode.mode === 'compact') sidebarMode.openTeam?.();
    if (sidebarMode.mode === 'full_map') sidebarMode.exitFullMap?.();
    setSidebarView('activity_timeline');
    activityState.loadActivity(type, id);
  }, [sidebarMode, activityState]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleViewComms = useCallback((jobId) => {
    if (sidebarMode.mode === 'compact') sidebarMode.openJobs?.();
    if (sidebarMode.mode === 'full_map') sidebarMode.exitFullMap?.();
    setSidebarView('quick_comms');
    setSelectedItem({ type: 'job', id: jobId });
  }, [sidebarMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCommsSent = useCallback(() => {
    activityState.invalidate?.();
    setSidebarView('list');
  }, [activityState]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const { mode, isMobile, toggleExpandedCompact } = sidebarMode;
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
            onEnterFullMap={handleEnterFullMap}
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
            timezone={dispatchTZ}
            sidebarView={sidebarView}
            onSidebarBack={handleSidebarBack}
            onCenterJob={handleCenterOnJob}
            onCenterTech={handleCenterOnTech}
            onJobGeocoded={handleJobGeocoded}
            assignmentPending={assignmentPending}
            onAssignConfirmed={handleAssignConfirmed}
            onAssignCancel={handleAssignCancel}
            onAssignJob={handleAssignJob}
            flags={flags}
            workloadsByTechId={workloadsByTechId}
            userRole={userRole}
            routeState={routeSeq}
            onSaveRoute={handleSaveRoute}
            onViewRoute={handleViewRoute}
            activityState={activityState}
            onViewActivity={handleViewActivity}
            onViewComms={handleViewComms}
            onCommsSent={handleCommsSent}
            delaysByTechId={delaysByTechId}
          />

          <div className="dispatch-map-stage">
            <DispatchBaseMap onMapReady={handleMapReady} />

            <div className="dispatch-map-overlays">
              {mode === 'full_map' && (
                <DispatchFullMapControl onOpen={handleExitFullMap} />
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
                showLegend={!isLegendCollapsed}
                onLegendToggle={handleLegendToggle}
                serviceAreasEnabled={flags.dispatch_service_areas}
                hasServiceAreas={serviceAreas.length > 0}
                flags={flags}
                techs={techs}
                jobs={jobs}
                serviceAreas={serviceAreas}
                userRole={userRole}
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

              <DispatchOverlayStatus
                loading={loading}
                error={overlayError}
                stale={isDataStale}
                onRetry={() => setRetryKey(k => k + 1)}
              />

              {/* Legend — bottom-right overlay, always present, collapsible */}
              <DispatchMapLegend
                isCollapsed={isLegendCollapsed}
                onToggleCollapse={handleLegendToggle}
                techs={techs}
                techLocs={techLocs}
                jobs={jobs}
                layers={layers}
                flags={flags}
              />
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
