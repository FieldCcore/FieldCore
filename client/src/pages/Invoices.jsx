import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import api from '../api';
import InvoiceDetail from '../components/InvoiceDetail';
import StatusBadge from '../components/StatusBadge';

const FILTERS = ['all', 'pending', 'paid', 'void'];
const FILTER_LABELS = { all: 'All', pending: 'Pending', paid: 'Paid', void: 'Void' };

function fmtAmt(n) {
  return '$' + parseFloat(n || 0).toFixed(2);
}

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [filter, setFilter]     = useState('all');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    api.get('/invoices')
      .then(r => setInvoices(r.data))
      .catch(() => setError('Could not load invoices.'))
      .finally(() => setLoading(false));
  }, []);

  const count    = (f) => f === 'all' ? invoices.length : invoices.filter(i => i.status === f).length;
  const filtered = filter === 'all' ? invoices : invoices.filter(i => i.status === filter);

  const outstanding = invoices.filter(i => i.status === 'pending').reduce((s, i) => s + parseFloat(i.amount || 0), 0);
  const collected   = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + parseFloat(i.amount || 0), 0);

  function handleUpdate(updated) {
    setInvoices(prev => prev.map(i => i.id === updated.id ? { ...i, ...updated } : i));
    setSelected(prev => prev ? { ...prev, ...updated } : null);
  }

  return (
    <div>
      <div className="page-header">
        <h1>Invoices</h1>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────── */}
      <div className="stats-row" style={{ marginBottom: 24 }}>
        <div className="stat-card stat-card--accent-red">
          <span className="stat-label">Outstanding</span>
          <span className="stat-value">{fmtAmt(outstanding)}</span>
        </div>
        <div className="stat-card stat-card--accent-green">
          <span className="stat-label">Collected</span>
          <span className="stat-value">{fmtAmt(collected)}</span>
        </div>
        <div className="stat-card stat-card--accent-blue">
          <span className="stat-label">Total Invoices</span>
          <span className="stat-value">{invoices.length}</span>
        </div>
      </div>

      {/* ── Status Filters ────────────────────────────────────── */}
      <div className="filter-tabs" style={{ marginBottom: 24 }}>
        {FILTERS.map(f => (
          <button
            key={f}
            className={`filter-tab${filter === f ? ' active' : ''}`}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
          >
            {FILTER_LABELS[f]}
            <span className="filter-count">{count(f)}</span>
          </button>
        ))}
      </div>

      {/* ── Section Heading ───────────────────────────────────── */}
      <div className="inv-section-head">
        <span className="inv-section-title">Invoices</span>
        {!loading && !error && (
          <span className="inv-section-count">
            {filtered.length} {filtered.length === 1 ? 'invoice' : 'invoices'}
          </span>
        )}
      </div>

      {/* ── Content ───────────────────────────────────────────── */}
      {loading ? (
        <div className="inv-state">Loading…</div>
      ) : error ? (
        <div className="inv-state inv-state--error">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="inv-empty">
          <p className="inv-empty-primary">No invoices found.</p>
          {filter === 'all' && (
            <p className="inv-empty-secondary">Invoices will appear here once created.</p>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
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
                <tr
                  key={inv.id}
                  className="clickable-row inv-table-row"
                  onClick={() => setSelected(inv)}
                >
                  <td><strong>{inv.client_name}</strong></td>
                  <td>{fmtAmt(inv.amount)}</td>
                  <td><StatusBadge status={inv.status} /></td>
                  <td>{format(new Date(inv.created_at), 'MMM d, yyyy')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Invoice Detail Modal ──────────────────────────────── */}
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
