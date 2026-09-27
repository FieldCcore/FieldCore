import React from 'react';

export function AuBadge({ status }) {
  const label = (status || '').replace(/_/g, ' ');
  const cls   = `au-badge au-badge--${(status || '').toLowerCase()}`;
  return <span className={cls}>{label}</span>;
}

export function AuLoading() {
  return <div className="au-loading">Loading…</div>;
}

export function AuEmpty({ text = 'Nothing here yet.' }) {
  return (
    <div className="au-empty">
      <div className="au-empty-icon">○</div>
      <div className="au-empty-text">{text}</div>
    </div>
  );
}

export function AuError({ msg }) {
  if (!msg) return null;
  return <div className="au-error">{msg}</div>;
}

export function AuInfo({ children }) {
  return <div className="au-info">{children}</div>;
}

export function instrumentTypeLabel(type) {
  return (type || '').replace(/_/g, ' ');
}

export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
