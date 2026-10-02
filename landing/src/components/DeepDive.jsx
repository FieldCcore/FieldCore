'use client';
import { useEffect, useState } from 'react';

function fmt(t) {
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

const Chk = () => (
  <svg viewBox="0 0 12 12" fill="none">
    <path d="M2 6l3 3 5-5" stroke="#1E6B3C" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const DotHeader = ({ title }) => (
  <div className="dm-header">
    <div className="dm-dots">
      <div className="dm-dot" style={{ background: '#FF5F57' }} />
      <div className="dm-dot" style={{ background: '#FFBD2E' }} />
      <div className="dm-dot" style={{ background: '#28CA41' }} />
    </div>
    <span className="dm-title">{title}</span>
  </div>
);

const pts = [
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

export default function DeepDive() {
  const [time, setTime] = useState(24 * 60 + 12);

  useEffect(() => {
    const id = setInterval(() => setTime(t => (t > 0 ? t - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="dd-section">
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
            {pts.map(p => (
              <div key={p} className="ddp">
                <div className="ddp-check"><Chk /></div>
                <div className="ddp-text">{p}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="dd-mockup">
          <DotHeader title="DISPATCH · NO-SHOW ACTIVE" />
          <div className="dm-body">
            <div className="ns-strip">
              <div className="ns-pulse" />
              <div className="ns-text">Sarah Chen · 887 Pine St · Ceramic Coating</div>
              <div className="ns-timer">{fmt(time)}</div>
            </div>
            <div className="ns-info">
              <div className="ns-cell"><div className="ns-cl">Deposit on file</div><div className="ns-cv" style={{ color: 'var(--sd)' }}>$300 (25%)</div></div>
              <div className="ns-cell"><div className="ns-cl">Status</div><div className="ns-cv" style={{ color: '#E05555' }}>Not Present</div></div>
              <div className="ns-cell"><div className="ns-cl">Tech</div><div className="ns-cv">Danny R.</div></div>
              <div className="ns-cell"><div className="ns-cl">Contacts sent</div><div className="ns-cv" style={{ color: '#4EC87A' }}>2 / 2 ✓</div></div>
            </div>
            <div className="ns-btns">
              <button className="ns-btn" style={{ background: '#1E6B3C', color: 'white' }}>✓ Client Arrived</button>
              <button className="ns-btn" style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.5)' }}>Declare No-Show</button>
            </div>
            <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(255,255,255,.03)', borderRadius: 8, fontSize: 11, color: 'rgba(255,255,255,.3)', textAlign: 'center', fontFamily: 'var(--font-geist-mono)' }}>
              Jobber · Housecall Pro · ServiceTitan — None have this
            </div>
          </div>
        </div>
      </div>

      {/* Smart Caller ID */}
      <div className="dd-row flip">
        <div>
          <div className="dd-eyebrow">Smart Caller ID</div>
          <h3 className="dd-title">Know who&apos;s calling<br /><em>before you answer.</em></h3>
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
          <DotHeader title="SMART CALLER ID" />
          <div className="dm-body">
            <div className="ci-calling">
              <div className="ci-ring" />
              <span className="ci-lbl">Inbound · Business Line</span>
              <span style={{ fontFamily: 'var(--font-geist-mono)', fontSize: 9, color: 'rgba(255,255,255,.3)' }}>650ms</span>
            </div>
            <div className="ci-name">Thomas Garfield</div>
            <div className="ci-sub">VIP Client · (813) 555-0192</div>
            <div className="ci-grid">
              <div className="ci-cell"><div className="ci-cl">Last Job</div><div className="ci-cv">Today · Paint Corr.</div></div>
              <div className="ci-cell"><div className="ci-cl">Balance</div><div className="ci-cv" style={{ color: '#4EC87A' }}>$0 clear</div></div>
              <div className="ci-cell"><div className="ci-cl">Lifetime Value</div><div className="ci-cv" style={{ color: 'var(--sd)' }}>$8,400</div></div>
              <div className="ci-cell"><div className="ci-cl">Tier</div><div className="ci-cv">VIP</div></div>
            </div>
            <div className="ci-note">Note: Has lake house — mentioned wanting quote for second location after this call.</div>
            <div className="ci-btns">
              <button className="ns-btn" style={{ flex: 1, background: '#1E6B3C', color: 'white' }}>Answer</button>
              <button className="ns-btn" style={{ flex: 1, background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.4)' }}>Decline</button>
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
          <DotHeader title="CHARGE NOTICES" />
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
              <div className="cn-detail">Monthly Fleet · 72h notice · AP confirmed ✓</div>
            </div>
            <div className="cn-sms">
              &ldquo;Hi Rita — reminder from KMC Auto Spa. Your weekly Full Detail is Thursday. Your Mastercard ending
              in 8821 will be charged $320. Reply STOP to opt out.&rdquo;
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
