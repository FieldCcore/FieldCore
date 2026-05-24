import React, { useState, useEffect } from 'react';
import { Check } from 'lucide-react';

export default function NoShowStrip() {
  const [secs, setSecs] = useState(24 * 60 + 12);
  const [state, setState] = useState('active');

  useEffect(() => {
    if (state !== 'active') return;
    const id = setInterval(() => {
      setSecs(s => {
        if (s <= 1) { clearInterval(id); setState('declared'); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [state]);

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  if (state === 'arrived') {
    return (
      <div className="ns-strip ns-resolved" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Check size={14} strokeWidth={2.5} /> Sarah Chen arrived — No-show clock cancelled. Job proceeding. GPS record created.
      </div>
    );
  }
  if (state === 'declared') {
    return (
      <div className="ns-strip ns-declared">
        No-Show Declared — Sarah Chen · $300 retained · Danny released · Client notified
      </div>
    );
  }

  return (
    <div className="ns-strip">
      <div className="ns-dot" />
      <div className="ns-txt">
        No-Show Clock — Sarah Chen · 887 Pine St · Danny on site · Deposit: $300
      </div>
      <div className="ns-time">{fmt(secs)}</div>
      <button className="ns-btn" onClick={() => setState('arrived')}>Client Arrived</button>
      <button className="ns-btn ns-btn-alt" onClick={() => setState('declared')}>Declare No-Show</button>
    </div>
  );
}
