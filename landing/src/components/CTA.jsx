'use client';
import { useState } from 'react';

export default function CTA() {
  const [email, setEmail] = useState('');

  return (
    <section id="cta">
      <div className="cta-inner">
        <h2 className="cta-title">
          Ready to run your business<br /><em>the right way?</em>
        </h2>
        <p className="cta-sub">
          Join the beta. First 100 operators get 3 months free. No credit card required. Cancel anytime.
        </p>
        <div className="cta-form">
          <input
            type="email"
            className="cta-input"
            placeholder="Your business email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <button className="btn btn-sand btn-lg">Start free →</button>
        </div>
        <p className="cta-note">No credit card required · 3 months free for beta operators · Cancel anytime</p>
      </div>
    </section>
  );
}
