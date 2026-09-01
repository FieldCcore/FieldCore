import { useState, useCallback } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import api from '../api';
import Autocomplete, { highlight } from './Autocomplete';
import ClientLocationField from './ClientLocationField';

const TODAY = new Date().toISOString().slice(0, 10);

const SERVICE_CADENCE_OPTIONS = [
  { value: 'weekly',        label: 'Weekly (every 7 days)' },
  { value: 'every_2_weeks', label: 'Every 2 weeks (14 days)' },
  { value: 'every_3_weeks', label: 'Every 3 weeks (21 days)' },
  { value: 'every_4_weeks', label: 'Every 4 weeks (28 days)' },
  { value: 'monthly',       label: 'Monthly' },
  { value: 'quarterly',     label: 'Quarterly' },
  { value: 'annual',        label: 'Annual' },
  { value: 'custom',        label: 'Custom interval…' },
];

const BILLING_CADENCE_OPTIONS = [
  { value: 'every_service', label: 'Every service' },
  { value: 'weekly',        label: 'Weekly' },
  { value: 'every_2_weeks', label: 'Every 2 weeks' },
  { value: 'monthly',       label: 'Monthly' },
  { value: 'quarterly',     label: 'Quarterly' },
  { value: 'annual',        label: 'Annual' },
  { value: 'custom',        label: 'Custom interval…' },
];

const BILLING_TRIGGER_OPTIONS = [
  { value: 'every_service',             label: 'Every Service Occurrence' },
  { value: 'first_scheduled',           label: 'First Scheduled Service of Period' },
  { value: 'first_completed',           label: 'First Completed Service of Period' },
  { value: 'first_day',                 label: 'First Day of Billing Period' },
  { value: 'specific_day',              label: 'Specific Day of Month' },
  { value: 'days_before_first_service', label: 'Days Before First Service' },
];

const EXTRA_OCCURRENCE_OPTIONS = [
  { value: 'all_included',          label: 'All Scheduled Visits Included' },
  { value: 'charge_per_additional', label: 'Charge Per Additional Visit' },
  { value: 'approval_required',     label: 'Require Approval for Extra Visits' },
  { value: 'no_additional',         label: 'No Additional Visits Allowed' },
  { value: 'rollover',              label: 'Roll Extra Visit Into Next Period' },
  { value: 'manual_review',         label: 'Flag for Manual Review' },
];

const MISSED_POLICY_OPTIONS = [
  { value: 'no_adjustment', label: 'No Adjustment — Full Price Retained' },
  { value: 'reschedule',    label: 'Reschedule to Another Date' },
  { value: 'carry_forward', label: 'Carry Forward to Next Period' },
  { value: 'forfeited',     label: 'Service Forfeited' },
  { value: 'credit',        label: 'Issue Credit' },
  { value: 'rollover',      label: 'Roll Forward to Next Period' },
  { value: 'manual_review', label: 'Flag for Manual Review' },
];

const PAYMENT_BEHAVIOR_OPTIONS = [
  { value: 'send_invoice',     label: 'Send Invoice to Client' },
  { value: 'create_only',      label: 'Create Draft — No Email' },
  { value: 'auto_charge_card', label: 'Auto-Charge Card on File' },
  { value: 'auto_charge_ach',  label: 'Auto-Charge ACH on File' },
];

const DISCOUNT_TYPE_OPTIONS = [
  { value: 'none',    label: 'No Discount' },
  { value: 'percent', label: 'Percent Off' },
  { value: 'fixed',   label: 'Fixed Amount Off' },
];

