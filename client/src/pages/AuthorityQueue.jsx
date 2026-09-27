import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { AuLoading, AuError, AuBadge, AuEmpty, fmtDate } from './AuthorityShared';

export default function AuthorityQueue() {
  const [queue,    setQueue]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [claiming, setClaiming] = useState(null);
  const nav = useNavigate();

  const load = useCallback(() => {
    setLoading(true);
    api.get('/authority/queue')
      .then(r => { setQueue(r.data); setError(''); })
      .catch(e => setError(e.response?.data?.error || 'Failed to load queue.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleClaim(caseId) {
    setClaiming(caseId);
    try {
      await api.post(`/authority/cases/${caseId}/claim`);
      nav(`/authority/cases/${caseId}`);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to claim case.');
      setClaiming(null);
    }
  }

  return (
    <div className="au-page">
      <div className="au-page-header">
        <div>
          <div className="au-page-title">Review Queue</div>
          <div className="au-page-subtitle">Cases pending human review</div>
        </div>
        <button className="au-btn au-btn--outline" onClick={load}>Refresh</button>
      </div>

      <AuError msg={error} />

      {loading ? <AuLoading /> : (
        <div className="au-table-card">
          {!queue.length ? (
            <AuEmpty text="No cases in the review queue." />
          ) : (
            <table className="au-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Status</th>
                  <th>Documents</th>
                  <th>Instruments</th>
                  <th>Assigned To</th>
                  <th>In Queue Since</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {queue.map(c => (
                  <tr key={c.id} onClick={() => nav(`/authority/cases/${c.id}`)}>
                    <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>
                      {c.external_case_reference || c.id.slice(0, 8) + '…'}
                    </td>
                    <td><AuBadge status={c.status} /></td>
                    <td>{c.document_count}</td>
                    <td>{c.instrument_count}</td>
                    <td style={{ fontSize: 12, color: 'var(--steel)' }}>
                      {c.assigned_to ? '✓ Assigned' : '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--steel)' }}>
                      {fmtDate(c.status_changed_at)}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button
                        className="au-btn au-btn--primary"
                        style={{ padding: '5px 12px', fontSize: 12 }}
                        disabled={claiming === c.id}
                        onClick={() => handleClaim(c.id)}
                      >
                        {claiming === c.id ? 'Claiming…' : 'Claim'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
