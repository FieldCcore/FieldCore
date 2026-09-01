'use strict';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { format, addDays } from 'date-fns';
import { Search, X, Plus, Trash2, ChevronDown } from 'lucide-react';
import api from '../api';
import Autocomplete, { highlight } from './Autocomplete';
import AddressAutocomplete from './AddressAutocomplete';
import ClientLocationField from './ClientLocationField';
import CollectPaymentWorkspace from './CollectPaymentWorkspace';
import CreationSection from './CreationSection';
import CreationCard from './CreationCard';

const TODAY = new Date().toISOString().slice(0, 10);

const TERM_OPTIONS = [
  { value: 'due_on_receipt', label: 'Due on receipt' },
  { value: 'net_7',          label: 'Net 7' },
  { value: 'net_15',         label: 'Net 15' },
  { value: 'net_30',         label: 'Net 30' },
  { value: 'net_45',         label: 'Net 45' },
  { value: 'net_60',         label: 'Net 60' },
  { value: 'net_90',         label: 'Net 90' },
  { value: 'custom',         label: 'Custom date' },
];

const TERM_DAYS = { net_7: 7, net_15: 15, net_30: 30, net_45: 45, net_60: 60, net_90: 90 };

const CADENCE_LABELS = {
  weekly:        'Every week',
  every_2_weeks: 'Every 2 weeks',
  every_3_weeks: 'Every 3 weeks',
  every_4_weeks: 'Every 4 weeks',
  biweekly:      'Every 2 weeks',
  monthly:       'Monthly',
  quarterly:     'Quarterly',
  annual:        'Annually',
  custom:        'Custom interval',
  every_service: 'Every service',
};

const AGR_CADENCE_OPTIONS = [
  { value: 'weekly',        label: 'Weekly' },
  { value: 'every_2_weeks', label: 'Every 2 Weeks' },
  { value: 'every_3_weeks', label: 'Every 3 Weeks' },
  { value: 'every_4_weeks', label: 'Every 4 Weeks' },
  { value: 'monthly',       label: 'Monthly' },
  { value: 'quarterly',     label: 'Quarterly' },
  { value: 'annual',        label: 'Annual' },
  { value: 'custom',        label: 'Custom…' },
];

const AGR_BILLING_CADENCE_OPTIONS = [
  { value: 'every_service', label: 'Every Service' },
  { value: 'weekly',        label: 'Weekly' },
  { value: 'every_2_weeks', label: 'Every 2 Weeks' },
  { value: 'monthly',       label: 'Monthly' },
  { value: 'quarterly',     label: 'Quarterly' },
  { value: 'annual',        label: 'Annual' },
  { value: 'custom',        label: 'Custom…' },
];

const AGR_BILLING_TRIGGER_OPTIONS = [
  { value: 'first_day',                 label: 'First Day of Billing Period' },
  { value: 'specific_day',              label: 'Specific Day of Month' },
  { value: 'first_scheduled',           label: 'First Scheduled Service' },
  { value: 'first_completed',           label: 'First Completed Service' },
  { value: 'every_service',             label: 'Every Service Occurrence' },
  { value: 'days_before_first_service', label: 'Days Before First Service' },
];

const AGR_EXTRA_POLICY_OPTIONS = [
  { value: 'all_included',          label: 'All Scheduled Visits Included' },
  { value: 'charge_per_additional', label: 'Charge Per Additional Visit' },
  { value: 'approval_required',     label: 'Require Approval for Extra Visits' },
  { value: 'no_additional',         label: 'No Additional Visits Allowed' },
  { value: 'rollover',              label: 'Roll Extra Visit Into Next Period' },
  { value: 'manual_review',         label: 'Flag for Manual Review' },
];

const AGR_MISSED_POLICY_OPTIONS = [
  { value: 'no_adjustment', label: 'No Adjustment — Full Price Retained' },
  { value: 'reschedule',    label: 'Reschedule to Another Date' },
  { value: 'carry_forward', label: 'Carry Forward to Next Period' },
  { value: 'forfeited',     label: 'Service Forfeited' },
  { value: 'credit',        label: 'Issue Credit' },
  { value: 'rollover',      label: 'Roll Forward to Next Period' },
  { value: 'manual_review', label: 'Flag for Manual Review' },
];

const AGR_PAYMENT_BEHAVIOR_OPTIONS = [
  { value: 'send_invoice',     label: 'Send Invoice to Client' },
  { value: 'create_only',      label: 'Create Draft — No Email' },
  { value: 'auto_charge_card', label: 'Auto-Charge Card on File' },
  { value: 'auto_charge_ach',  label: 'Auto-Charge ACH on File' },
];

const AGR_DISCOUNT_TYPE_OPTIONS = [
  { value: 'none',    label: 'No Discount' },
  { value: 'percent', label: 'Percent Off' },
  { value: 'fixed',   label: 'Fixed Amount Off' },
];

const AGR_WEEKDAY_OPTIONS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

function newLineItem() {
  return {
    _id:        Math.random().toString(36).slice(2),
    service_id: null,
    name:       '',
    description:'',
    quantity:   '1',
    unit_price: '',
    taxable:    true,
  };
}

function fmt(n) {
  const v = parseFloat(n);
  return isNaN(v) ? '—' : '$' + v.toFixed(2);
}

function lineTotal(item) {
  const q = parseFloat(item.quantity) || 0;
  const p = parseFloat(item.unit_price) || 0;
  return q * p;
}

function fmtPeriodFE(start, end) {
  if (!start || !end) return '';
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end   + 'T00:00:00');
  return `${format(s, 'MMM d')}–${format(e, 'MMM d, yyyy')}`;
}

// ── computeNextOccurrences — pure date math, mirrors backend nextOccurrences ──
function computeNextOccurrences(cadence, startedAt, intervalDays, count, preferredWeekday, serviceDayOfMonth, endConditionType, endDate, endAfterOccurrences) {
  if (!startedAt) return [];
  const n     = Math.max(1, count || 4);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(startedAt + 'T00:00:00');
  const c     = cadence === 'biweekly' ? 'every_2_weeks' : (cadence || 'monthly');
  const out   = [];

  if (c === 'monthly') {
    const dom = serviceDayOfMonth != null ? serviceDayOfMonth : start.getDate();
    let d = new Date(start.getFullYear(), start.getMonth(), dom);
    while (d < today) {
      const nm = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      nm.setDate(Math.min(dom, new Date(nm.getFullYear(), nm.getMonth() + 1, 0).getDate()));
      d = nm;
    }
    while (out.length < n) {
      out.push(d.toISOString().slice(0, 10));
      const nm = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      nm.setDate(Math.min(dom, new Date(nm.getFullYear(), nm.getMonth() + 1, 0).getDate()));
      d = nm;
    }
  } else if (c === 'quarterly') {
    let d = new Date(start);
    while (d < today) d.setDate(d.getDate() + 91);
    while (out.length < n) { out.push(d.toISOString().slice(0, 10)); d = new Date(d); d.setDate(d.getDate() + 91); }
  } else if (c === 'annual') {
    let d = new Date(start);
    while (d < today) d.setFullYear(d.getFullYear() + 1);
    while (out.length < n) { out.push(d.toISOString().slice(0, 10)); d = new Date(d); d.setFullYear(d.getFullYear() + 1); }
  } else {
    const days = c === 'weekly' ? 7 : c === 'every_2_weeks' ? 14 : c === 'every_3_weeks' ? 21
               : c === 'every_4_weeks' ? 28 : (parseInt(intervalDays, 10) || 7);
    let anchor = new Date(start);
    // Snap to preferred weekday for weekly/biweekly family
    if (
      preferredWeekday != null &&
      (c === 'weekly' || c === 'every_2_weeks' || c === 'every_3_weeks' || c === 'every_4_weeks')
    ) {
      const cur  = anchor.getDay();
      let diff   = preferredWeekday - cur;
      if (diff < 0) diff += 7;
      anchor.setDate(anchor.getDate() + diff);
    }
    const diff = Math.floor((today - anchor) / 86400000);
    const wins = diff >= 0 ? Math.floor(diff / days) : 0;
    let d = new Date(anchor);
    d.setDate(d.getDate() + wins * days);
    if (d < today) d.setDate(d.getDate() + days);
    while (out.length < n) {
      out.push(d.toISOString().slice(0, 10));
      d = new Date(d); d.setDate(d.getDate() + days);
    }
  }
  // Apply end condition cutoffs to the preview
  if (endConditionType === 'date' && endDate) {
    return out.filter(d => d <= endDate);
  }
  if (endConditionType === 'service_count' && endAfterOccurrences != null && endAfterOccurrences > 0) {
    return out.slice(0, endAfterOccurrences);
  }
  return out;
}

