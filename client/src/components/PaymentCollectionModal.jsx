import React, { useState } from 'react';
import { CreditCard, Landmark, Banknote, FileText, X } from 'lucide-react';
import api from '../api';

const TODAY = new Date().toISOString().slice(0, 10);

function fmtAmt(n) {
  return '$' + parseFloat(n || 0).toFixed(2);
}

export default function PaymentCollectionModal({
  invoice,
  client,
  acceptCard = true,
  acceptAch = false,
  acceptCash = true,
  acceptCheck = true,
  onCollected,
  onSkip,
}) {
  const [step,      setStep]      = useState('choose');
  const [method,    setMethod]    = useState(null);
  const [amount,    setAmount]    = useState(
    String(parseFloat(invoice.balance || invoice.amount || 0).toFixed(2))
  );
  const [date,      setDate]      = useState(TODAY);
  const [reference, setReference] = useState('');
  const [note,      setNote]      = useState('');
  const [loading,   setLoading]   = useState(false);
  const [chargeLoading, setChargeLoading] = useState(false);
  const [error,     setError]     = useState('');

  const hasCard = client?.card_on_file && client?.stripe_payment_method_id && acceptCard;
  const cardBrand = client?.payment_method_brand || 'Card';
  const cardLast4 = client?.payment_method_last4;
  const hasManual = acceptCash || acceptCheck;

  function openManual(m) {
    setMethod(m);
    setStep('manual');
    setError('');
  }

  async function handleChargeCard() {
    setChargeLoading(true);
    setError('');
    try {
      await api.post('/payments/charge', {
        invoice_id:        invoice.id,
        payment_method_id: client.stripe_payment_method_id,
      });
      onCollected({ ...invoice, status: 'paid' });
    } catch (err) {
      setError(err.response?.data?.error || 'Card charge failed. Try a different method.');
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

  const methodLabel = method === 'cash' ? 'Cash' : 'Check';

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 1100 }}
      onClick={e => { if (e.target === e.currentTarget) onSkip(); }}
    >
      <div
        className="modal modal-md"
        style={{ padding: 0, overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div>
            <h2>Collect Payment</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--slate)', margin: 0 }}>
              Invoice #{invoice.invoice_number} · {fmtAmt(invoice.amount)}
            </p>
          </div>
          <button className="btn-close" onClick={onSkip} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: '20px 24px 24px' }}>
          {error && (
            <p className="form-error" style={{ marginBottom: 14 }}>{error}</p>
          )}

          {step === 'choose' && (
            <div>
              {/* ── Charge Now ── */}
              {hasCard && (
                <>
                  <p className="cpm-section-head">Charge Now</p>
                  <button
                    className="cpm-method-btn"
                    onClick={handleChargeCard}
                    disabled={chargeLoading}
                  >
                    <CreditCard size={16} className="cpm-method-icon" />
                    <span className="cpm-method-label">
                      {chargeLoading
                        ? 'Charging…'
                        : `${cardBrand}${cardLast4 ? ` •••• ${cardLast4}` : ''}`}
                    </span>
                    <span className="cpm-method-sub">Charge saved card</span>
                  </button>
                  {hasManual && <div className="cpm-divider">or record manually</div>}
                </>
              )}

              {/* ── Record Manual Payment ── */}
              {hasManual && (
                <>
                  {!hasCard && (
                    <p className="cpm-section-head">Record Manual Payment</p>
                  )}
                  <div className="cpm-manual-grid">
                    {acceptCash && (
                      <button
                        className="cpm-method-btn"
                        onClick={() => openManual('cash')}
                      >
                        <Banknote size={16} className="cpm-method-icon" />
                        <span className="cpm-method-label">Cash</span>
                        <span className="cpm-method-sub">Record cash received</span>
                      </button>
                    )}
                    {acceptCheck && (
                      <button
                        className="cpm-method-btn"
                        onClick={() => openManual('check')}
                      >
                        <FileText size={16} className="cpm-method-icon" />
                        <span className="cpm-method-label">Check</span>
                        <span className="cpm-method-sub">Record check received</span>
                      </button>
                    )}
                  </div>
                </>
              )}

              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={onSkip}>
                  Collect Later
                </button>
              </div>
            </div>
          )}

          {step === 'manual' && (
            <div>
              {/* Method selector tabs */}
              {acceptCash && acceptCheck && (
                <div className="cpm-tabs">
                  <button
                    className={`cpm-tab${method === 'cash' ? ' cpm-tab--active' : ''}`}
                    onClick={() => setMethod('cash')}
                  >
                    Cash
                  </button>
                  <button
                    className={`cpm-tab${method === 'check' ? ' cpm-tab--active' : ''}`}
                    onClick={() => setMethod('check')}
                  >
                    Check
                  </button>
                </div>
              )}

              <div className="ib-field" style={{ marginBottom: 12 }}>
                <label className="ib-label">Amount</label>
                <div className="ib-price-wrap">
                  <span className="ib-price-sym">$</span>
                  <input
                    className="ib-input ib-input--price"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                  />
                </div>
              </div>

              <div className="ib-field" style={{ marginBottom: 12 }}>
                <label className="ib-label">Payment Date</label>
                <input
                  className="ib-input"
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </div>

              {method === 'check' && (
                <div className="ib-field" style={{ marginBottom: 12 }}>
                  <label className="ib-label">
                    Check Number <span style={{ fontWeight: 400, color: 'var(--steel)' }}>(optional)</span>
                  </label>
                  <input
                    className="ib-input"
                    type="text"
                    placeholder="e.g. 1042"
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                  />
                </div>
              )}

              <div className="ib-field" style={{ marginBottom: 18 }}>
                <label className="ib-label">
                  Note <span style={{ fontWeight: 400, color: 'var(--steel)' }}>(optional)</span>
                </label>
                <textarea
                  className="ib-textarea"
                  rows={2}
                  placeholder="Internal note…"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => { setStep('choose'); setError(''); }}
                  disabled={loading}
                >
                  Back
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleRecordManual}
                  disabled={loading}
                >
                  {loading ? 'Recording…' : `Record ${methodLabel} Payment`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
