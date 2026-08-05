import { useState } from 'react';
import api from '../api';

// ── Icons ─────────────────────────────────────────────────────────────────────

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
      <path d="M8 2L14.5 13H1.5L8 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
  const capped   = Math.min(pct, 100);
  const barColor = pct >= 100 ? 'var(--red)' : pct >= 85 ? 'var(--amber)' : '#2E7D32';
  return (
    <div style={{
      height: 4, borderRadius: 2, background: 'var(--lightgray)', overflow: 'hidden', marginTop: 4,
    }} role="presentation">
      <div style={{ height: '100%', width: `${capped}%`, background: barColor, borderRadius: 2, transition: 'width .2s' }} />
    </div>
  );
}

function SkeletonRow() {
  return (
    <div style={{
      height: 12, borderRadius: 4, background: 'var(--lightgray)',
      marginBottom: 6, animation: 'pulse 1.5s ease-in-out infinite',
    }} />
  );
}

// Panel configuration per state
const STATE_CONFIG = {
  UNASSIGNED: {
    title:      'Confirm Assignment',
    confirmBtn: 'Assign Job',
    confirmBg:  'var(--sand)',
  },
  REASSIGN: {
    title:      'Confirm Reassignment',
    confirmBtn: 'Reassign Job',
    confirmBg:  '#D97706',
  },
  ALREADY_ASSIGNED: {
    title: 'Already Assigned',
    confirmBtn: null,
  },
  UNAVAILABLE: {
    title: 'Technician Unavailable',
    confirmBtn: null,
  },
};

/**
 * DispatchAssignmentPanel — V2
 *
 * Four explicit states driven by validation.assignmentState:
 *   UNASSIGNED       → "Assign Job"
 *   REASSIGN         → yellow warning + "Reassign Job"
 *   ALREADY_ASSIGNED → info panel, "Close"
 *   UNAVAILABLE      → error panel, "Close"
 *
 * Props:
 *   job        — job being assigned
 *   tech       — target technician
 *   validation — result from POST /api/dispatch/assignments/validate (includes assignmentState)
 *   techLoc    — { lat, lng, updated_at } | null — used for distance calculation
 *   onConfirm  — (updatedJob) => void
 *   onCancel   — () => void
 */
