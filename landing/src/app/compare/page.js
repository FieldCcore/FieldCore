import MarketingShell from '@/components/MarketingShell';
import Link from 'next/link';

export const metadata = {
  title: 'Compare FieldCore | How FieldCore Compares to Other Field Service Software',
  description: 'Compare FieldCore to Jobber, Housecall Pro, and ServiceTitan across scheduling, dispatch, billing, communications, and pricing.',
};

const ROWS = [
  { f: 'No-show arrival clock',            fc: '✓ Industry 1st', jobber: '—',            hcp: '—',             st: '—' },
  { f: 'Pre-charge advance notice',         fc: '✓ Native',       jobber: '—',            hcp: '—',             st: '—' },
  { f: '3-layer deposit system',            fc: '✓ Full system',  jobber: 'Basic',        hcp: 'Basic',         st: 'Limited' },
  { f: 'Business phone included in plan',   fc: '✓ Pro+',         jobber: '—',            hcp: 'Add-on cost',   st: '—' },
  { f: 'Smart Caller ID (9-zone profile)',  fc: '✓ Native',       jobber: '—',            hcp: '—',             st: '—' },
  { f: 'Travel fee auto-calculation',       fc: '✓ Native',       jobber: '—',            hcp: '—',             st: '—' },
  { f: 'Multi-entity SMB (unlimited LLCs)', fc: '✓ Native',       jobber: '—',            hcp: '—',             st: 'Enterprise only' },
  { f: 'Entry price (no per-user fees)',    fc: '$49/mo',         jobber: '$39+/mo',      hcp: '$59+/mo',       st: '$400+/mo' },
  { f: 'Recurring billing automation',      fc: '✓ All plans',    jobber: '✓ Yes',        hcp: '✓ Yes',         st: '✓ Yes' },
  { f: 'Mobile app for technicians',        fc: '✓ All plans',    jobber: '✓ Yes',        hcp: '✓ Yes',         st: '✓ Yes' },
  { f: 'Estimates + e-signature',           fc: '✓ All plans',    jobber: '✓ Yes',        hcp: '✓ Yes',         st: '✓ Yes' },
  { f: 'Client portal',                     fc: '✓ Native',       jobber: '✓ Yes',        hcp: '✓ Yes',         st: '✓ Yes' },
];

const isHighlight = (v) => v.startsWith('✓') && (v.includes('Industry') || v.includes('Native') || v.includes('Pro+') || v.includes('Full') || v.includes('All plans')) || v === '$49/mo';

const CATEGORIES = [
  {
    title: 'Scheduling & Dispatch',
    items: [
      'Drag-and-drop calendar scheduling',
      'Route optimization',
      'Multi-tech assignment',
      'Recurring job management',
      'Live dispatch map',
    ],
  },
  {
    title: 'Billing & Payments',
    items: [
      'Online invoice payments',
      'Deposit and pre-authorization',
      'Automated recurring billing',
      'Travel fee calculation',
      'Card on file charging',
    ],
  },
  {
    title: 'Communications',
    items: [
      'Business phone number',
      'Two-way SMS with customers',
      'Appointment reminders',
      'Missed call text back',
      'No-show arrival clock',
    ],
  },
  {
    title: 'Business Operations',
    items: [
      'Multi-entity / multi-company',
      'Role-based team permissions',
      'Revenue reporting & analytics',
      'Client portal access',
      'API access',
    ],
  },
];

export default function ComparePage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section className="mkt-hero">
        <div className="mkt-hero-bg-lines" />
        <div className="mkt-hero-eyebrow">Compare FieldCore</div>
        <h1 className="mkt-hero-title">
          How FieldCore compares.<br />
          <em>Where it matters.</em>
        </h1>
        <p className="mkt-hero-sub">
          FieldCore was built to solve problems that existing platforms don't address.
          Here's an honest comparison based on verified product capabilities.
        </p>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,.28)', position: 'relative', zIndex: 1, fontFamily: 'var(--font-geist-mono)', letterSpacing: '.08em' }}>
          Verified May 2026. Competitor information based on publicly available product documentation.
        </p>
      </section>

      {/* Comparison table */}
      <section className="mkt-section mkt-section-white">
        <div className="mkt-eyebrow">Feature comparison</div>
        <h2 className="mkt-title mkt-title-dark">FieldCore vs. the alternatives.</h2>
        <p className="mkt-sub mkt-sub-dark" style={{ marginBottom: 40 }}>
          Category-based comparison across the capabilities that matter most to field-service operators.
        </p>

        <div className="compare-table">
          <div className="ct-head">
            <div className="ct-hcell">Feature</div>
            <div className="ct-hcell fc">FieldCore</div>
            <div className="ct-hcell">Jobber</div>
            <div className="ct-hcell">Housecall Pro</div>
            <div className="ct-hcell">ServiceTitan</div>
          </div>
          {ROWS.map((r) => (
            <div key={r.f} className="ct-row">
              <div className="ct-cell feature">{r.f}</div>
              <div className="ct-cell fc">
                <span className={isHighlight(r.fc) ? 'ct-first' : 'ct-check'}>{r.fc}</span>
              </div>
              <div className="ct-cell">{r.jobber === '—' ? <span className="ct-x">—</span> : r.jobber}</div>
              <div className="ct-cell">{r.hcp === '—' ? <span className="ct-x">—</span> : r.hcp}</div>
              <div className="ct-cell">{r.st === '—' ? <span className="ct-x">—</span> : r.st}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Category breakdown */}
      <section className="mkt-section mkt-section-cream">
        <div className="mkt-eyebrow">Capability areas</div>
        <h2 className="mkt-title mkt-title-dark" style={{ marginBottom: 40 }}>What FieldCore covers.</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 20, maxWidth: 900 }}>
          {CATEGORIES.map((cat) => (
            <div key={cat.title} style={{ background: 'var(--wh)', border: '1px solid var(--lg)', borderRadius: 12, padding: '28px 26px' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--n)', marginBottom: 16 }}>{cat.title}</div>
              {cat.items.map((item) => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--lg)', fontSize: 13.5, color: 'var(--sl)' }}>
                  <span style={{ color: 'var(--gn)', fontWeight: 700, fontSize: 14 }}>✓</span>
                  {item}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Disclaimer */}
      <section className="mkt-section mkt-section-white" style={{ paddingTop: 40, paddingBottom: 40 }}>
        <p style={{ fontSize: 12.5, color: 'var(--st)', lineHeight: 1.72, maxWidth: 700 }}>
          <strong style={{ color: 'var(--sl)' }}>Disclaimer:</strong> Competitor information is based on publicly available product documentation and pricing pages as of May 2026.
          Feature availability may vary by plan. FieldCore makes no warranties regarding the accuracy of competitor information and recommends
          verifying current capabilities directly with each provider.
        </p>
      </section>

      {/* CTA */}
      <div className="mkt-cta-strip">
        <h2 className="mkt-cta-title">See the difference <em>firsthand.</em></h2>
        <p className="mkt-cta-sub">Start a free trial and experience what FieldCore actually does.</p>
        <div className="mkt-cta-btns">
          <Link href="/#cta" className="btn btn-sand btn-lg">Start free trial</Link>
          <Link href="/features" className="btn btn-navy btn-lg">Explore features</Link>
        </div>
      </div>
    </MarketingShell>
  );
}
