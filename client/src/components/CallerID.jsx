import React, { useEffect, useState, useRef } from 'react';
import { X, Star, Phone, PhoneOff } from 'lucide-react';
import api from '../api';

function fmtNum(n) {
  if (!n) return '—';
  const d = n.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') return `+1 (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  return n;
}

function fmtAmt(n) {
  if (!n || parseFloat(n) === 0) return null;
  return `$${parseFloat(n).toFixed(0)}`;
}

function fmtTime(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000) return 'Today';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// CallerID is used two ways:
// 1. Manual "Simulate Call" button in topbar — shows mock data when no live call
// 2. Auto-popup when a real inbound call is detected via polling
export default function CallerID({ onClose, autoMode = false }) {
  const [call, setCall] = useState(null);
  const [loading, setLoading] = useState(true);
  const seenCallRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const r = await api.get('/phone/calls/latest-inbound');
        if (!cancelled) {
          setCall(r.data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    poll();
    const interval = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // In autoMode, close if no active call
  useEffect(() => {
    if (autoMode && !loading && !call) onClose();
  }, [autoMode, loading, call]);

  const isLive = !!call;

  const displayName    = call?.client_name   || fmtNum(call?.from_number) || 'Unknown Caller';
  const displayPhone   = fmtNum(call?.from_number);
  const tier           = call?.tier          || null;
  const ltv            = fmtAmt(call?.ltv);
  const lastService    = call?.last_service  || null;
  const lastAt         = fmtTime(call?.last_service_at);
  const openBalance    = fmtAmt(call?.open_balance);
  const clientNotes    = call?.client_notes  || null;

  // Static demo data when no live call and shown manually
  const demoName       = 'Thomas Garfield';
  const demoPhone      = '(813) 555-0192';
  const demoTier       = 'vip';
  const demoLtv        = '$8,400';
  const demoLastSvc    = 'Paint Correction';
  const demoLastAt     = 'Today';
  const demoNotes      = 'Has lake house property — mentioned wanting a quote next visit.';

  const showName   = isLive ? displayName   : demoName;
  const showPhone  = isLive ? displayPhone  : demoPhone;
  const showTier   = isLive ? tier          : demoTier;
  const showLtv    = isLive ? ltv           : demoLtv;
  const showSvc    = isLive ? lastService   : demoLastSvc;
  const showAt     = isLive ? lastAt        : demoLastAt;
  const showNotes  = isLive ? clientNotes   : demoNotes;

  return (
    <div className="caller-popup">
      <div className="caller-head">
        <div className="caller-ring" />
        <span className="caller-lbl">
          {isLive ? 'Live · Inbound Call' : 'Inbound · Business Line'}
        </span>
        <button className="caller-x" onClick={onClose}><X size={17} /></button>
      </div>
      <div className="caller-body">
        {loading ? (
          <div style={{ color: 'var(--steel)', fontSize: 13, padding: '8px 0' }}>Connecting…</div>
        ) : (
          <>
            <div className="caller-name">{showName}</div>
            {showPhone && <div className="caller-info">
              {showTier && <span style={{ textTransform: 'uppercase', fontWeight: 700 }}>{showTier} Client</span>}
              {showTier && ' · '}
              {showPhone}
            </div>}
            <div className="caller-grid">
              <div className="caller-cell">
                <div className="ccl">Last Job</div>
                <div className="ccv">{showAt && showSvc ? `${showAt} · ${showSvc}` : (showSvc || '—')}</div>
              </div>
              <div className="caller-cell">
                <div className="ccl">Balance</div>
                <div className="ccv" style={{ color: openBalance ? 'var(--red)' : 'var(--green)' }}>
                  {openBalance ? `${openBalance} due` : '$0 clear'}
                </div>
              </div>
              <div className="caller-cell">
                <div className="ccl">LTV</div>
                <div className="ccv">{showLtv || '—'}</div>
              </div>
              <div className="caller-cell">
                <div className="ccl">Tier</div>
                <div className="ccv" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {showTier === 'vip' && <Star size={12} fill="currentColor" strokeWidth={0} />}
                  {showTier ? showTier.toUpperCase() : '—'}
                </div>
              </div>
            </div>
            {showNotes && (
              <div className="caller-note">
                {showNotes}
              </div>
            )}
            {!isLive && (
              <div style={{ fontSize: 11, color: 'var(--steel)', marginBottom: 8, fontStyle: 'italic' }}>
                Demo — no active call. Real caller data appears automatically on inbound calls.
              </div>
            )}
            <div className="caller-actions">
              <button className="caller-btn-ans" onClick={onClose}>
                <Phone size={13} style={{ display: 'inline', marginRight: 5 }} />
                {isLive ? 'Dismiss' : 'Answer'}
              </button>
              {call?.client_id && (
                <button className="caller-btn-prof" onClick={() => { window.location.href = `/clients/${call.client_id}`; onClose(); }}>
                  View Profile
                </button>
              )}
              {!call?.client_id && (
                <button className="caller-btn-prof" onClick={onClose}>View Profile</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
