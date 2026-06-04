import { useState, useEffect } from "react";

// ─── Style Constants ──────────────────────────────────────────────────────────
const CARD = {
  background: "#FFFFFF",
  borderRadius: 16,
  boxShadow: "0 1px 4px rgba(28,35,51,.06), 0 4px 16px rgba(28,35,51,.04)",
};

const BTN_PRIMARY = {
  background: "#1C2333", color: "#FFFFFF",
  border: "none", borderRadius: 12,
  padding: "13px 20px", fontSize: 15, fontWeight: 600,
  fontFamily: "Inter, sans-serif",
  cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
};

const BTN_CTA = {
  background: "#D6B58A", color: "#1C2333",
  border: "none", borderRadius: 12,
  padding: "13px 20px", fontSize: 15, fontWeight: 700,
  fontFamily: "Inter, sans-serif",
  cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
};

const BTN_GHOST = {
  background: "transparent", color: "#1C2333",
  border: "1.5px solid #E6E6E6", borderRadius: 12,
  padding: "11px 18px", fontSize: 14, fontWeight: 500,
  fontFamily: "Inter, sans-serif",
  cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
};

// ─── Global Styles (keyframes only — no @import, font loaded via useEffect) ────
const GlobalStyle = () => (
  <style>{`
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    body { font-family: 'Inter', sans-serif; background: #EDEBE7; color: #1C2333; }
    ::-webkit-scrollbar { width: 0; }

    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
    @keyframes pulse   { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    @keyframes mapPulse {
      0%   { transform: translate(-50%, -50%) scale(1);   opacity: 0.75; }
      70%  { transform: translate(-50%, -50%) scale(2.8); opacity: 0;    }
      100% { transform: translate(-50%, -50%) scale(1);   opacity: 0;    }
    }
  `}</style>
);

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 22, color = "currentColor", strokeWidth = 1.8 }) => {
  const paths = {
    home:      <><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></>,
    schedule:  <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>,
    clock:     <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></>,
    search:    <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></>,
    more:      <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    bell:      <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></>,
    spark:     <><path d="M12 2l2.4 7.2H22l-6.2 4.5 2.4 7.2L12 16.4 5.8 20.9l2.4-7.2L2 9.2h7.6L12 2z"/></>,
    nav:       <><polygon points="3 11 22 2 13 21 11 13 3 11"/></>,
    check:     <><polyline points="20 6 9 17 4 12"/></>,
    plus:      <><path d="M12 5v14M5 12h14"/></>,
    chevRight: <><polyline points="9 18 15 12 9 6"/></>,
    chevDown:  <><polyline points="6 9 12 15 18 9"/></>,
    play:      <><polygon points="5 3 19 12 5 21 5 3"/></>,
    dollar:    <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>,
    users:     <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></>,
    phone:     <><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 .96h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6z"/></>,
    alert:     <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    truck:     <><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>,
    star:      <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    wrench:    <><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></>,
    x:         <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    list:      <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>,
    filter:    <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    settings:  <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></>,
    payment:   <><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
    flag:      <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></>,
    map:       <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></>,
    signal:    <><path d="M1 6l4 4 4-4M9 6l4 4 4-4M17 6l4 4"/></>,
    wifi:      <><path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01"/></>,
    battery:   <><rect x="2" y="7" width="18" height="10" rx="2"/><line x1="22" y1="11" x2="22" y2="13"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
};

// ─── Mock Data ────────────────────────────────────────────────────────────────
const MOCK = {
  today: "Thursday, June 4th",
  jobs: [
    {
      id: 1, client: "Steve Larson",
      address: "Hollywood Beach Towers • 301 Harrison St",
      time: "2:00 PM – 3:00 PM", value: 200, status: "upcoming",
      tech: { initials: "KC" }, label: "Full Detail",
      priority: "normal", jobNumber: 128, visitType: "One-time",
    },
    {
      id: 2, client: "Fredrico B",
      address: "2633 NE 14th Ave, Fort Lauderdale",
      time: "4:30 PM – 5:30 PM", value: 122, status: "late",
      tech: { initials: "KC" }, label: "Interior Detail",
      priority: "urgent", jobNumber: 145, visitType: "Recurring",
    },
    {
      id: 3, client: "Plumbing SFL",
      address: "201 N Federal Hwy • Fleet Service",
      time: "Fri 9:00 AM – 10:00 AM", value: 200, status: "upcoming",
      tech: { initials: "KC" }, label: "Fleet Wash",
      priority: "vip", jobNumber: 109, visitType: "Recurring",
    },
  ],
  kpis: {
    weekRevenue: 600, weekJobs: 5,
    weekRevenueDelta: 250, weekJobsDelta: 150,
    pendingRequests: 5, actionRequired: 14, actionValue: 984,
  },
  weekDays: [
    { label: "M", num: 1, hasDot: false },
    { label: "T", num: 2, hasDot: false },
    { label: "W", num: 3, hasDot: true  },
    { label: "T", num: 4, hasDot: true, today: true },
    { label: "F", num: 5, hasDot: true  },
    { label: "S", num: 6, hasDot: false },
    { label: "S", num: 7, hasDot: false },
  ],
  recentSearch: [
    { type: "client",  name: "Steve Larson", sub: "Today | 2 properties",    status: null       },
    { type: "job",     name: "Steve Larson", sub: "Today | $200 | Job #128", status: "upcoming" },
    { type: "invoice", name: "Steve Larson", sub: "Jun 03 | $200 | Services", status: "paid"   },
    { type: "client",  name: "Fredrico B",   sub: "May 28 | 2633 NE 14th",  status: null       },
    { type: "job",     name: "Fredrico B",   sub: "May 28 | $122 | Job #145", status: "late"   },
    { type: "client",  name: "Plumbing SFL", sub: "May 26 | 2 properties",   status: null       },
    { type: "job",     name: "Plumbing SFL", sub: "May 26 | $200 | Job #109", status: "upcoming"},
  ],
};

// ─── Reusable Components ──────────────────────────────────────────────────────

const StatusBadge = ({ status }) => {
  const cfg = {
    upcoming:   { bg: "#EBF5EE", color: "#3D7A4F", label: "Upcoming"    },
    late:       { bg: "#FDECEA", color: "#C0392B", label: "Late"        },
    paid:       { bg: "#1C2333", color: "#FFFFFF", label: "Paid"        },
    complete:   { bg: "#EBF5EE", color: "#3D7A4F", label: "Done"        },
    inprogress: { bg: "#D6B58A", color: "#1C2333", label: "In Progress" },
  };
  const { bg, color, label } = cfg[status] || { bg: "#1C2333", color: "#FFFFFF", label: status };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 10px", borderRadius: 100,
      fontSize: 11, fontWeight: 600, letterSpacing: ".3px",
      background: bg, color,
    }}>{label}</span>
  );
};

