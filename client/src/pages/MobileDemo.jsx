import { useState, useEffect } from "react";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const N  = "#1C2333";  // navy
const S  = "#D6B58A";  // sand/gold
const CR = "#EDEBE7";  // cream
const SL = "#5F667A";  // slate
const ST = "#8A90A2";  // steel
const W  = "#FFFFFF";  // white
const LG = "#E6E6E6";  // light gray

const CARD = {
  background: W,
  borderRadius: 16,
  boxShadow: "0 1px 4px rgba(28,35,51,.06), 0 4px 16px rgba(28,35,51,.04)",
};
const BTN_PRIMARY = {
  background: N, color: W, border: "none", borderRadius: 12,
  padding: "13px 20px", fontSize: 15, fontWeight: 600,
  fontFamily: "Inter, sans-serif", cursor: "pointer",
  display: "flex", alignItems: "center", gap: 8,
};
const BTN_CTA = {
  background: S, color: N, border: "none", borderRadius: 12,
  padding: "13px 20px", fontSize: 15, fontWeight: 700,
  fontFamily: "Inter, sans-serif", cursor: "pointer",
  display: "flex", alignItems: "center", gap: 8,
};
const BTN_GHOST = {
  background: "transparent", color: N, border: "1.5px solid " + LG, borderRadius: 12,
  padding: "11px 18px", fontSize: 14, fontWeight: 500,
  fontFamily: "Inter, sans-serif", cursor: "pointer",
  display: "flex", alignItems: "center", gap: 6,
};

// ─── Global Styles ────────────────────────────────────────────────────────────
const GlobalStyle = () => (
  <style>{`
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    body { font-family: 'Inter', sans-serif; background: #EDEBE7; color: #1C2333; }
    ::-webkit-scrollbar { width: 0; }
    @keyframes slideUp    { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes fadeIn     { from { opacity: 0; } to { opacity: 1; } }
    @keyframes fabSlideUp { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  `}</style>
);

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 22, color = "currentColor", strokeWidth = 1.8 }) => {
  const paths = {
    home:          <><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></>,
    schedule:      <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>,
    briefcase:     <><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></>,
    messageSquare: <><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></>,
    user:          <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    users:         <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></>,
    clock:         <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></>,
    search:        <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></>,
    bell:          <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></>,
    nav:           <><polygon points="3 11 22 2 13 21 11 13 3 11"/></>,
    send:          <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    check:         <><polyline points="20 6 9 17 4 12"/></>,
    plus:          <><path d="M12 5v14M5 12h14"/></>,
    chevRight:     <><polyline points="9 18 15 12 9 6"/></>,
    chevLeft:      <><polyline points="15 18 9 12 15 6"/></>,
    chevDown:      <><polyline points="6 9 12 15 18 9"/></>,
    play:          <><polygon points="5 3 19 12 5 21 5 3"/></>,
    square:        <><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></>,
    dollar:        <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>,
    phone:         <><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 .96h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6z"/></>,
    phoneMissed:   <><line x1="23" y1="1" x2="17" y2="7"/><line x1="17" y1="1" x2="23" y2="7"/><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 .96h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6z"/></>,
    alert:         <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    truck:         <><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>,
    camera:        <><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></>,
    pen:           <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    fileText:      <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
    fingerprint:   <><path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 018 4"/><path d="M5 19.5C5.5 18 6 15 6 12c0-3 2-5.5 6-6"/><path d="M17.5 21C16.5 20 16 19 16 17c0-2 1.5-3.5 3-4"/><path d="M22 22c0-3-1-5-3-8"/><path d="M12 6c2 0 4 1.5 4 4v1c0 2 1 3 2 4"/><path d="M10 16c0 2-1 3-2 4"/><path d="M12 10c0 3-1 6-3 8"/></>,
    key:           <><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></>,
    star:          <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    wrench:        <><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></>,
    x:             <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    list:          <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>,
    filter:        <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    settings:      <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></>,
    payment:       <><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
    flag:          <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></>,
    map:           <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></>,
    wifi:          <><path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01"/></>,
    battery:       <><rect x="2" y="7" width="18" height="10" rx="2"/><line x1="22" y1="11" x2="22" y2="13"/></>,
    spark:         <><path d="M12 2l2.4 7.2H22l-6.2 4.5 2.4 7.2L12 16.4 5.8 20.9l2.4-7.2L2 9.2h7.6L12 2z"/></>,
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
  user: { name: "Kevin Caines", initials: "KC", phone: "+1 (954) 555-0101", company: "KMC Mobile Detailing LLC" },
  today: "Thursday, June 5th",
  jobs: [
    {
      id: 1, client: "Steve Larson",
      address: "301 Harrison St, Hollywood Beach",
      time: "2:00 PM – 3:00 PM", value: 200, status: "upcoming",
      label: "Full Detail", priority: "normal", jobNumber: 128, visitType: "One-time",
    },
    {
      id: 2, client: "Fredrico B",
      address: "2633 NE 14th Ave, Fort Lauderdale",
      time: "4:30 PM – 5:30 PM", value: 122, status: "late",
      label: "Interior Detail", priority: "urgent", jobNumber: 145, visitType: "Recurring",
    },
    {
      id: 3, client: "Plumbing SFL",
      address: "201 N Federal Hwy, Fort Lauderdale",
      time: "Fri 9:00 AM – 10:00 AM", value: 200, status: "upcoming",
      label: "Fleet Wash", priority: "vip", jobNumber: 109, visitType: "Recurring",
    },
    {
      id: 4, client: "Maria Torres",
      address: "8234 SW 152nd Ave, Miami",
      time: "Fri 1:00 PM – 2:30 PM", value: 175, status: "upcoming",
      label: "Full Detail", priority: "normal", jobNumber: 132, visitType: "One-time",
    },
  ],
  weekDays: [
    { label: "M", num: 2,  hasDot: false },
    { label: "T", num: 3,  hasDot: false },
    { label: "W", num: 4,  hasDot: true  },
    { label: "T", num: 5,  hasDot: true,  today: true },
    { label: "F", num: 6,  hasDot: true  },
    { label: "S", num: 7,  hasDot: false },
    { label: "S", num: 8,  hasDot: false },
  ],
  messages: [
    { name: "Steve Larson", preview: "Sounds great, see you then!",        time: "2:15 PM",   unread: 0, via: "sms"      },
    { name: "Fredrico B",   preview: "Can you give me an ETA?",            time: "11:32 AM",  unread: 2, via: "sms"      },
    { name: "Plumbing SFL", preview: "Fleet wash confirmed for Friday.",   time: "Yesterday", unread: 0, via: "sendblue" },
    { name: "Maria Torres", preview: "Thank you, it looks amazing!",       time: "Mon",       unread: 0, via: "sms"      },
  ],
  calls: [
    { name: "Steve Larson",   time: "Today 2:04 PM",     duration: "3m 21s", type: "outgoing" },
    { name: "Fredrico B",     time: "Today 9:15 AM",     duration: null,     type: "missed"   },
    { name: "(954) 555-0129", time: "Yesterday 4:30 PM", duration: "1m 05s", type: "incoming" },
    { name: "Maria Torres",   time: "Mon 11:00 AM",       duration: "2m 14s", type: "outgoing" },
  ],
};

// ─── Shared Components ────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const cfg = {
    upcoming:   { bg: "#EBF5EE", color: "#3D7A4F", label: "Upcoming"    },
    late:       { bg: "#FDECEA", color: "#C0392B", label: "Late"        },
    paid:       { bg: N,         color: W,          label: "Paid"        },
    complete:   { bg: "#EBF5EE", color: "#3D7A4F", label: "Done"        },
    inprogress: { bg: "#FEF3E2", color: "#C47B2B", label: "In Progress" },
  };
  const { bg, color, label } = cfg[status] || { bg: N, color: W, label: status };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "3px 10px", borderRadius: 100,
      fontSize: 11, fontWeight: 600, letterSpacing: ".3px",
      background: bg, color,
    }}>{label}</span>
  );
};

