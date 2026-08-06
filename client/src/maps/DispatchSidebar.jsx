import { useMemo, useState } from 'react';
import { useDispatchKpiMetrics } from '../hooks/useDispatchKpiMetrics';
import DispatchSidebarKpiGrid from './DispatchSidebarKpiGrid';
import DispatchCompactRail from './DispatchCompactRail';
import DispatchTeamPanel from './DispatchTeamPanel';
import DispatchAssignmentPanel from './DispatchAssignmentPanel';
import DispatchAssignTeamPanel from './DispatchAssignTeamPanel';
import DispatchRoutePanel from './DispatchRoutePanel';
import DispatchActivityTimeline from './DispatchActivityTimeline';
import DispatchQuickCommsPanel from './DispatchQuickCommsPanel';
import DispatchDateControl from './DispatchDateControl';
import EmergencyDispatchModal from './EmergencyDispatchModal';
import { getJobStatusPresentation } from '../domain/jobStatusPresentation';
import { getTechStatus, ACTIVE_STATUSES } from '../domain/technicianStatusPresentation';
import { formatTZ } from '../utils/calendarTimezone';
import { isValidCoord } from './dispatchCoords';
import api from '../api';

// ── Icons ─────────────────────────────────────────────────────────────────────

function CollapseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 16, height: 16 }} aria-hidden="true">
      <path d="M1 3v10M6 4L2 8l4 4M11 4L7 8l4 4" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 16, height: 16 }} aria-hidden="true">
      <path d="M15 3v10M5 4l4 4-4 4M10 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
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

const AVATAR_COLORS = ['#0369A1', '#1565C0', '#E65100', '#6A1B9A', '#AD1457'];

