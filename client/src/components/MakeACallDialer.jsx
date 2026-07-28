import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, PhoneCall, Search, User, AlertCircle, CheckCircle, Delete as Backspace } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { formatPhone, normalizePhone, isValidPhone } from '../utils/phone';
import * as telephony from '../services/telephony';

// ── Keypad layout ─────────────────────────────────────────
const KEYS = [
  { k: '1', sub: ''     }, { k: '2', sub: 'ABC'  }, { k: '3', sub: 'DEF'  },
  { k: '4', sub: 'GHI'  }, { k: '5', sub: 'JKL'  }, { k: '6', sub: 'MNO'  },
  { k: '7', sub: 'PQRS' }, { k: '8', sub: 'TUV'  }, { k: '9', sub: 'WXYZ' },
  { k: '*', sub: ''     }, { k: '0', sub: '+'     }, { k: '#', sub: ''     },
];

function KeypadBtn({ k, sub, onPress, disabled }) {
  return (
    <button
      type="button"
      className="dialer-key"
      onClick={() => onPress(k)}
      disabled={disabled}
      aria-label={sub ? `${k} ${sub}` : k}
    >
      <span className="dialer-key-main" aria-hidden="true">{k}</span>
      {sub && <span className="dialer-key-sub" aria-hidden="true">{sub}</span>}
    </button>
  );
}

