import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import api from '../api';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

const PLANS = [
  {
    key: 'solo', name: 'Solo', price: 49,
    target: '1 operator · Under $150K',
    features: ['Client database + job scheduling','Stripe payments + auto-invoicing','Online booking widget','ETA sender — real clock time','Tech mobile app (iOS + Android)'],
    missing:  ['Business phone','No-show clock + 3-layer deposits','Revenue analytics','Multi-entity access'],
  },
  {
    key: 'pro', name: 'Pro', price: 99, highlight: true,
    target: '1–3 techs · $150K–$600K',
    features: ['Everything in Solo','Business phone — included','No-show clock + 3-layer deposits','Smart Caller ID (push when closed)','Pre-charge advance notices','Travel fee engine + route optimization','Fleet + recurring billing automation','Revenue analytics'],
    missing:  ['Multi-entity access','Priority support'],
  },
  {
    key: 'scale', name: 'Scale', price: 199,
    target: '4–10 techs · $600K–$2M',
    features: ['Everything in Pro','Multi-entity — unlimited LLCs','3 phone numbers + call routing','GPS fleet tracking integration','Custom reports + API access','E-signature + white-label booking','Priority support'],
    missing:  [],
  },
];

const PLAN_ORDER = ['starter', 'solo', 'pro', 'scale'];
const PLAN_FEATURES = {
  solo:  ['Business phone','No-show clock + 3-layer deposits','Revenue analytics','Multi-entity access'],
  pro:   ['Multi-entity access','Priority support'],
  scale: [],
};

const CANCEL_REASONS = [
  'Too expensive',
  'Missing features I need',
  'Switching to a competitor',
  'Business is slowing down',
  'Just testing',
  'Other',
];

function fmt$(n) { return `$${parseFloat(n || 0).toFixed(2)}`; }
function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(typeof ts === 'number' ? ts * 1000 : ts)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
const CardIco = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 22, height: 22, color: '#5F667A' }}>
    <rect x="2" y="5" width="20" height="14" rx="2"/>
    <path d="M2 10h20M6 14h.01M10 14h4"/>
  </svg>
);
const BankIco = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 22, height: 22, color: '#5F667A' }}>
    <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M8 10v11M12 10v11M16 10v11M20 10v11"/>
  </svg>
);

// ── Card Setup Form (inside Stripe Elements) ──────────────────────────────────
function CardSetupForm({ onSuccess, onCancel }) {
  const stripe   = useStripe();
  const elements = useElements();
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/billing/payment-methods/setup');
      const { error: confirmError, setupIntent } = await stripe.confirmCardSetup(
        data.client_secret,
        { payment_method: { card: elements.getElement(CardElement) } }
      );
      if (confirmError) { setError(confirmError.message); setBusy(false); return; }
      await api.post('/billing/payment-methods/attach', {
        payment_method_id: setupIntent.payment_method,
        set_default: true,
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Card setup failed.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ padding: '14px 16px', border: '1.5px solid var(--lightgray)', borderRadius: 8, background: 'white', marginBottom: 14 }}>
        <CardElement options={{ style: { base: { fontSize: '14px', color: '#1C2333', fontFamily: 'Inter, sans-serif', '::placeholder': { color: '#9ca3af' } } } }} />
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="submit" disabled={busy || !stripe} className="btn-primary" style={{ fontSize: 13 }}>
          {busy ? 'Saving…' : 'Save Card'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary" style={{ fontSize: 13 }}>Cancel</button>
      </div>
    </form>
  );
}

