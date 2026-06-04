import { useState, useEffect } from "react";

// ─── Brand Tokens ─────────────────────────────────────────────────────────────
const BRAND = {
  navy:      "#1C2333",
  sand:      "#D6B58A",
  deepSlate: "#5F667A",
  steel:     "#8A90A2",
  offWhite:  "#EDEBE7",
  white:     "#FFFFFF",
  lightGray: "#E6E6E6",
  green:     "#3D7A4F",
  greenLight:"#EBF5EE",
  amber:     "#C47B2B",
  amberLight:"#FEF3E2",
  red:       "#C0392B",
  redLight:  "#FDECEA",
};

// ─── Global Styles ────────────────────────────────────────────────────────────
const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Syne:wght@800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    body { font-family: 'Inter', sans-serif; background: #EDEBE7; color: #1C2333; }
    ::-webkit-scrollbar { width: 0; }

    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
    @keyframes pulse   { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

    .slide-up  { animation: slideUp 0.35s cubic-bezier(.22,.61,.36,1) both; }
    .fade-in   { animation: fadeIn  0.25s ease both; }
    .pulse-dot { animation: pulse   1.5s ease-in-out infinite; }

    .card {
      background: #FFFFFF;
      border-radius: 16px;
      box-shadow: 0 1px 4px rgba(28,35,51,.06), 0 4px 16px rgba(28,35,51,.04);
    }

    .badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 10px; border-radius: 100px;
      font-size: 11px; font-weight: 600; letter-spacing: .3px;
    }
    .badge-green   { background: #EBF5EE; color: #3D7A4F; }
    .badge-amber   { background: #FEF3E2; color: #C47B2B; }
    .badge-red     { background: #FDECEA; color: #C0392B; }
    .badge-navy    { background: #1C2333; color: #FFFFFF; }
    .badge-sand    { background: #D6B58A; color: #1C2333; }

    .btn-primary {
      background: #1C2333; color: #FFFFFF;
      border: none; border-radius: 12px;
      padding: 13px 20px; font-size: 15px; font-weight: 600;
      font-family: 'Inter', sans-serif;
      cursor: pointer; display: flex; align-items: center; gap: 8px;
      transition: transform .15s;
    }
    .btn-primary:active { transform: scale(0.97); }

    .btn-cta {
      background: #D6B58A; color: #1C2333;
      border: none; border-radius: 12px;
      padding: 13px 20px; font-size: 15px; font-weight: 700;
      font-family: 'Inter', sans-serif;
      cursor: pointer; display: flex; align-items: center; gap: 8px;
      transition: transform .15s;
    }
    .btn-cta:active { transform: scale(0.97); }

    .btn-ghost {
      background: transparent; color: #1C2333;
      border: 1.5px solid #E6E6E6; border-radius: 12px;
      padding: 11px 18px; font-size: 14px; font-weight: 500;
      font-family: 'Inter', sans-serif;
      cursor: pointer; display: flex; align-items: center; gap: 6px;
      transition: background .15s;
    }
    .btn-ghost:active { background: #EDEBE7; }

    .wordmark {
      font-family: 'Syne', 'Arial Black', sans-serif;
      font-weight: 800; letter-spacing: 1.5px;
      color: #FFFFFF; font-size: 20px; text-transform: uppercase;
    }
    .wordmark-tm { color: #D6B58A; font-size: 10px; vertical-align: super; }

    .status-bar {
      height: 44px; display: flex; align-items: center;
      justify-content: space-between;
      padding: 0 20px; background: #1C2333;
    }

    .bottom-nav {
      position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);
      width: 100%; max-width: 430px;
      background: #FFFFFF; border-top: 1px solid #E6E6E6;
      display: flex; padding: 8px 0 16px; z-index: 100;
    }
    .bottom-nav button {
      flex: 1; background: none; border: none;
      display: flex; flex-direction: column; align-items: center; gap: 3px;
      font-size: 10px; font-weight: 500; color: #8A90A2;
      cursor: pointer; font-family: 'Inter', sans-serif; padding: 4px 0;
    }
    .bottom-nav button.active { color: #1C2333; }

    .kpi-card {
      background: #FFFFFF; border-radius: 16px; padding: 16px; flex: 1;
      box-shadow: 0 1px 4px rgba(28,35,51,.06);
    }
    .kpi-value  { font-size: 26px; font-weight: 700; color: #1C2333; }
    .kpi-label  { font-size: 12px; color: #8A90A2; margin-top: 2px; }
    .kpi-delta  { font-size: 12px; font-weight: 600; margin-top: 4px; }
    .kpi-delta.up   { color: #3D7A4F; }
    .kpi-delta.down { color: #C0392B; }

    .job-status-bar {
      width: 4px; border-radius: 4px; flex-shrink: 0; align-self: stretch;
    }

    .role-pill {
      padding: 6px 14px; border-radius: 100px;
      font-size: 12px; font-weight: 600; cursor: pointer;
      border: 1.5px solid transparent; transition: all .2s;
      font-family: 'Inter', sans-serif;
    }
    .role-pill.active   { background: #1C2333; color: #FFFFFF; border-color: #1C2333; }
    .role-pill.inactive { background: transparent; color: #5F667A; border-color: #E6E6E6; }

    .tech-avatar {
      width: 28px; height: 28px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; border: 2px solid #FFFFFF;
    }

    .fab {
      position: fixed; bottom: 80px; right: calc(50% - 215px + 16px);
      width: 52px; height: 52px; border-radius: 50%;
      background: #1C2333; color: #FFFFFF;
      border: none; font-size: 26px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 20px rgba(28,35,51,.3);
      z-index: 90; transition: transform .15s;
    }
    .fab:active { transform: scale(0.92); }

    .divider { height: 1px; background: #E6E6E6; margin: 0; }

    .input-field {
      width: 100%; background: #EDEBE7;
      border: 1.5px solid #E6E6E6; border-radius: 12px;
      padding: 12px 16px; font-size: 15px; font-family: 'Inter', sans-serif;
      color: #1C2333; outline: none; transition: border-color .2s;
    }
    .input-field:focus { border-color: #1C2333; }

    .timeline-row {
      display: grid; grid-template-columns: 52px 1fr;
      gap: 0; min-height: 60px;
    }
    .timeline-time {
      font-size: 12px; color: #8A90A2; font-weight: 500;
      padding: 8px 8px 0 0; text-align: right;
    }
    .timeline-content { border-left: 1px solid #E6E6E6; padding: 4px 0 4px 12px; }

    .section-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 12px;
    }
    .section-title  { font-size: 17px; font-weight: 700; color: #1C2333; }
    .section-action { font-size: 13px; font-weight: 600; color: #D6B58A; }

    .week-strip {
      display: flex; gap: 4px; overflow-x: auto;
      padding: 4px 0; scrollbar-width: none;
    }
    .week-day {
      display: flex; flex-direction: column; align-items: center;
      padding: 8px 10px; border-radius: 12px; cursor: pointer;
      min-width: 44px; transition: background .15s; border: none; background: none;
      font-family: 'Inter', sans-serif;
    }
    .week-day.today { background: #1C2333; }
    .week-day.today .wd-label,
    .week-day.today .wd-num { color: #FFFFFF; }
    .week-day .wd-label { font-size: 10px; font-weight: 500; color: #8A90A2; text-transform: uppercase; }
    .week-day .wd-num   { font-size: 16px; font-weight: 700; color: #1C2333; margin-top: 2px; }
    .week-day .wd-dot   { width: 5px; height: 5px; border-radius: 50%; background: #D6B58A; margin-top: 4px; }

    .notif-badge {
      position: absolute; top: -3px; right: -3px;
      width: 16px; height: 16px; border-radius: 50%;
      background: #C0392B; color: white;
      font-size: 9px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      border: 2px solid #FFFFFF;
    }

    .page {
      max-width: 430px; margin: 0 auto;
      min-height: 100dvh; background: #EDEBE7;
      position: relative; overflow-x: hidden;
    }

    .scroll-area {
      padding: 0 0 100px; overflow-y: auto; height: calc(100dvh - 44px);
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
    phone:     <><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 .96h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></>,
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
    { type: "client",  name: "Steve Larson",  sub: "Today | 2 properties",       status: null       },
    { type: "job",     name: "Steve Larson",  sub: "Today | $200 | Job #128",     status: "upcoming" },
    { type: "invoice", name: "Steve Larson",  sub: "Jun 03 | $200 | Services",    status: "paid"     },
    { type: "client",  name: "Fredrico B",    sub: "May 28 | 2633 NE 14th Ave",   status: null       },
    { type: "job",     name: "Fredrico B",    sub: "May 28 | $122 | Job #145",    status: "late"     },
    { type: "client",  name: "Plumbing SFL",  sub: "May 26 | 2 properties",       status: null       },
    { type: "job",     name: "Plumbing SFL",  sub: "May 26 | $200 | Job #109",    status: "upcoming" },
  ],
};

// ─── Reusable Components ──────────────────────────────────────────────────────

const StatusBadge = ({ status }) => {
  const map = {
    upcoming:   ["badge-green", "Upcoming"],
    late:       ["badge-red",   "Late"],
    paid:       ["badge-navy",  "Paid"],
    complete:   ["badge-green", "Done"],
    inprogress: ["badge-sand",  "In Progress"],
  };
  const [cls, label] = map[status] || ["badge-navy", status];
  return <span className={`badge ${cls}`}>{label}</span>;
};

const PriorityBar = ({ priority }) => {
  const colors = { urgent: "#C0392B", vip: "#D6B58A", normal: "#3D7A4F" };
  return <div className="job-status-bar" style={{ background: colors[priority] || "#3D7A4F" }} />;
};

const TechAvatar = ({ initials, color = "#5F667A" }) => (
  <div className="tech-avatar" style={{ background: color, color: "#FFFFFF" }}>
    {initials}
  </div>
);

const WeekStrip = ({ days, activeDay, onDaySelect }) => (
  <div className="week-strip">
    {days.map((d) => (
      <button key={d.num} className={`week-day ${d.today ? "today" : ""}`}
        onClick={() => onDaySelect?.(d.num)}>
        <span className="wd-label">{d.label}</span>
        <span className="wd-num">{d.num}</span>
        {d.hasDot && <span className="wd-dot" />}
      </button>
    ))}
  </div>
);

const KPIStrip = ({ kpis }) => (
  <div style={{ display: "flex", gap: 10 }}>
    <div className="kpi-card">
      <div className="kpi-value">${kpis.weekRevenue}</div>
      <div className="kpi-label">Revenue this week</div>
      <div className="kpi-delta up">↑ {kpis.weekRevenueDelta}%</div>
    </div>
    <div className="kpi-card">
      <div className="kpi-value">{kpis.weekJobs}</div>
      <div className="kpi-label">Visits scheduled</div>
      <div className="kpi-delta up">↑ {kpis.weekJobsDelta}%</div>
    </div>
  </div>
);

const ToDoRow = ({ icon, label, sub, count, onClick }) => (
  <div onClick={onClick}
    style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", cursor: "pointer" }}>
    <div style={{ width: 40, height: 40, borderRadius: 12, background: "#EDEBE7",
      display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={18} color="#D6B58A" />
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: "#1C2333" }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: "#8A90A2", marginTop: 1 }}>{sub}</div>}
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {count && <span className="badge badge-red">{count}</span>}
      <Icon name="chevRight" size={16} color="#8A90A2" />
    </div>
  </div>
);

// ─── Job Card ─────────────────────────────────────────────────────────────────
const JobCard = ({ job, onStart, onNavigate, onComplete, compact = false }) => {
  const [swiped, setSwiped] = useState(false);

  return (
    <div className="card" style={{ overflow: "hidden", position: "relative" }}>
      {swiped && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", zIndex: 1,
          background: "#3D7A4F", alignItems: "center", justifyContent: "flex-end",
          padding: "0 20px", borderRadius: 16,
        }}>
          <button onClick={() => { onComplete?.(job); setSwiped(false); }}
            style={{ background: "none", border: "none", color: "white", fontWeight: 700,
              fontSize: 15, display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
              fontFamily: "Inter" }}>
            <Icon name="check" color="white" size={20} /> Mark Complete
          </button>
        </div>
      )}

      <div
        style={{ display: "flex", gap: 12, padding: compact ? "12px 14px" : "14px 16px",
          position: "relative", zIndex: 2, background: "white", borderRadius: 16 }}
        onClick={() => setSwiped(!swiped)}
      >
        <PriorityBar priority={job.priority} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start",
            justifyContent: "space-between", gap: 8 }}>
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

          <div style={{ display: "flex", alignItems: "center",
            justifyContent: "space-between", marginTop: 8 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#8A90A2" }}>#{job.jobNumber}</span>
              <span style={{ width: 3, height: 3, borderRadius: "50%",
                background: "#E6E6E6", display: "inline-block" }} />
              <span style={{ fontSize: 11, color: "#8A90A2" }}>{job.visitType}</span>
            </div>
            <StatusBadge status={job.status} />
          </div>

          {!swiped && (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="btn-ghost"
                style={{ fontSize: 12, padding: "7px 12px", gap: 4 }}
                onClick={(e) => { e.stopPropagation(); onNavigate?.(job); }}>
                <Icon name="nav" size={13} /> Navigate
              </button>
              <button className="btn-primary"
                style={{ fontSize: 12, padding: "7px 12px", gap: 4 }}
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
    <nav className="bottom-nav">
      {tabs.map(t => (
        <button key={t.id} className={active === t.id ? "active" : ""}
          onClick={() => onChange(t.id)}>
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
  const [clockedIn, setClockedIn]   = useState(false);
  const [elapsed, setElapsed]       = useState(0);

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

  const todayJobs = MOCK.jobs.filter(j => !j.time.startsWith("Fri"));

  return (
    <div className="scroll-area" style={{ padding: "0 16px 100px" }}>
      <div style={{ paddingTop: 16, paddingBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, color: "#8A90A2", fontWeight: 500 }}>{MOCK.today}</div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "#1C2333", marginTop: 2, lineHeight: 1.2 }}>
              Good morning, Kevin
            </h1>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ position: "relative" }}>
              <button style={{ width: 40, height: 40, borderRadius: 12, background: "#FFFFFF",
                border: "none", display: "flex", alignItems: "center",
                justifyContent: "center", cursor: "pointer" }}>
                <Icon name="bell" size={20} color="#1C2333" />
              </button>
              <span className="notif-badge">3</span>
            </div>
            <button style={{ width: 40, height: 40, borderRadius: 12, background: "#1C2333",
              border: "none", display: "flex", alignItems: "center",
              justifyContent: "center", cursor: "pointer" }}>
              <Icon name="spark" size={18} color="#D6B58A" />
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
          {[
            { id: "tech",       label: "Technician"  },
            { id: "dispatcher", label: "Dispatcher"  },
            { id: "owner",      label: "Owner View"  },
          ].map(r => (
            <button key={r.id}
              className={`role-pill ${activeRole === r.id ? "active" : "inactive"}`}
              onClick={() => setActiveRole(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: "14px 16px", marginTop: 4,
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
        <button className={clockedIn ? "btn-ghost" : "btn-cta"}
          onClick={() => { setClockedIn(v => !v); if (clockedIn) setElapsed(0); }}>
          <Icon name={clockedIn ? "x" : "play"} size={16} color="#1C2333" />
          {clockedIn ? "Clock Out" : "Clock In"}
        </button>
      </div>

      <div style={{ marginTop: 20 }}>
        <div className="section-header">
          <span className="section-title">Today · Jun 4</span>
          <span className="section-action">View all</span>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: "#5F667A" }}>
            <strong style={{ color: "#1C2333" }}>{todayJobs.length} visits</strong> today
          </div>
          <span style={{ color: "#E6E6E6" }}>·</span>
          <div style={{ fontSize: 13, color: "#5F667A" }}>
            worth{" "}
            <strong style={{ color: "#3D7A4F" }}>
              ${todayJobs.reduce((a, j) => a + j.value, 0)}
            </strong>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {todayJobs.map((job, i) => (
            <div key={job.id} className="slide-up" style={{ animationDelay: `${i * 0.05}s` }}>
              <JobCard
                job={job}
                onStart={(j)    => alert(`Starting: ${j.client}`)}
                onNavigate={(j) => alert(`Navigating to: ${j.address}`)}
                onComplete={(j) => alert(`Completed: ${j.client}`)}
              />
            </div>
          ))}
        </div>

        <button className="btn-ghost" style={{
          width: "100%", justifyContent: "center", marginTop: 10,
          borderStyle: "dashed", borderColor: "#D6B58A",
          color: "#D6B58A", fontWeight: 600, fontSize: 14, padding: "14px",
        }}>
          <Icon name="plus" size={16} color="#D6B58A" /> Schedule a New Job
        </button>
      </div>

      <div style={{ marginTop: 24 }}>
        <div className="section-header">
          <div>
            <span className="section-title">This week</span>
            <span style={{ fontSize: 12, color: "#8A90A2", marginLeft: 6 }}>Jun 1 – 7</span>
          </div>
          <span className="section-action">View timesheet</span>
        </div>
        <KPIStrip kpis={MOCK.kpis} />
      </div>

      {(activeRole === "owner" || activeRole === "dispatcher") && (
        <div className="card" style={{ padding: "4px 16px", marginTop: 16 }}>
          <div style={{ paddingTop: 12, paddingBottom: 4 }}>
            <span className="section-title">To do</span>
          </div>
          <div className="divider" />
          <ToDoRow icon="alert" label="5 new requests" sub="Awaiting assignment" count="5" />
          <div className="divider" />
          <ToDoRow icon="wrench" label="14 action required jobs" sub={`Worth $${MOCK.kpis.actionValue}`} />
        </div>
      )}

      {activeRole === "tech" && (
        <div className="card" style={{
          padding: "14px 16px", marginTop: 16,
          background: "#1C2333", display: "flex", gap: 12, alignItems: "center",
        }}>
          <div style={{ width: 44, height: 44, borderRadius: 12,
            background: "rgba(214,181,138,.15)",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="truck" size={22} color="#D6B58A" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "#8A90A2" }}>Next job in</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#FFFFFF" }}>3 hrs 9 min</div>
            <div style={{ fontSize: 12, color: "#8A90A2", marginTop: 1 }}>
              Steve Larson · 2:00 PM · 12 min drive
            </div>
          </div>
          <button className="btn-ghost"
            style={{ borderColor: "rgba(255,255,255,.2)", color: "#FFFFFF",
              padding: "8px 12px", fontSize: 13 }}>
            <Icon name="nav" size={14} color="#FFFFFF" /> Go
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Screen: Schedule ─────────────────────────────────────────────────────────
const ScheduleScreen = () => {
  const [view, setView]           = useState("day");
  const [activeDay, setActiveDay] = useState(4);
  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

  return (
    <div className="scroll-area">
      <div style={{ padding: "16px 16px 0", background: "#FFFFFF" }}>
        <div style={{ display: "flex", alignItems: "center",
          justifyContent: "space-between", marginBottom: 12 }}>
          <button style={{ display: "flex", alignItems: "center", gap: 4, background: "none",
            border: "none", fontWeight: 700, fontSize: 16, color: "#1C2333",
            cursor: "pointer", fontFamily: "Inter" }}>
            June <Icon name="chevDown" size={16} color="#1C2333" />
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ width: 36, height: 36, borderRadius: 10, background: "#EDEBE7",
              border: "none", display: "flex", alignItems: "center",
              justifyContent: "center", cursor: "pointer" }}>
              <Icon name="schedule" size={18} color="#1C2333" />
            </button>
            <button style={{ width: 36, height: 36, borderRadius: 10, background: "#EDEBE7",
              border: "none", display: "flex", alignItems: "center",
              justifyContent: "center", cursor: "pointer" }}>
              <Icon name="filter" size={18} color="#1C2333" />
            </button>
          </div>
        </div>

        <div style={{ display: "flex", background: "#EDEBE7", borderRadius: 12, padding: 4, gap: 2 }}>
          {["day", "list", "map"].map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 10, border: "none",
                cursor: "pointer", fontFamily: "Inter", fontWeight: 600, fontSize: 13,
                background: view === v ? "#FFFFFF" : "transparent",
                color: view === v ? "#1C2333" : "#8A90A2",
                boxShadow: view === v ? "0 1px 4px rgba(28,35,51,.08)" : "none",
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
              <div key={h} className="timeline-row">
                <div className="timeline-time">{label}</div>
                <div className="timeline-content">
                  {isJob && (
                    <div className="card fade-in"
                      style={{ background: "#3D7A4F", borderRadius: 12,
                        padding: "10px 14px", margin: "4px 0", cursor: "pointer" }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#FFFFFF" }}>Steve Larson</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,.8)", marginTop: 2 }}>
                        Hollywood Beach Towers · $200
                      </div>
                      <div style={{ display: "flex", alignItems: "center",
                        justifyContent: "space-between", marginTop: 6 }}>
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
  const [elapsed, setElapsed]     = useState(0);

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
    <div className="scroll-area">
      <div style={{ padding: "16px 16px 0", background: "#FFFFFF" }}>
        <div style={{ display: "flex", alignItems: "center",
          justifyContent: "space-between", marginBottom: 12 }}>
          <button style={{ display: "flex", alignItems: "center", gap: 4, background: "none",
            border: "none", fontWeight: 700, fontSize: 16, color: "#1C2333",
            cursor: "pointer", fontFamily: "Inter" }}>
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
          <button className={clockedIn ? "btn-ghost" : "btn-primary"}
            onClick={() => { setClockedIn(v => !v); if (clockedIn) setElapsed(0); }}
            style={{ gap: 8 }}>
            <Icon name={clockedIn ? "x" : "play"} size={16}
              color={clockedIn ? "#1C2333" : "#FFFFFF"} />
            {clockedIn ? "Clock Out" : "Clock In"}
          </button>
        </div>
      </div>

      <div style={{ margin: "16px 16px 0" }}>
        <div className="card" style={{ padding: "16px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1C2333", marginBottom: 14 }}>
            Hours this week
          </div>
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
            <span style={{ fontSize: 13, color: "#8A90A2" }}>
              Total: <strong style={{ color: "#1C2333" }}>3.5 hrs</strong>
            </span>
            <span style={{ fontSize: 13, color: "#8A90A2" }}>
              Est. earnings: <strong style={{ color: "#3D7A4F" }}>$0</strong>
            </span>
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
        <div style={{ margin: "16px" }} className="card">
          <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <div className="pulse-dot"
              style={{ width: 8, height: 8, borderRadius: "50%", background: "#3D7A4F" }} />
            <span style={{ fontWeight: 600, fontSize: 14, color: "#1C2333" }}>
              Clocked in — {fmtTime(elapsed)}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "#8A90A2", padding: "0 16px 14px" }}>
            Job: Steve Larson · #128
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Screen: Search ───────────────────────────────────────────────────────────
const SearchScreen = () => {
  const [query, setQuery]               = useState("");
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
    <div className="scroll-area" style={{ padding: "0 0 100px" }}>
      <div style={{ padding: "16px 16px 0", background: "#FFFFFF" }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: "#1C2333", marginBottom: 12 }}>Search</div>

        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}>
            <Icon name="search" size={18} color="#8A90A2" />
          </div>
          <input
            className="input-field"
            style={{ paddingLeft: 44 }}
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
                border: "none", cursor: "pointer", fontFamily: "Inter",
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

        <div className="card" style={{ overflow: "hidden" }}>
          {filtered.map((item, i) => (
            <div key={i}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", cursor: "pointer" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "#EDEBE7",
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={typeIcon[item.type] || "search"} size={16}
                    color={typeColor[item.type] || "#8A90A2"} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#1C2333" }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: "#8A90A2", marginTop: 1,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.sub}
                  </div>
                </div>
                {item.status && <StatusBadge status={item.status} />}
              </div>
              {i < filtered.length - 1 && <div className="divider" style={{ marginLeft: 64 }} />}
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
      <div style={{ display: "flex", alignItems: "center", gap: 14,
        padding: "14px 16px", cursor: "pointer" }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "#EDEBE7",
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={18} color="#5F667A" />
        </div>
        <span style={{ fontWeight: 500, fontSize: 15, color: "#1C2333", flex: 1 }}>{label}</span>
        <Icon name="chevRight" size={16} color="#8A90A2" />
      </div>
      {!last && <div className="divider" style={{ marginLeft: 66 }} />}
    </>
  );

  return (
    <div className="scroll-area" style={{ padding: "0 16px 100px" }}>
      <div style={{ paddingTop: 16, paddingBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: "#1C2333" }}>More</div>
        <div style={{ fontSize: 12, color: "#8A90A2", marginTop: 2 }}>KMC Mobile Detailing LLC</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {quickActions.map((a, i) => (
          <div key={i} className="card"
            style={{ padding: "16px", cursor: "pointer", gridColumn: i === 2 ? "1 / 2" : "auto" }}>
            <Icon name={a.icon} size={22} color="#1C2333" />
            <div style={{ fontWeight: 600, fontSize: 14, color: "#1C2333", marginTop: 8 }}>{a.label}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ overflow: "hidden", marginBottom: 16 }}>
        {listItems.map((item, i) => (
          <ListRow key={i} icon={item.icon} label={item.label} last={i === listItems.length - 1} />
        ))}
      </div>

      <div className="card" style={{ overflow: "hidden", marginBottom: 16 }}>
        {accountItems.map((item, i) => (
          <ListRow key={i} icon={item.icon} label={item.label} last={i === accountItems.length - 1} />
        ))}
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14,
          padding: "14px 16px", cursor: "pointer" }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#FDECEA",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="x" size={18} color="#C0392B" />
          </div>
          <span style={{ fontWeight: 600, fontSize: 15, color: "#C0392B", flex: 1 }}>Logout</span>
        </div>
      </div>

      <div style={{ textAlign: "center", padding: "20px 0 4px" }}>
        <div style={{ fontSize: 11, color: "#8A90A2" }}>
          FieldCore™ v1.0.0 · KMC Mobile Detailing LLC
        </div>
      </div>
    </div>
  );
};

// ─── App Shell ────────────────────────────────────────────────────────────────
export default function MobileDemo() {
  const [activeTab, setActiveTab] = useState("home");

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
      <div className="page">
        <div className="status-bar">
          <span style={{ color: "#FFFFFF", fontSize: 13, fontWeight: 700 }}>10:51</span>
          <div className="wordmark" style={{ fontSize: 14 }}>
            FIELDCORE<sup className="wordmark-tm">™</sup>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Icon name="more" size={14} color="#FFFFFF" />
          </div>
        </div>

        {screens[activeTab]}

        <button className="fab" aria-label="Add new">
          <Icon name="plus" size={24} color="#FFFFFF" />
        </button>

        <BottomNav active={activeTab} onChange={setActiveTab} />
      </div>
    </>
  );
}
