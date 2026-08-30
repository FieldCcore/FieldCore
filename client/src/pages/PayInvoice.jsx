import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';

const BACKEND = import.meta.env.VITE_API_URL || '';

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(n) {
  const v = parseFloat(n);
  return isNaN(v) ? '$0.00' : `$${v.toFixed(2)}`;
}

function dateLabel(d) {
  if (!d) return null;
  const parsed = new Date(d + 'T00:00:00');
  if (isNaN(parsed)) return null;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function cadenceLabel(c) {
  const map = {
    weekly: 'Weekly', every_2_weeks: 'Every 2 Weeks', every_3_weeks: 'Every 3 Weeks',
    every_4_weeks: 'Every 4 Weeks', biweekly: 'Every 2 Weeks',
    monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual', every_service: 'Per Service',
  };
  return map[c] || c;
}

function weekdayLabel(n) {
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][n] ?? '';
}

function scheduleFreq(s) {
  const base = cadenceLabel(s.cadence);
  if (s.cadence === 'custom' && s.service_interval_days)
    return `Every ${s.service_interval_days} days`;
  if (['weekly','every_2_weeks','every_3_weeks','every_4_weeks'].includes(s.cadence) && s.preferred_weekday != null)
    return `${base} · ${weekdayLabel(parseInt(s.preferred_weekday, 10))}s`;
  return base;
}

const NAVY   = '#1C2333';
const SAND   = '#D6B58A';
const SLATE  = '#5F667A';
const STEEL  = '#8A90A2';
const GRAY   = '#E6E6E6';
const GREEN  = '#16a34a';
const GREEN_BG = '#f0fdf4';
const GREEN_BORDER = '#bbf7d0';
const OFF_WHITE = '#EDEBE7';
const CARD_BG = '#faf9f7';