// ── ServiceDropdown — per-line-item service catalog picker ────────────────────
function ServiceDropdown({ value, onChange, onServiceSelect }) {
  const [open,      setOpen]      = useState(false);
  const [results,   setResults]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef = useRef(null);
  const abortRef    = useRef(null);
  const wrapRef     = useRef(null);

  const fetchSvcs = useCallback((q) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    api.get(`/services/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
      .then(r => { if (!ctrl.signal.aborted) { setResults(r.data || []); setActiveIdx(-1); } })
      .catch(() => { if (!ctrl.signal.aborted) setResults([]); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
  }, []);

  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleFocus() {
    setOpen(true);
    fetchSvcs(value || '');
  }

  function handleChange(e) {
    const val = e.target.value;
    onChange(val);
    setOpen(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSvcs(val), 275);
  }

  function handleKeyDown(e) {
    if (!open) return;
    const total = results.length + 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => (i < total - 1 ? i + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => (i > 0 ? i - 1 : total - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && activeIdx < results.length) {
        select(results[activeIdx]);
      } else {
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIdx(-1);
    }
  }

  function select(svc) {
    setOpen(false);
    onServiceSelect(svc);
  }

  const showDrop = open && (loading || results.length > 0);

  return (
    <div className="svc-picker-wrap ib-col-name" ref={wrapRef}>
      <input
        className="ib-input svc-name-input"
        type="text"
        placeholder="Service name"
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
      />
      {showDrop && (
        <div className="svc-drop" role="listbox">
          {loading ? (
            <div className="svc-drop-state">Searching…</div>
          ) : (
            <>
              {results.map((svc, i) => (
                <div
                  key={svc.id}
                  className={`svc-drop-item${i === activeIdx ? ' svc-drop-item--active' : ''}`}
                  role="option"
                  aria-selected={i === activeIdx}
                  onMouseDown={() => select(svc)}
                  onMouseEnter={() => setActiveIdx(i)}
                >
                  <span className="svc-drop-name">{svc.name}</span>
                  {svc.category && <span className="svc-drop-category">{svc.category}</span>}
                  {svc.description && <span className="svc-drop-desc">{svc.description}</span>}
                  {svc.price != null && (
                    <span className="svc-drop-price">${parseFloat(svc.price).toFixed(2)}</span>
                  )}
                </div>
              ))}
              <div
                className={`svc-drop-item svc-drop-custom${activeIdx === results.length ? ' svc-drop-item--active' : ''}`}
                role="option"
                onMouseDown={() => setOpen(false)}
                onMouseEnter={() => setActiveIdx(results.length)}
              >
                <Plus size={12} /> Custom line item
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── AgreementServiceSearch — service-catalog autocomplete for agreement form ───
function AgreementServiceSearch({ value, onChange, onSelect, placeholder }) {
  const [open,    setOpen]    = useState(false);
  const [results, setResults] = useState([]);
  const debRef  = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    function h(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function fetchSvcs(q) {
    api.get(`/agreements/services?q=${encodeURIComponent(q)}`)
      .then(r => setResults(r.data || []))
      .catch(() => setResults([]));
  }

  function handleChange(e) {
    const val = e.target.value;
    onChange(val);
    setOpen(true);
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => fetchSvcs(val), 275);
  }

  function handleFocus() { setOpen(true); fetchSvcs(value || ''); }

  function select(svc) { setOpen(false); onSelect(svc); }

  return (
    <div style={{ position: 'relative' }} ref={wrapRef}>
      <input
        className="ib-input"
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        placeholder={placeholder || 'e.g. Lawn Mowing, Fleet Detail'}
        data-testid="agr-service-type"
      />
      {open && (results.length > 0) && (
        <div className="svc-drop" role="listbox">
          {results.map(svc => (
            <div key={svc.id} className="svc-drop-item" role="option" onMouseDown={() => select(svc)}>
              <span className="svc-drop-name">{svc.name}</span>
              {svc.category && <span className="svc-drop-category" style={{ color: 'var(--slate)', fontSize: '0.72rem' }}>{svc.category}</span>}
              {svc.price != null && <span className="svc-drop-price">${parseFloat(svc.price).toFixed(2)}</span>}
            </div>
          ))}
          <div className="svc-drop-item svc-drop-custom" role="option" onMouseDown={() => { onChange(value); setOpen(false); }}>
            <Plus size={12} /> Custom service
          </div>
        </div>
      )}
    </div>
  );
}

// ── newSchedule — empty schedule template ─────────────────────────────────────
function newSchedule() {
  return {
    _id:               Math.random().toString(36).slice(2),
    serviceType:       '',
    serviceId:         null,
    assetLabel:        '',
    serviceAddress:    '',
    serviceLocationId: null,
    cadence:           'monthly',
    svcIntervalDays:   '',
    startedAt:         TODAY,
    preferredWeekday:  '',
    serviceDayOfMonth: '',
    endCondition:      'none',
    endDate:           '',
    endAfterOccurrences: '',
    preferredStartTime: '09:00',
  };
}

// ── InlineAgreementForm — multi-schedule recurring agreement builder ───────────
export function InlineAgreementForm({ clientId: initialClientId, onSaved, onCancel }) {
  // Client — may be pre-set from parent or chosen within the form
  const [resolvedClientId, setResolvedClientId] = useState(initialClientId || null);
  const [formClientName,   setFormClientName]   = useState('');
  const [clientSearchQ,    setClientSearchQ]    = useState('');
  const [clientResults,    setClientResults]    = useState([]);
  const clientDebRef = useRef(null);

  useEffect(() => {
    if (initialClientId) setResolvedClientId(initialClientId);
  }, [initialClientId]);

  function searchClients(q) {
    clearTimeout(clientDebRef.current);
    clientDebRef.current = setTimeout(() => {
      if (!q.trim()) { setClientResults([]); return; }
      api.get(`/clients/search?q=${encodeURIComponent(q)}`)
        .then(r => setClientResults(r.data || []))
        .catch(() => setClientResults([]));
    }, 275);
  }

  function pickFormClient(c) {
    setResolvedClientId(c.id);
    setFormClientName(c.name);
    setClientSearchQ(c.name);
    setClientResults([]);
  }

  // Multi-schedule state
  const [schedules, setSchedules] = useState([newSchedule()]);

  function updateSchedule(idx, field, val) {
    setSchedules(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const updated = { ...s, [field]: val };
      // Clear weekday when switching away from weekly cadences
      if (field === 'cadence' && !['weekly','every_2_weeks','every_3_weeks','every_4_weeks'].includes(val))
        updated.preferredWeekday = '';
      // Clear day-of-month when switching away from monthly
      if (field === 'cadence' && val !== 'monthly')
        updated.serviceDayOfMonth = '';
      // Clear end sub-fields when end condition type changes
      if (field === 'endCondition') { updated.endDate = ''; updated.endAfterOccurrences = ''; }
      return updated;
    }));
  }

  function addSchedule()       { setSchedules(prev => [...prev, newSchedule()]); }
  function removeSchedule(idx) { if (schedules.length > 1) setSchedules(prev => prev.filter((_, i) => i !== idx)); }

  // Agreement basics
  const [agrName, setAgrName] = useState('');

  // Billing
  const [agrBillingCadence,    setAgrBillingCadence]    = useState('monthly');
  const [agrBillingTrigger,    setAgrBillingTrigger]    = useState('first_day');
  const [agrBillingDay,        setAgrBillingDay]        = useState('');
  const [agrDaysBeforeService, setAgrDaysBeforeService] = useState('');
  const [agrPlanPrice,         setAgrPlanPrice]         = useState('');
  // Payment behavior
  const [agrPaymentBehavior,   setAgrPaymentBehavior]   = useState('send_invoice');
  // Discount
  const [agrDiscountType,      setAgrDiscountType]      = useState('none');
  const [agrDiscountValue,     setAgrDiscountValue]     = useState('');
  const [agrDiscountName,      setAgrDiscountName]      = useState('');
  // Taxability
  const [agrTaxable,           setAgrTaxable]           = useState(false);
  // Exceptions
  const [agrExtraPolicy,              setAgrExtraPolicy]              = useState('all_included');
  const [agrAdditionalServicePrice,   setAgrAdditionalServicePrice]   = useState('');
  const [agrMissedPolicy,             setAgrMissedPolicy]             = useState('no_adjustment');
  // Meta
  const [agrNotes, setAgrNotes] = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const schedulesValid = schedules.length > 0 && schedules.every(s =>
    s.cadence !== 'custom' || parseInt(s.svcIntervalDays, 10) > 0
  );

  const canSave = !saving
    && !!resolvedClientId
    && agrName.trim().length > 0
    && parseFloat(agrPlanPrice) > 0
    && schedulesValid
    && (agrBillingTrigger !== 'specific_day'
        || (parseInt(agrBillingDay, 10) >= 1 && parseInt(agrBillingDay, 10) <= 31))
    && (agrBillingTrigger !== 'days_before_first_service'
        || parseInt(agrDaysBeforeService, 10) > 0)
    && (agrDiscountType === 'none' || parseFloat(agrDiscountValue) > 0)
    && (agrExtraPolicy !== 'charge_per_additional' || parseFloat(agrAdditionalServicePrice) > 0);

  async function handleCreate() {
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/agreements', {
        client_id:           resolvedClientId,
        name:                agrName.trim(),
        billing_cadence:     agrBillingCadence,
        billing_trigger:     agrBillingTrigger,
        billing_day:         agrBillingTrigger === 'specific_day' ? parseInt(agrBillingDay, 10) : null,
        days_before_service: agrBillingTrigger === 'days_before_first_service' ? parseInt(agrDaysBeforeService, 10) : null,
        plan_price:          parseFloat(agrPlanPrice) || 0,
        included_services_per_period: 99,
        payment_behavior:    agrPaymentBehavior,
        discount_type:       agrDiscountType,
        discount_value:      agrDiscountType !== 'none' ? parseFloat(agrDiscountValue) || 0 : null,
        discount_name:       agrDiscountType !== 'none' && agrDiscountName.trim() ? agrDiscountName.trim() : null,
        taxable:             agrTaxable,
        extra_occurrence_policy:  agrExtraPolicy,
        additional_service_price: agrExtraPolicy === 'charge_per_additional' ? parseFloat(agrAdditionalServicePrice) || 0 : null,
        missed_service_policy:    agrMissedPolicy,
        notes:               agrNotes.trim() || null,
        service_schedules:   schedules.map(s => ({
          service_type:          s.serviceType || null,
          service_id:            s.serviceId || null,
          asset_label:           s.assetLabel || null,
          location_id:           s.serviceLocationId || null,
          service_address:       s.serviceAddress || null,
          cadence:               s.cadence,
          service_interval_days: s.cadence === 'custom' ? parseInt(s.svcIntervalDays, 10) : null,
          preferred_weekday:     s.preferredWeekday !== '' ? parseInt(s.preferredWeekday, 10) : null,
          service_day_of_month:  s.serviceDayOfMonth !== '' ? parseInt(s.serviceDayOfMonth, 10) : null,
          started_at:            s.startedAt || null,
          end_condition_type:    s.endCondition === 'date' ? 'date' : s.endCondition === 'occurrences' ? 'service_count' : 'none',
          end_date:              s.endCondition === 'date' ? (s.endDate || null) : null,
          end_after_occurrences: s.endCondition === 'occurrences' ? parseInt(s.endAfterOccurrences, 10) || null : null,
          preferred_start_time:  s.preferredStartTime || '09:00',
        })),
      });
      onSaved(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create agreement');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ib-inline-agr">
      <div className="ib-inline-agr-header">New Recurring Agreement</div>

      {/* ── Client — shown when no client was pre-selected ─────────────────── */}
      {!initialClientId && (
        <CreationSection label="Client *" noBorder>
          <div style={{ position: 'relative' }}>
            <input
              className="ib-input"
              value={clientSearchQ}
              onChange={e => {
                setClientSearchQ(e.target.value);
                searchClients(e.target.value);
                setResolvedClientId(null);
                setFormClientName('');
                // Clear schedule locations so auto-select fires when a new client is picked
                setSchedules(prev => prev.map(s => ({ ...s, serviceLocationId: null, serviceAddress: '' })));
              }}
              placeholder="Search by name, company, email…"
              data-testid="agr-client-search"
            />
            {clientResults.length > 0 && (
              <div className="svc-drop" role="listbox">
                {clientResults.map(c => (
                  <div key={c.id} className="svc-drop-item" role="option" onMouseDown={() => pickFormClient(c)}>
                    <span className="svc-drop-name">{c.name}</span>
                    {c.email && <span className="svc-drop-price" style={{ color: 'var(--slate)', fontSize: '0.75rem' }}>{c.email}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          {resolvedClientId && formClientName && (
            <p style={{ fontSize: '0.75rem', color: 'var(--green)', marginTop: 4 }}>
              Client: <strong>{formClientName}</strong>
            </p>
          )}
        </CreationSection>
      )}

      {/* ── Agreement Basics ──────────────────────────────────────────────── */}
      <CreationSection label="Agreement Basics">
        <div className="ib-inline-agr-row">
          <div className="ib-field ib-field--grow">
            <label className="ib-label">Agreement Name *</label>
            <input
              className="ib-input"
              value={agrName}
              onChange={e => setAgrName(e.target.value)}
              placeholder="e.g. Weekly + Biweekly Vehicle Maintenance"
              data-testid="agr-name"
            />
          </div>
        </div>
      </CreationSection>

      {/* ── Service Schedules ─────────────────────────────────────────────── */}
      <CreationSection label="Service Schedules">

        {schedules.map((s, idx) => {
          const isWeekly = ['weekly','every_2_weeks','every_3_weeks','every_4_weeks'].includes(s.cadence);
          const previewWd  = s.preferredWeekday !== '' ? parseInt(s.preferredWeekday, 10) : null;
          const previewDom = s.serviceDayOfMonth !== '' ? parseInt(s.serviceDayOfMonth, 10) : null;
          const previewEndOcc = s.endCondition === 'occurrences' && s.endAfterOccurrences !== ''
            ? parseInt(s.endAfterOccurrences, 10) : null;
          const previewDates = computeNextOccurrences(
            s.cadence, s.startedAt, parseInt(s.svcIntervalDays, 10) || null, 4,
            previewWd, previewDom,
            s.endCondition === 'date' ? 'date' : s.endCondition === 'occurrences' ? 'service_count' : 'none',
            s.endDate, previewEndOcc,
          );

          return (
            <CreationCard
              key={s._id}
              label={`Schedule ${idx + 1}`}
              showRemove={schedules.length > 1}
              onRemove={() => removeSchedule(idx)}
              removeTestId={`agr-remove-schedule-${idx}`}
              testId={`agr-schedule-${idx}`}
            >

              {/* Service / Package */}
              <div className="ib-inline-agr-row">
                <div className="ib-field ib-field--grow">
                  <label className="ib-label">Service / Package</label>
                  <AgreementServiceSearch
                    value={s.serviceType}
                    onChange={val => updateSchedule(idx, 'serviceType', val)}
                    onSelect={svc => {
                      setSchedules(prev => prev.map((sc, i) => i !== idx ? sc : {
                        ...sc, serviceType: svc.name, serviceId: svc.id,
                      }));
                      if (!agrPlanPrice || parseFloat(agrPlanPrice) === 0)
                        setAgrPlanPrice(String(parseFloat(svc.price || 0).toFixed(2)));
                    }}
                    placeholder="e.g. Full Detail, HVAC Maintenance"
                  />
                </div>
              </div>

              {/* Asset / Service For */}
              <div className="ib-inline-agr-row">
                <div className="ib-field ib-field--grow">
                  <label className="ib-label">Asset / Service For</label>
                  <input
                    className="ib-input"
                    value={s.assetLabel}
                    onChange={e => updateSchedule(idx, 'assetLabel', e.target.value)}
                    placeholder="e.g. Vehicle 1, HVAC Unit A, Front Lawn"
                    data-testid={`agr-asset-label-${idx}`}
                  />
                </div>
              </div>

              {/* Service Location */}
              <div className="ib-inline-agr-row">
                <div className="ib-field ib-field--grow">
                  <label className="ib-label">Service Location</label>
                  <ClientLocationField
                    clientId={resolvedClientId || null}
                    locationId={s.serviceLocationId || null}
                    address={s.serviceAddress}
                    onSelect={loc => {
                      updateSchedule(idx, 'serviceLocationId', loc.location_id || null);
                      updateSchedule(idx, 'serviceAddress', loc.address || '');
                    }}
                    onAddressChange={val => {
                      updateSchedule(idx, 'serviceLocationId', null);
                      updateSchedule(idx, 'serviceAddress', val);
                    }}
                    testId={`agr-service-address-${idx}`}
                  />
                </div>
              </div>

              {/* Cadence + optional interval days + Start Date */}
              <div className="ib-inline-agr-row">
                <div className="ib-field">
                  <label className="ib-label">Cadence</label>
                  <select
                    className="ib-select"
                    value={s.cadence}
                    onChange={e => updateSchedule(idx, 'cadence', e.target.value)}
                    data-testid={`agr-cadence-${idx}`}
                  >
                    {AGR_CADENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {s.cadence === 'custom' && (
                  <div className="ib-field">
                    <label className="ib-label">Every N days</label>
                    <input
                      className="ib-input"
                      type="number" min="1"
                      value={s.svcIntervalDays}
                      onChange={e => updateSchedule(idx, 'svcIntervalDays', e.target.value)}
                      placeholder="10"
                      data-testid={`agr-interval-days-${idx}`}
                    />
                  </div>
                )}
                <div className="ib-field">
                  <label className="ib-label">Start Date</label>
                  <input
                    className="ib-input"
                    type="date"
                    value={s.startedAt}
                    onChange={e => updateSchedule(idx, 'startedAt', e.target.value)}
                    data-testid={`agr-started-at-${idx}`}
                  />
                </div>
              </div>

              {/* Preferred Day — weekly cadences only */}
              {isWeekly && (
                <div className="ib-inline-agr-row">
                  <div className="ib-field">
                    <label className="ib-label">Preferred Day</label>
                    <select
                      className="ib-select"
                      value={s.preferredWeekday}
                      onChange={e => updateSchedule(idx, 'preferredWeekday', e.target.value)}
                      data-testid={`agr-weekday-${idx}`}
                    >
                      <option value="">Any (use start date)</option>
                      {AGR_WEEKDAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* Day of month — monthly only */}
              {s.cadence === 'monthly' && (
                <div className="ib-inline-agr-row">
                  <div className="ib-field">
                    <label className="ib-label">Day of Month</label>
                    <input
                      className="ib-input"
                      type="number" min="1" max="31"
                      value={s.serviceDayOfMonth}
                      onChange={e => updateSchedule(idx, 'serviceDayOfMonth', e.target.value)}
                      placeholder={s.startedAt ? `${new Date(s.startedAt + 'T00:00:00').getDate()} (from start date)` : '1–31'}
                      data-testid={`agr-dom-${idx}`}
                    />
                  </div>
                </div>
              )}

              {/* End Condition */}
              <div className="ib-inline-agr-row">
                <div className="ib-field">
                  <label className="ib-label">End Condition</label>
                  <select
                    className="ib-select"
                    value={s.endCondition}
                    onChange={e => updateSchedule(idx, 'endCondition', e.target.value)}
                    data-testid={`agr-end-condition-${idx}`}
                  >
                    <option value="none">No end date</option>
                    <option value="date">Specific end date</option>
                    <option value="occurrences">After X services</option>
                  </select>
                </div>
                {s.endCondition === 'date' && (
                  <div className="ib-field">
                    <label className="ib-label">End Date</label>
                    <input
                      className="ib-input"
                      type="date"
                      value={s.endDate}
                      onChange={e => updateSchedule(idx, 'endDate', e.target.value)}
                      min={s.startedAt}
                      data-testid={`agr-end-date-${idx}`}
                    />
                  </div>
                )}
                {s.endCondition === 'occurrences' && (
                  <div className="ib-field">
                    <label className="ib-label">After how many services?</label>
                    <input
                      className="ib-input"
                      type="number" min="1"
                      value={s.endAfterOccurrences}
                      onChange={e => updateSchedule(idx, 'endAfterOccurrences', e.target.value)}
                      placeholder="e.g. 12"
                      data-testid={`agr-end-occ-${idx}`}
                    />
                  </div>
                )}
              </div>

              {/* Per-schedule preview */}
              {previewDates.length > 0 && (
                <div className="ib-agr-preview" data-testid={`agr-preview-${idx}`}>
                  <span className="ib-agr-preview-label">Next services:</span>
                  <div className="ib-agr-preview-dates">
                    {previewDates.map(d => (
                      <span key={d} className="ib-agr-preview-date">
                        {format(new Date(d + 'T00:00:00'), 'MMM d, yyyy')}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CreationCard>
          );
        })}

        {/* Add Schedule */}
        <button
          type="button"
          className="ib-add-schedule"
          onClick={addSchedule}
          data-testid="agr-add-schedule"
        >
          <Plus size={14} /> Add Service Schedule
        </button>
      </CreationSection>

      {/* ── Billing ───────────────────────────────────────────────────────── */}
      <CreationSection label="Billing">
        <div className="ib-inline-agr-row">
          <div className="ib-field">
            <label className="ib-label">Billing Cadence</label>
            <select className="ib-select" value={agrBillingCadence} onChange={e => setAgrBillingCadence(e.target.value)} data-testid="agr-billing-cadence">
              {AGR_BILLING_CADENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="ib-field">
            <label className="ib-label">Billing Trigger</label>
            <select className="ib-select" value={agrBillingTrigger} onChange={e => setAgrBillingTrigger(e.target.value)} data-testid="agr-billing-trigger">
              {AGR_BILLING_TRIGGER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {agrBillingTrigger === 'specific_day' && (
            <div className="ib-field">
              <label className="ib-label">Day of month (1–31)</label>
              <input className="ib-input" type="number" min="1" max="31" value={agrBillingDay}
                onChange={e => setAgrBillingDay(e.target.value)} placeholder="1–31"
                data-testid="agr-billing-day" />
            </div>
          )}
          {agrBillingTrigger === 'days_before_first_service' && (
            <div className="ib-field">
              <label className="ib-label">Days before first service</label>
              <input className="ib-input" type="number" min="1" value={agrDaysBeforeService}
                onChange={e => setAgrDaysBeforeService(e.target.value)} placeholder="e.g. 7"
                data-testid="agr-days-before-service" />
            </div>
          )}
        </div>
        <div className="ib-inline-agr-row">
          <div className="ib-field">
            <label className="ib-label">Billing Amount *</label>
            <div className="ib-price-wrap">
              <span className="ib-price-sym">$</span>
              <input
                className="ib-input ib-input--price"
                type="number" min="0" step="0.01"
                value={agrPlanPrice}
                onChange={e => setAgrPlanPrice(e.target.value)}
                placeholder="0.00"
                data-testid="agr-plan-price"
              />
            </div>
          </div>
        </div>
      </CreationSection>

      {/* ── Payment Behavior ──────────────────────────────────────────────── */}
      <CreationSection label="Payment Behavior">
        <div className="ib-inline-agr-row">
          <div className="ib-field ib-field--grow">
            <label className="ib-label">When an invoice is generated for this agreement</label>
            <select className="ib-select" value={agrPaymentBehavior}
              onChange={e => setAgrPaymentBehavior(e.target.value)} data-testid="agr-payment-behavior">
              {AGR_PAYMENT_BEHAVIOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      </CreationSection>

      {/* ── Discount ──────────────────────────────────────────────────────── */}
      <CreationSection label="Discount">
        <div className="ib-inline-agr-row">
          <div className="ib-field">
            <label className="ib-label">Discount type</label>
            <select className="ib-select" value={agrDiscountType}
              onChange={e => { setAgrDiscountType(e.target.value); setAgrDiscountValue(''); setAgrDiscountName(''); }}
              data-testid="agr-discount-type">
              {AGR_DISCOUNT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {agrDiscountType !== 'none' && (
            <>
              <div className="ib-field">
                <label className="ib-label">{agrDiscountType === 'percent' ? 'Percent off' : 'Amount off ($)'}</label>
                <div className="ib-price-wrap">
                  {agrDiscountType === 'fixed' && <span className="ib-price-sym">$</span>}
                  <input
                    className={`ib-input${agrDiscountType === 'fixed' ? ' ib-input--price' : ''}`}
                    type="number" min="0" step={agrDiscountType === 'percent' ? '1' : '0.01'}
                    max={agrDiscountType === 'percent' ? '100' : undefined}
                    value={agrDiscountValue}
                    onChange={e => setAgrDiscountValue(e.target.value)}
                    placeholder={agrDiscountType === 'percent' ? '10' : '0.00'}
                    data-testid="agr-discount-value"
                  />
                  {agrDiscountType === 'percent' && <span style={{ marginLeft: 4, fontSize: '0.85rem', color: 'var(--slate)' }}>%</span>}
                </div>
              </div>
              <div className="ib-field">
                <label className="ib-label">Discount label (optional)</label>
                <input className="ib-input" type="text" value={agrDiscountName}
                  onChange={e => setAgrDiscountName(e.target.value)} placeholder="e.g. Loyalty discount"
                  data-testid="agr-discount-name" />
              </div>
            </>
          )}
        </div>
        <div className="ib-inline-agr-row">
          <div className="ib-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 }}>
            <input type="checkbox" id="agr-taxable" checked={agrTaxable}
              onChange={e => setAgrTaxable(e.target.checked)} data-testid="agr-taxable" />
            <label htmlFor="agr-taxable" className="ib-label" style={{ margin: 0, cursor: 'pointer' }}>
              Agreement billing is taxable
            </label>
          </div>
        </div>
      </CreationSection>

      {/* ── Exception Policies ────────────────────────────────────────────── */}
      <CreationSection label="Exception Policies">
        <div className="ib-inline-agr-row">
          <div className="ib-field">
            <label className="ib-label">If Services Exceed Included Limit</label>
            <select className="ib-select" value={agrExtraPolicy} onChange={e => setAgrExtraPolicy(e.target.value)} data-testid="agr-extra-policy">
              {AGR_EXTRA_POLICY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="ib-field">
            <label className="ib-label">If a Service Is Missed</label>
            <select className="ib-select" value={agrMissedPolicy} onChange={e => setAgrMissedPolicy(e.target.value)} data-testid="agr-missed-policy">
              {AGR_MISSED_POLICY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        {agrExtraPolicy === 'charge_per_additional' && (
          <div className="ib-inline-agr-row">
            <div className="ib-field">
              <label className="ib-label">Price per additional visit *</label>
              <div className="ib-price-wrap">
                <span className="ib-price-sym">$</span>
                <input className="ib-input ib-input--price" type="number" min="0" step="0.01"
                  value={agrAdditionalServicePrice}
                  onChange={e => setAgrAdditionalServicePrice(e.target.value)}
                  placeholder="0.00" data-testid="agr-additional-service-price" />
              </div>
            </div>
          </div>
        )}
      </CreationSection>

      {/* ── Notes ─────────────────────────────────────────────────────────── */}
      <div className="ib-field" style={{ marginTop: 4 }}>
        <label className="ib-label">Internal Notes</label>
        <textarea className="ib-textarea" rows={2} value={agrNotes}
          onChange={e => setAgrNotes(e.target.value)} placeholder="Notes visible to your team only…" />
      </div>

      {error && <p className="ib-save-error" style={{ marginTop: 8 }}>{error}</p>}

      <div className="ib-inline-agr-actions">
        <button className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="btn btn-primary" onClick={handleCreate} disabled={!canSave}>
          {saving ? 'Creating…' : 'Create Agreement'}
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function InvoiceBuilder({ onClose, onCreated }) {
  // ── source ─────────────────────────────────────────────────────────────────
  const [source, setSource] = useState('blank');

  // ── settings ────────────────────────────────────────────────────────────────
  const [taxRate,             setTaxRate]             = useState(0);
  const [previewNumber,       setPreviewNumber]       = useState(null);
  const [previewNumErr,       setPreviewNumErr]       = useState(false);

  // ── client selection ────────────────────────────────────────────────────────
  const [selectedClient, setSelectedClient] = useState(null);

  // ── job selection ───────────────────────────────────────────────────────────
  const [jobQuery,      setJobQuery]      = useState('');
  const [eligibleJobs,  setEligibleJobs]  = useState([]);
  const [jobsLoading,   setJobsLoading]   = useState(false);
  const [selectedJob,   setSelectedJob]   = useState(null);
  const [jobsError,     setJobsError]     = useState('');
  const jobDebounce = useRef(null);

  // ── estimate selection ──────────────────────────────────────────────────────
  const [estimateQuery,      setEstimateQuery]      = useState('');
  const [eligibleEstimates,  setEligibleEstimates]  = useState([]);
  const [estimatesLoading,   setEstimatesLoading]   = useState(false);
  const [selectedEstimate,   setSelectedEstimate]   = useState(null);
  const [estimatesError,     setEstimatesError]     = useState('');
  const estimateDebounce = useRef(null);

  // ── agreement selection ─────────────────────────────────────────────────────
  const [agreementQuery,      setAgreementQuery]      = useState('');
  const [eligibleAgreements,  setEligibleAgreements]  = useState([]);
  const [agreementsLoading,   setAgreementsLoading]   = useState(false);
  const [selectedAgreement,   setSelectedAgreement]   = useState(null);
  const [agreementsError,     setAgreementsError]     = useState('');
  const [showAgrForm,         setShowAgrForm]         = useState(false);
  const agreementDebounce = useRef(null);

  // ── header fields ───────────────────────────────────────────────────────────
  const [subject,       setSubject]       = useState('For Services Rendered');
  const [issuedDate,    setIssuedDate]    = useState(TODAY);
  const [paymentTerms,  setPaymentTerms]  = useState('due_on_receipt');
  const [dueDate,       setDueDate]       = useState('');

  // ── line items ──────────────────────────────────────────────────────────────
  const [lineItems, setLineItems] = useState([newLineItem()]);

  // ── discount ────────────────────────────────────────────────────────────────
  const [discountType,  setDiscountType]  = useState('none');
  const [discountValue, setDiscountValue] = useState('');
  const [discountLabel, setDiscountLabel] = useState('');


  // ── notes ───────────────────────────────────────────────────────────────────
  const [clientMessage, setClientMessage] = useState('');
  const [terms,         setTerms]         = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  // ── save dropdown ───────────────────────────────────────────────────────────
  const [saveDropOpen,   setSaveDropOpen]   = useState(false);
  const saveDropRef = useRef(null);

  // ── post-create collection modal ─────────────────────────────────────────────
  const [collectInvoice,  setCollectInvoice]  = useState(null);

  // ── submission ──────────────────────────────────────────────────────────────
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState('');

  // ── on mount: load settings ─────────────────────────────────────────────────
  useEffect(() => {
    api.get('/invoices/settings')
      .then(r => {
        const d = r.data;
        setTaxRate(d.tax_rate || 0);
        setPreviewNumber(d.next_number != null ? d.next_number : null);
        if (d.default_terms) setTerms(d.default_terms);
      })
      .catch(() => { setPreviewNumErr(true); });
  }, []);

  // ── on source change: load eligible data ────────────────────────────────────
  useEffect(() => {
    if (source === 'job')       loadEligibleJobs('');
    if (source === 'estimate')  loadEligibleEstimates('');
    if (source === 'agreement' && selectedClient) {
      loadEligibleAgreements('', selectedClient.id);
    }
  }, [source]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── close save dropdown on outside click ────────────────────────────────────
  useEffect(() => {
    function handler(e) {
      if (saveDropRef.current && !saveDropRef.current.contains(e.target)) {
        setSaveDropOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── client autocomplete callbacks ────────────────────────────────────────────
  const fetchClients = useCallback(async (query, signal) => {
    const r = await api.get(`/clients/search?q=${encodeURIComponent(query)}`, { signal });
    return r.data || [];
  }, []);

  function selectClient(c) {
    setSelectedClient(c);
    if (source === 'job') loadEligibleJobs(jobQuery, c.id);
    if (source === 'agreement') {
      setSelectedAgreement(null);
      setEligibleAgreements([]);
      setShowAgrForm(false);
      loadEligibleAgreements('', c.id);
    }
  }

  function clearClient() {
    setSelectedClient(null);
    if (source === 'agreement') {
      setSelectedAgreement(null);
      setEligibleAgreements([]);
      setShowAgrForm(false);
    }
  }

  // ── eligible estimates ───────────────────────────────────────────────────────
  function loadEligibleEstimates(q = '') {
    setEstimatesLoading(true);
    setEstimatesError('');
    const qs = new URLSearchParams();
    if (q.trim()) qs.set('q', q.trim());
    api.get(`/invoices/eligible-estimates?${qs}`)
      .then(r => setEligibleEstimates(Array.isArray(r.data) ? r.data : []))
      .catch(() => setEstimatesError('Could not load eligible estimates.'))
      .finally(() => setEstimatesLoading(false));
  }

  function handleEstimateQuery(val) {
    setEstimateQuery(val);
    clearTimeout(estimateDebounce.current);
    estimateDebounce.current = setTimeout(() => loadEligibleEstimates(val), 275);
  }

  function selectEstimate(est) {
    setSelectedEstimate(est);
    setSelectedClient({ id: est.client_id, name: est.client_name, email: est.client_email, address: est.client_address });
    setSubject(est.title || 'For Services Rendered');
    const estItems = Array.isArray(est.line_items) ? est.line_items : [];
    setLineItems(estItems.length > 0
      ? estItems.map((item, i) => ({
          _id:        `est-line-${i}`,
          service_id: null,
          name:       item.description || item.name || 'Service',
          description:'',
          quantity:   String(parseFloat(item.quantity) || 1),
          unit_price: String(parseFloat(item.unit_price ?? item.amount) || 0),
          taxable:    true,
        }))
      : [newLineItem()]
    );
    if (est.notes) setClientMessage(est.notes);
  }

  function clearEstimate() {
    setSelectedEstimate(null);
    setEstimateQuery('');
    setEligibleEstimates([]);
  }

  // ── eligible agreements ──────────────────────────────────────────────────────
  function loadEligibleAgreements(q = '', clientId = '') {
    setAgreementsLoading(true);
    setAgreementsError('');
    const qs = new URLSearchParams();
    if (q.trim()) qs.set('q', q.trim());
    if (clientId) qs.set('client_id', clientId);
    api.get(`/invoices/eligible-agreements?${qs}`)
      .then(r => setEligibleAgreements(Array.isArray(r.data) ? r.data : []))
      .catch(() => setAgreementsError('Could not load agreements.'))
      .finally(() => setAgreementsLoading(false));
  }

  function handleAgreementQuery(val) {
    setAgreementQuery(val);
    clearTimeout(agreementDebounce.current);
    agreementDebounce.current = setTimeout(
      () => loadEligibleAgreements(val, selectedClient?.id || ''),
      275
    );
  }

  function selectAgreement(agr) {
    setSelectedAgreement(agr);
    setSelectedClient({ id: agr.client_id, name: agr.client_name, email: agr.client_email, address: agr.client_address });
    setSubject(`${agr.name} — ${fmtPeriodFE(agr.period_start, agr.period_end)}`);
    const agrItems = Array.isArray(agr.line_items) ? agr.line_items : [];
    setLineItems(agrItems.length > 0
      ? agrItems.map((item, i) => ({
          _id:        `agr-line-${i}`,
          service_id: null,
          name:       item.description || item.name || agr.name || 'Service',
          description:'',
          quantity:   String(parseFloat(item.quantity) || 1),
          unit_price: String(parseFloat(item.unit_price ?? item.amount) || 0),
          taxable:    true,
        }))
      : [{
          _id:        'agr-line-0',
          service_id: null,
          name:       agr.name || 'Recurring Service',
          description:`Coverage: ${fmtPeriodFE(agr.period_start, agr.period_end)}`,
          quantity:   '1',
          unit_price: String(parseFloat(agr.plan_price) || 0),
          taxable:    true,
        }]
    );
  }

  function clearAgreement() {
    setSelectedAgreement(null);
    setAgreementQuery('');
    setShowAgrForm(false);
    // Keep selectedClient and eligibleAgreements — user stays on the same client's list
  }

  async function handleAgreementCreated(newAgr) {
    setShowAgrForm(false);
    setAgreementsLoading(true);
    try {
      const clientId = selectedClient?.id || '';
      const res = await api.get(`/invoices/eligible-agreements?client_id=${encodeURIComponent(clientId)}`);
      const agreements = Array.isArray(res.data) ? res.data : [];
      setEligibleAgreements(agreements);
      const found = agreements.find(a => a.id === newAgr.id);
      if (found) selectAgreement(found);
    } catch {
      // List still shows; user can pick manually
    } finally {
      setAgreementsLoading(false);
    }
  }

  // ── eligible jobs ─────────────────────────────────────────────────────────────
  function loadEligibleJobs(q = '', clientId = selectedClient?.id) {
    setJobsLoading(true);
    setJobsError('');
    const qs = new URLSearchParams();
    if (q.trim()) qs.set('search', q.trim());
    if (clientId) qs.set('client_id', clientId);
    api.get(`/invoices/eligible-jobs?${qs}`)
      .then(r => setEligibleJobs(r.data.rows || []))
      .catch(() => setJobsError('Could not load eligible jobs.'))
      .finally(() => setJobsLoading(false));
  }

  function handleJobQuery(val) {
    setJobQuery(val);
    clearTimeout(jobDebounce.current);
    jobDebounce.current = setTimeout(() => loadEligibleJobs(val), 300);
  }

  function selectJob(j) {
    setSelectedJob(j);
    if (!selectedClient) {
      setSelectedClient({ id: j.client_id, name: j.client_name, email: j.client_email });
    }
    setSubject(j.service_type || 'For Services Rendered');
    setLineItems([{
      _id:        'job-line',
      service_id: null,
      name:       j.service_type || 'Service',
      description:'',
      quantity:   '1',
      unit_price: parseFloat(j.amount || 0).toFixed(2),
      taxable:    taxRate > 0,
    }]);
  }

  // ── payment terms → due date ──────────────────────────────────────────────────
  useEffect(() => {
    if (paymentTerms === 'due_on_receipt') { setDueDate(''); return; }
    if (paymentTerms === 'custom') return;
    const days = TERM_DAYS[paymentTerms];
    if (!days) return;
    const base = issuedDate ? new Date(issuedDate) : new Date();
    setDueDate(format(addDays(base, days), 'yyyy-MM-dd'));
  }, [paymentTerms, issuedDate]);

  // ── line item helpers ─────────────────────────────────────────────────────────
  function updateLineItem(index, field, value) {
    setLineItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function selectService(index, svc) {
    setLineItems(prev => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        service_id:  svc.id,
        name:        svc.name,
        description: svc.description || '',
        unit_price:  String(parseFloat(svc.price || 0).toFixed(2)),
      };
      return next;
    });
  }

  function addLineItem() {
    setLineItems(prev => [...prev, newLineItem()]);
  }

  function removeLineItem(index) {
    setLineItems(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== index));
  }

  // ── computed totals ───────────────────────────────────────────────────────────
  const subtotal = lineItems.reduce((s, item) => s + lineTotal(item), 0);

  const discountAmount = (() => {
    if (discountType === 'fixed')   return Math.min(parseFloat(discountValue) || 0, subtotal);
    if (discountType === 'percent') return subtotal * ((parseFloat(discountValue) || 0) / 100);
    return 0;
  })();

  const taxableSubtotal  = lineItems.filter(i => i.taxable).reduce((s, i) => s + lineTotal(i), 0);
  const discountRatio    = subtotal > 0 ? discountAmount / subtotal : 0;
  const taxAmount        = taxableSubtotal * (1 - discountRatio) * taxRate;
  const total            = subtotal - discountAmount + taxAmount;

  // ── save ──────────────────────────────────────────────────────────────────────
  async function handleSave(action) {
    setSaveError('');
    setSaveDropOpen(false);

    if (source === 'job' && !selectedJob)             { setSaveError('Please select a completed job.'); return; }
    if (source === 'estimate' && !selectedEstimate)   { setSaveError('Please select a signed estimate.'); return; }
    if (source === 'agreement' && !selectedAgreement) { setSaveError('Please select a recurring agreement.'); return; }

    const clientId = source === 'job'
      ? (selectedJob?.client_id || selectedClient?.id)
      : source === 'estimate'
        ? selectedEstimate?.client_id
        : source === 'agreement'
          ? selectedAgreement?.client_id
          : selectedClient?.id;

    if (!clientId) { setSaveError('Please select a client.'); return; }

    const validItems = lineItems.filter(i => i.name.trim() || parseFloat(i.unit_price) > 0);
    if (validItems.length === 0) { setSaveError('Add at least one line item with a name and price.'); return; }

    setSaving(true);
    try {
      const invoiceStatus = action === 'send' || action === 'collect' ? 'pending' : 'draft';

      const payload = {
        source_type: source === 'job' ? 'JOB'
          : source === 'estimate' ? 'ESTIMATE'
          : source === 'agreement' ? 'AGREEMENT'
          : 'MANUAL',
        ...(source === 'job'       ? { job_id: selectedJob.id } : {}),
        ...(source === 'estimate'  ? { source_estimate_id: selectedEstimate.id } : {}),
        ...(source === 'agreement' ? {
          source_agreement_id: selectedAgreement.id,
          period_start:        selectedAgreement.period_start,
          period_end:          selectedAgreement.period_end,
        } : {}),
        ...(source === 'blank' ? { client_id: clientId } : {}),
        subject:        subject.trim() || 'For Services Rendered',
        issued_date:    issuedDate,
        payment_terms:  paymentTerms,
        due_date:       dueDate || undefined,
        line_items:     lineItems.map(item => ({
          service_id:  item.service_id || null,
          name:        item.name.trim(),
          description: item.description.trim(),
          quantity:    parseFloat(item.quantity) || 1,
          unit_price:  parseFloat(item.unit_price) || 0,
          taxable:     item.taxable,
          line_total:  lineTotal(item),
        })),
        discount_type:  discountType !== 'none' ? discountType : null,
        discount_value: discountType !== 'none' ? parseFloat(discountValue) || 0 : null,
        discount_label: discountLabel.trim() || null,
        client_message: clientMessage.trim() || null,
        terms:          terms.trim() || null,
        internal_notes: internalNotes.trim() || null,
        status: invoiceStatus,
      };

      const res = await api.post('/invoices', payload);

      if (action === 'send') {
        await api.post(`/invoices/${res.data.id}/send`);
      }

      if (action === 'collect') {
        setCollectInvoice(res.data);
        return;
      }

      onCreated(res.data);
    } catch (err) {
      const msg = (err.response?.data?.error || '').toLowerCase();
      if (msg.includes('billing period has already been invoiced')) {
        setSaveError('This billing period has already been invoiced for this agreement.');
      } else if (msg.includes('already been invoiced')) {
        setSaveError('This estimate has already been converted to an invoice.');
      } else if (msg.includes('signed')) {
        setSaveError('Only signed estimates can be converted to invoices.');
      } else if (msg.includes('already') || msg.includes('duplicate')) {
        setSaveError('An invoice already exists for this job.');
      } else if (msg.includes('complete')) {
        setSaveError('Job must be completed before invoicing.');
      } else if (msg.includes('client')) {
        setSaveError('Please select a valid client.');
      } else {
        setSaveError(err.response?.data?.error || 'Could not create invoice. Try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  // Draft: source selected + at least one line item with any data
  const hasLineItem = lineItems.some(i => i.name || parseFloat(i.unit_price) > 0);
  const hasSource   = source === 'job'      ? !!selectedJob
                    : source === 'estimate' ? !!selectedEstimate
                    : source === 'agreement'? !!selectedAgreement
                    : !!selectedClient;

  const canDraft = !saving && hasSource && hasLineItem;

  // Send: same as draft but also requires at least one line item with a positive amount
  const canSend  = canDraft && lineItems.some(i => parseFloat(i.unit_price) > 0);

  // Always show Save & Collect Payment — supports card, ACH, and manual recording
  const showCollect = true;

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <>
    <div className="ib-sheet" onClick={e => e.stopPropagation()}>

      {/* Header */}
      <div className="ib-header">
        <div>
          <h2 className="ib-title">New Invoice</h2>
          {previewNumErr
            ? <span className="ib-preview-num">Preview # Unavailable</span>
            : previewNumber != null
              ? <span className="ib-preview-num">Preview #{previewNumber}</span>
              : null
          }
        </div>
        <button className="ib-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="ib-body">

        {/* Source picker */}
        <div className="ib-section">
          <p className="ib-section-label">Create invoice from</p>
          <div className="ib-source-row">
            <button
              className={`ib-source-btn${source === 'blank' ? ' active' : ''}`}
              onClick={() => {
                setSource('blank');
                setSelectedJob(null);
                setSelectedEstimate(null);
                setSelectedAgreement(null);
                setShowAgrForm(false);
              }}
            >
              Blank Invoice
            </button>
            <button
              className={`ib-source-btn${source === 'job' ? ' active' : ''}`}
              onClick={() => {
                setSource('job');
                setSelectedEstimate(null);
                clearEstimate();
                setSelectedAgreement(null);
                setShowAgrForm(false);
              }}
            >
              Completed Job
            </button>
            <button
              className={`ib-source-btn${source === 'estimate' ? ' active' : ''}`}
              onClick={() => {
                setSource('estimate');
                setSelectedJob(null);
                setSelectedAgreement(null);
                setShowAgrForm(false);
              }}
            >
              Existing Estimate
            </button>
            <button
              className={`ib-source-btn${source === 'agreement' ? ' active' : ''}`}
              onClick={() => {
                setSource('agreement');
                setSelectedJob(null);
                setSelectedEstimate(null);
              }}
            >
              Recurring Agreement
            </button>
          </div>
        </div>

        {/* Client selection — universal Autocomplete */}
        <div className="ib-section">
          <p className="ib-section-label">Client <span className="ib-required">*</span></p>
          <Autocomplete
            fetchResults={fetchClients}
            onSelect={selectClient}
            onClear={clearClient}
            selected={selectedClient}
            getKey={c => c.id}
            getDisplayValue={c => c.name}
            placeholder="Search by name, company, email, or address…"
            label="Client search"
            inputId="ib-client-search"
            emptyText="No clients found."
            renderItem={(c, q) => (
              <div className="ac-client-item">
                <span className="ac-client-name">{highlight(c.name, q)}</span>
                {c.email && <span className="ac-client-meta">{highlight(c.email, q)}</span>}
                {c.phone && <span className="ac-client-meta">{c.phone}</span>}
                {(c.address || c.city) && (
                  <span className="ac-client-meta">
                    {[c.address, c.city, c.state].filter(Boolean).join(', ')}
                  </span>
                )}
              </div>
            )}
            renderSelectedCard={c => (
              <div className="ib-client-card">
                <div className="ib-client-card-name">{c.name}</div>
                {c.email   && <div className="ib-client-card-detail">{c.email}</div>}
                {c.phone   && <div className="ib-client-card-detail">{c.phone}</div>}
                {(c.address || c.city) && (
                  <div className="ib-client-card-detail">
                    {[c.address, c.city, c.state, c.zip].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
            )}
          />
        </div>

        {/* Estimate picker */}
        {source === 'estimate' && (
          <div className="ib-section">
            <p className="ib-section-label">Signed Estimate <span className="ib-required">*</span></p>
            {selectedEstimate ? (
              <div className="ib-est-card">
                <div className="ib-est-card-top">
                  <div>
                    <div className="ib-est-card-title">{selectedEstimate.title}</div>
                    <div className="ib-est-card-client">{selectedEstimate.client_name}</div>
                  </div>
                  <div className="ib-est-card-right">
                    <span className="ib-est-card-amount">${parseFloat(selectedEstimate.amount || 0).toFixed(2)}</span>
                    <button className="ib-client-clear" onClick={clearEstimate} aria-label="Change estimate">
                      <X size={14} />
                    </button>
                  </div>
                </div>
                {selectedEstimate.signed_at && (
                  <div className="ib-est-card-meta">
                    Signed {format(new Date(selectedEstimate.signed_at), 'MMM d, yyyy')}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="ib-job-search-wrap">
                  <Search size={14} className="ib-search-icon" />
                  <input
                    className="ib-job-input"
                    type="text"
                    placeholder="Search by client, title, or amount…"
                    value={estimateQuery}
                    onChange={e => handleEstimateQuery(e.target.value)}
                  />
                </div>
                <div className="ib-job-list">
                  {estimatesLoading ? (
                    <div className="ib-state">Loading…</div>
                  ) : estimatesError ? (
                    <div className="ib-state ib-state--error">{estimatesError}</div>
                  ) : eligibleEstimates.length === 0 ? (
                    <div className="ib-empty">
                      <p className="ib-empty-primary">No signed estimates are available.</p>
                      <p className="ib-empty-secondary">Estimates become eligible after the client signs them and they have not yet been invoiced.</p>
                    </div>
                  ) : (
                    eligibleEstimates.map(est => (
                      <button key={est.id} className="ib-job-row" onClick={() => selectEstimate(est)}>
                        <div className="ib-job-top">
                          <span className="ib-job-client">{est.client_name}</span>
                          <span className="ib-job-amount">${parseFloat(est.amount || 0).toFixed(2)}</span>
                        </div>
                        <div className="ib-job-service">{est.title}</div>
                        <div className="ib-job-meta">
                          Signed {est.signed_at ? format(new Date(est.signed_at), 'MMM d, yyyy') : format(new Date(est.created_at), 'MMM d, yyyy')}
                          {est.client_address && <span className="ib-job-addr"> · {est.client_address}</span>}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Agreement picker — client-first flow */}
        {source === 'agreement' && (
          <div className="ib-section">
            <div className="ib-agr-section-header">
              <p className="ib-section-label" style={{ margin: 0 }}>
                Active Recurring Agreement <span className="ib-required">*</span>
              </p>
              {/* Create button always visible unless form is open or agreement is selected */}
              {!showAgrForm && !selectedAgreement && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    if (!selectedClient) {
                      document.getElementById('ib-client-search')?.focus();
                    } else {
                      setShowAgrForm(true);
                    }
                  }}
                >
                  <Plus size={12} style={{ marginRight: 4 }} />
                  New Agreement
                </button>
              )}
            </div>

            {selectedAgreement ? (
              <div className="ib-agr-card">
                <div className="ib-agr-card-top">
                  <div>
                    <div className="ib-agr-card-title">{selectedAgreement.name}</div>
                    <div className="ib-agr-card-client">{selectedAgreement.client_name || selectedClient?.name}</div>
                  </div>
                  <div className="ib-agr-card-right">
                    <span className="ib-agr-card-amount">${parseFloat(selectedAgreement.plan_price || 0).toFixed(2)}</span>
                    <button className="ib-client-clear" onClick={clearAgreement} aria-label="Change agreement">
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div className="ib-agr-card-meta">
                  {CADENCE_LABELS[selectedAgreement.cadence] || selectedAgreement.cadence}
                  {' · '}Coverage: {fmtPeriodFE(selectedAgreement.period_start, selectedAgreement.period_end)}
                  {' · '}{selectedAgreement.payment_status === 'paid_in_advance' ? 'Paid in Advance'
                    : selectedAgreement.payment_status === 'failed' ? 'Payment Failed'
                    : selectedAgreement.payment_status === 'overdue' ? 'Overdue' : 'Pending'}
                  {selectedAgreement.payment_behavior && selectedAgreement.payment_behavior !== 'send_invoice' && (
                    <>{' · '}Collection: {AGR_PAYMENT_BEHAVIOR_OPTIONS.find(o => o.value === selectedAgreement.payment_behavior)?.label || selectedAgreement.payment_behavior}</>
                  )}
                </div>
                {selectedAgreement.period_already_invoiced && (
                  <div className="ib-agr-card-warn">This billing period has already been invoiced.</div>
                )}
              </div>
            ) : showAgrForm ? (
              <InlineAgreementForm
                clientId={selectedClient?.id}
                onSaved={handleAgreementCreated}
                onCancel={() => setShowAgrForm(false)}
              />
            ) : !selectedClient ? (
              <p className="ib-empty-secondary" style={{ margin: 0 }}>
                Select a client above to view their recurring agreements, or click <strong>New Agreement</strong> to create one.
              </p>
            ) : (
              <>
                <div className="ib-job-search-wrap">
                  <Search size={14} className="ib-search-icon" />
                  <input
                    className="ib-job-input"
                    type="text"
                    placeholder="Search agreements…"
                    value={agreementQuery}
                    onChange={e => handleAgreementQuery(e.target.value)}
                  />
                </div>
                <div className="ib-job-list">
                  {agreementsLoading ? (
                    <div className="ib-state">Loading…</div>
                  ) : agreementsError ? (
                    <div className="ib-state ib-state--error">{agreementsError}</div>
                  ) : eligibleAgreements.length === 0 ? (
                    <div className="ib-empty">
                      <p className="ib-empty-primary">No active recurring agreements for this client.</p>
                      <button
                        className="btn btn-secondary"
                        style={{ marginTop: 8 }}
                        onClick={() => setShowAgrForm(true)}
                      >
                        <Plus size={13} style={{ marginRight: 4 }} />
                        Create Recurring Agreement
                      </button>
                    </div>
                  ) : (
                    <>
                      {eligibleAgreements.map(agr => (
                        <button
                          key={agr.id}
                          className={`ib-job-row${agr.period_already_invoiced ? ' ib-job-row--dim' : ''}`}
                          onClick={() => selectAgreement(agr)}
                        >
                          <div className="ib-job-top">
                            <span className="ib-job-client">{agr.name}</span>
                            <span className="ib-job-amount">${parseFloat(agr.plan_price || 0).toFixed(2)}</span>
                          </div>
                          <div className="ib-job-service">
                            {agr.service_type && <span>{agr.service_type} · </span>}
                            {CADENCE_LABELS[agr.cadence] || agr.cadence}
                            {' · '}{fmtPeriodFE(agr.period_start, agr.period_end)}
                            {agr.payment_status === 'paid_in_advance' && <span className="ib-agr-paid"> · Paid in Advance</span>}
                            {agr.period_already_invoiced && <span className="ib-agr-invoiced"> · Already Invoiced</span>}
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Job picker */}
        {source === 'job' && (
          <div className="ib-section">
            <p className="ib-section-label">Completed Job <span className="ib-required">*</span></p>
            <div className="ib-job-search-wrap">
              <Search size={14} className="ib-search-icon" />
              <input
                className="ib-job-input"
                type="text"
                placeholder="Search by client, service type, or address…"
                value={jobQuery}
                onChange={e => handleJobQuery(e.target.value)}
              />
            </div>
            <div className="ib-job-list">
              {jobsLoading ? (
                <div className="ib-state">Loading…</div>
              ) : jobsError ? (
                <div className="ib-state ib-state--error">{jobsError}</div>
              ) : eligibleJobs.length === 0 ? (
                <div className="ib-empty">
                  <p className="ib-empty-primary">No completed jobs are ready to invoice.</p>
                  <p className="ib-empty-secondary">Jobs become eligible after they are marked complete and have no existing invoice.</p>
                </div>
              ) : (
                eligibleJobs.map(j => (
                  <button
                    key={j.id}
                    className={`ib-job-row${selectedJob?.id === j.id ? ' selected' : ''}`}
                    onClick={() => selectJob(j)}
                  >
                    <div className="ib-job-top">
                      <span className="ib-job-client">{j.client_name}</span>
                      <span className="ib-job-amount">{fmt(j.amount)}</span>
                    </div>
                    <div className="ib-job-service">{j.service_type || 'Service'}</div>
                    <div className="ib-job-meta">
                      Completed {j.scheduled_at ? format(new Date(j.scheduled_at), 'MMM d, yyyy') : '—'}
                      {j.address && <span className="ib-job-addr"> · {j.address}</span>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Invoice details */}
        <div className="ib-section">
          <p className="ib-section-label">Invoice Details</p>
          <div className="ib-header-grid">
            <div className="ib-field">
              <label className="ib-label">Subject</label>
              <input
                className="ib-input"
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="For Services Rendered"
              />
            </div>
            <div className="ib-field">
              <label className="ib-label">Invoice #</label>
              <input
                className="ib-input ib-input--readonly"
                type="text"
                value={previewNumber != null ? `#${previewNumber}` : 'Auto-assigned'}
                readOnly
              />
            </div>
            <div className="ib-field">
              <label className="ib-label">Issued Date</label>
              <input
                className="ib-input"
                type="date"
                value={issuedDate}
                onChange={e => setIssuedDate(e.target.value)}
              />
            </div>
            <div className="ib-field">
              <label className="ib-label">Payment Terms</label>
              <div className="ib-select-wrap">
                <select
                  className="ib-select"
                  value={paymentTerms}
                  onChange={e => setPaymentTerms(e.target.value)}
                >
                  {TERM_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="ib-select-icon" />
              </div>
            </div>
            {paymentTerms !== 'due_on_receipt' && (
              <div className="ib-field">
                <label className="ib-label">Due Date</label>
                <input
                  className="ib-input"
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>

        {/* Line items with service catalog */}
        <div className="ib-section">
          <p className="ib-section-label">Line Items</p>
          <div className="ib-items-table">
            <div className="ib-items-head">
              <span className="ib-col-name">Product / Service</span>
              <span className="ib-col-desc">Description</span>
              <span className="ib-col-qty">Qty</span>
              <span className="ib-col-price">Unit Price</span>
              <span className="ib-col-tax">Tax</span>
              <span className="ib-col-total">Total</span>
              <span className="ib-col-del" />
            </div>
            {lineItems.map((item, idx) => (
              <div key={item._id} className="ib-items-row">
                <ServiceDropdown
                  value={item.name}
                  onChange={val => updateLineItem(idx, 'name', val)}
                  onServiceSelect={svc => selectService(idx, svc)}
                />
                <input
                  className="ib-input ib-col-desc"
                  type="text"
                  placeholder="Optional description"
                  value={item.description}
                  onChange={e => updateLineItem(idx, 'description', e.target.value)}
                />
                <input
                  className="ib-input ib-col-qty"
                  type="number"
                  min="0"
                  step="1"
                  value={item.quantity}
                  onChange={e => updateLineItem(idx, 'quantity', e.target.value)}
                />
                <input
                  className="ib-input ib-col-price"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={item.unit_price}
                  onChange={e => updateLineItem(idx, 'unit_price', e.target.value)}
                />
                <div className="ib-col-tax ib-tax-cell">
                  <input
                    type="checkbox"
                    className="ib-tax-check"
                    checked={item.taxable}
                    onChange={e => updateLineItem(idx, 'taxable', e.target.checked)}
                    title="Taxable"
                    aria-label="Taxable"
                  />
                </div>
                <span className="ib-col-total ib-line-total">{fmt(lineTotal(item))}</span>
                <button
                  className="ib-col-del ib-del-btn"
                  onClick={() => removeLineItem(idx)}
                  aria-label="Remove line"
                  disabled={lineItems.length === 1}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button className="ib-add-line" onClick={addLineItem}>
            <Plus size={14} /> Add Line Item
          </button>
        </div>

        {/* Discount + Totals */}
        <div className="ib-section ib-totals-section">
          <div className="ib-discount-row">
            <span className="ib-totals-label-left">Discount</span>
            <div className="ib-discount-controls">
              <div className="ib-select-wrap ib-discount-type-wrap">
                <select
                  className="ib-select ib-discount-select"
                  value={discountType}
                  onChange={e => { setDiscountType(e.target.value); setDiscountValue(''); setDiscountLabel(''); }}
                >
                  <option value="none">No discount</option>
                  <option value="fixed">Fixed amount ($)</option>
                  <option value="percent">Percentage (%)</option>
                </select>
                <ChevronDown size={14} className="ib-select-icon" />
              </div>
              {discountType !== 'none' && (
                <>
                  <input
                    className="ib-input ib-discount-label-input"
                    type="text"
                    placeholder="Discount reason (e.g. New Client)"
                    value={discountLabel}
                    onChange={e => setDiscountLabel(e.target.value)}
                    aria-label="Discount label"
                  />
                  <input
                    className="ib-input ib-discount-val"
                    type="number"
                    min="0"
                    step={discountType === 'percent' ? '0.1' : '0.01'}
                    placeholder={discountType === 'percent' ? '10' : '25.00'}
                    value={discountValue}
                    onChange={e => setDiscountValue(e.target.value)}
                  />
                </>
              )}
            </div>
          </div>

          <div className="ib-totals-panel">
            <div className="ib-totals-row">
              <span>Subtotal</span>
              <span>{fmt(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="ib-totals-row ib-totals-row--discount">
                <span>
                  {discountLabel || 'Discount'}
                  {discountType === 'percent' && discountValue ? ` (${discountValue}%)` : ''}
                </span>
                <span>-{fmt(discountAmount)}</span>
              </div>
            )}
            {taxRate > 0 ? (
              <div className="ib-totals-row">
                <span>Tax ({(taxRate * 100).toFixed(1)}%)</span>
                <span>{fmt(taxAmount)}</span>
              </div>
            ) : (
              <div className="ib-totals-row ib-totals-row--muted">
                <span>Tax</span>
                <span className="ib-tax-unconfigured">Not configured</span>
              </div>
            )}
            <div className="ib-totals-divider" />
            <div className="ib-totals-row ib-totals-row--total">
              <span>Total</span>
              <span>{fmt(total)}</span>
            </div>
            <div className="ib-totals-row">
              <span>Payments Applied</span>
              <span>$0.00</span>
            </div>
            <div className="ib-totals-row ib-totals-row--balance">
              <span>Balance Due</span>
              <span>{fmt(total)}</span>
            </div>
          </div>
        </div>

        {/* Client message */}
        <div className="ib-section">
          <p className="ib-section-label">Client Message <span className="ib-optional">(optional)</span></p>
          <textarea
            className="ib-textarea"
            rows={2}
            placeholder="Thank you for your business."
            value={clientMessage}
            onChange={e => setClientMessage(e.target.value)}
          />
        </div>

        {/* Terms & Conditions */}
        <div className="ib-section">
          <p className="ib-section-label">Terms & Conditions <span className="ib-optional">(optional)</span></p>
          <textarea
            className="ib-textarea"
            rows={2}
            placeholder="Payment is due according to the terms above."
            value={terms}
            onChange={e => setTerms(e.target.value)}
          />
        </div>

        {/* Internal notes */}
        <div className="ib-section">
          <p className="ib-section-label">Internal Notes <span className="ib-optional">(not visible to client)</span></p>
          <textarea
            className="ib-textarea"
            rows={2}
            placeholder="Notes visible to your team only…"
            value={internalNotes}
            onChange={e => setInternalNotes(e.target.value)}
          />
        </div>

      </div>{/* end .ib-body */}

      {/* Footer */}
      <div className="ib-footer">
        {saveError && <p className="ib-save-error">{saveError}</p>}
        <div className="ib-footer-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => handleSave('draft')}
            disabled={!canDraft}
            title={!hasSource ? 'Select a client or source first' : !hasLineItem ? 'Add at least one line item' : ''}
          >
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
          <div className="ib-save-split" ref={saveDropRef}>
            <button
              className="btn btn-primary ib-save-primary"
              onClick={() => handleSave('send')}
              disabled={!canSend}
              title={!canSend && canDraft ? 'Add a line item with an amount > $0' : ''}
            >
              {saving ? 'Saving…' : 'Save & Send'}
            </button>
            {showCollect && (
              <>
                <button
                  className="btn btn-primary ib-save-arrow"
                  onClick={() => setSaveDropOpen(v => !v)}
                  aria-label="More save options"
                  aria-expanded={saveDropOpen}
                >
                  <ChevronDown size={14} />
                </button>
                {saveDropOpen && (
                  <div className="ib-save-drop">
                    <button
                      className="ib-save-drop-item"
                      onClick={() => handleSave('collect')}
                      disabled={!canSend}
                    >
                      Save &amp; Collect Payment
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

    </div>
    {collectInvoice && (
      <CollectPaymentWorkspace
        invoice={collectInvoice}
        client={selectedClient}
        onClose={() => { setCollectInvoice(null); onCreated(collectInvoice); }}
        onPaymentRecorded={() => { setCollectInvoice(null); onCreated(collectInvoice); }}
      />
    )}
    </>
  );
}
