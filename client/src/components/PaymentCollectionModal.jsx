import React, { useState } from 'react';
import { X, CreditCard, Banknote, FileText, MoreHorizontal } from 'lucide-react';
import api from '../api';

const TODAY = new Date().toISOString().slice(0, 10);

const MANUAL_METHODS = [
  { value: 'cash',  label: 'Cash',  Icon: Banknote },
  { value: 'check', label: 'Check', Icon: FileText },
  { value: 'other', label: 'Other', Icon: MoreHorizontal },
];

function fmtAmt(n) {
  return '$' + parseFloat(n || 0).toFixed(2);
}

export default function PaymentCollectionModal({ invoice, client, onCollected, onSkip }) {
  const [step,      setStep]      = useState('choose');   // 'choose' | 'charge' | 'manual'
  const [method,    setMethod]    = useState('cash');
  const [amount,    setAmount]    = useState(String(parseFloat(invoice.amount || 0).toFixed(2)));
  const [date,      setDate]      = useState(TODAY);
  const [reference, setReference] = useState('');
  const [note,      setNote]      = useState('');
  const [loading,   setLoading]   = useState(false);
  const [chargeLoading, setChargeLoading] = useState(false);
  const [error,     setError]     = useState('');

  const hasCard = client?.card_on_file && client?.stripe_payment_method_id;
  const cardBrand = client?.payment_method_brand || 'Card';
  const cardLast4 = client?.payment_method_last4;

  async function handleChargeCard() {
    setChargeLoading(true);
    setError('');
    try {
      await api.post('/payments/charge', {
        invoice_id:        invoice.id,
        payment_method_id: client.stripe_payment_method_id,
      });
      const updated = { ...invoice, status: 'paid' };
      onCollected(updated);
    } catch (err) {
      setError(err.response?.data?.error || 'Card charge failed. Try again or record payment manually.');
      setChargeLoading(false);
    }
  }

  async function handleRecordManual() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await api.post(`/invoices/${invoice.id}/payments`, {
        amount:    amt,
        date,
        method,
        reference: reference.trim() || undefined,
        note:      note.trim() || undefined,
      });
      onCollected(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not record payment. Try again.');
      setLoading(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 1100 }}
      onClick={e => { if (e.target === e.currentTarget) onSkip(); }}
    >
      <div
        className="modal"
        style={{ maxWidth: 480, padding: 0, overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Collect Payment</h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--slate)', margin: 0 }}>
              Invoice #{invoice.invoice_number} · {fmtAmt(invoice.amount)}
            </p>
          </div>
          <button className="btn-close" onClick={onSkip} aria-label="Skip">×</button>
        </div>

        <div className="modal-body" style={{ padding: '16px 20px' }}>
          {error && <p className="form-error" style={{ marginBottom: 12 }}>{error}</p>}

          {step === 'choose' && (
            <div>
              {/* Charge Card on File */}
              {hasCard && (
                <button
                  className="ib-collect-option"
                  onClick={handleChargeCard}
                  disabled={chargeLoading}
                  style={{ marginBottom: 8 }}
                >
                  <CreditCard size={16} />
                  <div className="ib-collect-option-text">
                    <span className="ib-collect-option-label">
                      {chargeLoading ? 'Charging…' : `Charge ${cardBrand}${cardLast4 ? ` •••• ${cardLast4}` : ''}`}
                    </span>
                    <span className="ib-collect-option-sub">Charge saved card immediately</span>
                  </div>
                </button>
              )}

              <p className="ib-collect-divider">Record manual payment</p>

              {/* Manual payment method picker */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {MANUAL_METHODS.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    className={`ib-collect-method-btn${method === value ? ' ib-collect-method-btn--active' : ''}`}
                    onClick={() => { setMethod(value); setStep('manual'); }}
                  >
                    <Icon size={14} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="btn btn-secondary" onClick={onSkip} style={{ fontSize: '0.8rem' }}>
                  Skip — I'll collect later
                </button>
              </div>
            </div>
          )}

          {step === 'manual' && (
            <div>
              {/* Method tabs */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                {MANUAL_METHODS.map(({ value, label }) => (
                  <button
                    key={value}
                    className={`ib-collect-method-btn${method === value ? ' ib-collect-method-btn--active' : ''}`}
                    onClick={() => setMethod(value)}
                    style={{ flex: 1 }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="ib-field" style={{ marginBottom: 10 }}>
                <label className="ib-label">Amount</label>
                <div className="ib-price-wrap">
                  <span className="ib-price-sym">$</span>
                  <input
                    className="ib-input ib-input--price"
                    type="number" min="0.01" step="0.01"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                  />
                </div>
              </div>

              <div className="ib-field" style={{ marginBottom: 10 }}>
                <label className="ib-label">Payment Date</label>
                <input
                  className="ib-input"
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </div>

              {method === 'check' && (
                <div className="ib-field" style={{ marginBottom: 10 }}>
                  <label className="ib-label">Check Number <span className="ib-optional">(optional)</span></label>
                  <input
                    className="ib-input"
                    type="text"
                    placeholder="e.g. 1042"
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                  />
                </div>
              )}

              {method === 'other' && (
                <div className="ib-field" style={{ marginBottom: 10 }}>
                  <label className="ib-label">Reference <span className="ib-optional">(optional)</span></label>
                  <input
                    className="ib-input"
                    type="text"
                    placeholder="Reference or ID"
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                  />
                </div>
              )}

              <div className="ib-field" style={{ marginBottom: 14 }}>
                <label className="ib-label">Note <span className="ib-optional">(optional)</span></label>
                <textarea
                  className="ib-textarea"
                  rows={2}
                  placeholder="Internal note about this payment…"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => { setStep('choose'); setError(''); }} disabled={loading}>
                  Back
                </button>
                <button className="btn btn-primary" onClick={handleRecordManual} disabled={loading}>
                  {loading ? 'Recording…' : `Record ${MANUAL_METHODS.find(m => m.value === method)?.label} Payment`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
