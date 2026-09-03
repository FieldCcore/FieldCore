'use strict';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format, addDays } from 'date-fns';
import { Search, Plus, Trash2, ChevronDown, X, Link2 } from 'lucide-react';
import api from '../api';
import Autocomplete, { highlight } from '../components/Autocomplete';
import CollectPaymentWorkspace from '../components/CollectPaymentWorkspace';

const TODAY = new Date().toISOString().slice(0, 10);

const TERM_OPTIONS = [
  { value: 'due_on_receipt', label: 'Due on receipt' },
  { value: 'net_7',          label: 'Net 7' },
  { value: 'net_15',         label: 'Net 15' },
  { value: 'net_30',         label: 'Net 30' },
  { value: 'net_45',         label: 'Net 45' },
  { value: 'net_60',         label: 'Net 60' },
  { value: 'net_90',         label: 'Net 90' },
  { value: 'custom',         label: 'Custom date' },
];

const TERM_DAYS = { net_7: 7, net_15: 15, net_30: 30, net_45: 45, net_60: 60, net_90: 90 };

function newLineItem() {
  return {
    _id:        Math.random().toString(36).slice(2),
    service_id: null,
    name:       '',
    description:'',
    quantity:   '1',
    unit_price: '',
    taxable:    true,
  };
}

function fmt(n) {
  const v = parseFloat(n);
  return isNaN(v) ? '—' : '$' + v.toFixed(2);
}

function lineTotal(item) {
  const q = parseFloat(item.quantity) || 0;
  const p = parseFloat(item.unit_price) || 0;
  return q * p;
}

