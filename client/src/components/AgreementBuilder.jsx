import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import api from '../api';
import Autocomplete, { highlight } from './Autocomplete';

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
  { value: 'every_service',    label: 'Every service occurrence' },
  { value: 'first_scheduled',  label: 'First scheduled service of period' },
  { value: 'first_completed',  label: 'First completed service of period' },
  { value: 'first_day',        label: 'First day of billing period' },
  { value: 'specific_day',     label: 'Specific day of month…' },
];

const EXTRA_OCCURRENCE_OPTIONS = [
  { value: 'all_included',   label: 'All scheduled visits included' },
  { value: 'max_n',          label: 'Max N included — additional visits billed separately' },
  { value: 'rollover',       label: 'Roll extra visit into next period' },
  { value: 'manual_review',  label: 'Flag for manual review' },
];

function newLineItem() {
  return { _id: Math.random().toString(36).slice(2), name: '', amount: '' };
}

export default function AgreementBuilder({ existing = null, onClose, onSaved }) {
  // ── client
  const [selectedClient, setSelectedClient] = useState(
    existing ? { id: existing.client_id, name: existing.client_name, email: existing.client_email } : null
  );

  // ── agreement basics
  const [name,        setName]        = useState(existing?.name        || '');
  const [serviceType, setServiceType] = useState(existing?.service_type || '');
  const [startedAt,   setStartedAt]   = useState(existing?.started_at?.slice(0, 10) || TODAY);

  // ── service cadence
  const [cadence,             setCadence]             = useState(existing?.cadence || 'monthly');
  const [serviceIntervalDays, setServiceIntervalDays] = useState(existing?.service_interval_days || '');

  // ── billing
  const [billingCadence,             setBillingCadence]             = useState(existing?.billing_cadence || 'monthly');
  const [billingTrigger,             setBillingTrigger]             = useState(existing?.billing_trigger || 'first_day');
  const [billingDay,                 setBillingDay]                 = useState(existing?.billing_day || '');
  const [includedServicesPerPeriod,  setIncludedServicesPerPeriod]  = useState(existing?.included_services_per_period ?? 1);
  const [extraOccurrencePolicy,      setExtraOccurrencePolicy]      = useState(existing?.extra_occurrence_policy || 'all_included');

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

  // ── client autocomplete
  const fetchClients = useCallback(async (query, signal) => {
    const r = await api.get(`/clients/search?q=${encodeURIComponent(query)}`, { signal });
    return r.data || [];
  }, []);

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

  // ── validation
  const canSave = !saving && !!selectedClient && name.trim().length > 0
    && (cadence !== 'custom' || (parseInt(serviceIntervalDays, 10) > 0))
    && (billingTrigger !== 'specific_day' || (parseInt(billingDay, 10) >= 1 && parseInt(billingDay, 10) <= 28))
    && parseFloat(planPrice) > 0;

  // ── submit
  async function handleSave() {
    setSaveError('');
    setSaving(true);
    const payload = {
      client_id:                   selectedClient.id,
      name:                        name.trim(),
      service_type:                serviceType.trim() || null,
      cadence,
      billing_cadence:             billingCadence,
      billing_trigger:             billingTrigger,
      billing_day:                 billingTrigger === 'specific_day' ? parseInt(billingDay, 10) : null,
      included_services_per_period: parseInt(includedServicesPerPeriod, 10) || 1,
      extra_occurrence_policy:     extraOccurrencePolicy,
      service_interval_days:       cadence === 'custom' ? parseInt(serviceIntervalDays, 10) : null,
      plan_price:                  parseFloat(planPrice) || 0,
      line_items:                  lineItems.filter(li => li.name || parseFloat(li.amount) > 0).map(li => ({
        name:   li.name,
        amount: parseFloat(li.amount) || 0,
      })),
      notes:                       notes.trim() || null,
      started_at:                  startedAt,
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
              onSelect={setSelectedClient}
              onClear={() => setSelectedClient(null)}
            />
          </section>

          {/* Agreement name + service type */}
          <section className="ab-section ab-row">
            <div className="ab-field ab-field--grow">
              <label className="ab-label">Agreement Name *</label>
              <input
                className="ib-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Monthly AC Maintenance"
              />
            </div>
            <div className="ab-field">
              <label className="ab-label">Service Type</label>
              <input
                className="ib-input"
                value={serviceType}
                onChange={e => setServiceType(e.target.value)}
                placeholder="e.g. HVAC, Landscaping"
              />
            </div>
          </section>

          {/* Start date */}
          <section className="ab-section">
            <label className="ab-label">Agreement Start Date</label>
            <input
              className="ib-input ib-input--date"
              type="date"
              value={startedAt}
              onChange={e => setStartedAt(e.target.value)}
            />
          </section>

          {/* SERVICE SCHEDULE */}
          <section className="ab-section">
            <p className="ib-section-label">Service Schedule</p>
            <div className="ab-row ab-row--gap">
              <div className="ab-field ab-field--grow">
                <label className="ab-label">Service Cadence</label>
                <select
                  className="ib-select"
                  value={cadence}
                  onChange={e => setCadence(e.target.value)}
                >
                  {SERVICE_CADENCE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {cadence === 'custom' && (
                <div className="ab-field">
                  <label className="ab-label">Every N days</label>
                  <input
                    className="ib-input"
                    type="number"
                    min="1"
                    value={serviceIntervalDays}
                    onChange={e => setServiceIntervalDays(e.target.value)}
                    placeholder="e.g. 10"
                  />
                </div>
              )}
            </div>
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
              <div className="ab-field ab-field--sm">
                <label className="ab-label">Charge on day of month</label>
                <input
                  className="ib-input"
                  type="number"
                  min="1"
                  max="28"
                  value={billingDay}
                  onChange={e => setBillingDay(e.target.value)}
                  placeholder="1–28"
                />
                <p className="ab-hint">Months with fewer days will charge on the last day.</p>
              </div>
            )}
          </section>

          {/* SERVICE COVERAGE */}
          <section className="ab-section">
            <p className="ib-section-label">Service Coverage</p>
            <div className="ab-row ab-row--gap">
              <div className="ab-field">
                <label className="ab-label">Services included per billing period</label>
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
                <label className="ab-label">If visits exceed included count</label>
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
            <div className="ab-coverage-example">
              <strong>Example:</strong>{' '}
              {SERVICE_CADENCE_OPTIONS.find(o => o.value === cadence)?.label || cadence} service
              {' '}→{' '}
              {BILLING_CADENCE_OPTIONS.find(o => o.value === billingCadence)?.label || billingCadence} billing
              {' '}→{' '}
              invoice triggered on{' '}
              {BILLING_TRIGGER_OPTIONS.find(o => o.value === billingTrigger)?.label?.toLowerCase() || billingTrigger}
              {' '}covering{' '}
              {includedServicesPerPeriod} service{parseInt(includedServicesPerPeriod, 10) !== 1 ? 's' : ''} at ${parseFloat(planPrice || 0).toFixed(2)}
            </div>
          </section>

          {/* PLAN PRICE */}
          <section className="ab-section">
            <p className="ib-section-label">Plan Price</p>
            <div className="ab-row ab-row--gap">
              <div className="ab-field">
                <label className="ab-label">Plan price per billing period *</label>
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
                !selectedClient      ? 'Select a client first'
                : !name.trim()       ? 'Enter an agreement name'
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
