import React, { useState, useEffect, useCallback } from 'react';
import { X, CreditCard, Landmark, Banknote, FileText, Smartphone, Send, Circle } from 'lucide-react';
import api from '../api';

const TODAY = new Date().toISOString().slice(0, 10);

const METHODS = [
  // Processed online methods
  { key: 'CARD',         label: 'Credit / Debit Card',   Icon: CreditCard,  type: 'processed', refRequired: false, refLabel: '' },
  { key: 'ACH',          label: 'Bank Payment (ACH)',     Icon: Landmark,    type: 'processed', refRequired: false, refLabel: '' },
  // Manual methods
  { key: 'CASH',         label: 'Cash',                  Icon: Banknote,    type: 'manual',    refRequired: false, refLabel: '' },
  { key: 'CHECK',        label: 'Check',                 Icon: FileText,    type: 'manual',    refRequired: false, refLabel: 'Check Number (optional)' },
  // External transfer methods
  { key: 'CASHAPP',      label: 'Cash App',              Icon: Smartphone,  type: 'external',  refRequired: true,  refLabel: 'Cashtag / Confirmation #' },
  { key: 'PAYPAL',       label: 'PayPal',                Icon: Send,        type: 'external',  refRequired: true,  refLabel: 'Transaction ID' },
  { key: 'VENMO',        label: 'Venmo',                 Icon: Send,        type: 'external',  refRequired: true,  refLabel: 'Venmo ID / Confirmation #' },
  { key: 'ZELLE',        label: 'Zelle',                 Icon: Send,        type: 'external',  refRequired: true,  refLabel: 'Confirmation Number' },
  { key: 'OTHER',        label: 'Other',                 Icon: Circle,      type: 'external',  refRequired: false, refLabel: 'Reference (optional)' },
];

