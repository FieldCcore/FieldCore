import React from 'react';

export default function CallerID({ onClose }) {
  return (
    <div className="caller-popup">
      <div className="caller-head">
        <div className="caller-ring" />
        <span className="caller-lbl">Inbound · Business Line</span>
        <button className="caller-x" onClick={onClose}>✕</button>
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
            <div className="ccv">⭐ VIP</div>
          </div>
        </div>
        <div className="caller-note">
          📝 Has lake house property — mentioned wanting a quote next visit.
        </div>
        <div className="caller-actions">
          <button className="caller-btn-ans" onClick={onClose}>Answer</button>
          <button className="caller-btn-prof" onClick={onClose}>View Profile</button>
        </div>
      </div>
    </div>
  );
}