const PriorityBar = ({ priority }) => {
  const colors = { urgent: "#C0392B", vip: "#D6B58A", normal: "#3D7A4F" };
  return (
    <div style={{
      width: 4, borderRadius: 4, flexShrink: 0, alignSelf: "stretch",
      background: colors[priority] || "#3D7A4F",
    }} />
  );
};

const TechAvatar = ({ initials, color = "#5F667A" }) => (
  <div style={{
    width: 28, height: 28, borderRadius: "50%",
    background: color, color: "#FFFFFF",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 11, fontWeight: 700, border: "2px solid #FFFFFF",
    flexShrink: 0,
  }}>{initials}</div>
);

const WeekStrip = ({ days, activeDay, onDaySelect }) => (
  <div style={{ display: "flex", gap: 4, overflowX: "auto", padding: "4px 0", scrollbarWidth: "none" }}>
    {days.map((d) => (
      <button key={d.num}
        onClick={() => onDaySelect?.(d.num)}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "8px 10px", borderRadius: 12, cursor: "pointer",
          minWidth: 44, border: "none", fontFamily: "Inter, sans-serif",
          background: d.today ? "#1C2333" : "none",
          transition: "background .15s",
        }}>
        <span style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", color: d.today ? "#FFFFFF" : "#8A90A2" }}>{d.label}</span>
        <span style={{ fontSize: 16, fontWeight: 700, marginTop: 2,              color: d.today ? "#FFFFFF" : "#1C2333" }}>{d.num}</span>
        {d.hasDot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#D6B58A", marginTop: 4, display: "block" }} />}
      </button>
    ))}
  </div>
);

const KPIStrip = ({ kpis }) => (
  <div style={{ display: "flex", gap: 10 }}>
    {[
      { value: `$${kpis.weekRevenue}`, label: "Revenue this week", delta: `↑ ${kpis.weekRevenueDelta}%`, up: true },
      { value: kpis.weekJobs,          label: "Visits scheduled",  delta: `↑ ${kpis.weekJobsDelta}%`,   up: true },
    ].map((k, i) => (
      <div key={i} style={{ ...CARD, padding: 16, flex: 1 }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: "#1C2333" }}>{k.value}</div>
        <div style={{ fontSize: 12, color: "#8A90A2", marginTop: 2 }}>{k.label}</div>
        <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, color: k.up ? "#3D7A4F" : "#C0392B" }}>{k.delta}</div>
      </div>
    ))}
  </div>
);

const ToDoRow = ({ icon, label, sub, count, onClick }) => (
  <div onClick={onClick}
    style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", cursor: "pointer" }}>
    <div style={{ width: 40, height: 40, borderRadius: 12, background: "#EDEBE7",
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icon name={icon} size={18} color="#D6B58A" />
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: "#1C2333" }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: "#8A90A2", marginTop: 1 }}>{sub}</div>}
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {count && (
        <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px",
          borderRadius: 100, fontSize: 11, fontWeight: 600,
          background: "#FDECEA", color: "#C0392B" }}>{count}</span>
      )}
      <Icon name="chevRight" size={16} color="#8A90A2" />
    </div>
  </div>
);

