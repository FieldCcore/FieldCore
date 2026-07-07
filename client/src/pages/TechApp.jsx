import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useNavigate } from 'react-router-dom';
import { MapPin, Camera, Check, Timer, Clock, ChevronLeft, LogOut, Lock, PenLine, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const C = {
  navy:  '#1C2333', navy2: '#242E43', navy3: '#2D3748',
  sand:  '#D6B58A',
  white: '#FFFFFF', sub: 'rgba(255,255,255,.55)', muted: 'rgba(255,255,255,.28)',
  border: 'rgba(255,255,255,.08)',
  green: '#2E7D32', greenLt: 'rgba(46,125,50,.18)',
  blue:  '#1565C0', blueLt: 'rgba(21,101,192,.18)',
  amber: '#D97706', amberLt: 'rgba(217,119,6,.15)',
  red:   '#C62828', redLt: 'rgba(198,40,40,.15)',
};

const STATUS_COLOR = { scheduled: C.blue, in_progress: C.amber, complete: C.green, cancelled: C.red };
const STATUS_BG    = { scheduled: C.blueLt, in_progress: C.amberLt, complete: C.greenLt, cancelled: C.redLt };

function fmtTime(iso) { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
function fmtDate(iso) { return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }); }
const cacheKey = (uid, v) => `fc_jobs_${v}_${uid}`;

const btn = (extra = {}) => ({
  width: '100%', padding: '14px', background: C.sand, color: C.navy,
  border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800,
  cursor: 'pointer', fontFamily: 'inherit', display: 'flex',
  alignItems: 'center', justifyContent: 'center', gap: 8,
  ...extra,
});
const btnGhost = (extra = {}) => ({
  ...btn({ background: C.navy2, color: C.white, border: `1px solid ${C.border}`, fontWeight: 600, ...extra }),
});

/* ── Topbar ───────────────────────────────────────────────────── */
function Topbar({ title, onBack, right }) {
  return (
    <div style={{ background: C.navy2, padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
      {onBack && (
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: C.sand, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700 }}>
          <ChevronLeft size={16} /> Back
        </button>
      )}
      <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: C.white }}>{title}</span>
      {right}
    </div>
  );
}

/* ── Status pill ──────────────────────────────────────────────── */
function StatusPill({ status }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: STATUS_BG[status] || C.blueLt, borderRadius: 99, padding: '3px 10px', flexShrink: 0 }}>
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: STATUS_COLOR[status] || C.blue }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: STATUS_COLOR[status] || C.blue, textTransform: 'capitalize' }}>
        {status.replace('_', ' ')}
      </span>
    </div>
  );
}

