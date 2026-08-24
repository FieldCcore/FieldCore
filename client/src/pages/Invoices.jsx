import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import api from '../api';
import InvoiceDetail from '../components/InvoiceDetail';
import StatusBadge from '../components/StatusBadge';

const PAGE_SIZE = 50;
const FILTERS = ['all', 'pending', 'paid', 'void', 'past_due'];
const FILTER_LABELS = { all: 'All', pending: 'Pending', paid: 'Paid', void: 'Void', past_due: 'Past Due' };

const EMPTY_KPIS = {
  outstanding: 0, collected: 0, pastDue: 0, pastDueCount: 0, totalCount: 0,
  counts: { all: 0, pending: 0, paid: 0, void: 0, past_due: 0 },
};

function fmtAmt(n) {
  if (n == null) return '—';
  return '$' + parseFloat(n).toFixed(2);
}

function fmtDate(d) {
  if (!d) return '—';
  return format(new Date(d), 'MMM d, yyyy');
}

function SortTh({ label, col, currentSort, currentOrder, onSort }) {
  const active = currentSort === col;
  const Icon = active
    ? (currentOrder === 'ASC' ? ChevronUp : ChevronDown)
    : ChevronsUpDown;
  return (
    <th
      className="inv-th-sortable"
      onClick={() => onSort(col)}
      aria-sort={active ? (currentOrder === 'ASC' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      <Icon size={12} className="inv-sort-icon" />
    </th>
  );
}

export default function Invoices() {
  const navigate = useNavigate();

  const [invoices, setInvoices]   = useState([]);
  const [kpis, setKpis]           = useState(EMPTY_KPIS);
  const [total, setTotal]         = useState(0);
  const [selected, setSelected]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [searchInput, setSearchInput] = useState('');

  const [params, setParams] = useState({
    page: 1, status: 'all', sort: 'created_at', order: 'DESC', search: '',
  });

  const abortRef    = useRef(null);
  const debounceRef = useRef(null);

  function doFetch(p) {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const qs = new URLSearchParams({
      page:     p.page,
      pageSize: PAGE_SIZE,
      status:   p.status,
      sort:     p.sort,
      order:    p.order,
    });
    if (p.search.trim()) qs.set('search', p.search.trim());

    setLoading(true);
    setError(null);

    api.get(`/invoices?${qs}`, { signal: ctrl.signal })
      .then(r => {
        setInvoices(r.data.rows);
        setKpis(r.data.kpis);
        setTotal(r.data.total);
      })
      .catch(err => {
        if (err.name !== 'CanceledError' && err.code !== 'ERR_CANCELED') {
          setError('Could not load invoices.');
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    doFetch(params);
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [params]);

  function handleFilterChange(f) {
    setParams(p => ({ ...p, status: f, page: 1 }));
  }

  function handleSortChange(col) {
    setParams(p => ({
      ...p,
      sort:  col,
      order: p.sort === col ? (p.order === 'ASC' ? 'DESC' : 'ASC') : 'ASC',
      page:  1,
    }));
  }

  function handleSearchChange(val) {
    setSearchInput(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setParams(p => ({ ...p, search: val, page: 1 }));
    }, 300);
  }

  function setPageNum(pg) {
    setParams(p => ({ ...p, page: pg }));
  }

  function handleUpdate(updated) {
    setInvoices(prev => prev.map(i => i.id === updated.id ? { ...i, ...updated } : i));
    setSelected(prev => prev ? { ...prev, ...updated } : null);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div className="page-header">
        <h1>Invoices</h1>
        <button className="btn btn-primary" onClick={() => navigate('/invoices?new=1')}>
          + New Invoice
        </button>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────── */}
      <div className="stats-row stats-row--4" style={{ marginBottom: 24 }}>
        <div className="stat-card stat-card--accent-red">
          <span className="stat-label">Outstanding</span>
          <span className="stat-value">{fmtAmt(kpis.outstanding)}</span>
        </div>
        <div className="stat-card stat-card--accent-green">
          <span className="stat-label">Collected</span>
          <span className="stat-value">{fmtAmt(kpis.collected)}</span>
        </div>
        <div className="stat-card stat-card--accent-amber">
          <span className="stat-label">Past Due</span>
          <span className="stat-value">{fmtAmt(kpis.pastDue)}</span>
        </div>
        <div className="stat-card stat-card--accent-blue">
          <span className="stat-label">Total Invoices</span>
          <span className="stat-value">{kpis.totalCount}</span>
        </div>
      </div>

      {/* ── Controls: Filters + Search ────────────────────────── */}
      <div className="inv-controls">
        <div className="filter-tabs">
          {FILTERS.map(f => (
            <button
              key={f}
              className={`filter-tab${params.status === f ? ' active' : ''}`}
              onClick={() => handleFilterChange(f)}
              aria-pressed={params.status === f}
            >
              {FILTER_LABELS[f]}
              <span className="filter-count">{kpis.counts[f]}</span>
            </button>
          ))}
        </div>
        <div className="inv-search-wrap">
          <input
            className="inv-search"
            type="search"
            placeholder="Search invoices…"
            value={searchInput}
            onChange={e => handleSearchChange(e.target.value)}
            aria-label="Search invoices"
          />
        </div>
      </div>

      {/* ── Section Heading ───────────────────────────────────── */}
      <div className="inv-section-head">
        <span className="inv-section-title">Invoices</span>
        {!loading && !error && (
          <span className="inv-section-count">
            {total} {total === 1 ? 'invoice' : 'invoices'}
          </span>
        )}
      </div>

      {/* ── Content ───────────────────────────────────────────── */}
      {loading ? (
        <div className="inv-state">Loading…</div>
      ) : error ? (
        <div className="inv-state inv-state--error">{error}</div>
      ) : invoices.length === 0 ? (
        <div className="inv-empty">
          <p className="inv-empty-primary">No invoices found.</p>
          {params.status === 'all' && !params.search && (
            <p className="inv-empty-secondary">Invoices will appear here once created.</p>
          )}
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <SortTh label="Client"    col="client"         currentSort={params.sort} currentOrder={params.order} onSort={handleSortChange} />
                  <SortTh label="Invoice #" col="invoice_number" currentSort={params.sort} currentOrder={params.order} onSort={handleSortChange} />
                  <SortTh label="Due Date"  col="due_date"       currentSort={params.sort} currentOrder={params.order} onSort={handleSortChange} />
                  <th>Subject</th>
                  <SortTh label="Status"    col="status"         currentSort={params.sort} currentOrder={params.order} onSort={handleSortChange} />
                  <SortTh label="Total"     col="amount"         currentSort={params.sort} currentOrder={params.order} onSort={handleSortChange} />
                  <SortTh label="Balance"   col="balance"        currentSort={params.sort} currentOrder={params.order} onSort={handleSortChange} />
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr
                    key={inv.id}
                    className="clickable-row inv-table-row"
                    onClick={() => setSelected(inv)}
                  >
                    <td><strong>{inv.client_name}</strong></td>
                    <td className="inv-num">#{inv.invoice_number}</td>
                    <td>{fmtDate(inv.due_date)}</td>
                    <td>{inv.service_type || '—'}</td>
                    <td><StatusBadge status={inv.is_past_due ? 'past_due' : inv.status} /></td>
                    <td>{fmtAmt(inv.amount)}</td>
                    <td>{inv.balance == null ? '—' : fmtAmt(inv.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="inv-pagination">
              <button
                className="inv-page-btn"
                disabled={params.page <= 1}
                onClick={() => setPageNum(params.page - 1)}
              >
                Prev
              </button>
              <span className="inv-page-info">
                Page {params.page} of {totalPages}
              </span>
              <button
                className="inv-page-btn"
                disabled={params.page >= totalPages}
                onClick={() => setPageNum(params.page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
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
