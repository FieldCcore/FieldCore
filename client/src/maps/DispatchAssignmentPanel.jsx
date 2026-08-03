import { useState } from 'react';
import api from '../api';

function BlockIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 13, height: 13, flexShrink: 0 }} aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M4.5 8h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 13, height: 13, flexShrink: 0 }} aria-hidden="true">
      <path d="M8 2L14.5 13H1.5L8 2z" stroke="currentColor" strokeWidth="1.5"
        strokeLinejoin="round"/>
      <path d="M8 6.5v3M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 13, height: 13, flexShrink: 0 }} aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 7.5v4M8 5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 14, height: 14 }} aria-hidden="true">
      <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IssueRow({ item, colorVar, iconEl }) {
  return (
    <div style={{
      display: 'flex', gap: 6, alignItems: 'flex-start',
      padding: '5px 0', color: `var(${colorVar})`, fontSize: 11,
    }}>
      <span style={{ marginTop: 1 }}>{iconEl}</span>
      <span>{item.message}</span>
    </div>
  );
}

function WorkloadBar({ pct }) {
  const capped  = Math.min(pct, 100);
  const barColor = pct >= 100 ? 'var(--red)' : pct >= 85 ? 'var(--amber)' : '#2E7D32';
  return (
    <div style={{
      height: 4, borderRadius: 2, background: 'var(--lightgray)', overflow: 'hidden', marginTop: 4,
    }} role="presentation">
      <div style={{ height: '100%', width: `${capped}%`, background: barColor, borderRadius: 2, transition: 'width .2s' }} />
    </div>
  );
}

/**
 * DispatchAssignmentPanel
 *
 * Shows validation result and allows the dispatcher to confirm or cancel
 * an assignment. Replaces the job/tech detail view in the sidebar.
 *
 * Props:
 *   job         — job object being assigned
 *   tech        — target technician object
 *   validation  — result from POST /api/dispatch/assignments/validate
 *   onConfirm   — (updatedJob) => void — called after successful save
 *   onCancel    — () => void
 */
