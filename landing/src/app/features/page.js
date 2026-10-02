import MarketingShell from '@/components/MarketingShell';
import Link from 'next/link';

export const metadata = {
  title: 'Features | FieldCore — Field Service Management Software',
  description: 'One platform for scheduling, dispatch, clients, projects, invoicing, payments, communications, and team management. Built for field-service businesses.',
};

const CATEGORIES = [
  {
    tag: 'Scheduling',
    title: 'Scheduling & Calendar',
    desc: 'Manage your entire schedule from one place. Every job, every technician, every day.',
    items: [
      { icon: '📅', title: 'Drag-and-Drop Calendar', desc: 'Assign and reschedule jobs instantly. Day, week, and multi-day views.', tier: 'All plans' },
      { icon: '🔁', title: 'Recurring Services', desc: 'Set up weekly, bi-weekly, monthly, or custom recurring jobs. Billing runs automatically.', tier: 'Pro+' },
      { icon: '📍', title: 'Minute-Precise ETA', desc: '"Arriving at 2:18 PM." Real clock time, one tap. Not "in about 30 minutes."', tier: 'All plans' },
      { icon: '🛣️', title: 'Route Optimization', desc: 'Sequence your day by distance and minimize drive time between jobs.', tier: 'All plans' },
      { icon: '📋', title: 'Multi-Day Jobs', desc: 'Schedule work that spans multiple days with daily session tracking.', tier: 'Pro+' },
      { icon: '⚙️', title: 'Booking Windows', desc: 'Offer customers selectable arrival windows that fit your schedule.', tier: 'All plans' },
    ],
  },
  {
    tag: 'Dispatch',
    title: 'Dispatch',
    desc: 'See your entire operation on a live map. Assign jobs, track crews, coordinate in real time.',
    items: [
      { icon: '🗺️', title: 'Live Dispatch Map', desc: 'View all active jobs and technician locations in real time.', tier: 'Pro+' },
      { icon: '👥', title: 'Multi-Tech Assignment', desc: 'Assign multiple technicians to a single job. Manage crew compositions.', tier: 'Pro+' },
      { icon: '🚗', title: 'GPS Fleet Tracking', desc: 'See where your vehicles are and how long jobs are taking.', tier: 'Scale+' },
      { icon: '📡', title: 'Live Job Status', desc: 'Track job progress from unassigned through completion without calling your team.', tier: 'All plans' },
    ],
  },
  {
    tag: 'Clients',
    title: 'Client Management',
    desc: 'A complete client record for every customer — history, locations, notes, preferences, and communication.',
    items: [
      { icon: '🧾', title: 'Client Profiles', desc: 'Full history of every job, invoice, payment, and note for each customer.', tier: 'All plans' },
      { icon: '📍', title: 'Multiple Service Locations', desc: 'Manage multiple addresses per client. Save access notes, gate codes, and parking instructions.', tier: 'All plans' },
      { icon: '⭐', title: 'Smart Caller ID', desc: 'See the full client profile before you answer — LTV, last job, balance, next appointment.', tier: 'Pro+', badge: 'INDUSTRY 1ST' },
      { icon: '🔍', title: 'Client Search & Filter', desc: 'Find any client instantly by name, phone, email, or address.', tier: 'All plans' },
      { icon: '📊', title: 'Customer Analytics', desc: 'LTV, churn risk, customer segments, and top-client reporting.', tier: 'Pro+' },
    ],
  },
  {
    tag: 'Projects',
    title: 'Projects & Work Orders',
    desc: 'For complex jobs that require coordination across multiple days, tasks, and team members.',
    items: [
      { icon: '🏗️', title: 'Project Management', desc: 'Track projects with work orders, timelines, budgets, and progress reporting.', tier: 'Pro+' },
      { icon: '📝', title: 'Work Orders', desc: 'Break projects into discrete work orders. Assign to specific technicians and track completion.', tier: 'Pro+' },
      { icon: '✅', title: 'Task Checklists', desc: 'Attach completion checklists to any work order.', tier: 'Pro+' },
      { icon: '💰', title: 'Budget vs Actual', desc: 'Track estimated vs actual costs across labor, materials, equipment, and subcontractors.', tier: 'Pro+' },
      { icon: '🔄', title: 'Change Orders', desc: 'Issue change orders with approval tracking. Approved changes update project value automatically.', tier: 'Pro+' },
      { icon: '📁', title: 'File Attachments', desc: 'Attach photos, documents, and contracts to any project.', tier: 'All plans' },
    ],
  },
  {
    tag: 'Invoices',
    title: 'Invoices & Payments',
    desc: 'Get paid faster with professional invoices, online payments, and automated billing.',
    items: [
      { icon: '🧾', title: 'Professional Invoices', desc: 'Generate invoices automatically at job completion. Send via SMS or email.', tier: 'All plans' },
      { icon: '💳', title: 'Online Payments', desc: 'Accept credit cards directly from your invoice. Funds deposited to your bank account.', tier: 'All plans' },
      { icon: '📦', title: '3-Layer Deposit System', desc: 'Set deposit requirements by service type, client tier, and individual job simultaneously. VIP waivers built in.', tier: 'Pro+', badge: 'INDUSTRY 1ST' },
      { icon: '💵', title: 'Card on File', desc: 'Store cards securely and charge with one tap after job completion.', tier: 'All plans' },
      { icon: '🔔', title: 'Pre-Charge Notice', desc: '12, 24, 48, or 72-hour advance SMS before every recurring charge. Card update links auto-sent on reply.', tier: 'Pro+', badge: 'INDUSTRY 1ST' },
      { icon: '🧮', title: 'Travel Fee Engine', desc: 'Auto-calculates road distance via Google Maps. Appears as a transparent line item on every invoice.', tier: 'Pro+', badge: 'INDUSTRY 1ST' },
    ],
  },
  {
    tag: 'Estimates',
    title: 'Estimates',
    desc: 'Send professional estimates, collect e-signatures, and convert to invoices in one click.',
    items: [
      { icon: '📄', title: 'Estimate Builder', desc: 'Build itemized estimates with line items, quantities, and descriptions.', tier: 'All plans' },
      { icon: '✍️', title: 'E-Signature', desc: 'Customers sign estimates electronically from their phone. No printing or scanning.', tier: 'All plans' },
      { icon: '🔃', title: 'Convert to Invoice', desc: 'Turn an approved estimate into an invoice in one click. No re-entry.', tier: 'All plans' },
    ],
  },
  {
    tag: 'Team',
    title: 'Team Management',
    desc: 'Manage your technicians, permissions, and performance from one dashboard.',
    items: [
      { icon: '👤', title: 'Role-Based Access', desc: 'Owner, manager, technician, and staff roles. Each sees only what they need.', tier: 'All plans' },
      { icon: '📱', title: 'Mobile App', desc: 'Technicians clock in, complete checklists, collect signatures, and send ETAs from the field.', tier: 'All plans' },
      { icon: '📈', title: 'Team Performance', desc: 'Track completion rates, commissions, and production value per technician.', tier: 'Pro+' },
      { icon: '💸', title: 'Commission Tracking', desc: 'Define commission rules per technician. Track pending, approved, and paid commissions.', tier: 'Pro+' },
    ],
  },
  {
    tag: 'Communications',
    title: 'Communications',
    desc: 'A business phone system built into your platform. Every call and text tied to a client record.',
    items: [
      { icon: '📞', title: 'Business Phone Number', desc: 'A dedicated business number included in your plan. Keep business and personal separate.', tier: 'Pro+' },
      { icon: '💬', title: 'Two-Way SMS', desc: 'Text customers directly from the platform. All conversations saved to the client record.', tier: 'Pro+' },
      { icon: '🔔', title: 'No-Show Arrival Clock', desc: '25-minute GPS countdown. Two auto-texts to client. Deposit retained at zero automatically.', tier: 'Pro+', badge: 'INDUSTRY 1ST' },
      { icon: '📲', title: 'Appointment Reminders', desc: 'Automated SMS reminders sent before every scheduled job. Reduce no-shows.', tier: 'All plans' },
      { icon: '⬅️', title: 'Missed Call Text Back', desc: 'When you miss a call, FieldCore automatically texts the caller to keep the conversation going.', tier: 'Pro+' },
      { icon: '📼', title: 'Call Recording', desc: 'Record and review calls. Protect your business and train your team.', tier: 'Pro+' },
    ],
  },
  {
    tag: 'Reporting',
    title: 'Reporting & Revenue',
    desc: 'Understand your business with financial analytics, forecasting, and operational reporting.',
    items: [
      { icon: '📊', title: 'Revenue Dashboard', desc: 'Gross revenue, cash in, AR aging, and net profit in one view.', tier: 'Pro+' },
      { icon: '🔮', title: 'Revenue Forecasting', desc: 'Earned vs booked vs projected revenue with confidence scoring.', tier: 'Pro+' },
      { icon: '🏢', title: 'Multi-Entity Management', desc: 'Unlimited LLCs from one login. Separate P&L per entity. One tap to switch.', tier: 'Scale+', badge: 'INDUSTRY 1ST' },
      { icon: '🚛', title: 'Fleet Billing Automation', desc: 'Set commercial contracts once. Jobs generate. Invoices send. Payments collect. Zero manual steps.', tier: 'Pro+' },
    ],
  },
];

