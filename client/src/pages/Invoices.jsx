import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, SlidersHorizontal, X, Check } from 'lucide-react';
import api from '../api';
import InvoiceDetail from '../components/InvoiceDetail';
import InvoiceBuilder from '../components/InvoiceBuilder';
import StatusBadge from '../components/StatusBadge';

const PAGE_SIZE = 50;
const FILTERS      = ['all', 'draft', 'pending', 'paid', 'void', 'past_due'];
const FILTER_LABELS = { all: 'All', draft: 'Draft', pending: 'Pending', paid: 'Paid', void: 'Void', past_due: 'Past Due' };
const DATE_PRESETS = ['all', 'today', 'week', 'month', 'last30'];
const DATE_LABELS  = { all: 'All time', today: 'Today', week: 'This week', month: 'This month', last30: 'Last 30 days' };

const EMPTY_KPIS = {
  outstanding: 0, collected: 0, pastDue: 0, pastDueCount: 0, totalCount: 0,
  issuedCount: 0, issuedTotal: 0, averageInvoice: 0,
  counts: { all: 0, draft: 0, pending: 0, paid: 0, void: 0, past_due: 0 },
};

function fmtAmt(n) {
  if (n == null) return '—';
  return '$' + parseFloat(n).toFixed(2);
}

function fmtDate(d) {
  if (!d) return '—';
  return format(new Date(d), 'MMM d, yyyy');
}

function getDateRange(preset) {
  const today = new Date();
  if (preset === 'today') {
    const d = format(today, 'yyyy-MM-dd');
    return { start: d, end: d };
  }
  if (preset === 'week') {
    return {
      start: format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      end:   format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    };
  }
  if (preset === 'month') {
    return {
      start: format(startOfMonth(today), 'yyyy-MM-dd'),
      end:   format(endOfMonth(today), 'yyyy-MM-dd'),
    };
  }
  if (preset === 'last30') {
    return {
      start: format(subDays(today, 30), 'yyyy-MM-dd'),
      end:   format(today, 'yyyy-MM-dd'),
    };
  }
  return { start: '', end: '' };
}

