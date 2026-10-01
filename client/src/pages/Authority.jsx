import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { AuLoading, AuError, AuBadge, fmtDate } from './AuthorityShared';

export default function Authority() {
  const [queue,   setQueue]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.get('/authority/queue')
      .then(r => setQueue(r.data))
      .catch(e => setError(e.response?.data?.error || 'Failed to load review queue.'))
      .finally(() => setLoading(false));
  }, []);

  const pending   = queue.filter(c => c.status === 'PENDING_HUMAN_REVIEW').length;
  const inProgress = queue.filter(c => c.status === 'HUMAN_REVIEW_IN_PROGRESS').length;

  return (
    <div className="au-page">
      <div className="au-page-header">
        <div>
          <div className="au-page-title">Dashboard</div>
          <div className="au-page-subtitle">Operational home — work requiring attention and current review status</div>
        </div>
        <Link to="/authority/cases">
          <button className="au-btn au-btn--primary">+ New Case</button>
        </Link>
      </div>

      <div className="au-section-heading">Review Queue Summary</div>
      <div className="au-kpi-strip">
        <div className="au-kpi-card">
          <div className="au-kpi-label">Pending review</div>
          <div className="au-kpi-value">{loading ? '—' : pending}</div>
          <div className="au-kpi-meta">cases awaiting reviewer</div>
        </div>
        <div className="au-kpi-card">
          <div className="au-kpi-label">In progress</div>
          <div className="au-kpi-value">{loading ? '—' : inProgress}</div>
          <div className="au-kpi-meta">currently being reviewed</div>
        </div>
        <div className="au-kpi-card">
          <div className="au-kpi-label">Total in queue</div>
          <div className="au-kpi-value">{loading ? '—' : queue.length}</div>
          <div className="au-kpi-meta">pending + in-progress cases</div>
        </div>
        <div className="au-kpi-card">
          <div className="au-kpi-label">Oldest in queue</div>
          <div className="au-kpi-value" style={{ fontSize: 16, paddingTop: 4 }}>
            {loading || !queue.length ? '—' : fmtDate(queue[0]?.status_changed_at)}
          </div>
          <div className="au-kpi-meta">in current review state since</div>
        </div>
      </div>

      <AuError msg={error} />

      <div className="au-table-card">
        <div className="au-card-header">
          <span className="au-card-title">Review Queue</span>
          <Link to="/authority/queue" style={{ fontSize: 12, color: 'var(--slate)' }}>View all →</Link>
        </div>
        {loading ? <AuLoading /> : (
          <table className="au-table">
            <thead>
              <tr>
                <th>Case</th>
                <th>Status</th>
                <th>Documents</th>
                <th>Instruments</th>
                <th>Reviewer</th>
                <th>In queue since</th>
              </tr>
            </thead>
            <tbody>
              {queue.slice(0, 8).map(c => (
                <tr key={c.id} onClick={() => { window.location.href = `/authority/cases/${c.id}`; }}>
                  <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>
                    {c.external_case_reference || <span style={{ color: 'var(--steel)', fontStyle: 'italic' }}>No reference</span>}
                  </td>
                  <td><AuBadge status={c.status} /></td>
                  <td>{c.document_count}</td>
                  <td>{c.instrument_count}</td>
                  <td style={{ fontSize: 12, color: 'var(--steel)' }}>
                    {c.assigned_to ? (c.reviewer_name || '—') : 'Unassigned'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--steel)' }}>
                    {fmtDate(c.status_changed_at)}
                  </td>
                </tr>
              ))}
              {!queue.length && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>
                  No cases in review queue.
                </td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
