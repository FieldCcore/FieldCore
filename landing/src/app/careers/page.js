import MarketingShell from '@/components/MarketingShell';
import Link from 'next/link';

export const metadata = {
  title: 'Careers | FieldCore — Join the Team',
  description: 'Help build the operating system for field-service businesses. View open roles at FieldCore.',
};

const DEPARTMENTS = [
  {
    icon: '⚙️',
    name: 'Engineering',
    desc: 'Build the systems that power tens of thousands of field-service jobs every day. Full-stack, mobile, infrastructure, and data.',
  },
  {
    icon: '🎨',
    name: 'Product & Design',
    desc: 'Define what FieldCore builds and how it works. Deep collaboration with engineering and direct operator feedback.',
  },
  {
    icon: '📣',
    name: 'Go-to-Market',
    desc: 'Sales, marketing, and growth for a product that solves a real problem in a market that needs a better solution.',
  },
  {
    icon: '🤝',
    name: 'Customer Success',
    desc: 'Help operators get the most out of FieldCore. Be the bridge between real-world usage and product improvement.',
  },
  {
    icon: '💼',
    name: 'Operations',
    desc: 'Build the internal systems, processes, and infrastructure that let FieldCore scale as a company.',
  },
  {
    icon: '⚖️',
    name: 'Legal & Finance',
    desc: 'Compliance, contracts, financial operations, and the foundation that supports a growing SaaS business.',
  },
];

export default function CareersPage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section className="mkt-hero">
        <div className="mkt-hero-bg-lines" />
        <div className="mkt-hero-eyebrow">Careers</div>
        <h1 className="mkt-hero-title">
          Help build the operating system<br />
          <em>for field-service businesses.</em>
        </h1>
        <p className="mkt-hero-sub">
          FieldCore is building the platform that replaces the fragmented tools field-service
          operators use today. We're growing and looking for people who care about the problem.
        </p>
      </section>

      {/* Mission section */}
      <section className="mkt-section mkt-section-white">
        <div style={{ maxWidth: 780, marginBottom: 56 }}>
          <div className="mkt-eyebrow">Working at FieldCore</div>
          <h2 className="mkt-title mkt-title-dark" style={{ marginBottom: 18 }}>Why this work matters.</h2>
          <p style={{ fontSize: 16, color: 'var(--sl)', lineHeight: 1.82, marginBottom: 18 }}>
            The businesses we build for are the backbone of local economies — the detailer with a van and three employees,
            the HVAC company covering a three-county radius, the landscaper managing fifty weekly accounts. These businesses
            deserve software that actually works, not software adapted from salon management or enterprise resource planning.
          </p>
          <p style={{ fontSize: 16, color: 'var(--sl)', lineHeight: 1.82 }}>
            At FieldCore, you'll work directly on systems used by real businesses. The feedback is fast, the problems are
            concrete, and the impact is visible.
          </p>
        </div>

        {/* Departments */}
        <div className="mkt-eyebrow">Departments</div>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--n)', marginBottom: 28 }}>Where we're building.</h3>
        <div className="careers-depts">
          {DEPARTMENTS.map((dept) => (
            <div key={dept.name} className="careers-dept">
              <div className="careers-dept-icon">{dept.icon}</div>
              <div className="careers-dept-name">{dept.name}</div>
              <div className="careers-dept-desc">{dept.desc}</div>
            </div>
          ))}
        </div>

        {/* Open roles */}
        <div className="mkt-eyebrow">Open roles</div>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--n)', marginBottom: 20 }}>Current openings.</h3>
        <div className="careers-empty">
          <div className="careers-empty-title">No open roles right now.</div>
          <div className="careers-empty-sub" style={{ maxWidth: 440, margin: '0 auto' }}>
            We're growing. Check back as FieldCore expands, or reach out directly if you think
            you belong here — we read every message.
          </div>
          <Link
            href="/contact"
            className="btn btn-sand"
            style={{ display: 'inline-flex', marginTop: 24 }}
          >
            Reach out anyway
          </Link>
        </div>
      </section>

      {/* CTA */}
      <div className="mkt-cta-strip">
        <h2 className="mkt-cta-title">Interested in FieldCore?</h2>
        <p className="mkt-cta-sub">Follow our progress or reach out directly. We're building something worth joining.</p>
        <div className="mkt-cta-btns">
          <Link href="/contact" className="btn btn-sand btn-lg">Get in touch</Link>
          <Link href="/about" className="btn btn-navy btn-lg">Learn more</Link>
        </div>
      </div>
    </MarketingShell>
  );
}
