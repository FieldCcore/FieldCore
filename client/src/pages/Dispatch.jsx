import React, { useEffect, useRef, useState } from 'react';
import { InfoWindow } from '@vis.gl/react-google-maps';
import api from '../api';
import { GoogleMap, Marker, useGeocoder } from '../maps';

const CENTER = { lat: 27.9506, lng: -82.4572 }; // Tampa, FL

// Fallback positions for techs with no live GPS
const TAMPA_SPREAD = [
  { lat: 27.9400, lng: -82.4600 },
  { lat: 27.9720, lng: -82.5140 },
  { lat: 27.9330, lng: -82.4820 },
  { lat: 27.9560, lng: -82.4750 },
  { lat: 27.9630, lng: -82.4420 },
  { lat: 27.9270, lng: -82.5010 },
];

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

export default function Dispatch() {
  const [jobs,       setJobs]       = useState([]);
  const [techs,      setTechs]      = useState([]);
  const [selected,   setSelected]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [activeInfo, setActiveInfo] = useState(null); // { pos, job? | tech? + hasGps + jobCount }
  const [, forceUpdate]             = useState(0);

  // Geocode cache: address → { lat, lng } | null (null = failed/in-flight, don't retry)
  const geocacheRef = useRef({});
  const { geocode, isReady: geocoderReady } = useGeocoder();

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    Promise.all([
      api.get(`/jobs?date=${today}`),
      api.get('/users'),
    ]).then(([jobsRes, usersRes]) => {
      setJobs(jobsRes.data);
      setTechs(usersRes.data.filter(u => u.role === 'tech'));
    }).finally(() => setLoading(false));
  }, []);

  // Geocode job addresses that have no stored coords
  useEffect(() => {
    if (!geocoderReady || !jobs.length) return;
    const cache = geocacheRef.current;
    const pending = jobs.filter(j =>
      !j.service_lat && !j.service_lng &&
      j.service_address &&
      !(j.service_address in cache)
    );
    if (!pending.length) return;

    pending.forEach(j => {
      cache[j.service_address] = null; // mark in-flight; prevents re-attempt
      geocode(j.service_address)
        .then(r => {
          cache[j.service_address] = { lat: r.lat, lng: r.lng };
          forceUpdate(n => n + 1);
        })
        .catch(() => {}); // null stays — no retry, no crash
    });
  }, [geocoderReady, jobs, geocode]);

  function jobPos(j) {
    if (j.checkin_lat && j.checkin_lng) return { lat: parseFloat(j.checkin_lat), lng: parseFloat(j.checkin_lng) };
    if (j.service_lat && j.service_lng) return { lat: parseFloat(j.service_lat), lng: parseFloat(j.service_lng) };
    return geocacheRef.current[j.service_address] || null;
  }

  function techPos(t, i) {
    const live = jobs.find(j => j.tech_id === t.id && j.status === 'in_progress' && j.checkin_lat);
    if (live) return { lat: parseFloat(live.checkin_lat), lng: parseFloat(live.checkin_lng) };
    return TAMPA_SPREAD[i % TAMPA_SPREAD.length];
  }

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
        ) : jobs.map((j, i) => (
          <div key={j.id || i} className="dispatch-job-row">
            <div className="dispatch-job-dot" style={{ background: JOB_COLORS[j.status] }} />
            <div className="dispatch-job-info">
              <div className="dispatch-job-name">{j.client_name} — {j.service_type}</div>
              <div className="dispatch-job-meta">{j.tech_name || 'Unassigned'} · {fmtTime(j.scheduled_at)}</div>
            </div>
            <span className="dispatch-job-badge" style={STATUS_STYLES[j.status]}>
              {STATUS_LABELS[j.status]}
            </span>
          </div>
        ))}
      </div>

      {/* ── Map area ── */}
      <div className="dispatch-map-wrap">
        <GoogleMap className="dispatch-map" center={CENTER}>

          {/* Job markers */}
          {!loading && jobs.map(j => {
            const pos   = jobPos(j);
            if (!pos) return null;
            const isLive = !!(j.checkin_lat && j.checkin_lng);
            const color  = JOB_COLORS[j.status] || '#8A90A2';
            return (
              <Marker
                key={`job-${j.id}`}
                position={pos}
                title={`${j.client_name} — ${j.service_type}`}
                onClick={() => setActiveInfo({ pos, job: j })}
              >
                <div style={{
                  width: 12, height: 12, borderRadius: '50%',
                  background: color,
                  border: `2px solid ${isLive ? '#2E7D32' : 'white'}`,
                  boxShadow: '0 1px 4px rgba(0,0,0,.3)',
                  cursor: 'pointer',
                }} />
              </Marker>
            );
          })}

          {/* Tech markers */}
          {!loading && techs.map((t, i) => {
            const pos      = techPos(t, i);
            const live     = jobs.find(j => j.tech_id === t.id && j.status === 'in_progress' && j.checkin_lat);
            const hasGps   = !!live;
            const jobCount = jobs.filter(j => j.tech_id === t.id).length;
            const color    = AVATAR_COLORS[i % AVATAR_COLORS.length];
            return (
              <Marker
                key={`tech-${t.id}`}
                position={pos}
                title={t.name}
                onClick={() => setActiveInfo({ pos, tech: t, hasGps, jobCount })}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: color,
                  border: `3px solid ${hasGps ? '#2E7D32' : 'white'}`,
                  boxShadow: '0 2px 8px rgba(0,0,0,.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: 'white',
                  fontFamily: "'Bricolage Grotesque', sans-serif",
                  cursor: 'pointer',
                }}>
                  {initials(t.name)}
                </div>
              </Marker>
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
                    {activeInfo.hasGps
                      ? <span style={{ color: '#2E7D32' }}>● Live GPS</span>
                      : <span style={{ color: '#8A90A2' }}>No GPS yet</span>}
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
            { color: '#8A90A2',    label: 'Tech — no GPS yet' },
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
