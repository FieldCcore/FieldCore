import React, { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import api from '../api';

const STATUS_COLORS = {
  draft:    { bg:'#f1f5f9', color:'#475569' },
  sent:     { bg:'#fff7ed', color:'#c2410c' },
  signed:   { bg:'#f0fdf4', color:'#15803d' },
  declined: { bg:'#fef2f2', color:'#b91c1c' },
  expired:  { bg:'#f8f7f5', color:'#8a90a2' },
};

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
        <form onSubmit={submit} style={{ padding: '4px 0' }}>
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
                  type="number" step="0.01" min="0"
                  value={item.amount} onChange={e => setLI(i,'amount',e.target.value)}
                  placeholder="0.00" style={{ width:90 }}
                />
                {lineItems.length > 1 && (
                  <button type="button" onClick={() => removeLI(i)} style={{ background:'none',border:'none',color:'#e53e3e',cursor:'pointer',fontSize:18,lineHeight:1 }}>×</button>
                )}
              </div>
            ))}
            <button type="button" className="btn-secondary" onClick={addLI} style={{ fontSize:12,padding:'5px 12px',marginTop:4 }}>+ Add Item</button>
            <div style={{ textAlign:'right',fontSize:13,fontWeight:700,color:'var(--navy)',marginTop:8 }}>
              Subtotal: {fmt$(subtotal)}
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
  );
}

// ─── Estimate Detail Modal ──────────────────────────────────────────────────
function EstimateDetail({ estimate: init, onUpdate, onClose }) {
  const [estimate, setEstimate] = useState(init);
  const [sending, setSending] = useState(false);
  const [copied, setCopied]   = useState(false);
  const sc = STATUS_COLORS[estimate.status] || STATUS_COLORS.draft;

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
            <span style={{ fontSize:11,fontWeight:700,padding:'2px 9px',borderRadius:99,background:sc.bg,color:sc.color,marginTop:4,display:'inline-block' }}>
              {estimate.status.toUpperCase()}
            </span>
          </div>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

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

  function handleCreated(est) {
    setEstimates(prev => [est, ...prev]);
  }
  function handleUpdate(updated) {
    setEstimates(prev => prev.map(e => e.id === updated.id ? updated : e));
    if (selected?.id === updated.id) setSelected(updated);
  }

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Estimates</h1>
          <p style={{ margin:'4px 0 0',color:'var(--steel)',fontSize:14 }}>Send estimates with e-signature to clients</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>+ New Estimate</button>
      </div>

      {estimates.length === 0 ? (
        <div style={{ textAlign:'center',padding:'60px 24px',color:'var(--steel)' }}>
          <div style={{ fontSize:16,fontWeight:600,marginBottom:8 }}>No estimates yet</div>
          <div style={{ fontSize:14,marginBottom:20 }}>Create an estimate and send it to a client for digital signature.</div>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>+ New Estimate</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:'1.5px solid var(--lightgray)' }}>
                {['Client','Title','Amount','Status','Created','Valid Until',''].map(h => (
                  <th key={h} style={{ textAlign:'left',padding:'8px 12px',fontSize:11,fontWeight:700,color:'var(--steel)',textTransform:'uppercase',letterSpacing:'.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {estimates.map(est => {
                const sc = STATUS_COLORS[est.status] || STATUS_COLORS.draft;
                return (
                  <tr key={est.id} style={{ borderBottom:'1px solid var(--lightgray)',cursor:'pointer' }} onClick={() => setSelected(est)}>
                    <td style={{ padding:'10px 12px',fontWeight:600 }}>{est.client_name}</td>
                    <td style={{ padding:'10px 12px',color:'var(--steel)' }}>{est.title}</td>
                    <td style={{ padding:'10px 12px',fontFamily:'DM Mono, monospace' }}>{fmt$(est.amount)}</td>
                    <td style={{ padding:'10px 12px' }}>
                      <span style={{ fontSize:11,fontWeight:700,padding:'2px 9px',borderRadius:99,background:sc.bg,color:sc.color }}>{est.status}</span>
                    </td>
                    <td style={{ padding:'10px 12px',color:'var(--steel)' }}>{fmtDt(est.created_at)}</td>
                    <td style={{ padding:'10px 12px',color:'var(--steel)' }}>{est.valid_until ? fmtDt(est.valid_until) : '—'}</td>
                    <td style={{ padding:'10px 12px' }}>
                      <button className="btn-secondary" style={{ fontSize:11,padding:'4px 12px' }} onClick={e => { e.stopPropagation(); setSelected(est); }}>Open</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateEstimateModal onCreated={handleCreated} onClose={() => setShowCreate(false)} />
      )}
      {selected && (
        <EstimateDetail estimate={selected} onUpdate={handleUpdate} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