const PriorityBar = ({ priority }) => {
  const colors = { urgent: "#C0392B", vip: S, normal: "#3D7A4F" };
  return (
    <div style={{
      width: 4, borderRadius: 4, flexShrink: 0, alignSelf: "stretch",
      background: colors[priority] || "#3D7A4F",
    }} />
  );
};

const Avatar = ({ initials, size = 40, bg = SL }) => (
  <div style={{
    width: size, height: size, borderRadius: "50%",
    background: bg, color: W,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: Math.round(size * 0.33), fontWeight: 700, flexShrink: 0,
  }}>{initials}</div>
);

const WeekStrip = ({ days, activeDay, onDaySelect }) => (
  <div style={{ display: "flex", gap: 4, overflowX: "auto", padding: "4px 0", scrollbarWidth: "none" }}>
    {days.map((d) => (
      <button key={d.num} onClick={() => onDaySelect?.(d.num)}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "8px 10px", borderRadius: 12, cursor: "pointer",
          minWidth: 44, border: "none", fontFamily: "Inter, sans-serif",
          background: d.today ? N : "none", transition: "background .15s",
        }}>
        <span style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", color: d.today ? W : ST }}>{d.label}</span>
        <span style={{ fontSize: 16, fontWeight: 700, marginTop: 2, color: d.today ? W : N }}>{d.num}</span>
        {d.hasDot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: S, marginTop: 4, display: "block" }} />}
      </button>
    ))}
  </div>
);

// ─── Job Card ─────────────────────────────────────────────────────────────────
const JobCard = ({ job, onTap }) => (
  <div style={{ ...CARD, overflow: "hidden", cursor: "pointer" }} onClick={() => onTap?.(job)}>
    <div style={{ display: "flex", gap: 12, padding: "14px 16px" }}>
      <PriorityBar priority={job.priority} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: N }}>{job.client}</div>
            <div style={{ fontSize: 12, color: ST, marginTop: 2 }}>{job.time}</div>
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, color: N, flexShrink: 0 }}>${job.value}</span>
        </div>
        <div style={{ fontSize: 12, color: SL, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {job.address}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: ST }}>#{job.jobNumber}</span>
            <span style={{ width: 3, height: 3, borderRadius: "50%", background: LG, display: "inline-block" }} />
            <span style={{ fontSize: 11, color: ST }}>{job.label}</span>
          </div>
          <StatusBadge status={job.status} />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", flexShrink: 0, paddingLeft: 4 }}>
        <Icon name="chevRight" size={16} color={ST} />
      </div>
    </div>
  </div>
);