const Chk = () => (
  <svg viewBox="0 0 10 10" fill="none" style={{ width: 9, height: 9 }}>
    <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="#1E6B3C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function FeaturesPage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section className="mkt-hero">
        <div className="mkt-hero-bg-lines" />
        <div className="mkt-hero-eyebrow">Features</div>
        <h1 className="mkt-hero-title">
          One system for your entire<br />
          <em>field operation.</em>
        </h1>
        <p className="mkt-hero-sub">
          Everything your field-service business needs — scheduling, dispatch, clients, projects,
          invoicing, payments, communications, and team management — in a single platform.
        </p>
        <div className="mkt-hero-ctas">
          <Link href="/#cta" className="btn btn-sand btn-lg">Start free trial</Link>
          <Link href="/pricing" className="btn btn-outline btn-lg">See pricing</Link>
        </div>
      </section>

      {/* Feature categories */}
      <section className="mkt-section mkt-section-navy">
        {CATEGORIES.map((cat) => (
          <div key={cat.tag} className="feat-cat">
            <div className="feat-cat-header">
              <div className="feat-cat-tag">{cat.tag}</div>
              <div className="feat-cat-title">{cat.title}</div>
              <div className="feat-cat-desc">{cat.desc}</div>
            </div>
            <div className="feat-cat-grid">
              {cat.items.map((item) => (
                <div key={item.title} className="feat-item">
                  {item.badge && <span className="feat-badge feat-badge-ex">{item.badge}</span>}
                  <div className="feat-item-icon">{item.icon}</div>
                  <div className="feat-item-title">{item.title}</div>
                  <div className="feat-item-desc">{item.desc}</div>
                  <span className="feat-item-tier">{item.tier}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Plan legend */}
      <section className="mkt-section mkt-section-cream" style={{ paddingTop: 56, paddingBottom: 56 }}>
        <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-geist-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--st)' }}>Plan availability:</span>
          {['All plans', 'Pro+', 'Scale+'].map((tier) => (
            <span key={tier} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--sl)' }}>
              <span style={{ background: 'rgba(214,181,138,.12)', color: 'var(--sd2)', fontFamily: 'var(--font-geist-mono)', fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, letterSpacing: '.06em' }}>{tier}</span>
            </span>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div className="mkt-cta-strip">
        <h2 className="mkt-cta-title">Ready to run a better operation?</h2>
        <p className="mkt-cta-sub">Start your free trial today. No credit card required.</p>
        <div className="mkt-cta-btns">
          <Link href="/#cta" className="btn btn-sand btn-lg">Start free trial</Link>
          <Link href="/pricing" className="btn btn-navy btn-lg">See pricing</Link>
        </div>
      </div>
    </MarketingShell>
  );
}
