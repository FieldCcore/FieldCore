import React, { useState, useEffect, useRef } from 'react';
import { X, Phone, Search, User, PhoneCall, AlertCircle, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { formatPhone, isValidPhone } from '../utils/phone';
import * as telephony from '../services/telephony';

const CALLBACK_KEY = 'fc_callback_number';

export default function MakeACallDialer({ onClose }) {
  const nav = useNavigate();

  const [phoneStatus,    setPhoneStatus]    = useState(null);  // null=loading
  const [query,          setQuery]          = useState('');
  const [results,        setResults]        = useState([]);
  const [searching,      setSearching]      = useState(false);
  const [contact,        setContact]        = useState(null);
  const [toNumber,       setToNumber]       = useState('');
  const [callbackNumber, setCallbackNumber] = useState(() => localStorage.getItem(CALLBACK_KEY) || '');
  const [callState,      setCallState]      = useState('idle'); // idle | calling | success | error | setup_required
  const [callError,      setCallError]      = useState('');

  const searchRef  = useRef(null);
  const overlayRef = useRef(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  useEffect(() => {
    telephony.getConnectionStatus()
      .then(setPhoneStatus)
      .catch(() => setPhoneStatus({ configured: false }));
  }, []);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Debounced client search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.get(`/clients/search?q=${encodeURIComponent(q)}`);
        setResults(r.data || []);
      } catch { setResults([]); }
      setSearching(false);
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  function handleSelectContact(c) {
    setContact(c);
    setToNumber(c.phone || '');
    setQuery('');
    setResults([]);
  }

  function handleClearContact() {
    setContact(null);
    setToNumber('');
    searchRef.current?.focus();
  }

  async function handleCall() {
    localStorage.setItem(CALLBACK_KEY, callbackNumber.trim());
    setCallState('calling');
    setCallError('');
    try {
      await telephony.startOutboundCall({
        to_number:       contact ? undefined : toNumber,
        client_id:       contact?.id,
        operator_number: callbackNumber.trim(),
      });
      setCallState('success');
    } catch (err) {
      if (err.code === 'NO_PHONE_CONFIGURED') {
        setCallState('setup_required');
      } else {
        setCallState('error');
        setCallError(err.message || 'Call could not be placed. Please try again.');
      }
    }
  }

  const canCall = (
    isValidPhone(toNumber) &&
    isValidPhone(callbackNumber) &&
    callState === 'idle' &&
    phoneStatus?.configured
  );

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  if (callState === 'success') {
    return (
      <div ref={overlayRef} className="modal-overlay" style={{ zIndex: 9500 }} onClick={handleOverlayClick}
        role="dialog" aria-modal="true" aria-label="Make a Call">
        <div className="modal" style={{ width: 440 }}>
          <div className="modal-header">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PhoneCall size={16} strokeWidth={2} aria-hidden="true" />
              Make a Call
            </h2>
            <button className="btn-close" onClick={onClose} aria-label="Close">×</button>
          </div>
          <div className="modal-body">
            <div className="dialer-notice dialer-notice--success">
              <CheckCircle size={15} aria-hidden="true" />
              <div>
                <div style={{ fontWeight: 600, marginBottom: 3 }}>Call initiated</div>
                <div>You'll receive a call at {formatPhone(callbackNumber) || callbackNumber} to connect you.</div>
              </div>
            </div>
            <div className="dialer-actions" style={{ marginTop: 20 }}>
              <button className="btn-primary dialer-call-btn" onClick={onClose}>Done</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (callState === 'setup_required') {
    return (
      <div ref={overlayRef} className="modal-overlay" style={{ zIndex: 9500 }} onClick={handleOverlayClick}
        role="dialog" aria-modal="true" aria-label="Make a Call">
        <div className="modal" style={{ width: 440 }}>
          <div className="modal-header">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PhoneCall size={16} strokeWidth={2} aria-hidden="true" />
              Make a Call
            </h2>
            <button className="btn-close" onClick={onClose} aria-label="Close">×</button>
          </div>
          <div className="modal-body">
            <div className="dialer-notice dialer-notice--warning">
              <AlertCircle size={15} aria-hidden="true" />
              <div>
                <div style={{ fontWeight: 600, marginBottom: 3 }}>Business phone not configured</div>
                <div>Set up a business phone number to place outbound calls.</div>
              </div>
            </div>
            <div className="dialer-actions" style={{ marginTop: 20 }}>
              <button
                className="btn-primary dialer-call-btn"
                onClick={() => { onClose(); nav('/business-settings?tab=integrations'); }}
              >
                Go to Settings → Integrations
              </button>
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={overlayRef} className="modal-overlay" style={{ zIndex: 9500 }} onClick={handleOverlayClick}
      role="dialog" aria-modal="true" aria-label="Make a Call">
      <div className="modal" style={{ width: 440 }}>
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PhoneCall size={16} strokeWidth={2} aria-hidden="true" />
            Make a Call
          </h2>
          <button className="btn-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Error notice */}
          {callState === 'error' && (
            <div className="dialer-notice dialer-notice--error">
              <AlertCircle size={15} style={{ flexShrink: 0 }} aria-hidden="true" />
              <div>{callError}</div>
            </div>
          )}

          {/* No phone configured warning */}
          {phoneStatus && !phoneStatus.configured && callState !== 'error' && (
            <div className="dialer-notice dialer-notice--warning">
              <AlertCircle size={15} style={{ flexShrink: 0 }} aria-hidden="true" />
              <div>
                No business phone configured.{' '}
                <button
                  className="dialer-inline-link"
                  onClick={() => { onClose(); nav('/business-settings?tab=integrations'); }}
                >
                  Set up in Settings → Integrations
                </button>
              </div>
            </div>
          )}

          {/* Client search — only when no contact selected */}
          {!contact && (
            <div className="dialer-section">
              <label className="dialer-label" htmlFor="dialer-search">Search clients</label>
              <div className="dialer-field-wrap">
                <Search size={14} className="dialer-field-icon" aria-hidden="true" />
                <input
                  id="dialer-search"
                  ref={searchRef}
                  type="text"
                  className="dialer-input"
                  placeholder="Name or phone number"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  autoComplete="off"
                />
                {query && (
                  <button className="dialer-field-clear" onClick={() => setQuery('')} aria-label="Clear search">
                    <X size={12} />
                  </button>
                )}
              </div>

              {(searching || results.length > 0 || (query.trim().length >= 2 && !searching)) && (
                <div className="dialer-results" role="listbox" aria-label="Search results">
                  {searching && <div className="dialer-result-empty">Searching…</div>}
                  {!searching && results.map(c => (
                    <button
                      key={c.id}
                      role="option"
                      className="dialer-result-row"
                      onClick={() => handleSelectContact(c)}
                      aria-label={`${c.name}${c.phone ? ', ' + formatPhone(c.phone) : ''}`}
                    >
                      <span className="dialer-result-icon" aria-hidden="true">
                        <User size={13} strokeWidth={2} />
                      </span>
                      <span className="dialer-result-body">
                        <span className="dialer-result-name">{c.name}</span>
                        {c.phone && <span className="dialer-result-phone">{formatPhone(c.phone)}</span>}
                      </span>
                      {c.tier === 'vip' && <span className="dialer-result-vip">VIP</span>}
                    </button>
                  ))}
                  {!searching && query.trim().length >= 2 && results.length === 0 && (
                    <div className="dialer-result-empty">No clients found</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Selected contact card */}
          {contact && (
            <div className="dialer-contact-card">
              <div className="dialer-contact-info">
                <div className="dialer-contact-name">{contact.name}</div>
                {contact.phone && (
                  <div className="dialer-contact-phone">{formatPhone(contact.phone)}</div>
                )}
              </div>
              <button className="dialer-contact-clear" onClick={handleClearContact} aria-label="Change contact">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Number to call */}
          <div className="dialer-section">
            <label className="dialer-label" htmlFor="dialer-to">Number to call</label>
            <div className="dialer-field-wrap">
              <Phone size={14} className="dialer-field-icon" aria-hidden="true" />
              <input
                id="dialer-to"
                type="tel"
                className="dialer-input"
                placeholder="(000) 000-0000"
                value={toNumber}
                onChange={e => { setContact(null); setToNumber(e.target.value); }}
                aria-invalid={toNumber.length > 3 && !isValidPhone(toNumber) ? 'true' : undefined}
              />
            </div>
            {toNumber.length > 3 && !isValidPhone(toNumber) && (
              <div className="dialer-field-error">Enter a valid phone number</div>
            )}
          </div>

          {/* Outbound line */}
          <div className="dialer-section">
            <div className="dialer-label">Outbound line</div>
            <div className="dialer-line-row">
              {phoneStatus === null && <span className="dialer-line-loading">Loading…</span>}
              {phoneStatus?.configured && (
                <span className="dialer-line-active">
                  <span className="dialer-line-dot" aria-hidden="true" />
                  {formatPhone(phoneStatus.number) || phoneStatus.label || 'Business Phone'}
                </span>
              )}
              {phoneStatus && !phoneStatus.configured && (
                <span className="dialer-line-none">No phone configured</span>
              )}
            </div>
          </div>

          {/* Callback number */}
          <div className="dialer-section">
            <label className="dialer-label" htmlFor="dialer-callback">Your phone (callback)</label>
            <div className="dialer-field-wrap">
              <Phone size={14} className="dialer-field-icon" aria-hidden="true" />
              <input
                id="dialer-callback"
                type="tel"
                className="dialer-input"
                placeholder="(000) 000-0000"
                value={callbackNumber}
                onChange={e => setCallbackNumber(e.target.value)}
                aria-describedby="dialer-callback-hint"
              />
            </div>
            <div id="dialer-callback-hint" className="dialer-hint">
              We'll call this number first, then connect you to the client.
            </div>
          </div>

          {/* Actions */}
          <div className="dialer-actions">
            <button
              className="btn-primary dialer-call-btn"
              onClick={callState === 'error' ? () => setCallState('idle') : handleCall}
              disabled={callState === 'error' ? false : (!canCall || callState === 'calling')}
              aria-busy={callState === 'calling'}
            >
              <Phone size={14} aria-hidden="true" />
              {callState === 'calling' ? 'Calling…' : callState === 'error' ? 'Try again' : 'Call'}
            </button>
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
