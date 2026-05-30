import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Camera, Check, Timer, Clock, ChevronLeft, LogOut, Lock } from 'lucide-react';
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
  red:   '#B52A2A', redLt: 'rgba(181,42,42,.15)',
};

const STATUS_COLOR = { scheduled: C.blue, in_progress: C.amber, complete: C.green, cancelled: C.red };
const STATUS_BG    = { scheduled: C.blueLt, in_progress: C.amberLt, complete: C.greenLt, cancelled: C.redLt };

function fmtTime(iso) { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
function fmtDate(iso) { return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }); }

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
function JobQueue({ user, onSelect, onLogout, onPwChange }) {
  const [jobs,    setJobs]    = useState([]);
  const [loading, setLoading] = useState(true);

  function load() {
    api.get(`/mobile/jobs?tech_id=${user.id}`)
      .then(r => setJobs(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [user.id]);

  const active    = jobs.filter(j => j.status === 'in_progress').length;
  const scheduled = jobs.filter(j => j.status === 'scheduled').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.navy }}>
      <Topbar
        title={`Hi, ${user.name.split(' ')[0]}`}
        right={
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={onPwChange} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 4, display: 'flex' }} title="Change password">
              <Lock size={15} />
            </button>
            <button onClick={onLogout} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 4, display: 'flex' }} title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        }
      />

      <div style={{ padding: '10px 12px 4px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 8, flexShrink: 0 }}>
        {active > 0 && (
          <div style={{ background: C.amberLt, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: C.amber }}>
            {active} active
          </div>
        )}
        <div style={{ background: C.navy3, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: C.sub }}>
          {loading ? '…' : `${jobs.length} job${jobs.length !== 1 ? 's' : ''} today`}
        </div>
        <button onClick={load} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 12 }}>↻ Refresh</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: C.muted, fontSize: 13 }}>Loading jobs…</div>
        ) : jobs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: C.muted }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.sub }}>No jobs scheduled</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Check back or contact your dispatcher</div>
          </div>
        ) : (
          jobs.map(job => {
            const addr = job.service_address || job.client_address;
            return (
              <div
                key={job.id}
                onClick={() => onSelect(job)}
                style={{ background: C.navy2, borderRadius: 14, padding: 14, border: `1px solid ${C.border}`, cursor: 'pointer', transition: 'border-color .15s' }}
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
                  <div style={{ fontSize: 12, color: C.sand }}>{job.scheduled_at ? `${fmtDate(job.scheduled_at)} · ${fmtTime(job.scheduled_at)}` : 'No time set'}</div>
                  {job.amount && <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>${parseFloat(job.amount).toFixed(0)}</div>}
                </div>
              </div>
            );
          })
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

  const backendUrl = import.meta.env.VITE_API_URL || '';

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
              <a key={p.id} href={`${backendUrl}${p.url}`} target="_blank" rel="noreferrer">
                <img
                  src={`${backendUrl}${p.url}`}
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

  async function handleSend() {
    setSending(true);
    try {
      await api.post(`/mobile/jobs/${job.id}/eta`, { minutes });
      setSent(true);
      setTimeout(onBack, 1500);
    } catch {
      setSent(true);
      setTimeout(onBack, 1500);
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
          style={{ width: '100%', padding: '18px', background: C.navy3, border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 36, fontWeight: 800, textAlign: 'center', color: C.white, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 10 }}
          value={minutes}
          onChange={e => setMinutes(e.target.value)}
        />
        <div style={{ fontSize: 12, color: C.muted, textAlign: 'center', marginBottom: 28 }}>
          "{job.client_name}, your tech is ~{minutes} min away"
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['10', '20', '30', '45'].map(m => (
            <button
              key={m}
              onClick={() => setMinutes(m)}
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

/* ── Job Detail ───────────────────────────────────────────────── */
function JobDetail({ job: initJob, onBack, onUpdate }) {
  const [job,         setJob]         = useState(initJob);
  const [subscreen,   setSubscreen]   = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [msg,         setMsg]         = useState(null);
  const [clockActive, setClockActive] = useState(!!initJob.no_show_clock_started_at);
  const [clockTime,   setClockTime]   = useState(initJob.no_show_clock_started_at);

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

  if (subscreen === 'photos') return <PhotosScreen job={job} onBack={() => setSubscreen(null)} />;
  if (subscreen === 'eta')    return <EtaScreen    job={job} onBack={() => setSubscreen(null)} />;

  const isScheduled  = job.status === 'scheduled';
  const isInProgress = job.status === 'in_progress';
  const isComplete   = job.status === 'complete';
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
        {clockActive && (
          <div style={{ background: C.amberLt, border: `1px solid rgba(217,119,6,.35)`, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Timer size={14} color={C.amber} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.amber }}>No-show clock running</div>
              {clockTime && <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>Started {formatDistanceToNow(new Date(clockTime), { addSuffix: true })}</div>}
            </div>
          </div>
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
            {isScheduled && !clockActive && (
              <button style={btnGhost({ color: C.amber, borderColor: 'rgba(217,119,6,.3)', opacity: loading ? 0.65 : 1 })} onClick={handleNoshowClock} disabled={loading}>
                <Timer size={16} /> Start No-Show Clock
              </button>
            )}
            {(isScheduled || isInProgress) && (
              <button style={btn({ background: C.green, opacity: loading ? 0.65 : 1 })} onClick={handleComplete} disabled={loading}>
                <Check size={16} strokeWidth={2.5} /> Mark Job Complete
              </button>
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
      </div>
    </div>
  );
}

/* ── Main TechApp ─────────────────────────────────────────────── */
export default function TechApp() {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const [selectedJob, setSelectedJob] = useState(null);
  const [pwModal,  setPwModal]  = useState(false);
  const [pwForm,   setPwForm]   = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg,    setPwMsg]    = useState(null);

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
          <JobQueue user={user} onSelect={setSelectedJob} onLogout={handleLogout} onPwChange={() => { setPwModal(true); setPwMsg(null); }} />
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
