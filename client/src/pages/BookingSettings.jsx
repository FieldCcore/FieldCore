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

  if (loading) return <p style={{ color: '#8A90A2', fontSize: 14, padding: 24 }}>Loading...</p>;

  const labelSt = {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: '#5F667A',
    textTransform: 'uppercase',
    letterSpacing: '.06em',
    marginBottom: 5,
  };

  const inputSt = {
    width: '100%',
    border: '1px solid #E6E6E6',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 14,
    color: '#1C2333',
    outline: 'none',
    background: 'white',
    fontFamily: 'Inter, sans-serif',
    boxSizing: 'border-box',
  };

  const cardSt = {
    background: 'white',
    border: '1px solid #E6E6E6',
    borderRadius: 10,
    padding: 24,
    marginBottom: 20,
  };

  const sectionTitleSt = {
    fontSize: 11,
    fontWeight: 700,
    color: '#1C2333',
    textTransform: 'uppercase',
    letterSpacing: '.08em',
    marginBottom: 16,
    paddingBottom: 10,
    borderBottom: '1px solid #E6E6E6',
  };

  const rules = settings.deposit_rules || [];

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1C2333', margin: '0 0 4px' }}>Settings & Rules</h1>
        <p style={{ fontSize: 14, color: '#5F667A', margin: 0 }}>Manage your booking widget, deposit rules, and service settings</p>
      </div>

      {/* ── Section 1: Booking Widget ──────────────────────────────────────────── */}
      <div style={cardSt}>
        <div style={sectionTitleSt}>Booking Widget</div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelSt}>Embed on your website</label>
          <textarea
            readOnly
            value={embedCode || 'Loading…'}
            style={{
              ...inputSt,
              background: '#EDEBE7',
              fontFamily: 'DM Mono, monospace',
              fontSize: 12,
              color: '#5F667A',
              resize: 'none',
              height: 80,
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              onClick={copyEmbed}
              style={{ background: '#1C2333', color: 'white', fontSize: 12, fontWeight: 700, padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer' }}
            >
              {copied ? '✓ Copied!' : 'Copy Embed Code'}
            </button>
            {widgetUrl && (
              <a
                href={widgetUrl}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #D6B58A', color: '#D6B58A', fontSize: 12, fontWeight: 700, padding: '8px 16px', borderRadius: 6, textDecoration: 'none' }}
              >
                Preview Booking Page ↗
              </a>
            )}
          </div>
        </div>

        {widgetUrl && (
          <div>
            <label style={labelSt}>Direct booking link</label>
            <a
              href={widgetUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#D6B58A', fontSize: 13, textDecoration: 'none', fontFamily: 'DM Mono, monospace' }}
            >
              {widgetUrl}
            </a>
          </div>
        )}
      </div>

      {/* ── Sections 2–4 inside form ───────────────────────────────────────────── */}
      <form onSubmit={handleSave}>

        {/* Section 2: Widget Settings */}
        <div style={cardSt}>
          <div style={sectionTitleSt}>Widget Settings</div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelSt}>Business Name</label>
            <input style={inputSt} value={settings.business_name || ''} onChange={set('business_name')} placeholder="Your Business Name" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelSt}>Default Deposit ($)</label>
              <input type="number" step="0.01" min="0" style={inputSt} value={settings.deposit_amount || 0} onChange={set('deposit_amount')} placeholder="0.00" />
            </div>
            <div>
              <label style={labelSt}>Tax Rate (%)</label>
              <input type="number" step="0.1" min="0" max="100" style={inputSt} value={settings.tax_rate ?? '0'} onChange={set('tax_rate')} placeholder="0.00" />
            </div>
            <div>
              <label style={labelSt}>Travel Fee ($)</label>
              <input type="number" step="0.01" min="0" style={inputSt} value={settings.travel_fee ?? '0'} onChange={set('travel_fee')} placeholder="0.00" />
            </div>
          </div>

          <div>
            <label style={labelSt}>Agreement / Terms Text</label>
            <textarea
              rows={4}
              style={{ ...inputSt, resize: 'none', height: 96 }}
              value={settings.agreement_text || ''}
              onChange={set('agreement_text')}
            />
            <p style={{ fontSize: 12, color: '#8A90A2', marginTop: 5, marginBottom: 0 }}>
              Shown to clients at booking. They must agree before confirming.
            </p>
          </div>
        </div>

        {/* Section 3: Per-Service Deposit Rules */}
        <div style={cardSt}>
          <div style={sectionTitleSt}>Per-Service Deposit Rules</div>

          <p style={{ fontSize: 12, color: '#5F667A', marginBottom: 16, marginTop: 0 }}>
            Override the default deposit for specific services. Takes priority over the global default.
          </p>

          <div style={{ background: '#EDEBE7', border: '1px solid #E6E6E6', borderRadius: 6, padding: '12px 16px', fontSize: 12, color: '#5F667A', marginBottom: 16, lineHeight: 1.6 }}>
            <strong style={{ color: '#1C2333' }}>Automatic overrides:</strong> VIP-tier clients always have their deposit waived.
            At-risk-tier clients always pay the global default minimum, regardless of service rules.
            These are enforced by the system and cannot be disabled.
          </div>

          {rules.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {rules.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    paddingTop: 12,
                    paddingBottom: 12,
                    borderBottom: i < rules.length - 1 ? '1px solid #E6E6E6' : 'none',
                  }}
                >
                  <span style={{ flex: 1, fontWeight: 500, color: '#1C2333', fontSize: 14 }}>{r.service}</span>
                  <span style={{ background: 'rgba(214,181,138,.12)', color: '#D6B58A', fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 4 }}>
                    {r.type === 'percent' ? `${r.amount}%` : `$${r.amount}`}
                  </span>
                  <span style={{ background: '#EDEBE7', color: '#5F667A', fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid #E6E6E6' }}>
                    {r.type === 'percent' ? 'Percent' : 'Flat'}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRule(i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: 12, fontWeight: 600, marginLeft: 4, padding: 0 }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, alignItems: 'end', marginTop: rules.length > 0 ? 8 : 0 }}>
            <div>
              <label style={labelSt}>Service name</label>
              <input
                style={inputSt}
                value={newRule.service}
                onChange={e => setNewRule(r => ({ ...r, service: e.target.value }))}
                placeholder="Service name..."
              />
            </div>
            <div>
              <label style={labelSt}>Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                style={inputSt}
                value={newRule.amount}
                onChange={e => setNewRule(r => ({ ...r, amount: e.target.value }))}
                placeholder={newRule.type === 'percent' ? 'e.g. 25' : 'e.g. 150'}
              />
            </div>
            <div>
              <label style={labelSt}>Type</label>
              <select style={inputSt} value={newRule.type} onChange={e => setNewRule(r => ({ ...r, type: e.target.value }))}>
                <option value="flat">Flat $</option>
                <option value="percent">Percent %</option>
              </select>
            </div>
            <button
              type="button"
              onClick={addRule}
              style={{ background: '#1C2333', color: 'white', fontSize: 12, fontWeight: 700, padding: '9px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Add Rule
            </button>
          </div>
        </div>

        {/* Section 4: Services Offered */}
        <div style={cardSt}>
          <div style={sectionTitleSt}>Services Offered</div>

          <p style={{ fontSize: 12, color: '#5F667A', marginBottom: 16, marginTop: 0 }}>
            Services available for clients to select when booking.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: settings.services.length ? 16 : 0 }}>
            {settings.services.map(svc => (
              <span
                key={svc}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#EDEBE7',
                  border: '1px solid #E6E6E6',
                  borderRadius: 9999,
                  padding: '4px 14px',
                  fontSize: 13,
                  color: '#1C2333',
                  fontWeight: 500,
                }}
              >
                {svc}
                <button
                  type="button"
                  onClick={() => removeService(svc)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8A90A2', fontSize: 14, lineHeight: 1, padding: 0 }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ ...inputSt, flex: 1 }}
              value={newService}
              onChange={e => setNewService(e.target.value)}
              placeholder="Add a service..."
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addService())}
            />
            <button
              type="button"
              onClick={addService}
              style={{ background: '#D6B58A', color: '#1C2333', fontSize: 14, fontWeight: 700, padding: '8px 20px', borderRadius: 6, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Add
            </button>
          </div>
        </div>

        {/* Save */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14 }}>
          {saved && (
            <span style={{ fontSize: 13, color: '#1E6B3C', fontWeight: 600 }}>✓ Saved</span>
          )}
          <button
            type="submit"
            disabled={saving}
            style={{ background: '#D6B58A', color: '#1C2333', fontWeight: 700, padding: '10px 28px', borderRadius: 6, border: 'none', cursor: saving ? 'wait' : 'pointer', fontSize: 14, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
