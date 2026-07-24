import React, { useEffect, useRef, useState } from 'react';
import { InfoWindow, useMap } from '@vis.gl/react-google-maps';
import api from '../api';
import { GoogleMap, Marker, useGeocoder } from '../maps';

const CONTINENTAL_US = { lat: 39.5, lng: -98.35 };

const AVATAR_COLORS = ['#2E7D32', '#1565C0', '#E65100', '#6A1B9A', '#AD1457'];

const JOB_COLORS = {
  scheduled:   '#8A90A2',
  in_progress: '#1565C0',
  complete:    '#2E7D32',
  cancelled:   '#C62828',
  no_show:     '#C62828',
};

const JOB_STATUS_STYLE = {
  scheduled:   { background: 'var(--offwhite)', color: 'var(--slate)'  },
  in_progress: { background: 'var(--blue-lt)',  color: 'var(--blue)'   },
  complete:    { background: 'var(--green-lt)', color: 'var(--green)'  },
  cancelled:   { background: 'var(--red-lt)',   color: 'var(--red)'    },
  no_show:     { background: 'var(--red-lt)',   color: 'var(--red)'    },
};

const JOB_STATUS_LABEL = {
  scheduled: 'Scheduled', in_progress: 'Active', complete: 'Done',
  cancelled: 'Cancelled', no_show: 'No-show',
};

// GPS age thresholds
const GPS_STALE_MS   = 2  * 60 * 1000;  // amber ring on marker
const GPS_OFFLINE_MS = 15 * 60 * 1000;  // hide marker entirely

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

// Safely converts a DB coordinate value to a finite number, or null.
function toCoord(val) {
  if (val == null || val === '') return null;
  const n = Number(val);
  return isFinite(n) ? n : null;
}

// Returns { label, color, bg } for the tech status badge
function getTechStatus(tech, jobs, techLocs) {
  if (!tech.is_available) return { label: 'Off Duty',  color: '#8A90A2', bg: '#f1f5f9' };
  const loc      = techLocs.find(l => l.user_id === tech.id);
  const isBusy   = jobs.some(j => j.tech_id === tech.id && j.status === 'in_progress');
  if (isBusy)    return { label: 'Busy',      color: '#D97706', bg: 'rgba(217,119,6,.10)' };
  if (!loc)      return { label: 'Available', color: '#2E7D32', bg: 'rgba(46,125,50,.10)' };
  const age = Date.now() - new Date(loc.updated_at).getTime();
  if (age > GPS_OFFLINE_MS) return { label: 'No GPS',   color: '#8A90A2', bg: '#f1f5f9' };
  if (age > GPS_STALE_MS)   return { label: 'Available', color: '#D97706', bg: 'rgba(217,119,6,.10)' };
  return { label: 'Available', color: '#2E7D32', bg: 'rgba(46,125,50,.10)' };
}

