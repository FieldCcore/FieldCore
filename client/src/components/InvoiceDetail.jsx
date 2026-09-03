import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import api from '../api';
import CardSetupForm from './CardSetupForm';
import StatusBadge from './StatusBadge';
import CollectPaymentWorkspace from './CollectPaymentWorkspace';

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = STRIPE_KEY ? loadStripe(STRIPE_KEY) : null;

const PAYMENT_TERMS_LABELS = {
  due_on_receipt: 'Due on Receipt',
  net_7:  'Net 7',
  net_15: 'Net 15',
  net_30: 'Net 30',
  net_45: 'Net 45',
  net_60: 'Net 60',
  net_90: 'Net 90',
  custom: 'Custom',
};

export default function InvoiceDetail({ invoice: initialInvoice, onClose, onUpdate }) {
  const navigate = useNavigate();
  const [invoice, setInvoice]             = useState(initialInvoice);
  const [loading, setLoading]             = useState(false);
  const [sending, setSending]             = useState(false);
  const [copied,  setCopied]              = useState(false);
  const [showCardSetup,  setShowCardSetup]  = useState(false);
  const [showCollectWs,  setShowCollectWs]  = useState(false);
  const [error,   setError]               = useState('');
  const [lineItems, setLineItems]         = useState(null);
  const [newName,  setNewName]            = useState('');
  const [newAmt,   setNewAmt]             = useState('');
  const [savingLines, setSavingLines]     = useState(false);

  useEffect(() => {
    api.get(`/invoices/${initialInvoice.id}`).then(r => {
      setInvoice(r.data);
      const items = Array.isArray(r.data.line_items) && r.data.line_items.length > 0
        ? r.data.line_items
        : [{ name: r.data.service_type || 'Service', amount: parseFloat(r.data.subtotal ?? r.data.amount) }];
      setLineItems(items);
    }).catch(() => {});
  }, [initialInvoice.id]);

  async function saveLineItems(items) {
    setSavingLines(true);
    try {
      const res = await api.patch(`/invoices/${invoice.id}/line-items`, { line_items: items });
      setInvoice(res.data);
      onUpdate(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save line items.');
    } finally {
      setSavingLines(false);
    }
  }

  function addLineItem() {
    if (!newName.trim() || !newAmt) return;
    const updated = [...(lineItems || []), { name: newName.trim(), amount: parseFloat(newAmt) }];
    setLineItems(updated);
    setNewName('');
    setNewAmt('');
    saveLineItems(updated);
  }

  function removeLineItem(idx) {
    if ((lineItems || []).length <= 1) return;
    const updated = lineItems.filter((_, i) => i !== idx);
    setLineItems(updated);
    saveLineItems(updated);
  }

  async function handleCharge() {
    if (!invoice.stripe_payment_method_id) return;
    setLoading(true);
    setError('');
    try {
      await api.post('/payments/charge', {
        invoice_id: invoice.id,
        payment_method_id: invoice.stripe_payment_method_id,
      });
      const updated = { ...invoice, status: 'paid' };
      setInvoice(updated);
      onUpdate(updated);
    } catch (err) {
      setError(err.response?.data?.error || 'Charge failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    setSending(true);
    setError('');
    try {
      const res = await api.post(`/invoices/${invoice.id}/send`);
      const updated = { ...invoice, payment_link: res.data.payment_link, sent_at: new Date().toISOString() };
      setInvoice(updated);
      onUpdate(updated);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send invoice.');
    } finally {
      setSending(false);
    }
  }

  async function handleVoid() {
    if (!window.confirm('Void this invoice?')) return;
    setLoading(true);
    try {
      const res = await api.patch(`/invoices/${invoice.id}/void`);
      const updated = { ...invoice, status: 'void' };
      setInvoice(updated);
      onUpdate(updated);
    } finally {
      setLoading(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(invoice.payment_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCardSaved() {
    setShowCardSetup(false);
    api.get(`/invoices/${invoice.id}`).then(r => setInvoice(r.data));
  }

  const isPending = invoice.status === 'pending';

  // INV-006: Use canonical stored values — never derive subtotal backward from amount
  const subtotal      = parseFloat(invoice.subtotal ?? invoice.amount ?? 0);
  const discountAmt   = parseFloat(invoice.discount_amount || 0);
  const taxAmt        = parseFloat(invoice.tax_amount || 0);
  const showBreakdown = discountAmt > 0 || taxAmt > 0;

  const invoiceNum = invoice.invoice_number_display || invoice.invoice_number;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="modal-header">
        <div>
          {/* INV-007: Include invoice number to distinguish from page heading */}
          <h2>Invoice #{invoiceNum}</h2>
          <StatusBadge status={invoice.status} />
        </div>
        <button className="btn-close" onClick={onClose}>×</button>
      </div>

      <div className="modal-body">
      {error && <p className="form-error" style={{ marginBottom: 16 }}>{error}</p>}

      <div className="invoice-meta">
        <div className="detail-row"><label>Client</label><span>{invoice.client_name}</span></div>
        {invoice.client_email && <div className="detail-row"><label>Email</label><span>{invoice.client_email}</span></div>}

        {/* Canonical project relationship */}
        {invoice.project_name && (invoice.project_id || invoice.job_project_id) && (
          <div className="detail-row">
            <label>Project</label>
            <button
              type="button"
              className="inv-detail-link"
              onClick={() => { onClose(); navigate(`/projects/${invoice.project_id || invoice.job_project_id}`); }}
            >
              {invoice.project_number
                ? `PRJ-${String(invoice.project_number).padStart(4, '0')} · ${invoice.project_name}`
                : invoice.project_name}
            </button>
          </div>
        )}

        {/* Work order (job with project_id) */}
        {invoice.work_order_number && (
          <div className="detail-row">
            <label>Work Order</label>
            <span>
              WO-{String(invoice.work_order_number).padStart(3, '0')}
              {invoice.work_order_title ? ` · ${invoice.work_order_title}` : ''}
            </span>
          </div>
        )}

        {invoice.service_type && (
          <div className="detail-row">
            <label>{invoice.job_id ? 'Linked Job' : 'Service'}</label>
            <span>
              {invoice.service_type}
              {invoice.job_id && invoice.scheduled_at
                ? ` · ${format(new Date(invoice.scheduled_at), 'MMM d, yyyy')}`
                : ''}
            </span>
          </div>
        )}
        <div className="detail-row"><label>Created</label><span>{format(new Date(invoice.created_at), 'MMM d, yyyy')}</span></div>
        {invoice.sent_at && <div className="detail-row"><label>Sent</label><span>{format(new Date(invoice.sent_at), 'MMM d, yyyy h:mm a')}</span></div>}
        {invoice.payment_terms && (
          <div className="detail-row">
            <label>Terms</label>
            {/* INV-004: net_7 added to label map */}
            <span style={{ textTransform: 'none' }}>
              {PAYMENT_TERMS_LABELS[invoice.payment_terms] || invoice.payment_terms}
            </span>
          </div>
        )}
        {invoice.due_date && (
          <div className="detail-row">
            <label>Due Date</label>
            <span>{format(new Date(invoice.due_date), 'MMM d, yyyy')}</span>
          </div>
        )}
      </div>

      {/* Line items */}
      <div className="invoice-amount-block">
        {(lineItems || []).map((item, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: '#1C2333', marginBottom: 6 }}>
            <span style={{ flex: 1 }}>{item.name || item.description}</span>
            <span style={{ marginLeft: 16, fontVariantNumeric: 'tabular-nums' }}>${parseFloat(item.amount).toFixed(2)}</span>
            {isPending && (lineItems || []).length > 1 && (
              <button onClick={() => removeLineItem(i)} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
            )}
          </div>
        ))}

        {/* Add line item — only on pending invoices */}
        {isPending && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8, marginBottom: 10 }}>
            {/* INV-009: placeholder matches canonical field name */}
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Item name"
              style={{ flex: 1, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12 }}
              onKeyDown={e => e.key === 'Enter' && addLineItem()}
            />
            <input
              value={newAmt}
              onChange={e => setNewAmt(e.target.value)}
              placeholder="0.00"
              type="number"
              min="0"
              step="0.01"
              style={{ width: 80, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12 }}
              onKeyDown={e => e.key === 'Enter' && addLineItem()}
            />
            {/* INV-010: descriptive action label */}
            <button onClick={addLineItem} disabled={!newName.trim() || !newAmt || savingLines} className="btn-secondary" style={{ padding: '5px 10px', fontSize: 12 }}>
              {savingLines ? 'Adding…' : 'Add Line Item'}
            </button>
          </div>
        )}

        {/* INV-006: Canonical totals breakdown using stored subtotal/discount_amount/tax_amount */}
        {showBreakdown && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b', borderTop: '1px solid #e2e8f0', paddingTop: 8, marginBottom: 4 }}>
              <span>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            {discountAmt > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b', marginBottom: 4 }}>
                <span>{invoice.discount_name || 'Discount'}</span>
                <span>−${discountAmt.toFixed(2)}</span>
              </div>
            )}
            {taxAmt > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b', marginBottom: 8 }}>
                <span>Tax</span>
                <span>${taxAmt.toFixed(2)}</span>
              </div>
            )}
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
          <span className="invoice-amount-label">Total Due</span>
          <span className="invoice-amount">${parseFloat(invoice.amount).toFixed(2)}</span>
        </div>
      </div>

      {isPending && (
        <div className="invoice-action-bar">
          <button className="btn-primary" onClick={() => setShowCollectWs(true)}>
            Collect Payment
          </button>
          {invoice.card_on_file ? (
            <button className="btn-secondary" onClick={handleCharge} disabled={loading}>
              {loading ? 'Charging…' : 'Charge Card on File'}
            </button>
          ) : (
            <button className="btn-secondary" onClick={() => setShowCardSetup(s => !s)}>
              {showCardSetup ? 'Cancel Setup' : 'Add Card on File'}
            </button>
          )}
          {invoice.payment_link ? (
            <>
              <input readOnly value={invoice.payment_link} className="link-input" />
              <button className="btn-secondary" onClick={copyLink}>{copied ? 'Copied!' : 'Copy'}</button>
              <a href={invoice.payment_link} target="_blank" rel="noreferrer" className="btn-secondary">Open</a>
              <button className="btn-secondary" onClick={handleSend} disabled={sending}>
                {sending ? 'Resending…' : 'Resend'}
              </button>
            </>
          ) : (
            <button className="btn-secondary" onClick={handleSend} disabled={sending}>
              {sending ? 'Sending…' : invoice.client_email ? 'Send Invoice' : 'Generate Link'}
            </button>
          )}
          <button className="btn-void" onClick={handleVoid} disabled={loading}>Void</button>
        </div>
      )}

      {showCollectWs && (
        <CollectPaymentWorkspace
          invoice={invoice}
          client={null}
          onClose={() => setShowCollectWs(false)}
          onPaymentRecorded={updatedInvoices => {
            setShowCollectWs(false);
            const updated = updatedInvoices?.find(i => i.id === invoice.id);
            if (updated) { setInvoice(updated); onUpdate(updated); }
          }}
        />
      )}

      {showCardSetup && isPending && invoice.client_id && (
        <div className="card-setup-section">
          <h3>Save Card for {invoice.client_name}</h3>
          {stripePromise ? (
            <Elements stripe={stripePromise}>
              <CardSetupForm clientId={invoice.client_id} onSaved={handleCardSaved} />
            </Elements>
          ) : (
            <p className="form-error">
              Add your Stripe publishable key (VITE_STRIPE_PUBLISHABLE_KEY) to the .env file to enable card setup.
            </p>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