/* ── Job Queue ────────────────────────────────────────────────── */
function JobQueue({ user, onSelect, onLogout, onPwChange, avail, onAvailChange, availLoading, availErr, gpsStatus, gpsLastAt }) {
  const [jobs,         setJobs]         = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [hasMore,      setHasMore]      = useState(false);
  const [offset,       setOffset]       = useState(0);
  const [offline,      setOffline]      = useState(false);
  const [cachedAt,     setCachedAt]     = useState(null);
  const [view,         setView]         = useState('today');
  const mapDivRef  = useRef(null);
  const leafletRef = useRef(null);
  const markersRef = useRef([]);

  function load() {
    setLoading(true);
    setJobs([]);
    setOffset(0);
    setHasMore(false);
    api.get(`/mobile/jobs?tech_id=${user.id}&view=${view}&limit=25&offset=0`)
      .then(r => {
        const { jobs: fetched, has_more } = r.data;
        setJobs(fetched);
        setHasMore(has_more);
        setOffset(fetched.length);
        setOffline(false);
        setCachedAt(null);
        try { localStorage.setItem(cacheKey(user.id, view), JSON.stringify({ jobs: fetched, has_more, ts: Date.now() })); } catch {}
      })
      .catch(() => {
        try {
          const raw = localStorage.getItem(cacheKey(user.id, view));
          if (raw) {
            const { jobs: cached, ts } = JSON.parse(raw);
            setJobs(cached || []);
            setCachedAt(ts || null);
            setOffline(true);
            return;
          }
        } catch {}
        setJobs([]);
        setOffline(true);
      })
      .finally(() => setLoading(false));
  }

  async function loadMore() {
    if (loadingMore || !hasMore || offline) return;
    setLoadingMore(true);
    try {
      const r = await api.get(`/mobile/jobs?tech_id=${user.id}&view=${view}&limit=25&offset=${offset}`);
      const { jobs: more, has_more } = r.data;
      setJobs(prev => {
        const next = [...prev, ...more];
        try { localStorage.setItem(cacheKey(user.id, view), JSON.stringify({ jobs: next, has_more, ts: Date.now() })); } catch {}
        return next;
      });
      setHasMore(has_more);
      setOffset(o => o + more.length);
    } catch {}
    finally { setLoadingMore(false); }
  }

  useEffect(() => { load(); }, [user.id, view]); // eslint-disable-line react-hooks/exhaustive-deps

  // Init Leaflet map and update pins whenever jobs change
  useEffect(() => {
    if (!mapDivRef.current) return;

    if (!leafletRef.current) {
      const map = L.map(mapDivRef.current, {
        zoomControl: false,
        attributionControl: true,
        dragging: true,
        scrollWheelZoom: false,
        doubleClickZoom: false,
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" style="color:#D6B58A">OSM</a> &copy; <a href="https://carto.com/" style="color:#D6B58A">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);
      leafletRef.current = map;
    }

    const map = leafletRef.current;

    // Clear previous markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const pinIcon = L.divIcon({
      html: `<svg width="26" height="34" viewBox="0 0 26 34" fill="none">
        <path d="M13 0C5.82 0 0 5.82 0 13c0 9 11.38 19.84 12.31 20.72a1 1 0 001.38 0C14.62 32.84 26 22 26 13 26 5.82 20.18 0 13 0z" fill="#D6B58A"/>
        <circle cx="13" cy="13" r="4.5" fill="#1C2333"/>
      </svg>`,
      className: '',
      iconSize: [26, 34],
      iconAnchor: [13, 34],
      popupAnchor: [0, -30],
    });

    const pins = jobs.filter(j => j.service_lat && j.service_lng);

    pins.forEach(j => {
      const m = L.marker([parseFloat(j.service_lat), parseFloat(j.service_lng)], { icon: pinIcon })
        .bindPopup(`<strong style="color:#1C2333">${j.service_type}</strong><br>${j.client_name}`)
        .addTo(map);
      markersRef.current.push(m);
    });

    if (pins.length === 0) {
      map.setView([39.5, -98.35], 4); // continental US fallback
    } else if (pins.length === 1) {
      map.setView([parseFloat(pins[0].service_lat), parseFloat(pins[0].service_lng)], 14);
    } else {
      map.fitBounds(
        L.latLngBounds(pins.map(j => [parseFloat(j.service_lat), parseFloat(j.service_lng)])),
        { padding: [40, 40] }
      );
    }
  }, [jobs]);

  // Destroy map on unmount
  useEffect(() => {
    return () => {
      if (leafletRef.current) { leafletRef.current.remove(); leafletRef.current = null; }
    };
  }, []);

  const active = jobs.filter(j => j.status === 'in_progress').length;
  const nextJob = jobs.find(j => j.status === 'in_progress' || j.status === 'scheduled');
  const nextAddr = nextJob?.service_address
    ? [nextJob.service_address, nextJob.service_city, nextJob.service_state].filter(Boolean).join(', ')
    : nextJob?.client_address;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.navy }}>

      {/* ── Map header zone ─────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', height: 260, flexShrink: 0 }}>

        {/* Leaflet map fills the zone */}
        <div ref={mapDivRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />

        {/* Gradient fade → app navy (sits above map tiles, below interactive content) */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 130,
          background: `linear-gradient(to bottom, transparent, ${C.navy})`,
          pointerEvents: 'none', zIndex: 1,
        }} />

        {/* Header content floats on top */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 }}>
          {/* Greeting row */}
          <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: C.white }}>
              Hi, {user.name.split(' ')[0]}
            </span>
            <button
              onClick={onAvailChange}
              disabled={availLoading}
              style={{
                background: avail ? 'rgba(46,125,50,.25)' : 'rgba(255,255,255,.08)',
                border: `1px solid ${avail ? 'rgba(46,125,50,.45)' : C.border}`,
                borderRadius: 99, padding: '6px 11px',
                display: 'flex', alignItems: 'center', gap: 5,
                cursor: availLoading ? 'default' : 'pointer',
                opacity: availLoading ? 0.6 : 1,
                fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                color: avail ? C.green : C.muted,
                minHeight: 32,
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: avail ? C.green : C.muted, flexShrink: 0 }} />
              {availLoading ? '…' : avail ? 'Available' : 'Off Duty'}
            </button>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={onPwChange} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 4, display: 'flex' }} title="Change password">
                <Lock size={15} />
              </button>
              <button onClick={onLogout} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 4, display: 'flex' }} title="Sign out">
                <LogOut size={16} />
              </button>
            </div>
          </div>

          {/* Stats + directions chips */}
          <div style={{ padding: '0 12px 4px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {availErr && (
              <div style={{ width: '100%', fontSize: 11, color: '#fc8181', fontWeight: 600, paddingBottom: 4 }}>
                {availErr}
              </div>
            )}
            {avail && gpsStatus && (
              <div style={{
                background: gpsStatus === 'active' ? C.greenLt : gpsStatus === 'blocked' ? C.amberLt : 'rgba(255,255,255,.06)',
                borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700,
                color: gpsStatus === 'active' ? C.green : gpsStatus === 'blocked' ? C.amber : C.muted,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {gpsStatus === 'active' ? '●' : gpsStatus === 'blocked' ? '⚠' : '○'}
                {gpsStatus === 'active'
                  ? `GPS${gpsLastAt ? ` · ${Math.round((Date.now() - gpsLastAt) / 1000)}s` : ''}`
                  : gpsStatus === 'blocked' ? 'GPS Blocked' : 'No GPS'}
              </div>
            )}
            {active > 0 && (
              <div style={{ background: C.amberLt, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: C.amber }}>
                {active} active
              </div>
            )}
            <div style={{ background: 'rgba(45,55,72,.75)', backdropFilter: 'blur(6px)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: C.sub }}>
              {loading ? '…' : `${jobs.length}${hasMore ? '+' : ''} job${(jobs.length !== 1 || hasMore) ? 's' : ''} ${view === 'week' ? 'this week' : view}`}
            </div>
            {nextAddr && (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(nextAddr)}`}
                target="_blank" rel="noreferrer"
                style={{ background: 'rgba(45,55,72,.75)', backdropFilter: 'blur(6px)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: C.sand, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <MapPin size={11} /> Directions
              </a>
            )}
            <button onClick={load} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 12 }}>
              ↻ Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── View selector ───────────────────────────────────────────────────── */}
      <div style={{ padding: '0 12px 10px', display: 'flex', gap: 6, flexShrink: 0 }}>
        {[['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'This Week']].map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              flex: 1, padding: '9px 4px', borderRadius: 10,
              background: view === v ? C.sand : C.navy2,
              color: view === v ? C.navy : C.sub,
              border: `1px solid ${view === v ? 'transparent' : C.border}`,
              fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Offline banner ──────────────────────────────────────────────────── */}
      {offline && (
        <div style={{ margin: '0 12px 10px', background: C.amberLt, border: `1px solid ${C.amber}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: C.amber }}>
            Offline{cachedAt ? ` — cached ${formatDistanceToNow(new Date(cachedAt), { addSuffix: true })}` : ' — no connection'}
          </span>
          <button onClick={load} style={{ background: 'none', border: `1px solid ${C.amber}`, borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700, color: C.amber, cursor: 'pointer', fontFamily: 'inherit' }}>
            Retry
          </button>
        </div>
      )}

      {/* ── Job list ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: C.muted, fontSize: 13 }}>Loading jobs…</div>
        ) : jobs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: C.muted }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.sub }}>
              {view === 'today' ? 'No jobs today' : view === 'tomorrow' ? 'No jobs tomorrow' : 'No jobs this week'}
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Check back or contact your dispatcher</div>
          </div>
        ) : (() => {
          const items = [];
          if (view === 'week') {
            const groups = {};
            const dayKeys = [];
            jobs.forEach(j => {
              const d = j.scheduled_at ? new Date(j.scheduled_at).toDateString() : '__none__';
              if (!groups[d]) { groups[d] = []; dayKeys.push(d); }
              groups[d].push(j);
            });
            dayKeys.forEach(d => {
              items.push({ type: 'header', key: 'h:' + d, label: d === '__none__' ? 'Unscheduled' : new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) });
              groups[d].forEach(j => items.push({ type: 'job', key: j.id, job: j }));
            });
          } else {
            jobs.forEach(j => items.push({ type: 'job', key: j.id, job: j }));
          }
          return items.map(item => {
            if (item.type === 'header') return (
              <div key={item.key} style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, padding: '6px 2px 2px' }}>
                {item.label}
              </div>
            );
            const job = item.job;
            const addr = job.service_address
              ? [job.service_address, job.service_city, job.service_state].filter(Boolean).join(', ')
              : job.client_address;
            return (
              <div
                key={item.key}
                onClick={() => onSelect(job)}
                style={{ background: C.navy2, borderRadius: 14, padding: 14, border: `1px solid ${C.border}`, cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.white, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.service_type}</div>
                    <div style={{ fontSize: 13, color: C.sub }}>{job.client_name}</div>
                  </div>
                  <StatusPill status={job.status} />
                </div>
                {addr && (
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MapPin size={10} />{addr}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                  <div style={{ fontSize: 12, color: C.sand }}>{job.scheduled_at ? fmtTime(job.scheduled_at) : 'No time set'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {addr && (
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(addr)}`}
                        target="_blank" rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize: 11, color: C.sand, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}
                      >
                        <MapPin size={10} /> Directions
                      </a>
                    )}
                    {job.amount && <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>${parseFloat(job.amount).toFixed(0)}</div>}
                  </div>
                </div>
              </div>
            );
          });
        })()}
        {hasMore && !offline && (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            style={btnGhost({ opacity: loadingMore ? 0.65 : 1, marginTop: 4 })}
          >
            {loadingMore ? 'Loading…' : 'Load More'}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Photos sub-screen ────────────────────────────────────────── */
function PhotosScreen({ job, onBack }) {
  const [photos,    setPhotos]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    api.get(`/mobile/jobs/${job.id}/photos`)
      .then(r => setPhotos(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [job.id]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      const res = await api.post(`/mobile/jobs/${job.id}/photos`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPhotos(prev => [...prev, res.data]);
    } catch (err) {
      alert(err.response?.data?.error || 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.navy }}>
      <Topbar title="Job Photos" onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: C.muted, fontSize: 13 }}>Loading…</div>
        ) : photos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: C.muted }}>
            <Camera size={36} color={C.muted} style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 14, color: C.sub }}>No photos yet</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 16 }}>
            {photos.map(p => (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                <img
                  src={p.url}
                  alt="Job photo"
                  style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border}` }}
                />
              </a>
            ))}
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
        <input ref={undefined} id="gallery-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button style={btn()} onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Camera size={16} />{uploading ? 'Uploading…' : 'Take Photo'}
          </button>
          <button style={btnGhost()} onClick={() => document.getElementById('gallery-input')?.click()} disabled={uploading}>
            <Camera size={16} /> Choose from Library
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── ETA sub-screen ───────────────────────────────────────────── */
function EtaScreen({ job, onBack }) {
  const [minutes,  setMinutes]  = useState('20');
  const [sending,  setSending]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [error,    setError]    = useState(null);

  async function handleSend() {
    setError(null);
    const mins = parseInt(minutes, 10);
    if (isNaN(mins) || mins < 1 || mins > 240) {
      setError('Enter a number between 1 and 240 minutes.');
      return;
    }
    setSending(true);
    try {
      await api.post(`/mobile/jobs/${job.id}/eta`, { minutes: mins });
      setSent(true);
      setTimeout(onBack, 1500);
    } catch (err) {
      const status = err.response?.status;
      if (status === 409) {
        setError('This client has opted out of SMS messages.');
      } else if (status === 429) {
        setError(err.response?.data?.error || 'ETA already sent recently. Please wait before sending again.');
      } else {
        setError(err.response?.data?.error || 'Failed to send ETA. Please try again.');
      }
    } finally {
      setSending(false);
    }
  }

  if (sent) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.navy, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <div style={{ fontSize: 48 }}>✅</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.white }}>ETA sent!</div>
      <div style={{ fontSize: 13, color: C.sub }}>{job.client_name} has been notified</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.navy }}>
      <Topbar title="Send ETA" onBack={onBack} />
      <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 13, color: C.sub, marginBottom: 24 }}>
          Sending ETA SMS to <strong style={{ color: C.white }}>{job.client_name}</strong>
          {job.client_phone ? ` (${job.client_phone})` : ''}
        </div>

        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: C.muted, marginBottom: 8 }}>Minutes away</div>
        <input
          type="number"
          min="1"
          max="240"
          style={{ width: '100%', padding: '18px', background: C.navy3, border: `1px solid ${error ? C.red : C.border}`, borderRadius: 12, fontSize: 36, fontWeight: 800, textAlign: 'center', color: C.white, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 10 }}
          value={minutes}
          onChange={e => { setMinutes(e.target.value); setError(null); }}
        />
        <div style={{ fontSize: 12, color: C.muted, textAlign: 'center', marginBottom: 16 }}>
          "{job.client_name}, your tech is ~{minutes} min away"
        </div>

        {error && (
          <div style={{ background: C.redLt, border: `1px solid ${C.red}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#fc8181', marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['10', '20', '30', '45'].map(m => (
            <button
              key={m}
              onClick={() => { setMinutes(m); setError(null); }}
              style={{ flex: 1, padding: '10px 0', background: minutes === m ? C.sand : C.navy3, color: minutes === m ? C.navy : C.white, border: `1px solid ${minutes === m ? C.sand : C.border}`, borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {m}m
            </button>
          ))}
        </div>

        <button style={btn({ opacity: sending ? 0.65 : 1 })} onClick={handleSend} disabled={sending || !minutes}>
          {sending ? 'Sending…' : 'Send SMS to Client'}
        </button>
      </div>
    </div>
  );
}

