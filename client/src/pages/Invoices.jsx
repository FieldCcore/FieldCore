import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import api from '../api';
import InvoiceDetail from '../components/InvoiceDetail';
import StatusBadge from '../components/StatusBadge';
const FILTERS = ['all', 'pending', 'paid', 'void'];

export default function Invoices() {
  const [invoices, setInvoices]     = useState([]);
  const [filter, setFilter]         = useState('all');
  const [selected, setSelected]     = useState(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    api.get('/invoices').then(r => setInvoices(r.data)).finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? invoices : invoices.filter(i => i.status === filter);

  const totals = {
    outstanding: invoices.filter(i => i.status === 'pending').reduce((s, i) => s + parseFloat(i.amount), 0),
    collected:   invoices.filter(i => i.status === 'paid').reduce((s, i) => s + parseFloat(i.amount), 0),
  };

  function handleUpdate(updated) {
    setInvoices(prev => prev.map(i => i.id === updated.id ? { ...i, ...updated } : i));
    setSelected(prev => prev ? { ...prev, ...updated } : null);
  }

  return (
    <div>
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-label">Outstanding</span>
          <span className="stat-value" style={{ color: 'var(--red)' }}>${totals.outstanding.toFixed(2)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Collected</span>
          <span className="stat-value" style={{ color: 'var(--green)' }}>${totals.collected.toFixed(2)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Invoices</span>
          <span className="stat-value">{invoices.length}</span>
        </div>
      </div>

      <div className="filter-tabs">
        {FILTERS.map(f => (
          <button
            key={f}
            className={`filter-tab ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            <span className="filter-count">
              {f === 'all' ? invoices.length : invoices.filter(i => i.status === f).length}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="muted">No {filter === 'all' ? '' : filter} invoices yet.</p>
      ) : (
        <div className="table-wrap"><table className="table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(inv => (
              <tr key={inv.id} className="clickable-row" onClick={() => setSelected(inv)}>
                <td><strong>{inv.client_name}</strong></td>
                <td>${parseFloat(inv.amount).toFixed(2)}</td>
                <td>
                  <StatusBadge status={inv.status} />
                </td>
                <td>{format(new Date(inv.created_at), 'MMM d, yyyy')}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <InvoiceDetail
              invoice={selected}
              onClose={() => setSelected(null)}
              onUpdate={handleUpdate}
            />
          </div>
        </div>
      )}
    </div>
  );
}
