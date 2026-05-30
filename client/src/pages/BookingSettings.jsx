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

  if (loading) return <p className="muted">Loading...</p>;

  return (
    <div>
      <div className="page-header">
        <h1>Online Booking</h1>
        {widgetUrl && <a href={widgetUrl} target="_blank" rel="noreferrer" className="btn-secondary">
          Preview Booking Page ↗
        </a>}
      </div>

      {/* Embed code */}
      <div className="card" style={{ marginBottom: 28 }}>
        <h3 style={{ marginBottom: 12 }}>Embed on Your Website</h3>
        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 14 }}>
          Paste this code anywhere on your website to embed the booking form.
        </p>
        <div className="embed-box">
          <code className="embed-code">{embedCode || 'Loading…'}</code>
          <button className="btn-primary" onClick={copyEmbed} style={{ marginTop: 10, alignSelf: 'flex-start' }}>
            {copied ? '✓ Copied!' : 'Copy Embed Code'}
          </button>
        </div>
        <p style={{ color: '#64748b', fontSize: 12, marginTop: 10 }}>
          Direct link: {widgetUrl && <a href={widgetUrl} target="_blank" rel="noreferrer" style={{ color: '#38bdf8' }}>{widgetUrl}</a>}
        </p>
      </div>

      {/* Settings form */}
      <form onSubmit={handleSave}>
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>Widget Settings</h3>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Business Name</label>
            <input value={settings.business_name || ''} onChange={set('business_name')} placeholder="Your Business Name" />
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Default Deposit Amount ($0 = no deposit)</label>
            <input type="number" step="0.01" min="0" value={settings.deposit_amount || 0} onChange={set('deposit_amount')} placeholder="0.00" />
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Tax Rate (%)</label>
            <input type="number" step="0.01" min="0" max="100" value={settings.tax_rate ?? '0'} onChange={set('tax_rate')} placeholder="0.00" />
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Applied automatically when generating invoices (e.g. 8.5 for 8.5%).</p>
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Travel Fee ($0 = none)</label>
            <input type="number" step="0.01" min="0" value={settings.travel_fee ?? '0'} onChange={set('travel_fee')} placeholder="0.00" />
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Auto-added as a line item on invoices for each job. Can be overridden per job.</p>
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Agreement / Terms Text</label>
            <textarea rows={3} value={settings.agreement_text || ''} onChange={set('agreement_text')} />
          </div>

          {/* Per-service deposit rules */}
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Per-Service Deposit Rules</label>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 2, marginBottom: 10 }}>
              Override the default deposit for specific services. Takes precedence over the default amount above.
            </p>
            {(settings.deposit_rules || []).length > 0 && (
              <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(settings.deposit_rules || []).map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
                    <span style={{ flex: 1 }}><strong>{r.service}</strong></span>
                    <span style={{ color: '#64748b' }}>{r.type === 'percent' ? `${r.amount}%` : `$${r.amount}`}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{r.type}</span>
                    <button type="button" onClick={() => removeRule(i)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>×</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                value={newRule.service}
                onChange={e => setNewRule(r => ({ ...r, service: e.target.value }))}
                placeholder="Service name..."
                style={{ flex: '2 1 140px', minWidth: 120, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}
              />
              <select
                value={newRule.type}
                onChange={e => setNewRule(r => ({ ...r, type: e.target.value }))}
                style={{ flex: '0 0 90px', padding: '8px 8px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}
              >
                <option value="flat">Flat $</option>
                <option value="percent">Percent %</option>
              </select>
              <input
                type="number" step="0.01" min="0"
                value={newRule.amount}
                onChange={e => setNewRule(r => ({ ...r, amount: e.target.value }))}
                placeholder={newRule.type === 'percent' ? 'e.g. 25' : 'e.g. 150'}
                style={{ flex: '1 1 90px', minWidth: 80, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}
              />
              <button type="button" className="btn-secondary" onClick={addRule}>Add Rule</button>
            </div>
          </div>

          {/* Services list */}
          <div className="form-group">
            <label>Services Offered</label>
            <div className="services-list">
              {settings.services.map(svc => (
                <div key={svc} className="service-tag">
                  <span>{svc}</span>
                  <button type="button" onClick={() => removeService(svc)} className="service-remove">×</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input
                value={newService}
                onChange={e => setNewService(e.target.value)}
                placeholder="Add a service..."
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addService())}
                style={{ flex: 1, padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }}
              />
              <button type="button" className="btn-secondary" onClick={addService}>Add</button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {saved && <span style={{ color: '#10b981', fontWeight: 600 }}>✓ Saved</span>}
        </div>
      </form>
    </div>
  );
}
