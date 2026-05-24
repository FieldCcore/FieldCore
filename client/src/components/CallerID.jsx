import React from 'react';
import { X, Star, StickyNote } from 'lucide-react';

export default function CallerID({ onClose }) {
  return (
    <div className="caller-popup">
      <div className="caller-head">
        <div className="caller-ring" />
        <span className="caller-lbl">Inbound · Business Line</span>
        <button className="caller-x" onClick={onClose}><X size={17} /></button>
      </div>
      <div className="caller-body">
        <div className="caller-name">Thomas Garfield</div>
        <div className="caller-info">VIP Client · (813) 555-0192 · Residential</div>
        <div className="caller-grid">
          <div className="caller-cell">
            <div className="ccl">Last Job</div>
            <div className="ccv">Today · Paint Corr.</div>
          </div>
          <div className="caller-cell">
            <div className="ccl">Balance</div>
            <div className="ccv" style={{ color: 'var(--green)' }}>$0 clear</div>
          </div>
          <div className="caller-cell">
            <div className="ccl">LTV</div>
            <div className="ccv">$8,400</div>
          </div>
          <div className="caller-cell">
            <div className="ccl">Tier</div>
            <div className="ccv" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Star size={12} fill="currentColor" strokeWidth={0} />VIP</div>
          </div>
        </div>
        <div className="caller-note" style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <StickyNote size={13} style={{ flexShrink: 0, marginTop: 1 }} /> Has lake house property — mentioned wanting a quote next visit.
        </div>
        <div className="caller-actions">
          <button className="caller-btn-ans" onClick={onClose}>Answer</button>
          <button className="caller-btn-prof" onClick={onClose}>View Profile</button>
        </div>
      </div>
    </div>
  );
}
