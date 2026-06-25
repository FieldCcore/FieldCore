import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

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
      const payload = { ...settings, tax_rate: parseFloat(settings.tax_rate || 0) / 100 };
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

  if (loading) {
    return (
      <div style={{ background: 'var(--white)', borderRadius: 10, padding: '48px 24px', textAlign: 'center', border: '1px solid var(--lightgray)', color: 'var(--steel)', fontSize: 14 }}>
        Loading settings…
      </div>
    );
  }

  const rules = settings.deposit_rules || [];

  return (
    <form onSubmit={handleSave}>
      <div className="page-header">
        <p style={{ margin: 0, fontSize: 13, color: 'var(--steel)' }}>
          Booking widget, deposit rules, and services offered
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {saved && (
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>✓ Saved</span>
          )}
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Booking Widget */}
          <div style={{ background: 'var(--white)', border: '1px solid var(--lightgray)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--lightgray)', background: 'var(--navy)' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em', color: 'rgba(255,255,255,.55)' }}>Booking Widget</div>
            </div>
            <div style={{ padding: '16px' }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--steel)', marginBottom: 6 }}>Embed code</div>
                <textarea
                  readOnly
                  value={embedCode || 'Loading…'}
                  style={{ width: '100%', border: '1.5px solid var(--lightgray)', borderRadius: 6, padding: '10px 12px', fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--slate)', background: 'var(--off)', resize: 'none', height: 76, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={copyEmbed}>
                  {copied ? '✓ Copied!' : 'Copy Embed Code'}
                </button>
                {widgetUrl && (
                  <a href={widgetUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', fontSize: 12, padding: '6px 12px', borderRadius: 6, border: '1.5px solid var(--sand)', color: 'var(--sand-dark)', fontWeight: 600, textDecoration: 'none', background: 'var(--sand-lt)' }}>
                    Preview Booking Page ↗
                  </a>
                )}
              </div>
              {widgetUrl && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--steel)', marginBottom: 4 }}>Direct link</div>
                  <a href={widgetUrl} target="_blank" rel="noreferrer" style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--sand-dark)', textDecoration: 'none', wordBreak: 'break-all' }}>
                    {widgetUrl}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Widget Settings */}
          <div style={{ background: 'var(--white)', border: '1px solid var(--lightgray)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--lightgray)', background: 'var(--navy)' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em', color: 'rgba(255,255,255,.55)' }}>Widget Settings</div>
            </div>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label>Business Name</label>
                <input value={settings.business_name || ''} onChange={set('business_name')} placeholder="Your Business Name" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Default Deposit ($)</label>
                  <input type="number" step="0.01" min="0" value={settings.deposit_amount || 0} onChange={set('deposit_amount')} placeholder="0.00" />
                </div>
                <div className="form-group">
                  <label>Tax Rate (%)</label>
                  <input type="number" step="0.1" min="0" max="100" value={settings.tax_rate ?? '0'} onChange={set('tax_rate')} placeholder="0.00" />
                </div>
              </div>
              <div className="form-group">
                <label>Travel Fee ($)</label>
                <input type="number" step="0.01" min="0" value={settings.travel_fee ?? '0'} onChange={set('travel_fee')} placeholder="0.00" />
              </div>
              <div className="form-group">
                <label>Agreement / Terms Text</label>
                <textarea rows={4} value={settings.agreement_text || ''} onChange={set('agreement_text')} placeholder="Clients must agree to this before confirming a booking." />
              </div>
            </div>
          </div>

        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Per-Service Deposit Rules */}
          <div style={{ background: 'var(--white)', border: '1px solid var(--lightgray)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--lightgray)', background: 'var(--navy)' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em', color: 'rgba(255,255,255,.55)' }}>Per-Service Deposit Rules</div>
            </div>
            <div style={{ padding: '16px' }}>
              <div style={{ background: 'var(--off)', border: '1px solid var(--lightgray)', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: 'var(--slate)', lineHeight: 1.6, marginBottom: 16 }}>
                <strong style={{ color: 'var(--navy)' }}>Automatic overrides:</strong> VIP-tier clients have their deposit waived. At-risk-tier clients always pay the global minimum.
              </div>

              {rules.length > 0 && (
                <div style={{ marginBottom: 16, border: '1px solid var(--lightgray)', borderRadius: 8, overflow: 'hidden' }}>
                  {rules.map((r, i) => (
                    <div
                      key={i}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: i < rules.length - 1 ? '1px solid var(--lightgray)' : 'none', background: 'var(--white)' }}
                    >
                      <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: 'var(--navy)' }}>{r.service}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', padding: '2px 8px', borderRadius: 99, background: 'var(--sand-lt)', color: 'var(--sand-dark)' }}>
                        {r.type === 'percent' ? `${r.amount}%` : `$${r.amount}`}
                      </span>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, border: '1px solid var(--lightgray)', background: 'var(--off)', color: 'var(--slate)' }}>
                        {r.type === 'percent' ? 'Percent' : 'Flat'}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeRule(i)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--steel)', fontSize: 15, lineHeight: 1, padding: '0 2px' }}
                        title="Remove rule"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px auto auto', gap: 8, alignItems: 'end' }}>
                <div className="form-group">
                  <label>Service</label>
                  <input
                    value={newRule.service}
                    onChange={e => setNewRule(r => ({ ...r, service: e.target.value }))}
                    placeholder="Service name…"
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addRule())}
                  />
                </div>
                <div className="form-group">
                  <label>Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newRule.amount}
                    onChange={e => setNewRule(r => ({ ...r, amount: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div className="form-group">
                  <label>Type</label>
                  <select value={newRule.type} onChange={e => setNewRule(r => ({ ...r, type: e.target.value }))}>
                    <option value="flat">Flat $</option>
                    <option value="percent">Percent %</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={addRule}
                  className="btn-secondary"
                  style={{ fontSize: 12, padding: '9px 14px', alignSelf: 'flex-end', whiteSpace: 'nowrap' }}
                >
                  + Add
                </button>
              </div>
            </div>
          </div>

          {/* Services Offered */}
          <div style={{ background: 'var(--white)', border: '1px solid var(--lightgray)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--lightgray)', background: 'var(--navy)' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em', color: 'rgba(255,255,255,.55)' }}>Services Offered</div>
            </div>
            <div style={{ padding: '16px' }}>
              <p style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 14 }}>
                Services clients can select when booking online.
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, minHeight: 32 }}>
                {settings.services.length === 0 && (
                  <span style={{ fontSize: 12, color: 'var(--steel)' }}>No services added yet.</span>
                )}
                {settings.services.map(svc => (
                  <span
                    key={svc}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--sand-lt)', border: '1px solid rgba(214,181,138,.4)', borderRadius: 99, padding: '4px 12px', fontSize: 13, color: 'var(--navy)', fontWeight: 500 }}
                  >
                    {svc}
                    <button
                      type="button"
                      onClick={() => removeService(svc)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--steel)', fontSize: 15, lineHeight: 1, padding: 0 }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  style={{ flex: 1, padding: '10px 12px', border: '1.5px solid var(--lightgray)', borderRadius: 6, fontFamily: 'Inter, sans-serif', fontSize: 14, outline: 'none', color: 'var(--navy)' }}
                  value={newService}
                  onChange={e => setNewService(e.target.value)}
                  placeholder="Add a service…"
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addService())}
                />
                <button type="button" onClick={addService} className="btn-primary" style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                  Add
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </form>
  );
}
