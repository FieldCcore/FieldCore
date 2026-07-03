import React, { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import api from '../api';
import StatusBadge from '../components/StatusBadge';

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

// ─── Estimate Detail Modal ──────────────────────────────────────────────────
function EstimateDetail({ estimate: init, onUpdate, onClose }) {
  const [estimate,     setEstimate]     = useState(init);
  const [sending,      setSending]      = useState(false);
  const [copied,       setCopied]       = useState(false);
  const [converting,   setConverting]   = useState(false);
  const [convertedJobId, setConvertedJobId] = useState(init.converted_job_id || null);
  const [convertError, setConvertError] = useState('');

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
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to send.');
    } finally { setSending(false); }
  }

  async function voidEst() {
    if (!confirm('Expire this estimate?')) return;
    const r = await api.post(`/estimates/${estimate.id}/void`);
    const updated = { ...estimate, status: 'expired' };
    setEstimate(updated); onUpdate(updated);
  }

  function copyLink() {
    const url = estimate.sign_url || `${window.location.origin}/sign/${estimate.signing_token}`;
    navigator.clipboard.writeText(url);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  const tax = parseFloat(estimate.tax_amount || 0);
  const total = parseFloat(estimate.amount || 0);
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
        </div>

        <div className="invoice-amount-block">
          {lineItems.map((item, i) => (
            <div key={i} style={{ display:'flex',justifyContent:'space-between',fontSize:13,color:'#1C2333',marginBottom:6 }}>
              <span>{item.description}</span>
              <span style={{ fontVariantNumeric:'tabular-nums' }}>{fmt$(item.amount)}</span>
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
          {estimate.status === 'signed' && !convertedJobId && (
            <button className="btn-primary" onClick={convertToJob} disabled={converting}>
              {converting ? 'Converting…' : 'Convert to Job'}
            </button>
          )}
          {convertedJobId && (
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:13, color:'var(--green)', fontWeight:700 }}>✓ Converted to Job</span>
              <a href={`/jobs`} style={{ fontSize:12, color:'var(--navy)', textDecoration:'underline' }}>View Jobs →</a>
            </div>
          )}
          {convertError && (
            <p style={{ fontSize:12, color:'var(--red)', margin:0 }}>{convertError}</p>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Estimates Page ────────────────────────────────────────────────────
export default function EstimatesPage() {
  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected]   = useState(null);

  useEffect(() => {
    api.get('/estimates').then(r => setEstimates(r.data)).finally(() => setLoading(false));
  }, []);

  function handleCreated(est) { setEstimates(prev => [est, ...prev]); }
  function handleUpdate(updated) {
    setEstimates(prev => prev.map(e => e.id === updated.id ? updated : e));
    if (selected?.id === updated.id) setSelected(updated);
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--steel)', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>Loading…</div>;

  const countAccepted = estimates.filter(e => ['accepted','approved','signed'].includes(e.status)).length;
  const countPending  = estimates.filter(e => ['draft','sent','pending'].includes(e.status)).length;
  const countExpired  = estimates.filter(e => ['expired','declined','cancelled','canceled'].includes(e.status)).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--steel)', marginBottom: 3 }}>Estimates</div>
          <div style={{ fontSize: 13, color: 'var(--slate)' }}>Send estimates with e-signature to clients</div>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>+ New Estimate</button>
      </div>

      {estimates.length > 0 && (
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

      <div className="dash-card">
        <div className="dash-ch">
          <span className="dash-cht">All Estimates</span>
          {estimates.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--steel)' }}>{estimates.length} total</span>
          )}
        </div>

        {estimates.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>No estimates yet</div>
            <div style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 20 }}>Create your first estimate and send it for digital signature.</div>
            <button className="btn-primary" onClick={() => setShowCreate(true)}>+ New Estimate</button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ border: 'none', borderRadius: 0 }}>
              <thead>
                <tr>
                  {['Client', 'Title', 'Amount', 'Status', 'Created', 'Valid Until', ''].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {estimates.map(est => (
                  <tr key={est.id} className="clickable-row" onClick={() => setSelected(est)}>
                    <td><strong>{est.client_name}</strong></td>
                    <td>{est.title}</td>
                    <td style={{ fontFamily: 'DM Mono, monospace', fontVariantNumeric: 'tabular-nums' }}>{fmt$(est.amount)}</td>
                    <td><StatusBadge status={est.status} /></td>
                    <td>{fmtDt(est.created_at)}</td>
                    <td>{est.valid_until ? fmtDt(est.valid_until) : '—'}</td>
                    <td>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: 11, padding: '4px 10px' }}
                        onClick={e => { e.stopPropagation(); setSelected(est); }}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && <CreateEstimateModal onCreated={handleCreated} onClose={() => setShowCreate(false)} />}
      {selected && <EstimateDetail estimate={selected} onUpdate={handleUpdate} onClose={() => setSelected(null)} />}
    </div>
  );
}
