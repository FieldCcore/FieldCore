import React, { useState } from 'react';

const C = {
  navy:  '#1C2333', navy2: '#242E43', navy3: '#2D3748',
  sand:  '#D6B58A', sandDark: '#C09A6A',
  white: '#FFFFFF', textSub: 'rgba(255,255,255,.55)',
  textMuted: 'rgba(255,255,255,.3)', border: 'rgba(255,255,255,.08)',
  green: '#2E7D32', greenLt: 'rgba(46,125,50,.18)',
  blue:  '#1565C0', blueLt: 'rgba(21,101,192,.18)',
  amber: '#E65100', amberLt: 'rgba(230,81,0,.18)',
};

const JOBS = [
  {
    id: '1', service_type: 'Full Detail', client_name: 'Thomas Garfield',
    client_address: '4421 Lake Shore Dr, Tampa FL', client_phone: '(813) 555-0192',
    scheduled_at: new Date(Date.now() + 2 * 3600000).toISOString(),
    amount: '320.00', status: 'scheduled', notes: 'VIP client — lake house property',
  },
  {
    id: '2', service_type: 'Ceramic Coating', client_name: 'Rita Okafor',
    client_address: '887 Birch Ln, Tampa FL', client_phone: '(813) 555-0441',
    scheduled_at: new Date(Date.now() + 5 * 3600000).toISOString(),
    amount: '1200.00', status: 'scheduled', notes: 'New Tesla Model Y — white',
  },
  {
    id: '3', service_type: 'Express Wash', client_name: 'Janet Holloway',
    client_address: '213 Maple Ave, Tampa FL', client_phone: '(813) 555-0871',
    scheduled_at: new Date(Date.now() - 1 * 3600000).toISOString(),
    amount: '97.40', status: 'in_progress', notes: null,
  },
];

const STATUS_COLOR = { scheduled: C.blue, in_progress: C.amber, complete: C.green };
const STATUS_BG    = { scheduled: C.blueLt, in_progress: C.amberLt, complete: C.greenLt };

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

/* ── Screens ──────────────────────────────────────────────── */

function LoginScreen({ onLogin }) {
  const [email,    setEmail]    = useState('danny@kmcautospa.com');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  function handleLogin() {
    if (!email || !password) return;
    setLoading(true);
    setTimeout(() => { setLoading(false); onLogin({ name: 'Danny R.', role: 'tech' }); }, 900);
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 24, background: C.navy, minHeight: '100%' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.white, letterSpacing: 3 }}>
          FIELD<span style={{ color: C.sand }}>CORE</span><sup style={{ color: C.sand, fontSize: 9 }}>™</sup>
        </div>
        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>Tech Login</div>
      </div>

      <div style={{ background: C.navy2, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
        <div style={labelStyle}>Email</div>
        <input
          style={inputStyle}
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="your@email.com"
        />
        <div style={labelStyle}>Password</div>
        <input
          type="password"
          style={inputStyle}
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="••••••••"
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
        />
        <button
          style={{ ...btnStyle, opacity: loading ? 0.65 : 1 }}
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </div>
    </div>
  );
}