// ─── Job Card ─────────────────────────────────────────────────────────────────
const JobCard = ({ job, onStart, onNavigate, onComplete, compact = false }) => {
  const [swiped, setSwiped] = useState(false);

  return (
    <div style={{ ...CARD, overflow: "hidden", position: "relative" }}>
      {swiped && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", zIndex: 1,
          background: "#3D7A4F", alignItems: "center", justifyContent: "flex-end",
          padding: "0 20px", borderRadius: 16,
        }}>
          <button onClick={() => { onComplete?.(job); setSwiped(false); }}
            style={{ background: "none", border: "none", color: "white", fontWeight: 700,
              fontSize: 15, display: "flex", alignItems: "center", gap: 6,
              cursor: "pointer", fontFamily: "Inter, sans-serif" }}>
            <Icon name="check" color="white" size={20} /> Mark Complete
          </button>
        </div>
      )}

      <div
        style={{ display: "flex", gap: 12, padding: compact ? "12px 14px" : "14px 16px",
          position: "relative", zIndex: 2, background: "#FFFFFF", borderRadius: 16 }}
        onClick={() => setSwiped(!swiped)}
      >
        <PriorityBar priority={job.priority} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1C2333" }}>{job.client}</div>
              <div style={{ fontSize: 12, color: "#8A90A2", marginTop: 2 }}>{job.time}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: "#1C2333" }}>${job.value}</span>
              <TechAvatar initials={job.tech.initials} color="#5F667A" />
            </div>
          </div>

          <div style={{ fontSize: 12, color: "#5F667A", marginTop: 4 }}>{job.address}</div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#8A90A2" }}>#{job.jobNumber}</span>
              <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#E6E6E6", display: "inline-block" }} />
              <span style={{ fontSize: 11, color: "#8A90A2" }}>{job.visitType}</span>
            </div>
            <StatusBadge status={job.status} />
          </div>

          {!swiped && (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button style={{ ...BTN_GHOST, fontSize: 12, padding: "7px 12px", gap: 4 }}
                onClick={(e) => { e.stopPropagation(); onNavigate?.(job); }}>
                <Icon name="nav" size={13} /> Navigate
              </button>
              <button style={{ ...BTN_PRIMARY, fontSize: 12, padding: "7px 12px", gap: 4 }}
                onClick={(e) => { e.stopPropagation(); onStart?.(job); }}>
                <Icon name="play" size={13} color="#FFFFFF" /> Start Job
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Bottom Navigation ────────────────────────────────────────────────────────
const BottomNav = ({ active, onChange }) => {
  const tabs = [
    { id: "home",      icon: "home",     label: "Home"      },
    { id: "schedule",  icon: "schedule", label: "Schedule"  },
    { id: "timesheet", icon: "clock",    label: "Timesheet" },
    { id: "search",    icon: "search",   label: "Search"    },
    { id: "more",      icon: "more",     label: "More"      },
  ];
  return (
    <nav style={{
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
      width: "100%", maxWidth: 430,
      background: "#FFFFFF", borderTop: "1px solid #E6E6E6",
      display: "flex", padding: "8px 0 16px", zIndex: 100,
    }}>
      {tabs.map(t => (
        <button key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            flex: 1, background: "none", border: "none",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            fontSize: 10, fontWeight: 500,
            color: active === t.id ? "#1C2333" : "#8A90A2",
            cursor: "pointer", fontFamily: "Inter, sans-serif", padding: "4px 0",
          }}>
          <Icon name={t.icon} size={22}
            color={active === t.id ? "#1C2333" : "#8A90A2"}
            strokeWidth={active === t.id ? 2.2 : 1.8} />
          {t.label}
        </button>
      ))}
    </nav>
  );
};