/* ── Signature sub-screen ─────────────────────────────────────── */
function SignatureScreen({ job, onBack, onSigned }) {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const dimRef    = useRef({ w: 0, h: 0 });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState(null);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = Math.round(rect.width  * dpr);
    canvas.height = Math.round(rect.height * dpr);
    dimRef.current = { w: rect.width, h: rect.height };
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
  }, []);

  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const src  = e.touches?.[0] ?? e.changedTouches?.[0] ?? e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  function startDraw(e) {
    e.preventDefault();
    isDrawing.current = true;
    setIsEmpty(false);
    setError(null);
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e) {
    e.preventDefault();
    if (!isDrawing.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function endDraw(e) {
    e?.preventDefault?.();
    isDrawing.current = false;
  }

  function handleClear() {
    const ctx = canvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, dimRef.current.w, dimRef.current.h);
    setIsEmpty(true);
    setError(null);
  }

  async function handleSave() {
    if (isEmpty) return;
    setSaving(true);
    setError(null);
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      await api.post(`/mobile/jobs/${job.id}/signature`, { svg: dataUrl });
      onSigned();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.navy }}>
      <Topbar title="Client Signature" onBack={onBack} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 16px calc(16px + env(safe-area-inset-bottom))', gap: 14 }}>

        <p style={{ margin: 0, fontSize: 13, color: C.sub, textAlign: 'center' }}>
          <strong style={{ color: C.white }}>{job.client_name}</strong> — sign below to confirm service completion
        </p>

        {/* Signature canvas area */}
        <div style={{
          flex: 1,
          position: 'relative',
          background: C.navy3,
          borderRadius: 16,
          border: `2px dashed ${isEmpty ? C.border : C.sand}`,
          overflow: 'hidden',
          minHeight: 220,
        }}>
          {isEmpty && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, pointerEvents: 'none' }}>
              <PenLine size={28} color={C.muted} />
              <span style={{ fontSize: 13, color: C.muted }}>Sign here</span>
            </div>
          )}
          <canvas
            ref={canvasRef}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair', display: 'block' }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
        </div>

        {/* Signature line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 4px' }}>
          <span style={{ fontSize: 20, color: C.muted, lineHeight: 1 }}>✕</span>
          <div style={{ flex: 1, height: 1, background: C.border }} />
          <span style={{ fontSize: 11, color: C.muted }}>Client signature</span>
        </div>

        {error && (
          <div style={{ background: C.redLt, border: `1px solid rgba(198,40,40,.3)`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#fc8181' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button style={btnGhost({ flex: 1, opacity: isEmpty ? 0.4 : 1 })} onClick={handleClear} disabled={isEmpty}>
            Clear
          </button>
          <button style={btn({ flex: 2, opacity: (isEmpty || saving) ? 0.65 : 1 })} onClick={handleSave} disabled={isEmpty || saving}>
            <Check size={15} strokeWidth={2.5} />
            {saving ? 'Saving…' : 'Save Signature'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Tip sub-screen ───────────────────────────────────────────── */
const TIP_PRESETS = [5, 10, 20];

function TipScreen({ job, onBack, onComplete }) {
  const [selected, setSelected] = useState(null);   // number | 'custom' | null
  const [custom,   setCustom]   = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);

  const customAmt   = parseFloat(custom);
  const customValid = selected === 'custom' && custom !== '' && !isNaN(customAmt) && customAmt >= 0;
  const customBad   = selected === 'custom' && custom !== '' && (isNaN(customAmt) || customAmt < 0);
  const canConfirm  = (selected !== null && selected !== 'custom') || customValid;
  const displayAmt  = selected === 'custom' ? (isNaN(customAmt) ? 0 : customAmt) : (selected || 0);

  async function submit(amount) {
    setSaving(true);
    setError(null);
    try {
      if (amount > 0) {
        await api.patch(`/mobile/jobs/${job.id}/tip`, { amount }).catch(e =>
          console.warn('[Tip] save failed, continuing:', e.message)
        );
      }
      const r = await api.post(`/mobile/jobs/${job.id}/complete`);
      onComplete(r.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not complete job. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.navy }}>
      <Topbar title="Add a Tip" onBack={onBack} />

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px 12px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: C.sub }}>
            Would <strong style={{ color: C.white }}>{job.client_name}</strong> like to add a tip?
          </div>
          {job.amount && (
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
              Service total: ${parseFloat(job.amount).toFixed(2)}
            </div>
          )}
        </div>

        {/* Quick-select presets */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {TIP_PRESETS.map(amt => {
            const active = selected === amt;
            return (
              <button
                key={amt}
                onClick={() => setSelected(active ? null : amt)}
                style={active
                  ? btn({ padding: '20px 8px', fontSize: 22, fontWeight: 800, borderRadius: 14 })
                  : btnGhost({ padding: '20px 8px', fontSize: 22, fontWeight: 800, borderRadius: 14 })
                }
              >
                ${amt}
              </button>
            );
          })}
        </div>

        {/* Custom amount */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => { setSelected(selected === 'custom' ? null : 'custom'); setCustom(''); }}
            style={selected === 'custom'
              ? btn({ background: C.navy3, color: C.sand, border: `1px solid ${C.sand}`, fontWeight: 700 })
              : btnGhost({ fontWeight: 600 })
            }
          >
            Custom Amount
          </button>

          {selected === 'custom' && (
            <div>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 24, fontWeight: 700, color: C.white, pointerEvents: 'none' }}>$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={custom}
                  onChange={e => setCustom(e.target.value)}
                  autoFocus
                  inputMode="decimal"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '18px 16px 18px 38px',
                    background: C.navy3,
                    border: `1.5px solid ${customBad ? '#fc8181' : C.sand}`,
                    borderRadius: 12,
                    fontSize: 30, fontWeight: 800, color: C.white,
                    outline: 'none', fontFamily: 'inherit',
                  }}
                />
              </div>
              {customBad && (
                <div style={{ fontSize: 12, color: '#fc8181', marginTop: 6, paddingLeft: 2 }}>
                  Enter a valid amount ($0 or more)
                </div>
              )}
            </div>
          )}
        </div>

        {/* Selected amount preview */}
        {canConfirm && selected !== 'custom' && (
          <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: C.sub }}>Tip selected</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: C.sand }}>${Number(selected).toFixed(2)}</span>
          </div>
        )}

        {error && (
          <div style={{ background: C.redLt, border: `1px solid rgba(198,40,40,.3)`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#fc8181' }}>
            {error}
          </div>
        )}
      </div>

      {/* Fixed bottom action zone */}
      <div style={{ padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 8, background: C.navy, flexShrink: 0 }}>
        {canConfirm && (
          <button
            style={btn({ background: C.green, opacity: saving ? 0.65 : 1 })}
            onClick={() => submit(displayAmt)}
            disabled={saving}
          >
            <Check size={16} strokeWidth={2.5} />
            {saving ? 'Completing…' : `Tip $${displayAmt.toFixed(2)} · Complete Job`}
          </button>
        )}
        <button
          style={btnGhost({ color: C.sub, opacity: saving ? 0.65 : 1 })}
          onClick={() => submit(0)}
          disabled={saving}
        >
          No Tip — Complete Job
        </button>
      </div>
    </div>
  );
}

