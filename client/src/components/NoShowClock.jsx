import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

function fmtElapsed(minutes) {
  const m = Math.floor(minutes);
  const s = Math.round((minutes - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function CountdownBar({ elapsed, grace }) {
  const pct = Math.min((elapsed / grace) * 100, 100);
  const color = pct >= 100 ? 'var(--red)' : pct >= 75 ? '#f59e0b' : 'var(--navy)';
  return (
    <div style={{ height: 4, background: 'var(--lightgray)', borderRadius: 2, overflow: 'hidden', marginTop: 8 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width .5s linear, background .5s' }} />
    </div>
  );
}

export default function NoShowClock() {
  const [active, setActive]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [declaring, setDeclaring] = useState({});
  const [ticks, setTicks]       = useState(0);

  const load = useCallback(() => {
    api.get('/no-show/active')
      .then(r => setActive(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live tick every 10 seconds
  useEffect(() => {
    const id = setInterval(() => setTicks(t => t + 1), 10000);
    return () => clearInterval(id);
  }, []);

  // Refresh from server every 30 seconds
  useEffect(() => {
    const id = setInterval(() => load(), 30000);
    return () => clearInterval(id);
  }, [load]);

  async function declare(jobId) {
    if (!confirm('Declare this job as a no-show? This will send notifications and retain the deposit.')) return;
    setDeclaring(p => ({ ...p, [jobId]: true }));
    try {
      await api.post(`/no-show/jobs/${jobId}/declare`, {});
      setActive(prev => prev.filter(j => j.id !== jobId));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to declare no-show.');
    } finally {
      setDeclaring(p => ({ ...p, [jobId]: false }));
    }
  }

  if (loading || active.length === 0) return null;

  return (
    <div className="dash-card" style={{ marginBottom: 20, borderLeft: '3px solid var(--red)' }}>
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--lightgray)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--red)', fontWeight: 700 }}>
          Active No-Show Clocks ({active.length})
        </span>
      </div>

      {active.map(job => {
        // Recalculate elapsed from clock_started_at + ticks (for live update)
        const startMs = new Date(job.no_show_clock_started_at).getTime();
        const elapsedMin = (Date.now() - startMs) / 60000;
        const graceMin   = parseFloat(job.grace_period_minutes) || 15;
        const isOverdue  = elapsedMin >= graceMin;
        const remaining  = Math.max(graceMin - elapsedMin, 0);

        return (
          <div key={job.id} style={{ padding: '16px 20px', borderBottom: '1px solid var(--lightgray)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 3 }}>
                  {job.client_name}
                  <span style={{ fontWeight: 400, color: 'var(--steel)', marginLeft: 8, fontSize: 12 }}>{job.service_type}</span>
                </div>
                {job.tech_name && <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 4 }}>Tech: {job.tech_name}</div>}
                {job.client_address && <div style={{ fontSize: 12, color: 'var(--steel)' }}>{job.client_address}</div>}
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 24, fontWeight: 700, color: isOverdue ? 'var(--red)' : 'var(--navy)', lineHeight: 1 }}>
                  {isOverdue ? `+${fmtElapsed(elapsedMin - graceMin)}` : fmtElapsed(remaining)}
                </div>
                <div style={{ fontSize: 10, color: isOverdue ? 'var(--red)' : 'var(--steel)', marginTop: 2 }}>
                  {isOverdue ? 'GRACE PERIOD EXCEEDED' : 'REMAINING'}
                </div>
                <CountdownBar elapsed={elapsedMin} grace={graceMin} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                disabled={declaring[job.id]}
                onClick={() => declare(job.id)}
                style={{ padding: '8px 18px', background: isOverdue ? 'var(--red)' : 'var(--navy)', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: declaring[job.id] ? 'wait' : 'pointer' }}>
                {declaring[job.id] ? 'Declaring…' : 'Declare No-Show'}
              </button>
              <div style={{ fontSize: 11, color: 'var(--steel)', alignSelf: 'center' }}>
                Grace: {graceMin}min · Elapsed: {Math.round(elapsedMin)}min
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
