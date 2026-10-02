import MarketingShell from '@/components/MarketingShell';
import Link from 'next/link';

export const metadata = {
  title: 'Blog | FieldCore — Field Service Operations, Growth & Product Insights',
  description: 'Insights on field-service operations, business growth, and product updates from the FieldCore team.',
};

const PLANNED_TOPICS = [
  'How to eliminate no-shows in your service business',
  'Setting up recurring billing for your best clients',
  'Dispatch tips for multi-tech operations',
  'Why per-user fees hurt growing service businesses',
  'Building a 5-star client communication system',
];

export default function BlogPage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section className="mkt-hero">
        <div className="mkt-hero-bg-lines" />
        <div className="mkt-hero-eyebrow">Blog</div>
        <h1 className="mkt-hero-title">
          Field service operations,<br />
          <em>growth, and product insights.</em>
        </h1>
        <p className="mkt-hero-sub">
          Practical content for the operators who run field-service businesses.
          Written by people who talk to them every day.
        </p>
      </section>

      {/* Empty state */}
      <section className="mkt-section mkt-section-white">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 52 }}>
          {['Operations', 'Billing', 'Growth', 'Product', 'Team Management'].map((cat) => (
            <span key={cat} className="blog-cat-btn">{cat}</span>
          ))}
        </div>

        <div className="blog-empty">
          <div className="blog-empty-icon">✍️</div>
          <h2 className="blog-empty-title">Articles coming soon.</h2>
          <p className="blog-empty-sub" style={{ maxWidth: 420, margin: '0 auto' }}>
            We're working on the first batch of content focused on field-service operations,
            billing, and business growth. Check back soon.
          </p>
        </div>

        {/* Coming soon topics */}
        <div style={{ marginTop: 64, borderTop: '1px solid var(--lg)', paddingTop: 48 }}>
          <div style={{ fontFamily: 'var(--font-geist-mono)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--sd)', marginBottom: 20 }}>
            Topics in progress
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {PLANNED_TOPICS.map((topic) => (
              <div key={topic} style={{ padding: '16px 0', borderBottom: '1px solid var(--lg)', fontSize: 15, color: 'var(--n)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: 'var(--font-geist-mono)', fontSize: 9, color: 'var(--sd)', background: 'rgba(214,181,138,.1)', padding: '2px 8px', borderRadius: 99, fontWeight: 700, flexShrink: 0 }}>SOON</span>
                {topic}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <div className="mkt-cta-strip">
        <h2 className="mkt-cta-title">Ready to run a better operation?</h2>
        <p className="mkt-cta-sub">Don't wait for the articles. Start your free trial today.</p>
        <div className="mkt-cta-btns">
          <Link href="/#cta" className="btn btn-sand btn-lg">Start free trial</Link>
          <Link href="/features" className="btn btn-navy btn-lg">Explore features</Link>
        </div>
      </div>
    </MarketingShell>
  );
}
