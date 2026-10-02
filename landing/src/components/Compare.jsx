const rows = [
  { f: 'No-show arrival clock',           fc: '✓ Industry 1st', jobber: '—', hcp: '—', st: '—' },
  { f: 'Pre-charge advance notice',        fc: '✓ Native',       jobber: '—', hcp: '—', st: '—' },
  { f: '3-layer deposit system',           fc: '✓ Full system',  jobber: 'Basic', hcp: 'Basic', st: 'Limited' },
  { f: 'Business phone included in plan',  fc: '✓ Pro+',         jobber: '—', hcp: 'Add-on cost', st: '—' },
  { f: 'Smart Caller ID (9-zone)',         fc: '✓ Native',       jobber: '—', hcp: '—', st: '—' },
  { f: 'Travel fee auto-calculation',      fc: '✓ Native',       jobber: '—', hcp: '—', st: '—' },
  { f: 'Multi-entity SMB (unlimited LLCs)',fc: '✓ Native',       jobber: '—', hcp: '—', st: 'Enterprise only' },
  { f: 'Entry price (no per-user fees)',   fc: '$49',            jobber: '$39+', hcp: '$59+', st: '$400+' },
];

const isBold = (v) => v.startsWith('✓') || v === '$49';

export default function Compare() {
  return (
    <section id="compare">
      <div className="eyebrow-line" style={{ marginBottom: 4 }}>
        <span className="sec-eyebrow" style={{ marginBottom: 0 }}>Comparison</span>
      </div>
      <h2 className="sec-title sec-title-dark">How we&apos;re different.</h2>
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
        {rows.map(r => (
          <div key={r.f} className="ct-row">
            <div className="ct-cell feature">{r.f}</div>
            <div className="ct-cell fc">
              <span className={isBold(r.fc) ? 'ct-first' : 'ct-check'}>{r.fc}</span>
            </div>
            <div className="ct-cell">{r.jobber === '—' ? <span className="ct-x">—</span> : r.jobber}</div>
            <div className="ct-cell">{r.hcp === '—' ? <span className="ct-x">—</span> : r.hcp}</div>
            <div className="ct-cell">{r.st === '—' ? <span className="ct-x">—</span> : r.st}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