function dotIcon(fill, stroke) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">` +
    `<circle cx="8" cy="8" r="6" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>` +
    `</svg>`
  )}`;
}

function avatarIcon(fill, stroke, text) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">` +
    `<circle cx="20" cy="20" r="18" fill="${fill}" stroke="${stroke}" stroke-width="3"/>` +
    `<text x="20" y="25" text-anchor="middle" fill="white" font-size="13" font-weight="bold" font-family="Arial,sans-serif">${text}</text>` +
    `</svg>`
  )}`;
}

// Centers/fits the map whenever the set of mapped positions changes in count.
// Intentionally keyed on length, not values — prevents re-centering on every
// 15-second poll when marker positions shift slightly.
function MapAutoCenter({ positions, fallbackCenter, fallbackZoom }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    if (positions.length > 1) {
      if (!window.google?.maps?.LatLngBounds) return;
      const bounds = new window.google.maps.LatLngBounds();
      positions.forEach(p => bounds.extend(p));
      map.fitBounds(bounds, 60);
    } else if (positions.length === 1) {
      map.panTo(positions[0]);
      map.setZoom(14);
    } else {
      map.panTo(fallbackCenter);
      map.setZoom(fallbackZoom);
    }
  }, [map, positions.length, fallbackCenter.lat, fallbackCenter.lng, fallbackZoom]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const SESSION_COLORS = {
  scheduled:         '#3B82F6',
  checked_in:        '#2E7D32',
  in_progress:       '#D97706',
  completed_for_day: '#2E7D32',
  paused:            '#7C3AED',
  cancelled:         '#C62828',
};

export default function Dispatch() {
  const [jobs,       setJobs]       = useState([]);
  const [sessions,   setSessions]   = useState([]);
  const [techs,      setTechs]      = useState([]);
  const [techLocs,   setTechLocs]   = useState([]);
  const [selected,   setSelected]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [activeInfo, setActiveInfo] = useState(null);
  const [, forceUpdate]             = useState(0);
  const [geoCenter,  setGeoCenter]  = useState(null);
  const [hqAddress,  setHqAddress]  = useState(null);

  const geocacheRef = useRef({});
  const { geocode } = useGeocoder();

  // ── Initial data load ────────────────────────────────────────────────────────
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    Promise.all([
      api.get(`/jobs?date=${today}`),
      api.get('/users'),
      api.get('/business-settings').catch(() => null),
      api.get('/mobile/locations').catch(() => null),
      api.get(`/jobs/sessions?date_from=${today}&date_to=${today}`).catch(() => ({ data: [] })),
    ]).then(([jobsRes, usersRes, settingsRes, locsRes, sessionsRes]) => {
      setJobs(jobsRes.data);
      setSessions(sessionsRes.data || []);
      setTechs(usersRes.data.filter(u => u.role === 'tech'));
      setTechLocs(locsRes?.data || []);
      const p = settingsRes?.data?.profile;
      if (p) {
        const parts = [p.address, p.city, p.state, p.zip].filter(Boolean);
        if (parts.length) setHqAddress(parts.join(', '));
      }
    }).finally(() => setLoading(false));

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => setGeoCenter({ lat: coords.latitude, lng: coords.longitude }),
        () => {},
        { timeout: 8000 },
      );
    }
  }, []);

  // ── Live-poll tech locations every 15 s ──────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      api.get('/mobile/locations')
        .then(r => setTechLocs(r.data))
        .catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, []);

  // ── Client-side geocoding fallback for jobs without stored coords ─────────────
  useEffect(() => {
    if (!jobs.length) return;
    const cache   = geocacheRef.current;
    const pending = jobs.filter(j =>
      !j.service_lat && !j.service_lng &&
      j.service_address &&
      !(j.service_address in cache)
    );
    if (!pending.length) return;
    pending.forEach(j => {
      cache[j.service_address] = null;
      geocode(j.service_address)
        .then(r => {
          cache[j.service_address] = { lat: r.lat, lng: r.lng };
          forceUpdate(n => n + 1);
        })
        .catch(() => {});
    });
  }, [jobs, geocode]);

  // ── Geocode HQ address for fallback map center ────────────────────────────────
  useEffect(() => {
    if (!hqAddress || hqAddress in geocacheRef.current) return;
    geocacheRef.current[hqAddress] = null;
    geocode(hqAddress)
      .then(r => {
        geocacheRef.current[hqAddress] = { lat: r.lat, lng: r.lng };
        forceUpdate(n => n + 1);
      })
      .catch(() => {});
  }, [hqAddress, geocode]);

  // ── Position helpers ──────────────────────────────────────────────────────────

  // Job position — service address coordinates only (no checkin fallback here;
  // tech checkin is a tech position, not a job position).
  function jobPos(j) {
    const slat = toCoord(j.service_lat);
    const slng = toCoord(j.service_lng);
    if (slat !== null && slng !== null) return { lat: slat, lng: slng };
    if (j.service_address) return geocacheRef.current[j.service_address] || null;
    return null;
  }

  // Tech position — from live tech_locations table only.
  // Returns null when no location record exists or when offline (>15 min).
  function techPos(t) {
    const loc = techLocs.find(l => l.user_id === t.id);
    if (!loc) return null;
    const age = Date.now() - new Date(loc.updated_at).getTime();
    if (age > GPS_OFFLINE_MS) return null;
    return { lat: Number(loc.lat), lng: Number(loc.lng) };
  }

  // Priority order for auto-centering:
  //   live tech GPS → mapped jobs → browser geo → HQ → continental US
  const allPositions = [
    ...techs.map(techPos).filter(Boolean),
    ...jobs.map(jobPos).filter(Boolean),
  ].filter((p, i, arr) => arr.findIndex(q => q.lat === p.lat && q.lng === p.lng) === i);

  const fallback = (() => {
    if (geoCenter) return { center: geoCenter, zoom: 11 };
    const hqPos = hqAddress && geocacheRef.current[hqAddress];
    if (hqPos) return { center: hqPos, zoom: 12 };
    return { center: CONTINENTAL_US, zoom: 4 };
  })();

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
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
          const status    = getTechStatus(t, jobs, techLocs);
          const loc       = techLocs.find(l => l.user_id === t.id);
          const locAge    = loc ? Date.now() - new Date(loc.updated_at).getTime() : null;
          const isStale   = locAge !== null && locAge > GPS_STALE_MS && locAge <= GPS_OFFLINE_MS;
          const techJobs  = jobs.filter(j => j.tech_id === t.id);
          const activeJob = techJobs.find(j => j.status === 'in_progress');
          const color     = AVATAR_COLORS[i % AVATAR_COLORS.length];

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
          const pos       = jobPos(j);
          const notMapped = j.service_address && !pos;
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
                  {notMapped && (
                    <span style={{ color: '#f59e0b', marginLeft: 6, fontSize: 11, fontWeight: 500 }}>
                      ⚠ Address not mapped
                    </span>
                  )}
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
              const color = SESSION_COLORS[s.status] || '#3B82F6';
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
        <GoogleMap className="dispatch-map" center={CONTINENTAL_US} zoom={4}>

          <MapAutoCenter
            positions={allPositions}
            fallbackCenter={fallback.center}
            fallbackZoom={fallback.zoom}
          />

          {/* Job markers */}
          {!loading && jobs.map(j => {
            const pos = jobPos(j);
            if (!pos) return null;
            const color = JOB_COLORS[j.status] || '#8A90A2';
            return (
              <Marker
                key={`job-${j.id}`}
                position={pos}
                icon={dotIcon(color, 'white')}
                onClick={() => setActiveInfo({ pos, job: j })}
              />
            );
          })}

          {/* Tech markers — only when live GPS ≤ 15 min old */}
          {!loading && techs.map((t, i) => {
            const pos = techPos(t);
            if (!pos) return null;
            const loc     = techLocs.find(l => l.user_id === t.id);
            const isStale = loc && (Date.now() - new Date(loc.updated_at).getTime()) > GPS_STALE_MS;
            const fill    = AVATAR_COLORS[i % AVATAR_COLORS.length];
            const stroke  = isStale ? '#D97706' : '#2E7D32';
            const jobCount = jobs.filter(j => j.tech_id === t.id).length;
            return (
              <Marker
                key={`tech-${t.id}`}
                position={pos}
                icon={avatarIcon(fill, stroke, initials(t.name))}
                onClick={() => setActiveInfo({ pos, tech: t, isStale, jobCount, loc })}
              />
            );
          })}

          {/* Info window on marker click */}
          {activeInfo && (
            <InfoWindow
              position={activeInfo.pos}
              onCloseClick={() => setActiveInfo(null)}
            >
              {activeInfo.job && (() => {
                const j = activeInfo.job;
                return (
                  <div style={{ fontFamily: 'sans-serif', fontSize: 12, minWidth: 170 }}>
                    <strong style={{ fontSize: 13 }}>{j.client_name} — {j.service_type}</strong><br />
                    <span style={{ color: '#5F667A' }}>
                      {j.tech_name || 'Unassigned'}
                      {j.amount ? ` · $${parseFloat(j.amount).toFixed(0)}` : ''}
                    </span><br />
                    <span style={{ color: '#8A90A2', textTransform: 'capitalize' }}>
                      {(j.status || '').replace('_', ' ')} · {fmtTime(j.scheduled_at)}
                    </span>
                    {j.service_address && (
                      <><br /><span style={{ color: '#64748b', fontSize: 11 }}>{j.service_address}</span></>
                    )}
                  </div>
                );
              })()}
              {activeInfo.tech && (() => {
                const t   = activeInfo.tech;
                const loc = activeInfo.loc;
                return (
                  <div style={{ fontFamily: 'sans-serif', fontSize: 12 }}>
                    <strong style={{ fontSize: 13 }}>{t.name}</strong><br />
                    <span style={{ color: '#5F667A' }}>
                      {activeInfo.jobCount} job{activeInfo.jobCount !== 1 ? 's' : ''} today
                    </span><br />
                    {loc ? (
                      <span style={{ color: activeInfo.isStale ? '#D97706' : '#2E7D32' }}>
                        {activeInfo.isStale ? '⚠ GPS stale' : '● Live GPS'}
                        {' · '}{fmtAgeShort(loc.updated_at)}
                      </span>
                    ) : (
                      <span style={{ color: '#8A90A2' }}>No GPS data</span>
                    )}
                  </div>
                );
              })()}
            </InfoWindow>
          )}

        </GoogleMap>

        {/* Legend */}
        <div className="dispatch-legend">
          {[
            { color: '#2E7D32',  label: 'Tech — live GPS'  },
            { color: '#D97706',  label: 'Tech — GPS stale' },
            { color: '#1565C0',  label: 'Job — active'     },
            { color: '#2E7D32',  label: 'Job — complete'   },
            { color: '#C62828',  label: 'Job — cancelled'  },
            { color: '#8A90A2',  label: 'Job — scheduled'  },
          ].map((l, i) => (
            <div key={i} className="dispatch-legend-item">
              <div className="dispatch-legend-dot" style={{ background: l.color }} />
              <span>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