// ── Main dialer ───────────────────────────────────────────
export default function MakeACallDialer({ onClose }) {
  const nav = useNavigate();

  const [phoneStatus,    setPhoneStatus]    = useState(null);  // null=loading
  const [rawNumber,      setRawNumber]      = useState('');
  const [searchQuery,    setSearchQuery]    = useState('');
  const [searchResults,  setSearchResults]  = useState([]);
  const [searching,      setSearching]      = useState(false);
  const [contact,        setContact]        = useState(null);
  const [callState,      setCallState]      = useState('idle'); // idle|connecting|completed|failed
  const [callError,      setCallError]      = useState('');

  const displayRef = useRef(null);
  const searchRef  = useRef(null);
  const overlayRef = useRef(null);

  // Auto-focus the display on open
  useEffect(() => {
    const frame = requestAnimationFrame(() => displayRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  // Load telephony status
  useEffect(() => {
    telephony.getConnectionStatus()
      .then(setPhoneStatus)
      .catch(() => setPhoneStatus({ configured: false, has_operator_phone: false }));
  }, []);

  // Debounced client search
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.get(`/clients/search?q=${encodeURIComponent(q)}`);
        setSearchResults(r.data || []);
      } catch { setSearchResults([]); }
      setSearching(false);
    }, 220);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // ── Number manipulation ───────────────────────────────
  function appendRaw(digit) {
    if (callState === 'connecting' || callState === 'completed') return;
    setRawNumber(prev => prev + digit);
    setContact(null);
    displayRef.current?.focus();
  }

  const doBackspace = useCallback(() => {
    setRawNumber(prev => prev.slice(0, -1));
    displayRef.current?.focus();
  }, []);

  const doClear = useCallback(() => {
    setRawNumber('');
    setContact(null);
    if (callState === 'failed') setCallState('idle');
    setCallError('');
    displayRef.current?.focus();
  }, [callState]);

  // ── Display input keyboard handler ────────────────────
  // Input is readOnly — all input routed through onKeyDown + onPaste
  function handleDisplayKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'Enter')  { e.preventDefault(); if (canCall) handleCall(); return; }
    if (e.key === 'Backspace') { doBackspace(); return; }
    if (e.key === 'Delete')    { doClear();     return; }
    if (/^[\d*#]$/.test(e.key)) { appendRaw(e.key); return; }
    if (e.key === '+') { appendRaw('+'); return; }
  }

  function handleDisplayPaste(e) {
    e.preventDefault();
    const text    = e.clipboardData.getData('text');
    const cleaned = text.replace(/[^\d+*#]/g, '');
    if (cleaned) setRawNumber(prev => prev + cleaned);
  }

  // ── Search ────────────────────────────────────────────
  function handleSearchKeyDown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (searchQuery) { setSearchQuery(''); setSearchResults([]); }
      else onClose();
    }
  }

  function handleSelectContact(c) {
    setContact(c);
    const digits = (c.phone || '').replace(/[^\d+*#]/g, '');
    setRawNumber(digits);
    setSearchQuery('');
    setSearchResults([]);
    displayRef.current?.focus();
  }

  // ── Call action ───────────────────────────────────────
  async function handleCall() {
    if (!canCall) return;
    setCallState('connecting');
    setCallError('');
    try {
      await telephony.startOutboundCall({
        to_number: contact?.id ? undefined : normalizePhone(rawNumber),
        client_id: contact?.id,
      });
      setCallState('completed');
    } catch (err) {
      setCallState('failed');
      setCallError(err.message || 'Call could not be placed. Please try again.');
    }
  }

  // ── Computed ──────────────────────────────────────────
  const displayValue   = rawNumber ? formatPhone(rawNumber) : '';
  const isValidNum     = isValidPhone(rawNumber);
  const isConfigured   = phoneStatus?.configured         ?? false;
  const hasOpPhone     = phoneStatus?.has_operator_phone ?? false;
  const formReady      = callState === 'idle' || callState === 'failed';
  const canCall        = isValidNum && isConfigured && hasOpPhone && formReady;

  let callHint = '';
  if (phoneStatus !== null && !isConfigured) {
    callHint = 'Business calling not set up';
  } else if (phoneStatus !== null && isConfigured && !hasOpPhone) {
    callHint = 'Add your phone number in Account Settings';
  } else if (rawNumber && !isValidNum) {
    callHint = 'Enter a complete phone number';
  }

  const keypadDisabled = callState === 'connecting' || callState === 'completed';
  const showSetupNotice = phoneStatus !== null && (!isConfigured || !hasOpPhone);

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  // ── Completed state ───────────────────────────────────
  if (callState === 'completed') {
    return (
      <div ref={overlayRef} className="modal-overlay" style={{ zIndex: 9500 }} onClick={handleOverlayClick}
        role="dialog" aria-modal="true" aria-labelledby="dialer-title">
        <div className="modal dialer-modal">
          <div className="modal-header" style={{ padding: '20px 24px 16px' }}>
            <h2 id="dialer-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PhoneCall size={15} aria-hidden="true" /> Make a Call
            </h2>
            <button className="btn-close" onClick={onClose} aria-label="Close dialer">×</button>
          </div>
          <div className="modal-body" style={{ padding: '20px 24px 28px' }}>
            <div className="dialer-completed">
              <div className="dialer-completed-icon" aria-hidden="true">
                <CheckCircle size={30} />
              </div>
              <div className="dialer-completed-title">Call initiated</div>
              <div className="dialer-completed-num">{displayValue}</div>
              {contact && (
                <div className="dialer-completed-contact">{contact.name}</div>
              )}
              <div className="dialer-completed-msg">
                You'll receive a call on your registered phone shortly.
              </div>
              <button className="dialer-call-btn" style={{ marginTop: 8 }} onClick={onClose}
                aria-label="Close dialer">
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main dialer view ──────────────────────────────────
  return (
    <div ref={overlayRef} className="modal-overlay" style={{ zIndex: 9500 }} onClick={handleOverlayClick}
      role="dialog" aria-modal="true" aria-labelledby="dialer-title">
      <div className="modal dialer-modal">

        {/* Header */}
        <div className="modal-header" style={{ padding: '20px 24px 14px', flexShrink: 0 }}>
          <h2 id="dialer-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PhoneCall size={15} aria-hidden="true" /> Make a Call
          </h2>
          <button className="btn-close" onClick={onClose} aria-label="Close dialer">×</button>
        </div>

        <div className="dialer-body">

          {/* Setup notice */}
          {showSetupNotice && (
            <div className="dialer-notice dialer-notice--warning" role="status">
              <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
              <span>
                {!isConfigured
                  ? <>Business calling is not configured yet. <button className="dialer-inline-link" onClick={() => { onClose(); nav('/business-settings?tab=integrations'); }}>Set up in Settings → Integrations</button></>
                  : <>Add a phone number to your profile to place outbound calls.</>
                }
              </span>
            </div>
          )}

          {/* Failed notice */}
          {callState === 'failed' && callError && (
            <div className="dialer-notice dialer-notice--error" role="alert">
              <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
              <span>{callError}</span>
            </div>
          )}

          {/* Client search */}
          <div className="dialer-search-section">
            <div className="dialer-search-row">
              <Search size={13} className="dialer-search-icon" aria-hidden="true" />
              <input
                ref={searchRef}
                type="text"
                className="dialer-search-input"
                placeholder="Search clients or contacts"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                aria-label="Search clients or contacts"
                aria-autocomplete="list"
                aria-controls="dialer-search-results"
                autoComplete="off"
                disabled={keypadDisabled}
              />
              {searchQuery && (
                <button className="dialer-search-clear"
                  onClick={() => { setSearchQuery(''); setSearchResults([]); displayRef.current?.focus(); }}
                  aria-label="Clear search" type="button" tabIndex={-1}>
                  <X size={11} aria-hidden="true" />
                </button>
              )}
            </div>

            {(searching || searchResults.length > 0 || (searchQuery.trim().length >= 2 && !searching)) && (
              <div id="dialer-search-results" className="dialer-search-results" role="listbox" aria-label="Client results">
                {searching && <div className="dialer-search-empty">Searching…</div>}
                {!searching && searchResults.slice(0, 4).map(c => (
                  <button key={c.id} role="option" type="button" className="dialer-search-result"
                    onClick={() => handleSelectContact(c)}
                    aria-label={`${c.name}${c.phone ? ', ' + formatPhone(c.phone) : ''}`}>
                    <span className="dialer-sr-avatar" aria-hidden="true"><User size={12} /></span>
                    <span className="dialer-sr-body">
                      <span className="dialer-sr-name">{c.name}</span>
                      {c.phone && <span className="dialer-sr-phone">{formatPhone(c.phone)}</span>}
                    </span>
                    {c.tier === 'vip' && <span className="dialer-sr-vip" aria-label="VIP">VIP</span>}
                  </button>
                ))}
                {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                  <div className="dialer-search-empty">No clients found</div>
                )}
              </div>
            )}
          </div>

          {/* Number display */}
          <div className="dialer-display" onClick={() => displayRef.current?.focus()}>
            <div className="dialer-display-inner">
              {contact && rawNumber && (
                <div className="dialer-display-contact" aria-live="polite">{contact.name}</div>
              )}
              {/* readOnly input: keyboard captured via onKeyDown, value is formatted display */}
              <input
                ref={displayRef}
                type="tel"
                readOnly
                className="dialer-number-input"
                value={displayValue}
                onKeyDown={handleDisplayKeyDown}
                onPaste={handleDisplayPaste}
                aria-label={rawNumber ? `Number to call: ${displayValue}` : 'Number to call — enter a number'}
                aria-live="polite"
                autoComplete="off"
                disabled={callState === 'connecting'}
              />
            </div>
            <div className="dialer-display-ctrl" aria-hidden="true">
              {rawNumber && !keypadDisabled && (
                <>
                  <button className="dialer-ctrl-btn" type="button" tabIndex={-1}
                    onClick={e => { e.stopPropagation(); doClear(); }} aria-label="Clear number">
                    <X size={13} />
                  </button>
                  <button className="dialer-ctrl-btn" type="button" tabIndex={-1}
                    onClick={e => { e.stopPropagation(); doBackspace(); }} aria-label="Delete last digit">
                    <Backspace size={14} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Keypad */}
          <div className="dialer-keypad" role="group" aria-label="Keypad">
            {KEYS.map(({ k, sub }) => (
              <KeypadBtn key={k} k={k} sub={sub} onPress={appendRaw} disabled={keypadDisabled} />
            ))}
          </div>

          {/* Outbound line */}
          <div className="dialer-outbound" aria-label="Outbound line">
            <span className="dialer-outbound-label">Outbound line</span>
            <span className="dialer-outbound-val">
              {phoneStatus === null ? (
                <span className="dialer-outbound-dim">Loading…</span>
              ) : isConfigured ? (
                <>
                  <span className="dialer-line-dot" aria-hidden="true" />
                  <span className="dialer-outbound-num">
                    {formatPhone(phoneStatus.number) || phoneStatus.label || 'Business Phone'}
                  </span>
                </>
              ) : (
                <span className="dialer-outbound-dim">No phone configured</span>
              )}
            </span>
          </div>

          {/* Call action */}
          <div className="dialer-action-wrap">
            <button
              className={`dialer-call-btn${callState === 'connecting' ? ' dialer-call-btn--busy' : ''}`}
              onClick={handleCall}
              disabled={!canCall || callState === 'connecting'}
              aria-busy={callState === 'connecting'}
              aria-label={
                callState === 'connecting' ? 'Connecting call'
                  : canCall ? `Call ${displayValue}`
                  : 'Call (unavailable)'
              }
            >
              <PhoneCall size={15} aria-hidden="true" />
              {callState === 'connecting' ? 'Connecting…' : 'Call'}
            </button>
            {callHint && (
              <div className="dialer-call-hint" role="status" aria-live="polite">{callHint}</div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
