import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';
import { AuLoading, AuError, AuBadge, AuEmpty, fmtDate } from './AuthorityShared';

const STATUS_FILTER_OPTS = [
  { value: '', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'AWAITING_DOCUMENTS', label: 'Awaiting documents' },
  { value: 'PENDING_EXTRACTION', label: 'Pending extraction' },
  { value: 'EXTRACTION_COMPLETE', label: 'Extraction complete' },
  { value: 'PENDING_HUMAN_REVIEW', label: 'Pending review' },
  { value: 'HUMAN_REVIEW_IN_PROGRESS', label: 'In progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default function AuthorityCases() {
  const [cases,      setCases]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [creating,   setCreating]   = useState(false);
  const [newCaseRef, setNewCaseRef] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const nav = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    if (params.get('new') === '1') setCreating(true);
  }, []); // eslint-disable-line

  const load = useCallback(() => {
    setLoading(true);
    const params = statusFilter ? { params: { status: statusFilter } } : {};
    api.get('/authority/cases', params)
      .then(r => { setCases(r.data); setError(''); })
      .catch(e => setError(e.response?.data?.error || 'Failed to load cases.'))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { load(); }, [load, statusFilter]);

  async function handleCreate(e) {
    e.preventDefault();
    try {
      const res = await api.post('/authority/cases', { externalCaseReference: newCaseRef || null });
      nav(`/authority/cases/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create case.');
    }
  }

  return (
    <div className="au-page">
      <div className="au-page-header">
        <div>
          <div className="au-page-title">Cases</div>
          <div className="au-page-subtitle">Master Authority case register across all lifecycle states</div>
        </div>
        <button className="au-btn au-btn--primary" onClick={() => setCreating(c => !c)}>
          {creating ? 'Cancel' : '+ New case'}
        </button>
      </div>

      {creating && (
        <div className="au-card" style={{ marginBottom: 20, padding: 0 }}>
          <div className="au-card-header"><span className="au-card-title">Create New Case</span></div>
          <div className="au-card-body">
            <form onSubmit={handleCreate} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label className="au-label">External case reference (optional)</label>
                <input
                  className="au-input"
                  value={newCaseRef}
                  onChange={e => setNewCaseRef(e.target.value)}
                  placeholder="e.g. CASE-2026-001"
                />
              </div>
              <button className="au-btn au-btn--primary" type="submit">Create</button>
            </form>
          </div>
        </div>
      )}

      <AuError msg={error} />

      <div className="au-toolbar">
        <select className="au-select" style={{ width: 220 }}
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          {STATUS_FILTER_OPTS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div style={{ fontSize: 12, color: 'var(--steel)' }}>{cases.length} case{cases.length !== 1 ? 's' : ''}</div>
      </div>

      {loading ? <AuLoading /> : (
        <div className="au-table-card">
          {!cases.length ? (
            <AuEmpty text="No cases found." />
          ) : (
            <table className="au-table">
              <thead>
                <tr>
                  <th>Case reference</th>
                  <th>Status</th>
                  <th>Documents</th>
                  <th>Instruments</th>
                  <th>Assigned to</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {cases.map(c => (
                  <tr key={c.id} onClick={() => nav(`/authority/cases/${c.id}`)}>
                    <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>
                      {c.external_case_reference || <span style={{ color: 'var(--steel)', fontStyle: 'italic' }}>No reference</span>}
                    </td>
                    <td><AuBadge status={c.status} /></td>
                    <td>{c.document_count ?? 0}</td>
                    <td>{c.instrument_count ?? 0}</td>
                    <td style={{ fontSize: 12, color: 'var(--steel)' }}>
                      {c.assigned_to ? (c.reviewer_name || '—') : 'Unassigned'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--steel)' }}>
                      {fmtDate(c.created_at)}
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
