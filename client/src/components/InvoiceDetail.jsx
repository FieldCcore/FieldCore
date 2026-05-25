import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import api from '../api';
import CardSetupForm from './CardSetupForm';

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = STRIPE_KEY ? loadStripe(STRIPE_KEY) : null;

const STATUS_COLORS = { pending: '#f59e0b', paid: '#10b981', void: '#6b7280' };

export default function InvoiceDetail({ invoice: initialInvoice, onClose, onUpdate }) {
  const [invoice, setInvoice]       = useState(initialInvoice);
  const [loading, setLoading]             = useState(false);
  const [sending, setSending]             = useState(false);
  const [copied,  setCopied]              = useState(false);
  const [showCardSetup, setShowCardSetup] = useState(false);
  const [error,   setError]               = useState('');

  // Load full invoice detail (includes card_on_file, payment_method_id)
  useEffect(() => {
    api.get(`/invoices/${initialInvoice.id}`).then(r => {
      setInvoice(r.data);
    }).catch(() => {});
  }, [initialInvoice.id]);

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
    // Reload invoice to pick up updated card_on_file
    api.get(`/invoices/${invoice.id}`).then(r => setInvoice(r.data));
  }

  const isPending = invoice.status === 'pending';

  return (
    <div>
      <div className="modal-header">
        <div>
          <h2>Invoice</h2>
          <span className="status-badge" style={{ background: STATUS_COLORS[invoice.status] }}>
            {invoice.status}
          </span>
        </div>
        <button className="btn-close" onClick={onClose}>×</button>
      </div>

      {error && <p className="form-error" style={{ marginBottom: 16 }}>{error}</p>}

      <div className="invoice-meta">
        <div className="detail-row"><label>Client</label><span>{invoice.client_name}</span></div>
        {invoice.client_email && <div className="detail-row"><label>Email</label><span>{invoice.client_email}</span></div>}
        {invoice.service_type && <div className="detail-row"><label>Service</label><span>{invoice.service_type}</span></div>}
        <div className="detail-row"><label>Created</label><span>{format(new Date(invoice.created_at), 'MMM d, yyyy')}</span></div>
        {invoice.sent_at && <div className="detail-row"><label>Sent</label><span>{format(new Date(invoice.sent_at), 'MMM d, yyyy h:mm a')}</span></div>}
      </div>

      {parseFloat(invoice.tax_amount) > 0 ? (
        <div className="invoice-amount-block">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b', marginBottom: 4 }}>
            <span>Subtotal</span>
            <span>${(parseFloat(invoice.amount) - parseFloat(invoice.tax_amount)).toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b', marginBottom: 8 }}>
            <span>Tax</span>
            <span>${parseFloat(invoice.tax_amount).toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
            <span className="invoice-amount-label">Total Due</span>
            <span className="invoice-amount">${parseFloat(invoice.amount).toFixed(2)}</span>
          </div>
        </div>
      ) : (
        <div className="invoice-amount-block">
          <span className="invoice-amount-label">Amount Due</span>
          <span className="invoice-amount">${parseFloat(invoice.amount).toFixed(2)}</span>
        </div>
      )}

      {isPending && (
        <div className="invoice-actions">
          {invoice.card_on_file ? (
            <button className="btn-primary" onClick={handleCharge} disabled={loading}>
              {loading ? 'Charging...' : 'Charge Card on File'}
            </button>
          ) : (
            <button className="btn-secondary" onClick={() => setShowCardSetup(s => !s)}>
              {showCardSetup ? 'Cancel Card Setup' : 'Add Card on File'}
            </button>
          )}

          {invoice.payment_link ? (
            <div className="payment-link-box">
              <input readOnly value={invoice.payment_link} className="link-input" />
              <button className="btn-primary" onClick={copyLink}>{copied ? 'Copied!' : 'Copy'}</button>
              <a href={invoice.payment_link} target="_blank" rel="noreferrer" className="btn-secondary">Open</a>
              <button className="btn-secondary" onClick={handleSend} disabled={sending} title="Resend email to client">
                {sending ? '…' : 'Resend'}
              </button>
            </div>
          ) : (
            <button className="btn-secondary" onClick={handleSend} disabled={sending}>
              {sending ? 'Sending…' : invoice.client_email ? 'Send Invoice' : 'Generate Payment Link'}
            </button>
          )}

          <button className="btn-void" onClick={handleVoid} disabled={loading}>Void</button>
        </div>
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
  );
}
