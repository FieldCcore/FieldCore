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
  cancelled:   'var(--red)',
};

const STATUS_STYLES = {
  scheduled:   { background: 'var(--offwhite)', color: 'var(--slate)' },
  in_progress: { background: 'var(--blue-lt)',  color: 'var(--blue)'  },
  complete:    { background: 'var(--green-lt)', color: 'var(--green)' },
  cancelled:   { background: 'var(--red-lt)',   color: 'var(--red)'   },
};

const STATUS_LABELS = {
  scheduled: 'Scheduled', in_progress: 'Active', complete: 'Done', cancelled: 'Cancelled',
};

function initials(name) {
  return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function dotIcon(fill, stroke) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"><circle cx="7" cy="7" r="5" fill="${fill}" stroke="${stroke}" stroke-width="2"/></svg>`
  )}`;
}

function avatarIcon(fill, stroke, text) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38"><circle cx="19" cy="19" r="17" fill="${fill}" stroke="${stroke}" stroke-width="3"/><text x="19" y="24" text-anchor="middle" fill="white" font-size="12" font-weight="bold" font-family="Arial,sans-serif">${text}</text></svg>`
  )}`;
}

// Fits the map to all known marker positions, or pans to the fallback center.
// Re-runs when the marker count changes or the fallback location resolves.
function MapAutoCenter({ positions, fallbackCenter, fallbackZoom }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    if (positions.length > 1) {
      if (!window.google?.maps?.LatLngBounds) return;
      const bounds = new window.google.maps.LatLngBounds();
      positions.forEach(p => bounds.extend(p));
      map.fitBounds(bounds, 48);
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

export default function Dispatch() {
  const [jobs,       setJobs]       = useState([]);
  const [techs,      setTechs]      = useState([]);
  const [selected,   setSelected]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [activeInfo, setActiveInfo] = useState(null);
  const [, forceUpdate]             = useState(0);
  const [geoCenter,  setGeoCenter]  = useState(null);
  const [hqAddress,  setHqAddress]  = useState(null);

  const geocacheRef = useRef({});
  const { geocode } = useGeocoder();

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    Promise.all([
      api.get(`/jobs?date=${today}`),
      api.get('/users'),
      api.get('/business-settings').catch(() => null),
    ]).then(([jobsRes, usersRes, settingsRes]) => {
      setJobs(jobsRes.data);
      setTechs(usersRes.data.filter(u => u.role === 'tech'));
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

  // Geocode job addresses that have no stored coords
  useEffect(() => {
    if (!jobs.length) return;
    const cache = geocacheRef.current;
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

  // Geocode business HQ address when it becomes available
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

  function jobPos(j) {
    if (j.checkin_lat && j.checkin_lng) return { lat: parseFloat(j.checkin_lat), lng: parseFloat(j.checkin_lng) };
    if (j.service_lat && j.service_lng) return { lat: parseFloat(j.service_lat), lng: parseFloat(j.service_lng) };
    return geocacheRef.current[j.service_address] || null;
  }

  // Returns live GPS position only — no fallback coords for offline techs
  function techPos(t) {
    const live = jobs.find(j => j.tech_id === t.id && j.status === 'in_progress' && j.checkin_lat);
    if (live) return { lat: parseFloat(live.checkin_lat), lng: parseFloat(live.checkin_lng) };
    return null;
  }

  // Deduplicated set of all known positions for this session
  const allPositions = [
    ...jobs.map(jobPos).filter(Boolean),
    ...techs.map(techPos).filter(Boolean),
  ].filter((p, i, arr) => arr.findIndex(q => q.lat === p.lat && q.lng === p.lng) === i);

  // Zero-marker fallback: browser geo → business HQ → continental US
  const fallback = (() => {
    if (geoCenter) return { center: geoCenter, zoom: 12 };
    const hqPos = hqAddress && geocacheRef.current[hqAddress];
    if (hqPos) return { center: hqPos, zoom: 12 };
    return { center: CONTINENTAL_US, zoom: 4 };
  })();

  return (
    <div className="dispatch-layout">

      {/* ── Sidebar ── */}
      <div className="dispatch-panel">
        <div className="dispatch-panel-hdr">
          <div className="dispatch-panel-title">Live Dispatch</div>
          <div className="dispatch-panel-sub">
            {loading ? 'Loading…' : `${techs.length} tech${techs.length !== 1 ? 's' : ''} · ${jobs.length} job${jobs.length !== 1 ? 's' : ''} today`}
          </div>
        </div>

        <div className="dispatch-section-lbl">Field Techs</div>
        {techs.length === 0 && !loading ? (
          <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--steel)' }}>No techs on team yet.</div>
        ) : techs.map((t, i) => {
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
                </div>
              </div>
              <span
                className="dispatch-tech-badge"
                style={activeJob
                  ? { background: 'var(--green-lt)', color: 'var(--green)' }
                  : { background: 'var(--offwhite)',  color: 'var(--slate)' }}
              >
                {activeJob ? 'active' : 'available'}
              </span>
            </div>
          );
        })}

        <div className="dispatch-section-lbl" style={{ marginTop: 8 }}>Job Queue</div>
        {jobs.length === 0 && !loading ? (
          <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--steel)' }}>No jobs scheduled for today.</div>
        ) : jobs.map((j, i) => {
          const pos       = jobPos(j);
          const notMapped = j.service_address && !pos;
          return (
            <div key={j.id || i} className="dispatch-job-row">
              <div className="dispatch-job-dot" style={{ background: JOB_COLORS[j.status] }} />
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
              <span className="dispatch-job-badge" style={STATUS_STYLES[j.status]}>
                {STATUS_LABELS[j.status]}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Map area ── */}
      <div className="dispatch-map-wrap">
        <GoogleMap className="dispatch-map" center={CONTINENTAL_US} zoom={4}>

          <MapAutoCenter
            positions={allPositions}
            fallbackCenter={fallback.center}
            fallbackZoom={fallback.zoom}
          />

          {/* Job markers */}
          {!loading && jobs.map(j => {
            const pos    = jobPos(j);
            if (!pos) return null;
            const isLive = !!(j.checkin_lat && j.checkin_lng);
            const color  = JOB_COLORS[j.status] || '#8A90A2';
            return (
              <Marker
                key={`job-${j.id}`}
                position={pos}
                title={`${j.client_name} — ${j.service_type}`}
                icon={dotIcon(color, isLive ? '#2E7D32' : 'white')}
                onClick={() => setActiveInfo({ pos, job: j })}
              />
            );
          })}

          {/* Tech markers — only shown when live GPS is available */}
          {!loading && techs.map((t, i) => {
            const pos      = techPos(t);
            if (!pos) return null;
            const jobCount = jobs.filter(j => j.tech_id === t.id).length;
            const color    = AVATAR_COLORS[i % AVATAR_COLORS.length];
            return (
              <Marker
                key={`tech-${t.id}`}
                position={pos}
                title={t.name}
                icon={avatarIcon(color, '#2E7D32', initials(t.name))}
                onClick={() => setActiveInfo({ pos, tech: t, hasGps: true, jobCount })}
              />
            );
          })}

          {/* InfoWindow for clicked marker */}
          {activeInfo && (
            <InfoWindow
              position={activeInfo.pos}
              onCloseClick={() => setActiveInfo(null)}
            >
              {activeInfo.job && (() => {
                const j = activeInfo.job;
                return (
                  <div style={{ fontFamily: 'sans-serif', fontSize: 12, minWidth: 160 }}>
                    <strong style={{ fontSize: 13 }}>{j.client_name} — {j.service_type}</strong><br />
                    <span style={{ color: '#5F667A' }}>Tech: {j.tech_name || 'Unassigned'} · {j.amount ? '$' + j.amount : 'No amount'}</span><br />
                    <span style={{ color: '#8A90A2', textTransform: 'capitalize' }}>Status: {j.status.replace('_', ' ')}</span>
                    {j.service_address && <><br /><span style={{ color: '#64748b', fontSize: 11 }}>{j.service_address}</span></>}
                  </div>
                );
              })()}
              {activeInfo.tech && (() => {
                const t = activeInfo.tech;
                return (
                  <div style={{ fontFamily: 'sans-serif', fontSize: 12 }}>
                    <strong style={{ fontSize: 13 }}>{t.name}</strong><br />
                    <span style={{ color: '#5F667A' }}>{activeInfo.jobCount} job{activeInfo.jobCount !== 1 ? 's' : ''} today</span><br />
                    <span style={{ color: '#2E7D32' }}>● Live GPS</span>
                  </div>
                );
              })()}
            </InfoWindow>
          )}

        </GoogleMap>

        {/* Legend */}
        <div className="dispatch-legend">
          {[
            { color: '#2E7D32',    label: 'Tech — live GPS'   },
            { color: '#1565C0',    label: 'Job — active'      },
            { color: '#2E7D32',    label: 'Job — complete'    },
            { color: 'var(--red)', label: 'Job — cancelled'   },
            { color: '#8A90A2',    label: 'Job — scheduled'   },
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
