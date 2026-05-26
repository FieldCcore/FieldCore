import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api';

const PLANS = [
  {
    key:     'starter',
    name:    'Starter',
    price:   0,
    caption: 'Free forever',
    features: [
      '2 team members',
      '50 jobs / month',
      'Booking widget',
      'Client database',
      'Invoicing',
    ],
    missing: [
      'SMS notifications',
      'Deposit protection',
      'Revenue analytics',
      'Multi-entity access',
      'Priority support',
    ],
  },
  {
    key:       'growth',
    name:      'Growth',
    price:     49,
    caption:   'per month',
    highlight: true,
    features: [
      '10 team members',
      'Unlimited jobs',
      'Booking widget',
      'Client database',
      'Invoicing',
      'SMS notifications',
      'Deposit protection',
      'Revenue analytics',
    ],
    missing: [
      'Multi-entity access',
      'Priority support',
    ],
  },
  {
    key:     'scale',
    name:    'Scale',
    price:   99,
    caption: 'per month',
    features: [
      'Unlimited team members',
      'Unlimited jobs',
      'Booking widget',
      'Client database',
      'Invoicing',
      'SMS notifications',
      'Deposit protection',
      'Revenue analytics',
      'Multi-entity access',
      'Priority support',
    ],
    missing: [],
  },
];

const PLAN_ORDER = ['starter', 'growth', 'scale'];

