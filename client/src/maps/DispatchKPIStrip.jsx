import { useEffect, useRef, useState, useCallback } from 'react';
import api from '../api';
import DispatchKpiCard from './DispatchKpiCard';

const REFRESH_MS = 30_000;

// Fallback metric for when the API fails entirely with no prior data
function unavailableMetric(key, label) {
  return {
    key, label, status: 'unavailable', value: null, displayValue: '—',
    supportingText: 'Temporarily unavailable',
    enabled: true, configured: true, sampleSize: null,
    reasonCode: 'QUERY_FAILED', configurePath: null,
  };
}

const FALLBACK_METRICS = [
  unavailableMetric('liveTechnicians', 'Live Techs'),
  unavailableMetric('activeJobs',      'Active Jobs'),
  unavailableMetric('todaysJobs',      "Today's Jobs"),
  unavailableMetric('completedToday',  'Completed'),
];

export default function DispatchKPIStrip({ onCardClick, onConfigure, userRole, activeKpiKey }) {
  const [metrics, setMetrics] = useState(null);   // null = initial loading
  const [loading, setLoading] = useState(true);
  const [stale,   setStale]   = useState(false);
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    try {
      const r = await api.get('/dispatch/summary');
      if (seq !== seqRef.current) return;

      // Use normalized metrics array if present; fall back to legacy shape
      const data = r.data;
      const m = Array.isArray(data.metrics) ? data.metrics : buildLegacyMetrics(data);

      setMetrics(m.map(metric => stale ? { ...metric, status: 'stale' } : metric));
      setLoading(false);
      setStale(false);
    } catch {
      if (seq !== seqRef.current) return;
      setLoading(false);
      setStale(true);
      // Mark any existing metrics as stale; unavailable if none yet
      setMetrics(prev =>
        prev
          ? prev.map(m => ({ ...m, status: 'stale' }))
          : FALLBACK_METRICS
      );
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    function onVisible() { if (!document.hidden) load(); }
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      seqRef.current++;
    };
  }, [load]);

  // Loading state: show 4 skeletons
  if (loading && !metrics) {
    return (
      <ul className="dispatch-kpi-strip" aria-label="KPI metrics loading">
        {[...Array(4)].map((_, i) => (
          <li key={i}>
            <div className="dispatch-kpi-card dispatch-kpi-skel" aria-hidden="true" />
          </li>
        ))}
      </ul>
    );
  }

  const displayMetrics = metrics ?? FALLBACK_METRICS;

  return (
    <ul className="dispatch-kpi-strip" role="list" aria-label="Dispatch metrics">
      {displayMetrics.map(m => (
        <li key={m.key}>
          <DispatchKpiCard
            metric={m}
            onClick={onCardClick}
            onConfigure={onConfigure}
            userRole={userRole}
            selected={activeKpiKey === m.key}
          />
        </li>
      ))}
    </ul>
  );
}

// Build metrics array from the legacy response shape (backward compat)
function buildLegacyMetrics(data) {
  const d = data || {};
  return [
    {
      key: 'liveTechnicians', label: 'Live Techs', status: 'active',
      value: d.liveTechnicians?.total ?? 0,
      displayValue: String(d.liveTechnicians?.total ?? 0),
      supportingText: d.liveTechnicians
        ? `${d.liveTechnicians.online} online · ${d.liveTechnicians.stale} stale` : '—',
    },
    {
      key: 'activeJobs', label: 'Active Jobs', status: 'active',
      value: d.activeJobs?.total ?? 0,
      displayValue: String(d.activeJobs?.total ?? 0),
      supportingText: d.activeJobs?.inProgress != null
        ? `${d.activeJobs.inProgress} in progress` : '—',
    },
    {
      key: 'todaysJobs', label: "Today's Jobs", status: 'active',
      value: d.todaysJobs?.total ?? 0,
      displayValue: String(d.todaysJobs?.total ?? 0),
      supportingText: d.todaysJobs
        ? (d.todaysJobs.unassigned > 0 ? `${d.todaysJobs.unassigned} unassigned` : 'all assigned')
        : '—',
    },
    {
      key: 'completedToday', label: 'Completed', status: 'active',
      value: d.completedToday?.total ?? 0,
      displayValue: String(d.completedToday?.total ?? 0),
      supportingText: 'today',
    },
  ];
}
