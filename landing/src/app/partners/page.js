import MarketingShell from '@/components/MarketingShell';
import Link from 'next/link';

export const metadata = {
  title: 'Partners | FieldCore — Technology & Business Partnerships',
  description: 'Explore technology, payment, industry, and referral partnership opportunities with FieldCore.',
};

const PARTNERSHIP_TYPES = [
  {
    icon: '🔌',
    title: 'Technology Partners',
    desc: 'Software platforms, APIs, and tools that integrate with FieldCore to expand what operators can do. Payment processors, GPS providers, accounting software, and communication platforms.',
  },
  {
    icon: '💳',
    title: 'Payment & Financial Partners',
    desc: 'Payment processing, banking, and financial services partnerships that improve how field-service operators collect, manage, and move money.',
  },
  {
    icon: '🏗️',
    title: 'Industry Partners',
    desc: 'Trade associations, industry groups, and vertical-specific organizations whose members run field-service businesses. We partner to provide members with purpose-built software.',
  },
  {
    icon: '🤝',
    title: 'Referral & Business Partners',
    desc: 'Consultants, coaches, agency owners, and business advisors who work with field-service operators and refer FieldCore as part of their stack recommendations.',
  },
];

const BENEFITS = [
  { icon: '📈', label: 'Revenue sharing on referred accounts' },
  { icon: '🎯', label: 'Co-marketing and joint content' },
  { icon: '🔧', label: 'Technical integration support' },
  { icon: '📚', label: 'Partner resources and training' },
  { icon: '🔑', label: 'Early access to new features' },
  { icon: '🤝', label: 'Dedicated partner contact' },
];

export default function PartnersPage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section className="mkt-hero">
        <div className="mkt-hero-bg-lines" />
        <div className="mkt-hero-eyebrow">Partners</div>
        <h1 className="mkt-hero-title">
          Technology and business<br />
          <em>partnerships.</em>
        </h1>
        <p className="mkt-hero-sub">
          FieldCore partners with technology providers, industry organizations, and business advisors
          who serve field-service businesses. If your work touches this market, let's talk.
        </p>
        <div className="mkt-hero-ctas">
          <Link href="/contact" className="btn btn-sand btn-lg">Become a partner</Link>
        </div>
      </section>

      {/* Partnership types */}
      <section className="mkt-section mkt-section-cream">
        <div className="mkt-eyebrow">Partnership types</div>
        <h2 className="mkt-title mkt-title-dark" style={{ marginBottom: 40 }}>How we work together.</h2>
        <div className="partners-grid">
          {PARTNERSHIP_TYPES.map((p) => (
            <div key={p.title} className="partner-cat">
              <div className="partner-cat-icon">{p.icon}</div>
              <div className="partner-cat-title">{p.title}</div>
              <div className="partner-cat-desc">{p.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section className="mkt-section mkt-section-white">
        <div className="mkt-eyebrow">Partner benefits</div>
        <h2 className="mkt-title mkt-title-dark" style={{ marginBottom: 36 }}>What partners get.</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, maxWidth: 800 }}>
          {BENEFITS.map((b) => (
            <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', background: 'var(--of)', border: '1px solid var(--lg)', borderRadius: 8 }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{b.icon}</span>
              <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--n)' }}>{b.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div className="mkt-cta-strip">
        <h2 className="mkt-cta-title">Interested in partnering?</h2>
        <p className="mkt-cta-sub">
          Reach out through our contact form and select "Partnerships" as the topic.
          We respond to all partnership inquiries.
        </p>
        <div className="mkt-cta-btns">
          <Link href="/contact" className="btn btn-sand btn-lg">Become a partner</Link>
        </div>
      </div>
    </MarketingShell>
  );
}
