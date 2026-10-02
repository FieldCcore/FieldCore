const problems = [
  { t: 'No-show protection', b: "Client doesn't show. You drove 25 minutes. No deposit. No documentation. No recourse. The slot is gone.", cost: 'avg $4,200/yr lost' },
  { t: 'Surprise charge calls', b: 'Recurring client gets charged. Didn\'t know it was coming. Disputes filed. You lose the money and the client.', cost: '3–4 chargebacks/quarter' },
  { t: 'Personal = business', b: 'Your personal number is your business. Client history lives in iMessage. You answer unknowns blind every time.', cost: 'zero context on every call' },
  { t: 'Manual fleet billing', b: 'Commercial accounts billed manually every month. Hours per account. Invoices sent late. Cash flow delayed.', cost: '$3,840/yr in billing labor' },
  { t: 'Four disconnected tools', b: 'Square + Google Calendar + spreadsheets + personal phone. You are the integration layer. All day, every day.', cost: 'hours wasted daily' },
  { t: 'Multi-LLC nightmare', b: 'Running two businesses means two of everything. Two calendars, two Square accounts, two sets of problems.', cost: 'no platform solves this' },
];

export default function Problem() {
  return (
    <section id="problem">
      <div className="eyebrow-line">
        <span className="sec-eyebrow" style={{ marginBottom: 0 }}>The Problem</span>
      </div>
      <h2 className="sec-title sec-title-dark">
        You&apos;re running a real business<br />from a personal phone.
      </h2>
      <p className="sec-sub sec-sub-dark" style={{ marginTop: 14 }}>
        Every operator we talked to runs 4 disconnected tools and loses thousands every year to problems
        that should be solved by software.
      </p>
      <div className="problem-grid">
        {problems.map(p => (
          <div key={p.t} className="prob">
            <div className="prob-accent" />
            <div className="prob-t">{p.t}</div>
            <div className="prob-b">{p.b}</div>
            <div className="prob-cost">{p.cost}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
