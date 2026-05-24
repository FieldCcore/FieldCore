import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  PhoneOff, CreditCard, Phone, Receipt, FolderOpen, Building2,
  Timer, Bell, Map, MapPin, RefreshCw, Car, Droplets, Leaf,
  Snowflake, Wrench, Zap, Bug, Waves, Cog, Trash2, PaintBucket,
  Home, DoorOpen, Hammer, Truck, Check, StickyNote, Star,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import '../landing.css';

function fmt(t) {
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

const Chk = () => (
  <svg viewBox="0 0 12 12" fill="none">
    <path d="M2 6l3 3 5-5" stroke="#1E6B3C" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const problems = [
  { ico: PhoneOff,  t: 'No-show protection',     b: "Client doesn't show. You drove 25 minutes. No deposit. No documentation. No recourse. The slot is gone.", cost: 'avg $4,200/yr lost' },
  { ico: CreditCard,t: 'Surprise charge calls',  b: "Recurring client gets charged. Didn't know it was coming. Disputes filed. You lose the money and the client.", cost: '3–4 chargebacks/quarter' },
  { ico: Phone,     t: 'Personal = business',    b: 'Your personal number is your business. Client history lives in iMessage. You answer unknowns blind every time.', cost: 'zero context on every call' },
  { ico: Receipt,   t: 'Manual fleet billing',   b: 'Commercial accounts billed manually every month. Hours per account. Invoices sent late. Cash flow delayed.', cost: '$3,840/yr in billing labor' },
  { ico: FolderOpen,t: 'Four disconnected tools',b: 'Square + Google Calendar + spreadsheets + personal phone. You are the integration layer. All day, every day.', cost: 'hours wasted daily' },
  { ico: Building2, t: 'Multi-LLC nightmare',    b: 'Running two businesses means two of everything. Two calendars, two Square accounts, two sets of problems.', cost: 'no platform solves this' },
];

const feats = [
  { badge: 'INDUSTRY 1ST', ico: Timer,      t: 'No-Show Arrival Clock',    b: '25-minute GPS countdown. Two auto-texts to client. Deposit retained at zero automatically. GPS record created.', tier: 'Pro+' },
  { badge: 'INDUSTRY 1ST', ico: Phone,      t: 'Smart Caller ID',          b: 'Full 9-zone client profile before you answer. LTV, last job, balance, next appointment. Push when app is closed.', tier: 'Pro+' },
  { badge: 'INDUSTRY 1ST', ico: Bell,       t: 'Pre-Charge Notice',        b: '12, 24, 48, or 72-hour advance SMS before every recurring charge. Card update links auto-sent on reply.', tier: 'Pro+' },
  { badge: 'INDUSTRY 1ST', ico: Map,        t: 'Travel Fee Engine',        b: 'Auto-calculates road distance via Google Maps. Appears as a transparent line item on every invoice.', tier: 'Pro+' },
  { badge: null,            ico: MapPin,    t: 'Minute-Precise ETA',       b: '"Arriving at 2:18 PM." Real clock time. One tap. Not "in about 30 minutes." The exact time.', tier: 'All plans' },
  { badge: null,            ico: CreditCard,t: '3-Layer Deposit System',   b: 'Set by service type, client tier, and individual job simultaneously. VIP waivers. At-Risk mandatory deposits.', tier: 'Pro+' },
  { badge: null,            ico: Building2, t: 'Multi-Entity Dashboard',   b: 'Unlimited LLCs from one login. Separate P&L per entity. One tap to switch. No double-entry ever.', tier: 'Scale+' },
  { badge: null,            ico: RefreshCw, t: 'Fleet Billing Automation', b: 'Set commercial contracts once. Jobs generate. Invoices send. Payments collect. Zero manual steps monthly.', tier: 'Pro+' },
];

const plans = [
  {
    name: 'Solo', price: '$49', mo: '/month', target: '1 operator · Under $150K',
    feats: ['Client database + job scheduling', 'Stripe payments + auto-invoicing', 'Online booking widget', 'ETA sender — real clock time', 'Tech mobile app (iOS + Android)'],
    cta: 'Get started', featured: false,
  },
  {
    name: 'Pro', price: '$99', mo: '/month', target: '1–3 techs · $150K–$600K',
    badge: 'MOST POPULAR',
    feats: ['Everything in Solo', 'Business phone — included, not add-on', 'No-show clock + 3-layer deposits', 'Smart Caller ID (push when closed)', 'Pre-charge advance notices', 'Travel fee engine + route optimization', 'Fleet + recurring billing automation'],
    cta: 'Start free trial', featured: true,
  },
  {
    name: 'Scale', price: '$199', mo: '/month', target: '4–10 techs · $600K–$2M',
    feats: ['Everything in Pro', 'Multi-entity — unlimited LLCs', '3 phone numbers + call routing', 'GPS fleet tracking integration', 'Custom reports + API access', 'E-signature + white-label booking'],
    cta: 'Get started', featured: false,
  },
  {
    name: 'Custom', price: '$300+', mo: '/month', target: '10+ techs · $2M+',
    feats: ['Everything in Scale', 'Unlimited phone numbers', 'Dedicated Customer Success Manager', '99.9% uptime SLA', 'Custom feature development', 'Negotiated processing rate'],
    cta: 'Contact sales', featured: false,
  },
];

const compareRows = [
  { f: 'No-show arrival clock',          fc: '✓ Industry 1st', jobber: '—', hcp: '—', st: '—' },
  { f: 'Pre-charge advance notice',       fc: '✓ Native',       jobber: '—', hcp: '—', st: '—' },
  { f: '3-layer deposit system',          fc: '✓ Full system',  jobber: 'Basic', hcp: 'Basic', st: 'Limited' },
  { f: 'Business phone included in plan', fc: '✓ Pro+',         jobber: '—', hcp: 'Add-on cost', st: '—' },
  { f: 'Smart Caller ID (9-zone)',        fc: '✓ Native',       jobber: '—', hcp: '—', st: '—' },
  { f: 'Travel fee auto-calculation',     fc: '✓ Native',       jobber: '—', hcp: '—', st: '—' },
  { f: 'Multi-entity SMB (unlimited LLCs)', fc: '✓ Native',     jobber: '—', hcp: '—', st: 'Enterprise only' },
  { f: 'Entry price (no per-user fees)', fc: '$49',             jobber: '$39+', hcp: '$59+', st: '$400+' },
];

const testimonials = [
  {
    text: '"The no-show clock alone would have saved me over $4,000 last year. I had three ceramic coating appointments that didn\'t show — no deposit, no documentation, nothing. This fixes that completely."',
    initials: 'MK', name: 'Marcus K.', biz: 'KMC Auto Spa · Mobile Detailing · Florida',
  },
  {
    text: '"I was spending 8 hours a month manually billing my fleet accounts. Set it up once in FieldCore and I haven\'t thought about it since. That time goes to growing the business now."',
    initials: 'JR', name: 'James R.', biz: 'Clean Fleet Services · Commercial Washing',
  },
  {
    text: '"My clients were getting surprised by charges every month and calling to complain. Since I turned on the 48-hour notices I haven\'t had a single confused call. Not one."',
    initials: 'RG', name: 'Rosa G.', biz: 'Green Route Lawn Care · Landscaping',
  },
];

const verts = [
  { ico: Car,         name: 'Mobile Detailing' },
  { ico: Droplets,    name: 'Pressure Washing' },
  { ico: Leaf,        name: 'Landscaping' },
  { ico: Snowflake,   name: 'HVAC' },
  { ico: Wrench,      name: 'Plumbing' },
  { ico: Zap,         name: 'Electrical' },
  { ico: Bug,         name: 'Pest Control' },
  { ico: Waves,       name: 'Pool Cleaning' },
  { ico: Cog,         name: 'Mobile Mechanic' },
  { ico: Trash2,      name: 'Junk Removal' },
  { ico: PaintBucket, name: 'Window Tint / PPF' },
  { ico: Home,        name: 'Appliance Repair' },
  { ico: DoorOpen,    name: 'Garage Door' },
  { ico: Hammer,      name: 'Flooring / Epoxy' },
  { ico: Truck,       name: 'Commercial Fleet Wash' },
];

const nsPts = [
  'GPS arrival timestamp locked — irrefutable documentation',
  'Two automated client contacts during the 25-minute window',
  'Deposit retained automatically — no manual action needed',
  'At-Risk auto-flag after 2 no-shows within 90 days',
];
const callerPts = [
  'Full profile delivered in under 650ms — faster than a ring',
  'Push notification even when the app is completely closed',
  'Lifetime value, balance, and card status at a glance',
  'Business line included in Pro — your personal number stays private',
];
const chargePts = [
  '5 configurable notice windows per client — 12h to 1 week',
  'Client replies auto-classified — ack, reschedule, card change, cancel',
  'Stripe card update link auto-sent when client replies "card changed"',
  'TCPA compliant — opt-out processed automatically on any channel',
];

export default function Landing() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [time, setTime] = useState(24 * 60 + 12);
  const [scrolled, setScrolled] = useState(false);
  const [email, setEmail] = useState('');
  const [ctaDone, setCtaDone] = useState(false);

  useEffect(() => {
    if (!loading && user) nav('/dashboard', { replace: true });
  }, [user, loading, nav]);

  useEffect(() => {
    const id = setInterval(() => setTime(t => (t > 0 ? t - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (loading) return null;

  function handleCta(e) {
    e.preventDefault();
    if (email.trim()) setCtaDone(true);
    else nav('/login');
  }

  return (
    <div className="landing-page">

      {/* NAV */}
      <nav className={`site-nav${scrolled ? ' scrolled' : ''}`}>
        <a href="#" className="nav-logo">FIELDCORE<sup>™</sup></a>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#deepdive">How It Works</a>
          <a href="#pricing">Pricing</a>
          <a href="#verticals">Verticals</a>
          <a href="#compare">vs. Competitors</a>
        </div>
        <div className="nav-ctas">
          <Link to="/login" className="btn btn-ghost">Log in</Link>
          <a href="#cta" className="btn btn-sand">Start free trial</a>
        </div>
      </nav>

      {/* HERO */}
      <section className="lp-hero">
        <div className="hero-grain" />
        <div className="hero-lines" />
        <div className="hero-glow" />
        <div className="hero-glow2" />
        <div className="hero-inner">
          <div className="hero-badge">
            <div className="hero-badge-pulse" />
            <span className="hero-badge-text">Now in beta — 15 service verticals</span>
          </div>
          <h1 className="hero-h">
            The operating system<br />for <em>service businesses.</em>
          </h1>
          <p className="hero-sub">
            Replace Square, Google Calendar, your personal phone, and spreadsheets with one platform.
            No per-user fees. Ever.
          </p>
          <div className="hero-ctas">
            <a href="#cta" className="btn btn-sand btn-lg">Start free trial →</a>
            <a href="#deepdive" className="btn btn-outline btn-lg">See how it works</a>
          </div>
          <div className="hero-stats">
            <div className="hstat">
              <div className="hstat-n">$49<span>/mo</span></div>
              <div className="hstat-l">Starting price</div>
            </div>
            <div className="hstat">
              <div className="hstat-n">$0</div>
              <div className="hstat-l">Per-user fees. Ever.</div>
            </div>
            <div className="hstat">
              <div className="hstat-n">8</div>
              <div className="hstat-l">Industry-first features</div>
            </div>
            <div className="hstat">
              <div className="hstat-n">15</div>
              <div className="hstat-l">Service verticals</div>
            </div>
          </div>
        </div>

        <div className="hero-right">
          <div className="hero-card">
            <div className="hc-header">
              <div className="hc-dots">
                <div className="hc-dot" style={{ background: '#FF5F57' }} />
                <div className="hc-dot" style={{ background: '#FFBD2E' }} />
                <div className="hc-dot" style={{ background: '#28CA41' }} />
              </div>
              <span className="hc-title">DISPATCH · LIVE</span>
            </div>
            <div className="hc-body">
              <div className="hc-alert">
                <div className="hc-alert-dot" />
                <div className="hc-alert-text">No-Show Clock · Sarah Chen · Ceramic Coat</div>
                <div className="hc-alert-time">{fmt(time)}</div>
              </div>
              <div className="hc-row">
                <div className="hc-avatar">DR</div>
                <div className="hc-info">
                  <div className="hc-name">Danny R. — Full Detail</div>
                  <div className="hc-detail">Rita Okafor · Est. 2:30 PM</div>
                </div>
                <span className="hc-tag tag-green">Active</span>
              </div>
              <div className="hc-row">
                <div className="hc-avatar">JM</div>
                <div className="hc-info">
                  <div className="hc-name">Javier M. — Fleet Wash</div>
                  <div className="hc-detail">XYZ Ford · 14/22 vehicles</div>
                </div>
                <span className="hc-tag tag-green">Active</span>
              </div>
              <div className="hc-row">
                <div className="hc-avatar">CV</div>
                <div className="hc-info">
                  <div className="hc-name">Carlos V. — Available</div>
                  <div className="hc-detail">Holloway 3:30 PM next</div>
                </div>
                <span className="hc-tag tag-sand">Standby</span>
              </div>
              <div className="hc-caller">
                <div className="hc-caller-top">
                  <div className="hc-caller-ring" />
                  <span className="hc-caller-lbl">Inbound · Business Line</span>
                </div>
                <div className="hc-caller-body">
                  <div className="hc-caller-name">Thomas Garfield</div>
                  <div className="hc-caller-sub">VIP · $8,400 LTV · Last: Paint Correction today</div>
                  <div className="hc-caller-grid">
                    <div className="hc-cell">
                      <div className="hc-cell-l">Balance</div>
                      <div className="hc-cell-v" style={{ color: '#4EC87A' }}>$0 clear</div>
                    </div>
                    <div className="hc-cell">
                      <div className="hc-cell-l">LTV</div>
                      <div className="hc-cell-v" style={{ color: '#D6B58A' }}>$8,400</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* LOGO BAR */}
      <div className="logos-bar">
        <div className="logos-inner">
          <span className="logos-lbl">Built for</span>
          <div className="logos-track">
            {['Auto Detailing','HVAC','Plumbing','Landscaping','Pressure Washing','Pest Control','Electrical','Pool Service','Mobile Mechanic','Fleet Washing'].map(v => (
              <span key={v} className="logo-vert">
                <span className="logo-dot" />{v}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* PROBLEM */}
      <section className="lp-problem">
        <div className="eyebrow-line">
          <span className="sec-eyebrow" style={{ marginBottom: 0 }}>The Problem</span>
        </div>
        <h2 className="sec-title sec-title-dark">
          You're running a real business<br />from a personal phone.
        </h2>
        <p className="sec-sub sec-sub-dark" style={{ marginTop: 14 }}>
          Every operator we talked to runs 4 disconnected tools and loses thousands every year to problems
          that should be solved by software.
        </p>
        <div className="problem-grid">
          {problems.map(p => (
            <div key={p.t} className="prob">
              <div className="prob-accent" />
              <div className="prob-ico" style={{ color: 'var(--sd)' }}><p.ico size={26} /></div>
              <div className="prob-t">{p.t}</div>
              <div className="prob-b">{p.b}</div>
              <div className="prob-cost">{p.cost}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="lp-features">
        <div className="feat-header">
          <div>
            <div className="sec-eyebrow" style={{ marginBottom: 12 }}>Core Features</div>
            <h2 className="sec-title sec-title-light">
              8 features operators asked for.<br />
              <em style={{ color: '#D6B58A', fontStyle: 'italic' }}>Every one built.</em>
            </h2>
          </div>
          <p className="sec-sub sec-sub-light" style={{ maxWidth: 340 }}>
            Not adapted from salon software. Not a generic CRM. Built from operator conversations about real problems.
          </p>
        </div>
        <div className="feat-grid">
          {feats.map(f => (
            <div key={f.t} className="feat">
              {f.badge && <span className="feat-badge feat-badge-ex">{f.badge}</span>}
              <div className="feat-ico" style={{ color: 'var(--sd)' }}><f.ico size={24} /></div>
              <div className="feat-t">{f.t}</div>
              <div className="feat-b">{f.b}</div>
              <span className="feat-tier">{f.tier}</span>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="deepdive" className="lp-deepdive">
        <div className="dd-intro">
          <div className="eyebrow-line">
            <span className="sec-eyebrow" style={{ marginBottom: 0 }}>How It Works</span>
          </div>
          <h2 className="sec-title sec-title-dark" style={{ marginBottom: 8 }}>See it in action.</h2>
          <p className="sec-sub sec-sub-dark">Every feature built around a real operator problem.</p>
        </div>

        {/* No-Show Clock */}
        <div className="dd-row">
          <div>
            <div className="dd-eyebrow">No-Show Arrival Clock</div>
            <h3 className="dd-title">The $4,200 problem.<br /><em>Solved automatically.</em></h3>
            <p className="dd-body">
              Tech checks in on GPS arrival. 25-minute countdown starts. Two automated texts go to the client.
              If they do not show — deposit retained, tech released, GPS record created. No manual steps. No awkward conversations.
            </p>
            <div className="dd-pts">
              {nsPts.map(p => (
                <div key={p} className="ddp">
                  <div className="ddp-check"><Chk /></div>
                  <div className="ddp-text">{p}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="dd-mockup">
            <div className="dm-header">
              <div className="dm-dots">
                <div className="dm-dot" style={{ background: '#FF5F57' }} />
                <div className="dm-dot" style={{ background: '#FFBD2E' }} />
                <div className="dm-dot" style={{ background: '#28CA41' }} />
              </div>
              <span className="dm-title">DISPATCH · NO-SHOW ACTIVE</span>
            </div>
            <div className="dm-body">
              <div className="lp-ns-strip">
                <div className="lp-ns-pulse" />
                <div className="lp-ns-text">Sarah Chen · 887 Pine St · Ceramic Coating</div>
                <div className="lp-ns-timer">{fmt(time)}</div>
              </div>
              <div className="lp-ns-info">
                <div className="lp-ns-cell"><div className="lp-ns-cl">Deposit on file</div><div className="lp-ns-cv" style={{ color: '#D6B58A' }}>$300 (25%)</div></div>
                <div className="lp-ns-cell"><div className="lp-ns-cl">Status</div><div className="lp-ns-cv" style={{ color: '#E05555' }}>Not Present</div></div>
                <div className="lp-ns-cell"><div className="lp-ns-cl">Tech</div><div className="lp-ns-cv">Danny R.</div></div>
                <div className="lp-ns-cell"><div className="lp-ns-cl">Contacts sent</div><div className="lp-ns-cv" style={{ color: '#4EC87A' }}>2 / 2 ✓</div></div>
              </div>
              <div className="lp-ns-btns">
                <button className="lp-ns-btn" style={{ background: '#1E6B3C', color: 'white', display: 'flex', alignItems: 'center', gap: 5 }}><Check size={13} strokeWidth={2.5} /> Client Arrived</button>
                <button className="lp-ns-btn" style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.5)' }}>Declare No-Show</button>
              </div>
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(255,255,255,.03)', borderRadius: 8, fontSize: 11, color: 'rgba(255,255,255,.3)', textAlign: 'center', fontFamily: "'DM Mono', monospace" }}>
                Jobber · Housecall Pro · ServiceTitan — None have this
              </div>
            </div>
          </div>
        </div>

        {/* Smart Caller ID */}
        <div className="dd-row flip">
          <div>
            <div className="dd-eyebrow">Smart Caller ID</div>
            <h3 className="dd-title">Know who's calling<br /><em>before you answer.</em></h3>
            <p className="dd-body">
              Every inbound call triggers a full 9-zone client profile in under 650ms. Name, LTV, last job,
              open balance, next appointment, card status, and your pinned note. Even when the app is closed.
            </p>
            <div className="dd-pts">
              {callerPts.map(p => (
                <div key={p} className="ddp">
                  <div className="ddp-check"><Chk /></div>
                  <div className="ddp-text">{p}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="dd-mockup">
            <div className="dm-header">
              <div className="dm-dots">
                <div className="dm-dot" style={{ background: '#FF5F57' }} />
                <div className="dm-dot" style={{ background: '#FFBD2E' }} />
                <div className="dm-dot" style={{ background: '#28CA41' }} />
              </div>
              <span className="dm-title">SMART CALLER ID</span>
            </div>
            <div className="dm-body">
              <div className="ci-calling">
                <div className="ci-ring" />
                <span className="ci-lbl">Inbound · Business Line</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,.3)' }}>650ms</span>
              </div>
              <div className="ci-name">Thomas Garfield</div>
              <div className="ci-sub">VIP Client · (813) 555-0192</div>
              <div className="ci-grid">
                <div className="ci-cell"><div className="ci-cl">Last Job</div><div className="ci-cv">Today · Paint Corr.</div></div>
                <div className="ci-cell"><div className="ci-cl">Balance</div><div className="ci-cv" style={{ color: '#4EC87A' }}>$0 clear</div></div>
                <div className="ci-cell"><div className="ci-cl">Lifetime Value</div><div className="ci-cv" style={{ color: '#D6B58A' }}>$8,400</div></div>
                <div className="ci-cell"><div className="ci-cl">Tier</div><div className="ci-cv" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Star size={12} fill="currentColor" strokeWidth={0} />VIP</div></div>
              </div>
              <div className="ci-note" style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}><StickyNote size={13} style={{ flexShrink: 0, marginTop: 1 }} /> Has lake house — mentioned wanting quote for second location after this call.</div>
              <div className="ci-btns">
                <button className="lp-ns-btn" style={{ flex: 1, background: '#1E6B3C', color: 'white' }}>Answer</button>
                <button className="lp-ns-btn" style={{ flex: 1, background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.4)' }}>Decline</button>
              </div>
            </div>
          </div>
        </div>

        {/* Pre-Charge Notice */}
        <div className="dd-row">
          <div>
            <div className="dd-eyebrow">Pre-Charge Advance Notice</div>
            <h3 className="dd-title">Zero surprise chargebacks.<br /><em>Guaranteed.</em></h3>
            <p className="dd-body">
              Every recurring client gets a text before you charge them. 12, 24, 48, or 72 hours — you decide per client.
              Card update requests get Stripe links auto-sent. Cancellations trigger manager alerts. You stay in control.
            </p>
            <div className="dd-pts">
              {chargePts.map(p => (
                <div key={p} className="ddp">
                  <div className="ddp-check"><Chk /></div>
                  <div className="ddp-text">{p}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="dd-mockup">
            <div className="dm-header">
              <div className="dm-dots">
                <div className="dm-dot" style={{ background: '#FF5F57' }} />
                <div className="dm-dot" style={{ background: '#FFBD2E' }} />
                <div className="dm-dot" style={{ background: '#28CA41' }} />
              </div>
              <span className="dm-title">CHARGE NOTICES</span>
            </div>
            <div className="dm-body">
              <div className="cn-windows">
                <div className="cn-win"><div className="cn-win-t">12h</div><div className="cn-win-l">Same-day</div></div>
                <div className="cn-win active"><div className="cn-win-t">24h</div><div className="cn-win-l">Default</div></div>
                <div className="cn-win"><div className="cn-win-t">48h</div><div className="cn-win-l">Commercial</div></div>
                <div className="cn-win"><div className="cn-win-t">72h</div><div className="cn-win-l">Fleet/AP</div></div>
              </div>
              <div className="cn-card">
                <div className="cn-row"><span className="cn-name">Rita Okafor</span><span className="cn-amt">$320</span></div>
                <div className="cn-detail">Weekly Full Detail · 24h notice sent · Visa ••8821</div>
              </div>
              <div className="cn-card" style={{ marginBottom: 14 }}>
                <div className="cn-row"><span className="cn-name">XYZ Ford Dealership</span><span className="cn-amt">$1,650</span></div>
                <div className="cn-detail">Monthly Fleet · 72h notice · AP confirmed</div>
              </div>
              <div className="cn-sms">
                "Hi Rita — reminder from KMC Auto Spa. Your weekly Full Detail is Thursday. Your Mastercard ending
                in 8821 will be charged $320. Reply STOP to opt out."
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="lp-pricing">
        <div className="sec-eyebrow" style={{ marginBottom: 12 }}>Pricing</div>
        <h2 className="sec-title sec-title-light">
          Simple pricing.<br /><em style={{ color: '#D6B58A', fontStyle: 'italic' }}>No surprises.</em>
        </h2>
        <p className="sec-sub sec-sub-light" style={{ marginTop: 12 }}>
          No per-user fees at any tier. No setup fees. Cancel anytime.
        </p>
        <div className="pricing-grid">
          {plans.map(p => (
            <div key={p.name} className={`plan${p.featured ? ' featured' : ''}`}>
              {p.badge && <div className="plan-badge">{p.badge}</div>}
              <div className="plan-name">{p.name}</div>
              <div className="plan-price">{p.price}</div>
              <div className="plan-mo">{p.mo}</div>
              <div className="plan-target">{p.target}</div>
              <div className="plan-div" />
              <div className="plan-feats">
                {p.feats.map(f => (
                  <div key={f} className="pf">
                    <span className="pf-check" style={{ display: 'flex' }}><Check size={12} strokeWidth={2.5} /></span>
                    <span className="pf-text">{f}</span>
                  </div>
                ))}
              </div>
              <Link to="/login" className={`plan-cta ${p.featured ? 'plan-cta-featured' : 'plan-cta-default'}`} style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 24, padding: 12, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
        <p className="pricing-note">
          No per-user fees · No setup fees · Cancel anytime · <span>No surprises</span>
        </p>
      </section>

      {/* VERTICALS */}
      <section id="verticals" className="lp-verticals">
        <div className="eyebrow-line" style={{ marginBottom: 4 }}>
          <span className="sec-eyebrow" style={{ marginBottom: 0 }}>15 Verticals</span>
        </div>
        <h2 className="sec-title sec-title-dark">Built for your industry.</h2>
        <p className="sec-sub sec-sub-dark" style={{ marginTop: 12 }}>
          Every feature came from operators in these verticals describing real problems.
          Not market research. Real conversations.
        </p>
        <div className="vert-grid">
          {verts.map(v => (
            <div key={v.name} className="vc">
              <span className="vc-ico" style={{ color: 'var(--sl)' }}><v.ico size={20} /></span>
              <span className="vc-name">{v.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* COMPARE */}
      <section id="compare" className="lp-compare">
        <div className="eyebrow-line" style={{ marginBottom: 4 }}>
          <span className="sec-eyebrow" style={{ marginBottom: 0 }}>Comparison</span>
        </div>
        <h2 className="sec-title sec-title-dark">How we're different.</h2>
        <p className="sec-sub sec-sub-dark" style={{ marginTop: 12 }}>
          Eight features no other platform has. Verified May 2026.
        </p>
        <div className="compare-table">
          <div className="ct-head">
            <div className="ct-hcell">Feature</div>
            <div className="ct-hcell fc">FieldCore</div>
            <div className="ct-hcell">Jobber</div>
            <div className="ct-hcell">Housecall Pro</div>
            <div className="ct-hcell">ServiceTitan</div>
          </div>
          {compareRows.map(r => (
            <div key={r.f} className="ct-row">
              <div className="ct-cell feature">{r.f}</div>
              <div className="ct-cell fc">
                <span className={r.fc.startsWith('✓') || r.fc === '$49' ? 'ct-first' : 'ct-check'}>{r.fc}</span>
              </div>
              <div className="ct-cell">{r.jobber === '—' ? <span className="ct-x">—</span> : r.jobber}</div>
              <div className="ct-cell">{r.hcp === '—' ? <span className="ct-x">—</span> : r.hcp}</div>
              <div className="ct-cell">{r.st === '—' ? <span className="ct-x">—</span> : r.st}</div>
            </div>
          ))}
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="lp-social">
        <div className="sec-eyebrow" style={{ marginBottom: 12 }}>Operator Feedback</div>
        <h2 className="sec-title sec-title-light">What operators are saying.</h2>
        <div className="testi-grid">
          {testimonials.map(t => (
            <div key={t.name} className="testi">
              <p className="testi-text">{t.text}</p>
              <div className="testi-author">
                <div className="testi-avatar">{t.initials}</div>
                <div>
                  <div className="testi-name">{t.name}</div>
                  <div className="testi-biz">{t.biz}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section id="cta" className="lp-cta">
        <div className="cta-inner">
          <h2 className="cta-title">
            Ready to run your business<br /><em>the right way?</em>
          </h2>
          <p className="cta-sub">
            Join the beta. First 100 operators get 3 months free. No credit card required. Cancel anytime.
          </p>
          {ctaDone ? (
            <p style={{ fontSize: 16, fontWeight: 600, color: '#1E6B3C', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Check size={18} strokeWidth={2.5} /> You're on the list! We'll be in touch soon.</p>
          ) : (
            <form className="cta-form" onSubmit={handleCta}>
              <input
                type="email"
                className="cta-input"
                placeholder="Your business email"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
              <button type="submit" className="btn btn-sand btn-lg">Start free →</button>
            </form>
          )}
          <p className="cta-note">No credit card required · 3 months free for beta operators · Cancel anytime</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="footer-top">
          <div>
            <div className="footer-brand-name">FIELDCORE<sup>™</sup></div>
            <p className="footer-brand-tag">The operating system for service businesses.</p>
          </div>
          <div>
            <div className="footer-col-title">Product</div>
            <div className="footer-links">
              <a href="#features">Features</a>
              <a href="#pricing">Pricing</a>
              <a href="#verticals">Verticals</a>
              <a href="#compare">vs. Competitors</a>
            </div>
          </div>
          <div>
            <div className="footer-col-title">Company</div>
            <div className="footer-links">
              <a href="#">About</a>
              <a href="#">Blog</a>
              <a href="#">Careers</a>
              <a href="#">Contact</a>
            </div>
          </div>
          <div>
            <div className="footer-col-title">Legal</div>
            <div className="footer-links">
              <a href="#">Terms of Service</a>
              <a href="#">Privacy Policy</a>
              <a href="#">SMS Terms</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span className="footer-copy">© 2026 FieldCore Inc. · Delaware C-Corp · All rights reserved.</span>
          <div className="footer-legal">
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">SMS Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
