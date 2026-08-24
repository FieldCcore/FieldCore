import React, { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { Search, X } from 'lucide-react';
import api from '../api';

export default function NewInvoiceModal({ onClose, onCreated }) {
  const [jobs, setJobs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [searchInput, setSearch]  = useState('');
  const [selectedId, setSelected] = useState(null);
  const [creating, setCreating]   = useState(false);
  const [createError, setCreateError] = useState('');

  const debounceRef = useRef(null);

  function fetchJobs(q = '') {
    setLoading(true);
    setFetchError('');
    const qs = q.trim() ? `?search=${encodeURIComponent(q.trim())}` : '';
    api.get(`/invoices/eligible-jobs${qs}`)
      .then(r => { setJobs(r.data.rows || []); })
      .catch(() => setFetchError('Could not load eligible jobs.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchJobs(); }, []);

  function handleSearch(val) {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchJobs(val), 300);
  }

  async function handleCreate() {
    if (!selectedId || creating) return;
    setCreating(true);
    setCreateError('');
    try {
      const res = await api.post('/invoices', { job_id: selectedId });
      onCreated(res.data);
    } catch (err) {
      const msg = (err.response?.data?.error || '').toLowerCase();
      if (msg.includes('complete')) {
        setCreateError('This job is not eligible for invoicing.');
      } else if (msg.includes('already') || msg.includes('exist') || msg.includes('duplicate')) {
        setCreateError('This job has already been invoiced.');
      } else {
        setCreateError('Could not create invoice. Try again.');
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="ni-modal">
      <div className="ni-modal-header">
        <div>
          <h2 className="ni-modal-title">New Invoice</h2>
          <p className="ni-modal-sub">Select a completed job to create an invoice.</p>
        </div>
        <button className="ni-close-btn" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      {/* Search */}
      <div className="ni-search-wrap">
        <Search size={14} className="ni-search-icon" />
        <input
          className="ni-search"
          type="search"
          placeholder="Search by client, service, or address…"
          value={searchInput}
          onChange={e => handleSearch(e.target.value)}
          autoFocus
        />
      </div>

      {/* Job list */}
      <div className="ni-job-list">
        {loading ? (
          <div className="ni-state">Loading…</div>
        ) : fetchError ? (
          <div className="ni-state ni-state--error">{fetchError}</div>
        ) : jobs.length === 0 ? (
          <div className="ni-empty">
            <p className="ni-empty-primary">No completed jobs are ready to invoice.</p>
            <p className="ni-empty-secondary">
              Invoices can be created after eligible jobs are completed.
            </p>
          </div>
        ) : (
          jobs.map(j => (
            <button
              key={j.id}
              className={`ni-job-row${selectedId === j.id ? ' selected' : ''}`}
              onClick={() => { setSelected(j.id); setCreateError(''); }}
            >
              <div className="ni-job-top">
                <span className="ni-job-client">{j.client_name}</span>
                <span className="ni-job-amount">
                  ${parseFloat(j.amount || 0).toFixed(2)}
                </span>
              </div>
              <div className="ni-job-service">{j.service_type || 'Service'}</div>
              <div className="ni-job-meta">
                Completed {j.scheduled_at
                  ? format(new Date(j.scheduled_at), 'MMM d, yyyy')
                  : '—'}
                {j.address && <span className="ni-job-addr"> · {j.address}</span>}
              </div>
            </button>
          ))
        )}
      </div>

      {createError && <p className="ni-create-error">{createError}</p>}

      {/* Footer */}
      <div className="ni-modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          onClick={handleCreate}
          disabled={!selectedId || creating}
        >
          {creating ? 'Creating…' : 'Create Invoice'}
        </button>
      </div>
    </div>
  );
}
