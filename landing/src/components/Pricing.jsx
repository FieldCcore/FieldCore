const plans = [
  {
    name: 'Solo', price: '$49', mo: '/month', target: 'Built for owner operators',
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
    cta: 'Start free trial', featured: false,
  },
  {
    name: 'Pro', price: '$99', mo: '/month', target: 'Built for growing businesses',
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
    cta: 'Start free trial', featured: true,
  },
  {
    name: 'Scale', price: '$199', mo: '/month', target: 'Built for established service companies',
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
    cta: 'Get started', featured: false,
  },
  {
    name: 'Custom', price: '$300+', mo: '/month', target: 'Enterprise & franchises',
    tag: 'Dedicated support, custom development, and negotiated rates.',
    feats: [
      'Everything in Scale',
      'Unlimited phone numbers',
      'Dedicated Customer Success Manager',
      '99.9% uptime SLA',
      'Custom feature development',
      'Negotiated processing rate',
    ],
    cta: 'Contact sales', featured: false,
  },
];

export default function Pricing() {
  return (
    <section id="pricing">
      <div className="sec-eyebrow" style={{ marginBottom: 12 }}>Pricing</div>
      <h2 className="sec-title sec-title-light">
        Simple pricing.<br /><em style={{ color: 'var(--sd)', fontStyle: 'italic' }}>No surprises.</em>
      </h2>
      <p className="sec-sub sec-sub-light" style={{ marginTop: 12 }}>
        No per-user fees at any tier. No setup fees. Cancel anytime.
      </p>
      <div className="pricing-grid">
        {plans.map(p => (
          <div key={p.name} className={`plan${p.featured ? ' featured' : ''}`}>
            {p.badge && <div className="plan-badge">{p.badge}</div>}
            <div className="plan-name">{p.name}</div>
            <div className="plan-price">{p.price}</div>
            <div className="plan-mo">{p.mo}</div>
            <div className="plan-target">{p.target}</div>
            {p.tag && <div style={{ fontSize: 12, color: p.featured ? 'rgba(28,35,51,.6)' : '#8A90A2', marginTop: 6, lineHeight: 1.4, fontStyle: 'italic' }}>{p.tag}</div>}
            <div className="plan-div" />
            <div className="plan-feats">
              {p.feats.map(f => (
                <div key={f} className="pf">
                  <span className="pf-check">✓</span>
                  <span className="pf-text" style={p.featured ? { color: 'rgba(28,35,51,.8)' } : {}}>{f}</span>
                </div>
              ))}
            </div>
            <button className={`plan-cta ${p.featured ? 'plan-cta-featured' : 'plan-cta-default'}`}>
              {p.cta}
            </button>
          </div>
        ))}
      </div>
      <p className="pricing-note">
        No per-user fees · No setup fees · Cancel anytime · <span>No surprises</span>
      </p>
    </section>
  );
}
