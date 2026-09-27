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

export const AUTHORITY_EVENT_LABELS = {
  'authority.case.created':                  'Case created',
  'authority.case.transitioned':             'Case status changed',
  'authority.case.workspace_accessed':       'Workspace viewed',
  'authority.case_instrument.linked':        'Instrument linked to case',
  'authority.case_instrument.unlinked':      'Instrument unlinked from case',
  'authority.instrument.created':            'Instrument created',
  'authority.instrument.transitioned':       'Instrument status changed',
  'authority.participant.added':             'Participant added',
  'authority.participant.updated':           'Participant updated',
  'authority.participant.removed':           'Participant removed',
  'authority.permission.added':              'Permission added',
  'authority.permission.removed':            'Permission removed',
  'authority.restriction.added':             'Restriction added',
  'authority.restriction.removed':           'Restriction removed',
  'authority.review_assignment.created':     'Case claimed',
  'authority.review_assignment.completed':   'Assignment completed',
  'authority.review_note.added':             'Review note added',
  'authority.document.uploaded':             'Document uploaded',
  'authority.document.accessed':             'Document viewed',
  'authority.document.deleted':              'Document deleted',
  'authority.document.upload.rejected':      'Document upload rejected',
  'authority.party.created':                 'Party created',
  'authority.party.status_updated':          'Party status updated',
  'authority.party.display_name_updated':    'Party name updated',
  'authority.capability.granted':            'Capability granted',
};

export function fmtEventLabel(action) {
  return AUTHORITY_EVENT_LABELS[action] || action;
}