// ── Status pill ────────────────────────────────────────────────────────────────
function StatusPill({ status }) {
  const cfg = {
    paid:     { label: 'Paid',      bg: GREEN_BG,   color: GREEN,    border: GREEN_BORDER },
    pending:  { label: 'Due',       bg: '#fffbeb',  color: '#d97706', border: '#fde68a'  },
    overdue:  { label: 'Overdue',   bg: '#fef2f2',  color: '#dc2626', border: '#fecaca'  },
    void:     { label: 'Void',      bg: '#f9fafb',  color: SLATE,    border: GRAY        },
    draft:    { label: 'Draft',     bg: '#f9fafb',  color: SLATE,    border: GRAY        },
  };
  const c = cfg[status] || cfg.pending;
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px',
      borderRadius: 20, border: `1px solid ${c.border}`,
      background: c.bg, color: c.color,
      fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase',
    }}>
      {c.label}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PayInvoice() {
  const { invoiceId }    = useParams();
  const [searchParams]   = useSearchParams();
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

  // ── Derived state ──────────────────────────────────────────────────────────
  const paidViaQuery = searchParams.get('paid') === '1';

  // ── Layout shell ───────────────────────────────────────────────────────────
  if (loading) return (
    <Shell>
      <div style={{ textAlign: 'center', padding: '48px 0', color: STEEL, fontSize: 13 }}>Loading…</div>
    </Shell>
  );

  if (error) return (
    <Shell>
      <div style={{ textAlign: 'center', padding: '48px 24px' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: NAVY, marginBottom: 8 }}>{error}</div>
        <div style={{ fontSize: 13, color: STEEL, lineHeight: 1.6 }}>
          This invoice may have already been paid, voided, or may no longer exist.<br />
          Please contact the business if you have questions.
        </div>
      </div>
    </Shell>
  );

  const inv         = invoice;
  const isPaid      = paidViaQuery || inv.status === 'paid';
  const isVoid      = inv.status === 'void';
  const displayStatus = isPaid ? 'paid' : (isVoid ? 'void' : inv.status);

  const lineItems   = Array.isArray(inv.line_items) ? inv.line_items : [];
  const hasSchedules = Array.isArray(inv.service_schedules) && inv.service_schedules.length > 0;
  const isAgreement = !!inv.source_agreement_id;

  // Financial breakdown
  const total     = parseFloat(inv.amount)       || 0;
  const tax       = parseFloat(inv.tax_amount)   || 0;
  const subtotal  = parseFloat(inv.subtotal)     || (total - tax);
  const discount  = parseFloat(inv.discount_amount) || 0;
  const balance   = inv.balance != null ? parseFloat(inv.balance) : total;
  const hasTax    = tax > 0;
  const hasDisc   = discount > 0;
  const hasBalance = balance < total && balance > 0;

  const clientAddr = [inv.client_address, inv.client_city, inv.client_state, inv.client_zip]
    .filter(Boolean).join(', ');

  const periodRange = (inv.period_start && inv.period_end)
    ? `${dateLabel(inv.period_start)} – ${dateLabel(inv.period_end)}`
    : null;

  return (
    <Shell>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        background: NAVY, borderRadius: '12px 12px 0 0', padding: '22px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {inv.business_logo_url ? (
            <img src={inv.business_logo_url} alt="logo"
              style={{ width: 42, height: 42, borderRadius: 8, objectFit: 'contain', background: '#fff' }} />
          ) : (
            <div style={{
              width: 42, height: 42, borderRadius: 8, background: 'rgba(214,181,138,.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 800, color: SAND,
            }}>
              {(inv.business_name || 'F')[0].toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>
              {inv.business_name}
            </div>
            {inv.business_phone && (
              <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, marginTop: 2 }}>
                {inv.business_phone}
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: 'rgba(255,255,255,.45)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>Invoice</div>
          <div style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginTop: 2 }}>
            #{inv.invoice_number || '—'}
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', border: `1px solid ${GRAY}`, borderTop: 'none', borderRadius: '0 0 12px 12px', padding: 28 }}>

        {/* ── Paid confirmation ─────────────────────────────────────────── */}
        {isPaid ? (
          <div style={{ textAlign: 'center', padding: '20px 0 12px' }}>
            <div style={{
              width: 52, height: 52, background: GREEN_BG, border: `2px solid ${GREEN_BORDER}`,
              borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px', fontSize: 22, color: GREEN,
            }}>✓</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Payment Received</div>
            <div style={{ fontSize: 14, color: SLATE, lineHeight: 1.6 }}>
              Thank you, {inv.client_name}.<br />
              Your payment of <strong>{fmt(total)}</strong> was received.
            </div>
          </div>
        ) : isVoid ? (
          <div style={{ textAlign: 'center', padding: '20px 0 12px' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: NAVY, marginBottom: 6 }}>This invoice has been voided.</div>
            <div style={{ fontSize: 13, color: STEEL }}>Please contact the business if you have questions.</div>
          </div>
        ) : (
          <>
            {/* ── Invoice meta row ──────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 22, paddingBottom: 18, borderBottom: `1px solid ${GRAY}` }}>
              <div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: STEEL, marginBottom: 4 }}>Bill to</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>{inv.client_name}</div>
                {clientAddr && <div style={{ fontSize: 13, color: SLATE, marginTop: 3 }}>{clientAddr}</div>}
              </div>
              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                <StatusPill status={displayStatus} />
                {inv.issued_date && (
                  <div style={{ fontSize: 12, color: SLATE }}>
                    Issued: {dateLabel(inv.issued_date)}
                  </div>
                )}
                {inv.due_date && !isPaid && (
                  <div style={{ fontSize: 12, color: inv.status === 'overdue' ? '#dc2626' : SLATE }}>
                    Due: {dateLabel(inv.due_date)}
                  </div>
                )}
              </div>
            </div>

            {/* ── Subject / agreement name ──────────────────────────────── */}
            {(inv.subject || inv.agreement_name) && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: NAVY }}>
                  {inv.subject || inv.agreement_name}
                </div>
                {isAgreement && periodRange && (
                  <div style={{ fontSize: 12, color: SLATE, marginTop: 3 }}>
                    Coverage period: {periodRange}
                  </div>
                )}
              </div>
            )}

            {/* ── Covered Services (agreement invoices) ─────────────────── */}
            {isAgreement && hasSchedules && (
              <div style={{ background: CARD_BG, border: `1px solid ${GRAY}`, borderRadius: 8, padding: '14px 16px', marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: STEEL, marginBottom: 10 }}>
                  Covered Services
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {inv.service_schedules.map((s, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>
                          {[s.asset_label, s.service_type].filter(Boolean).join(' — ') || `Service ${i + 1}`}
                        </div>
                        <div style={{ fontSize: 12, color: SLATE, marginTop: 2 }}>
                          {scheduleFreq(s)}
                          {s.service_address && ` · ${s.service_address}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Line Items ────────────────────────────────────────────── */}
            {lineItems.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: STEEL, marginBottom: 8 }}>
                  {isAgreement ? 'Billing Detail' : 'Services'}
                </div>
                <div style={{ border: `1px solid ${GRAY}`, borderRadius: 8, overflow: 'hidden' }}>
                  {lineItems.map((item, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                      padding: '10px 14px', gap: 12,
                      background: i % 2 === 0 ? '#fff' : CARD_BG,
                      borderBottom: i < lineItems.length - 1 ? `1px solid ${GRAY}` : 'none',
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: NAVY }}>{item.description || item.name || 'Service'}</div>
                        {item.quantity && item.quantity !== 1 && (
                          <div style={{ fontSize: 11, color: STEEL, marginTop: 2 }}>
                            Qty: {item.quantity} × {fmt(parseFloat(item.amount || 0) / parseFloat(item.quantity || 1))}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, whiteSpace: 'nowrap' }}>
                        {fmt(item.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Financial Summary ─────────────────────────────────────── */}
            <div style={{ background: CARD_BG, border: `1px solid ${GRAY}`, borderRadius: 8, padding: '14px 16px', marginBottom: 22 }}>
              {hasTax || hasDisc ? (
                <>
                  <FinRow label="Subtotal" value={fmt(subtotal)} />
                  {hasDisc && (
                    <FinRow
                      label={inv.discount_label ? `Discount (${inv.discount_label})` : 'Discount'}
                      value={`− ${fmt(discount)}`}
                      color={GREEN}
                    />
                  )}
                  {hasTax && <FinRow label="Tax" value={fmt(tax)} />}
                  <div style={{ borderTop: `1px solid ${GRAY}`, margin: '10px 0 6px' }} />
                </>
              ) : null}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em', color: STEEL }}>Total</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: NAVY }}>{fmt(total)}</div>
              </div>
              {hasBalance && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: SLATE, marginTop: 6 }}>
                  <span>Payments Applied</span>
                  <span>− {fmt(total - balance)}</span>
                </div>
              )}
              {hasBalance && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, color: NAVY, marginTop: 4, paddingTop: 8, borderTop: `1px solid ${GRAY}` }}>
                  <span>Balance Due</span>
                  <span>{fmt(balance)}</span>
                </div>
              )}
            </div>

            {/* ── Payment ──────────────────────────────────────────────── */}
            {(inv.accept_card || inv.accept_ach) && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: STEEL, marginBottom: 8 }}>
                  Accepted Online
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {inv.accept_card && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: SLATE, background: OFF_WHITE, borderRadius: 6, padding: '4px 10px' }}>
                      <span>💳</span> Credit / Debit Card
                    </div>
                  )}
                  {inv.accept_ach && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: SLATE, background: OFF_WHITE, borderRadius: 6, padding: '4px 10px' }}>
                      <span>🏦</span> Bank Payment (ACH)
                    </div>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={pay}
              disabled={paying}
              data-testid="pay-button"
              style={{
                width: '100%', padding: '15px 0',
                background: paying ? '#374151' : NAVY,
                color: SAND, border: 'none', borderRadius: 8,
                fontSize: 16, fontWeight: 700, cursor: paying ? 'default' : 'pointer',
                letterSpacing: '.02em', transition: 'background .15s',
              }}
            >
              {paying ? 'Redirecting to checkout…' : `Pay ${fmt(balance || total)} →`}
            </button>

            <div style={{ marginTop: 12, textAlign: 'center', fontSize: 11, color: STEEL }}>
              Secured by Stripe · Your card information is never stored on our servers
            </div>

            {/* ── Terms / Client Message ────────────────────────────────── */}
            {inv.client_message && (
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${GRAY}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: STEEL, marginBottom: 6 }}>Message</div>
                <div style={{ fontSize: 13, color: SLATE, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{inv.client_message}</div>
              </div>
            )}
            {inv.terms && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${GRAY}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: STEEL, marginBottom: 6 }}>Terms & Conditions</div>
                <div style={{ fontSize: 12, color: STEEL, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{inv.terms}</div>
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: STEEL }}>
        Powered by <strong style={{ color: SLATE }}>FieldCore™</strong>
      </div>
    </Shell>
  );
}

// ── Layout shell ───────────────────────────────────────────────────────────────
function Shell({ children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      minHeight: '100vh', background: '#f4f1ec', padding: '24px 16px 48px',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 520 }}>{children}</div>
    </div>
  );
}

// ── Financial row helper ───────────────────────────────────────────────────────
function FinRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: color || '#4b5563', marginBottom: 6 }}>
      <span>{label}</span>
      <span style={color ? { color } : {}}>{value}</span>
    </div>
  );
}
