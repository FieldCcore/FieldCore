import MarketingShell from '@/components/MarketingShell';
import FaqAccordion from '@/components/FaqAccordion';
import Link from 'next/link';

export const metadata = {
  title: 'FAQ | FieldCore — Frequently Asked Questions',
  description: 'Answers to common questions about FieldCore — features, pricing, plans, and getting started.',
};

export default function FaqPage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section className="mkt-hero">
        <div className="mkt-hero-bg-lines" />
        <div className="mkt-hero-eyebrow">FAQ</div>
        <h1 className="mkt-hero-title">
          Common questions about<br />
          <em>FieldCore.</em>
        </h1>
        <p className="mkt-hero-sub">
          Find answers about features, pricing, and getting started.
          Can't find what you're looking for? Contact us directly.
        </p>
      </section>

      {/* Accordion */}
      <section className="mkt-section mkt-section-white">
        <FaqAccordion />
      </section>

      {/* CTA */}
      <div className="mkt-cta-strip">
        <h2 className="mkt-cta-title">Still have questions?</h2>
        <p className="mkt-cta-sub">Our team is happy to walk you through anything.</p>
        <div className="mkt-cta-btns">
          <Link href="/contact" className="btn btn-sand btn-lg">Contact us</Link>
          <Link href="/#cta" className="btn btn-navy btn-lg">Start free trial</Link>
        </div>
      </div>
    </MarketingShell>
  );
}
