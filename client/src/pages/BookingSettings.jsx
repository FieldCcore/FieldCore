import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const labelSt = 'block text-xs font-semibold text-slate uppercase tracking-wide mb-1 mt-4 first:mt-0';
const inputSt = 'w-full border border-lightgray rounded-md px-3 py-2 text-sm text-navy placeholder:text-steel focus:ring-2 focus:ring-sand focus:outline-none bg-white';
const cardSt = 'bg-white border border-lightgray rounded-lg p-6 mb-6';
const sectionTitleSt = 'text-sm font-bold text-navy mb-4 pb-2 border-b border-lightgray';
const btnSt = 'bg-sand text-navy font-bold px-6 py-2.5 rounded-md hover:brightness-95 transition text-sm';
const btnNavySt = 'bg-navy text-white font-bold px-4 py-2 rounded-md hover:opacity-90 transition text-sm';

export default function BookingSettings() {
  const { user } = useAuth();
  const accountId = user?.accountId;
  const widgetUrl  = accountId ? `${window.location.origin}/book/${accountId}` : '';
  const embedCode  = widgetUrl ? `<iframe src="${widgetUrl}" width="100%" height="700" frameborder="0" style="border:none;border-radius:12px;"></iframe>` : '';

  const [settings, setSettings] = useState(null);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [newService, setNewService] = useState('');
  const [copied, setCopied]     = useState(false);
  const [loading, setLoading]   = useState(true);
  const [newRule, setNewRule]   = useState({ service: '', type: 'flat', amount: '' });

  useEffect(() => {
    api.get('/booking-settings').then(r => {
      const d = r.data;
      setSettings({
        ...d,
        services:      Array.isArray(d.services)      ? d.services      : [],
        deposit_rules: Array.isArray(d.deposit_rules) ? d.deposit_rules : [],
        tax_rate:      d.tax_rate   != null ? (parseFloat(d.tax_rate)   * 100).toFixed(2) : '0',
        travel_fee:    d.travel_fee != null ? parseFloat(d.travel_fee).toFixed(2) : '0',
      });
    }).finally(() => setLoading(false));
  }, []);

  function set(field) {
    return e => setSettings(s => ({ ...s, [field]: e.target.value }));
  }

  function addService() {
    const svc = newService.trim();
    if (!svc || settings.services.includes(svc)) return;
    setSettings(s => ({ ...s, services: [...s.services, svc] }));
    setNewService('');
  }

  function removeService(svc) {
    setSettings(s => ({ ...s, services: s.services.filter(x => x !== svc) }));
  }

  function addRule() {
    const svc = newRule.service.trim();
    const amt = parseFloat(newRule.amount);
    if (!svc || isNaN(amt) || amt <= 0) return;
    setSettings(s => ({ ...s, deposit_rules: [...(s.deposit_rules || []), { service: svc, type: newRule.type, amount: amt }] }));
    setNewRule({ service: '', type: 'flat', amount: '' });
  }

  function removeRule(idx) {
    setSettings(s => ({ ...s, deposit_rules: s.deposit_rules.filter((_, i) => i !== idx) }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const payload = {
        ...settings,
        tax_rate: parseFloat(settings.tax_rate || 0) / 100,
      };
      const res = await api.put('/booking-settings', payload);
      const d = res.data;
      setSettings({
        ...d,
        services:      Array.isArray(d.services)      ? d.services      : [],
        deposit_rules: Array.isArray(d.deposit_rules) ? d.deposit_rules : [],
        tax_rate:      d.tax_rate   != null ? (parseFloat(d.tax_rate)   * 100).toFixed(2) : '0',
        travel_fee:    d.travel_fee != null ? parseFloat(d.travel_fee).toFixed(2) : '0',
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  function copyEmbed() {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  if (loading) return <p className="text-steel text-sm p-6">Loading...</p>;

  const rules = settings.deposit_rules || [];

  return (
    <div className="min-h-screen bg-offwhite">
      <div className="max-w-3xl mx-auto px-6 py-8">

        <h1 className="text-2xl font-bold text-navy mb-1">Settings &amp; Rules</h1>
        <p className="text-sm text-slate mb-6">Manage your booking widget, deposit rules, and service settings.</p>

        {/* Section 1: Booking Widget */}
        <div className={cardSt}>
          <div className={sectionTitleSt}>Booking Widget</div>

          <div className="mb-4">
            <label className={labelSt}>Embed on your website</label>
            <textarea
              readOnly
              value={embedCode || 'Loading…'}
              className="w-full border border-lightgray rounded-md px-3 py-2 text-xs text-slate bg-offwhite resize-none h-20 focus:outline-none font-mono"
            />
            <div className="flex gap-2 mt-2.5 flex-wrap">
              <button onClick={copyEmbed} className={btnNavySt}>
                {copied ? '✓ Copied!' : 'Copy Embed Code'}
              </button>
              {widgetUrl && (
                <a
                  href={widgetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center border border-sand text-sand font-bold px-4 py-2 rounded-md text-sm no-underline hover:bg-sand/10 transition"
                >
                  Preview Booking Page ↗
                </a>
              )}
            </div>
          </div>

          {widgetUrl && (
            <div>
              <label className={labelSt}>Direct booking link</label>
              <a
                href={widgetUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sand text-sm no-underline font-mono hover:underline"
              >
                {widgetUrl}
              </a>
            </div>
          )}
        </div>

        {/* Sections 2–4 inside form */}
        <form onSubmit={handleSave}>

          {/* Section 2: Widget Settings */}
          <div className={cardSt}>
            <div className={sectionTitleSt}>Widget Settings</div>

            <div className="mb-4">
              <label className={labelSt}>Business Name</label>
              <input className={inputSt} value={settings.business_name || ''} onChange={set('business_name')} placeholder="Your Business Name" />
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className={labelSt}>Default Deposit ($)</label>
                <input type="number" step="0.01" min="0" className={inputSt} value={settings.deposit_amount || 0} onChange={set('deposit_amount')} placeholder="0.00" />
              </div>
              <div>
                <label className={labelSt}>Tax Rate (%)</label>
                <input type="number" step="0.1" min="0" max="100" className={inputSt} value={settings.tax_rate ?? '0'} onChange={set('tax_rate')} placeholder="0.00" />
              </div>
              <div>
                <label className={labelSt}>Travel Fee ($)</label>
                <input type="number" step="0.01" min="0" className={inputSt} value={settings.travel_fee ?? '0'} onChange={set('travel_fee')} placeholder="0.00" />
              </div>
            </div>

            <div>
              <label className={labelSt}>Agreement / Terms Text</label>
              <textarea
                rows={4}
                className={inputSt + ' resize-none h-24'}
                value={settings.agreement_text || ''}
                onChange={set('agreement_text')}
              />
              <p className="text-xs text-steel mt-1">
                Shown to clients at booking. They must agree before confirming.
              </p>
            </div>
          </div>

          {/* Section 3: Per-Service Deposit Rules */}
          <div className={cardSt}>
            <div className={sectionTitleSt}>Per-Service Deposit Rules</div>

            <p className="text-xs text-slate mb-4">
              Override the default deposit for specific services. Takes priority over the global default.
            </p>

            <div className="bg-offwhite border border-lightgray rounded-md px-4 py-3 text-xs text-slate mb-4 leading-relaxed">
              <strong className="text-navy">Automatic overrides:</strong> VIP-tier clients always have their deposit waived.
              At-risk-tier clients always pay the global default minimum, regardless of service rules.
              These are enforced by the system and cannot be disabled.
            </div>

            {rules.length > 0 && (
              <div className="mb-4">
                {rules.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 py-3"
                    style={{ borderBottom: i < rules.length - 1 ? '1px solid #E6E6E6' : 'none' }}
                  >
                    <span className="flex-1 font-medium text-navy text-sm">{r.service}</span>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded" style={{ background: 'rgba(214,181,138,.12)', color: '#D6B58A' }}>
                      {r.type === 'percent' ? `${r.amount}%` : `$${r.amount}`}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded border border-lightgray bg-offwhite text-slate">
                      {r.type === 'percent' ? 'Percent' : 'Flat'}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeRule(i)}
                      className="bg-transparent border-0 cursor-pointer text-red-400 text-xs font-semibold ml-1 p-0 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid gap-3 items-end" style={{ gridTemplateColumns: '1fr 1fr 1fr auto' }}>
              <div>
                <label className={labelSt}>Service name</label>
                <input
                  className={inputSt}
                  value={newRule.service}
                  onChange={e => setNewRule(r => ({ ...r, service: e.target.value }))}
                  placeholder="Service name..."
                />
              </div>
              <div>
                <label className={labelSt}>Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={inputSt}
                  value={newRule.amount}
                  onChange={e => setNewRule(r => ({ ...r, amount: e.target.value }))}
                  placeholder={newRule.type === 'percent' ? 'e.g. 25' : 'e.g. 150'}
                />
              </div>
              <div>
                <label className={labelSt}>Type</label>
                <select className={inputSt} value={newRule.type} onChange={e => setNewRule(r => ({ ...r, type: e.target.value }))}>
                  <option value="flat">Flat $</option>
                  <option value="percent">Percent %</option>
                </select>
              </div>
              <button
                type="button"
                onClick={addRule}
                className={btnNavySt + ' whitespace-nowrap'}
              >
                Add Rule
              </button>
            </div>
          </div>

          {/* Section 4: Services Offered */}
          <div className={cardSt}>
            <div className={sectionTitleSt}>Services Offered</div>

            <p className="text-xs text-slate mb-4">
              Services available for clients to select when booking.
            </p>

            <div className="flex flex-wrap gap-2 mb-4">
              {settings.services.map(svc => (
                <span
                  key={svc}
                  className="inline-flex items-center gap-1.5 bg-offwhite border border-lightgray rounded-full px-3.5 py-1 text-sm text-navy font-medium"
                >
                  {svc}
                  <button
                    type="button"
                    onClick={() => removeService(svc)}
                    className="bg-transparent border-0 cursor-pointer text-steel text-sm leading-none p-0 hover:text-navy"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                className={inputSt + ' flex-1'}
                value={newService}
                onChange={e => setNewService(e.target.value)}
                placeholder="Add a service..."
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addService())}
              />
              <button
                type="button"
                onClick={addService}
                className={btnSt + ' whitespace-nowrap'}
              >
                Add
              </button>
            </div>
          </div>

          {/* Save */}
          <div className="flex justify-end items-center gap-4">
            {saved && (
              <span className="text-sm font-semibold" style={{ color: '#1E6B3C' }}>✓ Saved</span>
            )}
            <button
              type="submit"
              disabled={saving}
              className={btnSt + (saving ? ' opacity-70 cursor-wait' : '')}
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
