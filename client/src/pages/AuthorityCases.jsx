import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';
import { AuLoading, AuError, AuBadge, AuEmpty, fmtDate } from './AuthorityShared';

const STATUS_FILTER_OPTS = [
  { value: '', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'AWAITING_DOCUMENTS', label: 'Awaiting Documents' },
  { value: 'PENDING_EXTRACTION', label: 'Pending Extraction' },
  { value: 'EXTRACTION_COMPLETE', label: 'Extraction Complete' },
  { value: 'PENDING_HUMAN_REVIEW', label: 'Pending Review' },
  { value: 'HUMAN_REVIEW_IN_PROGRESS', label: 'In Review' },
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
    api.get('/authority/queue')
      .then(r => { setCases(r.data); setError(''); })
      .catch(e => setError(e.response?.data?.error || 'Failed to load cases.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    try {
      const res = await api.post('/authority/cases', { externalCaseReference: newCaseRef || null });
      nav(`/authority/cases/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create case.');
    }
  }

  const filtered = statusFilter
    ? cases.filter(c => c.status === statusFilter)
    : cases;

  return (
    <div className="au-page">
      <div className="au-page-header">
        <div>
          <div className="au-page-title">Cases</div>
          <div className="au-page-subtitle">All Authority review cases</div>
        </div>
        <button className="au-btn au-btn--primary" onClick={() => setCreating(c => !c)}>
          {creating ? 'Cancel' : '+ New Case'}
        </button>
      </div>

      {creating && (
        <div className="au-card" style={{ marginBottom: 20, padding: 0 }}>
          <div className="au-card-header"><span className="au-card-title">Create New Case</span></div>
          <div className="au-card-body">
            <form onSubmit={handleCreate} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label className="au-label">External Case Reference (optional)</label>
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
        <div style={{ fontSize: 12, color: 'var(--steel)' }}>{filtered.length} case{filtered.length !== 1 ? 's' : ''}</div>
      </div>

      {loading ? <AuLoading /> : (
        <div className="au-table-card">
          {!filtered.length ? (
            <AuEmpty text="No cases found." />
          ) : (
            <table className="au-table">
              <thead>
                <tr>
                  <th>Case Reference</th>
                  <th>Status</th>
                  <th>Documents</th>
                  <th>Instruments</th>
                  <th>Assigned</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} onClick={() => nav(`/authority/cases/${c.id}`)}>
                    <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>
                      {c.external_case_reference || c.id.slice(0, 8) + '…'}
                    </td>
                    <td><AuBadge status={c.status} /></td>
                    <td>{c.document_count ?? 0}</td>
                    <td>{c.instrument_count ?? 0}</td>
                    <td style={{ fontSize: 12, color: 'var(--steel)' }}>
                      {c.assigned_to ? '✓' : '—'}
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
