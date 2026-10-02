const Chk = () => (
  <svg viewBox="0 0 12 12" fill="none" style={{ width: 10, height: 10 }}>
    <path d="M2 6l3 3 5-5" stroke="#1E6B3C" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const feats = [
  { badge: 'INDUSTRY 1ST', t: 'No-Show Arrival Clock', b: '25-minute GPS countdown. Two auto-texts to client. Deposit retained at zero automatically. GPS record created.', tier: 'Pro+' },
  { badge: 'INDUSTRY 1ST', t: 'Smart Caller ID', b: 'Full 9-zone client profile before you answer. LTV, last job, balance, next appointment. Push when app is closed.', tier: 'Pro+' },
  { badge: 'INDUSTRY 1ST', t: 'Pre-Charge Notice', b: '12, 24, 48, or 72-hour advance SMS before every recurring charge. Card update links auto-sent on reply.', tier: 'Pro+' },
  { badge: 'INDUSTRY 1ST', t: 'Travel Fee Engine', b: 'Auto-calculates road distance via Google Maps. Appears as a transparent line item on every invoice.', tier: 'Pro+' },
  { badge: null, t: 'Minute-Precise ETA', b: '"Arriving at 2:18 PM." Real clock time. One tap. Not "in about 30 minutes." The exact time.', tier: 'All plans' },
  { badge: null, t: '3-Layer Deposit System', b: 'Set by service type, client tier, and individual job simultaneously. VIP waivers. At-Risk mandatory deposits.', tier: 'Pro+' },
  { badge: null, t: 'Multi-Entity Dashboard', b: 'Unlimited LLCs from one login. Separate P&L per entity. One tap to switch. No double-entry ever.', tier: 'Scale+' },
  { badge: null, t: 'Fleet Billing Automation', b: 'Set commercial contracts once. Jobs generate. Invoices send. Payments collect. Zero manual steps monthly.', tier: 'Pro+' },
];

export default function Features() {
  return (
    <section id="features">
      <div className="feat-header">
        <div>
          <div className="sec-eyebrow" style={{ marginBottom: 12 }}>Core Features</div>
          <h2 className="sec-title sec-title-light">
            8 features operators asked for.<br />
            <em style={{ color: 'var(--sd)', fontStyle: 'italic' }}>Every one built.</em>
          </h2>
        </div>
        <p className="sec-sub sec-sub-light" style={{ maxWidth: 340 }}>
          Not adapted from salon software. Not a generic CRM. Built from operator conversations about real problems.
        </p>
      </div>
      <div className="feat-grid">
        {feats.map(f => (
          <div key={f.t} className="feat">
            {f.badge && <span className="feat-badge feat-badge-ex">{f.badge}</span>}
            <div className="feat-t">{f.t}</div>
            <div className="feat-b">{f.b}</div>
            <span className="feat-tier">{f.tier}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
