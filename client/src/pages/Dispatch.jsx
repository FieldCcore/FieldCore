import React, { useEffect, useRef, useState } from 'react';
import { Map } from '@vis.gl/react-google-maps';
import api from '../api';
import { useGeocoder } from '../maps';

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
  const [, forceUpdate]             = useState(0);

  // Geocode cache: address → { lat, lng } | null (null = failed/in-flight, don't retry)
  const geocacheRef = useRef({});
  const { geocode, isReady: geocoderReady } = useGeocoder();

  // DIAGNOSTIC: inspect the .dispatch-map-wrap container dimensions
  const mapWrapRef = useRef(null);
  useEffect(() => {
    const el = mapWrapRef.current;
    if (!el) { console.log('[Dispatch] mapWrapRef null'); return; }
    const cs = getComputedStyle(el);
    console.log('[Dispatch] .dispatch-map-wrap DOM', {
      offsetWidth:  el.offsetWidth,
      offsetHeight: el.offsetHeight,
      clientWidth:  el.clientWidth,
      clientHeight: el.clientHeight,
      computed: {
        width:    cs.width,
        height:   cs.height,
        position: cs.position,
        display:  cs.display,
        flex:     cs.flex,
        overflow: cs.overflow,
      },
    });
  });

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
      cache[j.service_address] = null;
      geocode(j.service_address)
        .then(r => {
          cache[j.service_address] = { lat: r.lat, lng: r.lng };
          forceUpdate(n => n + 1);
        })
        .catch(() => {});
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
      <div className="dispatch-map-wrap" ref={mapWrapRef}>

        {/* DIAGNOSTIC: bare Map with inline style only — no className, no GoogleMap wrapper */}
        <Map
          defaultCenter={CENTER}
          defaultZoom={10}
          style={{ width: '100%', height: '100%' }}
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          zoomControl={true}
          gestureHandling="greedy"
        />

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
