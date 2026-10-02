import MarketingShell from '@/components/MarketingShell';
import Link from 'next/link';

export const metadata = {
  title: 'Press | FieldCore — Media Resources & Company Information',
  description: 'Media resources, company boilerplate, and press contact information for FieldCore.',
};

export default function PressPage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section className="mkt-hero">
        <div className="mkt-hero-bg-lines" />
        <div className="mkt-hero-eyebrow">Press</div>
        <h1 className="mkt-hero-title">
          News, media resources, and<br />
          <em>company information.</em>
        </h1>
        <p className="mkt-hero-sub">
          Resources for journalists, analysts, and media covering field-service technology and
          small business software.
        </p>
      </section>

      {/* Boilerplate */}
      <section className="mkt-section mkt-section-white">
        <div className="mkt-eyebrow">About FieldCore</div>
        <h2 className="mkt-title mkt-title-dark" style={{ marginBottom: 28 }}>Company boilerplate.</h2>

        <div className="press-boilerplate">
          <div className="press-boilerplate-label">About FieldCore — Standard boilerplate</div>
          <p className="press-boilerplate-body">
            FieldCore is a field-service management platform built for service businesses that send
            technicians to customer locations to do skilled work. The platform provides scheduling,
            dispatch, client management, project and work order management, invoicing, payments,
            two-way communications, and team management in a single system — replacing the fragmented
            mix of apps, spreadsheets, and personal phones most field-service operators use today.
            FieldCore is designed for businesses across mobile detailing, HVAC, plumbing, electrical,
            landscaping, pressure washing, pool services, pest control, and related trades.
            The company is incorporated in Delaware and is in active development.
          </p>
        </div>

        {/* Product description */}
        <div style={{ marginTop: 48 }}>
          <div className="mkt-eyebrow">Product</div>
          <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--n)', marginBottom: 18 }}>What FieldCore does.</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxWidth: 680 }}>
            {[
              'Scheduling & calendar management with recurring service support',
              'Live dispatch map with multi-technician assignment',
              'Client management with service location tracking',
              'Project and work order management with budget tracking',
              'Estimates with e-signature and one-click invoice conversion',
              'Invoicing, online payments, deposits, and card-on-file billing',
              'Business phone number, two-way SMS, and call recording',
              'Revenue analytics, forecasting, and team performance reporting',
              'Mobile app for field technicians',
            ].map((item) => (
              <div key={item} style={{ padding: '12px 0', borderBottom: '1px solid var(--lg)', fontSize: 14, color: 'var(--sl)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: 'var(--gn)', fontWeight: 700 }}>✓</span>
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Press contacts */}
      <section className="mkt-section mkt-section-cream">
        <div className="mkt-eyebrow">Media contact</div>
        <h2 className="mkt-title mkt-title-dark" style={{ marginBottom: 28 }}>Press inquiries.</h2>
        <div className="press-contact-grid">
          <div className="press-contact-card">
            <div className="press-contact-label">General Media Inquiries</div>
            <div className="press-contact-name">FieldCore Press</div>
            <div className="press-contact-role">Media Relations</div>
            <div className="press-contact-email">press@getfieldcore.com</div>
          </div>
          <div className="press-contact-card">
            <div className="press-contact-label">Partnership & Business Inquiries</div>
            <div className="press-contact-name">FieldCore Partnerships</div>
            <div className="press-contact-role">Business Development</div>
            <div className="press-contact-email">partnerships@getfieldcore.com</div>
          </div>
        </div>
      </section>

      {/* Press coverage */}
      <section className="mkt-section mkt-section-white">
        <div className="mkt-eyebrow">Coverage</div>
        <h2 className="mkt-title mkt-title-dark" style={{ marginBottom: 20 }}>Press coverage.</h2>
        <div className="press-empty">
          <div className="press-empty-body">No press coverage published yet.</div>
        </div>
      </section>

      {/* CTA */}
      <div className="mkt-cta-strip">
        <h2 className="mkt-cta-title">Media inquiry?</h2>
        <p className="mkt-cta-sub">We respond to all press inquiries. Reach out through our contact form.</p>
        <div className="mkt-cta-btns">
          <Link href="/contact" className="btn btn-sand btn-lg">Contact us</Link>
        </div>
      </div>
    </MarketingShell>
  );
}
