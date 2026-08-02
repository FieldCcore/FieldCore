import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';

const REFRESH_MS = 30_000;

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

export function useDispatchKpiMetrics() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    try {
      const r = await api.get('/dispatch/summary');
      if (seq !== seqRef.current) return;
      const data = r.data;
      const m = Array.isArray(data.metrics) ? data.metrics : buildLegacyMetrics(data);
      setMetrics(m);
      setLoading(false);
    } catch {
      if (seq !== seqRef.current) return;
      setLoading(false);
      setMetrics(prev =>
        prev ? prev.map(m => ({ ...m, status: 'stale' })) : FALLBACK_METRICS
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

  return { metrics: metrics ?? FALLBACK_METRICS, loading: loading && !metrics };
}