// ── Bank Account Form ─────────────────────────────────────────────────────────
function BankForm({ onSuccess, onCancel }) {
  const [form, setForm] = useState({ routing_number: '', account_number: '', account_holder_name: '', account_type: 'individual' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/billing/payment-methods/bank', form);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Bank account setup failed.');
    } finally { setBusy(false); }
  }

  const inp = (field) => ({
    value: form[field],
    onChange: e => setForm(p => ({ ...p, [field]: e.target.value })),
    style: { width: '100%', padding: '10px 12px', border: '1.5px solid var(--lightgray)', borderRadius: 8, fontSize: 13, color: 'var(--navy)', outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' },
  });

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>Account Holder Name</label>
        <input {...inp('account_holder_name')} placeholder="Jane Smith" required />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>Routing Number</label>
          <input {...inp('routing_number')} placeholder="021000021" maxLength={9} required />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>Account Number</label>
          <input {...inp('account_number')} placeholder="••••••••" required />
        </div>
      </div>
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>Account Type</label>
        <select value={form.account_type} onChange={e => setForm(p => ({ ...p, account_type: e.target.value }))}
          style={{ ...inp('account_type').style }}>
          <option value="individual">Individual</option>
          <option value="company">Company</option>
        </select>
      </div>
      <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 12, color: '#92400e' }}>
        Stripe will send 2 small micro-deposits (1–2 business days) to verify your account. You'll confirm the amounts here once received.
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="submit" disabled={busy} className="btn-primary" style={{ fontSize: 13 }}>{busy ? 'Saving…' : 'Add Bank Account'}</button>
        <button type="button" onClick={onCancel} className="btn-secondary" style={{ fontSize: 13 }}>Cancel</button>
      </div>
    </form>
  );
}

// ── Cancel Modal ──────────────────────────────────────────────────────────────
function CancelModal({ onClose, onConfirmed }) {
  const [reason, setReason]     = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy]         = useState(false);

  async function handleCancel() {
    if (!reason) return alert('Please select a reason.');
    setBusy(true);
    try {
      const { data } = await api.post('/billing/cancel', { reason, additional_feedback: feedback });
      onConfirmed(data.access_ends_at);
    } catch (err) {
      alert(err.response?.data?.error || 'Cancellation failed.');
    } finally { setBusy(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
      <div style={{ background: 'white', borderRadius: 12, padding: 32, maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>Cancel Subscription</div>
        <div style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 24, lineHeight: 1.6 }}>
          Your access will continue until the end of your current billing period. After that, your account becomes read-only.
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 8 }}>Why are you cancelling?</label>
          {CANCEL_REASONS.map(r => (
            <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer', fontSize: 14, color: 'var(--navy)' }}>
              <input type="radio" name="cancel_reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
              {r}
            </label>
          ))}
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>Additional feedback (optional)</label>
          <textarea
            value={feedback} onChange={e => setFeedback(e.target.value)}
            rows={3}
            placeholder="Tell us how we could have done better…"
            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--lightgray)', borderRadius: 8, fontSize: 13, color: 'var(--navy)', resize: 'vertical', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleCancel} disabled={busy || !reason}
            style={{ flex: 1, padding: '11px 0', background: 'var(--red)', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: busy || !reason ? 'not-allowed' : 'pointer', opacity: !reason ? .5 : 1 }}>
            {busy ? 'Cancelling…' : 'Confirm Cancellation'}
          </button>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 13 }}>Keep Plan</button>
        </div>
      </div>
    </div>
  );
}

