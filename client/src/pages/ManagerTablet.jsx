import React, { useState, useEffect, useRef } from 'react';

// ── Fonts injected once
const FONT_LINK = 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500&display=swap';

// ── Color tokens matching the mockup exactly
const C = {
  n: '#1C2333', n2: '#242E43', n3: '#2D3748', n4: '#364156',
  sl: '#5F667A', st: '#8A90A2',
  sd: '#D6B58A', sd2: '#C09A6A', slt: '#F5EDE0',
  cr: '#EDEBE7', lg: '#E6E6E6', wh: '#FFFFFF', of: '#F8F7F5',
  gn: '#1E6B3C', gl: '#E4F4EC', gn2: '#4EC87A',
  rd: '#B52A2A', rl: '#FDEAEA', rd2: '#E05555',
  am: '#B86200', al: '#FEF3E2', am2: '#F5A623',
  bl: '#1A5EA8', bll: '#EBF3FD',
};

const VAN_DATA = {
  1: { init: 'DR', name: 'Danny R.', status: 'Active · Full Detail #1041', speed: '0 mph', eta: 'At job', update: '12s ago', job: '#1041', color: '#1E6B3C' },
  2: { init: 'JM', name: 'Javier M.', status: 'En Route · Fleet Wash #1042', speed: '28 mph', eta: '8 min', update: '8s ago', job: '#1042', color: '#B86200' },
  3: { init: 'SL', name: 'Sarah L.', status: '⚠️ No-Show Active · Ceramic', speed: '0 mph', eta: 'At location', update: '4s ago', job: '#1043', color: '#B52A2A' },
  4: { init: 'CV', name: 'Carlos V.', status: 'Standby · Next: 3:30 PM', speed: '0 mph', eta: '—', update: '32s ago', job: '—', color: '#5F667A' },
};

// ── sub-components

function NoShowTimer({ seconds, id }) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  const color = seconds <= 60 ? C.rd : C.rd2;
  return <span id={id} style={{ fontFamily: "'Geist Mono',monospace", fontSize: 14, fontWeight: 700, color }}>{m}:{s}</span>;
}

// ── Van positions on the real Tampa map
const VAN_POSITIONS = {
  1: [27.9506, -82.4572], // Danny  — downtown Tampa
  2: [27.9220, -82.4750], // Javier — south Tampa, en route
  3: [27.9650, -82.5010], // Sarah  — west Tampa, no-show
  4: [27.9730, -82.4320], // Carlos — Ybor / standby
};
const VAN_BORDER = {
  1: '#4EC87A', // green  — active
  2: '#D6B58A', // sand   — en route
  3: '#E05555', // red    — no-show
  4: '#8A90A2', // gray   — standby
};

