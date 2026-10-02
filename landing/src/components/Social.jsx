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

export default function Social() {
  return (
    <section id="social">
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
  );
}
