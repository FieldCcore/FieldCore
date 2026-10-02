import MarketingShell from '@/components/MarketingShell';
import Link from 'next/link';

export const metadata = {
  title: 'Pricing | FieldCore — No per-user fees. No surprises.',
  description: 'Solo at $49/mo, Pro at $99/mo, Scale at $199/mo. No per-user fees at any tier. Start your free trial today.',
};

const plans = [
  {
    name: 'Solo',
    price: '$49',
    mo: '/month',
    target: 'Built for owner operators',
    tag: 'Everything you need to run your business from one app.',
    feats: [
      'Job scheduling + customer CRM',
      'Estimates + invoices + online payments',
      'Online booking widget',
      'Dedicated business phone number',
      'Two-way texting with customers',
      'Call logs + voicemail inbox',
      'Automated appointment reminders',
      'Card on file + deposits',
      'Route optimization',
      'Mobile app (iOS + Android)',
      'Customer communication history',
    ],
    cta: 'Start free trial',
    featured: false,
  },
  {
    name: 'Pro',
    price: '$99',
    mo: '/month',
    target: 'Built for growing businesses',
    tag: 'Built for teams that need accountability and automation.',
    badge: 'MOST POPULAR',
    feats: [
      'Everything in Solo',
      'Additional team members',
      'Team permissions + shared inbox',
      'Call recording',
      'Missed-call text back',
      'No-Show Clock™',
      '3-Layer Deposit System™',
      'Smart Caller ID',
      'Pre-charge advance notices',
      'Travel fee engine',
      'Fleet management',
      'Recurring billing automation',
    ],
    cta: 'Start free trial',
    featured: true,
  },
  {
    name: 'Scale',
    price: '$199',
    mo: '/month',
    target: 'Built for established service companies',
    tag: 'Built for companies scaling beyond a single team.',
    feats: [
      'Everything in Pro',
      'Multiple business phone numbers',
      'Department phone numbers',
      'Call routing + ring groups',
      'Multi-entity management',
      'GPS fleet integrations',
      'Advanced reporting',
      'API access',
      'White-label booking',
    ],
    cta: 'Get started',
    featured: false,
  },
  {
    name: 'Custom',
    price: '$300+',
    mo: '/month',
    target: 'Enterprise & franchises',
    tag: 'Dedicated support, custom development, and negotiated rates.',
    feats: [
      'Everything in Scale',
      'Unlimited phone numbers',
      'Dedicated Customer Success Manager',
      '99.9% uptime SLA',
      'Custom feature development',
      'Negotiated processing rate',
    ],
    cta: 'Contact sales',
    featured: false,
  },
];

const FAQ_ITEMS = [
  { q: 'Are there per-user fees?', a: 'No. FieldCore never charges per user at any plan tier. Your subscription covers your entire team.' },
  { q: 'What payment methods do you accept?', a: 'All major credit and debit cards. Annual billing is available and typically offered at a discount.' },
  { q: 'Can I cancel anytime?', a: 'Yes. There are no long-term contracts or cancellation penalties. Cancel from your account settings at any time.' },
  { q: 'Is there a free trial?', a: 'Yes. Start a free trial on any plan without a credit card. Upgrade when you are ready.' },
  { q: 'What does "Custom" pricing include?', a: 'Custom plans are for enterprises, franchises, and multi-location businesses that need dedicated support, custom integrations, or negotiated processing rates. Contact our sales team to discuss your needs.' },
  { q: 'Can I switch plans?', a: 'Yes. You can upgrade or downgrade your plan at any time. Changes take effect at the start of your next billing period.' },
];

export default function PricingPage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section className="mkt-hero">
        <div className="mkt-hero-bg-lines" />
        <div className="mkt-hero-eyebrow">Pricing</div>
        <h1 className="mkt-hero-title">
          Simple pricing.<br />
          <em>No surprises.</em>
        </h1>
        <p className="mkt-hero-sub">
          No per-user fees. No setup fees. Cancel anytime.
          Start a free trial on any plan — no credit card required.
        </p>
      </section>

      {/* Plans */}
      <section className="mkt-section mkt-section-navy" style={{ paddingTop: 60 }}>
        <div className="pricing-page-grid">
          {plans.map((p) => (
            <div key={p.name} className={`plan${p.featured ? ' featured' : ''}`}>
              {p.badge && <div className="plan-badge">{p.badge}</div>}
              <div className="plan-name">{p.name}</div>
              <div className="plan-price">{p.price}</div>
              <div className="plan-mo">{p.mo}</div>
              <div className="plan-target">{p.target}</div>
              {p.tag && (
                <div style={{ fontSize: 12, color: p.featured ? 'rgba(28,35,51,.6)' : '#8A90A2', marginTop: 6, lineHeight: 1.4, fontStyle: 'italic' }}>
                  {p.tag}
                </div>
              )}
              <div className="plan-div" />
              <div className="plan-feats">
                {p.feats.map((f) => (
                  <div key={f} className="pf">
                    <span className="pf-check">✓</span>
                    <span className="pf-text" style={p.featured ? { color: 'rgba(28,35,51,.8)' } : {}}>{f}</span>
                  </div>
                ))}
              </div>
              {p.name === 'Custom' ? (
                <Link href="/contact" className={`plan-cta plan-cta-default`} style={{ display: 'block', textAlign: 'center', marginTop: 24, padding: 12, borderRadius: 8, fontSize: 13, fontWeight: 700, background: 'rgba(255,255,255,.08)', color: 'var(--wh)' }}>
                  {p.cta}
                </Link>
              ) : (
                <Link href="/#cta" className={`plan-cta ${p.featured ? 'plan-cta-featured' : 'plan-cta-default'}`} style={{ display: 'block', textAlign: 'center', marginTop: 24, padding: 12, borderRadius: 8, fontSize: 13, fontWeight: 700 }}>
                  {p.cta}
                </Link>
              )}
            </div>
          ))}
        </div>
        <p className="pricing-note" style={{ marginTop: 28 }}>
          No per-user fees · No setup fees · Cancel anytime · <span>No surprises</span>
        </p>

        {/* FAQ */}
        <div className="pricing-faq">
          <div className="pricing-faq-title">Pricing FAQ</div>
          {FAQ_ITEMS.map((item) => (
            <div key={item.q} style={{ borderBottom: '1px solid rgba(255,255,255,.07)', padding: '20px 0' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--wh)', marginBottom: 8 }}>{item.q}</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,.42)', lineHeight: 1.72 }}>{item.a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div className="mkt-cta-strip">
        <h2 className="mkt-cta-title">Start your free trial today.</h2>
        <p className="mkt-cta-sub">No credit card required. Set up in minutes.</p>
        <div className="mkt-cta-btns">
          <Link href="/#cta" className="btn btn-sand btn-lg">Start free trial</Link>
          <Link href="/contact" className="btn btn-navy btn-lg">Talk to sales</Link>
        </div>
      </div>
    </MarketingShell>
  );
}