function VanPopupOverlay({ vanId, x, y, containerW, containerH, onClose, onGoToCam }) {
  const d = VAN_DATA[vanId];
  let px = x, py = y;
  if (px + 230 > containerW) px = px - 240;
  if (py + 200 > containerH) py = py - 210;
  if (px < 10) px = 10;
  if (py < 10) py = 10;
  return (
    <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', left: px, top: py, background: C.n, border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, padding: 14, width: 220, zIndex: 1000, boxShadow: '0 16px 48px rgba(0,0,0,.5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,.07)' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: d.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: VAN_BORDER[vanId], flexShrink: 0 }}>{d.init}</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.wh }}>{d.name}</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.35)' }}>{d.status}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
        {[['Speed', d.speed], ['ETA', d.eta], ['Last update', d.update], ['Job', d.job]].map(([label, val]) => (
          <div key={label} style={{ background: 'rgba(255,255,255,.04)', borderRadius: 6, padding: '6px 8px' }}>
            <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 7.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,.25)', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.wh }}>{val}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onClose} style={{ flex: 1, padding: 7, borderRadius: 6, border: 'none', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', background: C.sd, color: C.n, fontFamily: 'inherit' }}>Dispatch</button>
        <button onClick={onGoToCam} style={{ flex: 1, padding: 7, borderRadius: 6, border: 'none', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', background: 'rgba(74,105,164,.2)', color: '#8BAED4', fontFamily: 'inherit' }}>📹 Cameras</button>
        <button onClick={onClose} style={{ padding: '7px 10px', borderRadius: 6, border: 'none', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.5)', fontFamily: 'inherit' }}>✕</button>
      </div>
    </div>
  );
}

// ── Leaflet dispatch map (matches admin Dispatch page)
function DispatchMap({ onVanClick, onGoToCam }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mapInst = useRef(null);
  const [popup, setPopup] = useState(null); // { vanId, x, y }
  const [dims, setDims] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (mapInst.current || !mapRef.current) return;
    const L = window.L;
    if (!L) return;

    const map = L.map(mapRef.current, {
      center: [27.9506, -82.4572],
      zoom: 13,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Job location dots
    const jobDots = [
      { pos: [27.9520, -82.4550], color: '#4EC87A', label: 'Job #1041' },
      { pos: [27.9130, -82.4820], color: '#D6B58A', label: 'Job #1042' },
      { pos: [27.9660, -82.5020], color: '#E05555', label: 'NO-SHOW' },
    ];
    jobDots.forEach(({ pos, color, label }) => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35);"></div>`,
        iconSize: [12, 12], iconAnchor: [6, 6],
      });
      L.marker(pos, { icon }).addTo(map).bindTooltip(label, {
        permanent: true, direction: 'bottom', offset: [0, 4], className: 'mt-tip',
      });
    });

    // Van markers
    Object.entries(VAN_DATA).forEach(([idStr, d]) => {
      const id = parseInt(idStr);
      const pos = VAN_POSITIONS[id];
      const border = VAN_BORDER[id];
      const pulse = id === 3
        ? `<div style="position:absolute;inset:-8px;border-radius:50%;border:2px solid ${border};opacity:0;animation:mt-van-pulse 2s ease-out infinite;pointer-events:none;"></div>`
        : '';
      const icon = L.divIcon({
        className: '',
        html: `<div style="position:relative;width:36px;height:36px;">
          ${pulse}
          <div style="position:absolute;inset:0;border-radius:50%;background:#1C2333;border:2.5px solid ${border};box-shadow:0 3px 10px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:${border};font-family:'Geist',sans-serif;">${d.init}</div>
        </div>`,
        iconSize: [36, 36], iconAnchor: [18, 18],
      });

      L.marker(pos, { icon }).addTo(map).on('click', function (e) {
        L.DomEvent.stopPropagation(e);
        const pt = map.latLngToContainerPoint(e.latlng);
        const rect = mapRef.current.getBoundingClientRect();
        setDims({ w: rect.width, h: rect.height });
        setPopup({ vanId: id, x: pt.x, y: pt.y });
        onVanClick(id);
      });
    });

    map.on('click', () => setPopup(null));

    mapInst.current = map;
    setTimeout(() => map.invalidateSize(), 50);

    return () => {
      if (mapInst.current) { mapInst.current.remove(); mapInst.current = null; }
    };
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

      {/* Live badge */}
      <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 500, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        <div style={{ background: C.n, border: `1px solid ${C.sd}`, borderRadius: 8, padding: '7px 12px', fontSize: 11, fontWeight: 600, color: C.sd, display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'Geist',sans-serif" }}>🔴 Live</div>
      </div>

      {/* Legend */}
      <div style={{ position: 'absolute', bottom: 14, left: 14, zIndex: 500, background: C.n, border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'none' }}>
        {[['#4EC87A','Active at job'],['#D6B58A','En route'],['#E05555','No-show active'],['#8A90A2','Standby']].map(([col,lbl]) => (
          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10.5, color: 'rgba(255,255,255,.5)' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: col, flexShrink: 0 }}/>
            {lbl}
          </div>
        ))}
      </div>

      {/* Van popup overlay */}
      {popup && (
        <VanPopupOverlay
          vanId={popup.vanId}
          x={popup.x}
          y={popup.y}
          containerW={dims.w}
          containerH={dims.h}
          onClose={() => setPopup(null)}
          onGoToCam={() => { setPopup(null); onGoToCam(); }}
        />
      )}

      <style>{`
        .mt-tip {
          background: #1C2333 !important;
          border: 1px solid rgba(255,255,255,.15) !important;
          color: #D6B58A !important;
          font-family: 'Geist Mono', monospace !important;
          font-size: 9px !important;
          font-weight: 700 !important;
          letter-spacing: .08em !important;
          padding: 3px 7px !important;
          border-radius: 4px !important;
          box-shadow: 0 2px 8px rgba(0,0,0,.4) !important;
          white-space: nowrap !important;
        }
        .mt-tip::before { border-bottom-color: rgba(255,255,255,.15) !important; }
        @keyframes mt-van-pulse {
          0%   { transform: scale(1);   opacity: 0.6; }
          100% { transform: scale(1.8); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ── Cameras tab
function CamerasPanel() {
  const vans = [
    { init: 'DR', name: 'Danny R.', plate: 'KMC-001', color: '#1E6B3C', statusLabel: '● Active', statusColor: C.gn, statusBg: C.gl },
    { init: 'JM', name: 'Javier M.', plate: 'KMC-002', color: '#B86200', statusLabel: '● En Route', statusColor: C.gn, statusBg: C.gl },
  ];
  const feeds = [
    { label: '🔍 Front Camera', svgKey: 'front' },
    { label: '🔄 Rear Camera', svgKey: 'rear' },
    { label: '🚗 Inner Cab', svgKey: 'cab' },
  ];
  function CamSvg({ type }) {
    if (type === 'front') return (
      <svg viewBox="0 0 240 120" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%'}}>
        <rect width="240" height="120" fill="#0d1117"/>
        <rect x="20" y="60" width="200" height="40" rx="4" fill="#1a2035"/>
        <rect x="60" y="30" width="120" height="45" rx="6" fill="#1e2840"/>
        <rect x="80" y="35" width="80" height="35" rx="4" fill="#252f45"/>
        <line x1="0" y1="80" x2="240" y2="80" stroke="#D6B58A" strokeWidth="0.5" strokeDasharray="4,4" opacity="0.3"/>
        <text x="120" y="110" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.3)" fontFamily="monospace">FRONT CAM · LIVE</text>
        <circle cx="220" cy="10" r="5" fill="#4EC87A"><animate attributeName="opacity" values="1;0.2;1" dur="2s" repeatCount="indefinite"/></circle>
      </svg>
    );
    if (type === 'rear') return (
      <svg viewBox="0 0 240 120" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%'}}>
        <rect width="240" height="120" fill="#0d1117"/>
        <rect x="10" y="50" width="220" height="50" rx="4" fill="#1a2035"/>
        <rect x="70" y="20" width="100" height="55" rx="6" fill="#1e2840"/>
        <line x1="0" y1="75" x2="240" y2="75" stroke="#D6B58A" strokeWidth="0.5" strokeDasharray="4,4" opacity="0.3"/>
        <text x="120" y="110" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.3)" fontFamily="monospace">REAR CAM · LIVE</text>
        <circle cx="220" cy="10" r="5" fill="#4EC87A"><animate attributeName="opacity" values="1;0.2;1" dur="2.3s" repeatCount="indefinite"/></circle>
      </svg>
    );
    return (
      <svg viewBox="0 0 240 120" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%'}}>
        <rect width="240" height="120" fill="#0a0f1a"/>
        <rect x="30" y="20" width="80" height="60" rx="8" fill="#1a2035"/><rect x="130" y="20" width="80" height="60" rx="8" fill="#1a2035"/>
        <circle cx="70" cy="50" r="15" fill="#1e2840"/><circle cx="170" cy="50" r="15" fill="#1e2840"/>
        <rect x="85" y="88" width="70" height="20" rx="4" fill="#1e2840"/>
        <text x="120" y="110" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.3)" fontFamily="monospace">INNER CAB · LIVE</text>
        <circle cx="220" cy="10" r="5" fill="#4EC87A"><animate attributeName="opacity" values="1;0.2;1" dur="1.8s" repeatCount="indefinite"/></circle>
      </svg>
    );
  }
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.n, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.wh }}>📹 Live Camera Feeds</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)' }}>Front · Rear · Inner Cab · All vehicles</div>
        </div>
        <div style={{ marginLeft: 'auto', fontFamily: "'Geist Mono',monospace", fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', background: 'rgba(214,181,138,.15)', color: C.sd, padding: '4px 12px', borderRadius: 99 }}>Scale+ Feature</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {vans.map(van => (
          <div key={van.plate} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: van.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: C.wh, flexShrink: 0 }}>{van.init}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.wh }}>{van.name}</div>
              <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, color: 'rgba(255,255,255,.3)', background: 'rgba(255,255,255,.06)', padding: '2px 8px', borderRadius: 4 }}>{van.plate}</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: van.statusBg, color: van.statusColor }}>{van.statusLabel}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {feeds.map(feed => (
                <div key={feed.label} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', transition: 'all .2s' }}>
                  <div style={{ height: 120, background: C.n3, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    <CamSvg type={feed.svgKey}/>
                    <div style={{ position: 'absolute', top: 8, left: 8, background: C.rd2, color: C.wh, fontFamily: "'Geist Mono',monospace", fontSize: 8, fontWeight: 700, letterSpacing: '.1em', padding: '2px 7px', borderRadius: 4 }}>● REC</div>
                  </div>
                  <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.wh }}>{feed.label}</span>
                    <button style={{ fontSize: 10, fontWeight: 700, color: C.sd, background: 'rgba(214,181,138,.1)', padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>View Live</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{ background: 'rgba(255,255,255,.03)', border: '1px dashed rgba(255,255,255,.1)', borderRadius: 12, padding: 32, textAlign: 'center', marginTop: 16 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.wh, marginBottom: 6 }}>Unlock Camera Feeds on Scale+</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.35)', lineHeight: 1.65, marginBottom: 18 }}>Live dashcam feeds require the Scale plan ($199/mo) with Geotab or Samsara hardware installed in your vehicles. Includes front, rear, and inner cab views for every van — all in one dispatch screen.</div>
          <button style={{ background: C.sd, color: C.n, border: 'none', padding: '10px 24px', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Upgrade to Scale →</button>
        </div>
      </div>
    </div>
  );
}

// ── Jobs tab
const JOBS = [
  { client: 'Rita Okafor', service: 'Full Detail', tech: 'Danny R.', time: '1:00 PM', amount: '$285', amtColor: C.sd, status: 'Active', statusBg: C.gl, statusColor: C.gn },
  { client: 'Sarah Chen', service: 'Ceramic Coat', tech: 'Sarah L.', time: '12:00 PM', amount: '$1,200', amtColor: C.sd, status: 'No-Show', statusBg: C.rl, statusColor: C.rd },
  { client: 'XYZ Ford Deal.', service: 'Fleet Wash ×22', tech: 'Javier M.', time: '2:00 PM', amount: '$1,650', amtColor: C.sd, status: 'En Route', statusBg: C.bll, statusColor: C.bl },
  { client: 'Thomas Garfield', service: 'Paint Correction', tech: 'Danny R.', time: '3:30 PM', amount: '$850', amtColor: C.sd, status: 'Scheduled', statusBg: C.cr, statusColor: C.sl },
  { client: 'Marcus Williams', service: 'Express Wash', tech: 'Carlos V.', time: '3:30 PM', amount: '$95', amtColor: C.sd, status: 'Scheduled', statusBg: C.cr, statusColor: C.sl },
  { client: 'Lisa Hernandez', service: 'Interior Detail', tech: 'Danny R.', time: '10:00 AM', amount: '$185', amtColor: C.gn, status: 'Done', statusBg: C.gl, statusColor: C.gn },
];
function JobsPanel() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const filtered = JOBS.filter(j => {
    const q = search.toLowerCase();
    const matchQ = !q || j.client.toLowerCase().includes(q) || j.service.toLowerCase().includes(q) || j.tech.toLowerCase().includes(q);
    const matchS = statusFilter === 'All Status' || j.status === statusFilter;
    return matchQ && matchS;
  });
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.of, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', background: C.wh, borderBottom: `1px solid ${C.lg}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search jobs, clients, techs..." style={{ flex: 1, padding: '9px 14px', border: `1.5px solid ${C.lg}`, borderRadius: 7, fontSize: 13, fontFamily: 'inherit', color: C.n, outline: 'none', background: C.of }} />
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{ padding: '9px 14px', border: `1.5px solid ${C.lg}`, borderRadius: 7, fontSize: 12, fontFamily: 'inherit', color: C.sl, outline: 'none', background: C.of, cursor: 'pointer' }}>
          <option>All Status</option><option>Active</option><option>Scheduled</option><option>Done</option><option>No-Show</option><option>En Route</option>
        </select>
        <select style={{ padding: '9px 14px', border: `1.5px solid ${C.lg}`, borderRadius: 7, fontSize: 12, fontFamily: 'inherit', color: C.sl, outline: 'none', background: C.of, cursor: 'pointer' }}>
          <option>All Techs</option><option>Danny R.</option><option>Javier M.</option><option>Carlos V.</option><option>Sarah L.</option>
        </select>
        <button style={{ padding: '9px 16px', background: C.sd, color: C.n, border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>+ New Job</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr 1fr 1fr 1fr 80px', padding: '10px 16px', background: C.wh, borderBottom: `1px solid ${C.lg}`, position: 'sticky', top: 0, zIndex: 5 }}>
          {['Client','Service','Tech','Time','Amount','Status'].map(h=>(
            <div key={h} style={{ fontFamily: "'Geist Mono',monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.st }}>{h}</div>
          ))}
        </div>
        {filtered.map((j, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr 1fr 1fr 1fr 80px', padding: '13px 16px', borderBottom: `1px solid ${C.lg}`, alignItems: 'center', background: i%2===0 ? C.wh : C.of, cursor: 'pointer' }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: C.n }}>{j.client}</div>
            <div style={{ fontSize: 12.5, color: C.sl }}>{j.service}</div>
            <div style={{ fontSize: 12.5, color: C.sl }}>{j.tech}</div>
            <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11.5, color: C.sl }}>{j.time}</div>
            <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11.5, color: j.amtColor }}>{j.amount}</div>
            <div><span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: j.statusBg, color: j.statusColor }}>{j.status}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Clients tab
const CLIENTS = [
  { init: 'TG', name: 'Thomas Garfield', tier: '⭐ VIP · Card on file', color: '#1E6B3C', ltv: '$8,400', jobs: '24', balance: '$0', balColor: C.gn, last4: 'Today 3:30', ltvColor: C.sd, lastJob: 'Last: Paint Correction · Today' },
  { init: 'RO', name: 'Rita Okafor', tier: 'Returning · Auto-pay', color: '#B86200', ltv: '$3,200', jobs: '18', balance: '$0', balColor: C.gn, last4: 'Today 1:00', ltvColor: C.sd, lastJob: 'Last: Full Detail · Today' },
  { init: 'SC', name: 'Sarah Chen', tier: '⚠️ At-Risk · 2 no-shows', color: '#B52A2A', ltv: '$1,800', jobs: '9', balance: '-$300', balColor: C.rd, last4: '2 no-shows', ltvColor: C.sd, lastJob: 'No-show · Ceramic Coat · Today', balLabel: 'Balance', last4Label: 'No-shows' },
  { init: 'XF', name: 'XYZ Ford Dealership', tier: 'Fleet · Net-30', color: '#1A5EA8', ltv: '$28,600', jobs: '22', balance: '$1,650', balColor: C.am, last4: '72h AP', ltvColor: C.sd, lastJob: 'Fleet Wash #22 · Today 2:00 PM', jobsLabel: 'Vehicles', last4Label: 'Notice' },
  { init: 'MW', name: 'Marcus Williams', tier: 'New · First visit', color: '#5F667A', ltv: '$95', jobs: '1', balance: '$0', balColor: C.gn, last4: 'Today 3:30', ltvColor: C.n, lastJob: 'Booked: Express Wash · Today' },
];
function ClientsPanel() {
  const [search, setSearch] = useState('');
  const filtered = CLIENTS.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.of, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', background: C.wh, borderBottom: `1px solid ${C.lg}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search clients..." style={{ flex: 1, padding: '9px 14px', border: `1.5px solid ${C.lg}`, borderRadius: 7, fontSize: 13, fontFamily: 'inherit', color: C.n, outline: 'none', background: C.of }} />
        <select style={{ padding: '9px 14px', border: `1.5px solid ${C.lg}`, borderRadius: 7, fontSize: 12, fontFamily: 'inherit', color: C.sl, outline: 'none', background: C.of, cursor: 'pointer' }}>
          <option>All Tiers</option><option>⭐ VIP</option><option>Returning</option><option>New</option><option>⚠️ At-Risk</option>
        </select>
        <button style={{ padding: '9px 16px', background: C.sd, color: C.n, border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>+ Add Client</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12, alignContent: 'start' }}>
        {filtered.map(c => (
          <div key={c.name} style={{ background: C.wh, border: `1px solid ${C.lg}`, borderRadius: 10, padding: 14, cursor: 'pointer', transition: 'all .18s' }}
            onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.sd; e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 8px 24px rgba(28,35,51,.08)'; }}
            onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.lg; e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='none'; }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: C.wh, flexShrink: 0 }}>{c.init}</div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.n }}>{c.name}</div>
                <div style={{ fontSize: 10, color: C.st }}>{c.tier}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              {[['LTV', c.ltv, c.ltvColor], [c.jobsLabel||'Jobs', c.jobs, C.n], [c.balLabel||'Balance', c.balance, c.balColor], [c.last4Label||'Next', c.last4, C.n]].map(([lbl,val,vc])=>(
                <div key={lbl} style={{ background: C.of, borderRadius: 6, padding: '7px 9px' }}>
                  <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', color: C.st, marginBottom: 3 }}>{lbl}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: vc }}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: C.sl, fontStyle: 'italic' }}>{c.lastJob}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Deposits tab
const DEP_ITEMS = [
  { init: 'SC', color: '#B52A2A', name: 'Sarah Chen · Ceramic Coating', detail: 'Retained · No-show declared · GPS documented', amount: '$300', amtColor: C.gn, status: 'Retained', stBg: C.gl, stColor: C.gn },
  { init: 'TG', color: '#1E6B3C', name: 'Thomas Garfield · Paint Correction', detail: 'Active · Job at 3:30 PM today', amount: '$212', amtColor: C.sd, status: 'Active', stBg: C.bll, stColor: C.bl },
  { init: 'LH', color: '#B86200', name: 'Lisa Hernandez · Interior Detail', detail: 'Applied to invoice · Job complete', amount: '$46', amtColor: C.st, status: 'Applied', stBg: C.cr, stColor: C.st },
  { init: 'MW', color: '#5F667A', name: 'Marcus Williams · Express Wash', detail: 'Pending · Job at 3:30 PM', amount: '$25', amtColor: C.am, status: 'Pending', stBg: C.al, stColor: C.am },
];
function DepositsPanel() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.of, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', background: C.wh, borderBottom: `1px solid ${C.lg}`, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, flexShrink: 0 }}>
        {[['Held Today','$1,850',C.sd],['Retained YTD','$4,200',C.gn],['Pending','$650',C.am],['Expiring Soon','2',C.rd]].map(([l,v,vc])=>(
          <div key={l} style={{ background: C.of, borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 8.5, letterSpacing: '.1em', textTransform: 'uppercase', color: C.st, marginBottom: 4 }}>{l}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: vc }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {DEP_ITEMS.map(d => (
          <div key={d.name} style={{ background: C.wh, border: `1px solid ${C.lg}`, borderRadius: 10, padding: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', transition: 'all .18s' }}
            onMouseEnter={e=>e.currentTarget.style.borderColor=C.sd}
            onMouseLeave={e=>e.currentTarget.style.borderColor=C.lg}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: d.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: C.wh, flexShrink: 0 }}>{d.init}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.n }}>{d.name}</div>
              <div style={{ fontSize: 11.5, color: C.sl }}>{d.detail}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 14, fontWeight: 700, color: d.amtColor }}>{d.amount}</div>
              <div style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99, marginTop: 4, display: 'inline-block', background: d.stBg, color: d.stColor }}>{d.status}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Charge Notices tab
const NOTICES = [
  { init: 'RG', color: '#B52A2A', name: 'Rita Garcia · Weekly Lawn', amount: '$185', detail: '⚠️ Reply: "Card changed — please update" · Stripe link auto-sent · Awaiting update', urgent: true, bg: C.rl, btns: ['📞 Call','⏸ Pause','✓ Resolved'] },
  { init: 'JB', color: '#B86200', name: 'James Brown · Monthly Detail', amount: '$320', detail: '⚠️ Reply: "Can we reschedule this month?" · Charge paused · Manager action required', warning: true, bg: C.al, btns: ['📞 Call','✓ Confirm','✕ Cancel'] },
  { init: 'KM', color: '#B52A2A', name: 'Kevin Martinez · Fleet Acct.', amount: '$2,100', detail: '⚠️ Reply: "Cancel our service" · Charge paused · Retention call recommended', urgent: true, bg: C.rl, btns: ['📞 Call Now','Process Cancel'] },
  { init: 'RO', color: '#1E6B3C', name: 'Rita Okafor · Weekly Detail', amount: '$285', detail: '✓ Confirmed · Reply: "Thanks, see you Thursday!" · Charging Friday', btns: ['✓ All Good'] },
  { init: 'XF', color: '#1A5EA8', name: 'XYZ Ford Dealership · Fleet', amount: '$1,650', detail: '✓ AP Confirmed · 72h notice sent and acknowledged · Net-30 auto-charge scheduled', btns: ['✓ All Good'] },
];
function NoticesPanel() {
  function btnStyle(label) {
    if (label.includes('Call')) return { background: C.bll, color: C.bl, border: `1px solid rgba(26,94,168,.15)` };
    if (label.includes('Pause')) return { background: C.al, color: C.am, border: `1px solid rgba(184,98,0,.15)` };
    if (label.includes('Confirm') || label.includes('All Good') || label.includes('Resolved')) return { background: C.gl, color: C.gn, border: `1px solid rgba(30,107,60,.15)` };
    if (label.includes('Cancel') || label.includes('Process')) return { background: C.rl, color: C.rd, border: `1px solid rgba(181,42,42,.15)` };
    return { background: C.cr, color: C.sl, border: `1px solid ${C.lg}` };
  }
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.of, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', background: C.wh, borderBottom: `1px solid ${C.lg}`, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, flexShrink: 0 }}>
        {[['Sent Today','12',C.n],['Confirmed','9',C.gn],['Needs Action','3',C.rd],['Revenue','$4,890',C.sd]].map(([l,v,vc])=>(
          <div key={l} style={{ background: C.of, borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 8.5, letterSpacing: '.1em', textTransform: 'uppercase', color: C.st, marginBottom: 4 }}>{l}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: vc }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {NOTICES.map(n => (
          <div key={n.name} style={{ background: n.bg || C.wh, border: `1px solid ${n.urgent ? 'rgba(181,42,42,.3)' : n.warning ? 'rgba(184,98,0,.3)' : C.lg}`, borderRadius: 10, padding: 13, marginBottom: 8, cursor: 'pointer', transition: 'all .18s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: n.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: C.wh, flexShrink: 0 }}>{n.init}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.n, flex: 1 }}>{n.name}</div>
              <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 14, fontWeight: 700, color: C.sd }}>{n.amount}</div>
            </div>
            <div style={{ fontSize: 11.5, color: C.sl, marginBottom: 8 }}>{n.detail}</div>
            <div style={{ display: 'flex', gap: 7 }}>
              {n.btns.map(b => (
                <button key={b} style={{ flex: 1, padding: 8, borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center', transition: 'all .15s', ...btnStyle(b) }}>{b}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Book Job tab
function BookPanel() {
  const Section = ({ title, children }) => (
    <div style={{ background: C.wh, border: `1px solid ${C.lg}`, borderRadius: 12, padding: 20, marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.n, letterSpacing: '.04em', textTransform: 'uppercase', fontFamily: "'Geist Mono',monospace", marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'block', width: 3, height: 14, background: C.sd, borderRadius: 99, flexShrink: 0 }}/>
        {title}
      </div>
      {children}
    </div>
  );
  const inputStyle = { width: '100%', padding: '10px 12px', border: `1.5px solid ${C.lg}`, borderRadius: 7, fontSize: 13, fontFamily: 'inherit', color: C.n, outline: 'none', background: C.of, boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.st, marginBottom: 5, fontFamily: "'Geist Mono',monospace" };
  const BF = ({ label, children }) => <div style={{ marginBottom: 12 }}><label style={labelStyle}>{label}</label>{children}</div>;
  const Row = ({ children }) => <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.of, overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, maxWidth: 680, margin: '0 auto', width: '100%' }}>
        <Section title="Client">
          <BF label="Search existing client"><input type="text" placeholder="Type name, phone, or email..." style={inputStyle}/></BF>
          <Row>
            <BF label="First Name"><input type="text" placeholder="First name" style={inputStyle}/></BF>
            <BF label="Last Name"><input type="text" placeholder="Last name" style={inputStyle}/></BF>
          </Row>
          <Row>
            <BF label="Phone"><input type="tel" placeholder="(555) 000-0000" style={inputStyle}/></BF>
            <BF label="Email"><input type="email" placeholder="client@email.com" style={inputStyle}/></BF>
          </Row>
        </Section>
        <Section title="Service & Schedule">
          <Row>
            <BF label="Service Type">
              <select style={inputStyle}>
                <option>Full Detail</option><option>Express Wash</option><option>Interior Only</option>
                <option>Paint Correction</option><option>Ceramic Coating</option><option>Fleet Wash</option>
              </select>
            </BF>
            <BF label="Assign Tech">
              <select style={inputStyle}>
                <option>Danny R.</option><option>Javier M.</option><option>Carlos V.</option><option>Sarah L.</option>
              </select>
            </BF>
          </Row>
          <Row>
            <BF label="Date"><input type="date" style={inputStyle}/></BF>
            <BF label="Time"><input type="time" style={inputStyle}/></BF>
          </Row>
          <BF label="Service Address"><input type="text" placeholder="123 Main St, City, FL 33000" style={inputStyle}/></BF>
        </Section>
        <Section title="Payment & Deposit">
          <Row>
            <BF label="Job Amount ($)"><input type="number" placeholder="0.00" style={inputStyle}/></BF>
            <BF label="Deposit Required">
              <select style={inputStyle}>
                <option>Auto (by service type)</option><option>No deposit</option><option>Custom amount</option><option>Full payment</option>
              </select>
            </BF>
          </Row>
          <BF label="Payment Method">
            <select style={inputStyle}>
              <option>Card on file</option><option>Collect at booking</option><option>Invoice after job</option><option>Net-30 (fleet)</option>
            </select>
          </BF>
        </Section>
        <Section title="Notes">
          <BF label="Job Notes"><textarea rows="3" placeholder="Gate code, special instructions, vehicle details..." style={{...inputStyle, resize: 'vertical'}}/></BF>
        </Section>
        <button style={{ width: '100%', padding: 13, background: C.sd, color: C.n, border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'background .18s', marginBottom: 20 }}>
          Book Job + Send Confirmation →
        </button>
      </div>
    </div>
  );
}

// ── Main component
export default function ManagerTablet() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [email, setEmail] = useState('manager@getfieldcore.com');
  const [password, setPassword] = useState('fieldcore');
  const [loginError, setLoginError] = useState(false);
  const [activeTab, setActiveTab] = useState('dispatch');
  const [time, setTime] = useState('');
  const [nsSeconds, setNsSeconds] = useState(24 * 60 + 12);
  const [selectedTech, setSelectedTech] = useState(1);

  // inject fonts
  useEffect(() => {
    if (!document.querySelector('link[data-mt-font]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = FONT_LINK;
      link.setAttribute('data-mt-font', '1');
      document.head.appendChild(link);
    }
  }, []);

  // clock
  useEffect(() => {
    function tick() {
      const now = new Date();
      let h = now.getHours(), m = now.getMinutes(), am = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      setTime(`${h}:${String(m).padStart(2, '0')} ${am}`);
    }
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, []);

  // no-show timer
  useEffect(() => {
    if (!loggedIn) return;
    const id = setInterval(() => setNsSeconds(s => s > 0 ? s - 1 : 0), 1000);
    return () => clearInterval(id);
  }, [loggedIn]);

  function doLogin(e) {
    e?.preventDefault();
    const e2 = email.trim().toLowerCase();
    if ((e2 === 'manager@getfieldcore.com' || e2 === 'manager@usefieldcore.com' || e2 === 'manager@fieldcore.io') && password === 'fieldcore') {
      setLoggedIn(true);
      setLoginError(false);
    } else {
      setLoginError(true);
    }
  }

  function handleVanClick(id) {
    setSelectedTech(id);
  }

  const TABS = [
    { id: 'dispatch', label: '🗺️ Dispatch', badge: '1', badgeAmber: false },
    { id: 'dashcam', label: '📹 Cameras', badge: 'Scale+', badgeAmber: true },
    { id: 'jobs', label: '📋 Jobs' },
    { id: 'clients', label: '👥 Clients' },
    { id: 'deposits', label: '💳 Deposits' },
    { id: 'notices', label: '🔔 Notices', badge: '3', badgeAmber: false },
    { id: 'book', label: '➕ Book Job' },
  ];

  const nsM = String(Math.floor(nsSeconds / 60)).padStart(2, '0');
  const nsS = String(nsSeconds % 60).padStart(2, '0');
  const nsStr = `${nsM}:${nsS}`;

  // ── Login screen
  if (!loggedIn) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: C.n, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Geist',sans-serif" }}>
        <div style={{ width: 400, maxWidth: '100%' }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: C.wh, marginBottom: 32 }}>
            FIELDCORE<sup style={{ color: C.sd, fontSize: 9 }}>™</sup>
          </div>
          <h2 style={{ fontFamily: "'Instrument Serif',serif", fontSize: 36, color: C.wh, marginBottom: 6, fontWeight: 400 }}>
            Manager <em style={{ color: C.sd, fontStyle: 'italic' }}>View</em>
          </h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,.35)', marginBottom: 28, lineHeight: 1.6 }}>Dispatch · Jobs · Clients · Charge Notices · Live Cameras</p>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.25)', background: 'rgba(255,255,255,.05)', borderLeft: `2px solid ${C.sd}`, padding: '8px 12px', marginBottom: 20, fontFamily: "'Geist Mono',monospace" }}>
            <strong style={{ color: C.sd }}>Demo:</strong> manager@getfieldcore.com / fieldcore
          </div>
          {loginError && <div style={{ background: C.rl, color: C.rd, borderRadius: 6, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>Incorrect email or password.</div>}
          <form onSubmit={doLogin}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 9.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,.3)', marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>Email</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,.07)', border: `1.5px solid rgba(255,255,255,.1)`, borderRadius: 7, color: C.wh, fontSize: 14, fontFamily: "'Geist',sans-serif", outline: 'none', boxSizing: 'border-box' }}/>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 9.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,.3)', marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>Password</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,.07)', border: `1.5px solid rgba(255,255,255,.1)`, borderRadius: 7, color: C.wh, fontSize: 14, fontFamily: "'Geist',sans-serif", outline: 'none', boxSizing: 'border-box' }}/>
            </div>
            <button type="submit" style={{ width: '100%', padding: 13, background: C.sd, color: C.n, border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 700, fontFamily: "'Geist',sans-serif", cursor: 'pointer', marginTop: 4 }}>
              Sign in →
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'Geist',sans-serif", background: C.of, color: C.n }}>
      {/* TOPBAR */}
      <div style={{ background: C.n, height: 52, display: 'flex', alignItems: 'center', padding: '0 18px', gap: 14, flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: C.wh, flexShrink: 0 }}>FIELDCORE<sup style={{ color: C.sd, fontSize: 8 }}>™</sup></span>
        <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,.25)', background: 'rgba(255,255,255,.06)', padding: '3px 9px', borderRadius: 99 }}>Manager</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
          <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: 'rgba(255,255,255,.3)', background: 'rgba(255,255,255,.05)', padding: '4px 10px', borderRadius: 6 }}>{time}</span>
          <div style={{ position: 'relative', width: 32, height: 32, background: 'rgba(255,255,255,.07)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 14 }}>
            🔔<div style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, background: C.rd2, borderRadius: '50%', border: `1.5px solid ${C.n}` }}/>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.wh }}>Alex M.</span>
          <div style={{ width: 32, height: 32, background: C.sd, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: C.n, cursor: 'pointer' }}>AM</div>
        </div>
      </div>

      {/* TABBAR */}
      <div style={{ background: C.n2, display: 'flex', alignItems: 'center', padding: '0 18px', gap: 4, flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,.06)', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: activeTab === t.id ? C.sd : 'rgba(255,255,255,.35)', cursor: 'pointer', background: 'none', border: 'none', borderBottom: activeTab === t.id ? `2px solid ${C.sd}` : '2px solid transparent', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', letterSpacing: '.01em', flexShrink: 0, fontFamily: 'inherit', transition: 'all .18s' }}>
            {t.label}
            {t.badge && <span style={{ background: t.badgeAmber ? C.am2 : C.rd2, color: t.badgeAmber ? C.n : C.wh, fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, fontFamily: "'Geist Mono',monospace" }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* PANELS */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* DISPATCH */}
        {activeTab === 'dispatch' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 340px', overflow: 'hidden' }}>
              <DispatchMap onVanClick={handleVanClick} onGoToCam={() => setActiveTab('dashcam')} />
              {/* Sidebar */}
              <div style={{ background: C.wh, borderLeft: `1px solid ${C.lg}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.lg}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.n, letterSpacing: '.01em' }}>Today's Techs</span>
                  <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, color: C.st, background: C.cr, padding: '2px 8px', borderRadius: 99 }}>4 active</span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
                  {/* No-show alert */}
                  <div style={{ background: C.rl, border: '1px solid rgba(181,42,42,.2)', borderRadius: 8, padding: '10px 12px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, background: C.rd2, borderRadius: '50%', flexShrink: 0, animation: 'mt-pulse 1.4s infinite' }}/>
                    <div style={{ fontSize: 11.5, color: C.rd, fontWeight: 600, flex: 1 }}>Sarah L. · No-show active</div>
                    <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 14, fontWeight: 700, color: C.rd2 }}>{nsStr}</span>
                  </div>
                  {/* Tech cards */}
                  {[
                    { id: 1, init: 'DR', name: 'Danny R.', role: 'Senior Tech', color: '#1E6B3C', status: 'Active', stBg: C.gl, stColor: C.gn, job: 'Rita Okafor · Full Detail · 887 Pine St', meta: ['📍 At location','⏱ 45 min left','💰 $285'] },
                    { id: 2, init: 'JM', name: 'Javier M.', role: 'Fleet Specialist', color: '#B86200', status: 'Active', stBg: C.gl, stColor: C.gn, job: 'XYZ Ford Dealership · Fleet Wash · 14/22 vehicles', meta: ['🚗 En route','⏱ 8 min ETA','💰 $1,650'] },
                    { id: 3, init: 'SL', name: 'Sarah L.', role: 'Tech', color: '#B52A2A', status: 'No-Show', stBg: C.rl, stColor: C.rd, job: 'Sarah Chen · Ceramic Coat · 423 Oak Ave', meta: ['📍 At location','⚠️ Client absent','💰 $300 dep.'] },
                    { id: 4, init: 'CV', name: 'Carlos V.', role: 'Tech', color: '#5F667A', status: 'Standby', stBg: C.al, stColor: C.am, job: 'Available · Next: Holloway at 3:30 PM', meta: ['📍 Near base','🕐 Free 2h'] },
                  ].map(t => (
                    <div key={t.id} onClick={() => handleVanClick(t.id)}
                      style={{ background: selectedTech === t.id ? C.slt : C.of, border: `1px solid ${selectedTech === t.id ? C.sd : C.lg}`, borderRadius: 10, padding: 12, marginBottom: 8, cursor: 'pointer', transition: 'all .18s' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: C.wh, flexShrink: 0 }}>{t.init}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.n }}>{t.name}</div>
                          <div style={{ fontSize: 10.5, color: C.st }}>{t.role}</div>
                        </div>
                        <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: t.stBg, color: t.stColor }}>{t.status}</span>
                      </div>
                      <div style={{ background: C.wh, borderRadius: 7, padding: '9px 10px', fontSize: 11.5, color: C.sl, marginBottom: 6 }}>{t.job}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {t.meta.map(m => <span key={m} style={{ fontFamily: "'Geist Mono',monospace", fontSize: 9.5, color: C.st }}>{m}</span>)}
                      </div>
                    </div>
                  ))}
                </div>
                {/* No-show action bar */}
                <div style={{ background: C.rl, borderTop: `2px solid ${C.rd}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.rd }}>🚨 Sarah Chen · Ceramic Coat</div>
                  <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 20, fontWeight: 700, color: C.rd2 }}>{nsStr}</span>
                  <button style={{ padding: '9px 18px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: C.gl, color: C.gn }}>✓ Arrived</button>
                  <button style={{ padding: '9px 18px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: C.rl, color: C.rd }}>Declare</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'dashcam'  && <CamerasPanel />}
        {activeTab === 'jobs'     && <JobsPanel />}
        {activeTab === 'clients'  && <ClientsPanel />}
        {activeTab === 'deposits' && <DepositsPanel />}
        {activeTab === 'notices'  && <NoticesPanel />}
        {activeTab === 'book'     && <BookPanel />}
      </div>

      <style>{`
        @keyframes mt-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
      `}</style>
    </div>
  );
}
