const verts = [
  { name: 'Mobile Detailing' },
  { name: 'Pressure Washing' },
  { name: 'Landscaping' },
  { name: 'HVAC' },
  { name: 'Plumbing' },
  { name: 'Electrical' },
  { name: 'Pest Control' },
  { name: 'Pool Cleaning' },
  { name: 'Mobile Mechanic' },
  { name: 'Junk Removal' },
  { name: 'Window Tint / PPF' },
  { name: 'Appliance Repair' },
  { name: 'Garage Door' },
  { name: 'Flooring / Epoxy' },
  { name: 'Commercial Fleet Wash' },
];

export default function Verticals() {
  return (
    <section id="verticals">
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
            <span className="vc-name">{v.name}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
