import MarketingShell from '@/components/MarketingShell';
import Link from 'next/link';

export const metadata = {
  title: 'Updates | FieldCore — Product Improvements & Release Notes',
  description: 'Follow FieldCore product updates, new features, improvements, and bug fixes.',
};

const UPDATES = [
  {
    date: 'September 2026',
    tags: [{ label: 'New', type: 'new' }, { label: 'Improved', type: 'improved' }],
    title: 'Projects V1 — Work Orders, Change Orders & Project Health',
    summary: 'FieldCore\'s Projects module is now live. Manage complex, multi-day service jobs with structured work orders, budget tracking, and project-level reporting.',
    bullets: [
      'Work Orders — break projects into individual tasks assigned to specific technicians',
      'Change Orders — issue and approve scope changes with automatic project value updates',
      'Budget vs Actual — track labor, materials, equipment, and subcontractor costs',
      'Project Health indicator — On Track, Attention, or Behind based on schedule and completion',
      'Asset & Equipment picker — attach vehicles and equipment to work orders',
      'Files & History tab — attach photos and documents, view the full activity log',
    ],
  },
  {
    date: 'August 2026',
    tags: [{ label: 'New', type: 'new' }],
    title: 'Multi-Tech Assignment — Assign Crews to Jobs',
    summary: 'Jobs can now be assigned to multiple technicians simultaneously. Build saved crews and dispatch them together from the Dispatch board.',
    bullets: [
      'Multi-member job assignments with primary and secondary technician roles',
      'Saved crews — build recurring crew configurations for faster dispatch',
      'Revenue attribution based on primary assignment only — no double-counting',
      'Full integration with the Dispatch board and Calendar',
    ],
  },
  {
    date: 'August 2026',
    tags: [{ label: 'New', type: 'new' }],
    title: 'Revenue Analytics — Forecasting, Operations & Customer Analytics',
    summary: 'The FieldCore Revenue workspace now includes three new analytical surfaces: Forecasting, Operations, and Customer Analytics.',
    bullets: [
      'Revenue Forecasting — earned vs booked vs projected with confidence scoring and pipeline view',
      'Operations Analytics — completion rate, commission tracking, team performance, and labor metrics',
      'Customer Analytics — LTV, churn risk detection, client segments, and top-client reporting',
      'Banking integration — connect your bank account to track cash position and reconcile payments',
    ],
  },
  {
    date: 'August 2026',
    tags: [{ label: 'New', type: 'new' }],
    title: 'Service Location Management',
    summary: 'Clients can now have multiple saved service locations. Each location stores address, GPS coordinates, and access instructions.',
    bullets: [
      'Multiple service locations per client with a primary location flag',
      'Per-location access instructions (gate codes, parking, entry notes)',
      'Location selected at job creation — no re-typing addresses',
      'Location shown on Dispatch map and included in technician notifications',
    ],
  },
  {
    date: 'July 2026',
    tags: [{ label: 'Improved', type: 'improved' }],
    title: 'Timezone-Accurate Scheduling',
    summary: 'Job scheduling now accurately handles multiple timezones. Technicians in different states from the business owner will no longer see shifted appointment times.',
    bullets: [
      'Explicit timezone selection at job creation — no implicit browser timezone conversion',
      'Scheduling engine converts times correctly through the full round-trip',
      'Business timezone and creator timezone tracked separately on each job',
      'Full IANA timezone support — over 110 global zones available in business settings',
    ],
  },
  {
    date: 'July 2026',
    tags: [{ label: 'New', type: 'new' }],
    title: 'Google Maps — Dispatch Map & Geocoding',
    summary: 'The Dispatch board now shows live job and technician positions on a Google Maps layer. All new jobs are geocoded automatically.',
    bullets: [
      'Live dispatch map with job markers and technician locations',
      'Automatic geocoding for all new jobs using full address (street, city, state, zip)',
      'Manual geocode retry for jobs with missing coordinates',
      'Dispatch legend moved to sidebar for cleaner map view',
    ],
  },
];

export default function UpdatesPage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section className="mkt-hero">
        <div className="mkt-hero-bg-lines" />
        <div className="mkt-hero-eyebrow">Updates</div>
        <h1 className="mkt-hero-title">
          What we've shipped.<br />
          <em>What's coming next.</em>
        </h1>
        <p className="mkt-hero-sub">
          Product improvements, new features, and release notes from the FieldCore team.
        </p>
      </section>

      {/* Updates list */}
      <section className="mkt-section mkt-section-white">
        <div className="updates-list">
          {UPDATES.map((update, i) => (
            <div key={i} className="update-item">
              <div>
                <div className="update-date">{update.date}</div>
                <div className="update-tags">
                  {update.tags.map((tag) => (
                    <span key={tag.label} className={`update-tag update-tag-${tag.type}`}>
                      {tag.label}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="update-title">{update.title}</div>
                <div className="update-summary">{update.summary}</div>
                <div className="update-bullets">
                  {update.bullets.map((bullet) => (
                    <div key={bullet} className="update-bullet">{bullet}</div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div className="mkt-cta-strip">
        <h2 className="mkt-cta-title">Try what we've built.</h2>
        <p className="mkt-cta-sub">Start a free trial and experience the latest FieldCore features.</p>
        <div className="mkt-cta-btns">
          <Link href="/#cta" className="btn btn-sand btn-lg">Start free trial</Link>
          <Link href="/features" className="btn btn-navy btn-lg">See all features</Link>
        </div>
      </div>
    </MarketingShell>
  );
}