function initials(name) {
  return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function fmtTime(iso, tz) {
  if (!iso) return '—';
  return tz
    ? formatTZ(new Date(iso), 'h:mm a', tz)
    : new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtDate(iso, tz) {
  if (!iso) return '—';
  return tz
    ? formatTZ(new Date(iso), 'MMM d', tz)
    : new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function fmtAge(ts) {
  if (!ts) return 'No GPS';
  const ms = Date.now() - new Date(ts).getTime();
  const m  = Math.floor(ms / 60000);
  if (m >= 60) return `${Math.floor(m / 60)}h ago`;
  return m > 0 ? `${m}m ago` : 'just now';
}

// ── Emergency Details inline view ────────────────────────────────────────────

const PRIORITY_LABELS = { p1: 'P1 — Critical', p2: 'P2 — High', p3: 'P3 — Elevated' };
const NOTIF_LABELS    = { none: 'None', sms: 'SMS', call: 'Phone call', sms_and_call: 'SMS + call' };
const PAY_LABELS      = { none: 'Standard pay', flat_bonus: 'Flat bonus', time_and_half: 'Time and a half', double_time: 'Double time' };
const EM_STATUS_LABELS = { active: 'Active', resolved: 'Resolved', deactivated: 'Deactivated' };

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function EmDetailRow({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 10 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--navy)', lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

function EmergencyDetailsView({ job, onBack, onJobUpdated, userRole, flags, techs, onViewComms, onViewActivity }) {
  const [actionBusy,   setActionBusy]   = useState(false);
  const [actionError,  setActionError]  = useState(null);
  const [showDeact,    setShowDeact]    = useState(false);
  const [deactReason,  setDeactReason]  = useState('');
  const [showUpdate,   setShowUpdate]   = useState(false);

  const canManage   = flags?.dispatch_emergency_mode && (userRole === 'owner' || userRole === 'manager');
  const isActive    = job.is_emergency && job.emergency_status === 'active';
  const emStatus    = EM_STATUS_LABELS[job.emergency_status] || job.emergency_status || '—';
  const priority    = PRIORITY_LABELS[job.emergency_priority] || job.emergency_priority || '—';
  const notifPolicy = NOTIF_LABELS[job.emergency_customer_notification_policy] || job.emergency_customer_notification_policy || 'None';
  const payPolicy   = PAY_LABELS[job.emergency_premium_pay_policy] || job.emergency_premium_pay_policy || 'Standard pay';
  const reasonLabel = job.emergency_reason_code
    ? job.emergency_reason_code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : null;

  async function doAction(url, body, successMsg) {
    setActionBusy(true);
    setActionError(null);
    try {
      const res = await api.post(url, body || {});
      onJobUpdated?.(res.data);
    } catch (err) {
      setActionError(err.response?.data?.error || successMsg ? `Failed: ${err.response?.data?.error || 'try again'}` : 'Action failed.');
    } finally {
      setActionBusy(false);
    }
  }

  const statusColor = isActive ? '#DC2626' : job.emergency_status === 'resolved' ? '#2E7D32' : '#5F667A';
  const statusBg    = isActive ? '#FEE2E2' : job.emergency_status === 'resolved' ? '#E8F5E9' : '#F3F4F6';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderBottom: '1px solid var(--lightgray)', flexShrink: 0,
      }}>
        <button type="button" onClick={onBack} aria-label="Back to job details"
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', marginLeft: -6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', fontSize: 11, fontWeight: 600, borderRadius: 4 }}>
          <BackIcon />
          Job Details
        </button>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#DC2626' }}>Emergency</span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', minHeight: 0 }}>

        {/* Status badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
            background: statusBg, color: statusColor,
          }}>
            {emStatus}
          </span>
          {job.emergency_priority && (
            <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 99, background: '#FEE2E2', color: '#DC2626' }}>
              {job.emergency_priority.toUpperCase()}
            </span>
          )}
        </div>

        <EmDetailRow label="Job" value={`${job.client_name} — ${job.service_type}`} />
        <EmDetailRow label="Priority" value={priority} />
        {reasonLabel && <EmDetailRow label="Reason" value={reasonLabel} />}
        {job.emergency_reason_text && <EmDetailRow label="Details" value={job.emergency_reason_text} />}
        {job.emergency_response_target_minutes && (
          <EmDetailRow label="Response target" value={`${job.emergency_response_target_minutes} min`} />
        )}
        <EmDetailRow label="Declared" value={fmtDateTime(job.emergency_declared_at)} />
        <EmDetailRow label="Customer notification" value={notifPolicy} />
        <EmDetailRow label="Premium pay" value={payPolicy} />

        {/* Assigned tech */}
        {job.tech_name && <EmDetailRow label="Assigned technician" value={job.tech_name} />}
        {!job.tech_id && <EmDetailRow label="Assigned technician" value="Unassigned" />}

        {/* Resolution info */}
        {(job.emergency_status === 'resolved' || job.emergency_status === 'deactivated') && (
          <>
            <div style={{ height: 1, background: 'var(--lightgray)', margin: '10px 0' }} />
            <EmDetailRow
              label={job.emergency_status === 'resolved' ? 'Resolved' : 'Deactivated'}
              value={fmtDateTime(job.emergency_deactivated_at)}
            />
            {job.emergency_deactivation_reason && (
              <EmDetailRow label="Reason" value={job.emergency_deactivation_reason} />
            )}
          </>
        )}

        {actionError && (
          <div style={{ fontSize: 11, color: '#DC2626', padding: '6px 10px', background: '#FEE2E2', borderRadius: 6, marginBottom: 10 }}>
            {actionError}
          </div>
        )}

        {/* Action buttons */}
        {canManage && isActive && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            <button type="button" className="dispatch-drawer-btn"
              onClick={() => setShowUpdate(true)}>
              Update Emergency
            </button>
            {flags?.dispatch_quick_communications && (
              <button type="button" className="dispatch-drawer-btn"
                onClick={() => onViewComms?.(job.id)}>
                Send Update
              </button>
            )}
            {flags?.dispatch_activity_timeline && (
              <button type="button" className="dispatch-drawer-btn"
                onClick={() => onViewActivity?.('job', job.id)}>
                View Activity
              </button>
            )}
            <button type="button" className="dispatch-drawer-btn"
              disabled={actionBusy}
              onClick={() => doAction(`/jobs/${job.id}/emergency/resolve`, {}, 'Resolved')}
              style={{ color: '#2E7D32' }}>
              {actionBusy ? '…' : 'Resolve Emergency'}
            </button>
            <button type="button" className="dispatch-drawer-btn"
              onClick={() => setShowDeact(v => !v)}
              style={{ color: 'var(--slate)' }}>
              Deactivate Emergency
            </button>
          </div>
        )}

        {canManage && !isActive && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            {flags?.dispatch_activity_timeline && (
              <button type="button" className="dispatch-drawer-btn"
                onClick={() => onViewActivity?.('job', job.id)}>
                View Activity
              </button>
            )}
          </div>
        )}

        {/* Deactivate confirm */}
        {showDeact && (
          <div style={{ marginTop: 10, padding: '10px', background: '#FFF8F0', borderRadius: 6, border: '1px solid #FDE68A' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--navy)', marginBottom: 6 }}>
              Reason for deactivation (required):
            </div>
            <textarea
              value={deactReason}
              onChange={e => setDeactReason(e.target.value)}
              placeholder="Explain why this emergency is being deactivated…"
              rows={2}
              style={{ width: '100%', fontSize: 11, padding: '6px 8px', border: '1px solid var(--lightgray)', borderRadius: 4, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button type="button" className="dispatch-drawer-btn" style={{ flex: 1 }}
                onClick={() => setShowDeact(false)}>
                Cancel
              </button>
              <button type="button" className="dispatch-drawer-btn" style={{ flex: 1, color: 'var(--slate)' }}
                disabled={!deactReason.trim() || actionBusy}
                onClick={() => doAction(`/jobs/${job.id}/emergency/deactivate`, { reason: deactReason }, 'Deactivated')}>
                {actionBusy ? '…' : 'Confirm'}
              </button>
            </div>
          </div>
        )}

        {/* Update Emergency modal */}
        {showUpdate && (
          <EmergencyDispatchModal
            job={job}
            initialValues={{
              priority:                       job.emergency_priority || 'p2',
              reasonCode:                     job.emergency_reason_code || '',
              reasonText:                     job.emergency_reason_text || '',
              responseTarget:                 job.emergency_response_target_minutes ? String(job.emergency_response_target_minutes) : '',
              notifPolicy:                    job.emergency_customer_notification_policy || 'none',
              payPolicy:                      job.emergency_premium_pay_policy || 'none',
            }}
            onClose={() => setShowUpdate(false)}
            onActivated={(updatedJob) => {
              setShowUpdate(false);
              onJobUpdated?.(updatedJob);
            }}
            isUpdate
          />
        )}
      </div>
    </div>
  );
}

// ── Job Details inline view ───────────────────────────────────────────────────

const NON_ASSIGNABLE_STATUSES = new Set(['complete', 'cancelled', 'no_show', 'draft']);

function JobDetailView({
  job, jobTech, onCenterJob, onJobGeocoded, onBack, timezone,
  onViewActivity, onViewComms, flags,
  onAssignJob, onOpenAssignTeam, userRole, techs,
  onJobUpdated,
}) {
  const p         = getJobStatusPresentation(job.status);
  const sStyle    = { background: p.badgeBg, color: p.badgeColor };
  const sLabel    = p.label;
  const hasCoords = isValidCoord(job.service_lat, job.service_lng);

  const [innerView,          setInnerView]         = useState('main'); // 'main' | 'emergency_details'
  const [geocoding,         setGeocoding]         = useState(false);
  const [geocodeError,      setGeocodeError]      = useState(job.geocode_error || null);
  const [showMore,          setShowMore]          = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyBusy,     setEmergencyBusy]     = useState(false);
  const [emergencyError,    setEmergencyError]    = useState(null);

  const isAssignable  = !NON_ASSIGNABLE_STATUSES.has(job.status);
  const canAssign     = (onOpenAssignTeam || onAssignJob) && (userRole === 'owner' || userRole === 'manager');
  const canDeclareEmergency = flags?.dispatch_emergency_mode
    && (userRole === 'owner' || userRole === 'manager')
    && !['complete', 'cancelled', 'no_show', 'draft'].includes(job.status);

  async function handleResolveEmergency() {
    setEmergencyBusy(true);
    setEmergencyError(null);
    try {
      const res = await api.post(`/jobs/${job.id}/emergency/resolve`);
      onJobUpdated?.(res.data);
    } catch (err) {
      setEmergencyError(err.response?.data?.error || 'Failed to resolve emergency.');
    } finally {
      setEmergencyBusy(false);
    }
  }

  // Show emergency details inner view when triggered
  if (innerView === 'emergency_details') {
    return (
      <EmergencyDetailsView
        job={job}
        onBack={() => setInnerView('main')}
        onJobUpdated={onJobUpdated}
        userRole={userRole}
        flags={flags}
        techs={techs}
        onViewComms={onViewComms}
        onViewActivity={onViewActivity}
      />
    );
  }

  const handleRetryGeocode = async () => {
    setGeocoding(true);
    setGeocodeError(null);
    try {
      const res = await api.post(`/jobs/${job.id}/geocode`);
      if (res.data?.service_lat && res.data?.service_lng) {
        onJobGeocoded?.({ id: job.id, ...res.data });
      } else {
        setGeocodeError('Address could not be placed on the map.');
      }
    } catch (err) {
      setGeocodeError(err.response?.data?.error || 'Geocoding failed. Try again later.');
    } finally {
      setGeocoding(false);
    }
  };

  const showGeocodeStatus = job.service_address && !hasCoords;
  const geocodeFailed     = job.geocode_status === 'failed' ||
    (showGeocodeStatus && job.geocode_status !== 'not_attempted');

  const geocodeMessage = (() => {
    if (geocodeError) return geocodeError;
    if (!geocodeFailed) return 'Map location pending.';
    const ps = job.geocode_provider_status;
    if (ps === 'ZERO_RESULTS')   return 'We could not find this address. Check the street, city, and state.';
    if (ps === 'REQUEST_DENIED') return 'Map-location service is temporarily unavailable. Contact support.';
    if (ps === 'INVALID_REQUEST') return 'This address is incomplete.';
    if (ps === 'NO_API_KEY')     return 'Geocoding is not configured. Contact support.';
    return job.geocode_error || 'Address could not be geocoded. Verify the address and retry.';
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderBottom: '1px solid var(--lightgray)',
        flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to jobs"
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 6px', marginLeft: -6,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--slate)', fontSize: 11, fontWeight: 600, borderRadius: 4,
          }}
        >
          <BackIcon />
          Back to Jobs
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px', minHeight: 0 }}>
        {/* Status + priority */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <span
            className="dispatch-job-badge"
            style={{ ...sStyle, fontSize: 10, padding: '2px 8px' }}
            aria-label={`Status: ${sLabel}`}
          >
            {sLabel}
          </span>
          {job.priority === 'high' && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: 'var(--red)',
              background: 'var(--red-lt)', borderRadius: 99, padding: '2px 8px',
            }}>
              High Priority
            </span>
          )}
          {job.is_emergency && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: '#DC2626',
              background: '#FEE2E2', borderRadius: 99, padding: '2px 8px',
            }}>
              ⚡ Emergency
            </span>
          )}
        </div>

        <div className="dispatch-drawer-name">{job.client_name}</div>
        <div className="dispatch-drawer-role">{job.service_type}</div>

        <div className="dispatch-drawer-divider" />

        <div className="dispatch-drawer-stat-row">
          <span className="dispatch-drawer-stat-label">Scheduled</span>
          <span style={{ fontSize: 12 }}>
            {fmtDate(job.scheduled_at, timezone)} {fmtTime(job.scheduled_at, timezone)}
          </span>
        </div>

        {job.service_address && (
          <div className="dispatch-drawer-stat-row">
            <span className="dispatch-drawer-stat-label">Address</span>
            <span style={{ fontSize: 12, textAlign: 'right', flex: 1 }}>
              {job.service_address}
              {job.service_city  ? `, ${job.service_city}`  : ''}
              {job.service_state ? ` ${job.service_state}`  : ''}
              {job.service_zip   ? ` ${job.service_zip}`    : ''}
            </span>
          </div>
        )}

        <div className="dispatch-drawer-stat-row">
          <span className="dispatch-drawer-stat-label">Assigned</span>
          <span style={{ fontSize: 12, color: jobTech ? 'var(--navy)' : 'var(--amber)' }}>
            {jobTech?.name ?? 'Unassigned'}
          </span>
        </div>

        {job.amount != null && (
          <div className="dispatch-drawer-stat-row">
            <span className="dispatch-drawer-stat-label">Amount</span>
            <span style={{ fontSize: 12 }}>${(job.amount / 100).toFixed(2)}</span>
          </div>
        )}

        {job.notes && (
          <div style={{
            margin: '10px 0', padding: '8px 10px',
            background: 'var(--off)', borderRadius: 6,
            fontSize: 11, color: 'var(--slate)', lineHeight: 1.5,
          }}>
            {job.notes}
          </div>
        )}

        {/* Geocode failure card */}
        {showGeocodeStatus && (
          <div style={{
            margin: '10px 0', padding: '10px 12px', borderRadius: 6,
            background: geocodeFailed ? 'var(--red-lt, #FEE2E2)' : 'var(--off, #EDEBE7)',
            borderLeft: geocodeFailed
              ? '3px solid var(--red, #DC2626)'
              : '3px solid var(--steel, #8A90A2)',
          }}>
            <div style={{
              fontSize: 11, fontWeight: 600, marginBottom: 2,
              color: geocodeFailed ? 'var(--red, #DC2626)' : 'var(--slate, #5F667A)',
            }}>
              Map location unavailable
            </div>
            <div style={{ fontSize: 11, color: geocodeFailed ? 'var(--red, #DC2626)' : 'var(--slate, #5F667A)' }}>
              {geocodeMessage}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="dispatch-drawer-actions">
          {hasCoords && (
            <button type="button" className="dispatch-drawer-btn primary" onClick={() => onCenterJob?.(job)}>
              Center Map
            </button>
          )}

          <a href="/jobs" className="dispatch-drawer-btn">Open Job</a>

          {/* Assign Team — opens DispatchAssignTeamPanel */}
          {canAssign && (
            isAssignable ? (
              <button
                type="button"
                className="dispatch-drawer-btn"
                onClick={() => onOpenAssignTeam?.(job.id)}
              >
                {job.tech_id ? 'Manage Team' : 'Assign Team'}
              </button>
            ) : (
              <button
                type="button"
                className="dispatch-drawer-btn"
                disabled
                title={`Cannot assign: job is ${job.status.replace(/_/g, ' ')}`}
              >
                Assign Team
              </button>
            )
          )}

          {/* Emergency status row — clickable summary + separate Resolve button */}
          {job.is_emergency && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', minWidth: 0 }}>
              <button
                type="button"
                onClick={() => setInnerView('emergency_details')}
                aria-label="View emergency details"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  flex: '1 1 auto', minWidth: 0, overflow: 'hidden',
                  padding: '6px 10px', borderRadius: 6,
                  background: '#FEE2E2', border: '1px solid #FCA5A5',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span aria-hidden="true" style={{ flexShrink: 0 }}>⚡</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Emergency Active
                </span>
                {job.emergency_priority && (
                  <span style={{
                    fontSize: 9, fontWeight: 800, flexShrink: 0, whiteSpace: 'nowrap',
                    padding: '1px 6px', borderRadius: 99,
                    background: 'rgba(220,38,38,0.12)', color: '#DC2626',
                  }}>
                    {job.emergency_priority.toUpperCase()}
                  </span>
                )}
              </button>
              {canDeclareEmergency && (
                <button
                  type="button"
                  onClick={handleResolveEmergency}
                  disabled={emergencyBusy}
                  aria-label="Resolve emergency"
                  style={{
                    flexShrink: 0, whiteSpace: 'nowrap',
                    fontSize: 10, fontWeight: 700, padding: '6px 10px', borderRadius: 6,
                    border: '1px solid #DC2626', background: 'transparent', color: '#DC2626',
                    cursor: emergencyBusy ? 'not-allowed' : 'pointer',
                  }}
                >
                  {emergencyBusy ? '…' : 'Resolve'}
                </button>
              )}
            </div>
          )}
          {emergencyError && (
            <div style={{ fontSize: 10, color: '#DC2626', padding: '2px 4px' }} role="alert">{emergencyError}</div>
          )}

          {/* More — expandable advanced actions */}
          {(flags?.dispatch_quick_communications || flags?.dispatch_activity_timeline ||
            canDeclareEmergency || showGeocodeStatus) && (
            <>
              <button
                type="button"
                className="dispatch-drawer-btn"
                onClick={() => setShowMore(v => !v)}
                aria-expanded={showMore}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>More</span>
                <span style={{ fontSize: 9, color: 'var(--steel)' }}>{showMore ? '▲' : '▼'}</span>
              </button>
              {showMore && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 8 }}>
                  {canDeclareEmergency && job.is_emergency && (
                    <button
                      type="button"
                      className="dispatch-drawer-btn"
                      onClick={() => { setShowMore(false); setInnerView('emergency_details'); }}
                    >
                      Manage Emergency
                    </button>
                  )}
                  {canDeclareEmergency && !job.is_emergency && (
                    <button
                      type="button"
                      className="dispatch-drawer-btn"
                      onClick={() => { setShowMore(false); setShowEmergencyModal(true); }}
                      style={{ color: '#DC2626' }}
                    >
                      Declare Emergency
                    </button>
                  )}
                  {flags?.dispatch_quick_communications && (
                    <button type="button" className="dispatch-drawer-btn"
                      onClick={() => { setShowMore(false); onViewComms?.(job.id); }}>
                      Send Update
                    </button>
                  )}
                  {flags?.dispatch_activity_timeline && (
                    <button type="button" className="dispatch-drawer-btn"
                      onClick={() => { setShowMore(false); onViewActivity?.('job', job.id); }}>
                      Activity
                    </button>
                  )}
                  {showGeocodeStatus && (
                    <button
                      type="button"
                      className="dispatch-drawer-btn"
                      onClick={handleRetryGeocode}
                      disabled={geocoding}
                      aria-busy={geocoding}
                    >
                      {geocoding ? 'Locating…' : 'Retry Geocoding'}
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* Emergency activation modal */}
          {showEmergencyModal && (
            <EmergencyDispatchModal
              job={job}
              onClose={() => setShowEmergencyModal(false)}
              onActivated={(updatedJob) => {
                setShowEmergencyModal(false);
                onJobUpdated?.(updatedJob);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tech Details inline view ──────────────────────────────────────────────────

function TechDetailView({ tech, loc, activeJob, nextJob, avatarColor, onCenterTech, onBack, jobs = [], timezone, onViewActivity, onViewRoute, flags, delayPrediction }) {
  const st       = getTechStatus(tech, loc ? [{ ...loc, user_id: tech.id }] : [], jobs);
  const hasLoc   = !!loc && st.key !== 'off' && st.key !== 'offline';
  const techJobs = jobs.filter(j => j.tech_id === tech.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderBottom: '1px solid var(--lightgray)',
        flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to team"
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 6px', marginLeft: -6,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--slate)', fontSize: 11, fontWeight: 600, borderRadius: 4,
          }}
        >
          <BackIcon />
          Back
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', minHeight: 0 }}>
        <div className="dispatch-drawer-avatar-row">
          <div className="dispatch-drawer-avatar" style={{ background: avatarColor }} aria-hidden="true">
            {initials(tech.name)}
          </div>
          <div>
            <div className="dispatch-drawer-name">{tech.name}</div>
            <div className="dispatch-drawer-role">{tech.role}</div>
          </div>
        </div>

        <div className="dispatch-drawer-stat-row">
          <span className="dispatch-drawer-stat-label">Status</span>
          <span style={{ color: st.color, fontWeight: 600, fontSize: 12 }}>{st.label}</span>
        </div>

        {loc && (
          <div className="dispatch-drawer-stat-row">
            <span className="dispatch-drawer-stat-label">
              {(st.isStale || st.key === 'offline') ? 'Last known location' : 'Last seen'}
            </span>
            <span style={{ fontSize: 12 }}>{fmtAge(loc.updated_at)}</span>
          </div>
        )}

        {st.isStale && (
          <div className="dispatch-drawer-stat-row">
            <span className="dispatch-drawer-stat-label" style={{ color: '#B45309' }}>Location stale</span>
            <span style={{ fontSize: 12, color: '#B45309' }}>GPS not updated recently</span>
          </div>
        )}

        {loc?.speed != null && loc.speed > 2 && (
          <div className="dispatch-drawer-stat-row">
            <span className="dispatch-drawer-stat-label">Speed</span>
            <span style={{ fontSize: 12 }}>{Math.round(loc.speed * 2.237)} mph</span>
          </div>
        )}

        {activeJob && (
          <div className="dispatch-drawer-job-card">
            <div className="dispatch-drawer-job-lbl">Current Job</div>
            <div className="dispatch-drawer-job-name">{activeJob.client_name}</div>
            <div className="dispatch-drawer-job-meta">{activeJob.service_type}</div>
            {activeJob.service_address && (
              <div className="dispatch-drawer-job-meta">
                {activeJob.service_address}
                {activeJob.service_city ? `, ${activeJob.service_city}` : ''}
              </div>
            )}
          </div>
        )}

        {nextJob && (
          <div className="dispatch-drawer-job-card">
            <div className="dispatch-drawer-job-lbl">Next Job</div>
            <div className="dispatch-drawer-job-name">{nextJob.client_name}</div>
            <div className="dispatch-drawer-job-meta">
              {nextJob.service_type} · {fmtTime(nextJob.scheduled_at, timezone)}
            </div>
          </div>
        )}

        {/* Delay status — Phase 3 */}
        {flags?.dispatch_delay_prediction && (
          delayPrediction && !['no_upcoming_job', 'no_location'].includes(delayPrediction.status) ? (
            <div style={{
              margin: '8px 0', padding: '8px 10px', borderRadius: 6,
              background: delayPrediction.status === 'delayed' ? '#FEE2E2'
                        : delayPrediction.status === 'at_risk'  ? '#FEF3C7' : '#E8F5E9',
              borderLeft: `3px solid ${delayPrediction.status === 'delayed' ? 'var(--red)' : delayPrediction.status === 'at_risk' ? 'var(--amber)' : '#2E7D32'}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 2,
                color: delayPrediction.status === 'delayed' ? 'var(--red)' : delayPrediction.status === 'at_risk' ? '#92400E' : '#2E7D32' }}>
                {delayPrediction.status === 'delayed' ? `~${delayPrediction.delayMinutes}m behind schedule`
                 : delayPrediction.status === 'at_risk' ? 'At risk of delay'
                 : 'On schedule'}
              </div>
              {delayPrediction.nextJobClientName && (
                <div style={{ fontSize: 10, color: 'var(--slate)' }}>
                  Next: {delayPrediction.nextJobServiceType} for {delayPrediction.nextJobClientName}
                  {delayPrediction.distanceKm > 0 && ` · ${(delayPrediction.distanceKm * 0.621371).toFixed(1)} mi away`}
                </div>
              )}
            </div>
          ) : (
            <div style={{
              margin: '8px 0', padding: '7px 10px', borderRadius: 6,
              background: 'var(--off)', borderLeft: '3px solid var(--steel)',
              fontSize: 11, color: 'var(--steel)',
            }}>
              Delay estimate unavailable
            </div>
          )
        )}

        <div className="dispatch-drawer-actions">
          {hasLoc && (
            <button type="button" className="dispatch-drawer-btn primary" onClick={() => onCenterTech?.(tech.id)}>
              Center Map
            </button>
          )}
          {tech.phone && (
            <a href={`tel:${tech.phone}`} className="dispatch-drawer-btn" aria-label={`Call ${tech.name}`}>
              Call
            </a>
          )}
          {/* Route sequencing — Phase 2 */}
          {flags?.dispatch_route_sequencing && (
            techJobs.length > 0 ? (
              <button
                type="button"
                className="dispatch-drawer-btn"
                onClick={() => onViewRoute?.(tech.id)}
              >
                View Route
              </button>
            ) : (
              <button
                type="button"
                className="dispatch-drawer-btn"
                disabled
                title="Assign jobs to this technician to enable route sequencing"
              >
                View Route
              </button>
            )
          )}
          {flags?.dispatch_activity_timeline && (
            <button type="button" className="dispatch-drawer-btn" onClick={() => onViewActivity?.('tech', tech.id)}>
              Activity
            </button>
          )}
          <a href="/team" className="dispatch-drawer-btn">Profile</a>
        </div>
      </div>
    </div>
  );
}

// ── Main DispatchSidebar ──────────────────────────────────────────────────────

/**
 * DispatchSidebar
 *
 * Three layout modes: "expanded" (280px) | "compact" (76px, labeled rail) | "full_map" (0px).
 *
 * Four content views: 'list' | 'job_details' | 'tech_details'
 * View is controlled by Dispatch.jsx via sidebarView + onSidebarBack props.
 */
export default function DispatchSidebar({
  mode,
  isMobile,
  onToggle,
  onEnterFullMap,
  onTransitionEnd,
  activeKpiKey,
  onKpiClick,
  onExpandToTeam,
  onExpandToJobs,
  activeTab,
  panelFocus,
  techs,
  techLocs,
  jobs,
  sessions,
  loading,
  selectedItem,
  onSelectTech,
  onSelectJob,
  dispatchDate,
  onDateChange,
  timezone,
  // Detail views
  sidebarView,     // 'list' | 'job_details' | 'tech_details' | 'assignment_confirm' | 'assign_team'
  onSidebarBack,   // () => void — go back to list
  onCenterJob,     // (job) => void
  onCenterTech,    // (techId) => void
  onJobGeocoded,   // (updatedJob) => void
  // Phase 1 — assignment
  assignmentPending,     // { job, tech, validation } | null
  onAssignConfirmed,     // (updatedJob) => void
  onAssignCancel,        // () => void
  onAssignJob,           // (jobId, techId) => void — drag-and-drop single tech
  // Team assignment
  teamAssignment,        // { job, currentTeam, loadingTeam } | null
  onOpenAssignTeam,      // (jobId) => void
  onTeamAssigned,        // (updatedJob?) => void
  flags,                 // dispatch feature flags
  workloadsByTechId,     // Map<techId, WorkloadEntry>
  userRole,              // 'owner' | 'manager' | 'tech'
  // Phase 2 — route sequencing
  routeState,            // { route, loading, saving, error } from useDispatchRouteSequence
  onSaveRoute,           // (techId, jobIds) => void
  onViewRoute,           // (techId) => void
  // Phase 3 — activity + comms + delay
  activityState,         // { events, subject, loading, error } from useDispatchActivity
  onViewActivity,        // (type: 'job'|'tech', id) => void
  onViewComms,           // (jobId) => void
  onCommsSent,           // () => void
  delaysByTechId,        // Map<techId, DelayPrediction>
}) {
  const { metrics, loading: kpiLoading } = useDispatchKpiMetrics(dispatchDate);

  const isExpanded = mode === 'expanded';
  const isCompact  = mode === 'compact';
  const isFullMap  = mode === 'full_map';
  const showToggle = !isMobile && !isFullMap;

  // Job-related views where we need a resolved selectedJob
  const JOB_DETAIL_VIEWS = new Set(['job_details', 'quick_comms', 'activity_timeline', 'assign_team']);

  // Resolve selected job/tech data for detail views
  const selectedJob = useMemo(() => {
    if (!selectedItem?.id || selectedItem.type !== 'job') return null;
    if (!JOB_DETAIL_VIEWS.has(sidebarView)) return null;
    return (jobs || []).find(j => j.id === selectedItem.id) ?? null;
  }, [sidebarView, selectedItem, jobs]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedJobTech = useMemo(() => {
    if (!selectedJob?.tech_id) return null;
    return (techs || []).find(t => t.id === selectedJob.tech_id) ?? null;
  }, [selectedJob, techs]);

  const selectedTech = useMemo(() => {
    if (sidebarView !== 'tech_details' || !selectedItem?.id) return null;
    return (techs || []).find(t => t.id === selectedItem.id) ?? null;
  }, [sidebarView, selectedItem, techs]);

  const selectedTechLoc = useMemo(() => {
    if (!selectedTech) return null;
    return (techLocs || []).find(l => l.user_id === selectedTech.id) ?? null;
  }, [selectedTech, techLocs]);

  const selectedTechAvatarColor = useMemo(() => {
    if (!selectedTech) return AVATAR_COLORS[0];
    const idx = (techs || []).findIndex(t => t.id === selectedTech.id);
    return AVATAR_COLORS[Math.max(0, idx) % AVATAR_COLORS.length];
  }, [selectedTech, techs]);

  const selectedTechActiveJob = useMemo(() => {
    if (!selectedTech) return null;
    return (jobs || [])
      .filter(j => j.tech_id === selectedTech.id && ACTIVE_STATUSES.has(j.status))
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0] ?? null;
  }, [selectedTech, jobs]);

  const selectedTechNextJob = useMemo(() => {
    if (!selectedTech) return null;
    return (jobs || [])
      .filter(j =>
        j.tech_id === selectedTech.id &&
        !ACTIVE_STATUSES.has(j.status) &&
        !['complete', 'cancelled', 'no_show'].includes(j.status)
      )
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0] ?? null;
  }, [selectedTech, jobs]);

  const showDetailView = (isExpanded || isMobile) &&
    (sidebarView === 'job_details' || sidebarView === 'tech_details' ||
     sidebarView === 'assignment_confirm' || sidebarView === 'assign_team' ||
     sidebarView === 'route_view' ||
     sidebarView === 'activity_timeline' || sidebarView === 'quick_comms');

  return (
    <div
      id="dispatch-sidebar"
      className={`dispatch-sidebar${isFullMap ? ' dispatch-sidebar--full-map' : ''}`}
      onTransitionEnd={onTransitionEnd}
    >
      {showToggle && (
        <button
          type="button"
          className="dispatch-sidebar-toggle"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls="dispatch-sidebar"
          aria-label={isExpanded ? 'Collapse dispatch panel' : 'Expand dispatch panel'}
        >
          {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
        </button>
      )}

      {isCompact && !isMobile && (
        <DispatchCompactRail
          metrics={metrics}
          activeKpiKey={activeKpiKey}
          activeTab={activeTab}
          onExpandToTeam={onExpandToTeam}
          onExpandToJobs={onExpandToJobs}
          onKpiClick={onKpiClick}
          onEnterFullMap={onEnterFullMap}
        />
      )}

      {/* Detail view: replaces list content in expanded/mobile mode */}
      {showDetailView && sidebarView === 'job_details' && selectedJob && (
        <JobDetailView
          job={selectedJob}
          jobTech={selectedJobTech}
          onCenterJob={onCenterJob}
          onJobGeocoded={onJobGeocoded}
          onBack={onSidebarBack}
          timezone={timezone}
          onViewActivity={onViewActivity}
          onViewComms={onViewComms}
          flags={flags}
          onAssignJob={onAssignJob}
          onOpenAssignTeam={onOpenAssignTeam}
          userRole={userRole}
          techs={techs}
          onJobUpdated={onJobGeocoded}
        />
      )}

      {showDetailView && sidebarView === 'assign_team' && teamAssignment && (
        <DispatchAssignTeamPanel
          job={teamAssignment.job}
          currentTeam={teamAssignment.currentTeam}
          loadingTeam={teamAssignment.loadingTeam}
          techs={techs}
          workloadsByTechId={workloadsByTechId}
          onTeamAssigned={onTeamAssigned}
          onClose={onSidebarBack}
        />
      )}

      {showDetailView && sidebarView === 'tech_details' && selectedTech && (
        <TechDetailView
          tech={selectedTech}
          loc={selectedTechLoc}
          activeJob={selectedTechActiveJob}
          nextJob={selectedTechNextJob}
          avatarColor={selectedTechAvatarColor}
          onCenterTech={onCenterTech}
          onBack={onSidebarBack}
          jobs={jobs}
          timezone={timezone}
          onViewActivity={onViewActivity}
          onViewRoute={onViewRoute}
          flags={flags}
          delayPrediction={delaysByTechId?.get(selectedTech.id) ?? null}
        />
      )}

      {showDetailView && sidebarView === 'assignment_confirm' && assignmentPending && (
        <DispatchAssignmentPanel
          job={assignmentPending.job}
          tech={assignmentPending.tech}
          validation={assignmentPending.validation}
          techLoc={assignmentPending.techLoc ?? null}
          onConfirm={onAssignConfirmed}
          onCancel={onAssignCancel}
        />
      )}

      {showDetailView && sidebarView === 'route_view' && (
        <DispatchRoutePanel
          tech={selectedTech}
          route={routeState?.route ?? null}
          loading={routeState?.loading ?? false}
          saving={routeState?.saving ?? false}
          error={routeState?.error ?? null}
          onSaveRoute={onSaveRoute}
          onBack={onSidebarBack}
          timezone={timezone}
        />
      )}

      {showDetailView && sidebarView === 'activity_timeline' && (
        <DispatchActivityTimeline
          subject={activityState?.subject ?? null}
          events={activityState?.items ?? activityState?.events ?? []}
          loading={activityState?.loading ?? false}
          error={activityState?.error ?? null}
          hasData={activityState?.hasData ?? false}
          activeCategory={activityState?.category ?? null}
          onCategoryFilter={activityState?.filterByCategory ?? null}
          onRetry={() => {
            const s = activityState?.subject;
            if (s) activityState?.loadActivity(s.type, s.id);
          }}
          onBack={onSidebarBack}
          title={
            activityState?.subject?.type === 'job' && selectedJob
              ? `${selectedJob.client_name} — Activity`
              : activityState?.subject?.type === 'tech' && selectedTech
              ? `${selectedTech.name} — Activity`
              : 'Activity'
          }
        />
      )}

      {showDetailView && sidebarView === 'quick_comms' && selectedJob && (
        <DispatchQuickCommsPanel
          job={selectedJob}
          onBack={onSidebarBack}
          onSent={() => { onCommsSent?.(); onSidebarBack?.(); }}
        />
      )}

      {/* List view: KPI grid + date control + team/jobs panel */}
      {(isExpanded || isMobile) && !showDetailView && (
        <>
          <DispatchSidebarKpiGrid
            metrics={metrics}
            loading={kpiLoading}
            activeKpiKey={activeKpiKey}
            onKpiClick={onKpiClick}
            onEnterFullMap={onEnterFullMap}
          />
          <DispatchDateControl
            date={dispatchDate}
            onDateChange={onDateChange}
          />
          <DispatchTeamPanel
            techs={techs}
            techLocs={techLocs}
            jobs={jobs}
            sessions={sessions}
            loading={loading}
            selectedItem={selectedItem}
            onSelectTech={onSelectTech}
            onSelectJob={onSelectJob}
            panelFocus={panelFocus}
            timezone={timezone}
            flags={flags}
            workloadsByTechId={workloadsByTechId}
            onAssignJob={onAssignJob}
            userRole={userRole}
            onViewRoute={onViewRoute}
            delaysByTechId={delaysByTechId}
          />
        </>
      )}
    </div>
  );
}