function JobQueueScreen({ tech, onSelectJob, onLogout }) {
  const active    = JOBS.filter(j => j.status === 'in_progress').length;
  const scheduled = JOBS.filter(j => j.status === 'scheduled').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.navy }}>
      {/* Header */}
      <div style={{ background: C.navy2, padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.white }}>Hi, {tech.name.split(' ')[0]} 👋</div>
          <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>
            {active > 0 ? `${active} active` : `${scheduled} scheduled`} · {JOBS.length} jobs
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ background: C.navy3, border: `1px solid ${C.border}`, borderRadius: 20, padding: '4px 10px', fontSize: 10, fontWeight: 700, color: C.sand, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {tech.role}
          </div>
          <button onClick={onLogout} style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: 12, cursor: 'pointer', padding: '4px 6px' }}>
            ⎋
          </button>
        </div>
      </div>

      {/* Job cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {JOBS.map(job => (
          <div
            key={job.id}
            onClick={() => onSelectJob(job)}
            style={{ background: C.navy2, borderRadius: 12, padding: 14, border: `1px solid ${C.border}`, cursor: 'pointer', transition: 'border-color .15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = C.sand}
            onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 2 }}>{job.service_type}</div>
                <div style={{ fontSize: 12, color: C.textSub }}>{job.client_name}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: STATUS_BG[job.status], borderRadius: 99, padding: '3px 9px', marginLeft: 8 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: STATUS_COLOR[job.status] }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: STATUS_COLOR[job.status], textTransform: 'capitalize' }}>
                  {job.status.replace('_', ' ')}
                </span>
              </div>
            </div>
            {job.client_address && (
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8 }}>📍 {job.client_address}</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
              <div style={{ fontSize: 11, color: C.sand }}>{fmtDate(job.scheduled_at)} · {fmtTime(job.scheduled_at)}</div>
              {job.amount && <div style={{ fontSize: 13, fontWeight: 700, color: C.white }}>${parseFloat(job.amount).toFixed(0)}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function JobDetailScreen({ job: initJob, onBack }) {
  const [job,      setJob]      = useState(initJob);
  const [screen,   setScreen]   = useState('detail'); // 'detail' | 'eta' | 'photos' | 'complete'
  const [eta,      setEta]      = useState('30');
  const [etaSent,  setEtaSent]  = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);

  const isScheduled  = job.status === 'scheduled';
  const isInProgress = job.status === 'in_progress';
  const isComplete   = job.status === 'complete';

  if (screen === 'photos') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.navy }}>
        <div style={{ background: C.navy2, padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setScreen('detail')} style={{ background: 'none', border: 'none', color: C.sand, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>← Back</button>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.white }}>Job Photos</span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 }}>
          <div style={{ fontSize: 40 }}>📸</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.textSub }}>No photos yet</div>
          <div style={{ fontSize: 12, color: C.textMuted, textAlign: 'center' }}>Camera and gallery upload available on device</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8, width: '100%' }}>
            <button style={{ ...btnStyle, flex: 1, padding: '11px 0' }}>📷 Camera</button>
            <button style={{ ...btnOutlineStyle, flex: 1, padding: '11px 0' }}>🖼 Library</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'eta') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.navy }}>
        <div style={{ background: C.navy2, padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setScreen('detail')} style={{ background: 'none', border: 'none', color: C.sand, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>✕ Cancel</button>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.white }}>Send ETA</span>
        </div>
        <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 13, color: C.textSub, marginBottom: 20 }}>
            Sending ETA SMS to <strong style={{ color: C.white }}>{job.client_name}</strong> at {job.client_phone}
          </div>
          <div style={{ ...labelStyle, marginBottom: 8 }}>Minutes away</div>
          <input
            type="number"
            style={{ ...inputStyle, fontSize: 32, fontWeight: 800, textAlign: 'center', padding: '16px', marginBottom: 8 }}
            value={eta}
            onChange={e => setEta(e.target.value)}
          />
          <div style={{ fontSize: 11, color: C.textMuted, textAlign: 'center', marginBottom: 24 }}>
            Client will receive: "Your tech is ~{eta} min away"
          </div>
          <button
            style={btnStyle}
            onClick={() => { setEtaSent(true); setScreen('detail'); }}
          >
            Send SMS
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.navy, overflowY: 'auto' }}>
      {/* Nav */}
      <div style={{ background: C.navy2, padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: C.sand, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>← Jobs</button>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.white }}>Job Detail</span>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Status card */}
        <div style={{ background: C.navy2, borderRadius: 12, padding: 16, border: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: C.white, marginBottom: 4 }}>{job.service_type}</div>
              {job.amount && <div style={{ fontSize: 20, fontWeight: 700, color: C.sand }}>${parseFloat(job.amount).toFixed(0)}</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: STATUS_BG[job.status], borderRadius: 99, padding: '4px 10px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[job.status] }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: STATUS_COLOR[job.status], textTransform: 'capitalize' }}>
                {job.status.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>

        {/* Info rows */}
        <div style={{ background: C.navy2, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          {[
            { l: 'Client',  v: job.client_name },
            { l: 'Address', v: job.client_address },
            { l: 'Phone',   v: job.client_phone },
            { l: 'Time',    v: `${fmtDate(job.scheduled_at)} · ${fmtTime(job.scheduled_at)}` },
            job.amount && { l: 'Amount', v: `$${parseFloat(job.amount).toFixed(2)}` },
            job.notes && { l: 'Notes', v: job.notes },
          ].filter(Boolean).map((r, i, arr) => (
            <div key={i} style={{ display: 'flex', padding: '11px 14px', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, width: 64, flexShrink: 0, alignSelf: 'center' }}>{r.l}</div>
              <div style={{ fontSize: 13, color: C.white, flex: 1 }}>{r.v}</div>
            </div>
          ))}
        </div>

        {checkedIn && (
          <div style={{ background: 'rgba(46,125,50,.12)', border: '1px solid rgba(46,125,50,.3)', borderRadius: 10, padding: '10px 14px', textAlign: 'center', fontSize: 13, color: C.green, fontWeight: 600 }}>
            ✓ Checked in — job in progress
          </div>
        )}
        {etaSent && (
          <div style={{ background: C.blueLt, border: '1px solid rgba(21,101,192,.3)', borderRadius: 10, padding: '10px 14px', textAlign: 'center', fontSize: 13, color: C.blue, fontWeight: 600 }}>
            ✓ ETA sent to {job.client_name}
          </div>
        )}

        {/* Actions */}
        {!isComplete && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(isScheduled) && (
              <button style={{ ...btnStyle, background: C.blue }} onClick={() => setScreen('eta')}>
                Send ETA to Client
              </button>
            )}
            {(isScheduled || isInProgress) && (
              <button style={btnOutlineStyle} onClick={() => { setCheckedIn(true); setJob(j => ({ ...j, status: 'in_progress' })); }}>
                📍 {isScheduled ? 'GPS Check-In' : 'Update Location'}
              </button>
            )}
            <button style={btnOutlineStyle} onClick={() => setScreen('photos')}>
              📷 View / Upload Photos
            </button>
            {(isScheduled || isInProgress) && (
              <button style={{ ...btnStyle, background: C.green }} onClick={() => setJob(j => ({ ...j, status: 'complete' }))}>
                ✓ Mark Job Complete
              </button>
            )}
          </div>
        )}

        {isComplete && (
          <div style={{ background: 'rgba(46,125,50,.12)', border: '1px solid rgba(46,125,50,.3)', borderRadius: 12, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.green, marginBottom: 4 }}>Job Complete ✓</div>
            <div style={{ fontSize: 12, color: C.textSub, marginBottom: 12 }}>Invoice auto-generated</div>
            <button style={{ ...btnOutlineStyle, fontSize: 13 }} onClick={() => setScreen('photos')}>View / Add Photos →</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Shared styles ─────────────────────────────────────────── */
const labelStyle = {
  display: 'block', fontSize: 9, fontWeight: 600, letterSpacing: 1,
  textTransform: 'uppercase', color: 'rgba(255,255,255,.35)', marginBottom: 6,
};
const inputStyle = {
  width: '100%', padding: '12px 13px', background: '#2D3748',
  border: '1px solid rgba(255,255,255,.08)', borderRadius: 9,
  fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box',
  marginBottom: 14, fontFamily: 'inherit',
};
const btnStyle = {
  width: '100%', padding: '13px', background: '#D6B58A', color: '#1C2333',
  border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 800,
  cursor: 'pointer', fontFamily: 'inherit',
};
const btnOutlineStyle = {
  width: '100%', padding: '13px', background: '#242E43', color: '#fff',
  border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, fontSize: 14,
  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
};

/* ── Phone shell ───────────────────────────────────────────── */
function PhoneShell({ children }) {
  return (
    <div style={{
      width: 340, height: 680,
      background: '#0a0f1a',
      borderRadius: 44,
      padding: '14px 10px',
      boxShadow: '0 40px 80px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.06)',
      position: 'relative',
      flexShrink: 0,
    }}>
      {/* Notch */}
      <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', width: 110, height: 28, background: '#0a0f1a', borderRadius: 20, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#111827' }} />
        <div style={{ width: 60, height: 10, borderRadius: 5, background: '#111827' }} />
      </div>
      {/* Screen */}
      <div style={{
        width: '100%', height: '100%',
        borderRadius: 36,
        overflow: 'hidden',
        background: C.navy,
        position: 'relative',
      }}>
        {/* Status bar */}
        <div style={{ height: 44, background: C.navy2, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 18px 8px', flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.white }}>
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: C.white }}>●●●</span>
            <span style={{ fontSize: 11, color: C.white }}>WiFi</span>
            <span style={{ fontSize: 11, color: C.white }}>🔋</span>
          </div>
        </div>
        {/* App content */}
        <div style={{ height: 'calc(100% - 44px)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </div>
      {/* Home bar */}
      <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', width: 100, height: 4, background: 'rgba(255,255,255,.2)', borderRadius: 2 }} />
    </div>
  );
}

/* ── Main demo page ────────────────────────────────────────── */
export default function MobileDemo() {
  const [screen, setScreen] = useState('login'); // 'login' | 'queue' | 'detail'
  const [tech,   setTech]   = useState(null);
  const [selJob, setSelJob] = useState(null);

  return (
    <div style={{
      minHeight: '100vh', background: '#0d1117',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      fontFamily: "'Bricolage Grotesque', sans-serif",
      padding: '40px 24px',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,.3)', marginBottom: 10 }}>
          FieldCore™ — Tech Mobile App
        </div>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 36, color: '#fff', fontWeight: 400, margin: 0, marginBottom: 8 }}>
          See it in action
        </h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,.4)', margin: 0 }}>
          Interactive demo — click through the tech experience
        </p>
      </div>

      <div style={{ display: 'flex', gap: 48, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* Phone */}
        <PhoneShell>
          {screen === 'login' && (
            <LoginScreen onLogin={user => { setTech(user); setScreen('queue'); }} />
          )}
          {screen === 'queue' && tech && (
            <JobQueueScreen
              tech={tech}
              onSelectJob={job => { setSelJob(job); setScreen('detail'); }}
              onLogout={() => { setTech(null); setScreen('login'); }}
            />
          )}
          {screen === 'detail' && selJob && (
            <JobDetailScreen job={selJob} onBack={() => setScreen('queue')} />
          )}
        </PhoneShell>

        {/* Feature callouts */}
        <div style={{ maxWidth: 300, paddingTop: 20 }}>
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.sand, marginBottom: 12 }}>
              What techs can do
            </div>
            {[
              { icon: '🔐', title: 'Secure login',        desc: 'JWT auth — each tech has their own account and only sees their own jobs' },
              { icon: '📋', title: 'Job queue',           desc: 'Today\'s jobs sorted by time, with live status badges and client info' },
              { icon: '📍', title: 'GPS check-in',        desc: 'One tap records tech\'s location — logged to the operator dashboard' },
              { icon: '📱', title: 'ETA SMS',             desc: 'Text clients an ETA in 2 taps — powered by Twilio' },
              { icon: '📷', title: 'Job photos',          desc: 'Before/after photos uploaded directly from camera or library' },
              { icon: '✓',  title: 'Complete & invoice',  desc: 'Mark job done — invoice auto-generates in the operator dashboard' },
            ].map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
                <div style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{f.icon}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{f.title}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: 'rgba(214,181,138,.08)', border: '1px solid rgba(214,181,138,.2)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.sand, marginBottom: 8, letterSpacing: '.05em' }}>Try it</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', lineHeight: 1.6 }}>
              Enter any email + password on the login screen, then tap a job to see the full detail view with GPS check-in, ETA sending, and job completion.
            </div>
          </div>
        </div>
      </div>

      {/* Screen nav dots */}
      <div style={{ display: 'flex', gap: 8, marginTop: 32 }}>
        {[['login','Login'], ['queue','Job Queue'], ['detail','Job Detail']].map(([s, label]) => (
          <button
            key={s}
            onClick={() => {
              if (s === 'detail' && !selJob) setSelJob(JOBS[0]);
              if (s !== 'login' && !tech) setTech({ name: 'Danny R.', role: 'tech' });
              setScreen(s);
            }}
            style={{
              background: screen === s ? C.sand : 'rgba(255,255,255,.08)',
              color: screen === s ? C.navy : 'rgba(255,255,255,.4)',
              border: 'none', borderRadius: 20, padding: '6px 16px',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              transition: 'all .15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