/* ── Job Detail ───────────────────────────────────────────────── */
function JobDetail({ job: initJob, onBack, onUpdate }) {
  const [job,         setJob]         = useState(initJob);
  const [subscreen,   setSubscreen]   = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [msg,         setMsg]         = useState(null);
  const [clockActive, setClockActive] = useState(!!initJob.no_show_clock_started_at);
  const [clockTime,   setClockTime]   = useState(initJob.no_show_clock_started_at);
  const [localSigned,  setLocalSigned]  = useState(false);
  const [graceMinutes, setGraceMinutes] = useState(15);
  const [nowMs,        setNowMs]        = useState(() => Date.now());
  const [declaring,    setDeclaring]    = useState(false);

  function update(updated) {
    setJob(updated);
    onUpdate(updated);
  }

  async function handleCheckin() {
    setLoading(true);
    setMsg(null);
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation
          ? navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 })
          : rej(new Error('no geo'))
      ).catch(() => ({ coords: { latitude: 0, longitude: 0 } }));
      const r = await api.post(`/mobile/jobs/${job.id}/checkin`, {
        lat: pos.coords.latitude, lng: pos.coords.longitude,
      });
      update(r.data);
      setMsg({ type: 'ok', text: 'Checked in — GPS recorded' });
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.error || 'Check-in failed.' });
    } finally {
      setLoading(false);
    }
  }

  async function handleComplete() {
    if (!window.confirm('Mark this job as complete?')) return;
    setLoading(true);
    setMsg(null);
    try {
      const r = await api.post(`/mobile/jobs/${job.id}/complete`);
      update(r.data);
      setMsg({ type: 'ok', text: 'Job complete — invoice generated' });
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.error || 'Could not mark complete.' });
    } finally {
      setLoading(false);
    }
  }

  async function handleNoshowClock() {
    setLoading(true);
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation
          ? navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 })
          : rej(new Error('no geo'))
      ).catch(() => null);
      const payload = pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : {};
      const r = await api.post(`/no-show/jobs/${job.id}/start`, payload);
      setClockActive(true);
      setClockTime(r.data.clock_started_at);
      setMsg({ type: 'warn', text: 'No-show clock started' });
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.error || 'Could not start clock.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!clockActive) return;
    api.get('/no-show/settings').then(r => {
      setGraceMinutes(r.data.grace_period_minutes ?? 15);
    }).catch(() => {});
  }, [clockActive]);

  useEffect(() => {
    if (!clockActive) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [clockActive]);

  async function handleDeclareNoShow() {
    setDeclaring(true);
    try {
      await api.post(`/no-show/jobs/${job.id}/declare`);
      update({ ...job, status: 'no_show' });
      setClockActive(false);
      setMsg({ type: 'err', text: 'No-show declared — deposit retained per policy' });
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.error || 'Could not declare no-show.' });
    } finally {
      setDeclaring(false);
    }
  }

  if (subscreen === 'photos')    return <PhotosScreen    job={job} onBack={() => setSubscreen(null)} />;
  if (subscreen === 'eta')       return <EtaScreen       job={job} onBack={() => setSubscreen(null)} />;
  if (subscreen === 'signature') return (
    <SignatureScreen
      job={job}
      onBack={() => setSubscreen(null)}
      onSigned={() => {
        setLocalSigned(true);
        setSubscreen(null);
        setMsg({ type: 'ok', text: 'Signature captured' });
      }}
    />
  );
  if (subscreen === 'tip') return (
    <TipScreen
      job={job}
      onBack={() => setSubscreen(null)}
      onComplete={updatedJob => {
        update(updatedJob);
        setSubscreen(null);
        setMsg({ type: 'ok', text: 'Job complete — invoice generated' });
      }}
    />
  );

  const hasSigned    = !!job.signature_at || localSigned;
  const isScheduled  = job.status === 'scheduled';
  const isInProgress = job.status === 'in_progress';
  const isComplete   = job.status === 'complete';
  const isNoShow     = job.status === 'no_show';

  const elapsedMs    = clockActive && clockTime ? nowMs - new Date(clockTime).getTime() : 0;
  const graceMs      = graceMinutes * 60 * 1000;
  const remainingMs  = Math.max(0, graceMs - elapsedMs);
  const graceExpired = clockActive && elapsedMs >= graceMs;
  const remMin       = Math.floor(remainingMs / 60000);
  const remSec       = Math.floor((remainingMs % 60000) / 1000);
  const countdownStr = `${remMin}:${String(remSec).padStart(2, '0')}`;
  const addr = job.service_address
    ? [job.service_address, job.service_city, job.service_state].filter(Boolean).join(', ')
    : job.client_address;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.navy }}>
      <Topbar title="Job Detail" onBack={onBack} />

      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Header card */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: 16, border: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.white, marginBottom: 2 }}>{job.service_type}</div>
              {job.amount && <div style={{ fontSize: 22, fontWeight: 700, color: C.sand }}>${parseFloat(job.amount).toFixed(0)}</div>}
            </div>
            <StatusPill status={job.status} />
          </div>
          {job.scheduled_at && (
            <div style={{ fontSize: 12, color: C.sub }}>{fmtDate(job.scheduled_at)} · {fmtTime(job.scheduled_at)}</div>
          )}
        </div>

        {/* Info rows */}
        <div style={{ background: C.navy2, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          {[
            { l: 'Client',  v: job.client_name },
            addr                && { l: 'Location', v: addr, link: addr ? `https://maps.google.com/?q=${encodeURIComponent(addr)}` : null },
            job.client_phone    && { l: 'Phone',    v: job.client_phone, link: `tel:${job.client_phone}` },
            job.notes           && { l: 'Notes',    v: job.notes },
            job.checkin_at      && { l: 'Check-in', v: `GPS recorded at ${new Date(job.checkin_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` },
          ].filter(Boolean).map((r, i, arr) => (
            <div key={i} style={{ display: 'flex', padding: '12px 14px', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, width: 60, flexShrink: 0 }}>{r.l}</div>
              {r.link
                ? <a href={r.link} target={r.link.startsWith('tel') ? '_self' : '_blank'} rel="noreferrer" style={{ fontSize: 13, color: C.sand, flex: 1, textDecoration: 'none' }}>{r.v}</a>
                : <div style={{ fontSize: 13, color: C.white, flex: 1 }}>{r.v}</div>
              }
            </div>
          ))}
        </div>

        {/* Status messages */}
        {msg?.type === 'ok'   && <div style={{ background: C.greenLt, border: `1px solid rgba(46,125,50,.3)`, borderRadius: 10, padding: '12px 14px', fontSize: 13, color: C.green, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}><Check size={14} />{msg.text}</div>}
        {msg?.type === 'warn' && <div style={{ background: C.amberLt, border: `1px solid rgba(217,119,6,.3)`,  borderRadius: 10, padding: '12px 14px', fontSize: 13, color: C.amber, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}><Timer size={14} />{msg.text}</div>}
        {msg?.type === 'err'  && <div style={{ background: C.redLt,   border: `1px solid rgba(181,42,42,.3)`,  borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#fc8181' }}>{msg.text}</div>}

        {/* No-show clock status */}
        {clockActive && !graceExpired && (
          <div style={{ background: C.amberLt, border: `1px solid rgba(217,119,6,.35)`, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Timer size={14} color={C.amber} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.amber }}>No-show clock running</div>
              <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>Declare available in {countdownStr}</div>
            </div>
          </div>
        )}
        {clockActive && graceExpired && (
          <button
            style={btn({ background: C.red, opacity: declaring ? 0.65 : 1 })}
            onClick={handleDeclareNoShow}
            disabled={declaring}
          >
            <AlertTriangle size={16} /> {declaring ? 'Declaring…' : 'Declare No-Show'}
          </button>
        )}

        {/* Actions */}
        {!isComplete && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(isScheduled || isInProgress) && (
              <button style={btn({ background: C.blue, color: C.white })} onClick={() => setSubscreen('eta')}>
                <Clock size={16} /> Send ETA to Client
              </button>
            )}
            {(isScheduled || isInProgress) && (
              <button style={btnGhost({ opacity: loading ? 0.65 : 1 })} onClick={handleCheckin} disabled={loading}>
                <MapPin size={16} /> {job.checkin_at ? 'Update GPS Location' : 'GPS Check-In'}
              </button>
            )}
            <button style={btnGhost()} onClick={() => setSubscreen('photos')}>
              <Camera size={16} /> Job Photos
            </button>
            {isScheduled && !clockActive && !isNoShow && (
              <button style={btnGhost({ color: C.amber, borderColor: 'rgba(217,119,6,.3)', opacity: loading ? 0.65 : 1 })} onClick={handleNoshowClock} disabled={loading}>
                <Timer size={16} /> Start No-Show Clock
              </button>
            )}

            {/* Signature — required before completion */}
            {(isScheduled || isInProgress) && (
              hasSigned ? (
                <div style={{ background: C.greenLt, border: `1px solid rgba(46,125,50,.3)`, borderRadius: 12, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Check size={14} color={C.green} strokeWidth={2.5} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.green, flex: 1 }}>Signature captured</span>
                  <button
                    style={{ background: 'none', border: 'none', color: C.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                    onClick={() => setSubscreen('signature')}
                  >
                    Re-sign
                  </button>
                </div>
              ) : (
                <button style={btnGhost()} onClick={() => setSubscreen('signature')}>
                  <PenLine size={16} /> Get Client Signature
                </button>
              )
            )}

            {(isScheduled || isInProgress) && (
              hasSigned ? (
                <button style={btn({ background: C.green })} onClick={() => setSubscreen('tip')}>
                  <Check size={16} strokeWidth={2.5} /> Mark Job Complete
                </button>
              ) : (
                <button style={btn({ background: C.navy3, color: C.muted, cursor: 'not-allowed' })} disabled>
                  <Lock size={15} /> Signature required
                </button>
              )
            )}
          </div>
        )}

        {isComplete && (
          <div style={{ background: C.greenLt, border: `1px solid rgba(46,125,50,.3)`, borderRadius: 14, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.green, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Check size={18} strokeWidth={2.5} /> Job Complete
            </div>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 16 }}>Invoice auto-generated for the operator</div>
            <button style={btnGhost({ width: 'auto', padding: '10px 20px' })} onClick={() => setSubscreen('photos')}>
              <Camera size={14} /> View / Add Photos
            </button>
          </div>
        )}

        {isNoShow && (
          <div style={{ background: C.redLt, border: `1px solid rgba(198,40,40,.3)`, borderRadius: 14, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.red, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <AlertTriangle size={18} /> No-Show Declared
            </div>
            <div style={{ fontSize: 12, color: C.sub }}>Deposit retained per policy. Operator has been notified.</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main TechApp ─────────────────────────────────────────────── */
export default function TechApp() {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const [selectedJob,  setSelectedJob]  = useState(null);
  const [pwModal,      setPwModal]      = useState(false);
  const [pwForm,       setPwForm]       = useState({ current: '', next: '', confirm: '' });
  const [pwSaving,     setPwSaving]     = useState(false);
  const [pwMsg,        setPwMsg]        = useState(null);

  // Availability + GPS — lifted here so GPS loop can react to availability changes
  const [avail,        setAvail]        = useState(user.is_available !== false);
  const [availLoading, setAvailLoading] = useState(false);
  const [availErr,     setAvailErr]     = useState(null);
  const [gpsStatus,    setGpsStatus]    = useState(null); // 'active' | 'blocked' | 'unavailable' | null
  const [gpsLastAt,    setGpsLastAt]    = useState(null);
  const gpsTimerRef = useRef(null);

  async function handleAvail() {
    if (availLoading) return;
    setAvailLoading(true);
    setAvailErr(null);
    try {
      const r = await api.patch('/users/me/availability', { available: !avail });
      setAvail(r.data.available);
    } catch (err) {
      setAvailErr(err.response?.data?.error || 'Could not update availability.');
    } finally {
      setAvailLoading(false);
    }
  }

  useEffect(() => {
    if (!avail) {
      if (gpsTimerRef.current) { clearInterval(gpsTimerRef.current); gpsTimerRef.current = null; }
      setGpsStatus(null);
      setGpsLastAt(null);
      return;
    }

    async function sendGps() {
      if (!navigator.geolocation) { setGpsStatus('unavailable'); return; }
      try {
        const pos = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 30000 })
        );
        await api.post('/mobile/location', {
          lat:      pos.coords.latitude,
          lng:      pos.coords.longitude,
          accuracy: pos.coords.accuracy  ?? null,
          heading:  pos.coords.heading   ?? null,
          speed:    pos.coords.speed     ?? null,
        });
        setGpsStatus('active');
        setGpsLastAt(Date.now());
      } catch (err) {
        if (err.code === 1) setGpsStatus('blocked'); // PERMISSION_DENIED
        // network errors or position timeout — keep last status, retry next interval
      }
    }

    sendGps();
    gpsTimerRef.current = setInterval(sendGps, 20 * 1000);
    return () => { clearInterval(gpsTimerRef.current); gpsTimerRef.current = null; };
  }, [avail]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function handleUpdate(updated) {
    if (selectedJob?.id === updated.id) setSelectedJob(prev => ({ ...prev, ...updated }));
  }

  async function handlePwSubmit(e) {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) return setPwMsg({ ok: false, text: 'Passwords do not match.' });
    setPwSaving(true);
    setPwMsg(null);
    try {
      await api.patch('/auth/me/password', { current_password: pwForm.current, new_password: pwForm.next });
      setPwForm({ current: '', next: '', confirm: '' });
      setPwMsg({ ok: true, text: 'Password updated.' });
    } catch (err) {
      setPwMsg({ ok: false, text: err.response?.data?.error || 'Failed to update password.' });
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: C.navy,
      fontFamily: "'Bricolage Grotesque', 'Inter', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column',
      overflowY: 'hidden',
    }}>
      {/* Safe-area spacer for iOS notch */}
      <div style={{ height: 'env(safe-area-inset-top)', background: C.navy2, flexShrink: 0 }} />

      {/* Password change modal */}
      {pwModal && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 50, display: 'flex', alignItems: 'flex-end', padding: 'env(safe-area-inset-top) 0 0' }}
          onClick={() => { setPwModal(false); setPwMsg(null); }}>
          <div style={{ background: C.navy2, width: '100%', borderRadius: '20px 20px 0 0', padding: '20px 20px calc(20px + env(safe-area-inset-bottom))', fontFamily: 'inherit' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
              <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: C.white }}>Change Password</span>
              <button onClick={() => { setPwModal(false); setPwMsg(null); }} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}>×</button>
            </div>
            <form onSubmit={handlePwSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(['current', 'next', 'confirm']).map((f, i) => (
                <input key={f} type="password" required
                  placeholder={['Current password', 'New password (min 8 chars)', 'Confirm new password'][i]}
                  value={pwForm[f]}
                  onChange={e => setPwForm(s => ({ ...s, [f]: e.target.value }))}
                  style={{ padding: '12px 14px', background: C.navy3, border: `1px solid ${C.border}`, borderRadius: 10, color: C.white, fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
                />
              ))}
              {pwMsg && (
                <div style={{ fontSize: 13, fontWeight: 600, color: pwMsg.ok ? C.green : '#fc8181' }}>
                  {pwMsg.ok ? '✓ ' : ''}{pwMsg.text}
                </div>
              )}
              <button type="submit" disabled={pwSaving}
                style={btn({ marginTop: 4, opacity: pwSaving ? 0.65 : 1 })}>
                {pwSaving ? 'Saving…' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {!selectedJob ? (
          <JobQueue
            user={user}
            onSelect={setSelectedJob}
            onLogout={handleLogout}
            onPwChange={() => { setPwModal(true); setPwMsg(null); }}
            avail={avail}
            onAvailChange={handleAvail}
            availLoading={availLoading}
            availErr={availErr}
            gpsStatus={gpsStatus}
            gpsLastAt={gpsLastAt}
          />
        ) : (
          <JobDetail
            job={selectedJob}
            onBack={() => setSelectedJob(null)}
            onUpdate={handleUpdate}
          />
        )}
      </div>

      {/* Safe-area spacer for iOS home bar */}
      <div style={{ height: 'env(safe-area-inset-bottom)', background: C.navy, flexShrink: 0 }} />
    </div>
  );
}