export default function DispatchAssignmentPanel({ job, tech, validation, techLoc, onConfirm, onCancel }) {
  const [overrideReason, setOverrideReason] = useState('');
  const [saving,          setSaving]        = useState(false);
  const [saveError,       setSaveError]     = useState(null);

  if (!job || !tech || !validation) return null;

  const assignmentState = validation.assignmentState ||
    (validation.scheduleImpact?.isReassignment ? 'REASSIGN' : 'UNASSIGNED');

  const cfg         = STATE_CONFIG[assignmentState] || STATE_CONFIG.UNASSIGNED;
  const hasBlocking = validation.blockingIssues?.length > 0;
  const hasWarnings = validation.warnings?.length > 0;
  const wl          = validation.workloadImpact || {};

  // Distance computation — straight-line from tech GPS to job address
  const jobLat  = parseFloat(job.service_lat) || parseFloat(job.client_lat);
  const jobLng  = parseFloat(job.service_lng) || parseFloat(job.client_lng);
  const techLat = techLoc?.lat ?? techLoc?.latitude;
  const techLng = techLoc?.lng ?? techLoc?.longitude;
  const distKm  = (techLat && techLng && jobLat && jobLng && !(jobLat === 0 && jobLng === 0))
    ? haversineKm(techLat, techLng, jobLat, jobLng)
    : null;
  const distMi      = distKm ? (distKm * 0.621371).toFixed(1) : null;
  const driveMins   = distKm ? Math.max(1, Math.round(distKm / 40 * 60)) : null;

  async function handleConfirm() {
    if (hasBlocking || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await api.post('/dispatch/assignments', {
        jobId:            job.id,
        techId:           tech.id,
        overrideWarnings: hasWarnings,
        overrideReason:   hasWarnings ? overrideReason : undefined,
      });
      onConfirm?.(res.data.job);
    } catch (err) {
      const msg = err.response?.data?.error;
      setSaveError(
        msg === 'Assignment blocked by validation.'
          ? 'This assignment is blocked. Refresh the job list and try again.'
          : msg || 'Assignment failed. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  }

  // ── ALREADY_ASSIGNED ────────────────────────────────────────────────────────
  if (assignmentState === 'ALREADY_ASSIGNED') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <PanelHeader title={cfg.title} onCancel={onCancel} />
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px', minHeight: 0 }}>
          <div style={{
            background: '#E8F5E9', border: '1px solid #A5D6A7', borderRadius: 6,
            padding: '12px 14px', marginBottom: 16,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#2E7D32', marginBottom: 4 }}>
              ✓ {tech.name} is already assigned
            </div>
            <div style={{ fontSize: 11, color: '#2E7D32' }}>
              {job.service_type} for {job.client_name}
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--slate)', lineHeight: 1.6, marginBottom: 16 }}>
            No changes are needed. To reassign this job to a different technician,
            go back and select another team member.
          </div>
          <button type="button" onClick={onCancel}
            style={closeBtn}>
            Close
          </button>
        </div>
      </div>
    );
  }

  // ── UNAVAILABLE (no confirm path) ───────────────────────────────────────────
  const isUnavailableState = assignmentState === 'UNAVAILABLE';
  const onlyBlocking       = isUnavailableState || (hasBlocking && !hasWarnings);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PanelHeader title={cfg.title} onCancel={onCancel} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', minHeight: 0 }}>

        {/* Job → Tech summary card */}
        <div style={{
          background: 'var(--off)', borderRadius: 6, padding: '10px 12px', marginBottom: 12,
        }}>
          <div style={{ fontSize: 10, color: 'var(--slate)', marginBottom: 2 }}>
            {assignmentState === 'REASSIGN' ? 'Reassigning' : 'Assigning'}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginBottom: 2 }}>
            {job.service_type} — {job.client_name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--slate)' }}>
            → {tech.name}
          </div>
        </div>

        {/* REASSIGN — yellow contextual warning */}
        {assignmentState === 'REASSIGN' && validation.scheduleImpact?.previousTechId && !hasBlocking && (
          <div style={{
            background: '#FEF9EC', border: '1px solid #D97706',
            borderLeft: '3px solid #D97706',
            borderRadius: 4, padding: '8px 10px', marginBottom: 10,
          }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <WarnIcon style={{ marginTop: 1, flexShrink: 0, color: '#D97706' }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#92400E', marginBottom: 2 }}>
                  Reassignment
                </div>
                <div style={{ fontSize: 11, color: '#92400E' }}>
                  This job is currently assigned to another technician.
                  The previous technician will be unassigned.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Blocking issues — red */}
        {hasBlocking && (
          <div style={{
            background: '#FEE2E2', borderLeft: '3px solid var(--red)',
            borderRadius: 4, padding: '8px 10px', marginBottom: 10,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', marginBottom: 4 }}>
              {isUnavailableState
                ? 'Technician is not available for assignment'
                : 'Cannot assign — resolve these issues first'}
            </div>
            {validation.blockingIssues.map((issue, i) => (
              <IssueRow key={i} item={issue} colorVar="--red" iconEl={<BlockIcon />} />
            ))}
          </div>
        )}

        {/* Warnings (non-blocking) — amber */}
        {hasWarnings && !hasBlocking && (
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
                  border: '1px solid #D97706', borderRadius: 4,
                  boxSizing: 'border-box', background: '#FFF',
                }}
                aria-label="Override reason"
              />
            </div>
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

        {/* Workload panel — shown when there's useful data */}
        {!hasBlocking && (wl.newJobCount != null || distMi != null) && (
          <div style={{
            background: 'var(--off)', borderRadius: 6,
            padding: '10px 12px', marginBottom: 12,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: 'var(--slate)', marginBottom: 8,
              textTransform: 'uppercase', letterSpacing: '.5px',
            }}>
              Workload After Assignment
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 8px' }}>
              {wl.newJobCount != null && (
                <>
                  <div style={wlLabel}>Today's Jobs</div>
                  <div style={wlValue}>{wl.newJobCount}</div>
                </>
              )}
              {wl.newServiceHours != null && (
                <>
                  <div style={wlLabel}>Service Hours</div>
                  <div style={wlValue}>{wl.newServiceHours}h</div>
                </>
              )}
              {wl.capacityPercent != null && (
                <>
                  <div style={wlLabel}>Capacity</div>
                  <div style={{
                    ...wlValue,
                    color: wl.capacityPercent >= 100 ? 'var(--red)'
                      : wl.capacityPercent >= 85 ? 'var(--amber)' : 'inherit',
                  }}>
                    {wl.capacityPercent}%
                  </div>
                </>
              )}
              {distMi != null && (
                <>
                  <div style={wlLabel}>Distance from Job</div>
                  <div style={wlValue}>{distMi} mi</div>
                </>
              )}
              {driveMins != null && (
                <>
                  <div style={wlLabel}>Est. Drive Time</div>
                  <div style={wlValue}>
                    {driveMins < 60 ? `~${driveMins} min` : `~${(driveMins / 60).toFixed(1)}h`}
                  </div>
                </>
              )}
              <>
                <div style={wlLabel}>Availability</div>
                <div style={{
                  ...wlValue,
                  color: validation.techIsAvailable === false ? 'var(--amber)' : 'inherit',
                }}>
                  {validation.techIsAvailable === false ? 'Marked unavailable' : 'Available'}
                </div>
              </>
            </div>
            {wl.capacityPercent != null && <WorkloadBar pct={wl.capacityPercent} />}
            {wl.overtimeRiskMinutes > 0 && (
              <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 4 }}>
                {Math.round(wl.overtimeRiskMinutes / 6) / 10}h overtime risk
              </div>
            )}
          </div>
        )}

        {/* Save error */}
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
          {cfg.confirmBtn && !onlyBlocking && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving}
              aria-busy={saving}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 6, border: 'none',
                background: cfg.confirmBg, color: '#fff', fontWeight: 700,
                fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving…' : cfg.confirmBtn}
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: onlyBlocking ? 1 : 0, padding: '8px 14px', borderRadius: 6,
              border: '1px solid var(--lightgray)', background: '#fff',
              color: 'var(--navy)', fontWeight: 600, fontSize: 12, cursor: 'pointer',
            }}
          >
            {(onlyBlocking || !cfg.confirmBtn) ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PanelHeader({ title, onCancel }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 14px', borderBottom: '1px solid var(--lightgray)', flexShrink: 0,
    }}>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel"
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
        {title}
      </span>
    </div>
  );
}

// Shared style tokens
const wlLabel = { fontSize: 10, color: 'var(--slate)', alignSelf: 'center' };
const wlValue = { fontSize: 11, fontWeight: 600 };
const closeBtn = {
  width: '100%', padding: '8px 0', borderRadius: 6,
  border: '1px solid var(--lightgray)', background: '#fff',
  color: 'var(--navy)', fontWeight: 600, fontSize: 12, cursor: 'pointer',
};