// ── Downgrade Modal ───────────────────────────────────────────────────────────
function DowngradeModal({ from, to, periodEnd, onClose, onConfirm }) {
  const lost = PLAN_FEATURES[to.key] || [];
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
      <div style={{ background: 'white', borderRadius: 12, padding: 32, maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>Downgrade to {to.name}?</div>
        <div style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 20, lineHeight: 1.6 }}>
          Downgrading takes effect on <strong>{fmtDate(periodEnd)}</strong>, at the end of your current billing period.
        </div>
        {lost.length > 0 && (
          <div style={{ marginBottom: 20, padding: '14px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>Features you will lose</div>
            {lost.map(f => (
              <div key={f} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#7f1d1d', marginBottom: 4 }}>
                <span>✕</span> {f}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onConfirm} style={{ flex: 1, padding: '11px 0', background: 'var(--navy)', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Confirm Downgrade
          </button>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 13 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Billing Page ─────────────────────────────────────────────────────────
export default function Billing() {
  const [searchParams] = useSearchParams();
  const [billing,      setBilling]      = useState(null);
  const [payMethods,   setPayMethods]   = useState([]);
  const [history,      setHistory]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [busy,         setBusy]         = useState(false);
  const [connectBusy,  setConnectBusy]  = useState(false);
  const [tab,          setTab]          = useState('plans');
  const [addCard,      setAddCard]      = useState(false);
  const [addBank,      setAddBank]      = useState(false);
  const [cancelModal,  setCancelModal]  = useState(false);
  const [cancelledUntil, setCancelledUntil] = useState(null);
  const [downgradeModal, setDowngradeModal] = useState(null); // { from, to }

  const load = useCallback(async () => {
    const [billingRes, methodsRes, historyRes] = await Promise.allSettled([
      api.get('/billing'),
      api.get('/billing/payment-methods'),
      api.get('/billing/history'),
    ]);
    if (billingRes.status === 'fulfilled') setBilling(billingRes.value.data);
    if (methodsRes.status === 'fulfilled') setPayMethods(methodsRes.value.data);
    if (historyRes.status === 'fulfilled') setHistory(historyRes.value.data);
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  async function upgrade(plan) {
    setBusy(true);
    try {
      const { data } = await api.post('/billing/checkout', { plan });
      window.location.href = data.url;
    } catch (err) {
      alert(err.response?.data?.error || 'Could not start checkout.');
      setBusy(false);
    }
  }

  async function doDowngrade(targetPlan) {
    setBusy(true);
    setDowngradeModal(null);
    try {
      const { data } = await api.post('/billing/checkout', { plan: targetPlan });
      window.location.href = data.url;
    } catch (err) {
      alert(err.response?.data?.error || 'Could not process downgrade.');
      setBusy(false);
    }
  }

  async function connectStripe() {
    setConnectBusy(true);
    try {
      const { data } = await api.post('/billing/connect');
      window.location.href = data.url;
    } catch (err) {
      alert(err.response?.data?.error || 'Could not start Stripe onboarding.');
      setConnectBusy(false);
    }
  }

  async function openStripeDashboard() {
    setConnectBusy(true);
    try {
      const { data } = await api.post('/billing/connect/login');
      window.open(data.url, '_blank');
    } catch (err) {
      alert(err.response?.data?.error || 'Could not open Stripe dashboard.');
    } finally { setConnectBusy(false); }
  }

  async function openPortal() {
    setBusy(true);
    try {
      const { data } = await api.post('/billing/portal');
      window.location.href = data.url;
    } catch (err) {
      alert(err.response?.data?.error || 'Could not open billing portal.');
      setBusy(false);
    }
  }

  async function setDefaultPm(id) {
    try {
      await api.post(`/billing/payment-methods/${id}/default`);
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to set default.');
    }
  }

  async function removePm(id) {
    if (!confirm('Remove this payment method?')) return;
    try {
      await api.delete(`/billing/payment-methods/${id}`);
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to remove.');
    }
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--steel)', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>Loading billing…</div>;

  const currentPlan = billing?.plan || 'starter';
  const planStatus  = billing?.status || 'active';
  const currentIdx  = PLAN_ORDER.indexOf(currentPlan);
  const currentName = { starter: 'Free Trial', solo: 'Solo', pro: 'Pro', scale: 'Scale' }[currentPlan] || currentPlan;
  const sub         = billing?.subscription;
  const connect     = billing?.connect || { status: 'not_connected', account_id: null, platform_fee: 1 };

  const upgraded       = searchParams.get('upgraded')  === '1';
  const connectSuccess = searchParams.get('connect')   === 'success';
  const connectRefresh = searchParams.get('connect')   === 'refresh';

  const statusLabel = planStatus === 'trialing'  ? 'Trial'
                    : planStatus === 'past_due'   ? 'Past Due'
                    : planStatus === 'canceled'   ? 'Canceled'
                    : 'Active';
  const statusClass = (planStatus === 'active' || planStatus === 'trialing') ? 'js-active'
                    : planStatus === 'past_due' ? 'js-pending'
                    : 'js-cancelled';

  const tabs = [
    { key: 'plans',    label: 'Plans' },
    { key: 'payment',  label: 'Payment Methods' },
    { key: 'history',  label: 'Billing History' },
    { key: 'connect',  label: 'Stripe Connect' },
  ];

  return (
    <Elements stripe={stripePromise}>
      <div>
        {/* Alerts */}
        {upgraded && <div style={{ marginBottom: 16, padding: '12px 18px', background: 'rgba(46,160,67,.08)', border: '1px solid rgba(46,160,67,.25)', borderRadius: 8, fontSize: 13, color: 'var(--green)' }}>Plan upgraded successfully!</div>}
        {connectSuccess && <div style={{ marginBottom: 16, padding: '12px 18px', background: 'rgba(46,160,67,.08)', border: '1px solid rgba(46,160,67,.25)', borderRadius: 8, fontSize: 13, color: 'var(--green)' }}>Stripe onboarding submitted — verification takes a few minutes.</div>}
        {connectRefresh && <div style={{ marginBottom: 16, padding: '12px 18px', background: 'rgba(198,40,40,.06)', border: '1px solid rgba(198,40,40,.2)', borderRadius: 8, fontSize: 13, color: 'var(--red)' }}>Stripe onboarding link expired. Click "Continue Setup" to get a fresh link.</div>}
        {cancelledUntil && <div style={{ marginBottom: 16, padding: '12px 18px', background: 'rgba(46,160,67,.08)', border: '1px solid rgba(46,160,67,.25)', borderRadius: 8, fontSize: 13, color: 'var(--green)' }}>Subscription cancelled. You retain access until {fmtDate(cancelledUntil)}.</div>}

        {/* Current Plan Banner */}
        <div className="dash-card" style={{ marginBottom: 20 }}>
          <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--steel)', marginBottom: 6 }}>Current Plan</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: sub ? 10 : 0 }}>
                <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 28, color: 'var(--navy)', lineHeight: 1 }}>{currentName}</span>
                <span className={`dash-jbadge ${statusClass}`}>{statusLabel}</span>
              </div>
              {sub && (
                <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto', gap: '6px 24px', marginTop: 6 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Next Billing</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
                      {sub.cancel_at_period_end ? `Access ends ${fmtDate(sub.current_period_end)}` : fmtDate(sub.current_period_end)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Amount</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{fmt$(sub.amount)}/mo</div>
                  </div>
                  {billing?.paymentMethod && (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Payment Method</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
                        {billing.paymentMethod.type === 'card'
                          ? `${billing.paymentMethod.brand?.toUpperCase()} ···· ${billing.paymentMethod.last4}`
                          : `${billing.paymentMethod.bank_name} ···· ${billing.paymentMethod.last4}`}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            {billing?.hasSubscription && (
              <button className="btn-secondary" disabled={busy} onClick={openPortal} style={{ flexShrink: 0 }}>
                {busy ? '…' : 'Manage Billing →'}
              </button>
            )}
          </div>
          {planStatus === 'past_due' && (
            <div style={{ margin: '0 24px 20px', padding: '10px 14px', background: 'rgba(198,40,40,.06)', border: '1px solid rgba(198,40,40,.2)', borderRadius: 6, fontSize: 13, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 12 }}>
              Payment failed — update your payment method to restore full access.
              <button onClick={() => setTab('payment')} style={{ fontSize: 12, textDecoration: 'underline', background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', flexShrink: 0 }}>Update method →</button>
            </div>
          )}
          {sub?.cancel_at_period_end && (
            <div style={{ margin: '0 24px 20px', padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 13, color: '#92400e' }}>
              Cancellation scheduled — your plan ends on {fmtDate(sub.current_period_end)}.
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--lightgray)' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: '10px 20px', background: 'none', border: 'none', borderBottom: tab === t.key ? '2px solid var(--navy)' : '2px solid transparent', marginBottom: -2, fontSize: 13, fontWeight: tab === t.key ? 700 : 500, color: tab === t.key ? 'var(--navy)' : 'var(--steel)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── PLANS TAB ─────────────────────────────────────────────────────── */}
        {tab === 'plans' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
              {PLANS.map(plan => {
                const planIdx     = PLAN_ORDER.indexOf(plan.key);
                const isCurrent   = plan.key === currentPlan && !!billing?.hasSubscription;
                const isUpgrade   = !billing?.hasSubscription || planIdx > currentIdx;
                const isDowngrade = !!billing?.hasSubscription && planIdx < currentIdx;

                return (
                  <div key={plan.key} className="dash-card" style={{ position: 'relative', border: plan.highlight ? '2px solid var(--sand)' : '1px solid var(--lightgray)' }}>
                    {plan.highlight && (
                      <div style={{ position: 'absolute', top: -1, left: 20, background: 'var(--sand)', color: 'var(--navy)', fontSize: 9, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', padding: '2px 10px', borderRadius: '0 0 5px 5px' }}>Most Popular</div>
                    )}
                    <div style={{ padding: '28px 20px 20px' }}>
                      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--steel)', marginBottom: 10 }}>{plan.name}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                        <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 38, color: 'var(--navy)', lineHeight: 1 }}>${plan.price}</span>
                        <span style={{ fontSize: 12, color: 'var(--steel)' }}>/mo</span>
                      </div>
                      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--steel)', opacity: .7, marginBottom: 16, letterSpacing: '.04em' }}>{plan.target}</div>
                      <div style={{ borderTop: '1px solid var(--lightgray)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
                        {plan.features.map(f => <div key={f} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--slate)' }}><span style={{ color: 'var(--green)', fontWeight: 700, flexShrink: 0 }}>✓</span>{f}</div>)}
                        {plan.missing.map(f => <div key={f} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--lightgray)' }}><span style={{ flexShrink: 0 }}>—</span>{f}</div>)}
                      </div>

                      {isCurrent ? (
                        <button disabled style={{ width: '100%', padding: '10px 0', borderRadius: 6, border: '1px solid var(--lightgray)', background: 'none', color: 'var(--steel)', fontSize: 12 }}>Current Plan</button>
                      ) : isUpgrade ? (
                        <button disabled={busy} onClick={() => upgrade(plan.key)} style={{ width: '100%', padding: '10px 0', borderRadius: 6, border: 'none', background: 'var(--navy)', color: plan.highlight ? 'var(--sand)' : 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          {busy ? '…' : `Upgrade to ${plan.name} →`}
                        </button>
                      ) : (
                        <button disabled={busy} onClick={() => setDowngradeModal({ from: currentPlan, to: plan })} style={{ width: '100%', padding: '10px 0', borderRadius: 6, border: '1px solid var(--lightgray)', background: 'none', color: 'var(--slate)', fontSize: 12, cursor: 'pointer' }}>
                          {busy ? '…' : `Downgrade to ${plan.name}`}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Enterprise */}
            <div className="dash-card" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', gap: 20, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--steel)', marginBottom: 6 }}>Custom · Enterprise</div>
                <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 28, color: 'var(--navy)', lineHeight: 1, marginBottom: 4 }}>$300+<span style={{ fontSize: 14, color: 'var(--steel)' }}>/mo</span></div>
                <div style={{ fontSize: 12, color: 'var(--slate)', lineHeight: 1.6 }}>Unlimited phone numbers · Dedicated CSM · 99.9% SLA · Custom feature development · Negotiated processing rate</div>
              </div>
              <a href="mailto:info@getfieldcore.com?subject=Custom Plan Inquiry" style={{ flexShrink: 0, padding: '10px 24px', background: 'var(--navy)', color: 'var(--sand)', borderRadius: 6, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Contact Sales →</a>
            </div>

            {/* Cancel plan */}
            {billing?.hasSubscription && !sub?.cancel_at_period_end && (
              <div style={{ textAlign: 'center', marginTop: 8, marginBottom: 4 }}>
                <button onClick={() => setCancelModal(true)} style={{ fontSize: 12, color: 'var(--steel)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'Inter, sans-serif' }}>
                  Cancel my subscription
                </button>
              </div>
            )}
          </>
        )}

        {/* ── PAYMENT METHODS TAB ───────────────────────────────────────────── */}
        {tab === 'payment' && (
          <div className="dash-card" style={{ padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 20 }}>Payment Methods</div>

            {/* Saved methods */}
            {payMethods.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {payMethods.map(pm => (
                  <div key={pm.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', border: `1.5px solid ${pm.is_default ? 'var(--navy)' : 'var(--lightgray)'}`, borderRadius: 10, background: pm.is_default ? 'rgba(28,35,51,.02)' : 'white', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span>{pm.type === 'card' ? <CardIco /> : <BankIco />}</span>
                      <div>
                        {pm.type === 'card' ? (
                          <>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>{pm.brand?.charAt(0).toUpperCase() + pm.brand?.slice(1)} ···· {pm.last4}</div>
                            <div style={{ fontSize: 11, color: 'var(--steel)' }}>Expires {pm.exp_month}/{pm.exp_year}</div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>{pm.bank_name} ···· {pm.last4}</div>
                            <div style={{ fontSize: 11, color: pm.status === 'verified' ? 'var(--green)' : 'var(--steel)' }}>
                              {pm.status === 'verified' ? '✓ Verified' : pm.status === 'new' ? 'Pending verification' : pm.status}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {pm.is_default && <span className="dash-jbadge js-active">Default</span>}
                      {!pm.is_default && (
                        <button onClick={() => setDefaultPm(pm.id)} style={{ fontSize: 12, color: 'var(--steel)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Set default</button>
                      )}
                      <button onClick={() => removePm(pm.id)} style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '20px 0', color: 'var(--steel)', fontSize: 13, marginBottom: 24 }}>No payment methods saved yet.</div>
            )}

            {/* Add card */}
            {addCard ? (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 14 }}>Add Credit / Debit Card</div>
                <CardSetupForm onSuccess={() => { setAddCard(false); load(); }} onCancel={() => setAddCard(false)} />
              </div>
            ) : addBank ? (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 14 }}>Add Bank Account (ACH)</div>
                <BankForm onSuccess={() => { setAddBank(false); load(); }} onCancel={() => setAddBank(false)} />
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setAddCard(true)} className="btn-primary" style={{ fontSize: 13 }}>+ Add Card</button>
                <button onClick={() => setAddBank(true)} className="btn-secondary" style={{ fontSize: 13 }}>+ Add Bank Account</button>
              </div>
            )}

            <div style={{ marginTop: 20, padding: '12px 16px', background: '#f9f7f3', borderRadius: 8, fontSize: 12, color: 'var(--steel)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 13, height: 13, display: 'inline', verticalAlign: 'middle', marginRight: 5 }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Card and bank data is never stored in FieldCore's database — all payment information is handled securely through Stripe.
            </div>
          </div>
        )}

        {/* ── BILLING HISTORY TAB ───────────────────────────────────────────── */}
        {tab === 'history' && (
          <div className="dash-card" style={{ padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 20 }}>Billing History</div>
            {history.length === 0 ? (
              <div style={{ color: 'var(--steel)', fontSize: 13, padding: '20px 0' }}>No billing history yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--lightgray)' }}>
                    {['Date', 'Description', 'Amount', 'Status', 'Receipt'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontFamily: 'DM Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--steel)', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((ev, i) => (
                    <tr key={ev.id || i} style={{ borderBottom: '1px solid var(--lightgray)' }}>
                      <td style={{ padding: '12px', color: 'var(--slate)' }}>{fmtDate(ev.created_at)}</td>
                      <td style={{ padding: '12px', color: 'var(--navy)', fontWeight: 500 }}>
                        {ev.description || 'Subscription'}
                        {ev.period_start && ev.period_end && (
                          <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 2 }}>{fmtDate(ev.period_start)} – {fmtDate(ev.period_end)}</div>
                        )}
                      </td>
                      <td style={{ padding: '12px', color: 'var(--navy)', fontWeight: 700 }}>{fmt$(ev.amount)}</td>
                      <td style={{ padding: '12px' }}>
                        <span className={`dash-jbadge ${ev.status === 'paid' ? 'js-done' : ev.status === 'failed' ? 'js-noshow' : 'js-pending'}`}>
                          {ev.status === 'paid' ? 'Paid' : ev.status === 'failed' ? 'Failed' : ev.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        {ev.invoice_pdf_url ? (
                          <a href={ev.invoice_pdf_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--navy)', textDecoration: 'underline' }}>PDF</a>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── STRIPE CONNECT TAB ────────────────────────────────────────────── */}
        {tab === 'connect' && (
          <div className="dash-card" style={{ padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>Stripe Connect</div>
            <div style={{ fontSize: 13, color: 'var(--steel)', lineHeight: 1.6, marginBottom: 24, maxWidth: 540 }}>
              Connect your bank account so invoice payments and booking deposits go directly to you. FieldCore collects a <strong style={{ color: 'var(--navy)' }}>{connect.platform_fee}% platform fee</strong> per transaction.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {connect.status === 'not_connected' && (
                <>
                  <button onClick={connectStripe} disabled={connectBusy} style={{ padding: '12px 24px', background: '#635BFF', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: connectBusy ? 'wait' : 'pointer', width: 'fit-content' }}>
                    {connectBusy ? '…' : 'Connect with Stripe →'}
                  </button>
                  <div style={{ padding: '12px 16px', background: '#f9f7f3', borderRadius: 8, fontSize: 12, color: 'var(--steel)', lineHeight: 1.6, maxWidth: 480 }}>
                    Without Connect, payments are collected by FieldCore and require manual transfer. Takes ~5 minutes via Stripe's hosted onboarding.
                  </div>
                </>
              )}
              {connect.status === 'pending' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="dash-jbadge js-pending">Verification Pending</span>
                  <button onClick={connectStripe} disabled={connectBusy} style={{ padding: '10px 20px', background: 'var(--navy)', color: 'var(--sand)', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: connectBusy ? 'wait' : 'pointer' }}>
                    {connectBusy ? '…' : 'Continue Setup →'}
                  </button>
                </div>
              )}
              {connect.status === 'active' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="dash-jbadge js-active">Active</span>
                  <button onClick={openStripeDashboard} disabled={connectBusy} className="btn-secondary">{connectBusy ? '…' : 'Stripe Dashboard →'}</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 20, padding: '14px 20px', fontSize: 12, color: 'var(--steel)', fontFamily: 'DM Mono, monospace', textAlign: 'center' }}>
          All plans include a 14-day free trial. Cancel anytime. Billing managed securely via Stripe.
        </div>

        {/* Modals */}
        {cancelModal && <CancelModal onClose={() => setCancelModal(false)} onConfirmed={date => { setCancelModal(false); setCancelledUntil(date); load(); }} />}
        {downgradeModal && (
          <DowngradeModal
            from={downgradeModal.from}
            to={downgradeModal.to}
            periodEnd={sub?.current_period_end}
            onClose={() => setDowngradeModal(null)}
            onConfirm={() => doDowngrade(downgradeModal.to.key)}
          />
        )}
      </div>
    </Elements>
  );
}
