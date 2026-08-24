import React, { useState, useEffect, useRef, useCallback } from 'react';
import { format, addDays } from 'date-fns';
import { Search, X, Plus, Trash2, ChevronDown } from 'lucide-react';
import api from '../api';

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
  return { _id: Math.random().toString(36).slice(2), name: '', description: '', quantity: '1', unit_price: '', taxable: true };
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

const CADENCE_LABELS = {
  weekly:    'Every week',
  biweekly:  'Every 2 weeks',
  monthly:   'Monthly',
  quarterly: 'Quarterly',
  annual:    'Annually',
};

const BILLING_LABELS = {
  weekly:    '$x/week',
  biweekly:  '$x/2 weeks',
  monthly:   '$x/month',
  quarterly: '$x/quarter',
  annual:    '$x/year',
};

function fmtPeriodFE(start, end) {
  if (!start || !end) return '';
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end   + 'T00:00:00');
  return `${format(s, 'MMM d')}–${format(e, 'MMM d, yyyy')}`;
}

export default function InvoiceBuilder({ onClose, onCreated }) {
  // ── source ──────────────────────────────────────────────────────────────────
  const [source, setSource] = useState('blank'); // 'blank' | 'job' | 'estimate' | 'agreement'

  // ── settings (tax rate + preview invoice number) ─────────────────────────
  const [taxRate, setTaxRate]           = useState(0);
  const [previewNumber, setPreviewNumber] = useState(null);

  // ── client selection ─────────────────────────────────────────────────────
  const [clientQuery, setClientQuery]     = useState('');
  const [clientResults, setClientResults] = useState([]);
  const [clientLoading, setClientLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [showClientDrop, setShowClientDrop] = useState(false);
  const clientDebounce = useRef(null);
  const clientRef      = useRef(null);

  // ── job selection (source = 'job') ───────────────────────────────────────
  const [jobQuery, setJobQuery]       = useState('');
  const [eligibleJobs, setEligibleJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobsError, setJobsError]     = useState('');
  const jobDebounce = useRef(null);

  // ── estimate selection (source = 'estimate') ─────────────────────────────
  const [estimateQuery, setEstimateQuery]       = useState('');
  const [eligibleEstimates, setEligibleEstimates] = useState([]);
  const [estimatesLoading, setEstimatesLoading] = useState(false);
  const [selectedEstimate, setSelectedEstimate] = useState(null);
  const [estimatesError, setEstimatesError]     = useState('');
  const estimateDebounce = useRef(null);

  // ── agreement selection (source = 'agreement') ───────────────────────────
  const [agreementQuery, setAgreementQuery]         = useState('');
  const [eligibleAgreements, setEligibleAgreements] = useState([]);
  const [agreementsLoading, setAgreementsLoading]   = useState(false);
  const [selectedAgreement, setSelectedAgreement]   = useState(null);
  const [agreementsError, setAgreementsError]       = useState('');
  const agreementDebounce = useRef(null);

  // ── header fields ────────────────────────────────────────────────────────
  const [subject, setSubject]             = useState('For Services Rendered');
  const [issuedDate, setIssuedDate]       = useState(TODAY);
  const [paymentTerms, setPaymentTerms]   = useState('due_on_receipt');
  const [dueDate, setDueDate]             = useState('');

  // ── line items ───────────────────────────────────────────────────────────
  const [lineItems, setLineItems] = useState([newLineItem()]);

  // ── discount ─────────────────────────────────────────────────────────────
  const [discountType, setDiscountType]   = useState('none');
  const [discountValue, setDiscountValue] = useState('');

  // ── notes ────────────────────────────────────────────────────────────────
  const [clientMessage, setClientMessage]   = useState('');
  const [terms, setTerms]                   = useState('');
  const [internalNotes, setInternalNotes]   = useState('');

  // ── submission ───────────────────────────────────────────────────────────
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState('');

  // ── on mount: load settings ──────────────────────────────────────────────
  useEffect(() => {
    api.get('/invoices/settings')
      .then(r => {
        setTaxRate(r.data.tax_rate || 0);
        setPreviewNumber(r.data.next_number || 1001);
      })
      .catch(() => {});
  }, []);

  // ── on source change: load eligible data ─────────────────────────────────
  useEffect(() => {
    if (source === 'job')       loadEligibleJobs('');
    if (source === 'estimate')  loadEligibleEstimates('');
    if (source === 'agreement') loadEligibleAgreements('');
  }, [source]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── close client dropdown on outside click ───────────────────────────────
  useEffect(() => {
    function handle(e) {
      if (clientRef.current && !clientRef.current.contains(e.target)) {
        setShowClientDrop(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // ── client search ────────────────────────────────────────────────────────
  function handleClientQuery(val) {
    setClientQuery(val);
    setShowClientDrop(true);
    clearTimeout(clientDebounce.current);
    if (val.trim().length < 1) {
      setClientResults([]);
      return;
    }
    setClientLoading(true);
    clientDebounce.current = setTimeout(() => {
      api.get(`/clients/search?q=${encodeURIComponent(val.trim())}`)
        .then(r => setClientResults(r.data || []))
        .catch(() => setClientResults([]))
        .finally(() => setClientLoading(false));
    }, 250);
  }

  function selectClient(c) {
    setSelectedClient(c);
    setClientQuery(c.name);
    setShowClientDrop(false);
    setClientResults([]);
    if (source === 'job') {
      loadEligibleJobs(jobQuery, c.id);
    }
  }

  function clearClient() {
    setSelectedClient(null);
    setClientQuery('');
    setClientResults([]);
  }

  // ── eligible estimates ───────────────────────────────────────────────────
  function loadEligibleEstimates(q = '') {
    setEstimatesLoading(true);
    setEstimatesError('');
    const qs = new URLSearchParams();
    if (q.trim()) qs.set('q', q.trim());
    api.get(`/invoices/eligible-estimates?${qs}`)
      .then(r => setEligibleEstimates(Array.isArray(r.data) ? r.data : []))
      .catch(() => { setEstimatesError('Could not load eligible estimates.'); })
      .finally(() => setEstimatesLoading(false));
  }

  function handleEstimateQuery(val) {
    setEstimateQuery(val);
    clearTimeout(estimateDebounce.current);
    estimateDebounce.current = setTimeout(() => loadEligibleEstimates(val), 250);
  }

  function selectEstimate(est) {
    setSelectedEstimate(est);
    setSelectedClient({ id: est.client_id, name: est.client_name, email: est.client_email, address: est.client_address });
    setClientQuery(est.client_name);
    setSubject(est.title || 'For Services Rendered');
    const estItems = Array.isArray(est.line_items) ? est.line_items : [];
    setLineItems(estItems.length > 0
      ? estItems.map((item, i) => ({
          _id:        `est-line-${i}`,
          name:       item.description || item.name || 'Service',
          description:'',
          quantity:   String(parseFloat(item.quantity) || 1),
          unit_price: String(parseFloat(item.unit_price ?? item.amount) || 0),
          taxable:    true,
        }))
      : [newLineItem()]
    );
    if (est.notes) setClientMessage(est.notes);
  }

  function clearEstimate() {
    setSelectedEstimate(null);
    setEstimateQuery('');
    setEligibleEstimates([]);
  }

  // ── eligible agreements ──────────────────────────────────────────────────
  function loadEligibleAgreements(q = '') {
    setAgreementsLoading(true);
    setAgreementsError('');
    const qs = new URLSearchParams();
    if (q.trim()) qs.set('q', q.trim());
    api.get(`/invoices/eligible-agreements?${qs}`)
      .then(r => setEligibleAgreements(Array.isArray(r.data) ? r.data : []))
      .catch(() => setAgreementsError('Could not load agreements.'))
      .finally(() => setAgreementsLoading(false));
  }

  function handleAgreementQuery(val) {
    setAgreementQuery(val);
    clearTimeout(agreementDebounce.current);
    agreementDebounce.current = setTimeout(() => loadEligibleAgreements(val), 250);
  }

  function selectAgreement(agr) {
    setSelectedAgreement(agr);
    setSelectedClient({ id: agr.client_id, name: agr.client_name, email: agr.client_email, address: agr.client_address });
    setClientQuery(agr.client_name);
    const subj = `${agr.name} — ${fmtPeriodFE(agr.period_start, agr.period_end)}`;
    setSubject(subj);
    const agrItems = Array.isArray(agr.line_items) ? agr.line_items : [];
    setLineItems(agrItems.length > 0
      ? agrItems.map((item, i) => ({
          _id:        `agr-line-${i}`,
          name:       item.description || item.name || agr.name || 'Service',
          description:'',
          quantity:   String(parseFloat(item.quantity) || 1),
          unit_price: String(parseFloat(item.unit_price ?? item.amount) || 0),
          taxable:    true,
        }))
      : [{
          _id:        'agr-line-0',
          name:       agr.name || 'Recurring Service',
          description:`Coverage: ${fmtPeriodFE(agr.period_start, agr.period_end)}`,
          quantity:   '1',
          unit_price: String(parseFloat(agr.plan_price) || 0),
          taxable:    true,
        }]
    );
  }

  function clearAgreement() {
    setSelectedAgreement(null);
    setAgreementQuery('');
    setEligibleAgreements([]);
    setSelectedClient(null);
    setClientQuery('');
  }

  // ── eligible jobs ────────────────────────────────────────────────────────
  function loadEligibleJobs(q = '', clientId = selectedClient?.id) {
    setJobsLoading(true);
    setJobsError('');
    const qs = new URLSearchParams();
    if (q.trim()) qs.set('search', q.trim());
    if (clientId) qs.set('client_id', clientId);
    api.get(`/invoices/eligible-jobs?${qs}`)
      .then(r => setEligibleJobs(r.data.rows || []))
      .catch(() => { setJobsError('Could not load eligible jobs.'); })
      .finally(() => setJobsLoading(false));
  }

  function handleJobQuery(val) {
    setJobQuery(val);
    clearTimeout(jobDebounce.current);
    jobDebounce.current = setTimeout(() => loadEligibleJobs(val), 300);
  }

  function selectJob(j) {
    setSelectedJob(j);
    // prefill client and subject from the job
    if (!selectedClient) {
      setSelectedClient({ id: j.client_id, name: j.client_name, email: j.client_email });
      setClientQuery(j.client_name);
    }
    setSubject(j.service_type || 'For Services Rendered');
    // prefill single line item
    setLineItems([{
      _id:        'job-line',
      name:       j.service_type || 'Service',
      description:'',
      quantity:   '1',
      unit_price: parseFloat(j.amount || 0).toFixed(2),
      taxable:    taxRate > 0,
    }]);
  }

  // ── payment terms → due date ─────────────────────────────────────────────
  useEffect(() => {
    if (paymentTerms === 'due_on_receipt' || paymentTerms === 'custom') {
      if (paymentTerms === 'due_on_receipt') setDueDate('');
      return;
    }
    const days = TERM_DAYS[paymentTerms];
    if (!days) return;
    const base = issuedDate ? new Date(issuedDate) : new Date();
    setDueDate(format(addDays(base, days), 'yyyy-MM-dd'));
  }, [paymentTerms, issuedDate]);

  // ── line item helpers ────────────────────────────────────────────────────
  function updateLineItem(index, field, value) {
    setLineItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function addLineItem() {
    setLineItems(prev => [...prev, newLineItem()]);
  }

  function removeLineItem(index) {
    setLineItems(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== index));
  }

  // ── computed totals ──────────────────────────────────────────────────────
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

  // ── save ─────────────────────────────────────────────────────────────────
  async function handleSave(action) {
    setSaveError('');

    if (source === 'job' && !selectedJob) {
      setSaveError('Please select a completed job.');
      return;
    }
    if (source === 'estimate' && !selectedEstimate) {
      setSaveError('Please select a signed estimate.');
      return;
    }
    if (source === 'agreement' && !selectedAgreement) {
      setSaveError('Please select a recurring agreement.');
      return;
    }
    const clientId = source === 'job'
      ? (selectedJob?.client_id || selectedClient?.id)
      : source === 'estimate'
        ? selectedEstimate?.client_id
        : source === 'agreement'
          ? selectedAgreement?.client_id
          : selectedClient?.id;

    if (!clientId) {
      setSaveError('Please select a client.');
      return;
    }
    const validItems = lineItems.filter(i => i.name.trim() || parseFloat(i.unit_price) > 0);
    if (validItems.length === 0) {
      setSaveError('Add at least one line item with a name and price.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        source_type: source === 'job' ? 'JOB'
          : source === 'estimate' ? 'ESTIMATE'
          : source === 'agreement' ? 'AGREEMENT'
          : 'MANUAL',
        ...(source === 'job'       ? { job_id: selectedJob.id } : {}),
        ...(source === 'estimate'  ? { source_estimate_id: selectedEstimate.id } : {}),
        ...(source === 'agreement' ? {
          source_agreement_id: selectedAgreement.id,
          period_start:        selectedAgreement.period_start,
          period_end:          selectedAgreement.period_end,
        } : {}),
        ...(source === 'blank'    ? { client_id: clientId } : {}),
        subject:        subject.trim() || 'For Services Rendered',
        issued_date:    issuedDate,
        payment_terms:  paymentTerms,
        due_date:       dueDate || undefined,
        line_items:     lineItems.map(item => ({
          name:        item.name.trim(),
          description: item.description.trim(),
          quantity:    parseFloat(item.quantity) || 1,
          unit_price:  parseFloat(item.unit_price) || 0,
          taxable:     item.taxable,
          line_total:  lineTotal(item),
        })),
        discount_type:  discountType !== 'none' ? discountType : null,
        discount_value: discountType !== 'none' ? parseFloat(discountValue) || 0 : null,
        client_message: clientMessage.trim() || null,
        terms:          terms.trim() || null,
        internal_notes: internalNotes.trim() || null,
        status:         action === 'send' ? 'pending' : 'draft',
      };

      const res = await api.post('/invoices', payload);

      if (action === 'send') {
        await api.post(`/invoices/${res.data.id}/send`);
      }

      onCreated(res.data);
    } catch (err) {
      const msg = (err.response?.data?.error || '').toLowerCase();
      if (msg.includes('billing period has already been invoiced')) {
        setSaveError('This billing period has already been invoiced for this agreement.');
      } else if (msg.includes('already been invoiced')) {
        setSaveError('This estimate has already been converted to an invoice.');
      } else if (msg.includes('signed')) {
        setSaveError('Only signed estimates can be converted to invoices.');
      } else if (msg.includes('already') || msg.includes('duplicate')) {
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

  const canSave = !saving && (
    source === 'job'
      ? (!!selectedJob && lineItems.some(i => i.name || parseFloat(i.unit_price) > 0))
      : source === 'estimate'
        ? (!!selectedEstimate && lineItems.some(i => i.name || parseFloat(i.unit_price) > 0))
        : source === 'agreement'
          ? (!!selectedAgreement && lineItems.some(i => i.name || parseFloat(i.unit_price) > 0))
          : (!!selectedClient && lineItems.some(i => i.name || parseFloat(i.unit_price) > 0))
  );

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="ib-sheet" onClick={e => e.stopPropagation()}>

      {/* Header */}
      <div className="ib-header">
        <div>
          <h2 className="ib-title">New Invoice</h2>
          {previewNumber && (
            <span className="ib-preview-num">Preview #{previewNumber}</span>
          )}
        </div>
        <button className="ib-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="ib-body">

        {/* Source picker */}
        <div className="ib-section">
          <p className="ib-section-label">Create invoice from</p>
          <div className="ib-source-row">
            <button
              className={`ib-source-btn${source === 'blank' ? ' active' : ''}`}
              onClick={() => { setSource('blank'); setSelectedJob(null); setSelectedEstimate(null); }}
            >
              Blank Invoice
            </button>
            <button
              className={`ib-source-btn${source === 'job' ? ' active' : ''}`}
              onClick={() => { setSource('job'); setSelectedEstimate(null); clearEstimate(); }}
            >
              Completed Job
            </button>
            <button
              className={`ib-source-btn${source === 'estimate' ? ' active' : ''}`}
              onClick={() => { setSource('estimate'); setSelectedJob(null); clearAgreement(); }}
            >
              Existing Estimate
            </button>
            <button
              className={`ib-source-btn${source === 'agreement' ? ' active' : ''}`}
              onClick={() => { setSource('agreement'); setSelectedJob(null); clearEstimate(); }}
            >
              Recurring Agreement
            </button>
          </div>
        </div>

        {/* Client selection */}
        <div className="ib-section">
          <p className="ib-section-label">Client <span className="ib-required">*</span></p>
          <div className="ib-client-wrap" ref={clientRef}>
            <div className="ib-client-search-row">
              <Search size={14} className="ib-search-icon" />
              <input
                className="ib-client-input"
                type="text"
                placeholder="Search by name, email, or phone…"
                value={clientQuery}
                onChange={e => handleClientQuery(e.target.value)}
                onFocus={() => { if (clientQuery.length >= 1) setShowClientDrop(true); }}
                autoComplete="off"
              />
              {selectedClient && (
                <button className="ib-client-clear" onClick={clearClient} aria-label="Clear">
                  <X size={14} />
                </button>
              )}
            </div>

            {showClientDrop && (clientLoading || clientResults.length > 0) && (
              <div className="ib-client-drop">
                {clientLoading ? (
                  <div className="ib-drop-loading">Searching…</div>
                ) : (
                  clientResults.map(c => (
                    <button key={c.id} className="ib-drop-row" onMouseDown={() => selectClient(c)}>
                      <span className="ib-drop-name">{c.name}</span>
                      {c.email && <span className="ib-drop-meta">{c.email}</span>}
                      {c.phone && <span className="ib-drop-meta">{c.phone}</span>}
                    </button>
                  ))
                )}
              </div>
            )}

            {selectedClient && (
              <div className="ib-client-card">
                <div className="ib-client-card-name">{selectedClient.name}</div>
                {selectedClient.email && <div className="ib-client-card-detail">{selectedClient.email}</div>}
                {selectedClient.phone && <div className="ib-client-card-detail">{selectedClient.phone}</div>}
                {selectedClient.address && <div className="ib-client-card-detail">{selectedClient.address}{selectedClient.city ? `, ${selectedClient.city}` : ''}{selectedClient.state ? `, ${selectedClient.state}` : ''}{selectedClient.zip ? ` ${selectedClient.zip}` : ''}</div>}
              </div>
            )}
          </div>
        </div>

        {/* Estimate picker — shown when source = 'estimate' */}
        {source === 'estimate' && (
          <div className="ib-section">
            <p className="ib-section-label">Signed Estimate <span className="ib-required">*</span></p>
            {selectedEstimate ? (
              <div className="ib-est-card">
                <div className="ib-est-card-top">
                  <div>
                    <div className="ib-est-card-title">{selectedEstimate.title}</div>
                    <div className="ib-est-card-client">{selectedEstimate.client_name}</div>
                  </div>
                  <div className="ib-est-card-right">
                    <span className="ib-est-card-amount">${parseFloat(selectedEstimate.amount || 0).toFixed(2)}</span>
                    <button className="ib-client-clear" onClick={clearEstimate} aria-label="Change estimate">
                      <X size={14} />
                    </button>
                  </div>
                </div>
                {selectedEstimate.signed_at && (
                  <div className="ib-est-card-meta">
                    Signed {format(new Date(selectedEstimate.signed_at), 'MMM d, yyyy')}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="ib-job-search-wrap">
                  <Search size={14} className="ib-search-icon" />
                  <input
                    className="ib-job-input"
                    type="text"
                    placeholder="Search by client, title, or amount…"
                    value={estimateQuery}
                    onChange={e => handleEstimateQuery(e.target.value)}
                  />
                </div>
                <div className="ib-job-list">
                  {estimatesLoading ? (
                    <div className="ib-state">Loading…</div>
                  ) : estimatesError ? (
                    <div className="ib-state ib-state--error">{estimatesError}</div>
                  ) : eligibleEstimates.length === 0 ? (
                    <div className="ib-empty">
                      <p className="ib-empty-primary">No signed estimates are available.</p>
                      <p className="ib-empty-secondary">Estimates become eligible after the client signs them and they have not yet been invoiced.</p>
                    </div>
                  ) : (
                    eligibleEstimates.map(est => (
                      <button
                        key={est.id}
                        className="ib-job-row"
                        onClick={() => selectEstimate(est)}
                      >
                        <div className="ib-job-top">
                          <span className="ib-job-client">{est.client_name}</span>
                          <span className="ib-job-amount">${parseFloat(est.amount || 0).toFixed(2)}</span>
                        </div>
                        <div className="ib-job-service">{est.title}</div>
                        <div className="ib-job-meta">
                          Signed {est.signed_at ? format(new Date(est.signed_at), 'MMM d, yyyy') : format(new Date(est.created_at), 'MMM d, yyyy')}
                          {est.client_address && <span className="ib-job-addr"> · {est.client_address}</span>}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Agreement picker — shown when source = 'agreement' */}
        {source === 'agreement' && (
          <div className="ib-section">
            <p className="ib-section-label">Active Recurring Agreement <span className="ib-required">*</span></p>
            {selectedAgreement ? (
              <div className="ib-agr-card">
                <div className="ib-agr-card-top">
                  <div>
                    <div className="ib-agr-card-title">{selectedAgreement.name}</div>
                    <div className="ib-agr-card-client">{selectedAgreement.client_name}</div>
                  </div>
                  <div className="ib-agr-card-right">
                    <span className="ib-agr-card-amount">${parseFloat(selectedAgreement.plan_price || 0).toFixed(2)}</span>
                    <button className="ib-client-clear" onClick={clearAgreement} aria-label="Change agreement">
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div className="ib-agr-card-meta">
                  {CADENCE_LABELS[selectedAgreement.cadence] || selectedAgreement.cadence}
                  {' · '}
                  Coverage: {fmtPeriodFE(selectedAgreement.period_start, selectedAgreement.period_end)}
                  {' · '}
                  {selectedAgreement.payment_status === 'paid_in_advance'
                    ? 'Paid in Advance'
                    : selectedAgreement.payment_status === 'failed'
                      ? 'Payment Failed'
                      : selectedAgreement.payment_status === 'overdue'
                        ? 'Overdue'
                        : 'Pending'}
                </div>
                {selectedAgreement.period_already_invoiced && (
                  <div className="ib-agr-card-warn">
                    This billing period has already been invoiced.
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="ib-job-search-wrap">
                  <Search size={14} className="ib-search-icon" />
                  <input
                    className="ib-job-input"
                    type="text"
                    placeholder="Search by client, agreement name, or service…"
                    value={agreementQuery}
                    onChange={e => handleAgreementQuery(e.target.value)}
                  />
                </div>
                <div className="ib-job-list">
                  {agreementsLoading ? (
                    <div className="ib-state">Loading…</div>
                  ) : agreementsError ? (
                    <div className="ib-state ib-state--error">{agreementsError}</div>
                  ) : eligibleAgreements.length === 0 ? (
                    <div className="ib-empty">
                      <p className="ib-empty-primary">No active agreements found.</p>
                      <p className="ib-empty-secondary">Create a recurring agreement on the client record to invoice from here.</p>
                    </div>
                  ) : (
                    eligibleAgreements.map(agr => (
                      <button
                        key={agr.id}
                        className={`ib-job-row${agr.period_already_invoiced ? ' ib-job-row--dim' : ''}`}
                        onClick={() => selectAgreement(agr)}
                      >
                        <div className="ib-job-top">
                          <span className="ib-job-client">{agr.client_name}</span>
                          <span className="ib-job-amount">${parseFloat(agr.plan_price || 0).toFixed(2)}</span>
                        </div>
                        <div className="ib-job-service"><span>{agr.name}</span>{agr.service_type ? <span className="ib-job-service-type"> · {agr.service_type}</span> : null}</div>
                        <div className="ib-job-meta">
                          {CADENCE_LABELS[agr.cadence] || agr.cadence}
                          {' · '}
                          {fmtPeriodFE(agr.period_start, agr.period_end)}
                          {agr.payment_status === 'paid_in_advance' && <span className="ib-agr-paid"> · Paid in Advance</span>}
                          {agr.period_already_invoiced && <span className="ib-agr-invoiced"> · Already Invoiced</span>}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Job picker — shown when source = 'job' */}
        {source === 'job' && (
          <div className="ib-section">
            <p className="ib-section-label">Completed Job <span className="ib-required">*</span></p>
            <div className="ib-job-search-wrap">
              <Search size={14} className="ib-search-icon" />
              <input
                className="ib-job-input"
                type="text"
                placeholder="Search by client, service type, or address…"
                value={jobQuery}
                onChange={e => handleJobQuery(e.target.value)}
              />
            </div>
            <div className="ib-job-list">
              {jobsLoading ? (
                <div className="ib-state">Loading…</div>
              ) : jobsError ? (
                <div className="ib-state ib-state--error">{jobsError}</div>
              ) : eligibleJobs.length === 0 ? (
                <div className="ib-empty">
                  <p className="ib-empty-primary">No completed jobs are ready to invoice.</p>
                  <p className="ib-empty-secondary">Jobs become eligible after they are marked complete and have no existing invoice.</p>
                </div>
              ) : (
                eligibleJobs.map(j => (
                  <button
                    key={j.id}
                    className={`ib-job-row${selectedJob?.id === j.id ? ' selected' : ''}`}
                    onClick={() => selectJob(j)}
                  >
                    <div className="ib-job-top">
                      <span className="ib-job-client">{j.client_name}</span>
                      <span className="ib-job-amount">{fmt(j.amount)}</span>
                    </div>
                    <div className="ib-job-service">{j.service_type || 'Service'}</div>
                    <div className="ib-job-meta">
                      Completed {j.scheduled_at ? format(new Date(j.scheduled_at), 'MMM d, yyyy') : '—'}
                      {j.address && <span className="ib-job-addr"> · {j.address}</span>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Invoice header */}
        <div className="ib-section">
          <p className="ib-section-label">Invoice Details</p>
          <div className="ib-header-grid">
            <div className="ib-field">
              <label className="ib-label">Subject</label>
              <input
                className="ib-input"
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="For Services Rendered"
              />
            </div>
            <div className="ib-field">
              <label className="ib-label">Invoice #</label>
              <input
                className="ib-input ib-input--readonly"
                type="text"
                value={previewNumber ? `#${previewNumber}` : 'Auto-assigned'}
                readOnly
              />
            </div>
            <div className="ib-field">
              <label className="ib-label">Issued Date</label>
              <input
                className="ib-input"
                type="date"
                value={issuedDate}
                onChange={e => setIssuedDate(e.target.value)}
              />
            </div>
            <div className="ib-field">
              <label className="ib-label">Payment Terms</label>
              <div className="ib-select-wrap">
                <select
                  className="ib-select"
                  value={paymentTerms}
                  onChange={e => setPaymentTerms(e.target.value)}
                >
                  {TERM_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="ib-select-icon" />
              </div>
            </div>
            <div className="ib-field">
              <label className="ib-label">Due Date</label>
              <input
                className="ib-input"
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                placeholder={paymentTerms === 'due_on_receipt' ? 'Due on receipt' : ''}
              />
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="ib-section">
          <p className="ib-section-label">Line Items</p>
          <div className="ib-items-table">
            <div className="ib-items-head">
              <span className="ib-col-name">Name</span>
              <span className="ib-col-desc">Description</span>
              <span className="ib-col-qty">Qty</span>
              <span className="ib-col-price">Unit Price</span>
              <span className="ib-col-tax">Tax</span>
              <span className="ib-col-total">Total</span>
              <span className="ib-col-del" />
            </div>
            {lineItems.map((item, idx) => (
              <div key={item._id} className="ib-items-row">
                <input
                  className="ib-input ib-col-name"
                  type="text"
                  placeholder="Service name"
                  value={item.name}
                  onChange={e => updateLineItem(idx, 'name', e.target.value)}
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
                  />
                </div>
                <span className="ib-col-total ib-line-total">
                  {fmt(lineTotal(item))}
                </span>
                <button
                  className="ib-col-del ib-del-btn"
                  onClick={() => removeLineItem(idx)}
                  aria-label="Remove line"
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
        </div>

        {/* Discount + Totals */}
        <div className="ib-section ib-totals-section">
          <div className="ib-discount-row">
            <span className="ib-totals-label-left">Discount</span>
            <div className="ib-discount-controls">
              <div className="ib-select-wrap ib-discount-type-wrap">
                <select
                  className="ib-select ib-discount-select"
                  value={discountType}
                  onChange={e => { setDiscountType(e.target.value); setDiscountValue(''); }}
                >
                  <option value="none">No discount</option>
                  <option value="fixed">Fixed amount ($)</option>
                  <option value="percent">Percentage (%)</option>
                </select>
                <ChevronDown size={14} className="ib-select-icon" />
              </div>
              {discountType !== 'none' && (
                <input
                  className="ib-input ib-discount-val"
                  type="number"
                  min="0"
                  step={discountType === 'percent' ? '0.1' : '0.01'}
                  placeholder={discountType === 'percent' ? '10' : '25.00'}
                  value={discountValue}
                  onChange={e => setDiscountValue(e.target.value)}
                />
              )}
            </div>
          </div>

          <div className="ib-totals-panel">
            <div className="ib-totals-row">
              <span>Subtotal</span>
              <span>{fmt(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="ib-totals-row ib-totals-row--discount">
                <span>Discount {discountType === 'percent' ? `(${discountValue}%)` : ''}</span>
                <span>-{fmt(discountAmount)}</span>
              </div>
            )}
            {taxRate > 0 && (
              <div className="ib-totals-row">
                <span>Tax ({(taxRate * 100).toFixed(1)}%)</span>
                <span>{fmt(taxAmount)}</span>
              </div>
            )}
            <div className="ib-totals-divider" />
            <div className="ib-totals-row ib-totals-row--total">
              <span>Total</span>
              <span>{fmt(total)}</span>
            </div>
            <div className="ib-totals-row ib-totals-row--balance">
              <span>Balance Due</span>
              <span>{fmt(total)}</span>
            </div>
          </div>
        </div>

        {/* Client message */}
        <div className="ib-section">
          <p className="ib-section-label">Client Message <span className="ib-optional">(optional)</span></p>
          <textarea
            className="ib-textarea"
            rows={2}
            placeholder="Thank you for your business."
            value={clientMessage}
            onChange={e => setClientMessage(e.target.value)}
          />
        </div>

        {/* Terms & Conditions */}
        <div className="ib-section">
          <p className="ib-section-label">Terms & Conditions <span className="ib-optional">(optional)</span></p>
          <textarea
            className="ib-textarea"
            rows={2}
            placeholder="Payment is due according to the terms above. Please contact us with any questions."
            value={terms}
            onChange={e => setTerms(e.target.value)}
          />
        </div>

        {/* Internal notes */}
        <div className="ib-section">
          <p className="ib-section-label">Internal Notes <span className="ib-optional">(not visible to client)</span></p>
          <textarea
            className="ib-textarea"
            rows={2}
            placeholder="Notes visible to your team only…"
            value={internalNotes}
            onChange={e => setInternalNotes(e.target.value)}
          />
        </div>

      </div>{/* end .ib-body */}

      {/* Footer */}
      <div className="ib-footer">
        {saveError && <p className="ib-save-error">{saveError}</p>}
        <div className="ib-footer-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn btn-outline"
            onClick={() => handleSave('draft')}
            disabled={!canSave}
          >
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => handleSave('send')}
            disabled={!canSave}
          >
            {saving ? 'Saving…' : 'Save & Send'}
          </button>
        </div>
      </div>

    </div>
  );
}
