import React from 'react';
import { X } from 'lucide-react';

export default function CreationCard({ label, showRemove, onRemove, removeTestId, testId, children }) {
  return (
    <div className="ib-schedule-card" data-testid={testId}>
      <div className="ib-schedule-card-hd">
        <span className="ib-schedule-card-num">{label}</span>
        {showRemove && (
          <button
            type="button"
            className="ib-remove-schedule"
            onClick={onRemove}
            title="Remove"
            data-testid={removeTestId}
          >
            <X size={13} /> Remove
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
