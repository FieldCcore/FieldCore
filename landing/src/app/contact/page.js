import MarketingShell from '@/components/MarketingShell';
import ContactForm from '@/components/ContactForm';

export const metadata = {
  title: 'Contact FieldCore | Talk with the Team',
  description: 'Get in touch with the FieldCore team for sales, support, partnerships, press, or general inquiries.',
};

const CONTACT_ITEMS = [
  {
    icon: '📧',
    label: 'General inquiries',
    value: 'hello@getfieldcore.com',
  },
  {
    icon: '💼',
    label: 'Sales & partnerships',
    value: 'sales@getfieldcore.com',
  },
  {
    icon: '🆘',
    label: 'Account support',
    value: 'support@getfieldcore.com',
  },
  {
    icon: '📰',
    label: 'Press & media',
    value: 'press@getfieldcore.com',
  },
];

export default function ContactPage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section className="mkt-hero">
        <div className="mkt-hero-bg-lines" />
        <div className="mkt-hero-eyebrow">Contact</div>
        <h1 className="mkt-hero-title">
          Talk with the<br />
          <em>FieldCore team.</em>
        </h1>
        <p className="mkt-hero-sub">
          Sales, support, partnerships, or press — we respond to every inquiry.
        </p>
      </section>

      {/* Contact layout */}
      <section className="mkt-section mkt-section-white">
        <div className="contact-layout">
          {/* Left: info */}
          <div>
            <div className="contact-info-title">Get in touch.</div>
            <p className="contact-info-body">
              Whether you're evaluating FieldCore for your business, need support with your account,
              or have a partnership idea — use the form or reach out directly to the relevant team.
            </p>
            <div className="contact-info-items">
              {CONTACT_ITEMS.map((item) => (
                <div key={item.label} className="contact-info-item">
                  <div className="contact-info-icon">{item.icon}</div>
                  <div>
                    <div className="contact-info-label">{item.label}</div>
                    <div className="contact-info-value">{item.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: form */}
          <ContactForm />
        </div>
      </section>
    </MarketingShell>
  );
}