const WEEKDAY_OPTIONS = [
  { value: '',  label: 'Any (use start date)' },
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

const END_CONDITION_OPTIONS = [
  { value: 'none',        label: 'No end condition (ongoing)' },
  { value: 'date',        label: 'End by date' },
  { value: 'occurrences', label: 'End after N services' },
  { value: 'periods',     label: 'End after N billing periods' },
];

function newLineItem() {
  return { _id: Math.random().toString(36).slice(2), name: '', amount: '' };
}

function newSchedule(overrides = {}) {
  return {
    _id: Math.random().toString(36).slice(2),
    id: null,
    _serviceTemplate: null,
    serviceType: '',
    serviceId: null,
    assetLabel: '',
    locationId: null,
    serviceAddress: '',
    cadence: 'monthly',
    preferredWeekday: '',
    serviceDayOfMonth: '',
    serviceIntervalDays: '',
    startedAt: TODAY,
    preferredStartTime: '09:00',
    durationMinutes: '',
    ...overrides,
  };
}

function scheduleFromApi(s) {
  return {
    _id: Math.random().toString(36).slice(2),
    id: s.id || null,
    _serviceTemplate: null,
    serviceType: s.service_type || '',
    serviceId: s.service_id || null,
    assetLabel: s.asset_label || '',
    locationId: s.location_id || null,
    serviceAddress: s.service_address || '',
    cadence: s.cadence || 'monthly',
    preferredWeekday: s.preferred_weekday != null ? String(s.preferred_weekday) : '',
    serviceDayOfMonth: s.service_day_of_month || '',
    serviceIntervalDays: s.service_interval_days || '',
    startedAt: s.started_at?.slice(0, 10) || TODAY,
    preferredStartTime: s.preferred_start_time || '09:00',
    durationMinutes: s.duration_minutes || '',
  };
}

export default function AgreementBuilder({ existing = null, onClose, onSaved }) {
  // ── client
  const [selectedClient, setSelectedClient] = useState(
    existing ? { id: existing.client_id, name: existing.client_name, email: existing.client_email } : null
  );

  // ── agreement basics
  const [name,      setName]      = useState(existing?.name      || '');
  const [startedAt, setStartedAt] = useState(existing?.started_at?.slice(0, 10) || TODAY);

  // ── service schedules
  const [schedules, setSchedules] = useState(() => {
    if (existing?.service_schedules?.length) {
      return existing.service_schedules.map(scheduleFromApi);
    }
    return [newSchedule({ startedAt: existing?.started_at?.slice(0, 10) || TODAY })];
  });

  // ── end condition (agreement-level)
  const existingEndCondition = (() => {
    if (!existing) return 'none';
    if (existing.end_condition_type === 'date')                return 'date';
    if (existing.end_condition_type === 'service_count')       return 'occurrences';
    if (existing.end_condition_type === 'billing_period_count') return 'periods';
    return 'none';
  })();
  const [endCondition,        setEndCondition]        = useState(existingEndCondition);
  const [endDate,             setEndDate]             = useState(existing?.end_date?.slice(0, 10) || '');
  const [endAfterOccurrences, setEndAfterOccurrences] = useState(existing?.end_after_occurrences || '');
  const [endAfterPeriods,     setEndAfterPeriods]     = useState(existing?.end_after_periods || '');

  // ── billing
  const [billingCadence,            setBillingCadence]            = useState(existing?.billing_cadence || 'monthly');
  const [billingTrigger,            setBillingTrigger]            = useState(existing?.billing_trigger || 'first_day');
  const [billingDay,                setBillingDay]                = useState(existing?.billing_day || '');
  const [daysBeforeService,         setDaysBeforeService]         = useState(existing?.days_before_service || '');
  const [includedServicesPerPeriod, setIncludedServicesPerPeriod] = useState(existing?.included_services_per_period ?? 1);
  const [extraOccurrencePolicy,     setExtraOccurrencePolicy]     = useState(existing?.extra_occurrence_policy || 'all_included');
  const [additionalServicePrice,    setAdditionalServicePrice]    = useState(existing?.additional_service_price || '');
  const [missedServicePolicy,       setMissedServicePolicy]       = useState(existing?.missed_service_policy || 'no_adjustment');

  // ── payment & discount
  const [paymentBehavior, setPaymentBehavior] = useState(existing?.payment_behavior || 'send_invoice');
  const [discountType,    setDiscountType]    = useState(existing?.discount_type || 'none');
  const [discountValue,   setDiscountValue]   = useState(existing?.discount_value || '');
  const [discountName,    setDiscountName]    = useState(existing?.discount_name || '');
  const [taxable,         setTaxable]         = useState(existing?.taxable ?? false);

  // ── plan
  const [planPrice, setPlanPrice] = useState(
    existing?.plan_price ? parseFloat(existing.plan_price).toFixed(2) : ''
  );
  const [lineItems, setLineItems] = useState(
    existing?.line_items?.length
      ? existing.line_items.map(li => ({ _id: Math.random().toString(36).slice(2), ...li }))
      : [newLineItem()]
  );

  // ── notes
  const [notes, setNotes] = useState(existing?.notes || '');

  // ── form state
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState('');

  // ── autocomplete fetch functions
  const fetchClients = useCallback(async (query, signal) => {
    const r = await api.get(`/clients/search?q=${encodeURIComponent(query)}`, { signal });
    return r.data || [];
  }, []);

  const fetchServices = useCallback(async (query, signal) => {
    const r = await api.get(`/agreements/services?q=${encodeURIComponent(query)}`, { signal });
    return r.data || [];
  }, []);

  // ── schedule helpers
  function updateSchedule(idx, field, val) {
    setSchedules(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s));
  }
  function addSchedule() {
    const first = schedules[0] || {};
    setSchedules(prev => [...prev, newSchedule({
      startedAt,
      locationId:     first.locationId     || null,
      serviceAddress: first.serviceAddress || '',
    })]);
  }
  function removeSchedule(idx) {
    setSchedules(prev => prev.filter((_, i) => i !== idx));
  }

  // ── line item helpers
  function updateLineItem(idx, field, val) {
    setLineItems(prev => prev.map((li, i) => i === idx ? { ...li, [field]: val } : li));
  }
  function addLineItem() {
    setLineItems(prev => [...prev, newLineItem()]);
  }
  function removeLineItem(idx) {
    setLineItems(prev => prev.filter((_, i) => i !== idx));
  }

  const backendEndConditionType =
    endCondition === 'date'        ? 'date' :
    endCondition === 'occurrences' ? 'service_count' :
    endCondition === 'periods'     ? 'billing_period_count' : 'none';

  const schedulesValid = schedules.length > 0 && schedules.every(s =>
    s.cadence !== 'custom' || (parseInt(s.serviceIntervalDays, 10) > 0)
  );

  const canSave = !saving && !!selectedClient && name.trim().length > 0
    && schedulesValid
    && (billingTrigger !== 'specific_day' || (parseInt(billingDay, 10) >= 1 && parseInt(billingDay, 10) <= 31))
    && (billingTrigger !== 'days_before_first_service' || parseInt(daysBeforeService, 10) > 0)
    && (endCondition !== 'date'        || !!endDate)
    && (endCondition !== 'occurrences' || parseInt(endAfterOccurrences, 10) > 0)
    && (endCondition !== 'periods'     || parseInt(endAfterPeriods, 10) > 0)
    && (discountType === 'none'        || parseFloat(discountValue) > 0)
    && (extraOccurrencePolicy !== 'charge_per_additional' || parseFloat(additionalServicePrice) > 0)
    && parseFloat(planPrice) > 0;

  async function handleSave() {
    setSaveError('');
    setSaving(true);

    const serviceSchedules = schedules.map(s => ({
      ...(s.id ? { id: s.id } : {}),
      service_type:         s.serviceType.trim() || null,
      service_id:           s.serviceId || null,
      asset_label:          s.assetLabel.trim() || null,
      location_id:          s.locationId || null,
      service_address:      s.serviceAddress.trim() || null,
      cadence:              s.cadence,
      service_interval_days: s.cadence === 'custom' ? parseInt(s.serviceIntervalDays, 10) : null,
      preferred_weekday:    s.preferredWeekday !== '' ? parseInt(s.preferredWeekday, 10) : null,
      service_day_of_month: s.serviceDayOfMonth !== '' ? parseInt(s.serviceDayOfMonth, 10) : null,
      started_at:           s.startedAt || startedAt,
      preferred_start_time: s.preferredStartTime || '09:00',
      duration_minutes:     s.durationMinutes !== '' ? parseInt(s.durationMinutes, 10) || null : null,
    }));

    const payload = {
      client_id:                    selectedClient.id,
      name:                         name.trim(),
      started_at:                   startedAt,
      service_schedules:            serviceSchedules,
      end_condition_type:           backendEndConditionType,
      end_date:                     endCondition === 'date' && endDate ? endDate : null,
      end_after_occurrences:        endCondition === 'occurrences' ? parseInt(endAfterOccurrences, 10) || null : null,
      end_after_periods:            endCondition === 'periods' ? parseInt(endAfterPeriods, 10) || null : null,
      billing_cadence:              billingCadence,
      billing_trigger:              billingTrigger,
      billing_day:                  billingTrigger === 'specific_day' ? parseInt(billingDay, 10) : null,
      days_before_service:          billingTrigger === 'days_before_first_service' ? parseInt(daysBeforeService, 10) : null,
      included_services_per_period: parseInt(includedServicesPerPeriod, 10) || 1,
      extra_occurrence_policy:      extraOccurrencePolicy,
      additional_service_price:     extraOccurrencePolicy === 'charge_per_additional' ? parseFloat(additionalServicePrice) || 0 : null,
      missed_service_policy:        missedServicePolicy,
      payment_behavior:             paymentBehavior,
      discount_type:                discountType,
      discount_value:               discountType !== 'none' ? parseFloat(discountValue) || 0 : null,
      discount_name:                discountType !== 'none' && discountName.trim() ? discountName.trim() : null,
      taxable,
      plan_price:                   parseFloat(planPrice) || 0,
      line_items:                   lineItems.filter(li => li.name || parseFloat(li.amount) > 0).map(li => ({
        name:   li.name,
        amount: parseFloat(li.amount) || 0,
      })),
      notes: notes.trim() || null,
    };

    try {
      let res;
      if (existing) {
        res = await api.patch(`/agreements/${existing.id}`, payload);
      } else {
        res = await api.post('/agreements', payload);
      }
      onSaved(res.data);
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to save agreement');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ab-overlay" onClick={onClose}>
      <div className="ab-sheet" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="ab-header">
          <h2 className="ab-title">{existing ? 'Edit Agreement' : 'New Recurring Agreement'}</h2>
          <button className="ib-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="ab-body">

          {/* Client */}
          <section className="ab-section">
            <p className="ib-section-label">Client</p>
            <Autocomplete
              inputId="ab-client-search"
              label="Client search"
              placeholder="Search by name, company, email, or address…"
              fetchResults={fetchClients}
              getKey={c => c.id}
              getDisplayValue={c => c.name}
              renderItem={(c, q) => (
                <div className="ac-client-item">
                  <span className="ac-client-name">{highlight(c.name, q)}</span>
                  {c.email && <span className="ac-client-meta">{c.email}</span>}
                </div>
              )}
              renderSelectedCard={c => (
                <div className="ib-client-card">
                  <div className="ib-client-card-name">{c.name}</div>
                  {c.email && <div className="ib-client-card-detail">{c.email}</div>}
                </div>
              )}
              selected={selectedClient}
              onSelect={c => {
                setSelectedClient(c);
                // Clear schedule locations so ClientLocationField auto-selects the new client's primary
                setSchedules(prev => prev.map(s => ({ ...s, locationId: null, serviceAddress: '' })));
              }}
              onClear={() => {
                setSelectedClient(null);
                setSchedules(prev => prev.map(s => ({ ...s, locationId: null, serviceAddress: '' })));
              }}
            />
          </section>

          {/* Agreement name */}
          <section className="ab-section">
            <div className="ab-field">
              <label className="ab-label">Agreement Name *</label>
              <input
                className="ib-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Monthly AC Maintenance"
              />
            </div>
          </section>

          {/* Agreement start date (billing anchor) */}
          <section className="ab-section">
            <label className="ab-label">Agreement Start Date</label>
            <input
              className="ib-input ib-input--date"
              type="date"
              value={startedAt}
              onChange={e => setStartedAt(e.target.value)}
            />
          </section>

          {/* SERVICE SCHEDULES */}
          <section className="ab-section">
            <p className="ib-section-label">Service Schedules</p>

            {schedules.map((sched, idx) => (
              <div key={sched._id} className="ab-schedule-card">
                <div className="ab-schedule-header">
                  <span className="ab-schedule-num">Schedule {idx + 1}</span>
                  {schedules.length > 1 && (
                    <button
                      className="ib-del-btn"
                      onClick={() => removeSchedule(idx)}
                      aria-label={`Remove schedule ${idx + 1}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {/* Service type — catalog autocomplete */}
                <div className="ab-field">
                  <label className="ab-label">Service Type</label>
                  {sched._serviceTemplate ? (
                    <Autocomplete
                      inputId={`ab-svc-${sched._id}`}
                      label="Service type"
                      placeholder="Search service catalog…"
                      fetchResults={fetchServices}
                      getKey={s => s.id}
                      getDisplayValue={s => s.name}
                      renderItem={(s, q) => (
                        <div className="ac-client-item">
                          <span className="ac-client-name">{highlight(s.name, q)}</span>
                          {s.category && <span className="ac-client-meta">{s.category}</span>}
                        </div>
                      )}
                      renderSelectedCard={s => (
                        <div className="ib-client-card">
                          <div className="ib-client-card-name">{s.name}</div>
                          {s.category && <div className="ib-client-card-detail">{s.category}</div>}
                        </div>
                      )}
                      selected={sched._serviceTemplate}
                      onSelect={tmpl => {
                        setSchedules(prev => prev.map((s, i) => i === idx
                          ? { ...s, _serviceTemplate: tmpl, serviceType: tmpl.name, serviceId: tmpl.id,
                              durationMinutes: tmpl.duration_minutes ? String(tmpl.duration_minutes) : s.durationMinutes }
                          : s
                        ));
                      }}
                      onClear={() => {
                        setSchedules(prev => prev.map((s, i) => i === idx
                          ? { ...s, _serviceTemplate: null, serviceType: '', serviceId: null }
                          : s
                        ));
                      }}
                    />
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        className="ib-input"
                        style={{ flex: 1 }}
                        value={sched.serviceType}
                        onChange={e => updateSchedule(idx, 'serviceType', e.target.value)}
                        placeholder="e.g. Detail, Oil Change, Mowing"
                      />
                      <Autocomplete
                        inputId={`ab-svc-search-${sched._id}`}
                        label="Search catalog"
                        placeholder="Search catalog…"
                        fetchResults={fetchServices}
                        getKey={s => s.id}
                        getDisplayValue={s => s.name}
                        renderItem={(s, q) => (
                          <div className="ac-client-item">
                            <span className="ac-client-name">{highlight(s.name, q)}</span>
                            {s.category && <span className="ac-client-meta">{s.category}</span>}
                          </div>
                        )}
                        selected={null}
                        onSelect={tmpl => {
                          setSchedules(prev => prev.map((s, i) => i === idx
                            ? { ...s, _serviceTemplate: tmpl, serviceType: tmpl.name, serviceId: tmpl.id,
                                durationMinutes: tmpl.duration_minutes ? String(tmpl.duration_minutes) : s.durationMinutes }
                            : s
                          ));
                        }}
                        onClear={() => {}}
                        className="ab-svc-autocomplete"
                      />
                    </div>
                  )}
                </div>

                {/* Asset / Vehicle label */}
                <div className="ab-field">
                  <label className="ab-label">Asset / Vehicle Label <span className="ab-hint">(optional)</span></label>
                  <input
                    className="ib-input"
                    value={sched.assetLabel}
                    onChange={e => updateSchedule(idx, 'assetLabel', e.target.value)}
                    placeholder="e.g. Vehicle 1, Unit A"
                  />
                </div>

                {/* Service location — canonical location_id preferred over address string */}
                <div className="ab-field">
                  <label className="ab-label">Service Location <span className="ab-hint">(optional — used for visit grouping)</span></label>
                  <ClientLocationField
                    clientId={selectedClient?.id || null}
                    locationId={sched.locationId}
                    address={sched.serviceAddress}
                    onSelect={({ location_id, address, city, state, zip, lat, lng }) => {
                      setSchedules(prev => prev.map((s, i) => i === idx ? {
                        ...s,
                        locationId:     location_id || null,
                        serviceAddress: address || '',
                      } : s));
                    }}
                    onAddressChange={v => updateSchedule(idx, 'serviceAddress', v)}
                  />
                </div>

                {/* Cadence */}
                <div className="ab-row ab-row--gap" style={{ marginTop: 8 }}>
                  <div className="ab-field ab-field--grow">
                    <label className="ab-label">Service Cadence</label>
                    <select
                      className="ib-select"
                      value={sched.cadence}
                      onChange={e => updateSchedule(idx, 'cadence', e.target.value)}
                    >
                      {SERVICE_CADENCE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  {sched.cadence === 'custom' && (
                    <div className="ab-field">
                      <label className="ab-label">Interval (days)</label>
                      <input
                        className="ib-input"
                        type="number"
                        min="1"
                        value={sched.serviceIntervalDays}
                        onChange={e => updateSchedule(idx, 'serviceIntervalDays', e.target.value)}
                        placeholder="e.g. 10"
                      />
                    </div>
                  )}
                </div>

                {/* Preferred weekday for weekly cadences */}
                {(sched.cadence === 'weekly' || sched.cadence === 'every_2_weeks' ||
                  sched.cadence === 'every_3_weeks' || sched.cadence === 'every_4_weeks') && (
                  <div className="ab-field" style={{ marginTop: 8 }}>
                    <label className="ab-label">Preferred Weekday</label>
                    <select
                      className="ib-select"
                      value={sched.preferredWeekday}
                      onChange={e => updateSchedule(idx, 'preferredWeekday', e.target.value)}
                    >
                      {WEEKDAY_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Day of month for monthly */}
                {sched.cadence === 'monthly' && (
                  <div className="ab-field ab-field--sm" style={{ marginTop: 8 }}>
                    <label className="ab-label">Day of Month</label>
                    <input
                      className="ib-input"
                      type="number"
                      min="1"
                      max="31"
                      value={sched.serviceDayOfMonth}
                      onChange={e => updateSchedule(idx, 'serviceDayOfMonth', e.target.value)}
                      placeholder={`${new Date((sched.startedAt || TODAY) + 'T00:00:00').getDate()} (from start date)`}
                    />
                  </div>
                )}

                {/* Schedule start date */}
                <div className="ab-field" style={{ marginTop: 8 }}>
                  <label className="ab-label">Schedule Start Date</label>
                  <input
                    className="ib-input ib-input--date"
                    type="date"
                    value={sched.startedAt}
                    onChange={e => updateSchedule(idx, 'startedAt', e.target.value)}
                  />
                </div>

                {/* Duration per visit */}
                <div className="ab-row ab-row--gap" style={{ marginTop: 8 }}>
                  <div className="ab-field ab-field--sm">
                    <label className="ab-label">Duration per Visit (minutes)</label>
                    <input
                      className="ib-input"
                      type="number"
                      min="15"
                      max="1440"
                      step="15"
                      value={sched.durationMinutes}
                      onChange={e => updateSchedule(idx, 'durationMinutes', e.target.value)}
                      placeholder="e.g. 60"
                    />
                  </div>
                  <div className="ab-field ab-field--grow">
                    <label className="ab-label">Preferred Start Time</label>
                    <input
                      className="ib-input"
                      type="time"
                      value={sched.preferredStartTime}
                      onChange={e => updateSchedule(idx, 'preferredStartTime', e.target.value)}
                    />
                  </div>
                </div>

              </div>
            ))}

            <button className="ab-add-li" onClick={addSchedule}>
              <Plus size={13} /> Add Another Schedule
            </button>
          </section>

          {/* END CONDITION */}
          <section className="ab-section">
            <p className="ib-section-label">End Condition</p>
            <div className="ab-field">
              <label className="ab-label">When does this agreement end?</label>
              <select
                className="ib-select"
                value={endCondition}
                onChange={e => {
                  setEndCondition(e.target.value);
                  setEndDate('');
                  setEndAfterOccurrences('');
                  setEndAfterPeriods('');
                }}
              >
                {END_CONDITION_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {endCondition === 'date' && (
              <div className="ab-field" style={{ marginTop: 8 }}>
                <label className="ab-label">End Date</label>
                <input
                  className="ib-input ib-input--date"
                  type="date"
                  value={endDate}
                  min={startedAt}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
            )}
            {endCondition === 'occurrences' && (
              <div className="ab-field ab-field--sm" style={{ marginTop: 8 }}>
                <label className="ab-label">After how many services?</label>
                <input
                  className="ib-input"
                  type="number"
                  min="1"
                  value={endAfterOccurrences}
                  onChange={e => setEndAfterOccurrences(e.target.value)}
                  placeholder="e.g. 12"
                />
              </div>
            )}
            {endCondition === 'periods' && (
              <div className="ab-field ab-field--sm" style={{ marginTop: 8 }}>
                <label className="ab-label">After how many billing periods?</label>
                <input
                  className="ib-input"
                  type="number"
                  min="1"
                  value={endAfterPeriods}
                  onChange={e => setEndAfterPeriods(e.target.value)}
                  placeholder="e.g. 6"
                />
              </div>
            )}
          </section>

          {/* BILLING SCHEDULE */}
          <section className="ab-section">
            <p className="ib-section-label">Billing Schedule</p>
            <div className="ab-row ab-row--gap">
              <div className="ab-field ab-field--grow">
                <label className="ab-label">Billing Cadence</label>
                <select
                  className="ib-select"
                  value={billingCadence}
                  onChange={e => setBillingCadence(e.target.value)}
                >
                  {BILLING_CADENCE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="ab-field ab-field--grow">
                <label className="ab-label">Billing Trigger</label>
                <select
                  className="ib-select"
                  value={billingTrigger}
                  onChange={e => setBillingTrigger(e.target.value)}
                >
                  {BILLING_TRIGGER_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {billingTrigger === 'specific_day' && (
              <div className="ab-field ab-field--sm" style={{ marginTop: 8 }}>
                <label className="ab-label">Day of Month</label>
                <input
                  className="ib-input"
                  type="number"
                  min="1"
                  max="31"
                  value={billingDay}
                  onChange={e => setBillingDay(e.target.value)}
                  placeholder="1–31"
                />
                <p className="ab-hint">Months with fewer days use the last day of that month.</p>
              </div>
            )}
            {billingTrigger === 'days_before_first_service' && (
              <div className="ab-field ab-field--sm" style={{ marginTop: 8 }}>
                <label className="ab-label">Days Before First Service</label>
                <input
                  className="ib-input"
                  type="number"
                  min="1"
                  value={daysBeforeService}
                  onChange={e => setDaysBeforeService(e.target.value)}
                  placeholder="e.g. 7"
                />
              </div>
            )}
          </section>

          {/* SERVICE COVERAGE */}
          <section className="ab-section">
            <p className="ib-section-label">Service Coverage</p>
            <div className="ab-row ab-row--gap">
              <div className="ab-field">
                <label className="ab-label">Included Services per Billing Period</label>
                <input
                  className="ib-input"
                  type="number"
                  min="1"
                  value={includedServicesPerPeriod}
                  onChange={e => setIncludedServicesPerPeriod(e.target.value)}
                  placeholder="1"
                />
              </div>
              <div className="ab-field ab-field--grow">
                <label className="ab-label">If Services Exceed Included Limit</label>
                <select
                  className="ib-select"
                  value={extraOccurrencePolicy}
                  onChange={e => setExtraOccurrencePolicy(e.target.value)}
                >
                  {EXTRA_OCCURRENCE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {extraOccurrencePolicy === 'charge_per_additional' && (
              <div className="ab-field" style={{ marginTop: 8 }}>
                <label className="ab-label">Additional Visit Price</label>
                <div className="ib-price-wrap">
                  <span className="ib-price-sym">$</span>
                  <input
                    className="ib-input ib-input--price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={additionalServicePrice}
                    onChange={e => setAdditionalServicePrice(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
            )}
            <div className="ab-field" style={{ marginTop: 8 }}>
              <label className="ab-label">If a Service Is Missed</label>
              <select
                className="ib-select"
                value={missedServicePolicy}
                onChange={e => setMissedServicePolicy(e.target.value)}
              >
                {MISSED_POLICY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="ab-coverage-example">
              <strong>Example:</strong>{' '}
              {schedules.length} schedule{schedules.length !== 1 ? 's' : ''}{' '}·{' '}
              {BILLING_CADENCE_OPTIONS.find(o => o.value === billingCadence)?.label || billingCadence} billing
              {' '}→ invoice on{' '}
              {BILLING_TRIGGER_OPTIONS.find(o => o.value === billingTrigger)?.label?.toLowerCase() || billingTrigger}
              {' '}covering{' '}
              {includedServicesPerPeriod} service{parseInt(includedServicesPerPeriod, 10) !== 1 ? 's' : ''} at ${parseFloat(planPrice || 0).toFixed(2)}
            </div>
          </section>

          {/* BILLING AMOUNT */}
          <section className="ab-section">
            <p className="ib-section-label">Billing Amount</p>
            <div className="ab-row ab-row--gap">
              <div className="ab-field">
                <label className="ab-label">Amount per billing period *</label>
                <div className="ib-price-wrap">
                  <span className="ib-price-sym">$</span>
                  <input
                    className="ib-input ib-input--price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={planPrice}
                    onChange={e => setPlanPrice(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            {/* Discount */}
            <div className="ab-row ab-row--gap" style={{ marginTop: 8 }}>
              <div className="ab-field">
                <label className="ab-label">Discount</label>
                <select
                  className="ib-select"
                  value={discountType}
                  onChange={e => { setDiscountType(e.target.value); setDiscountValue(''); setDiscountName(''); }}
                >
                  {DISCOUNT_TYPE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {discountType !== 'none' && (
                <>
                  <div className="ab-field">
                    <label className="ab-label">{discountType === 'percent' ? 'Percent off' : 'Amount off ($)'}</label>
                    <div className="ib-price-wrap">
                      {discountType === 'fixed' && <span className="ib-price-sym">$</span>}
                      <input
                        className={`ib-input${discountType === 'fixed' ? ' ib-input--price' : ''}`}
                        type="number"
                        min="0"
                        step={discountType === 'percent' ? '1' : '0.01'}
                        max={discountType === 'percent' ? '100' : undefined}
                        value={discountValue}
                        onChange={e => setDiscountValue(e.target.value)}
                        placeholder={discountType === 'percent' ? '10' : '0.00'}
                      />
                      {discountType === 'percent' && <span style={{ marginLeft: 4, fontSize: '0.85rem', color: 'var(--slate)' }}>%</span>}
                    </div>
                  </div>
                  <div className="ab-field ab-field--grow">
                    <label className="ab-label">Discount Label (optional)</label>
                    <input
                      className="ib-input"
                      value={discountName}
                      onChange={e => setDiscountName(e.target.value)}
                      placeholder="e.g. Loyalty discount"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Taxable */}
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                id="ab-taxable"
                checked={taxable}
                onChange={e => setTaxable(e.target.checked)}
              />
              <label htmlFor="ab-taxable" className="ab-label" style={{ marginBottom: 0, cursor: 'pointer' }}>
                Apply sales tax to this agreement
              </label>
            </div>
          </section>

          {/* PAYMENT BEHAVIOR */}
          <section className="ab-section">
            <p className="ib-section-label">Payment Behavior</p>
            <div className="ab-field">
              <label className="ab-label">When an invoice is generated for this agreement</label>
              <select
                className="ib-select"
                value={paymentBehavior}
                onChange={e => setPaymentBehavior(e.target.value)}
              >
                {PAYMENT_BEHAVIOR_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </section>

          {/* LINE ITEMS */}
          <section className="ab-section">
            <p className="ib-section-label">Line Items</p>
            {lineItems.map((li, idx) => (
              <div key={li._id} className="ab-li-row">
                <input
                  className="ib-input ab-li-name"
                  value={li.name}
                  onChange={e => updateLineItem(idx, 'name', e.target.value)}
                  placeholder="Service description"
                />
                <div className="ib-price-wrap ab-li-price">
                  <span className="ib-price-sym">$</span>
                  <input
                    className="ib-input ib-input--price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={li.amount}
                    onChange={e => updateLineItem(idx, 'amount', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <button
                  className="ib-del-btn"
                  onClick={() => removeLineItem(idx)}
                  disabled={lineItems.length === 1}
                  aria-label="Remove line"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button className="ab-add-li" onClick={addLineItem}>
              <Plus size={13} /> Add line item
            </button>
          </section>

          {/* NOTES */}
          <section className="ab-section">
            <label className="ab-label">Internal Notes</label>
            <textarea
              className="ib-textarea"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notes visible to your team only…"
            />
          </section>

        </div>{/* end .ab-body */}

        {/* Footer */}
        <div className="ib-footer">
          {saveError && <p className="ib-save-error">{saveError}</p>}
          <div className="ib-footer-actions">
            <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={!canSave}
              title={
                !selectedClient           ? 'Select a client first'
                : !name.trim()            ? 'Enter an agreement name'
                : !schedulesValid         ? 'Fix schedule configuration'
                : !(parseFloat(planPrice) > 0) ? 'Enter a plan price'
                : ''
              }
            >
              {saving ? 'Saving…' : existing ? 'Save Changes' : 'Create Agreement'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