function fmt(n) {
  const v = parseFloat(n) || 0;
  return '$' + v.toFixed(2);
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CollectPaymentWorkspace({ invoice, client, onClose, onPaymentRecorded }) {
  // Outstanding invoices for client
  const [invoices,    setInvoices]    = useState([]);
  const [loadingInv,  setLoadingInv]  = useState(true);
  const [invError,    setInvError]    = useState('');

  // Selections: Map<invoiceId, amountString>
  const [selected, setSelected] = useState({});

  // Payment method
  const [method,    setMethod]    = useState('CASH');
  const [payDate,   setPayDate]   = useState(TODAY);
  const [reference, setReference] = useState('');
  const [note,      setNote]      = useState('');

  // Card-specific (saved card charge)
  const [chargeLoading, setChargeLoading] = useState(false);

  // General submit
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState(null); // { payment_id, invoices }

  const clientId   = client?.id   || invoice?.client_id;
  const clientName = client?.name || invoice?.client_name || 'Client';
  const hasCard    = client?.card_on_file && client?.stripe_payment_method_id;
  const cardBrand  = client?.payment_method_brand || 'Card';
  const cardLast4  = client?.payment_method_last4;

  // ── Fetch outstanding invoices ──────────────────────────────────────────────
  useEffect(() => {
    if (!clientId) { setLoadingInv(false); return; }
    api.get(`/payments/outstanding?client_id=${clientId}`)
      .then(r => {
        const rows = r.data || [];
        setInvoices(rows);
        // Pre-select the triggering invoice
        const initial = rows.find(r => r.id === invoice?.id);
        if (initial) {
          setSelected({ [initial.id]: String(parseFloat(initial.balance).toFixed(2)) });
        } else if (rows.length > 0) {
          setSelected({ [rows[0].id]: String(parseFloat(rows[0].balance).toFixed(2)) });
        }
      })
      .catch(() => setInvError('Could not load invoices.'))
      .finally(() => setLoadingInv(false));
  }, [clientId, invoice?.id]);

  // ── Computed totals ────────────────────────────────────────────────────────
  const totalOutstanding = invoices.reduce((s, inv) => s + parseFloat(inv.balance || 0), 0);
  const selectedTotal    = Object.entries(selected).reduce((s, [id, amt]) => {
    return selected[id] !== undefined ? s + (parseFloat(amt) || 0) : s;
  }, 0);
  const remainingBalance = Math.max(0, totalOutstanding - selectedTotal);

  // ── Invoice selection ──────────────────────────────────────────────────────
  function toggleInvoice(inv) {
    setSelected(prev => {
      if (prev[inv.id] !== undefined) {
        const next = { ...prev };
        delete next[inv.id];
        return next;
      }
      return { ...prev, [inv.id]: String(parseFloat(inv.balance).toFixed(2)) };
    });
  }

  function setAllocationAmt(invId, val) {
    setSelected(prev => ({ ...prev, [invId]: val }));
  }

  // ── Method descriptor ──────────────────────────────────────────────────────
  const methodDef = METHODS.find(m => m.key === method) || METHODS[0];

  // ── Validation ─────────────────────────────────────────────────────────────
  const hasSelection    = Object.keys(selected).length > 0;
  const selectionValid  = Object.values(selected).every(a => parseFloat(a) > 0);
  const refRequired     = methodDef.refRequired;
  const refMissing      = refRequired && !reference.trim();
  const cardNeeded      = method === 'CARD';
  const achNeeded       = method === 'ACH';
  const canEnter        = hasSelection && selectionValid && !refMissing &&
                          (!cardNeeded || hasCard) && !achNeeded;

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleEnterPayment() {
    setError('');
    const allocations = Object.entries(selected)
      .map(([invoice_id, amount]) => ({ invoice_id, amount: parseFloat(amount) }))
      .filter(a => a.amount > 0);

    if (method === 'CARD' && hasCard) {
      // Charge saved card for the total amount, then record allocation
      setChargeLoading(true);
      try {
        await api.post('/payments/charge', {
          invoice_id:        allocations[0]?.invoice_id || invoice?.id,
          payment_method_id: client.stripe_payment_method_id,
        });
        // Then record allocations via payments endpoint
        const res = await api.post('/payments', {
          client_id:    clientId,
          method:       'CARD',
          payment_date: payDate,
          reference:    reference.trim() || undefined,
          note:         note.trim() || undefined,
          allocations,
        });
        setSuccess(res.data);
        onPaymentRecorded?.(res.data.invoices);
      } catch (err) {
        setError(err.response?.data?.error || 'Card charge failed. Try a manual method.');
      } finally {
        setChargeLoading(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/payments', {
        client_id:    clientId,
        method,
        payment_date: payDate,
        reference:    reference.trim() || undefined,
        note:         note.trim() || undefined,
        allocations,
      });
      setSuccess(res.data);
      onPaymentRecorded?.(res.data.invoices);
    } catch (err) {
      setError(err.response?.data?.error || 'Payment could not be recorded. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (success) {
    const paidInvs = success.invoices || [];
    return (
      <div className="cpw-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="cpw" onClick={e => e.stopPropagation()}>
          <div className="cpw-header">
            <div>
              <h2 className="cpw-title">Payment Recorded</h2>
              <p className="cpw-subtitle">{clientName}</p>
            </div>
            <button className="btn-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
          <div className="cpw-success">
            <p className="cpw-success-amount">{fmt(selectedTotal)}</p>
            <p className="cpw-success-method">{methodDef.label}</p>
            <div className="cpw-success-invs">
              {paidInvs.map(inv => (
                <div key={inv.id} className="cpw-success-inv-row">
                  <span>Invoice #{inv.invoice_number || inv.id.slice(0, 8)}</span>
                  <span className="cpw-success-inv-status" data-status={inv.status}>
                    {inv.status === 'paid' ? 'Paid' : 'Partially Paid'}
                  </span>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={onClose} style={{ marginTop: 24 }}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cpw-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cpw" onClick={e => e.stopPropagation()}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="cpw-header">
          <div>
            <h2 className="cpw-title">Collect Payment</h2>
            <p className="cpw-subtitle">{clientName}</p>
          </div>
          <div className="cpw-header-balance">
            <span className="cpw-header-balance-label">Outstanding Balance</span>
            <span className="cpw-header-balance-value">{fmt(totalOutstanding)}</span>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        {error && <p className="cpw-error">{error}</p>}

        <div className="cpw-body">

          {/* ── LEFT: Payment Method ─────────────────────────────────────── */}
          <div className="cpw-col cpw-col--left">
            <p className="cpw-section-label">Payment Method</p>

            {/* Processed */}
            <p className="cpw-method-group-label">Pay Online</p>
            {METHODS.filter(m => m.type === 'processed').map(m => (
              <button
                key={m.key}
                className={`cpw-method-item${method === m.key ? ' cpw-method-item--active' : ''}`}
                onClick={() => { setMethod(m.key); setReference(''); setError(''); }}
                disabled={m.key === 'ACH'}
                title={m.key === 'ACH' ? 'ACH not configured for this account' : undefined}
              >
                <m.Icon size={14} className="cpw-method-icon" />
                <span>{m.label}</span>
                {m.key === 'ACH' && <span className="cpw-method-unavail">Not configured</span>}
                {m.key === 'CARD' && hasCard && (
                  <span className="cpw-method-saved">{cardBrand}{cardLast4 ? ` ••••${cardLast4}` : ''}</span>
                )}
              </button>
            ))}

            {/* Manual */}
            <p className="cpw-method-group-label" style={{ marginTop: 16 }}>Record a Payment</p>
            {METHODS.filter(m => m.type === 'manual').map(m => (
              <button
                key={m.key}
                className={`cpw-method-item${method === m.key ? ' cpw-method-item--active' : ''}`}
                onClick={() => { setMethod(m.key); setReference(''); setError(''); }}
              >
                <m.Icon size={14} className="cpw-method-icon" />
                <span>{m.label}</span>
              </button>
            ))}
            {METHODS.filter(m => m.type === 'external').map(m => (
              <button
                key={m.key}
                className={`cpw-method-item${method === m.key ? ' cpw-method-item--active' : ''}`}
                onClick={() => { setMethod(m.key); setReference(''); setError(''); }}
              >
                <m.Icon size={14} className="cpw-method-icon" />
                <span>{m.label}</span>
              </button>
            ))}

            {/* Method-specific form fields */}
            <div className="cpw-method-form">
              <div className="ib-field">
                <label className="ib-label">Payment Date</label>
                <input
                  className="ib-input"
                  type="date"
                  value={payDate}
                  onChange={e => setPayDate(e.target.value)}
                />
              </div>

              {methodDef.refLabel && (
                <div className="ib-field">
                  <label className="ib-label">
                    {methodDef.refLabel}
                    {methodDef.refRequired && <span style={{ color: 'var(--red)' }}> *</span>}
                  </label>
                  <input
                    className="ib-input"
                    type="text"
                    placeholder={methodDef.refRequired ? 'Required' : 'Optional'}
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                  />
                </div>
              )}

              <div className="ib-field">
                <label className="ib-label">Note <span style={{ fontWeight: 400, color: 'var(--steel)' }}>(optional)</span></label>
                <textarea
                  className="ib-textarea"
                  rows={2}
                  placeholder="Internal note…"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* ── CENTER: Outstanding Invoices ─────────────────────────────── */}
          <div className="cpw-col cpw-col--center">
            <p className="cpw-section-label">Outstanding Invoices</p>
            {loadingInv ? (
              <p className="cpw-empty">Loading…</p>
            ) : invError ? (
              <p className="cpw-empty cpw-empty--error">{invError}</p>
            ) : invoices.length === 0 ? (
              <p className="cpw-empty">No outstanding invoices for this client.</p>
            ) : (
              <table className="cpw-inv-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Invoice #</th>
                    <th>Due Date</th>
                    <th>Address</th>
                    <th>Total</th>
                    <th>Balance</th>
                    <th>Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => {
                    const isSelected = selected[inv.id] !== undefined;
                    return (
                      <tr
                        key={inv.id}
                        className={`cpw-inv-row${isSelected ? ' cpw-inv-row--selected' : ''}`}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleInvoice(inv)}
                            aria-label={`Select invoice ${inv.invoice_number}`}
                          />
                        </td>
                        <td className="cpw-inv-num">#{inv.invoice_number || inv.id.slice(0, 8)}</td>
                        <td className="cpw-inv-date">{fmtDate(inv.due_date)}</td>
                        <td className="cpw-inv-addr">{inv.service_address || '—'}</td>
                        <td className="cpw-inv-amt">{fmt(inv.amount)}</td>
                        <td className="cpw-inv-bal">{fmt(inv.balance)}</td>
                        <td className="cpw-inv-pay">
                          {isSelected ? (
                            <div className="cpw-pay-input-wrap">
                              <span className="cpw-pay-sym">$</span>
                              <input
                                className="cpw-pay-input"
                                type="number"
                                min="0.01"
                                step="0.01"
                                max={parseFloat(inv.balance)}
                                value={selected[inv.id]}
                                onChange={e => setAllocationAmt(inv.id, e.target.value)}
                                aria-label={`Payment amount for invoice ${inv.invoice_number}`}
                              />
                            </div>
                          ) : (
                            <span className="cpw-inv-pay-empty">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* ── RIGHT: Account Summary + Enter Payment ───────────────────── */}
          <div className="cpw-col cpw-col--right">
            <p className="cpw-section-label">Account Summary</p>

            <div className="cpw-summary">
              <div className="cpw-summary-row">
                <span className="cpw-summary-label">Outstanding Balance</span>
                <span className="cpw-summary-value">{fmt(totalOutstanding)}</span>
              </div>
              <div className="cpw-summary-row cpw-summary-row--selected">
                <span className="cpw-summary-label">Selected for Payment</span>
                <span className="cpw-summary-value">{fmt(selectedTotal)}</span>
              </div>
              <div className="cpw-summary-divider" />
              <div className="cpw-summary-row cpw-summary-row--remaining">
                <span className="cpw-summary-label">Remaining Balance</span>
                <span className="cpw-summary-value">{fmt(remainingBalance)}</span>
              </div>
            </div>

            {/* Client billing address */}
            {(client?.address || invoice?.client_address) && (
              <div className="cpw-client-info">
                <p className="cpw-section-label" style={{ marginTop: 20 }}>Billing Address</p>
                <p className="cpw-client-name">{clientName}</p>
                <p className="cpw-client-addr">
                  {client?.address || invoice?.client_address}
                  {(client?.city || invoice?.client_city) && (
                    <>, {client?.city || invoice?.client_city}, {client?.state || invoice?.client_state} {client?.zip || invoice?.client_zip}</>
                  )}
                </p>
              </div>
            )}

            {/* Warning for missing card */}
            {method === 'CARD' && !hasCard && (
              <p className="cpw-method-warning">
                No saved card for this client. Add a card in Invoice Detail first.
              </p>
            )}
            {method === 'ACH' && (
              <p className="cpw-method-warning">
                ACH is not configured for this account.
              </p>
            )}

            {/* Enter Payment button */}
            <button
              className="btn btn-primary cpw-enter-btn"
              onClick={handleEnterPayment}
              disabled={!canEnter || submitting || chargeLoading}
            >
              {submitting || chargeLoading ? 'Processing…' : 'Enter Payment'}
            </button>

            <button
              className="btn btn-secondary"
              onClick={onClose}
              style={{ width: '100%', marginTop: 8 }}
            >
              Collect Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
