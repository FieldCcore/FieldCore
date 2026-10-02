import MarketingShell from '@/components/MarketingShell';
import Link from 'next/link';

export const metadata = {
  title: 'About FieldCore | Built for Businesses That Do the Work in the Field',
  description: 'FieldCore is being built to give field-service businesses one system for scheduling, operations, clients, projects, billing, and team coordination.',
};

const VALUES = [
  {
    icon: '🔧',
    title: 'Built from operator conversations',
    body: 'Every feature in FieldCore came from a real conversation with a field-service operator about a real problem. Not market research. Not analyst frameworks. Real businesses.',
  },
  {
    icon: '🚫',
    title: 'No per-user fees. Ever.',
    body: 'Field-service businesses shouldn\'t be penalized for growing their team. FieldCore will never charge per user. Your subscription covers your entire operation.',
  },
  {
    icon: '🏗️',
    title: 'One system, not seven apps',
    body: 'The average field-service business runs on Square, Google Calendar, personal phone, spreadsheets, and email. FieldCore replaces all of it with one platform that actually works together.',
  },
  {
    icon: '⚡',
    title: 'Speed over elegance',
    body: 'Operators don\'t have time to learn complex software. Every feature is designed to be usable in under a minute. Speed in the field is not optional.',
  },
  {
    icon: '🔒',
    title: 'Protecting operator revenue',
    body: 'No-shows, deposit disputes, and payment failures cost field-service businesses real money. FieldCore is built with the tools to protect it: deposit enforcement, pre-charge notices, and arrival clock tracking.',
  },
  {
    icon: '📱',
    title: 'Mobile first, not mobile afterthought',
    body: 'Your team is in the field, not at a desk. The FieldCore mobile app gives technicians everything they need without everything they don\'t.',
  },
];

export default function AboutPage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section className="mkt-hero">
        <div className="mkt-hero-bg-lines" />
        <div className="mkt-hero-eyebrow">About FieldCore</div>
        <h1 className="mkt-hero-title">
          Built for businesses that do<br />
          <em>the work in the field.</em>
        </h1>
        <p className="mkt-hero-sub">
          FieldCore is being built to give field-service businesses one system for scheduling,
          operations, clients, projects, billing, and team coordination.
        </p>
      </section>

      {/* Mission */}
      <section className="mkt-section mkt-section-white">
        <div style={{ maxWidth: 800 }}>
          <div className="mkt-eyebrow">Why FieldCore exists</div>
          <h2 className="mkt-title mkt-title-dark" style={{ marginBottom: 24 }}>
            The problem with fragmented tools.
          </h2>
          <div style={{ fontSize: 16, color: 'var(--sl)', lineHeight: 1.85 }}>
            <p style={{ marginBottom: 18 }}>
              Most field-service businesses run on a patchwork of tools that were never designed to work together.
              Square for payments. Google Calendar for scheduling. Their personal phone for communication.
              Spreadsheets for client tracking. A separate app for invoicing. Another one for their team.
            </p>
            <p style={{ marginBottom: 18 }}>
              Each tool works in isolation. None of them share data. Appointments booked in one place don't
              appear in another. Payments collected in one app don't connect to the job in another. Every day,
              operators manually reconcile information across multiple systems — time spent running software
              instead of running a business.
            </p>
            <p>
              FieldCore is being built to eliminate that problem. One platform for every part of a field-service
              operation — and it was built by talking directly to the operators who run them.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="about-stats">
          {[
            { n: '15+', label: 'Industries served' },
            { n: '$0', label: 'Per-user fees — now or ever' },
            { n: '1', label: 'Platform to replace them all' },
          ].map((s) => (
            <div key={s.label} className="about-stat">
              <div className="about-stat-n">{s.n}</div>
              <div className="about-stat-l">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Values */}
      <section className="mkt-section mkt-section-cream">
        <div className="mkt-eyebrow">How we build</div>
        <h2 className="mkt-title mkt-title-dark" style={{ marginBottom: 8 }}>What guides us.</h2>
        <p className="mkt-sub mkt-sub-dark" style={{ marginBottom: 40 }}>
          These aren't aspirational values. They're the decisions we make every day.
        </p>
        <div className="about-values">
          {VALUES.map((v) => (
            <div key={v.title} className="about-value">
              <div className="about-value-icon">{v.icon}</div>
              <div className="about-value-title">{v.title}</div>
              <div className="about-value-body">{v.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Who we serve */}
      <section className="mkt-section mkt-section-white">
        <div style={{ maxWidth: 800 }}>
          <div className="mkt-eyebrow">Who we serve</div>
          <h2 className="mkt-title mkt-title-dark" style={{ marginBottom: 18 }}>Field-service operators.</h2>
          <p style={{ fontSize: 16, color: 'var(--sl)', lineHeight: 1.85, marginBottom: 18 }}>
            FieldCore is built for the owners and operators of field-service businesses — mobile detailers,
            HVAC techs, plumbers, electricians, landscapers, pressure washers, pool services, and dozens
            of other trades that send crews to customer locations to do skilled work.
          </p>
          <p style={{ fontSize: 16, color: 'var(--sl)', lineHeight: 1.85 }}>
            These are businesses that typically run between 1 and 50 employees, have recurring client
            relationships, and need software that works as fast as they do. We build for them specifically.
          </p>
        </div>
      </section>

      {/* CTA */}
      <div className="mkt-cta-strip">
        <h2 className="mkt-cta-title">Join us in building it.</h2>
        <p className="mkt-cta-sub">Start a free trial or explore career opportunities at FieldCore.</p>
        <div className="mkt-cta-btns">
          <Link href="/#cta" className="btn btn-sand btn-lg">Start free trial</Link>
          <Link href="/careers" className="btn btn-navy btn-lg">View careers</Link>
        </div>
      </div>
    </MarketingShell>
  );
}
