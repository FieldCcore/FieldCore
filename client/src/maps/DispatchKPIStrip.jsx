import { useEffect, useRef, useState, useCallback } from 'react';
import api from '../api';

const REFRESH_MS = 30_000;

export default function DispatchKPIStrip({ onCardClick }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [stale,   setStale]   = useState(false);
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    try {
      const r = await api.get('/dispatch/summary');
      if (seq !== seqRef.current) return; // superseded by a newer request
      setData(r.data);
      setLoading(false);
      setStale(false);
    } catch {
      if (seq !== seqRef.current) return;
      setLoading(false);
      setStale(true); // retain previous data; mark stale
    }
  }, []);

  useEffect(() => {
    load();

    const id = setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_MS);

    function onVisible() {
      if (!document.hidden) load();
    }
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      seqRef.current++; // invalidate any in-flight request
    };
  }, [load]);

  const d = data;

  const cards = [
    {
      key:   'live',
      label: 'Live Techs',
      value: d?.liveTechnicians?.total ?? 0,
      sub:   d?.liveTechnicians != null
               ? `${d.liveTechnicians.online} online · ${d.liveTechnicians.stale} stale`
               : '—',
      color: 'var(--green)',
    },
    {
      key:   'active',
      label: 'Active Jobs',
      value: d?.activeJobs?.total ?? 0,
      sub:   d?.activeJobs?.inProgress != null
               ? `${d.activeJobs.inProgress} in progress`
               : '—',
      color: 'var(--blue)',
    },
    {
      key:   'today',
      label: "Today's Jobs",
      value: d?.todaysJobs?.total ?? 0,
      sub:   d?.todaysJobs != null
               ? (d.todaysJobs.unassigned > 0
                   ? `${d.todaysJobs.unassigned} unassigned`
                   : 'all assigned')
               : '—',
      color: 'var(--navy)',
    },
    {
      key:   'completed',
      label: 'Completed',
      value: d?.completedToday?.total ?? 0,
      sub:   'today',
      color: 'var(--green)',
    },
    {
      key:   'response',
      label: 'Avg Response',
      value: d?.averageResponseTime?.minutes != null
               ? `${d.averageResponseTime.minutes}m`
               : '—',
      sub:   d?.averageResponseTime?.sampleSize != null && d.averageResponseTime.sampleSize > 0
               ? `${d.averageResponseTime.sampleSize} job${d.averageResponseTime.sampleSize !== 1 ? 's' : ''}`
               : 'No data',
      color: 'var(--amber)',
    },
  ];

  if (loading && !data) {
    return (
      <div className="dispatch-kpi-strip" aria-label="KPI metrics loading">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="dispatch-kpi-card dispatch-kpi-skel" aria-hidden="true" />
        ))}
      </div>
    );
  }

  return (
    <ul className="dispatch-kpi-strip" aria-label="Dispatch metrics">
      {cards.map(c => (
        <li key={c.key}>
          <button
            type="button"
            className="dispatch-kpi-card"
            onClick={() => onCardClick?.(c.key)}
            aria-label={`${c.label}: ${c.value}`}
          >
            <div className="dispatch-kpi-value" style={{ color: c.color }}>
              {c.value}
              {stale && <span className="dispatch-kpi-stale" title="Refresh failed — showing last data" aria-hidden="true" />}
            </div>
            <div className="dispatch-kpi-label">{c.label}</div>
            <div className="dispatch-kpi-sub">{c.sub}</div>
          </button>
        </li>
      ))}
    </ul>
  );
}
