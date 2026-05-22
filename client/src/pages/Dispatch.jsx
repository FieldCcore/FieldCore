import React, { useEffect, useRef, useState } from 'react';
import api from '../api';

const CENTER = [27.9506, -82.4572]; // Tampa, FL

// Approximate coords for map markers (used until GPS check-in data is available)
const TAMPA_SPREAD = [
  [27.9400, -82.4600],
  [27.9720, -82.5140],
  [27.9330, -82.4820],
  [27.9560, -82.4750],
  [27.9630, -82.4420],
  [27.9270, -82.5010],
];

const AVATAR_COLORS = ['#2E7D32', '#1565C0', '#E65100', '#6A1B9A', '#AD1457'];

const JOB_COLORS = {
  scheduled:   '#8A90A2',
  in_progress: '#1565C0',
  complete:    '#2E7D32',
  cancelled:   '#C62828',
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
  const mapRef  = useRef(null);
  const mapInst = useRef(null);
  const [jobs,     setJobs]     = useState([]);
  const [techs,    setTechs]    = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading,  setLoading]  = useState(true);

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

  useEffect(() => {
    if (loading || mapInst.current || !mapRef.current) return;
    const L = window.L;
    if (!L) return;

    const map = L.map(mapRef.current, { center: CENTER, zoom: 13 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Job markers — use real checkin_lat/lng when available, else skip (no fake placement)
    const plottedJobs = new Set();
    jobs.forEach((j) => {
      if (!j.checkin_lat || !j.checkin_lng) return;
      const pos   = [parseFloat(j.checkin_lat), parseFloat(j.checkin_lng)];
      const color = JOB_COLORS[j.status] || '#8A90A2';
      const icon  = L.divIcon({
        className: '',
        html: `<div style="
          width:12px;height:12px;border-radius:50%;
          background:${color};border:2px solid white;
          box-shadow:0 1px 4px rgba(0,0,0,.3);
        "></div>`,
        iconSize: [12, 12], iconAnchor: [6, 6],
      });
      L.marker(pos, { icon })
        .addTo(map)
        .bindPopup(`
          <strong style="font-family:sans-serif;font-size:12px">${j.client_name} — ${j.service_type}</strong><br>
          <span style="font-size:11px;color:#5F667A">Tech: ${j.tech_name || 'Unassigned'} · ${j.amount ? '$' + j.amount : 'No amount'}</span><br>
          <span style="font-size:11px;color:#8A90A2;text-transform:capitalize">Status: ${j.status.replace('_', ' ')}</span>
        `);
      plottedJobs.add(j.id);
    });

    // Tech markers — use checkin coords from their active job, else use Tampa spread
    techs.forEach((t, i) => {
      const activeJob = jobs.find(j => j.tech_id === t.id && j.status === 'in_progress' && j.checkin_lat);
      const hasGps    = !!activeJob;
      const pos       = hasGps
        ? [parseFloat(activeJob.checkin_lat), parseFloat(activeJob.checkin_lng)]
        : TAMPA_SPREAD[i % TAMPA_SPREAD.length];
      const color     = AVATAR_COLORS[i % AVATAR_COLORS.length];

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:36px;height:36px;border-radius:50%;
          background:${color};border:3px solid ${hasGps ? '#2E7D32' : 'white'};
          box-shadow:0 2px 8px rgba(0,0,0,.35);
          display:flex;align-items:center;justify-content:center;
          font-size:11px;font-weight:800;color:white;
          font-family:'Bricolage Grotesque',sans-serif;
        ">${initials(t.name)}</div>`,
        iconSize: [36, 36], iconAnchor: [18, 18],
      });

      const jobCount = jobs.filter(j => j.tech_id === t.id).length;
      L.marker(pos, { icon })
        .addTo(map)
        .bindPopup(`
          <strong style="font-family:sans-serif;font-size:13px">${t.name}</strong><br>
          <span style="font-size:12px;color:#5F667A">${jobCount} job${jobCount !== 1 ? 's' : ''} today</span>
          ${hasGps ? '<br><span style="font-size:11px;color:#2E7D32">● Live GPS</span>' : '<br><span style="font-size:11px;color:#8A90A2">No GPS yet</span>'}
        `);
    });

    mapInst.current = map;
    return () => {
      if (mapInst.current) { mapInst.current.remove(); mapInst.current = null; }
    };
  }, [loading, jobs, techs]);

  return (
    <div className="dispatch-layout">
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
          const techJobs = jobs.filter(j => j.tech_id === t.id);
          const activeJob = techJobs.find(j => j.status === 'in_progress');
          const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
          return (
            <div
              key={i}
              className={`dispatch-tech-row${selected === t.id ? ' sel' : ''}`}
              onClick={() => setSelected(selected === t.id ? null : t.id)}
            >
              <div className="dispatch-tech-avatar" style={{ background: color }}>{initials(t.name)}</div>
              <div className="dispatch-tech-info">
                <div className="dispatch-tech-name">{t.name}</div>
                <div className="dispatch-tech-job">
                  {activeJob ? `${activeJob.service_type} · ${activeJob.client_name}` : techJobs.length > 0 ? `${techJobs.length} job${techJobs.length > 1 ? 's' : ''} today` : 'No jobs today'}
                </div>
              </div>
              <span
                className="dispatch-tech-badge"
                style={activeJob
                  ? { background: 'var(--green-lt)', color: 'var(--green)' }
                  : { background: 'var(--offwhite)', color: 'var(--slate)' }}
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
          <div key={i} className="dispatch-job-row">
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

      <div className="dispatch-map-wrap">
        <div ref={mapRef} className="dispatch-map" />
        <div className="dispatch-legend">
          {[
            { color: '#2E7D32', label: 'Tech — live GPS'  },
            { color: '#8A90A2', label: 'Tech — no GPS yet'},
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
  );
}
