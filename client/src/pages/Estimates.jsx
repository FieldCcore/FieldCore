import React, { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { ChevronDown, Search, Check, MoreHorizontal, Send } from 'lucide-react';
import api from '../api';
import StatusBadge from '../components/StatusBadge';
import EstimateComposer from './EstimateComposer';

const STATUS_OPTS = [
  { value: 'all',      label: 'All statuses' },
  { value: 'draft',    label: 'Draft' },
  { value: 'sent',     label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'expired',  label: 'Expired / Declined' },
];
const STATUS_GROUPS = {
  draft:    ['draft'],
  sent:     ['sent'],
  accepted: ['signed', 'accepted', 'approved'],
  expired:  ['expired', 'declined', 'cancelled', 'canceled'],
};
const DATE_OPTS = [
  { value: 'all',   label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week',  label: 'This week' },
  { value: 'month', label: 'This month' },
];

function SortTh({ col, label, sortCol, sortDir, onSort, className = '' }) {
  const active = sortCol === col;
  const icon = active ? (sortDir === 'asc' ? '↑' : '↓') : '↕';
  return (
    <th
      className={`inv-th-sortable${className ? ` ${className}` : ''}`}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      onClick={() => onSort(col)}
      tabIndex={0}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSort(col)}
    >
      {label}
      <span className={`inv-sort-icon${active ? ' inv-sort-icon--active' : ''}`}>{icon}</span>
    </th>
  );
}

function fmt$(n) { return `$${parseFloat(n || 0).toFixed(2)}`; }
function fmtDt(d) { return d ? format(new Date(d), 'MMM d, yyyy') : '—'; }

// ─── Create Estimate Modal ──────────────────────────────────────────────────
function CreateEstimateModal({ onCreated, onClose }) {
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({ client_id:'', title:'Service Estimate', notes:'', valid_until:'' });
  const [lineItems, setLineItems] = useState([{ description:'', amount:'' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    api.get('/clients').then(r => setClients(r.data));
  }, []);

  function setLI(i, field, val) {
    setLineItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  }

  function addLI() { setLineItems(prev => [...prev, { description:'', amount:'' }]); }
  function removeLI(i) { if (lineItems.length > 1) setLineItems(prev => prev.filter((_, idx) => idx !== i)); }

  const subtotal = lineItems.reduce((s, i) => s + parseFloat(i.amount || 0), 0);

  async function submit(e) {
    e.preventDefault();
    if (!form.client_id) return setError('Select a client.');
    const items = lineItems.filter(i => i.description.trim() && parseFloat(i.amount) > 0);
    if (!items.length) return setError('Add at least one line item.');
    setSaving(true); setError('');
    try {
      const res = await api.post('/estimates', {
        ...form,
        line_items: items.map(i => ({ description: i.description.trim(), amount: parseFloat(i.amount) })),
        valid_until: form.valid_until || null,
      });
      onCreated(res.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create estimate.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New Estimate</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
        <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:16, paddingTop:4 }}>
          {error && <p className="form-error">{error}</p>}
          <div className="form-row">
            <div className="form-group">
              <label>Client *</label>
              <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}>
                <option value="">Select client…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Title</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
          </div>

          <div className="form-group">
            <label>Line Items</label>
            {lineItems.map((item, i) => (
              <div key={i} style={{ display:'flex', gap:8, marginBottom:6, alignItems:'center' }}>
                <input
                  value={item.description} onChange={e => setLI(i,'description',e.target.value)}
                  placeholder="Description" style={{ flex:1 }}
                />
                <input
                  value={item.amount} onChange={e => setLI(i,'amount',e.target.value)}
                  placeholder="0.00" inputMode="decimal"
                  style={{ width:110, textAlign:'right', fontFamily:'DM Mono, monospace' }}
                />
                {lineItems.length > 1 && (
                  <button type="button" onClick={() => removeLI(i)} style={{ flexShrink:0, background:'none',border:'none',color:'#e53e3e',cursor:'pointer',fontSize:18,lineHeight:1,padding:'0 2px' }}>×</button>
                )}
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:4 }}>
              <button type="button" className="btn-secondary" onClick={addLI} style={{ fontSize:12, padding:'5px 12px' }}>+ Add Item</button>
              <span style={{ fontSize:13, fontWeight:700, color:'var(--navy)' }}>Subtotal: {fmt$(subtotal)}</span>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Valid Until</label>
              <input type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} />
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create Estimate'}</button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}

// Human-readable labels for estimate activity event types.
const EVENT_DISPLAY = {
  'estimate.created':              { label: 'Estimate created',            key: true  },
  'estimate.sent':                 { label: 'Estimate sent',               key: true  },
  'estimate.viewed':               { label: 'Customer viewed estimate',    key: true  },
  'estimate.follow_up_due':        { label: 'Follow-up recommended',       key: false },
  'estimate.approved':             { label: 'Customer approved estimate',  key: true  },
  'estimate.declined':             { label: 'Estimate manually expired',   key: false },
  'estimate.expired':              { label: 'Estimate expired',            key: false },
  'estimate.revision_created':     { label: 'Revision created',            key: false },
  'estimate.deposit_received':     { label: 'Deposit received',            key: true  },
  'estimate.converted_to_job':     { label: 'Converted to job',            key: true  },
  'estimate.converted_to_project': { label: 'Converted to project',        key: true  },
};

function fmtActivityTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' at '
    + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function EstimateTimeline({ estimateId }) {
  const [events, setEvents] = useState(null);

  useEffect(() => {
    api.get(`/estimates/${estimateId}/activity`)
      .then(r => setEvents(r.data || []))
      .catch(() => setEvents([]));
  }, [estimateId]);

  if (events === null) return (
    <div className="est-tl">
      <p className="est-tl-title">Activity</p>
      <p className="est-tl-empty">Loading…</p>
    </div>
  );
  if (events.length === 0) return (
    <div className="est-tl">
      <p className="est-tl-title">Activity</p>
      <p className="est-tl-empty">No activity recorded yet.</p>
    </div>
  );

  return (
    <div className="est-tl">
      <p className="est-tl-title">Activity</p>
      <div className="est-tl-list">
        {events.map((ev, i) => {
          const display = EVENT_DISPLAY[ev.event_type] || { label: ev.event_type, key: false };
          return (
            <div key={ev.id || i} className="est-tl-item">
              <div className={`est-tl-dot${display.key ? ' est-tl-dot--key' : ''}`} />
              <div className="est-tl-content">
                <div className="est-tl-summary">{display.label}</div>
                {ev.summary && ev.summary !== display.label && (
                  <div className="est-tl-detail">{ev.summary}</div>
                )}
                <div className="est-tl-meta">{fmtActivityTime(ev.occurred_at)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Estimate Detail Modal ──────────────────────────────────────────────────
function EstimateDetail({ estimate: init, onUpdate, onClose }) {
  const [estimate,     setEstimate]     = useState(init);
  const [sending,      setSending]      = useState(false);
  const [copied,       setCopied]       = useState(false);
  const [converting,   setConverting]   = useState(false);
  const [convertedJobId,      setConvertedJobId]      = useState(init.converted_job_id || null);
  const [convertedInvoiceId,  setConvertedInvoiceId]  = useState(init.converted_invoice_id || null);
  const [convertedInvoiceNum, setConvertedInvoiceNum] = useState(init.converted_invoice_number || null);
  const [convertError, setConvertError] = useState('');
  const [activityKey,  setActivityKey]  = useState(0);

  async function convertToJob() {
    if (!confirm('Convert this estimate into a new scheduled job?')) return;
    setConverting(true);
    setConvertError('');
    try {
      const r = await api.post(`/estimates/${estimate.id}/convert-to-job`);
      const jobId = r.data.job.id;
      setConvertedJobId(jobId);
      const updated = { ...estimate, converted_job_id: jobId };
      setEstimate(updated);
      onUpdate(updated);
      setActivityKey(k => k + 1);
    } catch (err) {
      if (err.response?.status === 409) {
        setConvertedJobId(err.response.data.job_id);
      } else {
        setConvertError(err.response?.data?.error || 'Conversion failed. Please try again.');
      }
    } finally {
      setConverting(false);
    }
  }

  async function send() {
    setSending(true);
    try {
      const r = await api.post(`/estimates/${estimate.id}/send`);
      const updated = { ...estimate, status: 'sent', sent_at: new Date().toISOString(), sign_url: r.data.sign_url };
      setEstimate(updated); onUpdate(updated);
      setActivityKey(k => k + 1);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to send.');
    } finally { setSending(false); }
  }

  async function voidEst() {
    if (!confirm('Expire this estimate?')) return;
    await api.post(`/estimates/${estimate.id}/void`);
    const updated = { ...estimate, status: 'expired' };
    setEstimate(updated); onUpdate(updated);
    setActivityKey(k => k + 1);
  }

  function copyLink() {
    const url = estimate.sign_url || `${window.location.origin}/sign/${estimate.signing_token}`;
    navigator.clipboard.writeText(url);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  const tax      = parseFloat(estimate.tax_amount || 0);
  const total    = parseFloat(estimate.amount || 0);
  const subtotal = total - tax;
  const lineItems = Array.isArray(estimate.line_items) ? estimate.line_items : [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{estimate.title}</h2>
            <StatusBadge status={estimate.status} style={{ marginTop: 4 }} />
          </div>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
        <div className="invoice-meta" style={{ marginBottom:12 }}>
          <div className="detail-row"><label>Client</label><span>{estimate.client_name}</span></div>
          <div className="detail-row"><label>Created</label><span>{fmtDt(estimate.created_at)}</span></div>
          {estimate.valid_until && <div className="detail-row"><label>Valid Until</label><span>{fmtDt(estimate.valid_until)}</span></div>}
          {estimate.signed_at   && <div className="detail-row"><label>Signed</label><span>{fmtDt(estimate.signed_at)}</span></div>}
          {estimate.sent_at     && <div className="detail-row"><label>Sent</label><span>{fmtDt(estimate.sent_at)}</span></div>}
          {estimate.view_count > 0 && (
            <div className="detail-row">
              <label>Views</label>
              <span>{estimate.view_count} view{estimate.view_count !== 1 ? 's' : ''}</span>
            </div>
          )}
          {estimate.revision_number > 1 && (
            <div className="detail-row"><label>Revision</label><span>{estimate.revision_number}</span></div>
          )}
        </div>

        <div className="invoice-amount-block">
          {lineItems.map((item, i) => (
            <div key={i} style={{ display:'flex',justifyContent:'space-between',fontSize:13,color:'#1C2333',marginBottom:6 }}>
              <span>{item.description || item.name}</span>
              <span style={{ fontVariantNumeric:'tabular-nums' }}>{fmt$(item.amount ?? item.line_total)}</span>
            </div>
          ))}
          {tax > 0 && (
            <>
              <div style={{ display:'flex',justifyContent:'space-between',fontSize:13,color:'#64748b',borderTop:'1px solid #e2e8f0',paddingTop:8,marginBottom:4 }}>
                <span>Subtotal</span><span>{fmt$(subtotal)}</span>
              </div>
              <div style={{ display:'flex',justifyContent:'space-between',fontSize:13,color:'#64748b',marginBottom:8 }}>
                <span>Tax</span><span>{fmt$(tax)}</span>
              </div>
            </>
          )}
          <div style={{ display:'flex',justifyContent:'space-between',borderTop:'1px solid #e2e8f0',paddingTop:8 }}>
            <span className="invoice-amount-label">Total</span>
            <span className="invoice-amount">{fmt$(total)}</span>
          </div>
        </div>

        {estimate.notes && (
          <div style={{ background:'#f9f7f3',border:'1px solid #e5e0d8',borderRadius:8,padding:'12px 14px',fontSize:13,color:'#5F667A',marginBottom:12 }}>
            {estimate.notes}
          </div>
        )}

        {estimate.signing_token && (
          <div className="payment-link-box" style={{ marginBottom:12 }}>
            <input readOnly value={`${window.location.origin}/sign/${estimate.signing_token}`} className="link-input" />
            <button className="btn-primary" onClick={copyLink}>{copied ? 'Copied!' : 'Copy'}</button>
            <a href={`/sign/${estimate.signing_token}`} target="_blank" rel="noreferrer" className="btn-secondary">Preview</a>
          </div>
        )}

        <div className="invoice-actions">
          {['draft','sent'].includes(estimate.status) && estimate.client_email && (
            <button className="btn-primary" onClick={send} disabled={sending}>
              {sending ? 'Sending…' : estimate.status === 'sent' ? 'Resend' : 'Send for Signature'}
            </button>
          )}
          {!estimate.client_email && estimate.status === 'draft' && (
            <p style={{ fontSize:12,color:'#94a3b8' }}>Add client email to send for signature.</p>
          )}
          {['draft','sent'].includes(estimate.status) && (
            <button className="btn-void" onClick={voidEst}>Expire</button>
          )}
          {estimate.status === 'signed' && !convertedJobId && !convertedInvoiceId && (
            <button className="btn-primary" onClick={convertToJob} disabled={converting}>
              {converting ? 'Converting…' : 'Convert to Job'}
            </button>
          )}
          {convertedJobId && (
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:13, color:'var(--green)', fontWeight:700 }}>Converted to Job</span>
              <a href="/jobs" style={{ fontSize:12, color:'var(--navy)', textDecoration:'underline' }}>View Jobs →</a>
            </div>
          )}
          {convertedInvoiceId && (
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:13, color:'var(--green)', fontWeight:700 }}>
                Converted to Invoice{convertedInvoiceNum ? ` #${convertedInvoiceNum}` : ''}
              </span>
              <a href="/invoices" style={{ fontSize:12, color:'var(--navy)', textDecoration:'underline' }}>View Invoices →</a>
            </div>
          )}
          {convertError && (
            <p style={{ fontSize:12, color:'var(--red)', margin:0 }}>{convertError}</p>
          )}
        </div>

        <EstimateTimeline key={activityKey} estimateId={estimate.id} />
        </div>
      </div>
    </div>
  );
}

// ─── Main Estimates Page ────────────────────────────────────────────────────
export default function EstimatesPage() {
  const [estimates,  setEstimates]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected,   setSelected]   = useState(null);

  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter,   setDateFilter]   = useState('all');
  const [search,       setSearch]       = useState('');
  const [sortCol,      setSortCol]      = useState('created_at');
  const [sortDir,      setSortDir]      = useState('desc');
  const [statusOpen,   setStatusOpen]   = useState(false);
  const [dateOpen,     setDateOpen]     = useState(false);
  const [moreOpen,     setMoreOpen]     = useState(null);

  const statusRef = useRef(null);
  const dateRef   = useRef(null);

  useEffect(() => {
    api.get('/estimates').then(r => setEstimates(r.data)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handle(e) {
      if (statusRef.current && !statusRef.current.contains(e.target)) setStatusOpen(false);
      if (dateRef.current   && !dateRef.current.contains(e.target))   setDateOpen(false);
      setMoreOpen(null);
    }
    document.addEventListener('click', handle);
    return () => document.removeEventListener('click', handle);
  }, []);

  function handleCreated(est) { setEstimates(prev => [est, ...prev]); }
  function handleUpdate(updated) {
    setEstimates(prev => prev.map(e => e.id === updated.id ? updated : e));
    if (selected?.id === updated.id) setSelected(updated);
  }

  function handleSort(col) {
    setSortDir(sortCol === col ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc');
    setSortCol(col);
  }

  async function doSend(est) {
    try {
      const r = await api.post(`/estimates/${est.id}/send`);
      handleUpdate({ ...est, status: 'sent', sent_at: new Date().toISOString(), sign_url: r.data.sign_url });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to send.');
    }
  }

  async function doExpire(est) {
    if (!confirm('Expire this estimate?')) return;
    try {
      await api.post(`/estimates/${est.id}/void`);
      handleUpdate({ ...est, status: 'expired' });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to expire estimate.');
    }
  }

  // Client-side filtering
  const now        = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart  = new Date(todayStart);
  weekStart.setDate(todayStart.getDate() - todayStart.getDay());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const q = search.trim().toLowerCase();

  const filtered = estimates.filter(est => {
    if (statusFilter !== 'all') {
      const group = STATUS_GROUPS[statusFilter];
      if (!group || !group.includes(est.status)) return false;
    }
    if (dateFilter !== 'all') {
      const d = new Date(est.created_at);
      if (dateFilter === 'today' && d < todayStart) return false;
      if (dateFilter === 'week'  && d < weekStart)  return false;
      if (dateFilter === 'month' && d < monthStart) return false;
    }
    if (q) {
      if (!(est.client_name || '').toLowerCase().includes(q) &&
          !(est.title || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let av = a[sortCol], bv = b[sortCol];
    if (sortCol === 'amount') {
      av = parseFloat(av || 0); bv = parseFloat(bv || 0);
    } else if (sortCol === 'created_at' || sortCol === 'valid_until') {
      av = av ? new Date(av).getTime() : 0;
      bv = bv ? new Date(bv).getTime() : 0;
    } else {
      av = (av || '').toString().toLowerCase();
      bv = (bv || '').toString().toLowerCase();
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });

  const countAccepted = estimates.filter(e => ['accepted','approved','signed'].includes(e.status)).length;
  const countPending  = estimates.filter(e => ['draft','sent'].includes(e.status)).length;
  const countExpired  = estimates.filter(e => ['expired','declined','cancelled','canceled'].includes(e.status)).length;

  const statusCounts = {
    all:      estimates.length,
    draft:    estimates.filter(e => e.status === 'draft').length,
    sent:     estimates.filter(e => e.status === 'sent').length,
    accepted: estimates.filter(e => ['signed','accepted','approved'].includes(e.status)).length,
    expired:  estimates.filter(e => ['expired','declined','cancelled','canceled'].includes(e.status)).length,
  };

  if (loading) return (
    <div style={{ padding: 40, color: 'var(--steel)', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>Loading…</div>
  );

  const hasEstimates = estimates.length > 0;

  return (
    <div>
      <h1 className="sr-only">Estimates</h1>
      <div className="page-header">
        <div style={{ fontSize: 13, color: 'var(--slate)' }}>Send estimates with e-signature to clients</div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>+ New Estimate</button>
      </div>

      {hasEstimates && (
        <div className="dash-stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="dash-sc">
            <div className="dash-sc-header"><div className="dash-sc-l">Total</div></div>
            <div className="dash-sc-v">{estimates.length}</div>
            <div className="dash-sc-s">All time</div>
          </div>
          <div className="dash-sc">
            <div className="dash-sc-header"><div className="dash-sc-l">Accepted</div></div>
            <div className="dash-sc-v" style={{ color: countAccepted > 0 ? 'var(--green)' : undefined }}>{countAccepted}</div>
            <div className="dash-sc-s">Signed or approved</div>
          </div>
          <div className="dash-sc">
            <div className="dash-sc-header"><div className="dash-sc-l">Pending</div></div>
            <div className="dash-sc-v">{countPending}</div>
            <div className="dash-sc-s">Draft or awaiting reply</div>
          </div>
          <div className="dash-sc">
            <div className="dash-sc-header"><div className="dash-sc-l">Expired</div></div>
            <div className="dash-sc-v" style={{ color: countExpired > 0 ? 'var(--red)' : undefined }}>{countExpired}</div>
            <div className="dash-sc-s">Declined or expired</div>
          </div>
        </div>
      )}

      {hasEstimates && (
        <>
          <div className="inv-workspace-header">
            <span className="inv-workspace-title">All Estimates</span>
            <span className="inv-workspace-count">
              {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
            </span>
          </div>

          <div className="inv-toolbar">
            <div className="inv-toolbar-filters">

              {/* Status dropdown */}
              <div className="inv-filter-group" ref={statusRef}>
                <button
                  className={`inv-filter-trigger${statusFilter !== 'all' ? ' inv-filter-trigger--active' : ''}`}
                  onClick={e => { e.stopPropagation(); setStatusOpen(o => !o); setDateOpen(false); }}
                >
                  <span className="inv-filter-trigger-key">Status</span>
                  <span className="inv-filter-trigger-sep">|</span>
                  <span>{STATUS_OPTS.find(o => o.value === statusFilter)?.label}</span>
                  <ChevronDown size={12} />
                </button>
                {statusOpen && (
                  <div className="inv-filter-dropdown">
                    {STATUS_OPTS.map(opt => (
                      <button
                        key={opt.value}
                        className={`inv-dropdown-item${statusFilter === opt.value ? ' active' : ''}`}
                        onClick={e => { e.stopPropagation(); setStatusFilter(opt.value); setStatusOpen(false); }}
                      >
                        <span className="inv-filter-check">
                          {statusFilter === opt.value ? <Check size={12} /> : null}
                        </span>
                        <span>{opt.label}</span>
                        <span className="inv-dropdown-count">{statusCounts[opt.value]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Date dropdown */}
              <div className="inv-filter-group" ref={dateRef}>
                <button
                  className={`inv-filter-trigger${dateFilter !== 'all' ? ' inv-filter-trigger--active' : ''}`}
                  onClick={e => { e.stopPropagation(); setDateOpen(o => !o); setStatusOpen(false); }}
                >
                  <span className="inv-filter-trigger-key">Created</span>
                  <span className="inv-filter-trigger-sep">|</span>
                  <span>{DATE_OPTS.find(o => o.value === dateFilter)?.label}</span>
                  <ChevronDown size={12} />
                </button>
                {dateOpen && (
                  <div className="inv-filter-dropdown">
                    {DATE_OPTS.map(opt => (
                      <button
                        key={opt.value}
                        className={`inv-dropdown-item${dateFilter === opt.value ? ' active' : ''}`}
                        onClick={e => { e.stopPropagation(); setDateFilter(opt.value); setDateOpen(false); }}
                      >
                        <span className="inv-filter-check">
                          {dateFilter === opt.value ? <Check size={12} /> : null}
                        </span>
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Search */}
            <div className="inv-search-wrap">
              <Search size={14} className="inv-search-icon" />
              <input
                className="inv-search"
                placeholder="Search client or subject…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </>
      )}

      <div className="dash-card">
        {!hasEstimates ? (
          <div className="inv-empty" style={{ textAlign: 'center' }}>
            <div className="inv-empty-primary">No estimates yet</div>
            <div className="inv-empty-secondary">Create your first estimate and send it for digital signature.</div>
            <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => setShowCreate(true)}>+ New Estimate</button>
          </div>
        ) : sorted.length === 0 ? (
          <div className="inv-empty" style={{ textAlign: 'center' }}>
            <div className="inv-empty-primary">No estimates match these filters</div>
            <div className="inv-empty-secondary">Try clearing the status or date filter, or adjust your search.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ border: 'none', borderRadius: 0 }}>
              <thead>
                <tr>
                  <SortTh col="client_name" label="Client"   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <th>Est #</th>
                  <SortTh col="title"       label="Subject"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="created_at"  label="Created"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="valid_until" label="Expires"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <th>Status</th>
                  <SortTh col="amount"      label="Total"    sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="inv-th-r" />
                  <th className="inv-th-actions" />
                </tr>
              </thead>
              <tbody>
                {sorted.map(est => (
                  <tr
                    key={est.id}
                    className="clickable-row"
                    onClick={() => setSelected(est)}
                    tabIndex={0}
                    onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setSelected(est)}
                  >
                    <td>
                      <span className="inv-client-name">{est.client_name}</span>
                      {est.client_email && <span className="inv-client-sub">{est.client_email}</span>}
                    </td>
                    <td>
                      <span className="inv-num">#{est.id.slice(-6).toUpperCase()}</span>
                    </td>
                    <td>{est.title}</td>
                    <td>{fmtDt(est.created_at)}</td>
                    <td>{est.valid_until ? fmtDt(est.valid_until) : <span style={{ color: 'var(--steel)' }}>—</span>}</td>
                    <td><StatusBadge status={est.status} /></td>
                    <td className="inv-td-r">
                      <span className="inv-num">{fmt$(est.amount)}</span>
                    </td>
                    <td className="inv-td-actions" onClick={e => e.stopPropagation()}>
                      <div className={`inv-row-actions${moreOpen === est.id ? ' inv-row-actions--open' : ''}`}>
                        {['draft','sent'].includes(est.status) && est.client_email && (
                          <div className="inv-action-tooltip-wrap">
                            <button
                              className="inv-action-btn"
                              aria-label={est.status === 'sent' ? 'Resend estimate' : 'Send estimate'}
                              onClick={e => { e.stopPropagation(); doSend(est); }}
                            >
                              <Send size={14} />
                            </button>
                            <span className="inv-action-tooltip">{est.status === 'sent' ? 'Resend' : 'Send'}</span>
                          </div>
                        )}
                        <div className="inv-action-menu-wrap">
                          <button
                            className="inv-action-btn"
                            aria-label="More actions"
                            onClick={e => { e.stopPropagation(); setMoreOpen(o => o === est.id ? null : est.id); }}
                          >
                            <MoreHorizontal size={14} />
                          </button>
                          {moreOpen === est.id && (
                            <div className="inv-action-drop" onClick={e => e.stopPropagation()}>
                              <button
                                className="inv-action-drop-item"
                                onClick={() => { setSelected(est); setMoreOpen(null); }}
                              >
                                Open
                              </button>
                              {['draft','sent'].includes(est.status) && (
                                <>
                                  <div className="inv-action-drop-sep" />
                                  <button
                                    className="inv-action-drop-item inv-action-drop-item--danger"
                                    onClick={() => { setMoreOpen(null); doExpire(est); }}
                                  >
                                    Expire
                                  </button>
                                </>
                              )}
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
        )}
      </div>

      {showCreate && <EstimateComposer onCreated={handleCreated} onClose={() => setShowCreate(false)} />}
      {selected && <EstimateDetail estimate={selected} onUpdate={handleUpdate} onClose={() => setSelected(null)} />}
    </div>
  );
}
