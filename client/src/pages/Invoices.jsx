import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, SlidersHorizontal, X, Check, Mail, MoreHorizontal, ExternalLink, Trash2 } from 'lucide-react';
import api from '../api';
import InvoiceDetail from '../components/InvoiceDetail';
import StatusBadge from '../components/StatusBadge';

const PAGE_SIZE = 50;
const FILTERS      = ['all', 'draft', 'pending', 'paid', 'void', 'past_due'];
const FILTER_LABELS = { all: 'All', draft: 'Draft', pending: 'Pending', paid: 'Paid', void: 'Void', past_due: 'Past Due' };
const DATE_PRESETS = ['all', 'today', 'week', 'month', 'last30'];
const DATE_LABELS  = { all: 'All time', today: 'Today', week: 'This week', month: 'This month', last30: 'Last 30 days' };

const SOURCE_OPTIONS = [
  { value: 'manual',    label: 'Blank / Standard' },
  { value: 'job',       label: 'Completed Job' },
  { value: 'estimate',  label: 'Existing Estimate' },
  { value: 'recurring', label: 'Recurring Agreement' },
];

const BALANCE_OPTIONS = [
  { value: '',    label: 'All balances' },
  { value: 'gt0', label: 'Balance > $0' },
  { value: 'eq0', label: 'Balance = $0' },
  { value: 'range', label: 'Custom range' },
];

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