// ─── Screen: Home ─────────────────────────────────────────────────────────────
const HomeScreen = () => {
  const [activeRole, setActiveRole] = useState("tech");
  const [clockedIn,  setClockedIn]  = useState(false);
  const [elapsed,    setElapsed]    = useState(0);
  const [mapH,       setMapH]       = useState(360);

  useEffect(() => {
    if (!clockedIn) return;
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [clockedIn]);

  useEffect(() => {
    setMapH(Math.max(window.innerHeight * 0.58, 360));
  }, []);

  const fmtTime = (s) => {
    const h   = String(Math.floor(s / 3600)).padStart(2, "0");
    const m   = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    return `${h}:${m}:${sec}`;
  };

  const todayJobs = MOCK.jobs.filter(j => !j.time.startsWith("Fri"));

  return (
    <div style={{ overflowY: "auto", height: "100dvh", paddingBottom: 100, marginTop: -44 }}>

      {/* ── MAP HERO BLOCK — scrolls with the page ── */}
      {/* TODO: Replace map placeholder with Mapbox or Google Maps embed */}
      <div style={{ position: "relative", height: mapH, flexShrink: 0 }}>

        {/* Map background fills the entire block */}
        <div style={{
          position: "absolute", inset: 0,
          background: "#1B2537",
          backgroundImage: "radial-gradient(rgba(255,255,255,.08) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }} />

        {/* Pulsing location pin */}
        <div style={{
          position: "absolute", top: "45%", left: "50%",
          transform: "translate(-50%, -50%)",
          display: "flex", flexDirection: "column", alignItems: "center",
        }}>
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            width: 54, height: 54, borderRadius: "50%",
            background: "rgba(214,181,138,.22)",
            transform: "translate(-50%, -50%)",
            animation: "mapPulse 2s ease-out infinite",
          }} />
          <svg width="26" height="34" viewBox="0 0 26 34" fill="none">
            <path d="M13 0C5.82 0 0 5.82 0 13c0 9 11.38 19.84 12.31 20.72a1 1 0 001.38 0C14.62 32.84 26 22 26 13 26 5.82 20.18 0 13 0z" fill="#D6B58A"/>
            <circle cx="13" cy="13" r="4.5" fill="#1B2537"/>
          </svg>
        </div>

        {/* Gradient overlay — bottom 180px, smooth three-stop fade */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 180,
          background: "linear-gradient(to bottom, rgba(237,235,231,0) 0%, rgba(237,235,231,0.6) 40%, rgba(237,235,231,1) 100%)",
          pointerEvents: "none",
        }} />

        {/* Greeting — top-left, paddingTop 60 clears the status bar */}
        <div style={{
          position: "absolute", top: 0, left: 0,
          paddingTop: 60, paddingLeft: 20,
          zIndex: 1,
        }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.75)", fontWeight: 500 }}>
            {MOCK.today}
          </div>
          <h1 style={{
            fontSize: 26, fontWeight: 800, color: "#FFFFFF",
            marginTop: 4, lineHeight: 1.2, fontFamily: "Inter, sans-serif",
          }}>
            Good morning, Kevin
          </h1>
        </div>

        {/* Notification bell + spark — absolute top-right, position: absolute, top: 56, right: 16 */}
        <div style={{
          position: "absolute", top: 56, right: 16,
          display: "flex", gap: 10, zIndex: 1,
        }}>
          <div style={{ position: "relative" }}>
            <button style={{
              width: 40, height: 40, borderRadius: 12,
              background: "rgba(28,35,51,0.5)", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            }}>
              <Icon name="bell" size={20} color="#FFFFFF" />
            </button>
            <span style={{
              position: "absolute", top: -3, right: -3,
              width: 16, height: 16, borderRadius: "50%",
              background: "#C0392B", color: "white",
              fontSize: 9, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "2px solid #1B2537",
            }}>3</span>
          </div>
          <button style={{
            width: 40, height: 40, borderRadius: 12,
            background: "rgba(28,35,51,0.5)",
            border: "1.5px solid rgba(214,181,138,.38)",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>
            <Icon name="spark" size={18} color="#D6B58A" />
          </button>
        </div>
      </div>

      {/* ── CONTENT BELOW MAP — #EDEBE7 matches gradient end color exactly ── */}
      <div style={{ background: "#EDEBE7", marginTop: -32 }}>

        {/* 1. Role selector pills */}
        <div style={{ display: "flex", gap: 6, padding: "12px 16px 16px", flexWrap: "wrap" }}>
          {[
            { id: "tech",       label: "Technician" },
            { id: "dispatcher", label: "Dispatcher" },
            { id: "owner",      label: "Owner View" },
          ].map(r => (
            <button key={r.id}
              onClick={() => setActiveRole(r.id)}
              style={{
                padding: "6px 14px", borderRadius: 100,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                fontFamily: "Inter, sans-serif",
                background: activeRole === r.id ? "#1C2333" : "transparent",
                color:      activeRole === r.id ? "#FFFFFF"  : "#5F667A",
                border:     activeRole === r.id ? "1.5px solid #1C2333" : "1.5px solid #E6E6E6",
              }}>
              {r.label}
            </button>
          ))}
        </div>

        {/* 2. Clock-in card */}
        <div style={{ padding: "0 16px 20px" }}>
          <div style={{ ...CARD, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, color: "#8A90A2" }}>
                {clockedIn ? "Clocked in" : "Let's get started"}
              </div>
              {clockedIn && (
                <div style={{ fontSize: 20, fontWeight: 700, color: "#1C2333", marginTop: 2 }}>
                  {fmtTime(elapsed)}
                </div>
              )}
            </div>
            <button
              style={clockedIn ? { ...BTN_GHOST } : { ...BTN_CTA }}
              onClick={() => { setClockedIn(v => !v); if (clockedIn) setElapsed(0); }}>
              <Icon name={clockedIn ? "x" : "play"} size={16} color="#1C2333" />
              {clockedIn ? "Clock Out" : "Clock In"}
            </button>
          </div>
        </div>

        {/* 3. Today's Jobs */}
        <div style={{ padding: "0 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: "#1C2333" }}>Today · Jun 4</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#D6B58A" }}>View all</span>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: "#5F667A" }}>
              <strong style={{ color: "#1C2333" }}>{todayJobs.length} visits</strong> today
            </div>
            <span style={{ color: "#E6E6E6" }}>·</span>
            <div style={{ fontSize: 13, color: "#5F667A" }}>
              worth <strong style={{ color: "#3D7A4F" }}>${todayJobs.reduce((a, j) => a + j.value, 0)}</strong>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {todayJobs.map(job => (
              <JobCard
                key={job.id}
                job={job}
                onStart={(j)    => alert(`Starting: ${j.client}`)}
                onNavigate={(j) => alert(`Navigating to: ${j.address}`)}
                onComplete={(j) => alert(`Completed: ${j.client}`)}
              />
            ))}
          </div>

          <button style={{
            ...BTN_GHOST,
            width: "100%", justifyContent: "center", marginTop: 10,
            borderStyle: "dashed", borderColor: "#D6B58A",
            color: "#D6B58A", fontWeight: 600, fontSize: 14, padding: "14px",
          }}>
            <Icon name="plus" size={16} color="#D6B58A" /> Schedule a New Job
          </button>
        </div>

        {/* 4. This Week KPIs */}
        <div style={{ marginTop: 24, padding: "0 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <span style={{ fontSize: 17, fontWeight: 700, color: "#1C2333" }}>This week</span>
              <span style={{ fontSize: 12, color: "#8A90A2", marginLeft: 6 }}>Jun 1 – 7</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#D6B58A" }}>View timesheet</span>
          </div>
          <KPIStrip kpis={MOCK.kpis} />
        </div>

        {/* 5. To Do (dispatcher / owner) */}
        {(activeRole === "owner" || activeRole === "dispatcher") && (
          <div style={{ ...CARD, padding: "4px 16px", margin: "16px 16px 0" }}>
            <div style={{ paddingTop: 12, paddingBottom: 4 }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: "#1C2333" }}>To do</span>
            </div>
            <div style={{ height: 1, background: "#E6E6E6" }} />
            <ToDoRow icon="alert"  label="5 new requests"          sub="Awaiting assignment"          count="5" />
            <div style={{ height: 1, background: "#E6E6E6" }} />
            <ToDoRow icon="wrench" label="14 action required jobs" sub={`Worth $${MOCK.kpis.actionValue}`} />
          </div>
        )}

        {/* 6. Next Job Countdown (tech) */}
        {activeRole === "tech" && (
          <div style={{ ...CARD, padding: "14px 16px", margin: "16px 16px 0", background: "#1C2333", display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(214,181,138,.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="truck" size={22} color="#D6B58A" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "#8A90A2" }}>Next job in</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#FFFFFF" }}>3 hrs 9 min</div>
              <div style={{ fontSize: 12, color: "#8A90A2", marginTop: 1 }}>Steve Larson · 2:00 PM · 12 min drive</div>
            </div>
            <button style={{ ...BTN_GHOST, borderColor: "rgba(255,255,255,.2)", color: "#FFFFFF", padding: "8px 12px", fontSize: 13 }}>
              <Icon name="nav" size={14} color="#FFFFFF" /> Go
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Screen: Schedule ─────────────────────────────────────────────────────────
const ScheduleScreen = () => {
  const [view,      setView]      = useState("day");
  const [activeDay, setActiveDay] = useState(4);
  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

  return (
    <div style={{ overflowY: "auto", height: "calc(100dvh - 44px)" }}>
      <div style={{ padding: "16px 16px 0", background: "#FFFFFF" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button style={{ display: "flex", alignItems: "center", gap: 4, background: "none",
            border: "none", fontWeight: 700, fontSize: 16, color: "#1C2333",
            cursor: "pointer", fontFamily: "Inter, sans-serif" }}>
            June <Icon name="chevDown" size={16} color="#1C2333" />
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {["schedule", "filter"].map(n => (
              <button key={n} style={{ width: 36, height: 36, borderRadius: 10, background: "#EDEBE7",
                border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <Icon name={n} size={18} color="#1C2333" />
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", background: "#EDEBE7", borderRadius: 12, padding: 4, gap: 2 }}>
          {["day", "list", "map"].map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 10, border: "none",
                cursor: "pointer", fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 13,
                background: view === v ? "#FFFFFF" : "transparent",
                color:      view === v ? "#1C2333" : "#8A90A2",
                boxShadow:  view === v ? "0 1px 4px rgba(28,35,51,.08)" : "none",
                transition: "all .2s", textTransform: "capitalize",
              }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 12 }}>
          <WeekStrip days={MOCK.weekDays} activeDay={activeDay} onDaySelect={setActiveDay} />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 0 8px", borderTop: "1px solid #E6E6E6", marginTop: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#1C2333" }}>Kevin Caines</span>
          <span style={{ fontSize: 12, color: "#8A90A2" }}>0/1 complete</span>
        </div>
      </div>

      {view === "day" && (
        <div style={{ padding: "8px 16px 100px" }}>
          {hours.map(h => {
            const label = h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;
            const isJob = h === 14;
            return (
              <div key={h} style={{ display: "grid", gridTemplateColumns: "52px 1fr", minHeight: 60 }}>
                <div style={{ fontSize: 12, color: "#8A90A2", fontWeight: 500, padding: "8px 8px 0 0", textAlign: "right" }}>{label}</div>
                <div style={{ borderLeft: "1px solid #E6E6E6", padding: "4px 0 4px 12px" }}>
                  {isJob && (
                    <div className="fade-in" style={{ background: "#3D7A4F", borderRadius: 12, padding: "10px 14px", margin: "4px 0", cursor: "pointer" }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#FFFFFF" }}>Steve Larson</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,.8)", marginTop: 2 }}>Hollywood Beach Towers · $200</div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,.7)" }}>2:00 – 3:00 PM</span>
                        <TechAvatar initials="KC" color="rgba(255,255,255,.25)" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "list" && (
        <div style={{ padding: "12px 16px 100px", display: "flex", flexDirection: "column", gap: 10 }}>
          {MOCK.jobs.map(job => <JobCard key={job.id} job={job} compact />)}
        </div>
      )}

      {view === "map" && (
        <div style={{ height: "60vh", background: "#E6E6E6", borderRadius: 16,
          margin: 16, display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 8 }}>
          <Icon name="map" size={40} color="#8A90A2" />
          <span style={{ fontSize: 14, color: "#8A90A2" }}>Interactive route map</span>
          <span style={{ fontSize: 12, color: "#8A90A2", opacity: 0.7 }}>Connect to mapping API</span>
        </div>
      )}
    </div>
  );
};

// ─── Screen: Timesheet ────────────────────────────────────────────────────────
const TimesheetScreen = () => {
  const [activeDay, setActiveDay] = useState(4);
  const [clockedIn, setClockedIn] = useState(false);
  const [elapsed,   setElapsed]   = useState(0);

  useEffect(() => {
    if (!clockedIn) return;
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [clockedIn]);

  const fmtTime = (s) => {
    const h   = String(Math.floor(s / 3600)).padStart(2, "0");
    const m   = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    return `${h}:${m}:${sec}`;
  };

  const weekHours = [0, 0, 3.5, clockedIn ? elapsed / 3600 : 0, 0, 0, 0];
  const maxH = Math.max(...weekHours, 1);

  return (
    <div style={{ overflowY: "auto", height: "calc(100dvh - 44px)" }}>
      <div style={{ padding: "16px 16px 0", background: "#FFFFFF" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button style={{ display: "flex", alignItems: "center", gap: 4, background: "none",
            border: "none", fontWeight: 700, fontSize: 16, color: "#1C2333",
            cursor: "pointer", fontFamily: "Inter, sans-serif" }}>
            June <Icon name="chevDown" size={16} color="#1C2333" />
          </button>
        </div>

        <WeekStrip days={MOCK.weekDays} activeDay={activeDay} onDaySelect={setActiveDay} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 0 12px", borderTop: "1px solid #E6E6E6", marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: "#8A90A2" }}>Tracked time</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1C2333" }}>
              {clockedIn ? fmtTime(elapsed) : "00:00"}
            </div>
          </div>
          <button
            style={clockedIn ? { ...BTN_GHOST } : { ...BTN_PRIMARY }}
            onClick={() => { setClockedIn(v => !v); if (clockedIn) setElapsed(0); }}>
            <Icon name={clockedIn ? "x" : "play"} size={16} color={clockedIn ? "#1C2333" : "#FFFFFF"} />
            {clockedIn ? "Clock Out" : "Clock In"}
          </button>
        </div>
      </div>

      <div style={{ margin: "16px 16px 0" }}>
        <div style={{ ...CARD, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1C2333", marginBottom: 14 }}>Hours this week</div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 60 }}>
            {weekHours.map((h, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{
                  width: "100%", height: `${(h / maxH) * 52}px`,
                  background: MOCK.weekDays[i]?.today ? "#D6B58A" : h > 0 ? "#5F667A" : "#E6E6E6",
                  borderRadius: 6, transition: "height .3s ease", minHeight: h > 0 ? 6 : 3,
                }} />
                <span style={{ fontSize: 10, color: "#8A90A2" }}>{MOCK.weekDays[i]?.label}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: "#8A90A2" }}>Total: <strong style={{ color: "#1C2333" }}>3.5 hrs</strong></span>
            <span style={{ fontSize: 13, color: "#8A90A2" }}>Est. earnings: <strong style={{ color: "#3D7A4F" }}>$0</strong></span>
          </div>
        </div>
      </div>

      {!clockedIn ? (
        <div style={{ margin: "16px", padding: "40px 20px", textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#E6E6E6",
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <Icon name="clock" size={28} color="#8A90A2" />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1C2333" }}>No time entries for today</div>
          <div style={{ fontSize: 13, color: "#8A90A2", marginTop: 4 }}>Tap Clock In above to start tracking</div>
        </div>
      ) : (
        <div style={{ margin: "16px", ...CARD }}>
          <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <div className="pulse-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: "#3D7A4F" }} />
            <span style={{ fontWeight: 600, fontSize: 14, color: "#1C2333" }}>Clocked in — {fmtTime(elapsed)}</span>
          </div>
          <div style={{ fontSize: 12, color: "#8A90A2", padding: "0 16px 14px" }}>Job: Steve Larson · #128</div>
        </div>
      )}
    </div>
  );
};

// ─── Screen: Search ───────────────────────────────────────────────────────────
const SearchScreen = () => {
  const [query,        setQuery]        = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  const filters = [
    { id: "all",      label: "All",      icon: "search"  },
    { id: "clients",  label: "Clients",  icon: "users"   },
    { id: "jobs",     label: "Jobs",     icon: "wrench"  },
    { id: "quotes",   label: "Quotes",   icon: "list"    },
    { id: "invoices", label: "Invoices", icon: "dollar"  },
  ];

  const typeIcon  = { client: "users", job: "wrench", invoice: "dollar" };
  const typeColor = { client: "#5F667A", job: "#3D7A4F", invoice: "#C47B2B" };

  const filtered = MOCK.recentSearch.filter(r => {
    const matchFilter =
      activeFilter === "all" ||
      (activeFilter === "clients"  && r.type === "client")  ||
      (activeFilter === "jobs"     && r.type === "job")     ||
      (activeFilter === "invoices" && r.type === "invoice");
    const matchQuery = !query || r.name.toLowerCase().includes(query.toLowerCase());
    return matchFilter && matchQuery;
  });

  return (
    <div style={{ overflowY: "auto", height: "calc(100dvh - 44px)", padding: "0 0 100px" }}>
      <div style={{ padding: "16px 16px 0", background: "#FFFFFF" }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: "#1C2333", marginBottom: 12 }}>Search</div>

        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}>
            <Icon name="search" size={18} color="#8A90A2" />
          </div>
          <input
            style={{
              width: "100%", background: "#EDEBE7",
              border: "1.5px solid #E6E6E6", borderRadius: 12,
              padding: "12px 16px 12px 44px", fontSize: 15,
              fontFamily: "Inter, sans-serif", color: "#1C2333",
              outline: "none", boxSizing: "border-box",
            }}
            placeholder="Search clients, jobs, invoices..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "12px 0", scrollbarWidth: "none" }}>
          {filters.map(f => (
            <button key={f.id} onClick={() => setActiveFilter(f.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 100, whiteSpace: "nowrap",
                border: "none", cursor: "pointer", fontFamily: "Inter, sans-serif",
                fontSize: 13, fontWeight: 600,
                background: activeFilter === f.id ? "#1C2333" : "#EDEBE7",
                color:      activeFilter === f.id ? "#FFFFFF"  : "#5F667A",
                transition: "all .2s",
              }}>
              <Icon name={f.icon} size={13} color={activeFilter === f.id ? "#FFFFFF" : "#5F667A"} />
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "8px 16px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#8A90A2",
          textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
          {query ? "Results" : "Recently active"}
        </div>

        <div style={{ ...CARD, overflow: "hidden" }}>
          {filtered.map((item, i) => (
            <div key={i}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", cursor: "pointer" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "#EDEBE7",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon name={typeIcon[item.type] || "search"} size={16} color={typeColor[item.type] || "#8A90A2"} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#1C2333" }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: "#8A90A2", marginTop: 1,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.sub}</div>
                </div>
                {item.status && <StatusBadge status={item.status} />}
              </div>
              {i < filtered.length - 1 && <div style={{ height: 1, background: "#E6E6E6", marginLeft: 64 }} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Screen: More ─────────────────────────────────────────────────────────────
const MoreScreen = () => {
  const quickActions = [
    { icon: "payment",  label: "Payments"            },
    { icon: "settings", label: "Apps & integrations" },
    { icon: "flag",     label: "Marketing"           },
  ];
  const listItems = [
    { icon: "phone",    label: "Support"         },
    { icon: "dollar",   label: "Subscription"    },
    { icon: "spark",    label: "Product updates" },
    { icon: "star",     label: "Refer a friend"  },
    { icon: "alert",    label: "About"           },
  ];
  const accountItems = [
    { icon: "users",    label: "Profile"         },
    { icon: "users",    label: "Manage team"     },
    { icon: "schedule", label: "Company details" },
    { icon: "filter",   label: "Preferences"     },
  ];

  const ListRow = ({ icon, label, last = false }) => (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", cursor: "pointer" }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "#EDEBE7",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name={icon} size={18} color="#5F667A" />
        </div>
        <span style={{ fontWeight: 500, fontSize: 15, color: "#1C2333", flex: 1 }}>{label}</span>
        <Icon name="chevRight" size={16} color="#8A90A2" />
      </div>
      {!last && <div style={{ height: 1, background: "#E6E6E6", marginLeft: 66 }} />}
    </>
  );

  return (
    <div style={{ overflowY: "auto", height: "calc(100dvh - 44px)", padding: "0 16px 100px" }}>
      <div style={{ paddingTop: 16, paddingBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: "#1C2333" }}>More</div>
        <div style={{ fontSize: 12, color: "#8A90A2", marginTop: 2 }}>KMC Mobile Detailing LLC</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {quickActions.map((a, i) => (
          <div key={i} style={{ ...CARD, padding: 16, cursor: "pointer", gridColumn: i === 2 ? "1 / 2" : "auto" }}>
            <Icon name={a.icon} size={22} color="#1C2333" />
            <div style={{ fontWeight: 600, fontSize: 14, color: "#1C2333", marginTop: 8 }}>{a.label}</div>
          </div>
        ))}
      </div>

      <div style={{ ...CARD, overflow: "hidden", marginBottom: 16 }}>
        {listItems.map((item, i) => (
          <ListRow key={i} icon={item.icon} label={item.label} last={i === listItems.length - 1} />
        ))}
      </div>

      <div style={{ ...CARD, overflow: "hidden", marginBottom: 16 }}>
        {accountItems.map((item, i) => (
          <ListRow key={i} icon={item.icon} label={item.label} last={i === accountItems.length - 1} />
        ))}
      </div>

      <div style={{ ...CARD, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", cursor: "pointer" }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#FDECEA",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="x" size={18} color="#C0392B" />
          </div>
          <span style={{ fontWeight: 600, fontSize: 15, color: "#C0392B", flex: 1 }}>Logout</span>
        </div>
      </div>

      <div style={{ textAlign: "center", padding: "20px 0 4px" }}>
        <div style={{ fontSize: 11, color: "#8A90A2" }}>FieldCore™ v1.0.0 · KMC Mobile Detailing LLC</div>
      </div>
    </div>
  );
};

// ─── App Shell ────────────────────────────────────────────────────────────────
export default function MobileDemo() {
  const [activeTab, setActiveTab] = useState("home");

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Syne:wght@800&display=swap";
    document.head.appendChild(link);
  }, []);

  const screens = {
    home:      <HomeScreen />,
    schedule:  <ScheduleScreen />,
    timesheet: <TimesheetScreen />,
    search:    <SearchScreen />,
    more:      <MoreScreen />,
  };

  return (
    <>
      <GlobalStyle />
      <div style={{
        maxWidth: 430, margin: "0 auto",
        minHeight: "100dvh", background: "#EDEBE7",
        position: "relative", overflowX: "hidden",
        fontFamily: "Inter, sans-serif",
      }}>
        {/* Status bar */}
        <div style={{
          height: 44, display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "0 20px",
          background: "#1C2333", flexShrink: 0,
        }}>
          <span style={{ color: "#FFFFFF", fontSize: 13, fontWeight: 700, fontFamily: "Inter, sans-serif" }}>
            10:51
          </span>
          <div style={{
            fontFamily: "'Syne', 'Arial Black', sans-serif",
            fontWeight: 800, letterSpacing: "1.5px",
            color: "#FFFFFF", fontSize: 14, textTransform: "uppercase",
          }}>
            FIELDCORE<sup style={{ color: "#D6B58A", fontSize: 9, verticalAlign: "super" }}>™</sup>
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <Icon name="wifi"    size={13} color="#FFFFFF" strokeWidth={1.5} />
            <Icon name="battery" size={14} color="#FFFFFF" strokeWidth={1.5} />
          </div>
        </div>

        {screens[activeTab]}

        {/* FAB */}
        <button
          style={{
            position: "fixed", bottom: 80,
            right: "calc(50% - 215px + 16px)",
            width: 52, height: 52, borderRadius: "50%",
            background: "#1C2333", color: "#FFFFFF",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 20px rgba(28,35,51,.3)",
            zIndex: 90,
          }}
          aria-label="Add new">
          <Icon name="plus" size={24} color="#FFFFFF" />
        </button>

        <BottomNav active={activeTab} onChange={setActiveTab} />
      </div>
    </>
  );
}
