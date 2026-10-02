const verticals = [
  'Auto Detailing','HVAC','Plumbing','Landscaping','Pressure Washing',
  'Pest Control','Electrical','Pool Service','Mobile Mechanic','Fleet Washing',
];

export default function LogoBar() {
  return (
    <div id="logos">
      <div className="logos-inner">
        <span className="logos-lbl">Built for</span>
        <div className="logos-track">
          {verticals.map(v => (
            <span key={v} className="logo-vert">
              <span className="logo-dot" />{v}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