// ── Service catalog search dropdown ───────────────────────────────────────────
function ServiceSearch({ value, onChange, onServiceSelect }) {
  const [open,      setOpen]      = useState(false);
  const [results,   setResults]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debRef    = useRef(null);
  const abortRef  = useRef(null);
  const wrapRef   = useRef(null);

  const fetchSvcs = useCallback((q) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    api.get(`/services/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
      .then(r => { if (!ctrl.signal.aborted) { setResults(r.data || []); setActiveIdx(-1); } })
      .catch(() => { if (!ctrl.signal.aborted) setResults([]); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
  }, []);

  useEffect(() => {
    function h(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function handleFocus() { setOpen(true); fetchSvcs(value || ''); }

  function handleChange(e) {
    const val = e.target.value;
    onChange(val);
    setOpen(true);
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => fetchSvcs(val), 275);
  }

  function handleKeyDown(e) {
    if (!open) return;
    const total = results.length + 1;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => (i < total - 1 ? i + 1 : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => (i > 0 ? i - 1 : total - 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && activeIdx < results.length) select(results[activeIdx]);
      else setOpen(false);
    }
    else if (e.key === 'Escape') { setOpen(false); setActiveIdx(-1); }
  }

  function select(svc) { setOpen(false); onServiceSelect(svc); }
  const showDrop = open && (loading || results.length > 0);

  return (
    <div className="svc-picker-wrap ib-col-name" ref={wrapRef}>
      <input
        className="ib-input svc-name-input"
        type="text"
        placeholder="Service name"
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
      />
      {showDrop && (
        <div className="svc-drop" role="listbox">
          {loading ? (
            <div className="svc-drop-state">Searching…</div>
          ) : (
            <>
              {results.map((svc, i) => (
                <div
                  key={svc.id}
                  className={`svc-drop-item${i === activeIdx ? ' svc-drop-item--active' : ''}`}
                  role="option"
                  aria-selected={i === activeIdx}
                  onMouseDown={() => select(svc)}
                  onMouseEnter={() => setActiveIdx(i)}
                >
                  <span className="svc-drop-name">{svc.name}</span>
                  {svc.category && <span className="svc-drop-category">{svc.category}</span>}
                  {svc.description && <span className="svc-drop-desc">{svc.description}</span>}
                  {svc.price != null && (
                    <span className="svc-drop-price">${parseFloat(svc.price).toFixed(2)}</span>
                  )}
                </div>
              ))}
              <div
                className={`svc-drop-item svc-drop-custom${activeIdx === results.length ? ' svc-drop-item--active' : ''}`}
                role="option"
                onMouseDown={() => setOpen(false)}
                onMouseEnter={() => setActiveIdx(results.length)}
              >
                <Plus size={12} /> Custom line item
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── NewInvoicePage ─────────────────────────────────────────────────────────────
export default function NewInvoicePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const saveDropRef = useRef(null);

  // Settings loaded on mount
  const [taxRate,       setTaxRate]       = useState(0);
  const [previewNumber, setPreviewNumber] = useState(null);
  const [previewNumErr, setPreviewNumErr] = useState(false);

  // Client
  const [selectedClient, setSelectedClient] = useState(null);

  // Job link
  const [showJobPicker, setShowJobPicker] = useState(false);
  const [jobQuery,      setJobQuery]      = useState('');
  const [eligibleJobs,  setEligibleJobs]  = useState([]);
  const [jobsLoading,   setJobsLoading]   = useState(false);
  const [jobsError,     setJobsError]     = useState('');
  const [selectedJob,   setSelectedJob]   = useState(null);
  const jobDebounce = useRef(null);

  // Invoice details
  const [subject,      setSubject]      = useState('For Services Rendered');
  const [issuedDate,   setIssuedDate]   = useState(TODAY);
  const [paymentTerms, setPaymentTerms] = useState('due_on_receipt');
  const [dueDate,      setDueDate]      = useState('');

  // Line items
  const [lineItems, setLineItems] = useState([newLineItem()]);

  // Discount
  const [discountType,  setDiscountType]  = useState('none');
  const [discountValue, setDiscountValue] = useState('');
  const [discountLabel, setDiscountLabel] = useState('');

  // Notes
  const [clientMessage, setClientMessage] = useState('');
  const [terms,         setTerms]         = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  // Save
  const [saving,        setSaving]        = useState(false);
  const [saveError,     setSaveError]     = useState('');
  const [saveDropOpen,  setSaveDropOpen]  = useState(false);
  const [collectInvoice, setCollectInvoice] = useState(null);

  // Load settings
  useEffect(() => {
    api.get('/invoices/settings')
      .then(r => {
        const d = r.data;
        setTaxRate(d.tax_rate || 0);
        setPreviewNumber(d.next_number != null ? d.next_number : null);
        if (d.default_terms) setTerms(d.default_terms);
      })
      .catch(() => setPreviewNumErr(true));
  }, []);

  // Close save dropdown on outside click
  useEffect(() => {
    function h(e) {
      if (saveDropRef.current && !saveDropRef.current.contains(e.target)) setSaveDropOpen(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Payment terms → derived due date
  useEffect(() => {
    if (paymentTerms === 'due_on_receipt') { setDueDate(''); return; }
    if (paymentTerms === 'custom') return;
    const days = TERM_DAYS[paymentTerms];
    if (!days) return;
    const base = issuedDate ? new Date(issuedDate) : new Date();
    setDueDate(format(addDays(base, days), 'yyyy-MM-dd'));
  }, [paymentTerms, issuedDate]);

  // Client autocomplete
  const fetchClients = useCallback(async (query, signal) => {
    const r = await api.get(`/clients/search?q=${encodeURIComponent(query)}`, { signal });
    return r.data || [];
  }, []);

  function selectClient(c) {
    setSelectedClient(c);
    if (showJobPicker) loadEligibleJobs('', c.id);
    if (selectedJob && selectedJob.client_id !== c.id) clearJob();
  }

  function clearClient() {
    setSelectedClient(null);
    clearJob();
    setShowJobPicker(false);
  }

  // Job picker
  function loadEligibleJobs(q = '', clientId = selectedClient?.id) {
    setJobsLoading(true);
    setJobsError('');
    const qs = new URLSearchParams();
    if (q.trim()) qs.set('search', q.trim());
    if (clientId) qs.set('client_id', clientId);
    api.get(`/invoices/eligible-jobs?${qs}`)
      .then(r => setEligibleJobs(r.data.rows || []))
      .catch(() => setJobsError('Could not load jobs.'))
      .finally(() => setJobsLoading(false));
  }

  function handleJobQuery(val) {
    setJobQuery(val);
    clearTimeout(jobDebounce.current);
    jobDebounce.current = setTimeout(() => loadEligibleJobs(val), 300);
  }

  function selectJob(j) {
    setSelectedJob(j);
    setShowJobPicker(false);
    setJobQuery('');
    setSubject(j.service_type || 'For Services Rendered');

    const svcs = Array.isArray(j.line_items) && j.line_items.length > 0 ? j.line_items : null;
    setLineItems(
      svcs
        ? svcs.map((svc, idx) => ({
            _id:        `job-line-${idx}`,
            service_id: null,
            name:       svc.name || j.service_type || 'Service',
            description:svc.description || '',
            quantity:   String(parseFloat(svc.quantity) || 1),
            unit_price: ((svc.price_cents || 0) / 100).toFixed(2),
            taxable:    taxRate > 0,
          }))
        : [{
            _id:        'job-line',
            service_id: null,
            name:       j.service_type || 'Service',
            description:'',
            quantity:   '1',
            unit_price: parseFloat(j.amount || 0).toFixed(2),
            taxable:    taxRate > 0,
          }]
    );
  }

  function clearJob() {
    setSelectedJob(null);
    setJobQuery('');
    setEligibleJobs([]);
  }

  // Line item helpers
  function updateLineItem(index, field, value) {
    setLineItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function selectService(index, svc) {
    setLineItems(prev => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        service_id:  svc.id,
        name:        svc.name,
        description: svc.description || '',
        unit_price:  String(parseFloat(svc.price || 0).toFixed(2)),
      };
      return next;
    });
  }

  function addLineItem()       { setLineItems(prev => [...prev, newLineItem()]); }
  function removeLineItem(idx) { setLineItems(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)); }

  // Computed totals
  const subtotal = lineItems.reduce((s, item) => s + lineTotal(item), 0);

  const discountAmount = (() => {
    if (discountType === 'fixed')   return Math.min(parseFloat(discountValue) || 0, subtotal);
    if (discountType === 'percent') return subtotal * ((parseFloat(discountValue) || 0) / 100);
    return 0;
  })();

  const taxableSubtotal = lineItems.filter(i => i.taxable).reduce((s, i) => s + lineTotal(i), 0);
  const discountRatio   = subtotal > 0 ? discountAmount / subtotal : 0;
  const taxAmount       = taxableSubtotal * (1 - discountRatio) * taxRate;
  const total           = subtotal - discountAmount + taxAmount;

  // Validation
  const clientId    = selectedJob?.client_id || selectedClient?.id;
  const hasLineItem = lineItems.some(i => i.name || parseFloat(i.unit_price) > 0);
  const canDraft    = !saving && !!clientId && hasLineItem;
  const canSend     = canDraft && lineItems.some(i => parseFloat(i.unit_price) > 0);

  async function handleSave(action) {
    setSaveError('');
    setSaveDropOpen(false);
    if (!clientId) { setSaveError('Please select a client.'); return; }
    const validItems = lineItems.filter(i => i.name.trim() || parseFloat(i.unit_price) > 0);
    if (validItems.length === 0) { setSaveError('Add at least one line item with a name and price.'); return; }

    setSaving(true);
    try {
      const invoiceStatus = action === 'send' || action === 'collect' ? 'pending' : 'draft';
      const payload = {
        source_type:    selectedJob ? 'JOB' : 'MANUAL',
        ...(selectedJob ? { job_id: selectedJob.id } : { client_id: clientId }),
        subject:        subject.trim() || 'For Services Rendered',
        issued_date:    issuedDate,
        payment_terms:  paymentTerms,
        due_date:       dueDate || undefined,
        line_items:     lineItems.map(item => ({
          service_id:  item.service_id || null,
          name:        item.name.trim(),
          description: item.description.trim(),
          quantity:    parseFloat(item.quantity) || 1,
          unit_price:  parseFloat(item.unit_price) || 0,
          taxable:     item.taxable,
          line_total:  lineTotal(item),
        })),
        discount_type:  discountType !== 'none' ? discountType : null,
        discount_value: discountType !== 'none' ? parseFloat(discountValue) || 0 : null,
        discount_label: discountLabel.trim() || null,
        client_message: clientMessage.trim() || null,
        terms:          terms.trim() || null,
        internal_notes: internalNotes.trim() || null,
        status:         invoiceStatus,
      };

      const res = await api.post('/invoices', payload);

      if (action === 'send') {
        await api.post(`/invoices/${res.data.id}/send`);
      }

      if (action === 'collect') {
        setCollectInvoice(res.data);
        return;
      }

      navigate('/invoices');
    } catch (err) {
      const msg = (err.response?.data?.error || '').toLowerCase();
      if (msg.includes('already') || msg.includes('duplicate')) {
        setSaveError('An invoice already exists for this job.');
      } else if (msg.includes('complete')) {
        setSaveError('Job must be completed before invoicing.');
      } else if (msg.includes('client')) {
        setSaveError('Please select a valid client.');
      } else {
        setSaveError(err.response?.data?.error || 'Could not create invoice. Try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  if (collectInvoice) {
    return (
      <CollectPaymentWorkspace
        invoice={collectInvoice}
        client={selectedClient}
        onClose={() => { setCollectInvoice(null); navigate('/invoices'); }}
        onPaymentRecorded={() => { setCollectInvoice(null); navigate('/invoices'); }}
      />
    );
  }

  return (
    <div className="niw-page">

      {/* ── Page header ───────────────────────────────────────── */}
      <div className="niw-header">
        <div className="niw-header-left">
          <h1 className="niw-title">New Invoice</h1>
          {!previewNumErr && previewNumber != null && (
            <span className="niw-preview-num">Preview #{previewNumber}</span>
          )}
        </div>
        <div className="niw-header-actions">
          <button className="btn btn-secondary" onClick={() => navigate('/invoices')} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => handleSave('draft')}
            disabled={!canDraft}
            title={!clientId ? 'Select a client first' : !hasLineItem ? 'Add at least one line item' : ''}
          >
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
          <div className="niw-save-split" ref={saveDropRef}>
            <button
              className="btn btn-primary niw-save-primary"
              onClick={() => handleSave('send')}
              disabled={!canSend}
            >
              {saving ? 'Saving…' : 'Save & Send'}
            </button>
            <button
              className="btn btn-primary niw-save-arrow"
              onClick={() => setSaveDropOpen(v => !v)}
              aria-label="More save options"
              aria-expanded={saveDropOpen}
              disabled={!canSend}
            >
              <ChevronDown size={14} />
            </button>
            {saveDropOpen && (
              <div className="niw-save-drop">
                <button
                  className="niw-save-drop-item"
                  onClick={() => handleSave('collect')}
                  disabled={!canSend}
                >
                  Save &amp; Collect Payment
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {saveError && <div className="niw-save-error">{saveError}</div>}

      {/* ── Two-column body ───────────────────────────────────── */}
      <div className="niw-body">

        {/* ── Main column ─────────────────────────────────────── */}
        <div className="niw-main">

          {/* Subject */}
          <div className="niw-card">
            <label className="niw-label">Subject</label>
            <input
              className="niw-input"
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="For Services Rendered"
            />
          </div>

          {/* Client */}
          <div className="niw-card">
            <p className="niw-card-title">Client <span className="niw-required">*</span></p>
            <Autocomplete
              fetchResults={fetchClients}
              onSelect={selectClient}
              onClear={clearClient}
              selected={selectedClient}
              getKey={c => c.id}
              getDisplayValue={c => c.name}
              placeholder="Search by name, company, email, or address…"
              label="Client search"
              inputId="niw-client-search"
              emptyText="No clients found."
              renderItem={(c, q) => (
                <div className="ac-client-item">
                  <span className="ac-client-name">{highlight(c.name, q)}</span>
                  {c.email && <span className="ac-client-meta">{highlight(c.email, q)}</span>}
                  {c.phone && <span className="ac-client-meta">{c.phone}</span>}
                  {(c.address || c.city) && (
                    <span className="ac-client-meta">
                      {[c.address, c.city, c.state].filter(Boolean).join(', ')}
                    </span>
                  )}
                </div>
              )}
              renderSelectedCard={c => (
                <div className="ib-client-card">
                  <div className="ib-client-card-name">{c.name}</div>
                  {c.email && <div className="ib-client-card-detail">{c.email}</div>}
                  {c.phone && <div className="ib-client-card-detail">{c.phone}</div>}
                  {(c.address || c.city) && (
                    <div className="ib-client-card-detail">
                      {[c.address, c.city, c.state, c.zip].filter(Boolean).join(', ')}
                    </div>
                  )}
                </div>
              )}
            />
          </div>

          {/* Optional Job Link */}
          <div className="niw-card">
            <div className="niw-job-section-head">
              <p className="niw-card-title" style={{ margin: 0 }}>
                Link to Job <span className="niw-optional">(optional)</span>
              </p>
              {!selectedJob && !showJobPicker && (
                <button
                  className="niw-link-btn"
                  onClick={() => {
                    setShowJobPicker(true);
                    if (selectedClient) loadEligibleJobs('', selectedClient.id);
                  }}
                  disabled={!selectedClient}
                  title={!selectedClient ? 'Select a client first' : undefined}
                >
                  <Link2 size={13} />
                  Link Job
                </button>
              )}
              {showJobPicker && !selectedJob && (
                <button
                  className="niw-link-cancel"
                  onClick={() => { setShowJobPicker(false); setJobQuery(''); setEligibleJobs([]); }}
                >
                  Cancel
                </button>
              )}
            </div>

            {selectedJob ? (
              <div className="niw-job-card">
                <div className="niw-job-card-top">
                  <div className="niw-job-card-info">
                    <div className="niw-job-card-name">{selectedJob.service_type || 'Service'}</div>
                    <div className="niw-job-card-meta">
                      {selectedJob.client_name}
                      {selectedJob.scheduled_at && ` · ${format(new Date(selectedJob.scheduled_at), 'MMM d, yyyy')}`}
                      {selectedJob.address && ` · ${selectedJob.address}`}
                    </div>
                  </div>
                  <div className="niw-job-card-right">
                    <span className="niw-job-card-amount">{fmt(selectedJob.amount)}</span>
                    <button
                      className="niw-job-unlink"
                      onClick={() => {
                        clearJob();
                        setSubject('For Services Rendered');
                        setLineItems([newLineItem()]);
                      }}
                      aria-label="Unlink job"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ) : showJobPicker ? (
              <div className="niw-job-picker">
                <div className="niw-job-search-wrap">
                  <Search size={14} className="niw-search-icon" />
                  <input
                    className="niw-job-search"
                    type="text"
                    placeholder="Search by service type, address…"
                    value={jobQuery}
                    onChange={e => handleJobQuery(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="niw-job-list">
                  {jobsLoading ? (
                    <div className="niw-state">Loading…</div>
                  ) : jobsError ? (
                    <div className="niw-state niw-state--error">{jobsError}</div>
                  ) : eligibleJobs.length === 0 ? (
                    <div className="niw-empty">
                      <p>No completed, uninvoiced jobs found for this client.</p>
                    </div>
                  ) : (
                    eligibleJobs.map(j => (
                      <button key={j.id} className="niw-job-row" onClick={() => selectJob(j)}>
                        <div className="niw-job-row-top">
                          <span className="niw-job-row-name">{j.service_type || 'Service'}</span>
                          <span className="niw-job-row-amount">{fmt(j.amount)}</span>
                        </div>
                        <div className="niw-job-row-meta">
                          {j.scheduled_at && format(new Date(j.scheduled_at), 'MMM d, yyyy')}
                          {j.address && <span> · {j.address}</span>}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <p className="niw-job-hint">
                {selectedClient
                  ? 'Link this invoice to a completed job, or leave blank for a manual invoice.'
                  : 'Select a client above to link a job.'}
              </p>
            )}
          </div>

          {/* Line Items */}
          <div className="niw-card">
            <p className="niw-card-title">Line Items</p>
            <div className="ib-items-table">
              <div className="ib-items-head">
                <span className="ib-col-name">Product / Service</span>
                <span className="ib-col-desc">Description</span>
                <span className="ib-col-qty">Qty</span>
                <span className="ib-col-price">Unit Price</span>
                <span className="ib-col-tax">Tax</span>
                <span className="ib-col-total">Total</span>
                <span className="ib-col-del" />
              </div>
              {lineItems.map((item, idx) => (
                <div key={item._id} className="ib-items-row">
                  <ServiceSearch
                    value={item.name}
                    onChange={val => updateLineItem(idx, 'name', val)}
                    onServiceSelect={svc => selectService(idx, svc)}
                  />
                  <input
                    className="ib-input ib-col-desc"
                    type="text"
                    placeholder="Optional description"
                    value={item.description}
                    onChange={e => updateLineItem(idx, 'description', e.target.value)}
                  />
                  <input
                    className="ib-input ib-col-qty"
                    type="number"
                    min="0"
                    step="1"
                    value={item.quantity}
                    onChange={e => updateLineItem(idx, 'quantity', e.target.value)}
                  />
                  <input
                    className="ib-input ib-col-price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={item.unit_price}
                    onChange={e => updateLineItem(idx, 'unit_price', e.target.value)}
                  />
                  <div className="ib-col-tax ib-tax-cell">
                    <input
                      type="checkbox"
                      className="ib-tax-check"
                      checked={item.taxable}
                      onChange={e => updateLineItem(idx, 'taxable', e.target.checked)}
                      title="Taxable"
                      aria-label="Taxable"
                    />
                  </div>
                  <span className="ib-col-total ib-line-total">{fmt(lineTotal(item))}</span>
                  <button
                    className="ib-col-del ib-del-btn"
                    onClick={() => removeLineItem(idx)}
                    aria-label="Remove line item"
                    disabled={lineItems.length === 1}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button className="ib-add-line" onClick={addLineItem}>
              <Plus size={14} /> Add Line Item
            </button>

            {/* Discount */}
            <div className="niw-discount-row">
              <span className="niw-discount-label">Discount</span>
              <div className="niw-discount-controls">
                <div className="ib-select-wrap">
                  <select
                    className="ib-select niw-discount-type"
                    value={discountType}
                    onChange={e => { setDiscountType(e.target.value); setDiscountValue(''); setDiscountLabel(''); }}
                  >
                    <option value="none">No discount</option>
                    <option value="fixed">Fixed ($)</option>
                    <option value="percent">Percent (%)</option>
                  </select>
                  <ChevronDown size={14} className="ib-select-icon" />
                </div>
                {discountType !== 'none' && (
                  <>
                    <input
                      className="ib-input niw-discount-name"
                      type="text"
                      placeholder="Reason (e.g. New Client)"
                      value={discountLabel}
                      onChange={e => setDiscountLabel(e.target.value)}
                    />
                    <input
                      className="ib-input niw-discount-val"
                      type="number"
                      min="0"
                      step={discountType === 'percent' ? '0.1' : '0.01'}
                      placeholder={discountType === 'percent' ? '10' : '25.00'}
                      value={discountValue}
                      onChange={e => setDiscountValue(e.target.value)}
                    />
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Client Message */}
          <div className="niw-card">
            <p className="niw-card-title">Client Message <span className="niw-optional">(optional)</span></p>
            <textarea
              className="niw-textarea"
              rows={3}
              placeholder="Thank you for your business."
              value={clientMessage}
              onChange={e => setClientMessage(e.target.value)}
            />
          </div>

          {/* Terms & Conditions */}
          <div className="niw-card">
            <p className="niw-card-title">Terms & Conditions <span className="niw-optional">(optional)</span></p>
            <textarea
              className="niw-textarea"
              rows={3}
              placeholder="Payment is due according to the terms above."
              value={terms}
              onChange={e => setTerms(e.target.value)}
            />
          </div>

          {/* Internal Notes */}
          <div className="niw-card">
            <p className="niw-card-title">Internal Notes <span className="niw-optional">(not visible to client)</span></p>
            <textarea
              className="niw-textarea"
              rows={2}
              placeholder="Notes visible to your team only…"
              value={internalNotes}
              onChange={e => setInternalNotes(e.target.value)}
            />
          </div>

          {/* Mobile bottom actions */}
          <div className="niw-mobile-actions">
            {saveError && <div className="niw-save-error">{saveError}</div>}
            <button className="btn btn-secondary" onClick={() => navigate('/invoices')} disabled={saving}>
              Cancel
            </button>
            <button className="btn btn-secondary" onClick={() => handleSave('draft')} disabled={!canDraft}>
              {saving ? 'Saving…' : 'Save Draft'}
            </button>
            <button className="btn btn-primary" onClick={() => handleSave('send')} disabled={!canSend}>
              {saving ? 'Saving…' : 'Save & Send'}
            </button>
          </div>
        </div>

        {/* ── Sidebar ──────────────────────────────────────────── */}
        <div className="niw-sidebar">

          {/* Invoice Details */}
          <div className="niw-card">
            <p className="niw-card-title">Invoice Details</p>
            <div className="niw-field">
              <label className="niw-label">Invoice #</label>
              <input
                className="niw-input niw-input--readonly"
                type="text"
                value={previewNumber != null ? `#${previewNumber}` : 'Auto-assigned'}
                readOnly
              />
            </div>
            <div className="niw-field">
              <label className="niw-label">Issued Date</label>
              <input
                className="niw-input"
                type="date"
                value={issuedDate}
                onChange={e => setIssuedDate(e.target.value)}
              />
            </div>
            <div className="niw-field">
              <label className="niw-label">Payment Terms</label>
              <div className="ib-select-wrap">
                <select
                  className="ib-select"
                  value={paymentTerms}
                  onChange={e => setPaymentTerms(e.target.value)}
                >
                  {TERM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <ChevronDown size={14} className="ib-select-icon" />
              </div>
            </div>
            {paymentTerms !== 'due_on_receipt' && (
              <div className="niw-field">
                <label className="niw-label">Due Date</label>
                <input
                  className="niw-input"
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="niw-card">
            <p className="niw-card-title">Summary</p>
            <div className="niw-totals-row">
              <span>Subtotal</span>
              <span>{fmt(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="niw-totals-row niw-totals-row--discount">
                <span>
                  {discountLabel || 'Discount'}
                  {discountType === 'percent' && discountValue ? ` (${discountValue}%)` : ''}
                </span>
                <span>−{fmt(discountAmount)}</span>
              </div>
            )}
            {taxRate > 0 ? (
              <div className="niw-totals-row">
                <span>Tax ({(taxRate * 100).toFixed(1)}%)</span>
                <span>{fmt(taxAmount)}</span>
              </div>
            ) : (
              <div className="niw-totals-row niw-totals-row--muted">
                <span>Tax</span>
                <span>Not configured</span>
              </div>
            )}
            <div className="niw-totals-divider" />
            <div className="niw-totals-row niw-totals-row--total">
              <span>Total</span>
              <span>{fmt(total)}</span>
            </div>
            <div className="niw-totals-row">
              <span>Payments Applied</span>
              <span>$0.00</span>
            </div>
            <div className="niw-totals-row niw-totals-row--balance">
              <span>Balance Due</span>
              <span>{fmt(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