// ─── Job Detail ───────────────────────────────────────────────────────────────
const JobDetailScreen = ({ job, onBack }) => {
  const [jobStarted,   setJobStarted]   = useState(false);
  const [noShowActive, setNoShowActive] = useState(false);
  const [noShowSecs,   setNoShowSecs]   = useState(30 * 60);
  const [completed,    setCompleted]    = useState(false);
  const [tipSent,      setTipSent]      = useState(false);

  useEffect(() => {
    if (!noShowActive || noShowSecs <= 0) return;
    const t = setInterval(() => setNoShowSecs(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [noShowActive, noShowSecs]);

  const fmtTimer = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const mapsUrl  = `https://maps.google.com/?q=${encodeURIComponent(job.address)}`;

  const QuickAction = ({ icon, label, iconBg, iconColor, onPress }) => (
    <button
      onClick={onPress || (() => alert(`${label} — coming soon`))}
      style={{
        ...CARD, padding: "14px 10px", border: "none", cursor: "pointer",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        fontFamily: "Inter, sans-serif",
      }}>
      <div style={{
        width: 40, height: 40, borderRadius: 12, background: iconBg,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon name={icon} size={18} color={iconColor} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: N, textAlign: "center", lineHeight: 1.3 }}>{label}</span>
    </button>
  );

  if (completed) {
    return (
      <div style={{
        position: "fixed", inset: 0, background: CR, zIndex: 200,
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: 32,
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: "50%", background: "#EBF5EE",
          display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20,
        }}>
          <Icon name="check" size={36} color="#3D7A4F" strokeWidth={2.5} />
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: N, marginBottom: 6, fontFamily: "Inter, sans-serif" }}>
          Job Complete!
        </div>
        <div style={{ fontSize: 14, color: ST, marginBottom: 36, textAlign: "center" }}>
          {job.client} · #{job.jobNumber}
        </div>
        {!tipSent && (
          <div style={{ ...CARD, padding: 20, width: "100%", maxWidth: 320, marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: N, marginBottom: 4 }}>Request a tip?</div>
            <div style={{ fontSize: 12, color: ST, marginBottom: 16 }}>Send a payment link to {job.client} via SMS</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...BTN_CTA, flex: 1, justifyContent: "center", padding: "10px", fontSize: 13 }}
                onClick={() => { setTipSent(true); alert("Tip link sent!"); }}>
                <Icon name="nav" size={14} color={N} /> Send Tip Link
              </button>
              <button style={{ ...BTN_GHOST, flex: 1, justifyContent: "center", padding: "10px", fontSize: 13 }}
                onClick={() => setTipSent(true)}>
                Skip
              </button>
            </div>
          </div>
        )}
        <button style={{ ...BTN_PRIMARY, justifyContent: "center", padding: "14px 32px" }} onClick={onBack}>
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: CR, zIndex: 200, overflowY: "auto", paddingBottom: 40 }}>
      {/* Sticky header */}
      <div style={{
        background: W, padding: "52px 16px 14px",
        display: "flex", alignItems: "center", gap: 12,
        borderBottom: "1px solid " + LG,
        position: "sticky", top: 0, zIndex: 2,
      }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: 10, background: CR,
          border: "none", cursor: "pointer", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon name="chevLeft" size={18} color={N} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: N, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {job.client}
          </div>
          <div style={{ fontSize: 11, color: ST, marginTop: 1 }}>Job #{job.jobNumber} · {job.visitType}</div>
        </div>
        <StatusBadge status={job.status} />
      </div>

      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Job info card */}
        <div style={{ ...CARD, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: N }}>{job.label}</div>
              <div style={{ fontSize: 12, color: ST, marginTop: 2 }}>{job.visitType}</div>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#3D7A4F", fontFamily: "Inter, sans-serif" }}>${job.value}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Icon name="clock" size={14} color={ST} />
            <span style={{ fontSize: 13, color: SL }}>{job.time}</span>
          </div>
          <a href={mapsUrl} target="_blank" rel="noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#2563EB", textDecoration: "none", fontWeight: 500 }}>
            <Icon name="map" size={14} color="#2563EB" />
            {job.address}
          </a>
        </div>

        {/* Quick action grid — 3 columns */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <QuickAction icon="map"      label="Check In"    iconBg="#EFF6FF" iconColor="#2563EB"
            onPress={() => alert("GPS check-in recorded")} />
          <QuickAction icon="nav"      label="Send ETA"    iconBg="#EBF5EE" iconColor="#3D7A4F"
            onPress={() => alert("ETA sent to " + job.client)} />
          <QuickAction icon="camera"   label="Photos"      iconBg={CR}      iconColor={SL} />
          <QuickAction icon="pen"      label="Signature"   iconBg="#F3F0FF" iconColor="#7C3AED" />
          <QuickAction icon="fileText" label="Invoice"     iconBg="#FEF3E2" iconColor="#C47B2B" />
          <QuickAction icon="phone"    label="Call Client" iconBg={CR}      iconColor={SL}
            onPress={() => alert("Calling " + job.client)} />
        </div>

        {/* Start / Complete CTA */}
        {!jobStarted ? (
          <button
            style={{ ...BTN_CTA, width: "100%", justifyContent: "center", padding: "16px 20px", fontSize: 16 }}
            onClick={() => setJobStarted(true)}>
            <Icon name="play" size={18} color={N} /> Start Job
          </button>
        ) : (
          <button
            style={{ ...BTN_PRIMARY, width: "100%", justifyContent: "center", padding: "16px 20px", fontSize: 16, background: "#3D7A4F" }}
            onClick={() => setCompleted(true)}>
            <Icon name="check" size={18} color={W} /> Mark Complete
          </button>
        )}

        {/* No-show clock */}
        <div style={{ ...CARD, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: N }}>Client No-show</div>
              {noShowActive ? (
                <div style={{
                  fontSize: 30, fontWeight: 800, fontFamily: "Inter, sans-serif",
                  color: noShowSecs < 300 ? "#C0392B" : "#C47B2B",
                  marginTop: 4, letterSpacing: "-0.5px",
                }}>
                  {fmtTimer(noShowSecs)}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: ST, marginTop: 2 }}>30-minute countdown</div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {noShowActive && noShowSecs <= 0 && (
                <button style={{ ...BTN_PRIMARY, background: "#C0392B", fontSize: 13, padding: "8px 14px" }}
                  onClick={() => alert("No-show declared")}>
                  Declare
                </button>
              )}
              <button style={{ ...BTN_GHOST, fontSize: 13, padding: "8px 14px" }}
                onClick={() => { setNoShowActive(v => !v); if (!noShowActive) setNoShowSecs(30 * 60); }}>
                {noShowActive ? "Cancel" : "Start Clock"}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

// ─── Screen: Home ─────────────────────────────────────────────────────────────
const HomeScreen = ({ onJobTap }) => {
  const [clockedIn, setClockedIn] = useState(false);
  const [elapsed,   setElapsed]   = useState(0);
  const [available, setAvailable] = useState(true);

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
  const nextJob   = todayJobs[0];

  return (
    <div style={{ overflowY: "auto", height: "calc(100dvh - 44px)", paddingBottom: 100 }}>

      {/* Header */}
      <div style={{ padding: "20px 16px 16px", background: W, borderBottom: "1px solid " + LG }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, color: ST, fontWeight: 500 }}>{MOCK.today}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: N, marginTop: 4, fontFamily: "Inter, sans-serif" }}>
              Good morning, Kevin
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 4 }}>
            <button onClick={() => setAvailable(v => !v)} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 100,
              background: available ? "#EBF5EE" : LG,
              color: available ? "#3D7A4F" : ST,
              border: "none", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "Inter, sans-serif",
            }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: available ? "#3D7A4F" : ST }} />
              {available ? "Available" : "Off Duty"}
            </button>
            <div style={{ position: "relative" }}>
              <button style={{
                width: 38, height: 38, borderRadius: 12, background: CR,
                border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon name="bell" size={18} color={N} />
              </button>
              <span style={{
                position: "absolute", top: -2, right: -2,
                width: 14, height: 14, borderRadius: "50%",
                background: "#C0392B", color: W, fontSize: 8, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "2px solid " + W,
              }}>3</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "12px 16px 0" }}>

        {/* Clock In/Out */}
        <div style={{
          ...CARD, padding: "16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 12,
        }}>
          <div>
            <div style={{ fontSize: 12, color: ST }}>{clockedIn ? "On the clock" : "Ready to start?"}</div>
            {clockedIn
              ? <div style={{ fontSize: 24, fontWeight: 800, color: N, marginTop: 4, fontFamily: "Inter, sans-serif", letterSpacing: "-0.5px" }}>
                  {fmtTime(elapsed)}
                </div>
              : <div style={{ fontSize: 15, fontWeight: 600, color: N, marginTop: 4 }}>Clock in to begin your day</div>
            }
          </div>
          <button
            style={clockedIn ? BTN_GHOST : BTN_CTA}
            onClick={() => { setClockedIn(v => !v); if (clockedIn) setElapsed(0); }}>
            <Icon name={clockedIn ? "square" : "play"} size={15} color={N} />
            {clockedIn ? "Clock Out" : "Clock In"}
          </button>
        </div>

        {/* Next Job — dark card */}
        {nextJob && (
          <div style={{ ...CARD, background: N, padding: "16px", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: S, textTransform: "uppercase", letterSpacing: ".8px" }}>
                Up next · today
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.5)" }}>in 2h 15m</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: W }}>{nextJob.client}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.5)", marginTop: 3 }}>{nextJob.time}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.35)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {nextJob.address}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <a href={`https://maps.google.com/?q=${encodeURIComponent(nextJob.address)}`}
                target="_blank" rel="noreferrer"
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "10px", borderRadius: 10,
                  border: "1.5px solid rgba(255,255,255,.15)", color: W,
                  fontSize: 13, fontWeight: 600, textDecoration: "none", fontFamily: "Inter, sans-serif",
                }}>
                <Icon name="map" size={13} color={W} /> Navigate
              </a>
              <button style={{
                flex: 1, border: "1.5px solid rgba(255,255,255,.15)", borderRadius: 10,
                background: "transparent", color: W, padding: "10px",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                fontFamily: "Inter, sans-serif",
              }} onClick={() => alert("ETA sent to " + nextJob.client)}>
                <Icon name="nav" size={13} color={W} /> ETA
              </button>
              <button style={{
                flex: 1, background: S, border: "none", borderRadius: 10,
                color: N, padding: "10px", fontSize: 13, fontWeight: 700,
                cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", gap: 4, fontFamily: "Inter, sans-serif",
              }} onClick={() => onJobTap(nextJob)}>
                View <Icon name="chevRight" size={13} color={N} />
              </button>
            </div>
          </div>
        )}

        {/* Today's jobs */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: N }}>Today · Jun 5</div>
            <div style={{ fontSize: 12, color: ST }}>
              {todayJobs.length} visits ·{" "}
              <span style={{ color: "#3D7A4F", fontWeight: 600 }}>
                ${todayJobs.reduce((a, j) => a + j.value, 0)}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {todayJobs.map(job => <JobCard key={job.id} job={job} onTap={onJobTap} />)}
          </div>
        </div>

        {/* Week summary */}
        <div style={{ ...CARD, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, color: ST, fontWeight: 500 }}>This week · Jun 2–8</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: N, marginTop: 2, fontFamily: "Inter, sans-serif" }}>3.5 hrs tracked</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: ST, fontWeight: 500 }}>Revenue</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#3D7A4F", marginTop: 2, fontFamily: "Inter, sans-serif" }}>$600</div>
          </div>
        </div>

      </div>
    </div>
  );
};