export default function DispatchAssignmentPanel({ job, tech, validation, onConfirm, onCancel }) {
  const [overrideReason, setOverrideReason]   = useState('');
  const [saving,          setSaving]           = useState(false);
  const [saveError,       setSaveError]        = useState(null);

  if (!job || !tech || !validation) return null;

  const hasBlocking  = validation.blockingIssues?.length > 0;
  const hasWarnings  = validation.warnings?.length > 0;
  const wl           = validation.workloadImpact || {};
  const needsReason  = hasWarnings;

  async function handleConfirm() {
    if (hasBlocking) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await api.post('/dispatch/assignments', {
        jobId:           job.id,
        techId:          tech.id,
        overrideWarnings: hasWarnings,
        overrideReason:   needsReason ? overrideReason : undefined,
      });
      onConfirm?.(res.data.job);
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Assignment failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderBottom: '1px solid var(--lightgray)', flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel assignment"
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 6px', marginLeft: -6,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--slate)', fontSize: 11, fontWeight: 600, borderRadius: 4,
          }}
        >
          <BackIcon />
          Cancel
        </button>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>
          Confirm Assignment
        </span>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', minHeight: 0 }}>

        {/* Job → Tech summary */}
        <div style={{
          background: 'var(--off)', borderRadius: 6, padding: '10px 12px', marginBottom: 12,
        }}>
          <div style={{ fontSize: 11, color: 'var(--slate)', marginBottom: 2 }}>Assigning</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginBottom: 1 }}>
            {job.service_type} — {job.client_name}
          </div>
          <div style={{ fontSize: 10, color: 'var(--slate)' }}>
            → {tech.name}
          </div>
          {validation.scheduleImpact?.isReassignment && (
            <div style={{ fontSize: 10, color: 'var(--amber)', marginTop: 2 }}>
              Reassignment — currently assigned to another technician
            </div>
          )}
        </div>

        {/* Blocking issues */}
        {hasBlocking && (
          <div style={{
            background: '#FEE2E2', borderLeft: '3px solid var(--red)',
            borderRadius: 4, padding: '8px 10px', marginBottom: 10,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', marginBottom: 4 }}>
              Cannot assign — resolve these issues first
            </div>
            {validation.blockingIssues.map((issue, i) => (
              <IssueRow key={i} item={issue} colorVar="--red" iconEl={<BlockIcon />} />
            ))}
          </div>
        )}

        {/* Warnings */}
        {hasWarnings && (
          <div style={{
            background: '#FEF3C7', borderLeft: '3px solid var(--amber)',
            borderRadius: 4, padding: '8px 10px', marginBottom: 10,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#92400E', marginBottom: 4 }}>
              Warnings — confirm to proceed
            </div>
            {validation.warnings.map((w, i) => (
              <IssueRow key={i} item={w} colorVar="--amber" iconEl={<WarnIcon />} />
            ))}
            {needsReason && (
              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#92400E', display: 'block', marginBottom: 3 }}>
                  Override reason (optional)
                </label>
                <input
                  type="text"
                  value={overrideReason}
                  onChange={e => setOverrideReason(e.target.value)}
                  placeholder="Reason for proceeding despite warnings…"
                  style={{
                    width: '100%', fontSize: 11, padding: '5px 8px',
                    border: '1px solid #D97706', borderRadius: 4, boxSizing: 'border-box',
                    background: '#FFF',
                  }}
                  aria-label="Override reason"
                />
              </div>
            )}
          </div>
        )}

        {/* Informational */}
        {!hasBlocking && validation.informational?.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {validation.informational.map((info, i) => (
              <IssueRow key={i} item={info} colorVar="--slate" iconEl={<InfoIcon />} />
            ))}
          </div>
        )}

        {/* Workload impact */}
        {!hasBlocking && wl.newJobCount != null && (
          <div style={{
            background: 'var(--off)', borderRadius: 6,
            padding: '8px 10px', marginBottom: 12,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--slate)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>
              Workload After Assignment
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px' }}>
              <div style={{ fontSize: 10, color: 'var(--slate)' }}>Jobs today</div>
              <div style={{ fontSize: 11, fontWeight: 600 }}>{wl.newJobCount}</div>
              <div style={{ fontSize: 10, color: 'var(--slate)' }}>Service hours</div>
              <div style={{ fontSize: 11, fontWeight: 600 }}>{wl.newServiceHours}h</div>
              <div style={{ fontSize: 10, color: 'var(--slate)' }}>Capacity</div>
              <div style={{
                fontSize: 11, fontWeight: 600,
                color: wl.capacityPercent >= 100 ? 'var(--red)' : wl.capacityPercent >= 85 ? 'var(--amber)' : 'inherit',
              }}>
                {wl.capacityPercent}%
              </div>
            </div>
            <WorkloadBar pct={wl.capacityPercent} />
            {wl.overtimeRiskMinutes > 0 && (
              <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 4 }}>
                {Math.round(wl.overtimeRiskMinutes / 6) / 10}h overtime risk
              </div>
            )}
          </div>
        )}

        {saveError && (
          <div style={{
            background: '#FEE2E2', color: 'var(--red)', borderRadius: 4,
            padding: '7px 10px', fontSize: 11, marginBottom: 10,
          }} role="alert">
            {saveError}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          {!hasBlocking && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving}
              aria-busy={saving}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 6, border: 'none',
                background: 'var(--sand)', color: '#fff', fontWeight: 700,
                fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Assigning…' : hasWarnings ? 'Confirm Anyway' : 'Confirm Assignment'}
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: hasBlocking ? 1 : 0, padding: '8px 14px', borderRadius: 6,
              border: '1px solid var(--lightgray)', background: '#fff',
              color: 'var(--navy)', fontWeight: 600, fontSize: 12, cursor: 'pointer',
            }}
          >
            {hasBlocking ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
