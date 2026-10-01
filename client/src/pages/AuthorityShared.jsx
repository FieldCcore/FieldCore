import React from 'react';

// ── Centralized Authority status presentation mapping ─────────────────────────
// Internal lifecycle/status values → human-readable sentence-case labels.
// Never show raw enum values to users. Unknown values fall back to a safe
// readable form; a dev warning is emitted so new states are easy to notice.

const AUTHORITY_STATUS_LABELS = {
  // Case statuses (uppercase from backend)
  DRAFT:                    'Draft',
  AWAITING_DOCUMENTS:       'Awaiting documents',
  PENDING_EXTRACTION:       'Pending extraction',
  EXTRACTION_COMPLETE:      'Extraction complete',
  PENDING_HUMAN_REVIEW:     'Pending review',
  HUMAN_REVIEW_IN_PROGRESS: 'In progress',
  COMPLETED:                'Completed',
  CANCELLED:                'Cancelled',
  // Instrument statuses (uppercase from backend)
  UNVERIFIED:               'Unverified',
  VERIFIED:                 'Verified',
  PENDING_REVIEW:           'Pending review',
  REJECTED:                 'Rejected',
  REVOKED:                  'Revoked',
  EXPIRED:                  'Expired',
  SUPERSEDED:               'Superseded',
  // Party / participant statuses (uppercase from backend)
  ACTIVE:                   'Active',
  INACTIVE:                 'Inactive',
  // Permission grant types (lowercase from backend)
  granted:                  'Granted',
  denied:                   'Denied',
  // Credential statuses (lowercase from backend)
  active:                   'Active',
  revoked:                  'Revoked',
  // Extraction run statuses (lowercase from backend)
  pending:                  'Pending',
  running:                  'Running',
  completed:                'Completed',
  failed:                   'Failed',
  cancelled:                'Cancelled',
  // Candidate statuses (lowercase from backend)
  accepted:                 'Accepted',
  superseded:               'Superseded',
};

export function auStatusLabel(status) {
  if (!status) return '—';
  const s = String(status);
  if (AUTHORITY_STATUS_LABELS[s] !== undefined) return AUTHORITY_STATUS_LABELS[s];
  const up = s.toUpperCase();
  if (AUTHORITY_STATUS_LABELS[up] !== undefined) return AUTHORITY_STATUS_LABELS[up];
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
    console.warn(`[AuBadge] unmapped status: "${s}"`);
  }
  return s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

export function AuBadge({ status }) {
  const label = auStatusLabel(status);
  const cls   = `au-badge au-badge--${(status || '').toLowerCase()}`;
  return <span className={cls}>{label}</span>;
}

export function AuLoading() {
  return <div className="au-loading">Loading…</div>;
}

export function AuEmpty({ text = 'Nothing here yet.' }) {
  return (
    <div className="au-empty">
      <div className="au-empty-text">{text}</div>
    </div>
  );
}

export function AuError({ msg, onRetry }) {
  if (!msg) return null;
  return (
    <div className="au-error" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span>{msg}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="au-btn au-btn--ghost"
          style={{ fontSize: 12, padding: '2px 8px', flexShrink: 0 }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function AuInfo({ children }) {
  return <div className="au-info">{children}</div>;
}

export function instrumentTypeLabel(type) {
  if (!type) return '';
  const s = String(type).replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
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