// ─── Screen: Schedule ─────────────────────────────────────────────────────────
const ScheduleScreen = ({ onJobTap }) => {
  const [view,      setView]      = useState("day");
  const [activeDay, setActiveDay] = useState(5);
  const hours     = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  const todayJobs  = MOCK.jobs.filter(j => !j.time.startsWith("Fri"));

  return (
    <div style={{ overflowY: "auto", height: "calc(100dvh - 44px)" }}>
      <div style={{ padding: "16px 16px 0", background: W, borderBottom: "1px solid " + LG }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button style={{
            display: "flex", alignItems: "center", gap: 4, background: "none",
            border: "none", fontWeight: 800, fontSize: 18, color: N,
            cursor: "pointer", fontFamily: "Inter, sans-serif",
          }}>
            June <Icon name="chevDown" size={16} color={N} />
          </button>
          <button style={{
            width: 36, height: 36, borderRadius: 10, background: CR,
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon name="filter" size={16} color={N} />
          </button>
        </div>

        <div style={{ display: "flex", background: CR, borderRadius: 12, padding: 4, gap: 2, marginBottom: 12 }}>
          {[["day", "Day"], ["list", "List"]].map(([v, label]) => (
            <button key={v} onClick={() => setView(v)} style={{
              flex: 1, padding: "8px 0", borderRadius: 10, border: "none",
              cursor: "pointer", fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 13,
              background: view === v ? W : "transparent",
              color: view === v ? N : ST,
              boxShadow: view === v ? "0 1px 4px rgba(28,35,51,.08)" : "none",
              transition: "all .2s",
            }}>{label}</button>
          ))}
        </div>

        <WeekStrip days={MOCK.weekDays} activeDay={activeDay} onDaySelect={setActiveDay} />

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 0 8px", borderTop: "1px solid " + LG, marginTop: 4,
        }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: N }}>{MOCK.user.name}</span>
          <span style={{ fontSize: 12, color: ST }}>{todayJobs.length} jobs today</span>
        </div>
      </div>

      {view === "day" && (
        <div style={{ padding: "8px 16px 100px" }}>
          {hours.map(h => {
            const label = h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;
            const job   = h === 14 ? MOCK.jobs[0] : h === 16 ? MOCK.jobs[1] : null;
            const bg    = h === 16 ? "#C0392B" : "#3D7A4F";
            return (
              <div key={h} style={{ display: "grid", gridTemplateColumns: "48px 1fr", minHeight: 56 }}>
                <div style={{ fontSize: 11, color: ST, fontWeight: 500, padding: "10px 8px 0 0", textAlign: "right" }}>
                  {label}
                </div>
                <div style={{ borderLeft: "1px solid " + LG, padding: "4px 0 4px 12px" }}>
                  {job && (
                    <div onClick={() => onJobTap(job)}
                      style={{ background: bg, borderRadius: 12, padding: "10px 14px", margin: "4px 0", cursor: "pointer" }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: W }}>{job.client}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,.8)", marginTop: 2 }}>
                        {job.label} · ${job.value}
                      </div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,.6)", marginTop: 4 }}>{job.time}</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "list" && (
        <div style={{ padding: "12px 16px 100px", display: "flex", flexDirection: "column", gap: 8 }}>
          {MOCK.jobs.map(job => <JobCard key={job.id} job={job} onTap={onJobTap} />)}
        </div>
      )}
    </div>
  );
};

// ─── Screen: Jobs ─────────────────────────────────────────────────────────────
const JobsScreen = ({ onJobTap }) => {
  const [query,  setQuery]  = useState("");
  const [filter, setFilter] = useState("all");

  const filters = [
    { id: "all",      label: "All"      },
    { id: "today",    label: "Today"    },
    { id: "upcoming", label: "Upcoming" },
    { id: "done",     label: "Done"     },
  ];

  const filtered = MOCK.jobs.filter(j => {
    const isToday = !j.time.startsWith("Fri");
    const matchFilter =
      filter === "all"      ||
      (filter === "today"    && isToday)              ||
      (filter === "upcoming" && j.status === "upcoming") ||
      (filter === "done"     && j.status === "complete");
    const q = query.toLowerCase();
    const matchQuery = !q ||
      j.client.toLowerCase().includes(q) ||
      j.address.toLowerCase().includes(q) ||
      j.label.toLowerCase().includes(q);
    return matchFilter && matchQuery;
  });

  return (
    <div style={{ overflowY: "auto", height: "calc(100dvh - 44px)" }}>
      <div style={{ background: W, padding: "16px 16px 0", borderBottom: "1px solid " + LG }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: N, marginBottom: 14, fontFamily: "Inter, sans-serif" }}>
          Jobs
        </div>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", zIndex: 1 }}>
            <Icon name="search" size={16} color={ST} />
          </div>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search jobs, clients, addresses…"
            style={{
              width: "100%", background: CR, border: "1.5px solid " + LG, borderRadius: 12,
              padding: "11px 16px 11px 42px", fontSize: 14,
              fontFamily: "Inter, sans-serif", color: N,
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, padding: "10px 0", overflowX: "auto", scrollbarWidth: "none" }}>
          {filters.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: "7px 14px", borderRadius: 100, border: "none",
              cursor: "pointer", fontFamily: "Inter, sans-serif",
              fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
              background: filter === f.id ? N : CR,
              color:      filter === f.id ? W : SL,
              transition: "all .15s",
            }}>{f.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "12px 16px 100px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: ST, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 4 }}>
          {filtered.length} job{filtered.length !== 1 ? "s" : ""}
        </div>
        {filtered.length === 0 ? (
          <div style={{ ...CARD, padding: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <Icon name="briefcase" size={32} color={LG} />
            <div style={{ fontSize: 14, color: ST }}>No jobs match your filter</div>
          </div>
        ) : (
          filtered.map(job => <JobCard key={job.id} job={job} onTap={onJobTap} />)
        )}
      </div>
    </div>
  );
};

// ─── Screen: Messages ─────────────────────────────────────────────────────────
const MessagesScreen = () => {
  const [tab, setTab] = useState("messages");

  return (
    <div style={{ overflowY: "auto", height: "calc(100dvh - 44px)" }}>
      <div style={{ background: W, padding: "16px 16px 0", borderBottom: "1px solid " + LG }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: N, marginBottom: 14, fontFamily: "Inter, sans-serif" }}>
          Messages
        </div>
        <div style={{ display: "flex", background: CR, borderRadius: 12, padding: 4, gap: 2 }}>
          {[["messages", "Messages"], ["calls", "Calls"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              flex: 1, padding: "8px 0", borderRadius: 10, border: "none",
              cursor: "pointer", fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 13,
              background: tab === id ? W : "transparent",
              color: tab === id ? N : ST,
              boxShadow: tab === id ? "0 1px 4px rgba(28,35,51,.08)" : "none",
              transition: "all .2s",
            }}>{label}</button>
          ))}
        </div>
        <div style={{ height: 12 }} />
      </div>

      {tab === "messages" && (
        <div style={{ paddingBottom: 100 }}>
          {MOCK.messages.map((m, i) => (
            <div key={i} onClick={() => alert("Open thread: " + m.name)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 16px", background: W, cursor: "pointer",
                borderBottom: "1px solid " + LG,
              }}>
              <Avatar
                initials={m.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
                size={44}
                bg={N}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: N }}>{m.name}</span>
                  <span style={{ fontSize: 11, color: ST }}>{m.time}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{
                    fontSize: 13, color: m.unread ? N : ST, fontWeight: m.unread ? 600 : 400,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                  }}>{m.preview}</span>
                  {m.unread > 0 && (
                    <span style={{
                      marginLeft: 8, minWidth: 18, height: 18, borderRadius: "50%",
                      background: N, color: W, fontSize: 10, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>{m.unread}</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: ST, marginTop: 2 }}>
                  {m.via === "sendblue" ? "iMessage via Sendblue" : "SMS via Twilio"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "calls" && (
        <div style={{ paddingBottom: 100 }}>
          {MOCK.calls.map((c, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "14px 16px", background: W, borderBottom: "1px solid " + LG,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                background: c.type === "missed" ? "#FDECEA" : CR,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <Icon
                  name={c.type === "missed" ? "phoneMissed" : "phone"}
                  size={18}
                  color={c.type === "missed" ? "#C0392B" : SL}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: c.type === "missed" ? "#C0392B" : N }}>
                  {c.name}
                </div>
                <div style={{ fontSize: 12, color: ST, marginTop: 2 }}>{c.time}</div>
              </div>
              {c.duration && <span style={{ fontSize: 12, color: ST, flexShrink: 0 }}>{c.duration}</span>}
              <button style={{
                width: 36, height: 36, borderRadius: 10, background: CR,
                border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }} onClick={() => alert("Calling " + c.name)}>
                <Icon name="phone" size={16} color={N} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Screen: Profile ──────────────────────────────────────────────────────────
const ProfileScreen = () => {
  const [available, setAvailable] = useState(true);
  const [biometric, setBiometric] = useState(true);

  const weekHours = [0, 0, 3.5, 0, 0, 0, 0];
  const maxH      = Math.max(...weekHours, 1);
  const dayLabels = ["M", "T", "W", "T", "F", "S", "S"];

  const MenuRow = ({ icon, label, iconBg, iconColor, onPress, danger, right }) => (
    <button
      onClick={onPress || (() => alert(`${label} — coming soon`))}
      style={{
        width: "100%", background: "none", border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 14, padding: "13px 16px",
        fontFamily: "Inter, sans-serif",
      }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, background: iconBg || CR,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon name={icon} size={17} color={iconColor || SL} />
      </div>
      <span style={{ flex: 1, textAlign: "left", fontWeight: 500, fontSize: 15, color: danger ? "#C0392B" : N }}>
        {label}
      </span>
      {right || <Icon name="chevRight" size={16} color={ST} />}
    </button>
  );

  const Divider = () => <div style={{ height: 1, background: LG, marginLeft: 66 }} />;

  return (
    <div style={{ overflowY: "auto", height: "calc(100dvh - 44px)", paddingBottom: 100 }}>

      {/* Profile hero */}
      <div style={{ background: N, padding: "24px 20px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <Avatar initials={MOCK.user.initials} size={60} bg={SL} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: W, fontFamily: "Inter, sans-serif" }}>
              {MOCK.user.name}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.5)", marginTop: 3 }}>{MOCK.user.phone}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.35)", marginTop: 2 }}>{MOCK.user.company}</div>
          </div>
        </div>

        {/* Availability toggle */}
        <button onClick={() => setAvailable(v => !v)} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "100%", background: "rgba(255,255,255,.07)",
          border: "1px solid rgba(255,255,255,.1)",
          borderRadius: 14, padding: "14px 16px", cursor: "pointer",
          fontFamily: "Inter, sans-serif",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: available ? "#3D7A4F" : ST,
              boxShadow: available ? "0 0 0 3px rgba(61,122,79,.3)" : "none",
              transition: "all .2s",
            }} />
            <span style={{ fontSize: 15, fontWeight: 600, color: W }}>
              {available ? "Available for jobs" : "Off duty"}
            </span>
          </div>
          {/* Toggle pill */}
          <div style={{
            width: 44, height: 26, borderRadius: 13, position: "relative",
            background: available ? "#3D7A4F" : "rgba(255,255,255,.2)",
            transition: "background .2s",
          }}>
            <div style={{
              position: "absolute", top: 3,
              left: available ? 21 : 3,
              width: 20, height: 20, borderRadius: "50%", background: W,
              transition: "left .2s",
            }} />
          </div>
        </button>
      </div>

      <div style={{ padding: "16px 16px 0" }}>

        {/* Hours this week */}
        <div style={{ ...CARD, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: N }}>Hours this week</div>
              <div style={{ fontSize: 11, color: ST, marginTop: 2 }}>Jun 2–8</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: N, fontFamily: "Inter, sans-serif" }}>3.5 hrs</div>
              <div style={{ fontSize: 11, color: "#3D7A4F", fontWeight: 600, marginTop: 2 }}>$600 earned</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 52 }}>
            {weekHours.map((h, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{
                  width: "100%", borderRadius: 6,
                  height: h > 0 ? `${Math.round((h / maxH) * 44)}px` : "3px",
                  background: i === 2 ? S : h > 0 ? SL : LG,
                  transition: "height .3s ease",
                }} />
                <span style={{ fontSize: 10, color: ST }}>{dayLabels[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Account */}
        <div style={{ ...CARD, overflow: "hidden", marginBottom: 12 }}>
          <MenuRow icon="settings"    label="Settings"        iconBg={CR}      iconColor={SL} />
          <Divider />
          <MenuRow icon="key"         label="Change Password"  iconBg={CR}      iconColor={SL} />
          <Divider />
          <MenuRow
            icon="fingerprint"
            label={`Biometric Login${biometric ? "" : " (off)"}`}
            iconBg={biometric ? "#EBF5EE" : CR}
            iconColor={biometric ? "#3D7A4F" : SL}
            onPress={() => setBiometric(v => !v)}
            right={
              <div style={{
                width: 36, height: 22, borderRadius: 11, position: "relative",
                background: biometric ? "#3D7A4F" : LG, transition: "background .2s",
              }}>
                <div style={{
                  position: "absolute", top: 3,
                  left: biometric ? 17 : 3,
                  width: 16, height: 16, borderRadius: "50%", background: W,
                  transition: "left .2s",
                }} />
              </div>
            }
          />
          <Divider />
          <MenuRow icon="bell"        label="Notifications"    iconBg={CR}      iconColor={SL} />
        </div>

        <div style={{ ...CARD, overflow: "hidden", marginBottom: 12 }}>
          <MenuRow icon="phone"       label="Support"          iconBg={CR}      iconColor={SL} />
          <Divider />
          <MenuRow icon="payment"     label="Subscription"     iconBg={CR}      iconColor={SL} />
          <Divider />
          <MenuRow icon="star"        label="Refer a Friend"   iconBg="#FEF3E2" iconColor={S}  />
          <Divider />
          <MenuRow icon="alert"       label="About FieldCore"  iconBg={CR}      iconColor={SL} />
        </div>

        <div style={{ ...CARD, overflow: "hidden", marginBottom: 20 }}>
          <MenuRow icon="x" label="Logout" iconBg="#FDECEA" iconColor="#C0392B" danger />
        </div>

        <div style={{ textAlign: "center", paddingBottom: 8 }}>
          <div style={{ fontSize: 11, color: ST }}>FieldCore™ v1.0.0</div>
          <div style={{ fontSize: 10, color: LG, marginTop: 2 }}>{MOCK.user.company}</div>
        </div>

      </div>
    </div>
  );
};

// ─── Bottom Navigation ────────────────────────────────────────────────────────
const BottomNav = ({ active, onChange }) => {
  const tabs = [
    { id: "home",     icon: "home",         label: "Home"     },
    { id: "schedule", icon: "schedule",      label: "Schedule" },
    { id: "jobs",     icon: "briefcase",     label: "Jobs"     },
    { id: "messages", icon: "messageSquare", label: "Messages" },
    { id: "profile",  icon: "user",          label: "Profile"  },
  ];
  return (
    <nav style={{
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
      width: "100%", maxWidth: 430,
      background: W, borderTop: "1px solid " + LG,
      display: "flex", padding: "8px 0 16px", zIndex: 100,
    }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          flex: 1, background: "none", border: "none",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
          fontSize: 10, fontWeight: 500, cursor: "pointer",
          fontFamily: "Inter, sans-serif", padding: "4px 0",
          color: active === t.id ? N : ST,
        }}>
          <Icon name={t.icon} size={22}
            color={active === t.id ? N : ST}
            strokeWidth={active === t.id ? 2.2 : 1.8} />
          {t.label}
        </button>
      ))}
    </nav>
  );
};

// ─── FAB Action Items ─────────────────────────────────────────────────────────
const ACTION_ITEMS = [
  { label: "New Expense",  icon: "payment",   iconBg: "#F3F0FF", iconColor: "#7C3AED" },
  { label: "New Request",  icon: "alert",     iconBg: "#FDECEA", iconColor: "#C0392B" },
  { label: "New Client",   icon: "users",     iconBg: CR,        iconColor: SL        },
  { label: "New Quote",    icon: "list",      iconBg: "#FEF3E2", iconColor: "#C47B2B" },
  { label: "New Job",      icon: "briefcase", iconBg: "#EBF5EE", iconColor: "#3D7A4F" },
  { label: "New Invoice",  icon: "dollar",    iconBg: "#EFF6FF", iconColor: "#2563EB" },
];

const FAB_RIGHT = "calc(50% - 215px + 16px)";

// ─── App Shell ────────────────────────────────────────────────────────────────
export default function MobileDemo() {
  const [activeTab,         setActiveTab]         = useState("home");
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [activeJob,         setActiveJob]         = useState(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Syne:wght@800&display=swap";
    document.head.appendChild(link);
  }, []);

  const closeSheet = () => setIsActionSheetOpen(false);
  const openJob    = (job) => { setActiveJob(job); setIsActionSheetOpen(false); };
  const closeJob   = () => setActiveJob(null);

  const screens = {
    home:     <HomeScreen     onJobTap={openJob} />,
    schedule: <ScheduleScreen onJobTap={openJob} />,
    jobs:     <JobsScreen     onJobTap={openJob} />,
    messages: <MessagesScreen />,
    profile:  <ProfileScreen  />,
  };

  return (
    <>
      <GlobalStyle />
      <div style={{
        maxWidth: 430, margin: "0 auto",
        minHeight: "100dvh", background: CR,
        position: "relative", overflowX: "hidden",
        fontFamily: "Inter, sans-serif",
      }}>
        {/* Status bar */}
        <div style={{
          height: 44, display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "0 20px",
          background: N, flexShrink: 0,
        }}>
          <span style={{ color: W, fontSize: 13, fontWeight: 700, fontFamily: "Inter, sans-serif" }}>10:51</span>
          <div style={{
            fontFamily: "'Syne', 'Arial Black', sans-serif",
            fontWeight: 800, letterSpacing: "1.5px",
            color: W, fontSize: 14, textTransform: "uppercase",
          }}>
            FIELDCORE<sup style={{ color: S, fontSize: 9, verticalAlign: "super" }}>™</sup>
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <Icon name="wifi"    size={13} color={W} strokeWidth={1.5} />
            <Icon name="battery" size={14} color={W} strokeWidth={1.5} />
          </div>
        </div>

        {screens[activeTab]}

        {/* Job Detail overlay */}
        {activeJob && <JobDetailScreen job={activeJob} onBack={closeJob} />}

        {/* Dim overlay */}
        {isActionSheetOpen && (
          <div onClick={closeSheet} style={{
            position: "fixed", inset: 0, zIndex: 80,
            background: "rgba(28,35,51,0.35)",
            animation: "fadeIn 0.2s ease both",
          }} />
        )}

        {/* Action sheet */}
        {isActionSheetOpen && (
          <div style={{
            position: "fixed", bottom: 90, right: FAB_RIGHT, zIndex: 90,
            display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10,
            pointerEvents: "none",
          }}>
            {ACTION_ITEMS.map((item, i) => (
              <button key={item.label}
                onClick={() => { closeSheet(); alert(`${item.label} — coming soon`); }}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  background: W, borderRadius: 100,
                  paddingTop: 10, paddingBottom: 10, paddingLeft: 14, paddingRight: 18,
                  boxShadow: "0 4px 16px rgba(28,35,51,.14)",
                  cursor: "pointer", border: "none",
                  fontFamily: "Inter, sans-serif", pointerEvents: "all",
                  animation: "fabSlideUp 0.25s ease both",
                  animationDelay: `${(ACTION_ITEMS.length - 1 - i) * 40}ms`,
                }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: item.iconBg,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <Icon name={item.icon} size={15} color={item.iconColor} />
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: N, whiteSpace: "nowrap" }}>{item.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* FAB */}
        <button
          onClick={() => setIsActionSheetOpen(v => !v)}
          style={{
            position: "fixed", bottom: 80, right: FAB_RIGHT,
            width: 52, height: 52, borderRadius: "50%",
            background: N, border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 20px rgba(28,35,51,.3)", zIndex: 100,
          }}
          aria-label="Add new">
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "transform 0.2s ease",
            transform: isActionSheetOpen ? "rotate(45deg)" : "rotate(0deg)",
          }}>
            <Icon name="plus" size={24} color={W} />
          </div>
        </button>

        <BottomNav active={activeTab} onChange={setActiveTab} />
      </div>
    </>
  );
}
