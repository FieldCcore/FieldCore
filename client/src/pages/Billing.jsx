import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Mail, Phone } from 'lucide-react';
import api from '../api';
import StatusBadge from '../components/StatusBadge';

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

const PLAN_ORDER = ['starter', 'solo', 'pro', 'scale', 'enterprise'];
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
function fmtCents(n, currency = 'usd') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format((n || 0) / 100);
}
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

const SUPPORT_EMAIL = 'support@getfieldcore.com';
const SUPPORT_PHONE = '(888) 430-2777';

// ── Downgrade Modal — routes through support ──────────────────────────────────
function DowngradeModal({ from, to, onClose }) {
  const lost = to ? (PLAN_FEATURES[to.key] || []) : [];
  const toName = to?.name || 'a lower plan';
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
      <div style={{ background: 'white', borderRadius: 12, padding: 32, maxWidth: 460, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>Downgrade to {toName}</div>
        <div style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 20, lineHeight: 1.7 }}>
          To downgrade your FieldCore plan, please contact support so we can help adjust your account without interrupting your service, active entities, phone numbers, billing, or payment routing.
        </div>

        {lost.length > 0 && (
          <div style={{ marginBottom: 20, padding: '14px 16px', background: '#fef9f0', border: '1px solid #fde68a', borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>Features that change on {toName}</div>
            {lost.map(f => (
              <div key={f} style={{ display: 'flex', gap: 8, fontSize: 12, color: '#78350f', marginBottom: 3 }}>
                <span style={{ flexShrink: 0 }}>·</span> {f}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=Downgrade Request&body=Hi FieldCore team,%0A%0AI'd like to downgrade my plan. Please let me know the next steps.%0A%0AThanks`}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: 'var(--off)', border: '1.5px solid var(--lightgray)', borderRadius: 10, textDecoration: 'none', color: 'var(--navy)', fontWeight: 600, fontSize: 14, transition: 'border-color .15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--sand)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--lightgray)'}
          >
            <div style={{ width: 38, height: 38, borderRadius: 8, background: 'var(--offwhite)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Mail size={16} style={{ color: 'var(--slate)' }} strokeWidth={1.8} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>Email Support</div>
              <div style={{ fontSize: 12, color: 'var(--steel)', fontWeight: 400 }}>{SUPPORT_EMAIL}</div>
            </div>
          </a>
          <a
            href={`tel:${SUPPORT_PHONE.replace(/\D/g, '')}`}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: 'var(--off)', border: '1.5px solid var(--lightgray)', borderRadius: 10, textDecoration: 'none', color: 'var(--navy)', fontWeight: 600, fontSize: 14, transition: 'border-color .15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--sand)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--lightgray)'}
          >
            <div style={{ width: 38, height: 38, borderRadius: 8, background: 'var(--offwhite)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Phone size={16} style={{ color: 'var(--slate)' }} strokeWidth={1.8} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>Call Support</div>
              <div style={{ fontSize: 12, color: 'var(--steel)', fontWeight: 400 }}>{SUPPORT_PHONE}</div>
            </div>
          </a>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 13 }}>Close</button>
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
  const [upgradingPlan, setUpgradingPlan] = useState(null);
  const [upgradeError,  setUpgradeError]  = useState('');
  const [connectBusy,  setConnectBusy]  = useState(false);
  const [tab,          setTab]          = useState('plans');
  const [addCard,      setAddCard]      = useState(false);
  const [addBank,      setAddBank]      = useState(false);
  const [cancelModal,  setCancelModal]  = useState(false);
  const [cancelledUntil, setCancelledUntil] = useState(null);
  const [downgradeModal, setDowngradeModal] = useState(null); // { from, to }
  const [payoutSchedule, setPayoutSchedule] = useState('daily');
  const [payoutScheduleSaving, setPayoutScheduleSaving] = useState(false);
  const [payoutScheduleSaved, setPayoutScheduleSaved] = useState(false);
  const [connectEmbedActive, setConnectEmbedActive] = useState(false);
  const [connectEmbedError,  setConnectEmbedError]  = useState('');
  const [connectError,       setConnectError]        = useState('');
  const [connectDash,        setConnectDash]        = useState(null);
  const [connectDashLoading, setConnectDashLoading] = useState(false);
  const [connectDashError,   setConnectDashError]   = useState('');
  const connectInstanceRef  = useRef(null);
  const connectContainerRef = useRef(null);

  const loadConnectDash = useCallback(async () => {
    setConnectDashLoading(true);
    setConnectDashError('');
    try {
      const { data } = await api.get('/billing/connect/dashboard');
      setConnectDash(data);
    } catch (err) {
      setConnectDashError(err.response?.data?.error || 'Could not load payout dashboard.');
    } finally {
      setConnectDashLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    const [billingRes, methodsRes, historyRes] = await Promise.allSettled([
      api.get('/billing'),
      api.get('/billing/payment-methods'),
      api.get('/billing/history'),
    ]);
    if (billingRes.status === 'fulfilled') {
      const d = billingRes.value.data;
      setBilling(d);
      if (d?.connect?.status === 'active') {
        api.get('/billing/connect/payout-schedule').then(r => {
          if (r.data?.interval) setPayoutSchedule(r.data.interval);
        }).catch(() => {});
      }
    }
    if (methodsRes.status === 'fulfilled') setPayMethods(methodsRes.value.data);
    if (historyRes.status === 'fulfilled') setHistory(historyRes.value.data);
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  useEffect(() => {
    if (tab === 'connect') loadConnectDash();
  }, [tab, loadConnectDash]);

  useEffect(() => {
    if (!connectEmbedActive || !connectContainerRef.current || !connectInstanceRef.current) return;
    const component = connectInstanceRef.current.create('account-onboarding');
    component.setOnExit(() => {
      setConnectEmbedActive(false);
      connectInstanceRef.current = null;
      load();
      loadConnectDash();
    });
    connectContainerRef.current.appendChild(component);
    return () => { try { component.remove(); } catch (e) {} };
  }, [connectEmbedActive, load, loadConnectDash]);

  async function upgrade(plan) {
    setUpgradingPlan(plan);
    setUpgradeError('');
    try {
      const { data } = await api.post('/billing/checkout', { plan });
      window.location.href = data.url;
    } catch (err) {
      setUpgradeError(err.response?.data?.error || 'Could not start checkout.');
      setUpgradingPlan(null);
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

  async function startEmbeddedOnboarding() {
    setConnectBusy(true);
    setConnectEmbedError('');
    try {
      const { data: initData } = await api.post('/billing/connect/account-session');
      const clientSecret = initData.client_secret;
      const backendKeyMode = initData.key_mode;

      const pk = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
      const frontendKeyMode = pk.startsWith('pk_test') ? 'test'
                            : pk.startsWith('pk_live') ? 'live'
                            : 'unknown';

      console.log('=== CONNECT FRONTEND START ===');
      console.log({
        hasPublishableKey: !!pk,
        publishableKeyMode: frontendKeyMode,
        backendKeyMode,
        hasClientSecret: !!clientSecret,
      });

      if (!pk) {
        const msg = 'VITE_STRIPE_PUBLISHABLE_KEY is not set in Vercel environment variables.';
        console.error(msg);
        setConnectEmbedError(msg);
        return;
      }

      if (backendKeyMode !== 'unknown' && frontendKeyMode !== 'unknown' && backendKeyMode !== frontendKeyMode) {
        const mismatch = `Stripe key mode mismatch: backend is ${backendKeyMode}, frontend is ${frontendKeyMode}. Both must be test or both must be live.`;
        console.error(mismatch);
        setConnectEmbedError(mismatch);
        return;
      }

      if (!clientSecret) {
        setConnectEmbedError('Stripe did not return a session secret. Check Railway logs.');
        return;
      }

      const { loadConnectAndInitialize } = await import('@stripe/connect-js');
      const instance = loadConnectAndInitialize({
        publishableKey: pk,
        fetchClientSecret: async () => {
          const { data } = await api.post('/billing/connect/account-session');
          return data.client_secret;
        },
        appearance: {
          variables: { fontFamily: 'Inter, sans-serif', colorPrimary: '#1C2333' },
        },
      });
      connectInstanceRef.current = instance;
      setConnectEmbedActive(true);
    } catch (err) {
      const backendMsg = err.response?.data?.error;
      const backendCode = err.response?.data?.code;
      const backendType = err.response?.data?.type;
      const display = [backendMsg, backendCode, backendType].filter(Boolean).join(' — ') || err.message || 'Could not start Stripe onboarding.';
      console.error('=== CONNECT FRONTEND ERROR ===', { backendMsg, backendCode, backendType, httpStatus: err.response?.status });
      setConnectEmbedError(display);
    } finally {
      setConnectBusy(false);
    }
  }

  async function openStripeDashboard() {
    setConnectBusy(true);
    setConnectError('');
    try {
      const { data } = await api.post('/billing/connect/login');
      window.open(data.url, '_blank');
    } catch (err) {
      setConnectError(err.response?.data?.error || 'Could not open Stripe dashboard.');
    } finally { setConnectBusy(false); }
  }

  async function openLoginLink() {
    setConnectBusy(true);
    setConnectError('');
    try {
      const { data } = await api.post('/billing/connect/login-link');
      if (data.test_mode) {
        alert('Login links are not available in Stripe test mode. Use dashboard.stripe.com directly.');
        return;
      }
      window.open(data.url, '_blank');
    } catch (err) {
      setConnectError(err.response?.data?.error || 'Could not open Stripe dashboard.');
    } finally { setConnectBusy(false); }
  }

  async function savePayoutSchedule(interval) {
    setPayoutScheduleSaving(true);
    setPayoutScheduleSaved(false);
    try {
      await api.post('/billing/connect/payout-schedule', { interval });
      setPayoutSchedule(interval);
      setPayoutScheduleSaved(true);
      setTimeout(() => setPayoutScheduleSaved(false), 3000);
    } catch (err) {
      setConnectError(err.response?.data?.error || 'Could not update payout schedule.');
    } finally {
      setPayoutScheduleSaving(false);
    }
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
  const currentName = { starter: 'Free Trial', solo: 'Solo', pro: 'Pro', scale: 'Scale', enterprise: 'Enterprise' }[currentPlan] || currentPlan;
  const sub         = billing?.subscription;
  const connect     = billing?.connect || { status: 'not_connected', account_id: null, platform_fee: 1 };

  const connectStatus              = connectDash?.status || connect.status || 'not_connected';
  const connectIsActive            = connectStatus === 'active';
  const connectIsConnected         = connectDash?.connected ?? false;
  const connectDetailsSubmitted    = connectDash?.details_submitted ?? false;
  const connectCurrentlyDue        = connectDash?.requirements?.currently_due || [];
  const connectPastDue             = connectDash?.requirements?.past_due || [];
  const connectDisabledReason      = connectDash?.requirements?.disabled_reason || null;
  // User needs to take action: not yet submitted, or has requirements blocking them
  const connectNeedsUserAction     = !connectIsConnected || !connectDetailsSubmitted
    || connectCurrentlyDue.length > 0 || connectPastDue.length > 0;
  // Submitted and waiting — user can't do anything more
  const connectAwaitingVerification = connectIsConnected && connectDetailsSubmitted
    && !connectIsActive && !connectNeedsUserAction;

  const isEnterpriseCurrentPlan = currentPlan === 'enterprise';

  // Shared base style for all plan CTA buttons — only color/state properties differ
  const planBtn = {
    width: '100%', height: '44px', minHeight: '44px',
    padding: '0 20px', borderRadius: 10,
    fontSize: 14, fontWeight: 600, lineHeight: 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: 8, fontFamily: 'Inter, sans-serif', boxSizing: 'border-box',
  };

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
                <StatusBadge status={planStatus}>{statusLabel}</StatusBadge>
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
            <div style={{ display: 'flex', gap: 10, flexShrink: 0, alignItems: 'center' }}>
              <button
                onClick={() => setDowngradeModal({ from: currentPlan, to: null })}
                style={{ fontSize: 12, color: 'var(--steel)', background: 'none', border: '1px solid var(--lightgray)', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}
              >
                Request Downgrade
              </button>
              {billing?.hasSubscription && (
                <button className="btn-secondary" disabled={busy} onClick={openPortal} style={{ flexShrink: 0 }}>
                  {busy ? '…' : 'Manage Billing →'}
                </button>
              )}
            </div>
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
            {upgradeError && (
              <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(198,40,40,.06)', border: '1px solid rgba(198,40,40,.2)', borderRadius: 6, fontSize: 13, color: 'var(--red)' }}>
                {upgradeError}
              </div>
            )}
            <div className="billing-plans-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16, alignItems: 'stretch' }}>
              {PLANS.map(plan => {
                const planIdx     = PLAN_ORDER.indexOf(plan.key);
                const isCurrent   = plan.key === currentPlan;
                const isUpgrade   = !isCurrent && planIdx > currentIdx;
                const isDowngrade = !isCurrent && planIdx < currentIdx;
                const isUpgradingThis = upgradingPlan === plan.key;

                return (
                  <div key={plan.key} className="dash-card" style={{
                    position: 'relative',
                    display: 'flex', flexDirection: 'column',
                    border: isCurrent ? '2px solid var(--green)' : '1px solid var(--lightgray)',
                    background: isCurrent ? 'rgba(46,125,50,.03)' : 'var(--white)',
                    boxShadow: isCurrent ? '0 0 0 3px rgba(46,125,50,.08)' : undefined,
                  }}>
                    {plan.highlight && !isCurrent && (
                      <div style={{ position: 'absolute', top: -1, left: 18, background: 'var(--sand)', color: 'var(--navy)', fontSize: 8.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', padding: '2px 9px', borderRadius: '0 0 5px 5px' }}>Most Popular</div>
                    )}
                    <div style={{ padding: (isCurrent || plan.highlight) ? '28px 20px 20px' : '20px 20px 20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--steel)' }}>{plan.name}</div>
                        {isCurrent && (
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'var(--green-lt)', color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.06em', flexShrink: 0 }}>Active</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                        <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 38, color: 'var(--navy)', lineHeight: 1 }}>${plan.price}</span>
                        <span style={{ fontSize: 12, color: 'var(--steel)' }}>/mo</span>
                      </div>
                      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--steel)', opacity: .7, marginBottom: 16, letterSpacing: '.04em' }}>{plan.target}</div>
                      <div style={{ borderTop: '1px solid var(--lightgray)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {plan.features.map(f => <div key={f} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--slate)' }}><span style={{ color: 'var(--green)', fontWeight: 700, flexShrink: 0 }}>✓</span>{f}</div>)}
                        {plan.missing.map(f => <div key={f} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--lightgray)' }}><span style={{ flexShrink: 0 }}>—</span>{f}</div>)}
                      </div>

                      <div style={{ marginTop: 'auto', paddingTop: 20 }}>
                        {isCurrent ? (
                          <button disabled style={{ ...planBtn, border: 'none', background: 'var(--green)', color: 'white', cursor: 'default', opacity: .85 }}>✓ Current Plan</button>
                        ) : isUpgrade ? (
                          <button
                            disabled={upgradingPlan !== null}
                            onClick={() => upgrade(plan.key)}
                            style={{ ...planBtn, border: 'none', background: 'var(--navy)', color: 'white', cursor: upgradingPlan !== null ? 'wait' : 'pointer' }}
                          >
                            {isUpgradingThis ? '…' : `Upgrade to ${plan.name} →`}
                          </button>
                        ) : isDowngrade ? (
                          <button
                            onClick={() => setDowngradeModal({ from: currentPlan, to: plan })}
                            style={{ ...planBtn, border: '1px solid var(--lightgray)', background: 'none', color: 'var(--slate)', cursor: 'pointer' }}
                          >
                            Request Downgrade
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Enterprise / Custom */}
            <div className="dash-card" style={{
              marginBottom: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '20px 24px', gap: 20, flexWrap: 'wrap',
              border: isEnterpriseCurrentPlan ? '2px solid var(--green)' : '1px solid var(--lightgray)',
              background: isEnterpriseCurrentPlan ? 'rgba(46,125,50,.03)' : undefined,
              boxShadow: isEnterpriseCurrentPlan ? '0 0 0 3px rgba(46,125,50,.08)' : undefined,
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--steel)' }}>Custom · Enterprise</div>
                  {isEnterpriseCurrentPlan && (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'var(--green-lt)', color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Active</span>
                  )}
                </div>
                <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 28, color: 'var(--navy)', lineHeight: 1, marginBottom: 4 }}>$300+<span style={{ fontSize: 14, color: 'var(--steel)' }}>/mo</span></div>
                <div style={{ fontSize: 12, color: 'var(--slate)', lineHeight: 1.6 }}>Unlimited phone numbers · Dedicated CSM · 99.9% SLA · Custom feature development · Negotiated processing rate</div>
              </div>
              {isEnterpriseCurrentPlan ? (
                <button disabled style={{ ...planBtn, width: 'auto', border: 'none', background: 'var(--green)', color: 'white', cursor: 'default', opacity: .85, flexShrink: 0 }}>
                  ✓ Current Plan
                </button>
              ) : (
                <a
                  href="mailto:info@getfieldcore.com?subject=Custom Plan Inquiry"
                  style={{ ...planBtn, width: 'auto', border: 'none', background: 'var(--sand)', color: 'var(--navy)', textDecoration: 'none', flexShrink: 0 }}
                >
                  Contact Sales →
                </a>
              )}
            </div>

            {/* Downgrade / Cancel */}
            {billing?.hasSubscription && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginTop: 12, marginBottom: 4 }}>
                <button
                  onClick={() => setDowngradeModal({ from: currentPlan, to: null })}
                  style={{ fontSize: 12, color: 'var(--steel)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'Inter, sans-serif' }}
                >
                  Request Downgrade
                </button>
                {!sub?.cancel_at_period_end && (
                  <button onClick={() => setCancelModal(true)} style={{ fontSize: 12, color: 'var(--steel)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'Inter, sans-serif' }}>
                    Cancel my subscription
                  </button>
                )}
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
                      {pm.is_default && <StatusBadge status="active">Default</StatusBadge>}
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
                        <StatusBadge status={ev.status}>
                          {ev.status === 'paid' ? 'Paid' : ev.status === 'failed' ? 'Failed' : ev.status}
                        </StatusBadge>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* 1 — Header card: title, status badge, primary action */}
            <div className="dash-card" style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>Direct Payouts</div>
                  <div style={{ fontSize: 13, color: 'var(--steel)', lineHeight: 1.6, maxWidth: 520 }}>
                    Invoice payments and booking deposits route directly to your bank via Stripe Connect.{' '}
                    FieldCore collects a <strong style={{ color: 'var(--navy)' }}>{connect.platform_fee}% platform fee</strong> per transaction.
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
                  <StatusBadge status={
                    connectIsActive ? 'active'
                    : connectAwaitingVerification ? 'verification pending'
                    : connectIsConnected ? 'incomplete'
                    : 'not connected'
                  } />
                  {/* Only show Setup button when user actually has action to take */}
                  {!connectEmbedActive && !connectIsActive && !connectAwaitingVerification && (
                    <button onClick={startEmbeddedOnboarding} disabled={connectBusy}
                      style={{ background: 'var(--navy)', color: 'white', border: 'none', borderRadius: 10, height: 44, padding: '0 20px', fontSize: 14, fontWeight: 600, cursor: connectBusy ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
                      {connectBusy ? 'Loading…' : connectIsConnected ? 'Continue Setup →' : 'Connect with Stripe →'}
                    </button>
                  )}
                  {connectIsActive && !connectEmbedActive && (
                    <button onClick={openLoginLink} disabled={connectBusy}
                      style={{ background: 'var(--navy)', color: 'white', border: 'none', borderRadius: 10, height: 44, padding: '0 20px', fontSize: 14, fontWeight: 600, cursor: connectBusy ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
                      {connectBusy ? '…' : 'Stripe Dashboard →'}
                    </button>
                  )}
                </div>
              </div>

              {/* Awaiting verification — user done, Stripe reviewing */}
              {connectAwaitingVerification && !connectEmbedActive && (
                <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 8, fontSize: 13, color: '#92400e', lineHeight: 1.6 }}>
                  Your information has been submitted. Stripe is reviewing your account — payouts activate automatically once verified, usually within minutes. No further action needed.
                </div>
              )}

              {/* disabled_reason if Stripe blocked the account */}
              {connectDisabledReason && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(198,40,40,.06)', border: '1px solid rgba(198,40,40,.2)', borderRadius: 8, fontSize: 13, color: 'var(--red)' }}>
                  <strong>Stripe disabled reason:</strong> {connectDisabledReason}
                </div>
              )}

              {(connectEmbedError || connectError) && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(198,40,40,.06)', border: '1px solid rgba(198,40,40,.2)', borderRadius: 8, fontSize: 13, color: 'var(--red)' }}>
                  {connectEmbedError || connectError}
                </div>
              )}

              {/* Stripe embedded onboarding mounts here */}
              {connectEmbedActive && (
                <div ref={connectContainerRef} style={{ marginTop: 16 }} />
              )}

              {/* Not-connected explainer steps */}
              {!connectIsConnected && !connectEmbedActive && (
                <div className="billing-steps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 18 }}>
                  {[
                    { step: '1', label: 'Click Connect', desc: "Stripe's secure onboarding loads right here — no redirect needed" },
                    { step: '2', label: 'Enter Bank Info', desc: 'Routing + account number entered on Stripe — FieldCore never sees it' },
                    { step: '3', label: 'Payouts Go Live', desc: 'Stripe verifies your account, usually within minutes' },
                  ].map(s => (
                    <div key={s.step} style={{ padding: '12px 14px', background: 'var(--off)', borderRadius: 8 }}>
                      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, fontWeight: 700, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Step {s.step}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 3 }}>{s.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--steel)', lineHeight: 1.5 }}>{s.desc}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Dashboard loading / error */}
            {connectDashLoading && (
              <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--steel)', fontSize: 13 }}>Loading payout dashboard…</div>
            )}
            {connectDashError && !connectDashLoading && (
              <div style={{ padding: '10px 14px', background: 'rgba(198,40,40,.06)', border: '1px solid rgba(198,40,40,.2)', borderRadius: 8, fontSize: 13, color: 'var(--red)' }}>
                {connectDashError}
              </div>
            )}

            {/* 2 — Balance summary (active only) */}
            {connectIsActive && connectDash?.balance && (() => {
              const avail = connectDash.balance.available?.find(b => b.currency === 'usd') || connectDash.balance.available?.[0];
              const pend  = connectDash.balance.pending?.find(b => b.currency === 'usd')   || connectDash.balance.pending?.[0];
              const next  = connectDash.payouts?.[0];
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {[
                    { label: 'Available Balance', value: avail ? fmtCents(avail.amount, avail.currency) : '—', sub: 'Ready to pay out' },
                    { label: 'Pending Balance',   value: pend  ? fmtCents(pend.amount,  pend.currency)  : '—', sub: 'Processing' },
                    { label: 'Next Payout',       value: next  ? fmtCents(next.amount,  next.currency)  : '—', sub: next ? fmtDate(next.arrival_date) : 'No upcoming payouts' },
                  ].map(card => (
                    <div key={card.label} className="dash-card" style={{ padding: '16px 20px' }}>
                      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--steel)', marginBottom: 8 }}>{card.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>{card.value}</div>
                      <div style={{ fontSize: 11, color: 'var(--steel)' }}>{card.sub}</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* 3 — Recent payouts table (active + has payouts) */}
            {connectIsActive && connectDash?.payouts?.length > 0 && (
              <div className="dash-card" style={{ padding: '20px 24px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 14 }}>Recent Payouts</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid var(--lightgray)' }}>
                      {['Date', 'Amount', 'Status', 'Arrival'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '0 12px 8px 0', fontFamily: 'DM Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--steel)', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {connectDash.payouts.map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--lightgray)' }}>
                        <td style={{ padding: '10px 12px 10px 0', color: 'var(--slate)', fontSize: 13 }}>{fmtDate(p.created)}</td>
                        <td style={{ padding: '10px 12px 10px 0', color: 'var(--navy)', fontWeight: 700, fontSize: 13 }}>{fmtCents(p.amount, p.currency)}</td>
                        <td style={{ padding: '10px 12px 10px 0' }}>
                          <StatusBadge status={p.status}>{p.status === 'paid' ? 'Paid' : p.status === 'in_transit' ? 'In Transit' : p.status}</StatusBadge>
                        </td>
                        <td style={{ padding: '10px 12px 10px 0', color: 'var(--slate)', fontSize: 13 }}>{fmtDate(p.arrival_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 4 — Connected bank account (active + has bank) */}
            {connectIsActive && connectDash?.bank_account && (
              <div className="dash-card" style={{ padding: '20px 24px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 14 }}>Connected Bank Account</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--off)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <BankIco />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>{connectDash.bank_account.bank_name || 'Bank Account'}</div>
                    <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>
                      •••• {connectDash.bank_account.last4} · {(connectDash.bank_account.currency || 'usd').toUpperCase()}
                    </div>
                  </div>
                  <button onClick={openLoginLink} disabled={connectBusy}
                    style={{ marginLeft: 'auto', padding: '8px 16px', background: 'transparent', border: '1.5px solid var(--lightgray)', borderRadius: 8, fontSize: 12, fontWeight: 600, color: 'var(--navy)', cursor: 'pointer' }}>
                    Update in Stripe →
                  </button>
                </div>
              </div>
            )}

            {/* 5 — Verification requirements (when there are items due) */}
            {connectDash?.requirements && (
              connectPastDue.length > 0 || connectCurrentlyDue.length > 0
            ) && (
              <div className="dash-card" style={{ padding: '20px 24px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 12 }}>Verification Required</div>
                {connectPastDue.length > 0 && (
                  <div style={{ padding: '12px 14px', background: 'rgba(198,40,40,.05)', border: '1px solid rgba(198,40,40,.15)', borderRadius: 8, marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#C62828', marginBottom: 6 }}>Past Due — Payouts Blocked</div>
                    {connectPastDue.map(r => (
                      <div key={r} style={{ display: 'flex', gap: 8, fontSize: 12, color: '#C62828', marginTop: 4 }}>
                        <span>•</span><span style={{ fontFamily: 'DM Mono, monospace' }}>{r}</span>
                      </div>
                    ))}
                  </div>
                )}
                {connectCurrentlyDue.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)', marginBottom: 8 }}>Currently Due</div>
                    {connectCurrentlyDue.map(r => (
                      <div key={r} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--slate)', marginTop: 4 }}>
                        <span>•</span><span style={{ fontFamily: 'DM Mono, monospace' }}>{r}</span>
                      </div>
                    ))}
                    <button onClick={startEmbeddedOnboarding} disabled={connectBusy}
                      style={{ marginTop: 14, background: 'var(--navy)', color: 'white', border: 'none', borderRadius: 10, height: 44, padding: '0 20px', fontSize: 14, fontWeight: 600, cursor: connectBusy ? 'wait' : 'pointer' }}>
                      {connectBusy ? 'Loading…' : 'Complete Verification →'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 6 — Payout schedule + connection health (active only) */}
            {connectIsActive && (
              <div className="dash-card" style={{ padding: '20px 24px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>Payout Schedule</div>
                <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 14, lineHeight: 1.6 }}>
                  How often Stripe sends your available balance to your bank. Daily is fastest; Manual means you initiate each payout from Stripe.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <select value={payoutSchedule} onChange={e => setPayoutSchedule(e.target.value)}
                    style={{ padding: '9px 12px', border: '1.5px solid var(--lightgray)', borderRadius: 8, fontSize: 13, color: 'var(--navy)', background: 'white', fontFamily: 'Inter, sans-serif', cursor: 'pointer' }}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="manual">Manual</option>
                  </select>
                  <button onClick={() => savePayoutSchedule(payoutSchedule)} disabled={payoutScheduleSaving}
                    style={{ padding: '9px 18px', background: 'var(--navy)', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: payoutScheduleSaving ? 'wait' : 'pointer' }}>
                    {payoutScheduleSaving ? 'Saving…' : 'Save'}
                  </button>
                  {payoutScheduleSaved && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>✓ Saved</span>}
                </div>
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--lightgray)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--slate)' }}>Stripe Connect active</span>
                  {connectDash?.account_id && (
                    <span style={{ marginLeft: 'auto', fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--steel)' }}>{connectDash.account_id}</span>
                  )}
                </div>
              </div>
            )}
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