// Read initial filter state from URL search params
function initFromUrl(sp) {
  return {
    page:        parseInt(sp.get('page') || '1', 10) || 1,
    status:      sp.get('status')    || 'all',
    sort:        sp.get('sort')      || 'invoice_number',
    order:       sp.get('order')     || 'DESC',
    search:      sp.get('search')    || '',
    start:       sp.get('start')     || '',
    end:         sp.get('end')       || '',
    balance:     sp.get('balance')   || '',    // gt0 | eq0 | range | ''
    balanceMin:  sp.get('balanceMin') || '',
    balanceMax:  sp.get('balanceMax') || '',
    clientId:    sp.get('clientId')  || '',
    clientName:  sp.get('clientName') || '',
    source:      sp.get('source')    || '',
    amountMin:   sp.get('amountMin') || '',
    amountMax:   sp.get('amountMax') || '',
    dueStart:    sp.get('dueStart')  || '',
    dueEnd:      sp.get('dueEnd')    || '',
    service:     sp.get('service')   || '',
  };
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
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [datePreset, setDatePreset]   = useState('all');
  const [statusOpen, setStatusOpen]   = useState(false);
  const [dateOpen, setDateOpen]       = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openMenuId, setOpenMenuId]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]       = useState(false);
  const [emailingId, setEmailingId]   = useState(null);

  const [params, setParams] = useState(() => initFromUrl(searchParams));

  // Client search state within the filters panel
  const [clientQuery,   setClientQuery]   = useState('');
  const [clientResults, setClientResults] = useState([]);
  const clientDebRef = useRef(null);

  const abortRef    = useRef(null);
  const debounceRef = useRef(null);
  const statusRef   = useRef(null);
  const dateRef     = useRef(null);
  const filtersRef  = useRef(null);
  const menuRef     = useRef(null);

  useEffect(() => {
    function onMouseDown(e) {
      if (statusOpen  && statusRef.current  && !statusRef.current.contains(e.target))  setStatusOpen(false);
      if (dateOpen    && dateRef.current    && !dateRef.current.contains(e.target))     setDateOpen(false);
      if (filtersOpen && filtersRef.current && !filtersRef.current.contains(e.target)) setFiltersOpen(false);
      if (openMenuId  && menuRef.current    && !menuRef.current.contains(e.target))     setOpenMenuId(null);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [statusOpen, dateOpen, filtersOpen, openMenuId]);

  function buildQs(p) {
    const qs = new URLSearchParams({
      page: p.page, pageSize: PAGE_SIZE, status: p.status,
      sort: p.sort, order: p.order,
    });
    if (p.search.trim())   qs.set('search', p.search.trim());
    if (p.start)           qs.set('start', p.start);
    if (p.end)             qs.set('end', p.end);
    if (p.balance === 'gt0')   qs.set('balanceGt0', 'true');
    if (p.balance === 'eq0')   qs.set('balanceEq0', 'true');
    if (p.balance === 'range') {
      if (p.balanceMin) qs.set('balanceMin', p.balanceMin);
      if (p.balanceMax) qs.set('balanceMax', p.balanceMax);
    }
    if (p.clientId)        qs.set('client_id', p.clientId);
    if (p.source)          qs.set('source', p.source);
    if (p.amountMin)       qs.set('amount_min', p.amountMin);
    if (p.amountMax)       qs.set('amount_max', p.amountMax);
    if (p.dueStart)        qs.set('due_start', p.dueStart);
    if (p.dueEnd)          qs.set('due_end', p.dueEnd);
    if (p.service.trim())  qs.set('service', p.service.trim());
    return qs;
  }

  function doFetch(p) {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    api.get(`/invoices?${buildQs(p)}`, { signal: ctrl.signal })
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
    // Sync to URL
    const sp = new URLSearchParams();
    if (params.status !== 'all')  sp.set('status', params.status);
    if (params.start)             sp.set('start', params.start);
    if (params.end)               sp.set('end', params.end);
    if (params.balance)           sp.set('balance', params.balance);
    if (params.balanceMin)        sp.set('balanceMin', params.balanceMin);
    if (params.balanceMax)        sp.set('balanceMax', params.balanceMax);
    if (params.clientId)          { sp.set('clientId', params.clientId); sp.set('clientName', params.clientName); }
    if (params.source)            sp.set('source', params.source);
    if (params.amountMin)         sp.set('amountMin', params.amountMin);
    if (params.amountMax)         sp.set('amountMax', params.amountMax);
    if (params.dueStart)          sp.set('dueStart', params.dueStart);
    if (params.dueEnd)            sp.set('dueEnd', params.dueEnd);
    if (params.service)           sp.set('service', params.service);
    if (params.search)            sp.set('search', params.search);
    if (params.sort !== 'invoice_number') sp.set('sort', params.sort);
    if (params.order !== 'DESC')          sp.set('order', params.order);
    setSearchParams(sp, { replace: true });
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  // Consume ?new=1 — redirect to canonical new invoice page
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      navigate('/invoices/new', { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle ?invoice={id} — auto-open from direct link / Open in New Tab
  useEffect(() => {
    const invoiceId = searchParams.get('invoice');
    if (!invoiceId) return;
    api.get(`/invoices/${invoiceId}`)
      .then(r => setSelected(r.data))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore search input from URL
  useEffect(() => {
    if (params.search) setSearchInput(params.search);
    if (params.start || params.end) {
      // Restore datePreset from start/end (best effort — 'custom' if no preset matches)
      const today = new Date();
      const todayStr = format(today, 'yyyy-MM-dd');
      if (params.start === todayStr && params.end === todayStr) setDatePreset('today');
      else setDatePreset('custom');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleFilterChange(f) {
    setParams(p => ({ ...p, status: f, page: 1 }));
  }

  function handleDatePreset(preset) {
    setDatePreset(preset);
    const { start, end } = getDateRange(preset);
    setParams(p => ({ ...p, start, end, page: 1 }));
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

  // ── Filters panel handlers ─────────────────────────────────────────────────

  function handleBalanceChange(val) {
    setParams(p => ({ ...p, balance: val, balanceMin: '', balanceMax: '', page: 1 }));
  }

  function handleClientSelect(c) {
    setParams(p => ({ ...p, clientId: c.id, clientName: c.name, page: 1 }));
    setClientQuery(c.name);
    setClientResults([]);
  }

  function handleClientClear() {
    setParams(p => ({ ...p, clientId: '', clientName: '', page: 1 }));
    setClientQuery('');
    setClientResults([]);
  }

  function searchClients(q) {
    clearTimeout(clientDebRef.current);
    if (!q.trim()) { setClientResults([]); return; }
    clientDebRef.current = setTimeout(() => {
      api.get(`/clients/search?q=${encodeURIComponent(q)}`)
        .then(r => setClientResults(r.data || []))
        .catch(() => setClientResults([]));
    }, 275);
  }

  function clearAllFilters() {
    setParams(p => ({
      ...p,
      status: 'all', start: '', end: '',
      balance: '', balanceMin: '', balanceMax: '',
      clientId: '', clientName: '',
      source: '', amountMin: '', amountMax: '',
      dueStart: '', dueEnd: '', service: '',
      page: 1,
    }));
    setDatePreset('all');
    setClientQuery('');
    setClientResults([]);
  }

  // ── Row action handlers ────────────────────────────────────────────────────

  async function handleEmail(e, inv) {
    e.stopPropagation();
    setEmailingId(inv.id);
    try {
      await api.post(`/invoices/${inv.id}/send`);
      setInvoices(prev => prev.map(i =>
        i.id === inv.id ? { ...i, status: 'pending', sent_at: new Date().toISOString() } : i
      ));
    } catch (err) {
      console.error('Send failed', err);
    } finally {
      setEmailingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/invoices/${deleteTarget.id}`);
      setInvoices(prev => prev.filter(i => i.id !== deleteTarget.id));
      setTotal(t => t - 1);
      if (selected?.id === deleteTarget.id) setSelected(null);
      setDeleteTarget(null);
    } catch (err) {
      console.error('Delete failed', err);
    } finally {
      setDeleting(false);
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const activeAdvancedFilters = [
    params.balance !== '',
    params.clientId !== '',
    params.source !== '',
    (params.amountMin !== '' || params.amountMax !== ''),
    (params.dueStart !== '' || params.dueEnd !== ''),
    params.service !== '',
  ].filter(Boolean).length;

  const hasActiveFilters = params.status !== 'all' || datePreset !== 'all' || activeAdvancedFilters > 0;

  // Chip helpers
  function balanceChipLabel() {
    if (params.balance === 'gt0') return 'Balance > $0';
    if (params.balance === 'eq0') return 'Balance = $0';
    if (params.balance === 'range') {
      const parts = [];
      if (params.balanceMin) parts.push(`≥ $${params.balanceMin}`);
      if (params.balanceMax) parts.push(`≤ $${params.balanceMax}`);
      return `Balance ${parts.join(' ')}` || 'Balance range';
    }
    return '';
  }

  function amountChipLabel() {
    const parts = [];
    if (params.amountMin) parts.push(`≥ $${params.amountMin}`);
    if (params.amountMax) parts.push(`≤ $${params.amountMax}`);
    return `Amount ${parts.join(' ')}`;
  }

  function dueDateChipLabel() {
    if (params.dueStart && params.dueEnd) return `Due ${fmtDate(params.dueStart)}–${fmtDate(params.dueEnd)}`;
    if (params.dueStart) return `Due from ${fmtDate(params.dueStart)}`;
    if (params.dueEnd)   return `Due until ${fmtDate(params.dueEnd)}`;
    return '';
  }

  const sourceLabel = SOURCE_OPTIONS.find(o => o.value === params.source)?.label || '';

  return (
    <div>
      {/* ── Page header ───────────────────────────────────────── */}
      <div className="page-header">
        <h1>Invoices</h1>
        <button className="btn btn-primary" onClick={() => navigate('/invoices/new')}>
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
            <span className="inv-metric-label">Collected</span>
            <span className="inv-metric-value">{fmtAmt(kpis.collected)}</span>
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
              <span className="inv-filter-trigger-val">{DATE_LABELS[datePreset] || 'Custom'}</span>
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
                <div style={{ borderTop: '1px solid #e2e8f0', margin: '4px 0', padding: '8px 12px 4px' }}>
                  <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Custom range</span>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input
                      type="date"
                      className="inv-filter-date-input"
                      value={params.start}
                      onChange={e => { setDatePreset('custom'); setParams(p => ({ ...p, start: e.target.value, page: 1 })); }}
                    />
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>–</span>
                    <input
                      type="date"
                      className="inv-filter-date-input"
                      value={params.end}
                      onChange={e => { setDatePreset('custom'); setParams(p => ({ ...p, end: e.target.value, page: 1 })); }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Filters panel */}
          <div className="inv-filter-group" ref={filtersRef}>
            <button
              className={`inv-filter-trigger${activeAdvancedFilters > 0 ? ' inv-filter-trigger--active' : ''}`}
              onClick={() => { setFiltersOpen(o => !o); setStatusOpen(false); setDateOpen(false); }}
              aria-expanded={filtersOpen}
            >
              <SlidersHorizontal size={13} />
              <span>Filters</span>
              {activeAdvancedFilters > 0 && (
                <span className="inv-filter-badge">{activeAdvancedFilters}</span>
              )}
            </button>

            {filtersOpen && (
              <div className="inv-filter-panel" role="dialog" aria-label="Advanced filters">

                {/* Balance */}
                <div className="inv-fpanel-section">
                  <span className="inv-fpanel-label">Balance</span>
                  {BALANCE_OPTIONS.map(opt => (
                    <label key={opt.value} className="inv-fpanel-radio">
                      <input
                        type="radio"
                        name="balance-filter"
                        value={opt.value}
                        checked={params.balance === opt.value}
                        onChange={() => handleBalanceChange(opt.value)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                  {params.balance === 'range' && (
                    <div className="inv-fpanel-range">
                      <div className="inv-fpanel-range-pair">
                        <span className="inv-fpanel-range-sym">$</span>
                        <input
                          type="number" min="0" step="0.01"
                          className="inv-fpanel-range-input"
                          placeholder="Min"
                          value={params.balanceMin}
                          onChange={e => setParams(p => ({ ...p, balanceMin: e.target.value, page: 1 }))}
                        />
                      </div>
                      <span className="inv-fpanel-range-to">to</span>
                      <div className="inv-fpanel-range-pair">
                        <span className="inv-fpanel-range-sym">$</span>
                        <input
                          type="number" min="0" step="0.01"
                          className="inv-fpanel-range-input"
                          placeholder="Max"
                          value={params.balanceMax}
                          onChange={e => setParams(p => ({ ...p, balanceMax: e.target.value, page: 1 }))}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Due Date */}
                <div className="inv-fpanel-section">
                  <span className="inv-fpanel-label">Due Date</span>
                  <div className="inv-fpanel-date-row">
                    <div className="inv-fpanel-date-field">
                      <span className="inv-fpanel-date-key">From</span>
                      <input
                        type="date"
                        className="inv-fpanel-date-input"
                        value={params.dueStart}
                        onChange={e => setParams(p => ({ ...p, dueStart: e.target.value, page: 1 }))}
                      />
                    </div>
                    <div className="inv-fpanel-date-field">
                      <span className="inv-fpanel-date-key">To</span>
                      <input
                        type="date"
                        className="inv-fpanel-date-input"
                        value={params.dueEnd}
                        onChange={e => setParams(p => ({ ...p, dueEnd: e.target.value, page: 1 }))}
                      />
                    </div>
                  </div>
                </div>

                {/* Client */}
                <div className="inv-fpanel-section">
                  <span className="inv-fpanel-label">Client</span>
                  {params.clientId ? (
                    <div className="inv-fpanel-client-selected">
                      <span>{params.clientName}</span>
                      <button
                        className="inv-fpanel-client-clear"
                        onClick={handleClientClear}
                        aria-label="Clear client filter"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        className="inv-fpanel-search-input"
                        placeholder="Search clients…"
                        value={clientQuery}
                        onChange={e => { setClientQuery(e.target.value); searchClients(e.target.value); }}
                        onKeyDown={e => e.key === 'Escape' && setClientResults([])}
                      />
                      {clientResults.length > 0 && (
                        <div className="inv-fpanel-client-drop">
                          {clientResults.map(c => (
                            <button
                              key={c.id}
                              className="inv-fpanel-client-item"
                              onMouseDown={() => handleClientSelect(c)}
                            >
                              <span className="inv-fpanel-client-name">{c.name}</span>
                              {c.email && <span className="inv-fpanel-client-email">{c.email}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Invoice Source */}
                <div className="inv-fpanel-section">
                  <span className="inv-fpanel-label">Invoice Source</span>
                  <label className="inv-fpanel-radio">
                    <input
                      type="radio"
                      name="source-filter"
                      value=""
                      checked={params.source === ''}
                      onChange={() => setParams(p => ({ ...p, source: '', page: 1 }))}
                    />
                    <span>All sources</span>
                  </label>
                  {SOURCE_OPTIONS.map(opt => (
                    <label key={opt.value} className="inv-fpanel-radio">
                      <input
                        type="radio"
                        name="source-filter"
                        value={opt.value}
                        checked={params.source === opt.value}
                        onChange={() => setParams(p => ({ ...p, source: opt.value, page: 1 }))}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>

                {/* Amount */}
                <div className="inv-fpanel-section">
                  <span className="inv-fpanel-label">Amount</span>
                  <div className="inv-fpanel-range">
                    <div className="inv-fpanel-range-pair">
                      <span className="inv-fpanel-range-sym">$</span>
                      <input
                        type="number" min="0" step="0.01"
                        className="inv-fpanel-range-input"
                        placeholder="Min"
                        value={params.amountMin}
                        onChange={e => setParams(p => ({ ...p, amountMin: e.target.value, page: 1 }))}
                      />
                    </div>
                    <span className="inv-fpanel-range-to">to</span>
                    <div className="inv-fpanel-range-pair">
                      <span className="inv-fpanel-range-sym">$</span>
                      <input
                        type="number" min="0" step="0.01"
                        className="inv-fpanel-range-input"
                        placeholder="Max"
                        value={params.amountMax}
                        onChange={e => setParams(p => ({ ...p, amountMax: e.target.value, page: 1 }))}
                      />
                    </div>
                  </div>
                </div>

                {/* Service */}
                <div className="inv-fpanel-section">
                  <span className="inv-fpanel-label">Service</span>
                  <input
                    type="text"
                    className="inv-fpanel-search-input"
                    placeholder="Filter by service type…"
                    value={params.service}
                    onChange={e => setParams(p => ({ ...p, service: e.target.value, page: 1 }))}
                  />
                </div>

                {/* Clear All */}
                {activeAdvancedFilters > 0 && (
                  <div className="inv-fpanel-footer">
                    <button
                      className="inv-fpanel-clear"
                      onClick={() => {
                        setParams(p => ({
                          ...p,
                          balance: '', balanceMin: '', balanceMax: '',
                          clientId: '', clientName: '',
                          source: '', amountMin: '', amountMax: '',
                          dueStart: '', dueEnd: '', service: '',
                          page: 1,
                        }));
                        setClientQuery('');
                        setClientResults([]);
                      }}
                    >
                      Clear advanced filters
                    </button>
                  </div>
                )}
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
              <button className="inv-chip-remove" onClick={() => handleFilterChange('all')} aria-label="Remove status filter">
                <X size={10} />
              </button>
            </span>
          )}
          {datePreset !== 'all' && (
            <span className="inv-chip">
              Date: {DATE_LABELS[datePreset] || `${fmtDate(params.start)}–${fmtDate(params.end)}`}
              <button className="inv-chip-remove" onClick={() => { handleDatePreset('all'); }} aria-label="Remove date filter">
                <X size={10} />
              </button>
            </span>
          )}
          {params.balance !== '' && (
            <span className="inv-chip">
              {balanceChipLabel()}
              <button className="inv-chip-remove" onClick={() => handleBalanceChange('')} aria-label="Remove balance filter">
                <X size={10} />
              </button>
            </span>
          )}
          {params.clientId && (
            <span className="inv-chip">
              {params.clientName || 'Client'}
              <button className="inv-chip-remove" onClick={handleClientClear} aria-label="Remove client filter">
                <X size={10} />
              </button>
            </span>
          )}
          {params.source && (
            <span className="inv-chip">
              {sourceLabel}
              <button className="inv-chip-remove" onClick={() => setParams(p => ({ ...p, source: '', page: 1 }))} aria-label="Remove source filter">
                <X size={10} />
              </button>
            </span>
          )}
          {(params.amountMin || params.amountMax) && (
            <span className="inv-chip">
              {amountChipLabel()}
              <button className="inv-chip-remove" onClick={() => setParams(p => ({ ...p, amountMin: '', amountMax: '', page: 1 }))} aria-label="Remove amount filter">
                <X size={10} />
              </button>
            </span>
          )}
          {(params.dueStart || params.dueEnd) && (
            <span className="inv-chip">
              {dueDateChipLabel()}
              <button className="inv-chip-remove" onClick={() => setParams(p => ({ ...p, dueStart: '', dueEnd: '', page: 1 }))} aria-label="Remove due date filter">
                <X size={10} />
              </button>
            </span>
          )}
          {params.service && (
            <span className="inv-chip">
              Service: {params.service}
              <button className="inv-chip-remove" onClick={() => setParams(p => ({ ...p, service: '', page: 1 }))} aria-label="Remove service filter">
                <X size={10} />
              </button>
            </span>
          )}
          {hasActiveFilters && (
            <button className="inv-chip-clear-all" onClick={clearAllFilters}>
              Clear All
            </button>
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
                  <th className="inv-th-actions" aria-hidden="true" />
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
                    <td className="inv-td-actions" onClick={e => e.stopPropagation()}>
                      <div
                        className={`inv-row-actions${openMenuId === inv.id ? ' inv-row-actions--open' : ''}`}
                        onKeyDown={e => { if (e.key === 'Escape') setOpenMenuId(null); }}
                      >
                        {['draft', 'pending'].includes(inv.status) && (
                          <div className="inv-action-tooltip-wrap">
                            <button
                              className="inv-action-btn"
                              aria-label={inv.status === 'draft' ? 'Send Invoice' : 'Email Invoice'}
                              disabled={emailingId === inv.id}
                              onClick={e => handleEmail(e, inv)}
                            >
                              <Mail size={14} />
                            </button>
                            <span className="inv-action-tooltip">
                              {inv.status === 'draft' ? 'Send Invoice' : 'Email Invoice'}
                            </span>
                          </div>
                        )}
                        <div
                          className="inv-action-menu-wrap"
                          ref={openMenuId === inv.id ? menuRef : null}
                        >
                          <button
                            className="inv-action-btn"
                            aria-label="More actions"
                            aria-expanded={openMenuId === inv.id}
                            aria-haspopup="menu"
                            onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === inv.id ? null : inv.id); }}
                          >
                            <MoreHorizontal size={14} />
                          </button>
                          {openMenuId === inv.id && (
                            <div className="inv-action-drop" role="menu">
                              <a
                                className="inv-action-drop-item"
                                href={`/invoices?invoice=${inv.id}`}
                                target="_blank"
                                rel="noreferrer"
                                role="menuitem"
                                onClick={() => setOpenMenuId(null)}
                              >
                                <ExternalLink size={13} />
                                <span>Open in New Tab</span>
                              </a>
                              <div className="inv-action-drop-sep" />
                              <button
                                className="inv-action-drop-item inv-action-drop-item--danger"
                                role="menuitem"
                                onClick={() => { setDeleteTarget(inv); setOpenMenuId(null); }}
                              >
                                <Trash2 size={13} />
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
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

      {/* ── Delete Confirmation Modal ─────────────────────────── */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Invoice?</h2>
              <button className="btn-close" onClick={() => !deleting && setDeleteTarget(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: 'var(--navy)', marginBottom: 6 }}>
                Invoice <strong>#{deleteTarget.invoice_number}</strong> for{' '}
                <strong>{deleteTarget.client_name}</strong> will be permanently deleted.
              </p>
              <p style={{ fontSize: 13, color: 'var(--slate)' }}>This cannot be undone.</p>
              <div className="form-actions" style={{ marginTop: 24 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-void"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting…' : 'Delete Invoice'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