function SortTh({ label, col, currentSort, currentOrder, onSort, extraClass }) {
  const active = currentSort === col;
  const Icon = active
    ? (currentOrder === 'ASC' ? ChevronUp : ChevronDown)
    : ChevronsUpDown;
  return (
    <th
      className={`inv-th-sortable${extraClass ? ` ${extraClass}` : ''}`}
      onClick={() => onSort(col)}
      aria-sort={active ? (currentOrder === 'ASC' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      <Icon size={12} className={`inv-sort-icon${active ? ' inv-sort-icon--active' : ''}`} />
    </th>
  );
}

export default function Invoices() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [invoices, setInvoices] = useState([]);
  const [kpis, setKpis]         = useState(EMPTY_KPIS);
  const [total, setTotal]       = useState(0);
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [datePreset, setDatePreset]   = useState('all');
  const [statusOpen, setStatusOpen]   = useState(false);
  const [dateOpen, setDateOpen]       = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [params, setParams] = useState({
    page: 1, status: 'all', sort: 'created_at', order: 'DESC',
    search: '', start: '', end: '', balanceGt0: false,
  });

  const abortRef    = useRef(null);
  const debounceRef = useRef(null);
  const statusRef   = useRef(null);
  const dateRef     = useRef(null);
  const filtersRef  = useRef(null);

  useEffect(() => {
    function onMouseDown(e) {
      if (statusOpen  && statusRef.current  && !statusRef.current.contains(e.target))  setStatusOpen(false);
      if (dateOpen    && dateRef.current    && !dateRef.current.contains(e.target))     setDateOpen(false);
      if (filtersOpen && filtersRef.current && !filtersRef.current.contains(e.target)) setFiltersOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [statusOpen, dateOpen, filtersOpen]);

  function doFetch(p) {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const qs = new URLSearchParams({
      page: p.page, pageSize: PAGE_SIZE, status: p.status,
      sort: p.sort, order: p.order,
    });
    if (p.search.trim()) qs.set('search', p.search.trim());
    if (p.start)         qs.set('start', p.start);
    if (p.end)           qs.set('end', p.end);
    if (p.balanceGt0)    qs.set('balanceGt0', 'true');

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

  // Consume ?new=1 from global create menu — open modal + clean URL
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowNew(true);
      setSearchParams(prev => {
        const p = new URLSearchParams(prev);
        p.delete('new');
        return p;
      }, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleInvoiceCreated(newInvoice) {
    setShowNew(false);
    doFetch(params);                              // refresh list + KPIs
    setSelected({ id: newInvoice.id, ...newInvoice }); // open detail
  }

  function handleFilterChange(f) {
    setParams(p => ({ ...p, status: f, page: 1 }));
  }

  function handleDatePreset(preset) {
    setDatePreset(preset);
    const { start, end } = getDateRange(preset);
    setParams(p => ({ ...p, start, end, page: 1 }));
  }

  function handleBalanceGt0(val) {
    setParams(p => ({ ...p, balanceGt0: val, page: 1 }));
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

  const totalPages       = Math.ceil(total / PAGE_SIZE);
  const activeFilterCount = params.balanceGt0 ? 1 : 0;
  const hasActiveFilters  = params.status !== 'all' || datePreset !== 'all' || params.balanceGt0;

  return (
    <div>
      {/* ── Page header ───────────────────────────────────────── */}
      <div className="page-header">
        <h1>Invoices</h1>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          + New Invoice
        </button>
      </div>

      {/* ── Invoice Overview ──────────────────────────────────── */}
      <div className="inv-overview">
        <span className="inv-overview-title">Invoice Overview</span>
        <div className="inv-overview-metrics">
          <div className="inv-metric">
            <span className="inv-metric-label">Past Due</span>
            <span className={`inv-metric-value${kpis.pastDue > 0 ? ' inv-metric-value--red' : ''}`}>
              {fmtAmt(kpis.pastDue)}
            </span>
            {kpis.pastDueCount > 0 && (
              <span className="inv-metric-sub">
                {kpis.pastDueCount} invoice{kpis.pastDueCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="inv-metric inv-metric--sep" />
          <div className="inv-metric">
            <span className="inv-metric-label">Outstanding</span>
            <span className={`inv-metric-value${kpis.outstanding > 0 ? ' inv-metric-value--amber' : ''}`}>
              {fmtAmt(kpis.outstanding)}
            </span>
          </div>
          <div className="inv-metric inv-metric--sep" />
          <div className="inv-metric">
            <span className="inv-metric-label">Issued</span>
            <span className="inv-metric-value">{fmtAmt(kpis.issuedTotal)}</span>
            <span className="inv-metric-sub">
              {kpis.issuedCount} invoice{kpis.issuedCount !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="inv-metric inv-metric--sep" />
          <div className="inv-metric">
            <span className="inv-metric-label">Avg Invoice</span>
            <span className="inv-metric-value">{fmtAmt(kpis.averageInvoice)}</span>
          </div>
        </div>
      </div>

      {/* ── All Invoices workspace ─────────────────────────────── */}
      <div className="inv-workspace-header">
        <span className="inv-workspace-title">All Invoices</span>
        {!loading && !error && (
          <span className="inv-workspace-count">{total} {total === 1 ? 'result' : 'results'}</span>
        )}
      </div>

      {/* ── Toolbar ───────────────────────────────────────────── */}
      <div className="inv-toolbar">
        <div className="inv-toolbar-filters">

          {/* Status dropdown */}
          <div className="inv-filter-group" ref={statusRef}>
            <button
              className={`inv-filter-trigger${params.status !== 'all' ? ' inv-filter-trigger--active' : ''}`}
              onClick={() => { setStatusOpen(o => !o); setDateOpen(false); setFiltersOpen(false); }}
            >
              <span className="inv-filter-trigger-key">Status</span>
              <span className="inv-filter-trigger-sep">|</span>
              <span className="inv-filter-trigger-val">{FILTER_LABELS[params.status]}</span>
              <ChevronDown size={12} />
            </button>
            {statusOpen && (
              <div className="inv-filter-dropdown">
                {FILTERS.map(f => (
                  <button
                    key={f}
                    className={`inv-dropdown-item${params.status === f ? ' active' : ''}`}
                    onClick={() => { handleFilterChange(f); setStatusOpen(false); }}
                  >
                    <span className="inv-filter-check">
                      {params.status === f ? <Check size={12} /> : null}
                    </span>
                    <span>{FILTER_LABELS[f]}</span>
                    <span className="inv-dropdown-count">{kpis.counts[f]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Date dropdown */}
          <div className="inv-filter-group" ref={dateRef}>
            <button
              className={`inv-filter-trigger${datePreset !== 'all' ? ' inv-filter-trigger--active' : ''}`}
              onClick={() => { setDateOpen(o => !o); setStatusOpen(false); setFiltersOpen(false); }}
            >
              <span className="inv-filter-trigger-key">Date</span>
              <span className="inv-filter-trigger-sep">|</span>
              <span className="inv-filter-trigger-val">{DATE_LABELS[datePreset]}</span>
              <ChevronDown size={12} />
            </button>
            {dateOpen && (
              <div className="inv-filter-dropdown">
                {DATE_PRESETS.map(p => (
                  <button
                    key={p}
                    className={`inv-dropdown-item${datePreset === p ? ' active' : ''}`}
                    onClick={() => { handleDatePreset(p); setDateOpen(false); }}
                  >
                    <span className="inv-filter-check">
                      {datePreset === p ? <Check size={12} /> : null}
                    </span>
                    <span>{DATE_LABELS[p]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filters dropdown */}
          <div className="inv-filter-group" ref={filtersRef}>
            <button
              className={`inv-filter-trigger${params.balanceGt0 ? ' inv-filter-trigger--active' : ''}`}
              onClick={() => { setFiltersOpen(o => !o); setStatusOpen(false); setDateOpen(false); }}
            >
              <SlidersHorizontal size={13} />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="inv-filter-badge">{activeFilterCount}</span>
              )}
            </button>
            {filtersOpen && (
              <div className="inv-filter-dropdown inv-filter-dropdown--wide">
                <span className="inv-dropdown-section-label">Quick Filters</span>
                <button
                  className={`inv-dropdown-item${params.balanceGt0 ? ' active' : ''}`}
                  onClick={() => { handleBalanceGt0(!params.balanceGt0); setFiltersOpen(false); }}
                >
                  <span className="inv-filter-check">
                    {params.balanceGt0 ? <Check size={12} /> : null}
                  </span>
                  <span>Balance &gt; $0</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="inv-search-wrap">
          <Search size={14} className="inv-search-icon" />
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

      {/* ── Active filter chips ────────────────────────────────── */}
      {hasActiveFilters && (
        <div className="inv-filter-chips">
          {params.status !== 'all' && (
            <span className="inv-chip">
              Status: {FILTER_LABELS[params.status]}
              <button
                className="inv-chip-remove"
                onClick={() => handleFilterChange('all')}
                aria-label="Remove status filter"
              >
                <X size={10} />
              </button>
            </span>
          )}
          {datePreset !== 'all' && (
            <span className="inv-chip">
              Date: {DATE_LABELS[datePreset]}
              <button
                className="inv-chip-remove"
                onClick={() => handleDatePreset('all')}
                aria-label="Remove date filter"
              >
                <X size={10} />
              </button>
            </span>
          )}
          {params.balanceGt0 && (
            <span className="inv-chip">
              Balance &gt; $0
              <button
                className="inv-chip-remove"
                onClick={() => handleBalanceGt0(false)}
                aria-label="Remove balance filter"
              >
                <X size={10} />
              </button>
            </span>
          )}
        </div>
      )}

      {/* ── Content ───────────────────────────────────────────── */}
      {loading ? (
        <div className="inv-state">Loading…</div>
      ) : error ? (
        <div className="inv-state inv-state--error">{error}</div>
      ) : invoices.length === 0 ? (
        <div className="inv-empty">
          {searchInput.trim() ? (
            <p className="inv-empty-primary">No invoices match "{searchInput.trim()}".</p>
          ) : hasActiveFilters ? (
            <p className="inv-empty-primary">No invoices match these filters.</p>
          ) : (
            <>
              <p className="inv-empty-primary">No invoices yet.</p>
              <p className="inv-empty-secondary">Create your first invoice to get started.</p>
            </>
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
                  <SortTh label="Total"     col="amount"         currentSort={params.sort} currentOrder={params.order} onSort={handleSortChange} extraClass="inv-th-r" />
                  <SortTh label="Balance"   col="balance"        currentSort={params.sort} currentOrder={params.order} onSort={handleSortChange} extraClass="inv-th-r" />
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr
                    key={inv.id}
                    className="clickable-row inv-table-row"
                    onClick={() => setSelected(inv)}
                  >
                    <td>
                      <span className="inv-client-name">{inv.client_name}</span>
                      {inv.client_address && (
                        <span className="inv-client-sub">{inv.client_address}</span>
                      )}
                    </td>
                    <td className="inv-num">#{inv.invoice_number}</td>
                    <td>{fmtDate(inv.due_date)}</td>
                    <td>{inv.subject || inv.service_type || '—'}</td>
                    <td><StatusBadge status={inv.is_past_due ? 'past_due' : inv.status} /></td>
                    <td className="inv-td-r">{fmtAmt(inv.amount)}</td>
                    <td className="inv-td-r">{inv.balance == null ? '—' : fmtAmt(inv.balance)}</td>
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
              <span className="inv-page-info">Page {params.page} of {totalPages}</span>
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

      {/* ── Invoice Builder ───────────────────────────────────── */}
      {showNew && (
        <div className="ib-overlay" onClick={() => setShowNew(false)}>
          <InvoiceBuilder
            onClose={() => setShowNew(false)}
            onCreated={handleInvoiceCreated}
          />
        </div>
      )}
    </div>
  );
}