export default function Billing() {
  const [searchParams] = useSearchParams();
  const [billing,      setBilling]      = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [busy,         setBusy]         = useState(false);
  const [connectBusy,  setConnectBusy]  = useState(false);

  function load() {
    return api.get('/billing')
      .then(r => setBilling(r.data))
      .catch(() => {});
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

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
    } finally {
      setConnectBusy(false);
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

  if (loading) return (
    <div style={{ padding: 40, color: 'var(--steel)', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>
      Loading billing…
    </div>
  );

  const currentPlan = billing?.plan   || 'starter';
  const planStatus  = billing?.status || 'active';
  const currentIdx  = PLAN_ORDER.indexOf(currentPlan);

  const statusLabel = planStatus === 'trialing'  ? 'Trial'
                    : planStatus === 'past_due'   ? 'Past Due'
                    : planStatus === 'canceled'   ? 'Canceled'
                    : 'Active';
  const statusClass = (planStatus === 'active' || planStatus === 'trialing') ? 'js-active'
                    : planStatus === 'past_due' ? 'js-pending'
                    : 'js-cancelled';

  const upgraded       = searchParams.get('upgraded')      === '1';
  const connectSuccess = searchParams.get('connect')        === 'success';
  const connectRefresh = searchParams.get('connect')        === 'refresh';
  const connect        = billing?.connect || { status: 'not_connected', account_id: null, platform_fee: 1 };

  return (
    <div>
      {upgraded && (
        <div style={{ marginBottom: 16, padding: '12px 18px', background: 'rgba(46,160,67,.08)', border: '1px solid rgba(46,160,67,.25)', borderRadius: 8, fontSize: 13, color: 'var(--green)' }}>
          Plan upgraded successfully. Welcome to {PLANS.find(p => p.key === currentPlan)?.name}!
        </div>
      )}
      {connectSuccess && (
        <div style={{ marginBottom: 16, padding: '12px 18px', background: 'rgba(46,160,67,.08)', border: '1px solid rgba(46,160,67,.25)', borderRadius: 8, fontSize: 13, color: 'var(--green)' }}>
          Stripe onboarding submitted — verification usually takes a few minutes. Refresh this page to see your updated status.
        </div>
      )}
      {connectRefresh && (
        <div style={{ marginBottom: 16, padding: '12px 18px', background: 'rgba(198,40,40,.06)', border: '1px solid rgba(198,40,40,.2)', borderRadius: 8, fontSize: 13, color: 'var(--red)' }}>
          Stripe onboarding link expired. Click "Continue Setup" to get a fresh link.
        </div>
      )}

      {/* Current plan banner */}
      <div className="dash-card" style={{ marginBottom: 20 }}>
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--steel)', marginBottom: 6 }}>
              Current Plan
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 28, color: 'var(--navy)', lineHeight: 1 }}>
                {PLANS.find(p => p.key === currentPlan)?.name}
              </span>
              <span className={`dash-jbadge ${statusClass}`}>{statusLabel}</span>
            </div>
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
            <button onClick={openPortal} disabled={busy} style={{ fontSize: 12, textDecoration: 'underline', background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', flexShrink: 0 }}>
              Update card →
            </button>
          </div>
        )}
      </div>

      {/* Plan cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {PLANS.map(plan => {
          const isCurrent  = plan.key === currentPlan;
          const planIdx    = PLAN_ORDER.indexOf(plan.key);
          const isUpgrade  = planIdx > currentIdx;
          const isDowngrade = planIdx < currentIdx;

          return (
            <div key={plan.key} className="dash-card" style={{ position: 'relative', border: plan.highlight ? '2px solid var(--sand)' : '1px solid var(--lightgray)' }}>
              {plan.highlight && (
                <div style={{ position: 'absolute', top: -1, left: 20, background: 'var(--sand)', color: 'var(--navy)', fontSize: 9, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', padding: '2px 10px', borderRadius: '0 0 5px 5px' }}>
                  Most Popular
                </div>
              )}

              <div style={{ padding: '28px 20px 20px' }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--steel)', marginBottom: 10 }}>
                  {plan.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 2 }}>
                  <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 38, color: 'var(--navy)', lineHeight: 1 }}>
                    {plan.price === 0 ? 'Free' : `$${plan.price}`}
                  </span>
                  {plan.price > 0 && (
                    <span style={{ fontSize: 12, color: 'var(--steel)' }}>/mo</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--steel)', marginBottom: 20 }}>{plan.caption}</div>

                <div style={{ borderTop: '1px solid var(--lightgray)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--slate)' }}>
                      <span style={{ color: 'var(--green)', fontWeight: 700, lineHeight: '18px', flexShrink: 0 }}>✓</span>
                      {f}
                    </div>
                  ))}
                  {plan.missing.map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--lightgray)' }}>
                      <span style={{ lineHeight: '18px', flexShrink: 0 }}>—</span>
                      {f}
                    </div>
                  ))}
                </div>

                {isCurrent ? (
                  <button disabled style={{ width: '100%', padding: '10px 0', borderRadius: 6, border: '1px solid var(--lightgray)', background: 'none', color: 'var(--steel)', fontSize: 12, cursor: 'default' }}>
                    Current Plan
                  </button>
                ) : isUpgrade ? (
                  <button
                    disabled={busy}
                    onClick={() => upgrade(plan.key)}
                    style={{ width: '100%', padding: '10px 0', borderRadius: 6, border: 'none', background: 'var(--navy)', color: plan.highlight ? 'var(--sand)' : 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    {busy ? '…' : `Upgrade to ${plan.name} →`}
                  </button>
                ) : (
                  <button
                    disabled={busy}
                    onClick={openPortal}
                    style={{ width: '100%', padding: '10px 0', borderRadius: 6, border: '1px solid var(--lightgray)', background: 'none', color: 'var(--slate)', fontSize: 12, cursor: 'pointer' }}
                  >
                    {busy ? '…' : 'Downgrade'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Stripe Connect — payments section */}
      <div className="dash-card" style={{ marginTop: 20 }}>
        <div style={{ padding: '24px 24px 20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--steel)', marginBottom: 8 }}>
              Payments
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>
              Stripe Connect
            </div>
            <div style={{ fontSize: 13, color: 'var(--steel)', lineHeight: 1.6, maxWidth: 480 }}>
              Connect your bank account so invoice payments and booking deposits go directly to you.
              FieldCore collects a <strong style={{ color: 'var(--navy)' }}>{connect.platform_fee}% platform fee</strong> per transaction.
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, flexShrink: 0 }}>
            {connect.status === 'not_connected' && (
              <button
                onClick={connectStripe}
                disabled={connectBusy}
                style={{ padding: '10px 20px', background: '#635BFF', color: 'white', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: connectBusy ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                {connectBusy ? '…' : 'Connect with Stripe →'}
              </button>
            )}
            {connect.status === 'pending' && (
              <>
                <span className="dash-jbadge js-pending">Verification Pending</span>
                <button
                  onClick={connectStripe}
                  disabled={connectBusy}
                  style={{ padding: '10px 20px', background: 'var(--navy)', color: 'var(--sand)', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: connectBusy ? 'wait' : 'pointer' }}
                >
                  {connectBusy ? '…' : 'Continue Setup →'}
                </button>
              </>
            )}
            {connect.status === 'active' && (
              <>
                <span className="dash-jbadge js-active">Active</span>
                <button
                  onClick={openStripeDashboard}
                  disabled={connectBusy}
                  className="btn-secondary"
                >
                  {connectBusy ? '…' : 'Stripe Dashboard →'}
                </button>
              </>
            )}
          </div>
        </div>

        {connect.status === 'not_connected' && (
          <div style={{ margin: '0 24px 20px', padding: '10px 14px', background: '#f9f7f3', borderRadius: 6, fontSize: 12, color: 'var(--steel)', lineHeight: 1.5 }}>
            Without Connect, payments are collected by FieldCore and require manual transfer. Connect takes ~5 minutes via Stripe's hosted onboarding.
          </div>
        )}
      </div>

      {/* Footer note */}
      <div style={{ marginTop: 20, padding: '14px 20px', fontSize: 12, color: 'var(--steel)', fontFamily: 'DM Mono, monospace', textAlign: 'center' }}>
        All plans include a 14-day free trial. Cancel anytime. Billing managed securely via Stripe.
      </div>
    </div>
  );
}
