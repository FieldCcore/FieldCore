import { useEffect, useState } from 'react';
import api from '../api';

const REFRESH_MS = 30000;

export default function DispatchKPIStrip({ onCardClick }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const r = await api.get('/dispatch/summary');
        if (alive) { setData(r.data); setLoading(false); }
      } catch {
        if (alive) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const cards = [
    {
      key:   'live',
      label: 'Live Techs',
      value: data?.liveTechnicians ?? 0,
      sub:   `${data?.liveTechnicians ?? 0} online`,
      color: 'var(--green)',
    },
    {
      key:   'active',
      label: 'Active Jobs',
      value: data?.activeJobs ?? 0,
      sub:   'in progress',
      color: 'var(--blue)',
    },
    {
      key:   'today',
      label: "Today's Jobs",
      value: data?.todaysJobs ?? 0,
      sub:   data?.unassignedJobs
               ? `${data.unassignedJobs} unassigned`
               : 'scheduled today',
      color: 'var(--navy)',
    },
    {
      key:   'completed',
      label: 'Completed',
      value: data?.completedToday ?? 0,
      sub:   'today',
      color: 'var(--green)',
    },
    {
      key:   'response',
      label: 'Avg Response',
      value: data?.avgResponseMin != null ? `${data.avgResponseMin}m` : '—',
      sub:   'today',
      color: 'var(--amber)',
    },
  ];

  if (loading) {
    return (
      <div className="dispatch-kpi-strip" aria-label="KPI metrics loading">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="dispatch-kpi-card dispatch-kpi-skel" aria-hidden="true" />
        ))}
      </div>
    );
  }

  return (
    <div className="dispatch-kpi-strip" role="list" aria-label="Dispatch metrics">
      {cards.map(c => (
        <button
          key={c.key}
          type="button"
          role="listitem"
          className="dispatch-kpi-card"
          onClick={() => onCardClick?.(c.key)}
          aria-label={`${c.label}: ${c.value}`}
        >
          <div className="dispatch-kpi-value" style={{ color: c.color }}>
            {c.value}
          </div>
          <div className="dispatch-kpi-label">{c.label}</div>
          <div className="dispatch-kpi-sub">{c.sub}</div>
        </button>
      ))}
    </div>
  );
}
