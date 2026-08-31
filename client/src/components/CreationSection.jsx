import React from 'react';

export default function CreationSection({ label, noBorder, headerAction, children }) {
  return (
    <div
      className="ib-inline-agr-section"
      style={noBorder ? { paddingTop: 0, borderTop: 'none' } : undefined}
    >
      {(label || headerAction) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {label && <div className="ib-inline-agr-section-label">{label}</div>}
          {headerAction}
        </div>
      )}
      {children}
    </div>
  );
}
