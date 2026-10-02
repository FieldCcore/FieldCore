import MarketingShell from '@/components/MarketingShell';
import Link from 'next/link';

export const metadata = {
  title: 'Verticals | FieldCore — Built for Your Industry',
  description: 'FieldCore is built for field-service businesses across 15+ industries — from mobile detailing and HVAC to plumbing, electrical, and commercial fleet services.',
};

const VERTICALS = [
  {
    icon: '🚗',
    name: 'Mobile Detailing',
    desc: 'Recurring memberships, multi-location scheduling, deposit enforcement, and fleet accounts — all built for mobile operators.',
  },
  {
    icon: '🔧',
    name: 'Pressure Washing',
    desc: 'Residential and commercial routes, before/after photo documentation, and automated billing for commercial contracts.',
  },
  {
    icon: '🌿',
    name: 'Landscaping',
    desc: 'Weekly and bi-weekly recurring visits, crew dispatch, project-based work orders, and client portal access.',
  },
  {
    icon: '❄️',
    name: 'HVAC',
    desc: 'Service agreements, preventive maintenance scheduling, equipment tracking, and multi-tech dispatch.',
  },
  {
    icon: '🔩',
    name: 'Plumbing',
    desc: 'Emergency dispatch, work order management, parts and materials tracking, and project billing.',
  },
  {
    icon: '⚡',
    name: 'Electrical',
    desc: 'Residential and commercial job management, licensed contractor scheduling, and project-level billing.',
  },
  {
    icon: '🐛',
    name: 'Pest Control',
    desc: 'Recurring treatment schedules, chemical application tracking, and automated renewal reminders.',
  },
  {
    icon: '🏊',
    name: 'Pool Cleaning',
    desc: 'Weekly route management, chemical log tracking, equipment service history, and homeowner communication.',
  },
  {
    icon: '🔨',
    name: 'Mobile Mechanic',
    desc: 'On-site service dispatch, parts inventory, labor billing, and customer vehicle history.',
  },
  {
    icon: '🗑️',
    name: 'Junk Removal',
    desc: 'Volume-based estimates, crew assignment, load documentation, and same-day scheduling.',
  },
  {
    icon: '🎨',
    name: 'Window Tint / PPF',
    desc: 'Appointment management, material tracking, warranty documentation, and client communication.',
  },
  {
    icon: '🔌',
    name: 'Appliance Repair',
    desc: 'Diagnostic tracking, parts ordering workflow, technician dispatch, and service warranty management.',
  },
  {
    icon: '🚪',
    name: 'Garage Door',
    desc: 'Emergency and scheduled service, parts tracking, and customer equipment history.',
  },
  {
    icon: '🏗️',
    name: 'Flooring / Epoxy',
    desc: 'Project-based scheduling, multi-day job management, material billing, and client sign-off.',
  },
  {
    icon: '🚚',
    name: 'Commercial Fleet Wash',
    desc: 'Fleet account management, automated recurring invoicing, bulk scheduling, and route planning.',
  },
  {
    icon: '🏢',
    name: 'Property / Facility Services',
    desc: 'Multi-unit property accounts, recurring maintenance contracts, vendor coordination, and site management.',
  },
];

export default function VerticalsPage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section className="mkt-hero">
        <div className="mkt-hero-bg-lines" />
        <div className="mkt-hero-eyebrow">Verticals</div>
        <h1 className="mkt-hero-title">
          Built for your industry.<br />
          <em>Ready for your business.</em>
        </h1>
        <p className="mkt-hero-sub">
          FieldCore is designed for field-service businesses across industries. Every feature came
          from operators in these verticals describing real problems — not market research.
        </p>
      </section>

      {/* Verticals grid */}
      <section className="mkt-section mkt-section-cream">
        <div className="vert-page-grid">
          {VERTICALS.map((v) => (
            <div key={v.name} className="vert-card">
              <div className="vert-card-icon">{v.icon}</div>
              <div className="vert-card-name">{v.name}</div>
              <div className="vert-card-desc">{v.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Common needs section */}
      <section className="mkt-section mkt-section-white">
        <div className="mkt-eyebrow">Common needs</div>
        <h2 className="mkt-title mkt-title-dark">Built for businesses that work in the field.</h2>
        <p className="mkt-sub mkt-sub-dark" style={{ marginBottom: 48 }}>
          Regardless of your trade, if you schedule jobs, send technicians, and collect payments —
          FieldCore is built for you.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, maxWidth: 860 }}>
          {[
            { icon: '📅', label: 'Recurring scheduling' },
            { icon: '🚗', label: 'Dispatch & routing' },
            { icon: '💳', label: 'Invoicing & payments' },
            { icon: '📱', label: 'Mobile app for techs' },
            { icon: '📞', label: 'Business phone included' },
            { icon: '💬', label: 'Customer texting' },
            { icon: '📊', label: 'Revenue reporting' },
            { icon: '🏢', label: 'Multi-entity support' },
            { icon: '🔁', label: 'Automated billing' },
          ].map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: 'var(--of)', border: '1px solid var(--lg)', borderRadius: 8 }}>
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--n)' }}>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div className="mkt-cta-strip">
        <h2 className="mkt-cta-title">Your industry. <em>Your platform.</em></h2>
        <p className="mkt-cta-sub">Start a free trial and see how FieldCore fits your operation.</p>
        <div className="mkt-cta-btns">
          <Link href="/#cta" className="btn btn-sand btn-lg">Start free trial</Link>
          <Link href="/features" className="btn btn-navy btn-lg">Explore features</Link>
        </div>
      </div>
    </MarketingShell>
  );
}
