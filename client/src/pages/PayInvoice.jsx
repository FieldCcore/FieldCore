import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';

const BACKEND = import.meta.env.VITE_API_URL || '';

export default function PayInvoice() {
  const { invoiceId } = useParams();
  const [searchParams]  = useSearchParams();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [paying,  setPaying]  = useState(false);

  useEffect(() => {
    axios.get(`${BACKEND}/api/pay/${invoiceId}`)
      .then(r => setInvoice(r.data))
      .catch(err => setError(err.response?.data?.error || 'Invoice not found.'))
      .finally(() => setLoading(false));
  }, [invoiceId]);

  async function pay() {
    setPaying(true);
    try {
      const { data } = await axios.post(`${BACKEND}/api/pay/${invoiceId}/checkout`);
      window.location.href = data.url;
    } catch (err) {
      alert(err.response?.data?.error || 'Could not start checkout. Please try again.');
      setPaying(false);
    }
  }

  const center = { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f4f4f0', padding: 20 };

  if (loading) return (
    <div style={center}>
      <div style={{ color: '#6b7280', fontFamily: 'DM Mono, monospace', fontSize: 13 }}>Loading…</div>
    </div>
  );

  if (error) return (
    <div style={center}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{error}</div>
        <div style={{ fontSize: 13, color: '#9ca3af' }}>This invoice may have already been paid or no longer exists.</div>
      </div>
    </div>
  );

  const paidViaQuery  = searchParams.get('paid') === '1';
  const isPaid  = paidViaQuery || invoice.status === 'paid';
  const isVoid  = invoice.status === 'void';
  const subtotal = parseFloat(invoice.amount) - parseFloat(invoice.tax_amount || 0);
  const hasTax   = parseFloat(invoice.tax_amount || 0) > 0;

  return (
    <div style={center}>
      <div style={{ width: '100%', maxWidth: 460 }}>

        {/* Branded header */}
        <div style={{ background: '#1C2333', borderRadius: '12px 12px 0 0', padding: '20px 28px' }}>
          <div style={{ color: '#D6B58A', fontSize: 15, fontWeight: 800, letterSpacing: '.05em' }}>FIELDCORE™</div>
          <div style={{ color: 'rgba(255,255,255,.45)', fontSize: 12, marginTop: 3 }}>{invoice.business_name}</div>
        </div>

        <div style={{ background: 'white', border: '1px solid #e5e0d8', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: 28 }}>

          {isPaid ? (
            <div style={{ textAlign: 'center', padding: '20px 0 8px' }}>
              <div style={{ width: 52, height: 52, background: '#f0fdf4', border: '2px solid #bbf7d0', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 22, color: '#16a34a' }}>✓</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1C2333', marginBottom: 8 }}>Payment Received</div>
              <div style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.5 }}>
                Thank you, {invoice.client_name}.<br />Your payment of <strong>${parseFloat(invoice.amount).toFixed(2)}</strong> was successful.
              </div>
            </div>
          ) : isVoid ? (
            <div style={{ textAlign: 'center', padding: '20px 0 8px' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 6 }}>This invoice has been voided.</div>
              <div style={{ fontSize: 13, color: '#9ca3af' }}>Please contact the business if you have questions.</div>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: '#9ca3af', marginBottom: 4 }}>Invoice for</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1C2333' }}>{invoice.client_name}</div>
              </div>

              <div style={{ background: '#f9f7f3', borderRadius: 8, padding: '18px 20px', marginBottom: 22, border: '1px solid #e5e0d8' }}>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: '#9ca3af', marginBottom: 3 }}>Service</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#1C2333' }}>{invoice.service_type}</div>
                </div>

                {hasTax && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6b7280', paddingTop: 12, borderTop: '1px solid #e5e0d8', marginBottom: 6 }}>
                      <span>Subtotal</span>
                      <span>${subtotal.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>
                      <span>Tax</span>
                      <span>${parseFloat(invoice.tax_amount).toFixed(2)}</span>
                    </div>
                  </>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: hasTax ? 10 : 14, borderTop: hasTax ? '1px solid #e5e0d8' : '1px solid #e5e0d8', marginTop: hasTax ? 0 : 0 }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: '#9ca3af' }}>Amount Due</div>
                  <div style={{ fontSize: 30, fontWeight: 800, color: '#1C2333' }}>${parseFloat(invoice.amount).toFixed(2)}</div>
                </div>
              </div>

              <button
                onClick={pay}
                disabled={paying}
                style={{ width: '100%', padding: '14px 0', background: '#1C2333', color: '#D6B58A', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: paying ? 'default' : 'pointer', letterSpacing: '.02em', opacity: paying ? 0.75 : 1 }}
              >
                {paying ? 'Redirecting to checkout…' : `Pay $${parseFloat(invoice.amount).toFixed(2)} →`}
              </button>

              <div style={{ marginTop: 12, textAlign: 'center', fontSize: 11, color: '#9ca3af' }}>
                Secured by Stripe · Your card info is never stored on our servers
              </div>
            </>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 11, color: '#9ca3af' }}>
          Powered by <strong style={{ color: '#6b7280' }}>FieldCore</strong>
        </div>
      </div>
    </div>
  );
}
